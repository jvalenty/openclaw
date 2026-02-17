# Stellabot Architecture

> Last updated: 2026-02-15 ~9:15 PM PST

## Overview

Stellabot is a multi-agent orchestration platform with multiple runtime models:

| Runtime | Where | Tools | Use Case |
|---------|-------|-------|----------|
| **Soft Agent** | Stellabot (Fly.io) | Cloud APIs (Sheets, Gmail, Calendar, R2 Files) | Data work, research |
| **Soft Agent + Hardware** | Stellabot → Machine Service | Cloud + Browser/Exec/Screen/Camera/LocalFiles | Browser automation, dev work |
| **Local Agent Runtime** | OrbStack VM (Mac) | Claude API + Claude Code CLI + local tools | Dev work with web chat |
| **Hard Agent** | Clawdbot (Mac) | Full system access | Sys admin, backup |

**Status:** Clawdbot independence achieved! All critical capabilities now available through Stellabot + Machine Service.

---

## System Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │             STELLABOT (Fly.io)              │
                    │                                             │
                    │  ┌─────────────┐    ┌─────────────────────┐ │
     Users ────────▶│  │  Web UI     │    │  Claude API          │ │
     (Web/API)      │  │  Chat       │───▶│  (Soft Agent Runtime)│ │
                    │  └─────────────┘    └──────────┬──────────┘ │
                    │                                │            │
                    │  ┌─────────────────────────────┼──────────┐ │
                    │  │  Tool Router                │          │ │
                    │  │  ┌──────────┬──────────┬────┴────────┐ │ │
                    │  │  │ Google   │ Database │ Machine Svc │ │ │
                    │  │  │ (Sheets, │ (Neon)   │ (Hardware)  │ │ │
                    │  │  │ Calendar)│          │             │ │ │
                    │  │  ├──────────┴──────────┴─────────────┤ │ │
                    │  │  │ R2 Cloud Storage (files_*)        │ │ │
                    │  │  ├───────────────────────────────────┤ │ │
                    │  │  │ Scheduler Service (cron/one-shot) │ │ │
                    │  └──┴───────────────────────────────────┴─┘ │
                    └─────────────────────────────────┬───────────┘
                                                      │
                              Tailscale Mesh (Private Network)
                                                      │
                    ┌─────────────────────────────────┴───────────┐
                    │           MAC MINI (100.74.241.116)         │
                    │                                             │
                    │  ┌───────────────────┐  ┌─────────────────┐ │
                    │  │  Machine Service  │  │  Clawdbot       │ │
                    │  │  :18900           │  │  :18789         │ │
                    │  │                   │  │  (backup only)  │ │
                    │  │  - Browser/PW     │  │                 │ │
                    │  │  - Local Files    │  │  - Telegram     │ │
                    │  │  - Exec/Process   │  │  - Hard Agents  │ │
                    │  │  - Screen/Camera  │  │                 │ │
                    │  └───────────────────┘  └─────────────────┘ │
                    └─────────────────────────────────────────────┘

                    ┌─────────────────────────────────────────────┐
                    │           CLOUDFLARE R2                     │
                    │                                             │
                    │  Bucket: e2e                                │
                    │  Path: /{orgId}/...                         │
                    │  Access: Stellabot /api/cloud-storage       │
                    │                                             │
                    └─────────────────────────────────────────────┘
```

---

## Machine Service (Primary Hardware Interface)

Standalone Express server providing hardware capabilities to soft agents.

### Location & Access

| Property | Value |
|----------|-------|
| **Code** | `~/clawd/stellabot-machine-service/` |
| **Config** | `~/clawd/stellabot-machine-service/config.json` |
| **Port** | 18900 |
| **Bind** | `100.74.241.116` (Tailscale only) |
| **Auth** | Bearer token |
| **Service** | `~/Library/LaunchAgents/com.stellabot.machine-service.plist` |
| **Logs** | `~/.stellabot-machine/audit.log` |

### All Endpoints

| Category | Endpoints | Purpose |
|----------|-----------|---------|
| **Browser** | `/browser/*`, `/navigate`, `/snapshot`, `/act`, `/tabs` | Playwright automation |
| **Files** | `/files/read`, `/files/write`, `/files/edit`, `/files/list` | Local filesystem access |
| **Exec** | `/exec` | Shell command execution |
| **Process** | `/process/start`, `/process/list`, `/process/:id`, `/process/:id/input`, `/process/:id/kill` | Background process management |
| **Screen** | `/screen/capture`, `/screen/record` | Screen capture |
| **Camera** | `/camera/list`, `/camera/snap`, `/camera/clip` | Camera access |
| **Health** | `/health`, `/browser/profiles`, `/browser/cleanup` | Service management |

### Per-Agent Browser Pools

Each agent gets **isolated browser sessions** with their own cookies/auth:

```
Browser Profiles:
~/.stellabot-machine/browser-profiles/
  └── {orgId}/
      ├── {agentId-1}/   ← Agent 1's sessions (10 tabs max)
      ├── {agentId-2}/   ← Agent 2's sessions (10 tabs max)
      └── (org-level)/   ← Legacy fallback
```

**Headers:**
- `X-Org-Id` — Organization isolation
- `X-Agent-Id` — Agent-specific browser pool

**Config:**
```json
"pool": {
  "maxPagesPerOrg": 5,
  "maxPagesPerAgent": 10
}
```

**Features:**
- Isolated cookies/sessions per agent
- Auto-cleanup of stale profiles (30 days)
- Chrome "Restore pages?" popup suppression
- Graceful shutdown handler

### Local File Tools

Full filesystem access for development work:

| Tool | Endpoint | Description |
|------|----------|-------------|
| `local_read` | `/files/read` | Read file with line offset/limit |
| `local_write` | `/files/write` | Write file, creates parent dirs |
| `local_edit` | `/files/edit` | Surgical text replacement |
| `local_list` | `/files/list` | Directory listing |

**Permission:** `local_files` in agent_actions table

**Security:** `basePaths` config restricts allowed directories:
```json
"files": {
  "basePaths": ["/Users/stella", "/tmp"],
  "maxFileSize": 10485760
}
```

### Process Management

Background process execution with streaming output:

| Tool | Endpoint | Description |
|------|----------|-------------|
| `process_start` | `POST /process/start` | Start background process |
| `process_list` | `GET /process/list` | List active sessions |
| `process_status` | `GET /process/:id` | Get output + status |
| `process_input` | `POST /process/:id/input` | Send stdin data |
| `process_kill` | `POST /process/:id/kill` | Kill process |

**Limits:**
- Max 20 concurrent sessions
- Auto-cleanup after 30 minutes idle
- Output buffer: 1MB per session

**Permission:** `process` in agent_actions table

### Service Management

```bash
# Health check
curl http://100.74.241.116:18900/health

# Restart
launchctl unload ~/Library/LaunchAgents/com.stellabot.machine-service.plist
launchctl load ~/Library/LaunchAgents/com.stellabot.machine-service.plist

# Logs (with rotation)
tail -f ~/.stellabot-machine/audit.log

# Pool status
curl http://100.74.241.116:18900/browser/profiles -H "Authorization: Bearer $TOKEN"

# Manual profile cleanup
curl -X POST http://100.74.241.116:18900/browser/cleanup -H "Authorization: Bearer $TOKEN"
```

### Security Model

| Layer | Implementation |
|-------|----------------|
| **Network** | Tailscale-only binding (not 0.0.0.0) |
| **Auth** | Bearer token required on all endpoints |
| **Files** | basePaths whitelist |
| **Exec** | Command blocklist (rm -rf /, shutdown, etc.) |
| **Audit** | All requests logged with rotation (10MB/7 days) |
| **Rate limit** | 100 req/min default |

---

## Local Agent Runtime (NEW)

Self-contained agent runtime with web chat interface, running in OrbStack VM for isolation.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          MAC MINI HOST                               │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    OrbStack Linux VM                            │ │
│  │  ┌──────────────────────────────────────────────────────────┐  │ │
│  │  │                   Agent Runtime (:18901)                  │  │ │
│  │  │  ┌─────────────────┐    ┌─────────────────────────┐      │  │ │
│  │  │  │  API Mode       │    │  CLI Mode               │      │  │ │
│  │  │  │  (Claude API)   │    │  (Claude Code CLI)      │      │  │ │
│  │  │  │  - Fast chat    │    │  - Coding tasks         │      │  │ │
│  │  │  │  - Tool calls   │    │  - Heavy dev work       │      │  │ │
│  │  │  └────────┬────────┘    └────────────┬────────────┘      │  │ │
│  │  │           │                          │                    │  │ │
│  │  │           ▼                          ▼                    │  │ │
│  │  │  ┌────────────────────────────────────────────────────┐  │  │ │
│  │  │  │           Internal Tools (in container)            │  │  │ │
│  │  │  │   files (mounted) | exec | git                     │  │  │ │
│  │  │  └────────────────────────────────────────────────────┘  │  │ │
│  │  │           │                                               │  │ │
│  │  │           │ HTTP calls to host                            │  │ │
│  │  └───────────┼───────────────────────────────────────────────┘  │ │
│  │              ▼                                                   │ │
│  │  ┌────────────────────────────────────────────────────────────┐ │ │
│  │  │         Host Machine Service (:18900)                       │ │ │
│  │  │   browser | screen | camera | host-only tools               │ │ │
│  │  └────────────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  Access: Tailscale OR Cloudflare Tunnel                               │
└───────────────────────────────────────────────────────────────────────┘
```

### Location & Files

| Path | Purpose |
|------|---------|
| `~/e2e/agents/` | Agent runtime code |
| `~/e2e/agents/config.json` | Configuration |
| `~/e2e/agents/web-chat/` | React chat interface |
| `~/e2e/agents/data/sessions.db` | SQLite sessions |
| `~/e2e/agents/scripts/` | Setup scripts |

### Dual Mode Operation

| Mode | Backend | Use Case | Default |
|------|---------|----------|---------|
| **CLI** | Claude Code CLI (Max Plan) | Coding, refactoring, heavy dev | ✅ Yes |
| **API** | Claude API (Sonnet) | Quick questions, conversations | Opt-in |
| **Auto** | Smart routing | Delegates based on task type | N/A |

CLI mode is default because most work is coding tasks. API mode available for quick conversational exchanges.

### Tool Routing

| Tool Type | Execution | Examples |
|-----------|-----------|----------|
| **Internal** | In container | files_read, files_write, exec, git |
| **Host** | HTTP to Machine Service | browser_*, screen_capture, camera_* |

### Network Configuration

Supports **both** Tailscale and Cloudflare Tunnel:

```json
{
  "network": {
    "tailscale": {
      "enabled": true,
      "hostname": "agent-runtime"
    },
    "cloudflare": {
      "enabled": false,
      "tunnelName": "agent-runtime",
      "publicHostname": "agent.example.com"
    }
  }
}
```

**Setup CF tunnel:**
```bash
./scripts/setup-cf-tunnel.sh agent-runtime agent.yourdomain.com 18901
```

### Secrets Priority

1. **Stellabot** (web-side storage via `/api/machine-secrets`)
2. **1Password CLI** (if available)
3. **Environment variables** (`.env` file)

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check with network status |
| `/chat` | WS | WebSocket for chat streaming |
| `/sessions` | GET | List all sessions |
| `/sessions/:id` | GET/DELETE | Session CRUD |
| `/secrets/status` | GET | Available secrets (no values) |
| `/config` | GET | Safe config subset |
| `/*` | GET | Serves web chat UI |

### WebSocket Protocol

**Connect:** `ws://host:18901/chat`

**Send:**
```json
{"sessionId": "optional", "message": "...", "mode": "auto|api|cli"}
```

**Receive events:**
- `session` — Session ID assigned
- `mode_switch` — Mode changed to api/cli
- `chunk` — Streaming text content
- `tool_use` — Tool being invoked
- `tool_result` — Tool output
- `done` — Response complete
- `error` — Error occurred

### Web Chat UI

React + Vite + Tailwind app with:
- Real-time streaming responses
- Mode selector (Auto/API/CLI)
- Session persistence
- Connection status indicator
- Tool activity display

### Build & Run

```bash
cd ~/e2e/agents

# Install all dependencies
npm run install:all

# Build backend + web chat
npm run build

# Run (serves on port 18901)
npm start
```

### OrbStack Setup

```bash
# Install OrbStack
brew install --cask orbstack

# Create VM (if not exists)
orb create ubuntu agent-runtime

# VM auto-mounts /Users at /mnt/mac/Users/
# Access workspace at: /mnt/mac/Users/stella/e2e/
```

---

## Scheduling System

Proactive task scheduling lives in **Stellabot** (not Machine Service).

### Schema (`agent_schedules` table)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `agent_id` | VARCHAR | Target agent |
| `org_id` | VARCHAR | Organization |
| `name` | VARCHAR | Schedule name |
| `schedule_type` | VARCHAR | `recurring` or `one_shot` |
| `cron_expression` | VARCHAR | Cron pattern for recurring |
| `run_at` | TIMESTAMP | Exact time for one_shot |
| `task_prompt` | TEXT | What to execute |
| `delivery_mode` | VARCHAR | `queue` or `silent` |
| `delete_after_run` | BOOLEAN | Auto-delete one-shots |
| `enabled` | BOOLEAN | Active flag |
| `next_run_at` | TIMESTAMP | Computed next execution |
| `last_run_at` | TIMESTAMP | Last execution time |
| `run_count` | INTEGER | Total executions |
| `error_count` | INTEGER | Failed executions |
| `last_error` | TEXT | Most recent error |

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agent-schedules?agentId=X` | List schedules for agent |
| POST | `/api/agent-schedules` | Create schedule |
| PUT | `/api/agent-schedules/:id` | Update schedule |
| DELETE | `/api/agent-schedules/:id` | Delete schedule |
| POST | `/api/agent-schedules/:id/run` | Manual trigger |

### Agent Tools

Soft agents can self-schedule with permission `scheduling`:

| Tool | Purpose |
|------|---------|
| `schedule_create` | Create recurring or one-shot task |
| `schedule_list` | List own schedules |
| `schedule_delete` | Remove a schedule |

### Schedule Types

**Recurring (cron-based):**
```javascript
{
  name: "Morning Check-in",
  schedule_type: "recurring",
  cron_expression: "0 9 * * *",  // Daily 9 AM
  task_prompt: "Check inbox and calendar for today"
}
```

**One-shot (exact time):**
```javascript
{
  name: "Reminder",
  schedule_type: "one_shot",
  run_at: "2026-02-13T14:00:00Z",
  task_prompt: "Remind John about the meeting",
  delete_after_run: true
}
```

### Cron Examples

| Pattern | Meaning |
|---------|---------|
| `*/15 * * * *` | Every 15 minutes |
| `*/30 * * * *` | Every 30 minutes |
| `0 * * * *` | Every hour |
| `0 */2 * * *` | Every 2 hours |
| `0 9 * * *` | Daily at 9 AM |
| `0 9 * * 1` | Weekly (Monday 9 AM) |

### Scheduler Service

- Runs every 60 seconds in Stellabot
- Picks up due schedules (recurring: next_run_at <= now, one_shot: run_at <= now)
- Invokes agent with task_prompt
- Updates counters and timestamps
- Auto-deletes completed one-shots if configured
- Retries on error (5 min delay)

### UI

Schedules tab in Agent Edit page (`/admin/agents/:id`):
- Create recurring or one-shot tasks
- Toggle enable/disable
- Manual "Run Now" button
- View run count, errors, next/last run times

---

## Cloud Storage (R2)

All persistent file storage for soft agents uses Cloudflare R2:

| Property | Value |
|----------|-------|
| **Bucket** | `e2e` (John's CF account) |
| **Path** | `/{orgId}/{path}` |
| **API** | Stellabot `/api/cloud-storage` |
| **Tools** | `files_read`, `files_write`, `files_list`, `files_delete` |
| **Permission** | `files` in agent_actions |

### Local vs Cloud Files

| Use Case | Storage | Tools | Permission |
|----------|---------|-------|------------|
| Agent data, reports, exports | R2 Cloud | `files_*` | `files` |
| Code editing, config changes | Local (Machine Service) | `local_*` | `local_files` |

---

## Soft Agent Tool Permissions

Controlled by `agent_actions` table:

| Permission | Tools Enabled |
|------------|---------------|
| `google` | sheets_*, calendar_*, gmail_* |
| `database` | db_query |
| `files` | files_read, files_write, files_list, files_delete (R2) |
| `local_files` | local_read, local_write, local_edit, local_list |
| `process` | process_start, process_list, process_status, process_input, process_kill |
| `scheduling` | schedule_create, schedule_list, schedule_delete |
| `browser.navigate` | browser_navigate |
| `browser.interact` | browser_snapshot, browser_screenshot, browser_click, browser_type, etc. |
| `clawdbot` | clawdbot (escalate to hard agent) |
| `sandbox` | sandbox_execute |
| `memory.write` | memory_save |
| `memory.read` | memory_recall |

---

## Network Topology

```
┌──────────────────────────────────────────────────────────────────┐
│  TAILSCALE MESH (Private)                                        │
│                                                                  │
│  Fly.io (Stellabot)                                              │
│       │                                                          │
│       ▼                                                          │
│  Mac Mini (100.74.241.116)                                       │
│       ├── :18900 Machine Service (primary hardware interface)    │
│       ├── :18901 Agent Runtime (local dev, optional)             │
│       └── :18789 Clawdbot (backup)                               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  PUBLIC INTERNET                                                 │
│                                                                  │
│  stellabot.app ──────────▶ Fly.io (2 machines, SJC)             │
│                                                                  │
│  agent.example.com ──────▶ CF Tunnel ──▶ Mac Mini :18901        │
│  (optional)                  (Agent Runtime web chat)            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Access Options for Agent Runtime:**
- **Tailscale**: Direct access at `100.74.241.116:18901` (internal)
- **CF Tunnel**: Public hostname like `agent.example.com` (external)

### Fly.io Secrets

```
DATABASE_URL=postgresql://... (Neon)
MACHINE_SERVICE_URL=http://100.74.241.116:18900
MACHINE_SERVICE_TOKEN=<token>
CLAWDBOT_URL=http://100.74.241.116:18789
CLAWDBOT_TOKEN=<token>
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
R2_ACCESS_KEY=<key>
R2_SECRET_KEY=<secret>
R2_BUCKET=e2e
```

---

## Database

**Provider:** Neon PostgreSQL (us-east-1)
**Project:** snowy-glade-51902107

### Key Tables

| Table | Purpose |
|-------|---------|
| `agents` | Agent definitions, souls, configs |
| `agent_actions` | Tool permissions per agent |
| `agent_secrets` | Per-agent credentials (encrypted) |
| `agent_schedules` | Scheduled tasks (recurring + one-shot) |
| `machines` | Registered machines |
| `knowledge` | Agent knowledge/context |
| `skills` | Agent skill definitions |
| `chat_sessions` | Conversation sessions |
| `chat_messages` | Individual messages |
| `session_activity` | Session watchdog state |
| `orgs` | Organizations |
| `teams` | Team groupings |
| `team_members` | User-team associations |
| `integration_credentials` | Org-level OAuth tokens |

---

## Deployment

### Stellabot

```bash
cd ~/clawd/stellabot-replit
git add -A && git commit -m "message" && git push
fly deploy --app stellabot-app
```

### Machine Service

```bash
cd ~/clawd/stellabot-machine-service
npm run build
launchctl unload ~/Library/LaunchAgents/com.stellabot.machine-service.plist
launchctl load ~/Library/LaunchAgents/com.stellabot.machine-service.plist
```

---

## ✅ Clawdbot Independence - COMPLETE

All critical capabilities now available through Stellabot + Machine Service:

| Capability | Implementation | Status |
|------------|----------------|--------|
| Browser automation | Machine Service per-agent pools | ✅ |
| Local files | Machine Service /files/* | ✅ |
| Shell exec | Machine Service /exec | ✅ |
| Background processes | Machine Service /process/* | ✅ |
| Screen capture | Machine Service /screen/* | ✅ |
| Camera access | Machine Service /camera/* | ✅ |
| Cloud storage | R2 via Stellabot | ✅ |
| Scheduling/reminders | Stellabot scheduler service | ✅ |
| Log rotation | rotating-file-stream (10MB/7 days) | ✅ |
| Profile cleanup | Auto on startup + manual endpoint | ✅ |
| Graceful shutdown | SIGTERM handler | ✅ |

### Nice to Have (Future)

| Item | Effort | Purpose |
|------|--------|---------|
| Metrics endpoint | 1 hr | `/metrics` for Prometheus |
| Deep health checks | 30 min | Check browser/disk/memory in /health |

---

## File Locations

| Path | Purpose |
|------|---------|
| `~/e2e/stellabot/` | Stellabot codebase |
| `~/e2e/machine/` | Machine Service + Agent Runtime |
| `~/e2e/machine/config.json` | Machine Service config |
| `~/e2e/agents/` | Local Agent Runtime |
| `~/e2e/agents/config.json` | Agent Runtime config |
| `~/.stellabot-machine/audit.log` | Audit log (rotated) |
| `~/.stellabot-machine/browser-profiles/{orgId}/{agentId}/` | Browser profiles |
| `~/.clawdbot/clawdbot.json` | Clawdbot config (backup) |
| `~/clawd/docs/` | Documentation |
| `~/clawd/HEARTBEAT.md` | Current work status |
| `~/clawd/TOOLS.md` | Tool reference |

---

## Troubleshooting

### Machine Service not responding

```bash
curl http://100.74.241.116:18900/health
launchctl list | grep stellabot
tail -100 ~/.stellabot-machine/audit.log
```

### Browser pool issues

```bash
# Check all pools
curl http://100.74.241.116:18900/browser/profiles \
  -H "Authorization: Bearer $TOKEN" | jq '.orgPools'

# Check specific agent's tabs
curl "http://100.74.241.116:18900/tabs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Org-Id: $ORG_ID" \
  -H "X-Agent-Id: $AGENT_ID"

# Manual cleanup
curl -X POST http://100.74.241.116:18900/browser/cleanup \
  -H "Authorization: Bearer $TOKEN"
```

### File tool issues

```bash
# Test read
curl -X POST http://100.74.241.116:18900/files/read \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path": "~/clawd/HEARTBEAT.md", "limit": 5}'
```

### Process management issues

```bash
# List active sessions
curl http://100.74.241.116:18900/process/list \
  -H "Authorization: Bearer $TOKEN"

# Check specific session
curl http://100.74.241.116:18900/process/{sessionId} \
  -H "Authorization: Bearer $TOKEN"
```

### Schedule issues

```bash
# Check scheduler logs (in Fly.io)
fly logs --app stellabot-app | grep Scheduler

# Manual trigger via API
curl -X POST "https://stellabot.app/api/agent-schedules/{id}/run" \
  -H "Cookie: ..." 
```

### Stellabot can't reach Machine Service

```bash
fly ssh console --app stellabot-app
curl http://100.74.241.116:18900/health
tailscale status
```
