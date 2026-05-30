import { Settings } from "./store";

export async function fetchOllamaModels(_baseUrl: string, _apiKey?: string) {
  // Routed through ADHD-Sage backend proxy — no CORS needed on Ollama
  try {
    const res = await fetch('/api/ollama/tags');
    if (!res.ok) throw new Error("Failed connecting to Ollama proxy");
    const data = await res.json();
    return data.models || [];
  } catch (err: any) {
    console.error("fetchOllamaModels failed:", err);
    throw new Error('Failed to fetch Ollama models via proxy. Ensure the ADHD-Sage server and Ollama are running.');
  }
}

// Canonical provider names — match the backend route names (/api/gemini,
// /api/ollama, /api/openrouter). Keep this the single source of truth so the
// main chat (App.tsx) and the ParanormalApp ChatTab don't drift apart.
export type ChatProvider = 'ollama' | 'gemini' | 'grok' | 'openrouter';

// POST JSON to a same-origin backend route and return the parsed body,
// throwing on an HTTP error or a backend-reported { error } field.
async function postBackend(url: string, body: unknown): Promise<{ text?: string; error?: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || data.message || `Request to ${url} failed (${res.status})`);
  }
  return data;
}

export async function generateResponse(
  provider: ChatProvider,
  model: string,
  prompt: string,
  settings: Settings
) {
  // gemini / ollama / openrouter all route through the ADHD-Sage backend so they
  // share the same system prompt, long-term memory enrichment, tool-calling,
  // timeouts and retry behavior as the main chat — and never expose API keys to
  // the browser. (grok has no backend route yet, so it still calls xAI directly.)
  if (provider === 'gemini') {
    // Backend pins the Gemini model server-side; `model` is unused here.
    const data = await postBackend('/api/gemini/generate', { prompt });
    return data.text;
  }

  if (provider === 'ollama') {
    const data = await postBackend('/api/ollama/chat', {
      model,
      prompt,
      containerTag: 'shared',
    });
    return data.text;
  }

  if (provider === 'openrouter') {
    const data = await postBackend('/api/openrouter/chat', {
      model,
      containerTag: 'shared',
      messages: [{ role: 'user', text: prompt }],
    });
    return data.text;
  }

  if (provider === 'grok') {
    // Note: this represents xAI integration endpoints, currently open to adjustments.
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.grokApi}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'grok-beta',
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) throw new Error(`Grok error: ${res.statusText}`);
    const data = await res.json();
    return data.choices[0].message.content;
  }

  throw new Error(`Provider ${provider} not supported inline yet`);
}

export async function fetchGithubTree(repoUrl: string, token: string) {
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) throw new Error("Invalid GitHub URL. Must be in format https://github.com/owner/repo");
  const [, owner, repo] = match;
  
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json'
  };
  if (token) headers['Authorization'] = `token ${token}`;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch repo: ${res.statusText}`);
  const data = await res.json();
  return data.tree; // Array of file nodes
}

export async function fetchGithubFileContent(url: string, token: string) {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3.raw'
  };
  if (token) headers['Authorization'] = `token ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("Failed to fetch file content");
  return await res.text();
}

export async function fetchGithubFilePreviousContent(repoUrl: string, path: string, token: string) {
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) return null;
  const [, owner, repo] = match;

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `token ${token}`;

  try {
    const commitsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?path=${path}`, { headers });
    if (!commitsRes.ok) return null;
    const commits = await commitsRes.json();

    if (commits && commits.length > 1) {
      const prevSha = commits[1].sha;
      const contentReqHeaders = { ...headers, 'Accept': 'application/vnd.github.v3.raw' };
      const contentRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${prevSha}`, { headers: contentReqHeaders });
      if (!contentRes.ok) return null;
      return await contentRes.text();
    }
  } catch (err) {
    console.error("Failed to fetch previous content:", err);
  }
  return null;
}

export async function fetchLocalTree() {
  const res = await fetch(`http://localhost:8000/api/local/tree`);
  if (!res.ok) throw new Error(`Failed to fetch local tree: ${res.statusText}`);
  const data = await res.json();
  return data.tree;
}
