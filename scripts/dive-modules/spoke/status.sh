#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Status Sub-Module
# =============================================================================
# Commands: status, health, verify, logs, audit-status
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-07
# =============================================================================

# =============================================================================
# SPOKE STATUS DISPLAY
# =============================================================================

spoke_status() {
    ensure_dive_root
    local instance_code="${1:-}"

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo ""
        echo "Usage: ./dive spoke status CODE"
        echo ""
        echo "Examples:"
        echo "  ./dive spoke status FRA"
        echo "  ./dive spoke status DEU"
        return 1
    fi

    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local config_file="$spoke_dir/config.json"

    print_header
    echo -e "${BOLD}Spoke Federation Status:${NC} $(upper "$instance_code")"
    echo ""

    if [ ! -f "$config_file" ]; then
        echo -e "  Status: ${RED}Not Initialized${NC}"
        echo ""
        echo "  Run: ./dive spoke init $instance_code <NAME>"
        return 0
    fi

    # Parse config
    local spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local instance_code_config=$(grep -o '"instanceCode"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local name=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4)
    local status=$(grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4)
    local created=$(grep -o '"createdAt"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4)

    # Get Hub URL from .env file (FIX 2026-01-27: was unbound variable)
    local hub_url="<not configured>"
    if [ -f "$spoke_dir/.env" ]; then
        hub_url=$(grep "^HUB_URL=" "$spoke_dir/.env" 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'")
        hub_url="${hub_url:-<not configured>}"
    fi

    # Status color
    local status_color="$YELLOW"
    case "$status" in
        approved) status_color="$GREEN" ;;
        suspended|revoked) status_color="$RED" ;;
        pending) status_color="$YELLOW" ;;
    esac

    echo -e "${CYAN}Identity:${NC}"
    echo "  Spoke ID:        $spoke_id"
    echo "  Instance Code:   $instance_code_config"
    echo "  Name:            $name"
    echo "  Created:         $created"
    echo ""

    echo -e "${CYAN}Federation:${NC}"
    echo -e "  Status:          ${status_color}${status:-unregistered}${NC}"
    echo "  Hub URL:         $hub_url"

    # Check token
    if [ -f "$spoke_dir/.env" ] && grep -q "SPOKE_OPAL_TOKEN" "$spoke_dir/.env"; then
        local token_set=$(grep "SPOKE_OPAL_TOKEN" "$spoke_dir/.env" | cut -d= -f2)
        if [ -n "$token_set" ] && [ "$token_set" != "" ]; then
            echo -e "  Token:           ${GREEN}Configured${NC}"
        else
            echo -e "  Token:           ${YELLOW}Not Set${NC}"
        fi
    else
        echo -e "  Token:           ${YELLOW}Not Set${NC}"
    fi

    # Check certificates
    echo ""
    echo -e "${CYAN}Certificates:${NC}"
    if [ -f "$spoke_dir/certs/spoke.crt" ]; then
        local cert_expiry=$(openssl x509 -in "$spoke_dir/certs/spoke.crt" -noout -enddate 2>/dev/null | cut -d= -f2)
        local fingerprint=$(openssl x509 -in "$spoke_dir/certs/spoke.crt" -noout -fingerprint -sha256 2>/dev/null | cut -d= -f2 | head -c 23)
        echo -e "  Certificate:     ${GREEN}Present${NC}"
        echo "  Expires:         $cert_expiry"
        echo "  Fingerprint:     ${fingerprint}..."
    else
        echo -e "  Certificate:     ${YELLOW}Not Generated${NC}"
        echo "  Run: ./dive spoke generate-certs"
    fi

    echo ""
}

# =============================================================================
# SPOKE HEALTH CHECKS
# =============================================================================

spoke_health() {
    local instance_code="${1:-}"

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo ""
        echo "Usage: ./dive spoke health CODE"
        echo ""
        echo "Examples:"
        echo "  ./dive spoke health FRA"
        echo "  ./dive spoke health DEU"
        return 1
    fi

    ensure_dive_root
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}Spoke Service Health:${NC} $(upper "$instance_code")"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would check health of all spoke services"
        return 0
    fi

    # Get actual ports from running containers (more reliable than calculations)
    local keycloak_port backend_port opa_port kas_port frontend_port

    # Extract ports from running containers
    keycloak_port=$(docker port "dive-spoke-${code_lower}-keycloak" 8443/tcp 2>/dev/null | cut -d: -f2 || echo "8444")
    backend_port=$(docker port "dive-spoke-${code_lower}-backend" 4000/tcp 2>/dev/null | cut -d: -f2 || echo "4001")
    opa_port=$(docker port "dive-spoke-${code_lower}-opa" 8181/tcp 2>/dev/null | cut -d: -f2 || echo "9101")
    kas_port=$(docker port "dive-spoke-${code_lower}-kas" 8080/tcp 2>/dev/null | cut -d: -f2 || echo "10001")
    frontend_port=$(docker port "dive-spoke-${code_lower}-frontend" 3000/tcp 2>/dev/null | cut -d: -f2 || echo "3001")


    # Define services to check
    # Format: name:protocol:port/path
    # OPA uses HTTP internally (no TLS), all others use HTTPS
    local services=(
        "OPA:http:${opa_port}/health"
        "Backend:https:${backend_port}/health"
        "Keycloak:https:${keycloak_port}/realms/dive-v3-broker-${code_lower}"
        "KAS:https:${kas_port}/health"
        "Frontend:https:${frontend_port}/api/health"
    )
    local all_healthy=true

    echo -e "${CYAN}Services:${NC}"

    for svc in "${services[@]}"; do
        local name="${svc%%:*}"
        local protocol="${svc#*:}"
        local protocol="${protocol%%:*}"
        local endpoint="${svc#*:*:}"
        local url="${protocol}://localhost:${endpoint}"

        # First check Docker health status (most reliable)
        local container_name="dive-spoke-${code_lower}-$(echo "$name" | tr '[:upper:]' '[:lower:]')"
        local docker_health=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "")

        if [ "$docker_health" = "healthy" ]; then
            printf "  %-14s ${GREEN}✓ Healthy${NC}\n" "$name:"
            continue
        fi

        # Fallback to HTTP health check
        local status_code=$(curl -k -s -o /dev/null -w '%{http_code}' "$url" --max-time 5 2>/dev/null || echo "000")

        if [ "$status_code" = "200" ] || [ "$status_code" = "204" ]; then
            printf "  %-14s ${GREEN}✓ Healthy${NC}\n" "$name:"
        else
            printf "  %-14s ${RED}✗ Unhealthy${NC} (HTTP $status_code)\n" "$name:"
            all_healthy=false
        fi
    done

    # Check MongoDB
    printf "  %-14s " "MongoDB:"
    if docker exec "dive-spoke-${code_lower}-mongodb" mongosh --quiet --eval "db.adminCommand('ping')" 2>/dev/null | grep -q "ok"; then
        echo -e "${GREEN}✓ Healthy${NC}"
    else
        echo -e "${YELLOW}⚠ Not Running${NC}"
    fi

    # Check Redis
    printf "  %-14s " "Redis:"
    # Check if Redis container is running first
    if docker ps --format '{{.Names}}' | grep -q "^dive-spoke-${code_lower}-redis$"; then
        # Container is running, try to ping Redis
        if docker exec "dive-spoke-${code_lower}-redis" redis-cli ping 2>/dev/null | grep -q "PONG"; then
            echo -e "${GREEN}✓ Healthy${NC}"
        else
            # Try with auth if available
            local redis_password
            redis_password=$(docker exec "dive-spoke-${code_lower}-redis" printenv REDIS_PASSWORD_EST 2>/dev/null || echo "")
            if [ -n "$redis_password" ] && docker exec "dive-spoke-${code_lower}-redis" redis-cli -a "$redis_password" ping 2>/dev/null | grep -q "PONG"; then
                echo -e "${GREEN}✓ Healthy${NC}"
            else
                echo -e "${YELLOW}⚠ Auth Issue${NC}"
            fi
        fi
    else
        echo -e "${YELLOW}⚠ Not Running${NC}"
    fi

    echo ""

    # Overall status
    if [ "$all_healthy" = true ]; then
        echo -e "${GREEN}✓ All services healthy${NC}"
    else
        echo -e "${YELLOW}⚠ Some services unhealthy${NC}"
    fi
    echo ""
}

# =============================================================================
# SPOKE VERIFICATION (12-POINT CHECK)
# =============================================================================


# =============================================================================
# SPOKE LOGS VIEWING
# =============================================================================

spoke_logs() {
    local instance_code="${1:-}"
    local service="${2:-}"

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo ""
        echo "Usage: ./dive spoke logs CODE [SERVICE]"
        echo ""
        echo "Examples:"
        echo "  ./dive spoke logs FRA backend"
        echo "  ./dive spoke logs DEU keycloak"
        echo "  ./dive spoke logs GBR postgres"
        return 1
    fi

    ensure_dive_root
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    if [ ! -f "$spoke_dir/docker-compose.yml" ]; then
        log_error "Spoke not found: $instance_code"
        return 1
    fi

    export COMPOSE_PROJECT_NAME="dive-spoke-${code_lower}"
    cd "$spoke_dir" || return 1

    if [ -n "$service" ]; then
        # Service names in docker-compose are: {service}-{code_lower} (e.g., "opal-client-fra")
        local compose_service_name="${service}-${code_lower}"
        local container_name="dive-spoke-${code_lower}-${service}"
        
        # First, try docker compose logs (works for services defined in compose file)
        # Check if service exists in compose file first
        if docker compose config --services 2>/dev/null | grep -q "^${compose_service_name}$"; then
            docker compose logs -f "$compose_service_name" 2>&1
            return $?
        fi
        
        # Fallback: Try direct container logs (works for both running and stopped containers)
        if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${container_name}$"; then
            docker logs -f "$container_name" 2>&1
            return $?
        fi
        
        # If all else fails, show helpful error
        log_error "Service '$service' not found for spoke $code_upper"
        log_info "Available services: postgres, mongodb, redis, keycloak, opa, opal-client, backend, kas, frontend"
        log_info "Note: Use service name without instance suffix (e.g., 'opal-client' not 'opal-client-fra')"
        return 1
    else
        docker compose logs -f 2>&1
    fi
}

# =============================================================================
# SPOKE AUDIT STATUS (PLACEHOLDER)
# =============================================================================

spoke_audit_status() {
    local instance_code="${1:-$INSTANCE}"

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo ""
        echo "Usage: ./dive spoke audit-status CODE"
        echo ""
        echo "Examples:"
        echo "  ./dive spoke audit-status FRA"
        echo "  ./dive spoke audit-status DEU"
        return 1
    fi

    ensure_dive_root
    local code_lower=$(lower "$instance_code")

    print_header
    echo -e "${BOLD}Spoke Audit Queue Status:${NC} $(upper "$instance_code")"
    echo ""

    # TODO: Implement actual audit queue monitoring
    # This would check:
    # - Audit log file size
    # - Recent audit events
    # - Queue depth
    # - Processing rate

    echo -e "${YELLOW}⚠ Audit status monitoring not yet implemented${NC}"
    echo ""
    echo "This feature will be available in Phase 6."
    echo "It will monitor audit queue metrics and processing status."
    echo ""
}