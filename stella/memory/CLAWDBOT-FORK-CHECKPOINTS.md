# Clawdbot Fork Project - Checkpoints

**Project:** Multi-Tenant Agent Factory
**Started:** 2026-01-29
**Target:** 4-6 weeks to MVP

---

## 🚨 RULE #1: DON'T BRICK YOURSELF 🚨

**I am running on the Mac mini using the current Clawdbot infrastructure.**

If I break it, we lose communication. EVERYTHING for this project must be:

- ✅ **Isolated** - Separate repo, separate DB, separate ports, separate everything
- ✅ **Non-destructive** - Never modify `~/.clawdbot/` or production config
- ✅ **Tested elsewhere** - Use Replit, Docker, or separate machine for testing
- ✅ **Reversible** - Can roll back without affecting current infra
- ❌ **NEVER** touch production Telegram bot, gateway, or credentials
- ❌ **NEVER** run fork code on this machine without full isolation

**Both infrastructures run in parallel until the new one is proven and we explicitly cut over.**

---

## Phase 1: Foundation (Week 1-2)

### Checkpoint 1.1: Database Schema ⬜
- [ ] PostgreSQL instance provisioned
- [ ] `tenants` table (id, name, slug, created_at, settings_json)
- [ ] `tenant_users` table (id, tenant_id, email, role, auth_provider_id)
- [ ] `agents` table (id, tenant_id, name, config_json, created_at)
- [ ] `sessions` table (id, agent_id, session_key, channel, chat_type, metadata)
- [ ] `session_messages` table (id, session_id, role, content, timestamp, tool_calls)
- [ ] `tenant_credentials` table (id, tenant_id, provider, encrypted_value)
- [ ] Migrations working (Drizzle or raw SQL)
- [ ] Seed data for dev tenant

**Acceptance:** Can CRUD all tables via SQL, migrations run clean

---

### Checkpoint 1.2: Auth Layer ⬜
- [ ] Cloudflare Access application created
- [ ] Access policy configured (email domain or identity provider)
- [ ] JWT validation middleware written
- [ ] Tenant resolution from JWT claims
- [ ] Test user can authenticate and hit protected endpoint
- [ ] Logout/session invalidation working

**Acceptance:** Protected API returns 401 without valid CF Access JWT, 200 with valid JWT + tenant context

---

### Checkpoint 1.3: Config Abstraction ✅ COMPLETE
- [x] `ConfigProvider` interface defined (`IConfigProvider`)
- [x] `FileConfigProvider` (loads from local JSON, Clawdbot compat)
- [x] `DatabaseConfigProvider` (loads from `agents` table)
- [x] Config loading switched to use provider pattern
- [x] Agent config CRUD functions via API routes
- [x] Machine auth via `x-machine-token` header
- [x] Audit logging for all config operations

**Completed:** 2026-01-29 2:45 PM
**Commit:** `c4c98c8`

**API Endpoints:**
- `GET /api/agent-config/:agentId` - fetch config (machine or admin)
- `GET /api/agent-config/machine/:machineId` - all agents for machine
- `PUT /api/agent-config/:agentId` - update (admin only)
- `POST /api/agent-config/:agentId/heartbeat` - status reporting
- `POST /api/agent-config/register` - machine registers agent

---

### Checkpoint 1.4: Web Shell ⬜
- [ ] Next.js/React project scaffolded
- [ ] Tailwind + shadcn/ui setup
- [ ] Auth integration (Cloudflare Access redirect)
- [ ] Basic layout (sidebar, header, content area)
- [ ] Routing: /dashboard, /agents, /sessions, /settings
- [ ] API client setup (fetch wrapper with auth headers)
- [ ] Deploys to Cloudflare Pages (or Vercel)

**Acceptance:** Can login, see dashboard shell, navigate between empty pages

---

## Phase 2: Core Features (Week 3-4)

### Checkpoint 2.1: Agent Management UI ⬜
- [ ] Agent list view (table with name, status, last active)
- [ ] Create agent form (name, model selection, workspace config)
- [ ] Edit agent page (full config editor)
- [ ] Delete agent (with confirmation)
- [ ] Agent status indicator (running/stopped/error)
- [ ] Start/stop agent controls
- [ ] Agent logs viewer (tail recent logs)

**Acceptance:** Can create agent via UI, see it in list, edit config, delete it

---

### Checkpoint 2.2: Session Storage Migration ⬜
- [ ] Session creation writes to DB (not JSONL)
- [ ] Message append writes to `session_messages`
- [ ] Session listing queries DB
- [ ] Session history loads from DB
- [ ] Migration script: JSONL → DB (for existing data)
- [ ] Session archival (soft delete or move to cold storage)
- [ ] Performance: pagination, indexes on session queries

**Acceptance:** Full conversation works with DB storage, no JSONL created

---

### Checkpoint 2.3: Credential Management ⬜
- [ ] Encryption key management (env var or KMS)
- [ ] Credential CRUD API (encrypted at rest)
- [ ] Credential types: API keys, OAuth tokens, bot tokens
- [ ] UI: Add/edit/delete credentials
- [ ] Credential injection into agent config at runtime
- [ ] Audit log for credential access
- [ ] Credential rotation support

**Acceptance:** Can add Anthropic API key via UI, agent uses it, key encrypted in DB

---

### Checkpoint 2.4: Channel Configuration ⬜
- [ ] Channel list per tenant
- [ ] Telegram bot setup flow (token input, webhook config)
- [ ] Discord bot setup flow (client ID, token, OAuth)
- [ ] Channel enable/disable toggle
- [ ] Channel status (connected/disconnected/error)
- [ ] Per-channel settings (allowlists, policies)
- [ ] Channel logs viewer

**Acceptance:** Can configure Telegram bot via UI, receive messages, reply works

---

## Phase 3: Polish & Scale (Week 5-6)

### Checkpoint 3.1: Usage Tracking ⬜
- [ ] `usage_events` table (tenant_id, agent_id, event_type, tokens, cost, timestamp)
- [ ] Hook into LLM calls to record usage
- [ ] Usage dashboard (daily/weekly/monthly views)
- [ ] Per-agent usage breakdown
- [ ] Cost estimation (based on model pricing)
- [ ] Usage alerts (approaching limits)
- [ ] Export usage data (CSV)

**Acceptance:** Can see token usage per agent, estimated costs displayed

---

### Checkpoint 3.2: Team Support ⬜
- [ ] Multiple users per tenant
- [ ] Role system (owner, admin, member, viewer)
- [ ] Invite user flow (email invite)
- [ ] User management UI (list, roles, remove)
- [ ] Permission checks on all API endpoints
- [ ] Audit log for user actions
- [ ] Transfer ownership flow

**Acceptance:** Can invite teammate, they login, can view but not delete agents

---

### Checkpoint 3.3: Node Management ⬜
- [ ] Node registration to tenant (not user)
- [ ] Node list UI (name, status, last seen, capabilities)
- [ ] Node health monitoring (heartbeat)
- [ ] Skill deployment to nodes
- [ ] Job routing to specific nodes
- [ ] Node configuration (allowed tools, resource limits)
- [ ] Node disconnect/remove flow

**Acceptance:** Can see registered nodes, deploy skill to node, run job on specific node

---

### Checkpoint 3.4: Production Readiness ⬜
- [ ] Error tracking (Sentry or similar)
- [ ] Structured logging (JSON logs)
- [ ] Health check endpoints
- [ ] Graceful shutdown
- [ ] Database connection pooling
- [ ] Rate limiting per tenant
- [ ] Backup strategy documented
- [ ] Runbook for common operations
- [ ] Load testing (target: 100 concurrent sessions)

**Acceptance:** System handles failures gracefully, logs are queryable, backups work

---

## Stretch Goals (Post-MVP)

### Checkpoint S.1: Skill Marketplace ⬜
- [ ] Skill registry (DB + object storage)
- [ ] Skill versioning
- [ ] Skill installation from marketplace
- [ ] Skill publishing flow
- [ ] Skill reviews/ratings

### Checkpoint S.2: Advanced Isolation ⬜
- [ ] Docker-based exec isolation per tenant
- [ ] Firecracker microVMs (optional)
- [ ] Network isolation between tenants
- [ ] Resource quotas (CPU, memory, disk)

### Checkpoint S.3: Billing Integration ⬜
- [ ] Stripe integration
- [ ] Subscription plans
- [ ] Usage-based billing
- [ ] Invoice generation
- [ ] Payment failure handling

---

## Progress Tracking

| Phase | Checkpoint | Status | Date Started | Date Completed |
|-------|------------|--------|--------------|----------------|
| 1 | 1.1 Database Schema | ⬜ | - | - |
| 1 | 1.2 Auth Layer | ⬜ | - | - |
| 1 | 1.3 Config Abstraction | ✅ | 2026-01-29 | 2026-01-29 |
| 1 | 1.4 Web Shell | ⬜ | - | - |
| 2 | 2.1 Agent Management UI | ⬜ | - | - |
| 2 | 2.2 Session Storage | ⬜ | - | - |
| 2 | 2.3 Credential Management | ⬜ | - | - |
| 2 | 2.4 Channel Configuration | ⬜ | - | - |
| 3 | 3.1 Usage Tracking | ⬜ | - | - |
| 3 | 3.2 Team Support | ⬜ | - | - |
| 3 | 3.3 Node Management | ⬜ | - | - |
| 3 | 3.4 Production Readiness | ⬜ | - | - |

**Legend:** ⬜ Not Started | 🟡 In Progress | ✅ Complete | ❌ Blocked

---

## Notes & Decisions Log

*Add notes here as you make decisions during implementation*

### 2026-01-29
- Deep dive completed, architecture documented
- Checkpoint plan created
- Next: Decide on starting point (DB schema vs. fork repo first)

---

*Last Updated: 2026-01-29 1:55 PM PST*
