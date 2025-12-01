#!/bin/bash
# =============================================================================
# DIVE V3 - Seed DEU Instance (Remote)
# =============================================================================
# Seeds the DEU (Germany) MongoDB instance which runs on a remote server.
#
# This script:
# 1. Syncs config files to the DEU server
# 2. Copies updated seed scripts to the backend container
# 3. Fixes container permissions
# 4. Runs the seed inside the backend container
#
# Usage:
#   ./scripts/seed-deu-remote.sh [--count N] [--dry-run] [--replace]
#
# Prerequisites:
#   - SSH key configured for DEU (auto-setup on first run)
#   - GCP Secret Manager access
#
# =============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Remote server configuration
REMOTE_HOST="${DEU_SSH_HOST:-192.168.42.120}"
REMOTE_USER="${DEU_SSH_USER:-mike}"
REMOTE_PATH="/opt/dive-v3"
SSH_KEY="$HOME/.ssh/id_rsa_deu"

# Default options
COUNT=7000
DRY_RUN=""
REPLACE=""
SKIP_SYNC=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --count) COUNT="$2"; shift 2 ;;
        --dry-run) DRY_RUN="--dry-run"; shift ;;
        --replace) REPLACE="--replace"; shift ;;
        --skip-sync) SKIP_SYNC=true; shift ;;
        --help|-h)
            head -20 "$0" | grep -E "^#" | tail -n +2 | sed 's/^# //'
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       DIVE V3 - DEU Instance Seeding (Remote)                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check SSH key exists
if [[ ! -f "$SSH_KEY" ]]; then
    echo -e "${YELLOW}SSH key not found. Setting up key-based auth...${NC}"
    
    # Generate key
    ssh-keygen -t rsa -b 4096 -f "$SSH_KEY" -N "" -C "dive-v3-deu-deploy"
    
    # Copy to server (requires password)
    echo -e "${YELLOW}Enter password for mike@${REMOTE_HOST} to copy SSH key:${NC}"
    if command -v sshpass &>/dev/null && [[ -n "${DEU_SSH_PASS:-}" ]]; then
        sshpass -p "$DEU_SSH_PASS" ssh-copy-id -i "$SSH_KEY" -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_HOST}"
    else
        ssh-copy-id -i "$SSH_KEY" -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_HOST}"
    fi
fi

# Test SSH
SSH_CMD="ssh -i $SSH_KEY -o StrictHostKeyChecking=no -o LogLevel=ERROR"
if ! $SSH_CMD "${REMOTE_USER}@${REMOTE_HOST}" "echo OK" &>/dev/null; then
    echo -e "${RED}❌ SSH connection failed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ SSH connection OK${NC}"

# Sync config and scripts
if [[ "$SKIP_SYNC" == "false" ]]; then
    echo ""
    echo -e "${CYAN}━━━ Syncing files to DEU ━━━${NC}"
    
    # Sync config files
    $SSH_CMD "${REMOTE_USER}@${REMOTE_HOST}" "mkdir -p ${REMOTE_PATH}/config"
    scp -i "$SSH_KEY" -o StrictHostKeyChecking=no \
        "$PROJECT_ROOT/config/federation-registry.json" \
        "$PROJECT_ROOT/config/kas-registry.json" \
        "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/config/"
    echo -e "  ${GREEN}✅ Config files synced${NC}"
    
    # Copy to container
    $SSH_CMD "${REMOTE_USER}@${REMOTE_HOST}" "docker cp ${REMOTE_PATH}/config dive-v3-backend-deu:/app/"
    echo -e "  ${GREEN}✅ Config copied to container${NC}"
    
    # Sync seed script
    scp -i "$SSH_KEY" -o StrictHostKeyChecking=no \
        "$PROJECT_ROOT/backend/src/scripts/seed-instance-resources.ts" \
        "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/backend/src/scripts/"
    $SSH_CMD "${REMOTE_USER}@${REMOTE_HOST}" "docker cp ${REMOTE_PATH}/backend/src/scripts/seed-instance-resources.ts dive-v3-backend-deu:/app/src/scripts/"
    echo -e "  ${GREEN}✅ Seed script synced${NC}"
    
    # Sync gcp-secrets utility
    scp -i "$SSH_KEY" -o StrictHostKeyChecking=no \
        "$PROJECT_ROOT/backend/src/utils/gcp-secrets.ts" \
        "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/backend/src/utils/"
    $SSH_CMD "${REMOTE_USER}@${REMOTE_HOST}" "docker cp ${REMOTE_PATH}/backend/src/utils/gcp-secrets.ts dive-v3-backend-deu:/app/src/utils/"
    echo -e "  ${GREEN}✅ GCP secrets utility synced${NC}"
    
    # Fix permissions
    $SSH_CMD "${REMOTE_USER}@${REMOTE_HOST}" "docker exec -u root dive-v3-backend-deu mkdir -p /app/logs/seed/checkpoints && docker exec -u root dive-v3-backend-deu chmod -R 777 /app/logs"
    echo -e "  ${GREEN}✅ Container permissions fixed${NC}"
fi

# Run seed
echo ""
echo -e "${CYAN}━━━ Seeding DEU (${COUNT} documents) ━━━${NC}"
echo ""

$SSH_CMD "${REMOTE_USER}@${REMOTE_HOST}" "docker exec dive-v3-backend-deu npm run seed:instance -- --instance=DEU --count=${COUNT} ${DRY_RUN} ${REPLACE}" 2>&1

RESULT=$?

echo ""
if [[ $RESULT -eq 0 ]]; then
    echo -e "${GREEN}✅ DEU seeding completed successfully!${NC}"
else
    echo -e "${RED}❌ DEU seeding failed (exit code: $RESULT)${NC}"
fi

exit $RESULT
