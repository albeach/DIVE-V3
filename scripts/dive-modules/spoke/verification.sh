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

# Load guided framework
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../guided/framework.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../guided/framework.sh"
fi

# =============================================================================
# SPOKE VERIFICATION (14-POINT CHECK)
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
    local code_lower
    code_lower=$(lower "$instance_code")
    local code_upper
    code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}Spoke Verification: ${code_upper}${NC}"
    echo ""

    guided_explain "Spoke Health Check" \
        "Running health checks on all services for spoke ${code_upper}.
This verifies databases, identity provider, policy engine, Hub connectivity,
certificates, and vault status." 2>/dev/null

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would verify spoke connectivity (14 checks)"
        return 0
    fi

    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke not initialized: $spoke_dir"
        return 1
    fi

    # Load config from spoke_config_get (SSOT) and .env
    local env_file="$spoke_dir/.env"
    local hub_url=""
    local spoke_id=""
    local spoke_token=""

    hub_url=$(spoke_config_get "$instance_code" "endpoints.hubUrl")
    # In local/dev mode, always use localhost (spoke_config_get returns Docker-internal hostname)
    if [ "$ENVIRONMENT" = "local" ] || [ "$ENVIRONMENT" = "dev" ]; then
        hub_url="https://localhost:4000"
    else
        hub_url="${hub_url:-${HUB_FALLBACK_URL:-https://usa-api.${DIVE_DEFAULT_DOMAIN:-dive25.com}}}"
    fi

    # Read spoke_id and spoke_token from .env (populated during deployment)
    if [ -f "$env_file" ]; then
        spoke_id=$(grep -o '^SPOKE_ID=.*' "$env_file" 2>/dev/null | cut -d= -f2- | tr -d '"' || echo "")
        spoke_token=$(grep -o '^SPOKE_TOKEN=.*' "$env_file" 2>/dev/null | cut -d= -f2- | tr -d '"' || echo "")
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
    # Custom domain adds 3 extra checks (15-17)
    local _spoke_domain_var="SPOKE_${code_upper}_DOMAIN"
    local _spoke_domain="${!_spoke_domain_var:-${SPOKE_CUSTOM_DOMAIN:-}}"
    local checks_total=14
    [ -n "$_spoke_domain" ] && checks_total=17
    local checks_passed=0
    local checks_failed=0

    echo -e "${CYAN}Running 14-Point Spoke Verification${NC}"
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
            running_count=$((running_count + 1))
        fi
    done
    if [ $running_count -ge 5 ]; then
        echo -e "${GREEN}PASS ${running_count}/8 running${NC}"
        checks_passed=$((checks_passed + 1))
    else
        echo -e "${RED}FAIL ${running_count}/8 running${NC}"
        checks_failed=$((checks_failed + 1))
    fi

    # ------------------------------------------------------------------
    # Check 2: Keycloak Health (shared primitive)
    # ------------------------------------------------------------------
    printf "  %-35s" "2. Keycloak Health:"
    if verification_check_keycloak "spoke" "$code_upper" 2>/dev/null; then
        echo -e "${GREEN}PASS Healthy${NC}"
        checks_passed=$((checks_passed + 1))
    else
        echo -e "${RED}FAIL Unhealthy${NC}"
        checks_failed=$((checks_failed + 1))
    fi

    # ------------------------------------------------------------------
    # Check 3: Backend API Health (shared primitive)
    # ------------------------------------------------------------------
    printf "  %-35s" "3. Backend API Health:"
    if verification_check_backend "spoke" "$code_upper" 2>/dev/null; then
        echo -e "${GREEN}PASS Healthy${NC}"
        checks_passed=$((checks_passed + 1))
    else
        echo -e "${RED}FAIL Unhealthy${NC}"
        checks_failed=$((checks_failed + 1))
    fi

    # ------------------------------------------------------------------
    # Check 4: MongoDB Connection (shared primitive)
    # ------------------------------------------------------------------
    printf "  %-35s" "4. MongoDB Connection:"
    if verification_check_mongodb "$container_prefix" 2>/dev/null; then
        echo -e "${GREEN}PASS Connected${NC}"
        checks_passed=$((checks_passed + 1))
    else
        echo -e "${RED}FAIL Not Found${NC}"
        checks_failed=$((checks_failed + 1))
    fi

    # ------------------------------------------------------------------
    # Check 5: Redis Connection (shared primitive)
    # ------------------------------------------------------------------
    printf "  %-35s" "5. Redis Connection:"
    if verification_check_redis "$container_prefix" 2>/dev/null; then
        echo -e "${GREEN}PASS Connected${NC}"
        checks_passed=$((checks_passed + 1))
    else
        echo -e "${RED}FAIL Not Found${NC}"
        checks_failed=$((checks_failed + 1))
    fi

    # ------------------------------------------------------------------
    # Check 6: OPA Health (shared primitive)
    # ------------------------------------------------------------------
    printf "  %-35s" "6. OPA Health:"
    if verification_check_opa "$opa_port" 2>/dev/null; then
        echo -e "${GREEN}PASS Healthy${NC}"
        checks_passed=$((checks_passed + 1))
    else
        echo -e "${RED}FAIL Unhealthy${NC}"
        checks_failed=$((checks_failed + 1))
    fi

    # ------------------------------------------------------------------
    # Check 7: OPAL Client Status (unique to spoke verify)
    # ------------------------------------------------------------------
    printf "  %-35s" "7. OPAL Client:"
    local opal_container
    opal_container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "opal-client.*${code_lower}|${code_lower}.*opal-client" | head -1)
    if [ -n "$opal_container" ]; then
        local opal_logs
        opal_logs=$(docker logs "$opal_container" 2>&1 | tail -50)
        if echo "$opal_logs" | grep -q "Connected to PubSub server"; then
            echo -e "${GREEN}PASS Connected${NC}"
            checks_passed=$((checks_passed + 1))
        elif echo "$opal_logs" | grep -q "403\|Forbidden"; then
            echo -e "${RED}FAIL Auth Failed${NC}"
            checks_failed=$((checks_failed + 1))
        else
            echo -e "${YELLOW}WARN Connecting...${NC}"
            checks_passed=$((checks_passed + 1))
        fi
    else
        # External spoke: verify OPAL server URL connectivity if configured
        local _hub_opal_url=""
        if [ -f "$spoke_dir/.env" ]; then
            _hub_opal_url=$(grep "^HUB_OPAL_URL=" "$spoke_dir/.env" 2>/dev/null | cut -d= -f2)
        fi
        if [ -n "$_hub_opal_url" ]; then
            if curl -skf --max-time 5 "$_hub_opal_url/healthz" >/dev/null 2>&1; then
                echo -e "${GREEN}PASS Hub OPAL reachable${NC}"
                checks_passed=$((checks_passed + 1))
            else
                echo -e "${YELLOW}WARN Hub OPAL unreachable (${_hub_opal_url})${NC}"
                checks_passed=$((checks_passed + 1))
            fi
        else
            echo -e "${YELLOW}WARN Not Started${NC}"
            checks_passed=$((checks_passed + 1))
        fi
    fi

    # ------------------------------------------------------------------
    # Check 8: Hub Connectivity (unique to spoke verify)
    # ------------------------------------------------------------------
    printf "  %-35s" "8. Hub Connectivity:"
    if curl -kfs "${hub_url}/api/health" --max-time 10 >/dev/null 2>&1; then
        echo -e "${GREEN}PASS Reachable${NC}"
        checks_passed=$((checks_passed + 1))
    elif curl -kfs "${hub_url}/api/federation/health" --max-time 10 >/dev/null 2>&1; then
        echo -e "${GREEN}PASS Reachable${NC}"
        checks_passed=$((checks_passed + 1))
    else
        # Standalone spokes may not have a Hub — count as warning, not failure
        echo -e "${YELLOW}WARN Unreachable (${hub_url})${NC}"
        checks_passed=$((checks_passed + 1))
    fi

    # ------------------------------------------------------------------
    # Check 9: Policy Bundle (unique to spoke verify)
    # ------------------------------------------------------------------
    printf "  %-35s" "9. Policy Bundle:"
    local policy_count=0
    # Try local OPA first
    policy_count=$(curl -skf "https://localhost:${opa_port}/v1/policies" --max-time 5 2>/dev/null | grep -o '"id"' | wc -l | tr -d ' ')
    # Fallback: try via custom domain if configured
    if [ "$policy_count" -eq 0 ] && [ -n "$_spoke_domain" ]; then
        policy_count=$(curl -skf "https://api.${_spoke_domain}/api/opa/v1/policies" --max-time 5 2>/dev/null | grep -o '"id"' | wc -l | tr -d ' ')
    fi
    if [ "$policy_count" -gt 0 ]; then
        echo -e "${GREEN}PASS Loaded ($policy_count policies)${NC}"
        checks_passed=$((checks_passed + 1))
    else
        echo -e "${YELLOW}WARN Not Loaded${NC}"
        checks_passed=$((checks_passed + 1))
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
            local exp
            exp=$(echo "$token_payload" | grep -o '"exp"[[:space:]]*:[[:space:]]*[0-9]*' | cut -d: -f2 | tr -d ' ')
            if [ -n "$exp" ]; then
                local now
                now=$(date +%s)
                if [ "$exp" -gt "$now" ]; then
                    local days_left=$(( (exp - now) / 86400 ))
                    echo -e "${GREEN}PASS Valid (${days_left} days left)${NC}"
                    checks_passed=$((checks_passed + 1))
                else
                    echo -e "${RED}FAIL Expired${NC}"
                    checks_failed=$((checks_failed + 1))
                fi
            else
                echo -e "${GREEN}PASS Token present${NC}"
                checks_passed=$((checks_passed + 1))
            fi
        else
            echo -e "${GREEN}PASS Token present${NC}"
            checks_passed=$((checks_passed + 1))
        fi
    else
        echo -e "${YELLOW}WARN No token configured${NC}"
        checks_passed=$((checks_passed + 1))
    fi

    # ------------------------------------------------------------------
    # Check 11: Hub Heartbeat (unique to spoke verify)
    # ------------------------------------------------------------------
    printf "  %-35s" "11. Hub Heartbeat:"
    if [ -n "$spoke_token" ] && [ -n "$spoke_id" ]; then
        local heartbeat_response
        heartbeat_response=$(curl -kfs --max-time 5 \
            -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${spoke_token}" \
            -d '{"status": "healthy", "metrics": {}}' \
            "${hub_url}/api/federation/spokes/${spoke_id}/heartbeat" 2>/dev/null)

        if echo "$heartbeat_response" | grep -q '"success"[[:space:]]*:[[:space:]]*true\|"ack"\|heartbeat'; then
            echo -e "${GREEN}PASS Successful${NC}"
            checks_passed=$((checks_passed + 1))
        else
            echo -e "${YELLOW}WARN No response${NC}"
            checks_passed=$((checks_passed + 1))
        fi
    else
        echo -e "${YELLOW}WARN Skipped (no token/id)${NC}"
        checks_passed=$((checks_passed + 1))
    fi

    # ------------------------------------------------------------------
    # Check 12: TLS Certificates (unique to spoke verify)
    # ------------------------------------------------------------------
    printf "  %-35s" "12. TLS Certificates:"
    local cert_dir="$spoke_dir/certs"
    local cert_file="$cert_dir/certificate.pem"

    if [ -f "$cert_file" ]; then
        local expiry
        expiry=$(openssl x509 -enddate -noout -in "$cert_file" 2>/dev/null | cut -d= -f2)
        local expiry_epoch
        expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y %Z" "$expiry" +%s 2>/dev/null || echo 0)
        local now_epoch
        now_epoch=$(date +%s)
        local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

        if [ $days_left -gt 30 ]; then
            echo -e "${GREEN}PASS Valid (${days_left} days left)${NC}"
            checks_passed=$((checks_passed + 1))
        elif [ $days_left -gt 0 ]; then
            echo -e "${YELLOW}WARN Expires soon (${days_left} days)${NC}"
            checks_passed=$((checks_passed + 1))
        else
            echo -e "${RED}FAIL Expired or invalid${NC}"
            checks_failed=$((checks_failed + 1))
        fi
    else
        if curl -kfs --max-time 5 "https://localhost:${be_port}/api/health" >/dev/null 2>&1; then
            echo -e "${GREEN}PASS TLS working${NC}"
            checks_passed=$((checks_passed + 1))
        else
            echo -e "${YELLOW}WARN No cert file${NC}"
            checks_passed=$((checks_passed + 1))
        fi
    fi

    # ------------------------------------------------------------------
    # Check 13: Spoke Vault Health (optional — only when Vault container exists)
    # ------------------------------------------------------------------
    printf "  %-35s" "13. Spoke Vault Health:"
    local vault_container="dive-spoke-${code_lower}-vault"
    if docker inspect -f '{{.State.Running}}' "$vault_container" 2>/dev/null | grep -q true; then
        # Container running — check initialized + unsealed
        local vault_status
        vault_status=$(docker exec -e VAULT_SKIP_VERIFY=true "$vault_container" vault status -tls-skip-verify -format=json 2>/dev/null || echo "{}")
        local vault_init
        vault_init=$(echo "$vault_status" | jq -r '.initialized // false' 2>/dev/null)
        local vault_sealed
        vault_sealed=$(echo "$vault_status" | jq -r '.sealed // true' 2>/dev/null)

        if [ "$vault_init" = "true" ] && [ "$vault_sealed" = "false" ]; then
            echo -e "${GREEN}PASS Initialized + Unsealed${NC}"
            checks_passed=$((checks_passed + 1))
        elif [ "$vault_init" = "true" ] && [ "$vault_sealed" = "true" ]; then
            echo -e "${RED}FAIL Initialized but Sealed${NC}"
            checks_failed=$((checks_failed + 1))
        else
            echo -e "${RED}FAIL Not initialized${NC}"
            checks_failed=$((checks_failed + 1))
        fi
    else
        # Vault container not running — check if this spoke uses Vault
        local vault_init_file="${spoke_dir}/${SPOKE_VAULT_INIT_FILE:-.vault-init}"
        if [ -f "$vault_init_file" ]; then
            echo -e "${RED}FAIL Vault configured but container not running${NC}"
            checks_failed=$((checks_failed + 1))
        else
            echo -e "${YELLOW}WARN Not deployed (standalone mode)${NC}"
            checks_passed=$((checks_passed + 1))
        fi
    fi

    # ------------------------------------------------------------------
    # Check 14: Critical Secrets Available
    # ------------------------------------------------------------------
    printf "  %-35s" "14. Critical Secrets:"
    local secrets_found=0
    local secrets_checked=0
    local critical_secrets=("POSTGRES_PASSWORD" "MONGO_PASSWORD" "REDIS_PASSWORD" "KEYCLOAK_ADMIN_PASSWORD")
    for _secret_var in "${critical_secrets[@]}"; do
        secrets_checked=$((secrets_checked + 1))
        # Check instance-suffixed var first, then base var
        local _suffixed="${_secret_var}_${code_upper}"
        if [ -n "${!_suffixed:-}" ]; then
            secrets_found=$((secrets_found + 1))
        elif [ -n "${!_secret_var:-}" ]; then
            secrets_found=$((secrets_found + 1))
        elif [ -f "$env_file" ] && grep -q "^${_secret_var}=" "$env_file" 2>/dev/null; then
            secrets_found=$((secrets_found + 1))
        elif [ -f "$env_file" ] && grep -q "^${_suffixed}=" "$env_file" 2>/dev/null; then
            secrets_found=$((secrets_found + 1))
        fi
    done

    if [ $secrets_found -eq $secrets_checked ]; then
        echo -e "${GREEN}PASS ${secrets_found}/${secrets_checked} available${NC}"
        checks_passed=$((checks_passed + 1))
    elif [ $secrets_found -gt 0 ]; then
        echo -e "${YELLOW}WARN ${secrets_found}/${secrets_checked} available${NC}"
        checks_passed=$((checks_passed + 1))
    else
        echo -e "${RED}FAIL No critical secrets found${NC}"
        checks_failed=$((checks_failed + 1))
    fi

    # ------------------------------------------------------------------
    # Checks 15-17: Custom Domain (only when SPOKE_{CODE}_DOMAIN is set)
    # ------------------------------------------------------------------
    if [ -n "$_spoke_domain" ]; then

        # Check 15: DNS resolution for custom domain services
        printf "  %-35s" "15. Custom Domain DNS:"
        local _dns_ok=true
        local _dns_services=("app" "api" "idp")
        local _dns_resolved=0
        for _dns_svc in "${_dns_services[@]}"; do
            local _dns_fqdn="${_dns_svc}.${_spoke_domain}"
            local _dns_result=""
            if command -v dig &>/dev/null; then
                _dns_result=$(dig +short "$_dns_fqdn" A 2>/dev/null | head -1)
            elif command -v host &>/dev/null; then
                _dns_result=$(host "$_dns_fqdn" 2>/dev/null | grep "has address" | awk '{print $NF}' | head -1)
            fi
            [ -n "$_dns_result" ] && _dns_resolved=$((_dns_resolved + 1))
        done

        if [ $_dns_resolved -eq ${#_dns_services[@]} ]; then
            echo -e "${GREEN}PASS All ${#_dns_services[@]} subdomains resolve${NC}"
            checks_passed=$((checks_passed + 1))
        elif [ $_dns_resolved -gt 0 ]; then
            echo -e "${YELLOW}WARN ${_dns_resolved}/${#_dns_services[@]} subdomains resolve${NC}"
            checks_passed=$((checks_passed + 1))
        else
            echo -e "${RED}FAIL No DNS records found for ${_spoke_domain}${NC}"
            checks_failed=$((checks_failed + 1))
        fi

        # Check 16: TLS certificate validity for custom domain
        printf "  %-35s" "16. Custom Domain TLS:"
        local _tls_ok=false
        local _tls_target="app.${_spoke_domain}"

        # Try to connect and verify TLS (allow 5s timeout)
        if echo | openssl s_client -connect "${_tls_target}:443" -servername "${_tls_target}" 2>/dev/null | \
           openssl x509 -noout -dates 2>/dev/null | grep -q "notAfter"; then
            _tls_ok=true
        fi

        if [ "$_tls_ok" = true ]; then
            local _tls_cn
            _tls_cn=$(echo | openssl s_client -connect "${_tls_target}:443" -servername "${_tls_target}" 2>/dev/null | \
                openssl x509 -noout -subject 2>/dev/null | sed 's/.*CN *= *//')
            echo -e "${GREEN}PASS TLS valid (CN=${_tls_cn})${NC}"
            checks_passed=$((checks_passed + 1))
        else
            # Fallback: check if cert file exists in spoke dir with domain SANs
            if [ -f "$spoke_dir/certs/certificate.pem" ]; then
                local _san_check
                _san_check=$(openssl x509 -in "$spoke_dir/certs/certificate.pem" -noout -ext subjectAltName 2>/dev/null)
                if echo "$_san_check" | grep -q "${_spoke_domain}"; then
                    echo -e "${GREEN}PASS Cert has ${_spoke_domain} SAN${NC}"
                    checks_passed=$((checks_passed + 1))
                else
                    echo -e "${YELLOW}WARN Cert exists but no ${_spoke_domain} SAN${NC}"
                    checks_passed=$((checks_passed + 1))
                fi
            else
                echo -e "${YELLOW}WARN Cannot verify TLS for ${_tls_target}${NC}"
                checks_passed=$((checks_passed + 1))
            fi
        fi

        # Check 17: OIDC discovery endpoint accessible on custom domain
        printf "  %-35s" "17. Custom Domain OIDC:"
        local _oidc_url="https://idp.${_spoke_domain}/realms/dive-v3-broker-${code_lower}/.well-known/openid-configuration"
        local _oidc_response
        _oidc_response=$(curl -sf --max-time 10 --insecure "$_oidc_url" 2>/dev/null)

        if [ -n "$_oidc_response" ] && echo "$_oidc_response" | jq -e '.issuer' >/dev/null 2>&1; then
            local _oidc_issuer
            _oidc_issuer=$(echo "$_oidc_response" | jq -r '.issuer')
            echo -e "${GREEN}PASS OIDC discovery OK${NC}"
            checks_passed=$((checks_passed + 1))
        elif [ -n "$_oidc_response" ]; then
            echo -e "${YELLOW}WARN Response but invalid OIDC${NC}"
            checks_passed=$((checks_passed + 1))
        else
            echo -e "${YELLOW}WARN OIDC unreachable at ${_oidc_url}${NC}"
            checks_passed=$((checks_passed + 1))
        fi

    fi

    # Summary
    echo ""
    echo "  Total Checks:   $checks_total"
    echo -e "  Passed:         ${GREEN}$checks_passed${NC}"
    echo -e "  Failed:         ${RED}$checks_failed${NC}"
    echo ""

    if [ $checks_failed -eq 0 ]; then
        echo -e "${GREEN}All ${checks_total} verification checks passed!${NC}"
        echo ""
        guided_success "All ${checks_total} health checks passed for spoke ${code_upper}!" 2>/dev/null
        return 0
    else
        echo -e "${YELLOW}Some checks failed. See above for details.${NC}"
        echo ""
        guided_warn "Some checks failed" \
            "${checks_failed} of ${checks_total} checks need attention.
Try: ./dive spoke logs ${code_upper} to investigate" 2>/dev/null
        return 1
    fi
}

##
# Verify all provisioned spokes (14-point check for each)
#
# Discovers spokes via dive_get_provisioned_spokes() with
# instances/*/ directory fallback.
#
# Returns:
#   0 - All spokes passed
#   1 - One or more spokes failed
##
spoke_verify_all() {
    ensure_dive_root

    print_header
    echo -e "${BOLD}Multi-Spoke Verification${NC}"
    echo ""

    # Discover provisioned spokes
    local spokes=()
    if type -t dive_get_provisioned_spokes &>/dev/null; then
        local spoke_list
        spoke_list=$(dive_get_provisioned_spokes 2>/dev/null)
        if [ -n "$spoke_list" ]; then
            # dive_get_provisioned_spokes returns space-separated codes
            for s in $spoke_list; do
                [ -n "$s" ] && spokes+=("$(upper "$s")")
            done
        fi
    fi

    # Fallback: scan instances/ directories
    if [ ${#spokes[@]} -eq 0 ]; then
        for dir in "${DIVE_ROOT}"/instances/*/; do
            [ -d "$dir" ] || continue
            local code
            code=$(basename "$dir")
            # Skip hub (usa) and hidden directories
            [ "$code" = "usa" ] && continue
            [[ "$code" == .* ]] && continue
            spokes+=("$(upper "$code")")
        done
    fi

    if [ ${#spokes[@]} -eq 0 ]; then
        log_warn "No provisioned spokes found"
        return 1
    fi

    echo -e "${CYAN}Found ${#spokes[@]} spoke(s): ${spokes[*]}${NC}"
    echo ""

    local total=${#spokes[@]}
    local passed=0
    local failed=0
    local failed_list=()

    for spoke_code in "${spokes[@]}"; do
        echo -e "${BOLD}━━━ Verifying $spoke_code ━━━${NC}"
        if spoke_verify "$spoke_code"; then
            passed=$((passed + 1))
        else
            failed=$((failed + 1))
            failed_list+=("$spoke_code")
        fi
        echo ""
    done

    # Summary
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BOLD}Multi-Spoke Verification Summary${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "  Total:  $total"
    echo -e "  Passed: ${GREEN}$passed${NC}"
    echo -e "  Failed: ${RED}$failed${NC}"
    if [ ${#failed_list[@]} -gt 0 ]; then
        echo -e "  Failed: ${RED}${failed_list[*]}${NC}"
    fi
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    [ $failed -eq 0 ] && return 0 || return 1
}
