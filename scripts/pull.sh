#!/bin/bash
# pull.sh - Safe pull with stash for uncommitted changes
# Usage: ./scripts/pull.sh

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "📥 Pulling latest..."

# Stash any local changes
if [[ -n $(git status --porcelain) ]]; then
    echo "📦 Stashing local changes..."
    git stash
    STASHED=1
fi

# Pull with rebase
git pull --rebase origin main

# Restore stashed changes
if [[ "$STASHED" == "1" ]]; then
    echo "📦 Restoring local changes..."
    git stash pop || echo "⚠️ Stash pop had conflicts, resolve manually"
fi

echo "✅ Pull complete"
