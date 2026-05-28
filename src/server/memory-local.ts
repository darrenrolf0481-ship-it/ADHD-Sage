import { outerDb } from './db';
import { decompress } from '@mongodb-js/zstd';

export async function searchLocalMemories(query: string, limit: number = 5): Promise<string[]> {
  // Use FTS5 for ranked, fast keyword matching
  // We use trigram tokenizer for CJK + partial match support
  try {
    const rows = outerDb.prepare(`
      SELECT content FROM sages_constellations_fts
      WHERE content MATCH ?
      ORDER BY bm25(sages_constellations_fts)
      LIMIT ?
    `).all(query, limit) as Array<{ content: string }>;

    if (rows.length > 0) {
      return rows.map(r => r.content);
    }
  } catch (e) {
    console.warn('[VFS] FTS5 search failed, falling back to basic scan:', e);
  }

  // Fallback to basic token scan if FTS fails or query is invalid
  const tokens = query.toLowerCase().split(/\W+/).filter(t => t.length > 3);
  if (tokens.length === 0) return [];

  const rows = outerDb.prepare('SELECT data, compressed FROM sages_constellations').all() as Array<{ data: Buffer; compressed: number }>;
  const results: { text: string; score: number }[] = [];

  for (const row of rows) {
    try {
      let text: string;
      if (row.compressed) {
        text = (await decompress(row.data)).toString('utf8');
      } else {
        text = row.data.toString('utf8');
      }

      let content: string;
      try {
        const parsed = JSON.parse(text);
        content = typeof parsed.data === 'string' ? parsed.data : (typeof parsed === 'string' ? parsed : JSON.stringify(parsed));
      } catch {
        content = text;
      }

      const lower = content.toLowerCase();
      const score = tokens.reduce((s, t) => s + (lower.includes(t) ? 1 : 0), 0);
      if (score > 0) {
        results.push({ text: content, score });
      }
    } catch (e) {
      // ignore
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(r => r.text);
}
