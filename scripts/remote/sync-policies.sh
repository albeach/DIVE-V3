#!/bin/bash
# DIVE V3 Policy Sync Script
# Syncs OPA policies from main repo to remote instances
# Usage: ./scripts/remote/sync-policies.sh [instance]
# Example: ./scripts/remote/sync-policies.sh deu
#
# LESSONS LEARNED (2024-11-26):
# - Must use -o PubkeyAuthentication=no for sshpass
# - DEU project is at /opt/dive-v3 not /home/mike/dive-v3
# - Use 'docker compose' (v2) not 'docker-compose' (v1)

set -e

# Configuration
INSTANCE="${1:-deu}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Source the SSH helper
source "$SCRIPT_DIR/ssh-helper.sh"

# Check prerequisites
if ! check_ssh_prereqs; then
    exit 1
fi

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
echo "║              DIVE V3 Policy Sync                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Instance:    $INSTANCE"
echo "  Host:        $REMOTE_HOST"
echo "  Remote Dir:  $REMOTE_DIR"
echo "  Source:      $PROJECT_ROOT/policies"
echo "  Date:        $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# 1. Validate local policies
echo ">>> [1/4] Validating local policies..."
if [ -x "$PROJECT_ROOT/bin/opa" ]; then
    "$PROJECT_ROOT/bin/opa" check "$PROJECT_ROOT/policies/" && echo "  ✓ Policies valid" || {
        echo "Policy validation failed!"
        exit 1
    }
elif command -v opa &> /dev/null; then
    opa check "$PROJECT_ROOT/policies/" && echo "  ✓ Policies valid" || {
        echo "Policy validation failed!"
        exit 1
    }
else
    echo "  ⚠ OPA not installed locally, skipping validation"
fi

# 2. Backup remote policies
echo ""
echo ">>> [2/4] Backing up remote policies..."
BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
ssh_remote "$INSTANCE" "cp -r $REMOTE_DIR/policies $REMOTE_DIR/policies.backup-$BACKUP_DATE" 2>/dev/null || \
    echo "  (No existing policies to backup)"

# 3. Sync policies
echo ""
echo ">>> [3/4] Syncing policies..."
rsync_remote "$INSTANCE" "$PROJECT_ROOT/policies/" "$REMOTE_DIR/policies/"

# 4. Restart OPA
echo ""
echo ">>> [4/4] Restarting OPA..."
ssh_remote "$INSTANCE" "docker restart dive-v3-opa-$INSTANCE" 2>/dev/null || \
ssh_remote "$INSTANCE" "docker restart dive-v3-opa" 2>/dev/null || \
echo "  Warning: Could not restart OPA container"

# Wait and verify
sleep 10
echo ""
echo ">>> Verifying OPA..."

# Check OPA health
ssh_remote "$INSTANCE" "docker ps --format '{{.Names}}: {{.Status}}' | grep opa"

# Check via API
OPA_HEALTH=$(curl -sk "https://${INSTANCE}-api.$DOMAIN/health" 2>/dev/null | jq -r '.opa // .status' 2>/dev/null || echo "unknown")

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                   Sync Complete                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  OPA Status: $OPA_HEALTH"
echo ""

if [[ "$OPA_HEALTH" == "healthy" || "$OPA_HEALTH" == "ok" || "$OPA_HEALTH" != "unknown" ]]; then
    echo "✅ Policy sync successful!"
else
    echo "⚠️  OPA may need attention"
    echo ""
    echo "Troubleshooting:"
    echo "  source scripts/remote/ssh-helper.sh"
    echo "  ssh_remote $INSTANCE 'docker logs dive-v3-opa-$INSTANCE --tail 50'"
    echo ""
    echo "Rollback:"
    echo "  ssh_remote $INSTANCE 'rm -rf $REMOTE_DIR/policies && mv $REMOTE_DIR/policies.backup-$BACKUP_DATE $REMOTE_DIR/policies'"
fi
