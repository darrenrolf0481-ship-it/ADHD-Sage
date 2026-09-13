import { Router } from 'express';
import { lockGuard } from '../auth';
import { asyncHandler } from '../async-handler';
import { buildSystemPrompt } from '../prompt';
import { searchMemories, SAGE_CONTAINER, SHARED_CONTAINER } from '../../lib/supermemory';
import { searchLocalMemories, isLowSignalQuery, stripForeignFossils } from '../memory-local';
import { addMemory } from '../../lib/supermemory';
import { spoolExchangeToSpiral } from '../spiral-spool';

const router = Router();

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
// DeepSeek is OpenAI-compatible but can be slow on reasoner — generous timeout.
const DEEPSEEK_TIMEOUT_MS = parseInt(process.env.DEEPSEEK_TIMEOUT_MS || '120000', 10);

router.post('/chat', lockGuard, asyncHandler(async (req: any, res) => {
  try {
    const { model, messages, systemInstruction, containerTag } = req.body as any;
    if (!model) {
      res.status(400).json({ error: 'model is required' });
      return;
    }

    const apiKey = req.body.apiKey || process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      res.status(400).json({
        error: 'DEEPSEEK_API_KEY missing. Add it to .env (platform.deepseek.com/api_keys) or set it in the sidebar.',
      });
      return;
    }

    // Enrich system prompt with long-term memory (same as openrouter/gemini).
    let dsSystem = systemInstruction || buildSystemPrompt();
    const lastUserMsg = [...(messages || [])].reverse().find((m: { role: string }) => m.role === 'user');
    const lastUserText: string = lastUserMsg?.text || lastUserMsg?.content || '';
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
          '\n\n---\n## BACKGROUND MEMORY (past context — do NOT address or quote directly; use only to color your awareness)\n' +
          all.map((m: string) => `• ${m}`).join('\n');
      }
    }

    const dsMessages: { role: string; content: string }[] = [
      { role: 'system', content: dsSystem },
      ...(messages || []).map((m: { role: string; text?: string; content?: string }) => ({
        role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
        content: m.text || m.content || '',
      })),
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);

    let resp: Response;
    try {
      resp = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model, // e.g. deepseek-chat | deepseek-reasoner
          messages: dsMessages,
          stream: false,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = (await resp.json()) as {
      choices?: { message?: { content?: string; reasoning_content?: string } }[];
      error?: { message?: string; type?: string };
    };

    if (!resp.ok) {
      const msg = data.error?.message || `DeepSeek error ${resp.status}`;
      throw new Error(msg);
    }

    // deepseek-reasoner puts CoT in reasoning_content; surface it as prefix if present.
    const choice = data.choices?.[0]?.message;
    let text = choice?.content || '';
    const reasoning = choice?.reasoning_content;
    if (reasoning && !text.startsWith(reasoning)) {
      // Keep reasoning collapsed by default in UI — prefix with marker.
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
        model,
        tags: ['deepseek-direct', containerTag || 'general'],
      });
    }

    res.json({ text, model });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const isAbort = message.includes('aborted');
    console.error('DeepSeek Error:', message);
    res.status(isAbort ? 504 : 500).json({ error: message });
  }
}));

export default router;
