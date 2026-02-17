# Knowledge System - Production Architecture

**Date:** 2026-02-01
**Status:** In Progress
**Author:** Stella

## Overview

The Knowledge System is Stellabot's unified metadata layer. It stores information ABOUT things, not the things themselves. Files remain in R2/file storage; knowledge references them.

## Core Principles

1. **One table, four scopes** — system > org > agent > session
2. **Files are separate** — knowledge contains metadata, files contain blobs
3. **Query by scope** — agents get knowledge by their scope, not by ID assignment
4. **Self-learning** — agents can extract and propose knowledge
5. **Review workflow** — system-scope knowledge requires approval

## Schema

```sql
knowledge (
  id VARCHAR PRIMARY KEY,
  scope VARCHAR(20),        -- system | org | agent | session
  org_id VARCHAR,           -- for org/agent scope
  agent_id VARCHAR,         -- for agent scope
  session_id VARCHAR,       -- for session scope
  type VARCHAR(50),         -- rule, learning, document, schema, workflow, etc.
  key VARCHAR(255),         -- unique identifier within scope/type
  title VARCHAR(500),
  content TEXT,
  source VARCHAR(50),       -- manual, agent, system, import
  confidence FLOAT,
  priority INT,
  approved BOOLEAN,
  reviewed BOOLEAN,
  active BOOLEAN,
  expires_at TIMESTAMPTZ,   -- for session-scoped
  created_at, updated_at
)
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/kb` | Query knowledge with filters |
| `GET /api/kb/:id` | Get single entry |
| `POST /api/kb` | Create entry |
| `PUT /api/kb/:id` | Update entry |
| `DELETE /api/kb/:id` | Soft delete |
| `POST /api/kb/upsert` | Create or update by key |
| `POST /api/kb/introspect` | Auto-populate schema from DB |
| `GET /api/kb/resolve?agent_id=x` | Get all knowledge for an agent |
| `GET /api/kb/stats` | Statistics |

## Scope Resolution

When an agent requests knowledge, they receive:
1. **System scope** — Global rules, schema, architecture
2. **Org scope** — Organization-specific workflows, preferences
3. **Agent scope** — Agent-specific learnings, role info
4. **Session scope** — Current task context (ephemeral)

```sql
WHERE (
  scope = 'system'
  OR (scope = 'org' AND org_id = $org_id)
  OR (scope = 'agent' AND agent_id = $agent_id)
  OR (scope = 'session' AND session_id = $session_id)
)
AND active = TRUE
AND approved = TRUE
```

## Self-Learning Pipeline

### Extraction Flow
```
Agent interaction
    ↓
Agent identifies learning
    ↓
POST /api/kb (or /agents/:id/context/extract)
    ↓
If scope=system → needs_review=true
If scope=agent → auto-approved
    ↓
Knowledge stored
    ↓
Available on next query
```

### What Gets Extracted
- **Rules** — Security patterns, workflow constraints
- **Learnings** — Mistakes, corrections, realizations
- **Facts** — Technical details, relationships
- **Preferences** — User preferences, formatting styles

### Review Workflow
System-scope knowledge requires human review:
1. Agent proposes knowledge with `scope=system`
2. Entry created with `approved=false, reviewed=false`
3. Human reviews via UI
4. Approve → `approved=true, reviewed=true`
5. Knowledge becomes available to all agents

## Multi-Org Isolation

Each organization has isolated knowledge:
- Org-scoped knowledge only visible to org's agents
- Agents can only write to their org's scope (or agent scope)
- System scope is read-only for agents (requires review to write)

```
System Knowledge (shared)
├── Security rules
├── Platform architecture
└── Global workflows

Org: Acme Corp
├── Acme workflows
├── Acme preferences
└── Acme domain knowledge

Org: Beta Inc
├── Beta workflows
└── Beta domain knowledge
```

## Project/Task Context

Tasks can have associated knowledge:
```sql
-- Knowledge entry for a project
INSERT INTO knowledge (
  scope = 'org',
  type = 'project',
  key = 'project:stellabot-kb',
  title = 'Stellabot Knowledge System Project',
  content = 'Current phase: Implementation...',
  org_id = $org_id
)
```

Agents working on a task can query:
```
GET /api/kb?type=project&key=project:stellabot-kb
```

## Machine Sync

Machines pull knowledge via agent config:
```
GET /api/agent-config/:agentId?includeContext=true
```

Response includes:
```json
{
  "config": {
    "context": {
      "docs": [...],
      "combined": "## Title\n\ncontent...",
      "totalTokens": 1500
    }
  }
}
```

### Machine-Agnostic Design
- MoltWorker (Cloudflare) and Mac Mini use same API
- Knowledge fetched on-demand, not synced to disk
- Session context can be ephemeral (TTL)

## Sync Points

1. **Agent startup** — Pull full context via `/resolve`
2. **Periodic sync** — Pull changes since last sync
3. **On extraction** — Push immediately, query on next interaction
4. **Session end** — Cleanup session-scoped knowledge

## Token Management

Each knowledge entry tracks estimated tokens:
```javascript
const tokenCount = Math.ceil(content.length / 4);
```

Agent config includes total:
```json
{
  "context": {
    "totalTokens": 3500
  }
}
```

Machines can filter by priority if context exceeds limits.

## Future Enhancements

1. **Vector embeddings** — Semantic search over knowledge
2. **Knowledge graph** — Relationships between entries
3. **Versioning** — Track changes, rollback
4. **Conflict resolution** — Handle concurrent edits
5. **Knowledge decay** — Reduce confidence over time without reinforcement

## Testing Checklist

- [x] Create knowledge entry (all scopes) — ✅ tested via API
- [x] Query with filters — ✅ `/api/kb?scope=system&type=rule` works
- [ ] Approve pending entries — needs deploy (approve-all endpoint ready)
- [x] Agent context resolution — ✅ `/api/agents/:id/context` returns 14 docs, 2151 tokens
- [x] Machine config with context — ✅ `/api/agent-config/:id` includes context
- [ ] Self-learning extraction — `/api/agents/:id/context/extract` ready, not tested
- [ ] Multi-org isolation — needs org-scoped entries to test
- [ ] Session knowledge TTL — needs session-scoped entries to test
- [ ] Introspect DB schema — needs deploy (SQL simplified)
- [ ] PUT boolean fix — needs deploy
