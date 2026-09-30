/**
 * decay-engine.ts
 * SAGE_v7.5 — memory consolidation (nightly).
 *
 * Ported from Grok's DecayEngine. Rewritten 2026-09-30 (recall overhaul step 6)
 * to be additive-only:
 *
 *   < consolidation_threshold days  → keep as-is
 *   >= consolidation_threshold days → write ONE summary node for the thread
 *                                     into the archive (node_id
 *                                     `consolidated_<thread_id>`, idempotent)
 *
 * What it no longer does, and why:
 *   - Hard-delete threads past max_age_days. Decay should lower retrieval
 *     priority, not evict (SF-AMS / FSFM). The boot backfill also re-embeds any
 *     node missing a vector, so a nightly delete just churned: delete at 02:00,
 *     rebuild on the next boot.
 *   - Index summaries at a fake phi_index (hash % 100000). That id could equal
 *     a real node's phi_index, and indexNode() replaces a phi's vectors, so a
 *     summary could silently overwrite a real memory's vector. Summaries are
 *     now real archive nodes with their own phi_index.
 *   - Tag summaries with thread `<id>-consolidated`. That made the summary its
 *     own thread, due to be summarized again a week later.
 *
 * Today no resonance row has a thread_id, so this is a no-op until something
 * starts threading memories.
 */

import { outerDb } from './db';
import { recallThread, isVecEnabled } from './resonance-index';
import { archiveNodeSync } from './archive';

const SECONDS_PER_DAY = 86_400;
const SUMMARY_MAX_CHARS = 2_000;

export interface ConsolidationReport {
  threads_processed: number;
  summarized: number;
  /** Always 0 since 2026-09-30: nothing is hard-deleted by age. */
  decayed: number;
}

function ageInDays(timestamp: number): number {
  return (Date.now() - timestamp) / (SECONDS_PER_DAY * 1000);
}

function createSummary(entries: Array<{ phi_index: number; text: string; timestamp: number }>): string {
  const texts = entries.map((e) => e.text);
  const combined = texts.join(' | ');
  if (combined.length < 200) return 'Summary: ' + combined;

  const sentences = combined.replace(/\. /g, '.\n').split('\n').filter(Boolean);
  const key = sentences.length > 5
    ? [...sentences.slice(0, 3), ...sentences.slice(-2)]
    : sentences;
  return ('Memory Summary: ' + key.join('. ') + '.').slice(0, SUMMARY_MAX_CHARS);
}

const _hasNode = outerDb.prepare('SELECT 1 FROM sages_constellations WHERE node_id = ?');

export async function runConsolidation(options: {
  consolidationThresholdDays?: number;
  threadId?: string;
} = {}): Promise<ConsolidationReport> {
  const { consolidationThresholdDays = 7, threadId } = options;

  const report: ConsolidationReport = { threads_processed: 0, summarized: 0, decayed: 0 };

  const table = isVecEnabled() ? 'resonance_metadata' : 'resonance_vectors';

  const rows = threadId
    ? outerDb.prepare(
        `SELECT thread_id, MIN(timestamp) as oldest FROM ${table} WHERE thread_id = ? GROUP BY thread_id`,
      ).all(threadId)
    : outerDb.prepare(
        `SELECT thread_id, MIN(timestamp) as oldest FROM ${table} WHERE thread_id IS NOT NULL GROUP BY thread_id`,
      ).all();

  for (const row of rows as Array<{ thread_id: string; oldest: number }>) {
    if (!row.thread_id) continue;
    // Legacy summary threads from the old engine: never summarize a summary.
    if (row.thread_id.endsWith('-consolidated')) continue;
    report.threads_processed++;

    const age = ageInDays(row.oldest);
    if (age < consolidationThresholdDays) continue;

    const nodeId = `consolidated_${row.thread_id}`;
    if (_hasNode.get(nodeId)) continue;

    const thread = recallThread(row.thread_id);
    if (thread.length === 0) continue;

    archiveNodeSync({
      node_id: nodeId,
      data: createSummary(thread),
      timestamp: Date.now(),
      dopamine: 0.5,
      cortisol: 0.1,
      pinned: 0,
      provenance: {
        originating_node: 'ADHD-SAGE',
        sync_source: 'consolidation',
        thread_id: row.thread_id,
        source_count: thread.length,
      },
    });
    report.summarized++;
    console.log(`[CONSOLIDATION] Thread ${row.thread_id} summarized (age: ${age.toFixed(1)} days)`);
  }

  return report;
}

export async function nightlyMaintenance(): Promise<ConsolidationReport> {
  console.log('[DECAY] Starting nightly consolidation cycle');
  const report = await runConsolidation({});
  console.log(`[DECAY] Maintenance complete — threads: ${report.threads_processed}, summarized: ${report.summarized}`);
  return report;
}
