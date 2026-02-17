# HEARTBEAT.md

## Active Work
**Local Agent Runtime** — Core implementation complete, testing verified
- ✅ Agent runtime server (API mode + CLI mode router)
- ✅ Web chat interface (React + Vite + Tailwind)
- ✅ Tool routing (internal vs host Machine Service)
- ✅ CF tunnel config (option in addition to Tailscale)
- ✅ Web-side secrets (Stellabot → 1Password → env priority)
- ✅ Architecture docs updated
- ✅ Stellabot `/api/machine-secrets` endpoint
- ✅ OrbStack VM tested — runs successfully
- ⏳ CF tunnel actual setup (needs domain)

## Recently Completed (2026-02-16)
- ✅ **Secrets Migration COMPLETE**
  - Migrated 8 secrets to unified `secrets` table (encrypted)
  - Dropped 4 old tables: org_secrets, agent_secrets, integration_credentials, tenant_credentials
  - Fixed: integration_credentials was storing unencrypted JSON
  - Removed old model/route files, cleaned up schema.ts
  - Deployed to production
- ✅ Security audit of all 52 Clawdbot skills - all clean
- ✅ Project state checkpointed

## Previously Completed (2026-02-15)
- ✅ Local Agent Runtime implementation
- ✅ Web chat UI
- ✅ Machine secrets API endpoint
- ✅ OrbStack VM testing verified
- ✅ TTS testing (661ms for short text)

## Quick Reference
```bash
# Agent Runtime (from OrbStack VM or host)
cd ~/e2e/agents
npm run build && npm start  # Runs on :18901

# Test in VM
orb -m agent-sandbox -w /mnt/mac/Users/stella/e2e/agents npm start

# Machine Service health
curl http://100.74.241.116:18900/health

# Deploy Stellabot (GET APPROVAL FIRST)
cd ~/e2e/stellabot && git add -A && git commit -m "msg" && git push && fly deploy --app stellabot-app
```

## Notes
- **REMEMBER**: Get user approval before deploying
- Agent Runtime uses CLI mode by default (Claude Code Max Plan)
- OrbStack port forwarding is automatic (localhost:18901 works on host)
