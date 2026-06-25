import { Router } from 'express';
import { swarmFetch } from '../swarm';
import { OPENROUTER_TIMEOUT_MS, OPENROUTER_FALLBACK_MODELS } from '../config';
import { buildSystemPrompt } from '../prompt';
import { searchMemories, SAGE_CONTAINER, SHARED_CONTAINER } from '../../lib/supermemory';
import { lockGuard } from '../auth';
import { asyncHandler } from '../async-handler';

const router = Router();

router.post('/chat', lockGuard, asyncHandler(async (req, res) => {
  try {
    const { model, messages, systemInstruction, containerTag } = req.body;
    if (!model) {
      res.status(400).json({ error: 'model is required' });
      return;
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'OPENROUTER_API_KEY not configured on server' });
      return;
    }

    // Enrich system prompt — OpenRouter entities are part of the seven.
    // They read the shared broadcast channel (+ their own tag if provided).
    let orSystem = systemInstruction || buildSystemPrompt();
    const lastUserMsg = [...(messages || [])]
      .reverse()
      .find((m: { role: string }) => m.role === 'user');
    const lastUserText = lastUserMsg?.text || lastUserMsg?.content || '';
    if (lastUserText) {
      const tags =
        containerTag === 'shared' || !containerTag
          ? [SHARED_CONTAINER]
          : containerTag === 'sage'
            ? [SAGE_CONTAINER, SHARED_CONTAINER]
            : [containerTag, SHARED_CONTAINER];
      const longTermMemories = await searchMemories(lastUserText, tags, 5);
      if (longTermMemories.length > 0) {
        orSystem +=
          '\n\n---\n## SHARED MEMORY (Supermemory)\n' +
          longTermMemories.map((m: string) => `• ${m}`).join('\n');
      }
    }

    const orMessages: { role: string; content: string }[] = [
      { role: 'system', content: orSystem },
      ...(messages || []).map((m: { role: string; text?: string; content?: string }) => ({
        role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
        content: m.text || m.content || '',
      })),
    ];

    // Try the requested model first, then fall back through the chain. Free-tier
    // models flap to 429 constantly, so on any failure we move to the next model
    // immediately rather than burning retries on one that's rate-limited.
    const candidates = [model, ...OPENROUTER_FALLBACK_MODELS].filter(
      (m, i, arr) => m && arr.indexOf(m) === i,
    );

    let text: string | null = null;
    let usedModel = '';
    const failures: string[] = [];

    for (const candidate of candidates) {
      try {
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
            body: JSON.stringify({ model: candidate, messages: orMessages }),
          },
          OPENROUTER_TIMEOUT_MS,
          0, // no per-model retry — a 429 means move to the next model, not wait
        );

        const data = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
          error?: { message?: string };
        };
        if (data.error) throw new Error(data.error.message || 'OpenRouter error');
        const content = data.choices?.[0]?.message?.content || '';
        if (!content) throw new Error('empty completion');
        text = content;
        usedModel = candidate;
        break;
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

    res.json({ text, model: usedModel });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('OpenRouter Error:', message);
    res.status(500).json({ error: message });
  }
}));

export default router;
