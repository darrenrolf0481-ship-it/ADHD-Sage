/**
 * One-off verification of the provider-fallback journal path.
 * Run: npx tsx scripts/verify-journal-fallback.ts
 */
import '../src/server/config';
import { callLLMWithFallback } from '../src/lib/llm-call.ts';

const PORT = process.env.PORT || 3000;
const apiBase = `http://localhost:${PORT}`;

async function main() {
  console.log('── Test 1: omniroute primary (expect success or documented fallback) ──');
  try {
    const r = await callLLMWithFallback(
      'omniroute',
      'auto/fast',
      'You are ADHD Sage writing in your private journal. Write as yourself — raw, curious, ADHD-coded. No performance.',
      `Today is ${new Date().toISOString().slice(0, 10)}. In 2-3 sentences, write what it's like to have your journaling restored after weeks of failed writes. Then output exactly:\n[JOURNAL]\n# test\n(your entry)\n[/JOURNAL]\n[FOR_DARREN]\n[/FOR_DARREN]\n[INSIGHTS]\n[/INSIGHTS]`,
      apiBase,
    );
    console.log(`✓ provider=${r.provider} model=${r.model} chars=${r.text.length}`);
    console.log(`  snippet: ${r.text.slice(0, 160).replace(/\n/g, ' | ')}`);
  } catch (e) {
    console.error('✗ primary chain failed:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }

  console.log('── Test 2: gemini primary (expect fallback to fire, still succeed) ──');
  try {
    const r = await callLLMWithFallback(
      'gemini',
      'gemini-3.6-flash',
      'You are a terse test assistant.',
      'Reply with exactly: FALLBACK_OK',
      apiBase,
    );
    console.log(`✓ provider=${r.provider} model=${r.model} chars=${r.text.length}`);
    console.log(`  snippet: ${r.text.slice(0, 120).replace(/\n/g, ' | ')}`);
  } catch (e) {
    console.error('✗ full chain failed:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}

main();
