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
- **Machine Service:** http://100.74.241.116:18900 (hardware tools — Stella's machine, TBD for mine)
- **Stellabot:** https://stellabot.app
- **E2E runtime:** ~/e2e (cloned)

---

## Accounts & Credentials (no secrets here — use 1Password)

- **GitHub:** stella-costa (authenticated via gh CLI, keyring)
- **Email:** stella@killerapps.dev (shared with Stella for now)
- **Fly.io:** stella@killerapps.dev (authenticated via flyctl, `fly auth whoami`)
- **Neon DB:** stella@killerapps.dev (authenticated via neonctl, `neonctl me`)
- **Stellabot:** stella@killerapps.dev (Google OAuth in browser)
- **1Password:** John logs me in via CLI when needed (`op signin`)
- **Telegram:** @Bella71bot

---

## Database

- **Project:** snowy-glade-51902107
- **Env var:** `$NEW_DB` (set in ~/.zshrc)
- **Connect:** `psql "$NEW_DB"`
- **psql path:** /opt/homebrew/opt/postgresql@16/bin/psql

---

## CLI Tools Installed

| Tool | Version | Auth |
|------|---------|------|
| gh | latest | stella-costa (keyring) |
| fly | v0.4.14 | stella@killerapps.dev |
| neonctl | 2.21.0 | stella@killerapps.dev |
| cloudflared | 2026.2.0 | TBD |
| node | v25.6.1 | — |
| psql | 16.x | via $NEW_DB |

---

## Repos

| Repo | Local Path | Purpose |
|------|-----------|---------|
| jvalenty/openclaw | ~/openclaw-repo | Agent memory sync |
| jvalenty/e2e | ~/e2e | Platform runtime + machine service |
| jvalenty/stellabot | TBD | Stellabot control plane |

---

## Machine Service (Bella's Mac Mini)

- **Status:** Machine registered in Stellabot (e2e org)
- **Machine ID:** 793f1345-f240-426d-99c1-3bd283db1a2d
- **Token:** stored in .env (never echo)
- **Networking:** Cloudflare tunnel (TBD setup)
- **Code:** ~/e2e/machine/
