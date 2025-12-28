#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Federation Diagnose Module
# =============================================================================
# Comprehensive federation diagnostic tool for troubleshooting
# Commands: federation diagnose <spoke>
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load federation-setup for admin token helpers
if [ -z "$DIVE_FEDERATION_SETUP_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/federation-setup.sh"
    export DIVE_FEDERATION_SETUP_LOADED=1
fi

# Mark this module as loaded
export DIVE_FEDERATION_DIAGNOSE_LOADED=1

##
# Comprehensive federation diagnostic for a spoke
# Checks all aspects of bidirectional federation setup
##
federation_diagnose() {
    local spoke_code="${1:?Spoke code required}"
    local code_upper=$(upper "$spoke_code")
    local code_lower=$(lower "$spoke_code")

    echo ""
    echo -e "${BOLD}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}     Federation Diagnostic: USA Hub ↔ ${code_upper} Spoke      ${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════════════════════${NC}"
    echo ""

    local issues_found=0
    local checks_passed=0
    local checks_total=8

    # Get port information
    eval "$(get_instance_ports "$code_upper")"

    # Check 1: Hub Keycloak Health
    echo -e "${CYAN}[1/8]${NC} Checking Hub Keycloak health..."
    if curl -kfs --max-time 5 "https://localhost:8443/health/ready" >/dev/null 2>&1; then
        echo "  ✓ Hub Keycloak is healthy"
        ((checks_passed++))
    else
        echo "  ✗ Hub Keycloak is not responding"
        ((issues_found++))
        echo -e "    ${YELLOW}Fix: ./dive hub up${NC}"
    fi

    # Check 2: Spoke Keycloak Health
    echo -e "${CYAN}[2/8]${NC} Checking Spoke Keycloak health..."
    if curl -kfs --max-time 5 "https://localhost:${SPOKE_KEYCLOAK_PORT}/health/ready" >/dev/null 2>&1; then
        echo "  ✓ Spoke Keycloak is healthy (port ${SPOKE_KEYCLOAK_PORT})"
        ((checks_passed++))
    else
        echo "  ✗ Spoke Keycloak is not responding on port ${SPOKE_KEYCLOAK_PORT}"
        ((issues_found++))
        echo -e "    ${YELLOW}Fix: ./dive --instance ${code_lower} spoke up${NC}"
    fi

    # Check 3: IdP exists in Hub
    echo -e "${CYAN}[3/8]${NC} Checking ${code_lower}-idp in Hub Keycloak..."
    local hub_token
    hub_token=$(get_hub_admin_token)

    if [ -n "$hub_token" ]; then
        local idp_check
        idp_check=$(curl -kfs --max-time 5 \
            -H "Authorization: Bearer $hub_token" \
            "https://localhost:8443/admin/realms/dive-v3-broker-usa/identity-provider/instances/${code_lower}-idp" 2>/dev/null)

        if [ -n "$idp_check" ]; then
            local enabled=$(echo "$idp_check" | jq -r '.enabled // false')
            if [ "$enabled" = "true" ]; then
                echo "  ✓ ${code_lower}-idp exists and is enabled in Hub"
                ((checks_passed++))
            else
                echo "  ⚠ ${code_lower}-idp exists but is DISABLED in Hub"
                ((issues_found++))
                echo -e "    ${YELLOW}Fix: ./dive federation-setup register-hub ${code_lower}${NC}"
            fi
        else
            echo "  ✗ ${code_lower}-idp does not exist in Hub"
            ((issues_found++))
            echo -e "    ${YELLOW}Fix: ./dive federation-setup register-hub ${code_lower}${NC}"
        fi
    else
        echo "  ✗ Could not get Hub admin token"
        ((issues_found++))
    fi

    # Check 4: usa-idp exists in Spoke
    echo -e "${CYAN}[4/8]${NC} Checking usa-idp in Spoke Keycloak..."
    local spoke_token
    spoke_token=$(get_spoke_admin_token "$code_lower")

    if [ -n "$spoke_token" ]; then
        local spoke_idp_check
        spoke_idp_check=$(curl -kfs --max-time 5 \
            -H "Authorization: Bearer $spoke_token" \
            "https://localhost:${SPOKE_KEYCLOAK_PORT}/admin/realms/dive-v3-broker-${code_lower}/identity-provider/instances/usa-idp" 2>/dev/null)

        if [ -n "$spoke_idp_check" ]; then
            local spoke_enabled=$(echo "$spoke_idp_check" | jq -r '.enabled // false')
            if [ "$spoke_enabled" = "true" ]; then
                echo "  ✓ usa-idp exists and is enabled in Spoke"
                ((checks_passed++))
            else
                echo "  ⚠ usa-idp exists but is DISABLED in Spoke"
                ((issues_found++))
                echo -e "    ${YELLOW}Fix: ./dive federation-setup configure ${code_lower}${NC}"
            fi
        else
            echo "  ✗ usa-idp does not exist in Spoke"
            ((issues_found++))
            echo -e "    ${YELLOW}Fix: ./dive federation-setup configure ${code_lower}${NC}"
        fi
    else
        echo "  ✗ Could not get Spoke admin token"
        ((issues_found++))
    fi

    # Check 5: Hub client secret match
    echo -e "${CYAN}[5/8]${NC} Checking client secret synchronization..."
    local hub_client_secret
    hub_client_secret=$(get_hub_client_secret "$code_lower" 2>/dev/null)

    if [ -n "$hub_client_secret" ] && [ "$hub_client_secret" != "null" ]; then
        echo "  ✓ Hub client secret retrieved (${hub_client_secret:0:8}...)"

        # Check if frontend has same secret
        local frontend_secret
        frontend_secret=$(docker exec "dive-spoke-${code_lower}-frontend" printenv AUTH_KEYCLOAK_SECRET 2>/dev/null)

        if [ "$frontend_secret" = "$hub_client_secret" ]; then
            echo "  ✓ Frontend secret matches Hub client secret"
            ((checks_passed++))
        else
            echo "  ✗ Frontend secret MISMATCH"
            ((issues_found++))
            echo -e "    ${YELLOW}Fix: ./dive --instance ${code_lower} spoke sync-secrets${NC}"
        fi
    else
        echo "  ⚠ Could not retrieve Hub client secret"
        ((issues_found++))
    fi

    # Check 6: Network connectivity
    echo -e "${CYAN}[6/8]${NC} Checking network connectivity..."
    local hub_backend_url="https://localhost:4000"
    local spoke_backend_url="https://localhost:${SPOKE_BACKEND_PORT}"

    if curl -kfs --max-time 3 "${hub_backend_url}/health" >/dev/null 2>&1; then
        echo "  ✓ Hub backend reachable (${hub_backend_url})"
        ((checks_passed++))
    else
        echo "  ✗ Hub backend not reachable"
        ((issues_found++))
    fi

    if curl -kfs --max-time 3 "${spoke_backend_url}/health" >/dev/null 2>&1; then
        echo "  ✓ Spoke backend reachable (${spoke_backend_url})"
    else
        echo "  ⚠ Spoke backend not reachable"
    fi

    # Check 7: Federation registry
    echo -e "${CYAN}[7/8]${NC} Checking federation registry..."
    local registry_check
    registry_check=$(curl -kfs --max-time 5 "https://localhost:4000/api/federation/spokes" 2>/dev/null)

    if [ -n "$registry_check" ]; then
        local spoke_in_registry
        spoke_in_registry=$(echo "$registry_check" | jq -r ".spokes[] | select(.instanceCode == \"${code_upper}\") | .status" 2>/dev/null)

        if [ -n "$spoke_in_registry" ]; then
            echo "  ✓ Spoke registered in federation registry (status: ${spoke_in_registry})"
            ((checks_passed++))
        else
            echo "  ⚠ Spoke not found in federation registry"
            ((issues_found++))
            echo -e "    ${YELLOW}Fix: ./dive --instance ${code_lower} spoke register${NC}"
        fi
    else
        echo "  ⚠ Could not check federation registry"
    fi

    # Check 8: OPA trusted issuers
    echo -e "${CYAN}[8/8]${NC} Checking OPA trusted issuers..."
    if [ -f "${DIVE_ROOT}/backend/config/trusted_issuers.json" ]; then
        local issuer_check
        issuer_check=$(jq -r ".trustedIssuers[] | select(contains(\"${code_lower}\"))" \
            "${DIVE_ROOT}/backend/config/trusted_issuers.json" 2>/dev/null)

        if [ -n "$issuer_check" ]; then
            echo "  ✓ Spoke issuer in OPA trusted issuers"
            ((checks_passed++))
        else
            echo "  ⚠ Spoke issuer not in OPA trusted issuers"
            ((issues_found++))
            echo -e "    ${YELLOW}Fix: ./dive federation-setup sync-opa ${code_lower}${NC}"
        fi
    else
        echo "  ⚠ trusted_issuers.json not found"
    fi

    # Summary
    echo ""
    echo -e "${BOLD}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}                    Diagnostic Summary                     ${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════════════════════${NC}"
    echo ""

    if [ $issues_found -eq 0 ]; then
        echo -e "${GREEN}✓ All checks passed ($checks_passed/$checks_total)${NC}"
        echo ""
        echo "Federation is properly configured!"
    else
        echo -e "${YELLOW}⚠ Found $issues_found issues ($checks_passed/$checks_total checks passed)${NC}"
        echo ""
        echo -e "${CYAN}Suggested Fix Workflow:${NC}"
        echo ""

        # Provide specific fix commands based on issues
        if [ $checks_passed -lt 4 ]; then
            echo "1. Ensure services are running:"
            echo "   ./dive hub up"
            echo "   ./dive --instance ${code_lower} spoke up"
            echo ""
        fi

        echo "2. Configure federation (if IdPs missing):"
        echo "   ./dive federation-setup register-hub ${code_lower}"
        echo "   ./dive federation-setup configure ${code_lower}"
        echo ""

        if grep -q "secret MISMATCH" <<< "$(cat)"; then
            echo "3. Sync secrets:"
            echo "   ./dive --instance ${code_lower} spoke sync-secrets"
            echo ""
        fi

        echo "4. Verify configuration:"
        echo "   ./dive federation verify ${code_upper}"
        echo ""
    fi

    return $issues_found
}

# Export function for use by federation.sh
export -f federation_diagnose
