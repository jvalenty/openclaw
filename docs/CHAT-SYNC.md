# Chat Sync Architecture

This document explains how chat messages are synchronized across different channels (Web, Telegram, etc.) to Stellabot's database.

## Overview

Stellabot maintains a unified chat history that combines messages from:
- **Web Chat** (Stellabot sidebar)
- **Telegram** (via Clawdbot)
- **Other channels** (Signal, Discord, etc.)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    STELLABOT (Cloud)                        │
│                                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │ Web Chat UI │───▶│ /clawdbot/   │───▶│ chatMessages  │  │
│  │             │    │   chat       │    │   (DB)        │  │
│  └─────────────┘    └──────────────┘    └───────────────┘  │
│                                               ▲             │
│                                               │             │
│                     ┌─────────────────────────┘             │
│                     │                                       │
│  ┌─────────────┐    │    ┌──────────────┐                   │
│  │ /api/chat/  │────┴───▶│ Webhook      │                   │
│  │   webhook   │         │ Handler      │                   │
│  └─────────────┘         └──────────────┘                   │
│         ▲                                                   │
└─────────┼───────────────────────────────────────────────────┘
          │
          │ HTTP POST (webhook)
          │
┌─────────┴───────────────────────────────────────────────────┐
│                    CLAWDBOT (Local)                         │
│                                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │ Telegram    │───▶│ Gateway      │───▶│ Session       │  │
│  │ Messages    │    │              │    │ Storage       │  │
│  └─────────────┘    └──────────────┘    └───────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Sync Methods

### 1. Web Chat (Automatic)

Messages sent through Stellabot's web chat are automatically saved to the database:

- User messages saved before sending to Clawdbot
- Assistant responses saved after receiving from Clawdbot
- Both stored with `source: 'web'` metadata

**Implementation:** `server/routes/clawdbot-chat.ts` → `saveChatMessage()`

### 2. External Webhook (Real-time)

External systems can POST messages to Stellabot in real-time:

```bash
POST /api/chat/webhook
Headers:
  x-webhook-secret: <CHAT_WEBHOOK_SECRET>

Body:
{
  "source": "telegram",
  "userId": "8120973414",
  "agentId": "stella",
  "role": "user",
  "content": "Hello from Telegram!",
  "timestamp": "2026-02-01T22:00:00Z",
  "messageId": "optional-unique-id"
}
```

**Environment Variables:**
- `CHAT_WEBHOOK_SECRET` - Secret for authenticating webhook calls (falls back to `SESSION_SECRET`)

### 3. External API (Batch Sync)

For batch ingestion from external sources:

```bash
POST /api/chat/external
Headers:
  x-stellabot-token: <EXTERNAL_CHAT_TOKEN>

Body:
{
  "source": "telegram",
  "sourceUserId": "8120973414",
  "agentId": "stella",
  "role": "user",
  "content": "Message content",
  "timestamp": "2026-02-01T22:00:00Z",
  "messageId": "telegram_12345",
  "metadata": { "optional": "data" }
}
```

**Environment Variables:**
- `EXTERNAL_CHAT_TOKEN` - Token for authenticating external API calls

## Configuring Telegram Sync

### Option A: Clawdbot Webhook (Recommended)

Configure Clawdbot to call Stellabot's webhook for every message:

1. Set environment variables in Clawdbot config:
   ```json
   {
     "env": {
       "STELLABOT_WEBHOOK_URL": "https://stellabot.app/api/chat/webhook",
       "STELLABOT_WEBHOOK_SECRET": "your-secret-here"
     }
   }
   ```

2. Add a message hook (if supported by Clawdbot version)

### Option B: Cron-Based Sync

Run periodic sync via cron job:

```bash
# Add to your crontab or scheduled tasks
*/5 * * * * STELLABOT_URL=https://stellabot.app STELLABOT_TOKEN=xxx npx ts-node /path/to/scripts/sync-telegram-messages.ts
```

### Option C: Manual Sync

Trigger sync manually via the Stellabot admin UI or API.

## Viewing Unified History

The unified chat history endpoint combines messages from all sources:

```bash
GET /api/chat/unified/:agentId
```

Returns messages from:
- Web chat sessions
- Telegram sessions
- Any other external sources

Each message includes a `source` field indicating its origin.

## Deduplication

Messages are deduplicated using:
1. `messageId` field (if provided)
2. `onConflictDoNothing()` on database insert

Always provide a unique `messageId` when syncing to prevent duplicate entries.

## Troubleshooting

### Web chat messages not appearing
- Check browser console for errors
- Verify Clawdbot connection status (green Wifi icon)
- Check `/api/chat/messages` response

### Telegram messages not syncing
- Verify webhook is configured correctly
- Check Stellabot server logs for webhook calls
- Test webhook manually with curl

### Duplicate messages
- Ensure `messageId` is unique across all sync calls
- Check for multiple sync processes running simultaneously
