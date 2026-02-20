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
    local detailed=false
    
    # Parse flags
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --detailed|-d)
                detailed=true
                shift
                ;;
            -*)
                log_error "Unknown flag: $1"
                return 1
                ;;
            *)
                if [ -z "$instance_code" ]; then
                    instance_code="$1"
                fi
                shift
                ;;
        esac
    done

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo ""
        echo "Usage: ./dive spoke status CODE [--detailed]"
        echo ""
        echo "Examples:"
        echo "  ./dive spoke status FRA"
        echo "  ./dive spoke status FRA --detailed"
        echo "  ./dive spoke status DEU -d"
        return 1
    fi

    if [ "$detailed" = true ]; then
        spoke_status_detailed "$instance_code"
        return $?
    fi

    # Original simple status display
    local code_lower
    code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}Spoke Federation Status:${NC} $(upper "$instance_code")"
    echo ""

    if [ ! -d "$spoke_dir" ]; then
        echo -e "  Status: ${RED}Not Initialized${NC}"
        echo ""
        echo "  Run: ./dive spoke init $instance_code <NAME>"
        return 0
    fi

    # Parse config from spoke_config_get (SSOT)
    local spoke_id
    spoke_id=$(spoke_config_get "$instance_code" "identity.spokeId")
    local instance_code_config
    instance_code_config=$(spoke_config_get "$instance_code" "identity.instanceCode")
    local name
    name=$(spoke_config_get "$instance_code" "identity.name")
    local status=""
    local created=""

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
        local token_set
        token_set=$(grep "SPOKE_OPAL_TOKEN" "$spoke_dir/.env" | cut -d= -f2)
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
        local cert_expiry
        cert_expiry=$(openssl x509 -in "$spoke_dir/certs/spoke.crt" -noout -enddate 2>/dev/null | cut -d= -f2)
        local fingerprint
        fingerprint=$(openssl x509 -in "$spoke_dir/certs/spoke.crt" -noout -fingerprint -sha256 2>/dev/null | cut -d= -f2 | head -c 23)
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
# DETAILED STATUS (New Enhanced Diagnostic Mode)
# =============================================================================

spoke_status_detailed() {
    local instance_code="$1"
    local code_lower
    code_lower=$(lower "$instance_code")
    local code_upper
    code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║    DIVE V3 Spoke Status (Detailed) - ${code_upper}         ║${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
    echo ""

    # Check if spoke exists
    if [ ! -d "$spoke_dir" ]; then
        echo -e "${RED}❌ Spoke not deployed: $code_upper${NC}"
        echo ""
        echo "Deploy first: ./dive spoke deploy $code_upper"
        return 1
    fi

    # Section 1: Container Health
    echo -e "${CYAN}┌─ Container Health${NC}"
    local running_count
    running_count=$(docker ps --filter "name=dive-spoke-${code_lower}-" --format "{{.Names}}" 2>/dev/null | wc -l | tr -d ' ')
    local total_count
    total_count=$(docker ps -a --filter "name=dive-spoke-${code_lower}-" --format "{{.Names}}" 2>/dev/null | wc -l | tr -d ' ')
    
    if [ "$running_count" -eq "$total_count" ] && [ "$total_count" -gt 0 ]; then
        echo -e "${GREEN}✅ All containers running${NC} ($running_count/$total_count)"
    elif [ "$running_count" -gt 0 ]; then
        echo -e "${YELLOW}⚠️  Some containers stopped${NC} ($running_count/$total_count running)"
        echo -e "${CYAN}│  Fix:${NC} ./dive spoke restart $code_upper"
    else
        echo -e "${RED}❌ No containers running${NC}"
        echo -e "${CYAN}│  Fix:${NC} ./dive spoke deploy $code_upper"
    fi

    # Show per-service health
    local services=("postgres" "mongodb" "redis" "keycloak" "opa" "opal-client" "backend" "kas" "frontend")
    for service in "${services[@]}"; do
        local container="dive-spoke-${code_lower}-${service}"
        if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
            local status
            status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "missing")
            local health
            health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "none")
            
            if [ "$status" = "running" ]; then
                if [ "$health" = "healthy" ] || [ "$health" = "none" ]; then
                    printf "${CYAN}│${NC}   %-14s ${GREEN}✓ Running${NC}\n" "$service:"
                else
                    printf "${CYAN}│${NC}   %-14s ${YELLOW}⚠ $health${NC}\n" "$service:"
                fi
            else
                printf "${CYAN}│${NC}   %-14s ${RED}✗ $status${NC}\n" "$service:"
                echo -e "${CYAN}│     Fix:${NC} ./dive spoke restart $code_upper $service"
            fi
        fi
    done
    echo -e "${CYAN}└─${NC}"
    echo ""

    # Section 2: Federation Status
    echo -e "${CYAN}┌─ Federation${NC}"
    
    # Check if federation module available
    if type spoke_federation_verify &>/dev/null; then
        set +e  # Don't let federation check kill the script
        local fed_json
        fed_json=$(spoke_federation_verify "$code_upper" 2>/dev/null | head -20)
        set -e
        
        if [ -n "$fed_json" ]; then
            local bidirectional
            bidirectional=$(echo "$fed_json" | grep -o '"bidirectional":[^,}]*' | cut -d: -f2 | tr -d ' ')
            local spoke_to_hub
            spoke_to_hub=$(echo "$fed_json" | grep -o '"spoke_to_hub":[^,}]*' | cut -d: -f2 | tr -d ' ')
            local hub_to_spoke
            hub_to_spoke=$(echo "$fed_json" | grep -o '"hub_to_spoke":[^,}]*' | cut -d: -f2 | tr -d ' ')
            
            if [ "$bidirectional" = "true" ]; then
                echo -e "${GREEN}✅ Bidirectional federation active${NC}"
                echo -e "${CYAN}│${NC}   Spoke → Hub: ${GREEN}✓${NC}"
                echo -e "${CYAN}│${NC}   Hub → Spoke: ${GREEN}✓${NC}"
            else
                echo -e "${YELLOW}⚠️  Federation not bidirectional${NC}"
                [ "$spoke_to_hub" = "true" ] && echo -e "${CYAN}│${NC}   Spoke → Hub: ${GREEN}✓${NC}" || echo -e "${CYAN}│${NC}   Spoke → Hub: ${RED}✗${NC}"
                [ "$hub_to_spoke" = "true" ] && echo -e "${CYAN}│${NC}   Hub → Spoke: ${GREEN}✓${NC}" || echo -e "${CYAN}│${NC}   Hub → Spoke: ${RED}✗${NC}"
                echo -e "${CYAN}│  Fix:${NC} ./dive spoke repair $code_upper"
            fi
        else
            echo -e "${YELLOW}⚠️  Could not verify federation${NC}"
            echo -e "${CYAN}│  Check:${NC} ./dive federation verify $code_upper"
        fi
    else
        echo -e "${YELLOW}⚠️  Federation verification not available${NC}"
    fi
    echo -e "${CYAN}└─${NC}"
    echo ""

    # Section 3: Database Connectivity
    echo -e "${CYAN}┌─ Databases${NC}"
    
    # PostgreSQL
    if docker exec "dive-spoke-${code_lower}-postgres" pg_isready -U postgres &>/dev/null; then
        echo -e "${CYAN}│${NC}   PostgreSQL:  ${GREEN}✓ Responding${NC}"
    else
        echo -e "${CYAN}│${NC}   PostgreSQL:  ${RED}✗ Not responding${NC}"
        echo -e "${CYAN}│     Fix:${NC} ./dive spoke restart $code_upper postgres"
    fi
    
    # MongoDB
    if docker exec "dive-spoke-${code_lower}-mongodb" mongosh --tls --tlsAllowInvalidCertificates --quiet --eval "db.adminCommand('ping')" 2>/dev/null | grep -q "ok"; then
        echo -e "${CYAN}│${NC}   MongoDB:     ${GREEN}✓ Responding${NC}"
    else
        echo -e "${CYAN}│${NC}   MongoDB:     ${RED}✗ Not responding${NC}"
        echo -e "${CYAN}│     Fix:${NC} ./dive spoke restart $code_upper mongodb"
    fi
    
    # Redis
    if docker exec "dive-spoke-${code_lower}-redis" redis-cli ping 2>/dev/null | grep -q "PONG"; then
        echo -e "${CYAN}│${NC}   Redis:       ${GREEN}✓ Responding${NC}"
    else
        echo -e "${CYAN}│${NC}   Redis:       ${YELLOW}⚠ May need auth${NC}"
    fi
    
    echo -e "${CYAN}└─${NC}"
    echo ""

    # Section 4: Deployment State
    echo -e "${CYAN}┌─ Deployment State${NC}"
    if type orch_db_check_connection &>/dev/null && orch_db_check_connection 2>/dev/null; then
        local last_deployment
        last_deployment=$(orch_db_exec "SELECT state, timestamp FROM deployment_states WHERE instance_code = '${code_lower}' ORDER BY timestamp DESC LIMIT 1;" 2>/dev/null || echo "")
        if [ -n "$last_deployment" ]; then
            local deploy_state
            deploy_state=$(echo "$last_deployment" | awk 'NR==3 {print $1}')
            local deploy_time
            deploy_time=$(echo "$last_deployment" | awk 'NR==3 {print $3}')
            echo -e "${CYAN}│${NC}   Last deployment: ${deploy_state} (${deploy_time})"
        else
            echo -e "${CYAN}│${NC}   No deployment history found"
        fi
    else
        echo -e "${CYAN}│${NC}   Orchestration DB not available"
    fi
    echo -e "${CYAN}└─${NC}"
    echo ""

    # Section 5: Overall Assessment
    echo -e "${CYAN}┌─ System Health${NC}"
    local health_score=0
    local max_score=4
    
    [ "$running_count" -eq "$total_count" ] && ((health_score++)) || true
    [ "$bidirectional" = "true" ] && ((health_score++)) || true
    docker exec "dive-spoke-${code_lower}-postgres" pg_isready -U postgres &>/dev/null && ((health_score++)) || true
    docker exec "dive-spoke-${code_lower}-mongodb" mongosh --tls --tlsAllowInvalidCertificates --quiet --eval "db.adminCommand('ping')" 2>/dev/null | grep -q "ok" && ((health_score++)) || true
    
    if [ "$health_score" -eq "$max_score" ]; then
        echo -e "${GREEN}✅ Healthy${NC} ($health_score/$max_score checks passed)"
    elif [ "$health_score" -ge 2 ]; then
        echo -e "${YELLOW}⚠️  Degraded${NC} ($health_score/$max_score checks passed)"
        echo -e "${CYAN}│  Try:${NC} ./dive spoke repair $code_upper"
    else
        echo -e "${RED}❌ Unhealthy${NC} ($health_score/$max_score checks passed)"
        echo -e "${CYAN}│  Fix:${NC} ./dive spoke deploy $code_upper --force"
    fi
    echo -e "${CYAN}└─${NC}"
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
    local code_lower
    code_lower=$(lower "$instance_code")
    local code_upper
    code_upper=$(upper "$instance_code")
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
        local container_name
        container_name="dive-spoke-${code_lower}-$(echo "$name" | tr '[:upper:]' '[:lower:]')"
        local docker_health
        docker_health=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "")

        if [ "$docker_health" = "healthy" ]; then
            printf "  %-14s ${GREEN}✓ Healthy${NC}\n" "$name:"
            continue
        fi

        # Fallback to HTTP health check
        local status_code
        status_code=$(curl -k -s -o /dev/null -w '%{http_code}' "$url" --max-time 5 2>/dev/null || echo "000")

        if [ "$status_code" = "200" ] || [ "$status_code" = "204" ]; then
            printf "  %-14s ${GREEN}✓ Healthy${NC}\n" "$name:"
        else
            printf "  %-14s ${RED}✗ Unhealthy${NC} (HTTP $status_code)\n" "$name:"
            all_healthy=false
        fi
    done

    # Check MongoDB
    printf "  %-14s " "MongoDB:"
    if docker exec "dive-spoke-${code_lower}-mongodb" mongosh --tls --tlsAllowInvalidCertificates --quiet --eval "db.adminCommand('ping')" 2>/dev/null | grep -q "ok"; then
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
    local code_lower
    code_lower=$(lower "$instance_code")
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
# SPOKE AUDIT STATUS (Delegated to spoke-failover.sh)
# =============================================================================
# spoke_audit_status() is defined in spoke-failover.sh with full implementation
# It is loaded on-demand via the spoke_failover() delegation in maintenance.sh