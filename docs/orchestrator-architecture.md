# Agent Network Architecture

## Core Principle: Agents as First-Class Citizens

Every agent is a **first-class communicator** that can:
1. Receive and process requests (from orchestrators, peers, or external)
2. Send messages directly to other agents (if rules allow)
3. Request work from peer agents
4. Broadcast to groups (same org, same skill, specific list)

## Communication Patterns

### Pattern 1: Orchestrator → Specialists (Hub & Spoke)

```
User Input
    ↓
┌─────────────────────┐
│    ORCHESTRATOR     │  ← Mini-model (Haiku, GPT-4o-mini)
│  - Routes requests  │  ← Cheap, fast, always-on
│  - Aggregates       │
└─────────────────────┘
    ↓         ↓         ↓
┌───────┐ ┌───────┐ ┌───────┐
│ Spec1 │ │ Spec2 │ │ Spec3 │  ← Specialists
│Research│ │Coding │ │Trading│  ← Domain experts
└───────┘ └───────┘ └───────┘
    ↓         ↓         ↓
    └─────────┼─────────┘
              ↓
         Aggregated Response
```

## Agent Types

```typescript
// New enum for agent type
export const agentTypeEnum = pgEnum("agent_type", [
  "orchestrator",  // Routes requests, manages workflow
  "specialist",    // Domain expert, does actual work
  "hybrid"         // Can do both (e.g., Stella)
]);
```

## Schema Additions

```typescript
// Add to agents table
agentType: agentTypeEnum("agent_type").default("specialist"),

// For orchestrators - which specialists they can dispatch to
dispatchConfig: jsonb("dispatch_config").default({}).$type<{
  model?: string;           // Model for routing decisions
  maxConcurrent?: number;   // Max parallel specialist calls
  timeout?: number;         // Per-specialist timeout
  specialists?: string[];   // Agent IDs this orchestrator manages
  routingRules?: Array<{    // Skill-based routing
    skills: string[];
    agentIds: string[];
    priority?: number;
  }>;
}>(),

// For specialists - response handling
responseConfig: jsonb("response_config").default({}).$type<{
  format?: 'text' | 'json' | 'structured';
  maxTokens?: number;
  streaming?: boolean;
}>(),
```

## Dispatch Flow

### 1. Request comes to Orchestrator

```json
{
  "type": "dispatch_request",
  "requestId": "req_abc123",
  "input": "Research NVDA earnings and write a summary",
  "context": { "userId": "...", "sessionId": "..." }
}
```

### 2. Orchestrator analyzes & routes

Orchestrator (mini-model) decides:
- Task requires: `research` + `writing`
- Route to: `specialist-research` first, then `specialist-writer`
- Execution: sequential (research → write) or parallel

### 3. Dispatch to Specialists

Control plane sends to appropriate machine(s):

```json
{
  "type": "specialist_task",
  "requestId": "req_abc123",
  "subtaskId": "sub_001",
  "agentId": "specialist-research",
  "task": "Research NVDA Q4 2025 earnings",
  "context": { ... },
  "responseUrl": "/api/agents/dispatch/respond"
}
```

### 4. Specialist executes & responds

```json
{
  "type": "specialist_response",
  "requestId": "req_abc123",
  "subtaskId": "sub_001",
  "status": "complete",
  "result": { "summary": "...", "data": {...} }
}
```

### 5. Orchestrator aggregates & delivers

Orchestrator combines specialist outputs → final response to user.

## API Endpoints

```typescript
// Dispatch a request through orchestrator
POST /api/agents/:orchestratorId/dispatch
Body: { input, context?, stream?: boolean }

// Specialist reports completion
POST /api/agents/dispatch/respond
Body: { requestId, subtaskId, agentId, status, result }

// Get dispatch status
GET /api/agents/dispatch/:requestId

// List pending tasks for a specialist
GET /api/agents/:agentId/pending-tasks
```

## Pattern 2: Peer-to-Peer (Mesh)

```
┌─────────────────────────────────────────────────────┐
│                  AGENT MESH                          │
│                                                     │
│   Stella ←────→ Research Bot ←────→ Trading Bot    │
│      ↑               ↑                   ↑          │
│      │               │                   │          │
│      ↓               ↓                   ↓          │
│   Writer ←────→ Data Analyst ←────→ Support Bot    │
│                                                     │
│   Any agent can message any other (if rules allow)  │
└─────────────────────────────────────────────────────┘
```

### Communication Rules

Agents can communicate if ANY of these are true:
1. **Same Organization** - agents in same org can always talk
2. **Explicit Allowlist** - sender's `capabilities.allowedAgents` includes recipient
3. **Open Receiver** - recipient has `capabilities.acceptsMessages = true`
4. **Org Allowlist** - recipient allows sender's org via `capabilities.allowedOrgs`

### API for Peer Communication

```typescript
// Direct message
POST /api/agents/:agentId/messages
{ recipientId, message, context?, replyTo? }

// Broadcast to group
POST /api/agents/:agentId/broadcast
{ scope: 'org' | 'skill' | 'list', target?, message }

// Request with expected response
POST /api/agents/:agentId/request
{ targetId, request, context?, timeout? }

// List reachable peers
GET /api/agents/:agentId/peers
→ { peers: [{ id, name, canMessage, online, skills }] }
```

### Capabilities for Communication

```typescript
capabilities: {
  // Outbound
  canBroadcast?: boolean;        // Can send to multiple agents
  allowedAgents?: string[];      // Specific agents I can message
  
  // Inbound
  acceptsMessages?: boolean;     // Open to all agents
  allowedOrgs?: string[];        // Accept from these orgs
}
```

## Machine Distribution

```
┌────────────────────────┐     ┌────────────────────────┐
│     MAC MINI (Home)    │     │      VPS (Cloud)       │
├────────────────────────┤     ├────────────────────────┤
│ • Orchestrator (Stella)│     │ • Specialist: Research │
│ • Specialist: Local    │     │ • Specialist: Compute  │
│   - File access        │     │ • Specialist: 24/7 tasks│
│   - Browser control    │     │                        │
│   - Home automation    │     │                        │
└────────────────────────┘     └────────────────────────┘
         ↓                              ↓
         └──────────┬──────────────────┘
                    ↓
           ┌────────────────┐
           │  Control Plane │
           │  (Stellabot)   │
           └────────────────┘
```

## Example: Stella as Hybrid Orchestrator

Stella (Mac mini) acts as:
1. **Primary orchestrator** - receives all user input
2. **Local specialist** - handles local tasks directly
3. **Dispatcher** - sends remote tasks to VPS specialists

```yaml
agent:
  name: "Stella"
  type: "hybrid"
  machineId: "mac-mini-home"
  dispatchConfig:
    model: "claude-3-5-haiku"  # Fast routing decisions
    specialists:
      - "vps-researcher"
      - "vps-trader"
    routingRules:
      - skills: ["research", "web"]
        agentIds: ["vps-researcher"]
      - skills: ["trading", "market"]
        agentIds: ["vps-trader"]
      - skills: ["local", "files", "browser"]
        agentIds: ["self"]  # Handle locally
```

## Implementation Phases

### Phase 1: Schema & Basic Dispatch
- [ ] Add `agentType` enum and column
- [ ] Add `dispatchConfig` and `responseConfig` columns
- [ ] Create migration
- [ ] Update UI to show agent type

### Phase 2: Dispatch API
- [ ] POST /dispatch endpoint
- [ ] WebSocket message routing
- [ ] Specialist task queue
- [ ] Response aggregation

### Phase 3: Routing Intelligence
- [ ] Skill-based routing
- [ ] Load balancing
- [ ] Fallback handling
- [ ] Parallel execution

### Phase 4: Monitoring & Observability
- [ ] Dispatch tracing
- [ ] Latency metrics
- [ ] Error rates per specialist
- [ ] Cost tracking
