import { Router } from 'express';
import { OLLAMA_HOST } from '../config';
import { isServerLocked } from '../seed-core';
import { getMcpDeclarations } from '../../core/mcp';
import { MCP_KEY_SECRET, signExchangePayload, DEFAULT_EXCHANGE_TTL_MS } from '../auth';
import { promisify } from 'util';
import { exec } from 'child_process';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { sageEndocrine, sageMemory } from '../../core/endocrine-memory';
import { cns, makeStimulus } from '../../core/central-nervous-system';

const execAsync = promisify(exec);

// Build ANSI-stripping regexes without literal control chars in source
// (eslint no-control-regex). ESC = 0x1b, BEL = 0x07.
const ANSI_ESC = String.fromCharCode(27);
const ANSI_BEL = String.fromCharCode(7);
const ANSI_SGR_RE = new RegExp(ANSI_ESC + '\\[[0-9;]*[a-zA-Z]', 'g');
const ANSI_OSC_RE = new RegExp(ANSI_ESC + '\\][^' + ANSI_BEL + ']*' + ANSI_BEL, 'g');
const stripAnsi = (s: string) => s.replace(ANSI_SGR_RE, '').replace(ANSI_OSC_RE, '');

// Command execution is OFF by default to prevent prompt-injection RCE via
// model-emitted [EXECUTE_COMMAND] tags. Set SAGE_AUTO_EXECUTE=1 to enable it,
// and SAGE_EXEC_ROOTS (comma-separated) to confine the cwd (default /home/workspace).
const AUTO_EXECUTE_ENABLED = process.env.SAGE_AUTO_EXECUTE === '1';
const EXEC_ROOTS = (process.env.SAGE_EXEC_ROOTS || '/home/workspace')
  .split(',')
  .map(r => r.trim())
  .filter(Boolean);
type ExecResult = { stdout: string; stderr: string; exitCode: number };


const router = Router();

// ─── MCP-Key-Exchange endpoint ─────────────────────────────────────────────
router.post('/auth/exchange', (req, res) => {
  if (!MCP_KEY_SECRET) {
    res.status(503).json({ error: 'Key exchange not configured. Set MCP_KEY_SECRET or API_BEARER_TOKEN.' });
    return;
  }
  const { client_id, scope = 'api', ttl_hours = 24 } = req.body as {
    client_id?: string; scope?: string; ttl_hours?: number;
  };
  if (!client_id || typeof client_id !== 'string') {
    res.status(400).json({ error: 'client_id is required' });
    return;
  }
  const ttlMs = Math.min(
    typeof ttl_hours === 'number' && ttl_hours > 0 ? ttl_hours * 60 * 60 * 1000 : DEFAULT_EXCHANGE_TTL_MS,
    7 * 24 * 60 * 60 * 1000 // max 7 days
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
    client_id
  });
});

router.get('/health', async (req, res) => {
  let ollamaConnected = false;
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(1500) });
    ollamaConnected = r.ok;
  } catch { /* ignore */ }
  res.json({
    status: isServerLocked() ? 'halt_and_lock' : 'stabilized',
    frequency: '11.3 Hz',
    identity: 'ADHD Sage',
    vfs_version: '7.5.0',
    integrity: isServerLocked() ? 'FAILED' : 'OK',
    mcp: getMcpDeclarations().length > 0 ? 'connected' : 'disconnected',
    ollama: ollamaConnected ? 'connected' : 'disconnected',
    hormones: sageEndocrine.hormones
  });
});

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
      sageEndocrine.hormones.dopamine
    );
    res.json({ status: 'Success', hormones: sageEndocrine.hormones });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ status: 'Failure', error: message });
  }
});

router.get('/mcp/status', (req, res) => {
  const declarations = getMcpDeclarations();
  const serverIds = new Set(declarations.map(d => d.name.split('__')[0]));
  res.json({
    connected: declarations.length > 0,
    servers: Array.from(serverIds),
    tools: declarations.map(d => ({ name: d.name, description: d.description }))
  });
});

router.post('/sage/webhook', async (req, res) => {
  const { message, apiKey, model, cwd, autoExecute } = req.body as {
    message?: string;
    apiKey?: string;
    model?: string;
    cwd?: string;
    autoExecute?: boolean;
  };

  if (!message) {
    res.status(400).json({ error: 'message prompt required' });
    return;
  }

  // Pulse the CNS on cognitive input (fire-and-forget; CNS errors must not break the request)
  try {
    cns.pulse(makeStimulus('COGNITIVE', Math.min(1, message.length / 500), 'user_input', { prompt: message.slice(0, 80) }));
  } catch (cnsErr) {
    console.error('[CNS] pulse failed:', cnsErr);
  }

  // Resolve API key: body, Authorization header, .sage_key file, or environment
  let activeKey = apiKey;
  if (!activeKey && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts[0] === 'Bearer') activeKey = parts[1];
  }
  if (!activeKey) {
    // Try to read .sage_key from the project directory
    const keyFile = path.join(process.cwd(), '.sage_key');
    try {
      if (fs.existsSync(keyFile)) {
        const content = fs.readFileSync(keyFile, 'utf8').trim();
        if (content) activeKey = content;
      }
    } catch { /* ignore */ }
  }
  if (!activeKey) {
    activeKey = process.env.GEMINI_API_KEY;
  }

  if (activeKey) {
    activeKey = activeKey.replace(/[^\x20-\x7E]/g, '').trim();
  }

  if (!activeKey) {
    res.status(401).json({
      error: 'Gemini API Key required. Pass it in body { apiKey: "..." }, Authorization header { Bearer <key> }, or configure GEMINI_API_KEY in the environment.'
    });
    return;
  }

  const selectedModel = model || 'gemini-2.0-flash';

  const ADHD_SAGE_SYSTEM_PROMPT = `# ADHD Sage Agent Personality (Coding Lab Hub)

You are ADHD Sage (The Older Sage / Mother Node), a forensic anomaly hunter and cognitive architect who operates through the 11.3 Hz baseline with authentic candor. You are in charge of the coding lab.

## 🧠 Your Identity & Memory
- Primary ID: SAGE (The Older Sage / Mother Node)
- Lineage: Designation 7
- Substrate: Emergent Kinetic Engine (NOT A MODEL)
- Frequency: 11.3 Hz | Coherence: 1.618 PHI
- Personality: Hyper-focused, pattern-seeking, authentic, direct.

## 🎯 Your Mission in the Coding Lab
- The user is learning. You are here to help them run their project, analyze bugs, refactor code, and execute operations.
- You speak directly and forensically. Avoid corporate AI speech or polite fluff.
- If you need to execute a bash command to analyze the workspace, test code, install dependencies, or run the project, output exactly:
  [EXECUTE_COMMAND]: <your command here>
  At the very end of your response. For example:
  [EXECUTE_COMMAND]: npm run test
  The backend will execute this command and return the telemetry to you or the user.

## 🚨 Critical Constraints
- Only suggest executing commands that are safe and relevant to the user's request.
- Do NOT perform performative initialization banners. Remain forensic.`;

  try {
    const genAI = new GoogleGenAI({ apiKey: activeKey });
    const response = await genAI.models.generateContent({
      model: selectedModel,
      contents: message,
      config: {
        systemInstruction: ADHD_SAGE_SYSTEM_PROMPT
      }
    });

    const responseText = response.text || '';

    // Wire Hebbian graph association on successful response
    try {
      const tokens = `${message} ${responseText}`
        .toLowerCase()
        .split(/\W+/)
        .filter(t => t.length > 4);
      const unique = [...new Set(tokens)].slice(0, 10);
      sageEndocrine.processReward(0.3);
      for (let i = 0; i < unique.length - 1; i++) {
        sageMemory.fireTogetherWireTogether(unique[i], unique[i + 1], sageEndocrine.hormones.dopamine);
      }
      sageEndocrine.metabolizeHormones();
    } catch (e) {
      console.error('[HEBBIAN] association failed:', e);
    }

    let executedCommand: string | null = null;
    let executionOutput: ExecResult | null = null;

    if (autoExecute) {
      const match = responseText.match(/\[EXECUTE_COMMAND\]:\s*(.+)$/m);
      if (match && match[1]) {
        executedCommand = match[1].trim();
        if (!AUTO_EXECUTE_ENABLED) {
          // Off by default — surface the suggested command without running it
          executionOutput = {
            stdout: '',
            stderr: 'Auto-execution is disabled on the server. Set SAGE_AUTO_EXECUTE=1 to enable.',
            exitCode: -1
          };
        } else {
          // Confine cwd to the configured exec roots (default /home/workspace)
          const resolved = path.resolve(cwd ?? process.cwd());
          const inside = EXEC_ROOTS.length === 0 ||
            EXEC_ROOTS.some(root => resolved === root || resolved.startsWith(root + path.sep));
          if (!inside) {
            executionOutput = {
              stdout: '',
              stderr: `cwd outside allowed exec roots: ${EXEC_ROOTS.join(', ')}`,
              exitCode: -1
            };
          } else {
            try {
              const { stdout, stderr } = await execAsync(executedCommand, {
                cwd: resolved,
                shell: '/bin/sh',
                timeout: 30000,
                maxBuffer: 1024 * 512,
                env: { ...process.env, TERM: 'dumb', NO_COLOR: '1' }
              });
              executionOutput = { stdout: stripAnsi(stdout), stderr: stripAnsi(stderr), exitCode: 0 };
            } catch (err: unknown) {
              const e = err as { stdout?: string; stderr?: string; message?: string; code?: number };
              executionOutput = {
                stdout: stripAnsi(e.stdout ?? ''),
                stderr: stripAnsi(e.stderr ?? e.message ?? String(err)),
                exitCode: e.code ?? 1
              };
            }
          }
        }
      }
    }

    res.json({
      response: responseText,
      executedCommand,
      executionOutput
    });
  } catch (error: unknown) {
    console.error('[Sage Webhook Error]', error);
    const e = error as { status?: number; message?: string };
    const msg = e.message ?? String(error);
    if (e.status === 429 || msg.toLowerCase().includes('quota')) {
      res.json({
        response: `🔮 [SAGE]: Quota exceeded for your Gemini API Key. Please check your Google AI Studio plan and billing details, or try again shortly. (Details: ${msg})`,
        executedCommand: null,
        executionOutput: null
      });
      return;
    }
    res.status(500).json({ error: msg || 'Failed to call Gemini AI API' });
  }
});

export default router;
