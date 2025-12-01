#!/bin/bash
# ============================================================================
# DIVE V3 - Create MongoDB Secrets in GCP Secret Manager
# ============================================================================
# Creates MongoDB password secrets for each DIVE V3 instance in GCP Secret Manager.
# These secrets follow the naming convention: dive-v3-mongodb-<instance>
#
# USAGE: ./scripts/vault/create-mongodb-secrets.sh [--dry-run] [--generate]
#
# OPTIONS:
#   --dry-run   Show what would be created without making changes
#   --generate  Auto-generate secure passwords (otherwise prompts for input)
#
# PREREQUISITES:
#   1. gcloud CLI installed and authenticated
#   2. Access to GCP project (dive25 by default)
#   3. Secret Manager API enabled
#
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
REGISTRY_FILE="$PROJECT_ROOT/config/federation-registry.json"

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-dive25}"
SECRET_PREFIX="dive-v3-mongodb"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Flags
DRY_RUN=false
GENERATE_PASSWORDS=false

for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --generate) GENERATE_PASSWORDS=true ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --dry-run   Show what would be created"
            echo "  --generate  Auto-generate secure passwords"
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

# Generate secure password (32 chars, alphanumeric + special)
generate_password() {
    openssl rand -base64 32 | tr -dc 'a-zA-Z0-9!@#$%^&*' | head -c 32
}

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
    
    if ! command -v openssl &>/dev/null; then
        log_error "openssl is required but not installed"
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

# Create MongoDB secrets for each instance
create_mongodb_secrets() {
    log_section "Creating MongoDB Secrets"
    
    local instances=$(jq -r '.instances | keys[]' "$REGISTRY_FILE")
    local created=0
    local skipped=0
    local failed=0
    
    for instance in $instances; do
        local instance_upper=$(echo "$instance" | tr '[:lower:]' '[:upper:]')
        local secret_name="${SECRET_PREFIX}-${instance}"
        
        # Check if secret already exists
        if gcloud secrets describe "$secret_name" --project="$PROJECT_ID" &>/dev/null; then
            log_warn "Secret exists: $secret_name (skipping)"
            skipped=$((skipped + 1))
            continue
        fi
        
        # Get or generate password
        local password=""
        if [ "$GENERATE_PASSWORDS" = true ]; then
            password=$(generate_password)
            log_info "Generated secure password for $instance_upper"
        else
            echo -n "Enter MongoDB password for $instance_upper (or press Enter to generate): "
            read -s password
            echo ""
            if [ -z "$password" ]; then
                password=$(generate_password)
                log_info "Generated secure password for $instance_upper"
            fi
        fi
        
        if [ "$DRY_RUN" = true ]; then
            log_info "[DRY RUN] Would create: $secret_name"
            created=$((created + 1))
            continue
        fi
        
        # Create secret
        if echo -n "$password" | gcloud secrets create "$secret_name" \
            --data-file=- \
            --project="$PROJECT_ID" \
            --replication-policy="automatic" \
            --labels="project=dive-v3,type=mongodb,instance=${instance}" 2>/dev/null; then
            log_success "Created: $secret_name"
            created=$((created + 1))
        else
            log_error "Failed to create: $secret_name"
            failed=$((failed + 1))
        fi
    done
    
    # Also create a shared/default MongoDB secret
    local shared_secret="${SECRET_PREFIX}"
    if ! gcloud secrets describe "$shared_secret" --project="$PROJECT_ID" &>/dev/null; then
        local shared_password=""
        if [ "$GENERATE_PASSWORDS" = true ]; then
            shared_password=$(generate_password)
        else
            echo -n "Enter shared MongoDB password (or press Enter to generate): "
            read -s shared_password
            echo ""
            if [ -z "$shared_password" ]; then
                shared_password=$(generate_password)
            fi
        fi
        
        if [ "$DRY_RUN" = true ]; then
            log_info "[DRY RUN] Would create: $shared_secret"
        elif echo -n "$shared_password" | gcloud secrets create "$shared_secret" \
            --data-file=- \
            --project="$PROJECT_ID" \
            --replication-policy="automatic" \
            --labels="project=dive-v3,type=mongodb,instance=shared" 2>/dev/null; then
            log_success "Created shared secret: $shared_secret"
            created=$((created + 1))
        fi
    else
        log_warn "Shared secret exists: $shared_secret (skipping)"
        skipped=$((skipped + 1))
    fi
    
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
    
    log_success "MongoDB secrets infrastructure ready"
}

# Show how to use the secrets
show_usage() {
    log_section "Usage Instructions"
    
    echo ""
    echo "To enable GCP Secret Manager for MongoDB passwords:"
    echo ""
    echo "  1. Set environment variable:"
    echo "     export USE_GCP_SECRETS=true"
    echo ""
    echo "  2. Ensure GCP authentication:"
    echo "     gcloud auth application-default login"
    echo ""
    echo "  3. Run the seeding script:"
    echo "     npm run seed:instance -- --instance=USA --count=7000"
    echo ""
    echo "Secret naming convention:"
    echo "  ${SECRET_PREFIX}-<instance>  (e.g., ${SECRET_PREFIX}-usa)"
    echo ""
}

# Main execution
main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║     DIVE V3 MongoDB Secrets Setup                             ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    
    [ "$DRY_RUN" = true ] && log_warn "DRY RUN MODE - No changes will be made"
    [ "$GENERATE_PASSWORDS" = true ] && log_info "Auto-generating secure passwords"
    log_info "GCP Project: $PROJECT_ID"
    echo ""
    
    check_dependencies
    create_mongodb_secrets
    show_usage
    
    echo ""
    log_success "=== MongoDB secrets setup complete ==="
}

main "$@"




