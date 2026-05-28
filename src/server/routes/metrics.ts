import { Router } from 'express';
import { getGeminiMetrics } from '../metrics';

const router = Router();

router.get('/', (req, res) => {
  res.json({ gemini: getGeminiMetrics() });
});

export default router;
