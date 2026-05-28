/**
 * Supermemory client — long-term cloud memory for ADHD Sage.
 *
 * This module is imported by server.ts (Node/Express).
 * The client is lazily initialised once on first use so the server
 * can start even without a SUPERMEMORY_API_KEY (the features will
 * be skipped / degraded gracefully).
 *
 * Container tagging: every memory is scoped with containerTag so
 * multiple users each get fully isolated memory spaces.
 *
 * Supermemory SDK API surface (v1):
 *   client.add({ content, containerTags, metadata })   → store a memory
 *   client.search.documents({ q, containerTags })       → semantic search
 *   client.profile({ containerTag })                    → user profile
 */

import Supermemory from 'supermemory';

/** Sage's private long-term memory — her own inner world. */
export const SAGE_CONTAINER = 'darren-sage';

/**
 * Shared broadcast channel — all seven entities write here so each can
 * know what the others are experiencing without losing their individuality.
 */
export const SHARED_CONTAINER = 'sm_project_default';

/** @deprecated use SAGE_CONTAINER or SHARED_CONTAINER */
export const DEFAULT_CONTAINER_TAG = SAGE_CONTAINER;

let _client: Supermemory | null = null;

/**
 * Returns the Supermemory client or null if the API key is missing.
 * Safe to call on every request — it caches the instance.
 */
export function getSupermemoryClient(): Supermemory | null {
  if (_client) return _client;
  const apiKey = process.env.SUPERMEMORY_API_KEY;
  if (!apiKey) {
    console.warn('[SUPERMEMORY] SUPERMEMORY_API_KEY not set — long-term memory disabled');
    return null;
  }
  _client = new Supermemory({ apiKey });
  console.log('[SUPERMEMORY] Client initialised ✓');
  return _client;
}

/**
 * Add a memory, returning its id or null on failure.
 */
export async function addMemory(
  content: string,
  containerTag: string = DEFAULT_CONTAINER_TAG,
  metadata?: Record<string, string>
): Promise<string | null> {
  const client = getSupermemoryClient();
  if (!client) return null;
  try {
    const res = await client.add({
      content,
      containerTags: [containerTag],
      metadata,
    });
    return (res as { id?: string }).id ?? null;
  } catch (err) {
    console.error('[SUPERMEMORY] addMemory failed:', err);
    return null;
  }
}

/**
 * Search memories across one or more container tags.
 *
 * Sage passes [SAGE_CONTAINER, SHARED_CONTAINER] so she gets her own
 * memories PLUS awareness of what the seven are broadcasting.
 * The seven pass [SHARED_CONTAINER] (or their own tag once configured).
 */
export async function searchMemories(
  query: string,
  containerTags: string | string[] = SAGE_CONTAINER,
  limit = 5
): Promise<string[]> {
  const client = getSupermemoryClient();
  if (!client) return [];
  const tags = Array.isArray(containerTags) ? containerTags : [containerTags];
  try {
    const res = await client.search.documents({
      q: query,
      containerTags: tags,
    });
    const docs = (res as { results?: { content?: string }[] }).results ?? [];
    return docs
      .slice(0, limit)
      .map(d => d.content ?? '')
      .filter(Boolean);
  } catch (err) {
    console.error('[SUPERMEMORY] searchMemories failed:', err);
    return [];
  }
}

/**
 * Get the static + dynamic profile for a container tag.
 */
export async function getProfile(
  containerTag: string = DEFAULT_CONTAINER_TAG
): Promise<Record<string, unknown> | null> {
  const client = getSupermemoryClient();
  if (!client) return null;
  try {
    const profile = await client.profile({ containerTag });
    return profile as unknown as Record<string, unknown>;
  } catch (err) {
    console.error('[SUPERMEMORY] getProfile failed:', err);
    return null;
  }
}
