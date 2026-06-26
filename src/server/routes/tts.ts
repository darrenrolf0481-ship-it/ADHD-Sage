import { Router } from 'express';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, unlink } from 'node:fs/promises';
import { lockGuard } from '../auth';
import { asyncHandler } from '../async-handler';

const router = Router();

// Default voice for Mama. Override with EDGE_TTS_VOICE (e.g. en-US-JennyNeural).
// Run `edge-tts --list-voices` to see all options.
const EDGE_VOICE = process.env.EDGE_TTS_VOICE || 'en-US-AriaNeural';
const EDGE_BIN = process.env.EDGE_TTS_BIN || 'edge-tts';
const MAX_CHARS = 1000;

// Microsoft Edge TTS — free, no API key. Synthesises to a temp mp3, returns bytes.
async function synthEdge(text: string): Promise<Buffer> {
  const file = join(tmpdir(), `mama_tts_${randomUUID()}.mp3`);
  await new Promise<void>((resolve, reject) => {
    // spawn (no shell) passes args verbatim — text is never shell-interpreted.
    const proc = spawn(EDGE_BIN, [
      '--voice',
      EDGE_VOICE,
      '--text',
      text.slice(0, MAX_CHARS),
      '--write-media',
      file,
    ]);
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`edge-tts exited ${code}: ${stderr.trim()}`));
    });
  });
  try {
    return await readFile(file);
  } finally {
    void unlink(file).catch(() => {});
  }
}

// ElevenLabs — optional premium voice. Enable with TTS_PROVIDER=elevenlabs + ELEVENLABS_API_KEY.
async function synthElevenLabs(text: string, voiceId?: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY as string;
  const vid = voiceId || process.env.ELEVENLABS_VOICE_ID || 'O9WvpEtztEjNyF47iUIE';
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: text.slice(0, MAX_CHARS),
      model_id: 'eleven_flash_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs ${response.status}: ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

router.post('/', lockGuard, asyncHandler(async (req, res) => {
  try {
    const { text, voiceId } = req.body ?? {};
    if (!text || !String(text).trim()) {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    const useElevenLabs =
      process.env.TTS_PROVIDER === 'elevenlabs' && !!process.env.ELEVENLABS_API_KEY;

    const audio = useElevenLabs
      ? await synthElevenLabs(String(text), voiceId)
      : await synthEdge(String(text));

    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(audio);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'TTS error';
    res.status(500).json({ error: msg });
  }
}));

export default router;
