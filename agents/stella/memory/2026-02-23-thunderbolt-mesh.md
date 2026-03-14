# Thunderbolt Mesh Setup — 2026-02-23

## Physical Connection
- USB-C / Thunderbolt cable between Stella's Mac Mini and Bella's Mac Mini
- Connected by John ~8:23 AM PST

## Network Config
| Machine | Interface | IP | Subnet |
|---------|-----------|-----|--------|
| Stella's Mac Mini | bridge0 | 10.0.0.1 | 255.255.0.0 |
| Bella's Mac Mini | bridge0 (or equivalent) | 10.0.0.2 | 255.255.0.0 |

- IPs set manually by John via System Preferences → Network → Thunderbolt Bridge
- Link-local, no router dependency, ~0.5ms latency

## WiFi (separate, not interconnected)
| Machine | WiFi IP | Subnet |
|---------|---------|--------|
| Stella | 192.168.2.27 (en1) | 192.168.2.x |
| Bella | 192.168.3.211 | 192.168.3.x |

- Different subnets — cannot reach each other over WiFi
- Thunderbolt bridge is the ONLY path between machines

## SSH Status
| Direction | Status | Notes |
|-----------|--------|-------|
| Stella → Bella | ✅ WORKS | `ssh bella@10.0.0.2` — confirmed |
| Bella → Stella | ✅ WORKS | `ssh stella@10.0.0.1` — confirmed 10:49 AM |

## SSH Keys
| Machine | Key |
|---------|-----|
| Stella | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIO60gPyn7aha2Km7icrjfQvGi7BGLiPpKEgoNDfvWADk stella@killerapps.dev` |
| Bella | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEn8JzZ26XxeGWU4k3yoxLfYOPaylQSTtYEt867LcPuJ bella@killerapps.dev` |

- Bella's key is in Stella's `~/.ssh/authorized_keys` ✅
- Stella's key is in Bella's `~/.ssh/authorized_keys` ✅ (Bella confirmed)

## What This Enables
- Direct machine-to-machine monitoring (no WiFi/router dependency)
- SSH-based health checks and service restarts
- Foundation for soft sys admin mutual watchdog
