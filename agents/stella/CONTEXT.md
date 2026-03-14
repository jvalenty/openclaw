# Current Context

**Last Updated:** 2026-02-02 09:00 PST
**Active Projects:** Stellabot Web Chat, Multi-Agent Architecture, Machine Sync

---

## 🎯 Morning Checklist

### Phase 4: Config Application (Mac Mini)
- [ ] When sync client receives new config, update `~/.clawdbot/clawdbot.json`
- [ ] Detect if critical config changed (systemPrompt, model, etc.)
- [ ] Trigger Clawdbot gateway restart if needed
- [ ] OR use Clawdbot's config reload mechanism if available

### WebSocket Debugging
- [ ] Debug why WebSocket gets 400 from Stellabot
- [ ] Likely Cloudflare/Replit blocking WS upgrade
- [ ] Test WebSocket locally or find alternative (long-polling?)

### MoltWorker Enhancements
- [ ] Deploy MoltWorker changes to Cloudflare
- [ ] Add `STELLABOT_URL` + `STELLABOT_MACHINE_TOKEN` secrets
- [ ] Test Jarvis seeing his Soul from Stellabot
- [ ] Add periodic refresh (not just cold start)

### Testing
- [ ] Save Jarvis's Soul in Stellabot UI
- [ ] Verify it appears on MoltWorker
- [ ] Save Stella's Soul, verify on Mac Mini
- [ ] Test context doc sync both directions

---

## 📁 Key Files

| Purpose | Location |
|---------|----------|
| **Full Documentation** | `docs/MACHINE-SYNC-SYSTEM.md` |
| **Protocol Spec** | `memory/MACHINE-SYNC-PROTOCOL.md` |
| **Mac Mini Sync Client** | `e2e-client/sync-client.ts` |
| **MoltWorker Sync** | `moltworker/src/gateway/stellabot.ts` |
| **Stellabot Sync API** | `stellabot-replit/server/routes/machine-sync.ts` |

---

## ✅ Completed (2026-01-31)

1. **Sync API** - `GET/POST /api/machines/:id/sync`
2. **WebSocket push on agent save** - Auto-pushes config to machine
3. **Mac Mini sync client** - Pulls config, writes to workspace files
4. **MoltWorker sync** - Fetches config on cold start
5. **modelConfig handling** - Soul saved to `modelConfig.systemPrompt`
6. **Task board context sync** - Button to sync board to context doc

---

## 🔧 Quick Commands

### Run Mac Mini Sync
```bash
cd ~/clawd/e2e-client
export $(cat .env | xargs)
npm run sync
```

### Test Stellabot API
```bash
curl -H "Authorization: Bearer $STELLABOT_MACHINE_TOKEN" \
  https://stellabot.app/api/machines/1d6940b3-bda0-45a9-a4b1-b0137840ae48/sync | jq '.agents[].name'
```

### Deploy MoltWorker
```bash
cd ~/clawd/moltworker
npx wrangler deploy
```

---

## 📊 Current State

| Machine | Sync Status | Notes |
|---------|-------------|-------|
| Mac Mini | ✅ HTTP works | WS blocked by Cloudflare |
| MoltWorker | 🔶 Code ready | Needs deploy + secrets |

| Agent | Machine | Soul Synced |
|-------|---------|-------------|
| Stella | Mac Mini | ✅ Yes |
| Jarvis | MoltWorker | 🔶 Pending deploy |
| Paul | Mac Mini | ✅ Yes |
| Asaph | Mac Mini | ✅ Yes |
| Roxanne | Mac Mini | ✅ Yes |

---

## 💡 Architecture Decision

We chose **HTTP polling + WebSocket push** over Git-based sync because:
- Simpler integration with Stellabot UI
- Real-time push capability (when WS works)
- No external Git service needed
- Version tracking built into DB

Git concepts borrowed:
- Version numbers on docs
- Content hashes for conflict detection
- Pull/push semantics

---

---

## 🏗️ Multi-Agent Architecture (NEW)

**Doc:** `docs/MULTI-AGENT-ARCHITECTURE.md`

**Goal:** Unlimited agents on single machine with tool access

**Key decisions:**
- Stellabot owns all channels (one Telegram bot, routes to agents)
- Single process, dynamic agent loading (not separate processes)
- Agents are "headless" — reply through Stellabot API
- Shared tool environment (optional per-agent isolation)

**Tasks in board:** `[Arch]` prefix

---

## 📱 Channel Setup

**Pending:** 1-click Slack OAuth setup (no more manual API key copying)

**Task in board:** `[Channels] 1-click Slack setup`

---

## 📁 Key Documentation

| Doc | Purpose |
|-----|---------|
| `docs/MACHINE-SYNC-SYSTEM.md` | Sync system (complete) |
| `docs/MULTI-AGENT-ARCHITECTURE.md` | Multi-agent design (NEW) |
| `memory/MACHINE-SYNC-PROTOCOL.md` | Sync protocol spec |

---

*Task board is source of truth. Check stellabot.app/tasks*

---

## 🏗️ Infrastructure Overview

### Stellabot Production
| Component | Location | Notes |
|-----------|----------|-------|
| **App** | Fly.io (stellabot-app) | 2 machines, SJC region |
| **Database** | Replit PostgreSQL | External to Fly |
| **Domain** | stellabot.app | Via Fly certificates |
| **Repo** | github.com/jvalenty/stellabot | |

### Deployment
- **Auto-deploy**: DISABLED (webhook tried to create PG, failed)
- **Method**: Manual `fly deploy --app stellabot-app`
- **Why**: Fly's GitHub webhook auto-detects Node.js and tries to provision Postgres, but we use Replit's external PG

### Other Infrastructure
| Service | Purpose | Location |
|---------|---------|----------|
| MoltWorker | Jarvis agent | Cloudflare Workers |
| Mac Mini | Stella/Paul/etc | Local + Cloudflare Tunnel |
| Clawdbot | Agent runtime | Mac Mini |
