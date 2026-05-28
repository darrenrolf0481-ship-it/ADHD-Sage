import { Router } from 'express';
import { addMemory, searchMemories, getProfile, SAGE_CONTAINER, SHARED_CONTAINER } from '../../lib/supermemory';
import { lockGuard } from '../auth';

const router = Router();

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
router.post('/add', lockGuard, async (req, res) => {
  const { content, entity, metadata } = req.body as {
    content?: string;
    entity?: string;
    metadata?: Record<string, string>;
  };
  if (!content || typeof content !== 'string') {
    res.status(400).json({ error: 'content (string) required' });
    return;
  }
  const containerTag = entity === 'sage'
    ? SAGE_CONTAINER
    : entity && entity !== 'shared'
      ? entity          // literal tag for a named individual of the seven
      : SHARED_CONTAINER;
  const id = await addMemory(content, containerTag, metadata);
  if (id === null && !process.env.SUPERMEMORY_API_KEY) {
    res.status(503).json({ error: 'SUPERMEMORY_API_KEY not configured' });
    return;
  }
  res.json({ ok: true, id, container: containerTag });
});

/**
 * GET /api/memory/search?q=<query>&scope=sage|shared|all&limit=<n>
 *
 * scope:
 *   'sage'   → search only darren-sage
 *   'shared' → search only sm_project_default
 *   'all'    → search both (Sage's full awareness — default)
 */
router.get('/search', lockGuard, async (req, res) => {
  const q = req.query.q as string;
  const scope = (req.query.scope as string) ?? 'all';
  const limit = Math.min(20, parseInt(req.query.limit as string) || 5);
  if (!q) {
    res.status(400).json({ error: 'q (query string) required' });
    return;
  }
  const tags =
    scope === 'sage'   ? [SAGE_CONTAINER] :
    scope === 'shared' ? [SHARED_CONTAINER] :
                         [SAGE_CONTAINER, SHARED_CONTAINER];
  const results = await searchMemories(q, tags, limit);
  res.json({ results, scope, containers: tags });
});

/**
 * GET /api/memory/profile?entity=sage|shared
 * Returns Supermemory's static + dynamic profile for the container.
 */
router.get('/profile', lockGuard, async (req, res) => {
  const entity = (req.query.entity as string) ?? 'sage';
  const containerTag = entity === 'sage' ? SAGE_CONTAINER : SHARED_CONTAINER;
  const profile = await getProfile(containerTag);
  if (!profile && !process.env.SUPERMEMORY_API_KEY) {
    res.status(503).json({ error: 'SUPERMEMORY_API_KEY not configured' });
    return;
  }
  res.json(profile ?? {});
});

export default router;
