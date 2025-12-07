#!/bin/bash
# =============================================================================
# DIVE V3 CLI - Status & Health Module
# =============================================================================
# Commands: status, health, validate, info
# =============================================================================

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
    
    echo ""
    echo -e "${BOLD}Remote Endpoints:${NC}"
    for endpoint in "usa-app.dive25.com" "usa-api.dive25.com" "usa-idp.dive25.com"; do
        local code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "https://$endpoint" 2>/dev/null || echo "000")
        if [ "$code" = "200" ] || [ "$code" = "302" ]; then
            echo -e "  ${GREEN}●${NC} $endpoint (${code})"
        else
            echo -e "  ${RED}○${NC} $endpoint (${code})"
        fi
    done
    
    echo ""
    echo -e "${BOLD}Environment:${NC}"
    echo "  Mode:     $ENVIRONMENT"
    echo "  Instance: $INSTANCE"
    echo "  Project:  $GCP_PROJECT"
}

cmd_health() {
    print_header
    echo -e "${BOLD}Service Health Checks:${NC}"
    echo ""
    
    local services=("frontend:3000" "backend:4000" "keycloak:8443" "postgres:5432" "mongo:27017" "redis:6379" "opa:8181" "opal-server:7002")
    
    for svc in "${services[@]}"; do
        local name="${svc%%:*}"
        local port="${svc##*:}"
        local container="dive-pilot-${name}"
        
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
                if curl -fs --max-time 3 "http://localhost:$port/healthcheck" >/dev/null 2>&1; then
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
    
    # gcloud
    echo -n "  GCP (gcloud):  "
    if check_gcloud 2>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        ((errors++))
    fi
    
    # Terraform
    echo -n "  Terraform:     "
    if check_terraform 2>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        ((errors++))
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
    local tf_count=$(find terraform -name "*.tf" 2>/dev/null | wc -l | tr -d ' ')
    echo -e "${GREEN}${tf_count} files${NC}"
    
    # GCP Secrets
    echo -n "  GCP Secrets:   "
    if check_gcloud 2>/dev/null; then
        local secret_count=$(gcloud secrets list --project="$GCP_PROJECT" --filter="name:dive-v3" --format="value(name)" 2>/dev/null | wc -l | tr -d ' ')
        echo -e "${GREEN}${secret_count} configured${NC}"
    else
        echo -e "${YELLOW}unable to check${NC}"
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

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_status() {
    local action="${1:-status}"
    shift || true
    
    case "$action" in
        status)   cmd_status "$@" ;;
        health)   cmd_health "$@" ;;
        validate) cmd_validate "$@" ;;
        info)     cmd_info "$@" ;;
        *)        module_status_help ;;
    esac
}

module_status_help() {
    echo -e "${BOLD}Status Commands:${NC}"
    echo "  status              Show overall status"
    echo "  health              Health check all services"
    echo "  validate            Validate prerequisites and configuration"
    echo "  info                Show environment info"
}




