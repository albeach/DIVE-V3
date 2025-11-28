#!/bin/bash
# ============================================================================
# DIVE V3 - Federation Secrets Sync Script
# ============================================================================
# Syncs client secrets between all federation partners to ensure IdP brokers
# have correct credentials. Run after Terraform apply on any instance.
# USAGE: ./scripts/sync-federation-secrets.sh [--dry-run]
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DRY_RUN=false

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

[[ "$1" == "--dry-run" ]] && DRY_RUN=true

# Load SSH helper for remote
source "$SCRIPT_DIR/remote/ssh-helper.sh" 2>/dev/null || true

# Instance configuration
declare -A URLS PWDS TYPES
URLS=([usa]="https://usa-idp.dive25.com" [fra]="https://fra-idp.dive25.com" [gbr]="https://gbr-idp.dive25.com" [deu]="https://deu-idp.prosecurity.biz")
PWDS=([usa]="DivePilot2025!SecureAdmin" [fra]="DivePilot2025!SecureAdmin" [gbr]="DivePilot2025!SecureAdmin" [deu]="DivePilot2025!SecureAdmin")
TYPES=([usa]="local" [fra]="local" [gbr]="local" [deu]="remote")

# Federation matrix
declare -A PARTNERS
PARTNERS=([usa]="fra gbr deu" [fra]="usa gbr deu" [gbr]="usa fra deu" [deu]="usa fra gbr")

get_token() {
    local inst=$1 url="${URLS[$1]}" pwd="${PWDS[$1]}"
    if [[ "${TYPES[$inst]}" == "remote" ]]; then
        ssh_remote "$inst" "curl -sk -X POST 'https://localhost:8443/realms/master/protocol/openid-connect/token' \
            -d 'grant_type=password&client_id=admin-cli&username=admin&password=$pwd'" 2>/dev/null | jq -r '.access_token'
    else
        curl -sk -X POST "${url}/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password&client_id=admin-cli&username=admin&password=$pwd" 2>/dev/null | jq -r '.access_token'
    fi
}

get_secret() {
    local inst=$1 client=$2 token=$(get_token "$inst") url="${URLS[$inst]}"
    local uuid
    if [[ "${TYPES[$inst]}" == "remote" ]]; then
        uuid=$(ssh_remote "$inst" "curl -sk 'https://localhost:8443/admin/realms/dive-v3-broker/clients?clientId=$client' \
            -H 'Authorization: Bearer $token'" 2>/dev/null | jq -r '.[0].id')
        ssh_remote "$inst" "curl -sk 'https://localhost:8443/admin/realms/dive-v3-broker/clients/$uuid/client-secret' \
            -H 'Authorization: Bearer $token'" 2>/dev/null | jq -r '.value'
    else
        uuid=$(curl -sk "${url}/admin/realms/dive-v3-broker/clients?clientId=$client" \
            -H "Authorization: Bearer $token" 2>/dev/null | jq -r '.[0].id')
        curl -sk "${url}/admin/realms/dive-v3-broker/clients/$uuid/client-secret" \
            -H "Authorization: Bearer $token" 2>/dev/null | jq -r '.value'
    fi
}

update_idp() {
    local inst=$1 alias=$2 secret=$3 token=$(get_token "$inst") url="${URLS[$inst]}"
    local config
    if [[ "${TYPES[$inst]}" == "remote" ]]; then
        config=$(ssh_remote "$inst" "curl -sk 'https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/$alias' \
            -H 'Authorization: Bearer $token'" 2>/dev/null)
        config=$(echo "$config" | jq --arg s "$secret" '.config.clientSecret=$s | .config.syncMode="FORCE"')
        [[ "$DRY_RUN" == "true" ]] && { log_info "[DRY] $inst/$alias <- ${secret:0:8}..."; return; }
        ssh_remote "$inst" "curl -sk -X PUT 'https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/$alias' \
            -H 'Authorization: Bearer $token' -H 'Content-Type: application/json' -d '$config'" 2>/dev/null
    else
        config=$(curl -sk "${url}/admin/realms/dive-v3-broker/identity-provider/instances/$alias" \
            -H "Authorization: Bearer $token" 2>/dev/null)
        config=$(echo "$config" | jq --arg s "$secret" '.config.clientSecret=$s | .config.syncMode="FORCE"')
        [[ "$DRY_RUN" == "true" ]] && { log_info "[DRY] $inst/$alias <- ${secret:0:8}..."; return; }
        curl -sk -X PUT "${url}/admin/realms/dive-v3-broker/identity-provider/instances/$alias" \
            -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d "$config" 2>/dev/null
    fi
}

log_info "=== DIVE V3 Federation Secrets Sync ==="
[[ "$DRY_RUN" == "true" ]] && log_warn "DRY RUN MODE"

# Build secrets map: source_target -> secret
declare -A SECRETS
for src in usa fra gbr deu; do
    for tgt in ${PARTNERS[$src]}; do
        log_info "Fetching dive-v3-${tgt}-federation from $src..."
        s=$(get_secret "$src" "dive-v3-${tgt}-federation")
        [[ -n "$s" && "$s" != "null" ]] && { SECRETS["${src}_${tgt}"]="$s"; log_success "  ${s:0:8}..."; } || log_warn "  not found"
    done
done

# Apply secrets
for inst in usa fra gbr deu; do
    log_info "Updating $inst IdP brokers..."
    for partner in ${PARTNERS[$inst]}; do
        key="${partner}_${inst}"
        secret="${SECRETS[$key]}"
        [[ -n "$secret" ]] && update_idp "$inst" "${partner}-federation" "$secret" && log_success "  ${partner}-federation updated"
    done
done

log_success "=== Sync complete ==="
