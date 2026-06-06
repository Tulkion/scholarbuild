import { GoogleGenAI } from '@google/genai';

// Lazily initialize to ensure we fetch the key cleanly when needed
// or if we switch keys in the app
let aiClient: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("Missing GEMINI_API_KEY environment variable.");
    }
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}
