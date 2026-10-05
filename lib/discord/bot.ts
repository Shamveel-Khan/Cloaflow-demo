import {
  Client,
  Events,
  GatewayIntentBits,
  Message,
  VoiceState,
  ChannelType,
} from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  EndBehaviorType,
  VoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";
import prism from "prism-media";
import { Readable } from "stream";
import { pcmToWav } from "../voice/audioUtils";
import { transcribeAudio } from "../voice/stt";
import { synthesizeSpeech } from "../voice/tts";
import { runAgentTurn, type ChatTurn } from "../agent";
import { getBusinesses, getBusiness, upsertCall, newId } from "../db";
import { analyzeCall } from "../insights";
import { getCallerContext } from "../callerMemory";
import type { Business, CallLog } from "../types";

interface VoiceSession {
  guildId: string;
  channelId: string;
  connection: VoiceConnection;
  player: ReturnType<typeof createAudioPlayer>;
  business: Business;
  callLog: CallLog;
  history: ChatTurn[];
  isProcessing: boolean;
}

const sessions = new Map<string, VoiceSession>();

export function createDiscordBot(token?: string) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.on(Events.ClientReady, (c) => {
    console.log(`[Cloaflow Discord] Logged in as ${c.user.tag}!`);
  });

  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.trim();
    if (!content.startsWith("!")) return;

    const [cmd, ...args] = content.split(/\s+/);

    switch (cmd.toLowerCase()) {
      case "!join":
        await handleJoin(message, args[0]);
        break;
      case "!leave":
        await handleLeave(message);
        break;
      case "!business":
        await handleBusinessSwitch(message, args[0]);
        break;
      case "!status":
        await handleStatus(message);
        break;
      case "!help":
        await handleHelp(message);
        break;
    }
  });

  return { client, start: () => client.login(token || process.env.DISCORD_BOT_TOKEN) };
}

async function handleJoin(message: Message, requestedBusinessId?: string) {
  const member = message.member;
  const voiceChannel = member?.voice.channel;

  if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
    await message.reply("Please join a voice channel first, then type `!join`.");
    return;
  }

  const businesses = await getBusinesses();
  const business =
    businesses.find((b) => b.id === requestedBusinessId) ||
    businesses.find((b) => b.id === "biz_clinic") ||
    businesses[0];

  if (!business) {
    await message.reply("No business configuration found.");
    return;
  }

  // If already in this channel, notify
  if (sessions.has(voiceChannel.id)) {
    await message.reply(`Already active in **${voiceChannel.name}** for **${business.name}**.`);
    return;
  }

  try {
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator as any,
      selfDeaf: false,
      selfMute: false,
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);

    const player = createAudioPlayer();
    connection.subscribe(player);

    const callId = newId("call");
    const callLog: CallLog = {
      id: callId,
      businessId: business.id,
      callerPhone: `discord:${message.author.id}`,
      language: "en",
      channel: "discord",
      startedAt: new Date().toISOString(),
      outcome: "in_progress",
      transcript: [],
    };
    await upsertCall(callLog);

    const session: VoiceSession = {
      guildId: voiceChannel.guild.id,
      channelId: voiceChannel.id,
      connection,
      player,
      business,
      callLog,
      history: [],
      isProcessing: false,
    };

    sessions.set(voiceChannel.id, session);

    // Initial greeting
    const greetingText =
      business.greeting?.replace("{name}", business.name) ||
      `Hello! Thank you for contacting ${business.name}. How can I assist you today?`;

    session.history.push({ role: "assistant", content: greetingText });
    session.callLog.transcript.push({
      role: "aiva",
      text: greetingText,
      timestamp: new Date().toISOString(),
    });
    await upsertCall(session.callLog);

    await playTTS(session, greetingText);

    // Start listening for user speech
    setupAudioReceiver(session);

    await message.reply(
      `📞 Connected to **${voiceChannel.name}** as receptionist for **${business.name}**! Start speaking anytime.`
    );
  } catch (err) {
    console.error("[Cloaflow Discord] Failed to join voice channel:", err);
    await message.reply("Failed to join the voice channel. Please check bot voice permissions.");
  }
}

async function handleLeave(message: Message) {
  const member = message.member;
  const voiceChannel = member?.voice.channel;

  if (!voiceChannel) {
    await message.reply("You must be in a voice channel to use `!leave`.");
    return;
  }

  const session = sessions.get(voiceChannel.id);
  if (!session) {
    await message.reply("I am not currently in that voice channel.");
    return;
  }

  await endSession(session);
  await message.reply("Disconnected. Call summary has been saved to the dashboard.");
}

async function handleBusinessSwitch(message: Message, businessId?: string) {
  const member = message.member;
  const voiceChannel = member?.voice.channel;
  if (!voiceChannel) return;

  const session = sessions.get(voiceChannel.id);
  if (!session) {
    await message.reply("I am not currently active in your voice channel.");
    return;
  }

  const businesses = await getBusinesses();
  const found = businesses.find((b) => b.id === businessId);

  if (!found) {
    const list = businesses.map((b) => `• \`${b.id}\` — ${b.name}`).join("\n");
    await message.reply(`Unknown business. Available businesses:\n${list}`);
    return;
  }

  session.business = found;
  session.callLog.businessId = found.id;
  await upsertCall(session.callLog);

  await message.reply(`Switched active persona to **${found.name}** (${found.type}).`);
}

async function handleStatus(message: Message) {
  const member = message.member;
  const voiceChannel = member?.voice.channel;
  const session = voiceChannel ? sessions.get(voiceChannel.id) : undefined;

  if (!session) {
    await message.reply("No active receptionist session in this channel. Use `!join` to start.");
    return;
  }

  await message.reply(
    `**Cloaflow Status**:\n` +
      `• **Business**: ${session.business.name} (\`${session.business.id}\`)\n` +
      `• **Channel**: <#${session.channelId}>\n` +
      `• **Turns so far**: ${session.history.length}\n` +
      `• **Call ID**: \`${session.callLog.id}\``
  );
}

async function handleHelp(message: Message) {
  await message.reply(
    `**Cloaflow Discord Receptionist Commands**:\n` +
      `• \`!join [business_id]\` — Summon the AI receptionist to your voice channel\n` +
      `• \`!leave\` — Disconnect the bot and generate post-call analysis\n` +
      `• \`!business <id>\` — Switch business persona (\`biz_clinic\`, \`biz_salon\`, \`biz_restaurant\`, \`biz_hotel\`)\n` +
      `• \`!status\` — Show current session status\n` +
      `• \`!help\` — Show this help message`
  );
}

function setupAudioReceiver(session: VoiceSession) {
  const receiver = session.connection.receiver;

  receiver.speaking.on("start", (userId) => {
    // If we're already processing a turn, skip overlapping stream
    if (session.isProcessing) return;

    const opusStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 800,
      },
    });

    const opusDecoder = new prism.opus.Decoder({
      rate: 48000,
      channels: 2,
      frameSize: 960,
    });

    const pcmChunks: Buffer[] = [];
    opusStream.pipe(opusDecoder);

    opusDecoder.on("data", (chunk: Buffer) => {
      pcmChunks.push(chunk);
    });

    opusDecoder.on("end", async () => {
      if (pcmChunks.length === 0 || session.isProcessing) return;

      session.isProcessing = true;
      try {
        const pcmBuffer = Buffer.concat(pcmChunks);
        const wavBuffer = pcmToWav(pcmBuffer, 48000, 2, 16);

        const text = await transcribeAudio(wavBuffer, session.business.languages[0] || "en");
        if (!text || text.trim().length === 0) {
          session.isProcessing = false;
          return;
        }

        console.log(`[Cloaflow Discord User (${userId})]: ${text}`);

        // Record caller transcript
        session.callLog.transcript.push({
          role: "caller",
          text,
          timestamp: new Date().toISOString(),
        });
        await upsertCall(session.callLog);

        const callerContext = await getCallerContext(session.business.id, `discord:${userId}`);

        // Run turn with core agent using configured Discord AI provider
        const result = await runAgentTurn(session.business, session.history, text, {
          callerContext: callerContext || undefined,
          language: session.business.languages[0] || "en",
          provider: process.env.DISCORD_AI_PROVIDER || process.env.AI_PROVIDER,
        });

        // Update history
        session.history.push({ role: "user", content: text });
        session.history.push({ role: "assistant", content: result.reply });

        // Update transcript
        session.callLog.transcript.push({
          role: "aiva",
          text: result.reply,
          timestamp: new Date().toISOString(),
        });

        // Map events to outcome if triggered
        if (result.events.includes("appointment_booked")) {
          session.callLog.outcome = "appointment_booked";
        } else if (result.events.includes("order_taken")) {
          session.callLog.outcome = "order_taken";
        } else if (result.events.includes("transfer_requested")) {
          session.callLog.outcome = "transferred";
        }

        await upsertCall(session.callLog);

        console.log(`[Cloaflow Discord Agent]: ${result.reply}`);
        await playTTS(session, result.reply);
      } catch (err) {
        console.error("[Cloaflow Discord] Turn error:", err);
      } finally {
        session.isProcessing = false;
      }
    });
  });
}

async function playTTS(session: VoiceSession, text: string) {
  try {
    const audioBuffer = await synthesizeSpeech(text);
    if (audioBuffer.length === 0) return;

    const stream = Readable.from(audioBuffer);
    const resource = createAudioResource(stream);
    session.player.play(resource);
  } catch (err) {
    console.error("[Cloaflow Discord] TTS playback error:", err);
  }
}

async function endSession(session: VoiceSession) {
  sessions.delete(session.channelId);

  try {
    session.player.stop();
    session.connection.destroy();
  } catch {}

  session.callLog.endedAt = new Date().toISOString();
  if (session.callLog.outcome === "in_progress") {
    session.callLog.outcome = "faq_answered";
  }
  await upsertCall(session.callLog);

  // Trigger post-call intelligence
  try {
    await analyzeCall(session.business, session.callLog, {
      provider: process.env.DISCORD_AI_PROVIDER || process.env.AI_PROVIDER,
    });
  } catch (err) {
    console.error("[Cloaflow Discord] Post-call analysis failed:", err);
  }
}
