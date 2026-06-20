/**
 * Generic worker dispatcher.
 *
 * Receives tasks from the main-thread pool, dispatches to the right handler,
 * and posts results back. Keep handlers stateless and self-contained.
 */

import { parentPort } from 'node:worker_threads';
import type { WorkerTask, WorkerResult } from './types';

import { handleZstdCompress, handleZstdDecompress } from './handlers/zstd.ts';
import { handleBridgeSync } from './handlers/bridge-sync.ts';
import { handleAgentJournal, handleAgentSelfImprove } from './handlers/agent.ts';
import { handleMcpExecuteTool } from './handlers/mcp-tool.ts';

if (!parentPort) {
  throw new Error('dispatcher.worker.ts must be run as a Worker thread');
}

const handlers: Record<
  WorkerTask['kind'],
  (payload: unknown) => Promise<unknown> | unknown
> = {
  'zstd:compress': handleZstdCompress,
  'zstd:decompress': handleZstdDecompress,
  'bridge:sync': handleBridgeSync,
  'agent:journal': handleAgentJournal,
  'agent:selfImprove': handleAgentSelfImprove,
  'mcp:executeTool': handleMcpExecuteTool,
};

async function handleTask(task: WorkerTask): Promise<WorkerResult> {
  const handler = handlers[task.kind];
  if (!handler) {
    return { id: task.id, ok: false, error: `Unknown task kind: ${task.kind}` };
  }

  try {
    const result = await handler(task.payload);
    return { id: task.id, ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { id: task.id, ok: false, error: message };
  }
}

parentPort.on('message', async (task: WorkerTask) => {
  const result = await handleTask(task);
  parentPort!.postMessage(result);
});
