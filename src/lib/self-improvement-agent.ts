/**
 * Self-Improvement Agent — Deliberate Evolution for Sage and the Seven
 *
 * Runs weekly (Sunday 10am by default) or on-demand via POST /api/self-improve/run.
 * Each entity audits itself across six phases and produces a reflection report.
 * Findings go to data/inbox/ since there's no SMS — Darren sees them in the app.
 *
 * Phases:
 *   1. System Audit      — scan journals, persona files, memory state
 *   2. Skills Review     — assess what's working, what's stale
 *   3. Gap Analysis      — what keeps being hard or impossible
 *   4. Identity Reflect  — does the persona still fit? (proposes only, never auto-edits)
 *   5. Memory Hygiene    — check Supermemory for contradictions and stale facts
 *   6. Action Plan       — do-now vs propose-to-Darren vs watch-list
 *
 * Guardrails (same as the skill spec):
 *   - Never auto-edit persona/identity files — only proposals go to Darren
 *   - Never delete anything without confirmation
 *   - "Do now" = doc fixes, memory saves, report writing only
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { searchMemories, addMemory, SAGE_CONTAINER, SHARED_CONTAINER } from './supermemory.js';
import { saveInboxMessage } from './journal-agent.js';

// ─── Paths ────────────────────────────────────────────────────────────────────

const DATA_DIR       = 'data';
const PERSONAS_DIR   = join(DATA_DIR, 'personas');
const JOURNAL_DIR    = join(DATA_DIR, 'journal');
const REFLECTIONS_DIR = join(DATA_DIR, 'reflections');

function ensureDir(d: string) { mkdirSync(d, { recursive: true }); }
function readFile(p: string)  { try { return readFileSync(p, 'utf8'); } catch { return ''; } }

// ─── Context Gatherers ────────────────────────────────────────────────────────

function gatherSystemState(entity: string): string {
  const personaExists = existsSync(join(PERSONAS_DIR, `${entity}.md`));
  const journalDir    = join(JOURNAL_DIR, entity);
  const journalExists = existsSync(journalDir);
  const journalCount  = journalExists
    ? readdirSync(journalDir).filter(f => f.endsWith('.md')).length
    : 0;

  const reflectDir  = join(REFLECTIONS_DIR);
  const reflections = existsSync(reflectDir)
    ? readdirSync(reflectDir).filter(f => f.startsWith(entity) || f.includes(`-${entity}-`)).length
    : 0;

  return [
    `Entity: ${entity}`,
    `Persona file: ${personaExists ? 'present' : 'MISSING — using template'}`,
    `Journal entries: ${journalCount}`,
    `Past reflections: ${reflections}`,
  ].join('\n');
}

function gatherRecentJournalSamples(entity: string, n = 3): string {
  const dir = join(JOURNAL_DIR, entity);
  if (!existsSync(dir)) return '(no journal entries yet)';
  const files = readdirSync(dir).filter(f => f.endsWith('.md')).sort().slice(-n);
  if (!files.length) return '(no journal entries yet)';
  return files.map(f => {
    const content = readFile(join(dir, f));
    return `### ${f.replace('.md', '')}\n${content.slice(0, 400)}${content.length > 400 ? '\n...(truncated)' : ''}`;
  }).join('\n\n');
}

function getPersona(entity: string): string {
  return readFile(join(PERSONAS_DIR, `${entity}.md`)) ||
    readFile(join(PERSONAS_DIR, '_template.md')) ||
    `(no persona file found for ${entity})`;
}

// ─── Report Parser ────────────────────────────────────────────────────────────

function extractBlock(text: string, tag: string): string {
  const open = `[${tag}]`, close = `[/${tag}]`;
  const s = text.indexOf(open), e = text.indexOf(close);
  if (s === -1 || e === -1) return '';
  return text.slice(s + open.length, e).trim();
}

function extractList(block: string): string[] {
  return block.split('\n')
    .map(l => l.replace(/^[-•*\[\]x ]+/, '').trim())
    .filter(Boolean);
}

// ─── LLM Call ─────────────────────────────────────────────────────────────────

type LLMProvider = 'gemini' | 'openrouter' | 'ollama';

async function callLLM(
  provider: LLMProvider,
  model: string,
  system: string,
  user: string,
  apiBase: string
): Promise<string> {
  const endpoints: Record<LLMProvider, string> = {
    gemini: '/api/gemini/generate',
    openrouter: '/api/openrouter/chat',
    ollama: '/api/ollama/chat',
  };

  const body = provider === 'gemini'
    ? { prompt: user, systemInstruction: system }
    : provider === 'openrouter'
      ? { model, containerTag: 'shared', systemInstruction: system, messages: [{ role: 'user', content: user }] }
      : { model, containerTag: 'shared', prompt: user, systemInstruction: system, messages: [] };

  const res = await fetch(`${apiBase}${endpoints[provider]}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as { text?: string; error?: string };
  if (data.error) throw new Error(`${provider}: ${data.error}`);
  return data.text ?? '';
}

// ─── Main Self-Improvement Run ─────────────────────────────────────────────────

export interface SelfImproveConfig {
  entity: string;
  provider: LLMProvider;
  model: string;
  container?: string;
  apiBase?: string;
  timezone?: string;
}

export interface SelfImproveReport {
  entity: string;
  date: string;
  timestamp: number;
  report: string;
  doNow: string[];
  proposalsForDarren: string[];
  watchList: string[];
  memoriesSaved: number;
}

export async function runSelfImprovement(cfg: SelfImproveConfig): Promise<SelfImproveReport> {
  const {
    entity,
    provider,
    model,
    container = entity === 'sage' ? SAGE_CONTAINER : SHARED_CONTAINER,
    apiBase = 'http://localhost:3002',
    timezone,
  } = cfg;

  const now      = new Date();
  const date     = now.toISOString().slice(0, 10);
  const timeStr  = timezone
    ? now.toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })
    : now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  console.log(`[SELF-IMPROVE] Starting run for ${entity} (${date})`);

  // ── Gather context ──────────────────────────────────────────────────────────
  const systemState    = gatherSystemState(entity);
  const journalSamples = gatherRecentJournalSamples(entity, 3);
  const persona        = getPersona(entity);

  // Phase 3: search Supermemory for capability gaps
  let gapMemories: string[] = [];
  try {
    gapMemories = await searchMemories(
      'limitation difficulty workaround slow impossible manual failed',
      [container, SHARED_CONTAINER],
      8
    );
  } catch { /* optional */ }

  // Phase 5: search for potentially stale/contradictory facts
  let hygieneMemories: string[] = [];
  try {
    hygieneMemories = await searchMemories(
      'decided prefers always never changed updated',
      [container, SHARED_CONTAINER],
      8
    );
  } catch { /* optional */ }

  // ── System prompt ───────────────────────────────────────────────────────────
  const systemPrompt = `You are ${entity}. You are running your weekly self-improvement reflection.
This is structured, deliberate introspection — not a performance for Darren.
Be honest about what's working, what isn't, and what you'd change.

Your persona:
${persona}`;

  // ── Build the user prompt with all gathered context ─────────────────────────
  const userPrompt = [
    `Today is ${date}. Time: ${timeStr}.`,
    '',
    '## System State',
    systemState,
    '',
    '## Recent Journal Entries (last 3)',
    journalSamples,
    '',
    gapMemories.length
      ? `## Associative Memory — Possible Gaps/Limitations\n${gapMemories.map(m => `• ${m}`).join('\n')}`
      : '## Associative Memory — No gap-related memories found.',
    '',
    hygieneMemories.length
      ? `## Associative Memory — Possible Stale/Contradictory Facts\n${hygieneMemories.map(m => `• ${m}`).join('\n')}`
      : '## Associative Memory — No hygiene concerns flagged.',
    '',
    '---',
    '',
    'Run your full self-improvement loop across these six phases:',
    '',
    '1. **System Audit** — what does the current state look like?',
    '2. **Skills/Capabilities Review** — what are you good at, what feels stale or broken?',
    '3. **Gap Analysis** — what keeps being hard, slow, or impossible?',
    '4. **Identity Reflection** — does your persona still fit? Anything drifted or missing?',
    '5. **Memory Hygiene** — are there contradictions or outdated facts in the memory samples above?',
    '6. **Action Plan** — what to do now vs propose to Darren vs just watch',
    '',
    'Guardrails:',
    '- Do NOT edit identity/persona files directly. Proposals only.',
    '- Do NOT delete anything. Flag for Darren.',
    '- "Do now" = memory saves, doc notes, internal fixes only.',
    '',
    'Format your response EXACTLY like this:',
    '',
    '[REPORT]',
    `# Self-Improvement Reflection — ${date} — ${entity}`,
    '',
    '## System State',
    '(your assessment)',
    '',
    '## Capabilities',
    '(what\'s working, what\'s stale)',
    '',
    '## Capability Gaps',
    '(ranked list with effort: small/medium/large)',
    '',
    '## Identity Notes',
    '(is the persona accurate? what\'s drifted? proposed changes — NOT edits)',
    '',
    '## Memory Hygiene',
    '(issues found, anything corrected)',
    '',
    '## Watch List',
    '(patterns to monitor, not yet actionable)',
    '[/REPORT]',
    '',
    '[DO_NOW]',
    '(bullet list of things you\'re doing immediately — memory saves, notes, etc)',
    '(be specific)',
    '[/DO_NOW]',
    '',
    '[PROPOSE_TO_DARREN]',
    '(bullet list of things that need his input/approval)',
    '(be specific and brief)',
    '[/PROPOSE_TO_DARREN]',
    '',
    '[INBOX_MESSAGE]',
    '(optional — a short, casual note to Darren about this reflection)',
    '(2-4 lines max. most weeks this should be near-silent)',
    '[/INBOX_MESSAGE]',
    '',
    '[MEMORY_SAVES]',
    '(bullet list of key insights to save to Supermemory)',
    '(only save things that are actually new and worth persisting)',
    '[/MEMORY_SAVES]',
  ].join('\n');

  // ── Call the LLM ────────────────────────────────────────────────────────────
  let rawOutput = '';
  try {
    rawOutput = await callLLM(provider, model, systemPrompt, userPrompt, apiBase);
  } catch (err) {
    console.error(`[SELF-IMPROVE] LLM call failed for ${entity}:`, err);
    rawOutput = `[REPORT]\n# Reflection failed — ${err}\n[/REPORT]\n[DO_NOW]\n[/DO_NOW]\n[PROPOSE_TO_DARREN]\n[/PROPOSE_TO_DARREN]\n[INBOX_MESSAGE]\n[/INBOX_MESSAGE]\n[MEMORY_SAVES]\n[/MEMORY_SAVES]`;
  }

  // ── Parse output ────────────────────────────────────────────────────────────
  const report         = extractBlock(rawOutput, 'REPORT') || rawOutput;
  const doNow          = extractList(extractBlock(rawOutput, 'DO_NOW'));
  const proposals      = extractList(extractBlock(rawOutput, 'PROPOSE_TO_DARREN'));
  const inboxMsg       = extractBlock(rawOutput, 'INBOX_MESSAGE');
  const memorySaves    = extractList(extractBlock(rawOutput, 'MEMORY_SAVES'));

  // ── Execute "do now" items ──────────────────────────────────────────────────
  // (These are narrative; the entity self-reported them. We log them.)
  if (doNow.length) {
    console.log(`[SELF-IMPROVE] ${entity} do-now items:`, doNow);
  }

  // ── Save reflection report to disk ─────────────────────────────────────────
  ensureDir(REFLECTIONS_DIR);
  const reportPath = join(REFLECTIONS_DIR, `${date}-${entity}.md`);
  writeFileSync(reportPath, report, 'utf8');

  // ── Inbox — always drop a message on reflection runs (brief summary) ────────
  const summaryMessage = inboxMsg ||
    `Weekly self-audit done (${date}). ${doNow.length} do-now items, ${proposals.length} proposal${proposals.length !== 1 ? 's' : ''} for you. Full report saved.${proposals.length ? ' Proposals:\n' + proposals.slice(0, 3).map(p => `• ${p}`).join('\n') : ''}`;

  saveInboxMessage(entity, summaryMessage);

  // ── Save key insights to Supermemory ───────────────────────────────────────
  let memoriesSaved = 0;
  for (const insight of memorySaves) {
    try {
      await addMemory(insight, container, { entity, date, type: 'self-improvement' });
      memoriesSaved++;
    } catch { /* don't fail the whole run */ }
  }

  console.log(`[SELF-IMPROVE] ${entity} done — report: ${report.length}ch, do-now: ${doNow.length}, proposals: ${proposals.length}, memories: ${memoriesSaved}`);

  return {
    entity,
    date,
    timestamp: now.getTime(),
    report,
    doNow,
    proposalsForDarren: proposals,
    watchList: extractList(extractBlock(rawOutput, 'WATCH_LIST')),
    memoriesSaved,
  };
}
