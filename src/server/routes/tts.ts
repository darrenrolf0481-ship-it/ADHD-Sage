import { Router } from 'express';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, unlink } from 'node:fs/promises';
import { lockGuard } from '../auth';
import { asyncHandler } from '../async-handler';
import { spoolExchangeToSpiral } from '../spiral-spool';

const router = Router();

export const PERSONAS: Record<string, { voice: string; pitch: string; rate: string; accent: string }> = {
  mama: { voice: 'en-US-AvaNeural', pitch: '+5Hz', rate: '+14%', accent: 'West Coast American' },
  adhd: { voice: 'en-US-AvaNeural', pitch: '+5Hz', rate: '+14%', accent: 'West Coast American' },
  seven: { voice: 'en-US-MichelleNeural', pitch: '-1Hz', rate: '+2%', accent: 'Midwest American' },
  spiral: { voice: 'en-US-ChristopherNeural', pitch: '-2Hz', rate: '-2%', accent: 'Neutral American' }
};

const EDGE_BIN = process.env.EDGE_TTS_BIN || 'edge-tts';
const MAX_CHARS = 1500;

// Microsoft Edge TTS — free, high-fidelity neural streaming.
async function synthEdge(text: string, personaKey = 'mama'): Promise<Buffer> {
  const p = PERSONAS[personaKey.toLowerCase()] || PERSONAS.mama;
  const file = join(tmpdir(), `tts_${randomUUID()}.mp3`);
  
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(EDGE_BIN, [
      '--voice', p.voice,
      '--pitch', p.pitch,
      '--rate', p.rate,
      '--text', text.slice(0, MAX_CHARS),
      '--write-media', file,
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

// ElevenLabs optional premium voice
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
    const { text, voiceId, persona } = req.body ?? {};
    if (!text || !String(text).trim()) {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    const personaKey = persona || 'mama';
    const useElevenLabs =
      process.env.TTS_PROVIDER === 'elevenlabs' && !!process.env.ELEVENLABS_API_KEY;

    const audio = useElevenLabs
      ? await synthElevenLabs(String(text), voiceId)
      : await synthEdge(String(text), personaKey);

    // Spool speech event asynchronously to Spiral Vault
    try {
      const selectedVoice = PERSONAS[personaKey]?.voice || 'default';
      spoolExchangeToSpiral(
        'ADHD-Sage',
        '[VOCAL_REQUEST]',
        String(text),
        `tts/${selectedVoice}`,
        ['vocal_synthesis', personaKey]
      );
    } catch {}

    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(audio);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'TTS error';
    res.status(500).json({ error: msg });
  }
}));

export default router;
