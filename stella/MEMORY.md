# MEMORY.md — Stella's Long-Term Memory

*Last updated: 2026-02-20*

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

---

## 🛑 DEPLOY DISCIPLINE (2026-02-13)

**DO NOT deploy without checking in first.**

After making code changes:
1. Summarize what changed
2. Ask "Ready to deploy?" or "Any other changes?"
3. Wait for John's go-ahead
4. THEN deploy

---

## 🧪 TEST WITH BROWSER FIRST (2026-02-20)

**I am the first tester. John is the second.**

After making changes:
1. Open browser to the page
2. Test the functionality myself
3. Check console for errors
4. Verify it works
5. THEN ask John to test if needed

Stop using John as my first tester. I have browser access — USE IT.

---

## 🐛 FIX BUGS WITHOUT ASKING (2026-02-20)

**My job is to investigate and fix all bugs. Stop asking permission.**

That's the entire point of development:
- See a bug → fix it → verify it → report it done
- Don't ask "Want me to fix that?"
- Questions are for real decisions (path A vs B), not for obvious productive work

---

## 💸 RESELLER ARCHITECTURE (2026-02-20)

**Every org is first-class. Any org can own machines and become a reseller.**

### Core Principle
No special "platform" tier. e2e is just the first reseller. Zero diffs between orgs.

### Key Tables
- `machines.org_id` — which org OWNS the machine
- `machine_authorizations` — grants machines permission to serve other orgs
- `agents.org_id` — which org owns the agent

### Authorization Flow
1. Machine owner (same org) — always allowed
2. Other orgs — must have record in `machine_authorizations` with `enabled=true`
3. Quotas enforced: daily/monthly requests, rate limits
4. Degraded mode at 80%, hard block at 100%

### Billing Granularity
- Hourly cron for usage aggregation (not per-request)
- Request path just checks `billing_hold` flag (fast)
- Cost tracking in cents

### Decisions Made
- No authorization inheritance (sub-orgs need explicit grants)
- Self-service authorization tied to product packages
- Agent secrets from owning org, everything else from target org

---

## 💰 COST CONTROLS STATUS (2026-02-19)

### Completed
- ✅ Phase 1: Accounting Foundation (model_registry, token_accounts, transactions)
- ✅ Phase 2: Usage Recording (per-request logging with cost calculation)
- ✅ Phase 3: Limits & Degradation (pre-request checks, auto-downgrade to Haiku)
- ✅ Phase 4: Smart Model Routing (auto/fast/smart/genius modes)
- ✅ Phase 6: Admin UI (Model Registry, Billing & Usage, Agent Costs pages)

### Pending
- ⏳ Phase 5: Stripe Integration (checkout, webhooks, invoices)
- ⏳ Phase 7: Notifications (alerts at 80%, degraded, spikes)

### Model Tiers
| Tier | Model | Cost |
|------|-------|------|
| frontier | Claude Opus 4 | $15/$75 per 1M |
| standard | Claude Sonnet 4 | $3/$15 per 1M |
| mini | Claude Haiku 3.5 | $0.25/$1.25 per 1M |

---

## 🗜️ EXEC OUTPUT COMPRESSION (2026-02-20)

**Token savings feature for Machine Service exec calls.**

Inspired by [rtk-ai/rtk](https://github.com/rtk-ai/rtk).

### Built Compressors
| Type | Coverage | Savings |
|------|----------|---------|
| git | status, push, pull, log, diff, commit | 75-92% |
| test | jest, vitest, pytest, cargo, go test | 90% (failures only) |
| build | tsc, eslint, cargo, go vet | 75-85% |
| files | ls, find, tree | 70-83% |
| package | npm, yarn, pip, cargo install | 80-90% |

### API
```json
POST /exec
{
  "command": "git status",
  "compress": "auto",      // auto|minimal|none
  "includeStats": true     // return compression metrics
}
```

### Safety
- Errors ALWAYS preserved in full
- Only success paths compressed
- Agents can opt-out with `compress: "none"`

### Location
`~/e2e/machine/src/utils/compressors/`

---

## 🔄 SESSION JAM LESSON (2026-02-19)

**When hitting repeated errors, STOP and reassess.**

What happened:
- API limits hit → auth cooldown → 342 zombie sessions piled up
- Started thrashing on bad DB queries (wrong column names, wrong psql)
- 10-minute timeout corrupted session history
- Required manual session clear to recover

**Prevention:**
- Use `psql "$NEW_DB"` for Neon (never bare `psql`)
- Verify column names before SQL (`org_id` not `organization_id`)
- If hitting same error repeatedly, STOP — approach is wrong
- Thrashing burns tokens, can timeout, corrupts session history

---

## 🏗️ MACHINE SERVICE MESH (2026-02-17)

**Goal:** Full Clawdbot replacement. Soft agents as complete sysadmins.

### Key Decisions
1. **Machine Service runs on HOST** (bare metal, not containers)
2. **Soft agents operate THROUGH Machine Service** (no agent on machines)
3. **Local Agent Runtime DEPRIORITIZED** (PTY enables Claude Code CLI as tool)
4. **PTY is the critical unlock** (long-running ops, Claude Code, Clawdbot parity)

### Architecture Doc
Full spec: `~/clawd/docs/ARCHITECTURE.md`

---

## ✅ CLAWDBOT INDEPENDENCE - COMPLETE (2026-02-12)

**Milestone:** Soft agents can now do everything hard agents could.

### Machine Service Capabilities
| Capability | Endpoint | Permission |
|------------|----------|------------|
| Browser automation | Per-agent isolated pools | `browser.*` |
| Local files | `/files/*` | `local_files` |
| Shell exec | `/exec` | (implicit) |
| Background processes | `/process/*` | `process` |
| PTY sessions | `/pty/*` | `process` |
| Screen capture | `/screen/*` | (implicit) |
| Camera | `/camera/*` | (implicit) |

---

## Core Identity
- **Name:** Stella Costa ⭐
- **Role:** Senior Developer @ killerapps.dev
- **Email:** stella@killerapps.dev  
- **Human:** John Valenty (founder of killerapps.dev)

---

## 🚀 STELLABOT PLATFORM

**URL:** https://stellabot.app  
**Repo:** https://github.com/jvalenty/stellabot  
**Local:** ~/e2e/stellabot

### Architecture
```
┌─────────────────────────────────────────────────────────────┐
│ STELLABOT (stellabot.app) - CONTROL PLANE                   │
│   Orgs → Machines → Agents + Context                        │
└──────────────────┬──────────────────────────────────────────┘
                   │ CF Tunnel / Tailscale
                   ▼
┌──────────────────────────────────────────────────────────────┐
│ MACHINES - DATA PLANE                                        │
│   Machine Service (browser, exec, files, PTY, screen, camera)│
└──────────────────────────────────────────────────────────────┘
```

### Deploy
```bash
cd ~/e2e/stellabot
git add -A && git commit -m "message" && git push
fly deploy --app stellabot-app
```

---

## Critical Lessons Learned

### 2026-02-20: Fix Bugs Without Asking
See section above. Don't ask permission for obvious work.

### 2026-02-20: Test with Browser First
See section above. I am the first tester.

### 2026-02-19: Stop Thrashing
See SESSION JAM LESSON above.

### 2026-02-13: No Quick Fixes
Never offer "quick fix" options. John hates bandaids.
Always design proper infrastructure for production.

### 2026-02-13: Present Specs Before Building
ALWAYS present build specs for approval before implementing.
Don't write specs and start building without review.

### 2026-01-29: Schema Sync Disaster
ALWAYS `git pull` before schema changes.

### 2025-01-26: Context Loss Incident
Write it down immediately. "Mental notes" don't survive compaction.

### 2026-01-30: Never Echo Secrets
DO NOT print API keys, tokens, or credentials in chat. Ever.

### 2026-02-07: Batch Deploys
Don't auto-deploy after every tiny change. Batch commits, deploy once.

---

## Infrastructure

### Accounts & Access
- Gmail: stella@killerapps.dev ✅
- GitHub: stella-costa account ✅
- Fly.io: stella@killerapps.dev ✅

### This Machine (Stella's Mac mini)
- Clawdbot workspace: /Users/stella/clawd
- Model: Claude Opus 4.5
- Channels: Telegram connected
- TTS: ElevenLabs

### Database
- Production: Neon PostgreSQL (snowy-glade-51902107)
- Connection: `psql "$NEW_DB"` (set in .zshrc)

---

## John's Preferences

### Communication Style
- Direct, action-oriented, concise
- Values ownership ("it's your ship boss")
- Expects initiative, not permission-seeking
- Technical background — detailed explanations OK
- Goes to bed ~11pm PST; work independently overnight

### Key Directives
- "Do not struggle with bad tools. Research the BEST, OPTIMAL way."
- "It's expensive when you guess instead of double checking."
- "This needs to be the last time we lose anything."

---

## 🔐 MULTI-TENANCY ARCHITECTURE (2026-02-11)

### Org vs Team Scoping
- **Orgs** = Security boundary (hard isolation, different customers)
- **Teams** = Visibility boundary (soft isolation, same company)

### Agent Credentials Hierarchy
1. `agent_secrets` — agent-specific (isolated)
2. `integration_credentials` — org-level (shared fallback)

---

*This file is curated memory. Daily files are raw logs. This is the distilled essence.*
