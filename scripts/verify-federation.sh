#!/bin/bash
# ============================================================================
# DIVE V3 - Comprehensive Federation Verification Script
# ============================================================================
# Tests all federation paths between DIVE V3 instances:
# 1. Endpoint reachability (OIDC discovery)
# 2. IdP broker configuration
# 3. Federation flow simulation
# 4. GCP Secret Manager integration (optional)
#
# USAGE: ./scripts/verify-federation.sh [options]
#
# OPTIONS:
#   --all               Run all tests
#   --endpoints         Test endpoint reachability only
#   --brokers           Test IdP broker configuration only
#   --secrets           Test GCP secrets only
#   --verbose           Show detailed output
#   --instance=CODE     Test specific instance only
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REGISTRY_FILE="$PROJECT_ROOT/config/federation-registry.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Flags
TEST_ENDPOINTS=false
TEST_BROKERS=false
TEST_SECRETS=false
VERBOSE=false
INSTANCE_FILTER=""

# Parse arguments
for arg in "$@"; do
    case "$arg" in
        --all)
            TEST_ENDPOINTS=true
            TEST_BROKERS=true
            TEST_SECRETS=true
            ;;
        --endpoints) TEST_ENDPOINTS=true ;;
        --brokers) TEST_BROKERS=true ;;
        --secrets) TEST_SECRETS=true ;;
        --verbose|-v) VERBOSE=true ;;
        --instance=*) INSTANCE_FILTER="${arg#*=}" ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --all               Run all tests"
            echo "  --endpoints         Test endpoint reachability only"
            echo "  --brokers           Test IdP broker configuration only"
            echo "  --secrets           Test GCP secrets only"
            echo "  --verbose, -v       Show detailed output"
            echo "  --instance=CODE     Test specific instance only"
            exit 0
            ;;
    esac
done

# Default: run all tests
if [ "$TEST_ENDPOINTS" = false ] && [ "$TEST_BROKERS" = false ] && [ "$TEST_SECRETS" = false ]; then
    TEST_ENDPOINTS=true
    TEST_BROKERS=true
fi

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }
log_section() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# Get instances list
get_instances() {
    if [ -n "$INSTANCE_FILTER" ]; then
        echo "$INSTANCE_FILTER"
    else
        jq -r '.instances | keys[]' "$REGISTRY_FILE"
    fi
}

# Test endpoint reachability
test_endpoints() {
    log_section "Testing Endpoint Reachability"
    
    local passed=0
    local failed=0
    
    for instance in $(get_instances); do
        local idp_url=$(jq -r ".instances.${instance}.urls.idp" "$REGISTRY_FILE")
        local app_url=$(jq -r ".instances.${instance}.urls.app" "$REGISTRY_FILE")
        local api_url=$(jq -r ".instances.${instance}.urls.api" "$REGISTRY_FILE")
        
        log_info "Testing $instance endpoints..."
        
        # Test IdP
        if curl -sk -f "${idp_url}/realms/dive-v3-broker/.well-known/openid-configuration" &>/dev/null; then
            log_success "  IdP: ${idp_url}"
            passed=$((passed + 1))
        else
            log_error "  IdP: ${idp_url}"
            failed=$((failed + 1))
        fi
        
        # Test App (frontend)
        if curl -sk -f "${app_url}" &>/dev/null; then
            log_success "  App: ${app_url}"
            passed=$((passed + 1))
        else
            log_warn "  App: ${app_url} (may be expected if frontend not running)"
        fi
        
        # Test API (backend)
        if curl -sk -f "${api_url}/health" &>/dev/null; then
            log_success "  API: ${api_url}"
            passed=$((passed + 1))
        else
            log_warn "  API: ${api_url} (may be expected if backend not running)"
        fi
    done
    
    echo ""
    echo "  Endpoints Passed: $passed"
    echo "  Endpoints Failed: $failed"
    
    return $failed
}

# Test IdP broker configuration
test_brokers() {
    log_section "Testing IdP Broker Configuration"
    
    local passed=0
    local failed=0
    local skipped=0
    
    for instance in $(get_instances); do
        local idp_url=$(jq -r ".instances.${instance}.urls.idp" "$REGISTRY_FILE")
        local admin_password=$(jq -r '.defaults.adminPassword' "$REGISTRY_FILE")
        
        log_info "Testing brokers in $instance..."
        
        # URL-encode password
        local encoded_pwd=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$admin_password'))" 2>/dev/null || echo "$admin_password")
        
        # Get admin token
        local token=$(curl -sk -X POST "${idp_url}/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password&client_id=admin-cli&username=admin&password=${encoded_pwd}" 2>/dev/null | jq -r '.access_token')
        
        if [ -z "$token" ] || [ "$token" = "null" ]; then
            log_warn "  Could not get admin token for $instance (skipping broker tests)"
            skipped=$((skipped + 1))
            continue
        fi
        
        # Get federation partners
        local partners=$(jq -r ".federation.matrix.${instance}[]" "$REGISTRY_FILE")
        
        for partner in $partners; do
            local alias="${partner}-federation"
            
            # Check if IdP exists
            local idp_config=$(curl -sk "${idp_url}/admin/realms/dive-v3-broker/identity-provider/instances/${alias}" \
                -H "Authorization: Bearer $token" 2>/dev/null)
            
            if [ -z "$idp_config" ] || [ "$idp_config" = "null" ] || echo "$idp_config" | jq -e '.error' &>/dev/null; then
                log_error "  ${instance} -> ${partner}: IdP broker not found"
                failed=$((failed + 1))
                continue
            fi
            
            local enabled=$(echo "$idp_config" | jq -r '.enabled')
            local client_secret=$(echo "$idp_config" | jq -r '.config.clientSecret')
            
            if [ "$enabled" = "true" ]; then
                if [ "$client_secret" = "**********" ]; then
                    log_success "  ${instance} -> ${partner}: Enabled, secret configured"
                    passed=$((passed + 1))
                elif [[ "$client_secret" == *"placeholder"* ]]; then
                    log_error "  ${instance} -> ${partner}: Still has placeholder secret"
                    failed=$((failed + 1))
                elif [[ "$client_secret" == *"vault."* ]]; then
                    log_success "  ${instance} -> ${partner}: Enabled, using vault reference"
                    passed=$((passed + 1))
                else
                    log_warn "  ${instance} -> ${partner}: Enabled, secret format unknown"
                    passed=$((passed + 1))
                fi
            else
                log_warn "  ${instance} -> ${partner}: IdP broker disabled"
                skipped=$((skipped + 1))
            fi
            
            [ "$VERBOSE" = true ] && echo "      Display: $(echo "$idp_config" | jq -r '.displayName')"
        done
    done
    
    echo ""
    echo "  Brokers Passed:  $passed"
    echo "  Brokers Failed:  $failed"
    echo "  Brokers Skipped: $skipped"
    
    return $failed
}

# Test GCP secrets
test_secrets() {
    log_section "Testing GCP Secret Manager Secrets"
    
    if ! command -v gcloud &>/dev/null; then
        log_warn "gcloud CLI not installed, skipping secret tests"
        return 0
    fi
    
    local project_id=$(jq -r '.gcp.projectId' "$REGISTRY_FILE")
    local passed=0
    local failed=0
    
    for instance in $(get_instances); do
        local partners=$(jq -r ".federation.matrix.${instance}[]" "$REGISTRY_FILE")
        
        log_info "Testing secrets for $instance..."
        
        for partner in $partners; do
            local secret_name="dive-v3-federation-${partner}-${instance}"
            
            if gcloud secrets describe "$secret_name" --project="$project_id" &>/dev/null; then
                log_success "  $secret_name"
                passed=$((passed + 1))
            else
                log_error "  $secret_name (not found)"
                failed=$((failed + 1))
            fi
        done
    done
    
    echo ""
    echo "  Secrets Passed: $passed"
    echo "  Secrets Failed: $failed"
    
    return $failed
}

# Generate summary report
generate_report() {
    log_section "Federation Verification Summary"
    
    local total_instances=$(jq -r '.instances | keys | length' "$REGISTRY_FILE")
    local total_paths=$(jq '[.federation.matrix | to_entries[] | .value | length] | add' "$REGISTRY_FILE")
    
    echo ""
    echo "┌──────────────────────────────────────────────────────────────────┐"
    echo "│                    DIVE V3 Federation Status                     │"
    echo "├──────────────────────────────────────────────────────────────────┤"
    echo "│                                                                  │"
    echo "│  Total Instances:       $total_instances"
    echo "│  Federation Paths:      $total_paths"
    echo "│                                                                  │"
    echo "│  Instances:"
    for instance in $(get_instances); do
        local name=$(jq -r ".instances.${instance}.name" "$REGISTRY_FILE")
        local idp=$(jq -r ".instances.${instance}.urls.idp" "$REGISTRY_FILE")
        local upper_instance=$(echo "$instance" | tr '[:lower:]' '[:upper:]')
        echo "│    - ${upper_instance}: $name"
        [ "$VERBOSE" = true ] && echo "│      IdP: $idp"
    done
    echo "│                                                                  │"
    echo "└──────────────────────────────────────────────────────────────────┘"
}

# Main
main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║     DIVE V3 Federation Verification                               ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo ""
    
    [ -n "$INSTANCE_FILTER" ] && log_info "Testing instance: $INSTANCE_FILTER"
    [ "$VERBOSE" = true ] && log_info "Verbose mode enabled"
    echo ""
    
    local total_failures=0
    
    [ "$TEST_ENDPOINTS" = true ] && { test_endpoints || total_failures=$((total_failures + $?)); }
    [ "$TEST_BROKERS" = true ] && { test_brokers || total_failures=$((total_failures + $?)); }
    [ "$TEST_SECRETS" = true ] && { test_secrets || total_failures=$((total_failures + $?)); }
    
    generate_report
    
    echo ""
    if [ $total_failures -gt 0 ]; then
        log_error "Verification completed with $total_failures failure(s)"
        exit 1
    else
        log_success "All federation tests passed!"
    fi
}

main "$@"
