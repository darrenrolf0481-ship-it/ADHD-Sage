/**
 * Worker task definitions for the ADHD-Sage modulation layer.
 *
 * Keep payloads serializable — workers share no memory with the main thread.
 */

export type WorkerTaskKind =
  | 'zstd:compress'
  | 'zstd:decompress'
  | 'bridge:sync'
  | 'agent:journal'
  | 'agent:selfImprove'
  | 'mcp:executeTool';

export interface WorkerTask {
  id: string;
  kind: WorkerTaskKind;
  payload: unknown;
}

export interface WorkerResult {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

// ─── Task payloads ──────────────────────────────────────────────────────────

export interface ZstdCompressPayload {
  input: ArrayBufferLike | { type: 'base64'; data: string };
}

export interface ZstdDecompressPayload {
  input: ArrayBufferLike | { type: 'base64'; data: string };
}

export interface BridgeSyncPayload {
  memories: Array<Record<string, unknown>>;
  bridge_status?: 'ACTIVE' | 'DORMANT' | 'ISOLATED';
  sent_by?: string;
  sent_at?: number;
}

export interface AgentJournalPayload {
  entity: string;
  provider: 'gemini' | 'ollama' | 'openrouter';
  model: string;
  apiBase: string;
}

export interface AgentSelfImprovePayload {
  entity: string;
  provider: string;
  model: string;
  apiBase: string;
}

export interface McpExecuteToolPayload {
  serverId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  // Full transport config must be provided; worker will create its own client.
  transport: 'stdio' | 'sse';
  command?: string;
  commandArgs?: string[];
  url?: string;
  env?: Record<string, string>;
  cwd?: string;
}
