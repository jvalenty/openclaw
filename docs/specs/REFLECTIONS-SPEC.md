# Reflections: Post-Chat Self-Learning

## Overview

**Reflections** is an automatic post-conversation extraction system that enables soft agents to learn and improve over time. After each meaningful conversation, the system analyzes the exchange and extracts learnings, preferences, facts, and corrections to persist in the knowledge table.

## The Problem

Hard agents (Clawdbot) naturally persist learnings because they update files like `MEMORY.md` and daily logs. Soft agents forget everything between sessions — they only know what's in their system prompt and knowledge table at conversation start.

**Without Reflections:**
- User corrects agent → agent forgets by next session
- Agent learns user preference → gone
- Important decision made → no record
- Mistake identified → will repeat it

**With Reflections:**
- Corrections become permanent knowledge
- Preferences accumulate over time
- Decisions are documented
- Mistakes become learning rules

## Design

### Trigger

Reflections runs **after conversation completion**, defined as:
- WebSocket disconnects with no reconnect within 60 seconds
- Explicit session end (user navigates away)
- Inactivity timeout (configurable, default 5 minutes)
- Manual trigger via API

### Extraction Categories

| Category | Example | Storage |
|----------|---------|---------|
| **Correction** | "No, I meant the OTHER spreadsheet" | `knowledge` (agent scope, type: correction) |
| **Preference** | "I prefer bullet points over tables" | `knowledge` (agent scope, type: preference) |
| **Fact** | "The deploy key is in 1Password" | `knowledge` (org scope, type: fact) |
| **Decision** | "We decided to use R2 for file storage" | `knowledge` (org scope, type: decision) |
| **Rule** | "Never deploy on Fridays" | `knowledge` (org scope, type: rule) |
| **Lesson** | "The API rate limits at 100 req/min" | `knowledge` (agent scope, type: lesson) |

### Extraction Prompt

```
You just completed a conversation. Review it and extract any learnings worth persisting.

For each extraction, categorize it:
- CORRECTION: User corrected a mistake or misunderstanding
- PREFERENCE: User expressed how they like things done
- FACT: New information about systems, people, or processes
- DECISION: A choice was made that should be remembered
- RULE: A constraint or policy to follow
- LESSON: Something learned from an error or discovery

Return JSON array:
[
  {
    "category": "preference",
    "title": "Brief title",
    "content": "Full context of the learning",
    "scope": "agent" | "org" | "user",
    "confidence": 0.0-1.0,
    "source_message_ids": ["msg_123", "msg_456"]
  }
]

If nothing worth extracting, return empty array [].

Be selective — only extract things that would be valuable to remember in future conversations. Don't extract obvious things or restate what's already in the agent's knowledge.
```

### Scope Rules

| Scope | When to use | Who sees it |
|-------|-------------|-------------|
| `agent` | Specific to this agent's behavior | Only this agent |
| `org` | Applies to anyone in the organization | All agents in org |
| `user` | Specific to this user's preferences | Agents talking to this user |

### Deduplication

Before saving, check for existing knowledge with similar content:
1. Query knowledge table for same scope + similar title
2. If >80% semantic similarity, update existing instead of creating new
3. Track `source_ref` to link back to conversation

### Confidence & Review

- Extractions with confidence < 0.7 are marked `approved: false`
- Admin can review pending extractions in Knowledge UI
- High-confidence extractions (≥0.9) auto-approve
- User can flag incorrect extractions for removal

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Conversation                         │
│                         │                               │
│                         ▼                               │
│              [Session Complete]                         │
│                         │                               │
│                         ▼                               │
│              ┌──────────────────┐                       │
│              │ Reflection Queue │                       │
│              └────────┬─────────┘                       │
│                       │                                 │
│                       ▼                                 │
│     ┌─────────────────────────────────────┐            │
│     │      Reflection Worker              │            │
│     │  1. Load conversation messages      │            │
│     │  2. Load agent's current knowledge  │            │
│     │  3. Call extraction LLM             │            │
│     │  4. Dedupe against existing         │            │
│     │  5. Save to knowledge table         │            │
│     └─────────────────────────────────────┘            │
│                       │                                 │
│                       ▼                                 │
│              ┌──────────────────┐                       │
│              │ Knowledge Table  │                       │
│              └──────────────────┘                       │
└─────────────────────────────────────────────────────────┘
```

## API

### Trigger Reflection (Manual)

```
POST /api/reflections/extract
{
  "sessionId": "uuid",
  "agentId": "uuid"
}
```

### Get Pending Reflections

```
GET /api/reflections/pending?orgId=xxx
```

### Approve/Reject Reflection

```
POST /api/reflections/:id/approve
POST /api/reflections/:id/reject
```

### Reflection History

```
GET /api/reflections?agentId=xxx&limit=50
```

## Database

Uses existing `knowledge` table with additional fields:

```sql
-- Already exists, just use these fields:
-- source = 'reflection'
-- source_ref = session_id
-- confidence = extraction confidence
-- approved = auto-approved or pending review
```

New table for tracking:

```sql
CREATE TABLE reflection_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR NOT NULL,
  agent_id VARCHAR NOT NULL,
  org_id VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'pending', -- pending, processing, completed, failed
  message_count INTEGER,
  extraction_count INTEGER DEFAULT 0,
  model VARCHAR,
  tokens_used INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Configuration

Per-agent settings in `modelConfig`:

```json
{
  "reflections": {
    "enabled": true,
    "autoApproveThreshold": 0.9,
    "minConversationLength": 4,
    "excludeCategories": [],
    "model": "claude-sonnet-4-20250514"
  }
}
```

Per-org settings:

```json
{
  "reflections": {
    "enabled": true,
    "requireApproval": false,
    "notifyOnExtraction": true
  }
}
```

## Implementation Plan

### Phase 1: Core Extraction (4 hrs)
- [ ] Create `reflection_runs` table + migration
- [ ] Build extraction service with LLM call
- [ ] Add `/api/reflections/extract` endpoint
- [ ] Wire up session completion trigger

### Phase 2: Knowledge Integration (2 hrs)
- [ ] Deduplication logic
- [ ] Confidence-based auto-approval
- [ ] Link extractions to source messages

### Phase 3: Admin UI (3 hrs)
- [ ] Pending reflections review page
- [ ] Approve/reject actions
- [ ] Reflection history per agent
- [ ] Toggle in agent settings

### Phase 4: Polish (2 hrs)
- [ ] Batch processing for multiple sessions
- [ ] Rate limiting (don't extract every tiny conversation)
- [ ] Metrics/analytics on extraction quality

## Success Criteria

1. After a conversation where user corrects agent, the correction appears in agent's knowledge
2. Preferences expressed accumulate and affect future behavior
3. Admin can review and manage extracted knowledge
4. No duplicate extractions for same learning
5. Extractions are traceable back to source conversation

## Open Questions

1. **Extraction model:** Use same model as agent, or always use a specific model (Haiku for cost)?
2. **User visibility:** Should users see what was extracted from their conversations?
3. **Cross-agent sharing:** If Stella learns something, should Dan know it too? (Org scope handles this, but worth considering)
4. **Retention:** Should reflections expire? Or persist forever?

---

*Spec: 2026-02-12 | Author: Stella*
