import OpenAI, { toFile } from "openai";

let openaiClient: OpenAI | null = null;

function getSTTClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "ollama",
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
  }
  return openaiClient;
}

/**
 * Resolve the Whisper model to use.
 * - Override via STT_MODEL env var.
 * - Auto-detect Groq from OPENAI_BASE_URL → use whisper-large-v3
 *   (Groq supports Whisper but does not have the "whisper-1" alias).
 * - Default: "whisper-1" (works with OpenAI and most other providers).
 */
function getSTTModel(): string {
  if (process.env.STT_MODEL) return process.env.STT_MODEL;
  const base = (process.env.OPENAI_BASE_URL || "").toLowerCase();
  if (base.includes("groq.com")) return "whisper-large-v3";
  return "whisper-1";
}

export async function transcribeAudio(audioBuffer: Buffer, language: string = "en"): Promise<string> {
  if (!audioBuffer || audioBuffer.length === 0) {
    return "";
  }

  // Minimum buffer check (e.g. less than 1KB is usually just silence/noise)
  if (audioBuffer.length < 1000) {
    return "";
  }

  const client = getSTTClient();
  const model = getSTTModel();

  try {
    const file = await toFile(audioBuffer, "input.wav", { type: "audio/wav" });
    const response = await client.audio.transcriptions.create({
      file,
      model,
      language,
      temperature: 0.2,
    });

    return (response.text || "").trim();
  } catch (err) {
    console.error("STT transcription failed:", err);
    return "";
  }
}
