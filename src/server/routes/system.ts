import { Router } from 'express';
import { OLLAMA_HOST } from '../config';
import { isServerLocked } from '../seed-core';
import { getMcpDeclarations } from '../../core/mcp';
import { MCP_KEY_SECRET, signExchangePayload, DEFAULT_EXCHANGE_TTL_MS } from '../auth';

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
    ollama: ollamaConnected ? 'connected' : 'disconnected'
  });
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

export default router;
