/**
 * decay-engine.ts
 * SAGE_v7.5 — Neuromorphic forgetting and memory consolidation.
 *
 * Ported from Grok's DecayEngine (decay & consolidation layer).
 * Init-order bug fixed: outer_sweep reference passed after construction.
 * Updated for sqlite-vec dual-storage: queries resonance_metadata when
 * vec is enabled, resonance_vectors otherwise.
 *
 * Lifecycle:
 *   < consolidation_threshold days  → keep as-is
 *   >= consolidation_threshold days → summarize into consolidated vector
 *   >= max_age_days                 → fully decay (delete from resonance)
 */

import { outerDb } from './db';
import { recallThread, indexNode, isVecEnabled } from './resonance-index';

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

function deleteThread(thread_id: string): void {
  if (isVecEnabled()) {
    // Delete from resonance_vec by rowid, then metadata
    outerDb.prepare(
      'DELETE FROM resonance_vec WHERE rowid IN (SELECT rowid FROM resonance_metadata WHERE thread_id = ?)',
    ).run(thread_id);
    outerDb.prepare('DELETE FROM resonance_metadata WHERE thread_id = ?').run(thread_id);
  } else {
    outerDb.prepare('DELETE FROM resonance_vectors WHERE thread_id = ?').run(thread_id);
  }
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
    report.threads_processed++;

    const age = ageInDays(row.oldest);

    if (age >= maxAgeDays) {
      deleteThread(row.thread_id);
      report.decayed++;
      console.log(`[DECAY] Thread ${row.thread_id} fully decayed (age: ${age.toFixed(1)} days)`);
    } else if (age >= consolidationThresholdDays) {
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
