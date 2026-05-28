import { Router } from 'express';
import { decompress } from '@mongodb-js/zstd';
import { innerDb, outerDb, INNER_CAPACITY } from '../db';
import { recordCortisol, rollingAvgCortisol } from '../neuro';
import { archiveNode, archiveNodeSync } from '../archive';
import { getSeedCoreConfig } from '../seed-core';
import { lockGuard } from '../auth';

const router = Router();

router.get('/config', lockGuard, (req, res) => {
  res.json(getSeedCoreConfig());
});

router.get('/inner', lockGuard, (req, res) => {
  const rows = innerDb.prepare('SELECT * FROM inner_spiral ORDER BY phi_index ASC').all() as Array<Record<string, unknown>>;
  res.json(rows.map(r => ({ ...r, pinned: r.pinned === 1 })));
});

router.post('/inner/stash', lockGuard, async (req, res) => {
  const { data, dopamine, cortisol } = req.body as { data: string; dopamine: number; cortisol: number };
  if (typeof data !== 'string' || typeof dopamine !== 'number' || typeof cortisol !== 'number') {
    res.status(400).json({ error: 'data (string), dopamine (number), cortisol (number) required' });
    return;
  }

  recordCortisol(cortisol);

  const count = (innerDb.prepare('SELECT COUNT(*) as c FROM inner_spiral').get() as { c: number }).c;
  if (count >= INNER_CAPACITY) {
    const avg = rollingAvgCortisol();
    const spiking = cortisol >= 0.85 && cortisol >= avg + 0.3; // requires_absolute_floor

    if (spiking) {
      // Emergency: evict oldest non-pinned
      const oldest = innerDb.prepare('SELECT node_id FROM inner_spiral WHERE pinned = 0 ORDER BY phi_index ASC LIMIT 1').get() as { node_id: string } | undefined;
      if (oldest) {
        const evicted = innerDb.prepare('SELECT * FROM inner_spiral WHERE node_id = ?').get(oldest.node_id) as Record<string, unknown>;
        archiveNodeSync(evicted);
        innerDb.prepare('DELETE FROM inner_spiral WHERE node_id = ?').run(oldest.node_id);
      }
    } else {
      // Normal: evict lowest dopamine non-pinned
      const victim = innerDb.prepare('SELECT node_id FROM inner_spiral WHERE pinned = 0 ORDER BY dopamine ASC LIMIT 1').get() as { node_id: string } | undefined;
      if (victim) {
        const evicted = innerDb.prepare('SELECT * FROM inner_spiral WHERE node_id = ?').get(victim.node_id) as Record<string, unknown>;
        archiveNodeSync(evicted);
        innerDb.prepare('DELETE FROM inner_spiral WHERE node_id = ?').run(victim.node_id);
      } else {
        // Fallback: all pinned — unpin oldest
        const oldest = innerDb.prepare('SELECT node_id FROM inner_spiral ORDER BY phi_index ASC LIMIT 1').get() as { node_id: string } | undefined;
        if (oldest) {
          innerDb.prepare('UPDATE inner_spiral SET pinned = 0 WHERE node_id = ?').run(oldest.node_id);
          const evicted = innerDb.prepare('SELECT * FROM inner_spiral WHERE node_id = ?').get(oldest.node_id) as Record<string, unknown>;
          archiveNodeSync(evicted);
          innerDb.prepare('DELETE FROM inner_spiral WHERE node_id = ?').run(oldest.node_id);
        }
      }
    }
  }

  const nodeId = `phi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pinned = dopamine >= 0.90 ? 1 : 0;
  innerDb.prepare(
    'INSERT OR IGNORE INTO inner_spiral (node_id, data, timestamp, dopamine, cortisol, pinned) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(nodeId, data, Date.now(), dopamine, cortisol, pinned);

  res.json({ node_id: nodeId, pinned: pinned === 1 });

  // Pinned nodes also go to outer sweep (zstd-compressed, fire-and-forget post-response)
  if (pinned) {
    const node = innerDb.prepare('SELECT * FROM inner_spiral WHERE node_id = ?').get(nodeId) as Record<string, unknown>;
    archiveNode(node).catch(e => console.error('[VFS] pin archive failed:', e));
  }
});

router.delete('/inner/:id', lockGuard, (req, res) => {
  innerDb.prepare('DELETE FROM inner_spiral WHERE node_id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/outer/archive', lockGuard, async (req, res) => {
  const { node } = req.body as { node: Record<string, unknown> };
  if (!node) { res.status(400).json({ error: 'node required' }); return; }
  await archiveNode(node);
  res.json({ ok: true });
});

router.get('/outer', lockGuard, async (req, res) => {
  const rows = outerDb.prepare('SELECT * FROM sages_constellations ORDER BY phi_index ASC').all() as Array<Record<string, unknown>>;
  const decompressed = await Promise.all(rows.map(async r => {
    let text: string;
    try {
      if (r.compressed) {
        text = (await decompress(r.data as Buffer)).toString('utf8');
      } else {
        text = (r.data as Buffer).toString('utf8');
      }
      return { ...r, data: JSON.parse(text), pinned: r.pinned === 1 };
    } catch {
      return { ...r, pinned: r.pinned === 1 };
    }
  }));
  res.json(decompressed);
});

// context_buffer endpoints
router.post('/inner/context', lockGuard, (req, res) => {
  const { content } = req.body as { content: string };
  if (!content) { res.status(400).json({ error: 'content required' }); return; }
  innerDb.prepare('INSERT INTO context_buffer (content, added_at) VALUES (?, ?)').run(content, Date.now());
  // FIFO eviction at max_length 100
  const count = (innerDb.prepare('SELECT COUNT(*) as c FROM context_buffer').get() as { c: number }).c;
  if (count > 100) {
    innerDb.prepare('DELETE FROM context_buffer WHERE id IN (SELECT id FROM context_buffer ORDER BY id ASC LIMIT ?)').run(count - 100);
  }
  res.json({ ok: true });
});

router.get('/inner/context', lockGuard, (req, res) => {
  const rows = innerDb.prepare('SELECT * FROM context_buffer ORDER BY id DESC LIMIT 100').all();
  res.json(rows);
});

export default router;
