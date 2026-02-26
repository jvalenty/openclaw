# Open Bugs (Against Invariants)

Each bug references the invariant or acceptance test it violates.

---

## BUG-01: Apply-to-Machine proceeds when machine is unreachable

**Violates:** Invariant "Apply-to-Machine safety" + Acceptance Test B

**Root cause:**
`applyMachineOpenclawConfig` in `server/routes/machine-openclaw-config.ts`:
1. Checks only that `machineServiceUrl` is *configured* (not null)
2. Tries to read live config; silently catches failure → `liveConfig = {}`
3. Proceeds to write config anyway — against an unreachable machine

**Symptoms:**
- UI shows "Could not reach machine" banner but Apply button remains enabled
- Apply returns success even though nothing was written
- UI shows stale Stellabot-stored template values as if they were live

**Required fix (server):**
- Add preflight reachability check (e.g. `GET /health` on Machine Service)
- Return `503 { error: "Machine not reachable for push" }` if health check fails
- Do NOT silently fall through on live config read failure

**Required fix (UI):**
- Separate "heartbeat online" from "reachable for push" in machine status
- Disable Apply-to-Machine button (with tooltip) when not reachable for push
- Label config form clearly: "Template (last applied)" vs "Live config (fetched now)"

---

## BUG-02: UI state model conflates three distinct states

**Violates:** Invariant "State model (UI)"

**Root cause:**
Machines table `status` field is set by heartbeat (POST from machine). A machine can be:
- `online` (heartbeat seen recently) but unreachable for push (tunnel broken, machine service down)
- Config shown in UI may be from last Apply template, not live running config

**Required fix:**
- Add `reachableForPush: boolean` to machine status API response (derived from real-time health check)
- UI must display three distinct indicators:
  1. Last heartbeat (timestamp)
  2. Reachable for push (live check)
  3. Config shown: "template" or "live" with fetch timestamp

---

## BUG-03: Apply-to-Machine can write empty identity fields

**Violates:** Invariant "Apply-to-Machine safety"

**Root cause:**
If machine's stored config has empty `agentId`, `name`, or `workspace`, the template generates a config with empty identity fields. No validation prevents this.

**Required fix:**
- Before Apply, validate that `agent.id`, `agent.name`, `agent.workspace` are non-empty strings
- Return `400 { error: "Agent identity fields incomplete — fix in Config before applying" }` if any are empty

---

*Last updated: 2026-02-26*
*Author: Stella*
