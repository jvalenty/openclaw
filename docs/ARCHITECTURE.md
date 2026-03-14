# Stellabot Architecture

## Overview

Stellabot is a multi-agent orchestration platform with a clean separation between cloud intelligence and hardware access.

```
┌─────────────────────────────────────────────────────────────────┐
│                         STELLABOT (Cloud)                        │
│                                                                  │
│  ┌──────────┐    ┌─────────────┐    ┌──────────────────────┐   │
│  │  App UI  │───▶│ Soft Agents │───▶│    App Sys Agent     │   │
│  │  (Chat)  │    │  (Prompts)  │    │  (Brain + Tools)     │   │
│  └──────────┘    └─────────────┘    └──────────┬───────────┘   │
│                                                 │                │
│                         ┌───────────────────────┼────────┐      │
│                         ▼           ▼           ▼        ▼      │
│                    ┌────────┐ ┌─────────┐ ┌───────┐ ┌────────┐ │
│                    │Anthropic│ │ Google  │ │ Slack │ │Database│ │
│                    │   API   │ │ Sheets  │ │  API  │ │        │ │
│                    └────────┘ └─────────┘ └───────┘ └────────┘ │
│                                                                  │
│                         ┌───────────────────────┐               │
│                         ▼                       ▼               │
│                    ┌─────────┐           ┌────────────┐        │
│                    │Clawdbot │           │ MoltWorker │        │
│                    │  (API)  │           │   (API)    │        │
│                    └────┬────┘           └─────┬──────┘        │
└─────────────────────────┼──────────────────────┼────────────────┘
                          │                      │
                          ▼                      ▼
                    ┌───────────┐         ┌────────────┐
                    │  User's   │         │ Cloudflare │
                    │  Machine  │         │  Sandbox   │
                    └───────────┘         └────────────┘
```

---

## Components

### 1. App UI (Chat Interface)
- Web-based chat interface
- Users interact with soft agents
- Real-time via WebSocket
- Session management and history

### 2. Soft Agents (Personas)
- **What they are**: System prompts + personality + domain knowledge
- **What they're NOT**: Separate runtimes, API keys, or tool implementations
- **Storage**: Agent configs in database (name, description, systemPrompt, skills, permissions)
- **Examples**: Brand Manager, Research Assistant, Code Reviewer

### 3. App Sys Agent (The Brain)
- Central intelligence running in Stellabot
- Direct connection to Anthropic API
- Executes soft agent personas by injecting their system prompts
- Has access to all cloud tools
- Handles tool dispatch and permission enforcement

### 4. Cloud Tools (Direct Integrations)
| Tool | Purpose |
|------|---------|
| **Anthropic API** | LLM inference |
| **Google Sheets** | Spreadsheet read/write |
| **Google Drive** | File listing (future) |
| **Slack API** | Messaging, channels |
| **Database** | Stellabot data (Neon PostgreSQL) |
| **Email** | Notifications (future) |

### 5. Clawdbot (Hardware Access Tool)
- **Purpose**: Access user's physical machines
- **Capabilities**:
  - File system operations
  - Run local processes/scripts
  - Screen capture
  - Camera access
  - Node control (paired devices)
- **Integration**: REST API call from sys agent
- **NOT responsible for**: Cloud APIs, LLM calls, business logic

### 6. MoltWorker (Sandboxed Execution)
- **Purpose**: Run untrusted code safely
- **Platform**: Cloudflare Workers + Containers
- **Use cases**: Code execution, web scraping, isolated tasks
- **Integration**: REST API call from sys agent

---

## Data Flow

### User Chats with Soft Agent
```
1. User sends message via App UI
2. App identifies target soft agent (e.g., Brand Manager)
3. App Sys Agent receives message + soft agent's system prompt
4. Sys Agent calls Anthropic API with combined context
5. Sys Agent executes any tool calls (Sheets, Slack, etc.)
6. Response returned to user via App UI
```

### Soft Agent Needs Hardware Access
```
1. Sys Agent determines task requires local machine access
2. Sys Agent calls Clawdbot API with task
3. Clawdbot executes on user's machine
4. Result returned to Sys Agent
5. Sys Agent incorporates result and responds
```

### Agent-to-Agent Communication
```
1. Soft Agent A (via Sys Agent) needs input from Soft Agent B
2. Sys Agent switches context to Agent B's prompt
3. Gets response, switches back to Agent A
4. Continues with combined context
   
   OR (for async/complex):
   
1. Sys Agent spawns separate session for Agent B
2. Agent B works independently
3. Result stored, Agent A notified
```

---

## API Contracts

### Clawdbot API (called by Sys Agent)

**Endpoint**: `POST {clawdbot_url}/v1/chat/completions`

**Purpose**: Execute tasks requiring local machine access

**Request**:
```json
{
  "model": "claude-sonnet-4-20250514",
  "messages": [
    {"role": "user", "content": "Read the file ~/documents/report.txt"}
  ],
  "stream": false
}
```

**When to call**:
- File operations on user's machine
- Running local scripts/processes
- Accessing paired nodes (cameras, screens)
- Any task requiring physical machine presence

**When NOT to call**:
- Cloud API operations (Sheets, Slack)
- Database queries
- Pure reasoning tasks

### MoltWorker API (called by Sys Agent)

**Endpoint**: `POST {moltworker_url}/execute`

**Purpose**: Sandboxed code execution

**Request**:
```json
{
  "code": "console.log('hello')",
  "language": "javascript",
  "timeout": 30000
}
```

---

## Soft Agent Schema

```typescript
interface SoftAgent {
  id: string;
  name: string;
  description: string;
  
  // The personality/expertise
  systemPrompt: string;
  
  // Skill tags for routing
  skills: string[];  // ['writing', 'data-analysis', 'code-review']
  
  // What tools this agent can use
  permissions: {
    canAccessSheets: boolean;
    canAccessSlack: boolean;
    canAccessClawdbot: boolean;
    canAccessMoltWorker: boolean;
    canAccessDatabase: boolean;
  };
  
  // Organization ownership
  organizationId: string;
  
  // Optional: specific model override
  model?: string;
}
```

---

## Permission Model

Soft agents have explicit permissions for each tool:

| Agent | Sheets | Slack | Clawdbot | MoltWorker | DB |
|-------|--------|-------|----------|------------|-----|
| Brand Manager | ✅ | ❌ | ❌ | ❌ | ✅ |
| DevOps Agent | ❌ | ✅ | ✅ | ✅ | ✅ |
| Reader Agent | ✅ (read) | ❌ | ❌ | ❌ | ✅ (read) |

Sys Agent enforces permissions at tool dispatch time.

---

## Multi-Tenant Isolation

- Each organization has its own soft agents
- Sys Agent includes `organizationId` in all contexts
- Tool calls scoped to org's resources:
  - Sheets: Org's connected Google account
  - Clawdbot: Org's registered machines
  - Database: Row-level security by org
- Session isolation prevents cross-org data leakage

---

## Implementation Phases

### Phase 1: Core Sys Agent ✅ (current)
- [x] Anthropic API integration in Stellabot
- [x] Soft agent storage (database schema)
- [x] Basic chat routing
- [ ] System prompt injection for soft agents
- [ ] Session management

### Phase 2: Cloud Tools
- [ ] Google Sheets integration (OAuth done)
- [ ] Slack integration
- [ ] Tool dispatch from Sys Agent
- [ ] Permission enforcement

### Phase 3: Hardware Integration
- [ ] Clawdbot as tool (API contract)
- [ ] Machine registry (which Clawdbot for which org)
- [ ] Secure communication (auth tokens)

### Phase 4: Sandboxed Execution
- [ ] MoltWorker integration
- [ ] Code execution requests from Sys Agent
- [ ] Result handling

### Phase 5: Advanced
- [ ] Agent-to-agent communication
- [ ] Scheduled agent tasks
- [ ] Webhook triggers
- [ ] Usage tracking per org

---

## Key Principles

1. **Soft agents are prompts, not programs** — No separate runtimes, no API keys per agent

2. **One brain (Sys Agent), many personas** — Sys Agent + soft agent prompt = specialized agent

3. **Clawdbot = hardware access only** — Don't duplicate cloud capabilities

4. **Tools are APIs** — Everything the Sys Agent uses is a clean API call

5. **Permissions are explicit** — Each soft agent declares what tools it can use

6. **Cloud-first, hardware when needed** — Most tasks never touch Clawdbot

---

## Security Considerations

- **API Keys**: Stored as Fly.io secrets, never exposed to soft agents
- **Clawdbot Auth**: Machine tokens for authenticated access
- **Org Isolation**: All queries scoped by organizationId
- **Tool Permissions**: Enforced at Sys Agent level, not trusted from client
- **Audit Logging**: All tool calls logged with org, agent, user context

---

## Implementation Status (Updated 2026-02-06)

### ✅ Completed

**Soft Agent Runtime** (`/api/soft-agent/:agentId/chat/sync`)
- System prompt injection from agent config
- Anthropic API direct integration
- Full tool use loop (up to 10 iterations)
- Permission checking at tool dispatch

**Cloud Tools**
- `sheets_read` - Read from Google Sheets
- `sheets_write` - Write to Google Sheets  
- `sheets_append` - Append rows to Sheets
- `calendar_list` - List upcoming events
- `calendar_create` - Create calendar events
- `gmail_send` - Send emails
- `gmail_search` - Search emails
- `db_query` - Read-only database access (org-scoped)

**Hardware Tool**
- `clawdbot` - Escalate to Clawdbot for local machine access
  - Finds org's connected machine
  - Sends task via Clawdbot API
  - Returns result to soft agent

**Sandbox Tool** (placeholder)
- `sandbox_execute` - Run code in MoltWorker (requires MOLTWORKER_URL)

**Permissions API** (`/api/agent-permissions`)
- GET `/available` - List available permissions
- GET `/:agentId` - Get agent's permissions
- POST `/:agentId/grant` - Grant permission
- POST `/:agentId/revoke` - Revoke permission
- POST `/:agentId/bulk` - Set all permissions at once

### 🔧 Configuration Required

1. **Anthropic API Key** - Set `ANTHROPIC_API_KEY` on Fly.io
   ```bash
   fly secrets set ANTHROPIC_API_KEY="sk-ant-api03-..." --app stellabot-app
   ```

2. **Agent Permissions** - Grant tools via API or DB
   ```bash
   # Example: Grant Google tools to Brand Manager
   curl -X POST https://stellabot.app/api/agent-permissions/AGENT_ID/grant \
     -H "Content-Type: application/json" \
     -d '{"action": "google"}'
   ```

### Permission Keys

| Key | Tools Granted |
|-----|--------------|
| `*` | All tools |
| `google` | sheets_*, calendar_*, gmail_* |
| `database` | db_query |
| `clawdbot` | clawdbot |
| `sandbox` | sandbox_execute |
