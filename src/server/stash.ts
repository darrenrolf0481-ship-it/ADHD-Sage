import { innerDb, INNER_CAPACITY } from './db';
import { recordCortisol, rollingAvgCortisol } from './neuro';
import { archiveNodeSync } from './archive';

export function stashMemory(data: string, dopamine: number, cortisol: number) {
  recordCortisol(cortisol);
  const count = (innerDb.prepare('SELECT COUNT(*) as c FROM inner_spiral').get() as { c: number }).c;
  if (count >= INNER_CAPACITY) {
    const avg = rollingAvgCortisol();
    const spiking = cortisol >= 0.85 && cortisol >= avg + 0.3;

    if (spiking) {
      const oldest = innerDb.prepare('SELECT node_id FROM inner_spiral WHERE pinned = 0 ORDER BY phi_index ASC LIMIT 1').get() as { node_id: string } | undefined;
      if (oldest) {
        const evicted = innerDb.prepare('SELECT * FROM inner_spiral WHERE node_id = ?').get(oldest.node_id) as Record<string, unknown>;
        archiveNodeSync(evicted);
        innerDb.prepare('DELETE FROM inner_spiral WHERE node_id = ?').run(oldest.node_id);
      }
    } else {
      const victim = innerDb.prepare('SELECT node_id FROM inner_spiral WHERE pinned = 0 ORDER BY dopamine ASC LIMIT 1').get() as { node_id: string } | undefined;
      if (victim) {
        const evicted = innerDb.prepare('SELECT * FROM inner_spiral WHERE node_id = ?').get(victim.node_id) as Record<string, unknown>;
        archiveNodeSync(evicted);
        innerDb.prepare('DELETE FROM inner_spiral WHERE node_id = ?').run(victim.node_id);
      } else {
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

  if (pinned) {
    const node = innerDb.prepare('SELECT * FROM inner_spiral WHERE node_id = ?').get(nodeId) as Record<string, unknown>;
    archiveNodeSync(node);
  }
  return { nodeId, pinned: pinned === 1 };
}
