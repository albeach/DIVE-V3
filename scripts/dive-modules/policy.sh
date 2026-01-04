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
# DYNAMIC POLICY DATA MANAGEMENT (Phase 2)
# =============================================================================

policy_add_issuer() {
    local issuer_url="${1:-}"
    local tenant="${2:-}"
    
    if [ -z "$issuer_url" ] || [ -z "$tenant" ]; then
        log_error "Usage: ./dive policy add-issuer <issuer_url> <tenant>"
        echo ""
        echo "Adds a trusted issuer to the OPAL policy data (MongoDB-backed)."
        echo ""
        echo "Arguments:"
        echo "  issuer_url  Full URL of the OIDC issuer (e.g., https://localhost:8443/realms/dive-v3-broker-fra)"
        echo "  tenant      Tenant code (e.g., FRA, GBR, DEU)"
        echo ""
        echo "Options:"
        echo "  --name      Human-readable name (default: derived from URL)"
        echo "  --trust     Trust level: HIGH, MEDIUM, DEVELOPMENT, LOW (default: DEVELOPMENT)"
        echo ""
        echo "Examples:"
        echo "  ./dive policy add-issuer https://fra-idp.dive25.com/realms/dive-v3-broker FRA"
        echo "  ./dive policy add-issuer https://localhost:8453/realms/dive-v3-broker-fra FRA --trust DEVELOPMENT"
        return 1
    fi
    
    # Parse optional arguments
    local name=""
    local trust_level="DEVELOPMENT"
    shift 2
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --name)
                name="$2"
                shift 2
                ;;
            --trust)
                trust_level="${2^^}"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done
    
    # Derive name from URL if not provided
    if [ -z "$name" ]; then
        name="${tenant^^} Keycloak"
    fi
    
    # Derive country from tenant
    local country="${tenant^^}"
    
    log_step "Adding trusted issuer: $issuer_url ($tenant)"
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would POST to: https://localhost:4000/api/opal/trusted-issuers"
        log_dry "  issuerUrl: $issuer_url"
        log_dry "  tenant: $tenant"
        log_dry "  name: $name"
        log_dry "  trustLevel: $trust_level"
        return 0
    fi
    
    # Call API
    local response=$(curl -s -X POST "https://localhost:4000/api/opal/trusted-issuers" \
        -H "Content-Type: application/json" \
        -H "x-admin-key: ${FEDERATION_ADMIN_KEY:-dive-hub-admin-key}" \
        -k -d "{
            \"issuerUrl\": \"$issuer_url\",
            \"tenant\": \"$tenant\",
            \"name\": \"$name\",
            \"country\": \"$country\",
            \"trustLevel\": \"$trust_level\",
            \"enabled\": true
        }" 2>&1)
    
    if echo "$response" | jq -e '.success == true' >/dev/null 2>&1; then
        log_success "Trusted issuer added!"
        echo ""
        echo "  Issuer URL:  $issuer_url"
        echo "  Tenant:      $tenant"
        echo "  Trust Level: $trust_level"
        echo ""
        echo "OPAL refresh has been triggered automatically."
    else
        log_error "Failed to add issuer"
        echo "Response: $response"
        return 1
    fi
}

policy_remove_issuer() {
    local issuer_url="${1:-}"
    
    if [ -z "$issuer_url" ]; then
        log_error "Usage: ./dive policy remove-issuer <issuer_url>"
        echo ""
        echo "Removes a trusted issuer from OPAL policy data."
        return 1
    fi
    
    log_step "Removing trusted issuer: $issuer_url"
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would DELETE: https://localhost:4000/api/opal/trusted-issuers/<encoded_url>"
        return 0
    fi
    
    # URL encode the issuer URL
    local encoded_url=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$issuer_url', safe=''))" 2>/dev/null || echo "$issuer_url")
    
    local response=$(curl -s -X DELETE "https://localhost:4000/api/opal/trusted-issuers/${encoded_url}" \
        -H "x-admin-key: ${FEDERATION_ADMIN_KEY:-dive-hub-admin-key}" \
        -k 2>&1)
    
    if echo "$response" | jq -e '.success == true' >/dev/null 2>&1; then
        log_success "Trusted issuer removed!"
    else
        log_error "Failed to remove issuer"
        echo "Response: $response"
        return 1
    fi
}

policy_list_issuers() {
    log_step "Listing trusted issuers..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would GET: https://localhost:4000/api/opal/trusted-issuers"
        return 0
    fi
    
    local response=$(curl -s "https://localhost:4000/api/opal/trusted-issuers" -k 2>&1)
    
    if echo "$response" | jq -e '.success == true' >/dev/null 2>&1; then
        local count=$(echo "$response" | jq -r '.count')
        echo -e "${BOLD}Trusted Issuers (${count}):${NC}"
        echo ""
        
        echo "$response" | jq -r '.trusted_issuers | to_entries[] | "  [\(.value.trust_level)] \(.value.tenant) - \(.key)"'
    else
        log_error "Failed to list issuers"
        echo "Response: $response"
        return 1
    fi
}

policy_add_federation_trust() {
    local source="${1:-}"
    local target="${2:-}"
    
    if [ -z "$source" ] || [ -z "$target" ]; then
        log_error "Usage: ./dive policy add-trust <source_country> <target_country>"
        echo ""
        echo "Adds a federation trust relationship."
        echo ""
        echo "Examples:"
        echo "  ./dive policy add-trust USA FRA    # USA trusts FRA"
        echo "  ./dive policy add-trust GBR DEU    # GBR trusts DEU"
        return 1
    fi
    
    source="${source^^}"
    target="${target^^}"
    
    log_step "Adding federation trust: $source → $target"
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would POST to: https://localhost:4000/api/opal/federation-matrix"
        return 0
    fi
    
    local response=$(curl -s -X POST "https://localhost:4000/api/opal/federation-matrix" \
        -H "Content-Type: application/json" \
        -H "x-admin-key: ${FEDERATION_ADMIN_KEY:-dive-hub-admin-key}" \
        -k -d "{
            \"sourceCountry\": \"$source\",
            \"targetCountry\": \"$target\"
        }" 2>&1)
    
    if echo "$response" | jq -e '.success == true' >/dev/null 2>&1; then
        log_success "Federation trust added: $source now trusts $target"
    else
        log_error "Failed to add trust"
        echo "Response: $response"
        return 1
    fi
}

policy_remove_federation_trust() {
    local source="${1:-}"
    local target="${2:-}"
    
    if [ -z "$source" ] || [ -z "$target" ]; then
        log_error "Usage: ./dive policy remove-trust <source_country> <target_country>"
        return 1
    fi
    
    source="${source^^}"
    target="${target^^}"
    
    log_step "Removing federation trust: $source → $target"
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would DELETE: https://localhost:4000/api/opal/federation-matrix/$source/$target"
        return 0
    fi
    
    local response=$(curl -s -X DELETE "https://localhost:4000/api/opal/federation-matrix/${source}/${target}" \
        -H "x-admin-key: ${FEDERATION_ADMIN_KEY:-dive-hub-admin-key}" \
        -k 2>&1)
    
    if echo "$response" | jq -e '.success == true' >/dev/null 2>&1; then
        log_success "Federation trust removed"
    else
        log_error "Failed to remove trust"
        echo "Response: $response"
        return 1
    fi
}

policy_show_federation_matrix() {
    log_step "Showing federation matrix..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would GET: https://localhost:4000/api/opal/federation-matrix"
        return 0
    fi
    
    local response=$(curl -s "https://localhost:4000/api/opal/federation-matrix" -k 2>&1)
    
    if echo "$response" | jq -e '.success == true' >/dev/null 2>&1; then
        local count=$(echo "$response" | jq -r '.count')
        echo -e "${BOLD}Federation Matrix (${count} nations):${NC}"
        echo ""
        
        echo "$response" | jq -r '.federation_matrix | to_entries[] | "\(.key): \(.value | join(", "))"'
    else
        log_error "Failed to get federation matrix"
        echo "Response: $response"
        return 1
    fi
}

policy_force_sync() {
    log_step "Forcing CDC sync to OPAL..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would POST to: https://localhost:4000/api/opal/cdc/force-sync"
        return 0
    fi
    
    local response=$(curl -s -X POST "https://localhost:4000/api/opal/cdc/force-sync" \
        -H "x-admin-key: ${FEDERATION_ADMIN_KEY:-dive-hub-admin-key}" \
        -k 2>&1)
    
    if echo "$response" | jq -e '.success == true' >/dev/null 2>&1; then
        log_success "All policy data synced to OPAL!"
        echo ""
        echo "Results:"
        echo "$response" | jq -r '.results | to_entries[] | "  \(.key): \(if .value then "✓" else "✗" end)"'
    else
        log_error "Force sync failed"
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
        # Bundle management
        build)          policy_build "$@" ;;
        push)           policy_push "$@" ;;
        status)         policy_status ;;
        test)           policy_test "$@" ;;
        version)        policy_version ;;
        refresh)        policy_refresh ;;
        
        # Dynamic policy data (Phase 2)
        add-issuer)     policy_add_issuer "$@" ;;
        remove-issuer)  policy_remove_issuer "$@" ;;
        list-issuers)   policy_list_issuers ;;
        add-trust)      policy_add_federation_trust "$@" ;;
        remove-trust)   policy_remove_federation_trust "$@" ;;
        show-matrix)    policy_show_federation_matrix ;;
        force-sync)     policy_force_sync ;;
        
        *)              module_policy_help ;;
    esac
}

module_policy_help() {
    echo -e "${BOLD}Policy Commands (Build, Sign, Push via OPAL):${NC}"
    echo ""
    echo -e "${CYAN}Bundle Management:${NC}"
    echo "  build [--sign] [--scopes]   Build OPA policy bundle"
    echo "  push                        Publish bundle to OPAL Server"
    echo "  status                      Show policy distribution status"
    echo "  test [pattern]              Run OPA policy tests"
    echo "  version                     Show current policy version"
    echo "  refresh                     Trigger OPAL policy refresh"
    echo ""
    echo -e "${CYAN}Dynamic Policy Data (MongoDB-backed):${NC}"
    echo "  add-issuer <url> <tenant>   Add trusted issuer to OPAL"
    echo "  remove-issuer <url>         Remove trusted issuer"
    echo "  list-issuers                List all trusted issuers"
    echo "  add-trust <from> <to>       Add federation trust relationship"
    echo "  remove-trust <from> <to>    Remove federation trust"
    echo "  show-matrix                 Show federation trust matrix"
    echo "  force-sync                  Force sync all data to OPAL"
    echo ""
    echo "Examples:"
    echo "  ./dive policy build --sign                                          # Build and sign bundle"
    echo "  ./dive policy push                                                   # Push to OPAL"
    echo "  ./dive policy add-issuer https://fra-kc.dive25.com/realms/fra FRA   # Add French issuer"
    echo "  ./dive policy add-trust USA FRA                                      # USA trusts FRA"
    echo "  ./dive policy list-issuers                                           # Show all issuers"
    echo "  ./dive policy show-matrix                                            # Show trust matrix"
    echo "  ./dive policy force-sync                                             # Force OPAL refresh"
}
