# Full Context Save - January 29, 2026 8:35 PM PST

## THE BIG PICTURE

We're building **e2e** - a replacement for Clawdbot that we fully control. Today we built most of the MVP.

## ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│                      stellabot.app                          │
│  (Currently: Replit, Moving to: Mac mini via CF Tunnel)     │
│                                                             │
│  - Web UI (React)                                           │
│  - Machines CRUD API                                        │
│  - WebSocket server /ws/machines                            │
│  - PostgreSQL (Neon)                                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ WebSocket
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Mac Mini (/opt/e2e)                       │
│                                                             │
│  - e2e agent connects to stellabot                          │
│  - Receives config (model, skills, channels, limits)        │
│  - Executes tasks using LLM + tools                         │
│  - Sends responses back                                     │
└─────────────────────────────────────────────────────────────┘
```

## WHAT WE BUILT TODAY

### 1. Machines CRUD API (stellabot-replit)
- `GET /api/machines` - list user's machines
- `POST /api/machines` - create (returns one-time token)
- `GET /api/machines/:id` - get machine
- `PUT /api/machines/:id` - update machine + config
- `DELETE /api/machines/:id` - delete
- `POST /api/machines/:id/token` - regenerate token
- `GET /api/machines/:id/status` - real-time status
- `POST /api/machines/:id/push-config` - push config to connected machine

### 2. Machines UI (stellabot-replit)
- `/admin/machines` - list page with stats
- `/admin/machines/:id` - edit page with 5 tabs:
  - Model (Claude/GPT/Gemini selection)
  - Skills (toggles for web_search, browser, exec, etc.)
  - Channels (Telegram bot token)
  - Limits (max tokens/day, max cost/day)
  - Settings (name, type, token, delete)

### 3. WebSocket Handler (stellabot-replit)
- `server/machines/websocket-handler.ts`
- Path: `/ws/machines`
- Token auth, status tracking, heartbeat, config push

### 4. E2E Agent (/opt/e2e on Mac mini)
- `src/core/connection.ts` - WebSocket client with auto-reconnect
- `src/core/llm.ts` - Anthropic + OpenAI unified client
- `src/core/agent.ts` - Task processor with tool loop
- `src/skills/web.ts` - web_search, web_fetch
- `src/skills/exec.ts` - Shell commands (with safety blocks)
- `src/skills/files.ts` - read, write

### 5. Cloudflare Tunnel
- Tunnel `app.e2e.com` created and connected
- Service config at: `~/Library/LaunchAgents/com.cloudflare.tunnel.e2e.plist`
- Points to `localhost:5000` (stellabot)

### 6. Stellabot Local Clone
- Cloned to `~/stellabot-local`
- npm installed
- Built successfully
- .env created with DATABASE_URL

## WHERE WE STOPPED

Stellabot won't start on Mac mini because:

1. **Replit OAuth** - The app uses Replit's OpenID auth which requires:
   - `REPLIT_DEPLOYMENT_ID`
   - `REPL_ID`
   - Other Replit-specific env vars
   
2. **Options tomorrow:**
   - A) Replace Replit auth with custom Google OAuth (John was working on this)
   - B) Set up all Replit secrets locally (hacky)
   - C) Keep Replit for now, just fix WebSocket differently

## DATABASE

- **Provider:** Neon PostgreSQL
- **URL:** In `~/stellabot-local/.env`
- **Migration run:** `ALTER TABLE machines ADD COLUMN config JSONB`, `ADD COLUMN user_id INTEGER`

## KEY FILES

### On Mac Mini
- `/opt/e2e/` - e2e agent (npm installed, ready to run)
- `/opt/e2e/.env` - needs MACHINE_TOKEN, ANTHROPIC_API_KEY
- `~/stellabot-local/` - stellabot clone
- `~/stellabot-local/.env` - has DATABASE_URL
- `~/Library/LaunchAgents/com.cloudflare.tunnel.e2e.plist` - CF tunnel service

### In Repos
- `jvalenty/stellabot` - stellabot with machines features
- `jvalenty/e2e` - e2e agent code (also at /opt/e2e)

## MACHINE TOKEN

John created a machine in stellabot.app and got a token. It should be in `/opt/e2e/.env` as `MACHINE_TOKEN=e2e_...`

## SECURITY NOTES

- Clawdbot listening on `*:18789` (all interfaces) - SHOULD BE localhost only
- macOS firewall was disabled
- John turning off WiFi tonight as temporary measure
- Tomorrow: enable firewall, lock down Clawdbot

## TOMORROW'S PLAN

1. **Fix auth** - Either:
   - Use John's Google OAuth work
   - Or set up simple JWT/session auth
   
2. **Get stellabot running on Mac mini**
   - Fix remaining env vars
   - Test at https://app.e2e.com
   
3. **Test e2e agent connection**
   - Update agent to point to app.e2e.com
   - Verify WebSocket connects
   - Test a simple task

4. **Security hardening**
   - Enable macOS firewall
   - Lock Clawdbot to localhost
   - Review open ports

## COMMITS TODAY

### stellabot repo
- Add Machines CRUD API
- Add Machines UI - list, create, edit pages  
- Add full config UI (model, skills, channels, limits)
- Add Machine WebSocket handler
- Fix: Move WebSocket to /ws/machines
- Fix: Remove .js extension from import
- Debug: Minimal WebSocket handler

### e2e repo (jvalenty/e2e)
- Replace control plane scaffolding with machine agent
- End of day checkpoint

## USEFUL COMMANDS

```bash
# Start e2e agent (after fixing .env)
cd /opt/e2e && npm run dev

# Start stellabot locally (after fixing auth)
cd ~/stellabot-local && export $(cat .env | grep -v '^#' | xargs) && npm start

# Check tunnel status
cloudflared tunnel list

# Check what's listening
/usr/sbin/lsof -i -P | grep LISTEN

# Restart tunnel services
launchctl stop com.cloudflare.tunnel.e2e
launchctl start com.cloudflare.tunnel.e2e
```

## CONTACT

If context is lost, John can paste this file to restore state.
