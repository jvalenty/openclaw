# Spec: OrgID Firewall + Safe SysAdmin Org Selection (No Chat Bleed)

**Owner:** Bella

**Status:** Draft for review

## Problem Statement
We currently treat `orgId` as an *optional* filter in multiple endpoints (pattern: `if (orgId) { where org_id = orgId }`).

For sys_admin users, when `orgId` is missing/undefined (client bug, race, org switch, or server helper returning null), the server returns or mutates data across orgs.

This creates:
- **Chat thread bleed:** reading/writing chat sessions/messages from the wrong org.
- **Integrity failures:** UI can show agent/session state from other orgs.
- **System UI confusion:** “System org” pages do not behave as true system-scoped views.

John’s requirements:
- `org_id` is a **firewall** (hard isolation).
- sys_admin can **select an org scope** and work safely inside it.
- No bandaids, no quick fixes: **contract + tests + invariants**.

## Goals
1) **Hard guarantee:** No cross-org read/write is possible through org-scoped endpoints.
2) **Safe sys_admin behavior:** sys_admin must provide an explicit effective org scope for org-scoped operations.
3) **System scope is explicit:** sys_admin selects an `is_system=true` org as the effectiveOrgId. Server widens queries only when the resolved org row is explicitly system; missing/invalid orgId never widens.
4) **TDD:** Add integration tests that fail on any regression.

## Non-goals
- Implementing new product features unrelated to scoping.
- Changing data model beyond what’s required to make isolation enforceable.

---

## Proposed Architecture
### A. Two request scopes
Every API route is categorized as one of:

1) **Org-scoped route**
- Requires an `effectiveOrgId`.
- Enforces membership/access for that org.
- Filters by `org_id` on every query and validates FK relationships.

2) **System-scoped route**
- Requires sys_admin.
- Does *not* accept orgId as a filter unless explicitly intended.
- Returns global/system data.

**Hard rule:** No route should silently “fall back” to global when orgId is missing.

### B. Effective org selection (sys_admin)
We need a single server-side contract: for any org-scoped route, the server resolves:

- `effectiveOrgId` from a **required** request field.

Implementation options (pick one; both acceptable):

**Option 1 (simple):** Require `orgId` query param or header on all org-scoped routes
- If missing → `400 Missing orgId`.
- Pros: minimal infra.
- Cons: client must remember to pass it.

**Option 2 (stronger):** Store `effectiveOrgId` in the server session
- A dedicated endpoint: `POST /api/session/effective-org` sets it.
- Org-scoped routes read it from session; if missing → 400.
- Pros: eliminates “client forgot orgId” class.
- Cons: requires careful session handling; still testable.

**Recommendation:** Option 1 only (explicit orgId on every org-scoped request) + server middleware hard-400 on missing orgId. No session-stored org context.

### C. Data model invariants
To make “org firewall” enforceable:

1) Ensure core chat tables are org-bound.
- `chat_sessions.org_id NOT NULL`
- `chat_messages.session_id NOT NULL`
- Prefer `chat_messages.org_id NOT NULL` as a denormalized safety belt (optional), but at minimum every message must join through session which is org-bound.

2) Enforce cross-entity org consistency in application logic (and DB constraints where feasible):
- When creating a session: `agent.organization_id` must equal `effectiveOrgId`.
- When fetching agent info: require org boundary (no “by id only” reads).

### D. Client state rules
Even with server firewall, UX needs to stop showing bleed:
- Namespace localStorage keys by `orgId` (and teamId if relevant).
- On org switch: clear active chat tab/session selection or swap to that org’s last active session only.

---

## API Contract Changes
### 1) Chat endpoints
For endpoints like:
- `GET /api/chat/sessions`
- `GET /api/chat/history`
- `POST /api/chat/send`
- `GET /api/agents/:agentId/info`

**Change:** all become org-scoped and must require `effectiveOrgId`.

Rules:
- Missing effective org → 400.
- Resource belongs to different org → 404 (preferred) or 403.
- Remove any logic like:
  ```ts
  if (orgId) conditions.push(eq(chatSessions.orgId, orgId))
  // else return everything
  ```

### 2) Users endpoints
Single-route contract (preferred):
- Keep one users listing route, but require `effectiveOrgId` always.
- If `effectiveOrgId` resolves to an org with `is_system=true`, the server returns global users (sys_admin only).
- Otherwise returns users scoped to that org.

Hard rule: failure to resolve org (missing orgId / bad orgId) must 400 and must never widen to global.

### 3) Webchat status
Current behavior (per investigation): `/api/webchat/status` depends on Clawdbot health and can show Offline when Clawdbot is degraded.

**Change (new contract):**
- `chatConnected`: true iff backend websocket/SSE chat transport is healthy (independent of tool/machine health).
- `agentAvailable`: depends on selected agent type:
  - soft agent: provider credentials present + provider reachable (or last successful completion < N minutes)
  - hard agent: machine heartbeat recent + tool gateway reachable
- `toolsDegraded`: separate flag/details for machine/tool issues.

Clawdbot health must not be a gate for `chatConnected`.

---

## TDD / Test Plan (must ship with fix)
Add integration tests:

### 1) Org firewall tests
- Create org A and org B.
- Create user U as sys_admin.
- Create agent A in org A; agent B in org B.
- Create chat session S_A in org A.

Assertions:
- With effectiveOrgId=A: can read/write S_A.
- With effectiveOrgId=B: cannot read/write S_A (404/403).
- If org missing: 400.

### 2) Sys admin org switching tests
- Set effectiveOrgId=A, create/read session.
- Switch to B (via endpoint or query param).
- Ensure subsequent listing returns only org B sessions.

### 3) Users listing tests
- `/api/system/users` returns all.
- org-scoped users endpoint returns only org users.

### 4) Client regression tests (if we have Playwright)
- Login as sys_admin.
- Open chat in org A, then switch to org B.
- Ensure sidebar does not show org A threads.

---


## Migration Strategy (existing bad sessions)
When we enforce `chat_sessions.org_id NOT NULL`, we must backfill deterministically:
- If `chat_sessions.org_id` is NULL and `agent_id` is present → set org_id = `agents.organization_id`.
- If agent is missing but org can be inferred from other metadata (team/channel/org mapping) → set accordingly.
- Otherwise quarantine or delete after audit export (count + sample rows before mutation).

Migration must be accompanied by a one-time audit query report (counts by case) committed in the PR description.

## Rollout / Migration
1) Add DB migrations for `chat_sessions.org_id NOT NULL` (and backfill).
2) Update server routes to require effectiveOrgId.
3) Update client to always set effectiveOrgId and namespace local storage.
4) Deploy to dev.
5) Run manual verification: org switch, no bleed.

---

## Decisions
1) Effective org mechanism: explicit orgId on every org-scoped request (query/header). No session-stored org context.
2) Message-level org_id denormalization: **No**. Session FK is sufficient when the firewall is enforced at session level.
3) System scope: the `is_system=true` org row selected as effectiveOrgId (sys_admin only).
