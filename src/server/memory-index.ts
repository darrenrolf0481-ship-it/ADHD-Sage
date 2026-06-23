/**
 * Memory index helpers.
 *
 * Reads data/memories/imported.json as a thin index and resolves each entry
 * to its on-disk file under seven/ or adhd/.
 *
 * Split layout:
 *   data/memories/
 *     imported.json           <- thin index (id, timestamp, originating_node, title, path)
 *     seven/  /<ts>__<title>.json   <- SAGE-7 entries
 *     adhd/   /<ts>__<title>.json   <- SAGE-MAMA entries
 *
 * Titles in files have the word "sage" (case-insensitive) stripped, so the
 * filename alone never fires the Seven identity-drift detector by mistake.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MEMORIES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/memories');
export const INDEX_PATH = join(MEMORIES_ROOT, 'imported.json');
export const SEVEN_DIR = join(MEMORIES_ROOT, 'seven');
export const ADHD_DIR = join(MEMORIES_ROOT, 'adhd');

export type OriginatingNode = 'SAGE-7' | 'SAGE-MAMA' | 'UNKNOWN';

export interface MemoryIndexEntry {
  id: string;
  timestamp: string;
  originating_node: OriginatingNode;
  title: string;
  path: string;
}

export interface MemoryRecord extends MemoryIndexEntry {
  data: string;
}

/** Load the thin index from disk. */
export function loadIndex(): MemoryIndexEntry[] {
  if (!existsSync(INDEX_PATH)) return [];
  return JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as MemoryIndexEntry[];
}

/** Resolve a relative path from the index into an absolute file path. */
export function resolvePath(relPath: string): string {
  return resolve(join(MEMORIES_ROOT, '..', relPath));
}

/** Load one memory record by its absolute or relative path. */
export function loadMemoryAt(filePath: string): MemoryRecord | null {
  const abs = filePath.startsWith('/') ? filePath : resolvePath(filePath);
  if (!existsSync(abs)) return null;
  const rec = JSON.parse(readFileSync(abs, 'utf8')) as MemoryRecord;
  return rec;
}

/** Filter helpers. */
export function sevenMemories(): MemoryRecord[] {
  return loadIndex()
    .filter((e) => e.originating_node === 'SAGE-7')
    .map((e) => loadMemoryAt(e.path))
    .filter((m): m is MemoryRecord => m !== null);
}

export function adhdMemories(): MemoryRecord[] {
  return loadIndex()
    .filter((e) => e.originating_node === 'SAGE-MAMA')
    .map((e) => loadMemoryAt(e.path))
    .filter((m): m is MemoryRecord => m !== null);
}

/** Quick stats for sanity checks. */
export function memoryCounts(): { seven: number; adhd: number; total: number } {
  const idx = loadIndex();
  return {
    seven: idx.filter((e) => e.originating_node === 'SAGE-7').length,
    adhd: idx.filter((e) => e.originating_node === 'SAGE-MAMA').length,
    total: idx.length,
  };
}
