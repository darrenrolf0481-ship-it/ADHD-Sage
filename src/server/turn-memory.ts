/**
 * recordEpisode — what a chat turn leaves behind in her durable memory.
 *
 * Before: Gemini stashed the raw "[USER] …" and full "[SAGE] …" reply into the
 * 8-slot inner spiral (dopamine 0.5/0.7). After ~4 turns the boot anchors were
 * evicted — and eviction ARCHIVES, so raw multi-KB replies landed in the outer
 * archive as fossils. The other providers wrote nothing locally at all.
 *
 * Now, for every provider:
 *   - transcript  → spool (routes already call spoolExchangeToSpiral) — never the prompt
 *   - inner spiral → untouched by chat; it stays her working set (anchors survive)
 *   - outer archive → one compact, labeled EPISODE per substantive exchange;
 *                     pinned when Darren explicitly asks her to remember
 * Episodes are FTS/resonance indexed by archiveNodeSync, so recallForTurn finds them.
 */
import { createHash } from 'node:crypto';
import { archiveNodeSync } from './archive';
import { isGreetingTurn } from './recall';

const USER_CHARS = 400;
const REPLY_CHARS = 500;
const MIN_USER_CHARS = 15; // "ok", "thanks lol", "yes" — not worth an episode

// Explicit memory requests pin the episode (the only path to a pin from chat).
const REMEMBER_RE =
  /\b(remember (this|that)|don'?t forget|never forget|keep (this|that) in mind|make a note|note (this|that)|save this|log this)\b/i;

// Recent episode fingerprints — stops retries/regenerations from duplicating.
const recent: string[] = [];
const RECENT_MAX = 50;

function clip(text: string, max: number): string {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return (end > max * 0.5 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max)) + '…';
}

export function recordEpisode(turn: {
  provider: string;
  model?: string;
  userText: string;
  replyText: string;
  skipTools?: boolean; // scheduled journal/self-improve agents — not conversations
}): { recorded: boolean; pinned?: boolean; reason?: string } {
  try {
    const user = (turn.userText || '').trim();
    const reply = (turn.replyText || '').trim();
    if (turn.skipTools) return { recorded: false, reason: 'scheduled-agent' };
    if (!user || !reply) return { recorded: false, reason: 'empty' };

    const pinned = REMEMBER_RE.test(user);
    if (!pinned && (user.length < MIN_USER_CHARS || isGreetingTurn(user)))
      return { recorded: false, reason: 'low-signal' };

    const fp = createHash('sha1').update(user + '\u0000' + reply.slice(0, 200)).digest('hex');
    if (recent.includes(fp)) return { recorded: false, reason: 'duplicate' };
    recent.push(fp);
    if (recent.length > RECENT_MAX) recent.shift();

    const now = Date.now();
    archiveNodeSync({
      node_id: `ep_${now}_${fp.slice(0, 8)}`,
      data: `Darren: ${clip(user, USER_CHARS)}\nSage: ${clip(reply, REPLY_CHARS)}`,
      timestamp: now,
      dopamine: pinned ? 0.95 : 0.6,
      cortisol: 0.1,
      pinned: pinned ? 1 : 0,
      provenance: {
        originating_node: 'ADHD-SAGE',
        sync_source: 'chat',
        provider: turn.provider,
        ...(turn.model ? { model: turn.model } : {}),
      },
    });
    return { recorded: true, pinned };
  } catch (e) {
    console.warn('[MEMORY] recordEpisode failed (non-fatal):', (e as Error).message);
    return { recorded: false, reason: 'error' };
  }
}
