# 🤖 Discord Voice Receptionist Setup Guide

Cloaflow can join your Discord voice channels and act as an interactive 24/7 AI receptionist for your community or team.

---

## 1. Create a Discord Bot Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** and give it a name (e.g. `Cloaflow Receptionist`).
3. In the left sidebar, navigate to **Bot**:
   - Click **Add Bot** / **Reset Token** and copy your **Bot Token**.
   - Under **Privileged Gateway Intents**, enable:
     - ✅ **Message Content Intent**
     - ✅ **Server Members Intent**
4. Under **OAuth2 ➔ URL Generator**:
   - Select **Scopes**: `bot`, `applications.commands`
   - Select **Bot Permissions**:
     - `Send Messages`
     - `Connect`
     - `Speak`
     - `Use Voice Activity`
   - Copy the generated invite link and open it in your browser to invite the bot to your Discord server.

---

## 2. Configure Environment Variables

Add your bot token to `.env.local`:

```env
DISCORD_BOT_TOKEN=your_discord_bot_token_here
```

Ensure your AI provider is configured:
```env
# Anthropic (Claude) or OpenAI-compatible
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# For Voice STT (Whisper) & TTS:
OPENAI_API_KEY=sk-...
```

---

## 3. Run the Discord Voice Bot

Start the Discord bot daemon:

```bash
npm run discord
```

---

## 4. Discord Voice Commands

Join any voice channel in your server and type in any text channel:

| Command | Description |
|---|---|
| `!join [business_id]` | Summons the AI receptionist to your current voice channel (e.g., `!join biz_clinic`). |
| `!leave` | Disconnects the bot and saves the call summary to the Cloaflow dashboard. |
| `!business <id>` | Switches active business persona (`biz_clinic`, `biz_salon`, `biz_restaurant`, `biz_hotel`). |
| `!status` | Displays the current voice session and turns count. |
| `!help` | Displays command list. |

---

## 5. Dashboard Visibility

Calls made in Discord voice channels are tracked on the Cloaflow dashboard (`/dashboard/calls`) with:
- Full audio transcripts
- Real-time slot booking and order logging
- Automatic post-call intelligence, summaries, and staff action items
