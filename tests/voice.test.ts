import { test } from "node:test";
import assert from "node:assert/strict";
import { pcmToWav } from "../lib/voice/audioUtils";
import { transcribeAudio } from "../lib/voice/stt";
import { synthesizeSpeech } from "../lib/voice/tts";

test("pcmToWav creates valid WAV header and correct byte length", () => {
  const dummyPcm = Buffer.alloc(9600); // 100ms of stereo 16-bit 48kHz PCM
  const wav = pcmToWav(dummyPcm, 48000, 2, 16);

  assert.equal(wav.length, 44 + dummyPcm.length);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.toString("ascii", 12, 16), "fmt ");
  assert.equal(wav.toString("ascii", 36, 40), "data");
  assert.equal(wav.readUInt32LE(40), dummyPcm.length);
});

test("transcribeAudio returns empty string on empty or tiny buffers", async () => {
  const emptyResult = await transcribeAudio(Buffer.alloc(0));
  assert.equal(emptyResult, "");

  const tinyResult = await transcribeAudio(Buffer.alloc(100));
  assert.equal(tinyResult, "");
});

test("synthesizeSpeech returns empty buffer for empty text", async () => {
  const emptySpeech = await synthesizeSpeech("");
  assert.equal(emptySpeech.length, 0);

  const whitespaceSpeech = await synthesizeSpeech("   ");
  assert.equal(whitespaceSpeech.length, 0);
});
