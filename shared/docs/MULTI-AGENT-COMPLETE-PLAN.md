# Multi-Agent Complete Implementation Plan

**Created:** 2026-02-01 00:15 PST
**Status:** Building tonight
**Goal:** Get multi-agent + self-learning working end-to-end

---

## What We Have

### Clawdbot (already built)
- ✅ Multi-agent support (`agents.list[]` + `bindings[]`)
- ✅ Per-agent workspaces, sessions, auth
- ✅ Vector-indexed memory (hybrid BM25 + semantic)
- ✅ Auto-compaction with memory flush
- ✅ Session memory search (experimental)
- ✅ Per-agent sandbox and tool restrictions

### Stellabot (already built)
- ✅ Agent CRUD (`/api/agents`)
- ✅ Agent context docs (assign docs to agents)
- ✅ Channel routing to agents (`/api/agents/:id/chat`)
- ✅ Machine management + WebSocket sync
- ✅ Context extraction API

---

## What We Need to Build

### 1. Multi-Agent Clawdbot Config
Create workspaces and config for each agent on Mac Mini.

### 2. Shared Knowledge Layer
Global rules that propagate to all agents.

### 3. Aggressive Self-Learning
Agents proactively extract learnings to appropriate layer.

### 4. Stellabot → Clawdbot Sync
Push agent Souls/configs from Stellabot to Clawdbot format.

---

## Implementation

### Phase 1: Agent Workspaces (Tonight)

Create workspace structure for agents:

```
~/clawd/                    # Main workspace (Stella)
~/clawd/agents/
  ├── paul/                 # Paul's workspace
  │   ├── SOUL.md
  │   ├── MEMORY.md
  │   ├── memory/
  │   └── AGENTS.md
  ├── jarvis/               # Jarvis's workspace
  │   ├── SOUL.md
  │   ├── MEMORY.md
  │   ├── memory/
  │   └── AGENTS.md
  └── shared/               # Shared knowledge (all agents can read)
      ├── GLOBAL_RULES.md   # Universal rules
      ├── ORG_CONTEXT.md    # Org-specific knowledge
      └── memory/           # Shared learnings
```

### Phase 2: Clawdbot Config (Tonight)

Update `~/.clawdbot/clawdbot.json`:

```json5
{
  agents: {
    list: [
      {
        id: "stella",
        name: "Stella",
        default: true,
        workspace: "~/clawd",
        model: "anthropic/claude-opus-4-5-20251101"
      },
      {
        id: "paul",
        name: "Paul",
        workspace: "~/clawd/agents/paul",
        model: "anthropic/claude-sonnet-4-5-20250514"
      },
      {
        id: "jarvis",
        name: "Jarvis",
        workspace: "~/clawd/agents/jarvis",
        model: "anthropic/claude-sonnet-4-5-20250514"
      }
    ]
  },
  bindings: [
    // Stellabot routes via API, so bindings are for direct channel access
    { agentId: "stella", match: { channel: "telegram" } }
  ]
}
```

### Phase 3: Shared Knowledge API (Tonight)

Create endpoints in Stellabot:

```
POST /api/context/shared/global
  - Add global rule (propagates to all agents)
  
POST /api/context/shared/org/:orgId
  - Add org-level knowledge
  
GET /api/context/shared/global
  - Get all global rules (for injection into prompts)
```

Storage: New table `shared_knowledge`:
```sql
CREATE TABLE shared_knowledge (
  id SERIAL PRIMARY KEY,
  level VARCHAR(20) NOT NULL, -- 'global', 'organization', 'agent'
  organization_id VARCHAR,
  agent_id VARCHAR,
  content TEXT NOT NULL,
  source VARCHAR(50), -- 'lesson_learned', 'user_instruction', 'error_correction'
  confidence FLOAT DEFAULT 0.9,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR, -- agent or user who extracted it
  reviewed BOOLEAN DEFAULT FALSE,
  approved BOOLEAN DEFAULT NULL
);
```

### Phase 4: Self-Learning Extraction (Tonight)

Add to agent system prompts:

```markdown
## Self-Learning Protocol

You aggressively extract learnings. When you learn something:

1. **Classify it:**
   - GLOBAL: Security rules, universal patterns (e.g., "Never echo secrets")
   - ORG: Workflow, user preferences (e.g., "John prefers concise")
   - AGENT: Role-specific (e.g., "I handle CI/CD")
   - SESSION: Temporary context (default, no action needed)

2. **Extract it:**
   - Write to `~/clawd/agents/shared/GLOBAL_RULES.md` for global
   - Write to your `MEMORY.md` for agent-specific
   - Call extraction API for org-level: POST /api/context/extract

3. **Be aggressive:**
   - Extract anything potentially useful
   - Humans will trim in review sessions
   - When in doubt, extract it
```

### Phase 5: Memory Query Integration (Tonight)

Ensure agents can query their vector-indexed memory:
- `memory_search` tool already exists in Clawdbot
- Agents should use it before responding when context might help
- Add to system prompt: "Query your memory for relevant past context"

---

## File Changes Required

### Stellabot

1. **New migration:** `013_shared_knowledge.sql`
2. **New route:** `server/routes/shared-knowledge.ts`
3. **Update agent-chat:** Include shared knowledge in context
4. **Update machine-sync:** Push agent configs to Clawdbot format

### Clawdbot Config

1. **Update:** `~/.clawdbot/clawdbot.json` with agent list
2. **Create:** Agent workspaces with SOUL.md files
3. **Create:** Shared knowledge directory

### Agent Workspaces

1. **Create:** `~/clawd/agents/shared/GLOBAL_RULES.md`
2. **Create:** `~/clawd/agents/paul/` structure
3. **Create:** `~/clawd/agents/jarvis/` structure

---

## Testing Plan

1. **Local test:** Send message to Paul via Stellabot API
2. **Verify:** Paul responds with his Soul personality
3. **Test learning:** Have Paul learn something, verify it persists
4. **Test global:** Add global rule, verify all agents see it
5. **Test memory:** Query past conversations via memory_search

---

## Success Criteria

- [ ] Multiple agents running on single Clawdbot instance
- [ ] Each agent has isolated memory and personality
- [ ] Agents can access shared global knowledge
- [ ] Agents aggressively extract learnings
- [ ] Vector search works across agent memory
- [ ] Stellabot can route to any agent

---

## Tonight's Commits

1. Shared knowledge schema + API
2. Agent workspace setup
3. Clawdbot multi-agent config
4. Self-learning system prompt additions
5. Integration testing notes

---

## Morning Review Checklist

For John:
- [ ] Review shared_knowledge table design
- [ ] Review Clawdbot config
- [ ] Test agent routing
- [ ] Deploy Stellabot changes
- [ ] Run migration 013
