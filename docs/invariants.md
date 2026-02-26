# OpenClaw / Stellabot — Invariants (Contract)

This document defines **what must always be true** for the system to be considered correct.

## Sources of truth

### 1) Secrets
- **Canonical source:** Stellabot secrets.
- **Propagation mechanism:** "Apply to Machine" generates `openclaw.json` with real secrets and pushes it to the machine.
- **Rule:** No long‑lived manual secret edits on machines. Manual edits are emergency-only and must be overwritten by the next Apply.

### 2) Runtime config
- **Canonical source:** Machine-local `~/.openclaw/openclaw.json`.
- UI must treat any rendered config as **"template at last apply"** unless it has positively confirmed it fetched the current file from the machine.

### 3) Agent workspaces
- **Canonical source:** `jvalenty/openclaw` git repo.
- Layout is **per-agent** under `agents/<name>/` with shared rules under `agents/shared/`.

## Apply-to-Machine safety
- Apply-to-Machine must be **disabled** unless the machine is **reachable for push** (control plane reachable), not merely "last-seen/online".
- Apply-to-Machine must never generate configs with empty required identity fields (agent id/name/workspace).

## Defaults must not surprise
- No hardcoded defaults that create unintended behavior:
  - `messages.responsePrefix` must be `""` (empty) or unset (never `"off"` or `"auto"` if those produce visible prefixes).
  - Model defaults must be explicit and documented; generator must not silently fall back to an unexpected frontier model.

## State model (UI)
The UI must clearly separate these states:
- **Heartbeat online/last seen** (machine reported in recently)
- **Reachable for push** (Stellabot can connect to machine service / tunnel)
- **Running config** (the config file currently running on the gateway)

If any of these are unknown, UI must say so and block destructive actions.
