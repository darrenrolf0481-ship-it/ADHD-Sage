import { Router } from 'express';
import express from 'express';
import { listInboxMessages, markInboxRead, saveInboxMessage } from '../../lib/journal-agent';
import { lockGuard } from '../auth';

const router = Router();

/**
 * GET /api/inbox?unread=true
 * List messages the entities have left for Darren.
 * Since there's no SMS/email, this IS how they reach him.
 */
router.get('/', lockGuard, (req, res) => {
  const unreadOnly = req.query.unread === 'true';
  const messages = listInboxMessages(unreadOnly);
  res.json({ messages, unread: messages.filter(m => !m.read).length });
});

/**
 * PATCH /api/inbox/:id/read
 * Mark an inbox message as read.
 */
router.patch('/:id/read', lockGuard, (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const ok = markInboxRead(id);
  res.json({ ok });
});

// ─── Inbound Channel (SSE) ──────────────────────────────────────────────────

const sseClients = new Set<express.Response>();

function broadcastInbox(msg: ReturnType<typeof saveInboxMessage>) {
  const payload = `event: message\ndata: ${JSON.stringify(msg)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

/**
 * GET /api/inbox/events
 * Server-Sent Events stream for real-time inbox messages.
 * Replaces polling. Connects once, receives push events forever.
 */
router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  res.write('event: ping\ndata: connected\n\n');

  const keepalive = setInterval(() => {
    if (!sseClients.has(res)) {
      clearInterval(keepalive);
      return;
    }
    res.write('event: ping\ndata: heartbeat\n\n');
  }, 30_000);

  req.on('close', () => {
    clearInterval(keepalive);
    sseClients.delete(res);
  });
});

/**
 * POST /api/inbox/post
 * External inbound endpoint. Any system, entity, or webhook can POST
 * a message here and it will be broadcast to all connected clients.
 * Body: { entity: string, message: string }
 */
router.post('/post', lockGuard, (req, res) => {
  const { entity, message } = req.body as { entity?: string; message?: string };
  if (!entity || typeof entity !== 'string' || !message || typeof message !== 'string') {
    res.status(400).json({ error: 'entity (string) and message (string) required' });
    return;
  }
  const msg = saveInboxMessage(entity, message);
  broadcastInbox(msg);
  res.json({ ok: true, id: msg.id });
});

export default router;
