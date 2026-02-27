# Open Bugs (Against Invariants)

Each bug references the invariant or acceptance test it violates.

---

## BUG-01: Apply-to-Machine proceeds when machine is unreachable

**Violates:** Invariant "Apply-to-Machine safety" + Acceptance Test B

**Status:** Partially fixed — UI disables Apply button when live config fails to load. Server-side preflight still pending.

**Root cause:**
`applyMachineOpenclawConfig` in `server/routes/machine-openclaw-config.ts`:
1. Checks only that `machineServiceUrl` is *configured* (not null)
2. Tries to read live config; silently catches failure → `liveConfig = {}`
3. Proceeds to write config anyway — against an unreachable machine

**Required fix (server, pending):**
- Add preflight reachability check (e.g. `GET /health` on Machine Service)
- Return `503 { error: "Machine not reachable for push" }` if health check fails

---

## BUG-02: UI state model conflates three distinct states

**Violates:** Invariant "State model (UI)"

**Subissue (fixed 2026-02-26):** Machine Service heartbeat was sending `status: poolStatus.running ? 'online' : 'offline'`. Browser pool not initialized → every heartbeat reported `offline` even though the machine was fully reachable. Fixed: always send `status: 'online'` from Machine Service heartbeat — pool state ≠ machine state.

**Remaining root cause:**
A machine can heartbeat as `online` but still be unreachable for config push (tunnel broken, wrong token, etc.).

**Required fix:**
- Add `reachableForPush: boolean` to machine status API
- UI shows three distinct indicators: last heartbeat / reachable-for-push / config source

---

## BUG-03: Apply-to-Machine can write empty identity fields

**Violates:** Invariant "Apply-to-Machine safety"

**Root cause:**
If machine's stored config has empty `agentId`, `name`, or `workspace`, the template generates a config with empty identity fields.

**Required fix:**
- Validate `agent.id`, `agent.name`, `agent.workspace` non-empty before Apply
- Return `400` if any are empty

---

## BUG-04: machine_service_token mismatch silently breaks reachability

**Fixed 2026-02-26.**

**Root cause:**
Stellabot DB `machines.machine_service_token` can drift from the actual token in Machine Service `config.auth.token`. `getMachineServiceHeaders()` uses the DB value. If they mismatch:
- `/health` returns 401 → "Could not reach machine" in UI
- Live config load fails silently
- Apply-to-Machine writes nothing but reports success

**Detection method (reachability checklist):**
1. `curl https://<tunnel>/health` → should return 200 (no auth needed)
2. `curl -H "Authorization: Bearer <DB machine_service_token>" https://<tunnel>/files/read ...` → 200 means token matches, 401 means mismatch
3. Compare `left(DB.machine_service_token, 8)` vs `config.auth.token` prefix on machine

**Fix applied:**
- Updated `machines.machine_service_token` in DB to match live `config.auth.token` value for both Stella and Bella

---

## BUG-05: Heartbeat gap during Apply-to-Machine restart marks machine offline

**Observed 2026-02-26.**

**Root cause:**
Apply-to-Machine restarts the OpenClaw gateway. If Machine Service also restarts (or heartbeat delay > 5min), the auto-offline query in `listMachines` triggers and marks the machine offline. The next heartbeat doesn't immediately fix it if the heartbeat sends `status: 'offline'` (see BUG-02).

**Mitigation:**
- Fixed BUG-02 so heartbeats always report `online`
- Sending a bridging heartbeat POST manually resolves immediately

**Required fix:**
- Apply-to-Machine should send a synthetic heartbeat (or suppress auto-offline) during the restart window
- Or: auto-offline logic should use `reachable-for-push` check, not just `last_heartbeat` age

---

*Last updated: 2026-02-26*
*Author: Stella*
