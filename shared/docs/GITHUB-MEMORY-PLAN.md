# GitHub Memory Management Plan

**Repo:** https://github.com/jvalenty/openclaw
**Purpose:** Centralized, version-controlled memory for OpenClaw agents

---

## 1. Repository Structure

```
jvalenty/openclaw/
│
├── README.md                    # Repo overview, setup instructions
├── .gitignore                   # Security exclusions
│
├── agents/
│   ├── stella/                  # Stella's workspace (Mac Mini host)
│   │   ├── SOUL.md              # Identity, personality, rules
│   │   ├── AGENTS.md            # Operating instructions
│   │   ├── USER.md              # John's profile
│   │   ├── TOOLS.md             # Local tool notes
│   │   ├── HEARTBEAT.md         # Heartbeat checklist
│   │   ├── IDENTITY.md          # Name, emoji, vibe
│   │   ├── MEMORY.md            # Long-term curated memory
│   │   └── memory/              # Daily logs
│   │       ├── 2026-02-17.md
│   │       ├── 2026-02-16.md
│   │       └── *.md             # Topic files (incidents, guides, etc.)
│   │
│   └── bella/                   # Bella's workspace (OrbStack container)
│       ├── SOUL.md
│       ├── AGENTS.md
│       ├── USER.md
│       ├── TOOLS.md
│       ├── HEARTBEAT.md
│       └── memory/
│
├── shared/                      # Cross-agent shared resources
│   ├── GLOBAL_RULES.md          # Universal security/safety rules
│   ├── templates/               # Standard templates
│   │   ├── daily-log.md
│   │   └── incident-report.md
│   └── knowledge/               # Shared knowledge base
│       └── stellabot-architecture.md
│
├── scripts/
│   ├── sync.sh                  # Git commit/push helper
│   ├── pull.sh                  # Safe pull with conflict handling
│   ├── backup.sh                # Full backup before updates
│   └── consolidate.py           # Memory consolidation (future)
│
└── docs/                        # Documentation (optional)
    └── SETUP.md
```

---

## 2. File Migration Plan

### From `~/clawd/` (current workspace)

| Current Location | Destination | Notes |
|------------------|-------------|-------|
| `SOUL.md` | `agents/stella/SOUL.md` | Core identity |
| `AGENTS.md` | `agents/stella/AGENTS.md` | Operating instructions |
| `USER.md` | `agents/stella/USER.md` | John's profile |
| `TOOLS.md` | `agents/stella/TOOLS.md` | Local tool notes |
| `HEARTBEAT.md` | `agents/stella/HEARTBEAT.md` | Heartbeat config |
| `IDENTITY.md` | `agents/stella/IDENTITY.md` | Name/emoji |
| `MEMORY.md` | `agents/stella/MEMORY.md` | Long-term memory |
| `memory/*.md` | `agents/stella/memory/` | All 34 memory files |
| `agents/shared/GLOBAL_RULES.md` | `shared/GLOBAL_RULES.md` | Global rules |

### Files NOT migrated (stay local or deprecated)

| File | Reason |
|------|--------|
| `CONTEXT.md` | May be stale, review first |
| `ALL-PROJECT-FILES.md` | Old index, deprecated |
| `CLOUDFLARE-*.md` | Historical, move to docs/archive if needed |
| `MASTER-CLAWDBOT-SECURITY-PROJECT.md` | Historical |
| `docs/` folder | Consider separate or subdirectory |

---

## 3. Security (.gitignore)

```gitignore
# Secrets - NEVER commit
.env
*.key
*.pem
**/secrets*
**/*secret*
**/*credential*
**/*token*

# OpenClaw state (lives in ~/.openclaw, not workspace)
.openclaw/
credentials/

# OS/Editor
.DS_Store
*.swp
*~
.vscode/
.idea/

# Temp files
*.tmp
*.log
*.bak
```

---

## 4. Sync Scripts

### `scripts/sync.sh`
```bash
#!/bin/bash
# Commit and push workspace changes

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

if [[ -n $(git status --porcelain) ]]; then
    echo "📝 Changes detected, syncing..."
    git add -A
    git commit -m "Memory sync: $(date '+%Y-%m-%d %H:%M')"
    git push origin main
    echo "✅ Sync complete"
else
    echo "ℹ️ No changes to sync"
fi
```

### `scripts/pull.sh`
```bash
#!/bin/bash
# Safe pull with stash

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "📥 Pulling latest..."
git stash
git pull --rebase origin main
git stash pop 2>/dev/null || true
echo "✅ Pull complete"
```

---

## 5. Workspace Symlink Strategy

After cloning the repo, symlink agent workspaces:

```bash
# Clone repo
git clone https://github.com/jvalenty/openclaw.git ~/openclaw-repo

# Symlink Stella's workspace files
cd ~/.openclaw/workspace  # or ~/clawd
ln -sf ~/openclaw-repo/agents/stella/SOUL.md SOUL.md
ln -sf ~/openclaw-repo/agents/stella/AGENTS.md AGENTS.md
ln -sf ~/openclaw-repo/agents/stella/memory memory
# ... etc

# OR: Point OpenClaw config to repo directly
# agents.defaults.workspace: ~/openclaw-repo/agents/stella
```

**Option A: Symlinks** — Keep current workspace location, symlink to repo
**Option B: Direct** — Point OpenClaw workspace config to repo location

---

## 6. Sync Workflow

### Manual Sync
```bash
cd ~/openclaw-repo
./scripts/sync.sh
```

### Automated Sync (cron)
```bash
# Add to crontab or OpenClaw cron
# Every hour during active hours
0 * * * * cd ~/openclaw-repo && ./scripts/sync.sh
```

### Agent Self-Sync
Agent can run sync after significant work:
```bash
cd ~/openclaw-repo && git add -A && git commit -m "Session update" && git push
```

---

## 7. Multi-Machine Sync

### Scenario: Stella (Mac Mini) + Bella (Container) + Future Agents

1. All agents clone same repo
2. Each agent works in their `agents/<name>/` directory
3. Pull before session start
4. Push after significant changes
5. Conflicts resolved by last-write-wins or manual merge

### Conflict Prevention
- Each agent has isolated directory
- Shared files (`GLOBAL_RULES.md`) rarely change
- Daily logs are date-named (no conflicts)

---

## 8. Implementation Steps

### Phase 1: Initial Setup
1. [ ] Clone repo locally: `git clone https://github.com/jvalenty/openclaw.git ~/openclaw-repo`
2. [ ] Create directory structure
3. [ ] Copy Stella's files to `agents/stella/`
4. [ ] Create `.gitignore`
5. [ ] Create `shared/GLOBAL_RULES.md`
6. [ ] Initial commit and push

### Phase 2: Integration
7. [ ] Decide: symlink vs direct workspace
8. [ ] Update OpenClaw config if needed
9. [ ] Test agent can read/write files
10. [ ] Set up sync script

### Phase 3: Automation
11. [ ] Add cron job for hourly sync
12. [ ] Document in AGENTS.md
13. [ ] Test recovery from fresh clone

### Phase 4: Bella Integration
14. [ ] Copy Bella's workspace files to `agents/bella/`
15. [ ] Clone repo inside container
16. [ ] Test multi-agent sync

---

## 9. Recovery Procedure

If agent loses local state:

```bash
# 1. Clone fresh
git clone https://github.com/jvalenty/openclaw.git ~/openclaw-repo

# 2. Point workspace (or symlink)
# Edit ~/.openclaw/openclaw.json:
# agents.defaults.workspace: ~/openclaw-repo/agents/stella

# 3. Restart gateway
openclaw gateway restart

# 4. Agent has full memory restored
```

---

## 10. Security Checklist

- [ ] Repo is PRIVATE
- [ ] No API keys in any file
- [ ] No OAuth tokens
- [ ] No passwords
- [ ] .gitignore covers secrets patterns
- [ ] MEMORY.md doesn't contain sensitive data
- [ ] Review commits before push

---

**Ready to execute?**

Next: John approves → I create the structure → Initial commit
