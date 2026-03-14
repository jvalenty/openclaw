# Soft Agent Proactivity System

## Vision

Soft agents should feel as alive and capable as hard agents. They should:
- Remember context across sessions
- Proactively check on things without being asked
- Resume work after interruptions
- Surface relevant knowledge automatically
- Never "go dark" or lose track of conversations

## Current State (Reactive Only)

```
User sends message → Agent responds → Silence until next message
```

**Problems:**
- Agent forgets what it was doing between sessions
- No background monitoring or proactive work
- Context is thin unless user provides it
- Connection hiccups = lost state
- User must explicitly ask "do you remember X?"

## Target State (Proactive + Aware)

```
┌─────────────────────────────────────────────────────────────┐
│                    SOFT AGENT RUNTIME                       │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Message   │  │  Scheduled  │  │   Event Triggers    │ │
│  │   Handler   │  │   Tasks     │  │  (webhooks, etc.)   │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
│         │                │                     │            │
│         └────────────────┼─────────────────────┘            │
│                          ▼                                  │
│                 ┌─────────────────┐                         │
│                 │  Agent Context  │                         │
│                 │  ─────────────  │                         │
│                 │  • Active work  │                         │
│                 │  • Memory       │                         │
│                 │  • Checkpoints  │                         │
│                 └────────┬────────┘                         │
│                          ▼                                  │
│                 ┌─────────────────┐                         │
│                 │  Response Gen   │                         │
│                 │  + Smart Recall │                         │
│                 └────────┬────────┘                         │
│                          ▼                                  │
│                 ┌─────────────────┐                         │
│                 │    Delivery     │                         │
│                 │  (webchat/push) │                         │
│                 └─────────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Component 1: Smart Memory Recall

### Problem
Agent has knowledge in DB but doesn't search it unless explicitly asked.

### Solution
Before generating any response, automatically search knowledge for relevant context.

### Flow
```
1. User message arrives
2. Extract key topics/entities from message
3. Semantic search knowledge table (agent + org + system scope)
4. If relevant results found (score > threshold), inject into context
5. Generate response with enriched context
```

### Implementation
```typescript
async function enrichContext(message: string, agentId: string, orgId: string): Promise<string[]> {
  // Extract search terms from user message
  const searchTerms = extractKeyTerms(message);
  
  // Search knowledge table
  const results = await db.execute(sql`
    SELECT title, content, 
           ts_rank(search_vector, plainto_tsquery(${searchTerms})) as rank
    FROM knowledge
    WHERE active = TRUE
      AND (scope = 'system' OR org_id = ${orgId} OR agent_id = ${agentId})
      AND search_vector @@ plainto_tsquery(${searchTerms})
    ORDER BY rank DESC
    LIMIT 5
  `);
  
  // Return relevant snippets if score > threshold
  return results.rows
    .filter(r => r.rank > 0.1)
    .map(r => `[Memory: ${r.title}]\n${r.content}`);
}
```

### Trigger
- Every user message (lightweight search)
- Configurable per agent (can disable)

---

## Component 2: Active Work Tracking

### Problem
Agent loses track of what it was doing between messages or after connection issues.

### Solution
Persist "active work" state in database. Agent always knows its current task.

### Schema
```sql
CREATE TABLE agent_work_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR NOT NULL,
  user_id VARCHAR NOT NULL,
  session_id VARCHAR NOT NULL,
  
  -- Current state
  status VARCHAR DEFAULT 'idle', -- idle, working, blocked, waiting
  current_task TEXT,
  task_context JSONB DEFAULT '{}',
  
  -- Progress tracking
  checkpoints JSONB DEFAULT '[]', -- Array of {timestamp, description, data}
  last_checkpoint_at TIMESTAMPTZ,
  
  -- Metadata
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(agent_id, user_id)
);
```

### How It Works
```
1. Agent starts task → save to agent_work_state
2. Every significant step → add checkpoint
3. Connection drops → state preserved
4. User returns → agent loads state, resumes
5. Task complete → clear state
```

### Agent Prompt Addition
```
## Work Continuity

You have persistent work state. When starting significant work:
- Call work_start(task: "description") 
- Call work_checkpoint(note: "progress") at milestones
- Call work_complete() when done

If you see existing work state at conversation start, acknowledge it and offer to continue.
```

---

## Component 3: Scheduled Tasks (Soft Heartbeat)

### Problem
Soft agents can't do background work or proactive checks.

### Solution
Stellabot scheduler invokes agents on configured schedules.

### Schema
```sql
CREATE TABLE agent_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR NOT NULL,
  org_id VARCHAR NOT NULL,
  
  -- Schedule config
  name VARCHAR NOT NULL,
  cron_expression VARCHAR NOT NULL, -- "*/30 * * * *" = every 30 min
  task_prompt TEXT NOT NULL, -- What to tell the agent
  
  -- Targeting
  user_id VARCHAR, -- Specific user context, or NULL for org-wide
  
  -- State
  enabled BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  last_result JSONB,
  next_run_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Example Schedules
```json
[
  {
    "name": "Morning briefing",
    "cron": "0 9 * * 1-5",
    "prompt": "Check calendar for today, check priority emails, prepare briefing for user."
  },
  {
    "name": "Brand check",
    "cron": "0 */4 * * *",
    "prompt": "Check brand management spreadsheet for items needing attention today."
  },
  {
    "name": "Memory maintenance",
    "cron": "0 3 * * *",
    "prompt": "Review recent learnings, consolidate knowledge, clean up outdated facts."
  }
]
```

### Execution Flow
```
1. Scheduler checks agent_schedules every minute
2. For due tasks: invoke agent with task_prompt
3. Agent response → deliver to user (webchat notification, or queue)
4. Update last_run_at, next_run_at
```

### Delivery Options
- **Push to webchat** — if user is online
- **Queue** — store for next session
- **Push notification** — mobile/browser notification
- **Silent** — just execute, don't notify (background maintenance)

---

## Component 4: Event Triggers

### Problem
Agents can't react to external events (new email, calendar reminder, webhook).

### Solution
Event system that can wake agents.

### Schema
```sql
CREATE TABLE agent_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR NOT NULL,
  org_id VARCHAR NOT NULL,
  
  -- Trigger config
  event_type VARCHAR NOT NULL, -- 'email', 'calendar', 'webhook', 'mention'
  filter JSONB DEFAULT '{}', -- Event-specific filter criteria
  prompt_template TEXT NOT NULL, -- "New email from {sender}: {subject}"
  
  -- State
  enabled BOOLEAN DEFAULT TRUE,
  last_triggered_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Example Triggers
```json
[
  {
    "event_type": "email",
    "filter": {"from_contains": "@important-client.com"},
    "prompt": "Urgent email from {sender}: {subject}\n\n{preview}\n\nShould I draft a response?"
  },
  {
    "event_type": "calendar",
    "filter": {"minutes_before": 15},
    "prompt": "Upcoming meeting in 15 minutes: {title} with {attendees}. Any prep needed?"
  },
  {
    "event_type": "webhook",
    "filter": {"source": "github"},
    "prompt": "GitHub event: {event_type} on {repo}. {summary}"
  }
]
```

### Flow
```
1. External event arrives (email webhook, calendar poll, etc.)
2. Match against agent_triggers
3. For matches: format prompt, invoke agent
4. Deliver response to user
```

---

## Component 5: Session Resilience

### Problem
Network hiccups cause agent to "go dark" and lose context.

### Solution
Checkpoint-based recovery with automatic resume.

### How It Works
```
1. Every response, save checkpoint to session metadata
2. If connection drops mid-response:
   - Partial response saved
   - Work state preserved
3. User reconnects:
   - Load last checkpoint
   - Agent acknowledges interruption
   - Offers to continue or summarize
```

### Implementation
```typescript
// After each agent response
await db.execute(sql`
  UPDATE chat_sessions 
  SET metadata = jsonb_set(
    COALESCE(metadata, '{}'),
    '{last_checkpoint}',
    ${JSON.stringify({
      timestamp: new Date().toISOString(),
      lastMessageId: messageId,
      workState: currentWorkState,
      partialResponse: streamBuffer
    })}
  )
  WHERE id = ${sessionId}
`);
```

### Recovery Prompt
```
[System: Session recovered after interruption. Last checkpoint: {timestamp}]
[Last message was: "{truncated_content}..."]

Continue naturally from where you left off, or ask if user wants a summary.
```

---

## Implementation Priority

### Phase 1: Smart Memory Recall (2-3 hrs)
- Add knowledge search before response
- Inject relevant memories into context
- Test with reflections saved earlier

### Phase 2: Work State Tracking (3-4 hrs)
- Create agent_work_state table
- Add work_start/checkpoint/complete tools
- Update agent prompts
- Resume logic on session start

### Phase 3: Scheduled Tasks (4-5 hrs)
- Create agent_schedules table
- Build scheduler worker
- Admin UI to configure schedules
- Delivery system (push to webchat/queue)

### Phase 4: Event Triggers (4-5 hrs)
- Create agent_triggers table
- Hook into existing integrations (email, calendar)
- Webhook receiver for external events
- Trigger matching and execution

### Phase 5: Session Resilience (2-3 hrs)
- Checkpoint saving on each response
- Recovery detection on reconnect
- Resume prompt injection

---

## Success Metrics

1. **Memory Recall**: Agent correctly surfaces past learnings without being asked
2. **Work Continuity**: Task survives browser refresh, connection drop
3. **Proactive Value**: Scheduled tasks surface useful info before user asks
4. **Zero Dark**: No more "lost" conversations or agent going silent

---

## Open Questions

1. **Notification fatigue**: How aggressive should proactive messages be?
2. **Cost**: Each scheduled invocation = API tokens. Budget?
3. **Multi-agent coordination**: Can Dan's scheduled task notify Stella?
4. **User control**: How much can users configure their agent's proactivity?

---

*Spec: 2026-02-12 | Author: Stella*
