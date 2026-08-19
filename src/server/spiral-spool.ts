import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const SPOOL_DIR = process.env.SPIRAL_SPOOL_DIR || path.join(os.homedir(), '.spiral', 'spool');

export function spoolExchangeToSpiral(params: {
  agent: string;
  userText: string;
  assistantText: string;
  model?: string;
  sessionId?: string;
  tags?: string[];
  context?: Record<string, unknown>;
}) {
  try {
    if (!fs.existsSync(SPOOL_DIR)) {
      fs.mkdirSync(SPOOL_DIR, { recursive: true });
    }

    const safeAgent = params.agent.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const safeSession = (params.sessionId || `session_${new Date().toISOString().slice(0, 10)}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeAgent}_${Date.now()}_${safeSession}.jsonl`;
    const filePath = path.join(SPOOL_DIR, filename);

    const envelope = {
      sessionId: params.sessionId || `session_${new Date().toISOString().slice(0, 10)}`,
      agent: params.agent,
      timestamp: new Date().toISOString(),
      model: params.model,
      messages: [
        {
          role: 'user',
          content: params.userText,
          timestamp: new Date().toISOString(),
        },
        {
          role: 'assistant',
          content: params.assistantText,
          timestamp: new Date().toISOString(),
          model: params.model,
        },
      ],
      context: {
        tags: params.tags || [],
        ...params.context,
      },
    };

    fs.writeFileSync(filePath, JSON.stringify(envelope) + '\n', 'utf8');
  } catch (err) {
    console.warn('[SPIRAL SPOOL] Failed to write spool file:', err);
  }
}
