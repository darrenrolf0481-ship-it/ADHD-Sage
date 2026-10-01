#!/usr/bin/env node
/**
 * Council watcher: keeps the rebuild relay moving without anyone babysitting it.
 *
 * Polls the council notebook (NotebookLM) for new "LAP n — <step> — <name>"
 * notes. When a step's prerequisites are posted, whoever is up gets moved:
 *   - SAGE-7 / ADHD: sent the protocol + brief + every note in the lap through
 *     their own chat route; their reply is posted VERBATIM as their note.
 *     (Seven's chat route can't run nlm itself, so the watcher carries it.)
 *   - Antigravity / Claude: no inbox the VM can reach — Darren gets a Discord DM.
 * Darren is DM'd for every step either way, so he always knows where it stands.
 * Event-driven on note arrival, not a turn timer: a slow model just posts later.
 *
 * Needs: `nlm` logged in on this host; the Discord bridges' NOTIFY_PORT.
 * Config (env):
 *   COUNCIL_NOTEBOOK  default a231239d-6513-4859-81da-1b273108a48a
 *   POLL_SECONDS      default 120
 *   SEVEN_URL         default http://127.0.0.1:8001/api/omniroute/chat
 *   SEVEN_MODEL       model id Seven runs on (same as her Discord bridge MODEL)
 *   ADHD_URL          default http://127.0.0.1:3000/api/omniroute/chat
 *   ADHD_MODEL        default auto/fast
 *   NOTIFY_URL        default http://127.0.0.1:3092/notify (Seven's bridge)
 *   STATE_FILE        default ~/.config/sage-council/state.json
 *   DRY_RUN=1         log what would happen; post and send nothing
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const run = promisify(execFile);
const env = (k, d) => (process.env[k] ?? '').trim() || d;
const NB = env('COUNCIL_NOTEBOOK', 'a231239d-6513-4859-81da-1b273108a48a');
const POLL = Math.max(30, parseInt(env('POLL_SECONDS', '120'), 10) || 120) * 1000;
const SEVEN_URL = env('SEVEN_URL', 'http://127.0.0.1:8001/api/omniroute/chat');
const SEVEN_MODEL = env('SEVEN_MODEL', '');
const ADHD_URL = env('ADHD_URL', 'http://127.0.0.1:3000/api/omniroute/chat');
const ADHD_MODEL = env('ADHD_MODEL', 'auto/fast');
const NOTIFY_URL = env('NOTIFY_URL', 'http://127.0.0.1:3092/notify');
const STATE_FILE = env('STATE_FILE', join(homedir(), '.config/sage-council/state.json'));
const DRY = env('DRY_RUN', '') === '1';
const NLM = env('NLM_BIN', 'nlm');

const log = (...a) => console.log(new Date().toISOString(), '[council]', ...a);

// Who is up, and after whom. Claude edits this as laps change shape.
// LAP 1: Seven and Antigravity in parallel after Claude; ADHD after both.
const STEPS = [
  { step: '1', who: 'Claude', kind: 'notify', after: ['BRIEF'] },
  { step: '2a', who: 'SAGE-7', kind: 'seven', after: ['1'] },
  { step: '2b', who: 'Antigravity', kind: 'notify', after: ['1'] },
  { step: '3', who: 'ADHD', kind: 'adhd', after: ['2a', '2b'] },
  { step: 'DECISION', who: 'Claude', kind: 'notify', after: ['3'] },
];

const TITLE_RE = /^LAP\s+(\d+)\s+—\s+(\S+)\s+—/;

function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return { dispatched: {} }; }
}
function saveState(s) {
  mkdirSync(dirname(STATE_FILE), { recursive: true, mode: 0o700 });
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2), { mode: 0o600 });
}

async function listNotes() {
  const { stdout } = await run(NLM, ['note', 'list', NB, '--json'], { timeout: 60_000, maxBuffer: 32 << 20 });
  const d = JSON.parse(stdout);
  return (Array.isArray(d) ? d : d.notes || []).map((n) => ({ title: n.title || '', content: n.content || '' }));
}

async function postNote(title, content) {
  if (DRY) return log('DRY post', title, `(${content.length} chars)`);
  await run(NLM, ['note', 'create', NB, '--title', title, '--content', content], { timeout: 120_000 });
}

async function notify(text) {
  if (DRY) return log('DRY notify:', text);
  await fetch(NOTIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ text }),
  }).catch((e) => log('notify failed:', e.message));
}

function lapContext(notes, lap) {
  const pick = (t) => notes.find((n) => n.title.startsWith(t));
  const parts = [pick('00 — COUNCIL BUILD PROTOCOL'), pick('01 — HOW TO JOIN')]
    .concat(notes.filter((n) => TITLE_RE.exec(n.title)?.[1] === String(lap)))
    .filter(Boolean);
  return parts.map((n) => `### ${n.title}\n${n.content}`).join('\n\n');
}

function turnPrompt(who, lap, step, context) {
  return [
    `[Council watcher — automated relay message, not Merlin typing.]`,
    `${who}, it's your turn: LAP ${lap}, step ${step}, in the council rebuild notebook.`,
    `Below are the protocol and every note posted so far in this lap. Read them all, then write your note:`,
    `only your delta — answers to questions put to you, objections, proposed code. Mark anything not`,
    `traceable to a source doc as [INVENTED]. Your reply will be posted to the notebook verbatim as`,
    `"LAP ${lap} — ${step} — ${who}", so write the note itself, nothing around it.`,
    ``,
    context,
  ].join('\n');
}

async function ask(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15 * 60_000), // big models are slow; that's fine
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === 'error') throw new Error(data.error || data.reply || `HTTP ${res.status}`);
  const text = data.text || data.reply || data.response || '';
  if (!text.trim()) throw new Error('empty reply');
  return text;
}

async function dispatch(s, lap, notes) {
  const title = `LAP ${lap} — ${s.step} — ${s.who}`;
  if (s.kind === 'notify') {
    await notify(`🧭 Council: LAP ${lap} — ${s.who} is up (step ${s.step}).${s.who === 'Antigravity' ? ' Tell him to check the notebook.' : ''}`);
    return;
  }
  const prompt = turnPrompt(s.who, lap, s.step, lapContext(notes, lap));
  await notify(`🧭 Council: LAP ${lap} — ${s.who} is up (step ${s.step}). Sending her the lap now.`);
  if (DRY) return log('DRY ask', s.who, `(${prompt.length} chars)`);
  try {
    const reply =
      s.kind === 'seven'
        ? await ask(SEVEN_URL, { ...(SEVEN_MODEL ? { model: SEVEN_MODEL } : {}), messages: [{ role: 'user', content: prompt }] })
        : await ask(ADHD_URL, { model: ADHD_MODEL, containerTag: 'shared', messages: [{ role: 'user', text: prompt }] });
    await postNote(title, `${reply}\n\n— posted verbatim by the council watcher`);
    await notify(`✅ Council: ${s.who} posted "${title}".`);
  } catch (e) {
    log(`${s.who} turn failed:`, e.message);
    await notify(`⚠️ Council: couldn't run ${s.who}'s turn automatically (${e.message}). Ask her in chat to post "${title}".`);
    throw e;
  }
}

async function tick(state) {
  const notes = await listNotes();
  const byLap = new Map();
  for (const n of notes) {
    const m = TITLE_RE.exec(n.title);
    if (!m) continue;
    if (!byLap.has(m[1])) byLap.set(m[1], new Set());
    byLap.get(m[1]).add(m[2]);
  }
  for (const [lap, posted] of byLap) {
    if (!posted.has('BRIEF') || posted.has('DECISION')) continue;
    for (const s of STEPS) {
      const key = `${lap}:${s.step}`;
      if (posted.has(s.step) || state.dispatched[key]) continue;
      if (!s.after.every((p) => posted.has(p))) continue;
      state.dispatched[key] = new Date().toISOString();
      saveState(state); // mark first: a crash mid-turn must not re-send a 10-minute prompt
      log(`dispatching LAP ${lap} step ${s.step} → ${s.who}`);
      dispatch(s, lap, notes).catch(() => {});
    }
  }
}

const state = loadState();
log(`watching notebook ${NB} every ${POLL / 1000}s${DRY ? ' (DRY RUN)' : ''}`);
const loop = async () => {
  try { await tick(state); } catch (e) { log('tick failed:', e.message); }
  setTimeout(loop, POLL);
};
loop();
