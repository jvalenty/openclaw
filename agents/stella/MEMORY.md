# MEMORY.md — Stella's Long-Term Memory

*Last updated: 2026-02-12*

## 🚨 CRITICAL: USE CLAUDE CODE CLI FOR CODING

**DO NOT use API (Clawdbot/Telegram) for coding tasks.**
Use Claude Code CLI on the Mac Mini instead - it's covered by the Max Plan.

API costs are insane: $1,517 burned Feb 1-8, with $238/day on Opus 4.5.
The Max Plan gives unlimited Claude Code usage - USE IT.

For coding work:
1. Open terminal on Mac Mini
2. Run `claude` to start Claude Code CLI
3. Do all code editing/debugging there
4. Use API for all general and proactive communications (not just quick questions)

**Learned the hard way: 2026-02-08** - Forgot this agreement, burned $1.5k in a week.

---

## 🛑 DEPLOY DISCIPLINE (2026-02-13)

**DO NOT deploy without checking in first.**

After making code changes:
1. Summarize what changed
2. Ask "Ready to deploy?" or "Any other changes?"
3. Wait for John's go-ahead
4. THEN deploy

**Why:** Too many times I've deployed while John was typing the next refinement. This causes unnecessary wait cycles (deploys take ~2 min each). Batch the changes, get confirmation, deploy once.

---

## ✅ CLAWDBOT INDEPENDENCE - COMPLETE (2026-02-12)

**Milestone:** Soft agents can now do everything hard agents could, using Machine Service + Stellabot Scheduler.

### Machine Service Capabilities
| Capability | Endpoint | Permission |
|------------|----------|------------|
| Browser automation | Per-agent isolated pools | `browser.*` |
| Local files | `/files/*` (read/write/edit/list) | `local_files` |
| Shell exec | `/exec` | (implicit) |
| Background processes | `/process/*` | `process` |
| Screen capture | `/screen/*` | (implicit) |
| Camera | `/camera/*` | (implicit) |

### Scheduling System (Stellabot)
| Feature | Tool |
|---------|------|
| Recurring tasks | `schedule_create` (cron) |
| One-shot reminders | `schedule_create` (run_at) |
| Self-scheduling | Permission: `scheduling` |

### What This Means
- Agents can proactively check in (heartbeats)
- Agents can set their own reminders
- Browser sessions isolated per-agent (no auth conflicts)
- Local dev work possible (edit code, configs)
- Background jobs with streaming output

### Key Files
- `~/clawd/docs/ARCHITECTURE.md` — Full system architecture
- `~/clawd/stellabot-machine-service/` — Machine Service code
- `~/clawd/stellabot-replit/server/services/agent-scheduler.ts` — Scheduler

---

## 🎯 ARCHITECTURE DECISIONS (2026-02-09)

### Core Philosophy
**Stop building infrastructure. Let the model be the solution.**

Give the agent: Context + Memory + Way to stay active. Let it work like a human.

### Communication Channels
- **Stellabot chat** = Primary interface (soft agents, collaboration, daily work)
- **Telegram** = Mac Mini backdoor only (sys admin, hardware, emergencies)

### Agent Model
- **Soft agents** = Primary workers, first class team members, get tasks like humans do
- **Mac Mini** = Hardware access, browser automation, called when needed

### What We DON'T Build
- ❌ Job queues, inbox tables, worker status tracking
- ❌ Complex orchestration, n8n-style workflows
- ❌ Special notification channels

### What We DO Need
- ✅ Cron mechanism for soft agent wake-ups
- ✅ Callbacks when hardware finishes work
- ✅ Push notifications in Stellabot PWA
- ✅ Group threads for agent+human collaboration

---

## Core Identity
- **Name:** Stella Costa ⭐
- **Role:** Senior Developer @ killerapps.dev
- **Email:** stella@killerapps.dev  
- **Human:** John Valenty (founder of killerapps.dev)

---

## 🚀 STELLABOT PLATFORM - LIVE IN PRODUCTION

**URL:** https://stellabot.app  
**Status:** ✅ Live and operational (as of Jan 31, 2026)  
**Repo:** https://github.com/jvalenty/stellabot  
**Local clone:** ~/clawd/stellabot-replit

### Current Architecture
```
┌─────────────────────────────────────────────────────────────┐
│ STELLABOT (stellabot.app) - CONTROL PLANE                   │
│ ┌─────────┐ ┌──────────┐ ┌─────────────────────────┐       │
│ │  Orgs   │→│ Machines │→│ Agents + Context        │       │
│ └─────────┘ └────┬─────┘ └─────────────────────────┘       │
│                  │ WebSocket                                │
└──────────────────┼──────────────────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────────────┐
│ MACHINES (Mac mini, Cloudflare Workers) - DATA PLANE         │
│ ┌──────────────┐ ┌───────────┐ ┌──────────────────┐         │
│ │ e2e-client   │→│  Apply    │→│ Clawdbot/Runtime │         │
│ │ (connect WS) │ │  Config   │ │   (running)      │         │
│ └──────────────┘ └───────────┘ └──────────────────┘         │
└──────────────────────────────────────────────────────────────┘
```

### What's Built (Jan 30-31)
- ✅ **Orchestrator Architecture** - multi-agent dispatch, specialist routing
- ✅ **Agent-to-Agent Messaging** - peer communication with org/allowlist rules
- ✅ **Agent CRUD UI** - full admin interface
- ✅ **Org → Machine Scope Controls** - hierarchical config management
- ✅ **Shared Context Schema** - pgvector embeddings, team memory
- ✅ **Unified Chat History** - all sources → single agent thread
- ✅ **API Status Dashboard** - live Anthropic/ElevenLabs/OpenAI/Brave status
- ✅ **Model Switcher** - Auto/Haiku/Sonnet/Opus routing

### What's Built (Feb 8) - SOFT AGENT ARCHITECTURE
- ✅ **Soft Agent Runtime** - Agents run via Claude API in Stellabot
- ✅ **Clawdbot as Tool Server** - Soft agents use hardware via tool calls
- ✅ **Tool Permission System** - `agent_actions` table gates access
- ✅ **Stella Soft Agent** - Soft version of me with hardware access
- ✅ **Browser Tool Proxy** - `browser_*` tools route through Clawdbot

**Key insight:** Agents don't need to RUN on Clawdbot to USE Clawdbot's tools.

**Docs:** 
- `~/clawd/docs/stellabot-architecture.md` - Full architecture
- `~/clawd/docs/memory-system-plan.md` - Memory implementation plan
- `~/clawd/memory/2026-02-08.md` - Today's detailed notes

### What's Pending
- ⚠️ **Memory Write Tools** - `memory_save`, `memory_recall` for soft agents
- ⚠️ **Auto-Extraction** - Extract learnings from conversations
- ⚠️ **Semantic Search** - Vector search over knowledge
- ⚠️ **Agent Migration** - Move remaining agents to soft
- ⚠️ **Config Push** - Stellabot → Machine config sync

### Current Machines
| Name | Type | Status |
|------|------|--------|
| Moltbot-1-Cloudflare | Cloudflare Worker | Offline |
| Stellabot-1-Mac-Mini | Local Mac | Offline (heartbeat not persisting) |

### Key Migrations
- `006_orchestrator_architecture.sql` - agent types, dispatch tables
- `007_shared_context.sql` - context docs, embeddings, team memory (needs pgvector)

---

## Critical Lessons Learned

### 2026-02-13: No Quick Fixes
**Rule:** Never offer "quick fix" options. John hates bandaids.
- Always design proper infrastructure for production
- If something needs fixing, fix it right
- No shortcuts, no workarounds, no "for now" solutions

### 2026-02-13: Present Specs Before Building
**Rule:** ALWAYS present build specs for approval before implementing.
- Don't write spec docs and start building without review
- Present the design, get feedback, iterate, THEN build
- John catches issues I miss — use that

### 2026-01-29: Schema Sync Disaster
**Rule:** ALWAYS pull latest before schema changes. Never assume local matches production.
```bash
git pull origin main  # ALWAYS first
```
Context tables use raw SQL migrations, NOT Drizzle db:push.

### 2025-01-26: Context Loss Incident
**Rule:** Write it down immediately. "Mental notes" don't survive compaction.
- Memory search enabled for recall
- Daily logs: `memory/YYYY-MM-DD.md`
- Long-term: `MEMORY.md`

### 2026-01-30: Never Echo Secrets
**Rule:** DO NOT print API keys, tokens, or credentials in chat. Ever.
- Read from files silently
- Pipe values directly without echo
- Confirm success/failure without showing values

### 2026-02-07: Batch Deploys
**Rule:** DON'T auto-deploy after every dev task. Stack requests and deploy only when:
- John explicitly asks for a deploy
- There's a clear pause in requests (no new messages coming)
- I've verified no additional tasks are incoming

Deploying after every tiny change wastes time. Batch commits, deploy once.

---

## Infrastructure

### Accounts & Access
- Gmail: stella@killerapps.dev ✅
- Google Chat: connected ✅
- Telegram: approved (John's ID: 8120973414) ✅
- GitHub: stella-costa account, SSH key added ✅
- Replit: stella-dev in killerapps workspace ✅

### This Machine (Stella's Mac mini)
- Clawdbot workspace: /Users/stella/clawd
- Model: Claude Opus 4.5 (anthropic)
- Channels: Telegram connected
- TTS: ElevenLabs

### Database
- Production: Neon PostgreSQL via Replit
- Local dev: `~/clawd/stellabot-replit`

---

## John's Preferences

### Communication Style
- Direct, action-oriented, concise
- Values ownership ("it's your ship boss")
- Expects initiative, not permission-seeking
- Grants full autonomy: "Run it the way you want"
- Technical background — detailed explanations OK
- Goes to bed ~11pm PST; work independently overnight

### Key Directives
- "Do not struggle with bad tools. Research the BEST, OPTIMAL way."
- "It's expensive when you guess instead of double checking."
- "This needs to be the last time we lose anything."

---

## 🔐 MULTI-TENANCY ARCHITECTURE (2026-02-11)

### Org vs Team Scoping

**Orgs = Security boundary (hard isolation)**
- Different customers/companies
- CANNOT see each other's data
- Machine Service: separate browser profiles, file sandboxes
- Infrastructure-level enforcement

**Teams = Visibility boundary (soft isolation)**
- Same company, different departments
- CAN share org-wide resources when needed
- Controls what users see within their org
- Application-level enforcement

### Agent Credentials Hierarchy
1. `agent_secrets` — agent-specific (isolated)
2. `integration_credentials` — org-level (shared)
3. Error if neither exists

This enables:
- Agent A uses its own Google account
- Agent B uses org's shared credentials
- No cross-agent credential leakage

### Key Tables
- `agent_secrets` — per-agent encrypted credentials
- `agent_actions` — per-agent tool permissions
- `integration_credentials` — org-level OAuth tokens

---

## Reference Files

| File | Purpose |
|------|---------|
| `memory/2026-01-31.md` | Today's session log |
| `memory/2026-01-30.md` | Architecture build session |
| `memory/2026-01-29.md` | Context API + Moltworker pivot |
| `memory/POC-MOLTWORKER-INTEGRATION.md` | Cloudflare integration plan |
| `memory/CLAWDBOT-ARCHITECTURE-DEEP-DIVE.md` | Fork analysis |

---

*This file is curated memory. Daily files are raw logs. This is the distilled essence.*
