# Spec: Mesh Machines + Sticky Origin for Stateful Tools

**Owner:** Bella

**Status:** Draft

## Goal
Move from legacy “machines are org-assigned” thinking to a **mesh hardware** model:

- Machines are pooled mesh nodes.
- Orgs gain access via **machine_authorizations** (capabilities + quotas + enabled flag).
- **Stateful tool sessions (browser, long-running exec/pty, etc.) must be sticky** to the machine that originated them.

Key user requirement: **keep sessions and browsers on the originating machine**.

## Definitions
- **Mesh node / Machine:** a physical or virtual hardware runtime exposing tool capabilities.
- **Authorization:** an org’s permission to use a machine (and with what limits).
- **Origin machine:** the machine chosen the first time a chat/session uses mesh hardware.
- **Sticky session:** subsequent tool calls for the same stateful session route to the same machine.

## Non-goals
- Designing a full autoscheduler or complex multi-node orchestration.
- Automatic silent failover for stateful sessions.

---

## Architecture

### 1) Authorization is the only gate

### 1a) Machine capability registration
Machines must declare which mesh capabilities they provide so routing can match required tools.

Minimal implementation: use existing `machines.specs` or `machines.config` to publish a boolean map, e.g.:

```json
{
  "capabilities": {
    "browser": true,
    "exec": true,
    "files": true,
    "pty": true
  }
}
```

Router must filter eligible machines by required capability before selection.


For any org-scoped hardware/tool invocation, the platform resolves eligible machines from:

- `machine_authorizations` (org_id, machine_id, enabled, quotas, rate limits)
- machine health/heartbeat
- required capability (browser/files/exec/etc.)

**Hard rule:** `machines.org_id` must not be treated as an ownership/security boundary.

### 2) Sticky origin selection (chat-level)
When a chat session first uses any mesh hardware tool:

- Select an **origin machine** `originMachineId` from eligible machines.
- Persist it on the session:
  - `chat_sessions.mesh_origin_machine_id`

All subsequent hardware tool calls for this chat session route to `mesh_origin_machine_id` by default.

### 3) Sticky browser sessions (tool-level)
Browser sessions are stateful and must never hop machines.

- When a browser session is created/used, associate it to a machine:
  - `browser_sessions.machine_id`
- Tool calls referencing a browser session MUST route to that machine.

If a request provides `browserSessionId` and it belongs to a different machine than the chat’s origin:
- Prefer the browser session’s machine.
- Optionally update `mesh_origin_machine_id` to match if that becomes the dominant state anchor.

### 4) Failure modes (loud)
If the origin machine is unavailable (offline/unreachable):

- **Do not silently fail over** for stateful tools.
- Return a loud error:
  - `ORIGIN_MACHINE_OFFLINE`
  - include last heartbeat + machine id
  - include an explicit action: “reassign required”

For stateless tools (e.g., simple web fetch proxied through hardware), optional failover is allowed, but only when tool is explicitly marked stateless.

### 5) Reassignment flow (explicit)
Provide an explicit “Reassign tools for this session” action:
- User/sys_admin triggers reassignment
- Server selects a new eligible machine and updates `mesh_origin_machine_id`
- Reassignment must explicitly terminate/mark-stale any browser sessions associated with the previous origin machine for this chat session, so the UI cannot keep referencing orphaned tabs. New stateful sessions will start fresh on the new origin.

---

## Legacy Cleanup

### Deprecate / rename `machines.org_id`
`machines.org_id` is a footgun because it looks like ownership. Prefer:
- Drop it if unused, OR
- Rename to `legacy_org_id` with a deprecation comment and forbid its use in routing/authz.

### Replace legacy routing
Audit code paths that:
- filter machines by `machines.org_id`
- assume agent→machine binding

Replace with:
- authorization lookup (`machine_authorizations`)
- sticky origin routing

---

## Data Model Changes

### Required
- `chat_sessions.mesh_origin_machine_id` (nullable initially)
- `browser_sessions.machine_id` (if not already present)

### Optional
- `tool_sessions` table for generic sticky tool sessions (pty/exec), if needed.

---

## Routing Algorithm (pseudocode)

```
resolveMachine(ctx):
  if ctx.browserSessionId:
    return browserSessions[ctx.browserSessionId].machineId

  if ctx.chatSession.mesh_origin_machine_id:
    return ctx.chatSession.mesh_origin_machine_id

  eligible = listAuthorizedMachines(ctx.orgId, ctx.requiredCapability)
  if eligible empty:
    error NO_AUTHORIZED_MACHINE  // UI should render: 'No machines available. Contact your admin.'

  origin = pick(eligible)  // deterministic: most recent heartbeat
  persist chatSession.mesh_origin_machine_id = origin
  return origin
```

---

## Tests (minimum)
1) **Sticky browser:** create browser session → subsequent calls route to same machine.
2) **Sticky origin:** first hardware tool call sets origin → subsequent calls use origin.
3) **Origin offline:** origin down → request fails loud with reassign required.
4) **Authorization:** org without machine_authorizations cannot use hardware tools.

---

## Rollout
1) Add DB fields.
2) Add routing logic behind a feature flag.
3) Migrate legacy paths off `machines.org_id`.
4) Enable flag in dev → verify.
5) Enable in prod.
