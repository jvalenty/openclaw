# Memory System Plan

## Current State (2026-02-08)

### What's Working

| Component | Location | Status |
|-----------|----------|--------|
| Soul/Personality | `agents.modelConfig.systemPrompt` | ✅ Loads into context |
| Knowledge Base | `knowledge` table | ✅ Loads into context |
| Skills | `skills` table | ✅ Loads into context |
| User Context | Session user info | ✅ Injected into prompt |
| Chat History | `chat_sessions` + `chat_messages` | ✅ Persisted |

### Knowledge Table Structure

```sql
CREATE TABLE knowledge (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  scope VARCHAR,           -- 'system', 'org', 'agent'
  org_id VARCHAR,
  agent_id VARCHAR,
  session_id VARCHAR,
  type VARCHAR,            -- 'fact', 'rule', 'profile', 'preference', etc.
  key VARCHAR,
  title VARCHAR,
  content TEXT,
  content_type VARCHAR,
  file_ref VARCHAR,
  source VARCHAR,
  source_ref VARCHAR,
  confidence FLOAT,
  tags TEXT[],
  priority INTEGER,
  active BOOLEAN,
  reviewed BOOLEAN,
  approved BOOLEAN,
  expires_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  created_by VARCHAR
);
```

### Current Contents (57 entries)

| Type | Count | Example |
|------|-------|---------|
| schema | 40 | Database table documentation |
| rule | 7 | Business rules |
| reference | 5 | Reference documents |
| knowledge | 2 | General facts |
| preference | 1 | User preferences |
| profile | 1 | Stella's IDENTITY.md |
| workflow | 1 | Process definitions |

### Context Loading (buildSystemPrompt)

```sql
SELECT key, title, content 
FROM knowledge 
WHERE active = TRUE 
  AND approved = TRUE
  AND (
    scope = 'system'
    OR (scope = 'org' AND org_id = $orgId)
    OR (scope = 'agent' AND agent_id = $agentId)
  )
ORDER BY priority DESC
LIMIT 10
```

---

## What's Missing

### 1. Memory Write Tools
Agents cannot save learnings back to `knowledge` table.

### 2. Lesson Extraction
No automatic extraction of facts/decisions from conversations.

### 3. Memory Search
No semantic search - only loads top 10 by priority.

### 4. Daily Logs
No equivalent to Hard Stella's `memory/YYYY-MM-DD.md` files.

### 5. Long-term Memory Curation
No review/consolidation process for extracted memories.

---

## Implementation Plan

### Phase 1: Memory Tools (Priority: HIGH)

Add two tools for soft agents:

#### memory_save
```typescript
const MEMORY_SAVE_TOOL: Anthropic.Tool = {
  name: 'memory_save',
  description: `Save a piece of information to your memory for future reference.
Use this to remember:
- Important facts learned during conversation
- Decisions made and their reasoning
- User preferences and patterns
- Lessons learned from mistakes
- Rules or constraints to follow`,
  input_schema: {
    type: 'object',
    properties: {
      type: { 
        type: 'string', 
        enum: ['fact', 'decision', 'lesson', 'preference', 'rule', 'note'],
        description: 'Category of memory'
      },
      title: { 
        type: 'string', 
        description: 'Brief title (max 100 chars)' 
      },
      content: { 
        type: 'string', 
        description: 'Full content to remember' 
      },
      importance: {
        type: 'string',
        enum: ['low', 'normal', 'high', 'critical'],
        description: 'How important is this? Default: normal'
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tags for categorization'
      },
      expires_days: {
        type: 'number',
        description: 'Optional: auto-expire after N days'
      }
    },
    required: ['type', 'title', 'content']
  }
};
```

**Implementation:**
```typescript
case 'memory_save': {
  const { type, title, content, importance, tags, expires_days } = input;
  
  const [entry] = await db.insert(knowledge).values({
    scope: 'agent',
    agentId: ctx.agentId,
    orgId: ctx.orgId,
    type: type,
    title: title,
    content: content,
    priority: importance === 'critical' ? 100 : 
              importance === 'high' ? 75 :
              importance === 'normal' ? 50 : 25,
    tags: tags || [],
    active: true,
    approved: true,  // Auto-approve agent's own memories
    createdBy: ctx.agentId,
    expiresAt: expires_days ? addDays(new Date(), expires_days) : null,
  }).returning();
  
  return `Memory saved: ${entry.id}`;
}
```

#### memory_recall
```typescript
const MEMORY_RECALL_TOOL: Anthropic.Tool = {
  name: 'memory_recall',
  description: `Search your memories for relevant information.
Use this when you need to recall:
- Previous decisions or their context
- User preferences you've learned
- Facts from past conversations
- Rules or guidelines to follow`,
  input_schema: {
    type: 'object',
    properties: {
      query: { 
        type: 'string', 
        description: 'What are you trying to remember?' 
      },
      type: {
        type: 'string',
        enum: ['fact', 'decision', 'lesson', 'preference', 'rule', 'note'],
        description: 'Optional: filter by type'
      },
      limit: {
        type: 'number',
        description: 'Max results (default 5, max 20)'
      }
    },
    required: ['query']
  }
};
```

**Implementation (Basic - text search):**
```typescript
case 'memory_recall': {
  const { query, type, limit = 5 } = input;
  const maxLimit = Math.min(limit, 20);
  
  let whereClause = and(
    eq(knowledge.agentId, ctx.agentId),
    eq(knowledge.active, true),
    or(
      ilike(knowledge.title, `%${query}%`),
      ilike(knowledge.content, `%${query}%`)
    )
  );
  
  if (type) {
    whereClause = and(whereClause, eq(knowledge.type, type));
  }
  
  const memories = await db.select({
    type: knowledge.type,
    title: knowledge.title,
    content: knowledge.content,
    createdAt: knowledge.createdAt,
  })
  .from(knowledge)
  .where(whereClause)
  .orderBy(desc(knowledge.priority), desc(knowledge.createdAt))
  .limit(maxLimit);
  
  if (memories.length === 0) {
    return 'No matching memories found.';
  }
  
  return memories.map(m => 
    `[${m.type}] ${m.title}\n${m.content}\n(Saved: ${m.createdAt})`
  ).join('\n\n---\n\n');
}
```

### Phase 2: Semantic Search (Priority: MEDIUM)

Add vector embeddings for better recall:

1. Add embedding column to knowledge table
2. On insert/update, generate embedding via OpenAI/Voyage
3. Use pgvector for similarity search
4. Replace text search with vector similarity

```sql
ALTER TABLE knowledge ADD COLUMN embedding vector(1536);
CREATE INDEX idx_knowledge_embedding ON knowledge 
  USING ivfflat (embedding vector_cosine_ops);
```

### Phase 3: Auto-Extraction (Priority: MEDIUM)

After each conversation, extract learnings:

```typescript
async function extractMemories(
  agentId: string, 
  messages: Message[]
): Promise<void> {
  const prompt = `Review this conversation and extract any important information worth remembering:

${messages.map(m => `${m.role}: ${m.content}`).join('\n')}

For each piece of information, provide:
- type: fact | decision | lesson | preference | rule
- title: brief summary
- content: full detail
- importance: low | normal | high | critical

Return as JSON array. Only include genuinely important/useful information.`;

  const response = await claude.messages.create({
    model: 'claude-3-5-haiku-20241022',  // Fast/cheap for extraction
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1000,
  });
  
  // Parse and save extracted memories
  // Mark as active=true but approved=false for review
}
```

### Phase 4: Memory Curation UI (Priority: LOW)

Build UI for reviewing/managing memories:
- View all memories by agent/org
- Approve/reject auto-extracted memories
- Edit/consolidate memories
- Set expiration dates
- Bulk operations

---

## Permission Model

Add new permission for memory tools:

```sql
INSERT INTO agent_actions (agent_id, action, enabled)
VALUES 
  ('agent-id', 'memory.read', true),   -- Can recall memories
  ('agent-id', 'memory.write', true);  -- Can save memories
```

**Permission mapping:**
```typescript
const TOOL_TO_PERMISSION = {
  // ... existing
  'memory_save': 'memory.write',
  'memory_recall': 'memory.read',
};
```

---

## Migration Path

### For Existing Hard Agents (like me)
My memories live in files (`MEMORY.md`, `memory/*.md`). To sync:

1. Parse existing memory files
2. Import into `knowledge` table with appropriate types
3. Keep files as source of truth until confident in DB

### For New Soft Agents
Start fresh with DB-only memory from day one.

---

## Open Questions

1. **Deduplication:** How to handle duplicate/similar memories?
2. **Context budget:** How much memory to load into context?
3. **Memory decay:** Should old memories lose priority over time?
4. **Cross-agent sharing:** When should memories be org-scoped vs agent-scoped?
5. **Conflict resolution:** What if extracted memory contradicts existing?

---

## Success Metrics

- Agents can save and recall memories
- Memory improves over time (fewer repeated mistakes)
- Context stays relevant (semantic search works)
- No memory loss across sessions
