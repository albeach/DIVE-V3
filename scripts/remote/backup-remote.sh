#!/bin/bash
# DIVE V3 Remote Backup Script
# Usage: ./scripts/remote/backup-remote.sh [instance]
# Example: ./scripts/remote/backup-remote.sh deu

set -e

# Configuration
INSTANCE="${1:-deu}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
LOCAL_BACKUP_DIR="$PROJECT_ROOT/backups/remote-$INSTANCE"
BACKUP_DATE=$(date +%Y%m%d-%H%M%S)

# Load remote instance configuration
case "$INSTANCE" in
    deu)
        REMOTE_HOST="mike@192.168.42.120"
        REMOTE_PASSWORD="mike2222"
        REMOTE_PROJECT_DIR="/home/mike/dive-v3"
        DOMAIN="prosecurity.biz"
        ;;
    *)
        echo "Unknown instance: $INSTANCE"
        echo "Available: deu"
        exit 1
        ;;
esac

mkdir -p "$LOCAL_BACKUP_DIR/$BACKUP_DATE"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                DIVE V3 Remote Backup                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Instance:    $INSTANCE"
echo "  Host:        $REMOTE_HOST"
echo "  Backup Dir:  $LOCAL_BACKUP_DIR/$BACKUP_DATE"
echo "  Date:        $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# Helper function
ssh_cmd() {
    sshpass -p "$REMOTE_PASSWORD" ssh -o StrictHostKeyChecking=no "$REMOTE_HOST" "$@"
}

rsync_cmd() {
    sshpass -p "$REMOTE_PASSWORD" rsync -avz -e "ssh -o StrictHostKeyChecking=no" "$@"
}

# 1. Backup PostgreSQL (Keycloak)
echo ">>> [1/4] Backing up PostgreSQL (Keycloak)..."
ssh_cmd "cd $REMOTE_PROJECT_DIR && docker-compose exec -T postgres pg_dump -U postgres keycloak_db 2>/dev/null" \
    > "$LOCAL_BACKUP_DIR/$BACKUP_DATE/keycloak-db.sql" || echo "PostgreSQL backup skipped"

# 2. Backup MongoDB
echo ">>> [2/4] Backing up MongoDB..."
ssh_cmd "cd $REMOTE_PROJECT_DIR && docker-compose exec -T mongodb mongodump --archive 2>/dev/null" \
    > "$LOCAL_BACKUP_DIR/$BACKUP_DATE/mongodb.archive" || echo "MongoDB backup skipped"

# 3. Backup configuration files
echo ">>> [3/4] Backing up configuration..."
rsync_cmd "$REMOTE_HOST:$REMOTE_PROJECT_DIR/docker-compose.yml" "$LOCAL_BACKUP_DIR/$BACKUP_DATE/" 2>/dev/null || true
rsync_cmd "$REMOTE_HOST:$REMOTE_PROJECT_DIR/.env" "$LOCAL_BACKUP_DIR/$BACKUP_DATE/" 2>/dev/null || true
rsync_cmd "$REMOTE_HOST:$REMOTE_PROJECT_DIR/policies/" "$LOCAL_BACKUP_DIR/$BACKUP_DATE/policies/" 2>/dev/null || true

# 4. Create manifest
echo ">>> [4/4] Creating manifest..."
cat > "$LOCAL_BACKUP_DIR/$BACKUP_DATE/manifest.json" << EOF
{
  "instance": "$INSTANCE",
  "domain": "$DOMAIN",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "backup_date": "$BACKUP_DATE",
  "contents": [
    "keycloak-db.sql",
    "mongodb.archive",
    "docker-compose.yml",
    ".env",
    "policies/"
  ]
}
EOF

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                   Backup Complete                            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Location: $LOCAL_BACKUP_DIR/$BACKUP_DATE"
echo ""
ls -la "$LOCAL_BACKUP_DIR/$BACKUP_DATE"




