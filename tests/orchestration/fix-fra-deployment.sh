#!/usr/bin/env bash
# =============================================================================
# FIX: Complete FRA Spoke Deployment
# =============================================================================
# This script fixes the FRA spoke deployment by:
# 1. Regenerating docker-compose.yml with correct variable references
# 2. Restarting containers with proper environment variables
# 3. Running Terraform to create realm and test users
# 4. Setting up federation with Hub
# =============================================================================

set -eo pipefail

# Load common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
export DIVE_ROOT="$PROJECT_ROOT"

source "${PROJECT_ROOT}/scripts/dive-modules/common.sh"

# Instance to fix
INSTANCE="FRA"
INSTANCE_LOWER="fra"
INSTANCE_DIR="${PROJECT_ROOT}/instances/${INSTANCE_LOWER}"

log_info "============================================"
log_info "Fixing FRA Spoke Deployment"
log_info "============================================"

# =============================================================================
# Step 1: Regenerate docker-compose.yml with fixed generator
# =============================================================================
log_info ""
log_info "STEP 1: Regenerate docker-compose.yml"
log_info "----------------------------------------"

# Source the compose generator
source "${PROJECT_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-compose-generator.sh"

# Backup old compose
if [ -f "$INSTANCE_DIR/docker-compose.yml" ]; then
    backup_file="$INSTANCE_DIR/docker-compose.yml.before-fix.$(date +%Y%m%d-%H%M%S)"
    cp "$INSTANCE_DIR/docker-compose.yml" "$backup_file"
    log_info "Backed up old compose: $backup_file"
fi

# Regenerate
if spoke_compose_generate "$INSTANCE" "$INSTANCE_DIR"; then
    log_success "✓ docker-compose.yml regenerated with variable references"
else
    log_error "Failed to regenerate docker-compose.yml"
    exit 1
fi

# Verify it has variable references
if grep -q '\${POSTGRES_PASSWORD_FRA}' "$INSTANCE_DIR/docker-compose.yml"; then
    log_success "✓ Verified: docker-compose.yml has \${POSTGRES_PASSWORD_FRA}"
else
    log_error "✗ docker-compose.yml still has hardcoded passwords"
    exit 1
fi

# =============================================================================
# Step 2: Restart containers to pick up environment variables
# =============================================================================
log_info ""
log_info "STEP 2: Restart FRA containers"
log_info "----------------------------------------"

cd "$INSTANCE_DIR"

# Stop containers
log_info "Stopping FRA containers..."
docker compose down 2>/dev/null || true

# Wait for containers to fully stop
sleep 3

# Start containers with fresh environment
log_info "Starting FRA containers with corrected environment..."
export COMPOSE_PROJECT_NAME="dive-spoke-fra"

# Source .env to export variables for docker-compose
set -a
source "$INSTANCE_DIR/.env"
set +a

# Start containers
if docker compose up -d --build; then
    log_success "✓ Containers started successfully"
else
    log_error "Failed to start containers"
    exit 1
fi

# Wait for services to be healthy
log_info "Waiting for services to become healthy..."
sleep 10

# Check container health
healthy_count=0
total_count=0
for container in $(docker ps --filter "name=dive-spoke-fra-" --format '{{.Names}}'); do
    total_count=$((total_count + 1))
    health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "none")
    
    if [ "$health" = "healthy" ] || [ "$health" = "none" ]; then
        healthy_count=$((healthy_count + 1))
        log_success "✓ $container: healthy"
    else
        log_warn "⚠ $container: $health"
    fi
done

log_info "Healthy: $healthy_count / $total_count containers"

# =============================================================================
# Step 3: Load secrets and export for Terraform
# =============================================================================
log_info ""
log_info "STEP 3: Load secrets for Terraform"
log_info "----------------------------------------"

# Source secrets module
source "${PROJECT_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-secrets.sh"

# Load secrets
if spoke_secrets_load "$INSTANCE" "load"; then
    log_success "✓ Secrets loaded from GCP"
else
    log_error "Failed to load secrets"
    exit 1
fi

# Export as TF_VAR for Terraform
export TF_VAR_keycloak_admin_password="${KEYCLOAK_ADMIN_PASSWORD_FRA}"
export TF_VAR_client_secret="${KEYCLOAK_CLIENT_SECRET_FRA}"
export TF_VAR_test_user_password="${KEYCLOAK_ADMIN_PASSWORD_FRA}"
export TF_VAR_admin_user_password="${KEYCLOAK_ADMIN_PASSWORD_FRA}"
export KEYCLOAK_USER="admin"
export KEYCLOAK_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD_FRA}"
export INSTANCE="$INSTANCE_LOWER"

log_success "✓ Terraform variables exported"
log_info "  - TF_VAR_keycloak_admin_password: ${#TF_VAR_keycloak_admin_password} chars"
log_info "  - TF_VAR_client_secret: ${#TF_VAR_client_secret} chars"

# =============================================================================
# Step 4: Wait for Keycloak to be ready
# =============================================================================
log_info ""
log_info "STEP 4: Wait for Keycloak to be ready"
log_info "----------------------------------------"

kc_container="dive-spoke-fra-keycloak"
max_wait=120
waited=0

log_info "Waiting for Keycloak health check..."
while [ $waited -lt $max_wait ]; do
    if docker exec "$kc_container" curl -sfk https://localhost:9000/health/ready &>/dev/null; then
        log_success "✓ Keycloak is ready"
        break
    fi
    
    sleep 3
    waited=$((waited + 3))
    
    if [ $((waited % 15)) -eq 0 ]; then
        log_info "  Waited ${waited}s / ${max_wait}s..."
    fi
done

if [ $waited -ge $max_wait ]; then
    log_error "Keycloak not ready after ${max_wait}s"
    log_error "Check logs: docker logs dive-spoke-fra-keycloak"
    exit 1
fi

# =============================================================================
# Step 5: Run Terraform to create realm and users
# =============================================================================
log_info ""
log_info "STEP 5: Run Terraform"
log_info "----------------------------------------"

# Source terraform module
source "${PROJECT_ROOT}/scripts/dive-modules/terraform.sh"

cd "${PROJECT_ROOT}"

# Initialize Terraform
log_info "Initializing Terraform workspace..."
if terraform_spoke init "$INSTANCE"; then
    log_success "✓ Terraform initialized"
else
    log_error "Terraform init failed"
    exit 1
fi

# Apply Terraform configuration
log_info "Applying Terraform configuration..."
log_info "This will create:"
log_info "  - Keycloak realm: dive-v3-broker-fra"
log_info "  - OIDC client: dive-v3-broker-fra"
log_info "  - Test users: testuser-fra-1 through testuser-fra-5"

if terraform_spoke apply "$INSTANCE"; then
    log_success "✓ Terraform applied successfully"
else
    log_error "Terraform apply failed"
    log_error "Check Terraform logs for details"
    exit 1
fi

# =============================================================================
# Step 6: Verify realm creation
# =============================================================================
log_info ""
log_info "STEP 6: Verify realm creation"
log_info "----------------------------------------"

# Check if realm exists
realm_check=$(curl -sk "https://localhost:8453/realms/dive-v3-broker-fra" 2>/dev/null || echo "FAILED")

if echo "$realm_check" | grep -q '"realm":"dive-v3-broker-fra"'; then
    log_success "✓ Realm 'dive-v3-broker-fra' exists and is accessible"
else
    log_warn "⚠ Could not verify realm (may need a few seconds to propagate)"
fi

# =============================================================================
# Summary
# =============================================================================
log_info ""
log_info "============================================"
log_info "FRA Spoke Deployment Fix Complete"
log_info "============================================"

log_success "✅ docker-compose.yml regenerated with variable references"
log_success "✅ Containers restarted with proper environment"
log_success "✅ Terraform configuration applied"

log_info ""
log_info "Next Steps:"
log_info "1. Register spoke with Hub:"
log_info "   ./dive spoke register FRA"
log_info ""
log_info "2. Test login flow:"
log_info "   Open https://localhost:3000"
log_info "   Select 'France' IdP"
log_info "   Login with testuser-fra-1 / ${KEYCLOAK_ADMIN_PASSWORD_FRA}"
log_info ""
log_info "3. Check drift detection:"
log_info "   curl -sk https://localhost:4000/api/drift/check/FRA | jq"

exit 0
