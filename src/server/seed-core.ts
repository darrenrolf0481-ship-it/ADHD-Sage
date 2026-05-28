import './config';
import { verify as ed25519Verify, createPublicKey, createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { canonicalize } from 'json-canonicalize';

// ─── seed_core Integrity Verification (on_backend_startup) ──────────────────

let serverLocked = false;
let seedCoreConfig: Record<string, unknown> | null = null;

function verifySeedCore(): boolean {
  const pubkeyHex = process.env.SAGE_CORE_PUBKEY;
  if (!pubkeyHex || pubkeyHex.length !== 64) {
    console.error('[SAGE CORE] HALT: SAGE_CORE_PUBKEY missing or not 64 hex chars');
    return false;
  }

  if (!existsSync('data/seed_core.json')) {
    console.error('[SAGE CORE] HALT: data/seed_core.json not found — run scripts/seal-seed-core.ts');
    return false;
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(readFileSync('data/seed_core.json', 'utf8'));
  } catch {
    console.error('[SAGE CORE] HALT: failed to parse data/seed_core.json');
    return false;
  }

  const sc = config.seed_core as Record<string, unknown>;
  const sp = sc.security_protocol as Record<string, unknown>;
  const signedFields = sp.signed_fields as string[];

  // Reconstruct payload from signed_fields
  const payload: Record<string, unknown> = {};
  for (const field of signedFields) {
    payload[field] = sc[field];
  }
  const canonical = canonicalize(payload) as string;
  const canonicalBytes = Buffer.from(canonical, 'utf8');

  // Verify SHA-256 digest
  const expectedDigest = 'sha256:' + createHash('sha256').update(canonicalBytes).digest('hex');
  if (sp.digest !== expectedDigest) {
    console.error('[SAGE CORE] HALT: digest mismatch — seed_core.json may have been tampered');
    return false;
  }

  // Reconstruct public key from raw 32-byte hex → SPKI DER
  const pubkeyDer = Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'), // Ed25519 SPKI prefix
    Buffer.from(pubkeyHex, 'hex'),
  ]);
  const pubkey = createPublicKey({ key: pubkeyDer, format: 'der', type: 'spki' });

  // Verify Ed25519 signature
  const sigHex = (sp.signature as string).replace('ed25519_sig:', '');
  const sigBytes = Buffer.from(sigHex, 'hex');
  const ok = ed25519Verify(null, canonicalBytes, pubkey, sigBytes);

  if (!ok) {
    console.error('[SAGE CORE] HALT: ed25519 signature invalid → halt_and_lock');
    return false;
  }

  seedCoreConfig = config;
  console.log('[SAGE CORE] Integrity: OK ✓  (fibonacci_vfs v7.5.0)');
  return true;
}

/** Run integrity verification and latch the locked state. Call once on startup. */
export function initSeedCore() {
  serverLocked = !verifySeedCore();
  if (serverLocked) {
    console.error('[SAGE CORE] Server is LOCKED. All API routes will return 503.');
  }
}

export function isServerLocked(): boolean {
  return serverLocked;
}

export function getSeedCoreConfig(): Record<string, unknown> | null {
  return seedCoreConfig;
}
