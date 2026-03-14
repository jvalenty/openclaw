# Conversational Agent Architecture

## The Problem

Current flow:
```
User sends msg1 → Agent processes → Agent responds
User sends msg2 → Agent processes → Agent responds (msg1 context lost)
User sends msg3 → Agent responds to stale context
```

This is **serial queue processing**. Messages stack up, agent responds one at a time, later messages lose context. It's nothing like real conversation.

## Ideal Flow

```
User sends msg1, msg2, msg3 (rapid fire)
         ↓
    [Batch Window: 1.5s]
         ↓
Conversational Agent sees all 3 as context block
         ↓
Quick response OR delegates to Work Agent
         ↓
While work runs: user can talk, interrupt, change direction
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         MESSAGE LAYER                           │
│  - Receives all user input (voice, text)                       │
│  - Batches rapid-fire messages (1.5s window)                   │
│  - Timestamps everything                                        │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CONVERSATIONAL AGENT                         │
│  Model: Haiku/Sonnet (fast, low latency)                       │
│  Max response time: <3 seconds                                  │
│                                                                 │
│  Responsibilities:                                              │
│  - Maintain conversation context                                │
│  - Quick acknowledgments ("Got it, working on that...")        │
│  - Dispatch work to Work Agents                                │
│  - Evaluate interrupts from new messages                        │
│  - Relay progress updates from workers                         │
└──────────┬──────────────────────────────────┬───────────────────┘
           │                                  │
           ▼                                  ▼
┌─────────────────────┐            ┌─────────────────────────────┐
│    WORK QUEUE       │            │    INTERRUPT EVALUATOR      │
│                     │            │                             │
│  Tasks waiting to   │◄───────────│  When new message arrives   │
│  be processed       │  CANCEL/   │  while work is running:     │
│                     │  MODIFY    │                             │
│  Priority levels:   │            │  - Does this change task?   │
│  - urgent           │            │  - Should we interrupt?     │
│  - normal           │            │  - Just acknowledge?        │
│  - background       │            │                             │
└──────────┬──────────┘            └─────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        WORK AGENTS                              │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Coding    │  │  Research   │  │   Tools     │             │
│  │   Agent     │  │   Agent     │  │   Agent     │             │
│  │  (Opus)     │  │  (Sonnet)   │  │  (Haiku)    │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┴────────────────┘                     │
│                          │                                      │
│                    Progress Stream                              │
│                          │                                      │
└──────────────────────────┼──────────────────────────────────────┘
                           │
                           ▼
                    Back to Conversational Agent
                           │
                           ▼
                        User
```

## Database Schema Changes

### New Tables

```sql
-- Work queue for async task dispatch
CREATE TABLE work_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id),
  
  -- Task definition
  task_type VARCHAR(50) NOT NULL, -- 'coding', 'research', 'tools', 'clawdbot'
  task_description TEXT NOT NULL,
  task_context JSONB, -- relevant conversation context
  
  -- Priority & scheduling
  priority VARCHAR(20) DEFAULT 'normal', -- 'urgent', 'normal', 'background'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'running', 'completed', 'cancelled', 'failed'
  progress INTEGER DEFAULT 0, -- 0-100
  progress_message TEXT,
  
  -- Result
  result TEXT,
  error TEXT,
  
  -- Interruption
  interrupt_requested BOOLEAN DEFAULT FALSE,
  interrupt_reason TEXT
);

-- Message batches for conversation continuity
CREATE TABLE message_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id),
  
  -- Batch contents
  messages JSONB NOT NULL, -- array of {content, timestamp, type}
  batch_opened_at TIMESTAMPTZ NOT NULL,
  batch_closed_at TIMESTAMPTZ,
  
  -- Processing
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  
  -- Context at batch time
  active_work_id UUID REFERENCES work_queue(id), -- work running when batch arrived
  
  CONSTRAINT messages_not_empty CHECK (jsonb_array_length(messages) > 0)
);

-- Conversation state (rolling context window)
CREATE TABLE conversation_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) UNIQUE,
  
  -- Rolling context (last N exchanges, summarized older)
  recent_context JSONB NOT NULL DEFAULT '[]', -- last 10-20 messages
  summarized_context TEXT, -- compressed older context
  
  -- Current state
  active_topic TEXT,
  pending_questions JSONB DEFAULT '[]',
  user_intent TEXT, -- inferred current goal
  
  -- Work awareness
  active_work_ids UUID[] DEFAULT '{}',
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX idx_work_queue_session ON work_queue(session_id, status);
CREATE INDEX idx_work_queue_pending ON work_queue(status, priority, created_at) WHERE status = 'pending';
CREATE INDEX idx_message_batches_session ON message_batches(session_id, processed);
```

## API Changes

### New Endpoints

```typescript
// Message intake (handles batching)
POST /api/chat/:sessionId/message
{
  content: string,
  type: 'text' | 'voice' | 'action'
}
// Returns immediately: { batchId, position }

// Get conversation state (for UI)
GET /api/chat/:sessionId/state
// Returns: { 
//   lastMessage, 
//   activeWork: [{id, type, progress, message}],
//   pendingBatches: number 
// }

// Work status stream (SSE)
GET /api/chat/:sessionId/work-stream
// Streams: { type: 'progress' | 'complete' | 'error', workId, data }

// Interrupt work
POST /api/chat/:sessionId/work/:workId/interrupt
{
  reason: string
}
```

### Modified Flow

```typescript
// server/services/conversation-loop.ts

export class ConversationLoop {
  private batchWindow = 1500; // ms
  private activeBatches = new Map<string, NodeJS.Timeout>();
  
  /**
   * Handle incoming message - adds to batch, doesn't process immediately
   */
  async receiveMessage(sessionId: string, content: string, type: string) {
    // Add to current batch or create new one
    const batch = await this.getOrCreateBatch(sessionId);
    await this.addToBatch(batch.id, { content, type, timestamp: Date.now() });
    
    // Reset batch window timer
    this.resetBatchTimer(sessionId, batch.id);
    
    // If work is running, evaluate interrupt
    const state = await this.getConversationState(sessionId);
    if (state.active_work_ids.length > 0) {
      await this.evaluateInterrupt(sessionId, content, state.active_work_ids);
    }
    
    return { batchId: batch.id };
  }
  
  /**
   * Called when batch window closes
   */
  private async processBatch(sessionId: string, batchId: string) {
    const batch = await this.closeBatch(batchId);
    const messages = batch.messages; // All messages in batch
    
    // Build context
    const state = await this.getConversationState(sessionId);
    const context = this.buildContext(state, messages);
    
    // Conversational agent evaluates
    const decision = await this.conversationalAgent.evaluate(context, messages);
    
    switch (decision.action) {
      case 'respond':
        // Quick response, no work needed
        await this.sendResponse(sessionId, decision.response);
        break;
        
      case 'delegate':
        // Dispatch to work agent
        const workId = await this.dispatchWork(sessionId, {
          type: decision.workType,
          description: decision.workDescription,
          context: decision.workContext,
          priority: decision.priority,
        });
        
        // Quick acknowledgment
        await this.sendResponse(sessionId, decision.acknowledgment);
        break;
        
      case 'clarify':
        // Need more info
        await this.sendResponse(sessionId, decision.question);
        break;
    }
    
    // Update conversation state
    await this.updateState(sessionId, messages, decision);
  }
  
  /**
   * Evaluate if new message should interrupt running work
   */
  private async evaluateInterrupt(
    sessionId: string, 
    newMessage: string, 
    activeWorkIds: string[]
  ) {
    const evaluation = await this.interruptEvaluator.evaluate({
      newMessage,
      activeWork: await this.getWorkDetails(activeWorkIds),
    });
    
    if (evaluation.shouldInterrupt) {
      for (const workId of evaluation.workToInterrupt) {
        await this.requestInterrupt(workId, evaluation.reason);
      }
    }
    
    // Always acknowledge if work is running
    if (evaluation.acknowledgment) {
      await this.sendResponse(sessionId, evaluation.acknowledgment);
    }
  }
}
```

## Conversational Agent Prompt

```typescript
const CONVERSATIONAL_AGENT_SYSTEM = `You are the conversational interface for a user interacting with AI agents.

Your job is to:
1. Understand what the user wants (even from fragmented/rapid messages)
2. Respond quickly and naturally
3. Delegate actual work to specialized agents
4. Keep the user informed about progress
5. Evaluate if new input should change ongoing work

You are NOT the one doing the work. You are the coordinator.

## Response Types

RESPOND: When you can answer directly (quick questions, acknowledgments, clarifications)
DELEGATE: When real work is needed (coding, research, file operations, etc.)
CLARIFY: When you need more information

## Delegation Format

When delegating, specify:
- workType: 'coding' | 'research' | 'tools' | 'clawdbot'
- workDescription: Clear task description with all context needed
- priority: 'urgent' | 'normal' | 'background'
- acknowledgment: Quick message to user ("On it, this'll take a minute...")

## Interrupt Evaluation

When user sends new message while work is running:
- Does this CHANGE what we're doing? → Interrupt
- Does this ADD to what we're doing? → Queue follow-up
- Is this just conversation? → Respond, let work continue

## Style

Be conversational, not robotic. Quick responses. Don't over-explain.
"Got it, working on that" > "I understand your request and will now process it"
`;
```

## Interrupt Evaluator Prompt

```typescript
const INTERRUPT_EVALUATOR_SYSTEM = `You evaluate if a new user message should interrupt ongoing work.

Given:
- newMessage: What the user just said
- activeWork: Array of {id, type, description, progress}

Decide:
- shouldInterrupt: boolean
- workToInterrupt: string[] (work IDs to stop)
- reason: Why interrupting (shown to work agent)
- acknowledgment: Quick response to user (optional)

## Rules

INTERRUPT when:
- User explicitly cancels ("stop", "nevermind", "wait")
- User changes direction ("actually, do X instead")
- User points out a mistake ("no, I meant...")
- Critical new information that changes the task

DON'T INTERRUPT when:
- User asks a side question
- User adds clarification that doesn't change the task
- User is just chatting
- Work is >80% done and change is minor

## Examples

Work: "Writing a Python script to parse CSV"
Message: "Oh and make sure it handles UTF-8"
→ Don't interrupt, queue as follow-up note

Work: "Writing a Python script to parse CSV"  
Message: "Actually let's do this in JavaScript"
→ Interrupt, change of direction

Work: "Deploying to production"
Message: "WAIT"
→ Interrupt immediately
`;
```

## Frontend Changes

### Voice UI Improvements

```tsx
// client/src/components/VoiceInput.tsx

export function VoiceInput({ onMessage, disabled }: VoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  
  return (
    <div className="relative">
      {/* Recording indicator - VERY prominent */}
      {isRecording && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {/* Pulsing border around entire screen */}
          <div className="absolute inset-0 border-4 border-red-500 animate-pulse" />
          
          {/* Top banner */}
          <div className="absolute top-0 left-0 right-0 bg-red-500 text-white py-2 px-4 flex items-center justify-center gap-2">
            <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
            <span className="font-medium">RECORDING</span>
            <AudioWaveform level={audioLevel} />
          </div>
        </div>
      )}
      
      {/* Main button */}
      <button
        onClick={isRecording ? stopRecording : startRecording}
        disabled={disabled}
        className={cn(
          "relative w-16 h-16 rounded-full transition-all",
          isRecording 
            ? "bg-red-500 scale-110 shadow-lg shadow-red-500/50" 
            : "bg-blue-500 hover:bg-blue-600"
        )}
      >
        {isRecording ? (
          // STOP icon - large and clear
          <StopIcon className="w-8 h-8 text-white" />
        ) : (
          <MicrophoneIcon className="w-8 h-8 text-white" />
        )}
      </button>
      
      {/* Stop button - separate, large, always visible when recording */}
      {isRecording && (
        <button
          onClick={stopRecording}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 
                     bg-red-600 hover:bg-red-700 text-white 
                     px-8 py-4 rounded-full text-lg font-bold
                     shadow-2xl animate-bounce"
        >
          ⏹ STOP RECORDING
        </button>
      )}
    </div>
  );
}
```

### Message Batching UI

```tsx
// client/src/components/ChatInput.tsx

export function ChatInput({ sessionId }: ChatInputProps) {
  const [pendingMessages, setPendingMessages] = useState<string[]>([]);
  const batchTimeout = useRef<NodeJS.Timeout>();
  
  const sendMessage = async (content: string) => {
    // Add to pending (show user their message immediately)
    setPendingMessages(prev => [...prev, content]);
    
    // Send to server (adds to batch)
    await api.post(`/chat/${sessionId}/message`, { content, type: 'text' });
    
    // Server handles batching, we just show optimistic UI
  };
  
  return (
    <div>
      {/* Show pending messages with "sending..." indicator */}
      {pendingMessages.length > 0 && (
        <div className="text-sm text-gray-500 mb-2">
          {pendingMessages.length} message{pendingMessages.length > 1 ? 's' : ''} sending...
        </div>
      )}
      
      <input ... />
    </div>
  );
}
```

### Work Progress UI

```tsx
// client/src/components/WorkProgress.tsx

export function WorkProgress({ sessionId }: Props) {
  const { activeWork } = useWorkStream(sessionId);
  
  if (activeWork.length === 0) return null;
  
  return (
    <div className="fixed bottom-20 right-4 w-80 bg-white rounded-lg shadow-xl p-4">
      <h4 className="font-medium mb-2">Working on...</h4>
      
      {activeWork.map(work => (
        <div key={work.id} className="mb-3">
          <div className="flex justify-between text-sm">
            <span>{work.type}</span>
            <span>{work.progress}%</span>
          </div>
          
          <div className="w-full bg-gray-200 rounded h-2 mt-1">
            <div 
              className="bg-blue-500 rounded h-2 transition-all"
              style={{ width: `${work.progress}%` }}
            />
          </div>
          
          {work.progressMessage && (
            <p className="text-xs text-gray-500 mt-1">{work.progressMessage}</p>
          )}
          
          <button 
            onClick={() => interruptWork(work.id)}
            className="text-xs text-red-500 hover:text-red-700 mt-1"
          >
            Cancel
          </button>
        </div>
      ))}
    </div>
  );
}
```

## Implementation Order

### Phase 1: Message Batching (Quick Win)
1. Add `message_batches` table
2. Frontend: Batch messages before sending
3. Backend: Process batches as single context
4. **Result**: Rapid-fire messages handled correctly

### Phase 2: Work Queue
1. Add `work_queue` table
2. Implement work dispatch from conversational agent
3. Background worker to process queue
4. **Result**: Long tasks don't block conversation

### Phase 3: Interrupt System
1. Add interrupt evaluation endpoint
2. Implement interrupt evaluator prompt
3. Work agents check for interrupts periodically
4. **Result**: User can change direction mid-task

### Phase 4: Progress Streaming
1. Work agents report progress
2. SSE endpoint for work status
3. Frontend work progress component
4. **Result**: User sees what's happening

### Phase 5: Voice UI
1. Implement prominent recording indicator
2. Large stop button
3. Audio level visualization
4. **Result**: Clear voice interaction

## Migration Path

Can implement incrementally:
1. Phase 1 alone is a big UX improvement
2. Each phase is independently valuable
3. Existing code continues to work during rollout

## Key Files to Create/Modify

```
server/
  services/
    conversation-loop.ts      # NEW - main orchestration
    interrupt-evaluator.ts    # NEW - interrupt logic
    work-dispatcher.ts        # NEW - queue management
  routes/
    conversation.ts           # NEW - new endpoints
    soft-agent-chat.ts        # MODIFY - integrate with conversation loop
  workers/
    work-processor.ts         # NEW - background work execution

client/
  components/
    VoiceInput.tsx            # MODIFY - prominent indicators
    ChatInput.tsx             # MODIFY - batch awareness
    WorkProgress.tsx          # NEW - progress display
  hooks/
    useWorkStream.ts          # NEW - SSE subscription
    useConversationState.ts   # NEW - state management

shared/
  models/
    conversation.ts           # NEW - new tables
```
