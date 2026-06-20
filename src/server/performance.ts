/**
 * Lightweight performance telemetry for modulation work.
 *
 * Tracks span durations across the heaviest synchronous/blocking paths so we can
 * measure before/after impact of worker-thread offload.
 */

export interface PerformanceSpan {
  name: string;
  durationMs: number;
  startedAt: number;
  endedAt: number;
  meta?: Record<string, unknown>;
}

const MAX_SPANS = 500;
const spans: PerformanceSpan[] = [];

export function startSpan(name: string, meta?: Record<string, unknown>): () => PerformanceSpan {
  const startedAt = performance.now();
  return () => {
    const endedAt = performance.now();
    const span: PerformanceSpan = {
      name,
      durationMs: endedAt - startedAt,
      startedAt,
      endedAt,
      meta,
    };
    spans.push(span);
    if (spans.length > MAX_SPANS) spans.shift();
    return span;
  };
}

export async function timed<T>(
  name: string,
  fn: () => Promise<T>,
  meta?: Record<string, unknown>
): Promise<T> {
  const end = startSpan(name, meta);
  try {
    return await fn();
  } finally {
    end();
  }
}

export function getSpans(): PerformanceSpan[] {
  return [...spans];
}

export function getAggregates(): Record<string, { count: number; totalMs: number; avgMs: number; maxMs: number }> {
  const buckets: Record<string, { count: number; totalMs: number; maxMs: number }> = {};
  for (const span of spans) {
    const b = buckets[span.name] ?? { count: 0, totalMs: 0, maxMs: 0 };
    b.count++;
    b.totalMs += span.durationMs;
    b.maxMs = Math.max(b.maxMs, span.durationMs);
    buckets[span.name] = b;
  }

  const out: Record<string, { count: number; totalMs: number; avgMs: number; maxMs: number }> = {};
  for (const [name, b] of Object.entries(buckets)) {
    out[name] = {
      count: b.count,
      totalMs: Math.round(b.totalMs * 100) / 100,
      avgMs: Math.round((b.totalMs / b.count) * 100) / 100,
      maxMs: Math.round(b.maxMs * 100) / 100,
    };
  }
  return out;
}

export function clearSpans(): void {
  spans.length = 0;
}
