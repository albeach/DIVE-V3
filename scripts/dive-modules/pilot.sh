#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Pilot VM Commands Module
# =============================================================================
# Commands: up, down, status, logs, ssh, reset, deploy
# Manages the remote pilot VM on GCP
#
# Architecture:
#   Hub (USA):  Always deployed as the federation hub
#   Spoke:      Random NATO country selected at deployment time
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Source NATO countries database for random spoke selection
source "${DIVE_ROOT}/scripts/nato-countries.sh"

# =============================================================================
# SPOKE SELECTION
# =============================================================================

# Cache file for the currently selected spoke
PILOT_SPOKE_CACHE="${DIVE_ROOT}/.pilot-spoke"

# Get list of NATO countries excluding USA (hub)
_get_available_spokes() {
    local countries=()
    for code in "${!NATO_COUNTRIES[@]}"; do
        if [ "$code" != "USA" ]; then
            countries+=("$code")
        fi
    done
    echo "${countries[@]}"
}

# Select a random NATO country for the pilot spoke
_select_random_spoke() {
    local available=($(_get_available_spokes))
    local count=${#available[@]}
    local random_index=$((RANDOM % count))
    echo "${available[$random_index]}"
}

# Get or select the pilot spoke country
# Uses cached value if available, otherwise selects random
_get_pilot_spoke() {
    local force_new="${1:-false}"

    if [ "$force_new" = true ] || [ ! -f "$PILOT_SPOKE_CACHE" ]; then
        local spoke=$(_select_random_spoke)
        echo "$spoke" > "$PILOT_SPOKE_CACHE"
        echo "$spoke"
    else
        cat "$PILOT_SPOKE_CACHE"
    fi
}

# Get spoke port configuration (aligns with spoke.sh)
_get_spoke_ports() {
    local code="${1^^}"
    local port_offset=$(get_country_offset "$code")

    # Fallback to hash-based offset if country not found
    if [ -z "$port_offset" ]; then
        port_offset=$(( ($(echo "$code" | cksum | cut -d' ' -f1) % 20) + 48 ))
    fi

    echo "SPOKE_PORT_OFFSET=$port_offset"
    echo "SPOKE_FRONTEND_PORT=$((3000 + port_offset))"
    echo "SPOKE_BACKEND_PORT=$((4000 + port_offset))"
    echo "SPOKE_KEYCLOAK_HTTPS_PORT=$((8443 + port_offset))"
    echo "SPOKE_KEYCLOAK_HTTP_PORT=$((8080 + port_offset))"
    echo "SPOKE_POSTGRES_PORT=$((5432 + port_offset))"
    echo "SPOKE_MONGODB_PORT=$((27017 + port_offset))"
    echo "SPOKE_REDIS_PORT=$((6379 + port_offset))"
    echo "SPOKE_OPA_PORT=$((8181 + (port_offset * 10)))"
    echo "SPOKE_KAS_PORT=$((9000 + port_offset))"
}

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
    # Get spoke country (use cached or select new if not exists)
    local spoke_code=$(_get_pilot_spoke)
    local spoke_lower="${spoke_code,,}"
    local spoke_name=$(get_country_name "$spoke_code")
    local spoke_flag=$(get_country_flag "$spoke_code")

    # Get spoke ports
    eval "$(_get_spoke_ports "$spoke_code")"

    # Get spoke theming
    local spoke_theme_primary=$(get_country_primary_color "$spoke_code")
    local spoke_theme_secondary=$(get_country_secondary_color "$spoke_code")
    local spoke_timezone=$(get_country_timezone "$spoke_code")

    log_step "Starting services on pilot VM..."
    echo ""
    echo -e "${BOLD}Hub:${NC}   USA 🇺🇸 (United States)"
    echo -e "${BOLD}Spoke:${NC} ${spoke_code} ${spoke_flag} (${spoke_name})"
    echo ""

    # Load secrets for Hub (USA)
    load_gcp_secrets "usa"

    # Load secrets for Spoke (dynamic country)
    # Try loading country-specific secrets, fallback to generic if not available
    if ! load_gcp_secrets "$spoke_lower" 2>/dev/null; then
        log_warn "No GCP secrets for ${spoke_code}, generating ephemeral secrets..."
        export POSTGRES_PASSWORD_SPOKE=$(openssl rand -base64 16 | tr -d '/+=')
        export KEYCLOAK_ADMIN_PASSWORD_SPOKE=$(openssl rand -base64 16 | tr -d '/+=')
        export MONGO_PASSWORD_SPOKE=$(openssl rand -base64 16 | tr -d '/+=')
        export REDIS_PASSWORD_SPOKE=$(openssl rand -base64 16 | tr -d '/+=')
        export NEXTAUTH_SECRET_SPOKE=$(openssl rand -base64 32)
        export KEYCLOAK_CLIENT_SECRET_SPOKE=$(openssl rand -base64 24 | tr -d '/+=')
    else
        # Map loaded secrets to SPOKE_ prefixed variables
        export POSTGRES_PASSWORD_SPOKE="${POSTGRES_PASSWORD_SPOKE:-$(eval echo "\$POSTGRES_PASSWORD_${spoke_code}")}"
        export KEYCLOAK_ADMIN_PASSWORD_SPOKE="${KEYCLOAK_ADMIN_PASSWORD_SPOKE:-$(eval echo "\$KEYCLOAK_ADMIN_PASSWORD_${spoke_code}")}"
        export MONGO_PASSWORD_SPOKE="${MONGO_PASSWORD_SPOKE:-$(eval echo "\$MONGO_PASSWORD_${spoke_code}")}"
        export REDIS_PASSWORD_SPOKE="${REDIS_PASSWORD_SPOKE:-$(eval echo "\$REDIS_PASSWORD_${spoke_code}")}"
        export NEXTAUTH_SECRET_SPOKE="${NEXTAUTH_SECRET_SPOKE:-$(eval echo "\$NEXTAUTH_SECRET_${spoke_code}")}"
        export KEYCLOAK_CLIENT_SECRET_SPOKE="${KEYCLOAK_CLIENT_SECRET_SPOKE:-$(eval echo "\$KEYCLOAK_CLIENT_SECRET_${spoke_code}")}"
    fi

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would create .env with Hub (USA) + Spoke (${spoke_code}) secrets on VM"
        log_dry "Would run: docker compose -f docker-compose.pilot.yml up -d"
        return 0
    fi

    # Create env file with Hub (USA) and Spoke secrets
    local env_content="# =============================================================================
# DIVE V3 Pilot Secrets - Hub (USA) + Spoke (${spoke_code})
# Generated by: ./dive --env gcp pilot up
# Spoke selected: ${spoke_name} (${spoke_code})
# =============================================================================

# Hub (USA) Secrets
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD}
MONGO_PASSWORD=${MONGO_PASSWORD}
AUTH_SECRET=${AUTH_SECRET}
KEYCLOAK_CLIENT_SECRET=${KEYCLOAK_CLIENT_SECRET}
REDIS_PASSWORD_USA=${REDIS_PASSWORD_USA:-${REDIS_PASSWORD}}
REDIS_PASSWORD_BLACKLIST=${REDIS_PASSWORD_BLACKLIST}
OPAL_AUTH_MASTER_TOKEN=${OPAL_AUTH_MASTER_TOKEN:-dive-hub-master-token-2025}

# Hub Hostnames
HUB_HOSTNAME=usa-idp.dive25.com
HUB_APP_HOSTNAME=usa-app.dive25.com
HUB_API_HOSTNAME=usa-api.dive25.com

# Spoke (${spoke_code}) Configuration
SPOKE_CODE=${spoke_code}
SPOKE_CODE_LOWER=${spoke_lower}
SPOKE_NAME=${spoke_name}

# Spoke (${spoke_code}) Ports
SPOKE_FRONTEND_PORT=${SPOKE_FRONTEND_PORT}
SPOKE_BACKEND_PORT=${SPOKE_BACKEND_PORT}
SPOKE_KEYCLOAK_HTTPS_PORT=${SPOKE_KEYCLOAK_HTTPS_PORT}
SPOKE_KEYCLOAK_HTTP_PORT=${SPOKE_KEYCLOAK_HTTP_PORT}
SPOKE_POSTGRES_PORT=${SPOKE_POSTGRES_PORT}
SPOKE_MONGODB_PORT=${SPOKE_MONGODB_PORT}
SPOKE_REDIS_PORT=${SPOKE_REDIS_PORT}
SPOKE_OPA_PORT=${SPOKE_OPA_PORT}
SPOKE_KAS_PORT=${SPOKE_KAS_PORT}

# Spoke (${spoke_code}) Secrets
POSTGRES_PASSWORD_SPOKE=${POSTGRES_PASSWORD_SPOKE}
KEYCLOAK_ADMIN_PASSWORD_SPOKE=${KEYCLOAK_ADMIN_PASSWORD_SPOKE}
MONGO_PASSWORD_SPOKE=${MONGO_PASSWORD_SPOKE}
REDIS_PASSWORD_SPOKE=${REDIS_PASSWORD_SPOKE}
NEXTAUTH_SECRET_SPOKE=${NEXTAUTH_SECRET_SPOKE}
KEYCLOAK_CLIENT_SECRET_SPOKE=${KEYCLOAK_CLIENT_SECRET_SPOKE}
SPOKE_OPAL_TOKEN=${SPOKE_OPAL_TOKEN:-}

# Spoke (${spoke_code}) Hostnames
SPOKE_HOSTNAME=${spoke_lower}-idp.dive25.com
SPOKE_APP_HOSTNAME=${spoke_lower}-app.dive25.com
SPOKE_API_HOSTNAME=${spoke_lower}-api.dive25.com

# Spoke (${spoke_code}) Theming
SPOKE_THEME_PRIMARY=${spoke_theme_primary:-#1a365d}
SPOKE_THEME_SECONDARY=${spoke_theme_secondary:-#2b6cb0}
SPOKE_TIMEZONE=${spoke_timezone:-UTC}"

    echo "$env_content" | gcloud compute ssh "$PILOT_VM" --zone="$PILOT_ZONE" --project="$GCP_PROJECT" --command="
sudo tee /opt/dive-v3/.env > /dev/null
cd /opt/dive-v3
echo 'Creating shared network...'
sudo docker network create dive-v3-shared-network 2>/dev/null || true

# Ensure spoke instance directory exists with certs
echo 'Preparing spoke instance directory...'
sudo mkdir -p /opt/dive-v3/instances/${spoke_lower}/certs
sudo mkdir -p /opt/dive-v3/instances/${spoke_lower}/truststores
sudo cp -n /opt/dive-v3/keycloak/certs/* /opt/dive-v3/instances/${spoke_lower}/certs/ 2>/dev/null || true
sudo cp -n /opt/dive-v3/keycloak/certs/mkcert-rootCA.pem /opt/dive-v3/instances/${spoke_lower}/truststores/ 2>/dev/null || true
sudo chown -R ubuntu:ubuntu /opt/dive-v3/instances/${spoke_lower}

echo 'Starting Hub (USA) + Spoke (${spoke_code}) services...'
sudo docker compose --env-file .env -f docker-compose.pilot.yml up -d
echo ''
echo 'Service status:'
sudo docker compose -f docker-compose.pilot.yml ps
"

    log_success "Pilot VM services started"
    echo ""
    echo -e "${BOLD}Hub (USA 🇺🇸):${NC}"
    echo "  Frontend: https://usa-app.dive25.com"
    echo "  Backend:  https://usa-api.dive25.com"
    echo "  Keycloak: https://usa-idp.dive25.com"
    echo ""
    echo -e "${BOLD}Spoke (${spoke_code} ${spoke_flag}):${NC}"
    echo "  Frontend: https://${spoke_lower}-app.dive25.com (port ${SPOKE_FRONTEND_PORT})"
    echo "  Backend:  https://${spoke_lower}-api.dive25.com (port ${SPOKE_BACKEND_PORT})"
    echo "  Keycloak: https://${spoke_lower}-idp.dive25.com (port ${SPOKE_KEYCLOAK_HTTPS_PORT})"
}

pilot_down() {
    pilot_cmd "cd /opt/dive-v3 && sudo docker compose -f docker-compose.pilot.yml down"
}

pilot_status() {
    local spoke_code=$(_get_pilot_spoke)
    local spoke_name=$(get_country_name "$spoke_code")
    local spoke_flag=$(get_country_flag "$spoke_code")

    echo -e "${BOLD}Current Pilot Configuration:${NC}"
    echo "  Hub:   USA 🇺🇸 (United States)"
    echo "  Spoke: ${spoke_code} ${spoke_flag} (${spoke_name})"
    echo ""

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

# =============================================================================
# PILOT SYNC - Sync local files to pilot VM
# =============================================================================
pilot_sync() {
    log_step "Syncing local files to pilot VM..."

    if [ "$DRY_RUN" = true ]; then
        log_dry "gcloud compute scp docker-compose.pilot.yml docker/base/services.yml dive-v3-pilot:/tmp/"
        return 0
    fi

    # Create temp archive of essential files
    local tmp_tar=$(mktemp)
    tar -czf "$tmp_tar" \
        docker-compose.pilot.yml \
        docker/base/services.yml \
        docker/base/services.prod.yml \
        docker/opal-server.Dockerfile \
        docker/opal-server-entrypoint.sh \
        scripts/nato-countries.sh \
        2>/dev/null || true

    # Copy to VM
    gcloud compute scp "$tmp_tar" "$PILOT_VM:/tmp/dive-sync.tar.gz" \
        --zone="$PILOT_ZONE" --project="$GCP_PROJECT" --tunnel-through-iap

    # Extract on VM
    gcloud compute ssh "$PILOT_VM" --zone="$PILOT_ZONE" --project="$GCP_PROJECT" \
        --tunnel-through-iap --command="
cd /opt/dive-v3
sudo tar -xzf /tmp/dive-sync.tar.gz --overwrite
sudo chown -R ubuntu:ubuntu /opt/dive-v3
rm /tmp/dive-sync.tar.gz
echo 'Synced files:'
ls -la docker-compose.pilot.yml docker/base/services*.yml 2>/dev/null
"

    rm "$tmp_tar"
    log_success "Files synced to pilot VM"
}

pilot_reset() {
    local spoke_code=$(_get_pilot_spoke)
    local spoke_flag=$(get_country_flag "$spoke_code")

    log_warn "Resetting pilot VM to clean state (Hub + Spoke ${spoke_code} ${spoke_flag})..."

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would stop all services and remove Hub + Spoke volumes on VM"
        log_dry "Would restart services with GCP secrets"
        return 0
    fi

    pilot_cmd "
cd /opt/dive-v3
echo 'Stopping all services...'
sudo docker compose -f docker-compose.pilot.yml down -v 2>/dev/null || true

echo ''
echo 'Removing Hub volumes...'
sudo docker volume rm dive-pilot_hub_postgres_data dive-pilot_hub_mongodb_data dive-pilot_hub_redis_data dive-pilot_hub_redis_blacklist_data dive-pilot_hub_frontend_modules dive-pilot_hub_frontend_next 2>/dev/null || true

echo 'Removing Spoke volumes...'
sudo docker volume rm dive-pilot_spoke_postgres_data dive-pilot_spoke_mongodb_data dive-pilot_spoke_redis_data dive-pilot_spoke_frontend_modules dive-pilot_spoke_frontend_next dive-pilot_spoke_backend_modules dive-pilot_spoke_backend_logs 2>/dev/null || true

echo 'Pruning any orphaned volumes...'
sudo docker volume prune -f 2>/dev/null || true

echo 'Removing shared network...'
sudo docker network rm dive-v3-shared-network 2>/dev/null || true

echo 'Reset complete'
"

    pilot_up
}

# Rotate to a new random spoke
pilot_rotate() {
    log_step "Selecting new random NATO spoke..."

    local old_spoke=$(_get_pilot_spoke)
    local old_flag=$(get_country_flag "$old_spoke")

    # Force new selection
    local new_spoke=$(_get_pilot_spoke true)
    local new_flag=$(get_country_flag "$new_spoke")
    local new_name=$(get_country_name "$new_spoke")

    echo ""
    echo -e "  Previous: ${old_spoke} ${old_flag}"
    echo -e "  New:      ${new_spoke} ${new_flag} (${new_name})"
    echo ""

    log_success "Spoke rotated to ${new_spoke}"
    echo ""
    echo "Run './dive --env gcp pilot reset' to deploy with new spoke"
}

# =============================================================================
# CHECKPOINT AND ROLLBACK FUNCTIONS
# =============================================================================

GCS_CHECKPOINT_BUCKET="${GCS_CHECKPOINT_BUCKET:-dive25-checkpoints}"

pilot_checkpoint_create() {
    local spoke_code=$(_get_pilot_spoke)
    local name="${1:-$(date +%Y%m%d_%H%M%S)}"

    log_step "Creating pilot checkpoint: ${name} (Hub + Spoke ${spoke_code})"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Backup hub and spoke volumes to GCS: gs://${GCS_CHECKPOINT_BUCKET}/pilot/${name}/"
        return 0
    fi

    # Create checkpoint on VM and upload to GCS
    pilot_cmd "
cd /opt/dive-v3

# Create local checkpoint directory
mkdir -p /tmp/checkpoint-${name}/hub
mkdir -p /tmp/checkpoint-${name}/spoke

echo '=== Backing up Hub (USA) volumes ==='

echo 'Backing up hub_postgres_data...'
sudo docker run --rm -v dive-pilot_hub_postgres_data:/data:ro -v /tmp/checkpoint-${name}/hub:/backup alpine tar czf /backup/postgres_data.tar.gz -C /data . 2>/dev/null || echo 'Volume not found'

echo 'Backing up hub_mongodb_data...'
sudo docker run --rm -v dive-pilot_hub_mongodb_data:/data:ro -v /tmp/checkpoint-${name}/hub:/backup alpine tar czf /backup/mongodb_data.tar.gz -C /data . 2>/dev/null || echo 'Volume not found'

echo 'Backing up hub_redis_data...'
sudo docker run --rm -v dive-pilot_hub_redis_data:/data:ro -v /tmp/checkpoint-${name}/hub:/backup alpine tar czf /backup/redis_data.tar.gz -C /data . 2>/dev/null || echo 'Volume not found'

echo 'Backing up hub_redis_blacklist_data...'
sudo docker run --rm -v dive-pilot_hub_redis_blacklist_data:/data:ro -v /tmp/checkpoint-${name}/hub:/backup alpine tar czf /backup/redis_blacklist_data.tar.gz -C /data . 2>/dev/null || echo 'Volume not found'

echo ''
echo '=== Backing up Spoke (${spoke_code}) volumes ==='

echo 'Backing up spoke_postgres_data...'
sudo docker run --rm -v dive-pilot_spoke_postgres_data:/data:ro -v /tmp/checkpoint-${name}/spoke:/backup alpine tar czf /backup/postgres_data.tar.gz -C /data . 2>/dev/null || echo 'Volume not found'

echo 'Backing up spoke_mongodb_data...'
sudo docker run --rm -v dive-pilot_spoke_mongodb_data:/data:ro -v /tmp/checkpoint-${name}/spoke:/backup alpine tar czf /backup/mongodb_data.tar.gz -C /data . 2>/dev/null || echo 'Volume not found'

echo 'Backing up spoke_redis_data...'
sudo docker run --rm -v dive-pilot_spoke_redis_data:/data:ro -v /tmp/checkpoint-${name}/spoke:/backup alpine tar czf /backup/redis_data.tar.gz -C /data . 2>/dev/null || echo 'Volume not found'

# Save spoke metadata
echo '${spoke_code}' > /tmp/checkpoint-${name}/spoke_code.txt

# Upload to GCS
echo ''
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

    echo ""
    echo -e "${BOLD}Current spoke:${NC}"
    local spoke_code=$(_get_pilot_spoke)
    local spoke_flag=$(get_country_flag "$spoke_code")
    echo "  ${spoke_code} ${spoke_flag} ($(get_country_name "$spoke_code"))"
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

    local spoke_code=$(_get_pilot_spoke)
    log_step "Rolling back pilot to checkpoint: ${target} (Hub + Spoke ${spoke_code})"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Stop services"
        log_dry "Restore hub and spoke volumes from gs://${GCS_CHECKPOINT_BUCKET}/pilot/${target}/"
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

echo ''
echo '=== Restoring Hub (USA) volumes ==='

# Remove existing hub volumes
sudo docker volume rm dive-pilot_hub_postgres_data dive-pilot_hub_mongodb_data dive-pilot_hub_redis_data dive-pilot_hub_redis_blacklist_data 2>/dev/null || true

# Restore hub postgres
echo 'Restoring hub_postgres_data...'
sudo docker volume create dive-pilot_hub_postgres_data
if [ -f /tmp/restore-${target}/hub/postgres_data.tar.gz ]; then
    sudo docker run --rm -v dive-pilot_hub_postgres_data:/data -v /tmp/restore-${target}/hub:/backup alpine tar xzf /backup/postgres_data.tar.gz -C /data
fi

# Restore hub mongodb
echo 'Restoring hub_mongodb_data...'
sudo docker volume create dive-pilot_hub_mongodb_data
if [ -f /tmp/restore-${target}/hub/mongodb_data.tar.gz ]; then
    sudo docker run --rm -v dive-pilot_hub_mongodb_data:/data -v /tmp/restore-${target}/hub:/backup alpine tar xzf /backup/mongodb_data.tar.gz -C /data
fi

# Restore hub redis
echo 'Restoring hub_redis_data...'
sudo docker volume create dive-pilot_hub_redis_data
if [ -f /tmp/restore-${target}/hub/redis_data.tar.gz ]; then
    sudo docker run --rm -v dive-pilot_hub_redis_data:/data -v /tmp/restore-${target}/hub:/backup alpine tar xzf /backup/redis_data.tar.gz -C /data
fi

# Restore hub redis blacklist
echo 'Restoring hub_redis_blacklist_data...'
sudo docker volume create dive-pilot_hub_redis_blacklist_data
if [ -f /tmp/restore-${target}/hub/redis_blacklist_data.tar.gz ]; then
    sudo docker run --rm -v dive-pilot_hub_redis_blacklist_data:/data -v /tmp/restore-${target}/hub:/backup alpine tar xzf /backup/redis_blacklist_data.tar.gz -C /data
fi

echo ''
echo '=== Restoring Spoke volumes ==='

# Remove existing spoke volumes
sudo docker volume rm dive-pilot_spoke_postgres_data dive-pilot_spoke_mongodb_data dive-pilot_spoke_redis_data 2>/dev/null || true

# Restore spoke postgres
echo 'Restoring spoke_postgres_data...'
sudo docker volume create dive-pilot_spoke_postgres_data
if [ -f /tmp/restore-${target}/spoke/postgres_data.tar.gz ]; then
    sudo docker run --rm -v dive-pilot_spoke_postgres_data:/data -v /tmp/restore-${target}/spoke:/backup alpine tar xzf /backup/postgres_data.tar.gz -C /data
fi

# Restore spoke mongodb
echo 'Restoring spoke_mongodb_data...'
sudo docker volume create dive-pilot_spoke_mongodb_data
if [ -f /tmp/restore-${target}/spoke/mongodb_data.tar.gz ]; then
    sudo docker run --rm -v dive-pilot_spoke_mongodb_data:/data -v /tmp/restore-${target}/spoke:/backup alpine tar xzf /backup/mongodb_data.tar.gz -C /data
fi

# Restore spoke redis
echo 'Restoring spoke_redis_data...'
sudo docker volume create dive-pilot_spoke_redis_data
if [ -f /tmp/restore-${target}/spoke/redis_data.tar.gz ]; then
    sudo docker run --rm -v dive-pilot_spoke_redis_data:/data -v /tmp/restore-${target}/spoke:/backup alpine tar xzf /backup/redis_data.tar.gz -C /data
fi

# Cleanup
rm -rf /tmp/restore-${target}
echo 'All volumes restored'
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
    local spoke_code=$(_get_pilot_spoke)
    local spoke_lower="${spoke_code,,}"
    local spoke_flag=$(get_country_flag "$spoke_code")
    local json_output="${1:-false}"

    # Check for --json flag
    if [ "$1" = "--json" ]; then
        json_output=true
    fi

    if [ "$json_output" != true ]; then
        log_step "Checking pilot health (Hub + Spoke ${spoke_code} ${spoke_flag})..."
    fi

    if [ "$DRY_RUN" = true ]; then
        log_dry "Check Hub: usa-idp, usa-api, usa-app"
        log_dry "Check Spoke: ${spoke_lower}-idp, ${spoke_lower}-api, ${spoke_lower}-app"
        return 0
    fi

    local all_healthy=true
    local hub_healthy=true
    local spoke_healthy=true
    local services_json=""
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    # Check Hub Keycloak
    local hub_kc_healthy=false
    local hub_kc_start=$(date +%s%N)
    if curl -sfk --max-time 10 "https://usa-idp.dive25.com/realms/master" >/dev/null 2>&1; then
        hub_kc_healthy=true
    else
        hub_healthy=false
    fi
    local hub_kc_end=$(date +%s%N)
    local hub_kc_latency=$(( (hub_kc_end - hub_kc_start) / 1000000 ))

    # Check Hub Backend
    local hub_be_healthy=false
    local hub_be_start=$(date +%s%N)
    if curl -sfk --max-time 10 "https://usa-api.dive25.com/health" >/dev/null 2>&1; then
        hub_be_healthy=true
    else
        hub_healthy=false
    fi
    local hub_be_end=$(date +%s%N)
    local hub_be_latency=$(( (hub_be_end - hub_be_start) / 1000000 ))

    # Check Hub Frontend
    local hub_fe_healthy=false
    local hub_fe_start=$(date +%s%N)
    if curl -sfk --max-time 10 "https://usa-app.dive25.com" >/dev/null 2>&1; then
        hub_fe_healthy=true
    else
        hub_healthy=false
    fi
    local hub_fe_end=$(date +%s%N)
    local hub_fe_latency=$(( (hub_fe_end - hub_fe_start) / 1000000 ))

    # Check Spoke Keycloak
    local spoke_kc_healthy=false
    local spoke_kc_start=$(date +%s%N)
    if curl -sfk --max-time 10 "https://${spoke_lower}-idp.dive25.com/realms/master" >/dev/null 2>&1; then
        spoke_kc_healthy=true
    else
        spoke_healthy=false
    fi
    local spoke_kc_end=$(date +%s%N)
    local spoke_kc_latency=$(( (spoke_kc_end - spoke_kc_start) / 1000000 ))

    # Check Spoke Backend
    local spoke_be_healthy=false
    local spoke_be_start=$(date +%s%N)
    if curl -sfk --max-time 10 "https://${spoke_lower}-api.dive25.com/health" >/dev/null 2>&1; then
        spoke_be_healthy=true
    else
        spoke_healthy=false
    fi
    local spoke_be_end=$(date +%s%N)
    local spoke_be_latency=$(( (spoke_be_end - spoke_be_start) / 1000000 ))

    # Check Spoke Frontend
    local spoke_fe_healthy=false
    local spoke_fe_start=$(date +%s%N)
    if curl -sfk --max-time 10 "https://${spoke_lower}-app.dive25.com" >/dev/null 2>&1; then
        spoke_fe_healthy=true
    else
        spoke_healthy=false
    fi
    local spoke_fe_end=$(date +%s%N)
    local spoke_fe_latency=$(( (spoke_fe_end - spoke_fe_start) / 1000000 ))

    # Determine overall status
    local overall_status="healthy"
    if [ "$hub_healthy" != true ] || [ "$spoke_healthy" != true ]; then
        overall_status="unhealthy"
        all_healthy=false
    fi

    # JSON output
    if [ "$json_output" = true ]; then
        cat << EOF
{
  "status": "${overall_status}",
  "timestamp": "${timestamp}",
  "hub": {
    "code": "USA",
    "healthy": ${hub_healthy},
    "services": {
      "keycloak": {"healthy": ${hub_kc_healthy}, "latency_ms": ${hub_kc_latency}},
      "backend": {"healthy": ${hub_be_healthy}, "latency_ms": ${hub_be_latency}},
      "frontend": {"healthy": ${hub_fe_healthy}, "latency_ms": ${hub_fe_latency}}
    }
  },
  "spoke": {
    "code": "${spoke_code}",
    "healthy": ${spoke_healthy},
    "services": {
      "keycloak": {"healthy": ${spoke_kc_healthy}, "latency_ms": ${spoke_kc_latency}},
      "backend": {"healthy": ${spoke_be_healthy}, "latency_ms": ${spoke_be_latency}},
      "frontend": {"healthy": ${spoke_fe_healthy}, "latency_ms": ${spoke_fe_latency}}
    }
  },
  "vm": {
    "name": "${PILOT_VM}",
    "zone": "${PILOT_ZONE}",
    "project": "${GCP_PROJECT}"
  }
}
EOF
        if [ "$all_healthy" = true ]; then return 0; else return 1; fi
    fi

    # Human-readable output
    echo -e "${BOLD}Hub (USA 🇺🇸):${NC}"
    if [ "$hub_kc_healthy" = true ]; then
        echo -e "  ${GREEN}✓${NC} Keycloak: healthy (${hub_kc_latency}ms)"
    else
        echo -e "  ${RED}✗${NC} Keycloak: unhealthy"
    fi
    if [ "$hub_be_healthy" = true ]; then
        echo -e "  ${GREEN}✓${NC} Backend: healthy (${hub_be_latency}ms)"
    else
        echo -e "  ${RED}✗${NC} Backend: unhealthy"
    fi
    if [ "$hub_fe_healthy" = true ]; then
        echo -e "  ${GREEN}✓${NC} Frontend: healthy (${hub_fe_latency}ms)"
    else
        echo -e "  ${RED}✗${NC} Frontend: unhealthy"
    fi

    echo ""
    echo -e "${BOLD}Spoke (${spoke_code} ${spoke_flag}):${NC}"
    if [ "$spoke_kc_healthy" = true ]; then
        echo -e "  ${GREEN}✓${NC} Keycloak: healthy (${spoke_kc_latency}ms)"
    else
        echo -e "  ${RED}✗${NC} Keycloak: unhealthy"
    fi
    if [ "$spoke_be_healthy" = true ]; then
        echo -e "  ${GREEN}✓${NC} Backend: healthy (${spoke_be_latency}ms)"
    else
        echo -e "  ${RED}✗${NC} Backend: unhealthy"
    fi
    if [ "$spoke_fe_healthy" = true ]; then
        echo -e "  ${GREEN}✓${NC} Frontend: healthy (${spoke_fe_latency}ms)"
    else
        echo -e "  ${RED}✗${NC} Frontend: unhealthy"
    fi

    echo ""
    if [ "$hub_healthy" = true ] && [ "$spoke_healthy" = true ]; then
        echo -e "${GREEN}✓ All services healthy${NC}"
        return 0
    elif [ "$hub_healthy" = true ]; then
        echo -e "${YELLOW}⚠ Hub healthy, Spoke has issues${NC}"
        return 1
    elif [ "$spoke_healthy" = true ]; then
        echo -e "${YELLOW}⚠ Spoke healthy, Hub has issues${NC}"
        return 1
    else
        echo -e "${RED}✗ Both Hub and Spoke have issues${NC}"
        return 1
    fi
}

pilot_deploy() {
    # Select new random spoke for fresh deployment
    local spoke_code=$(_get_pilot_spoke true)
    local spoke_flag=$(get_country_flag "$spoke_code")
    local spoke_name=$(get_country_name "$spoke_code")
    local provision_vm="${1:-false}"

    # Check for --provision flag
    if [ "$1" = "--provision" ]; then
        provision_vm=true
    fi

    log_step "Full deployment to pilot VM..."
    echo ""
    echo -e "${BOLD}Selected Spoke: ${spoke_code} ${spoke_flag} (${spoke_name})${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Provision VM with Terraform (if --provision)"
        log_dry "Create checkpoint (pre-deploy)"
        log_dry "pilot_reset"
        log_dry "Wait for Hub + Spoke services"
        log_dry "terraform apply (Keycloak config)"
        log_dry "seed databases (hub + spoke)"
        log_dry "health check all endpoints"
        return 0
    fi

    # Step 1: Provision VM with Terraform if requested or if VM doesn't exist
    if [ "$provision_vm" = true ]; then
        log_step "Provisioning VM with Terraform..."
        pilot_provision_vm
    else
        # Check if VM exists
        if ! gcloud compute instances describe "$PILOT_VM" --zone="$PILOT_ZONE" --project="$GCP_PROJECT" >/dev/null 2>&1; then
            log_warn "VM '$PILOT_VM' not found. Provisioning with Terraform..."
            pilot_provision_vm
        else
            log_verbose "VM '$PILOT_VM' exists, skipping provisioning"
        fi
    fi

    # Step 2: Wait for VM to be ready
    log_step "Waiting for VM to be ready..."
    pilot_wait_for_vm

    # Step 3: Sync code to VM
    log_step "Syncing code to VM..."
    pilot_sync

    # Step 4: Create checkpoint before deployment
    log_step "Creating pre-deploy checkpoint..."
    pilot_checkpoint_create "pre-deploy-$(date +%Y%m%d_%H%M%S)" 2>/dev/null || log_warn "Checkpoint creation failed (may be first deploy)"

    # Step 5: Reset and start fresh
    pilot_reset

    # Step 6: Wait for services with exponential backoff
    log_step "Waiting for Hub + Spoke services to be healthy..."
    local elapsed=0
    local timeout=300  # Increased for Hub + Spoke
    local delay=10

    while [ $elapsed -lt $timeout ]; do
        if pilot_health 2>/dev/null; then
            log_success "All services are healthy!"
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

    # Step 7: Apply Terraform for Keycloak config (if configured)
    log_step "Applying Terraform (Keycloak configuration)..."
    if [ -f "${DIVE_ROOT}/terraform/pilot/main.tf" ]; then
        source "$(dirname "${BASH_SOURCE[0]}")/terraform.sh"
        module_terraform apply pilot 2>/dev/null || log_warn "Terraform apply skipped"
    else
        log_verbose "Terraform not configured, skipping"
    fi

    # Step 8: Seed databases
    log_step "Seeding databases..."
    # Seed hub database
    pilot_cmd "cd /opt/dive-v3 && sudo docker exec dive-pilot-hub-backend npm run seed 2>/dev/null || echo 'Hub seeding skipped'"
    # Seed spoke database
    pilot_cmd "cd /opt/dive-v3 && sudo docker exec dive-pilot-spoke-backend npm run seed 2>/dev/null || echo 'Spoke seeding skipped'"

    # Get ports for display
    eval "$(_get_spoke_ports "$spoke_code")"
    local spoke_lower="${spoke_code,,}"

    # Step 9: Final health check
    log_step "Final health check..."
    echo ""
    if pilot_health; then
        log_success "Pilot deployment complete!"
        echo ""
        echo -e "${BOLD}Deployment Summary:${NC}"
        echo ""
        echo -e "${BOLD}Hub (USA 🇺🇸):${NC}"
        echo "  Frontend: https://usa-app.dive25.com"
        echo "  Backend:  https://usa-api.dive25.com"
        echo "  Keycloak: https://usa-idp.dive25.com"
        echo ""
        echo -e "${BOLD}Spoke (${spoke_code} ${spoke_flag}):${NC}"
        echo "  Frontend: https://${spoke_lower}-app.dive25.com (port ${SPOKE_FRONTEND_PORT})"
        echo "  Backend:  https://${spoke_lower}-api.dive25.com (port ${SPOKE_BACKEND_PORT})"
        echo "  Keycloak: https://${spoke_lower}-idp.dive25.com (port ${SPOKE_KEYCLOAK_HTTPS_PORT})"
        echo ""
        echo -e "${BOLD}Federation:${NC}"
        echo "  OPAL Server: https://usa-api.dive25.com:7002"
        echo "  Shared Blacklist: usa-api.dive25.com:6380"
    else
        log_warn "Deployment complete but some services may be unhealthy"
        log_info "Run: ./dive --env gcp pilot status"
    fi
}

# =============================================================================
# VM PROVISIONING FUNCTIONS
# =============================================================================

pilot_provision_vm() {
    log_step "Provisioning GCP Compute VM with Terraform..."

    local tf_dir="${DIVE_ROOT}/terraform/pilot"

    if [ ! -f "${tf_dir}/main.tf" ]; then
        log_error "Terraform configuration not found at ${tf_dir}"
        return 1
    fi

    cd "${tf_dir}"

    # Check if we need to use the compute-vm module
    if [ -f "${DIVE_ROOT}/terraform/modules/compute-vm/main.tf" ]; then
        log_verbose "Using compute-vm module for VM provisioning"
    fi

    # Initialize Terraform with GCS backend
    log_verbose "Initializing Terraform..."
    if ! terraform init -input=false; then
        log_error "Terraform init failed"
        return 1
    fi

    # Check for plan changes
    log_verbose "Planning Terraform changes..."
    terraform plan -out=tfplan -input=false

    # Apply
    log_verbose "Applying Terraform..."
    if terraform apply -input=false tfplan; then
        log_success "VM provisioned successfully"
        rm -f tfplan
    else
        log_error "Terraform apply failed"
        rm -f tfplan
        return 1
    fi

    cd "${DIVE_ROOT}"
}

pilot_wait_for_vm() {
    local timeout="${PILOT_WAIT_TIMEOUT:-180}"
    local elapsed=0
    local delay=5

    log_verbose "Waiting for VM to be ready (timeout: ${timeout}s)..."

    while [ $elapsed -lt $timeout ]; do
        # Check if VM is running
        local status=$(gcloud compute instances describe "$PILOT_VM" \
            --zone="$PILOT_ZONE" \
            --project="$GCP_PROJECT" \
            --format='get(status)' 2>/dev/null)

        if [ "$status" = "RUNNING" ]; then
            # Check if we can SSH
            if gcloud compute ssh "$PILOT_VM" \
                --zone="$PILOT_ZONE" \
                --project="$GCP_PROJECT" \
                --command="echo 'VM ready'" \
                --tunnel-through-iap 2>/dev/null; then
                log_success "VM is ready and accessible"
                return 0
            fi
        fi

        sleep $delay
        elapsed=$((elapsed + delay))
        log_verbose "Waiting for VM... (${elapsed}s/${timeout}s) - status: ${status:-unknown}"
    done

    log_error "VM did not become ready within ${timeout}s"
    return 1
}

pilot_destroy() {
    log_warn "Destroying pilot VM and all resources..."

    # Require confirmation
    if [ "$FORCE" != true ]; then
        echo -e "${YELLOW}This will destroy:${NC}"
        echo "  - VM: ${PILOT_VM}"
        echo "  - All Docker volumes and data"
        echo "  - Firewall rules"
        echo ""
        read -p "Type 'yes' to confirm: " confirm
        [ "$confirm" != "yes" ] && exit 1
    fi

    if [ "$DRY_RUN" = true ]; then
        log_dry "terraform destroy -auto-approve"
        return 0
    fi

    local tf_dir="${DIVE_ROOT}/terraform/pilot"

    if [ ! -f "${tf_dir}/main.tf" ]; then
        # Fallback to gcloud delete
        log_warn "No Terraform config, using gcloud to delete VM..."
        gcloud compute instances delete "$PILOT_VM" \
            --zone="$PILOT_ZONE" \
            --project="$GCP_PROJECT" \
            --delete-disks=all \
            --quiet
        return $?
    fi

    cd "${tf_dir}"
    terraform init -input=false
    terraform destroy -auto-approve
    cd "${DIVE_ROOT}"

    log_success "Pilot VM destroyed"
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
        health)     pilot_health "$@" ;;
        logs)       pilot_logs "$@" ;;
        ssh)        pilot_ssh ;;
        reset)      pilot_reset ;;
        deploy)     pilot_deploy "$@" ;;
        provision)  pilot_provision_vm ;;
        destroy)    pilot_destroy ;;
        rotate)     pilot_rotate ;;
        rollback)   pilot_rollback "$@" ;;
        sync)       pilot_sync ;;
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
    local spoke_code=$(_get_pilot_spoke 2>/dev/null || echo "???")
    local spoke_flag=$(get_country_flag "$spoke_code" 2>/dev/null || echo "🏳️")
    local spoke_name=$(get_country_name "$spoke_code" 2>/dev/null || echo "Unknown")

    echo -e "${BOLD}Pilot VM Commands (Hub + Random NATO Spoke):${NC}"
    echo ""
    echo "  The pilot deploys 1 Hub (USA) + 1 random NATO spoke on a GCP VM."
    echo "  Current spoke: ${spoke_code} ${spoke_flag} (${spoke_name})"
    echo ""
    echo -e "${BOLD}Lifecycle Commands:${NC}"
    echo "  deploy [--provision] Full deployment (provisions VM if needed)"
    echo "  provision            Provision VM with Terraform only"
    echo "  destroy              Destroy VM and all resources (--force to skip prompt)"
    echo "  up                   Start Hub + Spoke services on pilot VM"
    echo "  down                 Stop all services on pilot VM"
    echo "  reset                Reset pilot VM to clean state (same spoke)"
    echo ""
    echo -e "${BOLD}Status Commands:${NC}"
    echo "  status               Show pilot VM container status"
    echo "  health [--json]      Check all endpoints (Hub + Spoke)"
    echo "  logs [svc]           View pilot VM logs (e.g., hub-backend, spoke-frontend)"
    echo "  ssh                  SSH into pilot VM"
    echo ""
    echo -e "${BOLD}Checkpoint/Rollback:${NC}"
    echo "  checkpoint create    Create GCS checkpoint"
    echo "  checkpoint list      List available checkpoints"
    echo "  rollback [name]      Rollback to GCS checkpoint"
    echo ""
    echo -e "${BOLD}Other Commands:${NC}"
    echo "  rotate               Select a new random spoke (requires reset to apply)"
    echo "  sync                 Sync local files to pilot VM"
    echo ""
    echo -e "${BOLD}Architecture:${NC}"
    echo "  Hub (USA):  usa-app.dive25.com (3000), usa-api.dive25.com (4000), usa-idp.dive25.com (8443)"
    echo "  Spoke:      <code>-app.dive25.com, <code>-api.dive25.com, <code>-idp.dive25.com"
    echo "              (ports calculated from NATO country offset)"
    echo ""
    echo -e "${BOLD}Available NATO Countries (31):${NC}"
    local count=0
    for code in $(echo "${!NATO_COUNTRIES[@]}" | tr ' ' '\n' | sort); do
        if [ "$code" != "USA" ]; then
            local flag=$(get_country_flag "$code")
            printf "  %s %s" "$code" "$flag"
            count=$((count + 1))
            if [ $((count % 8)) -eq 0 ]; then
                echo ""
            fi
        fi
    done
    echo ""
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  ./dive --env gcp pilot deploy              # Full deployment with random spoke"
    echo "  ./dive --env gcp pilot deploy --provision  # Force VM re-provisioning"
    echo "  ./dive --env gcp pilot health --json       # JSON health output for automation"
    echo "  ./dive --env gcp pilot rotate              # Select new random spoke"
    echo "  ./dive --env gcp pilot logs hub-backend    # View hub backend logs"
    echo "  ./dive --env gcp pilot checkpoint create   # Save Hub + Spoke state to GCS"
    echo "  ./dive --env gcp pilot rollback            # Restore from latest checkpoint"
    echo "  ./dive --env gcp pilot destroy             # Destroy VM (requires confirmation)"
}
