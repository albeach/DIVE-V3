#!/bin/bash
# ============================================================================
# DIVE V3 - Sync Secrets from GCP Secret Manager to Keycloak Vault Directory
# ============================================================================
# This script is designed to run as a Docker init container or pre-start hook.
# It fetches secrets from GCP Secret Manager and writes them to files that
# Keycloak's files-plaintext vault provider can read.
#
# USAGE: ./scripts/vault/sync-secrets-to-files.sh [--dry-run]
#
# ENVIRONMENT VARIABLES:
#   INSTANCE       - Instance code (usa, fra, gbr, deu) - REQUIRED
#   VAULT_DIR      - Vault directory path (default: /opt/keycloak/vault)
#   REALM          - Realm name (default: dive-v3-broker)
#   GCP_PROJECT_ID - GCP project ID (default: dive-v3-pilot)
#   REGISTRY_FILE  - Path to federation-registry.json
# ============================================================================

set -euo pipefail

# Configuration
INSTANCE="${INSTANCE:?INSTANCE environment variable is required}"
VAULT_DIR="${VAULT_DIR:-/opt/keycloak/vault}"
REALM="${REALM:-dive-v3-broker}"
GCP_PROJECT_ID="${GCP_PROJECT_ID:-dive25}"
REGISTRY_FILE="${REGISTRY_FILE:-/config/federation-registry.json}"
SECRET_PREFIX="dive-v3-federation"

# Flags
DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

# Logging
log() { echo "[$(date -Iseconds)] $*"; }
log_error() { echo "[$(date -Iseconds)] ERROR: $*" >&2; }

# Main function
main() {
    log "Starting secret sync for instance: $INSTANCE"
    log "Vault directory: $VAULT_DIR"
    log "GCP Project: $GCP_PROJECT_ID"
    
    # Create vault directory
    if [ "$DRY_RUN" = true ]; then
        log "[DRY RUN] Would create directory: $VAULT_DIR"
    else
        mkdir -p "$VAULT_DIR"
        chmod 700 "$VAULT_DIR"
    fi
    
    # Get list of federation partners
    local partners=""
    
    # Try to get partners from registry file (requires jq)
    if [ -f "$REGISTRY_FILE" ] && command -v jq &>/dev/null; then
        partners=$(jq -r ".federation.matrix.${INSTANCE}[]" "$REGISTRY_FILE" 2>/dev/null || echo "")
    fi
    
    # Fallback: determine partners from instance if jq failed or not available
    if [ -z "$partners" ]; then
        log "Using hardcoded partners (jq not available or registry parse failed)"
        case "$INSTANCE" in
            usa) partners="fra gbr deu" ;;
            fra) partners="usa gbr deu" ;;
            gbr) partners="usa fra deu" ;;
            deu) partners="usa fra gbr" ;;
            *)
                log_error "Unknown instance: $INSTANCE"
                exit 1
                ;;
        esac
    fi
    
    if [ -z "$partners" ]; then
        log_error "No federation partners found for instance: $INSTANCE"
        exit 1
    fi
    
    log "Federation partners: $partners"
    
    local synced=0
    local failed=0
    
    for partner in $partners; do
        # The secret name in GCP: dive-v3-federation-{partner}-{instance}
        # Because: partner creates the client, instance needs the secret
        local secret_name="${SECRET_PREFIX}-${partner}-${INSTANCE}"
        
        # The file name Keycloak expects: {realm}_{key}
        # Key format: {partner}-federation-secret
        local file_name="${REALM}_${partner}-federation-secret"
        local file_path="${VAULT_DIR}/${file_name}"
        
        log "Fetching secret: $secret_name -> $file_name"
        
        if [ "$DRY_RUN" = true ]; then
            log "[DRY RUN] Would fetch $secret_name and write to $file_path"
            synced=$((synced + 1))
            continue
        fi
        
        # Fetch secret from GCP Secret Manager
        local secret_value
        if secret_value=$(gcloud secrets versions access latest \
            --secret="$secret_name" \
            --project="$GCP_PROJECT_ID" 2>/dev/null); then
            
            # Write to file
            echo -n "$secret_value" > "$file_path"
            chmod 600 "$file_path"
            
            log "✓ Synced: $file_name"
            synced=$((synced + 1))
        else
            log_error "✗ Failed to fetch: $secret_name"
            failed=$((failed + 1))
        fi
    done
    
    log "Sync complete: $synced succeeded, $failed failed"
    
    if [ $failed -gt 0 ]; then
        log_error "Some secrets failed to sync. Federation may not work."
        exit 1
    fi
    
    # List synced files
    if [ "$DRY_RUN" = false ]; then
        log "Vault directory contents:"
        ls -la "$VAULT_DIR"
    fi
    
    log "Secret sync completed successfully"
}

main "$@"

