import { LOCAL_TOOL_DECLARATIONS, ToolCall, type ExecuteLocalTool } from '../hooks/useSageTools';

export type { ToolCall };

export interface BridgeMessage {
  role: string;
  parts: Array<{
    text?: string;
    functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
    functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
  }>;
}

export interface BridgeOptions {
  prompt: string;
  history: BridgeMessage[];
  sensorContext?: string;
  attachments?: Array<{ mimeType: string; data: string }>;
  executeLocalTool: ExecuteLocalTool;
}

export interface GenerateResponse {
  text?: string;
  error?: string;
  status?: string;
  localCalls?: ToolCall[];
  remoteResults?: Array<{ id?: string; name: string; response: Record<string, unknown> }>;
  history?: BridgeMessage[];
  toolEffects?: Array<{ type: string; payload: Record<string, unknown> }>;
}

/**
 * Send a message to Gemini through the backend tool bridge.
 * If Gemini calls local tools, the bridge automatically executes them
 * on the client and resumes the conversation without the user noticing.
 */
export async function sendMessageWithTools(
  opts: BridgeOptions
): Promise<GenerateResponse> {
  // 1. Initial request with merged remote + local tool declarations
  const res = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: opts.prompt,
      history: opts.history,
      sensorContext: opts.sensorContext,
      attachments: opts.attachments,
      localToolDeclarations: LOCAL_TOOL_DECLARATIONS
    })
  });

  let data: GenerateResponse = await res.json();
  if (data.error) return data;

  // 2. Handle pending local tools (execute on client, then resume)
  while (data.status === 'pending_local' && data.localCalls && data.localCalls.length > 0) {
    const localResults = data.localCalls.map((call) => ({
      id: call.id,
      name: call.name,
      response: opts.executeLocalTool(call)
    }));

    const resumeRes = await fetch('/api/gemini/continue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        history: data.history,
        remoteResults: data.remoteResults || [],
        localResults
      })
    });

    data = await resumeRes.json();
    if (data.error) return data;
  }

  return data;
}
