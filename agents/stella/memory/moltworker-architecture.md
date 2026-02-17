# MoltWorker Architecture

**Last Updated:** 2026-02-02

## Overview

MoltWorker is a Cloudflare Workers-based runtime for AI agents. We have two deployments:

| Deployment | URL | Purpose | Status |
|------------|-----|---------|--------|
| `moltbot-newbox` | `https://moltbot-newbox.e2e-app.workers.dev` | Original, simpler setup | Working |
| `moltbot-sandbox` | `https://moltbot-sandbox.e2e-app.workers.dev` | Full Clawdbot in container | **Container crashes** |

## Architecture Components

### 1. Cloudflare Workers (Entrypoint)
- Acts as API router and proxy
- Connects external services to the Sandbox container
- Protected by Cloudflare Access

### 2. Sandboxes (Code Execution)
- Isolated container environments using `@cloudflare/sandbox` SDK
- Can run custom Docker images
- Secure, ephemeral execution
- Our custom image: `cloudflare/sandbox:0.7.0` + Node.js 22 + Clawdbot

### 3. R2 (Persistent Storage)
- Stores session memory, conversations, assets
- Mounted as filesystem in Sandbox via `sandbox.mountBucket()`
- Survives container restarts
- Backup path: `/data/moltbot/`

### 4. Browser Rendering (Web Automation)
- Headless Chromium instances at edge
- Supports Puppeteer, Playwright, Stagehand
- CDP proxy from Sandbox → Worker → Browser Rendering

### 5. AI Gateway (Model Routing)
- Proxy to AI providers (Anthropic, OpenAI, etc.)
- BYOK (Bring Your Own Key) or Unified Billing
- Set `ANTHROPIC_BASE_URL` or `AI_GATEWAY_BASE_URL` to use

### 6. Zero Trust Access (Auth)
- Protects APIs and Admin UI
- JWT tokens for request validation
- Team domain: `killerapps.cloudflareaccess.com`

---

## moltbot-sandbox Setup (Current Focus)

**Goal:** Run full Clawdbot gateway inside CF Sandbox container

### Worker URL
```
https://moltbot-sandbox.e2e-app.workers.dev
```

### CF Access Protection
- **Application:** "MoltWorker" in CF Zero Trust
- **AUD:** `114eb22c166ee33495177a8c2bb70ba6ea3aa9d9a021865ada809125563a1f95`
- **Team Domain:** `killerapps.cloudflareaccess.com`

### Service Token (for Stellabot to call MoltWorker)
```
CF-Access-Client-Id: 30d0ea19d9bffdc272470fe48965d916.access
CF-Access-Client-Secret: (in 1Password: "CF Stellabot API")
```

### Secrets Configured
| Secret | Purpose |
|--------|---------|
| `CF_ACCESS_TEAM_DOMAIN` | JWT validation endpoint |
| `CF_ACCESS_AUD` | Expected audience in JWT |
| `STELLABOT_URL` | Heartbeat callback URL |
| `STELLABOT_MACHINE_TOKEN` | Auth for heartbeat API |
| `ANTHROPIC_API_KEY` | (needs to be set) |

### Container Setup

**Dockerfile:** `~/clawd/moltworker/Dockerfile`
```dockerfile
FROM cloudflare/sandbox:0.7.0
# Install Node.js 22, pnpm, clawdbot
# Copy startup script and config template
# Workdir: /root/clawd
CMD ["/usr/local/bin/start-moltbot.sh"]
```

**Startup Script:** `~/clawd/moltworker/start-moltbot.sh`
1. Restores config from R2 backup if newer
2. Creates config from template + env vars
3. Starts `clawdbot gateway --port 18789`

### Current Status: ❌ BROKEN

**Error:**
```
ProcessExitedBeforeReadyError: Process exited with code 1 before becoming ready.
Waiting for: port 18789 (TCP)
```

**What works:**
- Docker image builds successfully
- Pushes to CF container registry
- CF Access auth passes with service token
- Worker deploys and runs

**What fails:**
- Clawdbot gateway crashes immediately (exit code 1)
- No detailed logs captured yet

**Suspected causes:**
- Node.js compatibility with CF sandbox
- Missing system dependencies
- Clawdbot-specific requirements

---

## moltbot-newbox Setup (Original)

**Worker URL:** `https://moltbot-newbox.e2e-app.workers.dev/`

**Bindings:**
- Assets
- Browser Rendering (BROWSER)
- R2 Bucket (MOLTBOT_BUCKET)
- Durable Object (Sandbox)

**Secrets:**
- `MOLTBOT_GATEWAY_TOKEN`

This is the simpler, working setup without custom container.

---

## Stellabot Integration

### Machine Record
- **ID:** `moltworker-prod`
- **Type:** `cloudflare_worker`
- **URL:** Worker endpoint

### Heartbeat Flow
1. MoltWorker sends heartbeat to Stellabot on activity (not constant polling)
2. Stellabot shows time-based status:
   - `active` — seen within 5 minutes
   - `idle` — seen within 1 hour
   - `dormant` — not seen in over 1 hour
3. "Check Status" in Stellabot pings `/health` directly

### Calling MoltWorker from Stellabot
```typescript
const response = await fetch('https://moltbot-sandbox.e2e-app.workers.dev/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'CF-Access-Client-Id': '30d0ea19d9bffdc272470fe48965d916.access',
    'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET,
  },
  body: JSON.stringify({ message: '...' })
});
```

---

## Local Development

### Clone & Setup
```bash
cd ~/clawd/moltworker
pnpm install
```

### Local Dev Server
```bash
pnpm dev
# or
npx wrangler dev
```

### Deploy
```bash
cd ~/clawd/moltworker
CLOUDFLARE_API_TOKEN="(from 1Password)" npx wrangler deploy
```

### Set Secrets
```bash
echo "value" | CLOUDFLARE_API_TOKEN="..." npx wrangler secret put SECRET_NAME
```

### View Logs
```bash
CLOUDFLARE_API_TOKEN="..." npx wrangler tail --format json
```

### Test with Auth
```bash
curl -H "CF-Access-Client-Id: 30d0ea19d9bffdc272470fe48965d916.access" \
     -H "CF-Access-Client-Secret: ..." \
     https://moltbot-sandbox.e2e-app.workers.dev/health
```

---

## Key Files

| File | Purpose |
|------|---------|
| `wrangler.jsonc` | Worker configuration, bindings, container setup |
| `Dockerfile` | Custom container with Clawdbot |
| `start-moltbot.sh` | Container startup script |
| `moltbot.json.template` | Clawdbot config template |
| `src/index.ts` | Worker entrypoint |
| `src/routes/api.ts` | API routes |
| `src/gateway/` | Gateway proxy code |

---

## Next Steps

1. **Debug container crash** - Test Dockerfile locally first
2. **Add ANTHROPIC_API_KEY** - Required for Clawdbot to function
3. **Verbose logging** - Capture why gateway exits with code 1
4. **Consider fallback** - Simple HTTP server instead of full Clawdbot if issues persist

---

## References

- MoltWorker Blog: https://blog.cloudflare.com/moltworker-self-hosted-ai-agent/
- Clawdbot Docs: https://docs.clawd.bot
- CF Sandbox SDK: https://developers.cloudflare.com/workers/runtime-apis/sandbox/
- CF Access: https://developers.cloudflare.com/cloudflare-one/applications/
