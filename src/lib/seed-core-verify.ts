/**
 * seed-core-verify.ts — on_state_hydrate hook
 *
 * Verifies the seed_core config received from /api/vfs/config using
 * SubtleCrypto Ed25519. Called once on SageProvider mount.
 * If verification fails, the provider enters halt_and_lock state.
 */

import { canonicalize } from 'json-canonicalize';

export interface SeedCoreProtocol {
  canonicalization: string;
  signed_fields: string[];
  digest: string;
  signature: string;
  verification_key: {
    source: string;
    validation: { required: boolean; expected_format: string; fail_on_missing_or_malformed: boolean };
  };
  verification: {
    execution_hook: string[];
    cache_policy: string;
    failure_mode: string;
  };
}

export interface SeedCoreConfig {
  index_key: number;
  immutable: boolean;
  storage_backing: string;
  security_protocol: SeedCoreProtocol;
  data: Record<string, unknown>;
  [key: string]: unknown;
}

function hexToBytes(hex: string): ArrayBuffer {
  const buf = new ArrayBuffer(hex.length / 2);
  const view = new Uint8Array(buf);
  for (let i = 0; i < hex.length; i += 2) {
    view[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return buf;
}

let cachedResult: boolean | null = null;
let cachedDigest: string | null = null;

export async function verifyHydration(seedCore: SeedCoreConfig): Promise<boolean> {
  const sp = seedCore.security_protocol;

  // Cache: skip re-verification if digest hasn't changed (cache_on_success_invalidate_on_digest_change)
  if (cachedResult !== null && cachedDigest === sp.digest) {
    return cachedResult;
  }

  const pubkeyHex = import.meta.env.VITE_SAGE_CORE_PUBKEY as string | undefined;
  if (!pubkeyHex || pubkeyHex.length !== 64) {
    console.error('[SAGE CORE] Hydration HALT: VITE_SAGE_CORE_PUBKEY missing or malformed');
    cachedResult = false;
    return false;
  }

  // Reconstruct signed payload from signed_fields
  const payload: Record<string, unknown> = {};
  for (const field of sp.signed_fields) {
    payload[field] = seedCore[field];
  }
  const canonical = canonicalize(payload) as string;
  const msgBytes = new TextEncoder().encode(canonical);

  // Import Ed25519 public key from raw bytes
  const pubkeyBytes = hexToBytes(pubkeyHex);
  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      pubkeyBytes,
      { name: 'Ed25519' },
      false,
      ['verify']
    );
  } catch (e) {
    console.error('[SAGE CORE] Hydration HALT: failed to import public key', e);
    cachedResult = false;
    return false;
  }

  // Verify Ed25519 signature
  const sigHex = sp.signature.replace('ed25519_sig:', '');
  const sigBytes = hexToBytes(sigHex);
  try {
    const ok = await window.crypto.subtle.verify('Ed25519', cryptoKey, sigBytes, msgBytes);
    if (ok) {
      console.log('[SAGE CORE] Hydration: OK ✓  (on_state_hydrate)');
    } else {
      console.error('[SAGE CORE] Hydration HALT: ed25519 signature invalid → halt_and_lock');
    }
    cachedResult = ok;
    cachedDigest = sp.digest;
    return ok;
  } catch (e) {
    console.error('[SAGE CORE] Hydration HALT: verify threw', e);
    cachedResult = false;
    return false;
  }
}
