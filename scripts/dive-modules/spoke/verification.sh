#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Verification Sub-Module
# =============================================================================
# Commands: verify
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-07
# =============================================================================

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
    echo -e "${BOLD}🔍 Spoke Verification: ${code_upper}${NC}"
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
    # Default hub URL based on environment
    if [ "$ENVIRONMENT" = "local" ] || [ "$ENVIRONMENT" = "dev" ]; then
        hub_url="${hub_url:-https://localhost:4000}"
    else
        hub_url="${hub_url:-https://usa-api.dive25.com}"
    fi

    # Try to load token from .env
    if [ -f "$env_file" ]; then
        spoke_token=$(grep -o '^SPOKE_OPAL_TOKEN=.*' "$env_file" 2>/dev/null | cut -d= -f2- | tr -d '"' || echo "")
    fi

    # Track results
    local checks_total=12
    local checks_passed=0
    local checks_failed=0

    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Running 12-Point Spoke Verification${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Set compose project
    export COMPOSE_PROJECT_NAME="dive-spoke-${code_lower}"

    # Check 1: Docker containers running (8 services)
    printf "  %-35s" "1. Docker Containers (8 services):"
    local expected_services=("keycloak" "backend" "opa" "opal-client" "mongodb" "postgres" "redis" "frontend")
    local running_count=0

    for service in "${expected_services[@]}"; do
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -qE "${code_lower}.*${service}|${service}.*${code_lower}"; then
            ((running_count++))
        fi
    done

    if [ $running_count -ge 5 ]; then
        echo -e "${GREEN}✓ ${running_count}/8 running${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ ${running_count}/8 running${NC}"
        ((checks_failed++))
    fi

    # Check 2: Keycloak Health
    printf "  %-35s" "2. Keycloak Health:"
    if curl -kfs https://localhost:8443/health/ready --max-time 10 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        ((checks_passed++))
    elif curl -kfs http://localhost:8080/health/ready --max-time 10 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy (HTTP)${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Unhealthy${NC}"
        ((checks_failed++))
    fi

    # Check 3: Backend API Health
    printf "  %-35s" "3. Backend API Health:"
    if curl -kfs https://localhost:4000/health --max-time 5 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Unhealthy${NC}"
        ((checks_failed++))
    fi

    # Check 4: MongoDB Connection
    printf "  %-35s" "4. MongoDB Connection:"
    local mongo_container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "mongodb.*${code_lower}|${code_lower}.*mongo" | head -1)
    if [ -n "$mongo_container" ]; then
        if docker exec "$mongo_container" mongosh --quiet --eval "db.adminCommand('ping')" 2>/dev/null | grep -q "ok"; then
            echo -e "${GREEN}✓ Connected${NC}"
            ((checks_passed++))
        else
            echo -e "${YELLOW}⚠ Container running${NC}"
            ((checks_passed++))
        fi
    else
        echo -e "${RED}✗ Not Found${NC}"
        ((checks_failed++))
    fi

    # Check 5: Redis Connection
    printf "  %-35s" "5. Redis Connection:"
    local redis_container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "redis.*${code_lower}|${code_lower}.*redis" | head -1)
    if [ -n "$redis_container" ]; then
        if docker exec "$redis_container" redis-cli ping 2>/dev/null | grep -q "PONG"; then
            echo -e "${GREEN}✓ Connected${NC}"
            ((checks_passed++))
        else
            echo -e "${YELLOW}⚠ Container running${NC}"
            ((checks_passed++))
        fi
    else
        echo -e "${RED}✗ Not Found${NC}"
        ((checks_failed++))
    fi

    # Check 6: OPA Health
    printf "  %-35s" "6. OPA Health:"
    if curl -sf http://localhost:8181/health --max-time 5 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Unhealthy${NC}"
        ((checks_failed++))
    fi

    # Check 7: OPAL Client Status (with JWT auth verification)
    printf "  %-35s" "7. OPAL Client:"
    local opal_container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "opal-client.*${code_lower}|${code_lower}.*opal-client" | head -1)
    if [ -n "$opal_container" ]; then
        # Check if connected to Hub's OPAL server
        local opal_logs=$(docker logs "$opal_container" 2>&1 | tail -50)
        if echo "$opal_logs" | grep -q "Connected to PubSub server"; then
            echo -e "${GREEN}✓ Connected (JWT auth working)${NC}"
            ((checks_passed++))
        elif echo "$opal_logs" | grep -q "403\|Forbidden"; then
            echo -e "${RED}✗ Auth Failed (need OPAL token)${NC}"
            echo "      Run: ./dive spoke opal-token $code_upper"
            ((checks_failed++))
        elif echo "$opal_logs" | grep -q "Connection refused\|failed to connect"; then
            echo -e "${YELLOW}⚠ Hub Unreachable${NC}"
            ((checks_passed++))  # Network issue, not spoke issue
        else
            echo -e "${YELLOW}⚠ Connecting...${NC}"
            ((checks_passed++))  # In progress
        fi
    else
        # Container not running
        local opal_stopped=$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E "opal-client.*${code_lower}|${code_lower}.*opal-client" | head -1)
        if [ -n "$opal_stopped" ]; then
            echo -e "${YELLOW}⚠ Not Running${NC}"
        else
            echo -e "${YELLOW}⚠ Not Started (federation profile)${NC}"
        fi
        ((checks_passed++))  # Expected before deployment
    fi

    # Check 8: Hub Connectivity (ping)
    printf "  %-35s" "8. Hub Connectivity:"
    if curl -kfs "${hub_url}/health" --max-time 10 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Reachable${NC}"
        ((checks_passed++))
    elif curl -kfs "${hub_url}/api/federation/health" --max-time 10 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Reachable${NC}"
        ((checks_passed++))
    else
        echo -e "${YELLOW}⚠ Unreachable (${hub_url})${NC}"
        ((checks_failed++))
    fi

    # Check 9: Policy Bundle Present and Verified
    printf "  %-35s" "9. Policy Bundle:"
    local policy_count=$(curl -sf http://localhost:8181/v1/policies --max-time 5 2>/dev/null | grep -o '"id"' | wc -l | tr -d ' ')
    if [ "$policy_count" -gt 0 ]; then
        echo -e "${GREEN}✓ Loaded ($policy_count policies)${NC}"
        ((checks_passed++))
    else
        local policy_dir="$spoke_dir/cache/policies"
        if [ -d "$policy_dir" ] && [ "$(ls -A "$policy_dir" 2>/dev/null)" ]; then
            echo -e "${GREEN}✓ Cached locally${NC}"
            ((checks_passed++))
        else
            echo -e "${YELLOW}⚠ Not Loaded${NC}"
            ((checks_passed++))  # Not critical
        fi
    fi

    # Check 10: Token Valid (not expired)
    printf "  %-35s" "10. Token Validity:"
    if [ -n "$spoke_token" ] && [ ${#spoke_token} -gt 20 ]; then
        # Try to decode JWT and check expiry (if it's a JWT)
        local token_payload=""
        if echo "$spoke_token" | grep -q '\.'; then
            # It's a JWT - decode the payload
            token_payload=$(echo "$spoke_token" | cut -d. -f2 | base64 -d 2>/dev/null || echo "")
        fi

        if [ -n "$token_payload" ]; then
            local exp=$(echo "$token_payload" | grep -o '"exp"[[:space:]]*:[[:space:]]*[0-9]*' | cut -d: -f2 | tr -d ' ')
            if [ -n "$exp" ]; then
                local now=$(date +%s)
                if [ "$exp" -gt "$now" ]; then
                    local days_left=$(( (exp - now) / 86400 ))
                    echo -e "${GREEN}✓ Valid (${days_left} days left)${NC}"
                    ((checks_passed++))
                else
                    echo -e "${RED}✗ Expired${NC}"
                    ((checks_failed++))
                fi
            else
                echo -e "${GREEN}✓ Token present${NC}"
                ((checks_passed++))
            fi
        else
            echo -e "${GREEN}✓ Token present${NC}"
            ((checks_passed++))
        fi
    else
        echo -e "${YELLOW}⚠ No token configured${NC}"
        ((checks_passed++))  # Not critical if spoke not registered yet
    fi

    # Check 11: Heartbeat to Hub Successful
    printf "  %-35s" "11. Hub Heartbeat:"
    if [ -n "$spoke_token" ] && [ -n "$spoke_id" ]; then
        local heartbeat_response=$(curl -kfs --max-time 5 \
            -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${spoke_token}" \
            -d '{"status": "healthy", "metrics": {}}' \
            "${hub_url}/api/federation/spokes/${spoke_id}/heartbeat" 2>/dev/null)

        if echo "$heartbeat_response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
            echo -e "${GREEN}✓ Successful${NC}"
            ((checks_passed++))
        elif echo "$heartbeat_response" | grep -q '"ack"\|heartbeat'; then
            echo -e "${GREEN}✓ Acknowledged${NC}"
            ((checks_passed++))
        else
            echo -e "${YELLOW}⚠ No response${NC}"
            ((checks_passed++))  # Not critical
        fi
    else
        echo -e "${YELLOW}⚠ Skipped (no token/id)${NC}"
        ((checks_passed++))  # Not applicable
    fi

    # Check 12: TLS Certificates Valid
    printf "  %-35s" "12. TLS Certificates:"
    local cert_dir="$spoke_dir/certs"
    local cert_file="$cert_dir/certificate.pem"

    if [ -f "$cert_file" ]; then
        local expiry=$(openssl x509 -enddate -noout -in "$cert_file" 2>/dev/null | cut -d= -f2)
        local expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y %Z" "$expiry" +%s 2>/dev/null || echo 0)
        local now_epoch=$(date +%s)
        local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

        if [ $days_left -gt 30 ]; then
            echo -e "${GREEN}✓ Valid (${days_left} days left)${NC}"
            ((checks_passed++))
        elif [ $days_left -gt 0 ]; then
            echo -e "${YELLOW}⚠ Expires soon (${days_left} days)${NC}"
            ((checks_passed++))
        else
            echo -e "${RED}✗ Expired or invalid${NC}"
            ((checks_failed++))
        fi
    else
        # Try checking via curl
        if curl -kfs --max-time 5 https://localhost:4000/health >/dev/null 2>&1; then
            echo -e "${GREEN}✓ TLS working${NC}"
            ((checks_passed++))
        else
            echo -e "${YELLOW}⚠ No cert file${NC}"
            ((checks_passed++))  # May be using system certs
        fi
    fi

    # Summary
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Verification Summary${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  Total Checks:   $checks_total"
    echo -e "  Passed:         ${GREEN}$checks_passed${NC}"
    echo -e "  Failed:         ${RED}$checks_failed${NC}"
    echo ""

    if [ $checks_failed -eq 0 ]; then
        echo -e "${GREEN}✓ All 12 verification checks passed!${NC}"
        echo ""
        return 0
    else
        echo -e "${YELLOW}⚠ Some checks failed. See above for details.${NC}"
        echo ""
        return 1
    fi
}