# Multi-Agent Architecture

**Created:** 2026-01-31
**Status:** Planning
**Goal:** Support unlimited agents with tool access on a single machine

---

## Overview

Stellabot needs to support multiple agents running on a single machine, each with:
- Their own Soul (system prompt)
- Their own context documents
- Access to shared tools (filesystem, exec, browser, etc.)
- Separate conversation histories
- Distinct personalities and capabilities

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         STELLABOT                               │
│                    (Control Plane + Router)                     │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Telegram   │  │   Discord    │  │    Webapp    │         │
│  │     Bot      │  │     Bot      │  │     Chat     │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                 │                 │                  │
│         └─────────────────┼─────────────────┘                  │
│                           │                                    │
│                    Message Router                              │
│         "Hey Stella" → stella    #dev → paul                  │
│         @jarvis → jarvis         /chat/asaph → asaph          │
│                           │                                    │
│                           ▼                                    │
│              POST /api/agents/:id/message                      │
│                     + agentId                                  │
│                     + message                                  │
│                     + context                                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MACHINE (Mac Mini)                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Agent Config Store (Synced)                 │   │
│  │                                                          │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │   │
│  │  │ Stella  │ │  Paul   │ │ Asaph   │ │ Roxanne │       │   │
│  │  ├─────────┤ ├─────────┤ ├─────────┤ ├─────────┤       │   │
│  │  │ Soul    │ │ Soul    │ │ Soul    │ │ Soul    │       │   │
│  │  │ Context │ │ Context │ │ Context │ │ Context │       │   │
│  │  │ Model   │ │ Model   │ │ Model   │ │ Model   │       │   │
│  │  │ Caps    │ │ Caps    │ │ Caps    │ │ Caps    │       │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Request Handler                        │   │
│  │                                                          │   │
│  │  1. Receive request with agentId                        │   │
│  │  2. Load agent's Soul + Context from store              │   │
│  │  3. Build system prompt with agent's personality        │   │
│  │  4. Execute with LLM                                     │   │
│  │  5. Tools run in shared environment                      │   │
│  │  6. Return response to Stellabot                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Shared Tools                           │   │
│  │                                                          │   │
│  │  • Filesystem (shared workspace or per-agent dirs)      │   │
│  │  • Exec (shell commands)                                 │   │
│  │  • Browser automation                                    │   │
│  │  • Web search/fetch                                      │   │
│  │  • Memory/context operations                             │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. Stellabot Owns All Channels

**Why:** 
- One Telegram bot, one Discord bot — not one per agent
- Easier setup (no creating bots for each agent)
- Centralized permissions and routing
- Agents are "headless" — they don't know about channels

**Routing Rules:**
- Mention: "Hey Stella" → routes to Stella
- Assignment: #dev-channel assigned to Paul → Paul handles
- Direct: /chat/asaph in webapp → Asaph
- Default: Unrouted messages → default agent or ask

### 2. Single Process, Multiple Agents

**Why:**
- Running separate processes per agent is resource-heavy
- Dynamic loading is more efficient
- Scales to unlimited agents without linear resource growth

**How:**
- One gateway process on the machine
- Agent configs synced from Stellabot and cached
- Each request includes `agentId`
- Handler loads that agent's config for the request
- After response, no persistent agent state in memory

### 3. Shared Tool Environment

**Default:** All agents share the same tool environment
- Same filesystem access
- Same exec capabilities  
- Same browser instance

**Optional Isolation:**
- Per-agent workspace directories (`~/clawd/agents/stella/`, `~/clawd/agents/paul/`)
- Capability restrictions per agent (some can exec, some can't)
- Configured in Stellabot agent settings

### 4. Conversation History

**Stored in Stellabot**, not on machine:
- Each agent has separate conversation history
- History scoped by: agentId + userId/channelId
- Machine is stateless — receives context with each request
- Enables agent mobility (move agent to different machine)

---

## Request Flow

```
1. User sends "Hey Stella, check the logs" in Telegram

2. Stellabot receives message
   - Parses routing: "Hey Stella" → agentId = stella
   - Loads conversation history for (stella, user123)
   - Builds request payload

3. Stellabot sends to machine:
   POST /api/agents/stella/message
   {
     "message": "check the logs",
     "history": [...recent messages...],
     "context": {...agent context docs...}
   }

4. Machine receives request:
   - Loads Stella's config (Soul, model, capabilities)
   - Builds system prompt with Soul + context
   - Calls LLM with history + message
   - Executes any tool calls
   - Returns response

5. Stellabot receives response:
   - Stores in conversation history
   - Sends to Telegram
```

---

## Webapp Chat

Each agent gets a chat interface in the Stellabot webapp:

```
/agents                    → List all agents
/agents/:id               → Agent details
/agents/:id/chat          → Chat with this agent

Chat UI:
┌─────────────────────────────────────────┐
│ 💬 Chat with Stella                [X] │
├─────────────────────────────────────────┤
│                                         │
│ You: Check the server status           │
│                                         │
│ Stella: Server is healthy. CPU at 23%, │
│ memory at 4.2GB. No errors in logs.    │
│                                         │
│ You: _                                  │
├─────────────────────────────────────────┤
│ [Send]                                  │
└─────────────────────────────────────────┘
```

---

## Agent Configuration (in Stellabot)

Each agent has:

| Field | Purpose |
|-------|---------|
| `name` | Display name (Stella, Paul, etc.) |
| `agentType` | sys_admin, manager, specialist, assistant |
| `modelConfig.systemPrompt` | The Soul — personality and instructions |
| `modelConfig.model` | Which LLM to use |
| `contextDocIds` | Assigned context documents |
| `capabilities` | What tools/actions allowed |
| `machineId` | Which machine runs this agent |
| `organizationId` | Which org owns this agent |

---

## Implementation Plan

### Phase 1: Message Routing API
- [ ] `POST /api/agents/:id/message` endpoint in Stellabot
- [ ] Route to machine via tunnel/direct
- [ ] Return response to caller

### Phase 2: Machine Multi-Agent Handler  
- [ ] Endpoint to receive agent requests
- [ ] Dynamic agent config loading
- [ ] Execute with agent's Soul/context
- [ ] Return response

### Phase 3: Webapp Chat
- [ ] `/agents/:id/chat` route
- [ ] Chat UI component
- [ ] Conversation history storage
- [ ] Real-time updates (WebSocket or polling)

### Phase 4: Channel Routing
- [ ] Telegram routing rules (mention, default)
- [ ] Discord routing (channel assignment, mentions)
- [ ] Slack routing (same pattern)

---

## Security Considerations

- Agents can only be accessed by users in the same org
- Machine validates agentId belongs to it
- Tool capabilities enforced per-agent
- Conversation history scoped by org
- Audit log of all agent interactions

---

## Related Documents

- `docs/MACHINE-SYNC-SYSTEM.md` — How configs sync to machines
- `memory/MACHINE-SYNC-PROTOCOL.md` — Sync protocol spec
- `CONTEXT.md` — Current project state
