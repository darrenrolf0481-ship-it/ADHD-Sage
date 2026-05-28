import './config';
import express from 'express';
import { createHmac } from 'node:crypto';
import { isServerLocked } from './seed-core';

// ─── Lock guard middleware ─────────────────────────────────────────────────
export function lockGuard(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (isServerLocked()) {
    res.status(503).json({ error: 'halt_and_lock', message: 'seed_core integrity check failed — server is locked' });
    return;
  }
  next();
}

// ─── Auth: Bearer + MCP-Key-Exchange ──────────────────────────────────────
export const API_BEARER_TOKEN = process.env.API_BEARER_TOKEN;
export const MCP_KEY_SECRET = process.env.MCP_KEY_SECRET || API_BEARER_TOKEN || '';
const PUBLIC_API_PATHS = new Set(['/api/health', '/api/inbox/events', '/api/auth/exchange', '/api/ollama/status']);
export const DEFAULT_EXCHANGE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export function signExchangePayload(payload: string): string {
  return createHmac('sha256', MCP_KEY_SECRET).update(payload).digest('hex');
}

export function verifyExchangeToken(token: string): { clientId: string; scope: string; valid: boolean } {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const lastColon = decoded.lastIndexOf(':');
    if (lastColon === -1) return { clientId: '', scope: '', valid: false };
    const payload = decoded.slice(0, lastColon);
    const signature = decoded.slice(lastColon + 1);
    const expected = signExchangePayload(payload);
    if (signature.length !== expected.length) return { clientId: '', scope: '', valid: false };
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (!sigBuf.equals(expBuf)) return { clientId: '', scope: '', valid: false };
    const [clientId, expiresAtStr, scope] = payload.split(':');
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || Date.now() > expiresAt) return { clientId: '', scope: '', valid: false };
    return { clientId: clientId || '', scope: scope || 'api', valid: true };
  } catch {
    return { clientId: '', scope: '', valid: false };
  }
}

export function authGuard(req: express.Request, res: express.Response, next: express.NextFunction) {
  const fullPath = req.baseUrl + req.path;
  if (PUBLIC_API_PATHS.has(fullPath)) {
    next();
    return;
  }

  // Skip auth if no tokens are configured
  if (!API_BEARER_TOKEN && !MCP_KEY_SECRET) {
    next();
    return;
  }

  const header = req.headers.authorization || '';
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : queryToken;
  if (!provided) {
    res.status(401).set('WWW-Authenticate', 'Bearer').json({
      error: 'Unauthorized', message: 'Missing token. Provide Authorization: Bearer <token> or ?token=<token>'
    });
    return;
  }

  // 1. Static Bearer token
  if (API_BEARER_TOKEN && provided === API_BEARER_TOKEN) {
    next();
    return;
  }

  // 2. MCP-Key-Exchange token
  const exchange = verifyExchangeToken(provided);
  if (exchange.valid) {
    (req as unknown as Record<string, unknown>).mcpClient = exchange;
    next();
    return;
  }

  res.status(401).set('WWW-Authenticate', 'Bearer').json({
    error: 'Unauthorized', message: 'Invalid token. Use static Bearer token or a valid MCP-Key-Exchange token.'
  });
}
