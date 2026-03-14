# Slack Integration Guide

## Overview

Slack integration routes through Clawdbot (the messaging hub). Stellabot provides the web UI, admin, and unified thread view.

## Architecture

```
Slack ←→ Clawdbot ←→ Stellabot
         (hub)      (UI + admin)
```

- **Clawdbot** handles the Slack connection (Socket Mode or HTTP)
- **Stellabot** displays unified chat history from all sources
- Thread context is shared across surfaces

## Setup Steps

### 1. Create Slack App

1. Go to https://api.slack.com/apps and create a new app
2. Enable **Socket Mode** (simpler) or use HTTP mode
3. Add required scopes (see below)
4. Install to workspace

### 2. Configure Clawdbot

Add to Clawdbot config (`~/.clawdbot/clawdbot.json`):

```json5
{
  channels: {
    slack: {
      enabled: true,
      appToken: "xapp-...",  // or use SLACK_APP_TOKEN env var
      botToken: "xoxb-...",  // or use SLACK_BOT_TOKEN env var
      dm: {
        enabled: true,
        policy: "allowlist",
        allowFrom: ["U123"]  // John's Slack user ID
      }
    }
  }
}
```

### 3. Thread Unification

Messages from Slack are routed to the same session as other surfaces when `dmScope: main` (default).

For Stellabot to show Slack messages:
1. Configure Clawdbot webhook to POST to Stellabot's `/api/chat/external`
2. Or poll Clawdbot's session transcripts

## Required Slack Scopes

### Bot Token Scopes (minimum)
- `chat:write` - Send messages
- `im:read`, `im:write`, `im:history` - DM access
- `app_mentions:read` - @mention detection
- `users:read` - User info

### Additional (recommended)
- `channels:read`, `channels:history` - Channel access
- `reactions:read`, `reactions:write` - Emoji reactions
- `files:read`, `files:write` - File uploads

## Session Mapping

| Slack Context | Session Key |
|--------------|-------------|
| DM with bot | `agent:main:main` (unified) |
| Channel | `agent:main:slack:channel:<id>` |
| Thread | Appended to parent session |

## Testing

1. DM the bot in Slack
2. Verify message appears in Stellabot web chat
3. Reply from web chat
4. Verify reply appears in Slack

## Troubleshooting

### Bot not responding
- Check Clawdbot logs: `clawdbot logs --follow`
- Verify tokens are correct
- Check Socket Mode is enabled in Slack app settings

### Messages not syncing to Stellabot
- Verify webhook endpoint is configured
- Check Stellabot logs for incoming messages
- Ensure session IDs match across surfaces

## Future: OAuth Flow

For multi-tenant deployment, implement Slack OAuth:
1. User clicks "Add to Slack" in Stellabot
2. OAuth flow grants workspace access
3. Tokens stored per-org in Stellabot DB
4. Clawdbot uses per-org config for routing

---

*See also:*
- [Agent Identity Architecture](./AGENT_IDENTITY_ARCHITECTURE.md)
- [Clawdbot Slack Docs](/opt/homebrew/lib/node_modules/clawdbot/docs/channels/slack.md)
