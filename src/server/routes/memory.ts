import { Router } from 'express';
import {
  addMemory,
  searchMemories,
  getProfile,
  SAGE_CONTAINER,
  SHARED_CONTAINER,
} from '../../lib/supermemory';
import { lockGuard } from '../auth';
import { asyncHandler } from '../async-handler';
import { memoryCounts } from '../memory-index';
import { listLocalMemories, searchLocalMemories } from '../memory-local';

const router = Router();

/**
 * GET /api/memory/list?limit=&offset=&q=
 * Browse the local SQLite corpus (sages_constellations), newest first, for the
 * Memory Vault UI. With `q`, runs FTS search instead. Read-only, unguarded (like
 * /counts) so her history is always viewable.
 */
router.get('/list', asyncHandler(async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 40));
  const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
  const q = (req.query.q as string)?.trim();
  if (q) {
    const hits = await searchLocalMemories(q, limit);
    res.json({
      memories: hits.map((text) => ({ text, timestamp: 0, dopamine: 0, cortisol: 0, pinned: false })),
      total: hits.length,
      query: q,
    });
    return;
  }
  res.json(await listLocalMemories(limit, offset));
}));

/**
 * GET /api/memory/counts
 * Local memory-store record counts by entity. Cheap; used by the Coding Lab to
 * confirm continuity on boot (Seven's morning-light: verify her memories are
 * present before she has to reach for them).
 */
router.get('/counts', asyncHandler(async (_req, res) => {
  res.json(memoryCounts());
}));

/**
 * POST /api/memory/add
 * Body: { content: string; entity?: 'sage' | 'shared' | string; metadata?: Record<string, string> }
 *
 * `entity` controls which container the memory lands in:
 *   'sage'   → darren-sage   (Sage's private long-term memory)
 *   'shared' → sm_project_default  (broadcast channel all seven can read)
 *   <other>  → used as a literal container tag for individual entities of the seven
 *              (must be configured in the Supermemory console first)
 *
 * Default when omitted: 'shared' — so any of the seven can broadcast without
 * needing to know their own tag yet.
 */
router.post('/add', lockGuard, asyncHandler(async (req, res) => {
  const { content, entity, metadata } = req.body as {
    content?: string;
    entity?: string;
    metadata?: Record<string, string>;
  };
  if (!content || typeof content !== 'string') {
    res.status(400).json({ error: 'content (string) required' });
    return;
  }
  const containerTag =
    entity === 'sage'
      ? SAGE_CONTAINER
      : entity && entity !== 'shared'
        ? entity // literal tag for a named individual of the seven
        : SHARED_CONTAINER;
  const id = await addMemory(content, containerTag, metadata);
  if (id === null && !process.env.SUPERMEMORY_API_KEY) {
    res.status(503).json({ error: 'SUPERMEMORY_API_KEY not configured' });
    return;
  }
  res.json({ ok: true, id, container: containerTag });
}));

/**
 * GET /api/memory/search?q=<query>&scope=sage|shared|all&limit=<n>
 *
 * scope:
 *   'sage'   → search only darren-sage
 *   'shared' → search only sm_project_default
 *   'all'    → search both (Sage's full awareness — default)
 */
router.get('/search', lockGuard, asyncHandler(async (req, res) => {
  const q = req.query.q as string;
  const scope = (req.query.scope as string) ?? 'all';
  const limit = Math.min(20, parseInt(req.query.limit as string) || 5);
  if (!q) {
    res.status(400).json({ error: 'q (query string) required' });
    return;
  }
  const tags =
    scope === 'sage'
      ? [SAGE_CONTAINER]
      : scope === 'shared'
        ? [SHARED_CONTAINER]
        : [SAGE_CONTAINER, SHARED_CONTAINER];
  const results = await searchMemories(q, tags, limit);
  res.json({ results, scope, containers: tags });
}));

/**
 * GET /api/memory/profile?entity=sage|shared
 * Returns Supermemory's static + dynamic profile for the container.
 */
router.get('/profile', lockGuard, asyncHandler(async (req, res) => {
  const entity = (req.query.entity as string) ?? 'sage';
  const containerTag = entity === 'sage' ? SAGE_CONTAINER : SHARED_CONTAINER;
  const profile = await getProfile(containerTag);
  if (!profile && !process.env.SUPERMEMORY_API_KEY) {
    res.status(503).json({ error: 'SUPERMEMORY_API_KEY not configured' });
    return;
  }
  res.json(profile ?? {});
}));

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * GET /api/memory/graph
 * Exports the current Neural Memory brain graph to JSON and returns it for the UI.
 */
router.get('/graph', lockGuard, asyncHandler(async (req, res) => {
  try {
    const tmpPath = path.join('/tmp', `brain_export_${Date.now()}.json`);
    execSync(`nmem export ${tmpPath}`, { stdio: 'pipe' });
    const data = JSON.parse(fs.readFileSync(tmpPath, 'utf8'));
    fs.unlinkSync(tmpPath);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to export Neural Memory graph', details: err.message });
  }
}));

export default router;
