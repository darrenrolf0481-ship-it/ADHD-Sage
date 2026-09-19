import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const htmlPath = path.resolve(process.cwd(), 'index.html');
const ITERATIONS = 1000;
const CONCURRENCY = 50;

async function benchmarkSync() {
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    const template = fs.readFileSync(htmlPath, 'utf-8');
  }
  const duration = performance.now() - start;
  return duration;
}

async function benchmarkAsyncSequential() {
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    const template = await readFile(htmlPath, 'utf-8');
  }
  const duration = performance.now() - start;
  return duration;
}

async function benchmarkAsyncConcurrent() {
  const start = performance.now();
  const batches = ITERATIONS / CONCURRENCY;
  for (let b = 0; b < batches; b++) {
    const promises = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      promises.push(readFile(htmlPath, 'utf-8'));
    }
    await Promise.all(promises);
  }
  const duration = performance.now() - start;
  return duration;
}

// Event loop blocking measurement
async function measureEventLoopBlockingSync() {
  let timerFired = false;
  const timerStart = performance.now();
  setTimeout(() => {
    timerFired = true;
  }, 0);

  const start = performance.now();
  for (let i = 0; i < 500; i++) {
    fs.readFileSync(htmlPath, 'utf-8');
  }
  const syncDuration = performance.now() - start;

  // Measure how late the setTimeout was executed
  const timerDelay = performance.now() - timerStart;
  return { syncDuration, timerDelay };
}

async function measureEventLoopBlockingAsync() {
  let timerFired = false;
  const timerStart = performance.now();
  setTimeout(() => {
    timerFired = true;
  }, 0);

  const start = performance.now();
  const promises = [];
  for (let i = 0; i < 500; i++) {
    promises.push(readFile(htmlPath, 'utf-8'));
  }
  await Promise.all(promises);
  const asyncDuration = performance.now() - start;

  const timerDelay = performance.now() - timerStart;
  return { asyncDuration, timerDelay };
}

async function run() {
  console.log(`=== HTML Template Read Benchmark (${ITERATIONS} ops) ===`);

  // Warmup
  for (let i = 0; i < 50; i++) {
    fs.readFileSync(htmlPath, 'utf-8');
    await readFile(htmlPath, 'utf-8');
  }

  const syncTime = await benchmarkSync();
  console.log(`Sync readFileSync total: ${syncTime.toFixed(2)} ms (${(ITERATIONS / (syncTime / 1000)).toFixed(0)} ops/sec)`);

  const asyncSeqTime = await benchmarkAsyncSequential();
  console.log(`Async readFile (sequential) total: ${asyncSeqTime.toFixed(2)} ms (${(ITERATIONS / (asyncSeqTime / 1000)).toFixed(0)} ops/sec)`);

  const asyncConcTime = await benchmarkAsyncConcurrent();
  console.log(`Async readFile (concurrent batch ${CONCURRENCY}) total: ${asyncConcTime.toFixed(2)} ms (${(ITERATIONS / (asyncConcTime / 1000)).toFixed(0)} ops/sec)`);

  console.log('\n=== Event Loop Blocking Impact (500 ops) ===');
  const syncBlock = await measureEventLoopBlockingSync();
  console.log(`Sync readFileSync: duration = ${syncBlock.syncDuration.toFixed(2)} ms, timer lag = ${syncBlock.timerDelay.toFixed(2)} ms`);

  const asyncBlock = await measureEventLoopBlockingAsync();
  console.log(`Async readFile: duration = ${asyncBlock.asyncDuration.toFixed(2)} ms, timer lag = ${asyncBlock.timerDelay.toFixed(2)} ms`);
}

run().catch(console.error);
