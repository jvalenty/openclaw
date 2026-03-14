# Soft Sys Admin Agent

> Status: SPEC DRAFT
> Created: 2026-02-23
> Author: Stella

## Problem

Hard agents (Clawdbot gateways) crash and go undetected. There's no independent observer — when an agent dies, we find out when a human notices. Agents can't monitor themselves, and two agents on separate machines both go dark independently.

## Solution

A **soft agent** running on Stellabot (Fly.io) dedicated to infrastructure monitoring and self-healing. Independent infrastructure means it survives when machines go down.

## Architecture

```
┌──────────────────────────────────────────────┐
│  STELLABOT (Fly.io) — Always On              │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Soft Sys Admin Agent                  │  │
│  │                                        │  │
│  │  • Health Monitor (cron, 2-min cycle)  │  │
│  │  • Restart Playbooks                   │  │
│  │  • Alert Router (Slack)                │  │
│  │  • Daily Digest                        │  │
│  └───────────┬────────────────────────────┘  │
│              │                               │
└──────────────┼───────────────────────────────┘
               │ CF Tunnel (primary & only path)
               ▼
┌──────────────────────────────────────────────┐
│  MACHINES (Mac Minis)                        │
│                                              │
│  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Machine Svc  │  │ Clawdbot Gateway     │  │
│  │ (port 18900) │  │ (port 18789)         │  │
│  │              │  │                      │  │
│  │ /health      │  │ /v1/chat/completions │  │
│  │ /exec        │  │                      │  │
│  └──────────────┘  └──────────────────────┘  │
│                                              │
│  launchd KeepAlive for both services         │
└──────────────────────────────────────────────┘
```

## Key Principle: Two Independent Services Per Machine

The Machine Service and Clawdbot Gateway are **separate processes**. When the gateway crashes (most common failure), the Machine Service is still running. The soft sys admin can:

1. Detect gateway is down (health check fails)
2. Restart it via Machine Service `/exec` endpoint
3. Verify it came back

Only when Machine Service itself is also down are we blind — and that's where launchd KeepAlive handles it locally.

## MVP Scope

### 1. Health Monitor

**What it checks (per machine, every 2 minutes):**

| Check | Endpoint | Method | Healthy |
|-------|----------|--------|---------|
| Machine Service | `{tunnel_url}/health` | GET | 200 |
| Clawdbot Gateway | `{clawdbot_url}/v1/chat/completions` | POST (invalid body) | 400 |
| Agent Heartbeat | DB: last heartbeat timestamp | Query | < 30 min ago |

**Health States:**

| State | Meaning |
|-------|---------|
| 🟢 `healthy` | All checks pass |
| 🟡 `degraded` | Gateway down, Machine Service up (can self-heal) |
| 🔴 `down` | Machine Service unreachable (blind) |
| ⚫ `unknown` | No data yet |

**Storage:**

```sql
CREATE TABLE machine_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Individual check results
  machine_service_up BOOLEAN NOT NULL,
  machine_service_latency_ms INTEGER,
  gateway_up BOOLEAN,
  gateway_latency_ms INTEGER,
  agent_heartbeat_at TIMESTAMPTZ,
  
  -- Overall state
  state TEXT NOT NULL DEFAULT 'unknown', -- healthy, degraded, down, unknown
  
  -- Context
  error_details JSONB
);

CREATE INDEX idx_machine_health_machine_time 
  ON machine_health(machine_id, checked_at DESC);

-- Keep 30 days of history, prune older
```

### 2. Self-Healing Playbooks

Automated responses triggered by health state changes.

**Playbook: Gateway Restart**
```
Trigger: Gateway check fails 2x consecutive (4 min)
Condition: Machine Service is UP
Action:
  1. POST {tunnel_url}/exec
     { "command": "launchctl kickstart -k system/com.clawdbot.gateway" }
  2. Wait 15 seconds
  3. Re-check gateway health
  4. If healthy → log recovery, alert Slack (info)
  5. If still down → alert Slack (warning), retry once more
  6. If still down after retry → alert Slack (critical), tag John
```

**Playbook: Machine Service Restart** (limited — we're blind)
```
Trigger: Machine Service check fails 3x consecutive (6 min)
Condition: We can't reach the machine at all
Action:
  1. Alert Slack (critical) immediately
  2. Log incident
  3. Hope launchd KeepAlive restarts it
  4. Continue checking every 2 min
  5. When it comes back → alert Slack (recovery)
```

**Playbook: Agent Stuck**
```
Trigger: Agent last heartbeat > 30 min, gateway is UP
Action:
  1. POST {tunnel_url}/exec
     { "command": "launchctl kickstart -k system/com.clawdbot.gateway" }
  2. Wait 30 seconds
  3. Check heartbeat again after next cycle
  4. Alert Slack with diagnosis
```

### 3. Alert Router

**Channel:** #sys-admins (Slack)

**Alert Levels:**

| Level | When | Format |
|-------|------|--------|
| ℹ️ Info | Auto-recovered, daily digest | Quiet |
| ⚠️ Warning | Failed once, retrying | Visible |
| 🚨 Critical | Can't self-heal, need human | Tag John |

**Message Format:**
```
🚨 [CRITICAL] Mac Mini (m01) — Gateway DOWN
Detected: 07:25 PST
Machine Service: ✅ UP (45ms)
Gateway: ❌ DOWN (timeout)
Auto-restart: ❌ Failed (2 attempts)
Action needed: Manual intervention
```

**Dedup:** Don't spam. One alert per state change. Reminder every 15 min if still critical.

### 4. Daily Digest

Posted to #sys-admins at 8:00 AM PST daily.

```
📊 Daily Infrastructure Report — Feb 23, 2026

Machines:
  🟢 m01 (Stella's Mac Mini) — 99.8% uptime
     1 gateway restart (auto-healed at 03:14)
  🟢 m02 (Bella's Mac) — 100% uptime

Agents:
  ✅ Stella — last heartbeat 2 min ago
  ✅ Bella — last heartbeat 5 min ago

Alerts: 1 auto-resolved, 0 open
```

### 5. Local Watchdog (launchd KeepAlive)

Each machine should have launchd plists with `KeepAlive: true` for both services. This is the last line of defense — if the process exits, macOS restarts it automatically.

**Machine Service plist** (`com.stellabot.machine-control.plist`):
- Should already have KeepAlive (verify)

**Gateway plist** (`com.clawdbot.gateway.plist` or similar):
- Needs KeepAlive added if missing
- `ThrottleInterval: 30` to avoid restart loops

## Implementation

### Phase 1: Health Checks + Alerts (Day 1)

1. **Migration:** Create `machine_health` table
2. **Health service:** `server/services/machine-health.ts`
   - `checkMachine(machineId)` — runs all checks, stores result
   - `checkAllMachines()` — iterates registered machines
3. **Cron job:** Every 2 minutes, call `checkAllMachines()`
   - Use Stellabot's existing scheduler service
4. **Alert service:** `server/services/sys-admin-alerts.ts`
   - State change detection (compare current vs previous)
   - Slack webhook integration
   - Dedup logic
5. **Verify launchd KeepAlive** on both machines

### Phase 2: Self-Healing (Day 2)

1. **Playbook engine:** `server/services/playbooks.ts`
   - Playbook definitions (trigger, condition, actions)
   - Execution + logging
2. **Gateway restart playbook** — via Machine Service `/exec`
3. **Recovery verification** — re-check after restart
4. **Incident log** — track what happened, what was tried, outcome

### Phase 3: Daily Digest + Agent (Day 3)

1. **Digest generator** — aggregate 24h of health data
2. **Soft agent creation** — sys_admin type in Stellabot
   - Can answer "is X healthy?" from health data
   - Can manually trigger playbooks
   - Posts in #sys-admins
3. **Dashboard** — optional: machine health view in Stellabot UI

## What's NOT in MVP

- ❌ SSH / Tailscale fallback (CF tunnel covers 95% of failures)
- ❌ Disk/memory monitoring (add later)
- ❌ Multi-machine orchestration (rolling restarts, etc.)
- ❌ Custom playbooks UI (hardcoded is fine for now)
- ❌ Agent-to-agent communication (Stella ↔ Bella direct)

## Dependencies

- Machines registered in DB with `tunnel_url` and `machine_service_token`
- Machine Service running with `/health` and `/exec` endpoints
- Slack webhook or bot token for #sys-admins
- Stellabot scheduler service for cron

## Success Criteria

1. Gateway crash detected within 4 minutes
2. Auto-restart succeeds without human intervention
3. John gets alerted only when auto-heal fails
4. Daily digest shows uptime history
5. Zero undetected outages longer than 10 minutes
