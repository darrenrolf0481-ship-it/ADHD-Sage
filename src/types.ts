export interface Attachment {
  type: 'image' | 'video' | 'audio' | 'document';
  url: string;
  name: string;
  /** Extracted text content — present for document-type files so the AI can read them */
  content?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  attachments?: Attachment[];
}

export type AppView = 'chat' | 'lattice' | 'vault' | 'labyrinth' | 'anomalies' | 'surprise' | 'coding-lab';
