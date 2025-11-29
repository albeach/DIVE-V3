#!/usr/bin/env bash
# ============================================================================
# DIVE V3 - Sync Federation Secrets from GCP to Keycloak IdP Brokers
# ============================================================================
# This script syncs client secrets from GCP Secret Manager directly to Keycloak
# IdP broker configurations. It should be run after Keycloak starts.
#
# USAGE:
#   ./scripts/federation/sync-gcp-secrets-to-keycloak.sh [OPTIONS]
#
# OPTIONS:
#   --instance=CODE     Instance code (usa, fra, gbr, deu) - required if not set in env
#   --dry-run           Show what would be done without making changes
#   --validate-only     Only validate current secrets, don't update
#   --admin-password    Keycloak admin password (or use KEYCLOAK_ADMIN_PASSWORD env var)
#
# ENVIRONMENT VARIABLES:
#   INSTANCE                    Instance code (usa, fra, gbr, deu)
#   KEYCLOAK_ADMIN_PASSWORD     Keycloak admin password
#   GCP_PROJECT_ID              GCP project ID (default: dive25)
#
# PREREQUISITES:
#   - gcloud CLI authenticated with access to GCP Secret Manager
#   - Keycloak running and accessible
#   - curl and jq installed
#
# GCP SECRET NAMING CONVENTION:
#   dive-v3-federation-{source}-{target}
#   - source: Instance that CREATED the client (e.g., fra)
#   - target: Instance that USES the secret (e.g., usa)
#   
#   Example: dive-v3-federation-fra-usa
#   - FRA created a client "dive-v3-usa-federation" for USA to use
#   - USA's IdP broker "fra-federation" needs this secret
#
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Configuration
INSTANCE="${INSTANCE:-}"
KEYCLOAK_URL="${KEYCLOAK_URL:-https://localhost:8443}"
ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-}"
GCP_PROJECT_ID="${GCP_PROJECT_ID:-dive25}"
SECRET_PREFIX="dive-v3-federation"
REALM="dive-v3-broker"

# Flags
DRY_RUN=false
VALIDATE_ONLY=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
log_section() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# Parse arguments
parse_args() {
    for arg in "$@"; do
        case "$arg" in
            --instance=*) INSTANCE="${arg#*=}" ;;
            --dry-run) DRY_RUN=true ;;
            --validate-only) VALIDATE_ONLY=true ;;
            --admin-password=*) ADMIN_PASSWORD="${arg#*=}" ;;
            --help|-h)
                echo "Usage: $0 [options]"
                echo ""
                echo "Options:"
                echo "  --instance=CODE       Instance code (usa, fra, gbr, deu)"
                echo "  --dry-run             Show what would be done"
                echo "  --validate-only       Only validate current state"
                echo "  --admin-password=PWD  Keycloak admin password"
                echo ""
                echo "Environment Variables:"
                echo "  INSTANCE                  Instance code"
                echo "  KEYCLOAK_ADMIN_PASSWORD   Admin password"
                echo "  GCP_PROJECT_ID            GCP project (default: dive25)"
                exit 0
                ;;
        esac
    done
}

# Get admin token from Keycloak
get_admin_token() {
    local response
    response=$(curl -sk -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
        --data-urlencode "grant_type=password" \
        --data-urlencode "client_id=admin-cli" \
        --data-urlencode "username=admin" \
        --data-urlencode "password=${ADMIN_PASSWORD}" 2>/dev/null)
    
    echo "$response" | jq -r '.access_token'
}

# Get secret from GCP Secret Manager
get_gcp_secret() {
    local secret_name="$1"
    gcloud secrets versions access latest \
        --secret="$secret_name" \
        --project="$GCP_PROJECT_ID" 2>/dev/null
}

# Get current IdP broker configuration
get_idp_config() {
    local token="$1"
    local alias="$2"
    
    curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM}/identity-provider/instances/${alias}" \
        -H "Authorization: Bearer $token" 2>/dev/null
}

# Update IdP broker secret
update_idp_secret() {
    local token="$1"
    local alias="$2"
    local secret="$3"
    
    local config
    config=$(get_idp_config "$token" "$alias")
    
    if [ -z "$config" ] || [ "$(echo "$config" | jq -r '.alias' 2>/dev/null)" = "null" ]; then
        log_warn "IdP $alias not found"
        return 1
    fi
    
    # Update clientSecret in config
    local updated_config
    updated_config=$(echo "$config" | jq --arg s "$secret" '.config.clientSecret = $s')
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would update $alias with secret ${secret:0:8}..."
        return 0
    fi
    
    # Apply update
    local result
    result=$(curl -sk -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/identity-provider/instances/${alias}" \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -d "$updated_config" 2>/dev/null)
    
    if [ -z "$result" ]; then
        return 0
    else
        log_error "Update failed: $result"
        return 1
    fi
}

# Get federation partners for an instance
get_partners() {
    local instance="$1"
    case "$instance" in
        usa) echo "fra gbr deu" ;;
        fra) echo "usa gbr deu" ;;
        gbr) echo "usa fra deu" ;;
        deu) echo "usa fra gbr" ;;
        *) log_error "Unknown instance: $instance"; exit 1 ;;
    esac
}

# Main sync function
sync_secrets() {
    log_section "Federation Secrets Sync"
    
    # Validate instance
    if [ -z "$INSTANCE" ]; then
        log_error "Instance not specified. Use --instance=CODE or set INSTANCE env var"
        exit 1
    fi
    
    INSTANCE=$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]')
    log_info "Instance: $INSTANCE"
    log_info "Keycloak URL: $KEYCLOAK_URL"
    log_info "GCP Project: $GCP_PROJECT_ID"
    
    [ "$DRY_RUN" = true ] && log_warn "DRY RUN MODE"
    [ "$VALIDATE_ONLY" = true ] && log_info "VALIDATE ONLY MODE"
    
    # Check admin password
    if [ -z "$ADMIN_PASSWORD" ]; then
        # Try to load from .env file
        if [ -f "$PROJECT_ROOT/.env" ]; then
            source "$PROJECT_ROOT/.env" 2>/dev/null || true
            ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-}"
        fi
    fi
    
    if [ -z "$ADMIN_PASSWORD" ]; then
        log_error "Admin password not provided. Use --admin-password or KEYCLOAK_ADMIN_PASSWORD"
        exit 1
    fi
    
    # Get admin token
    log_info "Getting admin token..."
    local token
    token=$(get_admin_token)
    
    if [ -z "$token" ] || [ "$token" = "null" ]; then
        log_error "Failed to get admin token. Check Keycloak URL and credentials."
        exit 1
    fi
    log_success "Got admin token"
    
    # Get partners
    local partners
    partners=$(get_partners "$INSTANCE")
    log_info "Federation partners: $partners"
    
    local updated=0
    local failed=0
    local validated=0
    
    for partner in $partners; do
        echo ""
        log_info "Processing ${partner}-federation IdP..."
        
        # Get secret from GCP
        # Naming: dive-v3-federation-{partner}-{instance}
        # Because: {partner} creates the client for {instance} to use
        local secret_name="${SECRET_PREFIX}-${partner}-${INSTANCE}"
        local secret_value
        secret_value=$(get_gcp_secret "$secret_name" 2>/dev/null) || true
        
        if [ -z "$secret_value" ]; then
            log_error "  ✗ Failed to fetch from GCP: $secret_name"
            failed=$((failed + 1))
            continue
        fi
        log_success "  ✓ GCP Secret: ${secret_value:0:8}..."
        
        if [ "$VALIDATE_ONLY" = true ]; then
            # Just check if IdP exists
            local config
            config=$(get_idp_config "$token" "${partner}-federation")
            if [ -n "$config" ] && [ "$(echo "$config" | jq -r '.alias')" != "null" ]; then
                log_success "  ✓ IdP ${partner}-federation exists"
                validated=$((validated + 1))
            else
                log_error "  ✗ IdP ${partner}-federation not found"
                failed=$((failed + 1))
            fi
            continue
        fi
        
        # Update IdP broker
        if update_idp_secret "$token" "${partner}-federation" "$secret_value"; then
            log_success "  ✓ Updated ${partner}-federation"
            updated=$((updated + 1))
        else
            log_error "  ✗ Failed to update ${partner}-federation"
            failed=$((failed + 1))
        fi
    done
    
    # Summary
    log_section "Summary"
    if [ "$VALIDATE_ONLY" = true ]; then
        echo "  Validated: $validated"
        echo "  Failed:    $failed"
    else
        echo "  Updated:   $updated"
        echo "  Failed:    $failed"
    fi
    
    if [ $failed -gt 0 ]; then
        log_error "Some operations failed"
        return 1
    fi
    
    log_success "Federation secrets sync complete!"
}

# Main
main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║   DIVE V3 - GCP → Keycloak Federation Secrets Sync          ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    
    parse_args "$@"
    sync_secrets
}

main "$@"

