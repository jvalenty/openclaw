# Machine Service Roadmap

> Last updated: 2026-02-12

## Goal

Replace Clawdbot with Machine Service + Stellabot for full independence from third-party dependencies.

---

## ✅ Complete (2026-02-12)

### Core Hardware Access
- [x] Browser automation (Playwright)
- [x] Shell exec
- [x] Screen capture/record
- [x] Camera access
- [x] Per-agent isolated browser pools (X-Agent-Id)
- [x] Local file read/write/edit/list

### Security
- [x] Tailscale-only network binding
- [x] Bearer token authentication
- [x] basePaths file restriction
- [x] Command blocklist
- [x] Audit logging

### Integration
- [x] Stellabot soft agent tools (browser_*, local_*)
- [x] browser_login with already-authenticated detection
- [x] R2 cloud storage for persistent files

---

## 🟡 Recommended Next (Operations/Stability)

### Log Rotation (~30 min)
**Problem:** `audit.log` can grow unbounded and fill disk.

**Solution:**
```javascript
// Use rotating-file-stream or winston daily rotate
const stream = rfs.createStream('audit.log', {
  size: '10M',     // rotate at 10MB
  interval: '1d',  // or daily
  maxFiles: 7,     // keep 7 days
});
```

### Browser Profile Cleanup (~1 hr)
**Problem:** Stale agent profiles accumulate in `browser-profiles/`.

**Solution:**
- Track last-accessed time per profile
- On startup, delete profiles not used in 30 days
- Or add `/admin/cleanup-profiles` endpoint

### Metrics Endpoint (~1 hr)
**Problem:** No observability for monitoring/alerting.

**Solution:**
```
GET /metrics
```
Return Prometheus-format metrics:
- `machine_service_requests_total{endpoint,status}`
- `machine_service_browser_pools_active`
- `machine_service_browser_tabs_total`
- `machine_service_disk_usage_bytes`

### Graceful Shutdown (~30 min)
**Problem:** Browser pools may not close cleanly on restart.

**Solution:**
```javascript
process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  await orgPoolManager.stopAll();
  server.close();
  process.exit(0);
});
```

### Deep Health Checks (~30 min)
**Problem:** `/health` only checks if server is running.

**Solution:**
```json
GET /health?deep=true

{
  "ok": true,
  "checks": {
    "browser": { "ok": true, "pools": 2 },
    "disk": { "ok": true, "freeGb": 45.2 },
    "memory": { "ok": true, "usedMb": 512 }
  }
}
```

---

## 🔴 Missing for Full Clawdbot Independence

### Process Management (~2 hrs)
**What Clawdbot has:**
- Background processes with PID tracking
- Poll output from running processes
- Send input to processes (stdin)
- Kill processes
- PTY support for interactive CLIs

**Implementation:**
```
POST /process/start
  { command, cwd, env, pty }
  → Returns { pid, sessionId }

GET /process/{sessionId}/output
  → Returns { stdout, stderr, running }

POST /process/{sessionId}/input
  { data }

POST /process/{sessionId}/kill
```

### Cron/Scheduling (~4 hrs)
**Note:** Should live in Stellabot, not Machine Service.

**What's needed:**
- Heartbeat system for periodic checks
- Scheduled task execution
- Reminders with notifications

**Implementation:**
- Add `cron_jobs` table to Stellabot DB
- Background worker that polls and executes jobs
- Jobs can trigger agent actions

---

## Future Considerations

### Multi-Machine Support
- Machine registration with Stellabot
- Task routing to specific machines
- Load balancing across machines

### Resource Limits
- Per-agent CPU/memory limits
- Browser pool memory limits
- Automatic cleanup on resource pressure

### Secure Secrets Injection
- Vault integration for credentials
- Per-job secret scoping
- Automatic secret rotation
