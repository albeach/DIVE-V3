#!/bin/bash
# ============================================================================
# DIVE V3 - Setup GCP IAM for Federation Secrets
# ============================================================================
# Creates service accounts for each Keycloak instance and grants them
# access to only the secrets they need (least privilege).
#
# USAGE: ./scripts/vault/setup-gcp-iam.sh [--dry-run]
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
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_section() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# Create service accounts
create_service_accounts() {
    log_section "Creating Service Accounts"
    
    local instances=$(jq -r '.instances | keys[]' "$REGISTRY_FILE")
    local created=0
    local skipped=0
    
    for instance in $instances; do
        local sa_name="dive-v3-keycloak-${instance}"
        local sa_email="${sa_name}@${PROJECT_ID}.iam.gserviceaccount.com"
        local upper_instance=$(echo "$instance" | tr '[:lower:]' '[:upper:]')
        local display_name="DIVE V3 Keycloak ${upper_instance} Instance"
        
        # Check if SA exists
        if gcloud iam service-accounts describe "$sa_email" --project="$PROJECT_ID" &>/dev/null; then
            log_warn "Service account exists: $sa_name (skipping)"
            skipped=$((skipped + 1))
            continue
        fi
        
        if [ "$DRY_RUN" = true ]; then
            log_info "[DRY RUN] Would create: $sa_name"
            created=$((created + 1))
            continue
        fi
        
        # Create service account
        if gcloud iam service-accounts create "$sa_name" \
            --project="$PROJECT_ID" \
            --display-name="$display_name" \
            --description="Service account for DIVE V3 ${upper_instance} Keycloak instance to access federation secrets" 2>/dev/null; then
            log_success "Created: $sa_name"
            created=$((created + 1))
        else
            log_error "Failed to create: $sa_name"
        fi
    done
    
    echo ""
    echo "  Created: $created"
    echo "  Skipped: $skipped"
}

# Grant IAM permissions to secrets
grant_secret_access() {
    log_section "Granting Secret Access (Least Privilege)"
    
    local instances=$(jq -r '.instances | keys[]' "$REGISTRY_FILE")
    local granted=0
    local failed=0
    
    for instance in $instances; do
        local sa_email="dive-v3-keycloak-${instance}@${PROJECT_ID}.iam.gserviceaccount.com"
        local partners=$(jq -r ".federation.matrix.${instance}[]" "$REGISTRY_FILE")
        
        log_info "Configuring access for: $instance"
        
        for partner in $partners; do
            # Instance needs to read secrets where partner is the source
            # (partner creates client, instance needs the secret)
            local secret_name="${SECRET_PREFIX}-${partner}-${instance}"
            
            if [ "$DRY_RUN" = true ]; then
                log_info "  [DRY RUN] Would grant $instance access to $secret_name"
                granted=$((granted + 1))
                continue
            fi
            
            # Grant secretAccessor role on this specific secret
            if gcloud secrets add-iam-policy-binding "$secret_name" \
                --project="$PROJECT_ID" \
                --member="serviceAccount:${sa_email}" \
                --role="roles/secretmanager.secretAccessor" \
                --quiet 2>/dev/null; then
                log_success "  ✓ $instance can access $secret_name"
                granted=$((granted + 1))
            else
                log_error "  ✗ Failed to grant access: $secret_name"
                failed=$((failed + 1))
            fi
        done
    done
    
    echo ""
    echo "  Granted: $granted"
    echo "  Failed:  $failed"
    
    [ $failed -eq 0 ]
}

# Enable audit logging
enable_audit_logging() {
    log_section "Enabling Audit Logging"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would enable audit logging for Secret Manager"
        return 0
    fi
    
    # Create audit config JSON
    local audit_config=$(cat <<EOF
{
  "auditConfigs": [
    {
      "service": "secretmanager.googleapis.com",
      "auditLogConfigs": [
        { "logType": "ADMIN_READ" },
        { "logType": "DATA_READ" },
        { "logType": "DATA_WRITE" }
      ]
    }
  ]
}
EOF
)
    
    # Get current policy
    local current_policy=$(gcloud projects get-iam-policy "$PROJECT_ID" --format=json 2>/dev/null)
    
    # Check if audit config already exists
    if echo "$current_policy" | jq -e '.auditConfigs[] | select(.service == "secretmanager.googleapis.com")' &>/dev/null; then
        log_warn "Audit logging already configured"
        return 0
    fi
    
    log_info "Audit logging configuration requires manual setup via Console or Terraform"
    log_info "Navigate to: IAM & Admin > Audit Logs > Secret Manager API"
    
    return 0
}

# Generate service account keys (optional)
generate_keys() {
    log_section "Service Account Key Management"
    
    local key_dir="$PROJECT_ROOT/gcp"
    mkdir -p "$key_dir"
    
    log_warn "Service account keys should be generated per-instance when needed"
    log_info "To generate a key for an instance:"
    echo ""
    echo "  gcloud iam service-accounts keys create $key_dir/\${instance}-sa-key.json \\"
    echo "    --iam-account=dive-v3-keycloak-\${instance}@$PROJECT_ID.iam.gserviceaccount.com"
    echo ""
    log_info "Or use Workload Identity Federation for keyless authentication"
}

# Main
main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║     DIVE V3 GCP IAM Setup for Federation Secrets             ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    
    [ "$DRY_RUN" = true ] && log_warn "DRY RUN MODE - No changes will be made"
    log_info "GCP Project: $PROJECT_ID"
    echo ""
    
    create_service_accounts
    grant_secret_access
    enable_audit_logging
    generate_keys
    
    echo ""
    log_success "=== IAM setup complete ==="
    echo ""
    echo "Next steps:"
    echo "  1. Generate SA keys if needed (see above)"
    echo "  2. Configure Workload Identity for production"
    echo "  3. Verify with: ./scripts/vault/verify-secrets.sh --verbose"
}

main "$@"

