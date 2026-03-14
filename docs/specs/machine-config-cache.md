# Machine Config Cache — Local Source of Truth

> Status: SPEC DRAFT
> Created: 2026-02-23
> Author: Stella

## Problem

Machines depend on Stellabot for authorization, secrets, agent configs, and knowledge. If Stellabot goes down (Fly outage, deployment, network), machines become useless — Machine Service fails closed, soft agents can't route, no authorization checks pass.

This is unacceptable. Machines must be fully autonomous when disconnected.

## Principle

**The machine's local cache IS the source of truth for operations.** Stellabot is the source of truth for *config changes*. The cache is not a fragile fallback — it's a versioned, validated, cryptographically signed local copy that the machine trusts absolutely.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  STELLABOT (Config Authority)                    │
│                                                  │
│  Configs → Version → Sign → Push/Pull            │
└──────────────────┬──────────────────────────────┘
                   │ Sync (when online)
                   ▼
┌──────────────────────────────────────────────────┐
│  MACHINE (Local Source of Truth)                  │
│                                                  │
│  ~/.stellabot-machine/config-cache/              │
│    ├── manifest.json       (versions + hashes)   │
│    ├── authorizations.json (who can use me)      │
│    ├── agents.json         (agent configs)       │
│    ├── knowledge.json      (knowledge base)      │
│    ├── secrets.enc         (encrypted secrets)   │
│    └── history/            (previous versions)   │
│                                                  │
│  Machine Service reads ONLY from cache.          │
│  Never calls Stellabot in the request path.      │
└──────────────────────────────────────────────────┘
```

## Cache Structure

### manifest.json

The manifest tracks what's cached, when it was last synced, and integrity hashes.

```json
{
  "version": 47,
  "lastSyncAt": "2026-02-23T19:15:00Z",
  "stellabotVersion": "2026.2.23",
  "machineId": "1d6940b3-bda0-45a9-a4b1-b0137840ae48",
  "orgId": "05fac098-...",
  "sections": {
    "authorizations": {
      "version": 12,
      "hash": "sha256:abc123...",
      "updatedAt": "2026-02-22T10:00:00Z",
      "itemCount": 4
    },
    "agents": {
      "version": 31,
      "hash": "sha256:def456...",
      "updatedAt": "2026-02-23T08:30:00Z",
      "itemCount": 7
    },
    "knowledge": {
      "version": 8,
      "hash": "sha256:ghi789...",
      "updatedAt": "2026-02-20T15:00:00Z",
      "itemCount": 52
    },
    "secrets": {
      "version": 3,
      "hash": "sha256:jkl012...",
      "updatedAt": "2026-02-19T12:00:00Z",
      "itemCount": 6
    }
  },
  "signature": "hmac-sha256:xyz..."
}
```

### authorizations.json

Local copy of `machine_authorizations` table for this machine.

```json
{
  "version": 12,
  "entries": [
    {
      "orgId": "05fac098-...",
      "orgName": "e2e",
      "enabled": true,
      "quotas": {
        "dailyRequests": 10000,
        "monthlyRequests": 100000,
        "ratePerMinute": 60
      },
      "billingHold": false,
      "degraded": false
    },
    {
      "orgId": "abc123-...",
      "orgName": "Earnware",
      "enabled": true,
      "quotas": {
        "dailyRequests": 5000,
        "monthlyRequests": 50000,
        "ratePerMinute": 30
      },
      "billingHold": false,
      "degraded": false
    }
  ]
}
```

### agents.json

Agent configs relevant to this machine.

```json
{
  "version": 31,
  "entries": [
    {
      "id": "e81ad189-...",
      "name": "Bob Lang",
      "agentType": "specialist",
      "orgId": "abc123-...",
      "modelConfig": {},
      "contextDocIds": [],
      "skills": []
    }
  ]
}
```

### knowledge.json

Knowledge base for agents on this machine. Only includes relevant scopes.

```json
{
  "version": 8,
  "entries": [
    {
      "id": "90abb63e-...",
      "key": "jarvis-identity",
      "title": "Jarvis Identity",
      "content": "...",
      "type": "knowledge",
      "scope": "agent",
      "priority": 100
    }
  ]
}
```

### secrets.enc

Encrypted secrets file. AES-256-GCM encrypted with a machine-specific key derived from the machine's service token.

```json
{
  "version": 3,
  "encryption": "aes-256-gcm",
  "keyDerivation": "pbkdf2-sha256",
  "salt": "base64:...",
  "iv": "base64:...",
  "ciphertext": "base64:...",
  "tag": "base64:..."
}
```

Decrypted contents:
```json
{
  "anthropicApiKey": "sk-ant-...",
  "clawdbotToken": "100af510...",
  "machineServiceToken": "736a2895...",
  "cfAccessId": "30d0ea19...",
  "cfAccessSecret": "..."
}
```

## Sync Protocol

### Pull Sync (Machine → Stellabot)

On every machine heartbeat (already happening every 60s), include the manifest version:

```
POST /api/machines/heartbeat
{
  "healthMetrics": { ... },
  "cacheManifest": {
    "version": 47,
    "sections": {
      "authorizations": { "version": 12, "hash": "sha256:abc123..." },
      "agents": { "version": 31, "hash": "sha256:def456..." },
      "knowledge": { "version": 8, "hash": "sha256:ghi789..." },
      "secrets": { "version": 3, "hash": "sha256:jkl012..." }
    }
  }
}
```

Stellabot response includes ONLY diffs:

```json
{
  "ok": true,
  "machineId": "...",
  "configUpdates": {
    "authorizations": null,
    "agents": {
      "version": 32,
      "hash": "sha256:new...",
      "patch": [
        { "op": "replace", "path": "/entries/0/modelConfig", "value": { ... } }
      ]
    },
    "knowledge": null,
    "secrets": null
  }
}
```

- `null` = no changes (hash matches)
- Patch object = JSON Patch (RFC 6902) for incremental updates
- Full replacement if patch would be larger than full payload

### Push Sync (Stellabot → Machine)

For urgent changes (revoke authorization, rotate secret):

```
POST {machine_tunnel_url}/config/update
{
  "section": "authorizations",
  "version": 13,
  "hash": "sha256:...",
  "patch": [ ... ],
  "urgency": "immediate"
}
```

Machine validates hash chain, applies patch, updates manifest.

### Version Chain

Each section version is monotonically increasing. The machine rejects any update with a version ≤ current. This prevents replay attacks and stale data.

```
v12 → v13 → v14 (accepted)
v12 → v11 (rejected — stale)
v12 → v14 (accepted — gaps OK, versions don't have to be sequential)
```

### Conflict Resolution

Stellabot always wins. The machine never modifies cached config locally (except usage counters). If there's a version conflict, the machine requests a full sync.

## Request Path (Zero Network Calls)

Current (broken):
```
Request → Machine Service → Call Stellabot API → Authorize → Respond
```

Fixed:
```
Request → Machine Service → Read local cache → Authorize → Respond
```

The authorization check becomes:
```typescript
function checkAuthorization(orgId: string): AuthResult {
  const cache = readCache('authorizations');
  const entry = cache.entries.find(e => e.orgId === orgId);
  
  if (!entry || !entry.enabled) return { allowed: false, reason: 'not_authorized' };
  if (entry.billingHold) return { allowed: false, reason: 'billing_hold' };
  
  return { 
    allowed: true, 
    degraded: entry.degraded,
    quotas: entry.quotas
  };
}
```

No network call. Microsecond response. Works offline.

## Offline Behavior

| Stellabot Status | Machine Behavior |
|-----------------|-----------------|
| Online | Sync on every heartbeat, apply diffs |
| Offline < 1 hour | Operate normally from cache, log sync failures |
| Offline 1-24 hours | Operate from cache, alert in logs, increment "stale counter" |
| Offline > 24 hours | Operate from cache but flag as STALE in all responses |
| Cache missing/corrupt | Fail closed — refuse all requests until sync completes |

**Key: The machine NEVER stops working just because Stellabot is unreachable.** The cache is the source of truth for operations. Only a missing or corrupt cache causes failure.

## Integrity

### HMAC Signature

The manifest is signed with an HMAC-SHA256 using the machine's service token as key. On every read, the machine verifies the signature before trusting the cache.

```typescript
function verifyManifest(manifest: Manifest, machineToken: string): boolean {
  const payload = JSON.stringify({ ...manifest, signature: undefined });
  const expected = hmacSha256(payload, machineToken);
  return manifest.signature === `hmac-sha256:${expected}`;
}
```

### Hash Chain

Each section's hash covers its content. The manifest hash covers all section hashes. This creates a Merkle-like chain:

```
manifest.signature → verifies manifest integrity
  ├── authorizations.hash → verifies authorizations.json
  ├── agents.hash → verifies agents.json
  ├── knowledge.hash → verifies knowledge.json
  └── secrets.hash → verifies secrets.enc
```

If any file is tampered with, the hash check fails and the machine requests a full sync.

### History

Previous versions kept in `history/` directory:
```
history/
  ├── manifest.v46.json
  ├── manifest.v45.json
  ├── authorizations.v11.json
  └── ...
```

Keep last 10 versions. Enables rollback if a bad config is pushed.

## Usage Tracking (Local)

Usage counters (daily/monthly requests per org) are tracked locally and synced back to Stellabot periodically:

```json
// ~/.stellabot-machine/usage-counters.json
{
  "date": "2026-02-23",
  "orgs": {
    "05fac098-...": { "daily": 142, "monthly": 3847 },
    "abc123-...": { "daily": 56, "monthly": 1203 }
  }
}
```

Synced to Stellabot on heartbeat. If Stellabot is down, counters accumulate locally and sync when reconnected. No usage data is lost.

## Migration Path

### Phase 1: Cache Writer (on heartbeat response)
- Machine Service saves heartbeat response data to cache files
- Still reads from API (no behavior change yet)
- Validates cache structure works

### Phase 2: Cache Reader (authorization)
- Authorization checks read from cache instead of API
- Fallback to API if cache is missing/stale (transitional)
- Log comparison: cache result vs API result (should match)

### Phase 3: Full Cache (all reads)
- All config reads from cache
- API calls only on sync cycle
- Stellabot becomes push-only for urgent changes

### Phase 4: Diff-based Sync
- Heartbeat includes manifest versions
- Stellabot returns only diffs
- Knowledge payload drops from 50KB to ~0 on most heartbeats

## What This Fixes

| Problem | Before | After |
|---------|--------|-------|
| Stellabot down → machines dead | ❌ Fail closed | ✅ Operate from cache |
| 50KB knowledge on every heartbeat | ❌ Full dump 60x/hr | ✅ Diff only when changed |
| Authorization check latency | ❌ Network round trip | ✅ Local file read |
| Secret rotation | ❌ Manual | ✅ Push via cache update |
| Config rollback | ❌ Impossible | ✅ History directory |
| Tampered config | ❌ No detection | ✅ HMAC + hash chain |
