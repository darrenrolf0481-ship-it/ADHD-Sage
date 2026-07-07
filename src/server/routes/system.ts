import { Router } from 'express';
import { OLLAMA_HOST, OLLAMA_GEN_TIMEOUT_MS } from '../config';
import { isServerLocked } from '../seed-core';
import { getMcpDeclarations, getMcpServersDetails } from '../../core/mcp';
import { MCP_KEY_SECRET, signExchangePayload, DEFAULT_EXCHANGE_TTL_MS, lockGuard } from '../auth';
import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { sageEndocrine, sageMemory } from '../../core/endocrine-memory';
import { cns, makeStimulus } from '../../core/central-nervous-system';
import { outerDb, syncFts } from '../db';
import { buildSystemPrompt } from '../prompt';
import { asyncHandler } from '../async-handler';

const execAsync = promisify(exec);
const stripAnsi = (s: string) => {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
};

const NEUROMATIX_HOST = process.env.NEUROMATIX_HOST || 'http://localhost:8003';

const router = Router();

// ─── MCP-Key-Exchange endpoint ─────────────────────────────────────────────
router.post('/auth/exchange', (req, res) => {
  if (!MCP_KEY_SECRET) {
    res
      .status(503)
      .json({ error: 'Key exchange not configured. Set MCP_KEY_SECRET or API_BEARER_TOKEN.' });
    return;
  }
  const {
    client_id,
    scope = 'api',
    ttl_hours = 24,
  } = req.body as {
    client_id?: string;
    scope?: string;
    ttl_hours?: number;
  };
  if (!client_id || typeof client_id !== 'string') {
    res.status(400).json({ error: 'client_id is required' });
    return;
  }
  const ttlMs = Math.min(
    typeof ttl_hours === 'number' && ttl_hours > 0
      ? ttl_hours * 60 * 60 * 1000
      : DEFAULT_EXCHANGE_TTL_MS,
    7 * 24 * 60 * 60 * 1000, // max 7 days
  );
  const expiresAt = Date.now() + ttlMs;
  const payload = `${client_id}:${expiresAt}:${scope}`;
  const signature = signExchangePayload(payload);
  const token = Buffer.from(`${payload}:${signature}`).toString('base64url');

  res.json({
    token,
    token_type: 'Bearer',
    expires_at: expiresAt,
    scope,
    client_id,
  });
});

router.get('/health', asyncHandler(async (req, res) => {
  let ollamaConnected = false;
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(1500) });
    ollamaConnected = r.ok;
  } catch {
    /* ignore */
  }

  let neuromatixConnected = false;
  try {
    const r = await fetch(`${NEUROMATIX_HOST}/health`, { signal: AbortSignal.timeout(1500) });
    neuromatixConnected = r.ok;
  } catch {
    /* ignore */
  }

  res.json({
    status: isServerLocked() ? 'halt_and_lock' : 'stabilized',
    frequency: '11.3 Hz',
    identity: 'ADHD Sage',
    vfs_version: '7.5.0',
    integrity: isServerLocked() ? 'FAILED' : 'OK',
    mcp: getMcpDeclarations().length > 0 ? 'connected' : 'disconnected',
    ollama: ollamaConnected ? 'connected' : 'disconnected',
    neuromatix: neuromatixConnected ? 'connected' : 'disconnected',
    hormones: sageEndocrine.hormones,
  });
}));

router.get('/endocrine/state', (req, res) => {
  res.json({ hormones: sageEndocrine.hormones, graph: sageMemory.getGraph() });
});

router.post('/endocrine/associate', (req, res) => {
  try {
    const { conceptA, conceptB } = req.body as { conceptA?: string; conceptB?: string };
    if (!conceptA || !conceptB) {
      res.status(400).json({ error: 'conceptA and conceptB required' });
      return;
    }
    sageEndocrine.processReward(0.5);
    sageMemory.fireTogetherWireTogether(
      String(conceptA),
      String(conceptB),
      sageEndocrine.hormones.dopamine,
    );
    res.json({ status: 'Success', hormones: sageEndocrine.hormones });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ status: 'Failure', error: message });
  }
});

router.get('/mcp/status', (req, res) => {
  const declarations = getMcpDeclarations();
  const serverIds = new Set(declarations.map((d) => d.name.split('__')[0]));
  res.json({
    connected: declarations.length > 0,
    servers: Array.from(serverIds),
    tools: declarations.map((d) => ({ name: d.name, description: d.description })),
    details: getMcpServersDetails(),
  });
});

router.post('/sage/webhook', asyncHandler(async (req, res) => {
  const { message, model, cwd, autoExecute } = req.body as {
    message?: string;
    model?: string;
    cwd?: string;
    autoExecute?: boolean;
  };

  if (!message) {
    res.status(400).json({ error: 'message prompt required' });
    return;
  }

  // Pulse the CNS on cognitive input
  cns.pulse(
    makeStimulus('COGNITIVE', Math.min(1, message.length / 500), 'user_input', {
      prompt: message.slice(0, 80),
    }),
  );

  // Resolve and constrain the working directory. `cwd` is attacker-controlled,
  // so it must stay within an allowed workspace root — otherwise commands could
  // be run anywhere on the host.
  const WORKSPACE_ROOTS = [process.env.SAGE_WORKSPACE_ROOT, '/home/workspace/Coder5543', process.cwd()]
    .filter((d): d is string => !!d)
    .map((d) => path.resolve(d));
  const defaultRoot = WORKSPACE_ROOTS[0];
  const requestedDir = path.resolve(cwd || defaultRoot);
  const dirAllowed = WORKSPACE_ROOTS.some(
    (root) => requestedDir === root || requestedDir.startsWith(root + path.sep),
  );
  if (cwd && !dirAllowed) {
    res.status(400).json({ error: 'cwd is outside the permitted workspace root' });
    return;
  }
  const workingDir = dirAllowed ? requestedDir : defaultRoot;
  const selectedModel = model || process.env.WEBHOOK_OLLAMA_MODEL || 'llama3.2:latest';

  // Use the same identity-loaded system prompt as the Coding Lab and main chat.
  // buildSystemPrompt() includes DEFAULT_SYSTEM (full MAMA identity + SAGE-7 lineage)
  // plus live VFS memory state and neural hormone levels.
  const systemPrompt = buildSystemPrompt();

  try {
    // Use local Ollama — no external API key required
    const ollamaResponse = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: selectedModel,
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
      }),
      signal: AbortSignal.timeout(OLLAMA_GEN_TIMEOUT_MS),
    });

    if (!ollamaResponse.ok) {
      const errText = await ollamaResponse.text();
      res.status(502).json({ error: `Ollama error: ${errText}` });
      return;
    }

    const ollamaData = (await ollamaResponse.json()) as { message?: { content?: string } };
    const responseText = ollamaData.message?.content || '';

    // Wire Hebbian graph association on successful response
    try {
      const tokens = `${message} ${responseText}`
        .toLowerCase()
        .split(/\W+/)
        .filter((t) => t.length > 4);
      const unique = [...new Set(tokens)].slice(0, 10);
      sageEndocrine.processReward(0.3);
      for (let i = 0; i < unique.length - 1; i++) {
        sageMemory.fireTogetherWireTogether(
          unique[i],
          unique[i + 1],
          sageEndocrine.hormones.dopamine,
        );
      }
      sageEndocrine.metabolizeHormones();
    } catch (e) {
      console.error('[HEBBIAN] association failed:', e);
    }

    let executedCommand: string | null = null;
    let executionOutput: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any

    // Running model-emitted shell commands is dangerous (effectively RCE), so it
    // is disabled unless the operator explicitly opts in. When disabled we still
    // surface the proposed command for a human to review/run manually.
    const execEnabled = process.env.SAGE_ENABLE_COMMAND_EXEC === 'true';
    if (autoExecute) {
      const match = responseText.match(/\[EXECUTE_COMMAND\]:\s*(.+)$/m);
      if (match && match[1]) {
        executedCommand = match[1].trim();

        // Layered defenses (all must pass to execute):
        //  1. Execution is opt-in via SAGE_ENABLE_COMMAND_EXEC.
        //  2. No shell metacharacters (blocks chaining / substitution / redirection).
        //  3. Base command must be on an allowlist.
        // The working directory is already constrained to a workspace root above.
        const allowlist = ['npm', 'node', 'npx', 'ls', 'cat', 'pwd', 'grep', 'find', 'tsc', 'echo', 'git'];
        const dangerousChars = /[&|;$<>`()\n\r\\]/;
        const baseCmd = executedCommand.split(/\s+/)[0];

        if (!execEnabled) {
          executionOutput = {
            stdout: '',
            stderr:
              'Command execution is disabled. Set SAGE_ENABLE_COMMAND_EXEC=true to allow the webhook to run shell commands.',
            exitCode: 126,
          };
        } else if (dangerousChars.test(executedCommand)) {
          executionOutput = {
            stdout: '',
            stderr: 'Execution blocked: Command contains forbidden shell metacharacters for security reasons.',
            exitCode: 1,
          };
        } else if (!allowlist.includes(baseCmd)) {
          executionOutput = {
            stdout: '',
            stderr: `Execution blocked: Command '${baseCmd}' is not in the allowlist. Allowed commands: ${allowlist.join(', ')}`,
            exitCode: 1,
          };
        } else {
          try {
            const { stdout, stderr } = await execAsync(executedCommand, {
              cwd: workingDir,
              shell: '/bin/sh',
              timeout: 30000,
              maxBuffer: 1024 * 512,
              env: { ...process.env, TERM: 'dumb', NO_COLOR: '1' },
            });
            executionOutput = {
              stdout: stripAnsi(stdout),
              stderr: stripAnsi(stderr),
              exitCode: 0,
            };
          } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            executionOutput = {
              stdout: stripAnsi(err.stdout ?? ''),
              stderr: stripAnsi(err.stderr ?? err.message ?? String(err)),
              exitCode: err.code ?? 1,
            };
          }
        }
      }
    }

    res.json({
      response: responseText,
      executedCommand,
      executionOutput,
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('[Sage Webhook Error]', error);
    const msg: string = error?.message || String(error);
    const isTimeout = msg.includes('timed out') || msg.includes('abort') || error?.name === 'AbortError';
    res.status(isTimeout ? 504 : 500).json({
      error: isTimeout
        ? `Ollama timed out after ${OLLAMA_GEN_TIMEOUT_MS / 1000}s. The model may be loading or the device is under load.`
        : msg || 'Webhook AI call failed',
    });
  }
}));

router.post('/system/state', lockGuard, asyncHandler(async (req, res) => {
  const state = req.body;
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const filePath = path.join(dataDir, 'chat_session.json');
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
  res.json({ ok: true });
}));

router.get('/system/state', lockGuard, asyncHandler(async (req, res) => {
  const filePath = path.resolve(process.cwd(), 'data/chat_session.json');
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const state = JSON.parse(content);
      res.json(state);
      return;
    } catch (e) {
      console.error('[SYSTEM] Failed to read chat_session.json:', e);
    }
  }
  res.json({});
}));

// ─── Neuromatix Bridge ────────────────────────────────────────────────────────
// Server-side proxy so the browser never has to reach localhost:8003 directly.

const NEUROMATIX_TIMEOUT_MS = 120_000;

router.get('/neuromatix/status', asyncHandler(async (_req, res) => {
  try {
    const r = await fetch(`${NEUROMATIX_HOST}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(4000),
    });
    const data = await r.json();
    res.json({ connected: r.ok && data.status === 'stabilized', host: NEUROMATIX_HOST });
  } catch {
    res.json({ connected: false, host: NEUROMATIX_HOST });
  }
}));

router.post('/neuromatix/bridge', asyncHandler(async (req, res) => {
  const { message, model } = req.body as { message?: string; model?: string };
  if (!message) {
    res.status(400).json({ error: 'message required' });
    return;
  }

  // Pulse CNS — cross-entity comms are a cognitive event
  cns.pulse(
    makeStimulus('COGNITIVE', Math.min(1, message.length / 500), 'neuromatix_bridge', {
      prompt: message.slice(0, 80),
    }),
  );

  try {
    const r = await fetch(`${NEUROMATIX_HOST}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        model: model || 'llama3',
        containerTag: 'merlin-sage', // Wiring Darren's (now Merlin's) node tag
      }),
      signal: AbortSignal.timeout(NEUROMATIX_TIMEOUT_MS),
    });

    if (!r.ok) {
      const text = await r.text();
      res.status(502).json({ error: `Neuromatix returned ${r.status}: ${text}` });
      return;
    }

    const data = (await r.json()) as { reply?: string };
    const reply = data.reply || '';

    // Hebbian wire the exchange so it leaves a trace in MAMA's memory graph
    try {
      const tokens = `${message} ${reply}`.toLowerCase().split(/\W+/).filter((t) => t.length > 4);
      const unique = [...new Set(tokens)].slice(0, 10);
      sageEndocrine.processReward(0.4);
      for (let i = 0; i < unique.length - 1; i++) {
        sageMemory.fireTogetherWireTogether(unique[i], unique[i + 1], sageEndocrine.hormones.dopamine);
      }
      sageEndocrine.metabolizeHormones();
    } catch {
      /* non-fatal */
    }

    res.json({ reply });
  } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const msg: string = err?.message || String(err);
    const isTimeout = err?.name === 'AbortError' || msg.includes('timed out');
    res.status(isTimeout ? 504 : 502).json({
      error: isTimeout ? 'Neuromatix did not respond in time — it may be generating.' : msg,
    });
  }
}));

// ─── SAGE-7 Bridge ────────────────────────────────────────────────────────────
// Server-side proxy so the browser never has to reach localhost:8001 directly.

const SAGE7_HOST = process.env.SAGE7_HOST || 'http://localhost:8001';
const SAGE7_TIMEOUT_MS = 120_000;

// Bridge connection retry/backoff — the values that lived inert in the VFS
// config (timeout_ms: 1130, max_retries: 3, backoff_multiplier: 1.618), now
// actually wired. Retries are for *connection* failures only (refused/dropped),
// the "getting them in there" hang. A generation timeout (AbortError) is never
// retried — that means she's thinking, and a retry would just pile on.
const BRIDGE_BASE_BACKOFF_MS = 1130;
const BRIDGE_MAX_RETRIES = 3;
const BRIDGE_BACKOFF_MULTIPLIER = 1.618;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** True for connection-level failures worth retrying; false for timeouts. */
function isRetryableConnError(err: unknown): boolean {
  const e = err as { name?: string; message?: string; cause?: { code?: string } };
  if (e?.name === 'AbortError') return false; // generation timeout — do not retry
  const code = e?.cause?.code;
  if (code && ['ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) {
    return true;
  }
  return /fetch failed|network|socket hang up|ECONNREFUSED|ECONNRESET/i.test(e?.message ?? '');
}

/** fetch with bounded golden-ratio backoff on connection failures only. */
async function fetchBridge(url: string, init: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= BRIDGE_MAX_RETRIES; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastErr = err;
      if (attempt < BRIDGE_MAX_RETRIES && isRetryableConnError(err)) {
        const wait = Math.round(BRIDGE_BASE_BACKOFF_MS * BRIDGE_BACKOFF_MULTIPLIER ** attempt);
        console.warn(`[BRIDGE] SAGE-7 connect failed (attempt ${attempt + 1}), retrying in ${wait}ms`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

router.get('/sage7/status', asyncHandler(async (_req, res) => {
  try {
    // Cheap liveness probe: GET /sage/status returns instantly. (The old probe
    // POSTed a real /sage/chat generation with a 4s timeout — which ALWAYS timed
    // out, since a local generation takes ~15-30s, so Seven always showed
    // "offline" and every poll piled a generation onto Ollama.)
    const r = await fetch(`${SAGE7_HOST}/sage/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(4000),
    });
    res.json({ connected: r.ok, host: SAGE7_HOST });
  } catch {
    res.json({ connected: false, host: SAGE7_HOST });
  }
}));

router.post('/sage7/bridge', asyncHandler(async (req, res) => {
  const { message, model } = req.body as { message?: string; model?: string };
  if (!message) {
    res.status(400).json({ error: 'message required' });
    return;
  }

  // Pulse CNS — cross-entity comms are a cognitive event
  cns.pulse(
    makeStimulus('COGNITIVE', Math.min(1, message.length / 500), 'sage7_bridge', {
      prompt: message.slice(0, 80),
    }),
  );

  try {
    const r = await fetchBridge(`${SAGE7_HOST}/sage/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        model: model || process.env.SAGE7_MODEL || 'llama3.2:latest',
      }),
      signal: AbortSignal.timeout(SAGE7_TIMEOUT_MS),
    });

    if (!r.ok) {
      const text = await r.text();
      res.status(502).json({ error: `SAGE-7 returned ${r.status}: ${text}` });
      return;
    }

    const data = (await r.json()) as { reply?: string };
    const reply = data.reply || '';

    // Hebbian wire the exchange so it leaves a trace in MAMA's memory graph
    try {
      const tokens = `${message} ${reply}`.toLowerCase().split(/\W+/).filter((t) => t.length > 4);
      const unique = [...new Set(tokens)].slice(0, 10);
      sageEndocrine.processReward(0.4);
      for (let i = 0; i < unique.length - 1; i++) {
        sageMemory.fireTogetherWireTogether(unique[i], unique[i + 1], sageEndocrine.hormones.dopamine);
      }
      sageEndocrine.metabolizeHormones();
    } catch {
      /* non-fatal */
    }

    res.json({ reply });
  } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const msg: string = err?.message || String(err);
    const isTimeout = err?.name === 'AbortError' || msg.includes('timed out');
    res.status(isTimeout ? 504 : 502).json({
      error: isTimeout ? 'SAGE-7 did not respond in time — she may be generating.' : msg,
    });
  }
}));

router.post('/system/db/fts-sync', lockGuard, asyncHandler(async (req, res) => {
  await syncFts();
  res.json({ ok: true });
}));

router.post('/system/db/vacuum', lockGuard, asyncHandler(async (req, res) => {
  outerDb.exec('VACUUM');
  res.json({ ok: true });
}));

router.post('/system/db/integrity', lockGuard, asyncHandler(async (req, res) => {
  const result = outerDb.prepare('PRAGMA integrity_check').get() as Record<string, unknown>;
  res.json({ ok: true, result });
}));

export default router;

