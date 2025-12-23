#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Spoke Policy Management Module
# =============================================================================
# Extracted from spoke.sh during refactoring for modularity
# Commands: spoke policy status|sync|verify|version
# =============================================================================
# Version: 1.0.0
# Date: 2025-12-23
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# SPOKE POLICY MANAGEMENT (Phase 4)
# =============================================================================

spoke_policy() {
    local subaction="${1:-help}"
    shift || true

    case "$subaction" in
        status)  spoke_policy_status ;;
        sync)    spoke_policy_sync ;;
        verify)  spoke_policy_verify ;;
        version) spoke_policy_version ;;
        *)       spoke_policy_help ;;
    esac
}

spoke_policy_help() {
    echo -e "${BOLD}Spoke Policy Commands (Phase 4):${NC}"
    echo ""
    echo -e "${CYAN}Commands:${NC}"
    echo "  status             Show policy version, sync status, signature"
    echo "  sync               Force policy sync from hub"
    echo "  verify             Verify current policy bundle signature"
    echo "  version            Show current policy version"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  ./dive --instance nzl spoke policy status"
    echo "  ./dive --instance nzl spoke policy sync"
    echo "  ./dive --instance nzl spoke policy verify"
    echo ""
}

spoke_policy_status() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}Spoke Policy Status:${NC} $(upper "$instance_code")"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query hub for policy version and spoke for sync status"
        return 0
    fi

    # Get hub policy version
    local hub_url="${DIVE_HUB_URL:-https://localhost:4000}"
    echo -e "${CYAN}Hub Policy Version:${NC}"

    local hub_version=$(curl -ks "${hub_url}/api/opal/version" --max-time 10 2>/dev/null)
    if [ -n "$hub_version" ] && echo "$hub_version" | grep -q '"version"'; then
        local version=$(echo "$hub_version" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        local hash=$(echo "$hub_version" | grep -o '"hash"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        local timestamp=$(echo "$hub_version" | grep -o '"timestamp"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        local bundle_id=$(echo "$hub_version" | grep -o '"bundleId"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        local signed_at=$(echo "$hub_version" | grep -o '"signedAt"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)

        echo "  Version:           ${version:-unknown}"
        echo "  Hash:              ${hash:0:16}..."
        echo "  Timestamp:         ${timestamp:-unknown}"
        [ -n "$bundle_id" ] && echo "  Bundle ID:         $bundle_id"
        [ -n "$signed_at" ] && echo "  Signed At:         $signed_at"
    else
        echo -e "  ${RED}✗ Could not reach hub${NC}"
        echo "  Hub URL: $hub_url"
    fi

    echo ""

    # Get local OPA status
    echo -e "${CYAN}Local OPA Status:${NC}"
    local opa_health=$(curl -s "http://localhost:8181/health" --max-time 5 2>/dev/null)
    if [ -n "$opa_health" ]; then
        echo -e "  Status:            ${GREEN}✓ Running${NC}"

        # Query for loaded policies
        local policies=$(curl -s "http://localhost:8181/v1/policies" --max-time 5 2>/dev/null)
        if [ -n "$policies" ]; then
            local policy_count=$(echo "$policies" | grep -o '"id"' | wc -l | tr -d ' ')
            echo "  Loaded Policies:   $policy_count"
        fi

        # Try to get guardrails metadata
        local guardrails=$(curl -s "http://localhost:8181/v1/data/dive/base/guardrails/metadata" --max-time 5 2>/dev/null)
        if echo "$guardrails" | grep -q '"version"'; then
            local local_version=$(echo "$guardrails" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
            echo "  Guardrails Ver:    $local_version"
        fi
    else
        echo -e "  Status:            ${RED}✗ Not Running${NC}"
    fi

    echo ""

    # Get OPAL client status
    echo -e "${CYAN}OPAL Client Status:${NC}"
    local opal_health=$(curl -s "http://localhost:7000/healthcheck" --max-time 5 2>/dev/null)
    if [ -n "$opal_health" ]; then
        echo -e "  Status:            ${GREEN}✓ Connected${NC}"

        local last_update=$(echo "$opal_health" | grep -o '"last_update"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        [ -n "$last_update" ] && echo "  Last Update:       $last_update"
    else
        echo -e "  Status:            ${YELLOW}⚠ Not Connected${NC}"
        echo "  OPAL may be starting or not configured."
    fi

    echo ""

    # Show scopes from token if available
    if [ -f "$spoke_dir/.env" ]; then
        local token=$(grep "SPOKE_OPAL_TOKEN" "$spoke_dir/.env" 2>/dev/null | cut -d= -f2- | tr -d '"')
        if [ -n "$token" ] && [ "$token" != "" ]; then
            echo -e "${CYAN}Spoke Configuration:${NC}"
            echo "  Token:             ✓ Configured"

            local token_info=$(curl -ks -H "Authorization: Bearer $token" "${hub_url}/api/federation/policy/bundle" --max-time 5 2>/dev/null)
            if echo "$token_info" | grep -q '"scopes"'; then
                local scopes=$(echo "$token_info" | grep -o '"scopes"[[:space:]]*:\s*\[[^]]*\]' | head -1)
                echo "  Scopes:            $scopes"
            fi
        else
            echo -e "${CYAN}Spoke Configuration:${NC}"
            echo -e "  Token:             ${YELLOW}⚠ Not configured${NC}"
            echo "  Configure with: ./dive --instance $instance_code spoke token-refresh"
        fi
    fi

    echo ""
}

spoke_policy_sync() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_step "Forcing policy sync from Hub..."

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would trigger OPAL client to pull latest policies from hub"
        return 0
    fi

    local hub_url="${DIVE_HUB_URL:-https://localhost:4000}"

    # Get token from spoke config
    local token=""
    if [ -f "$spoke_dir/.env" ]; then
        token=$(grep "SPOKE_OPAL_TOKEN" "$spoke_dir/.env" 2>/dev/null | cut -d= -f2- | tr -d '"')
    fi

    if [ -z "$token" ]; then
        log_error "No OPAL token configured for this spoke"
        echo ""
        echo "Configure a token with: ./dive --instance $instance_code spoke token-refresh"
        return 1
    fi

    log_info "Fetching policy bundle from hub..."

    local scope="policy:$(lower "$instance_code")"
    local response=$(curl -ks -H "Authorization: Bearer $token" \
        "${hub_url}/api/opal/bundle/$scope" --max-time 30 2>/dev/null)

    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        local version=$(echo "$response" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        local hash=$(echo "$response" | grep -o '"hash"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        local file_count=$(echo "$response" | grep -o '"fileCount"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
        local signed=$(echo "$response" | grep -o '"signed"[[:space:]]*:[[:space:]]*[a-z]*' | head -1 | cut -d: -f2 | tr -d ' ')

        log_success "Policy bundle fetched from hub!"
        echo ""
        echo "  Version:     $version"
        echo "  Hash:        ${hash:0:16}..."
        echo "  Files:       $file_count"
        echo "  Signed:      $signed"
        echo ""

        # Trigger OPAL client refresh
        log_info "Triggering OPAL client refresh..."
        if curl -s -X POST "http://localhost:7000/policy-refresh" --max-time 5 2>/dev/null; then
            log_success "OPAL client refreshed"
        else
            log_warn "Could not trigger OPAL client refresh (may not be running)"
        fi

        # Verify signature
        if [ "$signed" = "true" ]; then
            log_info "Verifying bundle signature..."
            local verify_result=$(curl -ks "${hub_url}/api/opal/bundle/verify/${hash}" --max-time 10 2>/dev/null)
            if echo "$verify_result" | grep -q '"verified"[[:space:]]*:[[:space:]]*true'; then
                log_success "Bundle signature verified ✓"
            else
                log_warn "Bundle signature verification failed"
            fi
        fi

    elif echo "$response" | grep -q '"error"'; then
        local error=$(echo "$response" | grep -o '"error"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        log_error "Failed to fetch policy bundle: $error"
        return 1
    else
        log_warn "Could not fetch from hub API, trying OPAL client..."
        if curl -s -X POST "http://localhost:7000/policy-refresh" --max-time 5 2>/dev/null; then
            log_success "Policy refresh triggered via OPAL client"
        else
            log_error "Could not trigger policy sync. Ensure services are running."
            return 1
        fi
    fi
}

spoke_policy_verify() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"

    print_header
    echo -e "${BOLD}Verifying Policy Bundle:${NC} $(upper "$instance_code")"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would verify current policy bundle signature"
        return 0
    fi

    log_info "Querying local OPA for bundle info..."

    local bundle_info=$(curl -s "http://localhost:8181/v1/data/system/bundle" --max-time 5 2>/dev/null)

    if [ -z "$bundle_info" ]; then
        log_warn "Could not query OPA bundle info"
        echo ""
        echo "OPA may not have a bundle loaded or the bundle/system path is not available."
        return 1
    fi

    local hub_url="${DIVE_HUB_URL:-https://localhost:4000}"

    local hub_version=$(curl -ks "${hub_url}/api/opal/version" --max-time 10 2>/dev/null)
    if ! echo "$hub_version" | grep -q '"version"'; then
        log_error "Could not reach hub to get current version"
        return 1
    fi

    local current_hash=$(echo "$hub_version" | grep -o '"hash"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
    local current_version=$(echo "$hub_version" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ -z "$current_hash" ]; then
        log_error "No bundle hash available from hub"
        return 1
    fi

    log_info "Verifying bundle signature with hub..."

    local verify_result=$(curl -ks "${hub_url}/api/opal/bundle/verify/${current_hash}" --max-time 10 2>/dev/null)

    if echo "$verify_result" | grep -q '"verified"[[:space:]]*:[[:space:]]*true'; then
        local bundle_id=$(echo "$verify_result" | grep -o '"bundleId"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local signed_at=$(echo "$verify_result" | grep -o '"signedAt"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local signed_by=$(echo "$verify_result" | grep -o '"signedBy"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local file_count=$(echo "$verify_result" | grep -o '"fileCount"[[:space:]]*:[[:space:]]*[0-9]*' | cut -d: -f2 | tr -d ' ')

        log_success "Bundle Signature: VALID ✓"
        echo ""
        echo "  Bundle Hash:       ${current_hash:0:16}..."
        echo "  Version:           $current_version"
        echo "  Bundle ID:         $bundle_id"
        echo "  Signed At:         $signed_at"
        echo "  Signed By:         $signed_by"
        echo "  Files:             $file_count"
        echo ""

    elif echo "$verify_result" | grep -q '"signatureError"'; then
        local sig_error=$(echo "$verify_result" | grep -o '"signatureError"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

        log_error "Bundle Signature: INVALID ✗"
        echo ""
        echo "  Hash:              ${current_hash:0:16}..."
        echo "  Error:             $sig_error"
        echo ""
        echo "This could indicate:"
        echo "  • Bundle was not signed"
        echo "  • Signing key mismatch"
        echo "  • Bundle was tampered with"
        echo ""
        return 1

    else
        log_warn "Could not verify bundle signature"
        echo ""
        echo "Response: $verify_result"
        return 1
    fi
}

spoke_policy_version() {
    ensure_dive_root

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query policy version"
        return 0
    fi

    local hub_url="${DIVE_HUB_URL:-https://localhost:4000}"
    local response=$(curl -ks "${hub_url}/api/opal/version" --max-time 10 2>/dev/null)

    if echo "$response" | grep -q '"version"'; then
        local version=$(echo "$response" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        local hash=$(echo "$response" | grep -o '"hash"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)

        echo "Policy Version: $version"
        echo "Hash: ${hash:0:16}..."
    else
        log_error "Could not get policy version from hub"
        return 1
    fi
}

# Mark module as loaded
export DIVE_SPOKE_POLICY_LOADED=1

