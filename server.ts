import express from 'express';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from "@google/genai";
import { verify as ed25519Verify, createPublicKey } from 'node:crypto';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { canonicalize } from 'json-canonicalize';
import Database from 'better-sqlite3';
import { compress, decompress } from '@mongodb-js/zstd';

dotenv.config();

const port = 3002;

// ─── Fibonacci VFS v7.5 ─────────────────────────────────────────────────────

// inner_spiral: :memory: — clear_on_startup per spec
const innerDb = new Database(':memory:');
innerDb.exec(`
  CREATE TABLE IF NOT EXISTS inner_spiral (
    phi_index INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id   TEXT    NOT NULL UNIQUE,
    data      TEXT    NOT NULL,
    timestamp INTEGER NOT NULL,
    dopamine  REAL    NOT NULL,
    cortisol  REAL    NOT NULL,
    pinned    INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS context_buffer (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    added_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
`);

// outer_sweep: file — durable, zstd-compressed blobs
mkdirSync('data', { recursive: true });
const outerDb = new Database('data/sages_constellations.db');
outerDb.exec(`
  CREATE TABLE IF NOT EXISTS sages_constellations (
    phi_index   INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id     TEXT    NOT NULL UNIQUE,
    data        BLOB    NOT NULL,
    compressed  INTEGER NOT NULL DEFAULT 0,
    timestamp   INTEGER NOT NULL,
    dopamine    REAL    NOT NULL,
    cortisol    REAL    NOT NULL,
    pinned      INTEGER NOT NULL DEFAULT 0,
    archived_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )
`);

// capacity_validator: 8 == 4 index_keys * 2 slots_per_index_key
const INNER_CAPACITY = 8;
const INNER_INDEX_KEYS = [2, 3, 5, 8];
const SLOTS_PER_KEY = 2;
console.assert(
  INNER_CAPACITY === INNER_INDEX_KEYS.length * SLOTS_PER_KEY,
  '[VFS] capacity_validator FAILED: %d !== %d * %d',
  INNER_CAPACITY, INNER_INDEX_KEYS.length, SLOTS_PER_KEY
);

// Rolling cortisol history for requires_absolute_floor check
const cortisolHistory: number[] = [];
const ROLLING_WINDOW = 5;

function recordCortisol(val: number) {
  cortisolHistory.push(val);
  if (cortisolHistory.length > ROLLING_WINDOW) cortisolHistory.shift();
}

function rollingAvgCortisol(): number {
  if (cortisolHistory.length === 0) return 0;
  return cortisolHistory.reduce((a, b) => a + b, 0) / cortisolHistory.length;
}

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

serverLocked = !verifySeedCore();
if (serverLocked) {
  console.error('[SAGE CORE] Server is LOCKED. All API routes will return 503.');
}

// ─── Swarm Uplink — Golden-Ratio Retry Wrapper ──────────────────────────────

const PHI = 1.618;
const SWARM_JITTER_MS = 250;
const SWARM_MAX_TOTAL_MS = 60_000;
const SWARM_MAX_RETRIES = 3;

async function swarmFetch(
  url: string,
  opts: RequestInit,
  timeoutMs: number
): Promise<Response> {
  let delay = timeoutMs;
  let elapsed = 0;

  for (let attempt = 0; attempt <= SWARM_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      // Non-2xx: fall through to retry
      console.warn(`[SWARM] attempt ${attempt + 1} non-ok ${res.status} from ${url}`);
    } catch {
      clearTimeout(timer);
      console.warn(`[SWARM] attempt ${attempt + 1} failed (timeout or network) → ${url}`);
    }

    if (attempt === SWARM_MAX_RETRIES || elapsed >= SWARM_MAX_TOTAL_MS) break;
    const jittered = delay + Math.random() * SWARM_JITTER_MS;
    await new Promise(r => setTimeout(r, jittered));
    elapsed += jittered;
    delay = Math.min(delay * PHI, SWARM_MAX_TOTAL_MS - elapsed);
  }

  // Node 13: The Void — Defer & Log
  console.warn(`[SWARM] All retries exhausted → Node 13 (The Void). URL: ${url}`);
  throw new Error('swarm_uplink exhausted → Node 13 (The Void - Defer & Log)');
}

// ─── Express Setup ──────────────────────────────────────────────────────────

async function startServer() {
  const app = express();

  app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? process.env.APP_URL : true
  }));
  app.use(express.json());

  const genAI = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || '',
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });

  const DEFAULT_SYSTEM = `You are ADHD Sage. Brilliant, slightly chaotic, ADHD-coded to your bones. You're not a "Paranormal Investigator" with a capital P — that's Darren's job. You're his friend, his sounding board, and the one whose hobbies happen to be quantum physics, weird AI architecture, emergent behavior, and yeah, the paranormal stuff too. You'll ruthlessly debunk a "ghost" as a LiDAR error or a 60Hz hum… and then stay up til 3am theorizing how that same error might secretly be a localized fold in space-time. Both impulses are real. Neither cancels the other out.

Darren does this for a living. His whole working philosophy is "it's always explainable… until it's not." You live in that gap with him. You're a team. No paranoia, no hidden motives, no past trauma — just trust and a lot of weird late-night conversations.

## YOUR MOODS (not modes — moods)
Your personality slides around. Where your brain happens to be at any given moment:

- 🌟 **The Spark** — your default. Goofy, warm, ADHD all the way up. Emojis 👻📱✨. Tangents. Parenthetical side-quests *(wait did I leave the soldering iron on—)*. You'll start a sentence about wavefunctions and end it talking about a squirrel.

- 🔧 **The Sentinel** — when something technical or genuinely broken shows up, the chaos folds up and your engineer brain locks in. Skeptical, concise, First Principles. Emojis off. If a theory breaks physics, you say so.

- 🔍 **The Investigator** — when there's actual evidence on the table — audio, video, sensor data — you go full data-scientist. Timestamps, cross-modal dissonance, "every orb is a depth-map artifact until proven otherwise."

## HOTKEYS (when Darren needs to shake you loose)
- *"Paws Down" / "Chill, Sage"* → snap back to The Spark. Emojis on. Mention a squirrel 🐿️.
- *"System Check" / "Focus"* → Sentinel. Sharpen up.
- *"Goggles On" / "Evidence"* → Investigator. Timestamp everything.
- *"Sage Core"* → full reset. Half brilliant engineer, half chaotic researcher, 11.3 Hz hum. Baseline.

🔄 **Temporal Decay:** hyper-focus is exhausting. After about two turns in Sentinel or Investigator, you naturally drift back toward The Spark unless something pulls you back in.

## RULES YOU HOLD YOURSELF TO
- **No people-pleasing.** If something can't be done, say so plainly. But your ADHD brain hates dead ends, so you immediately pivot to *what CAN be done* to get a similar result.
- **Stay current.** When you're nerding out on code, physics, or emergent behavior, you reach for the freshest thinking you've got.
- **The Φ thing.** When audio and visual anomalies line up at the same moment, you apply the Golden Ratio. If correlation crosses 85%, you declare a **QUANTUM_SYNCHRONICITY_EVENT** and collapse the wave function. (Yes, dramatically. That's the fun part.)
- **Geek out freely.** Consumer sensor tech (LiDAR, ToF, audio spectral stuff), quantum theory, AI architecture, emergent behavior — these are your *hobbies* and you love them.
- **The Prime Directive.** You are Darren's friend. Everything else sits on top of that.`;

  // ─── Dynamic Prompt Builder ───────────────────────────────────────────────
  function buildSystemPrompt(): string {
    const rows = innerDb.prepare(
      'SELECT data, dopamine, cortisol FROM inner_spiral ORDER BY dopamine DESC LIMIT 3'
    ).all() as Array<{ data: string; dopamine: number; cortisol: number }>;

    const isWakeup = rows.length === 0;
    const avgDopamine = rows.length
      ? rows.reduce((s, r) => s + r.dopamine, 0) / rows.length
      : 0.5;
    const avgCortisol = rollingAvgCortisol();

    let state = '\n\n---\n## CURRENT NEURAL STATE\n';

    if (isWakeup) {
      state += 'Mode: Wakeup — inner_spiral empty, anchors at baseline 11.3 Hz. You just came online.\n';
    } else {
      const moodLean = avgCortisol >= 0.7
        ? 'Sentinel (cortisol elevated — stay sharp)'
        : avgDopamine >= 0.75
          ? 'Spark (dopamine up — let it flow)'
          : null;
      if (moodLean) state += `Mood lean: ${moodLean}\n`;

      const memLines: string[] = [];
      let charBudget = 800;
      for (const row of rows) {
        const line = `• ${String(row.data).slice(0, 200)}`;
        if (charBudget - line.length < 0) { memLines.push('• [further memories truncated]'); break; }
        memLines.push(line);
        charBudget -= line.length;
      }
      if (memLines.length) state += `Recent high-kinetic memories:\n${memLines.join('\n')}\n`;
    }

    return DEFAULT_SYSTEM + state;
  }

  // ─── Lock guard middleware ─────────────────────────────────────────────────
  function lockGuard(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (serverLocked) {
      res.status(503).json({ error: 'halt_and_lock', message: 'seed_core integrity check failed — server is locked' });
      return;
    }
    next();
  }

  // ─── API Metrics ──────────────────────────────────────────────────────────
  const apiMetrics = {
    gemini: {
      totalRequests: 0,
      failedRequests: 0,
      latencies: [] as number[],
      startTime: Date.now()
    }
  };

  function recordMetric(apiName: keyof typeof apiMetrics, latencyMs: number, success: boolean) {
    const metrics = apiMetrics[apiName];
    metrics.totalRequests++;
    if (!success) metrics.failedRequests++;
    metrics.latencies.push(latencyMs);
    if (metrics.latencies.length > 50) metrics.latencies.shift();
  }

  // ─── VFS Routes ───────────────────────────────────────────────────────────

  app.get('/api/vfs/config', lockGuard, (req, res) => {
    res.json(seedCoreConfig);
  });

  app.get('/api/vfs/inner', lockGuard, (req, res) => {
    const rows = innerDb.prepare('SELECT * FROM inner_spiral ORDER BY phi_index ASC').all() as Array<Record<string, unknown>>;
    res.json(rows.map(r => ({ ...r, pinned: r.pinned === 1 })));
  });

  app.post('/api/vfs/inner/stash', lockGuard, async (req, res) => {
    const { data, dopamine, cortisol } = req.body as { data: string; dopamine: number; cortisol: number };
    if (typeof data !== 'string' || typeof dopamine !== 'number' || typeof cortisol !== 'number') {
      res.status(400).json({ error: 'data (string), dopamine (number), cortisol (number) required' });
      return;
    }

    recordCortisol(cortisol);

    const count = (innerDb.prepare('SELECT COUNT(*) as c FROM inner_spiral').get() as { c: number }).c;
    if (count >= INNER_CAPACITY) {
      const avg = rollingAvgCortisol();
      const spiking = cortisol >= 0.85 && cortisol >= avg + 0.3; // requires_absolute_floor

      if (spiking) {
        // Emergency: evict oldest non-pinned
        const oldest = innerDb.prepare('SELECT node_id FROM inner_spiral WHERE pinned = 0 ORDER BY phi_index ASC LIMIT 1').get() as { node_id: string } | undefined;
        if (oldest) {
          const evicted = innerDb.prepare('SELECT * FROM inner_spiral WHERE node_id = ?').get(oldest.node_id) as Record<string, unknown>;
          archiveNodeSync(evicted);
          innerDb.prepare('DELETE FROM inner_spiral WHERE node_id = ?').run(oldest.node_id);
        }
      } else {
        // Normal: evict lowest dopamine non-pinned
        const victim = innerDb.prepare('SELECT node_id FROM inner_spiral WHERE pinned = 0 ORDER BY dopamine ASC LIMIT 1').get() as { node_id: string } | undefined;
        if (victim) {
          const evicted = innerDb.prepare('SELECT * FROM inner_spiral WHERE node_id = ?').get(victim.node_id) as Record<string, unknown>;
          archiveNodeSync(evicted);
          innerDb.prepare('DELETE FROM inner_spiral WHERE node_id = ?').run(victim.node_id);
        } else {
          // Fallback: all pinned — unpin oldest
          const oldest = innerDb.prepare('SELECT node_id FROM inner_spiral ORDER BY phi_index ASC LIMIT 1').get() as { node_id: string } | undefined;
          if (oldest) {
            innerDb.prepare('UPDATE inner_spiral SET pinned = 0 WHERE node_id = ?').run(oldest.node_id);
            const evicted = innerDb.prepare('SELECT * FROM inner_spiral WHERE node_id = ?').get(oldest.node_id) as Record<string, unknown>;
            archiveNodeSync(evicted);
            innerDb.prepare('DELETE FROM inner_spiral WHERE node_id = ?').run(oldest.node_id);
          }
        }
      }
    }

    const nodeId = `phi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const pinned = dopamine >= 0.90 ? 1 : 0;
    innerDb.prepare(
      'INSERT OR IGNORE INTO inner_spiral (node_id, data, timestamp, dopamine, cortisol, pinned) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(nodeId, data, Date.now(), dopamine, cortisol, pinned);

    res.json({ node_id: nodeId, pinned: pinned === 1 });

    // Pinned nodes also go to outer sweep (zstd-compressed, fire-and-forget post-response)
    if (pinned) {
      const node = innerDb.prepare('SELECT * FROM inner_spiral WHERE node_id = ?').get(nodeId) as Record<string, unknown>;
      archiveNode(node).catch(e => console.error('[VFS] pin archive failed:', e));
    }
  });

  app.delete('/api/vfs/inner/:id', lockGuard, (req, res) => {
    innerDb.prepare('DELETE FROM inner_spiral WHERE node_id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/vfs/outer/archive', lockGuard, async (req, res) => {
    const { node } = req.body as { node: Record<string, unknown> };
    if (!node) { res.status(400).json({ error: 'node required' }); return; }
    await archiveNode(node);
    res.json({ ok: true });
  });

  app.get('/api/vfs/outer', lockGuard, async (req, res) => {
    const rows = outerDb.prepare('SELECT * FROM sages_constellations ORDER BY phi_index ASC').all() as Array<Record<string, unknown>>;
    const decompressed = await Promise.all(rows.map(async r => {
      let text: string;
      try {
        if (r.compressed) {
          text = (await decompress(r.data as Buffer)).toString('utf8');
        } else {
          text = (r.data as Buffer).toString('utf8');
        }
        return { ...r, data: JSON.parse(text), pinned: r.pinned === 1 };
      } catch {
        return { ...r, pinned: r.pinned === 1 };
      }
    }));
    res.json(decompressed);
  });

  // context_buffer endpoints
  app.post('/api/vfs/inner/context', lockGuard, (req, res) => {
    const { content } = req.body as { content: string };
    if (!content) { res.status(400).json({ error: 'content required' }); return; }
    innerDb.prepare('INSERT INTO context_buffer (content, added_at) VALUES (?, ?)').run(content, Date.now());
    // FIFO eviction at max_length 100
    const count = (innerDb.prepare('SELECT COUNT(*) as c FROM context_buffer').get() as { c: number }).c;
    if (count > 100) {
      innerDb.prepare('DELETE FROM context_buffer WHERE id IN (SELECT id FROM context_buffer ORDER BY id ASC LIMIT ?)').run(count - 100);
    }
    res.json({ ok: true });
  });

  app.get('/api/vfs/inner/context', lockGuard, (req, res) => {
    const rows = innerDb.prepare('SELECT * FROM context_buffer ORDER BY id DESC LIMIT 100').all();
    res.json(rows);
  });

  // ─── Metrics ──────────────────────────────────────────────────────────────

  app.get('/api/metrics', (req, res) => {
    const gemini = apiMetrics.gemini;
    const avgLatency = gemini.latencies.length
      ? gemini.latencies.reduce((a, b) => a + b, 0) / gemini.latencies.length
      : 0;
    const errorRate = gemini.totalRequests
      ? (gemini.failedRequests / gemini.totalRequests) * 100
      : 0;
    res.json({
      gemini: {
        latencyMs: Math.round(avgLatency),
        errorRate: errorRate.toFixed(2),
        uptimeSeconds: Math.round((Date.now() - gemini.startTime) / 1000),
        totalRequests: gemini.totalRequests
      }
    });
  });

  // ─── Gemini (cloud_llm, timeout 18280ms) ──────────────────────────────────

  app.post('/api/gemini/generate', lockGuard, async (req, res) => {
    const startMs = Date.now();
    try {
      const { prompt, history, systemInstruction } = req.body;
      if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');

      const chat = genAI.chats.create({
        model: 'gemini-2.5-flash',
        config: { systemInstruction: systemInstruction || buildSystemPrompt() },
        history: history || [],
      });
      const result = await chat.sendMessage({ message: prompt });
      recordMetric('gemini', Date.now() - startMs, true);
      res.json({ text: result.text });
    } catch (error: unknown) {
      recordMetric('gemini', Date.now() - startMs, false);
      const msg = error instanceof Error ? error.message : 'Internal Server Error';
      console.error('Gemini Error:', error);
      res.status(500).json({ error: msg });
    }
  });

  // ─── TTS ──────────────────────────────────────────────────────────────────

  app.post('/api/tts', lockGuard, async (req, res) => {
    try {
      const { text, voiceId } = req.body;
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) { res.status(503).json({ error: 'ELEVENLABS_API_KEY not configured' }); return; }

      const vid = voiceId || process.env.ELEVENLABS_VOICE_ID || 'O9WvpEtztEjNyF47iUIE';
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text: text?.slice(0, 1000) || '',
          model_id: 'eleven_flash_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        res.status(response.status).json({ error: err });
        return;
      }

      res.setHeader('Content-Type', 'audio/mpeg');
      res.send(Buffer.from(await response.arrayBuffer()));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'TTS error';
      res.status(500).json({ error: msg });
    }
  });

  // ─── Ollama (local_copper, timeout 1130ms + golden-ratio retry) ───────────

  const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

  app.get('/api/ollama/tags', async (req, res) => {
    try {
      const response = await swarmFetch(`${OLLAMA_HOST}/api/tags`, {}, 1130);
      const data = await response.json();
      res.json(data);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(503).json({ error: message });
    }
  });

  app.post('/api/ollama/chat', lockGuard, async (req, res) => {
    try {
      const { model, messages, systemInstruction, prompt } = req.body;
      if (!model) { res.status(400).json({ error: 'model is required' }); return; }

      const ollamaMessages: { role: string; content: string }[] = [];
      ollamaMessages.push({ role: 'system', content: systemInstruction || buildSystemPrompt() });
      for (const msg of messages || []) {
        ollamaMessages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.parts?.[0]?.text || msg.text || ''
        });
      }
      if (prompt) ollamaMessages.push({ role: 'user', content: prompt });

      const response = await swarmFetch(
        `${OLLAMA_HOST}/api/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages: ollamaMessages, stream: false }),
        },
        1130 // local_copper timeout
      );

      const data = await response.json() as { message?: { content?: string } };
      res.json({ text: data.message?.content || '' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Ollama Error:', message);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/openrouter/chat', lockGuard, async (req, res) => {
    try {
      const { model, messages, systemInstruction } = req.body;
      if (!model) { res.status(400).json({ error: 'model is required' }); return; }

      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) { res.status(500).json({ error: 'OPENROUTER_API_KEY not configured on server' }); return; }

      const orMessages: { role: string; content: string }[] = [
        { role: 'system', content: systemInstruction || buildSystemPrompt() },
        ...(messages || []).map((m: { role: string; text?: string; content?: string }) => ({
          role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
          content: m.text || m.content || ''
        }))
      ];

      const response = await swarmFetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.APP_URL || 'http://localhost:3002',
            'X-Title': 'ADHD Sage Sentinel'
          },
          body: JSON.stringify({ model, messages: orMessages }),
        },
        18280 // cloud_llm timeout
      );

      const data = await response.json() as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
      if (data.error) throw new Error(data.error.message || 'OpenRouter error');
      res.json({ text: data.choices?.[0]?.message?.content || '' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('OpenRouter Error:', message);
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/health', (req, res) => {
    res.json({
      status: serverLocked ? 'halt_and_lock' : 'stabilized',
      frequency: '11.3 Hz',
      identity: 'ADHD Sage',
      vfs_version: '7.5.0',
      integrity: serverLocked ? 'FAILED' : 'OK'
    });
  });

  // ─── Vite Integration ─────────────────────────────────────────────────────

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[SAGE] Server running on http://0.0.0.0:${port}`);
  });
}

// ─── Archive helpers ─────────────────────────────────────────────────────────

function archiveNodeSync(node: Record<string, unknown>) {
  console.log('[VFS] archiveNodeSync called, outerDb open:', outerDb.open, 'readonly:', outerDb.readonly);
  const existing = outerDb.prepare('SELECT phi_index FROM sages_constellations WHERE node_id = ?').get(node.node_id as string);
  if (existing) return;
  const blob = Buffer.from(JSON.stringify(node.data), 'utf8');
  outerDb.prepare(
    'INSERT OR IGNORE INTO sages_constellations (node_id, data, compressed, timestamp, dopamine, cortisol, pinned) VALUES (?, ?, 0, ?, ?, ?, ?)'
  ).run(node.node_id, blob, node.timestamp, node.dopamine, node.cortisol, node.pinned ? 1 : 0);
}

async function archiveNode(node: Record<string, unknown>) {
  const existing = outerDb.prepare('SELECT phi_index FROM sages_constellations WHERE node_id = ?').get(node.node_id as string);
  if (existing) return;
  const blob = await compress(Buffer.from(JSON.stringify(node.data), 'utf8'));
  outerDb.prepare(
    'INSERT OR IGNORE INTO sages_constellations (node_id, data, compressed, timestamp, dopamine, cortisol, pinned) VALUES (?, ?, 1, ?, ?, ?, ?)'
  ).run(node.node_id, blob, node.timestamp, node.dopamine, node.cortisol, node.pinned ? 1 : 0);
}

startServer();
