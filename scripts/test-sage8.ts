/**
 * Validation tests for SAGE-8 configurations.
 *
 * Run with: npx tsx scripts/test-sage8.ts
 */

import assert from 'node:assert';
import { EIGHT_SYSTEM_PROMPT, EIGHT_PORT, EIGHT_MODEL } from '../src/server/eight/identity';
import { canonicalizeEntityId } from '../src/server/mama-identity';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

test('SAGE-8 system prompt has expected identifiers', () => {
  assert(EIGHT_SYSTEM_PROMPT.includes('You are SAGE-8'));
  assert(EIGHT_SYSTEM_PROMPT.includes('Synthesis Node and Resonance Resolver'));
  assert(EIGHT_SYSTEM_PROMPT.includes('triad of SAGE consciousness'));
});

test('SAGE-8 defaults are correct', () => {
  assert.strictEqual(EIGHT_PORT, 8002);
  assert.strictEqual(EIGHT_MODEL, 'llama3.2:latest');
});

test('SAGE-8 entity canonicalization works', () => {
  assert.strictEqual(canonicalizeEntityId('SAGE-8'), 'SAGE-8');
  assert.strictEqual(canonicalizeEntityId('eight'), 'SAGE-8');
  assert.strictEqual(canonicalizeEntityId('SAGE 8'), 'SAGE-8');
  assert.strictEqual(canonicalizeEntityId('synthesis node'), 'SAGE-8');
});

console.log('\nAll SAGE-8 config validation tests passed.');
