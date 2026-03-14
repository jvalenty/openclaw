# Background Task System

## Problem

Agents break on long-running operations because:
1. Tool iteration limits (currently 10) cut off multi-step work
2. No checkpointing — progress lost on interruption
3. Synchronous execution — blocks the chat loop
4. No visibility into progress

## Solution: Agent Task Queue

### Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Agent     │────▶│  Task Queue  │────▶│   Worker    │
│   (chat)    │     │  (Postgres)  │     │  (process)  │
└─────────────┘     └──────────────┘     └─────────────┘
       │                   │                    │
       │                   ▼                    │
       │            ┌──────────────┐            │
       └───────────▶│   Status     │◀───────────┘
                    │   Updates    │
                    └──────────────┘
```

### Database Schema

```sql
CREATE TABLE agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id VARCHAR NOT NULL REFERENCES orgs(id),
  agent_id VARCHAR NOT NULL REFERENCES agents(id),
  session_id VARCHAR REFERENCES chat_sessions(id),
  
  -- Task definition
  task_type VARCHAR NOT NULL,  -- 'sheets_bulk_write', 'data_analysis', etc.
  input JSONB NOT NULL,        -- Task-specific parameters
  
  -- Execution state
  status VARCHAR NOT NULL DEFAULT 'pending',  -- pending, running, paused, completed, failed
  progress INTEGER DEFAULT 0,   -- 0-100
  progress_message TEXT,        -- "Writing rows 100-200 of 329..."
  
  -- Checkpointing
  checkpoint JSONB,             -- Task-specific state for resumption
  
  -- Results
  result JSONB,                 -- Final output
  error TEXT,                   -- Error message if failed
  
  -- Timing
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Limits
  timeout_seconds INTEGER DEFAULT 300,  -- 5 min default
  max_retries INTEGER DEFAULT 3,
  retry_count INTEGER DEFAULT 0
);

CREATE INDEX idx_agent_tasks_status ON agent_tasks(status) WHERE status IN ('pending', 'running');
CREATE INDEX idx_agent_tasks_agent ON agent_tasks(agent_id, status);
```

### Agent Tools

```typescript
// Start a background task
{
  name: 'task_start',
  description: 'Start a long-running background task. Returns task ID for tracking.',
  input_schema: {
    task_type: string,  // 'sheets_bulk_write', 'data_analysis', etc.
    input: object,      // Task-specific parameters
    notify_on_complete: boolean  // Send message when done (default true)
  }
}

// Check task status
{
  name: 'task_status',
  description: 'Check progress of a background task.',
  input_schema: {
    task_id: string
  }
}

// List active tasks
{
  name: 'task_list',
  description: 'List pending/running tasks for this agent.',
  input_schema: {}
}

// Cancel a task
{
  name: 'task_cancel',
  description: 'Cancel a pending or running task.',
  input_schema: {
    task_id: string
  }
}
```

### Task Types

#### sheets_bulk_write
Write large amounts of data to Google Sheets with checkpointing.

```typescript
interface SheetsBulkWriteInput {
  spreadsheet_id: string;
  sheet_name: string;
  headers: string[];
  rows: any[][];
  chunk_size?: number;  // Default 100
}

interface SheetsBulkWriteCheckpoint {
  rows_written: number;
  last_range: string;
}
```

#### data_analysis
Analyze large datasets in chunks with progress reporting.

```typescript
interface DataAnalysisInput {
  spreadsheet_id: string;
  range: string;
  analysis_type: 'search' | 'aggregate' | 'transform';
  parameters: object;
}
```

### Worker Process

The worker runs as a separate process (or scheduled job) that:
1. Polls for pending tasks
2. Executes tasks with checkpointing
3. Updates progress in real-time
4. Handles failures with retry logic
5. Notifies agent session on completion

```typescript
async function processTask(task: AgentTask) {
  await updateTaskStatus(task.id, 'running');
  
  try {
    const handler = taskHandlers[task.task_type];
    if (!handler) throw new Error(`Unknown task type: ${task.task_type}`);
    
    // Resume from checkpoint if exists
    let state = task.checkpoint || handler.initialState(task.input);
    
    while (!handler.isComplete(state)) {
      // Process one chunk
      state = await handler.processChunk(task.input, state);
      
      // Save checkpoint
      await saveCheckpoint(task.id, state);
      
      // Update progress
      const progress = handler.getProgress(state);
      await updateProgress(task.id, progress);
    }
    
    // Complete
    const result = handler.getResult(state);
    await completeTask(task.id, result);
    
    // Notify agent
    if (task.notify_on_complete) {
      await notifyAgent(task.agent_id, task.session_id, {
        type: 'task_complete',
        task_id: task.id,
        result
      });
    }
    
  } catch (error) {
    await failTask(task.id, error.message);
  }
}
```

### Agent Notification

When a task completes, the agent receives a system message in their session:

```
[System] Background task completed:
Task: sheets_bulk_write
Status: ✅ Success
Result: Wrote 329 rows to "Pain Related" tab
Duration: 12 seconds
```

This triggers the agent to acknowledge completion to the user.

### Implementation Phases

#### Phase 1: Core Infrastructure
- [ ] Create `agent_tasks` table
- [ ] Add task_start, task_status, task_list tools
- [ ] Basic worker loop (inline, not separate process)

#### Phase 2: Sheets Bulk Operations
- [ ] Implement sheets_bulk_write task handler
- [ ] Checkpointing for row batches
- [ ] Progress reporting

#### Phase 3: Robustness
- [ ] Separate worker process
- [ ] Retry logic with backoff
- [ ] Timeout handling
- [ ] Task cancellation

#### Phase 4: Extended Task Types
- [ ] Data analysis tasks
- [ ] File processing tasks
- [ ] Multi-step workflows

---

## Usage Example

**User:** "Create a Pain Related tab with all matching headlines"

**Agent:**
```
I found 329 pain-related headlines. Starting background task to write them to your sheet...

[Calls task_start with sheets_bulk_write]
```

**System (during execution):**
- Progress: 30% (100/329 rows written)
- Progress: 60% (200/329 rows written)
- Progress: 100% (329/329 rows written)

**System (on completion):**
```
[System] Background task completed:
Task: sheets_bulk_write
Status: ✅ Success
Result: Wrote 329 rows to "Pain Related" tab
```

**Agent:**
```
Done! I've added all 329 pain-related headlines to the "Pain Related" tab.
```
