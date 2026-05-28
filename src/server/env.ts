import './config';

// ─── Environment validation ─────────────────────────────────────────────────
export function validateEnv() {
  const checks = [
    { name: 'GEMINI_API_KEY', required: false, desc: 'Gemini AI provider' },
    { name: 'SAGE_CORE_PUBKEY', required: true, desc: 'Seed core integrity' },
    { name: 'SUPERMEMORY_API_KEY', required: false, desc: 'Long-term memory' },
    { name: 'OPENROUTER_API_KEY', required: false, desc: 'OpenRouter provider' },
    { name: 'ELEVENLABS_API_KEY', required: false, desc: 'Voice synthesis' },
    { name: 'API_BEARER_TOKEN', required: false, desc: 'API authentication' },
    { name: 'MCP_KEY_SECRET', required: false, desc: 'MCP key exchange' },
    { name: 'OLLAMA_HOST', required: false, desc: 'Ollama host', default: 'http://127.0.0.1:11434' },
  ];

  const maxName = Math.max(...checks.map(c => c.name.length));
  console.log('[ENV] Configuration check:');
  let missingRequired = false;
  for (const c of checks) {
    const val = process.env[c.name];
    const status = val ? '✓' : (c.required ? '✗ REQUIRED' : '○ optional');
    if (c.required && !val) missingRequired = true;
    const display = c.default && !val ? `(default: ${c.default})` : '';
    console.log(`  ${c.name.padEnd(maxName)}  ${status.padEnd(12)}  ${c.desc} ${display}`);
  }
  if (missingRequired) {
    console.error('[ENV] HALT: Required variables missing. Copy .env.example to .env and fill in values.');
    process.exit(1);
  }
}
