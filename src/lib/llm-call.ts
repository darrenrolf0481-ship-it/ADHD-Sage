/**
 * Shared LLM call abstraction for scheduled agents (journal, self-improvement).
 *
 * Every provider call goes through this module so a single dead provider
 * (e.g. the Gemini free-tier quota / tool-schema failures of 2026-09) can
 * never again silently break her journaling for weeks. Calls are made
 * against the local server's own LLM routes (no SDK duplication), with an
 * ordered fallback chain per requested provider.
 *
 * Background — why the fallback exists (OPS_LOG 2026-09):
 *   - Gemini free tier: 429 RESOURCE_EXHAUSTED (input-token quota)
 *   - Gemini route: 400 INVALID_ARGUMENT when MCP tool declarations contain
 *     schemas Gemini rejects (function_declarations[15].parameters...
 *     field predicate failed: $type == Type.ARRAY)
 *   - DeepSeek direct: "Insufficient Balance" (route falls back to OpenRouter)
 *   - Ollama: cold-start latency / occasional unreachability
 * OmniRoute + OpenRouter are the resilient defaults; Gemini stays available
 * but is never the assumed-alive choice.
 */

import dns from 'node:dns';

// IPv4-first DNS — see src/server/config.ts for the rationale (no IPv6 on this
// host; default ordering cost 1.4s per fresh connection). Worker threads don't
// import config.ts, so set it here as well. Idempotent, per-thread.
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  /* older Node — ordering default is acceptable */
}

/** Small delay helper for retry backoff. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type LLMProvider = 'gemini' | 'openrouter' | 'ollama' | 'deepseek' | 'omniroute';

export const LLM_PROVIDERS: readonly LLMProvider[] = [
  'gemini',
  'openrouter',
  'ollama',
  'deepseek',
  'omniroute',
];

export function isLLMProvider(p: string): p is LLMProvider {
  return (LLM_PROVIDERS as readonly string[]).includes(p);
}

/** OpenRouter free-tier model used as the universal fallback writer. */
const OPENROUTER_FALLBACK_MODEL = 'google/gemma-4-31b-it:free';

interface Candidate {
  provider: LLMProvider;
  model: string;
}

/**
 * Ordered provider chain for a requested provider/model.
 * The requested provider is tried first; the rest are resilient writers.
 * (Gemini last: free-tier quota + tool-schema fragility — see header.)
 */
export function resolveProviderChain(provider: LLMProvider, model: string): Candidate[] {
  const chain: Candidate[] = [{ provider, model }];
  const push = (p: LLMProvider, m = '') => {
    if (!chain.some((c) => c.provider === p)) chain.push({ provider: p, model: m });
  };
  push('omniroute', 'auto/fast');
  push('openrouter', OPENROUTER_FALLBACK_MODEL);
  push('deepseek', 'deepseek-chat');
  push('ollama');
  // gemini is appended last via push below for requests that didn't start there
  if (provider !== 'gemini') push('gemini', 'gemini-3.6-flash');
  return chain;
}

async function callProvider(
  candidate: Candidate,
  systemPrompt: string,
  userPrompt: string,
  apiBase: string,
): Promise<string> {
  const { provider, model } = candidate;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.API_BEARER_TOKEN || ''}`,
  };

  if (provider === 'gemini') {
    const res = await fetch(`${apiBase}/api/gemini/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt: userPrompt, systemInstruction: systemPrompt }),
    });
    const data = (await res.json()) as { text?: string; error?: string };
    if (data.error) throw new Error(`Gemini: ${data.error}`);
    return data.text ?? '';
  }

  if (provider === 'openrouter') {
    const res = await fetch(`${apiBase}/api/openrouter/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        containerTag: 'shared',
        systemInstruction: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        skipTools: true,
      }),
    });
    const data = (await res.json()) as { text?: string; error?: string };
    if (data.error) throw new Error(`OpenRouter: ${data.error}`);
    return data.text ?? '';
  }

  if (provider === 'deepseek') {
    const res = await fetch(`${apiBase}/api/deepseek/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        systemInstruction: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        skipTools: true,
      }),
    });
    const data = (await res.json()) as { text?: string; error?: string };
    if (data.error) throw new Error(`DeepSeek: ${data.error}`);
    return data.text ?? '';
  }

  if (provider === 'omniroute') {
    const res = await fetch(`${apiBase}/api/omniroute/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model || 'auto/fast',
        systemInstruction: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        skipTools: true,
      }),
    });
    const data = (await res.json()) as { text?: string; error?: string };
    if (data.error) throw new Error(`OmniRoute: ${data.error}`);
    return data.text ?? '';
  }

  // ollama — retry with backoff; the journal scheduler fires at 06:00 and
  // Ollama may be slow to respond on cold hardware.
  const MAX_RETRIES = 3;
  let lastError = '';

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${apiBase}/api/ollama/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          containerTag: 'shared',
          prompt: userPrompt,
          systemInstruction: systemPrompt,
          messages: [],
          skipTools: true,
        }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (data.error) {
        lastError = data.error;
        const isTransient =
          data.error.includes('Swarm uplink failed') ||
          data.error.includes('unreachable') ||
          data.error.includes('ECONNREFUSED') ||
          data.error.includes('ETIMEDOUT');
        if (!isTransient) throw new Error(`Ollama: ${data.error}`);
      } else {
        return data.text ?? '';
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (lastError.startsWith('Ollama:') && !lastError.includes('Swarm uplink')) {
        throw err;
      }
    }

    if (attempt < MAX_RETRIES - 1) {
      const delay = 5000 * (attempt + 1); // 5s, 10s, 15s backoff
      console.log(`[LLM] Ollama attempt ${attempt + 1} failed, retrying in ${delay / 1000}s…`);
      await sleep(delay);
    }
  }

  throw new Error(`Ollama: ${lastError || 'all retries exhausted'}`);
}

export interface LLMCallResult {
  text: string;
  provider: LLMProvider;
  model: string;
}

/**
 * Call the requested provider, falling back through the resilient chain on
 * failure. Throws only if every candidate fails.
 */
export async function callLLMWithFallback(
  provider: LLMProvider,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  apiBase = 'http://localhost:3000',
): Promise<LLMCallResult> {
  const chain = resolveProviderChain(provider, model);
  const failures: string[] = [];

  for (const candidate of chain) {
    try {
      const text = await callProvider(candidate, systemPrompt, userPrompt, apiBase);
      if (!text.trim()) throw new Error('empty response');
      if (candidate.provider !== provider) {
        console.log(
          `[LLM] Fallback used: ${provider} → ${candidate.provider} (${candidate.model || 'default'})`,
        );
      }
      return { text, provider: candidate.provider, model: candidate.model };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${candidate.provider}: ${msg}`);
      console.warn(`[LLM] ${candidate.provider} failed for scheduled agent — ${msg.slice(0, 160)}`);
    }
  }

  throw new Error(`All LLM providers failed → ${failures.join(' | ')}`);
}
