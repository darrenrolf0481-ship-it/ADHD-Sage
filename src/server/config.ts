import dotenv from 'dotenv';

// Load environment variables before any module reads process.env at import time.
dotenv.config();

export const PORT = 3002;
export const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

// ─── LLM request timeouts ──────────────────────────────────────────────────
// Local inference (Ollama) on constrained hardware (e.g. a phone under Termux)
// can take tens of seconds to minutes per generation. The old 1130ms value
// aborted every request before the model could ever respond. These are tunable
// via env so low-power devices can give the model more headroom.
const num = (v: string | undefined, fallback: number) => {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Listing local models is cheap — short timeout is fine.
export const OLLAMA_TAGS_TIMEOUT_MS = num(process.env.OLLAMA_TAGS_TIMEOUT_MS, 6_000);
// Generation can be very slow on local hardware — give it room (default 3 min).
export const OLLAMA_GEN_TIMEOUT_MS = num(process.env.OLLAMA_GEN_TIMEOUT_MS, 180_000);
// Cloud generation (OpenRouter free tier can queue) — default 2 min.
export const OPENROUTER_TIMEOUT_MS = num(process.env.OPENROUTER_TIMEOUT_MS, 120_000);
