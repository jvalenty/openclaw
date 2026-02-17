# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for *your* specifics — the stuff that's unique to your setup.

---

## Agent Architecture (2026-02-15)

**Full documentation:** `~/clawd/docs/ARCHITECTURE.md`

### Local Agent Runtime (NEW 2026-02-15)

Self-contained agent runtime with web chat interface. Runs in OrbStack VM for isolation.

**Location:** `~/e2e/agents/`

**Features:**
- **Dual mode:** CLI (Claude Code, Max Plan) + API (Claude API, Sonnet)
- **CLI is default** — most work is coding tasks
- **Web chat UI** — React app on same port
- **Tool routing** — internal (files, exec) vs host (browser, screen, camera)
- **Secrets:** Stellabot → 1Password → environment

**Network Options:**
- Tailscale: `100.74.241.116:18901`
- CF Tunnel: `agent.example.com` (optional, needs setup)

**Config:** `~/e2e/agents/config.json`
```json
{
  "network": {
    "tailscale": { "enabled": true },
    "cloudflare": { "enabled": false, "publicHostname": "..." }
  },
  "stellabot": { "enabled": true, "url": "https://stellabot.app" }
}
```

**Commands:**
```bash
cd ~/e2e/agents
npm run install:all    # Install all deps
npm run build          # Build backend + web chat
npm start              # Run on :18901
npm run dev            # Dev mode with hot reload
```

---

### Hard Agents (Clawdbot)
- Run on physical machines via Clawdbot gateway
- Have hardware access: local files, browser, exec, nodes
- Registered in `~/.clawdbot/clawdbot.json` → `agents.list`
- **Current:** Hard Stella (e9133b17-d5f1-43d3-97e3-e30b82513d1b) on Mac Mini

### Soft Agents (Stellabot)
- Run in Stellabot via Claude API directly
- Context in DB: `agents.modelConfig.systemPrompt` + `knowledge` table
- Cloud tools: Sheets, Calendar, Gmail, R2 Files
- **Can use hardware tools via Machine Service** (browser, exec, screen, camera)
- **Current Soft:** Stella Soft, Dan

### Storage Architecture (2026-02-12)
- **Soft agent files** → R2 cloud storage via `/api/cloud-storage`
- **Hard agent files** → local filesystem via Clawdbot
- **Machine Service** → hardware only (no file storage)

### Soft Agent with Hardware Access (NEW 2026-02-08)
Soft agents can call Clawdbot tools without running on Clawdbot:
- `clawdbot` tool - sends task to Mac Mini
- `browser_*` tools - individual browser actions
- Gated by `agent_actions` table permissions

**Stella Soft** (66a601a5-c4f4-4fea-ae96-d3ad61b9700c):
- Type: specialist (not sys_admin)
- machineId: NULL (routes soft)
- Permissions: clawdbot, browser.navigate, browser.interact
- Tested: Successfully uses hardware via tool proxy!

### Routing (agent-chat.ts lines 377-385)
```javascript
const isSoftAgent = agent && 
  agent.agentType !== 'sys_admin' && 
  !agent.machineId &&
  !agent.endpoint;
```
- If soft → `soft-agent-chat.ts` → Claude API
- If hard → proxy to Clawdbot gateway

### Tool Permissions (agent_actions table)
| Permission | Tools Enabled |
|------------|---------------|
| `google` | sheets_*, calendar_*, gmail_* |
| `files` | files_read, files_write, files_list, files_delete (R2) |
| `local_files` | local_read, local_write, local_edit, local_list (Machine Service) |
| `process` | process_start, process_list, process_status, process_input, process_kill |
| `scheduling` | schedule_create, schedule_list, schedule_delete |
| `clawdbot` | clawdbot (proxy to Mac Mini) |
| `browser.navigate` | browser_navigate |
| `browser.interact` | browser_snapshot, _screenshot, _click, _type |
| `sandbox` | sandbox_execute |
| `database` | db_query |
| `memory.write` | memory_save |
| `memory.read` | memory_recall |

### Agent Secrets (NEW 2026-02-11)

Per-agent credential storage. Agents can have their own Google OAuth, API keys, etc.

**Table:** `agent_secrets`
- Encrypted with AES-256-GCM (same as org_secrets)
- Keyed by `(agent_id, service, secret_type)`

**Google Credential Hierarchy:**
1. Check `agent_secrets` for agent-specific OAuth
2. Fall back to `integration_credentials` (org-level)
3. Error if neither exists

**API:**
```
GET    /api/agent-secrets/:agentId          — list secrets (metadata only)
POST   /api/agent-secrets/:agentId          — store secret
GET    /api/agent-secrets/:agentId/:service — get decrypted (internal)
DELETE /api/agent-secrets/:agentId/:service — remove secret
```

**OAuth Flow:**
- `/api/auth/google/agent?agentId=xxx` — agent-specific Google OAuth
- Stores tokens in `agent_secrets` instead of org-level

**Helper Functions:**
```typescript
import { getAgentSecret, hasAgentSecret } from './routes/agent-secrets';

// In google-sheets.ts, google-calendar.ts, google-gmail.ts:
const creds = agentId 
  ? await getAgentGoogleCredentials(agentId, orgId)  // agent first
  : await getGoogleCredentials(orgId);               // org only
```

---

## Stellabot Infrastructure

### Production
- **URL**: https://stellabot.app
- **Hosting**: Fly.io (2 machines in SJC region)
- **Fly App**: `stellabot-app`
- **Repo**: https://github.com/jvalenty/stellabot
- **Local clone**: ~/e2e/stellabot

### Database
- **Location**: Neon (us-east-1) - John's org account
- **Project**: stellabot.app (snowy-glade-51902107)
- **Host**: `ep-jolly-field-ahaab3dx.c-3.us-east-1.aws.neon.tech`
- **CLI**: `neonctl` with API key in ~/.zshrc
- **Run migrations**: 
  ```bash
  NEON_API_KEY="$NEON_API_KEY" neonctl connection-string --project-id snowy-glade-51902107 | xargs -I{} psql {} -f migration.sql
  ```
- **Direct psql**: `/opt/homebrew/opt/postgresql@16/bin/psql "$NEW_DB"`
- **Note**: Can also access via `fly ssh console --app stellabot-app`

### Deployment Workflow
```bash
cd ~/e2e/stellabot
git add -A && git commit -m "message" && git push
fly deploy --app stellabot-app
```

**Important:**
- Auto-deploy is **DISABLED** (was failing trying to create PG)
- Must run `fly deploy` manually after pushing to GitHub
- CLI deploys work fine, only webhook was broken

**Why webhook failed:** Fly.io's GitHub integration auto-detects Node.js apps and tries to provision Postgres. Since we use external Neon (already set via `DATABASE_URL` secret), this step fails with "Not authorized to deploy this app" when trying to create `stellabot-app-db`.

**To re-enable auto-deploy (if needed):**
1. Would need custom GitHub Actions workflow that only runs `fly deploy`
2. Or contact Fly support to disable PG auto-provisioning in their webhook
3. Current workaround (manual deploy) works fine

### Fly.io Access
- **Logged in as**: stella@killerapps.dev
- **Organization**: killerapps-dev (where stellabot-app lives)
- **Dashboard**: https://fly.io/apps/stellabot-app

### Clawdbot Connectivity (from Fly)
Stellabot reaches Clawdbot via Tailscale mesh (not CF tunnel).

**Fly Secrets:**
```
CLAWDBOT_URL=http://100.74.241.116:18789
CLAWDBOT_TOKEN=(gateway auth token)
```

**Clawdbot Gateway Config:**
```json
{
  "gateway": {
    "bind": "tailnet",  // REQUIRED for Tailscale access
    "port": 18789
  }
}
```

**Health Check:** POST to `/v1/chat/completions` with invalid request. 400 = alive, 5xx = dead.

**Network Path:**
```
Fly.io (Stellabot) → Tailscale mesh → Mac Mini (100.74.241.116:18789) → Clawdbot
```

---

## Stellabot Machine Service (Updated 2026-02-12)

Primary hardware interface for soft agents. **Goal: Replace Clawdbot entirely.**

### Location & Access
| Property | Value |
|----------|-------|
| **Code** | `~/e2e/machine/` |
| **Config** | `~/e2e/machine/config.json` |
| **Port** | 18900 |
| **Bind** | `100.74.241.116` (Tailscale IP only) |
| **Auth** | Bearer token |
| **Service** | `~/Library/LaunchAgents/com.stellabot.machine-control.plist` |
| **Logs** | `~/.stellabot-machine/audit.log` |

### Capabilities (Complete)
| Category | Endpoints | Notes |
|----------|-----------|-------|
| **Browser** | `/navigate`, `/snapshot`, `/act`, `/tabs` | Per-agent isolated pools |
| **Local Files** | `/files/read`, `/files/write`, `/files/edit`, `/files/list` | For dev work |
| **Exec** | `/exec` | Shell commands |
| **Screen** | `/screen/capture`, `/screen/record` | Screen capture |
| **Camera** | `/camera/list`, `/camera/snap`, `/camera/clip` | Camera access |

### Per-Agent Browser Pools (NEW 2026-02-12)
Each agent gets isolated browser sessions:
```
~/.stellabot-machine/browser-profiles/{orgId}/{agentId}/
```

**Headers:**
- `X-Org-Id` — Org isolation
- `X-Agent-Id` — Agent-specific pool (10 tabs default)

**Config:**
```json
"pool": {
  "maxPagesPerOrg": 5,
  "maxPagesPerAgent": 10
}
```

### Local File Tools (NEW 2026-02-12)
For development work (editing code, configs):

| Stellabot Tool | Endpoint | Purpose |
|----------------|----------|---------|
| `local_read` | `/files/read` | Read with line offset/limit |
| `local_write` | `/files/write` | Write, creates parent dirs |
| `local_edit` | `/files/edit` | Surgical text replacement |
| `local_list` | `/files/list` | Directory listing |

**Permission:** `local_files` in agent_actions table

**Security:** basePaths whitelist in config.json

### Security Model
1. **Network binding** — Tailscale-only (not 0.0.0.0)
2. **Token auth** — Bearer token on all endpoints
3. **Path restrictions** — basePaths for file ops
4. **Command blocklist** — Dangerous commands blocked
5. **Audit logging** — All requests logged

### Service Management
```bash
# Health check
curl http://100.74.241.116:18900/health

# Restart
launchctl unload ~/Library/LaunchAgents/com.stellabot.machine-control.plist
launchctl load ~/Library/LaunchAgents/com.stellabot.machine-control.plist

# Logs
tail -f ~/.stellabot-machine/audit.log

# Pool status
curl http://100.74.241.116:18900/browser/profiles -H "Authorization: Bearer $TOKEN"
```

### Fly Secrets
```
MACHINE_SERVICE_URL=http://100.74.241.116:18900
MACHINE_SERVICE_TOKEN=<token from config.json>
```

### ✅ Clawdbot Independence Complete (2026-02-12)
All hardware and scheduling capabilities implemented:
- Process management via `/process/*` endpoints
- Scheduling via Stellabot agent-schedules system

**Full docs:** `~/clawd/docs/ARCHITECTURE.md`

---

## Stellabot Scheduling System (NEW 2026-02-12)

Proactive task scheduling for soft agents.

### Schema (`agent_schedules` table)
| Column | Description |
|--------|-------------|
| `schedule_type` | `recurring` or `one_shot` |
| `cron_expression` | For recurring (e.g., `*/30 * * * *`) |
| `run_at` | For one_shot (ISO datetime) |
| `delete_after_run` | Auto-delete one-shots after completion |
| `next_run_at` | Computed next execution time |

### API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agent-schedules?agentId=X` | List schedules |
| POST | `/api/agent-schedules` | Create schedule |
| PUT | `/api/agent-schedules/:id` | Update schedule |
| DELETE | `/api/agent-schedules/:id` | Delete schedule |
| POST | `/api/agent-schedules/:id/run` | Manual trigger |

### Agent Tools
Soft agents can self-schedule with permission `scheduling`:
- `schedule_create` - Create recurring or one-shot task
- `schedule_list` - List own schedules
- `schedule_delete` - Remove a schedule

### Cron Examples
| Pattern | Meaning |
|---------|---------|
| `*/15 * * * *` | Every 15 minutes |
| `*/30 * * * *` | Every 30 minutes |
| `0 */2 * * *` | Every 2 hours |
| `0 9 * * *` | Daily at 9 AM |
| `0 9 * * 1` | Weekly (Monday 9 AM) |

### UI
Schedules tab in Agent Edit page (`/admin/agents/:id`)

---

## NewsDelivered Deployment (Replit)

**Workflow for pushing changes to production:**

1. **Push to GitHub** (from local):
   ```bash
   cd ~/clawd/newsdelivered-main
   git add -A && git commit -m "message" && git push
   ```

2. **Sync in Replit** (via browser):
   - Go to replit.com → newsdelivered project
   - Click **Git** tab
   - Click **Sync Changes** button
   
3. **Republish** (via browser):
   - Click **Republish** button in the Publishing tab
   - Wait for all stages: Provision → Security Scan → Build → Bundle → Promote

**Important:** Replit does NOT auto-deploy from GitHub. Must manually sync + republish every time.

---

## Stellabot Task Board API

**Base URL:** `https://stellabot.app/api/tasks`

**Endpoints:**
- `GET /boards` — List all boards
- `GET /boards/:id` — Get board with lists and tasks
- `POST /` — Create task `{listId, title, description?}`
- `PUT /:id` — Update task
- `PUT /:id/move` — Move task `{listId, position}`
- `DELETE /:id` — Delete task

**List IDs (Active Tasks board):**
- To-Do: `ed5246f2-2ac4-4daa-a1ba-4cca4939ff6e`
- In Progress: `8b15fc97-5d0e-470c-9e92-f1b3851d1bcf`
- Completed: `f0705361-380f-4ff9-86f5-896efaff9ddb`

**Board Status Endpoints:**
```javascript
// Quick update of project status
await fetch('/api/tasks/boards/BOARD_ID/status', {
  method: 'PATCH',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    status: 'active', // planning, active, blocked, complete
    currentPhase: 'Phase 3 - Integration',
    appendSummary: 'Completed Slack OAuth, board enhancement tasks'
  })
});
```

**Rules:**
- Update board immediately when tasks complete
- Board is source of truth — keep it current
- Add new tasks as they come up

---

## NewsDelivered

### Production
- **URL**: https://newsdelivered.com
- **Alt URL**: https://newsdelivered.replit.app
- **Hosting**: Replit (Autoscale: 4 vCPU / 8 GiB RAM / 3 Max)
- **Repo**: https://github.com/stella-costa/newsdelivered (original)
- **Replit clone**: newsdelivered-main (John's Replit)

### Architecture
- **Frontend only** - React + Vite static site
- **Backend**: Uses Stellabot API for scraping and share functionality
- **API endpoints** (on stellabot.app):
  - `POST /api/scrape` - Analyze URL, extract brand data
  - `POST /api/newsletter-share` - Save shareable config
  - `GET /api/newsletter-share/:id` - Load shared config

### CORS
Stellabot CORS config allows:
- `https://newsdelivered.com`
- `https://www.newsdelivered.com`
- `https://newsdelivered.replit.app`

---

## Stellabot Codebase

### Stack
- **Backend**: Express + TypeScript
- **Frontend**: React + Vite + wouter (NOT react-router-dom)
- **ORM**: Drizzle
- **Database**: PostgreSQL (Neon, us-east-1)

### Table Names (check schema, don't guess!)
- `orgs` (not `organizations`)
- `orgs_members` (not `organization_members`)  
- `orgs_usage` (not `organization_usage`)
- Always grep `shared/models/*.ts` before writing migrations

### Routing
- Uses `wouter`, NOT `react-router-dom`
- Import: `useLocation`, `useRoute`, `Link` from `wouter`
- For search params: `new URLSearchParams(window.location.search)`

---

## Cloudflare

### Dashboard Access
- **Logged in as**: stella@killerapps.dev (Google OAuth)
- **Browser profile**: `clawd`
- **Stella's account ID**: `227c06d19c0bd1b6cc143da7c890d015`
- **Note**: John's account (with R2 buckets) is separate

### Zero Trust / Tunnels
- **Navigation**: one.dash.cloudflare.com → Connectors → Tunnels
- **Mac Mini tunnel**: `console.stellabot.app` → localhost:18789

### MoltWorker (Serverless Agent Runtime)
- **Local clone**: `~/clawd/moltworker`
- **Docs**: `memory/moltworker-architecture.md`
- **Not a server** - runs on Cloudflare's serverless platform
- **No tunnel needed** - already on CF network

**Two Deployments:**
| Name | URL | Status |
|------|-----|--------|
| moltbot-newbox | `https://moltbot-newbox.e2e-app.workers.dev` | ✅ Working (simple) |
| moltbot-sandbox | `https://moltbot-sandbox.e2e-app.workers.dev` | ❌ Container crashes |

**CF Access Protection (moltbot-sandbox):**
- AUD: `114eb22c166ee33495177a8c2bb70ba6ea3aa9d9a021865ada809125563a1f95`
- Team Domain: `killerapps.cloudflareaccess.com`
- Service Token (1Password "CF Stellabot API"):
  - Client-Id: `30d0ea19d9bffdc272470fe48965d916.access`
  - Client-Secret: (in 1Password)

**Stellabot Integration (2026-02-02):**
- Machine ID: `moltworker-prod`
- Machine type: `cloudflare_worker`
- Heartbeat: Activity-based (not constant polling)
- Status: `active` (<5min) / `idle` (<1hr) / `dormant` (>1hr)

**Secrets on moltbot-sandbox:**
```
CF_ACCESS_TEAM_DOMAIN=killerapps.cloudflareaccess.com
CF_ACCESS_AUD=114eb22c166ee33495177a8c2bb70ba6ea3aa9d9a021865ada809125563a1f95
STELLABOT_URL=https://stellabot.app
STELLABOT_MACHINE_TOKEN=(from 1Password)
ANTHROPIC_API_KEY=(needs to be set)
```

**Deploy MoltWorker:**
```bash
cd ~/clawd/moltworker
CLOUDFLARE_API_TOKEN="(from 1Password)" npx wrangler deploy
```

**Set Secrets:**
```bash
echo "value" | CLOUDFLARE_API_TOKEN="..." npx wrangler secret put SECRET_NAME
```

**Test with CF Access Auth:**
```bash
curl -H "CF-Access-Client-Id: 30d0ea19d9bffdc272470fe48965d916.access" \
     -H "CF-Access-Client-Secret: ..." \
     https://moltbot-sandbox.e2e-app.workers.dev/health
```

**Current Issue (2026-02-02):**
Container starts but Clawdbot gateway crashes (exit code 1). Need to debug locally first.

---

## Google Sheets API (Stellabot Integration)

### OAuth Setup
- **Authenticated as**: stella@killerapps.dev
- **Scopes**: `spreadsheets`, `drive.readonly`
- **Credentials stored**: `integration_credentials` table (per-org)
- **Settings UI**: stellabot.app → Settings → Integrations

### API Endpoints

All endpoints require auth (session cookie). Base: `https://stellabot.app/api/integrations`

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/google/status` | — | Check if connected |
| GET | `/google/auth` | — | Start OAuth flow |
| POST | `/google/disconnect` | — | Remove credentials |
| GET | `/sheets/list` | — | List accessible spreadsheets (needs Drive API enabled) |
| POST | `/sheets/metadata` | `{spreadsheetId}` | Get sheet names/sizes |
| POST | `/sheets/read` | `{spreadsheetId, range}` | Read cell data |
| POST | `/sheets/write` | `{spreadsheetId, range, values}` | Write cells |
| POST | `/sheets/append` | `{spreadsheetId, range, values}` | Append rows |
| POST | `/sheets/batch` | `{spreadsheetId, updates}` | Batch update |

### Brand Management Sheet

**Spreadsheet ID:** `1gFBG_IXRLr72CGa4mXEQXjX-CblesyalPDJ4WiQoexQ`
**Title:** Stella's Copy of Brand Management Oversight

**Key Sheets:**
| Sheet | Purpose |
|-------|---------|
| Brand Table | 60+ brands, orgs (PM/PP/R2), send schedules |
| Week of X/X/XX | Weekly task tracking per brand/send |
| All Topics | Master topic list |
| WP Logins | WordPress credentials |
| Daily Oversight | Daily tracking view |

**Weekly Sheet Columns:**
1. Site Name (Owner)
2. Client (PM/PP/R2)
3. Send (S1/S2/S3)
4. Day/Date
5. Ready or Assigned To
6. Scheduled in WordPress
7. Scheduled in Earnware
8. Checked
9. Notes

### Usage Examples

```javascript
// From browser console on stellabot.app (with auth cookie)
// Read Brand Table
fetch('/api/integrations/sheets/read', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  credentials: 'include',
  body: JSON.stringify({
    spreadsheetId: '1gFBG_IXRLr72CGa4mXEQXjX-CblesyalPDJ4WiQoexQ',
    range: 'Brand Table!A1:I80'
  })
}).then(r => r.json()).then(console.log);

// Get sheet metadata
fetch('/api/integrations/sheets/metadata', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  credentials: 'include',
  body: JSON.stringify({
    spreadsheetId: '1gFBG_IXRLr72CGa4mXEQXjX-CblesyalPDJ4WiQoexQ'
  })
}).then(r => r.json()).then(console.log);
```

### Notes
- Drive API needs enabling in Google Cloud Console for `/sheets/list`
- Project ID: 549875939408
- Tokens auto-refresh on expiry

---

## Git & GitHub

- **Stellabot repo**: https://github.com/jvalenty/stellabot
- **E2E repo**: https://github.com/jvalenty/e2e
- **Auth**: gh CLI as stella-costa
- **Branch**: main

---

## Production Rules

1. **Deploys**: I can deploy to Fly.io via CLI
2. **Database changes**: Ask John to run SQL on prod
3. **Secrets**: Never echo - pipe directly or use env vars

---

Add whatever helps you do your job. This is your cheat sheet.
