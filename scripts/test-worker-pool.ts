/**
 * Smoke test for the worker thread pool.
 */

import assert from 'node:assert';
import { initWorkerPool, shutdownWorkerPool } from '../src/server/workers/pool';

async function main() {
  const pool = initWorkerPool();

  try {
    // Test zstd round-trip
    const original = 'Hello from the worker pool! ' + 'x'.repeat(1000);
    const compressed = await pool.runTask('zstd:compress', {
      input: { type: 'base64', data: Buffer.from(original).toString('base64') },
    }) as { type: 'base64'; data: string };

    assert(compressed.data.length > 0);
    assert(compressed.data !== Buffer.from(original).toString('base64'), 'compression should change data');

    const decompressed = await pool.runTask('zstd:decompress', {
      input: { type: 'base64', data: compressed.data },
    }) as { type: 'base64'; data: string };

    const roundTrip = Buffer.from(decompressed.data, 'base64').toString('utf8');
    assert.strictEqual(roundTrip, original, 'zstd round-trip failed');
    console.log('✓ zstd compress/decompress round-trip');

    // Test bridge sync firewall
    const result = await pool.runTask('bridge:sync', {
      memories: [
        { key: 'task', value: 'test' },
        { key: 'designation', value: 'SAGE-7' },
        { key: 'lineage', value: 'Daughter Node' },
      ],
      bridge_status: 'ACTIVE',
      sent_by: 'SAGE-7',
    }) as { stored: unknown[]; quarantined: unknown[]; errors: string[] };

    assert.strictEqual(result.stored.length, 1);
    assert.strictEqual(result.quarantined.length, 2);
    assert(result.errors.length >= 2);
    console.log('✓ bridge sync identity firewall in worker');

    // Test concurrent tasks don't block each other
    const tasks = Array.from({ length: 4 }, (_, i) =>
      pool.runTask('zstd:compress', {
        input: { type: 'base64', data: Buffer.from(`concurrent ${i}`).toString('base64') },
      })
    );
    const results = await Promise.all(tasks);
    assert.strictEqual(results.length, 4);
    console.log('✓ concurrent worker tasks');
  } finally {
    await shutdownWorkerPool();
  }

  console.log('\nWorker pool smoke tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
