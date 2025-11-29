#!/bin/bash
# ============================================================================
# DIVE V3 - Federation Secrets Sync Script
# ============================================================================
# Syncs client secrets between all federation partners to ensure IdP brokers
# have correct credentials. Run after Terraform apply on any instance.
#
# USAGE: ./scripts/sync-federation-secrets.sh [--dry-run] [--validate-only] [--instance <code>]
#
# The chicken-and-egg problem this solves:
#   - Instance A creates a federation client for Instance B: "dive-v3-b-federation"
#   - Instance B's IdP broker needs Instance A's client secret to authenticate
#   - But Terraform creates the IdP broker before the secret is known
#   - Solution: This script fetches secrets and updates IdP brokers post-Terraform
#
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REGISTRY_FILE="$PROJECT_ROOT/config/federation-registry.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Flags
DRY_RUN=false
VALIDATE_ONLY=false
INSTANCE_FILTER=""

# Parse arguments
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --validate-only) VALIDATE_ONLY=true ;;
        --instance=*) INSTANCE_FILTER="${arg#*=}" ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --dry-run        Show what would be done without making changes"
            echo "  --validate-only  Only validate current secrets, don't update"
            echo "  --instance=CODE  Only sync for specific instance (usa, fra, gbr, deu)"
            exit 0
            ;;
    esac
done

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_section() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# Load SSH helper for remote instances
if [ -f "$SCRIPT_DIR/remote/ssh-helper.sh" ]; then
    source "$SCRIPT_DIR/remote/ssh-helper.sh" 2>/dev/null || true
fi

# Instance configuration from federation-registry.json
declare -A URLS PWDS TYPES
URLS=()
PWDS=()
TYPES=()

# Load configuration from registry
load_config() {
    log_info "Loading configuration from federation-registry.json..."
    
    if [ ! -f "$REGISTRY_FILE" ]; then
        log_error "Registry file not found: $REGISTRY_FILE"
        exit 1
    fi
    
    local instances=$(jq -r '.instances | keys[]' "$REGISTRY_FILE")
    local default_password=$(jq -r '.defaults.adminPassword' "$REGISTRY_FILE")
    
    for instance in $instances; do
        local idp_url=$(jq -r ".instances.$instance.urls.idp" "$REGISTRY_FILE")
        local instance_type=$(jq -r ".instances.$instance.type" "$REGISTRY_FILE")
        
        URLS[$instance]="$idp_url"
        PWDS[$instance]="$default_password"
        TYPES[$instance]="$instance_type"
    done
    
    log_success "Loaded configuration for ${#URLS[@]} instances"
}

# Federation matrix from registry
declare -A PARTNERS
load_federation_matrix() {
    log_info "Loading federation matrix..."
    
    local instances=$(jq -r '.instances | keys[]' "$REGISTRY_FILE")
    
    for instance in $instances; do
        local partners=$(jq -r ".federation.matrix.$instance[]" "$REGISTRY_FILE" | tr '\n' ' ')
        PARTNERS[$instance]="$partners"
    done
    
    log_success "Federation matrix loaded"
}

# URL-encode a string (for special characters like ! in passwords)
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
get_token() {
    local inst=$1
    local url="${URLS[$inst]}"
    local pwd="${PWDS[$inst]}"
    local encoded_pwd=$(urlencode "$pwd")
    
    if [[ "${TYPES[$inst]}" == "remote" ]]; then
        if type ssh_remote &>/dev/null; then
            ssh_remote "$inst" "curl -sk -X POST 'https://localhost:8443/realms/master/protocol/openid-connect/token' \
                -d 'grant_type=password&client_id=admin-cli&username=admin&password=$encoded_pwd'" 2>/dev/null | jq -r '.access_token'
        else
            log_warn "SSH helper not available for remote instance $inst"
            return 1
        fi
    else
        curl -sk -X POST "${url}/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password&client_id=admin-cli&username=admin&password=${encoded_pwd}" 2>/dev/null | jq -r '.access_token'
    fi
}

# Get client secret from an instance
get_secret() {
    local inst=$1
    local client=$2
    local url="${URLS[$inst]}"
    
    local token=$(get_token "$inst")
    if [ -z "$token" ] || [ "$token" = "null" ]; then
        log_warn "Could not get token for $inst"
        return 1
    fi
    
    local uuid
    if [[ "${TYPES[$inst]}" == "remote" ]]; then
        uuid=$(ssh_remote "$inst" "curl -sk 'https://localhost:8443/admin/realms/dive-v3-broker/clients?clientId=$client' \
            -H 'Authorization: Bearer $token'" 2>/dev/null | jq -r '.[0].id')
        if [ -z "$uuid" ] || [ "$uuid" = "null" ]; then
            return 1
        fi
        ssh_remote "$inst" "curl -sk 'https://localhost:8443/admin/realms/dive-v3-broker/clients/$uuid/client-secret' \
            -H 'Authorization: Bearer $token'" 2>/dev/null | jq -r '.value'
    else
        uuid=$(curl -sk "${url}/admin/realms/dive-v3-broker/clients?clientId=$client" \
            -H "Authorization: Bearer $token" 2>/dev/null | jq -r '.[0].id')
        if [ -z "$uuid" ] || [ "$uuid" = "null" ]; then
            return 1
        fi
        curl -sk "${url}/admin/realms/dive-v3-broker/clients/$uuid/client-secret" \
            -H "Authorization: Bearer $token" 2>/dev/null | jq -r '.value'
    fi
}

# Get current IdP broker secret
get_idp_secret() {
    local inst=$1
    local alias=$2
    local url="${URLS[$inst]}"
    
    local token=$(get_token "$inst")
    if [ -z "$token" ] || [ "$token" = "null" ]; then
        return 1
    fi
    
    if [[ "${TYPES[$inst]}" == "remote" ]]; then
        ssh_remote "$inst" "curl -sk 'https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/$alias' \
            -H 'Authorization: Bearer $token'" 2>/dev/null | jq -r '.config.clientSecret'
    else
        curl -sk "${url}/admin/realms/dive-v3-broker/identity-provider/instances/$alias" \
            -H "Authorization: Bearer $token" 2>/dev/null | jq -r '.config.clientSecret'
    fi
}

# Update IdP broker secret
update_idp() {
    local inst=$1
    local alias=$2
    local secret=$3
    local url="${URLS[$inst]}"
    
    local token=$(get_token "$inst")
    if [ -z "$token" ] || [ "$token" = "null" ]; then
        log_error "Could not get token for $inst"
        return 1
    fi
    
    local config
    if [[ "${TYPES[$inst]}" == "remote" ]]; then
        config=$(ssh_remote "$inst" "curl -sk 'https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/$alias' \
            -H 'Authorization: Bearer $token'" 2>/dev/null)
        
        if [ -z "$config" ] || [ "$config" = "null" ]; then
            log_warn "IdP $alias not found in $inst"
            return 1
        fi
        
        config=$(echo "$config" | jq --arg s "$secret" '.config.clientSecret=$s | .config.syncMode="FORCE"')
        
        if [ "$DRY_RUN" = true ]; then
            log_info "[DRY RUN] Would update $inst/$alias with secret ${secret:0:8}..."
            return 0
        fi
        
        ssh_remote "$inst" "curl -sk -X PUT 'https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/$alias' \
            -H 'Authorization: Bearer $token' -H 'Content-Type: application/json' -d '$config'" 2>/dev/null
    else
        config=$(curl -sk "${url}/admin/realms/dive-v3-broker/identity-provider/instances/$alias" \
            -H "Authorization: Bearer $token" 2>/dev/null)
        
        if [ -z "$config" ] || [ "$config" = "null" ] || [ "$(echo "$config" | jq -r '.alias' 2>/dev/null)" = "null" ]; then
            log_warn "IdP $alias not found in $inst"
            return 1
        fi
        
        config=$(echo "$config" | jq --arg s "$secret" '.config.clientSecret=$s | .config.syncMode="FORCE"')
        
        if [ "$DRY_RUN" = true ]; then
            log_info "[DRY RUN] Would update $inst/$alias with secret ${secret:0:8}..."
            return 0
        fi
        
        curl -sk -X PUT "${url}/admin/realms/dive-v3-broker/identity-provider/instances/$alias" \
            -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d "$config" 2>/dev/null
    fi
}

# Main sync logic
sync_secrets() {
    log_section "Fetching Client Secrets"
    
    # Build secrets map: source_target -> secret
    declare -A SECRETS
    local instances="${!URLS[@]}"
    
    if [ -n "$INSTANCE_FILTER" ]; then
        instances="$INSTANCE_FILTER"
    fi
    
    for src in $instances; do
        for tgt in ${PARTNERS[$src]}; do
            # Skip if filtering and this isn't the target
            if [ -n "$INSTANCE_FILTER" ] && [ "$src" != "$INSTANCE_FILTER" ]; then
                continue
            fi
            
            log_info "Fetching dive-v3-${tgt}-federation from $src..."
            local secret=$(get_secret "$src" "dive-v3-${tgt}-federation")
            
            if [ -n "$secret" ] && [ "$secret" != "null" ]; then
                SECRETS["${src}_${tgt}"]="$secret"
                log_success "  ${secret:0:8}..."
            else
                log_warn "  Not found or inaccessible"
            fi
        done
    done
    
    if [ "$VALIDATE_ONLY" = true ]; then
        log_section "Validating Current Configuration"
        log_info "Note: Keycloak masks IdP secrets - validation checks for placeholders only"
        echo ""
        
        local valid=0
        local invalid=0
        
        for inst in $instances; do
            log_info "Checking IdP brokers in $inst..."
            for partner in ${PARTNERS[$inst]}; do
                local alias="${partner}-federation"
                local current_secret=$(get_idp_secret "$inst" "$alias")
                local expected_key="${partner}_${inst}"
                local expected_secret="${SECRETS[$expected_key]}"
                
                if [ -z "$expected_secret" ]; then
                    log_warn "  $alias: Source client secret not available"
                    invalid=$((invalid + 1))
                elif [ -z "$current_secret" ] || [ "$current_secret" = "null" ]; then
                    log_error "  $alias: No secret configured"
                    invalid=$((invalid + 1))
                elif [ "$current_secret" = "placeholder-sync-after-terraform" ] || [ "$current_secret" = "placeholder-configure-manually" ]; then
                    log_error "  $alias: Still has placeholder secret"
                    invalid=$((invalid + 1))
                elif [ "$current_secret" = "**********" ]; then
                    # Keycloak masks secrets - this means a real secret is set
                    log_success "  $alias: ✓ Secret configured (masked by Keycloak)"
                    valid=$((valid + 1))
                else
                    # Unexpected value - might be partially configured
                    log_warn "  $alias: Unexpected secret format"
                    invalid=$((invalid + 1))
                fi
            done
        done
        
        echo ""
        log_section "Validation Summary"
        echo "  Valid:   $valid"
        echo "  Invalid: $invalid"
        echo ""
        
        if [ $invalid -gt 0 ]; then
            log_error "Some IdP brokers have invalid secrets - run sync without --validate-only"
            return 1
        fi
        
        log_success "All IdP broker secrets are properly configured"
        return 0
    fi
    
    log_section "Updating IdP Broker Secrets"
    
    local updated=0
    local failed=0
    
    for inst in $instances; do
        log_info "Updating $inst IdP brokers..."
        for partner in ${PARTNERS[$inst]}; do
            # The key is partner_inst because:
            # - Partner creates the client "dive-v3-{inst}-federation"
            # - Inst's IdP broker needs that secret
            local key="${partner}_${inst}"
            local secret="${SECRETS[$key]}"
            
            if [ -n "$secret" ]; then
                if update_idp "$inst" "${partner}-federation" "$secret"; then
                    log_success "  ${partner}-federation updated"
                    updated=$((updated + 1))
                else
                    log_warn "  ${partner}-federation failed"
                    failed=$((failed + 1))
                fi
            else
                log_warn "  ${partner}-federation: No secret available"
            fi
        done
    done
    
    log_section "Sync Summary"
    echo ""
    echo "  Updated: $updated"
    echo "  Failed:  $failed"
    echo ""
    
    if [ $failed -gt 0 ]; then
        log_warn "Some updates failed. Check Keycloak connectivity and IdP configuration."
        return 1
    fi
}

# Main execution
main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║       DIVE V3 Federation Secrets Sync                        ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    
    [ "$DRY_RUN" = true ] && log_warn "DRY RUN MODE - No changes will be made"
    [ "$VALIDATE_ONLY" = true ] && log_info "VALIDATE ONLY MODE - Checking current state"
    [ -n "$INSTANCE_FILTER" ] && log_info "Filtering to instance: $INSTANCE_FILTER"
    echo ""
    
    load_config
    load_federation_matrix
    sync_secrets
    
    echo ""
    if [ "$DRY_RUN" = false ] && [ "$VALIDATE_ONLY" = false ]; then
        log_success "=== Federation secrets sync complete ==="
        echo ""
        echo "Next steps:"
        echo "  1. Test federation: ./scripts/verify-federation.sh"
        echo "  2. If issues persist, check Keycloak logs"
    fi
}

main "$@"
