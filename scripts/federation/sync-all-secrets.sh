#!/usr/bin/env bash
# ============================================================================
# DIVE V3 - Complete Federation Secrets Sync
# ============================================================================
# Synchronizes ALL federation secrets from GCP to Keycloak:
#   1. INCOMING FEDERATION CLIENTS - Client secrets that partners use to auth
#   2. OUTGOING IDP BROKERS - Client secrets this instance uses to auth to partners
#
# This ensures GCP Secret Manager is the SINGLE SOURCE OF TRUTH for all
# federation credentials.
#
# USAGE:
#   ./scripts/federation/sync-all-secrets.sh [OPTIONS]
#
# OPTIONS:
#   --instance=CODE     Target instance (usa, fra, gbr, deu) - required
#   --dry-run           Show what would be done without making changes
#   --validate-only     Only validate current state
#   --clients-only      Only sync incoming federation clients
#   --idps-only         Only sync outgoing IdP brokers
#   --force             Continue even if some operations fail
#
# GCP SECRET NAMING:
#   dive-v3-federation-{source}-{target}
#   - source: Instance that CREATED the client
#   - target: Instance that USES the secret (authenticates with it)
#
#   Example: dive-v3-federation-fra-usa
#   - FRA created client "dive-v3-usa-federation"
#   - USA's IdP broker "fra-federation" uses this secret to authenticate to FRA
#   - FRA's client "dive-v3-usa-federation" must have this same secret
#
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Configuration
INSTANCE=""
GCP_PROJECT="${GCP_PROJECT_ID:-dive25}"
REALM="dive-v3-broker"

# Flags
DRY_RUN=false
VALIDATE_ONLY=false
CLIENTS_ONLY=false
IDPS_ONLY=false
FORCE=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Counters
UPDATED=0
FAILED=0
SKIPPED=0

# ============================================================================
# Logging
# ============================================================================

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
log_step() { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}\n"; }

# ============================================================================
# Argument Parsing
# ============================================================================

parse_args() {
    for arg in "$@"; do
        case "$arg" in
            --instance=*) INSTANCE="${arg#*=}" ;;
            --dry-run) DRY_RUN=true ;;
            --validate-only) VALIDATE_ONLY=true ;;
            --clients-only) CLIENTS_ONLY=true ;;
            --idps-only) IDPS_ONLY=true ;;
            --force) FORCE=true ;;
            --help|-h)
                echo "Usage: $0 --instance=CODE [options]"
                echo ""
                echo "Options:"
                echo "  --instance=CODE     Target instance (usa, fra, gbr, deu)"
                echo "  --dry-run           Show what would be done"
                echo "  --validate-only     Only validate current state"
                echo "  --clients-only      Only sync incoming clients"
                echo "  --idps-only         Only sync IdP brokers"
                echo "  --force             Continue on failures"
                exit 0
                ;;
            *)
                log_error "Unknown argument: $arg"
                exit 1
                ;;
        esac
    done
    
    if [ -z "$INSTANCE" ]; then
        log_error "Instance is required. Use --instance=CODE"
        exit 1
    fi
    
    INSTANCE=$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]')
}

# ============================================================================
# Instance Configuration
# ============================================================================

get_keycloak_url() {
    local inst="$1"
    case "$inst" in
        usa) echo "https://localhost:8443" ;;
        fra) echo "https://localhost:8444" ;;
        gbr) echo "https://localhost:8445" ;;
        deu) echo "remote" ;;  # Handled specially
        *) log_error "Unknown instance: $inst"; exit 1 ;;
    esac
}

get_partners() {
    local inst="$1"
    case "$inst" in
        usa) echo "fra gbr deu" ;;
        fra) echo "usa gbr deu" ;;
        gbr) echo "usa fra deu" ;;
        deu) echo "usa fra gbr" ;;
    esac
}

# ============================================================================
# GCP Secret Access
# ============================================================================

get_gcp_secret() {
    local secret_name="$1"
    gcloud secrets versions access latest \
        --secret="$secret_name" \
        --project="$GCP_PROJECT" 2>/dev/null || echo ""
}

get_admin_password() {
    local inst="$1"
    get_gcp_secret "dive-v3-keycloak-$inst"
}

# ============================================================================
# Keycloak Admin API
# ============================================================================

get_admin_token() {
    local inst="$1"
    local url="$2"
    local password="$3"
    
    if [ "$inst" = "deu" ]; then
        # Remote instance - use sshpass directly for reliability
        local SSHPASS="$PROJECT_ROOT/bin/sshpass"
        local SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PubkeyAuthentication=no -o LogLevel=ERROR"
        
        "$SSHPASS" -p "mike2222" ssh $SSH_OPTS mike@192.168.42.120 \
            "docker exec dive-v3-keycloak-deu bash -c 'curl -ks -X POST https://localhost:8443/realms/master/protocol/openid-connect/token -d grant_type=password -d client_id=admin-cli -d username=admin -d password=\$KEYCLOAK_ADMIN_PASSWORD'" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4
    else
        curl -sk -X POST "${url}/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password" \
            -d "client_id=admin-cli" \
            -d "username=admin" \
            -d "password=${password}" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4
    fi
}

# Execute Keycloak API call (handles local vs remote)
kc_api() {
    local inst="$1"
    local method="$2"
    local endpoint="$3"
    local token="$4"
    local data="${5:-}"
    
    if [ "$inst" = "deu" ]; then
        # Use sshpass directly for reliability
        local SSHPASS="$PROJECT_ROOT/bin/sshpass"
        local SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PubkeyAuthentication=no -o LogLevel=ERROR"
        
        if [ -n "$data" ]; then
            # Escape data for SSH
            local escaped_data=$(echo "$data" | sed 's/"/\\"/g')
            "$SSHPASS" -p "mike2222" ssh $SSH_OPTS mike@192.168.42.120 \
                "curl -ks -X $method 'https://localhost:8443${endpoint}' -H 'Authorization: Bearer $token' -H 'Content-Type: application/json' -d \"$escaped_data\"" 2>/dev/null
        else
            "$SSHPASS" -p "mike2222" ssh $SSH_OPTS mike@192.168.42.120 \
                "curl -ks -X $method 'https://localhost:8443${endpoint}' -H 'Authorization: Bearer $token'" 2>/dev/null
        fi
    else
        local url=$(get_keycloak_url "$inst")
        if [ -n "$data" ]; then
            curl -sk -X "$method" "${url}${endpoint}" \
                -H "Authorization: Bearer $token" \
                -H "Content-Type: application/json" \
                -d "$data" 2>/dev/null
        else
            curl -sk -X "$method" "${url}${endpoint}" \
                -H "Authorization: Bearer $token" 2>/dev/null
        fi
    fi
}

# ============================================================================
# Client Secret Sync (Incoming Federation)
# ============================================================================

sync_client_secrets() {
    log_step "Syncing Incoming Federation Client Secrets"
    
    local url=$(get_keycloak_url "$INSTANCE")
    local password=$(get_admin_password "$INSTANCE")
    
    if [ -z "$password" ]; then
        log_error "Cannot get admin password for $INSTANCE from GCP"
        return 1
    fi
    
    local token=$(get_admin_token "$INSTANCE" "$url" "$password")
    if [ -z "$token" ]; then
        log_error "Cannot get admin token for $INSTANCE"
        return 1
    fi
    
    log_info "Got admin token for $INSTANCE"
    
    local partners=$(get_partners "$INSTANCE")
    local inst_lower=$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]')
    
    for partner in $partners; do
        local client_id="dive-v3-${partner}-federation"
        
        # GCP secret: dive-v3-federation-{this_instance}-{partner}
        # This instance created the client for partner to use
        local secret_name="dive-v3-federation-${inst_lower}-${partner}"
        local gcp_secret=$(get_gcp_secret "$secret_name")
        
        if [ -z "$gcp_secret" ]; then
            log_warn "  $client_id: No GCP secret ($secret_name)"
            SKIPPED=$((SKIPPED + 1))
            continue
        fi
        
        log_info "  $client_id: GCP secret ${gcp_secret:0:8}..."
        
        # Get client UUID
        local client_json=$(kc_api "$INSTANCE" "GET" "/admin/realms/$REALM/clients?clientId=$client_id" "$token")
        local client_uuid=$(echo "$client_json" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
        
        if [ -z "$client_uuid" ]; then
            log_warn "  $client_id: Client not found"
            SKIPPED=$((SKIPPED + 1))
            continue
        fi
        
        # Get current secret
        local current_secret=$(echo "$client_json" | grep -o '"secret":"[^"]*' | head -1 | cut -d'"' -f4)
        
        if [ "$VALIDATE_ONLY" = true ]; then
            if [ "$current_secret" = "$gcp_secret" ]; then
                log_success "  $client_id: ✓ Matches GCP"
            else
                log_error "  $client_id: ✗ Mismatch (current: ${current_secret:0:8}..., GCP: ${gcp_secret:0:8}...)"
                FAILED=$((FAILED + 1))
            fi
            continue
        fi
        
        if [ "$current_secret" = "$gcp_secret" ]; then
            log_success "  $client_id: Already correct"
            SKIPPED=$((SKIPPED + 1))
            continue
        fi
        
        if [ "$DRY_RUN" = true ]; then
            log_info "  [DRY RUN] Would update $client_id secret"
            continue
        fi
        
        # Update client secret
        local full_client=$(kc_api "$INSTANCE" "GET" "/admin/realms/$REALM/clients/$client_uuid" "$token")
        local updated_client=$(echo "$full_client" | sed "s/\"secret\":\"[^\"]*\"/\"secret\":\"$gcp_secret\"/")
        
        kc_api "$INSTANCE" "PUT" "/admin/realms/$REALM/clients/$client_uuid" "$token" "$updated_client" >/dev/null
        
        # Verify
        local verify_json=$(kc_api "$INSTANCE" "GET" "/admin/realms/$REALM/clients/$client_uuid" "$token")
        local verify_secret=$(echo "$verify_json" | grep -o '"secret":"[^"]*' | head -1 | cut -d'"' -f4)
        
        if [ "$verify_secret" = "$gcp_secret" ]; then
            log_success "  $client_id: Updated ✓"
            UPDATED=$((UPDATED + 1))
        else
            log_error "  $client_id: Update failed"
            FAILED=$((FAILED + 1))
        fi
    done
}

# ============================================================================
# IdP Broker Secret Sync (Outgoing Federation)
# ============================================================================

sync_idp_secrets() {
    log_step "Syncing Outgoing IdP Broker Secrets"
    
    local url=$(get_keycloak_url "$INSTANCE")
    local password=$(get_admin_password "$INSTANCE")
    
    if [ -z "$password" ]; then
        log_error "Cannot get admin password for $INSTANCE from GCP"
        return 1
    fi
    
    local token=$(get_admin_token "$INSTANCE" "$url" "$password")
    if [ -z "$token" ]; then
        log_error "Cannot get admin token for $INSTANCE"
        return 1
    fi
    
    local partners=$(get_partners "$INSTANCE")
    local inst_lower=$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]')
    
    for partner in $partners; do
        local idp_alias="${partner}-federation"
        
        # GCP secret: dive-v3-federation-{partner}-{this_instance}
        # Partner created the client, this instance uses the secret
        local secret_name="dive-v3-federation-${partner}-${inst_lower}"
        local gcp_secret=$(get_gcp_secret "$secret_name")
        
        if [ -z "$gcp_secret" ]; then
            log_warn "  $idp_alias: No GCP secret ($secret_name)"
            SKIPPED=$((SKIPPED + 1))
            continue
        fi
        
        log_info "  $idp_alias: GCP secret ${gcp_secret:0:8}..."
        
        # Get IdP config
        local idp_json=$(kc_api "$INSTANCE" "GET" "/admin/realms/$REALM/identity-provider/instances/$idp_alias" "$token")
        
        if echo "$idp_json" | grep -q '"error"'; then
            log_warn "  $idp_alias: IdP not found"
            SKIPPED=$((SKIPPED + 1))
            continue
        fi
        
        if [ "$VALIDATE_ONLY" = true ]; then
            # Keycloak masks secrets as **********, so we can only verify it's set
            local current=$(echo "$idp_json" | grep -o '"clientSecret":"[^"]*' | cut -d'"' -f4)
            if [ -n "$current" ] && [ "$current" != "placeholder-sync-after-terraform" ]; then
                log_success "  $idp_alias: ✓ Secret configured"
            else
                log_error "  $idp_alias: ✗ No secret or placeholder"
                FAILED=$((FAILED + 1))
            fi
            continue
        fi
        
        if [ "$DRY_RUN" = true ]; then
            log_info "  [DRY RUN] Would update $idp_alias secret"
            continue
        fi
        
        # Update IdP with new secret
        local updated_idp=$(echo "$idp_json" | sed "s/\"clientSecret\":\"[^\"]*\"/\"clientSecret\":\"$gcp_secret\"/")
        
        kc_api "$INSTANCE" "PUT" "/admin/realms/$REALM/identity-provider/instances/$idp_alias" "$token" "$updated_idp" >/dev/null
        
        log_success "  $idp_alias: Updated ✓"
        UPDATED=$((UPDATED + 1))
    done
}

# ============================================================================
# Main
# ============================================================================

main() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}   ${BOLD}DIVE V3 - Complete Federation Secrets Sync${NC}                 ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}   GCP Secret Manager → Keycloak (Clients + IdP Brokers)       ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    parse_args "$@"
    
    log_info "Instance: $(echo $INSTANCE | tr '[:lower:]' '[:upper:]')"
    log_info "GCP Project: $GCP_PROJECT"
    [ "$DRY_RUN" = true ] && log_warn "DRY RUN MODE"
    [ "$VALIDATE_ONLY" = true ] && log_info "VALIDATE ONLY MODE"
    
    # Load SSH helper for remote instances
    if [ "$INSTANCE" = "deu" ] && [ -f "$PROJECT_ROOT/scripts/remote/ssh-helper.sh" ]; then
        source "$PROJECT_ROOT/scripts/remote/ssh-helper.sh" 2>/dev/null || true
    fi
    
    # Sync client secrets (unless --idps-only)
    if [ "$IDPS_ONLY" = false ]; then
        sync_client_secrets || [ "$FORCE" = true ]
    fi
    
    # Sync IdP broker secrets (unless --clients-only)
    if [ "$CLIENTS_ONLY" = false ]; then
        sync_idp_secrets || [ "$FORCE" = true ]
    fi
    
    # Summary
    log_step "Summary"
    echo "  Updated: $UPDATED"
    echo "  Skipped: $SKIPPED"
    echo "  Failed:  $FAILED"
    echo ""
    
    if [ $FAILED -gt 0 ] && [ "$FORCE" = false ]; then
        log_error "Some operations failed"
        exit 1
    fi
    
    log_success "Federation secrets sync complete!"
}

main "$@"

