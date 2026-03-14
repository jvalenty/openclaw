# Stellabot Permission System

## Design Document
**Version:** 1.0  
**Date:** 2026-02-03  
**Status:** Approved for implementation

---

## Overview

A role-based permission system with fine-grained resource assignments, designed for human-agent collaboration in mission-critical operations. Built on the principle that **neither humans nor agents should act unilaterally** on sensitive operations.

### Core Principles

1. **Role = capability ceiling** — what categories you can touch
2. **Assignment = scope** — what specific resources you can access
3. **CRUD+A = fine-grained control** — what you can do with each resource
4. **Mutual oversight** — human-in-the-loop for agents, agent-in-the-loop for untrained humans
5. **Adaptive friction** — patterns that prove safe earn reduced approval requirements

---

## Human Roles

Four-tier hierarchy determining capability ceiling:

| Role | Users/Agents | Data Access | Content/Resources | Reports |
|------|--------------|-------------|-------------------|---------|
| `org_admin` | CRUD | All | CRUD | CRUD |
| `org_analyst` | R | All (broad read) | R | CRUD |
| `org_editor` | R | Assigned | CRUD | CR |
| `org_user` | R | Assigned | CRU | R |

### Role Descriptions

- **org_admin**: Full control. Can create users, agents, manage permissions. Typically org owner or delegated admin.
- **org_analyst**: Broad read access for learning and strategy. Can produce reports/insights but cannot modify operational resources.
- **org_editor**: Can modify content and resources within assigned scope. Cannot create users or agents.
- **org_user**: Can use and collaborate with assigned resources. Execute SOPs, not change org patterns.

---

## Agent Roles

Three-tier hierarchy for agent autonomy:

| Role | Can Delegate | Can Spawn Sub-agents | Typical Use |
|------|--------------|---------------------|-------------|
| `manager` | ✓ | ✓ | Orchestrates work, spawns workers |
| `specialist` | ✗ | ✗ | Domain expert, executes complex tasks |
| `worker` | ✗ | ✗ | Executes scoped tasks, temporary |

### Delegation Rules

- Humans **cannot** delegate to other humans (prevents permission sprawl)
- Humans implicitly activate agents within their permission ceiling
- Manager agents **can** delegate to other agents for parallel throughput
- Workers **cannot** delegate (leaf nodes in the hierarchy)
- All delegation is scoped and time-limited
- Audit chain: Human → Manager Agent → Worker Agent(s)

---

## Permission Model

### CRUD+A Flags

| Flag | Meaning |
|------|---------|
| **C** | Create / initiate |
| **R** | Read / view |
| **U** | Update / modify |
| **D** | Delete / cancel |
| **A** | Approve others' requests |

### Resource Paths

Hierarchical paths with inheritance:

```
agents                    # All agents
agents.{uuid}             # Specific agent
pub_orders                # All pub orders
pub_orders.research       # Research operation on pub orders
pub_orders.{uuid}         # Specific pub order
```

Inheritance: specific paths override general paths.

---

## Schema

### Users Table (modification)

```sql
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'org_user';
-- Values: 'org_admin' | 'org_analyst' | 'org_editor' | 'org_user'
```

### Agents Table (modification)

```sql
ALTER TABLE agents ADD COLUMN agent_role TEXT DEFAULT 'specialist';
-- Values: 'manager' | 'specialist' | 'worker'

ALTER TABLE agents ADD COLUMN can_spawn BOOLEAN DEFAULT FALSE;
```

### User Assignments Table (new)

```sql
CREATE TABLE user_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,      -- 'agent' | 'skill' | 'brand' | 'knowledge' | 'file'
  resource_id UUID NOT NULL,
  
  -- CRUD+A flags
  can_create BOOLEAN DEFAULT FALSE,
  can_read BOOLEAN DEFAULT TRUE,
  can_update BOOLEAN DEFAULT FALSE,
  can_delete BOOLEAN DEFAULT FALSE,
  can_approve BOOLEAN DEFAULT FALSE,
  
  -- Approval requirements
  requires_approval BOOLEAN DEFAULT FALSE,
  approval_from TEXT,               -- 'human' | 'agent' | 'both'
  
  -- Domain-specific constraints (decorations)
  constraints JSONB DEFAULT '{}',
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id, resource_type, resource_id)
);

CREATE INDEX idx_user_assignments_user ON user_assignments(user_id);
CREATE INDEX idx_user_assignments_resource ON user_assignments(resource_type, resource_id);
```

### Agent Capabilities Table (new)

```sql
CREATE TABLE agent_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id UUID,                 -- NULL for type-wide capability
  
  -- CRUD+A flags
  can_create BOOLEAN DEFAULT FALSE,
  can_read BOOLEAN DEFAULT TRUE,
  can_update BOOLEAN DEFAULT FALSE,
  can_delete BOOLEAN DEFAULT FALSE,
  can_approve BOOLEAN DEFAULT FALSE,
  can_delegate BOOLEAN DEFAULT FALSE,  -- Manager agents only
  
  -- Constraints
  constraints JSONB DEFAULT '{}',
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(agent_id, resource_type, resource_id)
);

CREATE INDEX idx_agent_capabilities_agent ON agent_capabilities(agent_id);
```

### Actions Table (new)

Audit trail + approval queue + grease pattern data.

```sql
CREATE TABLE actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  
  -- What
  resource_type TEXT NOT NULL,
  resource_id UUID,
  resource_path TEXT NOT NULL,      -- Full path: 'pub_orders.research'
  crud_type TEXT NOT NULL,          -- 'create' | 'read' | 'update' | 'delete' | 'approve'
  payload JSONB,
  
  -- Who requested
  requester_type TEXT NOT NULL,     -- 'human' | 'agent'
  requester_id UUID NOT NULL,
  
  -- Approval tracking
  requires_approval BOOLEAN DEFAULT FALSE,
  approval_from TEXT,               -- 'human' | 'agent' | 'both'
  approved_by_human UUID REFERENCES users(id),
  approved_by_agent UUID REFERENCES agents(id),
  
  -- Status
  status TEXT DEFAULT 'pending',    -- 'pending' | 'approved' | 'rejected' | 'executed' | 'auto_approved'
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  executed_at TIMESTAMP
);

CREATE INDEX idx_actions_org ON actions(org_id);
CREATE INDEX idx_actions_requester ON actions(requester_type, requester_id);
CREATE INDEX idx_actions_status ON actions(status);
CREATE INDEX idx_actions_resource ON actions(resource_type, resource_id);
```

### Agent Sessions Table (new)

Tracks delegated sub-agent sessions.

```sql
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  
  -- Hierarchy
  human_id UUID NOT NULL REFERENCES users(id),      -- Original permission ceiling
  parent_agent_id UUID REFERENCES agents(id),       -- Manager who spawned
  child_agent_id UUID NOT NULL REFERENCES agents(id), -- Worker spawned
  
  -- Scope
  resource_scope JSONB NOT NULL,    -- What resources this session can access
  task_context JSONB,               -- Task-specific context
  
  -- Lifecycle
  status TEXT DEFAULT 'active',     -- 'active' | 'completed' | 'cancelled' | 'expired'
  started_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_agent_sessions_parent ON agent_sessions(parent_agent_id);
CREATE INDEX idx_agent_sessions_child ON agent_sessions(child_agent_id);
CREATE INDEX idx_agent_sessions_human ON agent_sessions(human_id);
```

---

## Constraint Decorations

The `constraints` JSONB field allows domain-specific rules without schema changes.

### Trading Example

```json
{
  "max_order_value": 50000,
  "max_position_value": 500000,
  "approval_above": 25000,
  "instruments": ["equity", "options"],
  "time_window": {
    "days": ["mon", "tue", "wed", "thu", "fri"],
    "hours": {"start": "09:30", "end": "16:00"}
  }
}
```

### Content Example

```json
{
  "states": {
    "draft": "CRUD",
    "review": "RUA",
    "published": "R"
  },
  "max_list_size": 50000,
  "approval_above_list_size": 30000,
  "brands": ["freedom-herald", "liberty-fuel"]
}
```

### Constraint Interpretation

Domain modules interpret constraints at runtime:
- Trading module checks `max_order_value` before order execution
- Content module checks `states` against resource workflow state
- Core permission engine handles CRUD+A; constraints are **additional** checks

---

## Permission Resolution

### Algorithm

```python
def check_permission(user, action, resource):
    # 1. Check role ceiling
    if not role_allows(user.role, resource.type, action):
        return DENIED
    
    # 2. Find assignment
    assignment = get_assignment(user.id, resource.type, resource.id)
    if not assignment:
        return DENIED
    
    # 3. Check CRUD flag
    if not assignment.has_flag(action):
        return DENIED
    
    # 4. Check constraints (domain-specific)
    if not constraints_satisfied(assignment.constraints, resource, action):
        return DENIED
    
    # 5. Check approval requirement
    if assignment.requires_approval:
        return NEEDS_APPROVAL
    
    # 6. Check grease (auto-approve patterns)
    if is_greased(user.id, resource.type, action):
        return AUTO_APPROVED
    
    return ALLOWED
```

### Grease Calculation

Computed from actions history:

```sql
-- Check if pattern has earned grease (10+ clean executions, no incidents)
SELECT COUNT(*) as success_count
FROM actions
WHERE requester_id = $user_id
  AND resource_type = $resource_type
  AND crud_type = $action
  AND status = 'executed'
  AND created_at > NOW() - INTERVAL '90 days';

-- If success_count >= 10 AND no recent rejections/incidents, auto-approve
```

---

## UI Components

### User Detail Page (Admin View)

```
┌─────────────────────────────────────────────────────────┐
│ User: jvalenty@gmail.com                                │
│ Role: org_user                     [Change Role ▼]     │
├─────────────────────────────────────────────────────────┤
│ Assigned Resources                                      │
├─────────────────────────────────────────────────────────┤
│                              C    R    U    D    A      │
│ ▼ Agents                                                │
│   └─ Brand Manager Agent    [ ]  [✓]  [ ]  [ ]  [ ]    │
│   └─ + Assign Agent                                     │
│                                                         │
│ ▼ Skills                                                │
│   └─ brand-manager          [ ]  [✓]  [ ]  [ ]  [ ]    │
│                                                         │
│ ▼ Brands                                                │
│   └─ Freedom Herald         [✓]  [✓]  [✓]  [ ]  [ ]    │
│                                                         │
│ ▼ Knowledge                                             │
│   └─ Brand Guidelines       [ ]  [✓]  [ ]  [ ]  [ ]    │
└─────────────────────────────────────────────────────────┘
```

### Approval Queue

```
┌─────────────────────────────────────────────────────────┐
│ Pending Approvals                                       │
├─────────────────────────────────────────────────────────┤
│ ⏳ Order #1234 - Buy 1000 AAPL @ $150                   │
│    Requested by: Junior Trader                          │
│    Needs: Agent approval (Risk Bot)                     │
│    [Approve] [Reject] [Details]                         │
├─────────────────────────────────────────────────────────┤
│ ⏳ Email Campaign - Freedom Herald Daily                │
│    Requested by: Content Manager                        │
│    Needs: Human approval (Editor-in-Chief)              │
│    [Approve] [Reject] [Details]                         │
└─────────────────────────────────────────────────────────┘
```

---

## Stress Test Results

### Prop Trading Firm ✓

| Role | Mapping | Permissions |
|------|---------|-------------|
| Principal | org_admin | Full CRUD on everything |
| Risk Manager | org_editor | R all, CRUD risk_limits, A orders |
| Portfolio Manager | org_editor | CRUD strategies, RU accounts |
| Senior Trader | org_user | CRUD orders (constraints: limits) |
| Junior Trader | org_user | CR orders (requires_approval) |
| Analyst | org_analyst | R all, CR reports |
| Compliance | org_analyst | R all, C audit_logs, C account_freeze |

### Content Distribution Network ✓

| Role | Mapping | Permissions |
|------|---------|-------------|
| Org Owner | org_admin | Full CRUD on everything |
| Brand Director | org_editor | CRUD assigned brands |
| Editor-in-Chief | org_editor | RUDA content, A campaigns |
| Content Manager | org_user | CRUD content (constraints: states) |
| Writer | org_user | CR content (requires_approval) |
| QA Reviewer | org_user | RUA content |
| Developer | org_editor | CRUD code/infra, no content |

---

## Implementation Plan

### Phase 1: Schema & Migrations
1. Add `role` column to users table
2. Add `agent_role`, `can_spawn` to agents table
3. Create `user_assignments` table
4. Create `agent_capabilities` table
5. Create `actions` table
6. Create `agent_sessions` table

### Phase 2: Permission Engine
1. Implement permission resolution algorithm
2. Implement constraint interpreter (trading + content modules)
3. Add permission checks to existing API routes

### Phase 3: UI
1. User detail page with assignment management
2. CRUD toggle interface for assignments
3. Approval queue component
4. Action history/audit log view

### Phase 4: Agent Integration
1. Implement agent session spawning
2. Add permission checks to agent execution
3. Integrate approval workflow with agent actions

### Phase 5: Grease System
1. Implement grease calculation from action history
2. Add auto-approve logic to permission engine
3. Admin UI to view/manage greased patterns

---

## Security Considerations

1. **Fail closed**: Missing permission = denied
2. **Role ceiling enforced**: Assignments cannot exceed role capabilities
3. **Audit everything**: All permission checks logged in actions table
4. **No human-to-human delegation**: Prevents social engineering attacks
5. **Time-limited agent sessions**: Delegated access expires automatically
6. **Constraint enforcement at execution**: Not just UI-level checks

---

## Open Questions

1. Should constraints be validated at assignment creation or only at execution?
2. How to handle permission changes mid-session for active agent sessions?
3. Should grease thresholds be configurable per-org?
4. Need emergency override mechanism for org_admin (bypass all approvals)?

---

*Document authored by Stella Costa, approved by John Valenty*
*Implementation to follow this specification*
