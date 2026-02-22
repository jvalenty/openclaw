# Clawdbot Architecture Deep Dive
## For Forking: Multi-Tenant, Web Interface, Team-Oriented Agent Factory

**Date:** 2026-01-29
**Version Analyzed:** 2026.1.24-3
**Purpose:** Guide for building a custom fork focused on multi-tenant deployment, centralized machine management, and team-oriented agent factory.

---

## 1. High-Level Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLAWDBOT                                │
├─────────────────────────────────────────────────────────────────┤
│  CLI Entry (entry.js)                                           │
│     └── Commands: gateway, tui, agent, doctor, config, etc.     │
├─────────────────────────────────────────────────────────────────┤
│  GATEWAY SERVER (server.impl.js)                                │
│     ├── HTTP Server (Express + Hono)                            │
│     ├── WebSocket (control UI, mobile apps)                     │
│     ├── Channel Manager (Telegram, Discord, WhatsApp, etc.)     │
│     ├── Session Manager                                         │
│     ├── Cron Service                                            │
│     ├── Node Registry (remote machine pairing)                  │
│     ├── Plugin Registry                                         │
│     └── Provider System (LLM backends)                          │
├─────────────────────────────────────────────────────────────────┤
│  AGENTS                                                         │
│     ├── Pi-Agent Core (via @mariozechner packages)              │
│     ├── Tool System (exec, browser, web, etc.)                  │
│     ├── Memory/Search System                                    │
│     ├── Subagent Registry                                       │
│     └── Skills System                                           │
├─────────────────────────────────────────────────────────────────┤
│  DATA LAYER                                                     │
│     ├── JSON Config (~/.clawdbot/clawdbot.json)                 │
│     ├── Session Transcripts (JSONL files)                       │
│     ├── SQLite (memory search index, vector store)              │
│     └── File-based State (credentials, logs, media)             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Components Breakdown

### 2.1 Gateway Server (`dist/gateway/`)

The Gateway is the central orchestration layer. Key files:

| File | Purpose |
|------|---------|
| `server.impl.js` | Main server initialization (18KB) - orchestrates all components |
| `server-channels.js` | Channel lifecycle management |
| `server-chat.js` | Chat message routing |
| `server-cron.js` | Cron/scheduled job service |
| `server-http.js` | HTTP endpoints (OpenAI-compatible, control UI) |
| `server-providers.js` | LLM provider management |
| `session-utils.js` | Session state management (20KB) |
| `auth.js` | Gateway authentication (token/password/Tailscale) |
| `node-registry.js` | Remote node (mobile/desktop) registration |

**Key Patterns:**
- Gateway runs as a long-lived daemon
- Single process handles all channels/sessions
- State stored in file system (no external DB required)
- WebSocket for real-time UI communication

### 2.2 Channel System (`dist/channels/`)

Modular messaging channel architecture:

```
channels/
├── plugins/           # Channel implementations
│   ├── telegram.js
│   ├── discord.js
│   ├── whatsapp.js
│   ├── slack.js
│   ├── signal.js
│   ├── imessage.js
│   └── googlechat.js
├── registry.js        # Channel metadata & ordering
├── dock.js           # Channel lifecycle (14KB)
├── channel-config.js  # Per-channel config helpers
└── plugins/types.*.js # Type definitions
```

**Channel Plugin Interface:**
Each channel plugin exports:
- `id` - Unique identifier
- `meta` - Display info, docs links
- `onMessage` - Inbound message handler
- `send` - Outbound message method
- `gatewayMethods` - RPC methods it exposes
- `onStart/onStop` - Lifecycle hooks

### 2.3 Agent System (`dist/agents/`)

The agent execution layer. Key components:

| Component | Files | Purpose |
|-----------|-------|---------|
| **Agent Scope** | `agent-scope.js` | Workspace/agent resolution |
| **System Prompt** | `system-prompt.js` (24KB) | Dynamic prompt generation |
| **Tool System** | `tools/`, `pi-tools.js` (14KB) | Tool definitions & execution |
| **Bash Tools** | `bash-tools.exec.js` (54KB) | Shell execution (major!) |
| **Subagents** | `subagent-*.js` | Background task spawning |
| **Skills** | `skills/`, `skills-install.js` | Skill discovery & loading |
| **Memory Search** | `memory-search.js` | Semantic search over memory files |
| **Model Selection** | `model-selection.js`, `model-fallback.js` | Multi-model routing |

**Tool Categories (from `tools/` directory):**
- Browser automation
- Cron management
- File read/write/edit
- Gateway control
- Image analysis
- Memory search
- Message sending
- Node control (remote machines)
- Process management
- Session spawning
- TTS
- Web search/fetch

### 2.4 Session Management

Sessions are the conversation containers:

**Storage Structure:**
```
~/.clawdbot/
├── agents/
│   └── {agentId}/
│       ├── agent/
│       │   └── auth-profiles.json
│       └── sessions/
│           ├── {uuid}.jsonl        # Transcript (append-only)
│           └── {uuid}.jsonl.deleted.{timestamp}  # Soft deletes
```

**Session Key Format:**
- Direct: `telegram:dm:123456789`
- Group: `telegram:group:-1001234567890`
- Subagent: `main:subagent:abc123`
- With agent: `agent:main:telegram:dm:123456789`

**Session Store (`session-store.json`):**
```json
{
  "telegram:dm:123456789": {
    "sessionId": "uuid-v4",
    "channel": "telegram",
    "chatType": "direct",
    "updatedAt": 1706544000000,
    "displayName": "John",
    "modelOverride": null
  }
}
```

### 2.5 Provider System (`dist/providers/`)

LLM provider abstraction:

**Supported Providers:**
- Anthropic (Claude) - primary
- OpenAI (GPT, o1, o3)
- Google (Gemini)
- AWS Bedrock (Claude, etc.)
- Various OpenAI-compatible (Groq, Together, Venice, etc.)

**Provider Config Schema:**
```typescript
{
  baseUrl: string,
  apiKey?: string,
  auth?: "api-key" | "aws-sdk" | "oauth" | "token",
  api?: "openai-completions" | "anthropic-messages" | ...,
  models: ModelDefinition[]
}
```

---

## 3. Configuration System

### 3.1 Config File (`clawdbot.json`)

Single JSON file at `~/.clawdbot/clawdbot.json`:

**Top-Level Structure:**
```typescript
{
  meta: { lastTouchedVersion, lastTouchedAt },
  env: { vars: {} },
  wizard: { lastRunAt, lastRunVersion, ... },
  auth: { profiles: { "provider:name": AuthProfile } },
  agents: {
    defaults: AgentDefaults,
    list: AgentConfig[]  // Named agents
  },
  tools: { exec, message, web, media, ... },
  messages: { tts, ackReactionScope, ... },
  commands: { native, nativeSkills },
  channels: {
    telegram: TelegramConfig,
    discord: DiscordConfig,
    ...
  },
  gateway: {
    port, mode, bind, auth, tailscale, http
  },
  skills: { install, entries },
  plugins: { entries },
  models: { providers, bedrockDiscovery }
}
```

**Key Design Decisions:**
- Flat JSON (no YAML)
- Zod schema validation (`config/zod-schema.*.js`)
- Environment variable substitution supported
- Legacy migration system for breaking changes
- Config includes backups (`.bak` files)

### 3.2 Runtime Config Loading

```javascript
// config/io.js
loadConfig() → reads & validates clawdbot.json
writeConfigFile(config) → atomic write with backup
readConfigFileSnapshot() → raw read with validation status
```

---

## 4. Data Storage Model

### 4.1 Directory Structure
```
~/.clawdbot/
├── clawdbot.json           # Main config
├── clawdbot.json.bak       # Config backups
├── agents/
│   └── {agentId}/
│       ├── agent/
│       │   └── auth-profiles.json  # Agent-specific auth
│       └── sessions/
│           └── *.jsonl     # Session transcripts
├── browser/                # Playwright profile data
├── credentials/            # OAuth tokens, etc.
├── cron/                   # Cron job state
├── devices/                # Paired device info
├── identity/               # Avatar cache
├── logs/                   # Runtime logs
├── media/                  # Downloaded media cache
├── memory/                 # Memory search index (SQLite)
├── subagents/             # Subagent state
├── telegram/              # Telegram-specific state
└── update-check.json      # Update check timestamp
```

### 4.2 Session Transcript Format (JSONL)

Each line is a JSON object:
```json
{"type":"user","content":"hello","timestamp":1706544000000,"sender":{...}}
{"type":"assistant","content":"Hi!","timestamp":1706544001000}
{"type":"tool_use","id":"call_123","name":"read","input":{...}}
{"type":"tool_result","id":"call_123","content":"file contents..."}
```

---

## 5. Skills & Plugins System

### 5.1 Skills (`dist/agents/skills/`)

Skills are agent capabilities loaded at runtime:

**Skill Structure:**
```
skills/
└── {skill-name}/
    ├── SKILL.md        # Instructions (injected into system prompt)
    ├── package.json    # Optional: installable skill
    └── scripts/        # Optional: helper scripts
```

**Skill Loading:**
1. Built-in skills from package
2. Workspace skills from `{workspace}/skills/`
3. Remote skills via `skills.remote[]` config

### 5.2 Plugins (`dist/plugins/`)

Plugins extend the gateway:

**Plugin Types:**
- Channel plugins (messaging platforms)
- Tool plugins (new agent capabilities)
- Provider plugins (LLM backends)

**Plugin SDK:** `dist/plugin-sdk/` exports interfaces for external plugins.

---

## 6. Multi-Tenancy Analysis

### 6.1 Current Limitations (Single-Tenant)

❌ **Single config file** - All settings in one `clawdbot.json`
❌ **Single agent directory** - Sessions bound to machine user
❌ **No user authentication** - Gateway auth is device-level, not user-level
❌ **Shared credentials** - API keys in single config
❌ **No team/org concept** - Everything is personal

### 6.2 Multi-Tenant Modifications Required

| Area | Current | Required Change |
|------|---------|-----------------|
| **Config** | Single JSON file | Per-tenant config (DB or per-tenant files) |
| **Sessions** | File-based per agent | Database with tenant_id foreign key |
| **Auth** | Token/password for gateway | OAuth/OIDC user authentication |
| **Credentials** | In config file | Per-tenant secrets store (encrypted) |
| **Agents** | Single "main" default | Multiple agents per tenant |
| **Billing** | None | Usage tracking + billing integration |

### 6.3 Recommended Multi-Tenant Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MULTI-TENANT CLAWDBOT                        │
├─────────────────────────────────────────────────────────────────┤
│  WEB UI (React/Next.js)                                         │
│     ├── Auth (Cloudflare Access / Auth0)                        │
│     ├── Tenant Dashboard                                        │
│     ├── Agent Configuration UI                                  │
│     └── Session Browser                                         │
├─────────────────────────────────────────────────────────────────┤
│  API LAYER (existing Gateway + extensions)                      │
│     ├── Tenant Context Middleware                               │
│     ├── Per-Tenant Config Loading                               │
│     └── Usage Metering                                          │
├─────────────────────────────────────────────────────────────────┤
│  DATABASE (PostgreSQL)                                          │
│     ├── tenants                                                 │
│     ├── tenant_agents                                           │
│     ├── agent_sessions                                          │
│     ├── session_messages                                        │
│     ├── tenant_credentials (encrypted)                          │
│     └── usage_metrics                                           │
├─────────────────────────────────────────────────────────────────┤
│  WORKER POOL (optional, for scaling)                            │
│     └── Isolated agent execution per tenant                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Security Model

### 7.1 Current Security Features

✅ **Gateway Auth** - Token/password/Tailscale
✅ **Exec Security** - Allowlist/full/deny modes
✅ **Channel Allowlists** - DM/group policies per channel
✅ **Tool Policies** - Per-provider tool restrictions
✅ **Sandbox Mode** - E2B/Docker isolation (optional)

### 7.2 Security Considerations for Fork

**Critical:**
- Tenant isolation (prevent cross-tenant data access)
- Credential encryption at rest
- Audit logging
- Rate limiting per tenant
- Input sanitization (prompt injection)

**Recommended:**
- Cloudflare Access for edge auth
- Secrets manager integration (1Password, AWS Secrets Manager)
- SOC2 compliance path

---

## 8. Fork Strategy & MVP

### 8.1 MVP Scope (4-6 weeks)

**Phase 1: Foundation (Week 1-2)**
- [ ] Database schema (tenants, agents, sessions)
- [ ] Tenant authentication (Cloudflare Access)
- [ ] Config loading from DB (replace JSON file)
- [ ] Basic web dashboard shell

**Phase 2: Core Features (Week 3-4)**
- [ ] Agent CRUD via web UI
- [ ] Session transcript storage in DB
- [ ] Per-tenant credential storage
- [ ] Channel configuration UI

**Phase 3: Polish (Week 5-6)**
- [ ] Usage tracking
- [ ] Team/org support (multiple users per tenant)
- [ ] Deployment automation
- [ ] Documentation

### 8.2 What to Keep vs. Replace

**KEEP (Core Value):**
- Agent execution engine (pi-agent integration)
- Tool system (exec, browser, etc.)
- Channel plugins (Telegram, Discord, etc.)
- Skills system
- System prompt generation

**REPLACE:**
- Config system (JSON → DB)
- Session storage (JSONL → DB)
- Authentication (gateway token → OAuth)
- UI (TUI → Web)

**EXTEND:**
- Multi-agent per tenant
- Team collaboration features
- Usage/billing tracking
- Centralized machine management

### 8.3 Machine Management Architecture

For "centralized machine management" requirement:

```
                 ┌─────────────────┐
                 │   CONTROL PLANE │
                 │   (your fork)   │
                 └────────┬────────┘
                          │ WebSocket/gRPC
          ┌───────────────┼───────────────┐
          │               │               │
     ┌────┴────┐    ┌────┴────┐    ┌────┴────┐
     │ Node 1  │    │ Node 2  │    │ Node 3  │
     │(Mac mini)│    │(Server) │    │(Cloud)  │
     └─────────┘    └─────────┘    └─────────┘
```

Use existing `node-registry.js` and pairing system but:
- Register nodes to tenants (not individual users)
- Central node health monitoring
- Skill deployment from control plane to nodes
- Job routing based on node capabilities

### 8.4 Skills: Centralized → Deployed

**Current:** Skills are local to each machine
**Target:** 
1. Skill store in control plane (DB + object storage)
2. On agent config change, push skills to relevant nodes
3. Version management for skills
4. Skill marketplace (optional future)

---

## 9. Key Files to Study

| Priority | File | Size | Why |
|----------|------|------|-----|
| 🔴 | `gateway/server.impl.js` | 18KB | Main orchestration |
| 🔴 | `agents/system-prompt.js` | 24KB | Prompt engineering |
| 🔴 | `config/zod-schema.js` | 17KB | Full config schema |
| 🔴 | `agents/bash-tools.exec.js` | 54KB | Exec tool (critical) |
| 🟡 | `gateway/session-utils.js` | 20KB | Session management |
| 🟡 | `channels/plugins/*.js` | Various | Channel implementations |
| 🟡 | `agents/tools/*.js` | Various | All tool implementations |
| 🟢 | `config/io.js` | 18KB | Config read/write |
| 🟢 | `agents/subagent-*.js` | Various | Subagent system |

---

## 10. Recommendations Summary

### Immediate Actions

1. **Fork the repo** - Start from current stable version
2. **Set up PostgreSQL schema** - Begin with tenants, agents, sessions
3. **Abstract config loading** - Create ConfigProvider interface
4. **Build auth layer** - Cloudflare Access integration
5. **Create web shell** - React dashboard with routing

### Architecture Decisions

| Decision | Recommendation | Rationale |
|----------|----------------|-----------|
| Database | PostgreSQL | Proven, good JSON support, vector extension available |
| Auth | Cloudflare Access | Zero-trust, easy setup, enterprise-ready |
| Web Framework | Next.js/Remix | SSR, good DX, easy deployment |
| Worker Isolation | Docker/Firecracker | Tenant isolation for exec |
| Message Queue | Redis/BullMQ | Async job processing, cron |
| Secrets | 1Password Connect | Already have skill, enterprise-grade |

### Risk Factors

⚠️ **Exec isolation** - Running shell commands multi-tenant is dangerous
⚠️ **Cost tracking** - LLM costs vary wildly, need good metering
⚠️ **Channel credentials** - Each tenant needs own bot tokens
⚠️ **Rate limits** - Aggregate tenant usage vs. API limits

---

## Appendix: Code Metrics

```
Component          Files    Lines (est.)
─────────────────────────────────────────
gateway/           87       ~15,000
agents/            116      ~25,000
config/            81       ~12,000
channels/          22+42    ~8,000
providers/         12       ~3,000
browser/           41       ~8,000
tools/             48       ~10,000
─────────────────────────────────────────
TOTAL              ~450     ~81,000
```

**Dependencies of Note:**
- `@mariozechner/pi-agent-core` - Core agent runtime
- `@whiskeysockets/baileys` - WhatsApp Web
- `grammy` - Telegram Bot API
- `playwright-core` - Browser automation
- `sqlite-vec` - Vector embeddings

---

*Document generated by Stellabot for John Valenty*
*Analysis based on Clawdbot v2026.1.24-3*
