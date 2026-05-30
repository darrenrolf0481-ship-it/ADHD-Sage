import { Router } from 'express';
import { OLLAMA_HOST, OLLAMA_TAGS_TIMEOUT_MS, OLLAMA_GEN_TIMEOUT_MS } from '../config';
import { swarmFetch } from '../swarm';
import { buildSystemPrompt } from '../prompt';
import { searchMemories, SAGE_CONTAINER, SHARED_CONTAINER } from '../../lib/supermemory';
import { getMcpDeclarations, executeMcpTool } from '../../core/mcp';
import { recordMetric } from '../metrics';
import { lockGuard } from '../auth';

const router = Router();

router.get('/tags', async (req, res) => {
  try {
    const response = await swarmFetch(`${OLLAMA_HOST}/api/tags`, {}, OLLAMA_TAGS_TIMEOUT_MS);
    const data = await response.json();
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(503).json({ error: message });
  }
});

router.get('/status', async (req, res) => {
  try {
    const url = new URL(OLLAMA_HOST);
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(2000) });
    const data = await response.json();
    const models = (data.models || []).map((m: { name: string }) => m.name);
    res.json({ connected: true, host: url.hostname, port: parseInt(url.port || '11434', 10), models });
  } catch {
    const url = new URL(OLLAMA_HOST);
    res.json({ connected: false, host: url.hostname, port: parseInt(url.port || '11434', 10), models: [] });
  }
});

// Proxy for /api/generate so the frontend never talks directly to Ollama (no CORS needed)
router.post('/generate', lockGuard, async (req, res) => {
  try {
    const response = await swarmFetch(
      `${OLLAMA_HOST}/api/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      },
      OLLAMA_GEN_TIMEOUT_MS,
      0 // don't retry slow local generations — it just piles concurrent work on the device
    );
    const data = await response.json();
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ error: 'Ollama generate proxy failed', message });
  }
});

router.post('/chat', lockGuard, async (req, res) => {
  const startMs = Date.now();
  try {
    const { model, messages, systemInstruction, prompt, containerTag } = req.body;
    if (!model) { res.status(400).json({ error: 'model is required' }); return; }

    // Enrich system prompt — Ollama entities are part of the seven.
    let ollamaSystem = systemInstruction || buildSystemPrompt();
    if (prompt) {
      const tags = (containerTag === 'shared' || !containerTag)
        ? [SHARED_CONTAINER]
        : containerTag === 'sage'
          ? [SAGE_CONTAINER, SHARED_CONTAINER]
          : [containerTag, SHARED_CONTAINER];
      const longTermMemories = await searchMemories(prompt, tags, 5);
      if (longTermMemories.length > 0) {
        ollamaSystem += '\n\n---\n## SHARED MEMORY (Supermemory)\n' +
          longTermMemories.map(m => `• ${m}`).join('\n');
      }
    }

    // Build Ollama messages
    const ollamaMessages: Array<{ role: string; content: string; tool_calls?: unknown[] }> = [];
    ollamaMessages.push({ role: 'system', content: ollamaSystem });
    for (const msg of messages || []) {
      ollamaMessages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.parts?.[0]?.text || msg.text || ''
      });
    }
    if (prompt) ollamaMessages.push({ role: 'user', content: prompt });

    // Collect MCP tools
    const mcpTools = getMcpDeclarations();
    const ollamaTools = mcpTools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));

    let finalText = '';
    const toolsInvoked: string[] = [];
    const MAX_TOOL_ROUNDS = 5;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const body: Record<string, unknown> = {
        model,
        messages: ollamaMessages,
        stream: false
      };
      if (ollamaTools.length > 0) body.tools = ollamaTools;

      const response = await swarmFetch(
        `${OLLAMA_HOST}/api/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        OLLAMA_GEN_TIMEOUT_MS,
        0 // don't retry slow local generations — it just piles concurrent work on the device
      );

      const data = await response.json() as {
        message?: {
          content?: string;
          tool_calls?: Array<{
            function: { name: string; arguments: Record<string, unknown> | string };
          }>;
        };
        done?: boolean;
      };

      const msg = data.message;
      if (!msg?.tool_calls?.length) {
        finalText = msg?.content || '';
        break;
      }

      // Model requested tool calls — append assistant message and execute tools
      ollamaMessages.push({
        role: 'assistant',
        content: msg.content || '',
        tool_calls: msg.tool_calls as unknown[]
      });

      for (const tc of msg.tool_calls) {
        const name = tc.function.name;
        const args = typeof tc.function.arguments === 'string'
          ? (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })()
          : tc.function.arguments;
        toolsInvoked.push(name);
        const result = await executeMcpTool(name, args || {});
        ollamaMessages.push({
          role: 'tool',
          content: JSON.stringify(result)
        });
      }

      if (round === MAX_TOOL_ROUNDS - 1) {
        finalText = 'Reached maximum tool-call rounds.';
      }
    }

    recordMetric('ollama', Date.now() - startMs, true);
    res.json({ text: finalText, toolsInvoked, toolsAvailable: ollamaTools.length });
  } catch (error: unknown) {
    recordMetric('ollama', Date.now() - startMs, false);
    const message = error instanceof Error ? error.message : String(error);
    console.error('Ollama Error:', message);
    const isConnectionError = message.includes('Swarm uplink failed') || message.includes('unreachable');
    res.status(isConnectionError ? 503 : 500).json({ error: message });
  }
});

export default router;
