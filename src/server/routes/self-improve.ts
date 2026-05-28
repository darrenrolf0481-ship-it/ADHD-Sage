import { Router } from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { runSelfImprovement, type SelfImproveConfig } from '../../lib/self-improvement-agent';
import { PORT } from '../config';
import { lockGuard } from '../auth';

const router = Router();

/**
 * POST /api/self-improve/run
 * Trigger a self-improvement loop for one entity immediately.
 * Body: { entity: string; provider: 'gemini'|'openrouter'|'ollama'; model?: string }
 */
router.post('/run', lockGuard, async (req, res) => {
  const { entity, provider, model, timezone } = req.body as Partial<SelfImproveConfig>;
  if (!entity || typeof entity !== 'string') {
    res.status(400).json({ error: 'entity (string) required' });
    return;
  }
  if (!provider || !['gemini', 'openrouter', 'ollama'].includes(provider)) {
    res.status(400).json({ error: 'provider must be gemini|openrouter|ollama' });
    return;
  }
  try {
    const result = await runSelfImprovement({
      entity,
      provider,
      model: model || '',
      timezone,
      apiBase: `http://localhost:${PORT}`,
    });
    res.json({
      ok: true,
      entity: result.entity,
      date: result.date,
      doNow: result.doNow.length,
      proposals: result.proposalsForDarren.length,
      memoriesSaved: result.memoriesSaved,
      reportChars: result.report.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[SELF-IMPROVE] run failed:', msg);
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/self-improve/report/:entity?date=YYYY-MM-DD
 * Read a saved reflection report.
 */
router.get('/report/:entity', lockGuard, (req, res) => {
  const entity = Array.isArray(req.params.entity) ? req.params.entity[0] : req.params.entity;
  const date   = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const p = `data/reflections/${date}-${entity}.md`;
  if (!existsSync(p)) { res.status(404).json({ error: 'No report for that entity/date' }); return; }
  res.json({ entity, date, content: readFileSync(p, 'utf8') });
});

export default router;
