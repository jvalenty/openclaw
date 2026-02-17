# Machine Sync System

**Created:** 2026-01-31
**Status:** Phase 3 Complete, Phase 4 Pending
**Authors:** Stella Costa, John Valenty

---

## Overview

The Machine Sync System enables bidirectional synchronization of agent configuration and context between Stellabot (control plane) and execution machines (Mac Mini, MoltWorker, future nodes).

### Problem Solved

Agents need their "Soul" (system prompt), context documents, and configuration to follow them across machines. When John edits an agent's Soul in the Stellabot UI, that change needs to reach the machine running the agent. Conversely, when an agent learns something (updates MEMORY.md, extracts facts), that needs to sync back to Stellabot.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    STELLABOT (Control Plane)                    │
│                      https://stellabot.app                      │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  Agents DB   │  │ Context Docs │  │  WebSocket Server     │ │
│  │  - modelConfig│  │  - SOUL      │  │  /ws/machines         │ │
│  │  - Soul/prompt│  │  - MEMORY    │  │  (push on save)       │ │
│  │  - contextIds │  │  - TASKS     │  │                       │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘ │
│         │                 │                      │             │
│         └─────────────────┼──────────────────────┘             │
│                           │                                    │
│                     Sync API                                   │
│           GET/POST /api/machines/:id/sync                      │
└───────────────────────────┬────────────────────────────────────┘
                            │
           ┌────────────────┼────────────────┐
           │                │                │
           ▼                ▼                ▼
    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │  Mac Mini   │  │ MoltWorker  │  │   Future    │
    │  (Clawdbot) │  │ (CF Worker) │  │  Machines   │
    │             │  │             │  │             │
    │ ~/clawd/    │  │ /root/clawd │  │             │
    │  SOUL.md    │  │  SOUL.md    │  │             │
    │  MEMORY.md  │  │  CONTEXT.md │  │             │
    │  context/   │  │             │  │             │
    └─────────────┘  └─────────────┘  └─────────────┘
```

---

## Components Built

### 1. Stellabot Sync API

**Location:** `stellabot-replit/server/routes/machine-sync.ts`

#### GET /api/machines/:machineId/sync

Pulls agent configuration and context for a machine.

**Auth:** Bearer token (machine API token)

**Response:**
```json
{
  "ok": true,
  "machineId": "uuid",
  "machineName": "Stellabot Mac-Mini",
  "syncVersion": "2026-01-31T22:55:00Z",
  "agents": [
    {
      "id": "agent-uuid",
      "name": "Stella",
      "agentType": "sys_admin",
      "modelConfig": {
        "systemPrompt": "# Stella Costa\n\nYou are..."
      },
      "contextDocs": [
        {
          "id": 1,
          "key": "stella-profile",
          "title": "Stella Profile",
          "content": "...",
          "version": 3,
          "contentHash": "abc123"
        }
      ],
      "contextDocIds": [1, 5, 8]
    }
  ],
  "serverTime": "2026-01-31T22:55:00Z"
}
```

#### POST /api/machines/:machineId/sync

Pushes context updates from machine to Stellabot.

**Request:**
```json
{
  "agentId": "agent-uuid",
  "updates": [
    {
      "key": "agent-stella-memory",
      "title": "Stella Memory",
      "content": "# Memory\n\n...",
      "docType": "memory",
      "baseVersion": 2
    }
  ],
  "extractions": [
    {
      "type": "fact",
      "content": "John prefers direct communication",
      "importance": 80
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "synced": [{ "key": "...", "version": 3, "status": "updated" }],
  "conflicts": [],
  "extractionsStored": 1
}
```

### 2. WebSocket Push on Agent Save

**Location:** `stellabot-replit/server/routes/agents.ts` + `server/machines/websocket-handler.ts`

When an agent is updated in the Stellabot UI, the system automatically pushes the new configuration to the machine via WebSocket (if connected) or the machine will receive it on next sync poll.

**Flow:**
1. User saves agent in UI → `PUT /api/agents/:id`
2. Server updates DB
3. Server calls `machineWebSocket.pushConfigUpdate(machineId)`
4. WebSocket sends `config_update` message with full agent data
5. Machine applies config locally

### 3. Mac Mini Sync Client

**Location:** `e2e-client/sync-client.ts`

A TypeScript client that runs on the Mac Mini to sync with Stellabot.

**Features:**
- Initial sync on startup
- Periodic sync every 5 minutes
- WebSocket connection for real-time pushes
- Applies `modelConfig.systemPrompt` → `SOUL.md`
- Writes context docs to workspace files

**Usage:**
```bash
cd ~/clawd/e2e-client
export $(cat .env | xargs)
npm run sync
```

**Environment Variables:**
```
STELLABOT_URL=https://stellabot.app
STELLABOT_MACHINE_TOKEN=e2e_xxx...
CLAWDBOT_WORKSPACE=/Users/stella/clawd
```

### 4. MoltWorker Sync Integration

**Location:** `moltworker/src/gateway/stellabot.ts`

MoltWorker (Cloudflare Worker) fetches Stellabot config on cold start and passes it to the sandbox.

**Flow:**
1. Worker receives request
2. If Stellabot URL configured, fetch config from API
3. Extract `systemPrompt`, `agentName`, combined context
4. Pass as env vars to sandbox process
5. `start-moltbot.sh` writes to `clawdbot.json`

**To Enable:**
Add these secrets in Cloudflare dashboard:
```
STELLABOT_URL = https://stellabot.app
STELLABOT_MACHINE_TOKEN = e2e_xxx...
```

---

## File Mapping

| Stellabot Field | Local Workspace File |
|-----------------|---------------------|
| `modelConfig.systemPrompt` | `SOUL.md` |
| Context doc (key=MEMORY) | `MEMORY.md` |
| Context doc (key=IDENTITY) | `IDENTITY.md` |
| Context doc (type=memory) | `memory/{key}.md` |
| Context doc (type=tasks) | `TASKS.md` |
| Context doc (other) | `context/{key}.md` |

---

## Version & Conflict Handling

### Version Tracking
- Each context doc has `version` (integer, increments on change)
- Each doc has `contentHash` (SHA256 prefix)
- Machine tracks `lastSyncVersion` per agent

### Conflict Detection
When machine pushes an update:
1. Include `baseVersion` and `baseHash` from last pull
2. Server compares to current version
3. If mismatch → conflict returned

### Conflict Resolution
- Default: Last-write-wins (server version kept)
- Conflicts returned in response for client handling
- Future: Smart merge for markdown

---

## Security

- All sync endpoints require valid machine token (`e2e_xxx`)
- Machine can only sync agents assigned to it
- WebSocket connections authenticated via token
- Audit log of sync operations

---

## Commits

| Commit | Description |
|--------|-------------|
| `3dba226` | Add machine sync protocol + WebSocket push |
| `8dcc668` | Include modelConfig in heartbeat response |
| `589bb2a` | Add Sync to Context button in task board |
| `80bc2b2` | Mac Mini sync client |
| `c0c0b9e` | MoltWorker Stellabot sync (local) |

---

## Related Files

### Stellabot (Control Plane)
- `server/routes/machine-sync.ts` - Sync API endpoints
- `server/routes/agents.ts` - Agent CRUD + push trigger
- `server/machines/websocket-handler.ts` - WebSocket push
- `server/routes/agent-context.ts` - Context extraction API

### Mac Mini
- `e2e-client/sync-client.ts` - Sync client
- `e2e-client/.env` - Configuration

### MoltWorker
- `moltworker/src/gateway/stellabot.ts` - Stellabot fetch
- `moltworker/src/gateway/env.ts` - Env var building
- `moltworker/start-moltbot.sh` - Config application

---

## Testing

### Test Mac Mini Sync
```bash
cd ~/clawd/e2e-client
export $(cat .env | xargs)
npx tsx sync-client.ts
```

Expected output:
```
[Sync] Pull OK: 4 agents
[Sync] Applying config for agent: Stella
✅ Updated SOUL.md from modelConfig.systemPrompt
```

### Test Stellabot API Directly
```bash
curl -H "Authorization: Bearer $STELLABOT_MACHINE_TOKEN" \
  https://stellabot.app/api/machines/$MACHINE_ID/sync | jq
```

---

## Remaining Tasks (Phase 4)

See `CONTEXT.md` for morning checklist.
