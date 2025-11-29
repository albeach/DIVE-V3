#!/bin/bash
# ============================================================================
# DIVE V3 - Upload Federation Secrets to GCP Secret Manager
# ============================================================================
# After Terraform creates federation clients, this script:
# 1. Fetches client secrets from each Keycloak instance
# 2. Uploads them to GCP Secret Manager
# 
# USAGE: ./scripts/vault/upload-federation-secrets.sh [--dry-run] [--instance <code>]
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
INSTANCE_FILTER=""

# Parse arguments
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --instance=*) INSTANCE_FILTER="${arg#*=}" ;;
        --project=*) PROJECT_ID="${arg#*=}" ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --dry-run           Show what would be done without making changes"
            echo "  --instance=CODE     Only sync for specific instance (usa, fra, gbr, deu)"
            echo "  --project=ID        GCP project ID (default: dive-v3-pilot)"
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
    
    if ! command -v curl &>/dev/null; then
        log_error "curl is required but not installed"
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

# Load configuration from registry
load_config() {
    log_info "Loading configuration from federation-registry.json..."
    
    if [ ! -f "$REGISTRY_FILE" ]; then
        log_error "Registry file not found: $REGISTRY_FILE"
        exit 1
    fi
    
    log_success "Configuration loaded"
}

# URL-encode a string (for special characters in passwords)
urlencode() {
    local string="$1"
    local strlen=${#string}
    local encoded=""
    local pos c o
    
    for (( pos=0 ; pos<strlen ; pos++ )); do
        c=${string:$pos:1}
        case "$c" in
            [-_.~a-zA-Z0-9] ) o="$c" ;;
            * ) printf -v o '%%%02X' "'$c" ;;
        esac
        encoded+="$o"
    done
    echo "$encoded"
}

# Get admin token for an instance
get_admin_token() {
    local instance=$1
    local idp_url
    local admin_password
    
    idp_url=$(jq -r ".instances.${instance}.urls.idp" "$REGISTRY_FILE")
    admin_password=$(jq -r '.defaults.adminPassword' "$REGISTRY_FILE")
    local encoded_pwd=$(urlencode "$admin_password")
    
    local instance_type=$(jq -r ".instances.${instance}.type" "$REGISTRY_FILE")
    
    if [[ "$instance_type" == "remote" ]]; then
        local host=$(jq -r ".instances.${instance}.deployment.host" "$REGISTRY_FILE")
        # For remote instances, we need to SSH or use the public URL
        curl -sk -X POST "${idp_url}/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password&client_id=admin-cli&username=admin&password=${encoded_pwd}" 2>/dev/null | jq -r '.access_token'
    else
        curl -sk -X POST "${idp_url}/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password&client_id=admin-cli&username=admin&password=${encoded_pwd}" 2>/dev/null | jq -r '.access_token'
    fi
}

# Get client secret from a Keycloak instance
get_client_secret() {
    local instance=$1
    local client_id=$2
    local idp_url
    
    idp_url=$(jq -r ".instances.${instance}.urls.idp" "$REGISTRY_FILE")
    
    local token=$(get_admin_token "$instance")
    if [ -z "$token" ] || [ "$token" = "null" ]; then
        log_warn "Could not get admin token for $instance"
        return 1
    fi
    
    # Get client UUID
    local client_uuid
    client_uuid=$(curl -sk "${idp_url}/admin/realms/dive-v3-broker/clients?clientId=${client_id}" \
        -H "Authorization: Bearer $token" 2>/dev/null | jq -r '.[0].id')
    
    if [ -z "$client_uuid" ] || [ "$client_uuid" = "null" ]; then
        log_warn "Client $client_id not found in $instance"
        return 1
    fi
    
    # Get client secret
    curl -sk "${idp_url}/admin/realms/dive-v3-broker/clients/${client_uuid}/client-secret" \
        -H "Authorization: Bearer $token" 2>/dev/null | jq -r '.value'
}

# Upload secret to GCP Secret Manager
upload_secret() {
    local secret_name=$1
    local secret_value=$2
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would upload secret: $secret_name"
        return 0
    fi
    
    # Check if secret exists
    if gcloud secrets describe "$secret_name" --project="$PROJECT_ID" &>/dev/null; then
        # Add new version
        echo -n "$secret_value" | gcloud secrets versions add "$secret_name" \
            --data-file=- --project="$PROJECT_ID" 2>/dev/null
    else
        # Create new secret
        echo -n "$secret_value" | gcloud secrets create "$secret_name" \
            --data-file=- --project="$PROJECT_ID" \
            --replication-policy="automatic" \
            --labels="project=dive-v3,type=federation" 2>/dev/null
    fi
}

# Main upload logic
upload_secrets() {
    log_section "Uploading Federation Secrets"
    
    local instances
    if [ -n "$INSTANCE_FILTER" ]; then
        instances="$INSTANCE_FILTER"
    else
        instances=$(jq -r '.instances | keys[]' "$REGISTRY_FILE")
    fi
    
    local uploaded=0
    local failed=0
    
    for source in $instances; do
        log_info "Processing source instance: $source"
        
        local partners=$(jq -r ".federation.matrix.${source}[]" "$REGISTRY_FILE")
        
        for target in $partners; do
            local client_id="dive-v3-${target}-federation"
            local secret_name="${SECRET_PREFIX}-${source}-${target}"
            
            log_info "  Fetching $client_id from $source..."
            
            local secret_value
            secret_value=$(get_client_secret "$source" "$client_id")
            
            if [ -n "$secret_value" ] && [ "$secret_value" != "null" ]; then
                if upload_secret "$secret_name" "$secret_value"; then
                    log_success "  ✓ Uploaded: $secret_name (${secret_value:0:8}...)"
                    uploaded=$((uploaded + 1))
                else
                    log_error "  ✗ Failed to upload: $secret_name"
                    failed=$((failed + 1))
                fi
            else
                log_warn "  ✗ Could not get secret for $client_id"
                failed=$((failed + 1))
            fi
        done
    done
    
    log_section "Upload Summary"
    echo ""
    echo "  Uploaded: $uploaded"
    echo "  Failed:   $failed"
    echo ""
    
    if [ $failed -gt 0 ]; then
        log_warn "Some uploads failed. Check Keycloak connectivity."
        return 1
    fi
    
    log_success "All secrets uploaded successfully"
}

# Main execution
main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║     DIVE V3 Federation Secrets Upload                        ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    
    [ "$DRY_RUN" = true ] && log_warn "DRY RUN MODE - No changes will be made"
    [ -n "$INSTANCE_FILTER" ] && log_info "Filtering to instance: $INSTANCE_FILTER"
    log_info "GCP Project: $PROJECT_ID"
    echo ""
    
    check_dependencies
    load_config
    upload_secrets
    
    echo ""
    log_success "=== Upload complete ==="
    echo ""
    echo "Next steps:"
    echo "  1. Restart Keycloak instances to pick up new secrets"
    echo "  2. Verify with: ./scripts/vault/verify-secrets.sh"
}

main "$@"

