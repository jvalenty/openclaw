# Agent Permissions Architecture

## Overview

Enterprise-grade permission system for controlling what agents can do on behalf of users. Based on the principle of **delegated authority** — an agent can never exceed the permissions of the user it's acting for, and may be further restricted by agent-specific policies.

## Core Principles

1. **Least Privilege** — Agents get minimum permissions needed for their role
2. **User Delegation** — Users explicitly grant agents permission to act on their behalf
3. **Defense in Depth** — Multiple enforcement layers (policy + credentials + audit)
4. **Fail Closed** — If permission check fails or is ambiguous, deny the action
5. **Full Audit Trail** — Every action is logged with who, what, when, why

---

## Permission Model

### Three-Layer Stack

```
┌─────────────────────────────────────────────────────────────┐
│  USER PERMISSIONS                                           │
│  What the human user is allowed to do                       │
│  (org membership, role, explicit grants)                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Delegation (user grants agent)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  AGENT DELEGATION SCOPE                                     │
│  What the user has delegated to this agent                  │
│  (subset of user permissions, time-limited, revocable)      │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Policy (org/admin restricts)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  AGENT POLICY CONSTRAINTS                                   │
│  Additional restrictions from org admins                    │
│  (rate limits, resource restrictions, action filters)       │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Effective = intersection of all three
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  EFFECTIVE PERMISSIONS                                      │
│  What the agent can actually do for this user               │
└─────────────────────────────────────────────────────────────┘
```

### Permission Types

```typescript
type ResourceType = 
  | 'sheets'      // Google Sheets
  | 'drive'       // Google Drive files
  | 'calendar'    // Google Calendar
  | 'email'       // Email (read/send)
  | 'messaging'   // External messaging (Slack, etc.)
  | 'files'       // Local/cloud file system
  | 'exec'        // Shell command execution
  | 'browser'     // Browser automation
  | 'database'    // Direct DB access
  | 'api'         // External API calls
  | 'agents'      // Creating/managing other agents

type Action = 'read' | 'write' | 'delete' | 'execute' | 'admin'

interface Permission {
  resourceType: ResourceType
  resourceId: string | '*'      // Specific resource or wildcard
  actions: Action[]
  constraints?: {
    columns?: string[]          // For sheets: allowed columns
    rows?: string               // For sheets: allowed row range
    paths?: string[]            // For files: allowed path patterns
    commands?: string[]         // For exec: allowed command patterns
    rateLimit?: {
      requests: number
      windowSeconds: number
    }
    timeWindow?: {
      start: string             // ISO timestamp
      end: string
    }
  }
}
```

---

## Database Schema

### Core Tables

```sql
-- What users have delegated to agents
CREATE TABLE agent_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  
  -- Delegation scope
  permissions JSONB NOT NULL,     -- Array of Permission objects
  
  -- Lifecycle
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,         -- NULL = no expiry
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id),
  
  -- Metadata
  delegation_reason TEXT,         -- Why was this granted
  
  UNIQUE(agent_id, user_id)       -- One delegation per user-agent pair
);

-- Org-level policies that constrain all agents
CREATE TABLE agent_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,  -- NULL = applies to all agents in org
  
  -- Policy definition
  policy_type VARCHAR(50) NOT NULL,  -- 'allow', 'deny', 'require_approval'
  resource_type VARCHAR(50) NOT NULL,
  resource_pattern TEXT,              -- Regex or glob pattern
  actions TEXT[],
  constraints JSONB,
  
  -- Priority (higher = evaluated first)
  priority INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  description TEXT,
  
  INDEX idx_policies_org (org_id),
  INDEX idx_policies_agent (agent_id)
);

-- Audit log for all agent actions
CREATE TABLE agent_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Who
  agent_id UUID NOT NULL REFERENCES agents(id),
  user_id UUID NOT NULL REFERENCES users(id),      -- On whose behalf
  org_id UUID NOT NULL REFERENCES orgs(id),
  session_id VARCHAR(255),
  
  -- What
  action_type VARCHAR(100) NOT NULL,               -- 'sheets.read', 'exec.run', etc.
  resource_type VARCHAR(50) NOT NULL,
  resource_id TEXT,
  action_details JSONB,                            -- Full action payload
  
  -- Decision
  permission_decision VARCHAR(20) NOT NULL,        -- 'allowed', 'denied', 'pending_approval'
  decision_reason TEXT,
  policy_id UUID REFERENCES agent_policies(id),    -- Which policy decided
  
  -- Result
  action_result VARCHAR(20),                       -- 'success', 'failure', 'cancelled'
  result_details JSONB,
  
  -- Timing
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  INDEX idx_log_agent (agent_id, requested_at),
  INDEX idx_log_user (user_id, requested_at),
  INDEX idx_log_org (org_id, requested_at)
);

-- Pending approvals for sensitive actions
CREATE TABLE agent_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_log_id UUID NOT NULL REFERENCES agent_action_log(id),
  
  -- Request
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Approval
  status VARCHAR(20) DEFAULT 'pending',            -- 'pending', 'approved', 'denied', 'expired'
  decided_by UUID REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  decision_reason TEXT,
  
  INDEX idx_approvals_pending (status, expires_at) WHERE status = 'pending'
);
```

---

## Policy Engine

### Evaluation Flow

```
┌─────────────────────────────────────────────────────────────┐
│  AGENT ACTION REQUEST                                       │
│  agent=brand-manager, user=john@amg.com                     │
│  action=sheets.write, resource=1gFBG_xxx, cell=F5          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  1. CHECK USER PERMISSIONS                                  │
│  Does john@amg.com have sheets.write on this resource?      │
│  → YES (org member with editor role)                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  2. CHECK AGENT DELEGATION                                  │
│  Has john delegated sheets.write to brand-manager?          │
│  → YES (delegation exists, not expired, not revoked)        │
│  → Check constraints: columns F-I allowed, F5 is valid      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  3. CHECK ORG POLICIES                                      │
│  Any deny policies? Any require_approval policies?          │
│  → No deny policies match                                   │
│  → No approval required                                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  4. CHECK RATE LIMITS                                       │
│  Is agent within rate limits for this resource type?        │
│  → YES (15 requests in last hour, limit is 100)             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  5. LOG & EXECUTE                                           │
│  Log the action, execute with scoped credentials            │
└─────────────────────────────────────────────────────────────┘
```

### Policy Evaluation Service

```typescript
interface PolicyDecision {
  allowed: boolean
  reason: string
  policyId?: string
  requiresApproval?: boolean
  approvalTimeout?: number
}

class PolicyEngine {
  async evaluate(request: ActionRequest): Promise<PolicyDecision> {
    const { agentId, userId, orgId, action, resourceType, resourceId, details } = request
    
    // 1. User permissions check
    const userPerms = await this.getUserPermissions(userId, orgId, resourceType, resourceId)
    if (!userPerms.includes(action)) {
      return { allowed: false, reason: 'User does not have this permission' }
    }
    
    // 2. Delegation check
    const delegation = await this.getDelegation(agentId, userId)
    if (!delegation || delegation.revoked_at || (delegation.expires_at && delegation.expires_at < new Date())) {
      return { allowed: false, reason: 'No valid delegation from user to agent' }
    }
    
    const delegatedPerm = this.findMatchingPermission(delegation.permissions, resourceType, resourceId, action)
    if (!delegatedPerm) {
      return { allowed: false, reason: 'Action not in delegation scope' }
    }
    
    // Check delegation constraints
    const constraintCheck = this.checkConstraints(delegatedPerm.constraints, details)
    if (!constraintCheck.valid) {
      return { allowed: false, reason: constraintCheck.reason }
    }
    
    // 3. Org policies check
    const policies = await this.getOrgPolicies(orgId, agentId, resourceType)
    for (const policy of policies.sort((a, b) => b.priority - a.priority)) {
      if (this.policyMatches(policy, resourceType, resourceId, action)) {
        if (policy.policy_type === 'deny') {
          return { allowed: false, reason: policy.description, policyId: policy.id }
        }
        if (policy.policy_type === 'require_approval') {
          return { 
            allowed: false, 
            requiresApproval: true, 
            reason: policy.description,
            policyId: policy.id,
            approvalTimeout: policy.constraints?.approval_timeout || 3600
          }
        }
      }
    }
    
    // 4. Rate limit check
    const rateLimitOk = await this.checkRateLimit(agentId, resourceType, delegatedPerm.constraints?.rateLimit)
    if (!rateLimitOk) {
      return { allowed: false, reason: 'Rate limit exceeded' }
    }
    
    // All checks passed
    return { allowed: true, reason: 'All policy checks passed' }
  }
}
```

---

## Credential Scoping

### Per-Agent Credentials

Instead of sharing org-level OAuth tokens, mint scoped credentials per agent:

```typescript
interface ScopedCredential {
  id: string
  agentId: string
  orgId: string
  
  // The actual credential (encrypted at rest)
  credentialType: 'oauth_token' | 'service_account' | 'api_key'
  credential: string
  
  // Scope limitations
  scopes: string[]              // OAuth scopes granted
  resourceRestrictions: {       // Additional restrictions
    spreadsheetIds?: string[]
    driveIds?: string[]
    calendarIds?: string[]
  }
  
  // Lifecycle
  expiresAt: Date
  lastUsedAt: Date
}
```

### Credential Flow

```
User connects Google account to Stellabot
          │
          ▼
Stellabot stores org-level OAuth refresh token
          │
          ▼
Admin creates Brand Manager agent
          │
          ▼
Admin configures agent permissions (sheets:read on specific sheet)
          │
          ▼
System mints scoped access token for agent
  - Only requested scopes
  - Only specified resources
  - Short-lived (1 hour)
  - Auto-refresh with audit log
          │
          ▼
Agent uses scoped token for API calls
  - Token itself is limited
  - Policy engine adds another check layer
```

---

## User Delegation UI

When a user first chats with an agent, they see:

```
┌─────────────────────────────────────────────────────────────┐
│  Brand Manager is requesting access                         │
│                                                             │
│  This agent wants to:                                       │
│  ☑ Read Brand Management Oversight spreadsheet              │
│  ☑ Update status columns (F, G, H, I) in weekly sheets      │
│  ☐ Send messages on your behalf                             │
│                                                             │
│  You can change these permissions anytime in Settings.      │
│                                                             │
│  [Grant Access]  [Customize]  [Deny]                        │
└─────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

```typescript
// Delegation management
POST   /api/delegations                    // Create delegation
GET    /api/delegations/:agentId           // Get my delegation to an agent
PUT    /api/delegations/:agentId           // Update delegation
DELETE /api/delegations/:agentId           // Revoke delegation

// Policy management (org admins only)
POST   /api/orgs/:orgId/policies           // Create policy
GET    /api/orgs/:orgId/policies           // List policies
PUT    /api/policies/:id                   // Update policy
DELETE /api/policies/:id                   // Delete policy

// Audit log
GET    /api/orgs/:orgId/audit-log          // Query audit log
GET    /api/agents/:agentId/audit-log      // Agent-specific log

// Approval workflow
GET    /api/approvals                      // List pending approvals
POST   /api/approvals/:id/approve          // Approve action
POST   /api/approvals/:id/deny             // Deny action

// Permission check (internal, used by execution layer)
POST   /api/internal/check-permission      // Policy engine evaluation
```

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Database schema (delegations, policies, audit log)
- [ ] Policy engine core (evaluation logic)
- [ ] Basic audit logging (all actions logged)
- [ ] Permission check middleware

### Phase 2: Delegation
- [ ] Delegation UI (grant/revoke)
- [ ] Delegation API endpoints
- [ ] Integration with agent chat startup

### Phase 3: Policies
- [ ] Policy management UI
- [ ] Default policies per agent type
- [ ] Policy templates for common patterns

### Phase 4: Approval Workflow
- [ ] Pending approval queue
- [ ] Approval notification (push/email)
- [ ] Approval UI
- [ ] Timeout handling

### Phase 5: Scoped Credentials
- [ ] Per-agent credential minting
- [ ] Credential rotation
- [ ] Scope enforcement at credential level

---

## Example: Brand Manager Configuration

```json
{
  "agent": "brand-manager",
  "defaultDelegation": {
    "permissions": [
      {
        "resourceType": "sheets",
        "resourceId": "1gFBG_IXRLr72CGa4mXEQXjX-CblesyalPDJ4WiQoexQ",
        "actions": ["read"]
      },
      {
        "resourceType": "sheets",
        "resourceId": "1gFBG_IXRLr72CGa4mXEQXjX-CblesyalPDJ4WiQoexQ",
        "actions": ["write"],
        "constraints": {
          "columns": ["F", "G", "H", "I"],
          "rows": "2:1000"
        }
      }
    ]
  },
  "orgPolicies": [
    {
      "policyType": "deny",
      "resourceType": "exec",
      "actions": ["*"],
      "description": "Brand Manager cannot execute shell commands"
    },
    {
      "policyType": "deny",
      "resourceType": "messaging",
      "actions": ["*"],
      "description": "Brand Manager cannot send external messages"
    },
    {
      "policyType": "require_approval",
      "resourceType": "sheets",
      "actions": ["delete"],
      "description": "Deleting sheet data requires approval"
    }
  ]
}
```

---

## Security Considerations

1. **Token Storage**: All credentials encrypted at rest (AES-256-GCM)
2. **Audit Immutability**: Audit log append-only, cannot be modified
3. **Delegation Revocation**: Immediate effect, cached tokens invalidated
4. **Policy Changes**: Logged and require admin role
5. **Rate Limiting**: Per-agent, per-resource, per-action
6. **Prompt Injection Defense**: Policy checks happen outside LLM context
