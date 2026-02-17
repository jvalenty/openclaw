# Self-Learning Architecture

**Created:** 2026-02-01
**Status:** Design
**Goal:** Establish protocols for agents to auto-improve context across the network

---

## The Problem

When an agent learns something, where should it go?

- **Too local:** Each agent re-learns the same lessons
- **Too global:** Personal preferences pollute shared context
- **No propagation:** Knowledge dies with the session

---

## Learning Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    GLOBAL (All Agents)                      │
│  Universal rules, patterns, best practices                  │
│  Example: "Never echo API keys in chat"                     │
│  Example: "Use trash instead of rm"                         │
└─────────────────────────────────────────────────────────────┘
                            ↑
┌─────────────────────────────────────────────────────────────┐
│                  ORGANIZATION (Org Agents)                  │
│  Org-specific knowledge, workflows, preferences             │
│  Example: "Production DB is on Replit, staging is local"   │
│  Example: "John prefers concise responses"                  │
└─────────────────────────────────────────────────────────────┘
                            ↑
┌─────────────────────────────────────────────────────────────┐
│                    AGENT (Individual)                       │
│  Agent personality, role-specific context                   │
│  Example: "I'm Stella, senior dev at killerapps.dev"       │
│  Example: "My primary channel is Telegram"                  │
└─────────────────────────────────────────────────────────────┘
                            ↑
┌─────────────────────────────────────────────────────────────┐
│                   SESSION (Ephemeral)                       │
│  Current conversation context, working memory               │
│  Dies when session ends unless extracted                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Classification Rules

When an agent learns something, classify it:

| Signal | Destination | Example |
|--------|-------------|---------|
| Security/safety rule | **Global** | "Never display credentials" |
| Universal best practice | **Global** | "Confirm before destructive ops" |
| Org workflow/tool | **Organization** | "Deploy via Replit agent" |
| User preference | **Organization** | "John likes direct answers" |
| Agent identity | **Agent Soul** | "I'm the DevOps specialist" |
| Role-specific knowledge | **Agent Soul** | "I manage the CI/CD pipeline" |
| Temporary context | **Session** | "Working on feature X" |

---

## Extraction Protocol

### 1. Passive Extraction (Agent-initiated)

Agent recognizes a learning moment and proposes extraction:

```
Agent thinks: "I just learned that echoing secrets is bad. 
This seems like a global rule, not just for me."

Agent action: POST /api/context/extract
{
  "content": "Never echo API keys, tokens, or credentials in chat messages",
  "classification": "global",
  "confidence": 0.9,
  "source": "lesson_learned",
  "sessionId": "abc123"
}
```

### 2. Active Extraction (User-triggered)

User says "Remember this" or "Add this as a rule":

```
User: "Remember: always ask before running migrations on prod"

Agent: Classifies as org-level (specific to our workflow)
       Saves to org context docs
       Confirms: "Added to organization knowledge"
```

### 3. Periodic Review (Heartbeat)

During heartbeats, agent reviews session learnings and promotes worthy ones:

```
Session learnings → Review → Promote to appropriate layer
```

---

## Propagation Protocol

### Global → All Agents

When a global rule is added:
1. Save to `global_context` table
2. Broadcast to all connected machines
3. Machines inject into all agent system prompts
4. Flag for human review (optional)

### Organization → Org Agents

When org knowledge is added:
1. Save to `context_docs` with `organizationId`
2. Notify machines running org's agents
3. Machines refresh context for affected agents

### Agent → Agent Soul

When agent-specific learning:
1. Update agent's `modelConfig.systemPrompt` or dedicated memory
2. Sync to machine via existing machine-sync protocol

---

## API Endpoints

```
POST /api/context/extract
  - content: string
  - classification: 'global' | 'organization' | 'agent' | 'session'
  - confidence: number (0-1)
  - source: 'lesson_learned' | 'user_instruction' | 'error_correction'
  - agentId: string
  - sessionId?: string

GET /api/context/global
  - Returns all global rules/patterns

GET /api/context/org/:orgId
  - Returns org-level context

POST /api/context/review
  - For human review of proposed global rules
  - approve/reject/modify
```

---

## Extraction Strategy

**AGGRESSIVE** — Extract everything potentially useful, trim in review sessions.

Agents should proactively extract:
- Lessons learned (mistakes, corrections)
- User preferences (formatting, tone, workflow)
- Facts and knowledge (technical details, relationships)
- Rules and constraints (what to do/not do)
- Decisions made (why we chose X over Y)

Human review sessions periodically trim/promote/demote as needed.

---

## Vector-Indexed Memory

Agents need access to their full conversation history, not just recent context.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT MEMORY SYSTEM                      │
│                                                             │
│  ┌─────────────────┐    ┌─────────────────────────────┐   │
│  │  Recent Context │    │     Vector Index            │   │
│  │  (last N msgs)  │    │  (all historical sessions)  │   │
│  │                 │    │                             │   │
│  │  Always in      │    │  Query: "What did we       │   │
│  │  system prompt  │    │  decide about X?"          │   │
│  └─────────────────┘    └─────────────────────────────┘   │
│           │                         │                      │
│           └────────┬────────────────┘                      │
│                    ▼                                       │
│           ┌─────────────────┐                             │
│           │  Agent Context  │                             │
│           │  (combined)     │                             │
│           └─────────────────┘                             │
└─────────────────────────────────────────────────────────────┘
```

### How It Works

1. **Every message** gets embedded and stored in vector DB
2. **Before responding**, agent can query: "What's relevant to this?"
3. **Retrieved context** injected alongside recent messages
4. **Extractions** also vectorized for semantic search

### Implementation

```
POST /api/agents/:agentId/memory/embed
  - Embed and store message/extraction

GET /api/agents/:agentId/memory/query
  - query: string (semantic search)
  - limit: number
  - Returns relevant chunks from history

GET /api/agents/:agentId/memory/recent
  - limit: number
  - Returns recent messages (non-vector, just chronological)
```

### Vector Store Options

1. **Cloudflare Vectorize** — Native to Workers, low latency
2. **Postgres pgvector** — Keep everything in one DB
3. **Pinecone/Weaviate** — Dedicated vector DB (overkill initially)

Recommend: **pgvector** for simplicity, migrate to Vectorize if we need scale.

---

## Examples

### Example 1: Security Lesson

```
Situation: Agent accidentally echoes API key
Learning: "Never display credentials in chat"
Classification: GLOBAL (security rule, applies to all)
Action: 
  1. Save to global_context
  2. Flag for human review
  3. On approval, propagate to all agents
```

### Example 2: User Preference

```
Situation: User says "I prefer bullet points over paragraphs"
Learning: "User prefers bullet point formatting"
Classification: ORGANIZATION (user preference)
Action:
  1. Save to org context docs
  2. Sync to all org agents
```

### Example 3: Agent Role

```
Situation: Agent assigned to handle DevOps
Learning: "I'm responsible for CI/CD and deployments"
Classification: AGENT (role-specific)
Action:
  1. Update agent Soul
  2. Sync to machine
```

---

## Implementation Plan

### Phase 1: Classification Engine
- [ ] Build classifier (rule-based initially, ML later)
- [ ] Add extraction endpoint
- [ ] Store extractions with classification

### Phase 2: Propagation
- [ ] Global context table + sync
- [ ] Org context integration (already have context_docs)
- [ ] Agent Soul updates via machine-sync

### Phase 3: Review System
- [ ] Admin UI for reviewing proposed global rules
- [ ] Approval workflow
- [ ] Audit trail

### Phase 4: Auto-learning
- [ ] Agents proactively extract learnings
- [ ] Heartbeat review of session context
- [ ] Confidence scoring improvements

---

## Open Questions

1. **Review bottleneck**: If agents extract lots of learnings, human review becomes a bottleneck. Solution: Start with high thresholds, relax over time as we build trust.

2. **Conflicts**: What if two agents extract contradictory rules? Solution: Timestamp + source tracking, human resolution for conflicts.

3. **Forgetting**: How do we deprecate outdated learnings? Solution: Staleness scores, periodic review prompts.

---

## Related

- `docs/MULTI-AGENT-ARCHITECTURE.md` - How agents run
- `docs/MACHINE-SYNC-SYSTEM.md` - How configs sync
- `server/routes/agent-context.ts` - Current context API
