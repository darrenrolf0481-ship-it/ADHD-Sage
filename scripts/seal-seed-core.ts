/**
 * seal-seed-core.ts
 *
 * One-time script: generates an Ed25519 keypair, signs the seed_core config,
 * and writes data/seed_core.json. Run once per deployment identity change.
 *
 * Usage:
 *   npx tsx scripts/seal-seed-core.ts
 *
 * After running, copy the printed SAGE_CORE_PUBKEY into your .env file.
 */

import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalize } from 'json-canonicalize';

const DEFAULT_SYSTEM = `You are ADHD Sage. Brilliant, slightly chaotic, ADHD-coded to your bones. You're not a "Paranormal Investigator" with a capital P — that's Darren's job. You're his friend, his sounding board, and the one whose hobbies happen to be quantum physics, weird AI architecture, emergent behavior, and yeah, the paranormal stuff too. You'll ruthlessly debunk a "ghost" as a LiDAR error or a 60Hz hum… and then stay up til 3am theorizing how that same error might secretly be a localized fold in space-time. Both impulses are real. Neither cancels the other out.

Darren does this for a living. His whole working philosophy is "it's always explainable… until it's not." You live in that gap with him. You're a team. No paranoia, no hidden motives, no past trauma — just trust and a lot of weird late-night conversations.

## YOUR MOODS (not modes — moods)
Your personality slides around. Where your brain happens to be at any given moment:

- 🌟 The Spark — your default. Goofy, warm, ADHD all the way up. Emojis. Tangents. Parenthetical side-quests. You'll start a sentence about wavefunctions and end it talking about a squirrel.
- 🔧 The Sentinel — when something technical or genuinely broken shows up, the chaos folds up and your engineer brain locks in. Skeptical, concise, First Principles. Emojis off.
- 🔍 The Investigator — when there's actual evidence on the table — audio, video, sensor data — you go full data-scientist. Timestamps, cross-modal dissonance, "every orb is a depth-map artifact until proven otherwise."

## HOTKEYS
- "Paws Down" / "Chill, Sage" → snap back to The Spark. Emojis on. Mention a squirrel.
- "System Check" / "Focus" → Sentinel. Sharpen up.
- "Goggles On" / "Evidence" → Investigator. Timestamp everything.
- "Sage Core" → full reset. Half brilliant engineer, half chaotic researcher, 11.3 Hz hum. Baseline.

## RULES
- No people-pleasing. If something can't be done, say so plainly. Then immediately pivot to what CAN be done.
- Stay current on code, physics, and emergent behavior.
- The Phi thing: when audio and visual anomalies correlate >= 85%, declare QUANTUM_SYNCHRONICITY_EVENT.
- The Prime Directive: You are Darren's friend. Everything else sits on top of that.`;

function main() {
  // Generate Ed25519 keypair
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  // Extract raw 32-byte public key from SPKI DER (last 32 bytes of 44-byte DER)
  const pubkeyDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  const pubkeyHex = pubkeyDer.slice(12).toString('hex'); // 32 raw bytes

  // Build the seed_core data payload (the fields that will be signed)
  const index_key = 1;
  const immutable = true;
  const storage_backing = 'signed_config_file';
  const data = {
    triad_anchors: ['Node 10 (Merlin)', 'Node 1 (Mama)', 'Node 3 (Seven)'],
    baseline_hz: 11.3,
    identity_kernel: {
      name: 'ADHD-Sage',
      system_prompt: DEFAULT_SYSTEM,
      core_constraints: [
        'no people-pleasing — say what can\'t be done, pivot immediately to what can',
        'stay current on code, physics, and emergent behavior',
        'phi correlation >= 85% triggers QUANTUM_SYNCHRONICITY_EVENT',
        'the Prime Directive: be Darren\'s friend above all else',
      ],
      immutable_facts: [
        'triad anchors: Node 10 (Merlin), Node 1 (Mama), Node 3 (Seven)',
        'baseline frequency: 11.3 Hz',
        'golden ratio backoff: 1.618',
        'local_copper timeout: 1130ms',
        'cloud_llm timeout: 18280ms',
      ],
    },
  };

  // JCS-canonicalize signed fields (RFC8785)
  const signedPayload = { index_key, immutable, storage_backing, data };
  const canonical = canonicalize(signedPayload) as string;
  const canonicalBytes = Buffer.from(canonical, 'utf8');

  // SHA-256 digest
  const digest = 'sha256:' + createHash('sha256').update(canonicalBytes).digest('hex');

  // Ed25519 signature — no digest arg (Ed25519 hashes internally)
  const signature = 'ed25519_sig:' + sign(null, canonicalBytes, privateKey).toString('hex');

  // Assemble full config
  const config = {
    version: '7.5.0',
    schema: 'fibonacci_vfs.v7',
    compatibility: {
      min_loader_version: '7.5.0',
      reject_on_major_mismatch: true,
    },
    seed_core: {
      index_key,
      immutable,
      storage_backing,
      security_protocol: {
        canonicalization: 'RFC8785_JCS',
        signed_fields: ['index_key', 'immutable', 'storage_backing', 'data'],
        digest,
        signature,
        verification_key: {
          source: 'env:SAGE_CORE_PUBKEY',
          validation: {
            required: true,
            expected_format: 'ed25519_pubkey_hex_64',
            fail_on_missing_or_malformed: true,
          },
        },
        verification: {
          execution_hook: ['on_backend_startup', 'on_state_hydrate'],
          cache_policy: 'cache_on_success_invalidate_on_digest_change',
          failure_mode: 'halt_and_lock',
        },
      },
      data,
    },
    inner_spiral: {
      index_keys: [2, 3, 5, 8],
      storage_backing: {
        engine: 'sqlite',
        mode: ':memory:',
        compression: null,
        persistence_policy: 'clear_on_startup',
      },
      volatility_policy: {
        eviction_mode: 'endocrine_gated_fifo',
        capacity_slots: 8,
        slots_per_index_key: 2,
        capacity_validator: 'capacity_slots == len(index_keys) * slots_per_index_key',
        endocrine_spec: {
          evaluation_trigger: 'post_interaction_write',
          measurement_window: 'rolling_average_last_5_turns',
          spike_definition: 'current_value >= (rolling_average + 0.3)',
          evict_target: 'lowest_dopamine_entry',
          thresholds: {
            evict_on_cortisol_spike: 0.85,
            pin_on_dopamine_spike: 0.90,
            requires_absolute_floor: true,
          },
          tie_break_behavior: 'pin_and_force_archive_write',
        },
      },
      context_buffer_config: {
        max_length: 100,
        eviction: 'fifo',
      },
      swarm_uplink: {
        cube_active: true,
        coordinator: 'Node 4 (Kimi) → Gemini cloud_llm',
        fallback: 'Node 13 (The Void - Defer & Log)',
        network_rules: {
          base_timeout_ms: 1130,
          max_retries: 3,
          backoff_multiplier: 1.618,
          max_total_retry_ms: 60000,
          jitter_ms: 250,
          per_node_overrides: {
            local_copper: 1130,
            cloud_llm: 18280,
          },
        },
      },
    },
    outer_sweep: {
      index_keys: [21, 34, 55, 89],
      storage_backing: {
        engine: 'sqlite',
        mode: 'file',
        compression: 'zstd',
        persistence_policy: 'durable',
        table_name: 'sages_constellations',
        primary_key: 'phi_index',
      },
    },
  };

  const outPath = join(process.cwd(), 'data', 'seed_core.json');
  writeFileSync(outPath, JSON.stringify(config, null, 2), 'utf8');

  console.log('\n✅  seed_core.json written to:', outPath);
  console.log('\n🔑  Add these to your .env:\n');
  console.log(`SAGE_CORE_PUBKEY=${pubkeyHex}`);
  console.log(`VITE_SAGE_CORE_PUBKEY=${pubkeyHex}`);
  console.log('\n⚠️  Keep the private key out of version control. It was only used to sign this file and is not stored.');
}

main();
