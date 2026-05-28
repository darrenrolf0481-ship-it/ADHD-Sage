// ─── API Metrics ──────────────────────────────────────────────────────────

const apiMetrics = {
  gemini: {
    totalRequests: 0,
    failedRequests: 0,
    latencies: [] as number[],
    startTime: Date.now()
  },
  ollama: {
    totalRequests: 0,
    failedRequests: 0,
    latencies: [] as number[],
    startTime: Date.now()
  }
};

export function recordMetric(apiName: keyof typeof apiMetrics, latencyMs: number, success: boolean) {
  const metrics = apiMetrics[apiName];
  metrics.totalRequests++;
  if (!success) metrics.failedRequests++;
  metrics.latencies.push(latencyMs);
  if (metrics.latencies.length > 50) metrics.latencies.shift();
}

/** Snapshot of Gemini metrics for the /api/metrics endpoint. */
export function getGeminiMetrics() {
  const gemini = apiMetrics.gemini;
  const avgLatency = gemini.latencies.length
    ? gemini.latencies.reduce((a, b) => a + b, 0) / gemini.latencies.length
    : 0;
  const errorRate = gemini.totalRequests
    ? (gemini.failedRequests / gemini.totalRequests) * 100
    : 0;
  return {
    latencyMs: Math.round(avgLatency),
    errorRate: errorRate.toFixed(2),
    uptimeSeconds: Math.round((Date.now() - gemini.startTime) / 1000),
    totalRequests: gemini.totalRequests
  };
}
