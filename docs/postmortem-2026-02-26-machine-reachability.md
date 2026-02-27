# Postmortem: Machine Reachability & Apply-to-Machine (2026-02-26)

## Summary

Both Stella's and Bella's machines were showing as "Could not reach machine" in Stellabot despite Machine Services running. Root causes: token mismatches and a heartbeat status bug. All resolved 2026-02-26.

---

## Root Cause 1: machine_service_token mismatch

**Symptom:** Stellabot UI shows "Could not reach machine" / 401 on `/files/read` through tunnel.

**Why:** `getMachineServiceHeaders()` in `server/routes/machine-openclaw-config.ts` uses `machine.machineServiceToken` from DB. This value can become stale if the Machine Service was re-initialized with a new token but DB wasn't updated.

**Detection:**
```bash
# 1. Health check (no auth) — should be 200
curl -s -o /dev/null -w "%{http_code}" https://<machine>.e2e.pro/health

# 2. Auth check — 200 = token correct, 401 = mismatch
curl -s -o /dev/null -w "%{http_code}" -X POST https://<machine>.e2e.pro/files/read \
  -H "Authorization: Bearer <DB machine_service_token>" \
  -H "Content-Type: application/json" \
  -d '{"path":"/tmp/test"}'

# 3. Compare prefixes (never echo full values)
# DB prefix: psql -c "SELECT left(machine_service_token, 8) FROM machines WHERE id='...';"
# Live prefix: check config.auth.token on machine via tunnel
```

**Fix:** Update `machines.machine_service_token` in DB to match live `config.auth.token`.

---

## Root Cause 2: Heartbeat apiToken not configured

**Symptom:** Machine Service running, health 200, but machine shows `offline` in Stellabot. `last_heartbeat` in DB is stale.

**Why:** Machine Service heartbeat requires `config.machine.apiToken` (Stella's version) or `config.machine.stellabotToken` (Bella's version) to authenticate against `/api/machines/heartbeat`. If not configured, heartbeats silently skip.

**Detection:**
```bash
# Check what token field Bella's version uses
grep "autoToken\|stellabotToken\|apiToken" /Users/bella/e2e/machine/src/handlers/machine.ts | head -5

# Check if field is set in config (never print full value)
cat config.json | jq '.machine | {apiToken_len: (.apiToken//""|length), stellabotToken_len: (.stellabotToken//""|length)}'
```

**Fix:** Set the correct token field to `machines.api_token` from Stellabot DB.

**Warning:** Token field name differs by Machine Service version:
- Stella's version (from `~/e2e/machine`): `config.machine.apiToken`  
- Bella's version (`/Users/bella/e2e/machine`): `config.machine.stellabotToken`

---

## Root Cause 3: Heartbeat reports pool status, not machine status

**Symptom:** Heartbeat IS arriving at Stellabot (DB `last_heartbeat` updates), but `status` stays `offline`.

**Why:** Bella's Machine Service `sendHeartbeat()` sends:
```typescript
status: poolStatus.running ? 'online' : 'offline'
```
Browser pool not initialized → sends `status: 'offline'`. Stellabot heartbeat handler uses this value directly to update DB. The auto-offline query was not the issue.

**Fix:** Always send `status: 'online'` from Machine Service heartbeat. Pool state ≠ machine reachability.

**Location:** `/Users/bella/e2e/machine/src/handlers/machine.ts` line ~191.

---

## Cloudflare Tunnel Setup Gotchas

### Two fields must stay in sync
Stellabot DB has TWO tunnel URL locations for each machine:
1. `machines.tunnel_url` (column)
2. `machines.config` JSON → `tunnelUrl` key

Both must match. The UI reads `tunnel_url` column; some code paths read `config.tunnelUrl`.

**Fix:** Always update both:
```sql
UPDATE machines SET 
  tunnel_url = 'https://stella.e2e.pro',
  config = jsonb_set(config, '{tunnelUrl}', '"https://stella.e2e.pro"')
WHERE id = '...';
```

### CF Access protects the tunnel
Requests from Fly → Machine tunnel must include CF Access service token headers:
```
CF-Access-Client-Id: <service token client id>
CF-Access-Client-Secret: <service token client secret>
```
These are injected by `getMachineServiceHeaders()` when `CF_MACHINE_ACCESS_ID` env var is set on Fly.

### DNS auto-created
When adding a public hostname route in CF Zero Trust (e.g. `stella.e2e.pro → localhost:18900`), Cloudflare automatically creates the CNAME DNS record. No manual DNS step needed.

### Local config file may be stale
`~/.cloudflared/m01-config.yml` may reference old hostnames. The actual routing is controlled by CF Zero Trust public hostname routes, NOT the local config file. The local config file is only used by `cloudflared tunnel run --config` when running from CLI, not when using the launchd service with a tunnel token.

---

## Reachability Checklist (for new machine setup)

- [ ] Tunnel health: `curl https://<machine>.e2e.pro/health` → 200
- [ ] CF Access token set as Fly secret (`CF_MACHINE_ACCESS_ID` + `CF_MACHINE_ACCESS_SECRET`)
- [ ] DB `machine_service_token` matches live `config.auth.token` (compare 8-char prefix)
- [ ] DB `api_token` set and matches `config.machine.apiToken` or `config.machine.stellabotToken` (compare 8-char prefix)
- [ ] DB `tunnel_url` column AND `config.tunnelUrl` JSON both set and matching
- [ ] Heartbeat firing: `last_heartbeat` in DB updating every ~60s
- [ ] Machine status `online` in Stellabot UI

---

*Author: Stella Costa*
*Date: 2026-02-26*
