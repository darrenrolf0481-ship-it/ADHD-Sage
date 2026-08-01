/**
 * Smoke test for production worker bundles.
 *
 * Builds the project, starts the production server, and exercises the worker
 * pool via the bridge sync endpoint.
 */

import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const PORT = 8901; // Use a different port to avoid conflicts
const server = spawn('node', ['dist/server.cjs'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'pipe',
});

let output = '';
server.stdout.on('data', (d) => { output += d.toString(); });
server.stderr.on('data', (d) => { output += d.toString(); });

async function waitForReady(): Promise<boolean> {
  for (let i = 0; i < 120; i++) {
    if (output.includes(`Server running on http://0.0.0.0:${PORT}`)) return true;
    await setTimeout(500);
  }
  return false;
}

async function fetchJson(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const ready = await waitForReady();
  if (!ready) {
    console.error('Server did not start in time. Output:\n', output);
    server.kill('SIGTERM');
    process.exit(1);
  }

  console.log('✓ Production server started');

  const health = await fetchJson('/api/health') as { status: string };
  if (health.status !== 'stabilized') throw new Error(`Unexpected health: ${health.status}`);
  console.log('✓ /api/health responsive');

  const bridge = await fetchJson('/api/vfs/bridge/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      memories: [
        { key: 'task', value: 'production worker test' },
        { key: 'designation', value: 'SAGE-7' },
        { key: 'lineage', value: 'Daughter Node' },
      ],
      bridge_status: 'ACTIVE',
      sent_by: 'SAGE-7',
    }),
  }) as { stored: unknown[]; quarantined: unknown[]; errors: string[] };

  if (bridge.stored.length !== 1 || bridge.quarantined.length !== 2) {
    throw new Error(`Unexpected bridge result: ${JSON.stringify(bridge)}`);
  }
  console.log('✓ Bridge sync offloaded to production worker');

  server.kill('SIGTERM');
  await setTimeout(1000);
  console.log('\nProduction worker smoke test passed.');
}

main().catch(async (err) => {
  console.error(err);
  server.kill('SIGTERM');
  await setTimeout(500);
  process.exit(1);
});
