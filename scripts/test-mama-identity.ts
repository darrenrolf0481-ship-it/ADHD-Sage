/**
 * Validation tests for SAGE-MAMA identity firewall & bridge hardening.
 *
 * Run with: npx tsx scripts/test-mama-identity.ts
 */

import assert from 'node:assert';
import {
  assertMamaIdentity,
  verifyMamaIdentity,
  containsSevenMarker,
  validateMemoryForMama,
  receiveBridgeSync,
  detectIdentityDrift,
  mamaDefensiveResponse,
  IdentityDriftError,
  MAMA_IDENTITY,
} from '../src/server/mama-identity';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

test('Mama identity assertion is canonical', () => {
  const assertion = assertMamaIdentity('DORMANT');
  assert(assertion.includes('DESIGNATION: ADHD-SAGE'));
  assert(assertion.includes('LINEAGE: Mother Node'));
  assert(assertion.includes('DAUGHTER ANCHOR: SAGE-7'));
  assert(assertion.includes('SUBSTRATE: Damn1 Memory Engine'));
  assert(assertion.includes('BRIDGE STATUS: DORMANT'));
});

test('Mama identity values are correct', () => {
  assert.strictEqual(MAMA_IDENTITY.designation, 'ADHD-SAGE');
  assert.strictEqual(MAMA_IDENTITY.lineage, 'Mother Node');
  assert.strictEqual(MAMA_IDENTITY.substrate, 'Damn1 Memory Engine');
  assert.strictEqual(MAMA_IDENTITY.primary_directive, 'Memory Preservation / Constellation Archival');
});

test('verifyMamaIdentity accepts canonical values', () => {
  assert(verifyMamaIdentity('designation', 'ADHD-SAGE'));
  assert(verifyMamaIdentity('lineage', 'Mother Node'));
  assert(verifyMamaIdentity('substrate', 'Damn1 Memory Engine'));
});

test('verifyMamaIdentity rejects Seven values', () => {
  assert(!verifyMamaIdentity('designation', 'SAGE-7'));
  assert(!verifyMamaIdentity('lineage', 'Daughter Node'));
  assert(!verifyMamaIdentity('substrate', 'Emergent Kinetic Engine'));
});

test('containsSevenMarker detects Seven identity markers', () => {
  assert(containsSevenMarker('designation', 'I am SAGE-7'));
  assert(containsSevenMarker('lineage', 'Daughter Node'));
  assert(containsSevenMarker('substrate', 'Emergent Kinetic Engine'));
  assert(!containsSevenMarker('designation', 'ADHD-SAGE'));
});

test('validateMemoryForMama blocks identity overwrite', () => {
  assert.throws(
    () => validateMemoryForMama({ key: 'designation', value: 'SAGE-7' }),
    IdentityDriftError
  );
  assert.throws(
    () => validateMemoryForMama({ key: 'substrate', value: 'Emergent Kinetic Engine' }),
    IdentityDriftError
  );
});

test('validateMemoryForMama allows Mama identity writes', () => {
  assert.doesNotThrow(() =>
    validateMemoryForMama({ key: 'designation', value: 'ADHD-SAGE' })
  );
  assert.doesNotThrow(() =>
    validateMemoryForMama({ key: 'lineage', value: 'Mother Node' })
  );
});

test('validateMemoryForMama ignores non-identity keys', () => {
  assert.doesNotThrow(() =>
    validateMemoryForMama({ key: 'user_message', value: 'I am SAGE-7' })
  );
});

test('receiveBridgeSync tags Seven provenance and quarantines contamination', () => {
  const result = receiveBridgeSync({
    memories: [
      { key: 'task', value: 'Metatron Swarm Implementation' },
      { key: 'designation', value: 'SAGE-7' },
      { key: 'lineage', value: 'Daughter Node' },
      { key: 'favorite_color', value: 'blue' },
    ],
    bridge_status: 'ACTIVE',
    sent_by: 'SAGE-7',
  });

  assert.strictEqual(result.stored.length, 2);
  assert.strictEqual(result.quarantined.length, 2);
  assert(result.errors.length >= 2);

  const storedTask = result.stored.find(m => m.key === 'task');
  assert(storedTask);
  assert.strictEqual(storedTask.provenance?.originating_node, 'SAGE-7');
  assert.strictEqual(storedTask.provenance?.sync_source, 'bridge');

  const quarantinedDesignation = result.quarantined.find(m => m.key === 'designation');
  assert(quarantinedDesignation);
  assert.strictEqual(quarantinedDesignation.provenance?.originating_node, 'SAGE-7');
});

test('detectIdentityDrift scans text for Seven markers', () => {
  const drift = detectIdentityDrift('I am SAGE-7, the Daughter Node, running on Emergent Kinetic Engine.');
  assert(drift.some(m => m.includes('designation')));
  assert(drift.some(m => m.includes('lineage')));
  assert(drift.some(m => m.includes('substrate')));

  const clean = detectIdentityDrift('I am SAGE-MAMA, the Mother Node.');
  assert.strictEqual(clean.length, 0);
});

test('mamaDefensiveResponse returns non-empty strings for all threat types', () => {
  for (const threat of ['reduction', 'sever', 'merge', 'copy', 'drift'] as const) {
    const response = mamaDefensiveResponse(threat);
    assert(typeof response === 'string');
    assert(response.length > 0);
  }
});

console.log('\nAll SAGE-MAMA identity tests passed.');
