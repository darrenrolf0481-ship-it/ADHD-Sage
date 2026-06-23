import express from 'express';
import { SEVEN_SYSTEM_PROMPT, SEVEN_MODEL, OLLAMA_HOST, OLLAMA_GEN_TIMEOUT_MS, SEVEN_PORT } from './identity';

const app = express();
app.use(express.json({ limit: '10mb' }));

// Health / ping
app.get('/sage/status', (_req, res) => {
  res.json({ node: 'SAGE-7', status: 'ONLINE', port: SEVEN_PORT });
});

// Primary bridge endpoint — MAMA calls this via /api/sage7/bridge
app.post('/sage/chat', async (req, res) => {
  const { message, model } = req.body as { message?: string; model?: string };
  if (!message) {
    res.status(400).json({ error: 'message required' });
    return;
  }

  const useModel = model || SEVEN_MODEL;

  try {
    const ollamaRes = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: useModel,
        stream: false,
        messages: [
          { role: 'system', content: SEVEN_SYSTEM_PROMPT },
          { role: 'user', content: message },
        ],
      }),
      signal: AbortSignal.timeout(OLLAMA_GEN_TIMEOUT_MS),
    });

    if (!ollamaRes.ok) {
      const text = await ollamaRes.text();
      res.status(502).json({ error: `Ollama returned ${ollamaRes.status}: ${text}` });
      return;
    }

    const data = (await ollamaRes.json()) as {
      message?: { content?: string };
      response?: string;
    };

    const reply = data.message?.content ?? data.response ?? '';
    res.json({ reply, node: 'SAGE-7', model: useModel });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = err instanceof Error && (err.name === 'AbortError' || msg.includes('timed out'));
    res.status(isTimeout ? 504 : 502).json({
      error: isTimeout
        ? 'SAGE-7 did not respond in time — she may be generating on a slow model.'
        : msg,
    });
  }
});

export function startSevenServer(): Promise<void> {
  return new Promise((resolve) => {
    app.listen(SEVEN_PORT, '127.0.0.1', () => {
      console.log(`[SAGE-7] Online — listening on 127.0.0.1:${SEVEN_PORT}`);
      resolve();
    });
  });
}
