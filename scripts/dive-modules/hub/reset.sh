#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Hub Reset Sub-Module
# =============================================================================
# Hub reset and cleanup functions
# Loaded on-demand via lazy loading
# =============================================================================

# Mark reset module as loaded
export DIVE_HUB_RESET_LOADED=1

hub_reset() {
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}              Hub Reset (Development Only)                  ${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
    echo ""

    echo -e "${RED}${BOLD}⚠️  WARNING: This will destroy ALL hub data!${NC}"
    echo ""

    # Require explicit confirmation
    local confirm
    read -p "Type 'RESET' to confirm: " confirm

    if [ "$confirm" != "RESET" ]; then
        echo ""
        log_warn "Hub reset cancelled"
        return 1
    fi

    echo ""
    log_step "Stopping hub services..."

    if [ "$DRY_RUN" = true ]; then
        log_dry "docker compose -f docker-compose.hub.yml down -v --remove-orphans"
    else
        export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dive-hub}"
        docker compose -f "${DIVE_ROOT}/docker-compose.hub.yml" down -v --remove-orphans 2>/dev/null
        log_success "Hub containers and volumes removed"
    fi

    echo ""
    log_step "Cleaning up volumes..."

    if [ "$DRY_RUN" = false ]; then
        docker volume ls --filter name=dive-hub --format '{{.Name}}' | while read -r vol; do
            docker volume rm "$vol" 2>/dev/null
        done
    fi

    echo ""
    log_step "Redeploying hub..."
    _load_hub_deploy && hub_deploy "$@"

    local result=$?

    echo ""
    if [ $result -eq 0 ]; then
        log_success "Hub reset complete - fresh deployment ready"
        echo ""
        echo "Next steps:"
        echo "  1. Verify hub: ./dive hub verify"
        echo "  2. Redeploy spokes: ./dive spoke deploy <code>"
    else
        log_error "Hub reset failed during redeployment"
    fi

    return $result
}