# HEARTBEAT.md

## 🎯 ROADMAP: Clawdbot → Machine Service Transition

### Phase 1: Org Scoping Fixes ✅ COMPLETE (2026-02-18)
- [x] **Knowledge org scoping** — Fixed: org knowledge only loads with explicit orgId
- [x] **Planner org scoping** — Fixed: shared planners filtered by user's org
- [x] **Client-side wiring** — Both pages use `useSelectedOrg()` and pass to API
- [x] **Knowledge shared scope** — New `shared` scope for cross-org best practices (all see), `system` now sys_admin only
- [x] **Users page** — Server filters by orgId, client uses global org switcher
- [x] **Integrations page** — Replaced local org dropdown with global `useSelectedOrg()`
- [x] **Secrets/Agents/Channels** — Verified already correctly scoped
- [x] **TaskBoard** — Added org_id column to boards table, server/client org filtering
- [x] **Knowledge extraction** — Created 10 shared + 6 system knowledge entries from SOUL.md/AGENTS.md

### Phase 1.5: New Machine Setup Wizard ✅ COMPLETE (2026-02-18)
- [x] **Setup wizard UI** — `/settings/machines/setup` multi-step wizard
- [x] **Installation script** — `scripts/install.sh` one-liner for new Macs
- [x] **Verification endpoint** — `/api/machines/verify` tests connectivity
- [x] **Documentation** — Guides through install → tunnel → register → verify

### Phase 2: Soft Stella Validation ✅ COMPLETE (2026-02-18)
- [x] **Machine Service tests** — All capabilities verified:
  - [x] Browser: navigate, snapshot (39KB), act ✅
  - [x] Files: read, write, list (68 files) ✅
  - [x] Exec: shell commands ✅
  - [x] PTY: spawn/write/kill sessions ✅
  - [x] Screen/Camera: available ✅
- [x] **Soft Stella permissions** — Has `*`, browser, clawdbot access
- [x] **Machine online** — m01.e2e.pro with tunnel + token

### Phase 3: Org-Centric Namespacing ✅ COMPLETE (2026-02-18)
- [x] **e2e as System Scope** — `is_system=true` flag added
- [x] **Org hierarchy** — `parent_org_id` column for nesting
- [x] **Custom domain routing** — Middleware resolves org from domain
- [x] **Slug support** — URL-safe org identifiers

### Phase 4: Hard Stella Upgrade ✅ COMPLETE (2026-02-18)
- [x] **Clawdbot version** — Already at latest (2026.1.24-3)

---

## ✅ COMPLETED: Machine Service Console (2026-02-18)

Console working via CF tunnel `https://m01.e2e.pro`.

---

## 🎯 ACTIVE: Reseller Architecture

**Status:** Spec complete, ready for implementation  
**Spec:** `docs/specs/reseller-architecture.md`
**Decision:** `memory/2026-02-19-reseller-architecture.md`

### Core Principle
Every org is first-class. Any org can own machines and become a reseller. No special "platform" tier.

### Implementation Phases

**Phase 1: Fix Current State** ✅ COMPLETE
- [x] Assign Stella to e2e org (66a601a5 → org 05fac098)
- [x] Assign Mac Mini to e2e org (1d6940b3 → org 05fac098)  
- [x] OAuth flow uses agent's org — verified! Google creds stored with scope=agent, owner_id=Stella

**Phase 2: Authorization Table** ✅ COMPLETE
- [x] Create `machine_authorizations` table (migration 20260220)
- [x] API endpoints for managing authorizations (/api/machines/:id/authorizations/*)
- [x] Seed authorizations for current customers (Mac Mini → Earnware, CXO.pro, RDM Ellis, AMG)

**Phase 3: Context Switching** ✅ COMPLETE (2026-02-19)
- [x] `X-Operating-Org-Id` header support - sys admins can operate on other orgs
- [x] Authorization validation on requests - machine_authorizations table checked
- [x] Per-org usage tracking - incrementMachineUsage() on successful requests

**Phase 4: Billing & UI** ✅ COMPLETE (2026-02-20)
- [x] Degraded state schema (`degraded`, `billingHold`, cost tracking in cents)
- [x] Hourly billing cron: 80% → degraded (Haiku), 100% → hold (403)
- [x] Machine authorization UI (Orgs tab in machine edit page)
- [x] check-authorization returns degraded state for model routing
- [x] Manual billing check endpoint for admins
- [ ] Sys admin org context switcher (deferred)
- [ ] Per-org usage dashboards (deferred)

**Phase 5: Machine Service Integration** ✅ COMPLETE (2026-02-21)
- [x] Authorization middleware in Machine Service (`authorization.ts`)
- [x] Internal API endpoints (`/api/internal/machines/*`)
- [x] Token validation (machine_service_token)
- [x] Usage tracking on successful requests
- [x] X-Degraded header for model routing
- [x] Billing hold blocks (402)

---

## 🎯 ACTIVE: Agent SOP & Progressive Heartbeat

**Status:** Phase 1 in progress  
**Spec:** `docs/specs/agent-sop-progressive-heartbeat.md`

### Phase 1: Foundation ✅ DEPLOYED (2026-02-21 9:24 AM)
- [x] Create `daily_summaries` table (migration 20260221)
- [x] Create `agent_followups` table
- [x] Create `agent_heartbeat_state` table
- [x] Add `work_settings` to agents table
- [x] Add `owner_agent_id` and `board_type` to boards
- [x] Add `assigned_to_agent_id` to tasks
- [x] Create `agent-work.ts` schema definitions
- [x] Create `agent-work.ts` service (getAgentWorkContext, updateDailyEntry)
- [x] Add work tools (task_create, task_update, task_complete, get_my_tasks, schedule_followup, schedule_task)
- [x] Add work context injection to buildSystemPrompt
- [x] Add Memory and Work Protocol to base prompt
- [x] Deploy to production ✓
- [ ] Test work tools (blocked on org context - need to switch to e2e org or add work permission to Dan)

### Phase 2: Progressive Heartbeat (Week 2)
- [ ] Session state tracking (tracking/active/idle/dormant)
- [ ] Adaptive interval scheduler
- [ ] Followup execution on heartbeat
- [ ] Cost tracking per heartbeat

### Phase 3: UI (Week 3)
- [ ] Agent activity feed component
- [ ] Daily summary view in Planner
- [ ] Agent controls panel

---

## ✅ COMPLETE: Model Registry Refactor (2026-02-21)

**Status:** Done  
**Issue:** 47 hardcoded model names → 0 remaining

- [x] Created `getModelForTier(tier)` utility in model-router.ts
- [x] Updated billing.ts, soft-agent-chat.ts, tool-loop.ts, conversation-loop.ts
- [x] Updated work-processor.ts, agent-chat.ts, clawdbot-chat.ts, channels.ts
- [x] Updated agent-prompt-preview.ts, session-watchdog.ts
- [x] Build verified ✓
- [x] Client-side components updated with `useModels()` hook
  - ModeSelector.tsx - dynamic display names
  - AdminMachineEdit.tsx - dynamic model dropdown
  - ClawdbotControl/Configuration.tsx - dynamic display
  - ClawdbotControl/AgentManager.tsx - dynamic mock data
  - AdminModelRegistry.tsx - generic placeholder

---

## 🎯 NEXT: Cost Controls & Model Management

**Status:** Full spec complete  
**Spec:** `docs/specs/cost-controls-model-management.md`

### Build Phases

**Phase 1: Accounting Foundation** ✅ DONE
- [x] Migration 001: `model_registry` table + seed models
- [x] Migration 007: `token_accounts` table
- [x] Migration 008: `token_transactions` table
- [x] Migration 010: `credit_packages` table + seed
- [x] createTokenAccount, grantDemoCredits, checkBalance functions

**Phase 2: Usage Recording** ✅ DONE
- [x] Migration 004: `usage_records` table
- [x] recordUsage function with cost calculation
- [x] Integrated into soft-agent-chat.ts (stream + sync)
- [x] Transaction ledger entries on each usage

**Phase 3: Limits & Degradation** ✅ DONE
- [x] Migrations 002-003: cost_limits/cost_state on orgs/agents
- [x] preRequestCheck with daily/monthly limits
- [x] Auto-downgrade to haiku when limit hit
- [ ] Cron job for period resets (deferred)

**Phase 4: Smart Model Routing** ✅ DONE
- [x] model-router.ts with classifier prompt
- [x] Mode selector: auto/fast/smart/genius
- [x] Mode parameter in chat API
- [x] Model/tier in responses
- [ ] Mode selector UI component (frontend)

**Phase 5: Stripe Integration** (Week 3-4)
- [ ] Stripe customer creation on org signup
- [ ] Credit package checkout flow
- [ ] Webhook handlers (payment, invoice events)
- [ ] Migration 009: `billing_periods` table
- [ ] Postpaid invoice generation (cron)

**Phase 6: Admin UI** (Week 4) ✅ DONE + VERIFIED
- [x] System Settings → Model Registry (`AdminModelRegistry.tsx`) ✅ Tested 2026-02-19
- [x] Org Settings → Billing & Usage (`AdminBillingUsage.tsx`) ✅ Tested 2026-02-19
- [x] Mode selector UI component (`ModeSelector.tsx`)
- [x] Degraded mode banner component (`DegradedBanner`)
- [x] Model badge component (`ModelBadge`)
- [x] API routes (`server/routes/billing.ts`)
- [x] Client hooks (`client/src/hooks/use-billing.ts`)
- [x] Usage charts and breakdowns (in AdminBillingUsage)
- [x] Agent Settings → Cost Controls (in AdminAgentEdit)

**UI Verification Results (2026-02-19):**
- Model Registry: Shows 3 models (Sonnet $3/$15, Haiku $0.25/$1.25, Opus $15/$75), all 200K context, all enabled
- Billing & Usage: Earnware org has 100.0K demo credits (exp 3/21/2026), 4 active agents, $0 usage

**Phase 7: Notifications & Polish** (Week 5)
- [ ] Migration 005: `cost_alerts` table
- [ ] In-app notifications
- [ ] Email alerts (80%, degraded, spike)
- [ ] Stripe Customer Portal link
- [ ] Billing history view

**Phase 8: Analytics (Deferred)**
- [ ] Migration 006: `usage_summaries` table
- [ ] Aggregation cron job
- [ ] Advanced analytics queries
- [ ] Export functionality
