#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Diagnostics Module
# =============================================================================
# Extracted from status.sh (Phase 13d)
# Contains: cmd_diagnostics (deep system diagnostics with issue detection)
# =============================================================================

[ -n "${DIVE_STATUS_DIAGNOSTICS_LOADED:-}" ] && return 0

# =============================================================================
# DIAGNOSTICS COMMAND
# =============================================================================
# Phase 4 Enhanced Diagnostics with actionable insights and remediation
# =============================================================================

# Known issue patterns with severity, description, and fix commands
declare -A KNOWN_ISSUES
declare -A ISSUE_FIXES
declare -A ISSUE_SEVERITY

cmd_diagnostics() {
    echo ""
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║                    DIVE V3 Diagnostics Report                          ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    local issues_found=0
    local warnings_found=0
    local _json_output=""

    # Run status first
    cmd_status

    # =========================================================================
    # Section 1: Container Health Analysis
    # =========================================================================
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  Container Health Analysis                                             ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    local unhealthy_containers
    unhealthy_containers=$(docker ps --filter "health=unhealthy" --format "{{.Names}}" 2>/dev/null)

    if [ -n "$unhealthy_containers" ]; then
        echo -e "${CYAN}Unhealthy Containers:${NC}"
        while IFS= read -r container; do
            [ -z "$container" ] && continue
            issues_found=$((issues_found + 1))

            # Get health check details
            local health_log
            health_log=$(docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' "$container" 2>/dev/null | tail -3)
            local _exit_code
            _exit_code=$(docker inspect --format='{{range .State.Health.Log}}{{.ExitCode}}{{end}}' "$container" 2>/dev/null | tail -1)

            echo -e "  ${RED}✗${NC} $container"
            echo -e "    ${GRAY}Severity:${NC} HIGH"

            # Pattern match for known failure types
            if echo "$container" | grep -q "opal-client"; then
                echo -e "    ${GRAY}Cause:${NC} OPAL client cannot connect to hub OPAL server"
                echo -e "    ${GRAY}Fix:${NC}"
                echo "      1. Verify spoke has valid OPAL token: docker exec $container env | grep OPAL"
                echo "      2. Check hub OPAL server is healthy: docker logs dive-hub-opal-server --tail 20"
                echo "      3. Regenerate token: ./dive spoke register"
            elif echo "$container" | grep -q "redis-exporter"; then
                echo -e "    ${GRAY}Cause:${NC} Redis exporter cannot connect to Redis instance"
                echo -e "    ${GRAY}Fix:${NC}"
                echo "      1. Check network connectivity: docker exec $container ping -c1 dive-hub-redis"
                echo "      2. Verify password matches: docker logs $container --tail 10"
                echo "      3. Restart with correct password: cd docker/instances/shared && docker compose up -d"
            elif echo "$container" | grep -q "keycloak"; then
                echo -e "    ${GRAY}Cause:${NC} Keycloak startup failed (database or config issue)"
                echo -e "    ${GRAY}Fix:${NC}"
                echo "      1. Check database: docker logs ${container/keycloak/postgres} --tail 20"
                echo "      2. View Keycloak logs: docker logs $container --tail 50"
                echo "      3. Reset Keycloak: ./dive hub reset keycloak"
            elif echo "$container" | grep -q "backend"; then
                echo -e "    ${GRAY}Cause:${NC} Backend health check failed"
                echo -e "    ${GRAY}Fix:${NC}"
                echo "      1. Check backend logs: docker logs $container --tail 50"
                echo "      2. Test health endpoint: curl -ksf https://localhost:4000/health"
                echo "      3. Verify dependencies: docker logs dive-hub-mongodb --tail 20"
            else
                echo -e "    ${GRAY}Cause:${NC} Unknown (check container logs)"
                echo -e "    ${GRAY}Fix:${NC} docker logs $container --tail 50"
            fi

            if [ -n "$health_log" ]; then
                echo -e "    ${GRAY}Last Health Log:${NC}"
                echo "$health_log" | head -3 | sed 's/^/      /'
            fi
            echo ""
        done <<< "$unhealthy_containers"
    else
        echo -e "  ${GREEN}✓${NC} All containers healthy"
        echo ""
    fi

    # =========================================================================
    # Section 2: Network Connectivity Checks
    # =========================================================================
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  Network Connectivity                                                  ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Check required networks exist
    local required_networks=("dive-shared" "shared-services")
    for net in "${required_networks[@]}"; do
        if docker network ls --format '{{.Name}}' 2>/dev/null | grep -q "^${net}$"; then
            local container_count
            container_count=$(docker network inspect "$net" --format='{{len .Containers}}' 2>/dev/null || echo "0")
            echo -e "  ${GREEN}✓${NC} $net (${container_count} containers)"
        else
            issues_found=$((issues_found + 1))
            echo -e "  ${RED}✗${NC} $net missing"
            echo -e "    ${GRAY}Fix:${NC} docker network create $net"
        fi
    done
    echo ""

    # Cross-container DNS resolution test (hub only)
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-hub-backend"; then
        echo -e "  ${CYAN}DNS Resolution (from backend):${NC}"
        local dns_targets=("keycloak" "mongodb" "redis" "opa")
        for target in "${dns_targets[@]}"; do
            if docker exec dive-hub-backend getent hosts "$target" >/dev/null 2>&1; then
                echo -e "    ${GREEN}✓${NC} $target resolvable"
            else
                warnings_found=$((warnings_found + 1))
                echo -e "    ${YELLOW}⚠${NC} $target not resolvable"
            fi
        done
        echo ""
    fi

    # =========================================================================
    # Section 3: Secret/Credential Validation
    # =========================================================================
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  Secret/Credential Validation                                          ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Check if secrets are loaded in current shell
    local required_secrets=("KEYCLOAK_ADMIN_PASSWORD" "POSTGRES_PASSWORD" "MONGO_PASSWORD" "KEYCLOAK_CLIENT_SECRET")
    local secrets_loaded=0
    local secrets_missing=0

    for secret in "${required_secrets[@]}"; do
        if [ -n "${!secret:-}" ]; then
            secrets_loaded=$((secrets_loaded + 1))
            echo -e "  ${GREEN}✓${NC} $secret loaded"
        else
            secrets_missing=$((secrets_missing + 1))
            echo -e "  ${YELLOW}⚠${NC} $secret not in environment"
        fi
    done

    if [ "$secrets_missing" -gt 0 ]; then
        warnings_found=$((warnings_found + 1))
        echo ""
        echo -e "  ${GRAY}Secrets may be loaded via .env file or GCP Secret Manager${NC}"
        echo -e "  ${GRAY}To load: ./dive secrets load${NC}"
    fi
    echo ""

    # Check GCP Secret Manager connectivity
    if command -v gcloud >/dev/null 2>&1; then
        if gcloud secrets list --project="${GCP_PROJECT:-dive25}" --limit=1 >/dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} GCP Secret Manager accessible (project: ${GCP_PROJECT:-dive25})"
        else
            echo -e "  ${YELLOW}⚠${NC} GCP Secret Manager not accessible"
            echo -e "    ${GRAY}Fix:${NC} gcloud auth application-default login"
        fi
    else
        echo -e "  ${GRAY}ℹ${NC} gcloud CLI not installed (optional for local dev)"
    fi
    echo ""

    # =========================================================================
    # Section 4: Policy Sync Status (OPAL)
    # =========================================================================
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  Policy Sync Status                                                    ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Check OPAL server
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "opal-server"; then
        local opal_health
        opal_health=$(docker inspect --format='{{.State.Health.Status}}' dive-hub-opal-server 2>/dev/null || echo "unknown")
        if [ "$opal_health" = "healthy" ]; then
            echo -e "  ${GREEN}✓${NC} OPAL Server healthy"

            # Get connected clients count (if available)
            local client_count
            client_count=$(docker logs dive-hub-opal-server 2>&1 | grep -c "client connected" || echo "unknown")
            echo -e "    ${GRAY}Recent client connections: ${client_count}${NC}"
        else
            warnings_found=$((warnings_found + 1))
            echo -e "  ${YELLOW}⚠${NC} OPAL Server status: $opal_health"
        fi
    else
        echo -e "  ${GRAY}ℹ${NC} OPAL Server not running (hub may not be started)"
    fi

    # Check OPA policy count
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-hub-opa"; then
        local policy_count
        policy_count=$(docker exec dive-hub-opa /opa eval 'count(data.dive)' --format=json 2>/dev/null | jq -r '.result[0].expressions[0].value // "unknown"' 2>/dev/null || echo "unknown")
        if [ "$policy_count" != "unknown" ] && [ "$policy_count" -gt 0 ] 2>/dev/null; then
            echo -e "  ${GREEN}✓${NC} OPA policies loaded (${policy_count} packages in dive.*)"
        else
            warnings_found=$((warnings_found + 1))
            echo -e "  ${YELLOW}⚠${NC} OPA policy count: $policy_count"
        fi
    fi
    echo ""

    # =========================================================================
    # Section 5: Observability Status
    # =========================================================================
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  Observability Status                                                  ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Check Prometheus
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "shared-prometheus"; then
        echo -e "  ${CYAN}Prometheus:${NC}"
        local prom_targets_up=0
        local prom_targets_down=0
        local prom_targets
        prom_targets=$(curl -s http://localhost:9090/api/v1/targets 2>/dev/null)

        if [ -n "$prom_targets" ]; then
            prom_targets_up=$(echo "$prom_targets" | jq '[.data.activeTargets[] | select(.health=="up")] | length' 2>/dev/null || echo "0")
            prom_targets_down=$(echo "$prom_targets" | jq '[.data.activeTargets[] | select(.health=="down")] | length' 2>/dev/null || echo "0")

            echo -e "    ${GREEN}✓${NC} Targets UP: $prom_targets_up"
            if [ "$prom_targets_down" -gt 0 ]; then
                warnings_found=$((warnings_found + 1))
                echo -e "    ${YELLOW}⚠${NC} Targets DOWN: $prom_targets_down"
                echo -e "    ${GRAY}Check:${NC} curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.health==\"down\") | {job: .labels.job, error: .lastError}'"
            fi
        else
            echo -e "    ${YELLOW}⚠${NC} Cannot query Prometheus API"
        fi
    else
        echo -e "  ${GRAY}ℹ${NC} Prometheus not running"
    fi
    echo ""

    # Check Grafana
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "shared-grafana"; then
        local grafana_health
        grafana_health=$(curl -s http://localhost:3333/api/health 2>/dev/null | jq -r '.database // "unknown"' 2>/dev/null || echo "unknown")
        if [ "$grafana_health" = "ok" ]; then
            echo -e "  ${GREEN}✓${NC} Grafana healthy (http://localhost:3333)"

            # Count dashboards
            local dashboard_count
            dashboard_count=$(curl -s http://localhost:3333/api/search 2>/dev/null | jq 'length' 2>/dev/null || echo "0")
            echo -e "    ${GRAY}Dashboards: ${dashboard_count}${NC}"
        else
            warnings_found=$((warnings_found + 1))
            echo -e "  ${YELLOW}⚠${NC} Grafana status: $grafana_health"
        fi
    else
        echo -e "  ${GRAY}ℹ${NC} Grafana not running"
    fi
    echo ""

    # =========================================================================
    # Section 6: Known Issue Pattern Detection
    # =========================================================================
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  Known Issue Detection                                                 ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    local patterns_checked=0

    # Pattern 1: Keycloak realm not imported
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-hub-keycloak"; then
        patterns_checked=$((patterns_checked + 1))
        local realms
        realms=$(curl -ks "https://localhost:${KEYCLOAK_HTTPS_PORT:-8443}/realms/" 2>/dev/null | jq -r '.[].realm' 2>/dev/null | grep -c "dive-v3" 2>/dev/null || echo "0")
        realms=$(echo "$realms" | tr -d -c '0-9' || echo "0")
        if [ "$realms" -eq 0 ]; then
            warnings_found=$((warnings_found + 1))
            echo -e "  ${YELLOW}⚠${NC} Keycloak ${HUB_REALM:-dive-v3-broker-usa} realm may not exist"
            echo -e "    ${GRAY}Fix:${NC} ./dive hub reset keycloak"
        else
            echo -e "  ${GREEN}✓${NC} Keycloak realm(s) configured"
        fi
    fi

    # Pattern 2: Backend cannot reach MongoDB
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-hub-backend"; then
        patterns_checked=$((patterns_checked + 1))
        local backend_mongo_error
        backend_mongo_error=$(docker logs dive-hub-backend 2>&1 | tail -50 | grep -c "MongoNetworkError\|ECONNREFUSED.*27017" 2>/dev/null || echo "0")
        backend_mongo_error=$(echo "$backend_mongo_error" | tr -d -c '0-9' || echo "0")
        if [ "$backend_mongo_error" -gt 0 ]; then
            issues_found=$((issues_found + 1))
            echo -e "  ${RED}✗${NC} Backend has MongoDB connection errors"
            echo -e "    ${GRAY}Fix:${NC} docker restart dive-hub-backend"
        else
            echo -e "  ${GREEN}✓${NC} Backend-MongoDB connection OK"
        fi
    fi

    # Pattern 3: Frontend build errors
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-hub-frontend"; then
        patterns_checked=$((patterns_checked + 1))
        local fe_build_error
        fe_build_error=$(docker logs dive-hub-frontend 2>&1 | tail -100 | grep -c "Build error\|FATAL ERROR\|Cannot find module" 2>/dev/null || echo "0")
        fe_build_error=$(echo "$fe_build_error" | tr -d -c '0-9' || echo "0")
        if [ "$fe_build_error" -gt 0 ]; then
            issues_found=$((issues_found + 1))
            echo -e "  ${RED}✗${NC} Frontend has build errors"
            echo -e "    ${GRAY}Fix:${NC} docker exec dive-hub-frontend npm install && docker restart dive-hub-frontend"
        else
            echo -e "  ${GREEN}✓${NC} Frontend build OK"
        fi
    fi

    # Pattern 4: OPA policy syntax errors
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-hub-opa"; then
        patterns_checked=$((patterns_checked + 1))
        local opa_errors
        opa_errors=$(docker logs dive-hub-opa 2>&1 | tail -50 | grep -c "rego_parse_error\|rego_type_error" 2>/dev/null || echo "0")
        opa_errors=$(echo "$opa_errors" | tr -d -c '0-9' || echo "0")
        if [ "$opa_errors" -gt 0 ]; then
            issues_found=$((issues_found + 1))
            echo -e "  ${RED}✗${NC} OPA has policy syntax errors"
            echo -e "    ${GRAY}Fix:${NC} opa check policies/ && docker restart dive-hub-opa"
        else
            echo -e "  ${GREEN}✓${NC} OPA policies valid"
        fi
    fi

    # Pattern 5: Port conflicts
    patterns_checked=$((patterns_checked + 1))
    local port_conflicts=0
    for port in 3000 4000 8080 8443; do
        local listeners
        listeners=$(lsof -i ":$port" 2>/dev/null | grep -c LISTEN || echo "0")
        if [ "$listeners" -gt 1 ]; then
            port_conflicts=$((port_conflicts + 1))
        fi
    done
    if [ "$port_conflicts" -gt 0 ]; then
        warnings_found=$((warnings_found + 1))
        echo -e "  ${YELLOW}⚠${NC} Possible port conflicts detected ($port_conflicts ports)"
        echo -e "    ${GRAY}Check:${NC} lsof -i :3000 -i :4000 -i :8080 -i :8443"
    else
        echo -e "  ${GREEN}✓${NC} No port conflicts"
    fi

    # Pattern 6: Certificate expiry (SSOT: instances/hub/certs)
    patterns_checked=$((patterns_checked + 1))
    local cert_check_path="instances/hub/certs/certificate.pem"
    [ ! -f "$cert_check_path" ] && cert_check_path="keycloak/certs/certificate.pem"  # Fallback
    if [ -f "$cert_check_path" ]; then
        local cert_expiry
        cert_expiry=$(openssl x509 -enddate -noout -in "$cert_check_path" 2>/dev/null | cut -d= -f2)
        local cert_epoch
        cert_epoch=$(date -j -f "%b %d %H:%M:%S %Y %Z" "$cert_expiry" "+%s" 2>/dev/null || date -d "$cert_expiry" "+%s" 2>/dev/null || echo "0")
        local now_epoch
        now_epoch=$(date "+%s")
        local days_left=$(( (cert_epoch - now_epoch) / 86400 ))

        if [ "$days_left" -lt 7 ]; then
            warnings_found=$((warnings_found + 1))
            echo -e "  ${YELLOW}⚠${NC} TLS certificate expires in $days_left days"
            echo -e "    ${GRAY}Fix:${NC} mkcert -install && ./scripts/generate-certs.sh"
        elif [ "$days_left" -lt 30 ]; then
            echo -e "  ${GREEN}✓${NC} TLS certificate valid ($days_left days remaining)"
        else
            echo -e "  ${GREEN}✓${NC} TLS certificate valid"
        fi
    fi

    # Pattern 7: Docker disk space
    patterns_checked=$((patterns_checked + 1))
    local docker_disk
    docker_disk=$(docker system df --format '{{.Reclaimable}}' 2>/dev/null | head -1 | grep -oE '[0-9.]+GB' | grep -oE '[0-9.]+' || echo "0")
    if [ "$(echo "$docker_disk > 10" | bc 2>/dev/null || echo "0")" = "1" ]; then
        warnings_found=$((warnings_found + 1))
        echo -e "  ${YELLOW}⚠${NC} Docker has ${docker_disk}GB reclaimable space"
        echo -e "    ${GRAY}Fix:${NC} docker system prune -f"
    else
        echo -e "  ${GREEN}✓${NC} Docker disk usage OK"
    fi

    # Pattern 8: Spoke without hub registration
    patterns_checked=$((patterns_checked + 1))
    local spokes_running
    spokes_running=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "^(est|gbr|fra|deu|pol|dnk)-" | sed 's/-.*//' | sort -u)
    if [ -n "$spokes_running" ]; then
        local hub_idps
        hub_idps=$(curl -ks "https://localhost:${KEYCLOAK_HTTPS_PORT:-8443}/admin/realms/${HUB_REALM:-dive-v3-broker-usa}/identity-providers" 2>/dev/null | jq -r '.[].alias' 2>/dev/null || echo "")
        while IFS= read -r spoke; do
            [ -z "$spoke" ] && continue
            if ! echo "$hub_idps" | grep -q "${spoke}-idp"; then
                warnings_found=$((warnings_found + 1))
                echo -e "  ${YELLOW}⚠${NC} Spoke $spoke running but not registered with hub"
                echo -e "    ${GRAY}Fix:${NC} ./dive spoke register $spoke"
            fi
        done <<< "$spokes_running"
    fi
    echo -e "  ${GRAY}ℹ${NC} Checked $patterns_checked issue patterns"
    echo ""

    # =========================================================================
    # Section 7: Resource Usage
    # =========================================================================
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  Resource Usage                                                        ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null | grep -E "dive|shared|est|gbr|fra|pol|dnk|ita|tur|rou" | head -20 || echo "  Unable to get stats"
    echo ""

    # =========================================================================
    # Summary
    # =========================================================================
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  Diagnostics Summary                                                   ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    if [ "$issues_found" -eq 0 ] && [ "$warnings_found" -eq 0 ]; then
        echo -e "  ${GREEN}✅ All systems healthy - no issues detected${NC}"
    elif [ "$issues_found" -eq 0 ]; then
        echo -e "  ${YELLOW}⚠️  $warnings_found warning(s) - see above for details${NC}"
    else
        echo -e "  ${RED}❌ $issues_found critical issue(s), $warnings_found warning(s)${NC}"
        echo -e "  ${GRAY}Review issues above and apply recommended fixes${NC}"
    fi

    echo ""
    echo -e "  ${GRAY}Quick actions:${NC}"
    echo -e "    ${GRAY}• View container logs:${NC} docker logs <container> --tail 50"
    echo -e "    ${GRAY}• Restart a service:${NC}  docker restart <container>"
    echo -e "    ${GRAY}• Full reset:${NC}         ./dive nuke && ./dive up"
    echo -e "    ${GRAY}• Load secrets:${NC}       ./dive secrets load"
    echo ""

    # Return code based on issues
    if [ "$issues_found" -gt 0 ]; then
        return 2
    elif [ "$warnings_found" -gt 0 ]; then
        return 1
    fi
    return 0
}

export DIVE_STATUS_DIAGNOSTICS_LOADED=1

# sc2034-anchor
: "${ISSUE_FIXES:-}" "${ISSUE_SEVERITY:-}" "${KNOWN_ISSUES:-}"
