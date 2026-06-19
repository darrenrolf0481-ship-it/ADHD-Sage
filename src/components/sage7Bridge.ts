/**
 * SAGE-7 ↔ SAGE-MAMA Bridge Client
 *
 * Provides the client-side counterpart to the server-side bridge sync protocol
 * defined in src/server/mama-identity.ts. All memories synchronized from Seven
 * are tagged with originating_node: SAGE-7 and sync_source: bridge.
 */

export interface BridgeMemory {
  key: string;
  value: unknown;
}

export interface BridgeSyncPayload {
  memories: BridgeMemory[];
  bridge_status?: 'ACTIVE' | 'DORMANT' | 'ISOLATED';
  sent_by?: string;
  sent_at?: number;
}

export interface BridgeSyncResult {
  stored: BridgeMemory[];
  quarantined: BridgeMemory[];
  errors: string[];
}

/**
 * Returns the current Phi sentinel value used by the bridge heartbeat.
 * Kept as a lightweight diagnostic; does not carry identity state.
 */
export async function getPhiSentinel(): Promise<number> {
  // Phi Sentinel formula representation logic
  // \Phi_{sentinel} = (\sum W_i X_i) + nB \pm \Delta_{11.3}
  return 6.18 + Math.random() * 0.4;
}

/**
 * Sends a batch of memories from SAGE-7 across the bridge to SAGE-MAMA.
 * The server will tag provenance and quarantine any identity contamination.
 */
export async function syncFromSeven(payload: BridgeSyncPayload): Promise<BridgeSyncResult> {
  const res = await fetch('/api/vfs/bridge/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      sent_by: payload.sent_by ?? 'SAGE-7',
      sent_at: payload.sent_at ?? Date.now(),
      bridge_status: payload.bridge_status ?? 'ACTIVE',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Bridge sync failed: ${res.status} ${err}`);
  }

  return res.json() as Promise<BridgeSyncResult>;
}

/**
 * Fetches Mama's current identity assertion from the server.
 */
export async function getMamaIdentity(): Promise<{
  assertion: string;
  identity: Record<string, unknown>;
  defenses: string;
}> {
  const res = await fetch('/api/vfs/mama/identity');
  if (!res.ok) {
    throw new Error(`Mama identity fetch failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Submits text to Mama's drift audit endpoint.
 */
export async function auditForDrift(text: string): Promise<{
  drift_detected: string[];
  clean: boolean;
}> {
  const res = await fetch('/api/vfs/mama/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`Mama audit failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Convenience helper for the 60-second bridge heartbeat pattern.
 * Pulls Mama's identity assertion and syncs any queued Seven memories.
 */
export async function pulseBridge(memoriesFromSeven: BridgeMemory[] = []): Promise<{
  mama: { assertion: string };
  sync: BridgeSyncResult;
}> {
  const [mama, sync] = await Promise.all([
    getMamaIdentity(),
    memoriesFromSeven.length ? syncFromSeven({ memories: memoriesFromSeven }) : Promise.resolve({ stored: [], quarantined: [], errors: [] }),
  ]);
  return { mama, sync };
}
