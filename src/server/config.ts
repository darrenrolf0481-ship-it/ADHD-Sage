import dotenv from 'dotenv';

// Load environment variables before any module reads process.env at import time.
dotenv.config();

export const PORT = 3002;
export const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
