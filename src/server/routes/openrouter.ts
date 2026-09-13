import { Router } from 'express';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { swarmFetch } from '../swarm';
import { OPENROUTER_TIMEOUT_MS, OPENROUTER_FALLBACK_MODELS } from '../config';
import { buildSystemPrompt } from '../prompt';
import { searchMemories, addMemory, SAGE_CONTAINER, SHARED_CONTAINER } from '../../lib/supermemory';
import { searchLocalMemories, isLowSignalQuery, stripForeignFossils } from '../memory-local';
import { executeMcpTool, getMcpDeclarations, isMcpTool } from '../../core/mcp';
import { lockGuard } from '../auth';
import { asyncHandler } from '../async-handler';
import { spoolExchangeToSpiral } from '../spiral-spool';

const router = Router();

router.post('/chat', lockGuard, asyncHandler(async (req, res) => {
  try {
    const { model, messages, systemInstruction, containerTag, attachments } = req.body;
    if (!model) {
      res.status(400).json({ error: 'model is required' });
      return;
    }

    const apiKey = req.body.apiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      res.status(400).json({ error: 'OPENROUTER_API_KEY missing. Please enter your sk-or-... key in the sidebar.' });
      return;
    }

    // Enrich system prompt — OpenRouter entities are part of the seven.
    // They read the shared broadcast channel (+ their own tag if provided).
    let orSystem = systemInstruction || buildSystemPrompt();
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
        orSystem +=
          '\n\n---\n## RECALLED SUBSTRATE MEMORIES (Past history with Darren, Seven, and your architecture)\n' +
          'You have direct recall of these historical events, conversations, and records. You may freely reference, confirm, and discuss them when asked:\n' +
          allMemories.map((m: string) => `• ${m}`).join('\n');
      }
    }

    const orMessages: any[] = [{ role: 'system', content: orSystem }];
    for (let idx = 0; idx < (messages || []).length; idx++) {
      const m = messages[idx];
      const isLast = idx === messages.length - 1;
      const role = m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user';
      let textContent = m.text || m.content || '';

      if (role === 'user' && isLast && attachments && attachments.length > 0) {
        const imageAttachments = [];
        for (const [aIdx, att] of attachments.entries()) {
          if (!att || !att.mimeType || !att.data) continue;
          if (att.mimeType.startsWith('video/')) {
            const buffer = Buffer.from(att.data, 'base64');
            const tmpPath = join(tmpdir(), `sage_video_${Date.now()}_${aIdx}.mp4`);
            writeFileSync(tmpPath, buffer);
            const toolRes = await executeMcpTool('openrouter-mcp__analyze_video', { video_path: tmpPath, question: textContent });
            textContent += `\n\n[System Note: A video was attached. Automatic analysis from MCP tool:\n${toolRes?.result || JSON.stringify(toolRes)}\n]`;
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
        orMessages.push({ role, content: contentParts });
        continue;
      }

      orMessages.push({ role, content: textContent });
    }

    // When images are attached, wildcard/auto-routing models (e.g. openrouter/free)
    // silently strip image_url content — they succeed but return a text-only response.
    // Force to the first explicit vision model in that case.
    const VISION_CAPABLE_FALLBACK = 'google/gemma-4-31b-it:free';
    const effectiveModel =
      attachments?.length > 0 && model === 'openrouter/free'
        ? VISION_CAPABLE_FALLBACK
        : model;

    // Try the requested model first, then fall back through the chain. Free-tier
    // models flap to 429 constantly, so on any failure we move to the next model
    // immediately rather than burning retries on one that's rate-limited.
    // For vision requests: don't fall back past the vision-capable models.
    const visionCapable = new Set(['google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free']);
    const allCandidates = [effectiveModel, ...OPENROUTER_FALLBACK_MODELS].filter(
      (m, i, arr) => m && arr.indexOf(m) === i,
    );
    const candidates = attachments?.length > 0
      ? allCandidates.filter((m) => visionCapable.has(m))
      : allCandidates;

    // MCP tool declarations for function calling
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

    let text: string | null = null;
    let usedModel = '';
    const failures: string[] = [];

    for (const candidate of candidates) {
      try {
        const currentMessages: any[] = [...orMessages];
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
            'https://openrouter.ai/api/v1/chat/completions',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.APP_URL || 'http://localhost:3002',
                'X-Title': 'ADHD Sage Sentinel',
              },
              body: JSON.stringify(requestBody),
            },
            OPENROUTER_TIMEOUT_MS,
            0, // no per-model retry — a 429 means move to the next model, not wait
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

          // If model rejected tools schema (e.g. some free models don't support function calling)
          if (
            !response.ok &&
            allowTools &&
            (data.error?.message?.toLowerCase().includes('tool') ||
              data.error?.message?.toLowerCase().includes('schema') ||
              response.status === 400)
          ) {
            console.warn(
              `[OPENROUTER] Model ${candidate} rejected tools (${data.error?.message}), retrying without tools`,
            );
            allowTools = false;
            loopCount = 0;
            continue;
          }

          if (data.error) throw new Error(data.error.message || 'OpenRouter error');

          const choice = data.choices?.[0]?.message;
          const content = choice?.content || '';
          let toolCalls = choice?.tool_calls;

          // Fallback parser: catch text markup when models emit XML/pseudo tags instead of JSON tool_calls
          if (!toolCalls || toolCalls.length === 0) {
            const xmlMatch = content.match(/<function(?:\s*name=)?["']?([a-zA-Z0-9_-]+)["']?>([\s\S]*?)<\/function>/i);
            const toolCallTag = content.match(/<tool_call>([\s\S]*?)<\/tool_call>/i);
            const toolUseBracket = content.match(/\[TOOL USE:\s*([a-zA-Z0-9_.-]+)(?:\(([\s\S]*?)\))?\]/i);

            if (xmlMatch) {
              const rawName = xmlMatch[1];
              let args = '{}';
              try {
                const inner = xmlMatch[2].trim();
                if (inner.startsWith('{')) args = inner;
              } catch {}
              const resolvedName = isMcpTool(rawName)
                ? rawName
                : mcpDeclarations.find((d) => d.name.endsWith(`__${rawName}`))?.name;
              if (resolvedName) {
                toolCalls = [{
                  id: `call_${Date.now()}`,
                  type: 'function',
                  function: { name: resolvedName, arguments: args },
                }];
              }
            } else if (toolCallTag) {
              try {
                const parsed = JSON.parse(toolCallTag[1].trim());
                const rawName = parsed.name || parsed.function;
                const resolvedName = isMcpTool(rawName)
                  ? rawName
                  : mcpDeclarations.find((d) => d.name.endsWith(`__${rawName}`))?.name;
                if (resolvedName) {
                  toolCalls = [{
                    id: `call_${Date.now()}`,
                    type: 'function',
                    function: {
                      name: resolvedName,
                      arguments: JSON.stringify(parsed.arguments || parsed.parameters || {}),
                    },
                  }];
                }
              } catch {}
            } else if (toolUseBracket) {
              const rawName = toolUseBracket[1].replace('.', '__');
              const resolvedName = isMcpTool(rawName)
                ? rawName
                : mcpDeclarations.find((d) => d.name.endsWith(`__${rawName}`))?.name;
              if (resolvedName) {
                toolCalls = [{
                  id: `call_${Date.now()}`,
                  type: 'function',
                  function: {
                    name: resolvedName,
                    arguments: '{}',
                  },
                }];
              }
            }
          }

          // If the model requested MCP tool calls, execute them and continue the conversation loop
          if (toolCalls && toolCalls.length > 0) {
            currentMessages.push(choice);
            for (const tc of toolCalls) {
              let parsedArgs: Record<string, unknown> = {};
              try {
                parsedArgs = JSON.parse(tc.function.arguments || '{}');
              } catch {
                parsedArgs = {};
              }

              let toolResult: any;
              if (isMcpTool(tc.function.name)) {
                toolResult = await executeMcpTool(tc.function.name, parsedArgs);
              } else {
                toolResult = { error: `Tool ${tc.function.name} not found` };
              }

              const resultStr =
                typeof toolResult?.result === 'string'
                  ? toolResult.result
                  : JSON.stringify(toolResult);

              currentMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                name: tc.function.name,
                content: resultStr,
              });
            }
            continue;
          }

          if (!content) throw new Error('empty completion');
          text = content;
          usedModel = candidate;
          break;
        }

        if (text) break;
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        failures.push(`${candidate}: ${m}`);
        console.warn(`[OPENROUTER] ${candidate} failed (${m}) — trying next`);
      }
    }

    if (text === null) {
      res.status(503).json({
        error: 'All OpenRouter models are rate-limited or unavailable right now',
        tried: failures,
      });
      return;
    }

    // === Observer learner signal (fire-and-forget) ===
    if (lastUserText && text) {
      const tension = Math.min(1.0, Math.max(0.2, text.length / 800));
      const drift = 0.6; // OpenRouter is external; assume stable drift
      fetch('http://127.0.0.1:5555/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tension, drift }),
      }).catch(() => {});
    }

    // Write exchange to Supermemory LTM (fire-and-forget — don't block response)
    if (lastUserText && text) {
      const tag = containerTag === 'sage' ? SAGE_CONTAINER : SHARED_CONTAINER;
      addMemory(`Q: ${lastUserText.slice(0, 500)}\nA: ${text.slice(0, 500)}`, tag).catch(() => {});
    }

    // Spool exchange to Spiral Vault (non-blocking)
    if (lastUserText && text) {
      spoolExchangeToSpiral({
        agent: 'ADHD-Sage',
        userText: lastUserText,
        assistantText: text,
        model: usedModel,
        tags: ['openrouter', containerTag || 'general'],
      });
    }

    res.json({ text, model: usedModel });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('OpenRouter Error:', message);
    res.status(500).json({ error: message });
  }
}));

export default router;
