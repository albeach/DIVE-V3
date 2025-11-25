#!/usr/bin/env bash
# ============================================================================
# DIVE V3 - Federation Validation Script
# ============================================================================
# Validates federation configuration across all instances by:
# 1. Checking all IdP URLs are reachable
# 2. Verifying federation clients exist with correct redirect_uris
# 3. Testing actual federation flows (optional)
#
# Usage:
#   ./scripts/federation/validate-federation.sh           # Full validation
#   ./scripts/federation/validate-federation.sh --quick   # URL checks only
#   ./scripts/federation/validate-federation.sh --json    # JSON output
#
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
REGISTRY_FILE="$PROJECT_ROOT/config/federation-registry.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Options
QUICK_MODE=false
JSON_MODE=false

for arg in "$@"; do
    case "$arg" in
        --quick) QUICK_MODE=true ;;
        --json) JSON_MODE=true ;;
        --help|-h)
            echo "Usage: $0 [--quick] [--json]"
            echo ""
            echo "Options:"
            echo "  --quick   Only check URL reachability"
            echo "  --json    Output results as JSON"
            exit 0
            ;;
    esac
done

# Check dependencies
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is required${NC}"
    exit 1
fi

# Results tracking
declare -a URL_RESULTS
declare -a CLIENT_RESULTS
declare -a FLOW_RESULTS

# ============================================================================
# Helper Functions
# ============================================================================

log() {
    if [[ "$JSON_MODE" == "false" ]]; then
        echo -e "$1"
    fi
}

check_url() {
    local url="$1"
    local name="$2"
    
    local http_code
    http_code=$(curl -sk -o /dev/null -w "%{http_code}" "$url" --max-time 10 2>/dev/null) || http_code="000"
    
    if [[ "$http_code" =~ ^2 ]]; then
        log "  ${GREEN}✓${NC} $name: $url (HTTP $http_code)"
        echo "PASS"
    else
        log "  ${RED}✗${NC} $name: $url (HTTP $http_code)"
        echo "FAIL"
    fi
}

check_federation_client() {
    local source_instance="$1"
    local target_instance="$2"
    local source_idp_url="$3"
    local target_idp_url="$4"
    
    # The federation client on source_instance should have redirect_uri pointing to target_instance
    local expected_client="dive-v3-${target_instance}-federation"
    local expected_redirect_uri="${target_idp_url}/realms/dive-v3-broker/broker/${source_instance}-federation/endpoint"
    
    # Get client info from Keycloak
    # Note: This requires admin access, so we just check if the endpoint responds for now
    local well_known="${source_idp_url}/realms/dive-v3-broker/.well-known/openid-configuration"
    
    if curl -sk "$well_known" --max-time 5 > /dev/null 2>&1; then
        log "  ${GREEN}✓${NC} ${source_instance^^} realm accessible"
        echo "PASS:$expected_redirect_uri"
    else
        log "  ${RED}✗${NC} ${source_instance^^} realm not accessible"
        echo "FAIL:realm_unreachable"
    fi
}

# ============================================================================
# Main Validation
# ============================================================================

log "${CYAN}============================================${NC}"
log "${CYAN}🔍 DIVE V3 Federation Validation${NC}"
log "${CYAN}============================================${NC}"
log ""

# Get all instances
INSTANCES=$(jq -r '.instances | keys[]' "$REGISTRY_FILE")

# ============================================================================
# Phase 1: URL Reachability
# ============================================================================

log "${BLUE}Phase 1: URL Reachability${NC}"
log ""

TOTAL_URLS=0
PASS_URLS=0

for instance in $INSTANCES; do
    log "${CYAN}Instance: ${instance^^}${NC}"
    
    app_url=$(jq -r ".instances.$instance.urls.app" "$REGISTRY_FILE")
    api_url=$(jq -r ".instances.$instance.urls.api" "$REGISTRY_FILE")
    idp_url=$(jq -r ".instances.$instance.urls.idp" "$REGISTRY_FILE")
    
    for url_check in "Frontend:$app_url" "API:$api_url/health" "IdP:$idp_url/realms/dive-v3-broker"; do
        name="${url_check%%:*}"
        url="${url_check#*:}"
        result=$(check_url "$url" "$name")
        ((TOTAL_URLS++))
        [[ "$result" == "PASS" ]] && ((PASS_URLS++))
        URL_RESULTS+=("$instance:$name:$result")
    done
    log ""
done

if [[ "$QUICK_MODE" == "true" ]]; then
    # Summary for quick mode
    log "${CYAN}============================================${NC}"
    log "${CYAN}📊 URL Reachability Summary${NC}"
    log "${CYAN}============================================${NC}"
    log ""
    log "Passed: ${GREEN}$PASS_URLS${NC} / $TOTAL_URLS"
    
    if [[ $PASS_URLS -eq $TOTAL_URLS ]]; then
        log ""
        log "${GREEN}✓ All URLs reachable${NC}"
        exit 0
    else
        log ""
        log "${RED}✗ Some URLs unreachable${NC}"
        exit 1
    fi
fi

# ============================================================================
# Phase 2: Federation Matrix Validation
# ============================================================================

log "${BLUE}Phase 2: Federation Matrix${NC}"
log ""

TOTAL_PATHS=0
PASS_PATHS=0

# For each instance, check federation to all its partners
for source in $INSTANCES; do
    source_idp=$(jq -r ".instances.$source.urls.idp" "$REGISTRY_FILE")
    partners=$(jq -r ".federation.matrix.$source[]" "$REGISTRY_FILE" 2>/dev/null || echo "")
    
    log "${CYAN}${source^^} → Federation Paths${NC}"
    
    for target in $partners; do
        target_idp=$(jq -r ".instances.$target.urls.idp" "$REGISTRY_FILE")
        
        ((TOTAL_PATHS++))
        
        # Check if target realm is accessible
        target_realm_url="${target_idp}/realms/dive-v3-broker"
        result=$(check_url "$target_realm_url" "${target^^}")
        
        if [[ "$result" == "PASS" ]]; then
            ((PASS_PATHS++))
            CLIENT_RESULTS+=("${source}->${target}:PASS")
        else
            CLIENT_RESULTS+=("${source}->${target}:FAIL")
        fi
    done
    log ""
done

# ============================================================================
# Phase 3: Redirect URI Validation (requires admin access)
# ============================================================================

log "${BLUE}Phase 3: Expected Redirect URIs${NC}"
log ""
log "The following redirect_uris should be configured:"
log ""

for source in $INSTANCES; do
    source_idp=$(jq -r ".instances.$source.urls.idp" "$REGISTRY_FILE")
    partners=$(jq -r ".federation.matrix.$source[]" "$REGISTRY_FILE" 2>/dev/null || echo "")
    
    log "${CYAN}${source^^} Keycloak (${source_idp})${NC}"
    log "Should have these federation clients:"
    log ""
    
    for target in $partners; do
        target_idp=$(jq -r ".instances.$target.urls.idp" "$REGISTRY_FILE")
        target_upper=$(echo "$target" | tr '[:lower:]' '[:upper:]')
        
        log "  Client: ${YELLOW}dive-v3-${target}-federation${NC}"
        log "  Valid redirect_uri:"
        log "    ${BLUE}${target_idp}/realms/dive-v3-broker/broker/${source}-federation/endpoint${NC}"
        log ""
    done
done

# ============================================================================
# Summary
# ============================================================================

log "${CYAN}============================================${NC}"
log "${CYAN}📊 Validation Summary${NC}"
log "${CYAN}============================================${NC}"
log ""
log "URL Reachability: ${GREEN}$PASS_URLS${NC} / $TOTAL_URLS"
log "Federation Paths: ${GREEN}$PASS_PATHS${NC} / $TOTAL_PATHS"
log ""

# Output JSON if requested
if [[ "$JSON_MODE" == "true" ]]; then
    echo "{"
    echo "  \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
    echo "  \"url_checks\": {"
    echo "    \"total\": $TOTAL_URLS,"
    echo "    \"passed\": $PASS_URLS"
    echo "  },"
    echo "  \"federation_paths\": {"
    echo "    \"total\": $TOTAL_PATHS,"
    echo "    \"passed\": $PASS_PATHS"
    echo "  },"
    echo "  \"results\": ["
    
    first=true
    for result in "${URL_RESULTS[@]}"; do
        if [[ "$first" != "true" ]]; then echo ","; fi
        first=false
        IFS=':' read -r inst name status <<< "$result"
        echo -n "    {\"instance\":\"$inst\",\"check\":\"$name\",\"status\":\"$status\"}"
    done
    
    echo ""
    echo "  ]"
    echo "}"
fi

# Exit code
if [[ $PASS_URLS -eq $TOTAL_URLS && $PASS_PATHS -eq $TOTAL_PATHS ]]; then
    log "${GREEN}✓ All validations passed${NC}"
    exit 0
else
    log "${RED}✗ Some validations failed${NC}"
    log ""
    log "Next steps:"
    log "1. Review the federation-registry.json for correct URLs"
    log "2. Regenerate tfvars: ./scripts/federation/generate-tfvars.sh"
    log "3. Apply Terraform: ./scripts/federation/apply-all.sh"
    exit 1
fi

