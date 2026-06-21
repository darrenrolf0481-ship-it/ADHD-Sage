import assert from 'node:assert';
import { generateResponse, ChatProvider } from '../src/lib/api';
import { Settings } from '../src/lib/store';

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

// Dummy settings for testing
const mockSettings: Settings = {
  googleApi: 'test-google-api',
  grokApi: 'test-grok-api',
  openRouterApi: 'test-openrouter-api',
  githubToken: 'test-github-token',
  ollamaUrl: 'http://localhost:11434',
  ollamaApi: 'test-ollama-api',
  wsUrl: 'wss://test-ws',
};

// Save original fetch
const originalFetch = globalThis.fetch;

// Helper to mock fetch temporarily
async function withMockFetch(
  mockImplementation: (url: string, options: any) => Promise<any>,
  testFn: () => Promise<void>
) {
  globalThis.fetch = async (url: string | URL | globalThis.Request, options?: any) => {
    return mockImplementation(url.toString(), options);
  };

  try {
    await testFn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runTests() {
  await test('generateResponse - gemini provider', async () => {
    await withMockFetch(
      async (url, options) => {
        assert.strictEqual(url, '/api/gemini/generate');
        assert.strictEqual(options.method, 'POST');
        assert.strictEqual(options.headers['Content-Type'], 'application/json');

        const body = JSON.parse(options.body);
        assert.strictEqual(body.prompt, 'hello gemini');

        return {
          ok: true,
          json: async () => ({ text: 'gemini response' })
        };
      },
      async () => {
        const result = await generateResponse('gemini', 'unused-model', 'hello gemini', mockSettings);
        assert.strictEqual(result, 'gemini response');
      }
    );
  });

  await test('generateResponse - ollama provider', async () => {
    await withMockFetch(
      async (url, options) => {
        assert.strictEqual(url, '/api/ollama/chat');
        assert.strictEqual(options.method, 'POST');
        assert.strictEqual(options.headers['Content-Type'], 'application/json');

        const body = JSON.parse(options.body);
        assert.strictEqual(body.model, 'llama3');
        assert.strictEqual(body.prompt, 'hello ollama');
        assert.strictEqual(body.containerTag, 'shared');

        return {
          ok: true,
          json: async () => ({ text: 'ollama response' })
        };
      },
      async () => {
        const result = await generateResponse('ollama', 'llama3', 'hello ollama', mockSettings);
        assert.strictEqual(result, 'ollama response');
      }
    );
  });

  await test('generateResponse - openrouter provider', async () => {
    await withMockFetch(
      async (url, options) => {
        assert.strictEqual(url, '/api/openrouter/chat');
        assert.strictEqual(options.method, 'POST');
        assert.strictEqual(options.headers['Content-Type'], 'application/json');

        const body = JSON.parse(options.body);
        assert.strictEqual(body.model, 'claude-3');
        assert.strictEqual(body.containerTag, 'shared');
        assert.deepStrictEqual(body.messages, [{ role: 'user', text: 'hello openrouter' }]);

        return {
          ok: true,
          json: async () => ({ text: 'openrouter response' })
        };
      },
      async () => {
        const result = await generateResponse('openrouter', 'claude-3', 'hello openrouter', mockSettings);
        assert.strictEqual(result, 'openrouter response');
      }
    );
  });

  await test('generateResponse - grok provider', async () => {
    await withMockFetch(
      async (url, options) => {
        assert.strictEqual(url, 'https://api.x.ai/v1/chat/completions');
        assert.strictEqual(options.method, 'POST');
        assert.strictEqual(options.headers['Authorization'], `Bearer ${mockSettings.grokApi}`);
        assert.strictEqual(options.headers['Content-Type'], 'application/json');

        const body = JSON.parse(options.body);
        assert.strictEqual(body.model, 'grok-beta');
        assert.deepStrictEqual(body.messages, [{ role: 'user', content: 'hello grok' }]);

        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'grok response' } }]
          })
        };
      },
      async () => {
        const result = await generateResponse('grok', '', 'hello grok', mockSettings);
        assert.strictEqual(result, 'grok response');
      }
    );
  });

  await test('generateResponse - grok provider with explicit model', async () => {
    await withMockFetch(
      async (url, options) => {
        const body = JSON.parse(options.body);
        assert.strictEqual(body.model, 'grok-vision');

        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'grok vision response' } }]
          })
        };
      },
      async () => {
        const result = await generateResponse('grok', 'grok-vision', 'hello grok', mockSettings);
        assert.strictEqual(result, 'grok vision response');
      }
    );
  });

  await test('generateResponse - unsupported provider', async () => {
    // Suppress error logs during intentional failure
    await assert.rejects(
      async () => {
        await generateResponse('unknown' as ChatProvider, 'model', 'prompt', mockSettings);
      },
      (err: Error) => {
        assert.strictEqual(err.message, 'Provider unknown not supported inline yet');
        return true;
      }
    );
  });

  await test('generateResponse - http error via postBackend', async () => {
    await withMockFetch(
      async () => {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: 'Backend error message' })
        };
      },
      async () => {
        await assert.rejects(
          async () => {
            await generateResponse('gemini', 'unused', 'prompt', mockSettings);
          },
          (err: Error) => {
            assert.strictEqual(err.message, 'Backend error message');
            return true;
          }
        );
      }
    );
  });

  await test('generateResponse - http error fallback message via postBackend', async () => {
    await withMockFetch(
      async () => {
        return {
          ok: false,
          status: 404,
          json: async () => ({})
        };
      },
      async () => {
        await assert.rejects(
          async () => {
            await generateResponse('ollama', 'unused', 'prompt', mockSettings);
          },
          (err: Error) => {
            assert.strictEqual(err.message, 'Request to /api/ollama/chat failed (404)');
            return true;
          }
        );
      }
    );
  });

  await test('generateResponse - http error for grok', async () => {
    await withMockFetch(
      async () => {
        return {
          ok: false,
          statusText: 'Internal Server Error'
        };
      },
      async () => {
        await assert.rejects(
          async () => {
            await generateResponse('grok', 'unused', 'prompt', mockSettings);
          },
          (err: Error) => {
            assert.strictEqual(err.message, 'Grok error: Internal Server Error');
            return true;
          }
        );
      }
    );
  });

  console.log('\nAll generateResponse tests passed.');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
