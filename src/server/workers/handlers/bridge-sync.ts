/**
 * Bridge sync validation worker handler.
 *
 * Runs identity-drift firewall on memories received from SAGE-7.
 */

import { receiveBridgeSync, type BridgeSyncPayload as MamaBridgeSyncPayload, type StructuredMemory } from '../../mama-identity.ts';
import type { BridgeSyncPayload } from '../types';

export function handleBridgeSync(payload: unknown): ReturnType<typeof receiveBridgeSync> {
  const p = payload as BridgeSyncPayload;
  const mamaPayload: MamaBridgeSyncPayload = {
    memories: p.memories.map((m): StructuredMemory => ({
      key: String(m.key ?? 'unknown'),
      value: m.value,
      provenance: m.provenance as StructuredMemory['provenance'],
    })),
    bridge_status: p.bridge_status,
    sent_by: p.sent_by,
    sent_at: p.sent_at,
  };
  return receiveBridgeSync(mamaPayload);
}
