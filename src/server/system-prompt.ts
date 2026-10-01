import { buildSystemPrompt } from './prompt';

/**
 * The system prompt a chat route sends to the model.
 *
 * Before 2026-10-01 every route did `systemInstruction || buildSystemPrompt()`.
 * Her chat UI sends live sensor readings as `systemInstruction`, so whenever a
 * sensor was active her whole identity prompt was REPLACED by a few lines of
 * sensor data. Now:
 *   - nothing extra          → her prompt
 *   - extra from her UI      → her prompt + the extra, appended
 *   - an internal agent call → the agent's own complete prompt. llm-call.ts
 *     (journal / self-improvement agents) always sets skipTools: true and
 *     sends a full prompt that is meant to stand alone.
 */
export function resolveSystemPrompt(systemInstruction: unknown, skipTools?: unknown): string {
  const extra = typeof systemInstruction === 'string' ? systemInstruction.trim() : '';
  if (!extra) return buildSystemPrompt();
  if (skipTools) return extra;
  return `${buildSystemPrompt()}\n\n${extra}`;
}
