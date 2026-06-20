/**
 * MCP tool execution worker handler.
 *
 * Each invocation spins up its own short-lived MCP client in the worker, runs
 * the tool, then tears it down. This avoids sharing stdio transports across
 * threads and keeps the main thread unblocked during slow tool calls.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { resolve } from 'node:path';
import type { McpExecuteToolPayload } from '../types';

export async function handleMcpExecuteTool(payload: unknown): Promise<Record<string, unknown>> {
  const p = payload as McpExecuteToolPayload;

  const client = new Client({ name: 'adhd-sage-mcp-worker', version: '1.0.0' }, { capabilities: {} });

  try {
    if (p.transport === 'stdio' && p.command) {
      const transport = new StdioClientTransport({
        command: p.command,
        args: p.commandArgs ?? [],
        env: p.env ? ({ ...process.env, ...p.env } as Record<string, string>) : undefined,
        cwd: p.cwd ? resolve(p.cwd) : undefined,
        stderr: 'pipe',
      });
      await client.connect(transport);
    } else if (p.transport === 'sse' && p.url) {
      await client.connect(new SSEClientTransport(new URL(p.url)));
    } else {
      return { ok: false, error: `Invalid MCP transport config for worker: ${p.transport}` };
    }

    const result = await client.callTool({ name: p.toolName, arguments: p.toolArgs });

    const textParts = (result.content as Array<{ type: string; text?: string }>)
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '');
    const text = textParts.join('\n') || '(empty result)';

    if (result.isError) {
      return { ok: false, error: text };
    }

    return {
      ok: true,
      result: text,
      structured: result.structuredContent ?? undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `MCP worker execution failed: ${msg}` };
  } finally {
    try {
      await client.close();
    } catch {
      // ignore close errors
    }
  }
}
