# Org Machine Pool Routing (Remove “Hard Agent” Machine-Centric Routing)

**Status:** Draft

**Owner:** Bella (spec) → Stella (review) → Bella (implementation on go-ahead)

## 1. Problem Statement

We currently conflate two different concepts:

1) **Agent runtime routing** (where LLM chat/completions should execute)
2) **Tool routing to machines** (browser/pty/exec/screen/camera/files via Machine Service)

Legacy code uses `agent.machineId` (and sometimes `agent.endpoint`) as a sentinel that marks an agent as a “hard agent”. In `soft-agent-chat`, any agent with `machineId || endpoint` is rejected with:

> “This is a hard agent. Use its Clawdbot endpoint instead.”

This causes two major failures:

- **Misconfiguration footgun:** If an operator sets `machineId` on a regular soft agent, the agent becomes unusable in soft-agent chat (400 error).
- **Architecture mismatch:** Our new objectives require that **regular agents are not machine-centric**. Machines belong to **org-level pools/meshes**, and tool routing should select an appropriate machine for a session.

Additionally, some tool paths (notably `executeBrowserTool`) bypass our more capable machine resolver (mesh + authorizations) and instead hard-require a machine record owned by the org (`machines.orgId == ctx.orgId`). This prevents transparent use of shared/authorized machines.

## 2. Goals

- Remove legacy “hard agent” routing triggered by `agent.machineId`.
- Make **tool routing machine selection** an **org/session-level concern**.
- Support an org being assigned **0..N machines** from a pool (owned and/or authorized).
- Ensure all machine-service tools (browser/pty/exec/screen/camera/files) route through a single resolver that supports:
  - mesh routing
  - org-owned machines
  - platform machines
  - cross-org machine authorizations
  - quotas and usage tracking
  - session stickiness

## 3. Non-goals

- No new UX polish beyond what is required for correctness.
- Not redesigning the entire permissions system in this change.
- Not removing legacy endpoint-based remote runtimes yet (we’ll preserve compatibility).

## 4. Definitions

- **Soft agent:** LLM chat/completions are executed in Stellabot (server-side). Tools may be executed either as cloud tools or routed to a machine service.
- **Remote runtime agent (legacy hard agent):** Agent has a concrete `endpoint` that can receive chat/completions directly (old Clawdbot pattern).
- **Machine Service:** HTTP service (port 18900 or tunnel) providing browser/pty/exec/files/screen/camera.
- **Org machine pool:** Set of machines an org can use (owned machines + authorized machines).
- **Mesh routing:** Selecting a machine for a session based on availability/capabilities with stickiness.

## 5. Current Behavior (Observed)

### 5.1 Soft-agent chat routing guard
- `soft-agent-chat.ts` rejects any agent where `agent.machineId || agent.endpoint`.
- This makes setting `machineId` on agents unsafe.

### 5.2 Browser tool routing bypass
- `executeBrowserTool()` default path queries `machines` by `machines.orgId == ctx.orgId`.
- It does **not** invoke `resolveMachineService(undefined, orgId, {sessionId})`.
- `resolveMachineService()` supports `machine_authorizations`, but is only used when `input.machine` is provided.

## 6. Proposed Design

### 6.1 Remove machine-centric routing from agents

**Principle:** agent records should not be the primary carrier of machine routing state.

- Deprecate `agents.machineId` for routing.
- `agents.endpoint` remains (for compatibility) but should not block soft-agent chat. It should be used only when the caller explicitly chooses “remote runtime agent chat”.

### 6.2 Introduce a single default machine resolver path for all machine-service tools

**All machine-service tools** should resolve a machine using the same mechanism:

`resolveMachineService(machineIdOrName?: string, orgId: string, opts?: { sessionId, requiredCapability })`

- If `machineIdOrName` is provided: resolve that machine with ownership/platform/auth checks.
- If not provided: use **mesh routing** (session sticky) → fallback to org default machine → fallback to env default (legacy).

This aligns with the existing `mesh-machines-sticky-origin.md` pattern.

### 6.3 Org machine pool / authorization model

We already have:

- `machines` (owned/registered machine records)
- `machine_authorizations` (cross-org access)

**Ideal behavior:** when selecting a default machine for an org/session, include:

- machines owned by org (`machines.orgId == orgId`)
- platform machines (`machines.isPlatform == true`)
- machines authorized for org (`machine_authorizations.orgId == orgId AND enabled=true`)

### 6.4 Session stickiness

Once a machine is selected for a session, it should remain pinned unless:

- machine becomes unreachable
- capability required is missing
- quota exceeded

A “failover” event should be recorded and visible in logs.

## 7. API / Tooling Changes (High-level)

### 7.1 Soft-agent chat

- Remove the guard that blocks agents with `machineId`.
- Replace “hard agent” concept with explicit routing only for agents with `endpoint` **when the caller explicitly uses it**.

### 7.2 Tool execution

- Browser tools: replace direct DB lookup by `machines.orgId == ctx.orgId` with `resolveMachineService(undefined, ctx.orgId, {sessionId, requiredCapability: 'browser'})`.
- PTY/exec/screen/camera/files: ensure they use the same resolver path.

## 8. Migration Plan

### Phase 0 (Safety + Compatibility)
- Stop blocking soft-agent chat based on `agent.machineId`.
- Keep existing DB schema intact.

### Phase 1 (Correct Routing)
- Route browser tools through the resolver/mesh by default.
- Ensure authorizations are honored without requiring `input.machine`.

### Phase 2 (Schema Hygiene)
- Deprecate/remove `agents.machineId` usage.
- Optionally remove the column or keep it as informational only (no routing semantics).

## 9. Acceptance Criteria

- Setting `machineId` on an agent does not break soft-agent chat.
- An org with an authorized machine (via `machine_authorizations`) can use browser tools without specifying `machine` explicitly.
- Machine selection is session-sticky and fails over gracefully.
- No “Expired hard agent” errors appear for regular agents.

## 10. Open Questions (for Stella review)

1) Do we want to preserve `agents.endpoint` as a supported “remote runtime agent” path long-term, or schedule a full removal?
2) Where should session→machine pinning live (existing session metadata table vs dedicated table)?
3) What are the minimal capability tags needed for mesh routing (browser/pty/files/screen/camera), and where do we store them?

---

## Appendix: Relevant Code Hotspots

- `server/routes/soft-agent-chat.ts`
  - hard-agent guard: `if (agent.machineId || agent.endpoint) return 400 ...`
  - browser routing: `executeBrowserTool()`
  - resolver: `resolveMachineService()`

- Existing spec references
  - `docs/specs/mesh-machines-sticky-origin.md`
  - `docs/specs/org-firewall-effective-orgid.md`
