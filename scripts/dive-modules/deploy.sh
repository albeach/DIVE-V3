#!/bin/bash
# =============================================================================
# DIVE V3 CLI - Deployment Commands Module
# =============================================================================
# Commands: deploy, reset, nuke
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# DEPLOYMENT COMMANDS
# =============================================================================

cmd_deploy() {
    local target="${1:-local}"
    
    print_header
    echo -e "${BOLD}Full Deployment Workflow${NC}"
    echo -e "Target: ${CYAN}$target${NC}"
    echo ""
    
    local steps=(
        "1. Validate prerequisites"
        "2. Load secrets"
        "3. Generate SSL certificates (if needed)"
        "4. Stop existing containers"
        "5. Remove old volumes (clean deploy)"
        "6. Start infrastructure services"
        "7. Wait for services to be healthy"
        "8. Apply Terraform configuration"
        "9. Seed database"
        "10. Verify deployment"
    )
    
    # Show plan
    echo -e "${BOLD}Deployment Steps:${NC}"
    for step in "${steps[@]}"; do
        echo "  $step"
    done
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}DRY-RUN MODE - No changes will be made${NC}"
        echo ""
        
        log_dry "Step 1: cmd_validate"
        log_dry "Step 2: load_secrets (env=$ENVIRONMENT, instance=$INSTANCE)"
        log_dry "Step 3: check_certs"
        log_dry "Step 4: docker compose down -v"
        log_dry "Step 5: docker volume rm postgres_data mongo_data redis_data"
        log_dry "Step 6: docker compose up -d"
        log_dry "Step 7: wait 60s + health checks"
        log_dry "Step 8: terraform apply -var-file=$INSTANCE.tfvars"
        log_dry "Step 9: npm run seed:$INSTANCE"
        log_dry "Step 10: curl health endpoints"
        return 0
    fi
    
    ensure_dive_root
    cd "$DIVE_ROOT"
    
    # Load status module for cmd_validate
    source "$(dirname "${BASH_SOURCE[0]}")/status.sh"
    
    # Execute deployment
    log_step "Step 1: Validating prerequisites..."
    cmd_validate || { log_error "Validation failed"; return 1; }
    
    log_step "Step 2: Loading secrets..."
    load_secrets || { log_error "Failed to load secrets"; return 1; }
    
    log_step "Step 3: Checking SSL certificates..."
    check_certs || { log_error "Certificate generation failed"; return 1; }
    
    log_step "Step 4: Stopping existing containers..."
    docker compose -f docker-compose.yml down -v 2>/dev/null || true
    docker compose -f docker-compose.pilot.yml down -v 2>/dev/null || true
    
    log_step "Step 5: Removing old volumes..."
    docker volume rm dive-v3_postgres_data dive-v3_mongo_data dive-v3_redis_data 2>/dev/null || true
    docker volume rm dive-pilot_postgres_data dive-pilot_mongo_data dive-pilot_redis_data 2>/dev/null || true
    
    log_step "Step 6: Starting infrastructure services..."
    docker compose -f docker-compose.yml up -d
    
    log_step "Step 7: Waiting for services (90s)..."
    local wait_time=0
    while [ $wait_time -lt 90 ]; do
        sleep 10
        wait_time=$((wait_time + 10))
        echo "  ${wait_time}s elapsed..."
        
        # Check if Keycloak is ready
        if curl -kfs --max-time 3 "https://localhost:8443/health" >/dev/null 2>&1; then
            log_success "Keycloak is healthy!"
            break
        fi
    done
    
    log_step "Step 8: Applying Terraform configuration..."
    cd "${DIVE_ROOT}/terraform/pilot"
    [ ! -d ".terraform" ] && terraform init
    terraform apply -var-file="${INSTANCE}.tfvars" -auto-approve
    cd "${DIVE_ROOT}"
    
    log_step "Step 9: Seeding database..."
    source "$(dirname "${BASH_SOURCE[0]}")/db.sh"
    cmd_seed "$INSTANCE" || log_warn "Seeding may have issues (check logs)"
    
    log_step "Step 10: Verifying deployment..."
    cmd_health
    
    echo ""
    log_success "Deployment complete!"
    echo ""
    echo "  Frontend: https://localhost:3000"
    echo "  Backend:  https://localhost:4000"
    echo "  Keycloak: https://localhost:8443"
    echo "  OPAL:     http://localhost:7002"
}

cmd_reset() {
    print_header
    echo -e "${RED}⚠️  RESETTING TO CLEAN STATE...${NC}"
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Step 1: docker compose down -v --remove-orphans"
        log_dry "Step 2: check_certs"
        log_dry "Step 3: load_secrets"
        log_dry "Step 4: docker compose up -d"
        log_dry "Step 5: sleep 60 && terraform apply"
        return 0
    fi
    
    # Full deployment workflow
    cmd_deploy local
}

cmd_nuke() {
    log_warn "NUKING EVERYTHING (containers + volumes + networks)..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker compose -f docker-compose.yml down -v --remove-orphans"
        log_dry "docker compose -f docker-compose.pilot.yml down -v --remove-orphans"
        log_dry "docker volume prune -f"
        return 0
    fi
    
    ensure_dive_root
    cd "$DIVE_ROOT"
    
    docker compose -f docker-compose.yml down -v --remove-orphans 2>/dev/null || true
    docker compose -f docker-compose.pilot.yml down -v --remove-orphans 2>/dev/null || true
    docker volume prune -f 2>/dev/null || true
    
    log_success "Clean slate achieved"
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_deploy() {
    local action="${1:-deploy}"
    shift || true
    
    case "$action" in
        deploy) cmd_deploy "$@" ;;
        reset)  cmd_reset "$@" ;;
        clean)  cmd_reset "$@" ;;
        nuke)   cmd_nuke ;;
        *)      module_deploy_help ;;
    esac
}

module_deploy_help() {
    echo -e "${BOLD}Deployment Commands:${NC}"
    echo "  deploy              Full deployment workflow"
    echo "  reset               Reset to clean state (nuke + deploy)"
    echo "  nuke                Destroy everything (containers + volumes)"
}



