#!/bin/bash
# DIVE V3 Remote Deployment Script
# Usage: ./scripts/remote/deploy-remote.sh [instance] [OPTIONS]
# Example: ./scripts/remote/deploy-remote.sh deu --sync-themes --sync-tunnel
#
# OPTIONS:
#   --sync-themes    Sync Keycloak themes to remote
#   --sync-policies  Sync OPA policies to remote
#   --sync-tunnel    Regenerate & sync Cloudflare tunnel config from SSOT
#   --sync-all       Sync everything (themes, policies, tunnel)
#   --full           Full deployment with all syncs
#   --skip-verify    Skip post-deployment verification
#   --skip-backup    Skip pre-deployment backup (not recommended)
#
# SSOT: config/federation-registry.json is the single source of truth.
#       Tunnel configs are GENERATED from the registry, not hand-edited.
#
# Exit Codes:
#   0 - Deployment successful and verified
#   1 - Deployment completed but verification failed
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
FEDERATION_DIR="$PROJECT_ROOT/scripts/federation"
REGISTRY_FILE="$PROJECT_ROOT/config/federation-registry.json"

# Source the SSH helper (provides ssh_remote, sudo_remote, sync_themes, etc.)
source "$SCRIPT_DIR/ssh-helper.sh"

# Check prerequisites
if ! check_ssh_prereqs; then
    exit 1
fi

# Parse arguments
SYNC_THEMES=false
SYNC_POLICIES=false
SYNC_TUNNEL=false
SKIP_VERIFY=false
SKIP_BACKUP=false
for arg in "$@"; do
    case "$arg" in
        --sync-themes) SYNC_THEMES=true ;;
        --sync-policies) SYNC_POLICIES=true ;;
        --sync-tunnel) SYNC_TUNNEL=true ;;
        --skip-verify) SKIP_VERIFY=true ;;
        --skip-backup) SKIP_BACKUP=true ;;
        --sync-all|--full) 
            SYNC_THEMES=true
            SYNC_POLICIES=true
            SYNC_TUNNEL=true
            ;;
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
echo "║         SSOT: federation-registry.json v3.0                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Instance:      $INSTANCE"
echo "  Host:          $REMOTE_HOST"
echo "  Remote Dir:    $REMOTE_DIR"
echo "  Domain:        $DOMAIN"
echo "  Date:          $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""
echo "  Sync Options:"
echo "    Themes:      $SYNC_THEMES"
echo "    Policies:    $SYNC_POLICIES"
echo "    Tunnel:      $SYNC_TUNNEL"
echo "  Verification:"
echo "    Skip Verify: $SKIP_VERIFY"
echo "    Skip Backup: $SKIP_BACKUP"
echo ""

# Calculate total steps based on options
TOTAL_STEPS=5  # Base: preflight, status, backup, restart, verify
[ "$SYNC_TUNNEL" = true ] && TOTAL_STEPS=$((TOTAL_STEPS + 1))
[ "$SYNC_THEMES" = true ] && TOTAL_STEPS=$((TOTAL_STEPS + 1))
[ "$SYNC_POLICIES" = true ] && TOTAL_STEPS=$((TOTAL_STEPS + 1))
[ "$SKIP_VERIFY" = false ] && TOTAL_STEPS=$((TOTAL_STEPS + 1))  # Add verification step
CURRENT_STEP=0

next_step() {
    CURRENT_STEP=$((CURRENT_STEP + 1))
    echo ""
    echo ">>> [$CURRENT_STEP/$TOTAL_STEPS] $1"
}

# 1. Pre-flight checks
next_step "Pre-flight checks..."
echo "  Testing SSH connection..."
if ! ssh_remote "$INSTANCE" "echo 'SSH OK'" >/dev/null 2>&1; then
    echo "ERROR: Cannot connect to $INSTANCE via SSH"
    exit 1
fi
echo "  ✓ SSH connection OK"

# 2. Check current status
next_step "Checking current status..."
ssh_remote "$INSTANCE" "docker ps --format 'table {{.Names}}\t{{.Status}}' | head -15"

# 3. Create backup
next_step "Creating backup..."
BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
ssh_remote "$INSTANCE" "mkdir -p $REMOTE_DIR/backups/$BACKUP_DATE"
ssh_remote "$INSTANCE" "cp $REMOTE_DIR/docker-compose.yml $REMOTE_DIR/backups/$BACKUP_DATE/ 2>/dev/null || true"
ssh_remote "$INSTANCE" "cp $REMOTE_DIR/.env $REMOTE_DIR/backups/$BACKUP_DATE/ 2>/dev/null || true"
echo "  ✓ Backup created: $REMOTE_DIR/backups/$BACKUP_DATE/"

# 4. Sync tunnel config (if requested) - FROM SSOT
if [ "$SYNC_TUNNEL" = true ]; then
    next_step "Syncing Cloudflare tunnel config (from SSOT)..."
    
    # Step 4a: Generate tunnel config from federation-registry.json
    echo "  Regenerating tunnel config from SSOT..."
    if [ -x "$FEDERATION_DIR/generate-tunnel-configs.sh" ]; then
        "$FEDERATION_DIR/generate-tunnel-configs.sh" "$INSTANCE" || {
            echo "  ERROR: Failed to generate tunnel config"
            exit 1
        }
    else
        echo "  ERROR: generate-tunnel-configs.sh not found or not executable"
        exit 1
    fi
    
    # Step 4b: Get the config file path from registry
    CONFIG_FILE=$(jq -r ".instances.${INSTANCE}.cloudflare.configFile // empty" "$REGISTRY_FILE")
    if [ -z "$CONFIG_FILE" ]; then
        echo "  ERROR: Could not find configFile for instance $INSTANCE in registry"
        exit 1
    fi
    
    LOCAL_CONFIG="$PROJECT_ROOT/$CONFIG_FILE"
    REMOTE_CONFIG="$REMOTE_DIR/$CONFIG_FILE"
    
    echo "  Local config:  $LOCAL_CONFIG"
    echo "  Remote config: $REMOTE_CONFIG"
    
    # Step 4c: Sync to remote
    echo "  Transferring config to remote..."
    sudo_remote "$INSTANCE" "mkdir -p $(dirname $REMOTE_CONFIG)"
    rsync_remote "$INSTANCE" "$LOCAL_CONFIG" "$REMOTE_CONFIG"
    
    # Step 4d: Restart cloudflared to apply
    echo "  Restarting cloudflared to apply new config..."
    ssh_remote "$INSTANCE" "docker restart cloudflared-${INSTANCE} 2>/dev/null || docker restart dive-v3-cloudflared-${INSTANCE} 2>/dev/null" || \
        echo "  Warning: Could not restart cloudflared (may need manual restart)"
    
    echo "  ✓ Tunnel config synced from SSOT"
fi

# 5. Sync themes (if requested)
if [ "$SYNC_THEMES" = true ]; then
    next_step "Syncing Keycloak themes..."
    sync_themes "$INSTANCE"
fi

# 6. Sync policies (if requested)
if [ "$SYNC_POLICIES" = true ]; then
    next_step "Syncing OPA policies..."
    "$SCRIPT_DIR/sync-policies.sh" "$INSTANCE"
fi

# 7. Restart services
next_step "Restarting services..."
ssh_remote "$INSTANCE" "cd $REMOTE_DIR && docker compose restart" 2>/dev/null || \
ssh_remote "$INSTANCE" "cd $REMOTE_DIR && docker-compose restart" 2>/dev/null || \
echo "  Warning: Could not restart via compose, trying individual containers..."

# Wait for services to be healthy
echo "  Waiting for services to be healthy..."
sleep 30

# Verification step (unless skipped)
DEPLOYMENT_SUCCESS=true
if [ "$SKIP_VERIFY" = false ]; then
    next_step "Verifying deployment..."
    
    # Check via HTTP with retries
    echo "  Checking external endpoints..."
    
    API_HEALTH="unknown"
    APP_STATUS="000"
    IDP_STATUS="000"
    
    for attempt in 1 2 3; do
        API_HEALTH=$(curl -sk "https://${INSTANCE}-api.$DOMAIN/health" --max-time 10 2>/dev/null | jq -r '.status' 2>/dev/null || echo "unknown")
        APP_STATUS=$(curl -sk -o /dev/null -w "%{http_code}" "https://${INSTANCE}-app.$DOMAIN" --max-time 10 2>/dev/null || echo "000")
        IDP_STATUS=$(curl -sk -o /dev/null -w "%{http_code}" "https://${INSTANCE}-idp.$DOMAIN/realms/dive-v3-broker" --max-time 10 2>/dev/null || echo "000")
        
        if [[ "$APP_STATUS" =~ ^(200|301|302)$ ]] && [[ "$IDP_STATUS" =~ ^(200|301|302)$ ]]; then
            break
        fi
        
        [ $attempt -lt 3 ] && { echo "  Retry $attempt/3..."; sleep 10; }
    done
    
    # Verification results
    echo ""
    echo "  Verification Results:"
    
    [[ "$APP_STATUS" =~ ^(200|301|302)$ ]] && echo "    ✅ Frontend:  HTTP $APP_STATUS" || { echo "    ❌ Frontend:  HTTP $APP_STATUS"; DEPLOYMENT_SUCCESS=false; }
    [[ "$API_HEALTH" == "healthy" || "$API_HEALTH" == "ok" ]] && echo "    ✅ Backend:   $API_HEALTH" || echo "    ⚠️  Backend:   $API_HEALTH"
    [[ "$IDP_STATUS" =~ ^(200|301|302)$ ]] && echo "    ✅ Keycloak:  HTTP $IDP_STATUS" || { echo "    ❌ Keycloak:  HTTP $IDP_STATUS"; DEPLOYMENT_SUCCESS=false; }
fi

# Check container health
next_step "Final status check..."

echo ""
echo "Container Status:"
ssh_remote "$INSTANCE" "docker ps --format '  {{.Names}}: {{.Status}}' | grep -E 'keycloak|frontend|backend|opa|cloudflared'" || echo "  Could not retrieve container status"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                   Deployment Results                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Instance:     ${INSTANCE^^}"
echo "  Frontend:     https://${INSTANCE}-app.$DOMAIN"
echo "  Backend:      https://${INSTANCE}-api.$DOMAIN"
echo "  Keycloak:     https://${INSTANCE}-idp.$DOMAIN"
echo ""

if [ "$DEPLOYMENT_SUCCESS" = true ]; then
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║               ✅ DEPLOYMENT SUCCESSFUL                       ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    exit 0
else
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║               ⚠️  DEPLOYMENT NEEDS ATTENTION                 ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Troubleshooting commands:"
    echo "  source scripts/remote/ssh-helper.sh"
    echo "  ssh_remote $INSTANCE 'docker logs frontend-${INSTANCE} --tail 50'"
    echo "  ssh_remote $INSTANCE 'docker logs backend-${INSTANCE} --tail 50'"
    echo "  ssh_remote $INSTANCE 'docker logs keycloak-${INSTANCE} --tail 50'"
    echo "  ssh_remote $INSTANCE 'docker logs cloudflared-${INSTANCE} --tail 50'"
    exit 1
fi
