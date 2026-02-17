#!/bin/bash
# sync.sh - Commit and push workspace changes
# Usage: ./scripts/sync.sh [commit message]

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

MSG="${1:-Memory sync: $(date '+%Y-%m-%d %H:%M')}"

if [[ -n $(git status --porcelain) ]]; then
    echo "📝 Changes detected, syncing..."
    git add -A
    git commit -m "$MSG"
    git push origin main
    echo "✅ Sync complete: $MSG"
else
    echo "ℹ️ No changes to sync"
fi
