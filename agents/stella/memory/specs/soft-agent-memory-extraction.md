# Soft Agent Memory Extraction

**Status:** Spec  
**Created:** 2026-02-08  
**Author:** Stella

## Overview

Automatic knowledge extraction for soft agents, triggered by token threshold rather than time-based cron. When a conversation reaches a token limit, extract key insights and persist them to RAG before compacting the conversation.

## Problem

Soft agents have no persistent memory between sessions. They rely on:
- Static system prompt
- Knowledge table (RAG)
- Conversation history (ephemeral)

Currently, any learnings from a conversation are lost unless manually saved.

## Solution

Token-threshold-triggered extraction that:
1. Monitors conversation token count
2. Triggers extraction at threshold (e.g., 80k tokens)
3. Extracts insights via Claude
4. Persists to knowledge table
5. Compacts conversation history
6. Continues seamlessly

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Message Handler                          │
│                                                             │
│  User Message → Agent Response → Token Check                │
│                                      │                      │
│                            tokens > threshold?              │
│                                      │                      │
│                                     YES                     │
│                                      ▼                      │
│                          ┌───────────────────┐              │
│                          │ Extraction Worker │ (async)      │
│                          └─────────┬─────────┘              │
│                                    │                        │
│                    ┌───────────────┼───────────────┐        │
│                    ▼               ▼               ▼        │
│              Extract         Update RAG      Compact        │
│              Insights        (knowledge)     History        │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. Token Tracking

Already have token counts for billing. Add threshold check after each turn:

```typescript
// In soft-agent-chat.ts after response
const totalTokens = session.inputTokens + session.outputTokens;
if (totalTokens >= EXTRACTION_THRESHOLD) {
  await triggerExtraction(session);
}
```

**Threshold options:**
- Conservative: 80k tokens (leaves room for extraction prompt)
- Aggressive: 100k tokens
- Configurable per-agent in `agents.modelConfig`

### 2. Extraction Prompt

```typescript
const EXTRACTION_PROMPT = `
Analyze this conversation and extract:

1. **Key Learnings** - Things the agent learned or should remember
2. **User Preferences** - How the user likes things done
3. **Decisions Made** - Important choices and their rationale
4. **Facts & Data** - Names, dates, file paths, URLs, credentials (NOT secrets)
5. **Corrections** - Mistakes made and how to avoid them
6. **Relationships** - People, projects, systems mentioned

Output as JSON:
{
  "insights": [
    {
      "type": "learning|preference|decision|fact|correction|relationship",
      "content": "...",
      "importance": "high|medium|low",
      "tags": ["tag1", "tag2"]
    }
  ]
}

Ignore:
- Routine back-and-forth
- Already-known information
- Temporary/ephemeral details
`;
```

### 3. Knowledge Table Updates

```typescript
interface KnowledgeEntry {
  id: string;
  agentId: string;
  content: string;
  type: 'learning' | 'preference' | 'decision' | 'fact' | 'correction' | 'relationship';
  importance: 'high' | 'medium' | 'low';
  tags: string[];
  sourceSessionId: string;
  extractedAt: Date;
  embedding?: number[]; // for vector search
}

// Upsert logic - dedupe by content similarity
async function upsertKnowledge(agentId: string, insights: Insight[]) {
  for (const insight of insights) {
    const existing = await findSimilar(agentId, insight.content);
    if (existing && similarity > 0.9) {
      // Update existing entry (maybe bump importance)
      await updateKnowledge(existing.id, insight);
    } else {
      // Insert new
      await insertKnowledge(agentId, insight);
    }
  }
}
```

### 4. Conversation Compaction

After extraction, compact the conversation:

```typescript
const COMPACTION_PROMPT = `
Summarize this conversation into a brief context paragraph.
Keep: current task state, open questions, important recent context.
Drop: resolved tangents, routine exchanges.
Max 500 words.
`;

async function compactConversation(session: Session) {
  const summary = await claude.complete(COMPACTION_PROMPT, session.messages);
  
  // Replace full history with summary + recent messages
  session.messages = [
    { role: 'system', content: `Previous conversation summary:\n${summary}` },
    ...session.messages.slice(-10) // keep last 10 exchanges
  ];
}
```

### 5. Deduplication Strategy

Problem: Same insight might be extracted multiple times across sessions.

Solutions:
- **Embedding similarity** - Skip if >90% similar to existing
- **Content hash** - Exact match detection
- **Merge logic** - Combine related insights, keep highest importance
- **Decay** - Old low-importance entries get pruned

### 6. Privacy Controls

Some conversations shouldn't persist:

```typescript
// Agent config option
modelConfig: {
  memoryExtraction: {
    enabled: true,
    threshold: 80000,
    excludePatterns: ['password', 'secret', 'credential'],
    requireConsent: false // or ask before extracting
  }
}
```

## Database Changes

```sql
-- Extend knowledge table (or create if not exists)
ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS type VARCHAR(50);
ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS importance VARCHAR(20) DEFAULT 'medium';
ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS source_session_id UUID;
ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ DEFAULT NOW();

-- Index for efficient retrieval
CREATE INDEX IF NOT EXISTS idx_knowledge_agent_type ON knowledge(agent_id, type);
CREATE INDEX IF NOT EXISTS idx_knowledge_importance ON knowledge(agent_id, importance);
```

## RAG Integration

When building agent context:

```typescript
async function buildAgentContext(agentId: string, query: string) {
  // Get relevant knowledge entries
  const knowledge = await searchKnowledge(agentId, query, {
    limit: 20,
    prioritize: ['high', 'medium'],
    types: ['preference', 'learning', 'fact'] // most relevant for context
  });
  
  // Format for system prompt
  return knowledge.map(k => `- [${k.type}] ${k.content}`).join('\n');
}
```

## Rollout Plan

1. **Phase 1:** Token tracking + threshold detection (no extraction yet)
2. **Phase 2:** Extraction prompt + logging (don't persist, just log what would be extracted)
3. **Phase 3:** Knowledge table persistence + deduplication
4. **Phase 4:** Conversation compaction
5. **Phase 5:** RAG integration + retrieval tuning

## Success Metrics

- Agents remember things across sessions without manual saving
- No important context lost after compaction
- Knowledge table doesn't explode (good deduplication)
- Extraction doesn't slow down conversations (async)

## Open Questions

1. Should extraction block the next response or run fully async?
2. How aggressive should compaction be? Keep last N messages or summarize everything?
3. Should users be able to see/edit their agent's extracted knowledge?
4. How to handle contradictions (user changed preference)?

## Task Breakdown

- [ ] Add token threshold check to soft-agent-chat.ts
- [ ] Create extraction prompt + Claude call
- [ ] Extend knowledge table schema
- [ ] Implement upsert with deduplication
- [ ] Build compaction logic
- [ ] Integrate extracted knowledge into RAG retrieval
- [ ] Add config options per-agent
- [ ] Admin UI to view/manage extracted knowledge
