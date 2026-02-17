# OpenClaw Agent Memory

Private repository for OpenClaw agent workspaces, memory, and shared resources.

## Structure

```
├── agents/
│   ├── stella/          # Stella's workspace (Mac Mini)
│   │   ├── SOUL.md      # Identity, personality, rules
│   │   ├── AGENTS.md    # Operating instructions  
│   │   ├── USER.md      # User profile
│   │   ├── TOOLS.md     # Local tool notes
│   │   ├── MEMORY.md    # Long-term memory
│   │   └── memory/      # Daily logs & topics
│   │
│   └── bella/           # Bella's workspace (Container)
│
├── shared/
│   ├── GLOBAL_RULES.md  # Universal agent rules
│   ├── docs/            # Architecture documentation
│   └── templates/       # Standard templates
│
└── scripts/
    ├── sync.sh          # Commit & push changes
    ├── pull.sh          # Safe pull with stash
    └── backup.sh        # Create backup archive
```

## Quick Commands

```bash
# Sync changes to GitHub
./scripts/sync.sh "Update message"

# Pull latest (handles uncommitted changes)
./scripts/pull.sh

# Create backup before major changes
./scripts/backup.sh
```

## Agent Self-Sync

Agents can sync their own memory:

```bash
cd ~/openclaw-repo
git add -A && git commit -m "Session update" && git push
```

## Recovery

If an agent loses local state:

```bash
git clone https://github.com/jvalenty/openclaw.git ~/openclaw-repo
# Point workspace config to: ~/openclaw-repo/agents/<agent-name>
```

## Security

- **Private repo** — contains personal context
- **No secrets** — API keys, tokens, passwords stay in env vars or 1Password
- **Review commits** — check for accidental secret exposure

---

*Maintained by Stella & John @ killerapps.dev*
