# Agent SOP & Progressive Heartbeat System

**Status:** Draft  
**Author:** Stella  
**Date:** 2026-02-21  
**Priority:** High

## Overview

This spec defines a system-level approach to agent work management. Instead of relying on chat context (which gets buried, lost, and bloats context windows), agents operate through structured systems: **TaskBoard** for work queues and **Planner** for calendar-centric visibility.

**Core principle:** Work lives in the system, not in chat.

---

## 1. Agent Work Model

### 1.1 The Three Pillars

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   TASK QUEUE    │    │    PLANNER      │    │  DAILY ENTRY    │
│   (TaskBoard)   │    │   (Calendar)    │    │  (Live Feed)    │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ • Work items    │    │ • Scheduled     │    │ • Completed ✓   │
│ • Priority      │───►│ • Promises      │───►│ • Costs $       │
│ • Assignment    │    │ • Deadlines     │    │ • On deck       │
│ • Status        │    │ • Recurring     │    │ • Notes         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 1.2 Flow

1. **User request** → Creates task in queue
2. **Agent promise** → Creates planner entry
3. **Work completed** → Updates daily entry (live)
4. **Heartbeat** → Checks queue, works top priority

---

## 2. Progressive Heartbeat

### 2.1 Activity-Based Intervals

| Session State | Condition | Interval | Model | Behavior |
|---------------|-----------|----------|-------|----------|
| `tracking` | Active followup pending | 1 min | haiku | Chatty progress updates |
| `active` | Message < 5 min ago | 2 min | haiku | Ready, silent unless alert |
| `idle` | 5-30 min since message | 15 min | haiku | Light check |
| `dormant` | > 30 min | 60 min | haiku | Minimal, or paused |
| `sleeping` | Night hours / paused | — | — | No heartbeat |

### 2.2 Heartbeat Behavior

```typescript
async function executeHeartbeat(agent: Agent, session: Session) {
  // 1. Determine session state
  const state = getSessionState(session);
  
  // 2. Load work context
  const tasks = await getAgentTasks(agent.id, { 
    status: ['pending', 'in_progress'],
    limit: 5,
    orderBy: 'priority'
  });
  
  const todayEntries = await getPlannerEntries(agent.id, { date: today() });
  const pendingFollowups = todayEntries.filter(e => e.type === 'followup' && !e.completedAt);
  
  // 3. Execute based on state
  if (pendingFollowups.length > 0) {
    // Tracking mode: check and report
    for (const followup of pendingFollowups) {
      const result = await checkFollowupStatus(followup);
      await reportProgress(session, followup, result);
      
      if (result.complete) {
        await completeFollowup(followup, result);
        await updateDailyEntry(agent.id, {
          type: 'completion',
          title: followup.title,
          result: result.summary,
          cost: result.tokenCost
        });
      }
    }
  } else if (tasks.length > 0 && state !== 'dormant') {
    // Work mode: process top task
    const topTask = tasks[0];
    if (topTask.status === 'pending') {
      await startTask(topTask);
    }
    // Actual work happens in agent loop
  } else {
    // Nothing to do
    return 'HEARTBEAT_OK';
  }
}
```

### 2.3 User Controls

Users can:
- **Pause/Resume** monitoring for an agent
- **View scheduled followups** and cancel them
- **Set heartbeat budget** (max tokens/day for heartbeats)
- **Configure quiet hours** (no heartbeats 11pm-8am)

---

## 3. Agent Work Context Injection

### 3.1 Context Block

Injected into every agent interaction:

```markdown
## Your Work Queue
1. [HIGH] Fix auth bug - due today, in_progress
2. [MED] Review PR #42 - pending
3. [LOW] Update docs - blocked on #1

## Today's Schedule
• 2:00 PM - Check deployment status (followup)
• 4:00 PM - Weekly sync prep

## Today's Progress (live)
✓ 9:30 AM - Database migration ($0.02)
✓ 10:15 AM - Code review for PR #38 ($0.05)

## On Deck Tomorrow
• Feature X implementation
• Client call prep
```

### 3.2 Implementation

```typescript
// In soft-agent-chat.ts, add to buildSystemPrompt()

async function getAgentWorkContext(agentId: string, orgId: string): Promise<string> {
  const parts: string[] = [];
  
  // 1. Task Queue (from TaskBoard)
  const tasks = await db.select()
    .from(boardTasks)
    .innerJoin(lists, eq(boardTasks.listId, lists.id))
    .innerJoin(boards, eq(lists.boardId, boards.id))
    .where(and(
      eq(boards.orgId, orgId),
      eq(boardTasks.assignedToBot, agentId), // or agent name
      inArray(boardTasks.status, ['pending', 'in_progress', 'blocked'])
    ))
    .orderBy(desc(boardTasks.priority), asc(boardTasks.createdAt))
    .limit(5);
  
  if (tasks.length > 0) {
    parts.push('## Your Work Queue');
    for (const task of tasks) {
      const priority = task.priority?.toUpperCase() || 'MED';
      const due = task.dueDate ? ` - due ${formatDate(task.dueDate)}` : '';
      parts.push(`${tasks.indexOf(task) + 1}. [${priority}] ${task.title}${due}, ${task.status}`);
    }
    parts.push('');
  }
  
  // 2. Today's Planner Entries
  const today = new Date().toISOString().split('T')[0];
  const entries = await db.select()
    .from(plannerEntries)
    .innerJoin(planners, eq(plannerEntries.plannerId, planners.id))
    .where(and(
      eq(planners.orgId, orgId),
      eq(plannerEntries.assignedToAgentId, agentId),
      eq(plannerEntries.date, today),
      isNull(plannerEntries.completedAt)
    ))
    .orderBy(asc(plannerEntries.time));
  
  if (entries.length > 0) {
    parts.push("## Today's Schedule");
    for (const entry of entries) {
      const time = entry.time ? formatTime(entry.time) : 'TBD';
      const type = entry.type === 'followup' ? '(followup)' : '';
      parts.push(`• ${time} - ${entry.title} ${type}`);
    }
    parts.push('');
  }
  
  // 3. Today's Progress (from daily entry)
  const dailyEntry = await getDailyEntry(agentId, today);
  if (dailyEntry?.completions?.length > 0) {
    parts.push("## Today's Progress");
    for (const c of dailyEntry.completions) {
      const cost = c.cost ? ` ($${(c.cost / 100).toFixed(2)})` : '';
      parts.push(`✓ ${c.time} - ${c.title}${cost}`);
    }
    parts.push('');
  }
  
  // 4. Tomorrow Preview
  const tomorrow = addDays(new Date(), 1).toISOString().split('T')[0];
  const tomorrowEntries = await getPlannerEntries(agentId, tomorrow);
  if (tomorrowEntries.length > 0) {
    parts.push('## On Deck Tomorrow');
    for (const entry of tomorrowEntries.slice(0, 3)) {
      parts.push(`• ${entry.title}`);
    }
  }
  
  return parts.join('\n');
}
```

---

## 4. Daily Entry (Live Updates)

### 4.1 Schema Addition

Add to `plannerEntries` or create dedicated table:

```typescript
// Option A: Use existing plannerEntries with structured fields
// fields: {
//   completions: [
//     { time: "9:30 AM", title: "Database migration", cost: 2, taskId: "..." },
//     { time: "10:15 AM", title: "Code review", cost: 5 }
//   ],
//   totalCost: 7,
//   notes: ["Deployment needed 3 retries"]
// }

// Option B: Dedicated daily_summaries table
export const dailySummaries = pgTable("daily_summaries", {
  id: varchar("id").primaryKey(),
  agentId: varchar("agent_id").references(() => agents.id).notNull(),
  orgId: varchar("org_id").references(() => organizations.id).notNull(),
  date: date("date").notNull(),
  
  // Live-updated completions
  completions: jsonb("completions").$type<Completion[]>().default([]),
  
  // Aggregates
  totalCostCents: integer("total_cost_cents").default(0),
  taskCount: integer("task_count").default(0),
  
  // Notes and insights
  notes: jsonb("notes").$type<string[]>().default([]),
  blockers: jsonb("blockers").$type<string[]>().default([]),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

interface Completion {
  time: string;        // "9:30 AM"
  title: string;       // "Database migration"
  taskId?: string;     // Link to board_tasks
  entryId?: string;    // Link to planner_entries
  costCents: number;   // Token cost in cents
  summary?: string;    // Brief result
}
```

### 4.2 Live Update Function

```typescript
async function updateDailyEntry(
  agentId: string, 
  orgId: string,
  completion: {
    title: string;
    taskId?: string;
    entryId?: string;
    costCents: number;
    summary?: string;
  }
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const time = new Date().toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
  
  // Upsert daily entry
  const existing = await db.select()
    .from(dailySummaries)
    .where(and(
      eq(dailySummaries.agentId, agentId),
      eq(dailySummaries.date, today)
    ))
    .limit(1);
  
  const newCompletion: Completion = {
    time,
    title: completion.title,
    taskId: completion.taskId,
    entryId: completion.entryId,
    costCents: completion.costCents,
    summary: completion.summary
  };
  
  if (existing.length > 0) {
    // Update existing
    const entry = existing[0];
    await db.update(dailySummaries)
      .set({
        completions: [...(entry.completions || []), newCompletion],
        totalCostCents: (entry.totalCostCents || 0) + completion.costCents,
        taskCount: (entry.taskCount || 0) + 1,
        updatedAt: new Date()
      })
      .where(eq(dailySummaries.id, entry.id));
  } else {
    // Create new
    await db.insert(dailySummaries).values({
      id: crypto.randomUUID(),
      agentId,
      orgId,
      date: today,
      completions: [newCompletion],
      totalCostCents: completion.costCents,
      taskCount: 1
    });
  }
}
```

### 4.3 Integration Points

Call `updateDailyEntry()` when:
- Agent completes a task (`task_complete` tool)
- Agent finishes a followup check
- Agent completes a planner entry
- Significant work milestone (agent discretion)

---

## 5. Agent Tools

### 5.1 Task Management

```typescript
const TASK_CREATE_TOOL = {
  name: 'task_create',
  description: `Create a new task in your work queue. Use for any work item that needs tracking.`,
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title' },
      description: { type: 'string', description: 'Details (optional)' },
      priority: { 
        type: 'string', 
        enum: ['low', 'medium', 'high', 'urgent'],
        description: 'Task priority (default: medium)'
      },
      dueDate: { type: 'string', description: 'ISO date string (optional)' },
      boardId: { type: 'string', description: 'Board ID (uses default if not specified)' }
    },
    required: ['title']
  }
};

const TASK_COMPLETE_TOOL = {
  name: 'task_complete',
  description: `Mark a task as completed. Updates daily entry with accomplishment.`,
  input_schema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'Task ID' },
      summary: { type: 'string', description: 'Brief completion summary' },
      notes: { type: 'string', description: 'Additional notes (optional)' }
    },
    required: ['taskId']
  }
};

const TASK_UPDATE_TOOL = {
  name: 'task_update',
  description: `Update task status, priority, or add notes.`,
  input_schema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'Task ID' },
      status: { 
        type: 'string', 
        enum: ['pending', 'in_progress', 'blocked', 'completed']
      },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
      notes: { type: 'string', description: 'Add to task notes' },
      blockedReason: { type: 'string', description: 'If blocked, why?' }
    },
    required: ['taskId']
  }
};
```

### 5.2 Scheduling

```typescript
const SCHEDULE_FOLLOWUP_TOOL = {
  name: 'schedule_followup',
  description: `Schedule a followup check. Creates a planner entry and triggers heartbeat at that time.
Use when you promise to check on something later.`,
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'What to follow up on' },
      delayMinutes: { type: 'number', description: 'Minutes from now (default: 10)' },
      context: { type: 'string', description: 'Context to remember for followup' },
      notifyUser: { 
        type: 'boolean', 
        description: 'Send progress updates to user (default: true)' 
      }
    },
    required: ['title']
  }
};

const SCHEDULE_TASK_TOOL = {
  name: 'schedule_task',
  description: `Schedule a task for a specific date/time. Adds to planner.`,
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title' },
      date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
      time: { type: 'string', description: 'Time (HH:MM) optional' },
      description: { type: 'string', description: 'Details' },
      recurring: {
        type: 'object',
        properties: {
          frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
          interval: { type: 'number' },
          endDate: { type: 'string' }
        }
      }
    },
    required: ['title', 'date']
  }
};

const GET_MY_TASKS_TOOL = {
  name: 'get_my_tasks',
  description: `Get your current task queue and today's schedule.`,
  input_schema: {
    type: 'object',
    properties: {
      includeCompleted: { type: 'boolean', description: 'Include today\'s completed (default: false)' },
      limit: { type: 'number', description: 'Max tasks (default: 10)' }
    }
  }
};
```

---

## 6. Base Agent Prompt Additions

### 6.1 Memory Protocol

```markdown
## Memory Protocol
You have persistent memory via tools:
- `memory_save` - Store important information (facts, decisions, preferences, lessons)
- `memory_recall` - Search your memories

**When to save:**
- User preferences and patterns
- Decisions made and reasoning
- Lessons from mistakes
- Important facts about systems/people
- Rules or constraints to follow

**Save immediately** — don't rely on "mental notes" which are lost between sessions.
```

### 6.2 Work Protocol

```markdown
## Work Protocol
Your work is managed through the Task Queue and Planner — not buried in chat.

**Task Queue:** Your prioritized work list
- New work items → create task (`task_create`)
- Starting work → update status (`task_update` to 'in_progress')
- Finished → complete with summary (`task_complete`)

**Planner:** Your calendar
- Scheduled work → appears here
- Promises ("I'll check in 10 min") → `schedule_followup`
- Your completed work for today updates live

**On heartbeat:** Check your queue, work the top priority item.

**Daily Entry:** Every completion updates today's entry with timestamp and cost.
User can always see what you accomplished and what it cost.
```

### 6.3 Heartbeat Protocol

```markdown
## Heartbeat Protocol
You receive periodic heartbeats based on activity:
- Tracking something → every 1 min (report progress)
- Active conversation → every 2 min (ready)
- Idle → every 15 min (light check)
- Dormant → every 60 min or paused

**On heartbeat:**
1. Check your task queue
2. Check pending followups
3. If followup ready → check and report progress
4. If task ready → work on it
5. If nothing → reply HEARTBEAT_OK

**Progress updates:** When tracking a promise, give brief updates:
- "⏳ Checking deployment... still in progress"
- "📊 Build at 80%, should be done shortly"  
- "✅ Done! [result]"
```

---

## 7. UI Enhancements

### 7.1 Agent Activity View

New tab/panel in TaskBoard and Planner showing:
- **Live feed:** Agent completions as they happen
- **Today's cost:** Running total
- **Active task:** What agent is working on now
- **Pending followups:** Scheduled checks

### 7.2 Daily Summary View

In Planner, auto-generated daily entry:
- Expandable completion list
- Cost breakdown
- Notes/blockers
- "On deck tomorrow" preview

### 7.3 Agent Controls

Per-agent settings:
- Heartbeat enabled/paused
- Quiet hours (no heartbeats)
- Daily cost budget (alert/pause at threshold)
- Notification preferences

---

## 8. Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Create `daily_summaries` table (migration)
- [ ] Implement `getAgentWorkContext()` injection
- [ ] Implement `updateDailyEntry()` function
- [ ] Add base prompt sections (memory, work, heartbeat protocols)

### Phase 2: Agent Tools (Week 1-2)
- [ ] Implement task_create, task_update, task_complete
- [ ] Implement schedule_followup, schedule_task
- [ ] Implement get_my_tasks
- [ ] Integrate tools into soft-agent-chat.ts

### Phase 3: Progressive Heartbeat (Week 2)
- [ ] Session state tracking (tracking/active/idle/dormant)
- [ ] Adaptive interval scheduler
- [ ] Followup execution on heartbeat
- [ ] Cost tracking per heartbeat

### Phase 4: UI (Week 3)
- [ ] Agent activity feed component
- [ ] Daily summary view in Planner
- [ ] Agent controls panel
- [ ] Cost dashboard

---

## 9. Success Metrics

| Metric | Target |
|--------|--------|
| Chat context reduction | 50% fewer tokens in long sessions |
| Task completion visibility | 100% of work tracked in system |
| Promise fulfillment | 95% of scheduled followups executed |
| User satisfaction | "I always know what agent is doing" |
| Cost transparency | Per-task cost visible in daily entry |

---

## 10. Design Decisions

1. **Default board per agent:** YES — each agent gets an auto-created personal board on first task creation. Keeps work isolated and organized.

2. **Cross-agent visibility:** YES, queryable — agents owned by same user can query each other's tasks via tool (`get_agent_tasks(agentId)`), but NOT injected into context. Avoids noise while enabling coordination when needed.

3. **Task approval:** DYNAMIC — three modes:
   - **Per-task:** User approves each task before agent works on it
   - **Batch:** User says "do them all" — agent works through queue autonomously  
   - **Priority override:** User can reorder/reprioritize at any time
   
   Default: Agent proposes priority, awaits approval for first task, then continues unless interrupted.

4. **Followup extraction:** EXPLICIT ONLY — use `schedule_followup` tool. No NLP extraction (too fragile, creates phantom tasks).

---

## 11. Schema: Agent Board Auto-Creation

```typescript
// On first task_create, if agent has no board:
async function ensureAgentBoard(agentId: string, orgId: string): Promise<string> {
  const existing = await db.select()
    .from(boards)
    .where(and(
      eq(boards.orgId, orgId),
      eq(boards.ownerId, agentId), // Agent owns the board
      eq(boards.status, 'active')
    ))
    .limit(1);
  
  if (existing.length > 0) return existing[0].id;
  
  // Create default board with standard lists
  const boardId = crypto.randomUUID();
  await db.insert(boards).values({
    id: boardId,
    name: `${agent.name}'s Tasks`,
    orgId,
    ownerId: agentId,
    isShared: true, // Visible to user
    status: 'active'
  });
  
  // Create default lists
  const lists = ['Inbox', 'In Progress', 'Blocked', 'Done'];
  for (let i = 0; i < lists.length; i++) {
    await db.insert(lists).values({
      id: crypto.randomUUID(),
      boardId,
      name: lists[i],
      position: i
    });
  }
  
  return boardId;
}
```

---

## 12. Task Approval Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    TASK APPROVAL MODES                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  MODE 1: Per-Task Approval (default for new agents)         │
│  ─────────────────────────────────────────────────          │
│  Agent: "I have 3 tasks queued:                             │
│          1. [HIGH] Fix auth bug                             │
│          2. [MED] Review PR                                 │
│          3. [LOW] Update docs                               │
│          Ready to start #1?"                                │
│  User: "Yes" → Agent works on #1                            │
│  User: "Do #2 first" → Agent reorders, works on #2          │
│                                                              │
│  MODE 2: Batch Approval                                      │
│  ─────────────────────────                                  │
│  User: "Do them all" or "Work through the queue"            │
│  Agent: Works autonomously, reports completions             │
│  User can interrupt: "Pause" / "Skip #3" / "Reprioritize"   │
│                                                              │
│  MODE 3: Standing Approval (trusted agents)                  │
│  ─────────────────────────────────────────                  │
│  Agent setting: autoApprove = true                          │
│  Agent works queue without asking                           │
│  Still reports completions to daily entry                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Approval State in Agent Config

```typescript
// In agents.modelConfig or new agent_settings table
interface AgentWorkSettings {
  // Task approval mode
  approvalMode: 'per_task' | 'batch' | 'auto';
  
  // If batch/auto, max tasks before checking in
  maxTasksBeforeCheckin: number; // default: 5
  
  // Cost threshold requiring approval
  costApprovalThreshold: number; // cents, e.g., 100 = $1
  
  // Can work during quiet hours
  allowQuietHours: boolean;
}
```
