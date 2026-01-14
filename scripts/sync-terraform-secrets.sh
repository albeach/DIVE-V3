#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 - Terraform → GCP Secret Synchronization
# =============================================================================
# Purpose: Automatically sync secrets from Terraform outputs to GCP Secret Manager
# Usage:   ./scripts/sync-terraform-secrets.sh [hub|SPOKE_CODE]
# Example: ./scripts/sync-terraform-secrets.sh hub
#          ./scripts/sync-terraform-secrets.sh nzl
# =============================================================================

set -e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GCP_PROJECT="dive25"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✅${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠️${NC} $1"; }
log_error() { echo -e "${RED}❌${NC} $1"; }

# =============================================================================
# FUNCTIONS
# =============================================================================

sync_hub_secrets() {
    log_info "Syncing Hub secrets from Terraform..."

    cd "${DIVE_ROOT}/terraform/hub"

    # Check if terraform state exists
    if [ ! -f "terraform.tfstate" ]; then
        log_error "No terraform.tfstate found in terraform/hub"
        return 1
    fi

    # Extract hub client secret
    CLIENT_SECRET=$(terraform output -raw client_secret 2>/dev/null || echo "")

    if [ -n "$CLIENT_SECRET" ] && [ "$CLIENT_SECRET" != "null" ]; then
        log_info "Syncing hub client secret to GCP..."
        if echo -n "$CLIENT_SECRET" | gcloud secrets versions add \
            dive-v3-keycloak-client-secret \
            --data-file=- \
            --project="${GCP_PROJECT}" >/dev/null 2>&1; then
            log_success "Hub client secret synced"
        else
            log_error "Failed to sync hub client secret"
            return 1
        fi
    else
        log_warn "No hub client secret found in Terraform output"
    fi

    # Extract and sync federation IdP secrets
    log_info "Syncing federation IdP secrets..."

    FEDERATION_JSON=$(terraform output -json federation_idp_aliases 2>/dev/null || echo "{}")

    if [ "$FEDERATION_JSON" != "{}" ] && [ "$FEDERATION_JSON" != "null" ]; then
        echo "$FEDERATION_JSON" | jq -r '.value | to_entries[] | "\(.key):\(.value.client_id):\(.value.client_secret)"' 2>/dev/null | \
        while IFS=: read -r spoke_code client_id client_secret; do
            if [ -n "$client_secret" ] && [ "$client_secret" != "null" ]; then
                log_info "Syncing federation secret for ${spoke_code}..."

                # Create secret if it doesn't exist
                gcloud secrets describe "dive-v3-federation-hub-${spoke_code}" --project="${GCP_PROJECT}" >/dev/null 2>&1 || \
                    gcloud secrets create "dive-v3-federation-hub-${spoke_code}" --project="${GCP_PROJECT}" --replication-policy="automatic" >/dev/null 2>&1

                if echo -n "$client_secret" | gcloud secrets versions add \
                    "dive-v3-federation-hub-${spoke_code}" \
                    --data-file=- \
                    --project="${GCP_PROJECT}" >/dev/null 2>&1; then
                    log_success "Federation secret synced: ${spoke_code}"
                fi
            fi
        done
    else
        log_warn "No federation secrets found in Terraform output"
    fi
}

sync_spoke_secrets() {
    local SPOKE_CODE=$1
    local spoke_lower=$(echo "$SPOKE_CODE" | tr '[:upper:]' '[:lower:]')

    log_info "Syncing Spoke ${SPOKE_CODE} secrets from Terraform..."

    cd "${DIVE_ROOT}/terraform/spoke"

    # Check if workspace exists
    if ! terraform workspace list | grep -q "  ${spoke_lower}"; then
        log_error "Terraform workspace '${spoke_lower}' does not exist"
        return 1
    fi

    # Select workspace
    terraform workspace select "${spoke_lower}" >/dev/null 2>&1

    # Check if state exists
    if [ ! -f "terraform.tfstate.d/${spoke_lower}/terraform.tfstate" ]; then
        log_error "No terraform state found for workspace ${spoke_lower}"
        return 1
    fi

    # Extract spoke client secret
    CLIENT_SECRET=$(terraform output -raw client_secret 2>/dev/null || echo "")

    if [ -n "$CLIENT_SECRET" ] && [ "$CLIENT_SECRET" != "null" ]; then
        log_info "Syncing ${SPOKE_CODE} client secret to GCP..."

        # Create secret if it doesn't exist
        gcloud secrets describe "dive-v3-keycloak-client-secret-${spoke_lower}" --project="${GCP_PROJECT}" >/dev/null 2>&1 || \
            gcloud secrets create "dive-v3-keycloak-client-secret-${spoke_lower}" --project="${GCP_PROJECT}" --replication-policy="automatic" >/dev/null 2>&1

        if echo -n "$CLIENT_SECRET" | gcloud secrets versions add \
            "dive-v3-keycloak-client-secret-${spoke_lower}" \
            --data-file=- \
            --project="${GCP_PROJECT}" >/dev/null 2>&1; then
            log_success "${SPOKE_CODE} client secret synced"
        else
            log_error "Failed to sync ${SPOKE_CODE} client secret"
            return 1
        fi
    else
        log_warn "No client secret found in Terraform output for ${SPOKE_CODE}"
    fi
}

validate_secrets() {
    local INSTANCE=$1
    local instance_lower=$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]')

    log_info "Validating secret sync for ${INSTANCE}..."

    if [ "$INSTANCE" = "hub" ]; then
        cd "${DIVE_ROOT}/terraform/hub"
        TF_SECRET=$(terraform output -raw client_secret 2>/dev/null || echo "")
    else
        cd "${DIVE_ROOT}/terraform/spoke"
        terraform workspace select "${instance_lower}" >/dev/null 2>&1
        TF_SECRET=$(terraform output -raw client_secret 2>/dev/null || echo "")
    fi

    if [ "$INSTANCE" = "hub" ]; then
        GCP_SECRET=$(gcloud secrets versions access latest --secret=dive-v3-keycloak-client-secret --project="${GCP_PROJECT}" 2>/dev/null || echo "")
    else
        GCP_SECRET=$(gcloud secrets versions access latest --secret="dive-v3-keycloak-client-secret-${instance_lower}" --project="${GCP_PROJECT}" 2>/dev/null || echo "")
    fi

    if [ "$TF_SECRET" = "$GCP_SECRET" ]; then
        log_success "${INSTANCE} secrets are in sync"
        return 0
    else
        log_error "${INSTANCE} secrets are OUT OF SYNC!"
        log_error "  Terraform: ${TF_SECRET:0:8}..."
        log_error "  GCP:       ${GCP_SECRET:0:8}..."
        return 1
    fi
}

# =============================================================================
# MAIN
# =============================================================================

COMMAND=${1:-help}

case "$COMMAND" in
    hub)
        sync_hub_secrets
        validate_secrets "hub"
        ;;

    validate)
        INSTANCE=${2:-hub}
        validate_secrets "$INSTANCE"
        ;;

    all)
        log_info "Syncing ALL secrets (hub + all spokes)..."
        sync_hub_secrets

        # Get list of workspaces
        cd "${DIVE_ROOT}/terraform/spoke"
        SPOKES=$(terraform workspace list | grep -v "default" | sed 's/\*//' | tr -d ' ' | tr '\n' ' ')

        for spoke in $SPOKES; do
            SPOKE_UPPER=$(echo "$spoke" | tr '[:lower:]' '[:upper:]')
            sync_spoke_secrets "$SPOKE_UPPER"
        done

        log_success "All secrets synced!"
        ;;

    help|--help|-h)
        cat << EOF
DIVE V3 - Terraform → GCP Secret Synchronization

Usage:
  ./scripts/sync-terraform-secrets.sh hub              Sync hub secrets
  ./scripts/sync-terraform-secrets.sh nzl              Sync NZL spoke secrets
  ./scripts/sync-terraform-secrets.sh all              Sync all instances
  ./scripts/sync-terraform-secrets.sh validate [INST]  Validate sync

Examples:
  ./scripts/sync-terraform-secrets.sh hub
  ./scripts/sync-terraform-secrets.sh nzl
  ./scripts/sync-terraform-secrets.sh all
  ./scripts/sync-terraform-secrets.sh validate hub
  ./scripts/sync-terraform-secrets.sh validate nzl

This script ensures that Keycloak client secrets in GCP Secret Manager
match the secrets generated by Terraform, preventing authentication failures.

EOF
        ;;

    *)
        # Assume it's a spoke code
        SPOKE_UPPER=$(echo "$COMMAND" | tr '[:lower:]' '[:upper:]')
        sync_spoke_secrets "$SPOKE_UPPER"
        validate_secrets "$SPOKE_UPPER"
        ;;
esac
