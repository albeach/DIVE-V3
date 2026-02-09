#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - GCP → Vault Secret Migration Script
# =============================================================================
# Purpose: Migrate all secrets from GCP Secret Manager to HashiCorp Vault
# Usage:
#   ./scripts/migrate-secrets-gcp-to-vault.sh                    # Migrate all
#   ./scripts/migrate-secrets-gcp-to-vault.sh --instance deu     # Migrate DEU only
#   DRY_RUN=true ./scripts/migrate-secrets-gcp-to-vault.sh       # Dry run
#
# Prerequisites:
#   1. Vault initialized and unsealed: ./dive vault init && ./dive vault unseal
#   2. Vault configured: ./dive vault setup
#   3. GCP authenticated: gcloud auth login
#
# Notes:
#   - Idempotent: safe to run multiple times
#   - Does NOT delete GCP secrets (archive for rollback)
#   - DRY_RUN=true for preview mode
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="${DIVE_ROOT:-$(cd "${SCRIPT_DIR}/.." && pwd)}"

source "${DIVE_ROOT}/scripts/dive-modules/common.sh"
source "${DIVE_ROOT}/scripts/dive-modules/configuration/secrets.sh"

# Configuration
DRY_RUN="${DRY_RUN:-false}"
TARGET_INSTANCE="${TARGET_INSTANCE:-all}"
GCP_PROJECT="${GCP_PROJECT:-dive25}"

VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
export VAULT_ADDR

# Load Vault token
if [ -f "${DIVE_ROOT}/.vault-token" ]; then
    VAULT_TOKEN=$(cat "${DIVE_ROOT}/.vault-token")
    export VAULT_TOKEN
fi

# All known instances
ALL_INSTANCES=("usa" "deu" "gbr" "fra" "can")

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --instance)
            TARGET_INSTANCE="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [--instance <code>] [--dry-run]"
            echo ""
            echo "Options:"
            echo "  --instance <code>   Migrate only this instance (e.g., deu, usa)"
            echo "  --dry-run           Preview without making changes"
            echo ""
            echo "Examples:"
            echo "  $0                           # Migrate all instances"
            echo "  $0 --instance deu            # Migrate DEU only"
            echo "  $0 --dry-run                 # Preview all migrations"
            exit 0
            ;;
        *)
            log_error "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# Counters
TOTAL_MIGRATED=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0

##
# Migrate a single secret from GCP to Vault
# Arguments:
#   $1 - GCP secret name
#   $2 - Vault category (core, auth, federation, opal)
#   $3 - Vault path
#   $4 - Vault field name
##
migrate_secret() {
    local gcp_name="$1"
    local vault_category="$2"
    local vault_path="$3"
    local vault_field="${4:-password}"

    # Fetch from GCP
    local secret_value
    secret_value=$(gcloud secrets versions access latest \
        --secret="$gcp_name" \
        --project="$GCP_PROJECT" 2>/dev/null) || true

    if [ -z "$secret_value" ]; then
        log_warn "  SKIP: GCP secret not found: $gcp_name"
        TOTAL_SKIPPED=$((TOTAL_SKIPPED + 1))
        return 0
    fi

    # Write to Vault
    if [ "$DRY_RUN" = "true" ]; then
        log_info "  [DRY RUN] Would migrate: $gcp_name → dive-v3/$vault_category/$vault_path ($vault_field)"
    else
        local json_value="{\"${vault_field}\":\"${secret_value}\"}"

        if vault_set_secret "$vault_category" "$vault_path" "$json_value"; then
            log_success "  OK: $gcp_name → dive-v3/$vault_category/$vault_path"
            TOTAL_MIGRATED=$((TOTAL_MIGRATED + 1))
        else
            log_error "  FAIL: $gcp_name → dive-v3/$vault_category/$vault_path"
            TOTAL_FAILED=$((TOTAL_FAILED + 1))
        fi
    fi
}

##
# Migrate all secrets for a specific instance
##
migrate_instance() {
    local instance="$1"
    local code_lower=$(lower "$instance")

    log_info "━━━ Migrating instance: $(upper "$instance") ━━━"

    # Core service secrets
    migrate_secret "dive-v3-postgres-password-${code_lower}" "core" "${code_lower}/postgres" "password"
    migrate_secret "dive-v3-mongo-password-${code_lower}" "core" "${code_lower}/mongodb" "password"
    migrate_secret "dive-v3-redis-password-${code_lower}" "core" "${code_lower}/redis" "password"
    migrate_secret "dive-v3-keycloak-admin-password-${code_lower}" "core" "${code_lower}/keycloak-admin" "password"

    # Also try alternate naming conventions
    migrate_secret "dive-v3-keycloak-${code_lower}" "core" "${code_lower}/keycloak-admin" "password"
    migrate_secret "dive-v3-postgres-${code_lower}" "core" "${code_lower}/postgres" "password"
    migrate_secret "dive-v3-mongodb-${code_lower}" "core" "${code_lower}/mongodb" "password"

    # Auth secrets
    migrate_secret "dive-v3-auth-secret-${code_lower}" "auth" "${code_lower}/nextauth" "secret"
    migrate_secret "dive-v3-jwt-secret-${code_lower}" "auth" "${code_lower}/jwt" "secret"
    migrate_secret "dive-v3-nextauth-secret-${code_lower}" "auth" "${code_lower}/nextauth-explicit" "secret"

    # Instance-specific client secret
    migrate_secret "dive-v3-keycloak-client-secret-${code_lower}" "auth" "${code_lower}/keycloak-client" "secret"
}

##
# Migrate shared secrets (not instance-specific)
##
migrate_shared_secrets() {
    log_info "━━━ Migrating shared secrets ━━━"

    # Shared Keycloak client secret
    migrate_secret "dive-v3-keycloak-client-secret" "auth" "shared/keycloak-client" "secret"

    # Shared Redis blacklist password
    migrate_secret "dive-v3-redis-blacklist" "core" "shared/redis-blacklist" "password"

    # OPAL master token
    migrate_secret "dive-v3-opal-jwt-key" "opal" "master-token" "token"
    migrate_secret "dive-v3-opal-master-token" "opal" "master-token" "token"

    # Bundle signing key
    migrate_secret "dive-v3-bundle-signing-key" "auth" "shared/bundle-signing" "key"

    # KAS keys
    migrate_secret "dive-v3-kas-signing-key" "auth" "shared/kas-signing" "key"
    migrate_secret "dive-v3-kas-encryption-key" "auth" "shared/kas-encryption" "key"
}

##
# Migrate federation secrets (bidirectional pairs)
##
migrate_federation_secrets() {
    log_info "━━━ Migrating federation secrets ━━━"

    # Generate all bidirectional pairs (alphabetically sorted)
    local -a pairs=()
    for i in "${ALL_INSTANCES[@]}"; do
        for j in "${ALL_INSTANCES[@]}"; do
            if [[ "$i" < "$j" ]]; then
                pairs+=("${i}-${j}")
            fi
        done
    done

    for pair in "${pairs[@]}"; do
        migrate_secret "dive-v3-federation-${pair}" "federation" "${pair}" "client-secret"
    done
}

# =============================================================================
# MAIN
# =============================================================================

echo ""
echo "================================================================="
echo "  DIVE V3 - GCP → Vault Secret Migration"
echo "================================================================="
echo ""
echo "  Source:      GCP Secret Manager (project: $GCP_PROJECT)"
echo "  Destination: HashiCorp Vault ($VAULT_ADDR)"
echo "  Mode:        $([ "$DRY_RUN" = "true" ] && echo "DRY RUN" || echo "LIVE")"
echo "  Target:      $([ "$TARGET_INSTANCE" = "all" ] && echo "All instances" || echo "$(upper "$TARGET_INSTANCE") only")"
echo ""
echo "================================================================="
echo ""

# Pre-flight checks
if [ "$DRY_RUN" != "true" ]; then
    # Check Vault is available
    if ! vault_is_authenticated; then
        log_error "Vault is not available or not authenticated"
        log_info "Run: ./dive vault init && ./dive vault unseal"
        exit 1
    fi
    log_success "Vault authenticated"
fi

# Check GCP is available
if ! gcloud auth print-access-token >/dev/null 2>&1; then
    log_error "GCP is not authenticated"
    log_info "Run: gcloud auth login"
    exit 1
fi
log_success "GCP authenticated"

echo ""

# Migrate shared secrets first
migrate_shared_secrets

echo ""

# Migrate federation secrets
migrate_federation_secrets

echo ""

# Migrate instance-specific secrets
if [ "$TARGET_INSTANCE" = "all" ]; then
    for instance in "${ALL_INSTANCES[@]}"; do
        migrate_instance "$instance"
        echo ""
    done
else
    migrate_instance "$TARGET_INSTANCE"
    echo ""
fi

# Summary
echo "================================================================="
echo "  Migration Summary"
echo "================================================================="
echo ""

if [ "$DRY_RUN" = "true" ]; then
    echo "  Mode: DRY RUN (no changes made)"
else
    echo "  Migrated: $TOTAL_MIGRATED secrets"
    echo "  Failed:   $TOTAL_FAILED secrets"
    echo "  Skipped:  $TOTAL_SKIPPED secrets (not found in GCP)"
fi

echo ""

if [ "$TOTAL_FAILED" -gt 0 ]; then
    log_error "Migration completed with $TOTAL_FAILED failures"
    echo ""
    echo "  Next steps:"
    echo "    1. Check Vault connectivity: ./dive vault status"
    echo "    2. Re-run failed migrations: $0"
    echo "    3. Verify: export SECRETS_PROVIDER=vault && ./dive hub deploy"
    exit 1
else
    log_success "Migration completed successfully!"
    echo ""
    echo "  Next steps:"
    echo "    1. Update .env.hub:  SECRETS_PROVIDER=vault"
    echo "    2. Test hub:         ./dive hub deploy"
    echo "    3. Test spoke:       ./dive spoke deploy deu"
    echo "    4. Run verification: ./dive hub verify && ./dive spoke verify deu"
    echo ""
    echo "  Rollback: Set SECRETS_PROVIDER=gcp in .env files"
fi

echo "================================================================="
