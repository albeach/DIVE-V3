#!/usr/bin/env bash
# Push existing .env secrets to GCP Secret Manager (SSOT migration)
# Usage: ./scripts/push-secrets-to-gcp.sh [instance_code]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GCP_PROJECT="${GCP_PROJECT:-dive25}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# Check gcloud auth
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q "@"; then
    log_error "gcloud not authenticated. Run: gcloud auth application-default login"
    exit 1
fi

log_success "gcloud authenticated (project: $GCP_PROJECT)"

# Create or update GCP secret
upsert_secret() {
    local secret_name="$1"
    local secret_value="$2"

    if [ -z "$secret_value" ]; then
        log_warn "  Skipping $secret_name (empty value)"
        return 0
    fi

    if gcloud secrets describe "$secret_name" --project="$GCP_PROJECT" &>/dev/null; then
        # Update existing
        echo -n "$secret_value" | gcloud secrets versions add "$secret_name" \
            --data-file=- --project="$GCP_PROJECT" &>/dev/null
        log_success "  Updated: $secret_name"
    else
        # Create new
        echo -n "$secret_value" | gcloud secrets create "$secret_name" \
            --data-file=- \
            --project="$GCP_PROJECT" \
            --replication-policy="automatic" &>/dev/null
        log_success "  Created: $secret_name"
    fi
}

# Push secrets for one instance
push_instance_secrets() {
    local instance_code="$1"
    local code_lower="${instance_code,,}"
    local code_upper="${instance_code^^}"
    local env_file="${DIVE_ROOT}/instances/${code_lower}/.env"

    if [ ! -f "$env_file" ]; then
        log_warn "No .env file found for ${code_upper}: $env_file"
        return 1
    fi

    log_info "Pushing ${code_upper} secrets to GCP..."

    # Extract secrets from .env
    local postgres_pass=$(grep "^POSTGRES_PASSWORD_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"' || echo "")
    local mongo_pass=$(grep "^MONGO_PASSWORD_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"' || echo "")
    local keycloak_pass=$(grep "^KEYCLOAK_ADMIN_PASSWORD_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"' || echo "")
    local client_secret=$(grep "^KEYCLOAK_CLIENT_SECRET_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"' || echo "")
    local auth_secret=$(grep "^AUTH_SECRET_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"' || echo "")
    local jwt_secret=$(grep "^JWT_SECRET_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"' || echo "")
    local nextauth_secret=$(grep "^NEXTAUTH_SECRET_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"' || echo "")

    # Push to GCP
    upsert_secret "dive-v3-postgres-${code_lower}" "$postgres_pass"
    upsert_secret "dive-v3-mongodb-${code_lower}" "$mongo_pass"
    upsert_secret "dive-v3-keycloak-${code_lower}" "$keycloak_pass"
    upsert_secret "dive-v3-client-secret-${code_lower}" "$client_secret"
    upsert_secret "dive-v3-auth-secret-${code_lower}" "$auth_secret"
    upsert_secret "dive-v3-jwt-secret-${code_lower}" "$jwt_secret"
    upsert_secret "dive-v3-nextauth-secret-${code_lower}" "$nextauth_secret"

    log_success "✓ ${code_upper} secrets pushed to GCP\n"
}

# Main
if [ $# -eq 1 ]; then
    # Single instance
    push_instance_secrets "$1"
else
    # All instances
    log_info "Pushing secrets for all instances...\n"

    for instance_dir in "$DIVE_ROOT"/instances/*; do
        if [ -d "$instance_dir" ]; then
            instance_code=$(basename "$instance_dir")
            push_instance_secrets "$instance_code" || true
        fi
    done

    log_success "All secrets pushed to GCP Secret Manager"
    echo ""
    log_info "Verify secrets:"
    echo "  gcloud secrets list --project=$GCP_PROJECT --filter='name:dive-v3'"
fi
