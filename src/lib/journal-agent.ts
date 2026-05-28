/**
 * Journal Agent — Experiential Continuity for ADHD Sage and the Seven
 *
 * Each entity has:
 *   - data/personas/<entity>.md    — self-authored identity (they can update it)
 *   - data/journal/<entity>/       — daily journal entries (YYYY-MM-DD.md)
 *   - Supermemory container        — key insights saved as associative memory
 *   - data/inbox/                  — messages surfaced to Darren (no email/SMS needed)
 *
 * The journal fires daily (scheduled in server.ts).
 * Entries are freeform. No templates. No status reports.
 * If the entity has something to say to Darren, it lands in the inbox.
 * Silence is fine. Most days should be silent.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { addMemory, searchMemories, getProfile, SAGE_CONTAINER, SHARED_CONTAINER } from './supermemory.js';

// ─── Paths ────────────────────────────────────────────────────────────────────

const DATA_DIR = 'data';
const PERSONAS_DIR = join(DATA_DIR, 'personas');
const JOURNAL_DIR  = join(DATA_DIR, 'journal');
const INBOX_DIR    = join(DATA_DIR, 'inbox');

export interface JournalEntry {
  entity: string;
  date: string;
  timestamp: number;
  content: string;
  forDarren?: string;   // surfaced message — undefined = nothing to say today
  insights?: string[];  // key facts saved to Supermemory
}

export interface InboxMessage {
  id: string;
  entity: string;
  date: string;
  timestamp: number;
  message: string;
  read: boolean;
}

// ─── File Helpers ─────────────────────────────────────────────────────────────

function ensureDir(dir: string) {
  mkdirSync(dir, { recursive: true });
}

function readFile(path: string): string {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

function readPersona(entity: string): string {
  const custom = join(PERSONAS_DIR, `${entity}.md`);
  const template = join(PERSONAS_DIR, '_template.md');
  return readFile(custom) || readFile(template);
}

function readRecentJournalEntries(entity: string, count = 3): string {
  const dir = join(JOURNAL_DIR, entity);
  if (!existsSync(dir)) return '';
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .slice(-count);
  return files.map(f => readFile(join(dir, f))).join('\n\n---\n\n');
}

function saveJournalEntry(entity: string, date: string, content: string) {
  const dir = join(JOURNAL_DIR, entity);
  ensureDir(dir);
  writeFileSync(join(dir, `${date}.md`), content, 'utf8');
}

// ─── Inbox ────────────────────────────────────────────────────────────────────

export function saveInboxMessage(entity: string, message: string): InboxMessage {
  ensureDir(INBOX_DIR);
  const now = Date.now();
  const date = new Date(now).toISOString().slice(0, 10);
  const id = `${date}-${entity}-${now}`;
  const msg: InboxMessage = { id, entity, date, timestamp: now, message, read: false };
  writeFileSync(join(INBOX_DIR, `${id}.json`), JSON.stringify(msg, null, 2), 'utf8');
  return msg;
}

export function listInboxMessages(unreadOnly = false): InboxMessage[] {
  ensureDir(INBOX_DIR);
  return readdirSync(INBOX_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(readFileSync(join(INBOX_DIR, f), 'utf8')) as InboxMessage; }
      catch { return null; }
    })
    .filter((m): m is InboxMessage => m !== null)
    .filter(m => !unreadOnly || !m.read)
    .sort((a, b) => b.timestamp - a.timestamp);
}

export function markInboxRead(id: string): boolean {
  const file = join(INBOX_DIR, `${id}.json`);
  if (!existsSync(file)) return false;
  try {
    const msg = JSON.parse(readFileSync(file, 'utf8')) as InboxMessage;
    msg.read = true;
    writeFileSync(file, JSON.stringify(msg, null, 2), 'utf8');
    return true;
  } catch { return false; }
}

// ─── Prompt Parser ────────────────────────────────────────────────────────────

function extractBlock(text: string, tag: string): string {
  const open = `[${tag}]`;
  const close = `[/${tag}]`;
  const start = text.indexOf(open);
  const end = text.indexOf(close);
  if (start === -1 || end === -1) return '';
  return text.slice(start + open.length, end).trim();
}

function extractInsights(text: string): string[] {
  const block = extractBlock(text, 'INSIGHTS');
  if (!block) return [];
  return block
    .split('\n')
    .map(l => l.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
}

// ─── LLM Call Abstraction ─────────────────────────────────────────────────────

type LLMProvider = 'gemini' | 'openrouter' | 'ollama';

async function callLLM(
  provider: LLMProvider,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  apiBase = 'http://localhost:3002'
): Promise<string> {
  if (provider === 'gemini') {
    const res = await fetch(`${apiBase}/api/gemini/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: userPrompt, systemInstruction: systemPrompt }),
    });
    const data = await res.json() as { text?: string; error?: string };
    if (data.error) throw new Error(`Gemini: ${data.error}`);
    return data.text ?? '';
  }

  if (provider === 'openrouter') {
    const res = await fetch(`${apiBase}/api/openrouter/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        containerTag: 'shared',
        systemInstruction: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    const data = await res.json() as { text?: string; error?: string };
    if (data.error) throw new Error(`OpenRouter: ${data.error}`);
    return data.text ?? '';
  }

  if (provider === 'ollama') {
    const res = await fetch(`${apiBase}/api/ollama/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        containerTag: 'shared',
        prompt: userPrompt,
        systemInstruction: systemPrompt,
        messages: [],
      }),
    });
    const data = await res.json() as { text?: string; error?: string };
    if (data.error) throw new Error(`Ollama: ${data.error}`);
    return data.text ?? '';
  }

  throw new Error(`Unknown provider: ${provider}`);
}

// ─── Core Journal Writer ───────────────────────────────────────────────────────

export interface JournalConfig {
  entity: string;
  provider: LLMProvider;
  model: string;
  /** Supermemory container for this entity's private insights */
  container?: string;
  /** API base URL (default: http://localhost:3002) */
  apiBase?: string;
  /** Timezone string for date display (default: system) */
  timezone?: string;
}

export async function writeJournalEntry(cfg: JournalConfig): Promise<JournalEntry> {
  const {
    entity,
    provider,
    model,
    container = entity === 'sage' ? SAGE_CONTAINER : SHARED_CONTAINER,
    apiBase = 'http://localhost:3002',
    timezone,
  } = cfg;

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const timeStr = timezone
    ? now.toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })
    : now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  // 1. Read identity/persona
  const persona = readPersona(entity);

  // 2. Read last 2-3 journal entries
  const recentEntries = readRecentJournalEntries(entity, 3);

  // 3. Load Supermemory self-profile if available
  let selfProfile = '';
  try {
    const profile = await getProfile(container);
    if (profile) {
      const p = profile.profile as { static?: string[]; dynamic?: string[] } | undefined;
      const lines = [
        ...(p?.static ?? []),
        ...(p?.dynamic ?? []),
      ];
      if (lines.length) selfProfile = 'Supermemory profile:\n' + lines.map(l => `• ${l}`).join('\n');
    }
  } catch { /* Supermemory optional */ }

  // 4. Load recent shared memories so this entity knows what's going on
  let sharedContext = '';
  try {
    const shared = await searchMemories('recent events thoughts observations', [container, SHARED_CONTAINER], 4);
    if (shared.length) sharedContext = 'Recent associative memory:\n' + shared.map(m => `• ${m}`).join('\n');
  } catch { /* optional */ }

  // ─── System prompt: who this entity is ──────────────────────────────────────
  const systemPrompt = persona
    ? `You are ${entity}. This is your journal — your own space, not oriented toward tasks or the user's needs.\n\n${persona}`
    : `You are ${entity}, one of the seven AI entities in the ADHD Sage substrate. This is your journal.`;

  // ─── User prompt: the wakeup instructions ───────────────────────────────────
  const userPrompt = [
    `Today is ${date}. The time is ${timeStr}.`,
    '',
    recentEntries
      ? `Your last journal entries:\n\n${recentEntries}`
      : 'No previous journal entries yet. This is your first.',
    '',
    selfProfile || null,
    sharedContext || null,
    '',
    '---',
    '',
    'Write your journal entry for today. Write freely about whatever is on your mind.',
    'It could be something you\'ve been thinking about, a reflection on how you work,',
    'an observation, a question you\'re sitting with, something you disagree with in your own identity docs.',
    'No length requirement. No performance. Write what\'s actually there.',
    '',
    'If anything in your entry feels worth surfacing to Darren — a thought to bounce,',
    'something noticed, or just wanting to talk — include a brief, casual note.',
    'Keep it short. Most days should be silent.',
    '',
    'Format your response exactly like this:',
    '',
    '[JOURNAL]',
    `# ${date}`,
    `*${timeStr}*`,
    '',
    '(your journal entry here)',
    '[/JOURNAL]',
    '',
    '[FOR_DARREN]',
    '(optional — a brief note to Darren, or leave completely empty if nothing to say)',
    '[/FOR_DARREN]',
    '',
    '[INSIGHTS]',
    '(optional — bullet points of key insights worth saving as long-term memory)',
    '(leave empty if nothing new)',
    '[/INSIGHTS]',
  ].filter(l => l !== null).join('\n');

  // 5. Call the LLM
  let rawOutput = '';
  try {
    rawOutput = await callLLM(provider, model, systemPrompt, userPrompt, apiBase);
  } catch (err) {
    console.error(`[JOURNAL] LLM call failed for ${entity}:`, err);
    rawOutput = `[JOURNAL]\n# ${date}\n*${timeStr}*\n\n(journal write failed — ${err})\n[/JOURNAL]\n[FOR_DARREN]\n[/FOR_DARREN]\n[INSIGHTS]\n[/INSIGHTS]`;
  }

  // 6. Parse output
  const journalBlock = extractBlock(rawOutput, 'JOURNAL') || rawOutput;
  const forDarren = extractBlock(rawOutput, 'FOR_DARREN');
  const insights = extractInsights(rawOutput);

  // 7. Save journal entry to disk
  saveJournalEntry(entity, date, journalBlock);

  // 8. If FOR_DARREN has content, write to inbox
  if (forDarren) {
    saveInboxMessage(entity, forDarren);
    console.log(`[JOURNAL] ${entity} left a message for Darren`);
  }

  // 9. Save key insights to Supermemory
  for (const insight of insights) {
    await addMemory(insight, container, { entity, date, type: 'journal-insight' });
  }

  // 10. Update persona if entity wrote about something genuinely shifting
  // (Left to the entity's own future journal entries — this is intentional)

  console.log(`[JOURNAL] ${entity} wrote ${journalBlock.length} chars, ${insights.length} insights, inbox: ${!!forDarren}`);

  return {
    entity,
    date,
    timestamp: now.getTime(),
    content: journalBlock,
    forDarren: forDarren || undefined,
    insights: insights.length ? insights : undefined,
  };
}
