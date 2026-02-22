# TOOLS.md - Local Notes

## GitHub Memory Sync

- **Repo:** https://github.com/jvalenty/openclaw
- **Local clone:** ~/openclaw-repo
- **My workspace in repo:** agents/bella/
- **GitHub account:** stella-costa (authenticated via gh CLI, keyring)

### Sync Commands

```bash
# Push workspace → GitHub
~/workspace/scripts/sync-to-github.sh "optional message"

# Pull GitHub → workspace  
~/workspace/scripts/pull-from-github.sh
```

### What Gets Synced
- SOUL.md, AGENTS.md, USER.md, TOOLS.md, IDENTITY.md, MEMORY.md
- memory/*.md (daily logs)

### Manual Git
```bash
cd ~/openclaw-repo
git status
git add -A && git commit -m "msg" && git push origin main
```

---

## Machine / Environment

- **Host:** Bella's Mac Mini (macOS, user: bella)
- **OpenClaw workspace:** /Users/bella/.openclaw/workspace
- **Machine Service:** http://100.74.241.116:18900 (hardware tools)
- **Stellabot:** https://stellabot.app
- **E2E runtime:** /opt/e2e

---

## Accounts & Credentials (no secrets here — use 1Password)

- **GitHub:** stella-costa (authenticated)
- **Email:** stella@killerapps.dev (shared with Stella for now)
- **1Password:** John logs me in via CLI when needed (`op signin`)
- **Telegram:** @Bella71bot
