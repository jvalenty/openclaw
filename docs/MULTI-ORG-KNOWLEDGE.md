# Multi-Organization Knowledge Isolation

## Overview

Each organization has isolated knowledge that is only visible to agents belonging to that organization. System-scope knowledge is shared across all organizations.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SYSTEM SCOPE                              │
│                  (All Organizations)                         │
│                                                              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │   Security  │ │   Schema    │ │  Platform   │           │
│  │    Rules    │ │  Knowledge  │ │  Workflows  │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   Org: Acme     │ │   Org: Beta     │ │   Org: Gamma    │
│                 │ │                 │ │                 │
│ ┌─────────────┐ │ │ ┌─────────────┐ │ │ ┌─────────────┐ │
│ │  Workflows  │ │ │ │  Workflows  │ │ │ │  Workflows  │ │
│ └─────────────┘ │ │ └─────────────┘ │ │ └─────────────┘ │
│ ┌─────────────┐ │ │ ┌─────────────┐ │ │ ┌─────────────┐ │
│ │ Preferences │ │ │ │ Preferences │ │ │ │ Preferences │ │
│ └─────────────┘ │ │ └─────────────┘ │ │ └─────────────┘ │
│ ┌─────────────┐ │ │ ┌─────────────┐ │ │ ┌─────────────┐ │
│ │  Learnings  │ │ │ │  Learnings  │ │ │ │  Learnings  │ │
│ └─────────────┘ │ │ └─────────────┘ │ │ └─────────────┘ │
│                 │ │                 │ │                 │
│ ┌─────────────┐ │ │ ┌─────────────┐ │ │                 │
│ │Agent: Stella│ │ │ │Agent: Bob   │ │ │                 │
│ │  (agent-    │ │ │ │  (agent-    │ │ │                 │
│ │   scoped)   │ │ │ │   scoped)   │ │ │                 │
│ └─────────────┘ │ │ └─────────────┘ │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

## Access Rules

### Query Isolation

When an agent queries knowledge:

```sql
SELECT * FROM knowledge
WHERE active = TRUE AND approved = TRUE
AND (
  -- System knowledge (everyone gets this)
  scope = 'system'
  
  -- Org knowledge (only agents in this org)
  OR (scope = 'org' AND org_id = $agent_org_id)
  
  -- Agent knowledge (only this specific agent)
  OR (scope = 'agent' AND agent_id = $agent_id)
)
```

### Write Isolation

Agents can only write to appropriate scopes:

| Scope | Who Can Write | Approval |
|-------|---------------|----------|
| `system` | Any agent | Requires review |
| `org` | Agents in that org | Auto-approved |
| `agent` | Only that agent | Auto-approved |

### Enforcement

```javascript
// In POST /api/kb
if (scope === 'org' && org_id !== agent.organizationId) {
  return res.status(403).json({ 
    error: 'Cannot write to another org\'s knowledge' 
  });
}

if (scope === 'agent' && agent_id !== requestingAgentId) {
  return res.status(403).json({ 
    error: 'Cannot write to another agent\'s knowledge' 
  });
}
```

## Data Model

```sql
-- Example: Acme Corp has their own workflows
INSERT INTO knowledge (
  scope = 'org',
  org_id = 'acme-corp-id',
  type = 'workflow',
  key = 'deploy-process',
  title = 'Acme Deployment Process',
  content = '1. Run tests\n2. Create PR\n3. Get approval...'
);

-- This is invisible to Beta Inc agents
```

## Cross-Org Scenarios

### Shared Platform Knowledge
- Schema, security rules, platform capabilities
- All agents see these
- Scope: `system`

### Customer-Specific Workflows
- Each org has their own processes
- Invisible to other orgs
- Scope: `org`

### Agent Personalities
- Each agent has unique role/personality
- Even within same org, agent knowledge is private
- Scope: `agent`

## API Examples

### Agent Context Resolution

```javascript
// GET /api/kb/resolve?agent_id=stella&org_id=acme

// Returns:
{
  "grouped": {
    "system": [
      { key: "security-no-secrets", ... },
      { key: "platform-schema", ... }
    ],
    "org": [
      { key: "acme-deploy-process", ... },
      { key: "acme-preferences", ... }
    ],
    "agent": [
      { key: "stella-profile", ... }
    ]
  }
}
```

### Org Admin View

```javascript
// GET /api/kb?scope=org&org_id=acme

// Returns only Acme's org-scoped knowledge
{
  "entries": [
    { key: "acme-deploy-process", ... },
    { key: "acme-customer-rules", ... }
  ]
}
```

## Security Considerations

1. **Always filter by org_id** in queries
2. **Validate agent belongs to org** before allowing org-scope writes
3. **System scope requires review** to prevent abuse
4. **Audit trail** for all knowledge changes
5. **No cross-org references** in content (sanitize file_refs)

## Implementation Status

- [x] Scope field in knowledge table
- [x] org_id foreign key
- [x] Query filtering by scope
- [ ] Write validation (org membership check)
- [ ] Admin UI showing org knowledge
- [ ] Cross-org audit alerts
