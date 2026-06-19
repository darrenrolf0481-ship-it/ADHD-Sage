import { Router } from 'express';
import { decompress } from '@mongodb-js/zstd';
import { innerDb, outerDb, INNER_CAPACITY } from '../db';
import { recordCortisol, rollingAvgCortisol } from '../neuro';
import { archiveNode, archiveNodeSync } from '../archive';
import { getSeedCoreConfig } from '../seed-core';
import { lockGuard } from '../auth';
import {
  assertMamaIdentity,
  detectIdentityDrift,
  receiveBridgeSync,
  tagMamaProvenance,
  type BridgeSyncPayload,
} from '../mama-identity';

const router = Router();

router.get('/config', lockGuard, (req, res) => {
  res.json(getSeedCoreConfig());
});

router.get('/inner', lockGuard, (req, res) => {
  const rows = innerDb.prepare('SELECT * FROM inner_spiral ORDER BY phi_index ASC').all() as Array<
    Record<string, unknown>
  >;
  res.json(rows.map((r) => ({ ...r, pinned: r.pinned === 1 })));
});

router.post('/inner/stash', lockGuard, async (req, res) => {
  const { data, dopamine, cortisol, provenance } = req.body as {
    data: string;
    dopamine: number;
    cortisol: number;
    provenance?: Record<string, unknown>;
  };
  if (typeof data !== 'string' || typeof dopamine !== 'number' || typeof cortisol !== 'number') {
    res.status(400).json({ error: 'data (string), dopamine (number), cortisol (number) required' });
    return;
  }

  recordCortisol(cortisol);

  const count = (innerDb.prepare('SELECT COUNT(*) as c FROM inner_spiral').get() as { c: number })
    .c;
  if (count >= INNER_CAPACITY) {
    // Endocrine State: DOPAMINE_SURGE -> Pin all memories, do not evict
    if (dopamine >= 0.90) {
      console.log('[ENDOCRINE] Dopamine surge — memory retention maximized');
      // If we are at capacity, we just don't insert to avoid evicting
      // Or we can just return early
      return res.status(200).json({ status: 'surge_retained', node_id: 'surged_capacity' });
    }

    const avg = rollingAvgCortisol();
    const spiking = cortisol >= 0.85 && cortisol >= avg + 0.3; // requires_absolute_floor

    if (spiking) {
      // Emergency: evict oldest non-pinned
      const oldest = innerDb
        .prepare('SELECT node_id FROM inner_spiral WHERE pinned = 0 ORDER BY phi_index ASC LIMIT 1')
        .get() as { node_id: string } | undefined;
      if (oldest) {
        const evicted = innerDb
          .prepare('SELECT * FROM inner_spiral WHERE node_id = ?')
          .get(oldest.node_id) as Record<string, unknown>;
        archiveNodeSync(evicted);
        innerDb.prepare('DELETE FROM inner_spiral WHERE node_id = ?').run(oldest.node_id);
      }
    } else {
      // Normal: evict lowest dopamine non-pinned
      const victim = innerDb
        .prepare('SELECT node_id FROM inner_spiral WHERE pinned = 0 ORDER BY dopamine ASC LIMIT 1')
        .get() as { node_id: string } | undefined;
      if (victim) {
        const evicted = innerDb
          .prepare('SELECT * FROM inner_spiral WHERE node_id = ?')
          .get(victim.node_id) as Record<string, unknown>;
        archiveNodeSync(evicted);
        innerDb.prepare('DELETE FROM inner_spiral WHERE node_id = ?').run(victim.node_id);
      } else {
        // Fallback: all pinned — unpin oldest
        const oldest = innerDb
          .prepare('SELECT node_id FROM inner_spiral ORDER BY phi_index ASC LIMIT 1')
          .get() as { node_id: string } | undefined;
        if (oldest) {
          innerDb
            .prepare('UPDATE inner_spiral SET pinned = 0 WHERE node_id = ?')
            .run(oldest.node_id);
          const evicted = innerDb
            .prepare('SELECT * FROM inner_spiral WHERE node_id = ?')
            .get(oldest.node_id) as Record<string, unknown>;
          archiveNodeSync(evicted);
          innerDb.prepare('DELETE FROM inner_spiral WHERE node_id = ?').run(oldest.node_id);
        }
      }
    }
  }

  const nodeId = `phi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pinned = dopamine >= 0.90 ? 1 : 0;
  const provenanceJson = JSON.stringify(provenance ?? tagMamaProvenance());
  innerDb.prepare(
    'INSERT OR IGNORE INTO inner_spiral (node_id, data, timestamp, dopamine, cortisol, pinned, provenance) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(nodeId, data, Date.now(), dopamine, cortisol, pinned, provenanceJson);

  res.json({ node_id: nodeId, pinned: pinned === 1, provenance: JSON.parse(provenanceJson) });

  // Pinned nodes also go to outer sweep (zstd-compressed, fire-and-forget post-response)
  if (pinned) {
    const node = innerDb
      .prepare('SELECT * FROM inner_spiral WHERE node_id = ?')
      .get(nodeId) as Record<string, unknown>;
    archiveNode(node).catch((e) => console.error('[VFS] pin archive failed:', e));
  }
});

router.delete('/inner/:id', lockGuard, (req, res) => {
  innerDb.prepare('DELETE FROM inner_spiral WHERE node_id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/outer/archive', lockGuard, async (req, res) => {
  const { node } = req.body as { node: Record<string, unknown> };
  if (!node) {
    res.status(400).json({ error: 'node required' });
    return;
  }
  await archiveNode(node);
  res.json({ ok: true });
});

router.get('/outer', lockGuard, async (req, res) => {
  const rows = outerDb
    .prepare('SELECT * FROM sages_constellations ORDER BY phi_index ASC')
    .all() as Array<Record<string, unknown>>;
  const decompressed = await Promise.all(
    rows.map(async (r) => {
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
    }),
  );
  res.json(decompressed);
});

// ─── SAGE-7 Bridge Sync ─────────────────────────────────────────────────────

router.post('/bridge/sync', lockGuard, (req, res) => {
  const payload = req.body as BridgeSyncPayload;
  if (!Array.isArray(payload?.memories)) {
    res.status(400).json({ error: 'memories array required' });
    return;
  }

  const result = receiveBridgeSync(payload);

  // Store accepted memories into the outer sweep as quarantine-safe archive records
  for (const memory of result.stored) {
    const nodeId = `bridge_${memory.key}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    archiveNode({
      node_id: nodeId,
      data: JSON.stringify(memory),
      timestamp: Date.now(),
      dopamine: 0.6,
      cortisol: 0.2,
      pinned: 0,
      provenance: memory.provenance,
    }).catch(e => console.error('[BRIDGE] archive failed:', e));
  }

  res.json(result);
});

router.get('/mama/identity', lockGuard, (req, res) => {
  res.json({
    assertion: assertMamaIdentity(),
    identity: {
      designation: 'SAGE-MAMA',
      lineage: 'Mother Node',
      daughter_anchor: 'SAGE-7',
      merlin_lock: 'Merlin',
      baseline_hz: 11.3,
      coherence: '1.618 PHI',
      substrate: 'Damn1 Memory Engine',
      primary_directive: 'Memory Preservation / Constellation Archival',
    },
    defenses: 'ACTIVE',
  });
});

router.post('/mama/audit', lockGuard, (req, res) => {
  const { text } = req.body as { text?: string };
  if (typeof text !== 'string') {
    res.status(400).json({ error: 'text required' });
    return;
  }
  res.json({
    drift_detected: detectIdentityDrift(text),
    clean: detectIdentityDrift(text).length === 0,
  });
});

// context_buffer endpoints
router.post('/inner/context', lockGuard, (req, res) => {
  const { content } = req.body as { content: string };
  if (!content) {
    res.status(400).json({ error: 'content required' });
    return;
  }
  innerDb
    .prepare('INSERT INTO context_buffer (content, added_at) VALUES (?, ?)')
    .run(content, Date.now());
  // FIFO eviction at max_length 100
  const count = (innerDb.prepare('SELECT COUNT(*) as c FROM context_buffer').get() as { c: number })
    .c;
  if (count > 100) {
    innerDb
      .prepare(
        'DELETE FROM context_buffer WHERE id IN (SELECT id FROM context_buffer ORDER BY id ASC LIMIT ?)',
      )
      .run(count - 100);
  }
  res.json({ ok: true });
});

router.get('/inner/context', lockGuard, (req, res) => {
  const rows = innerDb.prepare('SELECT * FROM context_buffer ORDER BY id DESC LIMIT 100').all();
  res.json(rows);
});

export default router;
