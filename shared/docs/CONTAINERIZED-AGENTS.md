# Containerized Multi-Agent Architecture

**Created:** 2026-02-16
**Status:** Active Development
**Owner:** Stella + John

## Vision

Run multiple AI agent runtimes (OpenClaw, Agent Zero, custom agents) in isolated OrbStack containers while maintaining controlled access to Mac Mini hardware resources via Machine Service.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Mac Mini (Host)                            │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              MACHINE SERVICE (:18900)                        │ │
│  │         Single source of truth for hardware                  │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │ │
│  │  │ Browser │ │ Screen  │ │ Camera  │ │  Exec   │           │ │
│  │  │  Pools  │ │ Capture │ │ Access  │ │ Sandbox │           │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │ │
│  │         Permission enforcement per agent/token               │ │
│  └──────────────────────────▲──────────────────────────────────┘ │
│                             │                                     │
│              HTTP API (bearer token = agent identity)            │
│    ┌────────────────────────┼────────────────────────┐           │
│    │                        │                        │           │
│  ┌─┴──────────────┐  ┌──────┴───────┐  ┌────────────┴─┐         │
│  │   OrbStack     │  │   OrbStack   │  │   OrbStack   │         │
│  │   Container    │  │   Container  │  │   Container  │         │
│  │                │  │              │  │              │         │
│  │   OpenClaw     │  │  Agent Zero  │  │  Custom      │         │
│  │   v2026.2.15   │  │              │  │  Agent       │         │
│  │                │  │              │  │              │         │
│  │ :18789 ────────┼──┼──► host:18791│  │              │         │
│  │ :3000 (web) ───┼──┼──► host:3001 │  │              │         │
│  └────────────────┘  └──────────────┘  └──────────────┘         │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                      Tailscale                               │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

## Components

### On Host (Bare Metal)
| Component | Port | Purpose |
|-----------|------|---------|
| Machine Service | :18900 | Hardware API gateway |
| Tailscale | — | Mesh network |
| OrbStack | — | Container runtime |

### Per Container
| Component | Internal Port | Host Port (example) |
|-----------|---------------|---------------------|
| OpenClaw Gateway | 18789 | 18791, 18792, ... |
| Web Chat UI | 3000 | 3001, 3002, ... |

## What Works in Containers

| Capability | Method | Status |
|------------|--------|--------|
| Telegram/Discord/etc | Direct network | ✅ Works |
| Browser automation | Machine Service | ✅ Works |
| Screen capture | Machine Service | ✅ Works |
| Camera | Machine Service | ✅ Works |
| File access | Volume mount + Machine Service | ✅ Works |
| Shell exec | Machine Service | ✅ Works |
| Web search | Direct network | ✅ Works |
| GitHub CLI | Mount ~/.ssh, token | ✅ Works |
| TTS/Audio | Generate file → send via chat | ✅ Works |
| OAuth callbacks | Port forward to host | ✅ Works |
| Sessions | Mount ~/.clawdbot | ✅ Works |
| Web Chat | Port forward | ✅ Works |

## What We Skip (By Design)

| Capability | Reason |
|------------|--------|
| 1Password CLI | Use Stellabot web secrets instead |
| macOS Calendar/Notes/Reminders | Not needed |
| Native notifications | Use chat |
| Direct clipboard | Use chat to transport |

## Directory Structure

```
~/agents/
├── stella-prod/
│   ├── .clawdbot/          # Gateway config + sessions
│   │   └── clawdbot.json
│   └── workspace/          # Working directory (SOUL.md, etc.)
│       ├── SOUL.md
│       ├── MEMORY.md
│       └── ...
├── stella-test/
│   ├── .clawdbot/
│   └── workspace/
└── agent-zero/
    ├── config/
    └── workspace/
```

## Permission Tiers

| Tier | Capabilities | Use Case |
|------|--------------|----------|
| 0 | None | Pure compute |
| 1 | Read-only | Screen capture, file read |
| 2 | Interactive | Browser control, input |
| 3 | Full | Camera, exec, all files |

Machine Service config:
```json
{
  "agents": {
    "stella-prod": { "tier": 3, "token": "..." },
    "stella-test": { "tier": 2, "token": "..." }
  }
}
```

## Phase 1: Parallel Testing (Current)

### Goals
- [ ] Create OpenClaw container image
- [ ] Set up test container alongside production host install
- [ ] Verify all capabilities work via Machine Service
- [ ] Test OAuth flow with port forwarding

### Deliverables
1. `Dockerfile` for OpenClaw
2. `docker-compose.yml` for test agent
3. Verification checklist

### Port Allocation
| Agent | Gateway | Web Chat |
|-------|---------|----------|
| stella-prod (host) | 18789 | — |
| stella-test (container) | 18791 | 3001 |

## Phase 2: Migration

### Goals
- [ ] Move production Stella to container
- [ ] Verify stability over 48h
- [ ] Document rollback procedure

## Phase 3: Multi-Agent

### Goals
- [ ] Add second agent type (Agent Zero or custom)
- [ ] Test inter-agent isolation
- [ ] Implement agent registry

## OAuth Handling

OAuth callbacks need to reach the container. Solution: port forward.

```
User browser → http://localhost:18791/auth/callback
                      ↓ (OrbStack port forward)
              Container :18789/auth/callback
```

OrbStack auto-forwards ports, or explicit:
```bash
# In container definition
ports:
  - "18791:18789"
  - "3001:3000"
```

## Secrets Strategy

**Skip 1Password CLI in containers.** Use:

1. **Stellabot Secrets API** (`/api/secrets`)
   - Web UI for management
   - API for agent retrieval

2. **Environment injection**
   - Pass secrets as env vars at container start
   - Or mount secrets file

3. **Machine Service** (`/api/machine-secrets`)
   - For hardware-related secrets only

## Rollback Plan

If container setup fails:
```bash
# Stop container
docker-compose -f ~/agents/stella-test/docker-compose.yml down

# Production on host continues unchanged
clawdbot gateway status  # Should show running
```

Zero risk to production during testing.

## Files

| Path | Purpose |
|------|---------|
| `~/agents/` | All containerized agents |
| `~/e2e/machine-control/` | Machine Service (host) |
| `~/clawd/` | Current production workspace |
| `/opt/homebrew/.../clawdbot/` | Current production install |

## References

- Machine Service: `~/e2e/machine-control/README.md`
- Agent Runtime: `~/e2e/machine-control/agent-runtime/`
- OrbStack docs: https://orbstack.dev/docs
