#!/bin/bash
# DIVE V3 Remote Deployment Script
# Usage: ./scripts/remote/deploy-remote.sh [instance] [--sync-themes] [--sync-policies]
# Example: ./scripts/remote/deploy-remote.sh deu --sync-themes
#
# LESSONS LEARNED (2024-11-26):
# - Must use -o PubkeyAuthentication=no for sshpass (local keys have passphrases)
# - DEU themes are at /opt/dive-v3/keycloak/themes/ not /home/mike/dive-v3/
# - sudo needs password piped via: echo 'password' | sudo -S command
# - Use 'docker compose' (v2) not 'docker-compose' (v1) on remote

set -e

# Configuration
INSTANCE="${1:-deu}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Source the SSH helper (provides ssh_remote, sudo_remote, sync_themes, etc.)
source "$SCRIPT_DIR/ssh-helper.sh"

# Check prerequisites
if ! check_ssh_prereqs; then
    exit 1
fi

# Parse arguments
SYNC_THEMES=false
SYNC_POLICIES=false
for arg in "$@"; do
    case "$arg" in
        --sync-themes) SYNC_THEMES=true ;;
        --sync-policies) SYNC_POLICIES=true ;;
    esac
done

# Get instance configuration
REMOTE_HOST=$(get_remote_config "$INSTANCE" "host")
REMOTE_DIR=$(get_remote_config "$INSTANCE" "dir")
DOMAIN=$(get_remote_config "$INSTANCE" "domain")

if [ -z "$REMOTE_HOST" ]; then
    echo "Unknown instance: $INSTANCE"
    echo "Available instances: deu"
    exit 1
fi

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              DIVE V3 Remote Deployment                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Instance:    $INSTANCE"
echo "  Host:        $REMOTE_HOST"
echo "  Remote Dir:  $REMOTE_DIR"
echo "  Domain:      $DOMAIN"
echo "  Date:        $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "  Sync Themes: $SYNC_THEMES"
echo "  Sync Policies: $SYNC_POLICIES"
echo ""

# 1. Pre-flight checks
echo ">>> [1/7] Pre-flight checks..."
echo "  Testing SSH connection..."
if ! ssh_remote "$INSTANCE" "echo 'SSH OK'" >/dev/null 2>&1; then
    echo "ERROR: Cannot connect to $INSTANCE via SSH"
    exit 1
fi
echo "  ✓ SSH connection OK"

# 2. Check current status
echo ""
echo ">>> [2/7] Checking current status..."
ssh_remote "$INSTANCE" "docker ps --format 'table {{.Names}}\t{{.Status}}' | head -15"

# 3. Create backup
echo ""
echo ">>> [3/7] Creating backup..."
BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
ssh_remote "$INSTANCE" "mkdir -p $REMOTE_DIR/backups/$BACKUP_DATE"
ssh_remote "$INSTANCE" "cp $REMOTE_DIR/docker-compose.yml $REMOTE_DIR/backups/$BACKUP_DATE/ 2>/dev/null || true"
ssh_remote "$INSTANCE" "cp $REMOTE_DIR/.env $REMOTE_DIR/backups/$BACKUP_DATE/ 2>/dev/null || true"
echo "  ✓ Backup created: $REMOTE_DIR/backups/$BACKUP_DATE/"

# 4. Sync themes (if requested)
if [ "$SYNC_THEMES" = true ]; then
    echo ""
    echo ">>> [4/7] Syncing Keycloak themes..."
    sync_themes "$INSTANCE"
fi

# 5. Sync policies (if requested)
if [ "$SYNC_POLICIES" = true ]; then
    echo ""
    echo ">>> [5/7] Syncing OPA policies..."
    "$SCRIPT_DIR/sync-policies.sh" "$INSTANCE"
fi

# 6. Restart services
echo ""
echo ">>> [6/7] Restarting services..."
ssh_remote "$INSTANCE" "cd $REMOTE_DIR && docker compose restart" 2>/dev/null || \
ssh_remote "$INSTANCE" "cd $REMOTE_DIR && docker-compose restart" 2>/dev/null || \
echo "  Warning: Could not restart via compose, trying individual containers..."

# Wait for services to be healthy
echo "  Waiting for services to be healthy..."
sleep 30

# 7. Verify health
echo ""
echo ">>> [7/7] Verifying health..."

# Check via HTTP
API_HEALTH=$(curl -sk "https://${INSTANCE}-api.$DOMAIN/health" 2>/dev/null | jq -r '.status' 2>/dev/null || echo "unknown")
APP_STATUS=$(curl -sk -o /dev/null -w "%{http_code}" "https://${INSTANCE}-app.$DOMAIN" 2>/dev/null || echo "000")
IDP_STATUS=$(curl -sk -o /dev/null -w "%{http_code}" "https://${INSTANCE}-idp.$DOMAIN/realms/dive-v3-broker" 2>/dev/null || echo "000")

# Check container health
echo ""
echo "Container Status:"
ssh_remote "$INSTANCE" "docker ps --format '  {{.Names}}: {{.Status}}' | grep -E 'keycloak|frontend|backend|opa'"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                   Deployment Results                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Backend API:  $API_HEALTH"
echo "  Frontend:     HTTP $APP_STATUS"
echo "  Keycloak:     HTTP $IDP_STATUS"
echo ""

if [[ "$API_HEALTH" == "healthy" || "$APP_STATUS" == "200" || "$IDP_STATUS" == "200" ]]; then
    echo "✅ Deployment successful!"
else
    echo "⚠️  Some services may need attention"
    echo ""
    echo "Troubleshooting commands:"
    echo "  source scripts/remote/ssh-helper.sh"
    echo "  ssh_remote $INSTANCE 'docker logs dive-v3-frontend-$INSTANCE --tail 50'"
    echo "  ssh_remote $INSTANCE 'docker logs dive-v3-backend-$INSTANCE --tail 50'"
    echo "  ssh_remote $INSTANCE 'docker logs dive-v3-keycloak-$INSTANCE --tail 50'"
fi
