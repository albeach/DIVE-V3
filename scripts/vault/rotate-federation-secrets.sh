#!/bin/bash
# ============================================================================
# DIVE V3 - Rotate Federation Secrets
# ============================================================================
# Rotates all federation client secrets across instances:
# 1. Regenerates client secrets in each Keycloak instance
# 2. Uploads new secrets to GCP Secret Manager
# 3. Triggers secret sync for all instances
#
# USAGE: ./scripts/vault/rotate-federation-secrets.sh [options]
#
# OPTIONS:
#   --dry-run           Show what would be done without making changes
#   --instance=CODE     Rotate secrets for specific instance only
#   --force             Skip confirmation prompt
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
REGISTRY_FILE="$PROJECT_ROOT/config/federation-registry.json"

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-dive25}"
SECRET_PREFIX="dive-v3-federation"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Flags
DRY_RUN=false
INSTANCE_FILTER=""
FORCE=false

# Parse arguments
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --instance=*) INSTANCE_FILTER="${arg#*=}" ;;
        --force) FORCE=true ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --dry-run           Show what would be done without changes"
            echo "  --instance=CODE     Rotate secrets for specific instance only"
            echo "  --force             Skip confirmation prompt"
            exit 0
            ;;
    esac
done

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_section() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# URL-encode a string
urlencode() {
    local string="$1"
    local strlen=${#string}
    local encoded=""
    local pos c o
    
    for (( pos=0 ; pos<strlen ; pos++ )); do
        c=${string:$pos:1}
        case "$c" in
            [-_.~a-zA-Z0-9] ) o="$c" ;;
            * ) printf -v o '%%%02X' "'$c" ;;
        esac
        encoded+="$o"
    done
    echo "$encoded"
}

# Get admin token for an instance
get_admin_token() {
    local instance=$1
    local idp_url
    local admin_password
    
    idp_url=$(jq -r ".instances.${instance}.urls.idp" "$REGISTRY_FILE")
    admin_password=$(jq -r '.defaults.adminPassword' "$REGISTRY_FILE")
    local encoded_pwd=$(urlencode "$admin_password")
    
    curl -sk -X POST "${idp_url}/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password&client_id=admin-cli&username=admin&password=${encoded_pwd}" 2>/dev/null | jq -r '.access_token'
}

# Regenerate client secret
regenerate_client_secret() {
    local instance=$1
    local client_id=$2
    local idp_url
    
    idp_url=$(jq -r ".instances.${instance}.urls.idp" "$REGISTRY_FILE")
    
    local token=$(get_admin_token "$instance")
    if [ -z "$token" ] || [ "$token" = "null" ]; then
        log_error "Could not get admin token for $instance"
        return 1
    fi
    
    # Get client UUID
    local client_uuid
    client_uuid=$(curl -sk "${idp_url}/admin/realms/dive-v3-broker/clients?clientId=${client_id}" \
        -H "Authorization: Bearer $token" 2>/dev/null | jq -r '.[0].id')
    
    if [ -z "$client_uuid" ] || [ "$client_uuid" = "null" ]; then
        log_error "Client $client_id not found in $instance"
        return 1
    fi
    
    # Regenerate secret
    local new_secret
    new_secret=$(curl -sk -X POST "${idp_url}/admin/realms/dive-v3-broker/clients/${client_uuid}/client-secret" \
        -H "Authorization: Bearer $token" 2>/dev/null | jq -r '.value')
    
    if [ -z "$new_secret" ] || [ "$new_secret" = "null" ]; then
        log_error "Failed to regenerate secret for $client_id"
        return 1
    fi
    
    echo "$new_secret"
}

# Upload secret to GCP
upload_secret() {
    local secret_name=$1
    local secret_value=$2
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would upload: $secret_name"
        return 0
    fi
    
    echo -n "$secret_value" | gcloud secrets versions add "$secret_name" \
        --data-file=- --project="$PROJECT_ID" 2>/dev/null
}

# Confirm action
confirm_rotation() {
    if [ "$FORCE" = true ]; then
        return 0
    fi
    
    echo ""
    log_warn "⚠️  WARNING: This will rotate ALL federation client secrets!"
    log_warn "   - Client secrets will be regenerated in Keycloak"
    log_warn "   - New secrets will be uploaded to GCP Secret Manager"
    log_warn "   - Instances will need to restart to pick up new secrets"
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " response
    
    if [ "$response" != "yes" ]; then
        log_info "Rotation cancelled"
        exit 0
    fi
}

# Rotate secrets
rotate_secrets() {
    log_section "Rotating Federation Secrets"
    
    local instances
    if [ -n "$INSTANCE_FILTER" ]; then
        instances="$INSTANCE_FILTER"
    else
        instances=$(jq -r '.instances | keys[]' "$REGISTRY_FILE")
    fi
    
    local rotated=0
    local failed=0
    
    for source in $instances; do
        log_info "Processing source instance: $source"
        
        local partners=$(jq -r ".federation.matrix.${source}[]" "$REGISTRY_FILE")
        
        for target in $partners; do
            local client_id="dive-v3-${target}-federation"
            local secret_name="${SECRET_PREFIX}-${source}-${target}"
            
            log_info "  Rotating $client_id..."
            
            if [ "$DRY_RUN" = true ]; then
                log_info "  [DRY RUN] Would regenerate $client_id in $source"
                log_info "  [DRY RUN] Would upload to $secret_name"
                rotated=$((rotated + 1))
                continue
            fi
            
            # Regenerate secret
            local new_secret
            if new_secret=$(regenerate_client_secret "$source" "$client_id"); then
                log_success "  ✓ Regenerated: $client_id"
                
                # Upload to GCP
                if upload_secret "$secret_name" "$new_secret"; then
                    log_success "  ✓ Uploaded: $secret_name"
                    rotated=$((rotated + 1))
                else
                    log_error "  ✗ Failed to upload: $secret_name"
                    failed=$((failed + 1))
                fi
            else
                log_error "  ✗ Failed to regenerate: $client_id"
                failed=$((failed + 1))
            fi
        done
    done
    
    log_section "Rotation Summary"
    echo ""
    echo "  Rotated: $rotated"
    echo "  Failed:  $failed"
    echo ""
    
    if [ $failed -gt 0 ]; then
        log_error "Some rotations failed"
        return 1
    fi
    
    log_success "All secrets rotated successfully"
}

# Notify about restart requirements
notify_restart() {
    log_section "Required Actions"
    
    echo ""
    echo "To complete the rotation, restart Keycloak instances to pick up new secrets:"
    echo ""
    echo "  For local instances:"
    echo "    docker compose -f docker-compose.yml -f docker-compose.vault.yml run --rm keycloak-vault-sync"
    echo "    docker compose restart keycloak"
    echo ""
    echo "  For FRA/GBR instances:"
    echo "    INSTANCE=fra docker compose -f docker-compose.fra.yml -f docker-compose.vault.yml run --rm keycloak-vault-sync"
    echo "    docker compose -f docker-compose.fra.yml restart keycloak"
    echo ""
    echo "  For DEU (remote):"
    echo "    SSH to DEU server and run sync script"
    echo ""
}

# Main
main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║     DIVE V3 Federation Secret Rotation                            ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo ""
    
    [ "$DRY_RUN" = true ] && log_warn "DRY RUN MODE - No changes will be made"
    [ -n "$INSTANCE_FILTER" ] && log_info "Instance filter: $INSTANCE_FILTER"
    log_info "GCP Project: $PROJECT_ID"
    echo ""
    
    confirm_rotation
    rotate_secrets
    
    if [ "$DRY_RUN" = false ]; then
        notify_restart
    fi
    
    echo ""
    log_success "=== Rotation complete ==="
}

main "$@"

