/**
 * Agent worker handlers.
 *
 * Journal and self-improvement tasks run off the main thread and call back into
 * the local HTTP API to persist results.
 */

import { writeJournalEntry, type JournalConfig } from '../../../lib/journal-agent.ts';
import { runSelfImprovement, type SelfImproveConfig } from '../../../lib/self-improvement-agent.ts';
import type { AgentJournalPayload, AgentSelfImprovePayload } from '../types';

export async function handleAgentJournal(payload: unknown): Promise<{ ok: boolean; entity: string }> {
  const p = payload as AgentJournalPayload;
  const cfg: JournalConfig = {
    entity: p.entity,
    provider: p.provider as JournalConfig['provider'],
    model: p.model,
    apiBase: p.apiBase,
  };
  await writeJournalEntry(cfg);
  return { ok: true, entity: p.entity };
}

export async function handleAgentSelfImprove(payload: unknown): Promise<{ ok: boolean; entity: string }> {
  const p = payload as AgentSelfImprovePayload;
  const cfg: SelfImproveConfig = {
    entity: p.entity,
    provider: p.provider as SelfImproveConfig['provider'],
    model: p.model,
    apiBase: p.apiBase,
  };
  await runSelfImprovement(cfg);
  return { ok: true, entity: p.entity };
}
