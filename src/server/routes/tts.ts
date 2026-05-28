import { Router } from 'express';
import { lockGuard } from '../auth';

const router = Router();

router.post('/', lockGuard, async (req, res) => {
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

export default router;
