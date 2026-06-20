import { Router } from 'express';
import { getGeminiMetrics } from '../metrics';
import { getAggregates } from '../performance';
import { getWorkerPool } from '../workers/pool';
import { getMcpStatus } from '../../core/mcp';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    gemini: getGeminiMetrics(),
    performance: getAggregates(),
    workers: getWorkerPool().getStats(),
    mcp: getMcpStatus(),
  });
});

export default router;
