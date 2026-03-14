# Self-Learning System Design

## Overview

Agents can extract knowledge from interactions and propose additions to the knowledge base. This creates a feedback loop where the system gets smarter over time.

## Extraction Types

### 1. Rules (Security, Workflow)
**Trigger:** Agent makes a mistake or learns a constraint
**Example:** "Never echo API keys in chat"
**Scope:** Usually `system` (needs review) or `org`
**Priority:** High (90-100)

### 2. Learnings (Mistakes, Corrections)
**Trigger:** Human corrects agent behavior
**Example:** "Use `wouter` not `react-router-dom`"
**Scope:** `org` or `agent`
**Priority:** Medium (70-80)

### 3. Facts (Technical Details)
**Trigger:** Agent discovers important information
**Example:** "Table is `orgs` not `organizations`"
**Scope:** `system` (schema) or `org`
**Priority:** Medium (50-70)

### 4. Preferences (User Style)
**Trigger:** User expresses preference
**Example:** "John prefers concise responses"
**Scope:** `org` or `agent`
**Priority:** Medium (60-80)

### 5. Workflows (Processes)
**Trigger:** Agent learns a multi-step process
**Example:** "Deploy: commit → push → tell John → he deploys"
**Scope:** `org`
**Priority:** High (80-90)

## Extraction Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     INTERACTION                              │
│                                                              │
│  User: "No! Never echo credentials!"                        │
│  Agent: "Got it, I'll remember that."                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   RECOGNITION                                │
│                                                              │
│  Agent identifies: "This is a rule I should remember"       │
│  Classification: type=rule, scope=system, priority=100      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   EXTRACTION                                 │
│                                                              │
│  POST /api/kb {                                             │
│    scope: "system",                                         │
│    type: "rule",                                            │
│    key: "security-no-credentials",                          │
│    title: "Never Echo Credentials",                         │
│    content: "DO NOT print API keys, tokens...",            │
│    source: "agent",                                         │
│    source_ref: "session:abc123",                           │
│    confidence: 0.95                                         │
│  }                                                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   REVIEW (if needed)                         │
│                                                              │
│  System-scope → approved=false, needs human review          │
│  Agent-scope → approved=true, immediately active            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   AVAILABLE                                  │
│                                                              │
│  GET /api/kb/resolve?agent_id=xxx                           │
│  → Returns new knowledge in next query                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Agent Integration

### Clawdbot AGENTS.md Protocol

```markdown
## Self-Learning Protocol

**Be aggressive** — extract anything potentially useful.

### What to Extract
- Lessons learned (mistakes, corrections, realizations)
- User preferences (formatting, tone, workflow)
- Facts and knowledge (technical details, relationships)
- Rules and constraints (what to do/not do)
- Decisions made (why we chose X over Y)

### How to Extract
1. **Recognize the moment** — "I just learned something worth keeping"
2. **Classify it** — System? Org? Agent?
3. **POST to /api/kb** — Or call the knowledge tool
4. **Don't overthink** — When in doubt, extract it
```

### Extraction API

```javascript
// Agent extracts a learning
POST /api/agents/:agentId/context/extract
{
  content: "Use wouter, not react-router-dom",
  type: "learning",
  scope: "org",
  title: "Stellabot uses wouter for routing",
  confidence: 0.9,
  source: "agent"
}
```

## Confidence Scoring

| Confidence | Meaning |
|------------|---------|
| 1.0 | Explicitly stated by human |
| 0.9 | Strongly implied, agent is confident |
| 0.7 | Inferred from context |
| 0.5 | Uncertain, may need verification |

Lower confidence entries can be weighted less or flagged for review.

## Deduplication

Before creating new knowledge, check for duplicates:
- Same `key` in same `scope/type`
- Similar `content` (future: semantic similarity)

If duplicate found:
- Update `confidence` if new is higher
- Update `updated_at`
- Don't create new entry

## Review UI

Admin can review pending system-scope knowledge:

```
┌─────────────────────────────────────────────────────────────┐
│ Pending Review (3)                                          │
├─────────────────────────────────────────────────────────────┤
│ ☐ "Never echo credentials"                                  │
│   Type: rule | Source: stella | Confidence: 0.95           │
│   [Approve] [Reject] [Edit]                                 │
├─────────────────────────────────────────────────────────────┤
│ ☐ "Use trash instead of rm"                                 │
│   Type: rule | Source: stella | Confidence: 0.85           │
│   [Approve] [Reject] [Edit]                                 │
└─────────────────────────────────────────────────────────────┘
```

## Future: Active Learning

1. **Knowledge Gaps** — Detect when agent lacks knowledge in an area
2. **Query Patterns** — Track what agents search for but don't find
3. **Reinforcement** — Increase confidence when knowledge is validated
4. **Decay** — Decrease confidence when knowledge contradicts observed behavior

## Implementation Checklist

- [x] Knowledge table with approval workflow
- [x] POST /api/kb for extraction
- [x] Agent context extraction endpoint (POST /api/agents/:id/context/extract)
- [x] Deduplication check (key + title matching, confidence comparison)
- [ ] Review UI in Stellabot (individual approve/reject/edit)
- [ ] Confidence decay over time
- [ ] Semantic similarity for dedup (embeddings)
- [ ] Active learning prompts
- [ ] Vector-indexed memory for agents
