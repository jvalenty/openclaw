# Conversational Agent Implementation Status

## What's Built ✅

### Database Schema (`shared/models/conversation.ts`)
- `message_batches` - Batches rapid-fire messages
- `work_queue` - Async task dispatch and tracking
- `conversation_state` - Rolling context window

### Conversation Loop Service (`server/services/conversation-loop.ts`)
- Message batching with configurable window (1.5s)
- Conversational agent evaluation (Haiku for speed)
- Interrupt evaluation system
- Work dispatch to queue
- Progress tracking and completion
- Real-time event emission

### API Routes (`server/routes/conversation.ts`)
- `POST /api/conversation/sessions` - Get/create session
- `POST /api/conversation/:sessionId/message` - Send message (batched)
- `GET /api/conversation/:sessionId/state` - Get current state
- `GET /api/conversation/:sessionId/work-stream` - SSE for real-time updates
- `POST /api/conversation/:sessionId/work/:workId/interrupt` - Cancel work
- `GET /api/conversation/:sessionId/work` - List work items

### Migration (`migrations/0012_conversation_loop.sql`)
- All tables and indexes ready to run

---

## What's Still Needed 🔧

### 1. Wire Up Routes (5 min)
Add to `server/index.ts`:
```typescript
import conversationRouter from './routes/conversation';
app.use('/api/conversation', conversationRouter);
```

### 2. Work Processor (1-2 hours)
Background worker that:
- Picks up work from queue
- Routes to appropriate agent (coding, research, etc.)
- Reports progress
- Checks for interrupts periodically
- Handles completion/failure

```typescript
// server/workers/work-processor.ts
class WorkProcessor {
  async processNext() {
    const work = await this.claimNextWork();
    if (!work) return;
    
    // Route to appropriate handler
    switch (work.taskType) {
      case 'coding':
        await this.handleCodingTask(work);
        break;
      case 'clawdbot':
        await this.handleClawdbotTask(work);
        break;
      // etc.
    }
  }
  
  private async handleCodingTask(work: WorkItem) {
    // Check for interrupt periodically
    const checkInterrupt = async () => {
      const { interrupt, reason } = await loop.shouldInterrupt(work.id);
      if (interrupt) throw new Error(`Interrupted: ${reason}`);
    };
    
    // Execute with progress updates
    await loop.updateWorkProgress(work.id, 10, 'Starting...');
    await checkInterrupt();
    
    // ... actual work ...
    
    await loop.completeWork(work.id, result);
  }
}
```

### 3. Frontend: VoiceInput Upgrade (30 min)
Make recording state OBVIOUS:
- Pulsing red border
- Large "STOP" button
- Audio waveform
- "RECORDING" banner

### 4. Frontend: WorkProgress Component (30 min)
Show active work:
- Progress bars
- Cancel buttons
- Status messages

### 5. Frontend: Message Batching UI (15 min)
- Show "sending..." for pending messages
- Optimistic UI updates

### 6. Frontend: SSE Hook (30 min)
```typescript
// client/hooks/useWorkStream.ts
function useWorkStream(sessionId: string) {
  const [activeWork, setActiveWork] = useState([]);
  
  useEffect(() => {
    const es = new EventSource(`/api/conversation/${sessionId}/work-stream`);
    es.onmessage = (e) => {
      const { type, data } = JSON.parse(e.data);
      // Update state based on type
    };
    return () => es.close();
  }, [sessionId]);
  
  return { activeWork };
}
```

### 7. Integration with Existing Chat (1 hour)
Either:
- **Option A:** New chat component using new API (clean but parallel)
- **Option B:** Modify existing AgentChat to use conversation loop (more complex but unified)

Recommend Option A first, then migrate.

---

## Rollout Plan

### Phase 1: Backend Only (Today)
1. Run migration
2. Wire up routes
3. Create work processor stub (returns work immediately without actual processing)
4. Test message batching works

### Phase 2: Frontend Voice (Tomorrow)
1. Upgrade VoiceInput component
2. Much more obvious recording state

### Phase 3: Full Integration (Next 2-3 days)
1. Work processor with real agent routing
2. Frontend work progress component
3. SSE subscription
4. New chat UI that uses conversation API

### Phase 4: Migration (Week 2)
1. A/B test new vs old chat
2. Migrate all chat to new system
3. Deprecate old endpoints

---

## Testing

### Manual Testing
```bash
# Create session
curl -X POST http://localhost:5000/api/conversation/sessions \
  -H "Content-Type: application/json" \
  -d '{"agentId": "test-agent"}' \
  --cookie "session=..."

# Send rapid messages
curl -X POST http://localhost:5000/api/conversation/{sessionId}/message \
  -H "Content-Type: application/json" \
  -d '{"content": "first message"}'

curl -X POST http://localhost:5000/api/conversation/{sessionId}/message \
  -H "Content-Type: application/json" \
  -d '{"content": "second message"}'
  
# (wait 1.5s, batch processes)

# Check state
curl http://localhost:5000/api/conversation/{sessionId}/state
```

### Verify Batching
Send 3 messages quickly → should see single batch processed with all 3.

### Verify Interrupt
1. Send message that triggers work delegation
2. While work is "running", send "stop"
3. Verify interrupt is requested

---

## Key Wins

1. **Message Batching** - Rapid-fire messages handled together (immediate UX improvement)
2. **Async Work** - Long tasks don't block conversation
3. **Interrupt System** - User can change direction mid-task
4. **Progress Visibility** - User sees what's happening
5. **Context Continuity** - Rolling window maintains conversation coherence
