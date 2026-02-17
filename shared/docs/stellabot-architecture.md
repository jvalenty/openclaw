# Stellabot Architecture

## Overview

Stellabot is a multi-agent orchestration platform with two runtime environments:

1. **Soft Agents** - Run in Stellabot via Claude API directly
2. **Hard Agents** - Run on physical machines via Clawdbot

## Agent Runtime Decision

When a chat request comes in for an agent, `agent-chat.ts` decides the runtime:

```javascript
// server/routes/agent-chat.ts lines 377-385
const isSoftAgent = agent && 
  agent.agentType !== 'sys_admin' && 
  !agent.machineId &&
  !agent.endpoint &&
  agentId !== 'stella' && 
  agentId !== 'main' &&
  !agentId.startsWith('machine:');
```

### Soft Agent Criteria
- Agent type is NOT `sys_admin`
- No `machineId` set
- No direct `endpoint`
- Not special IDs ('stella', 'main', 'machine:*')

### Hard Agent Criteria
- Agent type IS `sys_admin`, OR
- Has `machineId` pointing to a machine, OR
- Has direct `endpoint` configured, OR
- Is a special ID

## Soft Agent Runtime

**File:** `server/routes/soft-agent-chat.ts`

### How It Works
1. Load agent from DB
2. Build system prompt (soul + knowledge + skills + user context)
3. Get available tools based on permissions
4. Call Claude API directly
5. Execute tool calls, loop until done
6. Save messages to `chat_sessions` / `chat_messages`

### Context Loading (buildSystemPrompt)

```
1. Agent identity: "You are **{name}**. {description}"
2. Soul: modelConfig.systemPrompt (from agents table)
3. User context: name, role
4. Tool guidance
5. Skills: from skills table (matched by agent ID or name slug)
6. Knowledge: from knowledge table (active, approved, scoped)
```

### Tool System

Tools are defined in `soft-agent-chat.ts` and gated by `agent_actions` table.

| Permission | Tools |
|------------|-------|
| `google` | sheets_read, sheets_write, sheets_append, calendar_*, gmail_* |
| `database` | db_query |
| `clawdbot` | clawdbot (proxy to Clawdbot) |
| `browser.navigate` | browser_navigate |
| `browser.interact` | browser_snapshot, _screenshot, _click, _type, _scroll, _wait |
| `sandbox` | sandbox_execute |

**Note:** Browser tools currently route through `/v1/chat/completions` which adds ~8-10s LLM overhead per call. Future optimization: proxy directly to browser control server (port 18800) bypassing LLM inference.

### Tool Permission Check

```javascript
// server/routes/soft-agent-chat.ts
async function checkPermission(agentId: string, permission: string): Promise<boolean> {
  // Check for wildcard (*)
  const wildcard = await db.query.agentActions.findFirst({
    where: and(
      eq(agentActions.agentId, agentId),
      eq(agentActions.action, '*'),
      eq(agentActions.enabled, true)
    )
  });
  if (wildcard) return true;

  // Check specific permission
  const perm = await db.query.agentActions.findFirst({
    where: and(
      eq(agentActions.agentId, agentId),
      eq(agentActions.action, permission),
      eq(agentActions.enabled, true)
    )
  });
  return !!perm;
}
```

## Hard Agent Runtime

**System:** Clawdbot Gateway running on physical machine

### How It Works
1. Stellabot proxies request to Clawdbot gateway URL
2. Clawdbot loads agent config from `clawdbot.json`
3. Injects workspace files (SOUL.md, MEMORY.md, etc.)
4. Calls Claude API with full tool access
5. Returns response to Stellabot

### Clawdbot Tools
- `exec` - Run shell commands
- `browser` - Full browser automation
- `read/write/edit` - File system access
- `process` - Manage background processes
- `nodes` - Control paired devices
- `cron` - Schedule tasks
- `memory_search/memory_get` - Workspace memory

## Clawdbot as Tool Server

Soft agents can use Clawdbot tools without running on Clawdbot.

### clawdbot Tool
Sends a natural language task to Clawdbot:
```javascript
// Soft agent calls:
{
  name: 'clawdbot',
  input: {
    task: "Take a screenshot of google.com",
    machine_id: "optional-specific-machine"
  }
}
```

Stellabot routes to the machine's gateway URL and returns the result.

### browser_* Tools
Individual browser actions routed through Clawdbot:
- `browser_navigate` - Open URL
- `browser_snapshot` - Get page structure with refs
- `browser_screenshot` - Capture image
- `browser_click` - Click element by ref
- `browser_type` - Type into element
- `browser_scroll` - Scroll page
- `browser_wait` - Wait for condition

## Memory System

### Current State (2026-02-08)

**Working:**
- Soul loading from `agents.modelConfig.systemPrompt`
- Knowledge loading from `knowledge` table
- Skills loading from `skills` table
- Scoped context (system/org/agent)

**Missing:**
- Memory write tools for soft agents
- Auto-extraction from conversations
- Semantic search over knowledge

### Knowledge Table Schema
```sql
- id: varchar (PK)
- scope: varchar ('system', 'org', 'agent')
- org_id: varchar
- agent_id: varchar
- type: varchar ('fact', 'rule', 'profile', 'preference', etc.)
- key: varchar
- title: varchar
- content: text
- priority: integer
- active: boolean
- approved: boolean
- created_at, updated_at
```

### Context Loading Query
```sql
SELECT key, title, content 
FROM knowledge 
WHERE active = TRUE 
  AND approved = TRUE
  AND (
    scope = 'system'
    OR (scope = 'org' AND org_id = ?)
    OR (scope = 'agent' AND agent_id = ?)
  )
ORDER BY priority DESC
LIMIT 10
```

## Database Schema (Key Tables)

### agents
- id, name, description, agent_type
- org_id, machine_id, endpoint
- model_config (JSON: systemPrompt, temperature, etc.)
- skills, status

### machines
- id, name, type, org_id
- tunnel_url, config (JSON: gatewayUrl, gatewayToken)
- status, last_heartbeat

### agent_actions (Permissions)
- id, agent_id, action, enabled
- resource_filter, allowed_fields, max_value
- reason, added_by

### knowledge
- id, scope, org_id, agent_id
- type, key, title, content
- priority, active, approved, reviewed

### chat_sessions
- id, user_id, agent_id
- title, metadata
- created_at, updated_at

### chat_messages
- id, session_id, role, content
- metadata, timestamp, deleted_at

## Infrastructure

### Production
- **Stellabot:** Fly.io (2 machines, SJC region)
- **Database:** Neon PostgreSQL (us-east-1)
- **Hard Agents:** Mac Mini via Clawdbot + Cloudflare Tunnel

### Connectivity
```
User → stellabot.app (Fly.io)
         ↓
    Soft agents run here (Claude API)
         ↓ (tool calls)
    Clawdbot (Mac Mini) via https://console.stellabot.app
         ↓
    Hardware: browser, files, exec
```

## Migration Guide: Hard → Soft

To convert an agent from hard to soft:

1. **Clear machineId:**
```sql
UPDATE agents SET machine_id = NULL WHERE id = 'agent-uuid';
```

2. **Ensure soul is in DB:**
```sql
UPDATE agents 
SET model_config = jsonb_set(model_config, '{systemPrompt}', '"Your soul content here"')
WHERE id = 'agent-uuid';
```

3. **Grant tool permissions:**
```sql
INSERT INTO agent_actions (agent_id, action, enabled, reason)
VALUES 
  ('agent-uuid', 'google', true, 'Cloud tools'),
  ('agent-uuid', 'clawdbot', true, 'Hardware via proxy');
```

4. **Test:** Chat with agent, verify soft routing and tools work.
