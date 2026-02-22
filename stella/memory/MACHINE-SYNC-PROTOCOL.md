# Machine Sync Protocol

**Created:** 2026-01-31
**Status:** In Progress
**Goal:** Bidirectional sync of agent config and context between Stellabot (control plane) and machines (execution environments).

---

## Overview

Machines (Mac Mini, MoltWorker, future nodes) need to receive agent configuration from Stellabot and report learned context back. This protocol handles both directions.

```
┌─────────────────────────────────────────────────────────────┐
│                    STELLABOT (Control Plane)                │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Agents DB   │  │ Context DB  │  │ WebSocket Server    │ │
│  │ (modelConfig│  │ (docs,      │  │ (push to machines)  │ │
│  │  Soul, etc) │  │  versions)  │  │                     │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
│         │                │                    │            │
│         └────────────────┼────────────────────┘            │
│                          │                                 │
│                    Sync API                                │
│              /api/machines/:id/sync                        │
└─────────────────────────────┬───────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
            ▼                 ▼                 ▼
     ┌────────────┐    ┌────────────┐    ┌────────────┐
     │  Mac Mini  │    │ MoltWorker │    │  Future    │
     │            │    │            │    │  Machines  │
     │ ~/clawd/   │    │ /root/     │    │            │
     │  SOUL.md   │    │  clawd/    │    │            │
     │  MEMORY.md │    │            │    │            │
     └────────────┘    └────────────┘    └────────────┘
```

---

## Protocol Specification

### 1. Machine → Stellabot: Pull Config

**Endpoint:** `GET /api/machines/:machineId/sync`

**Auth:** `Authorization: Bearer {machine_token}`

**Query Params:**
- `since` (optional): ISO timestamp, only return changes after this time

**Response:**
```json
{
  "ok": true,
  "machineId": "uuid",
  "syncVersion": "2026-01-31T22:55:00Z",
  "agents": [
    {
      "id": "agent-uuid",
      "name": "Stella",
      "agentType": "sys_admin",
      "modelConfig": {
        "systemPrompt": "# Stella Costa\n\nYou are...",
        "model": "claude-opus-4-5",
        "temperature": 0.7
      },
      "contextDocs": [
        {
          "id": 1,
          "key": "stella-profile",
          "title": "Stella Profile",
          "content": "...",
          "version": 3,
          "contentHash": "abc123",
          "updatedAt": "2026-01-31T22:00:00Z"
        }
      ],
      "contextDocIds": [1, 5, 8]
    }
  ],
  "serverTime": "2026-01-31T22:55:00Z"
}
```

### 2. Machine → Stellabot: Push Context Updates

**Endpoint:** `POST /api/machines/:machineId/sync`

**Auth:** `Authorization: Bearer {machine_token}`

**Request Body:**
```json
{
  "agentId": "agent-uuid",
  "updates": [
    {
      "key": "agent-stella-memory",
      "title": "Stella Memory",
      "content": "# Memory\n\n## Learned today...",
      "docType": "memory",
      "baseVersion": 2,
      "baseHash": "abc123"
    }
  ],
  "extractions": [
    {
      "type": "fact",
      "content": "John prefers direct communication",
      "importance": 80,
      "sessionId": "session-123"
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "synced": [
    {
      "key": "agent-stella-memory",
      "version": 3,
      "status": "updated"
    }
  ],
  "conflicts": [],
  "extractionsStored": 1
}
```

### 3. Stellabot → Machine: Push on Save (WebSocket)

**Connection:** `wss://stellabot.app/ws/machines?token={machine_token}`

**Message Types:**

```json
// Config update (Soul/agent saved in UI)
{
  "type": "config_update",
  "agentId": "agent-uuid",
  "modelConfig": { "systemPrompt": "..." },
  "version": "2026-01-31T22:55:00Z"
}

// Context doc update
{
  "type": "context_update",
  "agentId": "agent-uuid",
  "doc": {
    "id": 1,
    "key": "stella-profile",
    "content": "...",
    "version": 4
  }
}

// Full sync request (machine should pull)
{
  "type": "sync_required",
  "reason": "bulk_update"
}
```

**Machine Response:**
```json
{
  "type": "config_applied",
  "agentId": "agent-uuid",
  "version": "2026-01-31T22:55:00Z"
}
```

---

## Version & Conflict Handling

### Version Tracking
- Each context doc has `version` (integer, increments on change)
- Each doc has `contentHash` (SHA256 of content, first 16 chars)
- Machine tracks `lastSyncVersion` per agent

### Conflict Detection
When machine pushes:
1. Include `baseVersion` and `baseHash` from last pull
2. Server compares to current version
3. If mismatch → conflict

### Conflict Resolution
- **Default:** Last-write-wins (server version kept, machine update rejected)
- **Optional:** Return both versions for manual merge
- **Future:** Smart merge for markdown (section-based)

---

## Implementation Plan

### Phase 1: Sync Endpoint (Stellabot)
- [x] `GET /api/machines/:id/sync` - return agents + context ✅ (3dba226)
- [x] `POST /api/machines/:id/sync` - accept context updates ✅ (3dba226)
- [x] Wire up WebSocket push on agent save ✅ (3dba226)

### Phase 2: Sync Client (Mac Mini / e2e-client)
- [x] Startup sync: pull config, write to local files ✅
- [x] Periodic sync: every 5 minutes ✅
- [ ] File watcher: push changes when local files modified (TODO)
- [x] WebSocket client: receive pushes, apply to local files ✅ (WS connection blocked by Cloudflare, HTTP fallback works)

### Phase 3: Sync Client (MoltWorker)
- [x] Fetch Stellabot config on Worker startup ✅ (c0c0b9e)
- [x] Extract systemPrompt, agentName, context from config ✅
- [x] Pass config to sandbox via env vars ✅
- [x] start-moltbot.sh applies config to clawdbot.json ✅
- [ ] Periodic refresh (TODO - currently only on cold start)
- [ ] Use R2 for persistent file storage between sandbox restarts (TODO)

### Phase 4: Config Application
- [ ] When config received, update clawdbot.json
- [ ] Restart gateway if critical config changed
- [ ] Or use Clawdbot's config reload mechanism if available

---

## File Mapping

| Stellabot Field | Local File |
|-----------------|------------|
| `modelConfig.systemPrompt` | `SOUL.md` |
| Context doc (type=memory) | `MEMORY.md` |
| Context doc (type=tasks) | `TASKS.md` |
| Context doc (type=knowledge) | `context/{key}.md` |

---

## Security

- All endpoints require valid machine token
- Machine can only sync agents assigned to it
- Rate limiting on sync endpoints
- Audit log of all sync operations

---

## Open Questions

1. Should machines be able to create new context docs, or only update existing?
2. How to handle machine-specific context (different per machine) vs shared context?
3. Do we need real-time sync or is 5-minute polling + push-on-save enough?

---

## Related Files

- `server/machines/websocket-handler.ts` - existing WS push infrastructure
- `server/routes/agent-context.ts` - existing context sync routes
- `server/routes/machines.ts` - machine heartbeat/auth
- `e2e-client/` - Mac Mini sync client (to be built)
- `moltworker/src/` - MoltWorker sync client (to be built)
