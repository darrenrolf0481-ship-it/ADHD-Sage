/**
 * Bundle worker entry files for production.
 *
 * The main server is bundled as CommonJS (dist/server.cjs), but workers are
 * emitted as ESM (dist/workers/*.mjs) so they can run under Node's worker_threads
 * without tsx.
 */

import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const WORKERS = ['dispatcher.worker'];
const OUTDIR = 'dist/workers';

mkdirSync(OUTDIR, { recursive: true });

async function main() {
  for (const name of WORKERS) {
    const entry = join('src/server/workers', `${name}.ts`);
    const outfile = join(OUTDIR, `${name}.mjs`);

    await build({
      entryPoints: [entry],
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'esm',
      packages: 'external',
      sourcemap: true,
      outfile,
      define: {
        'process.env.NODE_ENV': '"production"',
      },
    });

    console.log(`[build-workers] ${entry} → ${outfile}`);
  }
}

main().catch((err) => {
  console.error('[build-workers] Failed:', err);
  process.exit(1);
});
