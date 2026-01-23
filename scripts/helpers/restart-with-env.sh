#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Container Restart Helper with Environment Variables
# =============================================================================
# Properly restarts Docker Compose services with environment variables loaded
# 
# Problem:
#   docker compose up -d service → Doesn't load .env file
#   Error: "variable is not set. Defaulting to a blank string"
#
# Solution:
#   Source .env file, then run docker compose with variables exported
#
# Usage:
#   ./scripts/helpers/restart-with-env.sh hub frontend
#   ./scripts/helpers/restart-with-env.sh spoke backend fra
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# =============================================================================
# Parse Arguments
# =============================================================================

DEPLOY_TYPE="${1:-hub}"  # hub or spoke
SERVICE="${2:-}"
INSTANCE_CODE="${3:-}"

if [[ -z "$SERVICE" ]]; then
    echo "Usage: $0 <hub|spoke> <service> [instance_code]"
    echo ""
    echo "Examples:"
    echo "  $0 hub frontend              # Restart Hub frontend"
    echo "  $0 hub backend               # Restart Hub backend"
    echo "  $0 spoke backend fra         # Restart FRA spoke backend"
    echo "  $0 spoke keycloak gbr        # Restart GBR spoke keycloak"
    exit 1
fi

# =============================================================================
# Determine Compose File and Environment File
# =============================================================================

DIVE_ROOT="${DIVE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$DIVE_ROOT"

if [[ "$DEPLOY_TYPE" == "hub" ]]; then
    COMPOSE_FILE="docker-compose.hub.yml"
    ENV_FILE=".env.hub"
    CONTAINER_PREFIX="dive-hub"
elif [[ "$DEPLOY_TYPE" == "spoke" ]]; then
    if [[ -z "$INSTANCE_CODE" ]]; then
        log_error "Instance code required for spoke services"
        echo "Usage: $0 spoke <service> <instance_code>"
        exit 1
    fi
    CODE_LOWER=$(echo "$INSTANCE_CODE" | tr '[:upper:]' '[:lower:]')
    COMPOSE_FILE="instances/${CODE_LOWER}/docker-compose.yml"
    ENV_FILE="instances/${CODE_LOWER}/.env.${CODE_LOWER}"
    CONTAINER_PREFIX="dive-spoke-${CODE_LOWER}"
else
    log_error "Invalid deploy type: $DEPLOY_TYPE (must be 'hub' or 'spoke')"
    exit 1
fi

# =============================================================================
# Validate Files Exist
# =============================================================================

if [[ ! -f "$COMPOSE_FILE" ]]; then
    log_error "Compose file not found: $COMPOSE_FILE"
    exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
    log_error "Environment file not found: $ENV_FILE"
    log_info "Service may start with default/missing variables"
fi

# =============================================================================
# Load Environment and Restart Service
# =============================================================================

log_info "Restarting ${DEPLOY_TYPE} service: ${SERVICE}"
log_info "Compose file: $COMPOSE_FILE"
log_info "Env file: $ENV_FILE"

# Source environment file (export all variables)
if [[ -f "$ENV_FILE" ]]; then
    log_info "Loading environment variables from $ENV_FILE"
    set -a
    source "$ENV_FILE"
    set +a
    log_success "Environment variables loaded"
else
    log_error "Warning: No environment file found, using existing environment"
fi

# Restart the service with environment variables
log_info "Restarting container: ${CONTAINER_PREFIX}-${SERVICE}"

if docker compose -f "$COMPOSE_FILE" up -d --force-recreate "$SERVICE" 2>&1; then
    log_success "Service restarted: ${SERVICE}"
    
    # Wait for health check
    log_info "Waiting for health check..."
    sleep 5
    
    CONTAINER_NAME="${CONTAINER_PREFIX}-${SERVICE}"
    HEALTH=$(docker inspect "$CONTAINER_NAME" --format='{{.State.Health.Status}}' 2>/dev/null || echo "no_healthcheck")
    
    if [[ "$HEALTH" == "healthy" ]]; then
        log_success "Container healthy: $CONTAINER_NAME"
    elif [[ "$HEALTH" == "no_healthcheck" ]]; then
        log_info "Container running (no health check configured)"
    else
        log_error "Container health: $HEALTH"
    fi
else
    log_error "Failed to restart service: ${SERVICE}"
    exit 1
fi

log_success "Restart complete"
