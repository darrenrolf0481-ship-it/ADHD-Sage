import { Router } from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { writeJournalEntry, type JournalConfig } from '../../lib/journal-agent';
import { PORT } from '../config';
import { lockGuard } from '../auth';

const router = Router();

/**
 * POST /api/journal/write
 * Triggers a journal entry for one entity.
 * Body: { entity: string; provider: 'gemini'|'openrouter'|'ollama'; model?: string; timezone?: string }
 *
 * The server's own port is used as apiBase so the journal agent can call the
 * existing LLM routes — no duplication of API logic.
 */
router.post('/write', lockGuard, async (req, res) => {
  const { entity, provider, model, timezone } = req.body as Partial<JournalConfig>;
  if (!entity || typeof entity !== 'string') {
    res.status(400).json({ error: 'entity (string) required' });
    return;
  }
  if (!provider || !['gemini', 'openrouter', 'ollama'].includes(provider)) {
    res.status(400).json({ error: 'provider must be gemini|openrouter|ollama' });
    return;
  }

  try {
    const entry = await writeJournalEntry({
      entity,
      provider,
      model: model || (provider === 'gemini' ? 'gemini-2.5-flash' : ''),
      timezone,
      apiBase: `http://localhost:${PORT}`,
    });
    res.json({
      ok: true,
      entity: entry.entity,
      date: entry.date,
      chars: entry.content.length,
      hasMessageForDarren: !!entry.forDarren,
      insights: entry.insights?.length ?? 0,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[JOURNAL] write failed:', msg);
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/journal/:entity?date=YYYY-MM-DD
 * Read a journal entry for an entity (defaults to today).
 */
router.get('/:entity', lockGuard, (req, res) => {
  const entity = req.params.entity;
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const entryPath = `data/journal/${entity}/${date}.md`;
  if (!existsSync(entryPath)) {
    res.status(404).json({ error: 'No entry for that entity/date' });
    return;
  }
  res.json({ entity, date, content: readFileSync(entryPath, 'utf8') });
});

export default router;
