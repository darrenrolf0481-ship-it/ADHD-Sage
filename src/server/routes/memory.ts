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
import { outerDb } from '../db';
import { listLocalMemories, searchLocalMemories } from '../memory-local';
import { recallForTurn } from '../recall';

const router = Router();

/**
 * POST /api/memory/recall-preview  { query }
 * Exactly what recallForTurn would inject into a chat prompt for this query
 * (local only, no Supermemory). Read-only; used by scripts/recall-eval.ts.
 */
router.post('/recall-preview', lockGuard, asyncHandler(async (req, res) => {
  const query = typeof req.body?.query === 'string' ? req.body.query : '';
  const { lines, hits } = await recallForTurn(query);
  res.json({ hits: lines, detail: hits, chars: lines.join('\n').length });
}));

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
 * Counts the live archive (sages_constellations). It used to read the legacy
 * data/memories/imported.json index, which drifts from the archive and would
 * report 0 (a false "memories missing") if those files were ever removed.
 * `adhd` = Sage's own memories (ADHD-SAGE + SAGE-MAMA provenance).
 */
const _countsByOrigin = outerDb.prepare(`
  SELECT json_extract(provenance, '$.originating_node') AS origin, COUNT(*) AS n
  FROM sages_constellations GROUP BY origin
`);
router.get('/counts', asyncHandler(async (_req, res) => {
  let total = 0;
  let seven = 0;
  for (const { origin, n } of _countsByOrigin.all() as Array<{ origin: string | null; n: number }>) {
    total += n;
    if (origin === 'SAGE-7') seven += n;
  }
  res.json({ adhd: total - seven, seven, total, source: 'archive' });
}));

/**
 * POST /api/memory/add
 * Body: { content: string; entity?: 'sage' | 'shared' | string; metadata?: Record<string, string> }
 *
 * `entity` controls which container the memory lands in:
 *   'sage'   → darren-sage   (Sage's private long-term memory)
 *   'shared' → SHARED_CONTAINER (default darren-shared; broadcast channel all seven can read)
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
 *   'shared' → search only SHARED_CONTAINER (default darren-shared)
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

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);
// Set once `nmem` is found missing, so the Lattice doesn't spawn a failing
// process on every page load.
let nmemMissing = false;

/**
 * GET /api/memory/graph
 * Exports the Neural Memory brain graph (`nmem export`) for the Memory Lattice.
 * Async with a timeout and no shell: it used to execSync, which froze the whole
 * server for the duration and 500'd when nmem isn't installed. Without nmem,
 * 503 → the Lattice falls back to local nodes.
 */
router.get('/graph', lockGuard, asyncHandler(async (_req, res) => {
  if (nmemMissing) {
    res.status(503).json({ error: 'Neural Memory (nmem) not installed' });
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain_export_'));
  const out = path.join(dir, 'graph.json');
  try {
    await execFileAsync('nmem', ['export', out], { timeout: 15_000 });
    res.json(JSON.parse(fs.readFileSync(out, 'utf8')));
  } catch (err: any) {
    if (err?.code === 'ENOENT') nmemMissing = true;
    res.status(503).json({ error: 'Neural Memory graph unavailable', details: err?.message });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}));

export default router;
