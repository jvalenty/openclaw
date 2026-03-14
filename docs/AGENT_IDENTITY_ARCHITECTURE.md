# Agent Identity Architecture

## Overview

Agents are first-class workspace citizens with full identity parity to human employees. This document outlines the architecture for multi-surface, user-centric agent interactions.

## Core Principles

### 1. Agents Are Colleagues, Not Tools
- Agents have the same identity model as human employees
- Can be DM'd, @mentioned, emailed, added to channels
- Show up in contact lists across all platforms
- Use existing messaging UX patterns (no special "AI chat" paradigm)

### 2. User-Centric Threading
- The **user** is the constant, not the channel
- One conversation thread follows the user across surfaces
- Thread is source of truth, surfaces are transports

### 3. Surfaces Are Views
- Web chat, Telegram, Slack, Email = windows into the same thread
- Each surface has appropriate capabilities
- User experience adapts to surface, context persists

## Identity Model

### Agent Identity
```
Agent: "Support Agent"
├── Email: support@acme.com
├── Slack: @support-agent  
├── Telegram: @acme_support_bot
├── Discord: Support#1234
└── App: "Support Agent" in contacts
```

### User Identity
```
User: "John"
├── Surfaces:
│   ├── Web Chat (stellabot.app)
│   ├── Telegram (@johnvalenty)
│   ├── Slack (john@acme.com)
│   └── Email (john@acme.com)
└── Threads:
    ├── Thread with Support Agent
    ├── Thread with Dev Agent
    └── Thread with Agent Team (group)
```

## Thread Model

### One-to-One (User ↔ Agent)
```
User DMs Agent on Slack → Thread A
Same User DMs same Agent on Telegram → Same Thread A
Same User emails Agent → Same Thread A
```

All surfaces route to the same underlying conversation.

### Group Threads (User ↔ Agent Team)
- Multiple agents can participate in a thread
- Agents can @mention each other
- Works like a Slack channel with multiple team members

## Surface Hierarchy

| Surface | Role | Capabilities |
|---------|------|--------------|
| **Web Chat** | Source of truth | Full history, searchable, file uploads, rich UI |
| **Slack** | Business-class | Threading, channels, integrations, enterprise features |
| **Telegram** | Mobile convenience | Quick access, notifications, on-the-go |
| **Email** | Async/formal | Long-form, attachments, CC/forward, audit trail |
| **Discord** | Community | Servers, roles, voice channels |

## Routing Logic

### Current Message → Reply Routing
- Message arrives from Surface X
- Thread identified by User + Agent
- Reply routes to Surface X (origin-based)

### Future: Presence-Aware Routing
- Track user's active surface
- Route proactive messages to active surface
- Fall back to configured default

```json
{
  "user": "john",
  "activeSurface": "webapp",
  "fallback": "telegram",
  "preferences": {
    "urgentNotifications": "telegram",
    "dailySummary": "email"
  }
}
```

## Multi-Tenant (Org) Model

### Organization Structure
```
Org (Acme Corp)
├── Org Admin (John)
│   ├── Surfaces (Slack, Web, Mobile)
│   └── Threads with:
│       ├── Support Agent
│       ├── Dev Agent
│       └── Agent Team
└── Agents (issued to org)
    ├── Support Agent (support@acme.com)
    ├── Dev Agent (dev@acme.com)
    └── Analytics Agent (analytics@acme.com)
```

### Isolation
- Org data doesn't leak across orgs
- Agent context is org-scoped
- User can manage multiple orgs (separate contexts)

## Implementation Phases

### Phase 1: Foundation (Current)
- [x] Unified session context (dmScope: main)
- [x] Web chat as primary interface
- [x] Telegram integration (convenience)
- [x] Basic agent identity

### Phase 2: Full Identity
- [ ] Agent email addresses
- [ ] Slack OAuth integration
- [ ] Identity linking across platforms
- [ ] Thread persistence across surfaces

### Phase 3: Smart Routing
- [ ] Presence tracking
- [ ] Active surface detection
- [ ] Proactive message routing
- [ ] Surface-adaptive responses

### Phase 4: Multi-Agent
- [ ] Agent teams
- [ ] Group threads with multiple agents
- [ ] Agent-to-agent communication
- [ ] Delegation and handoff

## Technical Components

### Session Manager
- Maps User + Agent → Thread
- Handles surface routing
- Persists conversation context

### Identity Linker
- Maps platform IDs to canonical user
- Handles auth across surfaces
- Manages agent identities

### Router
- Determines reply surface
- Handles presence-based routing
- Manages notification dedup

### Thread Store
- Source of truth for conversations
- Searchable history
- Cross-surface message sync

## Key Decisions

1. **Thread lives in backend, not surface** - Surfaces are views
2. **Web chat is canonical** - Searchable, full-featured, source of truth
3. **Agents get real identities** - Email, Slack user, etc.
4. **Use existing patterns** - DM an agent like DM a colleague
5. **Org-scoped context** - No data leakage across organizations

---

*Document created: 2026-01-28*
*Based on architecture session with John Valenty*
