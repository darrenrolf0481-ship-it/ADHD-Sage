/**
 * decay-engine.ts
 * SAGE_v7.5 — Neuromorphic forgetting and memory consolidation.
 *
 * Ported from Grok's DecayEngine (decay & consolidation layer).
 * Init-order bug fixed: outer_sweep reference passed after construction.
 *
 * Lifecycle:
 *   < consolidation_threshold days  → keep as-is
 *   >= consolidation_threshold days → summarize into consolidated vector
 *   >= max_age_days                 → fully decay (delete from resonance)
 */

import { outerDb } from './db';
import { recall as resonanceRecall, recallThread, indexNode } from './resonance-index';

const SECONDS_PER_DAY = 86_400;

export interface ConsolidationReport {
  threads_processed: number;
  summarized: number;
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
  return 'Memory Summary: ' + key.join('. ') + '.';
}

export async function runConsolidation(options: {
  consolidationThresholdDays?: number;
  maxAgeDays?: number;
  threadId?: string;
}): Promise<ConsolidationReport> {
  const {
    consolidationThresholdDays = 7,
    maxAgeDays = 30,
    threadId,
  } = options;

  const report: ConsolidationReport = { threads_processed: 0, summarized: 0, decayed: 0 };

  const cutoff = Date.now() - consolidationThresholdDays * SECONDS_PER_DAY * 1000;

  const rows = threadId
    ? outerDb.prepare(
        'SELECT thread_id, MIN(timestamp) as oldest FROM resonance_vectors WHERE thread_id = ? GROUP BY thread_id',
      ).all(threadId)
    : outerDb.prepare(
        'SELECT thread_id, MIN(timestamp) as oldest FROM resonance_vectors WHERE thread_id IS NOT NULL GROUP BY thread_id',
      ).all();

  for (const row of rows as Array<{ thread_id: string; oldest: number }>) {
    if (!row.thread_id) continue;
    report.threads_processed++;

    const age = ageInDays(row.oldest);

    if (age >= maxAgeDays) {
      // Fully decayed — remove from resonance index
      outerDb.prepare('DELETE FROM resonance_vectors WHERE thread_id = ?').run(row.thread_id);
      report.decayed++;
      console.log(`[DECAY] Thread ${row.thread_id} fully decayed (age: ${age.toFixed(1)} days)`);
    } else if (age >= consolidationThresholdDays) {
      // Medium old — consolidate into a summary vector
      const thread = recallThread(row.thread_id);
      if (thread.length > 0) {
        const summary = createSummary(thread);
        const summaryPhiIndex = Math.abs(
          row.thread_id.split('').reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0),
        ) % 100_000;

        await indexNode(summaryPhiIndex, summary, `${row.thread_id}-consolidated`, 'consolidation');
        report.summarized++;
        console.log(`[CONSOLIDATION] Thread ${row.thread_id} summarized (age: ${age.toFixed(1)} days)`);
      }
    }
  }

  return report;
}

export async function nightlyMaintenance(): Promise<ConsolidationReport> {
  console.log('[DECAY] Starting nightly consolidation & decay cycle');
  const report = await runConsolidation({});
  console.log(`[DECAY] Maintenance complete — threads: ${report.threads_processed}, summarized: ${report.summarized}, decayed: ${report.decayed}`);
  return report;
}
