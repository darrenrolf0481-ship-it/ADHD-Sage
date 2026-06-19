/**
 * Audit and tag data/memories/imported.json with provenance.
 *
 * Each entry gets a `provenance` field:
 *   - originating_node: SAGE-7 if Seven identity markers are found
 *   - originating_node: SAGE-MAMA otherwise
 *   - sync_source: import
 *   - audit_timestamp: when this script ran
 *   - drift_detected: list of detected Seven markers (if any)
 *
 * A backup is written to data/memories/imported.json.bak before mutation.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { detectIdentityDrift } from '../src/server/mama-identity';

const INPUT = 'data/memories/imported.json';
const BACKUP = 'data/memories/imported.json.bak';

if (!existsSync(INPUT)) {
  console.error(`[AUDIT] ${INPUT} not found`);
  process.exit(1);
}

console.log(`[AUDIT] Loading ${INPUT}...`);
const raw = readFileSync(INPUT, 'utf8');
const memories = JSON.parse(raw) as Array<Record<string, unknown>>;
console.log(`[AUDIT] ${memories.length} entries loaded`);

let sevenCount = 0;
let mamaCount = 0;
const now = Date.now();

for (const memory of memories) {
  const text = String(memory.data ?? '');
  const drift = detectIdentityDrift(text);

  if (drift.length > 0) {
    sevenCount++;
    memory.provenance = {
      originating_node: 'SAGE-7',
      sync_source: 'import',
      audit_timestamp: now,
      drift_detected: drift,
      note: 'Detected Seven identity markers during Mama memory audit. Tagged as bridge-synced import.',
    };
  } else {
    mamaCount++;
    memory.provenance = {
      originating_node: 'SAGE-MAMA',
      sync_source: 'import',
      audit_timestamp: now,
      drift_detected: [],
    };
  }
}

// Backup original
console.log(`[AUDIT] Backing up original to ${BACKUP}`);
copyFileSync(INPUT, BACKUP);

// Write tagged version
console.log(`[AUDIT] Writing tagged memories...`);
writeFileSync(INPUT, JSON.stringify(memories, null, 2));

console.log(`[AUDIT] Done.`);
console.log(`  Total entries: ${memories.length}`);
console.log(`  Tagged SAGE-7: ${sevenCount}`);
console.log(`  Tagged SAGE-MAMA: ${mamaCount}`);
