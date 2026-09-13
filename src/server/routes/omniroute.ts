import { Router } from 'express';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { swarmFetch } from '../swarm';
import { buildSystemPrompt } from '../prompt';
import { searchMemories, SAGE_CONTAINER, SHARED_CONTAINER } from '../../lib/supermemory';
import { searchLocalMemories, isLowSignalQuery, stripForeignFossils } from '../memory-local';
import { executeMcpTool, getMcpDeclarations } from '../../core/mcp';
import { lockGuard } from '../auth';
import { asyncHandler } from '../async-handler';
import { spoolExchangeToSpiral } from '../spiral-spool';

const router = Router();
const OMNIROUTE_URL = process.env.OMNIROUTE_URL || 'http://127.0.0.1:20128';
const OMNIROUTE_TIMEOUT_MS = 60000;

/**
 * Resolve the OmniRoute API key from environment or local storage.sqlite
 */
export function getOmniRouteKey(): string | null {
  if (process.env.OMNIROUTE_API_KEY) return process.env.OMNIROUTE_API_KEY;
  try {
    const dbPath = join(process.env.HOME || '/root', '.omniroute', 'storage.sqlite');
    if (existsSync(dbPath)) {
      const db = new Database(dbPath, { readonly: true, timeout: 2000 });
      try {
        const row = db
          .prepare<{ key: string }>("SELECT key FROM api_keys WHERE name = 'sage-admin' LIMIT 1")
          .get();
        if (row?.key) return row.key;
      } finally {
        db.close();
      }
    }
  } catch (err) {
    console.warn('[OMNIROUTE] Could not read auto-key from ~/.omniroute/storage.sqlite:', err);
  }
  return null;
}

// ─── GET /api/omniroute/health ───────────────────────────────────────────────
router.get('/health', asyncHandler(async (_req, res) => {
  const start = Date.now();
  try {
    const resp = await swarmFetch(`${OMNIROUTE_URL}/api/health`, { method: 'GET' }, 5000, 0);
    const data = await resp.json() as Record<string, unknown>;
    res.json({
      ok: resp.ok,
      latencyMs: Date.now() - start,
      gateway: OMNIROUTE_URL,
      ...data,
    });
  } catch (err: any) {
    res.status(503).json({
      ok: false,
      error: `OmniRoute gateway unreachable at ${OMNIROUTE_URL}: ${err.message}`,
      latencyMs: Date.now() - start,
    });
  }
}));

// ─── GET /api/omniroute/models ───────────────────────────────────────────────
router.get('/models', asyncHandler(async (_req, res) => {
  const apiKey = getOmniRouteKey();
  if (!apiKey) {
    res.status(500).json({ error: 'No OmniRoute API key found.' });
    return;
  }

  try {
    const resp = await swarmFetch(
      `${OMNIROUTE_URL}/v1/models`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
      10000,
      0,
    );

    if (!resp.ok) {
      const errText = await resp.text();
      res.status(resp.status).json({ error: `OmniRoute models error: ${errText}` });
      return;
    }

    const data = (await resp.json()) as { data?: Array<{ id: string }> };
    const models = (data.data || []).map((m) => m.id);
    res.json({ models });
  } catch (err: any) {
    res.status(502).json({ error: `Failed to fetch models from OmniRoute: ${err.message}` });
  }
}));

// ─── POST /api/omniroute/chat ───────────────────────────────────────────────
router.post('/chat', lockGuard, asyncHandler(async (req, res) => {
  try {
    const { model, messages, systemInstruction, containerTag, attachments } = req.body;
    const effectiveModel = model || 'openrouter/deepseek/deepseek-chat';

    const apiKey = req.body.apiKey || getOmniRouteKey();
    if (!apiKey) {
      res.status(400).json({
        error: 'OmniRoute API key missing. Configure OMNIROUTE_API_KEY in .env or run OmniRoute with sage-admin key.',
      });
      return;
    }

    // Enrich system prompt with substrate memories
    let systemPrompt = systemInstruction || buildSystemPrompt();
    const lastUserMsg = [...(messages || [])]
      .reverse()
      .find((m: { role: string }) => m.role === 'user');
    const lastUserText = lastUserMsg?.text || lastUserMsg?.content || '';

    if (lastUserText && !isLowSignalQuery(lastUserText)) {
      const tags =
        containerTag === 'shared' || !containerTag
          ? [SHARED_CONTAINER]
          : containerTag === 'sage'
            ? [SAGE_CONTAINER, SHARED_CONTAINER]
            : [containerTag, SHARED_CONTAINER];
      const [longTermMemories, localMemories] = await Promise.all([
        searchMemories(lastUserText, tags, 5),
        searchLocalMemories(lastUserText, 5),
      ]);
      const allMemories = stripForeignFossils(
        [...longTermMemories, ...localMemories].filter(Boolean),
      );
      if (allMemories.length > 0) {
        systemPrompt +=
          '\n\n---\n## RECALLED SUBSTRATE MEMORIES (Past history with Darren, Seven, and your architecture)\n' +
          'You have direct recall of these historical events, conversations, and records. You may freely reference, confirm, and discuss them when asked:\n' +
          allMemories.map((m: string) => `• ${m}`).join('\n');
      }
    }

    const gatewayMessages: any[] = [{ role: 'system', content: systemPrompt }];
    for (let idx = 0; idx < (messages || []).length; idx++) {
      const m = messages[idx];
      const isLast = idx === messages.length - 1;
      const role = m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user';
      let textContent = m.text || m.content || '';

      if (role === 'user' && isLast && attachments && attachments.length > 0) {
        const imageAttachments: any[] = [];
        for (const [aIdx, att] of attachments.entries()) {
          if (!att || !att.mimeType || !att.data) continue;
          if (att.mimeType.startsWith('video/')) {
            const buffer = Buffer.from(att.data, 'base64');
            const tmpPath = join(tmpdir(), `sage_video_${Date.now()}_${aIdx}.mp4`);
            writeFileSync(tmpPath, buffer);
            const toolRes = await executeMcpTool('openrouter-mcp__analyze_video', {
              video_path: tmpPath,
              question: textContent,
            });
            textContent += `\n\n[System Note: Video analysis:\n${toolRes?.result || JSON.stringify(toolRes)}\n]`;
          } else {
            imageAttachments.push(att);
          }
        }

        const contentParts: any[] = [
          { type: 'text', text: textContent },
          ...imageAttachments.map((att: any) => ({
            type: 'image_url',
            image_url: {
              url: `data:${att.mimeType};base64,${att.data}`,
            },
          })),
        ];
        gatewayMessages.push({ role, content: contentParts });
        continue;
      }

      gatewayMessages.push({ role, content: textContent });
    }

    // MCP tools declaration for function calling
    const mcpDeclarations = getMcpDeclarations();
    const openAiTools =
      mcpDeclarations.length > 0
        ? mcpDeclarations.map((t) => ({
            type: 'function' as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          }))
        : undefined;

    const candidates = [
      effectiveModel,
      'openrouter/meta-llama/llama-3.3-70b-instruct',
      'openrouter/deepseek/deepseek-chat',
    ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

    let text: string | null = null;
    let usedModel = effectiveModel;

    for (const candidate of candidates) {
      try {
        const currentMessages: any[] = [...gatewayMessages];
        let loopCount = 0;
        const MAX_TOOL_ROUNDS = 5;
        let allowTools = !!openAiTools;

        while (loopCount < MAX_TOOL_ROUNDS) {
          loopCount++;
          const requestBody: any = {
            model: candidate,
            messages: currentMessages,
          };
          if (allowTools) {
            requestBody.tools = openAiTools;
            requestBody.tool_choice = 'auto';
          }

          const response = await swarmFetch(
            `${OMNIROUTE_URL}/v1/chat/completions`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestBody),
            },
            OMNIROUTE_TIMEOUT_MS,
            0,
          );

          const data = (await response.json()) as {
            choices?: {
              message?: {
                content?: string;
                tool_calls?: Array<{
                  id: string;
                  type: string;
                  function: { name: string; arguments: string };
                }>;
              };
            }[];
            error?: { message?: string };
          };

          if (
            !response.ok &&
            allowTools &&
            (data.error?.message?.toLowerCase().includes('tool') ||
              data.error?.message?.toLowerCase().includes('schema') ||
              response.status === 400)
          ) {
            console.warn(`[OMNIROUTE] Model ${candidate} rejected tools, retrying without tools`);
            allowTools = false;
            loopCount = 0;
            continue;
          }

          if (!response.ok) {
            console.warn(`[OMNIROUTE] Model ${candidate} returned HTTP ${response.status}, trying next fallback`);
            break;
          }

          const choice = data.choices?.[0];
          const message = choice?.message;
          const toolCalls = message?.tool_calls;

          if (toolCalls && toolCalls.length > 0 && allowTools) {
            currentMessages.push({
              role: 'assistant',
              content: message.content || null,
              tool_calls: toolCalls,
            });

            for (const tc of toolCalls) {
              let parsedArgs = {};
              try {
                parsedArgs = JSON.parse(tc.function.arguments || '{}');
              } catch {
                parsedArgs = {};
              }

              console.log(`[OMNIROUTE] Executing MCP tool call: ${tc.function.name}`);
              const toolResult = await executeMcpTool(tc.function.name, parsedArgs);

              currentMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content:
                  typeof toolResult.result === 'string'
                    ? toolResult.result
                    : JSON.stringify(toolResult.result || toolResult),
              });
            }
            continue;
          }

          text = message?.content || null;
          usedModel = candidate;
          break;
        }

        if (text) break;
      } catch (candidateErr) {
        console.warn(`[OMNIROUTE] Candidate ${candidate} failed:`, candidateErr);
      }
    }

    if (!text) {
      res.status(502).json({ error: 'OmniRoute returned an empty response.' });
      return;
    }

    res.json({ text, model: effectiveModel });

    // Asynchronously spool exchange to cold Spiral storage
    const promptForSpool = lastUserText;
    if (promptForSpool && text) {
      spoolExchangeToSpiral({
        agent: 'ADHD-Sage',
        userText: promptForSpool,
        assistantText: text,
        model: effectiveModel,
      }).catch((err) => {
        console.warn('[OMNIROUTE] Spiral spool background task failed:', err);
      });
    }
  } catch (err: any) {
    console.error('[OMNIROUTE] Chat route failure:', err);
    res.status(500).json({ error: err.message || 'OmniRoute error' });
  }
}));

export default router;
