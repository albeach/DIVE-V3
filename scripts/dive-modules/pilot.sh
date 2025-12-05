#!/bin/bash
# =============================================================================
# DIVE V3 CLI - Pilot VM Commands Module
# =============================================================================
# Commands: up, down, status, logs, ssh, reset, deploy
# Manages the remote pilot VM on GCP
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

pilot_cmd() {
    local cmd="$1"
    shift
    
    log_step "Executing on pilot VM ($PILOT_VM)..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "gcloud compute ssh $PILOT_VM --zone=$PILOT_ZONE --project=$GCP_PROJECT --command=\"$cmd\""
        return 0
    fi
    
    gcloud compute ssh "$PILOT_VM" --zone="$PILOT_ZONE" --project="$GCP_PROJECT" --command="$cmd" "$@"
}

# =============================================================================
# PILOT COMMANDS
# =============================================================================

pilot_up() {
    log_step "Starting services on pilot VM..."
    
    load_gcp_secrets "$INSTANCE"
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would create .env with secrets on VM"
        log_dry "Would run: docker compose -f docker-compose.pilot.yml up -d"
        return 0
    fi
    
    # Create env file and start
    local env_content="POSTGRES_PASSWORD=$POSTGRES_PASSWORD
KEYCLOAK_ADMIN_PASSWORD=$KEYCLOAK_ADMIN_PASSWORD
MONGO_PASSWORD=$MONGO_PASSWORD
AUTH_SECRET=$AUTH_SECRET
KEYCLOAK_CLIENT_SECRET=$KEYCLOAK_CLIENT_SECRET
JWT_SECRET=$JWT_SECRET
NEXTAUTH_SECRET=$NEXTAUTH_SECRET"
    
    echo "$env_content" | gcloud compute ssh "$PILOT_VM" --zone="$PILOT_ZONE" --project="$GCP_PROJECT" --command="
cat > /opt/dive-v3/.env
cd /opt/dive-v3
sudo docker compose --env-file .env -f docker-compose.pilot.yml up -d
echo ''
echo 'Service status:'
sudo docker compose -f docker-compose.pilot.yml ps
"
    
    log_success "Pilot VM services started"
    echo "  Frontend: https://usa-app.dive25.com"
    echo "  Keycloak: https://usa-idp.dive25.com"
}

pilot_down() {
    pilot_cmd "cd /opt/dive-v3 && sudo docker compose -f docker-compose.pilot.yml down"
}

pilot_status() {
    pilot_cmd "cd /opt/dive-v3 && sudo docker compose -f docker-compose.pilot.yml ps && echo '' && sudo docker compose -f docker-compose.pilot.yml logs --tail=20"
}

pilot_logs() {
    local service="${1:-}"
    if [ -n "$service" ]; then
        pilot_cmd "cd /opt/dive-v3 && sudo docker compose -f docker-compose.pilot.yml logs -f $service"
    else
        pilot_cmd "cd /opt/dive-v3 && sudo docker compose -f docker-compose.pilot.yml logs -f"
    fi
}

pilot_ssh() {
    if [ "$DRY_RUN" = true ]; then
        log_dry "gcloud compute ssh $PILOT_VM --zone=$PILOT_ZONE --project=$GCP_PROJECT"
        return 0
    fi
    gcloud compute ssh "$PILOT_VM" --zone="$PILOT_ZONE" --project="$GCP_PROJECT"
}

pilot_reset() {
    log_warn "Resetting pilot VM to clean state..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would stop services and remove volumes on VM"
        log_dry "Would restart services with GCP secrets"
        return 0
    fi
    
    load_gcp_secrets "$INSTANCE"
    
    pilot_cmd "
cd /opt/dive-v3
echo 'Stopping services...'
sudo docker compose -f docker-compose.pilot.yml down -v 2>/dev/null || true
echo 'Removing volumes...'
sudo docker volume rm dive-v3_postgres_data dive-v3_mongo_data dive-v3_redis_data 2>/dev/null || true
"
    
    pilot_up
}

pilot_deploy() {
    log_step "Full deployment to pilot VM..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "pilot_reset"
        log_dry "Wait 90s for services"
        log_dry "terraform apply"
        log_dry "seed database"
        return 0
    fi
    
    pilot_reset
    
    log_info "Waiting for services to be healthy (90s)..."
    sleep 90
    
    log_step "Applying Terraform..."
    source "$(dirname "${BASH_SOURCE[0]}")/terraform.sh"
    module_terraform apply pilot
    
    log_step "Seeding database..."
    pilot_cmd "cd /opt/dive-v3 && sudo docker exec dive-pilot-backend npm run seed 2>/dev/null || echo 'Seeding skipped'"
    
    log_success "Pilot deployment complete!"
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_pilot() {
    local action="${1:-help}"
    shift || true
    
    case "$action" in
        up)     pilot_up ;;
        down)   pilot_down ;;
        status) pilot_status ;;
        logs)   pilot_logs "$@" ;;
        ssh)    pilot_ssh ;;
        reset)  pilot_reset ;;
        deploy) pilot_deploy ;;
        *)      module_pilot_help ;;
    esac
}

module_pilot_help() {
    echo -e "${BOLD}Pilot VM Commands:${NC}"
    echo "  up            Start services on pilot VM"
    echo "  down          Stop services on pilot VM"
    echo "  status        Show pilot VM status"
    echo "  logs [svc]    View pilot VM logs"
    echo "  ssh           SSH into pilot VM"
    echo "  reset         Reset pilot VM to clean state"
    echo "  deploy        Full deployment to pilot VM"
}



