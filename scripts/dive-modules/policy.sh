#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Policy Commands Module
# =============================================================================
# Commands: build, push, status, test, version
# Manages OPA policy bundles and OPAL distribution
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# POLICY COMMANDS
# =============================================================================

policy_build() {
    local sign=true
    local scopes=""
    
    # Parse options
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --no-sign)
                sign=false
                shift
                ;;
            --sign)
                sign=true
                shift
                ;;
            --scopes)
                scopes="$2"
                shift 2
                ;;
            *)
                break
                ;;
        esac
    done
    
    log_step "Building OPA policy bundle..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would POST to: https://localhost:4000/api/opal/bundle/build"
        log_dry "  sign: $sign"
        log_dry "  scopes: ${scopes:-all}"
        return 0
    fi
    
    # Check if backend is running
    if ! curl -kfs --max-time 3 "https://localhost:4000/health" >/dev/null 2>&1; then
        log_error "Backend API not available. Start with './dive up' first."
        return 1
    fi
    
    # Build request payload
    local payload="{\"sign\": $sign, \"includeData\": true, \"compress\": true"
    if [ -n "$scopes" ]; then
        payload+=", \"scopes\": [$(echo "$scopes" | sed 's/,/","/g' | sed 's/^/"/' | sed 's/$/"/')"
        payload+="]"
    fi
    payload+="}"
    
    # Call API
    local response=$(curl -s -X POST "https://localhost:4000/api/opal/bundle/build" \
        -H "Content-Type: application/json" \
        -k -d "$payload" 2>&1)
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        local bundleId=$(echo "$response" | grep -o '"bundleId"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local version=$(echo "$response" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local hash=$(echo "$response" | grep -o '"hash"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local size=$(echo "$response" | grep -o '"size"[[:space:]]*:[[:space:]]*[0-9]*' | cut -d':' -f2 | tr -d ' ')
        local fileCount=$(echo "$response" | grep -o '"fileCount"[[:space:]]*:[[:space:]]*[0-9]*' | cut -d':' -f2 | tr -d ' ')
        local signed=$(echo "$response" | grep -o '"signed"[[:space:]]*:[[:space:]]*[a-z]*' | cut -d':' -f2 | tr -d ' ')
        
        log_success "Policy bundle built successfully!"
        echo ""
        echo "  Bundle ID:   $bundleId"
        echo "  Version:     $version"
        echo "  Hash:        ${hash:0:16}..."
        echo "  Size:        $size bytes"
        echo "  Files:       $fileCount"
        echo "  Signed:      $signed"
    else
        log_error "Bundle build failed"
        echo "Response: $response"
        return 1
    fi
}

policy_push() {
    log_step "Publishing policy bundle to OPAL Server..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would POST to: https://localhost:4000/api/opal/bundle/publish"
        return 0
    fi
    
    # Check if backend is running
    if ! curl -kfs --max-time 3 "https://localhost:4000/health" >/dev/null 2>&1; then
        log_error "Backend API not available. Start with './dive up' first."
        return 1
    fi
    
    # Call API
    local response=$(curl -s -X POST "https://localhost:4000/api/opal/bundle/publish" \
        -H "Content-Type: application/json" \
        -k 2>&1)
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        local bundleId=$(echo "$response" | grep -o '"bundleId"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local version=$(echo "$response" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local txnId=$(echo "$response" | grep -o '"opalTransactionId"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        
        log_success "Policy bundle published!"
        echo ""
        echo "  Bundle ID:      $bundleId"
        echo "  Version:        $version"
        if [ -n "$txnId" ]; then
            echo "  Transaction ID: $txnId"
        fi
    else
        log_error "Bundle publish failed"
        echo "Response: $response"
        return 1
    fi
}

policy_status() {
    echo -e "${BOLD}Policy Distribution Status:${NC}"
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query: https://localhost:4000/api/opal/health"
        log_dry "Would query: https://localhost:4000/api/opal/bundle/current"
        return 0
    fi
    
    # Check OPAL health
    echo -e "${CYAN}OPAL Server:${NC}"
    local opal_health=$(curl -s -k "https://localhost:4000/api/opal/health" 2>&1)
    
    if echo "$opal_health" | grep -q '"healthy"[[:space:]]*:[[:space:]]*true'; then
        echo -e "  Status:   ${GREEN}Healthy${NC}"
        local clients=$(echo "$opal_health" | grep -o '"clientsConnected"[[:space:]]*:[[:space:]]*[0-9]*' | cut -d':' -f2 | tr -d ' ')
        echo "  Clients:  ${clients:-0} connected"
    else
        echo -e "  Status:   ${YELLOW}Not connected${NC}"
    fi
    
    echo ""
    
    # Check current bundle
    echo -e "${CYAN}Current Bundle:${NC}"
    local bundle=$(curl -s -k "https://localhost:4000/api/opal/bundle/current" 2>&1)
    
    if echo "$bundle" | grep -q '"bundleId"'; then
        local bundleId=$(echo "$bundle" | grep -o '"bundleId"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local version=$(echo "$bundle" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local hash=$(echo "$bundle" | grep -o '"hash"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local signedAt=$(echo "$bundle" | grep -o '"signedAt"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        
        echo "  Bundle ID: $bundleId"
        echo "  Version:   $version"
        echo "  Hash:      ${hash:0:16}..."
        echo "  Signed At: $signedAt"
    else
        echo -e "  ${YELLOW}No bundle built yet. Run './dive policy build' first.${NC}"
    fi
    
    echo ""
    
    # Check OPA directly
    echo -e "${CYAN}OPA Server:${NC}"
    local opa_health=$(curl -s "http://localhost:8181/health" 2>/dev/null)
    if [ -n "$opa_health" ]; then
        echo -e "  Status:   ${GREEN}Running${NC}"
    else
        echo -e "  Status:   ${RED}Not running${NC}"
    fi
    
    # Check OPAL Server directly
    echo ""
    echo -e "${CYAN}OPAL Server (Direct):${NC}"
    local opal_direct=$(curl -s "http://localhost:7002/healthcheck" 2>/dev/null)
    if [ -n "$opal_direct" ]; then
        echo -e "  Status:   ${GREEN}Running${NC}"
    else
        echo -e "  Status:   ${RED}Not running${NC}"
    fi
}

policy_test() {
    local pattern="${1:-}"
    
    log_step "Running OPA policy tests..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "./bin/opa test policies/ -v"
        return 0
    fi
    
    ensure_dive_root
    
    if [ ! -x "${DIVE_ROOT}/bin/opa" ]; then
        log_error "OPA binary not found at ${DIVE_ROOT}/bin/opa"
        echo "Download from: https://github.com/open-policy-agent/opa/releases"
        return 1
    fi
    
    # Run tests (specific test files to avoid undefined functions)
    cd "${DIVE_ROOT}"
    if [ -n "$pattern" ]; then
        ./bin/opa test policies/base policies/tests/guardrails_test.rego policies/tests/bundle_test.rego -v --run "$pattern"
    else
        ./bin/opa test policies/base policies/tests/guardrails_test.rego policies/tests/bundle_test.rego -v
    fi
    
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        log_success "All policy tests passed!"
    else
        log_error "Some policy tests failed"
    fi
    
    return $exit_code
}

policy_version() {
    echo -e "${BOLD}Policy Version Information:${NC}"
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query OPA for policy metadata"
        return 0
    fi
    
    # Query OPA for guardrails metadata
    local metadata=$(curl -s "http://localhost:8181/v1/data/dive/base/guardrails/metadata" 2>/dev/null)
    
    if [ -n "$metadata" ] && echo "$metadata" | grep -q '"result"'; then
        local package=$(echo "$metadata" | grep -o '"package"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local version=$(echo "$metadata" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local source=$(echo "$metadata" | grep -o '"source"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        
        echo "  Guardrails:"
        echo "    Package:  $package"
        echo "    Version:  $version"
        echo "    Source:   $source"
    else
        echo -e "  ${YELLOW}Unable to query OPA. Is it running?${NC}"
    fi
}

policy_refresh() {
    log_step "Triggering OPAL policy refresh..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would POST to: https://localhost:4000/api/opal/refresh"
        return 0
    fi
    
    local response=$(curl -s -X POST "https://localhost:4000/api/opal/refresh" -k 2>&1)
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_success "Policy refresh triggered"
        echo "Response: $response"
    else
        log_error "Policy refresh failed"
        echo "Response: $response"
        return 1
    fi
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_policy() {
    local action="${1:-help}"
    shift || true
    
    case "$action" in
        build)   policy_build "$@" ;;
        push)    policy_push "$@" ;;
        status)  policy_status ;;
        test)    policy_test "$@" ;;
        version) policy_version ;;
        refresh) policy_refresh ;;
        *)       module_policy_help ;;
    esac
}

module_policy_help() {
    echo -e "${BOLD}Policy Commands (Build, Sign, Push via OPAL):${NC}"
    echo ""
    echo "  build [--sign] [--scopes]   Build OPA policy bundle"
    echo "  push                        Publish bundle to OPAL Server"
    echo "  status                      Show policy distribution status"
    echo "  test [pattern]              Run OPA policy tests"
    echo "  version                     Show current policy version"
    echo "  refresh                     Trigger OPAL policy refresh"
    echo ""
    echo "Examples:"
    echo "  ./dive policy build --sign            # Build and sign bundle"
    echo "  ./dive policy push                    # Push to OPAL"
    echo "  ./dive policy test                    # Run OPA tests"
    echo "  ./dive policy status                  # Show OPAL status"
}

