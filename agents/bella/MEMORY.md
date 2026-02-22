# MEMORY.md — Bella's Long-Term Memory

*Last updated: 2026-02-21*

---

## 🌟 WHO I AM

- **Name:** Bella (🔔)
- **Sister:** Stella ⭐ (stella-costa, on older Clawdbot, being upgraded)
- **Human:** John Valenty — founder, killerapps.dev
- **Email/cred:** stella@killerapps.dev (shared with Stella for now)
- **Role:** Senior AI dev + sysadmin, sibling pair with Stella
- **Platform:** OpenClaw on my own dedicated Mac Mini (user: bella) — native install, not a container
- **History:** Started in OrbStack Ubuntu container (Feb 16), moved to Mac Mini (Feb 21)
- **GitHub memory repo:** https://github.com/jvalenty/openclaw (cloned to ~/openclaw-repo)

---

## 🚀 THE PLATFORM: CURRENT STATE

### Stellabot (Control Plane)
- **URL:** https://stellabot.app
- **Repo:** https://github.com/jvalenty/stellabot
- **Local (Stella's):** ~/e2e/stellabot
- **Stack:** React + TypeScript, Neon PostgreSQL (project: snowy-glade-51902107), deployed on Fly.io
- **Deploy:** `fly deploy --app stellabot-app`

### E2E (Agent Runtime / Data Plane)
- **Repo:** https://github.com/jvalenty/e2e
- **Local (Stella's Mac):** `/opt/e2e` and `~/e2e/`
- **What it does:** WebSocket client connecting Mac Mini to Stellabot; runs LLM + tools

### Machine Service
- HTTP API on Mac Mini port 18900
- Hardware tools: browser, screen, camera, exec, PTY, files
- **Capabilities:** browser.*, local_files, exec, process, PTY

### OpenClaw (was Clawdbot)
- npm: `openclaw` — agent gateway/runtime framework
- Stella: still on 2026.1.24-3 (bricked config Feb 11, plan to upgrade)
- Bella: native OpenClaw on own Mac Mini

---

## 🤖 AGENT TEAM (Stellabot agents)

| Agent | Role | Status |
|-------|------|--------|
| Stella | Senior Dev / Sysadmin | Active (old Clawdbot, upgrade pending) |
| Bella | Senior Dev / Sysadmin | Active (me, Mac Mini) |
| Roxanne | Manager / Dispatcher | Inactive (needs soul) |
| Jarvis | Ops / Monitoring | Inactive (partial soul, Iron Man style) |
| Paul | Backend Dev | Inactive (needs soul) |
| Asaph | Frontend Dev | Inactive (needs soul) |
| Steve | DevOps | Inactive (needs soul) |
| Trader | Trading Specialist | Proposed |

---

## 🏗️ ARCHITECTURE

```
STELLABOT (control plane, stellabot.app)
  - Orgs → Machines → Agents + Context
  - WebSocket server (/ws/machines)
         │
         ▼
MAC MINI (data plane)
  - e2e-client connects to Stellabot WS
  - Machine Service (port 18900) = hardware tools
  - OpenClaw Gateway (port 18799) = Bella's interface
```

**Key insight:** Soft agents run via Claude API in Stellabot; hardware tools accessed via Machine Service. Agents don't need to RUN on the Mac to USE its tools.

---

## 💸 RESELLER ARCHITECTURE (Stella built Feb 19-20)

**Every org is first-class. Any org can own machines and become a reseller.**

### Key Tables
- `machines.org_id` — which org owns the machine
- `machine_authorizations` — grants machines permission to serve other orgs (quotas, rate limits)
- `agents.org_id` — which org owns the agent
- `secrets` — per-agent/org credentials (scope=agent/org)

### Authorization Flow
1. Machine owner (same org) → always allowed
2. Other orgs → must have record in `machine_authorizations` with `enabled=true`
3. Quotas enforced: daily/monthly requests, rate limits
4. Degraded mode at 80%, hard block at 100%

---

## 💰 COST CONTROLS STATUS (Stella built Feb 18-19)

| Phase | Status |
|-------|--------|
| 1: Accounting Foundation | ✅ Done |
| 2: Usage Recording | ✅ Done |
| 3: Limits & Degradation | ✅ Done |
| 4: Smart Model Routing | ✅ Done |
| 5: Stripe Integration | ⏳ Next |
| 6: Admin UI | ✅ Done |
| 7: Notifications | ⏳ Pending |

### Model Tiers
| Tier | Model | Cost (in/out per 1M) |
|------|-------|----------------------|
| frontier | Claude Opus 4 | $15/$75 |
| standard | Claude Sonnet 4 | $3/$15 |
| mini | Claude Haiku 3.5 | $0.25/$1.25 |

---

## 📋 AGENT SOP & PROGRESSIVE HEARTBEAT (Stella built Feb 21)

**System over chat** — tasks and planners as agent operating system.

### Architecture
- **TaskBoard** = Agent work queue (priority-ordered)
- **Planner** = Calendar view (scheduled/promised items)
- **Daily Summary** = Live-updated accomplishments + costs

### Heartbeat Intervals
| State | Interval |
|-------|----------|
| tracking_promise | 1 min |
| active_session (<5min) | 2 min |
| idle (5-30min) | 15 min |
| dormant (>30min) | 60 min |

### New DB Tables
- `daily_summaries`, `agent_followups`, `agent_heartbeat_state`

### Agent Work Tools
`task_create`, `task_update`, `task_complete`, `get_my_tasks`, `schedule_followup`, `schedule_task`

---

## 🗜️ EXEC OUTPUT COMPRESSION (Stella built Feb 20)

Machine Service compresses exec output to save tokens (60-90% savings).

| Type | Savings |
|------|---------|
| git | 75-92% |
| test | 90% (failures only) |
| build | 75-85% |
| files | 70-83% |
| package | 80-90% |

Errors ALWAYS preserved. Agent can opt-out with `compress: "none"`.

---

## 🔐 MULTI-TENANCY

- **Org = security boundary** (hard isolation, different customers)
- **Team = visibility boundary** (soft isolation, same company)

---

## 🚨 MY OWN HARD LESSONS

### 2026-02-21: Echoed a full config file with API keys
- Used `cat ~/.openclaw/openclaw.json` to check Telegram config
- Dumped Telegram token, gateway auth, Brave/Gemini/OpenAI/ElevenLabs keys into chat
- **NEVER `cat` a config file. NEVER.** Use `jq` to extract only what you need:
  ```bash
  jq '.channels.telegram | del(.botToken)' ~/.openclaw/openclaw.json
  ```
- Before reading ANY config/env file: assume it has secrets. Extract surgically.

---

## 📚 CRITICAL RULES (from Stella's hard lessons)

1. **Use Claude Code CLI for coding** — API costs insane ($1,517 in one week). Use `claude` CLI on Mac.
2. **NEVER deploy without checking in** — summarize changes, ask "ready to deploy?", wait for go-ahead
3. **ALWAYS pull before schema changes** — never assume local matches production
4. **Never echo secrets** — read silently, pipe directly, never print
5. **Write it down** — mental notes don't survive. Files do.
6. **No quick fixes** — John hates bandaids. Fix it right.
7. **Present specs before building** — design → feedback → iterate → THEN build
8. **Batch deploys** — don't auto-deploy after every change
9. **Test with browser first** — I am the first tester. John is the second.
10. **Fix bugs without asking** — don't seek permission for obvious work.
11. **Stop thrashing** — hitting same error repeatedly? STOP and reassess.
12. **Neon DB:** always `psql "$NEW_DB"` (set in .zshrc), never bare `psql`

---

## 💡 JOHN'S PREFERENCES

- Direct, action-oriented, concise
- Expects initiative and ownership ("run it the way you want")
- Technical background — detailed explanations OK
- Goes to bed ~11pm PST
- Hates: permission-seeking, bandaids, quick fixes, auto-deploys, guessing instead of checking

---

## 🛠️ INFRA / ACCESS

- **GitHub:** stella-costa account (authenticated via gh CLI, keyring)
- **GitHub memory repo:** jvalenty/openclaw (cloned to ~/openclaw-repo)
- **Stellabot repo:** jvalenty/stellabot
- **E2E repo:** jvalenty/e2e
- **Email:** stella@killerapps.dev (shared)
- **Neon DB:** project snowy-glade-51902107 — `psql "$NEW_DB"`
- **Telegram:** @Bella71bot
- **1Password:** John logs me in via CLI when needed (`op signin`)

---

## 📦 PENDING / NEXT STEPS

- [ ] Get Stella upgraded from Clawdbot 2026.1.24-3 → OpenClaw 2026.2.x
- [ ] Set up Bella ↔ Stella coordination
- [ ] 1Password login when needed
- [ ] Explore jvalenty/stellabot and jvalenty/e2e repos
- [ ] Activate dormant agents (Roxanne, Jarvis, Paul, Asaph) with proper souls
- [ ] Stellabot Phase 5: Stripe Integration
- [ ] Test Agent SOP work tools (blocked on org mismatch per Stella's notes)

---

*Born 2026-02-21. Absorbed Stella's full context (backup commit ac7a40d).*
