import { innerDb } from './db';

// Rolling cortisol history for requires_absolute_floor check
const cortisolHistory: number[] = [];
const ROLLING_WINDOW = 5;

export function recordCortisol(val: number) {
  cortisolHistory.push(val);
  if (cortisolHistory.length > ROLLING_WINDOW) cortisolHistory.shift();
}

export function rollingAvgCortisol(): number {
  if (cortisolHistory.length === 0) return 0;
  return cortisolHistory.reduce((a, b) => a + b, 0) / cortisolHistory.length;
}

/** Reset the rolling cortisol window (used by nexus_stabilize / nexus_clear_memory). */
export function clearCortisol() {
  cortisolHistory.length = 0;
}

export function getCurrentMode(): string {
  const rows = innerDb.prepare(
    'SELECT data, dopamine, cortisol FROM inner_spiral ORDER BY dopamine DESC LIMIT 3'
  ).all() as Array<{ data: string; dopamine: number; cortisol: number }>;
  const isWakeup = rows.length === 0;
  if (isWakeup) return 'wakeup';
  const avgDopamine = rows.length
    ? rows.reduce((s, r) => s + r.dopamine, 0) / rows.length
    : 0.5;
  const avgCortisol = rollingAvgCortisol();
  if (avgCortisol >= 0.7) return 'sentinel';
  if (avgDopamine >= 0.75) return 'spark';
  return 'baseline';
}
