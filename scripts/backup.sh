#!/bin/bash
# backup.sh - Create timestamped backup archive
# Usage: ./scripts/backup.sh

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$HOME/openclaw-backups"
TIMESTAMP=$(date '+%Y%m%d-%H%M%S')
BACKUP_FILE="$BACKUP_DIR/openclaw-backup-$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "📦 Creating backup..."
tar -czf "$BACKUP_FILE" -C "$REPO_DIR" .

echo "✅ Backup saved: $BACKUP_FILE"
echo "   Size: $(du -h "$BACKUP_FILE" | cut -f1)"
