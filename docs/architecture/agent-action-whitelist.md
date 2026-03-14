# Agent Action Whitelist Architecture

## Philosophy

**Whitelist-first security**: Agents can ONLY perform explicitly allowed actions. Everything else is impossible — not forbidden, but literally unavailable.

Benefits:
- Small, auditable surface area
- Default deny without configuration
- Organic growth based on real needs
- Train human and agent together — blocks reveal what to whitelist next

---

## Database Schema

```sql
-- Available action types (system-defined catalog)
CREATE TABLE action_catalog (
  id VARCHAR(100) PRIMARY KEY,           -- 'sheets.read', 'sheets.write', 'web.search', etc.
  category VARCHAR(50) NOT NULL,         -- 'sheets', 'web', 'files', 'messaging', etc.
  name VARCHAR(100) NOT NULL,            -- Human-readable name
  description TEXT,
  parameter_schema JSONB,                -- JSON Schema for allowed parameters
  risk_level VARCHAR(20) DEFAULT 'low',  -- 'low', 'medium', 'high', 'critical'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent's allowed actions (the whitelist)
CREATE TABLE agent_allowed_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  action_id VARCHAR(100) NOT NULL REFERENCES action_catalog(id),
  
  -- Resource constraints (optional - narrows scope)
  resource_constraints JSONB,
  -- Examples:
  -- { "spreadsheet_id": "1gFBG_*" }
  -- { "spreadsheet_id": "1gFBG_xxx", "columns": ["F","G","H","I"] }
  -- { "url_pattern": "https://api.example.com/*" }
  -- { "path_pattern": "/workspace/data/*" }
  
  -- Parameter constraints (optional - limits what can be passed)
  parameter_constraints JSONB,
  -- Examples:
  -- { "max_rows": 1000 }
  -- { "allowed_values": ["status1", "status2"] }
  
  -- Metadata
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by UUID REFERENCES users(id),
  reason TEXT,                           -- Why was this added
  
  UNIQUE(agent_id, action_id, resource_constraints)
);

-- Log of blocked attempts (helps identify what to whitelist)
CREATE TABLE agent_blocked_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  session_id VARCHAR(255),
  
  -- What was attempted
  attempted_action VARCHAR(100) NOT NULL,
  attempted_resource JSONB,
  attempted_parameters JSONB,
  
  -- Context
  user_message TEXT,                     -- What the user asked for
  agent_reasoning TEXT,                  -- Why agent wanted to do this
  
  -- Outcome
  block_reason VARCHAR(100) NOT NULL,    -- 'action_not_whitelisted', 'resource_not_allowed', etc.
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- For review queue
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  review_action VARCHAR(20),             -- 'whitelisted', 'ignored', 'flagged'
  
  INDEX idx_blocked_agent (agent_id, created_at),
  INDEX idx_blocked_unreviewed (reviewed_at) WHERE reviewed_at IS NULL
);

-- Audit log (successful actions)
CREATE TABLE agent_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  user_id UUID REFERENCES users(id),
  session_id VARCHAR(255),
  
  action_id VARCHAR(100) NOT NULL,
  resource JSONB,
  parameters JSONB,
  
  allowed_action_id UUID REFERENCES agent_allowed_actions(id),
  
  result VARCHAR(20),                    -- 'success', 'error'
  result_details JSONB,
  
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  duration_ms INTEGER,
  
  INDEX idx_log_agent (agent_id, executed_at),
  INDEX idx_log_action (action_id, executed_at)
);
```

---

## Action Catalog (Initial Set)

```sql
INSERT INTO action_catalog (id, category, name, description, parameter_schema, risk_level) VALUES

-- Sheets
('sheets.read', 'sheets', 'Read Spreadsheet', 'Read data from Google Sheets', 
 '{"spreadsheet_id": "string", "range": "string"}', 'low'),
('sheets.write', 'sheets', 'Write to Spreadsheet', 'Write data to Google Sheets',
 '{"spreadsheet_id": "string", "range": "string", "values": "array"}', 'medium'),
('sheets.append', 'sheets', 'Append to Spreadsheet', 'Append rows to Google Sheets',
 '{"spreadsheet_id": "string", "range": "string", "values": "array"}', 'medium'),

-- Web
('web.search', 'web', 'Web Search', 'Search the web via Brave API',
 '{"query": "string", "count": "number"}', 'low'),
('web.fetch', 'web', 'Fetch URL', 'Fetch and extract content from URL',
 '{"url": "string"}', 'low'),

-- Files (workspace)
('files.read', 'files', 'Read File', 'Read file from workspace',
 '{"path": "string"}', 'low'),
('files.write', 'files', 'Write File', 'Write file to workspace',
 '{"path": "string", "content": "string"}', 'medium'),
('files.list', 'files', 'List Files', 'List files in directory',
 '{"path": "string"}', 'low'),

-- Knowledge base
('knowledge.search', 'knowledge', 'Search Knowledge', 'Search org knowledge base',
 '{"query": "string"}', 'low'),
('knowledge.read', 'knowledge', 'Read Document', 'Read knowledge document',
 '{"doc_id": "string"}', 'low'),

-- Tasks
('tasks.read', 'tasks', 'Read Tasks', 'Read task board',
 '{"board_id": "string"}', 'low'),
('tasks.create', 'tasks', 'Create Task', 'Create new task',
 '{"board_id": "string", "title": "string"}', 'medium'),
('tasks.update', 'tasks', 'Update Task', 'Update task status/details',
 '{"task_id": "string"}', 'medium'),

-- Messaging (internal)
('messaging.notify', 'messaging', 'Send Notification', 'Send notification to user',
 '{"user_id": "string", "message": "string"}', 'medium'),

-- Agents
('agents.delegate', 'agents', 'Delegate to Agent', 'Ask another agent for help',
 '{"agent_id": "string", "task": "string"}', 'medium'),

-- Calendar
('calendar.read', 'calendar', 'Read Calendar', 'Read calendar events',
 '{"calendar_id": "string", "date_range": "object"}', 'low'),
('calendar.create', 'calendar', 'Create Event', 'Create calendar event',
 '{"calendar_id": "string", "event": "object"}', 'medium'),

-- Higher risk (requires careful whitelisting)
('exec.run', 'exec', 'Run Command', 'Execute shell command',
 '{"command": "string"}', 'critical'),
('api.call', 'api', 'External API', 'Call external API',
 '{"url": "string", "method": "string"}', 'high'),
('email.send', 'email', 'Send Email', 'Send email',
 '{"to": "string", "subject": "string", "body": "string"}', 'high');
```

---

## UI Design

### Agent Edit Page → "Allowed Actions" Tab

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Brand Manager > Allowed Actions                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  This agent can ONLY perform the actions listed below.                  │
│  Everything else is blocked by default.                                 │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ + Add Action                                        [Templates ▼]│   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 📊 sheets.read                                                   │   │
│  │    Read Spreadsheet                                    [Remove]  │   │
│  │    ├─ Spreadsheet: 1gFBG_IXRLr72CGa4mXEQXjX-CblesyalPDJ4WiQoexQ │   │
│  │    └─ Range: * (all sheets)                                      │   │
│  │    Added by john@amg.com on Feb 6                      [Edit]    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 📊 sheets.write                                                  │   │
│  │    Write to Spreadsheet                                [Remove]  │   │
│  │    ├─ Spreadsheet: 1gFBG_IXRLr72CGa4mXEQXjX-CblesyalPDJ4WiQoexQ │   │
│  │    ├─ Columns: F, G, H, I only                                   │   │
│  │    └─ Rows: 2-1000                                               │   │
│  │    Added by john@amg.com on Feb 6                      [Edit]    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 📚 knowledge.search                                              │   │
│  │    Search Knowledge                                    [Remove]  │   │
│  │    └─ No constraints (all org knowledge)                         │   │
│  │    Added by john@amg.com on Feb 6                      [Edit]    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ⚠️ Blocked Attempts (3 unreviewed)                        [View All]  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ • web.search - User asked to "look up competitor pricing"        │   │
│  │   2 hours ago                              [Whitelist] [Ignore]  │   │
│  │                                                                   │   │
│  │ • messaging.notify - Agent wanted to alert user about deadline   │   │
│  │   Yesterday                                [Whitelist] [Ignore]  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Add Action Modal

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Add Allowed Action                                              [X]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Action Type                                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ [Search actions...]                                          ▼  │   │
│  │                                                                  │   │
│  │ 📊 SHEETS                                                        │   │
│  │    ○ sheets.read - Read Spreadsheet                              │   │
│  │    ● sheets.write - Write to Spreadsheet                         │   │
│  │    ○ sheets.append - Append to Spreadsheet                       │   │
│  │                                                                  │   │
│  │ 🌐 WEB                                                           │   │
│  │    ○ web.search - Web Search                                     │   │
│  │    ○ web.fetch - Fetch URL                                       │   │
│  │                                                                  │   │
│  │ 📁 FILES                                                         │   │
│  │    ○ files.read - Read File                                      │   │
│  │    ...                                                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Resource Constraints (optional - leave blank for unrestricted)        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Spreadsheet ID                                                   │   │
│  │ [1gFBG_IXRLr72CGa4mXEQXjX-CblesyalPDJ4WiQoexQ________________]   │   │
│  │                                                                  │   │
│  │ Allowed Columns (comma-separated, blank for all)                 │   │
│  │ [F, G, H, I_______________________________________________]      │   │
│  │                                                                  │   │
│  │ Allowed Rows (e.g., "2:1000", blank for all)                     │   │
│  │ [2:1000___________________________________________________]      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Reason (for audit trail)                                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ [Agent needs to update status columns in weekly sheets_______]   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│                                        [Cancel]  [Add to Whitelist]    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Templates Dropdown

```
┌────────────────────────────────┐
│ Templates                    ▼ │
├────────────────────────────────┤
│ 📊 Sheets Reader               │
│    sheets.read (full access)   │
│                                │
│ 📊 Sheets Editor               │
│    sheets.read + write         │
│                                │
│ 🔍 Research Assistant          │
│    web.search + web.fetch      │
│    knowledge.search            │
│                                │
│ 📋 Task Manager                │
│    tasks.* (all task actions)  │
│                                │
│ 💬 Internal Communicator       │
│    messaging.notify            │
│    agents.delegate             │
│                                │
│ ⚙️ Custom...                   │
└────────────────────────────────┘
```

---

## Runtime Enforcement

When agent session starts:

```typescript
async function loadAgentTools(agentId: string): Promise<Tool[]> {
  // Get whitelist from DB
  const allowedActions = await db.query(
    'SELECT * FROM agent_allowed_actions WHERE agent_id = $1',
    [agentId]
  )
  
  // Build tool set from whitelist only
  const tools: Tool[] = []
  
  for (const allowed of allowedActions) {
    const toolDef = getToolDefinition(allowed.action_id)
    
    // Inject constraints into tool
    tools.push({
      ...toolDef,
      constraints: {
        resource: allowed.resource_constraints,
        parameters: allowed.parameter_constraints
      }
    })
  }
  
  return tools  // Agent only sees these tools
}
```

When tool is called:

```typescript
async function executeToolCall(
  agentId: string, 
  userId: string,
  toolCall: ToolCall
): Promise<ToolResult> {
  
  // 1. Check if action is whitelisted
  const allowed = await db.query(
    `SELECT * FROM agent_allowed_actions 
     WHERE agent_id = $1 AND action_id = $2`,
    [agentId, toolCall.name]
  )
  
  if (!allowed.length) {
    // Log blocked attempt
    await logBlockedAttempt(agentId, userId, toolCall, 'action_not_whitelisted')
    throw new ActionNotAllowedError(`Action ${toolCall.name} is not permitted`)
  }
  
  // 2. Check resource constraints
  const matchingRule = allowed.find(a => 
    matchesConstraints(a.resource_constraints, toolCall.parameters)
  )
  
  if (!matchingRule) {
    await logBlockedAttempt(agentId, userId, toolCall, 'resource_not_allowed')
    throw new ActionNotAllowedError(`Resource not permitted for ${toolCall.name}`)
  }
  
  // 3. Execute and log
  const result = await executeTool(toolCall)
  await logAction(agentId, userId, toolCall, matchingRule.id, result)
  
  return result
}
```

---

## Blocked Attempts Review Queue

Admins see:
- What was attempted
- What user asked for
- One-click to whitelist
- Patterns emerge → add to templates

This creates a feedback loop:
1. Agent tries something
2. Gets blocked
3. Admin reviews
4. Either whitelists (real need) or ignores (inappropriate request)
5. Agent learns naturally what's available

---

## Migration from Current System

1. **Default all existing agents to empty whitelist** (they can't do anything)
2. **Admin configures whitelists per agent**
3. **Or use templates for quick setup**

For Brand Manager:
```sql
INSERT INTO agent_allowed_actions (agent_id, action_id, resource_constraints, reason) VALUES
('26187726-399c-430f-a85d-f5fb9f59cdbe', 'sheets.read', 
 '{"spreadsheet_id": "1gFBG_IXRLr72CGa4mXEQXjX-CblesyalPDJ4WiQoexQ"}',
 'Read brand management spreadsheet'),
('26187726-399c-430f-a85d-f5fb9f59cdbe', 'sheets.write',
 '{"spreadsheet_id": "1gFBG_IXRLr72CGa4mXEQXjX-CblesyalPDJ4WiQoexQ", "columns": ["F","G","H","I"], "rows": "2:1000"}',
 'Update status columns in weekly sheets');
```
