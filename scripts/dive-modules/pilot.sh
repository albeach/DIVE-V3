#!/usr/local/bin/bash
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

# =============================================================================
# CHECKPOINT AND ROLLBACK FUNCTIONS
# =============================================================================

GCS_CHECKPOINT_BUCKET="${GCS_CHECKPOINT_BUCKET:-dive25-checkpoints}"

pilot_checkpoint_create() {
    local name="${1:-$(date +%Y%m%d_%H%M%S)}"
    
    log_step "Creating pilot checkpoint: ${name}"
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Backup volumes to GCS: gs://${GCS_CHECKPOINT_BUCKET}/pilot/${name}/"
        return 0
    fi
    
    # Create checkpoint on VM and upload to GCS
    pilot_cmd "
cd /opt/dive-v3

# Create local checkpoint directory
mkdir -p /tmp/checkpoint-${name}

# Backup volumes
echo 'Backing up postgres_data...'
sudo docker run --rm -v dive-pilot_postgres_data:/data:ro -v /tmp/checkpoint-${name}:/backup alpine tar czf /backup/postgres_data.tar.gz -C /data . 2>/dev/null || echo 'Volume not found'

echo 'Backing up mongo_data...'
sudo docker run --rm -v dive-pilot_mongo_data:/data:ro -v /tmp/checkpoint-${name}:/backup alpine tar czf /backup/mongo_data.tar.gz -C /data . 2>/dev/null || echo 'Volume not found'

echo 'Backing up redis_data...'
sudo docker run --rm -v dive-pilot_redis_data:/data:ro -v /tmp/checkpoint-${name}:/backup alpine tar czf /backup/redis_data.tar.gz -C /data . 2>/dev/null || echo 'Volume not found'

# Upload to GCS
echo 'Uploading to GCS...'
gsutil -m cp -r /tmp/checkpoint-${name}/* gs://${GCS_CHECKPOINT_BUCKET}/pilot/${name}/ 2>/dev/null || echo 'GCS upload failed - check permissions'

# Cleanup
rm -rf /tmp/checkpoint-${name}

echo '${name}' > /opt/dive-v3/.latest-checkpoint
echo 'Checkpoint created: ${name}'
"
    
    log_success "Pilot checkpoint created: ${name}"
}

pilot_checkpoint_list() {
    log_step "Listing pilot checkpoints..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "gsutil ls gs://${GCS_CHECKPOINT_BUCKET}/pilot/"
        return 0
    fi
    
    echo -e "${BOLD}Available Checkpoints:${NC}"
    gsutil ls "gs://${GCS_CHECKPOINT_BUCKET}/pilot/" 2>/dev/null | sed 's|gs://.*pilot/||g' | sed 's|/$||g' | grep -v '^$' || echo "  No checkpoints found"
    
    echo ""
    echo -e "${BOLD}Latest checkpoint on VM:${NC}"
    pilot_cmd "cat /opt/dive-v3/.latest-checkpoint 2>/dev/null || echo '  No checkpoint recorded'"
}

pilot_rollback() {
    local target="${1:-}"
    
    if [ -z "$target" ]; then
        # Get latest checkpoint from VM
        target=$(gcloud compute ssh "$PILOT_VM" --zone="$PILOT_ZONE" --project="$GCP_PROJECT" --command="cat /opt/dive-v3/.latest-checkpoint 2>/dev/null" 2>/dev/null || echo "")
        if [ -z "$target" ]; then
            log_error "No checkpoint specified and no latest checkpoint found"
            pilot_checkpoint_list
            return 1
        fi
    fi
    
    log_step "Rolling back pilot to checkpoint: ${target}"
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Stop services"
        log_dry "Restore volumes from gs://${GCS_CHECKPOINT_BUCKET}/pilot/${target}/"
        log_dry "Start services"
        return 0
    fi
    
    # Stop services
    log_verbose "Stopping services..."
    pilot_down
    
    # Restore from GCS
    pilot_cmd "
cd /opt/dive-v3

# Download from GCS
mkdir -p /tmp/restore-${target}
echo 'Downloading checkpoint from GCS...'
gsutil -m cp -r gs://${GCS_CHECKPOINT_BUCKET}/pilot/${target}/* /tmp/restore-${target}/ 2>/dev/null || { echo 'GCS download failed'; exit 1; }

# Remove existing volumes
echo 'Removing existing volumes...'
sudo docker volume rm dive-pilot_postgres_data dive-pilot_mongo_data dive-pilot_redis_data 2>/dev/null || true

# Restore volumes
echo 'Restoring postgres_data...'
sudo docker volume create dive-pilot_postgres_data
if [ -f /tmp/restore-${target}/postgres_data.tar.gz ]; then
    sudo docker run --rm -v dive-pilot_postgres_data:/data -v /tmp/restore-${target}:/backup alpine tar xzf /backup/postgres_data.tar.gz -C /data
fi

echo 'Restoring mongo_data...'
sudo docker volume create dive-pilot_mongo_data
if [ -f /tmp/restore-${target}/mongo_data.tar.gz ]; then
    sudo docker run --rm -v dive-pilot_mongo_data:/data -v /tmp/restore-${target}:/backup alpine tar xzf /backup/mongo_data.tar.gz -C /data
fi

echo 'Restoring redis_data...'
sudo docker volume create dive-pilot_redis_data
if [ -f /tmp/restore-${target}/redis_data.tar.gz ]; then
    sudo docker run --rm -v dive-pilot_redis_data:/data -v /tmp/restore-${target}:/backup alpine tar xzf /backup/redis_data.tar.gz -C /data
fi

# Cleanup
rm -rf /tmp/restore-${target}
echo 'Volumes restored'
"
    
    # Start services
    log_verbose "Starting services..."
    pilot_up
    
    # Health check
    log_step "Verifying health..."
    sleep 30
    pilot_health
    
    log_success "Rollback complete to checkpoint: ${target}"
}

pilot_health() {
    log_step "Checking pilot health..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Check Keycloak: https://usa-idp.dive25.com/realms/master"
        log_dry "Check Backend: https://usa-api.dive25.com/health"
        log_dry "Check Frontend: https://usa-app.dive25.com"
        return 0
    fi
    
    local all_healthy=true
    
    # Check Keycloak
    if curl -sfk --max-time 10 "https://usa-idp.dive25.com/realms/master" >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Keycloak: healthy"
    else
        echo -e "  ${RED}✗${NC} Keycloak: unhealthy"
        all_healthy=false
    fi
    
    # Check Backend
    if curl -sfk --max-time 10 "https://usa-api.dive25.com/health" >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Backend: healthy"
    else
        echo -e "  ${RED}✗${NC} Backend: unhealthy"
        all_healthy=false
    fi
    
    # Check Frontend
    if curl -sfk --max-time 10 "https://usa-app.dive25.com" >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Frontend: healthy"
    else
        echo -e "  ${RED}✗${NC} Frontend: unhealthy"
        all_healthy=false
    fi
    
    if [ "$all_healthy" = true ]; then
        return 0
    else
        return 1
    fi
}

pilot_deploy() {
    log_step "Full deployment to pilot VM..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Create checkpoint (pre-deploy)"
        log_dry "pilot_reset"
        log_dry "Wait for services"
        log_dry "terraform apply"
        log_dry "seed database"
        log_dry "health check"
        return 0
    fi
    
    # Create checkpoint before deployment
    log_step "Creating pre-deploy checkpoint..."
    pilot_checkpoint_create "pre-deploy-$(date +%Y%m%d_%H%M%S)" 2>/dev/null || log_warn "Checkpoint creation failed (may be first deploy)"
    
    # Reset and start fresh
    pilot_reset
    
    # Wait for services with exponential backoff
    log_step "Waiting for services to be healthy..."
    local elapsed=0
    local timeout=180
    local delay=5
    
    while [ $elapsed -lt $timeout ]; do
        if pilot_health 2>/dev/null; then
            log_success "Services are healthy!"
            break
        fi
        sleep $delay
        elapsed=$((elapsed + delay))
        delay=$((delay * 2 > 30 ? 30 : delay * 2))
        log_verbose "Waiting... (${elapsed}s/${timeout}s)"
    done
    
    if [ $elapsed -ge $timeout ]; then
        log_error "Services did not become healthy within ${timeout}s"
        log_info "You can check status with: ./dive --env gcp pilot status"
        return 1
    fi
    
    log_step "Applying Terraform..."
    source "$(dirname "${BASH_SOURCE[0]}")/terraform.sh"
    module_terraform apply pilot
    
    log_step "Seeding database..."
    pilot_cmd "cd /opt/dive-v3 && sudo docker exec dive-pilot-backend npm run seed 2>/dev/null || echo 'Seeding skipped'"
    
    # Final health check
    log_step "Final health check..."
    if pilot_health; then
        log_success "Pilot deployment complete!"
        echo ""
        echo "  Frontend: https://usa-app.dive25.com"
        echo "  Backend:  https://usa-api.dive25.com"
        echo "  Keycloak: https://usa-idp.dive25.com"
    else
        log_warn "Deployment complete but some services may be unhealthy"
        log_info "Run: ./dive --env gcp pilot status"
    fi
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_pilot() {
    local action="${1:-help}"
    shift || true
    
    case "$action" in
        up)         pilot_up ;;
        down)       pilot_down ;;
        status)     pilot_status ;;
        health)     pilot_health ;;
        logs)       pilot_logs "$@" ;;
        ssh)        pilot_ssh ;;
        reset)      pilot_reset ;;
        deploy)     pilot_deploy ;;
        rollback)   pilot_rollback "$@" ;;
        checkpoint)
            local sub="${1:-list}"
            shift || true
            case "$sub" in
                create) pilot_checkpoint_create "$@" ;;
                list)   pilot_checkpoint_list ;;
                *)      pilot_checkpoint_list ;;
            esac
            ;;
        *)          module_pilot_help ;;
    esac
}

module_pilot_help() {
    echo -e "${BOLD}Pilot VM Commands:${NC}"
    echo ""
    echo "  up                  Start services on pilot VM"
    echo "  down                Stop services on pilot VM"
    echo "  status              Show pilot VM status"
    echo "  health              Check pilot service health"
    echo "  logs [svc]          View pilot VM logs"
    echo "  ssh                 SSH into pilot VM"
    echo "  reset               Reset pilot VM to clean state"
    echo "  deploy              Full deployment to pilot VM"
    echo "  rollback [name]     Rollback to checkpoint"
    echo "  checkpoint create   Create GCS checkpoint"
    echo "  checkpoint list     List available checkpoints"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  ./dive --env gcp pilot deploy        # Full deployment"
    echo "  ./dive --env gcp pilot health        # Check health"
    echo "  ./dive --env gcp pilot checkpoint create  # Save state"
    echo "  ./dive --env gcp pilot rollback      # Restore latest"
}
