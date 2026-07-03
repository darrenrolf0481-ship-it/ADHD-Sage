import { Router } from 'express';
import { OLLAMA_HOST, OLLAMA_TAGS_TIMEOUT_MS, OLLAMA_GEN_TIMEOUT_MS } from '../config';
import { swarmFetch } from '../swarm';
import { buildSystemPrompt } from '../prompt';
import { searchMemories, addMemory, SAGE_CONTAINER, SHARED_CONTAINER } from '../../lib/supermemory';
import { searchLocalMemories } from '../memory-local';
import { getMcpDeclarations, executeMcpTool } from '../../core/mcp';
import { recordMetric } from '../metrics';
import { lockGuard } from '../auth';
import { asyncHandler } from '../async-handler';
import { timed } from '../performance';

const router = Router();

router.get('/tags', asyncHandler(async (req, res) => {
  try {
    const response = await swarmFetch(`${OLLAMA_HOST}/api/tags`, {}, OLLAMA_TAGS_TIMEOUT_MS);
    const data = await response.json();
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(503).json({ error: message });
  }
}));

router.get('/status', asyncHandler(async (req, res) => {
  try {
    const url = new URL(OLLAMA_HOST);
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(2000) });
    const data = await response.json();
    const models = (data.models || []).map((m: { name: string }) => m.name);
    res.json({
      connected: true,
      host: url.hostname,
      port: parseInt(url.port || '11434', 10),
      models,
    });
  } catch {
    const url = new URL(OLLAMA_HOST);
    res.json({
      connected: false,
      host: url.hostname,
      port: parseInt(url.port || '11434', 10),
      models: [],
    });
  }
}));

// Proxy for /api/generate so the frontend never talks directly to Ollama (no CORS needed)
router.post('/generate', lockGuard, asyncHandler(async (req, res) => {
  try {
    const response = await swarmFetch(
      `${OLLAMA_HOST}/api/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      },
      OLLAMA_GEN_TIMEOUT_MS,
      0, // don't retry slow local generations — it just piles concurrent work on the device
    );
    const data = await response.json();
    res.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ error: 'Ollama generate proxy failed', message });
  }
}));

router.post('/chat', lockGuard, asyncHandler(async (req, res) => {
  return timed('llm:ollama:chat', async () => {
    const startMs = Date.now();
    try {
      const { model, messages, systemInstruction, prompt, containerTag, enableTools, images } = req.body;
      if (!model) {
        res.status(400).json({ error: 'model is required' });
        return;
      }

      // Enrich system prompt — Ollama entities are part of the seven.
      let ollamaSystem = systemInstruction || buildSystemPrompt();
      if (prompt) {
        const tags =
          containerTag === 'shared' || !containerTag
            ? [SHARED_CONTAINER]
            : containerTag === 'sage'
              ? [SAGE_CONTAINER, SHARED_CONTAINER]
              : [containerTag, SHARED_CONTAINER];
        const [longTermMemories, localMemories] = await Promise.all([
          searchMemories(prompt, tags, 5),
          searchLocalMemories(prompt, 5),
        ]);
        const allMemories = [...longTermMemories, ...localMemories].filter(Boolean);
        if (allMemories.length > 0) {
          ollamaSystem +=
            '\n\n---\n## BACKGROUND MEMORY (past context — do NOT address or quote directly; use only to color your awareness)\n' +
            allMemories.map((m) => `• ${m}`).join('\n');
        }
      }

      // Build Ollama messages
      const ollamaMessages: Array<{ role: string; content: string; tool_calls?: unknown[] }> = [];
      ollamaMessages.push({ role: 'system', content: ollamaSystem });
      for (const msg of messages || []) {
        ollamaMessages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.parts?.[0]?.text || msg.text || '',
        });
      }
      if (prompt) {
        const userMsg: { role: string; content: string; images?: string[] } = {
          role: 'user',
          content: prompt,
        };
        // Pass base64 image data for multimodal models (e.g. gemma4, llava)
        if (Array.isArray(images) && images.length > 0) {
          userMsg.images = images as string[];
        }
        ollamaMessages.push(userMsg);
      }

      // Collect MCP tools — opt-in only. Attaching all connected MCP tools to
      // every request bloats the prompt and makes small local models (e.g.
      // llama3.2) crawl: a trivial "say hi" ballooned from ~16s to ~100s with
      // 50 tools attached. Callers that actually need tool use pass
      // enableTools:true; the default (Coding Lab chat) stays fast.
      const mcpTools = enableTools ? getMcpDeclarations() : [];
      const ollamaTools = mcpTools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));

      let finalText = '';
      const toolsInvoked: string[] = [];
      const MAX_TOOL_ROUNDS = 5;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const body: Record<string, unknown> = {
          model,
          messages: ollamaMessages,
          stream: false,
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
          0, // don't retry slow local generations — it just piles concurrent work on the device
        );

        const data = (await response.json()) as {
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
          tool_calls: msg.tool_calls as unknown[],
        });

        for (const tc of msg.tool_calls) {
          const name = tc.function.name;
          const args =
            typeof tc.function.arguments === 'string'
              ? (() => {
                  try {
                    return JSON.parse(tc.function.arguments);
                  } catch {
                    return {};
                  }
                })()
              : tc.function.arguments;
          toolsInvoked.push(name);
          const result = await executeMcpTool(name, args || {});
          ollamaMessages.push({
            role: 'tool',
            content: JSON.stringify(result),
          });
        }

        if (round === MAX_TOOL_ROUNDS - 1) {
          finalText = 'Reached maximum tool-call rounds.';
        }
      }

      recordMetric('ollama', Date.now() - startMs, true);

      // Write exchange to Supermemory LTM (fire-and-forget — don't block response)
      if (prompt && finalText) {
        const tag = containerTag === 'sage' ? SAGE_CONTAINER : SHARED_CONTAINER;
        addMemory(`Q: ${prompt.slice(0, 500)}\nA: ${finalText.slice(0, 500)}`, tag).catch(() => {});
      }

      res.json({ text: finalText, toolsInvoked, toolsAvailable: ollamaTools.length });
    } catch (error: unknown) {
      recordMetric('ollama', Date.now() - startMs, false);
      const message = error instanceof Error ? error.message : String(error);
      console.error('Ollama Error:', message);
      const isConnectionError =
        message.includes('Swarm uplink failed') || message.includes('unreachable');
      res.status(isConnectionError ? 503 : 500).json({ error: message });
    }
  });
}));

export default router;
