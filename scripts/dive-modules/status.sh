#!/bin/bash
# =============================================================================
# DIVE V3 CLI - Status & Health Module
# =============================================================================
# Commands: status, health, validate, info
# =============================================================================

# shellcheck source=common.sh disable=SC1091
# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# STATUS COMMANDS
# =============================================================================

cmd_status() {
    print_header
    
    echo -e "${BOLD}Local Containers:${NC}"
    docker ps --filter "name=dive" --format "  {{.Names}}: {{.Status}}" 2>/dev/null | head -15 || echo "  No containers running"
    
    # Only probe remote endpoints when not in local/dev, unless verbose
    if [ "$ENVIRONMENT" != "local" ] && [ "$ENVIRONMENT" != "dev" ] || [ "$VERBOSE" = true ]; then
        echo ""
        echo -e "${BOLD}Remote Endpoints:${NC}"
        for endpoint in "usa-app.dive25.com" "usa-api.dive25.com" "usa-idp.dive25.com"; do
            local code
        code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "https://$endpoint" 2>/dev/null || echo "000")
            if [ "$code" = "200" ] || [ "$code" = "302" ]; then
                echo -e "  ${GREEN}●${NC} $endpoint (${code})"
            else
                echo -e "  ${RED}○${NC} $endpoint (${code})"
            fi
        done
    fi
    
    echo ""
    echo -e "${BOLD}Environment:${NC}"
    echo "  Mode:     $ENVIRONMENT"
    echo "  Instance: $INSTANCE"
    echo "  Project:  $GCP_PROJECT"
}

cmd_status_brief() {
    apply_env_profile
    local failures=0

    # Check realm
    if probe_code "${KEYCLOAK_ISSUER:-https://localhost:8443/realms/dive-v3-broker}" "200"; then
        echo "realm:ok"
    else
        echo "realm:missing"
        failures=$((failures+1))
    fi

    # Check backend health
    if probe_code "${NEXT_PUBLIC_API_URL:-https://localhost:4000}/health" "200"; then
        echo "backend:ok"
    else
        echo "backend:fail"
        failures=$((failures+1))
    fi

    # Check IdP list non-empty
    if probe_idps "${NEXT_PUBLIC_API_URL:-https://localhost:4000}/api/idps/public"; then
        echo "idps:ok"
    else
        echo "idps:empty"
        failures=$((failures+1))
    fi

    return $failures
}

cmd_health() {
    print_header
    echo -e "${BOLD}Service Health Checks:${NC}"
    echo ""
    
    local services=("frontend:3000" "backend:4000" "keycloak:8443" "postgres:5432" "mongo:27017" "redis:6379" "opa:8181" "opal-server:7002")
    
    for svc in "${services[@]}"; do
        local name="${svc%%:*}"
        local port="${svc##*:}"
        local container
        container="$(container_name "$name")"
        
        echo -n "  $name: "
        
        if [ "$DRY_RUN" = true ]; then
            echo -e "${GRAY}[dry-run]${NC}"
            continue
        fi
        
        # Check if container exists
        if ! docker ps --format "{{.Names}}" | grep -q "$container"; then
            echo -e "${RED}not running${NC}"
            continue
        fi
        
        # Service-specific health checks
        case "$name" in
            frontend)
                if curl -kfs --max-time 3 "https://localhost:$port" >/dev/null 2>&1; then
                    echo -e "${GREEN}healthy${NC}"
                else
                    echo -e "${YELLOW}starting...${NC}"
                fi
                ;;
            backend)
                if curl -kfs --max-time 3 "https://localhost:$port/health" >/dev/null 2>&1; then
                    echo -e "${GREEN}healthy${NC}"
                else
                    echo -e "${YELLOW}starting...${NC}"
                fi
                ;;
            keycloak)
                if curl -kfs --max-time 3 "https://localhost:$port/health" >/dev/null 2>&1; then
                    echo -e "${GREEN}healthy${NC}"
                else
                    echo -e "${YELLOW}starting...${NC}"
                fi
                ;;
            postgres)
                if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then
                    echo -e "${GREEN}healthy${NC}"
                else
                    echo -e "${YELLOW}starting...${NC}"
                fi
                ;;
            mongo)
                if docker exec "$container" mongosh --eval "db.runCommand('ping')" >/dev/null 2>&1; then
                    echo -e "${GREEN}healthy${NC}"
                else
                    echo -e "${YELLOW}starting...${NC}"
                fi
                ;;
            redis)
                if docker exec "$container" redis-cli ping >/dev/null 2>&1; then
                    echo -e "${GREEN}healthy${NC}"
                else
                    echo -e "${YELLOW}starting...${NC}"
                fi
                ;;
            opa)
                if curl -fs --max-time 3 "http://localhost:$port/health" >/dev/null 2>&1; then
                    echo -e "${GREEN}healthy${NC}"
                else
                    echo -e "${YELLOW}starting...${NC}"
                fi
                ;;
            opal-server)
                if curl -kfs --max-time 3 "https://localhost:$port/healthcheck" >/dev/null 2>&1; then
                    echo -e "${GREEN}healthy${NC}"
                else
                    echo -e "${YELLOW}starting...${NC}"
                fi
                ;;
            *)
                echo -e "${GRAY}unknown${NC}"
                ;;
        esac
    done
}

cmd_validate() {
    print_header
    echo -e "${BOLD}Validating DIVE V3 Configuration...${NC}"
    echo ""
    
    local errors=0
    
    # Docker
    echo -n "  Docker:        "
    if check_docker 2>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        ((errors++))
    fi
    
    local require_cloud=true
    case "$ENVIRONMENT" in
        local|dev) require_cloud=false ;;
    esac

    # GCP CLI
    echo -n "  GCP (gcloud):  "
    if [ "$require_cloud" = true ]; then
        if check_gcloud 2>/dev/null; then
            echo -e "${GREEN}✓${NC}"
        else
            echo -e "${RED}✗${NC}"
            ((errors++))
        fi
    else
        echo -e "${YELLOW}skipped (local/dev)${NC}"
    fi
    
    # Terraform
    echo -n "  Terraform:     "
    if [ "$require_cloud" = true ]; then
        if check_terraform 2>/dev/null; then
            echo -e "${GREEN}✓${NC}"
        else
            echo -e "${RED}✗${NC}"
            ((errors++))
        fi
    else
        echo -e "${YELLOW}skipped (local/dev)${NC}"
    fi
    
    # SSL Certs
    echo -n "  SSL Certs:     "
    if [ -f "keycloak/certs/certificate.pem" ]; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}missing (will generate)${NC}"
    fi
    
    # Compose files
    echo -n "  Compose files: "
    local compose_count=0
    [ -f "docker-compose.yml" ] && ((compose_count++))
    [ -f "docker-compose.pilot.yml" ] && ((compose_count++))
    [ -f "docker-compose.dev.yml" ] && ((compose_count++))
    echo -e "${GREEN}${compose_count} found${NC}"
    
    # Terraform configs
    echo -n "  TF configs:    "
    local tf_count
    tf_count=$(find terraform -name "*.tf" 2>/dev/null | wc -l | tr -d " ")
    echo -e "${GREEN}${tf_count} files${NC}"
    
    # GCP Secrets
    echo -n "  GCP Secrets:   "
    if [ "$require_cloud" = true ] && check_gcloud 2>/dev/null; then
        local secret_count
        secret_count=$(gcloud secrets list --project="$GCP_PROJECT" --filter="name:dive-v3" --format="value(name)" 2>/dev/null | wc -l | tr -d " ")
        echo -e "${GREEN}${secret_count} configured${NC}"
    else
        echo -e "${YELLOW}skipped${NC}"
    fi
    
    # OPAL certificates
    echo -n "  OPAL Certs:    "
    if [ -f "certs/bundle-signing/bundle-signing.pub" ]; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}missing${NC}"
    fi
    
    echo ""
    if [ $errors -eq 0 ]; then
        log_success "All validations passed!"
        return 0
    else
        log_error "$errors validation(s) failed"
        return 1
    fi
}

cmd_info() {
    print_header
    
    echo -e "${BOLD}Environment:${NC}"
    echo "  DIVE_ROOT:     ${DIVE_ROOT:-$(pwd)}"
    echo "  ENVIRONMENT:   $ENVIRONMENT"
    echo "  INSTANCE:      $INSTANCE"
    echo "  GCP_PROJECT:   $GCP_PROJECT"
    echo "  PILOT_VM:      $PILOT_VM"
    echo "  PILOT_ZONE:    $PILOT_ZONE"
    if [ "$PILOT_MODE" = true ]; then
        echo -e "  PILOT_MODE:    ${GREEN}enabled${NC} (spoke commands disabled)"
    else
        echo -e "  PILOT_MODE:    ${YELLOW}disabled${NC} (full spoke deployment)"
    fi
    echo "  HUB_API_URL:   $HUB_API_URL"
    echo ""
    
    echo -e "${BOLD}Docker:${NC}"
    if check_docker 2>/dev/null; then
        echo "  Status: Running"
        echo "  Containers: $(docker ps --filter "name=dive" -q | wc -l | tr -d ' ') DIVE containers"
    else
        echo "  Status: Not running"
    fi
    echo ""
    
    echo -e "${BOLD}Compose Files:${NC}"
    [ -f "docker-compose.yml" ] && echo "  ✓ docker-compose.yml"
    [ -f "docker-compose.pilot.yml" ] && echo "  ✓ docker-compose.pilot.yml"
    [ -f "docker-compose.dev.yml" ] && echo "  ✓ docker-compose.dev.yml"
    echo ""
    
    echo -e "${BOLD}Terraform:${NC}"
    if check_terraform 2>/dev/null; then
        echo "  Status: Installed"
        [ -d "terraform/pilot/.terraform" ] && echo "  Pilot: Initialized" || echo "  Pilot: Not initialized"
        [ -d "terraform/instances/.terraform" ] && echo "  Instances: Initialized" || echo "  Instances: Not initialized"
    else
        echo "  Status: Not installed"
    fi
}

cmd_diagnostics() {
    print_header
    apply_env_profile

    echo -e "${BOLD}Diagnostics:${NC}"
    echo ""
    echo -e "${BOLD}Effective Env:${NC}"
    echo "  ENVIRONMENT:           $ENVIRONMENT"
    echo "  INSTANCE:              $INSTANCE"
    echo "  KEYCLOAK_ISSUER:       ${KEYCLOAK_ISSUER:-<unset>}"
    echo "  NEXTAUTH_URL:          ${NEXTAUTH_URL:-<unset>}"
    echo "  NEXT_PUBLIC_API_URL:   ${NEXT_PUBLIC_API_URL:-<unset>}"
    echo "  CORS_ALLOWED_ORIGINS:  ${CORS_ALLOWED_ORIGINS:-<unset>}"
    echo ""

    echo -e "${BOLD}Service Health:${NC}"
    cmd_health
    echo ""

    echo -e "${BOLD}Endpoint Probes (https, 3s timeout):${NC}"
    probe_endpoint "https://localhost:8443/health" "Keycloak"
    probe_endpoint "${KEYCLOAK_ISSUER:-https://localhost:8443/realms/dive-v3-broker}" "Broker realm"
    probe_endpoint "${NEXT_PUBLIC_API_URL:-https://localhost:4000}/health" "Backend"
    probe_endpoint "${NEXT_PUBLIC_API_URL:-https://localhost:4000}/api/idps/public" "IdP list"
    probe_endpoint "${NEXT_PUBLIC_BASE_URL:-https://localhost:3000}/" "Frontend"
}

probe_endpoint() {
    local url="$1"
    local name="$2"
    if [ "$DRY_RUN" = true ]; then
        echo -e "  ${GRAY}[dry-run] ${name}: $url${NC}"
        return
    fi
    local code
    code=$(curl -k -s -o /dev/null -w "%{http_code}" --max-time 3 "$url" || echo "000")
    if [ "$code" = "200" ] || [ "$code" = "302" ]; then
        echo -e "  ${GREEN}●${NC} ${name} (${code})"
    else
        echo -e "  ${RED}○${NC} ${name} (${code})"
    fi
}

probe_code() {
    local url="$1"
    local expect="${2:-200}"
    local code
    code=$(curl -k -s -o /dev/null -w "%{http_code}" --max-time 3 "$url" || echo "000")
    [ "$code" = "$expect" ]
}

probe_idps() {
    local url="$1"
    local count
    count=$(curl -k -s --max-time 5 "$url" 2>/dev/null | jq 'length' 2>/dev/null || echo "0")
    [ "$count" != "0" ]
}

cmd_env_print() {
    print_header
    apply_env_profile

    echo -e "${BOLD}Effective Environment (sanitized):${NC}"
    echo "  ENVIRONMENT:           $ENVIRONMENT"
    echo "  INSTANCE:              $INSTANCE"
    echo "  GCP_PROJECT:           $GCP_PROJECT"
    echo "  KEYCLOAK_HOSTNAME:     ${KEYCLOAK_HOSTNAME:-<unset>}"
    echo "  KEYCLOAK_ISSUER:       ${KEYCLOAK_ISSUER:-<unset>}"
    echo "  NEXTAUTH_URL:          ${NEXTAUTH_URL:-<unset>}"
    echo "  NEXT_PUBLIC_API_URL:   ${NEXT_PUBLIC_API_URL:-<unset>}"
    echo "  NEXT_PUBLIC_BACKEND_URL: ${NEXT_PUBLIC_BACKEND_URL:-<unset>}"
    echo "  NEXT_PUBLIC_BASE_URL:  ${NEXT_PUBLIC_BASE_URL:-<unset>}"
    echo "  NEXT_PUBLIC_KEYCLOAK_URL: ${NEXT_PUBLIC_KEYCLOAK_URL:-<unset>}"
    echo "  CORS_ALLOWED_ORIGINS:  ${CORS_ALLOWED_ORIGINS:-<unset>}"
    echo ""
    printf "  POSTGRES_PASSWORD:        %s\n" "$([[ -n ${POSTGRES_PASSWORD:-} ]] && echo set || echo unset)"
    printf "  KEYCLOAK_ADMIN_PASSWORD:  %s\n" "$([[ -n ${KEYCLOAK_ADMIN_PASSWORD:-} ]] && echo set || echo unset)"
    printf "  MONGO_PASSWORD:           %s\n" "$([[ -n ${MONGO_PASSWORD:-} ]] && echo set || echo unset)"
    printf "  KEYCLOAK_CLIENT_SECRET:   %s\n" "$([[ -n ${KEYCLOAK_CLIENT_SECRET:-} ]] && echo set || echo unset)"
    printf "  AUTH_SECRET/NEXTAUTH:     %s\n" "$([[ -n ${AUTH_SECRET:-}${NEXTAUTH_SECRET:-} ]] && echo set || echo unset)"
    printf "  JWT_SECRET:               %s\n" "$([[ -n ${JWT_SECRET:-} ]] && echo set || echo unset)"
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_status() {
    local action="${1:-status}"
    shift || true
    
    case "$action" in
        status)   cmd_status "$@" ;;
        brief)    cmd_status_brief "$@" ;;
        health)   cmd_health "$@" ;;
        diagnostics) cmd_diagnostics "$@" ;;
        validate) cmd_validate "$@" ;;
        info)     cmd_info "$@" ;;
        env|print) cmd_env_print "$@" ;;
        opal)     cmd_opal_health "$@" ;;
        *)        module_status_help ;;
    esac
}

module_status_help() {
    echo -e "${BOLD}Status Commands:${NC}"
    echo "  status              Show overall status"
    echo "  health              Health check all services"
    echo "  diagnostics         Health plus host probes (KC/BE/FE)"
    echo "  validate            Validate prerequisites and configuration"
    echo "  info                Show environment info"
    echo "  env|print           Show effective env profile (sanitized)"
    echo "  opal                Quick OPAL health summary (server/client)"
}

# =============================================================================
# OPAL QUICK HEALTH SUMMARY
# =============================================================================
cmd_opal_health() {
    print_header
    echo -e "${BOLD}OPAL Health:${NC}"
    echo ""

    local server_url="https://localhost:7002/healthcheck"
    local client_url="http://localhost:8211/health"

    probe_opal "OPAL Server" "$server_url" true
    probe_opal "OPAL Client" "$client_url" false

    echo ""
    echo -e "${BOLD}Ports:${NC}"
    echo "  Server: 7002 (HTTPS)"
    echo "  Client: 8211 (health/OPA), 7006 (client API)"
}

probe_opal() {
    local name="$1"
    local url="$2"
    local insecure_tls="$3"
    local code
    if [ "$insecure_tls" = true ]; then
        code=$(curl -k -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" || echo "000")
    else
        code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" || echo "000")
    fi
    if [ "$code" = "200" ]; then
        echo -e "  ${GREEN}●${NC} $name ($code) - $url"
    else
        echo -e "  ${RED}○${NC} $name ($code) - $url"
    fi
}





