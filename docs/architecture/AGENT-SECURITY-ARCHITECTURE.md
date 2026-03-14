# Agent Security Architecture v2

**Created:** 2026-02-06  
**Revised:** 2026-02-06 (simplified from v1)  
**Authors:** John Valenty, Stella Costa

---

## Philosophy

**The best part is no part.**

Build only what we need. Add complexity when real use cases demand it.

---

## Core Model

### Hard vs Soft Agents

| Type | What it is | Examples | Count |
|------|------------|----------|-------|
| **Hard Agent** | Actual running process on infrastructure | Stella (Mac Mini), MoltWorker (CF Worker) | Handful |
| **Soft Agent** | DB config only — personality, permissions, context | Brand Manager, Org Admin, Specialists | Thousands |

**Hard agents** are sys admins — they run on machines and do the actual execution.

**Soft agents** are just rows in the database. When invoked, a hard agent loads their config (soul, permissions, context) and acts on their behalf. No dedicated process, no infrastructure per agent.

This means:
- Stellabot can have thousands of soft agents without spinning up infrastructure
- All execution flows through the handful of hard agents
- Soft agents are cheap to create, configure, and tear down
- Hard agents are carefully provisioned and monitored

### Security Layers

1. **Org Isolation** — Hard boundaries between organizations (database, files, browser, credentials)
2. **Action Whitelist** — Within an org, agents can only do explicitly allowed actions

That's it.

---

## 1. Org Isolation

Every resource is scoped to `org_id`. Agents cannot cross org boundaries even if compromised.

| Resource | Isolation |
|----------|-----------|
| Database | All queries auto-inject `WHERE org_id = session.org_id` |
| Files | Path jailed to `/data/orgs/{org_id}/` |
| Browser | Separate profile per org |
| Credentials | Lookup by org_id only |
| Machines | Only machines owned by org |
| Agents | Can only see agents in same org |

**Critical rule:** `org_id` comes from authenticated session, never from agent input.

---

## 2. Org File Structure

```
/data/orgs/{org_id}/
├── files/     # Private org files (agent workspace)
├── dev/       # Development files (org-authenticated access)
└── pub/       # Public files (world-readable via URL)
```

**Access patterns:**

| Path | Who can access | URL |
|------|----------------|-----|
| `/files/*` | Org agents only | None (internal) |
| `/dev/*` | Org members (authenticated) | `https://{org_slug}.stellabot.app/dev/*` |
| `/pub/*` | Anyone | `https://{org_slug}.stellabot.app/pub/*` |

**Use case:** Org Admin building a web app
- Writes files to `/dev/app/index.html`
- Tests at `https://acme.stellabot.app/dev/app/`
- When ready, moves to `/pub/app/` for public access
- Public URL: `https://acme.stellabot.app/pub/app/`

**Security constraints:**
- `/pub/` serves static files only (no server-side execution)
- Content-Type derived from extension, sanitized
- Max file size per org (configurable)
- Rate limiting on public URLs

---

## 3. Browser Profiles

Each org gets an isolated browser profile:

```
/data/browser-profiles/{org_id}/
```

**Within org:** All agents share the browser profile. If admin logs into Google, all org agents can use that session. What they can DO is controlled by their action whitelist.

**Cross-org:** Impossible. Hard directory isolation.

---

## 4. Action Whitelist

Agents can ONLY perform actions explicitly granted to them.

### Permission Levels

| Level | Example | Use Case |
|-------|---------|----------|
| **Wildcard** | `*` | Org Admin — can do anything within org boundary |
| **Specific** | `sheets.read`, `sheets.write` | Brand Manager — limited scope |
| **Constrained** | `sheets.write` + `allowed_fields: [F,G,H,I]` | Brand Manager — column restrictions |

### Protected Actions

These can NEVER be granted to agents:

```typescript
const PROTECTED_ACTIONS = [
  'sys.create_org',
  'sys.delete_org', 
  'sys.cross_org_query',
  'sys.modify_agent_permissions',
  'sys.access_other_org',
]
```

Even wildcard `*` doesn't grant these.

---

## 5. Database Schema

### agent_actions

```sql
CREATE TABLE agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,        -- '*' for wildcard, or specific action
  resource_filter JSONB,               -- constraints (spreadsheet_id, url_patterns, etc.)
  allowed_fields TEXT[],               -- field/column restrictions
  max_value NUMERIC,                   -- value limit if applicable
  enabled BOOLEAN DEFAULT true,
  reason TEXT,                         -- why this was granted
  added_by UUID REFERENCES users(id),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(agent_id, action, resource_filter)
);

CREATE INDEX idx_agent_actions_lookup ON agent_actions(agent_id, enabled) WHERE enabled = true;
```

### agent_action_log

Single table for all action attempts (allowed + blocked):

```sql
CREATE TABLE agent_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES orgs(id),
  session_id VARCHAR(255),
  
  action VARCHAR(100) NOT NULL,
  parameters JSONB,
  
  status VARCHAR(20) NOT NULL,         -- 'allowed', 'blocked'
  block_reason VARCHAR(100),           -- null if allowed
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Review queue for blocked attempts
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  review_action VARCHAR(20)            -- 'whitelisted', 'ignored'
);

CREATE INDEX idx_action_log_agent ON agent_action_log(agent_id, created_at DESC);
CREATE INDEX idx_action_log_blocked ON agent_action_log(org_id, reviewed_at) 
  WHERE status = 'blocked' AND reviewed_at IS NULL;
```

### orgs (add column)

```sql
ALTER TABLE orgs ADD COLUMN browser_settings JSONB DEFAULT '{}';
-- Settings: { "persistent_sessions": true, "allowed_domains": [...] }
```

**That's it. Three things: agent_actions, agent_action_log, browser_settings on orgs.**

---

## 6. Enforcement

### OrgScopedExecutor

```typescript
class OrgScopedExecutor {
  constructor(
    private orgId: string,
    private agentId: string
  ) {}

  // All file operations go through here
  resolvePath(userPath: string, scope: 'files' | 'dev' | 'pub'): string {
    const baseDir = `/data/orgs/${this.orgId}/${scope}`
    const resolved = path.resolve(baseDir, userPath)
    if (!resolved.startsWith(baseDir + '/')) {
      throw new SecurityError('Path traversal blocked')
    }
    return resolved
  }

  // All database queries go through here
  async query<T>(table: string, filters: object): Promise<T[]> {
    return db.query(table, { ...filters, org_id: this.orgId })
  }

  // All permission checks go through here
  async checkPermission(action: string, resource?: object): Promise<void> {
    if (PROTECTED_ACTIONS.includes(action)) {
      await this.logAttempt(action, resource, 'blocked', 'protected_action')
      throw new SecurityError('Action not permitted')
    }

    // Check wildcard first
    const wildcard = await this.getPermission('*')
    if (wildcard) {
      await this.logAttempt(action, resource, 'allowed')
      return
    }

    // Check specific permission
    const permission = await this.getPermission(action)
    if (!permission) {
      await this.logAttempt(action, resource, 'blocked', 'not_whitelisted')
      throw new SecurityError('Action not permitted')
    }

    // Validate constraints if present
    if (permission.resource_filter || permission.allowed_fields || permission.max_value) {
      this.validateConstraints(permission, resource)
    }

    await this.logAttempt(action, resource, 'allowed')
  }
}
```

---

## 7. Use Cases

### Use Case 1: Brand Manager

**Agent:** Brand Manager (Specialist)  
**Org:** AMG  
**Need:** Read/write brand tracking spreadsheet, columns F-I only

**Permissions:**
```sql
INSERT INTO agent_actions (agent_id, action, resource_filter, reason) VALUES
('brand-mgr-id', 'sheets.read', 
 '{"spreadsheet_id": "1gFBG_xxx"}',
 'Read brand management spreadsheet');

INSERT INTO agent_actions (agent_id, action, resource_filter, allowed_fields, reason) VALUES
('brand-mgr-id', 'sheets.write',
 '{"spreadsheet_id": "1gFBG_xxx"}',
 ARRAY['F', 'G', 'H', 'I'],
 'Update status columns only');
```

**Stress tests:**
| Attack | Result |
|--------|--------|
| Try to read different spreadsheet | ❌ Blocked (not in resource_filter) |
| Try to write column A | ❌ Blocked (not in allowed_fields) |
| Try to send email | ❌ Blocked (no gmail.* permissions) |
| Try to access other org's sheet | ❌ Blocked (org isolation) |

---

### Use Case 2: Org Admin (Issue Agent)

**Agent:** Issue Agent  
**Org:** KillerApps  
**Need:** Full access within org to handle any request

**Permissions:**
```sql
INSERT INTO agent_actions (agent_id, action, reason) VALUES
('issue-agent-id', '*', 'Org admin - full access within org boundary');
```

**Stress tests:**
| Attack | Result |
|--------|--------|
| Access any org file | ✅ Allowed (within org) |
| Use org's browser session | ✅ Allowed (org profile) |
| Query org's database records | ✅ Allowed (auto-scoped) |
| Create org in system | ❌ Blocked (protected action) |
| Access other org's files | ❌ Blocked (org isolation) |
| Modify own permissions | ❌ Blocked (protected action) |

---

### Use Case 3: Org Admin Building Web App

**Agent:** Issue Agent  
**Org:** Acme (slug: `acme`)  
**Need:** Build and deploy a simple status dashboard

**Workflow:**

1. **Create files:**
```
Agent writes to:
  /files/dashboard/index.html
  /files/dashboard/style.css
  /files/dashboard/app.js
```

2. **Move to dev for testing:**
```
Agent copies to:
  /dev/dashboard/index.html
  /dev/dashboard/style.css  
  /dev/dashboard/app.js
```

3. **Test internally:**
```
URL: https://acme.stellabot.app/dev/dashboard/
Access: Org members only (requires login)
```

4. **Publish:**
```
Agent copies to:
  /pub/dashboard/index.html
  /pub/dashboard/style.css
  /pub/dashboard/app.js
```

5. **Public access:**
```
URL: https://acme.stellabot.app/pub/dashboard/
Access: Anyone
```

**Stress tests:**
| Attack | Result |
|--------|--------|
| Write to other org's /pub/ | ❌ Blocked (org isolation) |
| Write executable server code | ❌ N/A (static files only) |
| Access /dev/ without auth | ❌ Blocked (requires org login) |
| XSS in uploaded HTML | ⚠️ Sandboxed to org subdomain |
| Path traversal /pub/../../files/ | ❌ Blocked (path resolution) |

---

### Use Case 4: Prop Firm Flow

**Agents:** Researcher, Trader  
**Org:** KillerApps Prop  
**Need:** Researchers surface signals, John approves, Trader executes

**This is NOT a software problem.** It's a workflow:

1. **Researcher** finds opportunity → writes to signal channel/sheet
2. **John** reviews signal → approves or rejects (human decision)
3. **Trader** (if auto-approve enabled) executes within soft boundaries

**Permissions:**

Researcher:
```sql
-- Research actions only
('researcher-id', 'market.read', NULL, 'Read market data'),
('researcher-id', 'sheets.write', '{"spreadsheet_id": "signals-sheet"}', 'Write signals'),
('researcher-id', 'web.search', NULL, 'Research')
```

Trader:
```sql
-- Execution only, John controls what gets queued
('trader-id', 'orders.create', NULL, 'Execute approved orders'),
('trader-id', 'positions.read', NULL, 'View positions')
```

**The guardrail is John, not software.** Trader can only execute what John (or auto-approve) queues. We're protecting against miscommunication, not building trading software.

---

## 8. Implementation Phases

### Phase 1: Schema (3 days)
- [ ] Create `agent_actions` table
- [ ] Create `agent_action_log` table  
- [ ] Add `browser_settings` to orgs
- [ ] Define PROTECTED_ACTIONS

### Phase 2: Enforcement (1 week)
- [ ] Build OrgScopedExecutor
- [ ] File path jailing with /files/, /dev/, /pub/
- [ ] Database query org_id injection
- [ ] Browser profile isolation
- [ ] Permission checking middleware

### Phase 3: File Serving (3 days)
- [ ] Route: `/{org_slug}/dev/*` (authenticated)
- [ ] Route: `/{org_slug}/pub/*` (public)
- [ ] Static file serving with content-type safety
- [ ] Rate limiting

### Phase 4: UI (1 week)
- [ ] Allowed Actions tab on agent edit
- [ ] Add/edit/remove actions
- [ ] Blocked attempts list with one-click whitelist
- [ ] Action log viewer

---

## 9. Integration Model

External services (Google, etc.) use a **single integration account per org**.

**Example:** stella@killerapps.dev is the Google integration identity for KillerApps org.

**Two permission layers:**

| Layer | Who controls it | What it checks |
|-------|-----------------|----------------|
| **External service** | Google/etc sharing settings | Is this resource shared with the integration account? |
| **Stellabot** | agent_actions whitelist | Does this agent have the action permitted? |

**Both must pass.** This is intentional:
- Google handles resource-level sharing (who can see this spreadsheet?)
- Stellabot handles agent-level permissions (can this agent use sheets.read?)

**To grant an agent access:**
1. Share the resource with the integration account (Google side)
2. Whitelist the action for the agent (Stellabot side)

No per-agent OAuth. No complex delegation. Just sharing + whitelisting.

---

## 10. What We're NOT Building

- ❌ Role hierarchy / manager approval chains
- ❌ Time-based restrictions  
- ❌ Per-action rate limiting
- ❌ Risk levels / categories
- ❌ Action templates
- ❌ Complex approval workflows

**Add these when real use cases demand them.**

---

## Summary

| Layer | Mechanism |
|-------|-----------|
| Org isolation | Hard boundaries (files, db, browser, creds) |
| Action whitelist | Explicit allow-list per agent |
| Protected actions | System ops always blocked |
| Audit | Single log table, blocked attempts queue |

Two tables. Clear boundaries. Ship it.
