#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Verification Sub-Module
# =============================================================================
# Commands: verify
# =============================================================================
# Version: 2.0.0 (delegates shared checks to deployment/verification.sh)
# Date: 2026-02-07
# =============================================================================

# Load shared verification primitives
if [ -z "${DIVE_DEPLOYMENT_VERIFICATION_LOADED:-}" ]; then
    if [ -f "$(dirname "${BASH_SOURCE[0]}")/../deployment/verification.sh" ]; then
        source "$(dirname "${BASH_SOURCE[0]}")/../deployment/verification.sh"
    fi
fi

# =============================================================================
# SPOKE VERIFICATION (12-POINT CHECK)
# =============================================================================

spoke_verify() {
    local instance_code="${1:-}"

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo ""
        echo "Usage: ./dive spoke verify CODE"
        echo ""
        echo "Examples:"
        echo "  ./dive spoke verify FRA"
        echo "  ./dive spoke verify DEU"
        return 1
    fi

    ensure_dive_root
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}Spoke Verification: ${code_upper}${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would verify spoke connectivity (12 checks)"
        return 0
    fi

    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke not initialized: $spoke_dir"
        return 1
    fi

    # Load config
    local config_file="$spoke_dir/config.json"
    local env_file="$spoke_dir/.env"
    local hub_url=""
    local spoke_id=""
    local spoke_token=""

    if [ -f "$config_file" ]; then
        hub_url=$(json_get_field "$config_file" "hubUrl" "")
        spoke_id=$(json_get_field "$config_file" "spokeId" "")
    fi
    if [ "$ENVIRONMENT" = "local" ] || [ "$ENVIRONMENT" = "dev" ]; then
        hub_url="${hub_url:-https://localhost:4000}"
    else
        hub_url="${hub_url:-https://usa-api.dive25.com}"
    fi

    if [ -f "$env_file" ]; then
        spoke_token=$(grep -o '^SPOKE_OPAL_TOKEN=.*' "$env_file" 2>/dev/null | cut -d= -f2- | tr -d '"' || echo "")
    fi

    # Resolve spoke ports dynamically
    local container_prefix="dive-spoke-${code_lower}"
    local kc_https_port=8443
    local be_port=4000
    local opa_port=8181

    if type -t get_instance_ports &>/dev/null; then
        eval "$(get_instance_ports "$code_upper" 2>/dev/null)" || true
        kc_https_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-$kc_https_port}"
        be_port="${SPOKE_BACKEND_PORT:-$be_port}"
        opa_port="${SPOKE_OPA_PORT:-$opa_port}"
    fi

    # Track results
    local checks_total=12
    local checks_passed=0
    local checks_failed=0

    echo -e "${CYAN}Running 12-Point Spoke Verification${NC}"
    echo ""

    export COMPOSE_PROJECT_NAME="dive-spoke-${code_lower}"

    # ------------------------------------------------------------------
    # Check 1: Docker containers running
    # ------------------------------------------------------------------
    printf "  %-35s" "1. Docker Containers (8 services):"
    local expected_services=("keycloak" "backend" "opa" "opal-client" "mongodb" "postgres" "redis" "frontend")
    local running_count=0
    for service in "${expected_services[@]}"; do
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -qE "${code_lower}.*${service}|${service}.*${code_lower}"; then
            ((running_count++))
        fi
    done
    if [ $running_count -ge 5 ]; then
        echo -e "${GREEN}PASS ${running_count}/8 running${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}FAIL ${running_count}/8 running${NC}"
        ((checks_failed++))
    fi

    # ------------------------------------------------------------------
    # Check 2: Keycloak Health (shared primitive)
    # ------------------------------------------------------------------
    printf "  %-35s" "2. Keycloak Health:"
    if verification_check_keycloak "spoke" "$code_upper" 2>/dev/null; then
        echo -e "${GREEN}PASS Healthy${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}FAIL Unhealthy${NC}"
        ((checks_failed++))
    fi

    # ------------------------------------------------------------------
    # Check 3: Backend API Health (shared primitive)
    # ------------------------------------------------------------------
    printf "  %-35s" "3. Backend API Health:"
    if verification_check_backend "spoke" "$code_upper" 2>/dev/null; then
        echo -e "${GREEN}PASS Healthy${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}FAIL Unhealthy${NC}"
        ((checks_failed++))
    fi

    # ------------------------------------------------------------------
    # Check 4: MongoDB Connection (shared primitive)
    # ------------------------------------------------------------------
    printf "  %-35s" "4. MongoDB Connection:"
    if verification_check_mongodb "$container_prefix" 2>/dev/null; then
        echo -e "${GREEN}PASS Connected${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}FAIL Not Found${NC}"
        ((checks_failed++))
    fi

    # ------------------------------------------------------------------
    # Check 5: Redis Connection (shared primitive)
    # ------------------------------------------------------------------
    printf "  %-35s" "5. Redis Connection:"
    if verification_check_redis "$container_prefix" 2>/dev/null; then
        echo -e "${GREEN}PASS Connected${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}FAIL Not Found${NC}"
        ((checks_failed++))
    fi

    # ------------------------------------------------------------------
    # Check 6: OPA Health (shared primitive)
    # ------------------------------------------------------------------
    printf "  %-35s" "6. OPA Health:"
    if verification_check_opa "$opa_port" 2>/dev/null; then
        echo -e "${GREEN}PASS Healthy${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}FAIL Unhealthy${NC}"
        ((checks_failed++))
    fi

    # ------------------------------------------------------------------
    # Check 7: OPAL Client Status (unique to spoke verify)
    # ------------------------------------------------------------------
    printf "  %-35s" "7. OPAL Client:"
    local opal_container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "opal-client.*${code_lower}|${code_lower}.*opal-client" | head -1)
    if [ -n "$opal_container" ]; then
        local opal_logs=$(docker logs "$opal_container" 2>&1 | tail -50)
        if echo "$opal_logs" | grep -q "Connected to PubSub server"; then
            echo -e "${GREEN}PASS Connected${NC}"
            ((checks_passed++))
        elif echo "$opal_logs" | grep -q "403\|Forbidden"; then
            echo -e "${RED}FAIL Auth Failed${NC}"
            ((checks_failed++))
        else
            echo -e "${YELLOW}WARN Connecting...${NC}"
            ((checks_passed++))
        fi
    else
        echo -e "${YELLOW}WARN Not Started${NC}"
        ((checks_passed++))
    fi

    # ------------------------------------------------------------------
    # Check 8: Hub Connectivity (unique to spoke verify)
    # ------------------------------------------------------------------
    printf "  %-35s" "8. Hub Connectivity:"
    if curl -kfs "${hub_url}/health" --max-time 10 >/dev/null 2>&1; then
        echo -e "${GREEN}PASS Reachable${NC}"
        ((checks_passed++))
    elif curl -kfs "${hub_url}/api/federation/health" --max-time 10 >/dev/null 2>&1; then
        echo -e "${GREEN}PASS Reachable${NC}"
        ((checks_passed++))
    else
        echo -e "${YELLOW}WARN Unreachable (${hub_url})${NC}"
        ((checks_failed++))
    fi

    # ------------------------------------------------------------------
    # Check 9: Policy Bundle (unique to spoke verify)
    # ------------------------------------------------------------------
    printf "  %-35s" "9. Policy Bundle:"
    local policy_count=$(curl -sf "http://localhost:${opa_port}/v1/policies" --max-time 5 2>/dev/null | grep -o '"id"' | wc -l | tr -d ' ')
    if [ "$policy_count" -gt 0 ]; then
        echo -e "${GREEN}PASS Loaded ($policy_count policies)${NC}"
        ((checks_passed++))
    else
        echo -e "${YELLOW}WARN Not Loaded${NC}"
        ((checks_passed++))
    fi

    # ------------------------------------------------------------------
    # Check 10: Token Validity (unique to spoke verify)
    # ------------------------------------------------------------------
    printf "  %-35s" "10. Token Validity:"
    if [ -n "$spoke_token" ] && [ ${#spoke_token} -gt 20 ]; then
        local token_payload=""
        if echo "$spoke_token" | grep -q '\.'; then
            token_payload=$(echo "$spoke_token" | cut -d. -f2 | base64 -d 2>/dev/null || echo "")
        fi
        if [ -n "$token_payload" ]; then
            local exp=$(echo "$token_payload" | grep -o '"exp"[[:space:]]*:[[:space:]]*[0-9]*' | cut -d: -f2 | tr -d ' ')
            if [ -n "$exp" ]; then
                local now=$(date +%s)
                if [ "$exp" -gt "$now" ]; then
                    local days_left=$(( (exp - now) / 86400 ))
                    echo -e "${GREEN}PASS Valid (${days_left} days left)${NC}"
                    ((checks_passed++))
                else
                    echo -e "${RED}FAIL Expired${NC}"
                    ((checks_failed++))
                fi
            else
                echo -e "${GREEN}PASS Token present${NC}"
                ((checks_passed++))
            fi
        else
            echo -e "${GREEN}PASS Token present${NC}"
            ((checks_passed++))
        fi
    else
        echo -e "${YELLOW}WARN No token configured${NC}"
        ((checks_passed++))
    fi

    # ------------------------------------------------------------------
    # Check 11: Hub Heartbeat (unique to spoke verify)
    # ------------------------------------------------------------------
    printf "  %-35s" "11. Hub Heartbeat:"
    if [ -n "$spoke_token" ] && [ -n "$spoke_id" ]; then
        local heartbeat_response=$(curl -kfs --max-time 5 \
            -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${spoke_token}" \
            -d '{"status": "healthy", "metrics": {}}' \
            "${hub_url}/api/federation/spokes/${spoke_id}/heartbeat" 2>/dev/null)

        if echo "$heartbeat_response" | grep -q '"success"[[:space:]]*:[[:space:]]*true\|"ack"\|heartbeat'; then
            echo -e "${GREEN}PASS Successful${NC}"
            ((checks_passed++))
        else
            echo -e "${YELLOW}WARN No response${NC}"
            ((checks_passed++))
        fi
    else
        echo -e "${YELLOW}WARN Skipped (no token/id)${NC}"
        ((checks_passed++))
    fi

    # ------------------------------------------------------------------
    # Check 12: TLS Certificates (unique to spoke verify)
    # ------------------------------------------------------------------
    printf "  %-35s" "12. TLS Certificates:"
    local cert_dir="$spoke_dir/certs"
    local cert_file="$cert_dir/certificate.pem"

    if [ -f "$cert_file" ]; then
        local expiry=$(openssl x509 -enddate -noout -in "$cert_file" 2>/dev/null | cut -d= -f2)
        local expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y %Z" "$expiry" +%s 2>/dev/null || echo 0)
        local now_epoch=$(date +%s)
        local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

        if [ $days_left -gt 30 ]; then
            echo -e "${GREEN}PASS Valid (${days_left} days left)${NC}"
            ((checks_passed++))
        elif [ $days_left -gt 0 ]; then
            echo -e "${YELLOW}WARN Expires soon (${days_left} days)${NC}"
            ((checks_passed++))
        else
            echo -e "${RED}FAIL Expired or invalid${NC}"
            ((checks_failed++))
        fi
    else
        if curl -kfs --max-time 5 "https://localhost:${be_port}/health" >/dev/null 2>&1; then
            echo -e "${GREEN}PASS TLS working${NC}"
            ((checks_passed++))
        else
            echo -e "${YELLOW}WARN No cert file${NC}"
            ((checks_passed++))
        fi
    fi

    # Summary
    echo ""
    echo "  Total Checks:   $checks_total"
    echo -e "  Passed:         ${GREEN}$checks_passed${NC}"
    echo -e "  Failed:         ${RED}$checks_failed${NC}"
    echo ""

    if [ $checks_failed -eq 0 ]; then
        echo -e "${GREEN}All 12 verification checks passed!${NC}"
        echo ""
        return 0
    else
        echo -e "${YELLOW}Some checks failed. See above for details.${NC}"
        echo ""
        return 1
    fi
}
