# Reseller Architecture Spec

**Status:** Draft  
**Author:** Stella  
**Date:** 2026-02-19  
**Decision Doc:** `memory/2026-02-19-reseller-architecture.md`

## Overview

A uniform architecture where any org can own machines and provide managed services to other orgs. No special "platform" tier - e2e is simply the first reseller.

## Core Concepts

### Org (unchanged)
- First-class entity for users, agents, secrets, billing
- `is_system=true` indicates admin/reseller capabilities
- Can own machines and provide services to other orgs

### Machine
- Physical or virtual compute resource running Clawdbot/Machine Service
- **Belongs to exactly one org** (owner)
- Can be **authorized to serve multiple orgs** (multi-tenant)
- Comes with a sys_admin agent

### Sys Admin Agent
- Agent type that manages a machine
- **Belongs to machine's owning org**
- Stores secrets under owning org
- Can operate on behalf of authorized orgs (context switching)

### Authorization
- Grants a machine permission to serve an org
- Machine owner controls authorizations
- When serving a customer org, sys admin uses customer's context

## Data Model

### Existing Tables (modified)

```sql
-- machines table: add owner clarity
ALTER TABLE machines 
  ADD COLUMN is_multi_tenant BOOLEAN DEFAULT false;
-- organization_id = owning org (required for machines with sys admins)

-- agents table: no changes needed
-- organization_id = owning org (inherited from machine for sys admins)
```

### New Table: machine_authorizations

```sql
CREATE TABLE machine_authorizations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- The machine being authorized
  machine_id VARCHAR NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  
  -- The org being granted access
  authorized_org_id VARCHAR NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  
  -- Authorization scope
  access_level VARCHAR NOT NULL DEFAULT 'managed', -- 'managed' | 'full'
  
  -- Optional: limit which agents on this machine can serve this org
  agent_ids JSONB DEFAULT '[]', -- empty = all agents on machine
  
  -- Billing/tracking
  service_tier VARCHAR DEFAULT 'standard',
  monthly_limit_cents INTEGER,
  
  -- Metadata
  granted_by VARCHAR REFERENCES users(id),
  granted_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP,
  
  UNIQUE(machine_id, authorized_org_id)
);

CREATE INDEX idx_machine_auth_machine ON machine_authorizations(machine_id);
CREATE INDEX idx_machine_auth_org ON machine_authorizations(authorized_org_id);
```

### Access Levels

| Level | Description |
|-------|-------------|
| `managed` | Sys admin operates on behalf of org, org has no direct machine access |
| `full` | Org can directly interact with machine (future: org-owned machines) |

## Flows

### 1. Machine Registration (Existing + Modified)

```
1. Admin registers machine in Stellabot
2. Machine assigned to org (owner)
3. Sys admin agent auto-created for machine
4. Sys admin.organization_id = machine.organization_id
5. Sys admin can store secrets under owning org
```

### 2. Authorize Machine for Customer Org

```
1. Reseller admin (e2e) opens machine settings
2. Adds authorization for customer org (Earnware)
3. Creates machine_authorizations record
4. Sys admin can now operate for Earnware
```

### 3. Sys Admin Operating for Customer

```
1. Request comes in for Earnware task
2. Check: Is sys admin's machine authorized for Earnware? 
3. If yes: Sys admin operates with Earnware context
   - Uses Earnware's knowledge base
   - Respects Earnware's permissions
   - Usage billed to Earnware
4. Secrets (like sys admin's Google OAuth) remain in owning org
```

### 4. Context Switching

When sys admin serves different orgs:

| Resource | Source |
|----------|--------|
| Agent secrets (OAuth, API keys) | Owning org (e2e) |
| Knowledge base | Target org (Earnware) |
| Permissions/capabilities | Target org settings |
| Usage/billing | Target org |
| Audit logs | Both (ownership + operation) |

## API Changes

### Machine Endpoints

```
GET  /api/machines/:id/authorizations      -- List authorized orgs
POST /api/machines/:id/authorizations      -- Add authorization
DELETE /api/machines/:id/authorizations/:orgId -- Remove authorization
```

### Request Body (Add Authorization)

```json
{
  "authorizedOrgId": "earnware-uuid",
  "accessLevel": "managed",
  "serviceTier": "standard",
  "monthlyLimitCents": 50000
}
```

### Agent Context Header

When sys admin operates for a customer:

```
X-Operating-Org-Id: earnware-uuid
```

Backend validates:
1. Agent's machine is authorized for this org
2. Authorization hasn't expired
3. Usage limits not exceeded

## UI Changes

### Machine Settings Page

New "Authorized Organizations" section:

```
┌─────────────────────────────────────────────────┐
│ Authorized Organizations                    [+] │
├─────────────────────────────────────────────────┤
│ Earnware        managed   standard   $500/mo    │
│ CXO.pro         managed   standard   $250/mo    │
│ AMG             managed   premium    unlimited  │
└─────────────────────────────────────────────────┘
```

### Sys Admin Agent View

Shows which orgs the agent can serve:

```
Operating Context: [Earnware ▼]
- e2e (owner)
- Earnware
- CXO.pro  
- AMG
```

## Migration Plan

### Phase 1: Fix Current State (Immediate)
1. Assign Stella to e2e org
2. Assign Mac Mini to e2e org
3. OAuth flow works (uses agent's org)

### Phase 2: Authorization Table (This Week)
1. Create `machine_authorizations` table
2. Add API endpoints
3. Seed authorizations for current customers

### Phase 3: Context Switching (Next Week)
1. Add `X-Operating-Org-Id` header support
2. Validate authorizations on requests
3. Usage tracking per org

### Phase 4: UI (Following Week)
1. Machine authorization management
2. Sys admin org switcher
3. Per-org usage dashboards

## Security Considerations

1. **Authorization validation**: Every request must verify machine→org authorization
2. **Secret isolation**: Sys admin secrets stay in owning org, never leak to customer
3. **Audit trail**: Log both owning org and operating org for all actions
4. **Expiration**: Authorizations can expire, must be checked
5. **Revocation**: Removing authorization immediately blocks access

## Open Questions

1. **Billing granularity**: Per-request? Daily? Monthly aggregates?
2. **Authorization inheritance**: If org A authorizes machine for org B, can B's sub-orgs use it?
3. **Conflict resolution**: What if customer org and owning org have conflicting settings?
4. **Self-service**: Can customers request machine access, or only reseller-initiated?

## Success Metrics

- Stella can store OAuth under e2e org ✓
- Stella can serve Earnware with proper context
- e2e can onboard new customers by adding authorization
- Future: Any org can register machines and become reseller
