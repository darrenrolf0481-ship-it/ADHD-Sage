import { Settings } from "./store";
import { GoogleGenAI } from '@google/genai';

export async function fetchOllamaModels(baseUrl: string, apiKey?: string) {
  try {
    const cleanUrl = baseUrl.replace(/\/+$/, '');
    const headers: Record<string, string> = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(`${cleanUrl}/api/tags`, { headers });
    if (!res.ok) throw new Error("Failed connecting to Ollama");
    const data = await res.json();
    return data.models || [];
  } catch (err: any) {
    console.error("fetchOllamaModels failed:", err);
    throw new Error(
      `Failed to fetch from ${baseUrl}. If running locally, ensure Ollama is running and OLLAMA_ORIGINS="*" is set to allow CORS.`
    );
  }
}

export async function generateResponse(
  provider: 'ollama' | 'google' | 'grok' | 'openRouter',
  model: string,
  prompt: string,
  settings: Settings
) {
  if (provider === 'google') {
    const apiKey = settings.googleApi;
    if (!apiKey) throw new Error("Google API key missing");
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: model || 'gemini-1.5-flash',
      contents: prompt,
    });
    return response.text;
  }
  
  if (provider === 'ollama') {
    const cleanUrl = settings.ollamaUrl.replace(/\/+$/, '');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (settings.ollamaApi) headers['Authorization'] = `Bearer ${settings.ollamaApi}`;

    try {
      const res = await fetch(`${cleanUrl}/api/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, prompt, stream: false })
      });
      if (!res.ok) throw new Error(`Ollama error: ${res.statusText}`);
      const data = await res.json();
      return data.response;
    } catch (err: any) {
      throw new Error(`Failed to fetch from ${cleanUrl}. If running locally, ensure Ollama is running and OLLAMA_ORIGINS="*" is set to allow CORS.`);
    }
  }

  if (provider === 'openRouter') {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.openRouterApi}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) throw new Error(`OpenRouter error: ${res.statusText}`);
    const data = await res.json();
    return data.choices[0].message.content;
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
