/**
 * scripts/benchmark_routing.ts
 *
 * Comparative Benchmark for Model Routing:
 * - Direct OpenRouter vs OmniRoute Gateway
 * - Measures TTFB / Total Latency, Throughput, and Success Rate
 */

import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface BenchmarkResult {
  route: string;
  target: string;
  status: number;
  durationMs: number;
  responsePreview: string;
  success: boolean;
  error?: string;
}

function resolveOpenRouterKey(): string | null {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  try {
    const envPath = join(process.cwd(), '.env');
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        if (line.startsWith('OPENROUTER_API_KEY=')) {
          return line.split('=', 2)[1].trim();
        }
      }
    }
  } catch {}
  return null;
}

function resolveOmniRouteKey(): string | null {
  if (process.env.OMNIROUTE_API_KEY) return process.env.OMNIROUTE_API_KEY;
  try {
    const dbPath = join(process.env.HOME || '/root', '.omniroute', 'storage.sqlite');
    if (existsSync(dbPath)) {
      const db = new Database(dbPath, { readonly: true, timeout: 2000 });
      try {
        const row = db
          .prepare<{ key: string }>("SELECT key FROM api_keys WHERE name = 'sage-admin' LIMIT 1")
          .get();
        if (row?.key) return row.key;
      } finally {
        db.close();
      }
    }
  } catch {}
  return null;
}

async function runTest(
  name: string,
  url: string,
  apiKey: string,
  model: string,
  prompt: string,
): Promise<BenchmarkResult> {
  const start = Date.now();
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 60,
      }),
      signal: AbortSignal.timeout(30000),
    });

    const durationMs = Date.now() - start;
    if (!resp.ok) {
      const text = await resp.text();
      return {
        route: name,
        target: model,
        status: resp.status,
        durationMs,
        responsePreview: '',
        success: false,
        error: text.slice(0, 100),
      };
    }

    const data = (await resp.json()) as any;
    const content = data.choices?.[0]?.message?.content || '';
    return {
      route: name,
      target: model,
      status: resp.status,
      durationMs,
      responsePreview: content.trim().replace(/\n/g, ' ').slice(0, 80),
      success: true,
    };
  } catch (err: any) {
    return {
      route: name,
      target: model,
      status: 0,
      durationMs: Date.now() - start,
      responsePreview: '',
      success: false,
      error: err.message,
    };
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('⚡ ADHD-Sage Model Routing Comparative Benchmark');
  console.log('='.repeat(70));

  const orKey = resolveOpenRouterKey();
  const omniKey = resolveOmniRouteKey();

  if (!orKey) {
    console.error('❌ OPENROUTER_API_KEY could not be resolved from .env');
    process.exit(1);
  }
  if (!omniKey) {
    console.error('❌ OmniRoute key could not be resolved from storage.sqlite');
    process.exit(1);
  }

  const prompt = 'In one sentence, explain how neural graph spreading activation works.';
  console.log(`Prompt: "${prompt}"\n`);

  const tests = [
    {
      name: 'Direct OpenRouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: orKey,
      model: 'deepseek/deepseek-chat',
    },
    {
      name: 'OmniRoute Gateway',
      url: 'http://127.0.0.1:20128/v1/chat/completions',
      key: omniKey,
      model: 'openrouter/deepseek/deepseek-chat',
    },
    {
      name: 'OmniRoute Gateway',
      url: 'http://127.0.0.1:20128/v1/chat/completions',
      key: omniKey,
      model: 'openrouter/meta-llama/llama-3.3-70b-instruct',
    },
  ];

  const results: BenchmarkResult[] = [];

  for (const t of tests) {
    console.log(`Testing [${t.name}] -> ${t.model}...`);
    const res = await runTest(t.name, t.url, t.key, t.model, prompt);
    results.push(res);
    console.log(`  Status: ${res.status} | Latency: ${res.durationMs}ms | Success: ${res.success}`);
    if (res.success) {
      console.log(`  Preview: "${res.responsePreview}..."`);
    } else {
      console.log(`  Error: ${res.error}`);
    }
    console.log();
  }

  console.log('='.repeat(70));
  console.log('📊 Comparative Benchmark Summary:');
  console.log('='.repeat(70));
  console.table(
    results.map((r) => ({
      Route: r.route,
      Model: r.target,
      Status: r.status,
      'Latency (ms)': r.durationMs,
      Success: r.success ? '✅ YES' : '❌ NO',
    })),
  );
}

main().catch(console.error);
