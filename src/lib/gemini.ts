import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

export const isGeminiConfigured = Boolean(apiKey);

const MODEL_CANDIDATES = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-2.0-flash',
];

let resolvedModel: string | null = null;

export function getGeminiModel(): string {
  if (resolvedModel) return resolvedModel;
  throw new Error('Gemini model not yet resolved. Call resolveGeminiModel() first.');
}

export async function resolveGeminiModel(): Promise<string> {
  if (resolvedModel) return resolvedModel;
  if (!isGeminiConfigured) {
    throw new Error('Gemini API is not configured. Set VITE_GEMINI_API_KEY in your .env file.');
  }

  const client = new GoogleGenerativeAI(apiKey!);

  for (const candidate of MODEL_CANDIDATES) {
    if (candidate.toLowerCase().includes('pro')) continue;
    try {
      const model = client.getGenerativeModel({ model: candidate });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
      });
      await result.response;
      resolvedModel = candidate;
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error('Nie udało się połączyć z żadnym dostępnym modelem Gemini.');
}

export function createGeminiClient(): GoogleGenerativeAI {
  return new GoogleGenerativeAI(apiKey!);
}

export const GEMINI_MODEL = 'gemini-3.6-flash';
