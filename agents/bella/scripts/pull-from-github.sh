#!/bin/bash
# pull-from-github.sh - Pull latest workspace files from jvalenty/openclaw repo
# Usage: ./scripts/pull-from-github.sh

set -e

WORKSPACE="/Users/bella/.openclaw/workspace"
REPO="$HOME/openclaw-repo"
AGENT_DIR="$REPO/agents/bella"

cd "$REPO"
git pull origin main --quiet

# Copy repo files back to workspace
mkdir -p "$WORKSPACE/memory"
cp "$AGENT_DIR/SOUL.md"      "$WORKSPACE/SOUL.md"
cp "$AGENT_DIR/AGENTS.md"    "$WORKSPACE/AGENTS.md"
cp "$AGENT_DIR/USER.md"      "$WORKSPACE/USER.md"
cp "$AGENT_DIR/TOOLS.md"     "$WORKSPACE/TOOLS.md"
cp "$AGENT_DIR/IDENTITY.md"  "$WORKSPACE/IDENTITY.md"
cp "$AGENT_DIR/MEMORY.md"    "$WORKSPACE/MEMORY.md"

# Sync memory files
if ls "$AGENT_DIR/memory/"*.md 1>/dev/null 2>&1; then
  cp "$AGENT_DIR/memory/"*.md "$WORKSPACE/memory/"
fi

echo "✅ Pulled latest from GitHub"
