#!/bin/bash
# ============================================================================
# DIVE V3 - Deploy Federation with Vault Integration
# ============================================================================
# Complete deployment workflow for DIVE V3 federation with Vault secrets:
#
# 1. Check prerequisites (GCP, Terraform, Docker)
# 2. Apply Terraform to create federation clients
# 3. Upload secrets to GCP Secret Manager
# 4. Deploy Keycloak instances with vault sync
# 5. Verify federation
#
# USAGE: ./scripts/vault/deploy-with-vault.sh [options]
#
# OPTIONS:
#   --instance=CODE     Deploy specific instance only
#   --skip-terraform    Skip Terraform apply (use existing clients)
#   --skip-upload       Skip secret upload (secrets already in GCP)
#   --dry-run           Show what would be done
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Configuration
GCP_PROJECT_ID="${GCP_PROJECT_ID:-dive25}"
VAULT_DIR="/opt/keycloak/vault"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Flags
INSTANCE_FILTER=""
SKIP_TERRAFORM=false
SKIP_UPLOAD=false
DRY_RUN=false

# Parse arguments
for arg in "$@"; do
    case "$arg" in
        --instance=*) INSTANCE_FILTER="${arg#*=}" ;;
        --skip-terraform) SKIP_TERRAFORM=true ;;
        --skip-upload) SKIP_UPLOAD=true ;;
        --dry-run) DRY_RUN=true ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --instance=CODE     Deploy specific instance only (usa, fra, gbr, deu)"
            echo "  --skip-terraform    Skip Terraform apply"
            echo "  --skip-upload       Skip secret upload to GCP"
            echo "  --dry-run           Show what would be done without changes"
            echo ""
            echo "Environment Variables:"
            echo "  GCP_PROJECT_ID      GCP project (default: dive-v3-pilot)"
            echo "  GCP_SA_KEY_FILE     Service account key file"
            exit 0
            ;;
    esac
done

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_section() { echo -e "\n${CYAN}════════════════════════════════════════════════════════════════${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}\n"; }

# Check prerequisites
check_prerequisites() {
    log_section "Step 1: Checking Prerequisites"
    
    local errors=0
    
    # Check commands
    for cmd in jq gcloud terraform docker; do
        if command -v "$cmd" &>/dev/null; then
            log_success "$cmd available"
        else
            log_error "$cmd not found"
            errors=$((errors + 1))
        fi
    done
    
    # Check GCP authentication
    if gcloud auth print-access-token &>/dev/null; then
        log_success "GCP authenticated"
    else
        log_error "GCP not authenticated - run: gcloud auth login"
        errors=$((errors + 1))
    fi
    
    # Check project access
    if gcloud projects describe "$GCP_PROJECT_ID" &>/dev/null; then
        log_success "GCP project accessible: $GCP_PROJECT_ID"
    else
        log_error "Cannot access GCP project: $GCP_PROJECT_ID"
        errors=$((errors + 1))
    fi
    
    # Check federation registry
    if [ -f "$PROJECT_ROOT/config/federation-registry.json" ]; then
        log_success "Federation registry found"
    else
        log_error "Federation registry not found"
        errors=$((errors + 1))
    fi
    
    if [ $errors -gt 0 ]; then
        log_error "Prerequisites check failed with $errors error(s)"
        exit 1
    fi
    
    log_success "All prerequisites satisfied"
}

# Apply Terraform
apply_terraform() {
    if [ "$SKIP_TERRAFORM" = true ]; then
        log_info "Skipping Terraform (--skip-terraform)"
        return 0
    fi
    
    log_section "Step 2: Applying Terraform"
    
    cd "$PROJECT_ROOT/terraform"
    
    local instances
    if [ -n "$INSTANCE_FILTER" ]; then
        instances="$INSTANCE_FILTER"
    else
        instances="usa fra gbr deu"
    fi
    
    for instance in $instances; do
        log_info "Applying Terraform for $instance..."
        
        if [ "$DRY_RUN" = true ]; then
            log_info "[DRY RUN] Would run: terraform apply -target=module.${instance}"
        else
            terraform workspace select "$instance" 2>/dev/null || terraform workspace new "$instance"
            terraform apply -auto-approve -target="module.keycloak_clients" || {
                log_error "Terraform apply failed for $instance"
                return 1
            }
        fi
    done
    
    cd "$PROJECT_ROOT"
    log_success "Terraform apply completed"
}

# Upload secrets to GCP
upload_secrets() {
    if [ "$SKIP_UPLOAD" = true ]; then
        log_info "Skipping secret upload (--skip-upload)"
        return 0
    fi
    
    log_section "Step 3: Uploading Secrets to GCP"
    
    local args=""
    [ -n "$INSTANCE_FILTER" ] && args="--instance=$INSTANCE_FILTER"
    [ "$DRY_RUN" = true ] && args="$args --dry-run"
    
    "$SCRIPT_DIR/upload-federation-secrets.sh" $args
}

# Deploy Keycloak with vault sync
deploy_keycloak() {
    log_section "Step 4: Deploying Keycloak with Vault Sync"
    
    local instances
    if [ -n "$INSTANCE_FILTER" ]; then
        instances="$INSTANCE_FILTER"
    else
        instances="usa fra gbr deu"
    fi
    
    for instance in $instances; do
        log_info "Deploying Keycloak for $instance..."
        
        local compose_file
        case "$instance" in
            usa) compose_file="docker-compose.yml" ;;
            fra) compose_file="docker-compose.fra.yml" ;;
            gbr) compose_file="docker-compose.gbr.yml" ;;
            deu) compose_file="docker-compose.deu.yml" ;;
        esac
        
        if [ "$DRY_RUN" = true ]; then
            log_info "[DRY RUN] Would run: docker compose -f $compose_file -f docker-compose.vault.yml up -d keycloak"
        else
            cd "$PROJECT_ROOT"
            
            # Set instance for vault sync
            export INSTANCE="$instance"
            
            # Stop existing keycloak
            docker compose -f "$compose_file" stop keycloak 2>/dev/null || true
            
            # Start with vault integration
            docker compose -f "$compose_file" -f docker-compose.vault.yml up -d keycloak-vault-sync
            
            # Wait for sync to complete
            log_info "Waiting for vault sync to complete..."
            docker compose -f "$compose_file" -f docker-compose.vault.yml wait keycloak-vault-sync || {
                log_warn "Vault sync may have failed, checking logs..."
                docker compose -f "$compose_file" -f docker-compose.vault.yml logs keycloak-vault-sync
            }
            
            # Start Keycloak
            docker compose -f "$compose_file" -f docker-compose.vault.yml up -d keycloak
        fi
        
        log_success "Deployed Keycloak for $instance"
    done
}

# Verify federation
verify_federation() {
    log_section "Step 5: Verifying Federation"
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would run: ./scripts/vault/verify-secrets.sh --test-federation"
        return 0
    fi
    
    # Wait for Keycloak to be ready
    log_info "Waiting for Keycloak instances to be ready..."
    sleep 30
    
    "$SCRIPT_DIR/verify-secrets.sh" --test-federation || {
        log_warn "Some federation tests failed"
        return 1
    }
}

# Generate summary
generate_summary() {
    log_section "Deployment Summary"
    
    echo "┌──────────────────────────────────────────────────────────────────┐"
    echo "│                    DIVE V3 Vault Deployment                      │"
    echo "├──────────────────────────────────────────────────────────────────┤"
    echo "│                                                                  │"
    echo "│  GCP Project:     $GCP_PROJECT_ID"
    echo "│  Secrets Engine:  GCP Secret Manager"
    echo "│  Vault Provider:  Keycloak files-plaintext"
    echo "│                                                                  │"
    if [ -n "$INSTANCE_FILTER" ]; then
        echo "│  Instance:        $INSTANCE_FILTER"
    else
        echo "│  Instances:       usa, fra, gbr, deu"
    fi
    echo "│                                                                  │"
    echo "├──────────────────────────────────────────────────────────────────┤"
    echo "│  Next Steps:                                                     │"
    echo "│  1. Monitor: docker compose logs -f keycloak                     │"
    echo "│  2. Verify:  ./scripts/verify-federation.sh                      │"
    echo "│  3. Test:    Access usa-app.dive25.com, federate to partners    │"
    echo "│                                                                  │"
    echo "└──────────────────────────────────────────────────────────────────┘"
}

# Main
main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║     DIVE V3 Federation Deployment with Vault Integration         ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo ""
    
    [ "$DRY_RUN" = true ] && log_warn "DRY RUN MODE - No changes will be made"
    [ -n "$INSTANCE_FILTER" ] && log_info "Instance filter: $INSTANCE_FILTER"
    echo ""
    
    check_prerequisites
    apply_terraform
    upload_secrets
    deploy_keycloak
    verify_federation
    generate_summary
    
    echo ""
    log_success "Deployment completed successfully!"
}

main "$@"

