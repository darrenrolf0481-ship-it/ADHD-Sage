export interface Attachment {
  type: 'image' | 'video' | 'audio' | 'document';
  url: string;
  name: string;
  /** Extracted text content — present for document-type files so the AI can read them */
  content?: string;
  /** Base64-encoded binary data — present for image/video/audio files */
  data?: string;
  /** MIME type of the binary data (e.g. 'image/png') */
  mimeType?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  attachments?: Attachment[];
}

export type AppView = 'chat' | 'lattice' | 'vault' | 'labyrinth' | 'anomalies' | 'surprise' | 'coding-lab' | 'memory-workspace';

export type AIProvider = 'ollama' | 'openrouter' | 'gemini';

export const APP_VIEWS: readonly AppView[] = [
  'chat',
  'lattice',
  'vault',
  'labyrinth',
  'anomalies',
  'surprise',
  'coding-lab',
  'memory-workspace',
];
