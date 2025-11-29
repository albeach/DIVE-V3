#!/bin/bash
# ============================================================================
# DIVE V3 - Verify Federation Secrets
# ============================================================================
# Verifies that all federation secrets are properly configured:
# 1. Secrets exist in GCP Secret Manager
# 2. Secrets are accessible by the appropriate service accounts
# 3. (Optional) Keycloak vault files exist
#
# USAGE: ./scripts/vault/verify-secrets.sh [--verbose] [--test-federation]
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
VERBOSE=false
TEST_FEDERATION=false

for arg in "$@"; do
    case "$arg" in
        --verbose|-v) VERBOSE=true ;;
        --test-federation) TEST_FEDERATION=true ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --verbose, -v       Show detailed output"
            echo "  --test-federation   Test actual federation flows"
            exit 0
            ;;
    esac
done

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }
log_section() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# Check if GCP CLI is available and authenticated
check_gcp() {
    if ! command -v gcloud &>/dev/null; then
        log_error "gcloud CLI not installed"
        return 1
    fi
    
    if ! gcloud auth print-access-token &>/dev/null; then
        log_error "Not authenticated to GCP"
        return 1
    fi
    
    log_success "GCP CLI available and authenticated"
}

# Verify secrets exist in GCP Secret Manager
verify_gcp_secrets() {
    log_section "Verifying GCP Secret Manager Secrets"
    
    local instances=$(jq -r '.instances | keys[]' "$REGISTRY_FILE")
    local total=0
    local found=0
    local missing=0
    
    for source in $instances; do
        local partners=$(jq -r ".federation.matrix.${source}[]" "$REGISTRY_FILE")
        
        for target in $partners; do
            local secret_name="${SECRET_PREFIX}-${source}-${target}"
            total=$((total + 1))
            
            if gcloud secrets describe "$secret_name" --project="$PROJECT_ID" &>/dev/null; then
                local version_count=$(gcloud secrets versions list "$secret_name" \
                    --project="$PROJECT_ID" --format="value(name)" 2>/dev/null | wc -l)
                
                if [ "$VERBOSE" = true ]; then
                    log_success "  $secret_name (${version_count} versions)"
                fi
                found=$((found + 1))
            else
                log_error "  Missing: $secret_name"
                missing=$((missing + 1))
            fi
        done
    done
    
    echo ""
    echo "  Total:   $total"
    echo "  Found:   $found"
    echo "  Missing: $missing"
    
    [ $missing -eq 0 ]
}

# Verify IAM permissions
verify_iam_permissions() {
    log_section "Verifying IAM Permissions"
    
    local instances=$(jq -r '.instances | keys[]' "$REGISTRY_FILE")
    local issues=0
    
    for instance in $instances; do
        local sa_email="dive-v3-keycloak-${instance}@${PROJECT_ID}.iam.gserviceaccount.com"
        
        # Check if service account exists
        if gcloud iam service-accounts describe "$sa_email" --project="$PROJECT_ID" &>/dev/null; then
            log_success "Service account exists: $instance"
            
            if [ "$VERBOSE" = true ]; then
                # List secrets this SA can access
                local partners=$(jq -r ".federation.matrix.${instance}[]" "$REGISTRY_FILE")
                for partner in $partners; do
                    local secret_name="${SECRET_PREFIX}-${partner}-${instance}"
                    
                    # Check IAM binding
                    local bindings=$(gcloud secrets get-iam-policy "$secret_name" \
                        --project="$PROJECT_ID" --format=json 2>/dev/null)
                    
                    if echo "$bindings" | grep -q "$sa_email"; then
                        log_success "    Can access: $secret_name"
                    else
                        log_error "    Missing access: $secret_name"
                        issues=$((issues + 1))
                    fi
                done
            fi
        else
            log_error "Service account missing: $sa_email"
            issues=$((issues + 1))
        fi
    done
    
    [ $issues -eq 0 ]
}

# Verify audit logging is enabled
verify_audit_logging() {
    log_section "Verifying Audit Logging"
    
    local policy=$(gcloud projects get-iam-policy "$PROJECT_ID" --format=json 2>/dev/null)
    
    if echo "$policy" | jq -e '.auditConfigs[] | select(.service == "secretmanager.googleapis.com")' &>/dev/null; then
        log_success "Audit logging enabled for Secret Manager"
        
        if [ "$VERBOSE" = true ]; then
            local log_types=$(echo "$policy" | jq -r '.auditConfigs[] | select(.service == "secretmanager.googleapis.com") | .auditLogConfigs[].logType')
            for lt in $log_types; do
                log_info "  Log type: $lt"
            done
        fi
        return 0
    else
        log_warn "Audit logging not explicitly configured"
        return 0  # Not a critical failure
    fi
}

# Test actual federation (if enabled)
test_federation() {
    if [ "$TEST_FEDERATION" != true ]; then
        return 0
    fi
    
    log_section "Testing Federation Flows"
    
    local instances=$(jq -r '.instances | keys[]' "$REGISTRY_FILE")
    local passed=0
    local failed=0
    
    for source in $instances; do
        local source_url=$(jq -r ".instances.${source}.urls.idp" "$REGISTRY_FILE")
        local partners=$(jq -r ".federation.matrix.${source}[]" "$REGISTRY_FILE")
        
        for target in $partners; do
            log_info "Testing: $source -> $target"
            
            local alias="${target}-federation"
            local discovery_url="${source_url}/realms/dive-v3-broker/broker/${alias}/.well-known/openid-configuration"
            
            if curl -sk -f "$discovery_url" &>/dev/null; then
                log_success "  ✓ IdP broker discoverable"
                passed=$((passed + 1))
            else
                log_error "  ✗ IdP broker not accessible"
                failed=$((failed + 1))
            fi
        done
    done
    
    echo ""
    echo "  Passed: $passed"
    echo "  Failed: $failed"
    
    [ $failed -eq 0 ]
}

# Generate summary report
generate_report() {
    log_section "Verification Report"
    
    local total_secrets=$(jq '[.federation.matrix | to_entries[] | .value | length] | add' "$REGISTRY_FILE")
    local instances=$(jq -r '.instances | keys | length' "$REGISTRY_FILE")
    
    echo ""
    echo "  Federation Configuration:"
    echo "    Instances:        $instances"
    echo "    Total Secrets:    $total_secrets"
    echo "    GCP Project:      $PROJECT_ID"
    echo ""
}

# Main
main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║     DIVE V3 Federation Secrets Verification                   ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    
    local failures=0
    
    if ! check_gcp; then
        log_error "GCP prerequisites not met"
        exit 1
    fi
    
    verify_gcp_secrets || failures=$((failures + 1))
    verify_iam_permissions || failures=$((failures + 1))
    verify_audit_logging || failures=$((failures + 1))
    test_federation || failures=$((failures + 1))
    
    generate_report
    
    if [ $failures -gt 0 ]; then
        log_error "Verification completed with $failures issue(s)"
        exit 1
    fi
    
    log_success "All verifications passed!"
}

main "$@"

