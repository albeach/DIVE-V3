#!/bin/bash
# ============================================================================
# DIVE V3 - Create GCP Secret Manager Infrastructure
# ============================================================================
# Creates the 12 federation secrets in GCP Secret Manager.
# Run this once to set up the infrastructure before uploading secrets.
#
# USAGE: ./scripts/vault/create-gcp-secrets.sh [--dry-run]
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

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_section() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# Check dependencies
check_dependencies() {
    log_section "Checking Dependencies"
    
    if ! command -v jq &>/dev/null; then
        log_error "jq is required but not installed"
        exit 1
    fi
    
    if ! command -v gcloud &>/dev/null; then
        log_error "gcloud CLI is required but not installed"
        exit 1
    fi
    
    # Check GCP authentication
    if ! gcloud auth print-access-token &>/dev/null; then
        log_error "Not authenticated to GCP. Run: gcloud auth login"
        exit 1
    fi
    
    # Check project access
    if ! gcloud projects describe "$PROJECT_ID" &>/dev/null; then
        log_error "Cannot access GCP project: $PROJECT_ID"
        exit 1
    fi
    
    log_success "All dependencies satisfied"
}

# Create federation secrets
create_secrets() {
    log_section "Creating Federation Secrets"
    
    local instances=$(jq -r '.instances | keys[]' "$REGISTRY_FILE")
    local created=0
    local skipped=0
    local failed=0
    
    for source in $instances; do
        local partners=$(jq -r ".federation.matrix.${source}[]" "$REGISTRY_FILE")
        
        for target in $partners; do
            local secret_name="${SECRET_PREFIX}-${source}-${target}"
            
            # Check if secret already exists
            if gcloud secrets describe "$secret_name" --project="$PROJECT_ID" &>/dev/null; then
                log_warn "Secret exists: $secret_name (skipping)"
                skipped=$((skipped + 1))
                continue
            fi
            
            if [ "$DRY_RUN" = true ]; then
                log_info "[DRY RUN] Would create: $secret_name"
                created=$((created + 1))
                continue
            fi
            
            # Create secret with placeholder value
            # The actual value will be uploaded by upload-federation-secrets.sh
            if echo -n "placeholder-pending-upload" | gcloud secrets create "$secret_name" \
                --data-file=- \
                --project="$PROJECT_ID" \
                --replication-policy="automatic" \
                --labels="project=dive-v3,type=federation,source=${source},target=${target}" 2>/dev/null; then
                log_success "Created: $secret_name"
                created=$((created + 1))
            else
                log_error "Failed to create: $secret_name"
                failed=$((failed + 1))
            fi
        done
    done
    
    log_section "Creation Summary"
    echo ""
    echo "  Created: $created"
    echo "  Skipped: $skipped"
    echo "  Failed:  $failed"
    echo ""
    
    if [ $failed -gt 0 ]; then
        log_error "Some secrets failed to create"
        return 1
    fi
    
    log_success "Secret infrastructure ready"
}

# List all secrets
list_secrets() {
    log_section "Listing Federation Secrets"
    
    gcloud secrets list --project="$PROJECT_ID" --filter="labels.project=dive-v3" 2>/dev/null || true
}

# Main execution
main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║     DIVE V3 GCP Secret Manager Infrastructure Setup          ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    
    [ "$DRY_RUN" = true ] && log_warn "DRY RUN MODE - No changes will be made"
    log_info "GCP Project: $PROJECT_ID"
    echo ""
    
    check_dependencies
    create_secrets
    list_secrets
    
    echo ""
    log_success "=== Infrastructure setup complete ==="
    echo ""
    echo "Next steps:"
    echo "  1. Upload actual secrets: ./scripts/vault/upload-federation-secrets.sh"
    echo "  2. Create service accounts for each instance (optional)"
    echo "  3. Test with: ./scripts/vault/verify-secrets.sh"
}

main "$@"




