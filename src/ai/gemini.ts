// Lightweight Gemini client wrapper
import { GoogleGenerativeAI } from "@google/generative-ai";

// Read from Vite env var; define in .env as VITE_GEMINI_API_KEY
const GEMINI_API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY as string | undefined;

let _client: GoogleGenerativeAI | null = null;

export function getGemini() {
  if (!_client) {
    if (!GEMINI_API_KEY) throw new Error("Missing Gemini API key");
    _client = new GoogleGenerativeAI(GEMINI_API_KEY);
  }
  return _client;
}

export async function generateWithGemini(prompt: string, modelName = "gemini-1.5-flash") {
  const genAI = getGemini();
  const model = genAI.getGenerativeModel({ model: modelName });
  const res = await model.generateContent(prompt);
  // SDK v2: res.response.text()
  return res?.response?.text?.() ?? "";
}

// Multimodal: accept an array of parts like { text } and { inlineData: { mimeType, data } }
export async function generateWithGeminiParts(parts: any[], modelName = "gemini-1.5-flash") {
  const genAI = getGemini();
  const model = genAI.getGenerativeModel({ model: modelName });
  const res = await model.generateContent(parts as any);
  return res?.response?.text?.() ?? "";
}
