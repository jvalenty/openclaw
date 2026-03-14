# Model Delegation Architecture

## Overview

Use a tiered model approach where a fast, lightweight model handles triage and routing, escalating to more capable models when needed.

## Tier Structure

### Tier 1: Router (Haiku)
- **Model**: Claude 3.5 Haiku
- **Role**: First responder, triage, routing
- **Handles**:
  - Simple Q&A
  - Greetings and small talk
  - Quick lookups (weather, time, simple facts)
  - Classifying request complexity
  - Deciding when to escalate

### Tier 2: Workhorse (Sonnet)
- **Model**: Claude 4 Sonnet
- **Role**: General purpose assistant
- **Handles**:
  - Most coding tasks
  - Document analysis
  - Multi-step reasoning
  - Standard conversations
  - 90% of real work

### Tier 3: Expert (Opus)
- **Model**: Claude 4 Opus
- **Role**: Complex reasoning, architecture
- **Handles**:
  - System architecture decisions
  - Complex debugging
  - Multi-file refactoring
  - Strategic planning
  - When Sonnet explicitly escalates

## Routing Logic

```typescript
interface RoutingDecision {
  tier: 'haiku' | 'sonnet' | 'opus';
  reason: string;
  confidence: number;
}

// Haiku makes the initial routing decision
async function routeRequest(message: string): Promise<RoutingDecision> {
  const response = await callHaiku({
    system: `You are a request router. Classify the user's request:
    
    Return JSON: { "tier": "haiku|sonnet|opus", "reason": "brief explanation" }
    
    Routing rules:
    - haiku: Simple greetings, quick facts, status checks
    - sonnet: Coding, analysis, most tasks (DEFAULT)
    - opus: Architecture, complex reasoning, multi-system changes`,
    message
  });
  
  return parseRoutingResponse(response);
}
```

## Implementation Options

### Option A: Server-Side Router (Recommended)
- Add routing logic to `clawdbot-chat.ts`
- Haiku call adds ~200ms but saves $$ on simple queries
- Router response cached for conversation context

```typescript
// In clawdbot-chat.ts
const routing = await routeRequest(message);
const model = {
  haiku: 'anthropic/claude-haiku-3-5-sonnet-20240307',
  sonnet: 'anthropic/claude-sonnet-4-20250514',
  opus: 'anthropic/claude-opus-4-20250514'
}[routing.tier];
```

### Option B: Client-Side Selection
- User selects model in UI (already implemented)
- Auto mode uses heuristics (message length, keywords)
- Less accurate but zero latency

### Option C: Hybrid
- Client suggests tier based on heuristics
- Server can override if Haiku disagrees
- Best of both worlds

## Escalation Protocol

When Sonnet needs to escalate:
```
[ESCALATE:OPUS] This requires architectural review. 
Routing to Opus for: multi-service refactoring involving 
database schema, API changes, and frontend updates.
```

When Opus wants to delegate down:
```
[DELEGATE:SONNET] This implementation task doesn't need 
my full capabilities. Handing to Sonnet for: 
writing the unit tests for UserService.
```

## Cost Analysis

| Model  | Input $/1M | Output $/1M | Typical Request |
|--------|------------|-------------|-----------------|
| Haiku  | $0.25      | $1.25       | ~500 tokens     |
| Sonnet | $3.00      | $15.00      | ~2000 tokens    |
| Opus   | $15.00     | $75.00      | ~4000 tokens    |

With 80% Sonnet / 15% Haiku / 5% Opus distribution:
- **Before** (all Opus): $75/day estimate
- **After** (tiered): ~$25/day estimate
- **Savings**: ~65%

## Next Steps

1. [ ] Add routing endpoint to chat API
2. [ ] Implement Haiku router prompt
3. [ ] Add escalation/delegation parsing
4. [ ] Track routing decisions for optimization
5. [ ] Build dashboard showing tier distribution

## Open Questions

- Should routing decisions persist across conversation turns?
- How to handle mid-conversation complexity changes?
- Should users be able to force a tier?
