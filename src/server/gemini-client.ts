import { GoogleGenAI } from '@google/genai';

let genAI: GoogleGenAI | null = null;

/**
 * Lazily construct the Gemini client. Deferred so dotenv has populated
 * GEMINI_API_KEY before the client reads it.
 */
export function getGenAI(): GoogleGenAI {
  if (!genAI) {
    genAI = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || '',
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });
  }
  return genAI;
}
