# POC: Stellabot ↔ Moltworker Integration

**Created:** 2026-01-30
**Status:** Planning
**Goal:** Prove that Stellabot can provision and manage Moltworker instances as execution environments for orgs.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    STELLABOT (Replit + Neon)                │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│  │ User/Org    │  │ Worker      │  │ Context Service      │ │
│  │ Management  │  │ Provisioning│  │ (shared org brain)   │ │
│  └─────────────┘  └──────┬──────┘  └──────────────────────┘ │
└──────────────────────────┼──────────────────────────────────┘
                           │ provisions/manages
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              CLOUDFLARE (1 instance per org)                │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Moltworker Instance (Org A)                             ││
│  │  ├── Sandbox Container (OpenClaw runtime)               ││
│  │  ├── R2 Storage (persistent data)                       ││
│  │  ├── Browser Rendering (web automation)                 ││
│  │  └── Multiple agents/workers inside                     ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Moltworker Instance (Org B)                             ││
│  │  └── ...                                                ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Manual POC (Week 1)

### 1.1 Deploy Test Moltworker Instance
**Goal:** Get a working Moltworker running on Cloudflare

**Tasks:**
- [ ] Create Cloudflare account (or use existing)
- [ ] Enable Workers Paid plan ($5/month)
- [ ] Clone moltworker repo: `~/clawd/moltworker` ✅ Done
- [ ] Configure secrets:
  - [ ] `ANTHROPIC_API_KEY` - Claude access
  - [ ] `MOLTBOT_GATEWAY_TOKEN` - generate with `openssl rand -hex 32`
  - [ ] `CF_ACCESS_TEAM_DOMAIN` - for admin UI protection
  - [ ] `CF_ACCESS_AUD` - Access application audience
- [ ] Deploy: `npm run deploy`
- [ ] Verify: Access Control UI at `https://<worker>.workers.dev/?token=<TOKEN>`
- [ ] Test: Send a message, verify agent responds

**Deliverable:** Working Moltworker instance we can interact with

### 1.2 Document API Surface
**Goal:** Map all Moltworker endpoints Stellabot needs

**Known endpoints:**
```
Public:
  GET  /                          # Control UI (requires token param)
  WS   /ws                        # WebSocket (requires token param)
  GET  /api/status                # Health check (no auth)

Admin (CF Access protected):
  GET  /api/admin/devices         # List pending/paired devices
  POST /api/admin/devices/:id/approve
  POST /api/admin/devices/approve-all
  GET  /api/admin/storage         # R2 status
  POST /api/admin/storage/sync    # Manual backup
  POST /api/admin/gateway/restart # Restart gateway

Debug (optional):
  GET  /debug/processes
  GET  /debug/logs?id=<pid>
  GET  /debug/version
```

**Tasks:**
- [ ] Test each endpoint manually
- [ ] Document request/response formats
- [ ] Identify any missing endpoints we need
- [ ] Determine auth requirements for programmatic access

**Deliverable:** API documentation for Stellabot integration

### 1.3 Stellabot API Client
**Goal:** Create a TypeScript client in Stellabot to talk to Moltworker

**Tasks:**
- [ ] Create `lib/moltworker-client.ts`
- [ ] Implement methods:
  - [ ] `getStatus()` - health check
  - [ ] `getDevices()` - list devices
  - [ ] `approveDevice(requestId)` - approve pairing
  - [ ] `restartGateway()` - restart
  - [ ] `syncStorage()` - trigger backup
- [ ] Handle CF Access auth (service token or JWT)
- [ ] Add to Stellabot environment: `MOLTWORKER_URL`, `MOLTWORKER_TOKEN`

**Deliverable:** Working API client that can communicate with Moltworker

---

## Phase 2: Integration (Week 2)

### 2.1 Org → Instance Mapping
**Goal:** Each org in Stellabot maps to one Moltworker instance

**Database changes:**
```sql
ALTER TABLE organizations ADD COLUMN moltworker_url TEXT;
ALTER TABLE organizations ADD COLUMN moltworker_token TEXT;  -- encrypted
ALTER TABLE organizations ADD COLUMN moltworker_status TEXT DEFAULT 'pending';
-- status: pending | provisioning | active | error | suspended
```

**Tasks:**
- [ ] Add migration for org columns
- [ ] Create org settings page in Stellabot UI
- [ ] Display Moltworker status on org dashboard
- [ ] Add "Connect Instance" flow (manual URL + token entry for POC)

**Deliverable:** Orgs can be linked to Moltworker instances

### 2.2 Worker Abstraction
**Goal:** "Workers" in Stellabot map to agents in Moltworker

**Understanding:**
- Moltworker/OpenClaw supports multiple agents in one gateway
- Each agent has: name, personality (SOUL.md), skills, channel bindings
- Agents are configured in `clawdbot.json`

**Tasks:**
- [ ] Research: How to add/configure agents via API (may need to add endpoints)
- [ ] Create `workers` table in Stellabot:
  ```sql
  CREATE TABLE workers (
    id UUID PRIMARY KEY,
    org_id UUID REFERENCES organizations(id),
    name TEXT NOT NULL,
    agent_id TEXT NOT NULL,  -- maps to agent in Moltworker
    personality TEXT,        -- SOUL.md content
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
  );
  ```
- [ ] Build Worker management UI
- [ ] Implement worker creation → agent configuration sync

**Deliverable:** Workers can be created/managed in Stellabot, synced to Moltworker

### 2.3 Context Service Integration
**Goal:** Moltworker agents use Stellabot's context service

**Approach:**
- Add context service skill to Moltworker
- Agents query context service for org knowledge
- Agents can write to context service

**Tasks:**
- [ ] Create context service skill for Moltworker
- [ ] Add `CONTEXT_SERVICE_URL` and `CONTEXT_SERVICE_KEY` to instance secrets
- [ ] Test: Agent retrieves context, agent writes context
- [ ] Verify cross-worker context sharing within org

**Deliverable:** Workers share context through Stellabot's context service

---

## Phase 3: Automation (Week 3)

### 3.1 Programmatic Instance Deployment
**Goal:** Stellabot can spin up new Moltworker instances automatically

**Options:**
1. **Cloudflare API** - Deploy Workers programmatically
2. **Wrangler CLI** - Script deployments
3. **Terraform/Pulumi** - Infrastructure as code

**Research needed:**
- [ ] Cloudflare Workers deployment API
- [ ] How to set secrets programmatically
- [ ] How to configure CF Access per-instance
- [ ] Cost implications of many deployments

**Tasks:**
- [ ] Choose deployment approach
- [ ] Implement provisioning service in Stellabot
- [ ] Add "Create Instance" button for new orgs
- [ ] Handle deployment errors gracefully

**Deliverable:** New orgs automatically get a Moltworker instance

### 3.2 Instance Lifecycle Management
**Goal:** Stellabot manages instance health, updates, teardown

**Tasks:**
- [ ] Health monitoring (periodic status checks)
- [ ] Alert on instance errors
- [ ] Update mechanism (redeploy with new image)
- [ ] Teardown when org is deleted/suspended
- [ ] Cost tracking per org

**Deliverable:** Full lifecycle management from Stellabot

---

## Phase 4: Production Readiness (Week 4)

### 4.1 Security Hardening
- [ ] Encrypt stored tokens in Stellabot DB
- [ ] Rotate gateway tokens periodically
- [ ] Audit logging for all management actions
- [ ] Rate limiting on API calls

### 4.2 Multi-Channel Setup
- [ ] UI to configure Telegram/Discord/Slack per org
- [ ] Securely pass channel tokens to instances
- [ ] Channel-specific worker assignments

### 4.3 Monitoring & Observability
- [ ] Instance metrics dashboard
- [ ] Cost tracking via AI Gateway
- [ ] Usage analytics per org/worker
- [ ] Error alerting

---

## Open Questions

1. **CF Access for API calls** - How does Stellabot authenticate to Moltworker's admin endpoints? Service token? Custom header?

2. **Agent configuration API** - Moltworker may not expose agent management APIs. May need to:
   - Add endpoints to Moltworker
   - Or: Configure via R2 config file sync

3. **Real-time communication** - How does Stellabot receive events from Moltworker? WebSocket? Webhooks?

4. **Cost model** - What's the actual per-org cost?
   - Workers Paid: $5/month (account-level, not per-worker)
   - Sandbox containers: metered by usage
   - R2: free tier + metered
   - Need to model expected costs

5. **Fork vs upstream** - If we need significant changes to Moltworker, do we fork or contribute upstream?

---

## Success Criteria for POC

**Minimum viable:**
- [ ] One Moltworker instance deployed and working
- [ ] Stellabot can check instance status
- [ ] Stellabot can display devices/approve pairing
- [ ] One worker (agent) responds to messages

**Stretch goals:**
- [ ] Multiple workers in same instance
- [ ] Context service integration working
- [ ] Automated instance provisioning

---

## Resources

- Moltworker repo: `~/clawd/moltworker`
- Moltworker README: Detailed setup instructions
- Cloudflare docs: https://developers.cloudflare.com/sandbox/
- OpenClaw docs: https://docs.openclaw.ai/
- Stellabot repo: `~/clawd/stellabot-replit` + https://github.com/jvalenty/stellabot

---

## Next Actions

1. **Today:** Deploy test Moltworker instance (Phase 1.1)
2. **Tomorrow:** Document and test API surface (Phase 1.2)
3. **This week:** Build Stellabot API client (Phase 1.3)
