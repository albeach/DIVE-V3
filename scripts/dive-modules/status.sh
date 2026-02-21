#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Status Commands Module
# =============================================================================
# Commands: status, health, validate, info, diagnostics, brief
# =============================================================================

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

# Service health endpoints
declare -A SERVICE_HEALTH_ENDPOINTS=(
    ["frontend"]="https://localhost:3000/"
    ["backend"]="https://localhost:4000/health"
    ["keycloak"]="https://localhost:8443/realms/master"
    ["opa"]="http://localhost:8181/health"
    ["opal-server"]="https://localhost:7002/healthcheck"
    ["kas"]="https://localhost:8085/health"
    ["mongo"]="localhost:27017"
    ["redis"]="localhost:6379"
    ["postgres"]="localhost:5432"
)

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

# Check if a container is running
container_running() {
    local container_name="$1"
    docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container_name}$"
}

# Get container health status
container_health() {
    local container_name="$1"
    local health
    health=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "unknown")
    echo "$health"
}

# Check HTTP(S) endpoint
check_http_endpoint() {
    local url="$1"
    local timeout="${2:-5}"
    curl -ksf --max-time "$timeout" "$url" >/dev/null 2>&1
}

# Check TCP port
check_tcp_port() {
    local host="$1"
    local port="$2"
    local timeout="${3:-3}"
    timeout "$timeout" bash -c "echo >/dev/tcp/$host/$port" 2>/dev/null
}

# Format status line
format_status() {
    local name="$1"
    local status="$2"
    local details="${3:-}"

    local icon
    case "$status" in
        healthy|running|up|pass|ok)
            icon="${GREEN}✓${NC}"
            status="${GREEN}${status}${NC}"
            ;;
        unhealthy|starting|degraded|warn)
            icon="${YELLOW}⚠${NC}"
            status="${YELLOW}${status}${NC}"
            ;;
        down|stopped|fail|error|unknown)
            icon="${RED}✗${NC}"
            status="${RED}${status}${NC}"
            ;;
        *)
            icon="${GRAY}?${NC}"
            status="${GRAY}${status}${NC}"
            ;;
    esac

    printf "  %b %-20s %b" "$icon" "$name" "$status"
    [ -n "$details" ] && printf " %s" "$details"
    echo ""
}

# =============================================================================
# STATUS COMMAND
# =============================================================================

cmd_status() {
    local instance_lower
    instance_lower=$(lower "$INSTANCE")
    local instance_upper
    instance_upper=$(upper "$INSTANCE")

    echo ""
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║                    DIVE V3 System Status                               ║${NC}"
    echo -e "${BOLD}║              Environment: $(printf '%-6s' "$ENVIRONMENT") │ Instance: $(printf '%-4s' "$instance_upper")                      ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Docker daemon check
    echo -e "${CYAN}Docker Daemon:${NC}"
    if docker info >/dev/null 2>&1; then
        format_status "Docker" "running" ""
    else
        format_status "Docker" "down" "(Start Docker Desktop)"
        return 1
    fi
    echo ""

    # Container status
    echo -e "${CYAN}Containers:${NC}"
    local containers_found=0
    local containers_healthy=0
    local containers_unhealthy=0

    # Determine container prefix based on instance
    local prefixes=()
    if [ "$instance_lower" = "usa" ] || [ "$instance_lower" = "hub" ]; then
        prefixes=("dive-v3" "dive-hub" "dive-pilot")
    else
        prefixes=("${instance_lower}" "dive-spoke-${instance_lower}")
    fi

    # Add shared services
    prefixes+=("shared")

    for prefix in "${prefixes[@]}"; do
        while IFS= read -r container; do
            [ -z "$container" ] && continue
            containers_found=$((containers_found + 1))

            local health
            health=$(container_health "$container")
            local state
            state=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "unknown")

            local display_status="$state"
            if [ "$health" = "healthy" ]; then
                display_status="healthy"
                containers_healthy=$((containers_healthy + 1))
            elif [ "$health" = "unhealthy" ]; then
                display_status="unhealthy"
                containers_unhealthy=$((containers_unhealthy + 1))
            elif [ "$state" = "running" ]; then
                display_status="running"
                containers_healthy=$((containers_healthy + 1))
            fi

            # Get port bindings
            local ports
            ports=$(docker port "$container" 2>/dev/null | head -1 | sed 's/.*-> //' || echo "")

            format_status "$container" "$display_status" "$ports"
        done < <(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "^${prefix}" | sort)
    done

    if [ "$containers_found" -eq 0 ]; then
        echo -e "  ${GRAY}No containers found for instance ${instance_upper}${NC}"
        echo -e "  ${GRAY}Run: ./dive up (or ./dive --instance ${instance_lower} spoke up)${NC}"
    fi
    echo ""

    # Summary
    echo -e "${CYAN}Summary:${NC}"
    echo -e "  Total containers: $containers_found"
    echo -e "  Healthy:          ${GREEN}$containers_healthy${NC}"
    if [ "$containers_unhealthy" -gt 0 ]; then
        echo -e "  Unhealthy:        ${RED}$containers_unhealthy${NC}"
    fi
    echo ""

    # Network status
    echo -e "${CYAN}Networks:${NC}"
    local networks=("dive-shared" "shared-services")
    if [ "$instance_lower" != "usa" ] && [ "$instance_lower" != "hub" ]; then
        networks+=("dive-${instance_lower}-network" "${instance_lower}_dive-${instance_lower}-network")
    else
        networks+=("dive-hub_hub-internal" "dive-network")
    fi

    for net in "${networks[@]}"; do
        if docker network ls --format '{{.Name}}' 2>/dev/null | grep -q "^${net}$"; then
            format_status "$net" "ok" ""
        fi
    done
    echo ""

    # Quick health endpoints (if containers running)
    if [ "$containers_found" -gt 0 ]; then
        echo -e "${CYAN}Service Endpoints:${NC}"

        # Determine ports based on instance
        local fe_port=3000
        local be_port=4000
        local kc_port=8443

        if [ "$instance_lower" != "usa" ] && [ "$instance_lower" != "hub" ]; then
            # Get spoke ports from running containers
            fe_port=$(docker port "${instance_lower}-frontend-${instance_lower}-1" 3000 2>/dev/null | sed 's/.*://' || echo "")
            be_port=$(docker port "${instance_lower}-backend-${instance_lower}-1" 4000 2>/dev/null | sed 's/.*://' || echo "")
            kc_port=$(docker port "${instance_lower}-keycloak-${instance_lower}-1" 8443 2>/dev/null | sed 's/.*://' || echo "")
        fi

        if [ -n "$fe_port" ]; then
            if check_http_endpoint "https://localhost:$fe_port/" 3; then
                format_status "Frontend" "up" "https://localhost:$fe_port"
            else
                format_status "Frontend" "down" "https://localhost:$fe_port"
            fi
        fi
        if [ -n "$be_port" ]; then
            if check_http_endpoint "https://localhost:$be_port/health" 3; then
                format_status "Backend" "up" "https://localhost:$be_port"
            else
                format_status "Backend" "down" "https://localhost:$be_port"
            fi
        fi
        if [ -n "$kc_port" ]; then
            if check_http_endpoint "https://localhost:$kc_port/realms/master" 3; then
                format_status "Keycloak" "up" "https://localhost:$kc_port"
            else
                format_status "Keycloak" "down" "https://localhost:$kc_port"
            fi
        fi
        echo ""
    fi
}

# =============================================================================
# HEALTH COMMAND (with JSON output support)
# =============================================================================

# Internal function to check service health and return structured data
_check_service_health() {
    local svc="$1"
    local instance_lower="$2"
    local start_time
    local end_time
    local latency_ms
    local healthy="false"
    local status="unknown"
    local container=""

    start_time=$(date +%s%N)

    # Find container
    if [ "$instance_lower" = "usa" ] || [ "$instance_lower" = "hub" ]; then
        container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "dive-(v3|hub|pilot)-${svc}$" | head -1)
    else
        container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "${instance_lower}.*${svc}" | head -1)
    fi

    if [ -z "$container" ]; then
        status="not_running"
    else
        local health
        health=$(container_health "$container" 2>/dev/null || echo "unknown")

        case "$health" in
            healthy)
                healthy="true"
                status="healthy"
                ;;
            starting)
                status="starting"
                ;;
            unhealthy)
                status="unhealthy"
                ;;
            *)
                local state
                state=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "unknown")
                if [ "$state" = "running" ]; then
                    healthy="true"
                    status="running"
                else
                    status="$state"
                fi
                ;;
        esac
    fi

    end_time=$(date +%s%N)
    latency_ms=$(( (end_time - start_time) / 1000000 ))

    echo "${svc}|${healthy}|${status}|${latency_ms}|${container}"
}

# JSON output for health command
cmd_health_json() {
    local instance_lower
    instance_lower=$(lower "$INSTANCE")

    local timestamp
    timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    local all_healthy=true
    local services_json=""

    # Check Docker daemon first
    if ! docker info >/dev/null 2>&1; then
        echo '{"status":"unhealthy","timestamp":"'"$timestamp"'","error":"Docker daemon not running","services":{}}'
        return 2
    fi

    local expected_services=("keycloak" "backend" "frontend" "opa" "postgres" "mongodb" "redis")

    for svc in "${expected_services[@]}"; do
        local result
        result=$(_check_service_health "$svc" "$instance_lower")

        local name healthy status latency_ms container
        IFS='|' read -r name healthy status latency_ms container <<< "$result"

        if [ "$healthy" = "false" ]; then
            all_healthy=false
        fi

        if [ -n "$services_json" ]; then
            services_json+=","
        fi
        services_json+="\"${name}\":{\"healthy\":${healthy},\"status\":\"${status}\",\"latency_ms\":${latency_ms}"
        [ -n "$container" ] && services_json+=",\"container\":\"${container}\""
        services_json+="}"
    done

    local overall_status="healthy"
    [ "$all_healthy" = false ] && overall_status="unhealthy"

    echo "{\"status\":\"${overall_status}\",\"timestamp\":\"${timestamp}\",\"instance\":\"${instance_lower}\",\"services\":{${services_json}}}"

    if [ "$all_healthy" = true ]; then
        return 0
    else
        return 1
    fi
}

cmd_health() {
    # Parse arguments for --json flag
    local json_output=false
    local quiet_mode=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --json|-j)
                json_output=true
                shift
                ;;
            --quiet|-q)
                quiet_mode=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    # Handle JSON output mode
    if [ "$json_output" = true ]; then
        cmd_health_json
        return $?
    fi

    # Handle quiet mode (exit code only)
    if [ "$quiet_mode" = true ]; then
        cmd_health_json >/dev/null 2>&1
        return $?
    fi

    local instance_lower
    instance_lower=$(lower "$INSTANCE")
    local instance_upper
    instance_upper=$(upper "$INSTANCE")

    echo ""
    echo -e "${BOLD}DIVE V3 Health Check - ${instance_upper}${NC}"
    echo ""

    local total_checks=0
    local passed_checks=0
    local failed_checks=0

    # Docker check
    echo -e "${CYAN}Infrastructure:${NC}"
    total_checks=$((total_checks + 1))
    if docker info >/dev/null 2>&1; then
        format_status "Docker daemon" "pass"
        passed_checks=$((passed_checks + 1))
    else
        format_status "Docker daemon" "fail" "Docker not running"
        failed_checks=$((failed_checks + 1))
        echo ""
        echo -e "${RED}Cannot proceed with health checks - Docker not running${NC}"
        return 1
    fi

    # Check shared network
    total_checks=$((total_checks + 1))
    if docker network ls --format '{{.Name}}' 2>/dev/null | grep -qE "dive-shared|shared-services"; then
        format_status "Shared network" "pass"
        passed_checks=$((passed_checks + 1))
    else
        format_status "Shared network" "warn" "Not found (may be ok for isolated instance)"
    fi
    echo ""

    # Container health
    echo -e "${CYAN}Container Health:${NC}"

    local expected_services=()
    if [ "$instance_lower" = "usa" ] || [ "$instance_lower" = "hub" ]; then
        expected_services=("keycloak" "backend" "frontend" "opa" "postgres" "mongodb" "redis")
    else
        expected_services=("keycloak" "backend" "frontend" "opa" "postgres" "mongodb" "redis")
    fi

    for svc in "${expected_services[@]}"; do
        total_checks=$((total_checks + 1))

        # Find container
        local container
        if [ "$instance_lower" = "usa" ] || [ "$instance_lower" = "hub" ]; then
            container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "dive-(v3|hub|pilot)-${svc}$" | head -1)
        else
            container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "${instance_lower}.*${svc}" | head -1)
        fi

        if [ -z "$container" ]; then
            format_status "$svc" "fail" "Not running"
            failed_checks=$((failed_checks + 1))
            continue
        fi

        local health
        health=$(container_health "$container")

        case "$health" in
            healthy)
                format_status "$svc" "pass" "$container"
                passed_checks=$((passed_checks + 1))
                ;;
            starting)
                format_status "$svc" "warn" "$container (starting)"
                ;;
            unhealthy)
                format_status "$svc" "fail" "$container (unhealthy)"
                failed_checks=$((failed_checks + 1))
                ;;
            *)
                # No healthcheck defined, check if running
                local state
                state=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null)
                if [ "$state" = "running" ]; then
                    format_status "$svc" "pass" "$container (no healthcheck)"
                    passed_checks=$((passed_checks + 1))
                else
                    format_status "$svc" "fail" "$container ($state)"
                    failed_checks=$((failed_checks + 1))
                fi
                ;;
        esac
    done
    echo ""

    # Summary
    echo -e "${CYAN}Summary:${NC}"
    echo -e "  Total checks: $total_checks"
    echo -e "  Passed:       ${GREEN}$passed_checks${NC}"
    if [ "$failed_checks" -gt 0 ]; then
        echo -e "  Failed:       ${RED}$failed_checks${NC}"
    fi
    echo ""

    if [ "$failed_checks" -gt 0 ]; then
        return 1
    fi
    return 0
}

# =============================================================================
# VALIDATE COMMAND
# =============================================================================
# Phase 4 Enhanced: Includes compose config validation
# =============================================================================

cmd_validate() {
    echo ""
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║                    DIVE V3 Prerequisites Validation                    ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    local issues=0
    local warnings=0

    # =========================================================================
    # Section 1: Required Tools
    # =========================================================================
    echo -e "${CYAN}Required Tools:${NC}"

    # Docker
    if docker info >/dev/null 2>&1; then
        format_status "Docker" "pass" "$(docker --version | head -1)"
    else
        format_status "Docker" "fail" "Not running"
        issues=$((issues + 1))
    fi

    # Docker Compose v2
    if docker compose version >/dev/null 2>&1; then
        local compose_version
        compose_version=$(docker compose version --short 2>/dev/null)
        format_status "Docker Compose" "pass" "v$compose_version"
    else
        format_status "Docker Compose" "fail" "Not found (requires v2+)"
        issues=$((issues + 1))
    fi

    # jq (required for diagnostics)
    if command -v jq >/dev/null 2>&1; then
        format_status "jq" "pass" "$(jq --version 2>&1)"
    else
        format_status "jq" "warn" "Not installed (needed for JSON parsing)"
        warnings=$((warnings + 1))
    fi

    # curl (required for health checks)
    if command -v curl >/dev/null 2>&1; then
        format_status "curl" "pass" "$(curl --version | head -1 | cut -d' ' -f1-2)"
    else
        format_status "curl" "warn" "Not installed (needed for health checks)"
        warnings=$((warnings + 1))
    fi
    echo ""

    # =========================================================================
    # Section 2: Optional Tools
    # =========================================================================
    echo -e "${CYAN}Optional Tools:${NC}"

    # Terraform
    if command -v terraform >/dev/null 2>&1; then
        format_status "Terraform" "pass" "$(terraform version -json 2>/dev/null | jq -r '.terraform_version // "unknown"' 2>/dev/null || terraform version | head -1)"
    else
        format_status "Terraform" "warn" "Not installed (needed for IaC)"
    fi

    # mkcert (for local certs)
    if command -v mkcert >/dev/null 2>&1; then
        format_status "mkcert" "pass" "$(mkcert --version 2>&1 | head -1)"
    else
        format_status "mkcert" "warn" "Not installed (needed for local HTTPS)"
    fi

    # gcloud (for GCP secrets)
    if command -v gcloud >/dev/null 2>&1; then
        local gcp_account
        gcp_account=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | head -1)
        if [ -n "$gcp_account" ]; then
            format_status "gcloud" "pass" "$gcp_account"
        else
            format_status "gcloud" "warn" "Not authenticated"
        fi
    else
        format_status "gcloud" "warn" "Not installed (optional for GCP secrets)"
    fi

    # OPA CLI (for policy testing)
    if command -v opa >/dev/null 2>&1; then
        format_status "opa" "pass" "$(opa version | head -1)"
    else
        format_status "opa" "warn" "Not installed (needed for policy testing)"
    fi
    echo ""

    # =========================================================================
    # Section 3: Required Networks
    # =========================================================================
    echo -e "${CYAN}Docker Networks:${NC}"

    local required_networks=("dive-shared" "shared-services")
    for net in "${required_networks[@]}"; do
        if docker network ls --format '{{.Name}}' 2>/dev/null | grep -q "^${net}$"; then
            format_status "$net" "pass" "exists"
        else
            format_status "$net" "warn" "not found (will be created on startup)"
        fi
    done
    echo ""

    # =========================================================================
    # Section 4: Compose Configuration Validation (Phase 4 Enhancement)
    # =========================================================================
    echo -e "${CYAN}Compose Configuration:${NC}"

    # Define dummy secrets for validation (covers all instances)
    local DUMMY_SECRETS="POSTGRES_PASSWORD=x MONGO_PASSWORD=x KEYCLOAK_ADMIN_PASSWORD=x"
    DUMMY_SECRETS="$DUMMY_SECRETS KEYCLOAK_CLIENT_SECRET=x AUTH_SECRET=x"
    DUMMY_SECRETS="$DUMMY_SECRETS REDIS_PASSWORD_USA=x REDIS_PASSWORD_BLACKLIST=x GRAFANA_PASSWORD=x OPAL_AUTH_MASTER_TOKEN=x"
    DUMMY_SECRETS="$DUMMY_SECRETS COMPOSE_PROJECT_NAME=dive-hub"
    # Instance-specific secrets (for spoke validation)
    DUMMY_SECRETS="$DUMMY_SECRETS POSTGRES_PASSWORD_USA=x POSTGRES_PASSWORD_GBR=x POSTGRES_PASSWORD_FRA=x POSTGRES_PASSWORD_DEU=x"
    DUMMY_SECRETS="$DUMMY_SECRETS POSTGRES_PASSWORD_NZL=x POSTGRES_PASSWORD_EST=x POSTGRES_PASSWORD_POL=x POSTGRES_PASSWORD_DNK=x"
    DUMMY_SECRETS="$DUMMY_SECRETS MONGO_PASSWORD_USA=x MONGO_PASSWORD_GBR=x MONGO_PASSWORD_FRA=x MONGO_PASSWORD_DEU=x"
    DUMMY_SECRETS="$DUMMY_SECRETS MONGO_PASSWORD_NZL=x MONGO_PASSWORD_EST=x MONGO_PASSWORD_POL=x MONGO_PASSWORD_DNK=x"
    DUMMY_SECRETS="$DUMMY_SECRETS REDIS_PASSWORD_GBR=x REDIS_PASSWORD_FRA=x REDIS_PASSWORD_DEU=x REDIS_PASSWORD_NZL=x"
    DUMMY_SECRETS="$DUMMY_SECRETS REDIS_PASSWORD_EST=x REDIS_PASSWORD_POL=x REDIS_PASSWORD_DNK=x"
    DUMMY_SECRETS="$DUMMY_SECRETS KEYCLOAK_ADMIN_PASSWORD=x KEYCLOAK_ADMIN_PASSWORD_GBR=x KEYCLOAK_ADMIN_PASSWORD_FRA=x"
    DUMMY_SECRETS="$DUMMY_SECRETS KEYCLOAK_ADMIN_PASSWORD_DEU=x KEYCLOAK_ADMIN_PASSWORD_NZL=x"
    DUMMY_SECRETS="$DUMMY_SECRETS AUTH_SECRET_USA=x AUTH_SECRET_GBR=x AUTH_SECRET_FRA=x AUTH_SECRET_DEU=x AUTH_SECRET_NZL=x"

    # Root compose files
    local root_compose_files=("docker-compose.yml" "docker-compose.hub.yml")
    for cf in "${root_compose_files[@]}"; do
        if [ -f "$cf" ]; then
            local validation_output
            validation_output=$(eval "$DUMMY_SECRETS docker compose -f $cf config 2>&1")
            local exit_code=$?

            if [ $exit_code -eq 0 ]; then
                local service_count
                service_count=$(eval "$DUMMY_SECRETS docker compose -f $cf config --services 2>/dev/null" | wc -l | tr -d ' ')
                format_status "$cf" "pass" "$service_count services"
            else
                format_status "$cf" "fail" "Invalid configuration"
                echo -e "    ${GRAY}Error:${NC} $(echo "$validation_output" | head -3 | sed 's/^/    /')"
                issues=$((issues + 1))
            fi
        else
            format_status "$cf" "warn" "Not found"
        fi
    done

    # Instance compose files
    if [ -d "instances" ]; then
        local instance_compose_count=0
        local instance_compose_valid=0
        local instance_compose_invalid=0

        for instance_dir in instances/*/; do
            local instance_compose="$instance_dir/docker-compose.yml"
            if [ -f "$instance_compose" ]; then
                instance_compose_count=$((instance_compose_count + 1))

                # Validate with dummy secrets
                if eval "$DUMMY_SECRETS docker compose -f $instance_compose config --services >/dev/null 2>&1"; then
                    instance_compose_valid=$((instance_compose_valid + 1))
                else
                    instance_compose_invalid=$((instance_compose_invalid + 1))
                    # Only show first few errors to avoid spam
                    if [ "$instance_compose_invalid" -le 3 ]; then
                        local instance_name
                        instance_name=$(basename "$instance_dir")
                        format_status "instances/$instance_name" "fail" "Invalid compose"
                    fi
                fi
            fi
        done

        if [ "$instance_compose_count" -gt 0 ]; then
            if [ "$instance_compose_invalid" -eq 0 ]; then
                format_status "Instance configs" "pass" "$instance_compose_valid/$instance_compose_count valid"
            else
                format_status "Instance configs" "fail" "$instance_compose_invalid/$instance_compose_count invalid"
                issues=$((issues + 1))
            fi
        fi
    fi

    # Shared services compose
    if [ -f "docker/instances/shared/docker-compose.yml" ]; then
        if eval "$DUMMY_SECRETS docker compose -f docker/instances/shared/docker-compose.yml config --services >/dev/null 2>&1"; then
            format_status "shared/docker-compose.yml" "pass" "Valid"
        else
            format_status "shared/docker-compose.yml" "fail" "Invalid"
            issues=$((issues + 1))
        fi
    fi
    echo ""

    # =========================================================================
    # Section 5: Required Secrets
    # =========================================================================
    echo -e "${CYAN}Required Secrets:${NC}"

    local secrets_available=0
    local required_secrets=("KEYCLOAK_ADMIN_PASSWORD" "KEYCLOAK_CLIENT_SECRET" "POSTGRES_PASSWORD" "MONGO_PASSWORD")

    # Check environment variables
    for secret in "${required_secrets[@]}"; do
        if [ -n "${!secret:-}" ]; then
            secrets_available=$((secrets_available + 1))
        fi
    done

    # Check .env.hub file for persistent secrets
    if [ -f ".env.hub" ]; then
        for secret in "${required_secrets[@]}"; do
            if grep -qE "^${secret}=" .env.hub 2>/dev/null && [ "$secrets_available" -lt "${#required_secrets[@]}" ]; then
                secrets_available=$((secrets_available + 1))
            fi
        done
    fi

    if [ "$secrets_available" -ge "${#required_secrets[@]}" ]; then
        format_status "Required secrets" "pass" "Available (shell + persistent)"
    elif [ "$secrets_available" -gt 0 ]; then
        format_status "Required secrets" "pass" "$secrets_available/${#required_secrets[@]} available"
    else
        format_status "Required secrets" "warn" "Not available (run: ./dive secrets load)"
    fi
    echo ""

    # =========================================================================
    # Section 6: Port Availability
    # =========================================================================
    echo -e "${CYAN}Port Availability:${NC}"

    local ports_available=0
    local ports_in_use=0
    local ports_to_check=(3000 4000 8080 8443 5432 27017 6379 8181 7002)

    for port in "${ports_to_check[@]}"; do
        local listeners
        listeners=$(lsof -i ":$port" -sTCP:LISTEN 2>/dev/null | wc -l | tr -d '[:space:]')
        listeners=${listeners:-0}

        if [ "$listeners" -eq 0 ]; then
            ports_available=$((ports_available + 1))
        else
            ports_in_use=$((ports_in_use + 1))
            # Check if it's a DIVE container using the port (that's OK)
            local dive_using
            dive_using=$(docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep -E ":$port->" | grep -cE "dive|shared" || echo "0")
            dive_using=${dive_using:-0}
            # Ensure dive_using is numeric
            dive_using=$(echo "$dive_using" | tr -d -c '0-9' || echo "0")
            dive_using=${dive_using:-0}
            if [ "$dive_using" -gt 0 ]; then
                # Port in use by DIVE - that's fine
                :
            else
                format_status "Port $port" "warn" "In use (non-DIVE)"
            fi
        fi
    done

    if [ "$ports_in_use" -eq 0 ]; then
        format_status "Hub ports" "pass" "All ${#ports_to_check[@]} ports available"
    else
        format_status "Hub ports" "pass" "$ports_available available, $ports_in_use in use"
    fi
    echo ""

    # =========================================================================
    # Section 7: Certificate Validation
    # =========================================================================
    echo -e "${CYAN}TLS Certificates:${NC}"

    # Hub certificates SSOT: instances/hub/certs
    local hub_cert_path="instances/hub/certs/certificate.pem"
    if [ -f "$hub_cert_path" ]; then
        # Check certificate validity
        if openssl x509 -checkend 0 -noout -in "$hub_cert_path" 2>/dev/null; then
            local _cert_subject
            _cert_subject=$(openssl x509 -subject -noout -in "$hub_cert_path" 2>/dev/null | sed 's/subject=//')
            format_status "instances/hub/certs" "pass" "Valid"
        else
            format_status "instances/hub/certs" "fail" "Expired"
            issues=$((issues + 1))
        fi
    else
        # Fallback check for legacy keycloak/certs location
        if [ -f "keycloak/certs/certificate.pem" ]; then
            format_status "keycloak/certs" "warn" "Legacy location (migrate to instances/hub/certs)"
        else
            format_status "instances/hub/certs" "warn" "Not found (run: ./dive deploy hub to generate)"
        fi
    fi

    if [ -f "backend/certs/certificate.pem" ]; then
        if openssl x509 -checkend 0 -noout -in backend/certs/certificate.pem 2>/dev/null; then
            format_status "backend/certs" "pass" "Valid"
        else
            format_status "backend/certs" "fail" "Expired"
            issues=$((issues + 1))
        fi
    fi

    if [ -f "kas/certs/certificate.pem" ]; then
        if openssl x509 -checkend 0 -noout -in kas/certs/certificate.pem 2>/dev/null; then
            format_status "kas/certs" "pass" "Valid"
        else
            format_status "kas/certs" "fail" "Expired"
            issues=$((issues + 1))
        fi
    fi
    echo ""

    # =========================================================================
    # Summary
    # =========================================================================
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  Validation Summary                                                    ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    if [ "$issues" -eq 0 ] && [ "$warnings" -eq 0 ]; then
        echo -e "  ${GREEN}✅ All prerequisites validated - ready to deploy${NC}"
    elif [ "$issues" -eq 0 ]; then
        echo -e "  ${YELLOW}⚠️  Validated with $warnings warning(s)${NC}"
    else
        echo -e "  ${RED}❌ $issues critical issue(s), $warnings warning(s)${NC}"
        echo -e "  ${GRAY}Fix critical issues before deploying${NC}"
    fi
    echo ""

    return $issues
}

# =============================================================================
# INFO COMMAND
# =============================================================================

cmd_info() {
    echo ""
    echo -e "${BOLD}DIVE V3 Environment Information${NC}"
    echo ""

    echo -e "${CYAN}Current Configuration:${NC}"
    echo "  Environment:     $ENVIRONMENT"
    echo "  Instance:        $(upper "$INSTANCE")"
    echo "  Project Root:    $DIVE_ROOT"
    echo "  GCP Project:     ${GCP_PROJECT:-dive25}"
    echo ""

    echo -e "${CYAN}Key URLs:${NC}"
    echo "  Frontend:        ${NEXT_PUBLIC_BASE_URL:-https://localhost:3000}"
    echo "  Backend API:     ${NEXT_PUBLIC_API_URL:-https://localhost:4000}"
    echo "  Keycloak:        ${KEYCLOAK_URL:-https://localhost:8443}"
    echo "  Hub API:         ${HUB_API_URL:-https://localhost:4000}"
    echo ""

    echo -e "${CYAN}Environment Variables:${NC}"
    echo "  DIVE_ENV:        ${DIVE_ENV:-<not set>}"
    echo "  DIVE_INSTANCE:   ${DIVE_INSTANCE:-<not set>}"
    echo "  USE_GCP_SECRETS: ${USE_GCP_SECRETS:-false}"
    echo ""
}


# Load diagnostics module
source "$(dirname "${BASH_SOURCE[0]}")/status-diagnostics.sh"


# =============================================================================
# BRIEF STATUS COMMAND
# =============================================================================

cmd_status_brief() {
    local containers
    containers=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -cE "dive|shared" || echo "0")

    local healthy
    healthy=$(docker ps --filter "health=healthy" --format '{{.Names}}' 2>/dev/null | grep -cE "dive|shared" || echo "0")

    local unhealthy
    unhealthy=$(docker ps --filter "health=unhealthy" --format '{{.Names}}' 2>/dev/null | grep -cE "dive|shared" || echo "0")

    echo "DIVE V3: $containers containers ($healthy healthy, $unhealthy unhealthy)"
}

# =============================================================================
# ENVIRONMENT PRINT COMMAND
# =============================================================================

cmd_env_print() {
    echo ""
    echo -e "${BOLD}DIVE V3 Environment Variables${NC}"
    echo ""

    # Core settings
    echo -e "${CYAN}Core Settings:${NC}"
    env | grep -E "^(DIVE_|ENVIRONMENT|INSTANCE)" | sort
    echo ""

    # URLs
    echo -e "${CYAN}URLs:${NC}"
    env | grep -E "^(NEXT_PUBLIC_|KEYCLOAK_URL|NEXTAUTH_URL|HUB_)" | sort
    echo ""

    # Secrets (redacted)
    echo -e "${CYAN}Secrets (redacted):${NC}"
    for var in POSTGRES_PASSWORD MONGO_PASSWORD KEYCLOAK_ADMIN_PASSWORD KEYCLOAK_CLIENT_SECRET AUTH_SECRET REDIS_PASSWORD; do
        local val="${!var:-<not set>}"
        if [ "$val" != "<not set>" ]; then
            val="****$(echo "$val" | tail -c 5)"
        fi
        printf "  %-30s %s\n" "$var" "$val"
    done
    echo ""
}

# =============================================================================
# MODULE EXPORT
# =============================================================================

# Export functions for use by main CLI
export -f cmd_status
export -f cmd_health
export -f cmd_validate
export -f cmd_info
export -f cmd_diagnostics
export -f cmd_status_brief
export -f cmd_env_print

# sc2034-anchor
: "${SERVICE_HEALTH_ENDPOINTS:-}"
