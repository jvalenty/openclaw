#!/bin/bash
# sync-to-github.sh - Sync Bella's workspace files to jvalenty/openclaw repo
# Usage: ./scripts/sync-to-github.sh ["optional commit message"]

set -e

WORKSPACE="/Users/bella/.openclaw/workspace"
REPO="$HOME/openclaw-repo"
AGENT_DIR="$REPO/agents/bella"

# Pull latest first
cd "$REPO"
git pull origin main --quiet

# Sync workspace files to repo
mkdir -p "$AGENT_DIR/memory"
cp "$WORKSPACE/SOUL.md"      "$AGENT_DIR/SOUL.md"
cp "$WORKSPACE/AGENTS.md"    "$AGENT_DIR/AGENTS.md"
cp "$WORKSPACE/USER.md"      "$AGENT_DIR/USER.md"
cp "$WORKSPACE/TOOLS.md"     "$AGENT_DIR/TOOLS.md"
cp "$WORKSPACE/IDENTITY.md"  "$AGENT_DIR/IDENTITY.md"
cp "$WORKSPACE/MEMORY.md"    "$AGENT_DIR/MEMORY.md"

# Sync memory files (daily logs)
if ls "$WORKSPACE/memory/"*.md 1>/dev/null 2>&1; then
  cp "$WORKSPACE/memory/"*.md "$AGENT_DIR/memory/"
fi

# Commit and push if anything changed
MSG="${1:-Bella memory sync: $(date '+%Y-%m-%d %H:%M PST')}"

if [[ -n $(git status --porcelain) ]]; then
  git add -A
  git commit -m "$MSG"
  git push origin main
  echo "✅ Synced to GitHub: $MSG"
else
  echo "ℹ️ No changes to sync"
fi
