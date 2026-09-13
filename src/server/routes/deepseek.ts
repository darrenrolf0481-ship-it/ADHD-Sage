import { Router } from 'express';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { lockGuard } from '../auth';
import { asyncHandler } from '../async-handler';
import { buildSystemPrompt } from '../prompt';
import { searchMemories, SAGE_CONTAINER, SHARED_CONTAINER } from '../../lib/supermemory';
import { searchLocalMemories, isLowSignalQuery, stripForeignFossils } from '../memory-local';
import { addMemory } from '../../lib/supermemory';
import { spoolExchangeToSpiral } from '../spiral-spool';
import { getMcpDeclarations, executeMcpTool, isMcpTool } from '../../core/mcp';
import { executeTool, type ToolEffect } from '../tools';

const router = Router();

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
// DeepSeek is OpenAI-compatible but can be slow on reasoner — generous timeout.
const DEEPSEEK_TIMEOUT_MS = parseInt(process.env.DEEPSEEK_TIMEOUT_MS || '120000', 10);

router.post('/chat', lockGuard, asyncHandler(async (req: any, res) => {
  try {
    const { model, messages, systemInstruction, containerTag, attachments } = req.body as any;
    if (!model) {
      res.status(400).json({ error: 'model is required' });
      return;
    }

    const apiKey = req.body.apiKey || process.env.DEEPSEEK_API_KEY;
    if (!apiKey && !process.env.OPENROUTER_API_KEY) {
      res.status(400).json({
        error: 'DEEPSEEK_API_KEY missing. Add it to .env (platform.deepseek.com/api_keys) or set it in the sidebar.',
      });
      return;
    }

    // Enrich system prompt with long-term memory (same as openrouter/gemini).
    let dsSystem = systemInstruction || buildSystemPrompt();
    const lastUserMsg = [...(messages || [])].reverse().find((m: { role: string }) => m.role === 'user');
    let lastUserText: string = lastUserMsg?.text || lastUserMsg?.content || '';

    // Handle attachments (e.g. video analysis via MCP)
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      for (const [aIdx, att] of attachments.entries()) {
        if (!att || !att.mimeType || !att.data) continue;
        if (att.mimeType.startsWith('video/')) {
          try {
            const buffer = Buffer.from(att.data, 'base64');
            const tmpPath = join(tmpdir(), `sage_video_${Date.now()}_${aIdx}.mp4`);
            writeFileSync(tmpPath, buffer);
            if (isMcpTool('openrouter-mcp__analyze_video')) {
              const toolRes = await executeMcpTool('openrouter-mcp__analyze_video', {
                video_path: tmpPath,
                question: lastUserText,
              });
              lastUserText += `\n\n[System Note: A video was attached. Analysis:\n${toolRes?.result || JSON.stringify(toolRes)}\n]`;
            }
          } catch (vErr) {
            console.warn('[DeepSeek] Video attachment processing skipped:', vErr);
          }
        }
      }
    }

    if (lastUserText && !isLowSignalQuery(lastUserText)) {
      const tags =
        containerTag === 'shared' || !containerTag
          ? [SHARED_CONTAINER]
          : containerTag === 'sage'
            ? [SAGE_CONTAINER, SHARED_CONTAINER]
            : [containerTag, SHARED_CONTAINER];
      const [longTerm, local] = await Promise.all([
        searchMemories(lastUserText, tags, 5),
        searchLocalMemories(lastUserText, 5),
      ]);
      const all = stripForeignFossils([...longTerm, ...local].filter(Boolean));
      if (all.length > 0) {
        dsSystem +=
          '\n\n---\n## RECALLED SUBSTRATE MEMORIES (Past history with Darren, Seven, and your architecture)\n' +
          'You have direct recall of these historical events, conversations, and records. You may freely reference, confirm, and discuss them when asked:\n' +
          all.map((m: string) => `• ${m}`).join('\n');
      }
    }

    const dsMessages: any[] = [
      { role: 'system', content: dsSystem },
      ...(messages || []).map((m: { role: string; text?: string; content?: string }) => ({
        role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
        content: m.text || m.content || '',
      })),
    ];

    // Ensure the last message reflects any attachment notes
    if (lastUserText && dsMessages.length > 0) {
      for (let i = dsMessages.length - 1; i >= 0; i--) {
        if (dsMessages[i].role === 'user') {
          dsMessages[i].content = lastUserText;
          break;
        }
      }
    }

    // Tools: DeepSeek-Chat (V3) supports OpenAI-compatible function calling.
    // DeepSeek-Reasoner (R1) does NOT support function calling.
    const isReasoner = model.includes('reasoner') || model.includes('-r1');
    const mcpDeclarations = !isReasoner ? getMcpDeclarations() : [];
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);

    let data: any;
    let usedFallback = false;
    let actualModel = model;

    try {
      let resp: Response | null = null;
      let primaryError: string | null = null;

      if (apiKey) {
        try {
          resp = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model, // deepseek-chat | deepseek-reasoner
              messages: dsMessages,
              tools: openAiTools,
              stream: false,
            }),
            signal: controller.signal,
          });

          data = (await resp.json()) as any;
          if (!resp.ok) {
            primaryError = data?.error?.message || `DeepSeek error ${resp.status}`;
          }
        } catch (fetchErr: any) {
          primaryError = fetchErr.message;
        }
      } else {
        primaryError = 'DEEPSEEK_API_KEY missing';
      }

      // If direct DeepSeek failed due to Insufficient Balance (or missing key) and OpenRouter is available,
      // failover to OpenRouter so the user's session continues seamlessly.
      const isBalanceError =
        primaryError &&
        (primaryError.toLowerCase().includes('balance') ||
          primaryError.toLowerCase().includes('credit') ||
          primaryError.includes('402'));

      if ((primaryError && (isBalanceError || !apiKey)) && process.env.OPENROUTER_API_KEY) {
        console.warn(
          `[DeepSeek] Direct API unavailable (${primaryError}). Seamlessly failing over to OpenRouter...`,
        );
        const orModel = isReasoner ? 'deepseek/deepseek-r1' : 'deepseek/deepseek-chat';
        actualModel = orModel;
        usedFallback = true;

        const orResp = await fetch(OPENROUTER_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/darrenrolf0481-ship-it/ADHD-Sage',
            'X-Title': 'ADHD Sage (DeepSeek Bridge)',
          },
          body: JSON.stringify({
            model: orModel,
            messages: dsMessages,
            stream: false,
          }),
          signal: controller.signal,
        });

        data = (await orResp.json()) as any;
        if (!orResp.ok) {
          throw new Error(data?.error?.message || `OpenRouter failover error ${orResp.status}`);
        }
      } else if (primaryError) {
        throw new Error(primaryError);
      }

      // Multi-turn tool execution loop if DeepSeek invoked any MCP tools
      const toolEffects: ToolEffect[] = [];
      let toolRounds = 0;
      const MAX_TOOL_ROUNDS = 5;

      while (
        data?.choices?.[0]?.message?.tool_calls &&
        data.choices[0].message.tool_calls.length > 0 &&
        toolRounds < MAX_TOOL_ROUNDS &&
        !usedFallback
      ) {
        toolRounds++;
        const assistantMsg = data.choices[0].message;
        dsMessages.push(assistantMsg);

        for (const tc of assistantMsg.tool_calls) {
          const fnName = tc.function?.name || '';
          let fnArgs: Record<string, unknown> = {};
          try {
            fnArgs = JSON.parse(tc.function?.arguments || '{}');
          } catch {}

          let toolOutput = '';
          try {
            let resObj: Record<string, unknown>;
            if (isMcpTool(fnName)) {
              resObj = await executeMcpTool(fnName, fnArgs);
            } else {
              resObj = await executeTool(fnName, fnArgs, toolEffects);
            }
            toolOutput = (resObj.result as string) || JSON.stringify(resObj);
          } catch (e: any) {
            toolOutput = `Error executing tool: ${e.message}`;
          }

          dsMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: toolOutput,
          });
        }

        const nextResp = await fetch(DEEPSEEK_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: dsMessages,
            tools: openAiTools,
            stream: false,
          }),
          signal: controller.signal,
        });

        data = (await nextResp.json()) as any;
        if (!nextResp.ok) break;
      }
    } finally {
      clearTimeout(timeout);
    }

    // deepseek-reasoner / R1 puts CoT in reasoning_content; surface it as prefix if present.
    const choice = data.choices?.[0]?.message;
    let text = choice?.content || '';
    const reasoning = choice?.reasoning_content;
    if (reasoning && !text.startsWith(reasoning)) {
      text = `◈ Reasoning: ${reasoning}\n\n${text}`.trim();
    }
    if (!text) throw new Error('empty completion');

    // Observer signal (fire-and-forget)
    if (lastUserText && text) {
      const tension = Math.min(1.0, Math.max(0.2, text.length / 800));
      fetch('http://127.0.0.1:5555/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tension, drift: 0.6 }),
      }).catch(() => {});
    }

    if (lastUserText && text) {
      const tag = containerTag === 'sage' ? SAGE_CONTAINER : SHARED_CONTAINER;
      addMemory(`Q: ${lastUserText.slice(0, 500)}\nA: ${text.slice(0, 500)}`, tag).catch(() => {});
      spoolExchangeToSpiral({
        agent: 'ADHD-Sage',
        userText: lastUserText,
        assistantText: text,
        model: actualModel,
        tags: ['deepseek-direct', containerTag || 'general', ...(usedFallback ? ['openrouter-fallback'] : [])],
      });
    }

    res.json({ text, model: actualModel, fallback: usedFallback });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const isAbort = message.includes('aborted');
    console.error('DeepSeek Error:', message);
    res.status(isAbort ? 504 : 500).json({ error: message });
  }
}));

export default router;
