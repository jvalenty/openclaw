# Threads Architecture Spec

**Author:** Stella  
**Date:** 2026-02-11  
**Status:** DRAFT — Awaiting approval

---

## Overview

Replace session-based chat with relationship-based threads. A thread is the permanent, device-agnostic conversation between a user and an agent (or a group and its agents).

### Core Principle

> "Like texting a friend. You open any device, the thread is there."

**Sessions are internal plumbing. Threads are the user experience.**

---

## Thread Types

| Type | Key | Example |
|------|-----|---------|
| **Direct (1:1)** | `(user_id, agent_id)` | John ↔ Stella |
| **Group** | `group_id` | "Project Alpha" ↔ Stella + Dan |

---

## Current State

### What we have (mostly right)

```typescript
// chat-history.ts — already exists
chatSessions: {
  userId: varchar,      // Required for 1:1
  agentId: varchar,     // Required for 1:1  
  groupId: varchar,     // Required for groups
}

// soft-agent-chat.ts — already correct!
async function getOrCreateSession(owner: SessionOwner) {
  // Looks up by (userId, agentId) for 1:1
  // Creates if not exists
  // Returns session ID
}
```

### What's broken

1. **No unique constraint** — nothing prevents duplicate threads for same (user, agent)
2. **Identity fragmentation** — Telegram user 8120973414 ≠ webchat user john@example.com
3. **Webchat creates per-device** — localStorage sessionId doesn't sync
4. **No cross-channel merge** — Telegram messages and webchat messages are in different "sessions"

---

## Target Architecture

### 1. Schema Changes

```sql
-- Add unique constraints to prevent duplicate threads
ALTER TABLE chat_sessions 
ADD CONSTRAINT unique_direct_thread 
UNIQUE (user_id, agent_id) 
WHERE group_id IS NULL;

ALTER TABLE chat_sessions
ADD CONSTRAINT unique_group_thread
UNIQUE (group_id)
WHERE group_id IS NOT NULL;

-- Rename for clarity (optional, can alias)
-- chat_sessions → threads (conceptually)
```

### 2. Identity Resolution

Create canonical user identity that maps external accounts:

```sql
-- users table already exists, add external mappings
CREATE TABLE user_identities (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR NOT NULL,  -- 'telegram', 'discord', 'slack', 'email'
  external_id VARCHAR NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE (provider, external_id)
);

-- Index for fast lookups
CREATE INDEX idx_user_identities_lookup ON user_identities(provider, external_id);
```

**Resolution flow:**
```
Telegram message from user 8120973414
  → Lookup user_identities(telegram, 8120973414)
  → Returns user_id = 'uuid-of-john'
  → Thread lookup: (john-uuid, stella-uuid)
  → Same thread as webchat John
```

### 3. Thread Lookup API

```typescript
// New endpoint: GET /api/threads/resolve
// Returns thread ID for a user+agent pair

interface ThreadResolveRequest {
  agentId: string;
  // One of:
  userId?: string;           // Direct user ID if known
  provider?: string;         // 'telegram', 'discord', etc.
  externalId?: string;       // Provider-specific ID
}

interface ThreadResolveResponse {
  threadId: string;
  created: boolean;          // Was this a new thread?
  userId: string;            // Resolved canonical user ID
  agentId: string;
}

// Implementation:
async function resolveThread(req: ThreadResolveRequest): Promise<ThreadResolveResponse> {
  // 1. Resolve user identity
  let userId = req.userId;
  if (!userId && req.provider && req.externalId) {
    const identity = await lookupIdentity(req.provider, req.externalId);
    if (identity) {
      userId = identity.userId;
    } else {
      // Auto-create user + identity for new external users
      userId = await createUserFromExternal(req.provider, req.externalId);
    }
  }
  
  // 2. Get or create thread
  const thread = await getOrCreateSession({ 
    type: '1:1', 
    userId, 
    agentId: req.agentId 
  });
  
  return { threadId: thread.id, created: thread.isNew, userId, agentId: req.agentId };
}
```

### 4. Channel Integration Updates

Each channel adapter needs to resolve identity before sending to chat:

```typescript
// Telegram adapter (example)
async function handleTelegramMessage(update: TelegramUpdate) {
  const telegramUserId = update.message.from.id.toString();
  
  // Resolve to canonical thread
  const { threadId, userId } = await resolveThread({
    provider: 'telegram',
    externalId: telegramUserId,
    agentId: config.agentId,
  });
  
  // Save message to thread
  await saveMessage(threadId, userId, 'user', update.message.text);
  
  // Process with agent...
}
```

### 5. Webchat Updates

```typescript
// On webchat load:
async function initializeChat(agentId: string) {
  // User must be authenticated
  const user = await getCurrentUser();
  if (!user) {
    return showLoginPrompt();
  }
  
  // Resolve thread (creates if needed)
  const { threadId } = await fetch('/api/threads/resolve', {
    method: 'POST',
    body: JSON.stringify({ userId: user.id, agentId }),
  }).then(r => r.json());
  
  // Load full history
  const history = await fetch(`/api/threads/${threadId}/messages`).then(r => r.json());
  
  // Display — same thread regardless of device
  setMessages(history.messages);
  setThreadId(threadId);
}
```

**Key change:** No more localStorage sessionId. Thread is looked up by (user, agent) every time.

### 6. Group Threads

Groups already have `groupId` key. Main changes:

```typescript
// Group thread participants
CREATE TABLE thread_participants (
  thread_id VARCHAR NOT NULL REFERENCES chat_sessions(id),
  participant_type VARCHAR NOT NULL,  -- 'user' | 'agent'
  participant_id VARCHAR NOT NULL,
  role VARCHAR DEFAULT 'member',      -- 'owner', 'admin', 'member'
  joined_at TIMESTAMP DEFAULT NOW(),
  
  PRIMARY KEY (thread_id, participant_type, participant_id)
);
```

---

## Migration Path

### Phase 1: Schema (non-breaking)
1. Add unique constraints (will fail if duplicates exist)
2. Create `user_identities` table
3. Create `thread_participants` table

### Phase 2: Identity linking
1. Migrate existing Telegram/Discord users to identity mappings
2. Link by email where possible (if Telegram user has email = webchat user email)

### Phase 3: Thread consolidation  
1. Identify duplicate threads per (user, agent)
2. Merge messages into canonical thread
3. Delete duplicate sessions

### Phase 4: Frontend update
1. Remove localStorage session persistence
2. Always resolve thread by (user, agent) on load
3. Remove "new session" concept from UI

---

## API Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/threads/resolve` | POST | Get/create thread for user+agent |
| `/api/threads/:id/messages` | GET | Load thread history |
| `/api/threads/:id/messages` | POST | Send message to thread |
| `/api/users/link-identity` | POST | Link external account to user |

---

## Questions for John

1. **Anonymous users?** Do we support webchat without login? If yes, how do we key threads?
   - Option A: Require login always (cleaner)
   - Option B: Device fingerprint + optional account linking later

2. **Cross-org threads?** Can a user talk to agents in different orgs?
   - Current: Users are scoped to orgs
   - Question: Should threads be org-scoped or user-global?

3. **Thread deletion?** What happens when:
   - User deletes account → Archive threads? Hard delete?
   - Agent deleted → Orphan threads or cascade delete?

4. **Message retention?** Forever? Or configurable per-org?

---

## Success Criteria

- [ ] User opens webchat on phone, sees same history as laptop
- [ ] Telegram messages appear in webchat thread (same user)
- [ ] No concept of "sessions" visible to users
- [ ] Group threads show all participants and their messages
- [ ] Thread persists across agent restarts, server restarts, everything

---

## Implementation Order

1. ✅ Schema already mostly correct
2. 🔨 Add unique constraints + identity table
3. 🔨 Build `/api/threads/resolve` endpoint
4. 🔨 Update channel adapters to use identity resolution
5. 🔨 Update webchat to resolve on load (not localStorage)
6. 🔨 Migration script for existing data
7. 🔨 Group thread participant tracking

---

**Estimated effort:** 2-3 days for core, +1 day for migration/cleanup

Ready to build on approval.
