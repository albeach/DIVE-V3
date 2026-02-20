#!/usr/bin/env bash
# =============================================================================
# DIVE V3 — Spoke Prepare (Hub-side config package generation)
# =============================================================================
# Generates a complete config package for a remote spoke on the Hub, then
# ships it to the spoke EC2. The spoke receives:
#   - docker-compose.yml (ECR image: directives — no source builds)
#   - .env (all secrets baked in as values)
#   - certs/ (TLS certs from Vault PKI or mkcert)
#   - ca-bundle/ (CA chain for federation trust)
#   - caddy/Caddyfile (reverse proxy config)
#   - mongo-keyfile (MongoDB replica set auth)
#   - deploy.sh (thin bootstrap script for ECR pull + compose up)
#
# Usage:
#   ./dive spoke prepare GBR          # Generate + ship to GBR spoke EC2
#   ./dive spoke prepare GBR --dry-run  # Generate only (no SCP)
#
# Prerequisites:
#   - Hub must be running (Vault, backend, OPAL server)
#   - Spoke EC2 must exist and be reachable via SSH
#   - ECR images must be pushed (./dive aws ecr push)
# =============================================================================
# Version: 1.0.0
# Date: 2026-02-18
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_SPOKE_PREPARE_LOADED:-}" ] && return 0
export DIVE_SPOKE_PREPARE_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

PREPARE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULES_DIR="$(dirname "$PREPARE_DIR")"

# Load common utilities
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load AWS module (for EC2 IP lookup)
if [ -f "${MODULES_DIR}/aws/module.sh" ] && [ -z "${DIVE_AWS_MODULE_LOADED:-}" ]; then
    source "${MODULES_DIR}/aws/module.sh"
fi

# Load ECR module (for registry URL resolution)
if [ -f "${MODULES_DIR}/aws/ecr.sh" ] && [ -z "${DIVE_AWS_ECR_LOADED:-}" ]; then
    source "${MODULES_DIR}/aws/ecr.sh"
fi

# Load spoke pipeline modules (for reusable functions)
for _mod in \
    "${PREPARE_DIR}/pipeline/spoke-compose-generator.sh" \
    "${PREPARE_DIR}/pipeline/phase-initialization.sh" \
    "${PREPARE_DIR}/pipeline/phase-initialization-extended.sh" \
    "${PREPARE_DIR}/pipeline/spoke-secrets.sh" \
    "${PREPARE_DIR}/pipeline/spoke-caddy.sh" \
    "${PREPARE_DIR}/pipeline/phase-configuration.sh"; do
    # shellcheck source=/dev/null
    [ -f "$_mod" ] && source "$_mod"
done
unset _mod

# Load Vault module
if [ -f "${MODULES_DIR}/vault/module.sh" ]; then
    source "${MODULES_DIR}/vault/module.sh"
fi
if [ -f "${MODULES_DIR}/vault/pki.sh" ]; then
    source "${MODULES_DIR}/vault/pki.sh"
fi

# Load certificates module
if [ -f "${MODULES_DIR}/certificates.sh" ]; then
    source "${MODULES_DIR}/certificates.sh"
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

SPOKE_DEPLOY_DIR="/opt/dive-spoke"  # Target dir on spoke EC2
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10"
REMOTE_USER="${REMOTE_USER:-ubuntu}"

# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

##
# Prepare a spoke config package on the Hub and ship to spoke EC2
#
# Arguments:
#   $1 - Instance code (e.g., GBR)
#   --dry-run: Generate package but don't SCP
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_prepare() {
    local instance_code="$1"
    shift || true

    local dry_run=false
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run) dry_run=true; shift ;;
            *) shift ;;
        esac
    done

    local code_upper
    code_upper=$(upper "$instance_code")
    local code_lower
    code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local package_dir="${spoke_dir}/package"

    # Reject USA — Hub is always deployed separately
    if [ "$code_upper" = "USA" ]; then
        log_error "Cannot prepare USA — Hub uses its own deployment pipeline"
        return 1
    fi

    log_info "Preparing spoke ${code_upper} config package on Hub"
    echo ""

    # Force remote + ECR mode
    export DEPLOYMENT_MODE="remote"

    # Resolve ECR registry if not set
    if [ -z "${ECR_REGISTRY:-}" ]; then
        if type _ecr_registry_url &>/dev/null; then
            ECR_REGISTRY=$(_ecr_registry_url 2>/dev/null || echo "")
        fi
        if [ -z "${ECR_REGISTRY:-}" ]; then
            log_error "ECR_REGISTRY not set and cannot be auto-detected"
            log_error "Set ECR_REGISTRY or ensure AWS credentials are configured"
            return 1
        fi
    fi
    export ECR_REGISTRY

    # Resolve image tag (default: latest)
    export IMAGE_TAG="${IMAGE_TAG:-latest}"

    log_verbose "ECR Registry: ${ECR_REGISTRY}"
    log_verbose "Image Tag: ${IMAGE_TAG}"

    # =========================================================================
    # STEP 1: Vault provisioning (AppRole, secrets, PKI role)
    # =========================================================================
    log_step "1/8 Vault provisioning"

    if [ "${SECRETS_PROVIDER:-vault}" = "vault" ] && type module_vault_provision &>/dev/null; then
        if ! module_vault_provision "$code_upper"; then
            log_error "Vault provisioning failed for $code_upper"
            return 1
        fi
        log_success "Vault provisioned for $code_upper"
    else
        log_warn "Vault not available — secrets must be provided via environment"
    fi

    # =========================================================================
    # STEP 2: Setup directories + MongoDB keyfile
    # =========================================================================
    log_step "2/8 Setup directories"

    if type spoke_init_setup_directories &>/dev/null; then
        spoke_init_setup_directories "$instance_code" || return 1
    else
        mkdir -p "$spoke_dir"/{certs/ca,caddy,cache}
    fi

    if type spoke_init_ensure_mongo_keyfile &>/dev/null; then
        spoke_init_ensure_mongo_keyfile "$instance_code" || return 1
    fi

    # =========================================================================
    # STEP 3: Generate .env (secrets + config)
    # =========================================================================
    log_step "3/8 Generate environment configuration"

    if type spoke_init_generate_config &>/dev/null; then
        spoke_init_generate_config "$instance_code" || return 1
    else
        log_error "spoke_init_generate_config not available"
        return 1
    fi

    # Override SECRETS_PROVIDER in .env for remote spoke (no Vault access)
    local env_file="$spoke_dir/.env"
    if [ -f "$env_file" ]; then
        if grep -q "^SECRETS_PROVIDER=" "$env_file"; then
            sed -i.bak "s|^SECRETS_PROVIDER=.*|SECRETS_PROVIDER=env|" "$env_file"
        else
            echo "SECRETS_PROVIDER=env" >> "$env_file"
        fi
        rm -f "$env_file.bak"

        # Remove Vault-internal Docker network address (spoke can't reach it)
        sed -i.bak "s|^VAULT_ADDR=https://dive-hub-vault:8200|VAULT_ADDR=|" "$env_file"
        rm -f "$env_file.bak"

        # Fix Hub URLs for remote spoke (use Caddy public URLs, not Docker-internal addresses)
        if [ -n "${DIVE_DOMAIN_SUFFIX:-}" ]; then
            local _hub_env_prefix="${ENVIRONMENT%%[0-9]*}"  # dev, staging, etc.
            local _hub_api_url="https://${_hub_env_prefix}-usa-api.${DIVE_DOMAIN_SUFFIX#*.}"
            local _hub_opal_url="https://${_hub_env_prefix}-usa-opal.${DIVE_DOMAIN_SUFFIX#*.}"
            sed -i.bak "s|^HUB_URL=.*|HUB_URL=${_hub_api_url}|" "$env_file"
            sed -i.bak "s|^HUB_API_URL=.*|HUB_API_URL=${_hub_api_url}|" "$env_file"
            sed -i.bak "s|^HUB_OPAL_URL=.*|HUB_OPAL_URL=${_hub_opal_url}|" "$env_file"
            rm -f "$env_file.bak"
            log_verbose "Hub URLs set for remote: API=${_hub_api_url}, OPAL=${_hub_opal_url}"
        fi

        # Ensure Caddy profile is active
        if ! grep -q "^COMPOSE_PROFILES=" "$env_file"; then
            echo "COMPOSE_PROFILES=caddy" >> "$env_file"
        elif ! grep -q "caddy" "$env_file"; then
            sed -i.bak "s|^COMPOSE_PROFILES=.*|COMPOSE_PROFILES=caddy|" "$env_file"
            rm -f "$env_file.bak"
        fi

        # Set SPOKE_CADDY_ENABLED for the deployment
        if ! grep -q "^SPOKE_CADDY_ENABLED=" "$env_file"; then
            echo "SPOKE_CADDY_ENABLED=true" >> "$env_file"
        fi

        # Propagate Hub's OPAL_DATA_SOURCE_TOKEN to spoke
        # Hub OPAL Server pushes data source config with this token in Authorization headers
        # The spoke's backend validates data fetch requests using the same token
        local _opal_ds_token=""
        _opal_ds_token=$(grep "^OPAL_DATA_SOURCE_TOKEN=" "$DIVE_ROOT/.env.hub" 2>/dev/null | cut -d= -f2-)
        if [ -n "$_opal_ds_token" ]; then
            if grep -q "^OPAL_DATA_SOURCE_TOKEN=" "$env_file" 2>/dev/null; then
                sed -i.bak "s|^OPAL_DATA_SOURCE_TOKEN=.*|OPAL_DATA_SOURCE_TOKEN=${_opal_ds_token}|" "$env_file"
                rm -f "$env_file.bak"
            else
                echo "OPAL_DATA_SOURCE_TOKEN=${_opal_ds_token}" >> "$env_file"
            fi
            log_verbose "Propagated Hub OPAL_DATA_SOURCE_TOKEN to spoke .env"
        else
            log_warn "Hub OPAL_DATA_SOURCE_TOKEN not found — spoke OPAL data auth will be unauthenticated"
        fi

        # Add ECR registry and AWS region for deploy.sh bootstrap
        if ! grep -q "^ECR_REGISTRY=" "$env_file"; then
            echo "ECR_REGISTRY=${ECR_REGISTRY}" >> "$env_file"
        fi
        if ! grep -q "^AWS_REGION=" "$env_file"; then
            echo "AWS_REGION=${AWS_REGION:-us-gov-east-1}" >> "$env_file"
        fi
    fi

    log_success "Environment configuration generated"

    # =========================================================================
    # STEP 4: Generate TLS certificates
    # =========================================================================
    log_step "4/8 Generate TLS certificates"

    if type spoke_init_prepare_certificates &>/dev/null; then
        spoke_init_prepare_certificates "$instance_code" || return 1
    else
        log_error "spoke_init_prepare_certificates not available"
        return 1
    fi

    log_success "TLS certificates generated"

    # =========================================================================
    # STEP 5: Generate docker-compose.yml (ECR template)
    # =========================================================================
    log_step "5/8 Generate docker-compose.yml (ECR)"

    if type spoke_compose_generate &>/dev/null; then
        spoke_compose_generate "$instance_code" "$spoke_dir" || return 1
    else
        log_error "spoke_compose_generate not available"
        return 1
    fi

    log_success "Docker compose generated (ECR images)"

    # =========================================================================
    # STEP 6: Generate Caddy config + DNS
    # =========================================================================
    log_step "6/8 Caddy configuration + DNS"

    if [ -n "${DIVE_DOMAIN_SUFFIX:-}" ]; then
        # Resolve spoke EC2 IP for DNS records (not the Hub IP!)
        if type aws_get_instance_ip &>/dev/null; then
            local _spoke_ip
            _spoke_ip=$(aws_get_instance_ip "spoke" "$code_upper" 2>/dev/null || echo "")
            if [ -n "$_spoke_ip" ] && [ "$_spoke_ip" != "None" ]; then
                export INSTANCE_PUBLIC_IP="$_spoke_ip"
                log_verbose "Spoke EC2 IP for DNS: $_spoke_ip"
            fi
        fi

        if type spoke_caddy_generate_local &>/dev/null; then
            spoke_caddy_generate_local "$code_upper" || log_warn "Caddy config generation had issues"
        fi
        if type spoke_caddy_create_dns &>/dev/null; then
            spoke_caddy_create_dns "$code_upper" || log_warn "DNS creation had issues (non-fatal)"
        fi
        log_success "Caddy config + DNS records created"
    else
        log_verbose "No DIVE_DOMAIN_SUFFIX — skipping Caddy/DNS setup"
    fi

    # =========================================================================
    # STEP 7: Register spoke in Hub MongoDB
    # =========================================================================
    log_step "7/8 Register spoke in Hub"

    # Export Keycloak admin password for registration (needed by phase-configuration.sh)
    if [ -f "$spoke_dir/.env" ]; then
        local _kc_pw
        # Try suffixed name first (e.g., KEYCLOAK_ADMIN_PASSWORD_GBR), then unsuffixed
        _kc_pw=$(grep "^KEYCLOAK_ADMIN_PASSWORD_${code_upper}=" "$spoke_dir/.env" 2>/dev/null | cut -d= -f2-)
        if [ -z "$_kc_pw" ]; then
            _kc_pw=$(grep "^KEYCLOAK_ADMIN_PASSWORD=" "$spoke_dir/.env" 2>/dev/null | cut -d= -f2-)
        fi
        if [ -n "$_kc_pw" ]; then
            export "KEYCLOAK_ADMIN_PASSWORD_${code_upper}=${_kc_pw}"
            log_verbose "Loaded Keycloak admin password for $code_upper from spoke .env"
        fi
    fi

    if type spoke_config_register_in_hub_mongodb &>/dev/null; then
        spoke_config_register_in_hub_mongodb "$instance_code" || log_warn "Hub registration had issues (can retry later)"
    fi

    # =========================================================================
    # STEP 8: Package and ship to spoke EC2
    # =========================================================================
    log_step "8/8 Package and ship"

    # Build config package directory
    rm -rf "$package_dir"
    mkdir -p "$package_dir"/{certs/ca,caddy,cache/policies}

    # Copy artifacts into package
    [ -f "$spoke_dir/docker-compose.yml" ] && cp "$spoke_dir/docker-compose.yml" "$package_dir/"
    [ -f "$spoke_dir/.env" ] && cp "$spoke_dir/.env" "$package_dir/"
    [ -f "$spoke_dir/mongo-keyfile" ] && cp "$spoke_dir/mongo-keyfile" "$package_dir/"

    # Certs
    if [ -d "$spoke_dir/certs" ]; then
        cp -r "$spoke_dir/certs/"* "$package_dir/certs/" 2>/dev/null || true
    fi

    # CA bundle (from project root, needed by all services for federation trust)
    if [ -d "${DIVE_ROOT}/certs/ca-bundle" ]; then
        cp -r "${DIVE_ROOT}/certs/ca-bundle" "$package_dir/ca-bundle"
    elif [ -d "$spoke_dir/certs/ca" ]; then
        cp -r "$spoke_dir/certs/ca" "$package_dir/ca-bundle"
    fi

    # Caddy config
    if [ -d "$spoke_dir/caddy" ]; then
        cp -r "$spoke_dir/caddy/"* "$package_dir/caddy/" 2>/dev/null || true
    fi

    # Generate deploy.sh bootstrap script
    _spoke_generate_deploy_script "$code_lower" "$package_dir"

    # Package size check
    local package_size
    package_size=$(du -sh "$package_dir" 2>/dev/null | cut -f1)
    log_info "Config package: ${package_size} (${package_dir})"

    if [ "$dry_run" = "true" ]; then
        log_success "Dry run complete — package at: ${package_dir}"
        echo ""
        echo "  To ship manually:"
        echo "    scp -r ${package_dir}/ ubuntu@<spoke-ip>:${SPOKE_DEPLOY_DIR}/"
        return 0
    fi

    # Ship to spoke EC2
    _spoke_ship_package "$code_upper" "$package_dir"
}

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

##
# Generate the deploy.sh bootstrap script for the spoke EC2
#
# Arguments:
#   $1 - Instance code (lowercase)
#   $2 - Package directory
##
_spoke_generate_deploy_script() {
    local code_lower="$1"
    local package_dir="$2"

    cat > "$package_dir/deploy.sh" << 'DEPLOY_EOF'
#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Spoke Bootstrap — Auto-generated by spoke_prepare()
# =============================================================================
# This script runs on the spoke EC2 to pull images and start containers.
# Prerequisites: Docker, docker-compose, AWS CLI (for ECR login)
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

echo "=== DIVE V3 Spoke Deployment ==="
echo "Instance: $(grep '^INSTANCE_CODE=' .env 2>/dev/null | cut -d= -f2 || echo 'unknown')"
echo "Started: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# ECR login
ECR_REGISTRY=$(grep '^ECR_REGISTRY=' .env 2>/dev/null | cut -d= -f2 || echo "")
AWS_REGION=$(grep '^AWS_REGION=' .env 2>/dev/null | cut -d= -f2 || echo "us-gov-east-1")

if [ -n "$ECR_REGISTRY" ]; then
    echo "Logging into ECR: ${ECR_REGISTRY}..."
    aws ecr get-login-password --region "$AWS_REGION" | \
        docker login --username AWS --password-stdin "$ECR_REGISTRY"
else
    echo "WARNING: ECR_REGISTRY not set in .env — image pull may fail"
fi

# Pull images (parallel by default)
echo "Pulling Docker images..."
docker compose pull 2>&1 || { echo "ERROR: Image pull failed"; exit 1; }

# Start infra services first (postgres, mongodb, redis, opa)
echo "Starting infrastructure services..."
docker compose up -d \
    $(docker compose config --services 2>/dev/null | grep -E '^(postgres|mongodb|redis|opa)-')

echo "Waiting for infrastructure to become healthy (60s timeout)..."
sleep 15

# Start all remaining services
echo "Starting application services..."
docker compose up -d

# Initialize MongoDB replica set (required for transactions)
echo "Initializing MongoDB replica set..."
MONGO_CONTAINER=$(docker compose ps --format '{{.Names}}' 2>/dev/null | grep mongodb || echo "")
if [ -n "$MONGO_CONTAINER" ]; then
    for attempt in 1 2 3 4 5; do
        if docker exec "$MONGO_CONTAINER" mongosh --tls --tlsAllowInvalidCertificates --quiet --eval '
            try {
                rs.status();
                print("Replica set already initialized");
            } catch(e) {
                rs.initiate();
                print("Replica set initialized");
            }
        ' 2>/dev/null; then
            break
        fi
        echo "  Attempt $attempt: MongoDB not ready, waiting 10s..."
        sleep 10
    done
fi

# Wait for health
echo "Waiting for services to become healthy..."
for i in $(seq 1 30); do
    HEALTHY=$(docker compose ps --format '{{.Health}}' 2>/dev/null | grep -c "healthy" || echo 0)
    TOTAL=$(docker compose ps --format '{{.Health}}' 2>/dev/null | wc -l | tr -d ' ' || echo 0)
    echo "  Health check $i/30: ${HEALTHY}/${TOTAL} healthy"
    if [ "$HEALTHY" -ge "$TOTAL" ] && [ "$TOTAL" -gt 0 ]; then
        echo ""
        echo "=== All services healthy! ==="
        docker compose ps
        exit 0
    fi
    sleep 10
done

echo ""
echo "WARNING: Not all services healthy after 5 minutes"
docker compose ps
exit 1
DEPLOY_EOF
    chmod +x "$package_dir/deploy.sh"
}

##
# Ship the config package to spoke EC2 via SCP
#
# Arguments:
#   $1 - Instance code (uppercase)
#   $2 - Package directory path
##
_spoke_ship_package() {
    local code_upper="$1"
    local package_dir="$2"

    # Discover spoke EC2 IP
    local spoke_ip=""
    if type aws_get_instance_ip &>/dev/null; then
        spoke_ip=$(aws_get_instance_ip "spoke" "$code_upper" 2>/dev/null || echo "")
    fi

    if [ -z "$spoke_ip" ] || [ "$spoke_ip" = "None" ]; then
        log_error "No running spoke EC2 found for $code_upper"
        log_info "Launch one: ./dive --env ${ENVIRONMENT:-dev} aws launch --role spoke --spoke-code $code_upper"
        log_info "Package available at: $package_dir"
        return 1
    fi

    log_info "Shipping to spoke EC2: ${spoke_ip}"

    # SSH key — set by common.sh from DIVE_AWS_SSH_KEY (default: ~/.ssh/${DIVE_AWS_KEY_PAIR}.pem)
    local ssh_key="${DIVE_AWS_SSH_KEY:?DIVE_AWS_SSH_KEY not set — run from DIVE CLI or export manually}"

    # Create target directory on spoke
    ssh -i "$ssh_key" $SSH_OPTS \
        "${REMOTE_USER}@${spoke_ip}" \
        "sudo mkdir -p ${SPOKE_DEPLOY_DIR} && sudo chown ${REMOTE_USER}:${REMOTE_USER} ${SPOKE_DEPLOY_DIR}" || {
        log_error "Failed to create target directory on spoke EC2"
        return 1
    }

    # SCP the package (rsync for efficiency, exclude macOS artifacts)
    COPYFILE_DISABLE=1 rsync -az --delete \
        --exclude '._*' \
        --exclude '.DS_Store' \
        -e "ssh -i ${ssh_key} ${SSH_OPTS}" \
        "${package_dir}/" \
        "${REMOTE_USER}@${spoke_ip}:${SPOKE_DEPLOY_DIR}/" || {
        log_error "Failed to ship package to spoke EC2"
        return 1
    }

    log_success "Config package shipped to ${spoke_ip}:${SPOKE_DEPLOY_DIR}/"
    echo ""
    echo "  Next steps:"
    echo "    1. SSH: ssh -i ${ssh_key} ${REMOTE_USER}@${spoke_ip}"
    echo "    2. Deploy: cd ${SPOKE_DEPLOY_DIR} && ./deploy.sh"
    echo "    3. Or auto: ./dive spoke start $code_upper --env ${ENVIRONMENT:-dev}"
}

# =============================================================================
# REMOTE START (SSH to spoke EC2 and run deploy.sh)
# =============================================================================

##
# SSH to spoke EC2 and execute deploy.sh
#
# Arguments:
#   $1 - Instance code (e.g., GBR)
##
_spoke_start_remote() {
    local instance_code="$1"
    local code_upper
    code_upper=$(upper "$instance_code")

    log_info "Starting spoke $code_upper on remote EC2..."

    # Discover spoke EC2 IP
    local spoke_ip=""
    if type aws_get_instance_ip &>/dev/null; then
        spoke_ip=$(aws_get_instance_ip "spoke" "$code_upper" 2>/dev/null || echo "")
    fi

    if [ -z "$spoke_ip" ] || [ "$spoke_ip" = "None" ]; then
        log_error "No running spoke EC2 found for $code_upper"
        return 1
    fi

    # SSH key — set by common.sh from DIVE_AWS_SSH_KEY (default: ~/.ssh/${DIVE_AWS_KEY_PAIR}.pem)
    local ssh_key="${DIVE_AWS_SSH_KEY:?DIVE_AWS_SSH_KEY not set — run from DIVE CLI or export manually}"

    log_info "Executing deploy.sh on ${spoke_ip}..."

    ssh -i "$ssh_key" $SSH_OPTS \
        -t "${REMOTE_USER}@${spoke_ip}" \
        "cd ${SPOKE_DEPLOY_DIR} && bash deploy.sh" || {
        log_error "Remote deploy.sh failed on $spoke_ip"
        return 1
    }

    log_success "Spoke $code_upper started on ${spoke_ip}"
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f spoke_prepare
export -f _spoke_generate_deploy_script
export -f _spoke_ship_package
export -f _spoke_start_remote

log_verbose "Spoke prepare module loaded"
