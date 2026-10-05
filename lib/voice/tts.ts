import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import OpenAI from "openai";
import { Readable } from "stream";

/**
 * Synthesises speech from text.
 *
 * Default provider: Edge-TTS (free, no API key, Microsoft neural voices).
 * Set TTS_PROVIDER=openai to use OpenAI TTS instead (requires a real OpenAI key –
 * NOT a Groq key, since Groq has no TTS endpoint).
 *
 * @param text  The text to synthesise.
 * @param voice Edge-TTS voice name (used in edge mode) or OpenAI voice (used in openai mode).
 */
export async function synthesizeSpeech(
  text: string,
  voice = "en-US-JennyNeural"
): Promise<Buffer> {
  if (!text || text.trim().length === 0) {
    return Buffer.alloc(0);
  }

  const provider = (process.env.TTS_PROVIDER || "edge").toLowerCase();

  if (provider === "openai") {
    return synthesizeOpenAI(text);
  }

  // Default: Edge-TTS (free, no API key needed)
  return synthesizeEdge(text, voice);
}

async function synthesizeEdge(text: string, voice: string): Promise<Buffer> {
  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const { audioStream } = tts.toStream(text);

    const chunks: Buffer[] = [];
    for await (const chunk of audioStream as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    tts.close();
    return Buffer.concat(chunks);
  } catch (err) {
    console.error("Edge-TTS synthesis failed:", err);
    return Buffer.alloc(0);
  }
}

async function synthesizeOpenAI(text: string): Promise<Buffer> {
  try {
    // Use a dedicated OpenAI TTS key/URL if provided, falling back to OPENAI_API_KEY.
    // Note: Groq does NOT support TTS — only set TTS_PROVIDER=openai when you have a
    // real OpenAI API key (or another provider that actually exposes a TTS endpoint).
    const client = new OpenAI({
      apiKey: process.env.OPENAI_TTS_API_KEY || process.env.OPENAI_API_KEY || "",
      baseURL: process.env.OPENAI_TTS_BASE_URL || undefined,
    });

    const response = await client.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: text,
      response_format: "mp3",
    });

    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    console.error("OpenAI TTS synthesis failed:", err);
    return Buffer.alloc(0);
  }
}
