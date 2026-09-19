import fs from 'fs';
import path from 'path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const filePath = path.join(dataDir, 'chat_session_benchmark.json');

const sampleState = {
  session_id: 'test-session-12345',
  created_at: Date.now(),
  messages: Array.from({ length: 500 }, (_, i) => ({
    id: `msg-${i}`,
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `This is a test message ${i} with simulated conversation payload for performance benchmarking.`,
    timestamp: Date.now() - i * 1000,
  })),
};
fs.writeFileSync(filePath, JSON.stringify(sampleState, null, 2), 'utf8');

async function syncRouteHandler() {
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch {
      /* ignore */
    }
  }
  return {};
}

async function asyncRouteHandler() {
  if (fs.existsSync(filePath)) {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch {
      /* ignore */
    }
  }
  return {};
}

async function benchmarkHandler(handler: () => Promise<any>, name: string, requests: number) {
  let eventLoopTicks = 0;
  const tickTimer = setInterval(() => {
    eventLoopTicks++;
  }, 1);

  const start = performance.now();
  const latencies: number[] = [];

  for (let i = 0; i < requests; i++) {
    const reqStart = performance.now();
    await handler();
    latencies.push(performance.now() - reqStart);
  }

  const totalDuration = performance.now() - start;
  clearInterval(tickTimer);

  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  console.log(`\n=== Benchmark: ${name} ===`);
  console.log(`Total duration for ${requests} requests: ${totalDuration.toFixed(2)} ms`);
  console.log(`Average request latency: ${avgLatency.toFixed(3)} ms`);
  console.log(`Event loop ticks processed during test: ${eventLoopTicks}`);
  return { totalDuration, avgLatency, eventLoopTicks };
}

async function main() {
  try {
    const numRequests = 200;
    const syncResult = await benchmarkHandler(syncRouteHandler, 'Sync (fs.readFileSync)', numRequests);
    const asyncResult = await benchmarkHandler(asyncRouteHandler, 'Async (fs.promises.readFile)', numRequests);

    console.log('\n=== Summary ===');
    console.log(`Sync handler avg latency: ${syncResult.avgLatency.toFixed(3)} ms`);
    console.log(`Async handler avg latency: ${asyncResult.avgLatency.toFixed(3)} ms`);
  } finally {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

main().catch(console.error);
