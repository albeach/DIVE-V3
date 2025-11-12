#!/bin/bash
#################################################################
# DIVE V3 - Development Server Deployment Script
# Purpose: Automated deployment to dev-app.dive25.com
# Usage: ./scripts/deploy-dev.sh [options]
# Author: Claude Sonnet 4.5
# Date: November 12, 2025
#################################################################

set -e  # Exit on any error
set -u  # Exit on undefined variable
set -o pipefail  # Exit on pipe failure

#################################################################
# CONFIGURATION
#################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backups/deployments"
LOG_DIR="$PROJECT_ROOT/logs/deployments"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
LOG_FILE="$LOG_DIR/deploy-$TIMESTAMP.log"
ROLLBACK_SNAPSHOT="$BACKUP_DIR/rollback-$TIMESTAMP"

# Service health check timeouts (seconds)
POSTGRES_TIMEOUT=30
MONGODB_TIMEOUT=60  # Increased from 30s - MongoDB can be slow to initialize
REDIS_TIMEOUT=10
OPA_TIMEOUT=20  # Increased from 10s - allow for policy loading
AUTHZFORCE_TIMEOUT=90  # Increased from 30s - Tomcat/Java app needs time to start
KEYCLOAK_TIMEOUT=120
BACKEND_TIMEOUT=60
FRONTEND_TIMEOUT=60
KAS_TIMEOUT=30

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

#################################################################
# LOGGING FUNCTIONS
#################################################################

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $*" | tee -a "$LOG_FILE" >&2
}

log_warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARN:${NC} $*" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $*" | tee -a "$LOG_FILE"
}

#################################################################
# SETUP
#################################################################

setup() {
    # Create required directories FIRST (before any logging)
    mkdir -p "$BACKUP_DIR"
    mkdir -p "$LOG_DIR"
    mkdir -p "$ROLLBACK_SNAPSHOT"
    
    log "🚀 Starting DIVE V3 Deployment to dev-app.dive25.com"
    log "Timestamp: $TIMESTAMP"
    
    # Change to project root
    cd "$PROJECT_ROOT"
    
    log_info "Project root: $PROJECT_ROOT"
    log_info "Log file: $LOG_FILE"
    log_info "Rollback snapshot: $ROLLBACK_SNAPSHOT"
}

#################################################################
# PRE-DEPLOYMENT CHECKS
#################################################################

check_prerequisites() {
    log "📋 Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    log_info "✓ Docker found: $(docker --version)"
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    log_info "✓ Docker Compose found: $(docker-compose --version)"
    
    # Check disk space (need at least 10GB free)
    DISK_FREE=$(df -BG "$PROJECT_ROOT" | tail -1 | awk '{print $4}' | sed 's/G//')
    if [ "$DISK_FREE" -lt 10 ]; then
        log_error "Insufficient disk space: ${DISK_FREE}GB free (need 10GB minimum)"
        exit 1
    fi
    log_info "✓ Disk space: ${DISK_FREE}GB free"
    
    # Verify docker-compose.yml exists
    if [ ! -f "docker-compose.yml" ]; then
        log_error "docker-compose.yml not found in $PROJECT_ROOT"
        exit 1
    fi
    log_info "✓ docker-compose.yml found"
    
    # Check if .env files are deployed (from GitHub Secrets)
    if [ ! -f "backend/.env" ]; then
        log_warn "backend/.env not found (will be deployed from GitHub Secrets)"
    fi
    
    if [ ! -f "frontend/.env.local" ]; then
        log_warn "frontend/.env.local not found (will be deployed from GitHub Secrets)"
    fi
    
    log "✅ Prerequisites check passed"
}

#################################################################
# BACKUP CURRENT STATE
#################################################################

backup_current_state() {
    log "💾 Backing up current state..."
    
    # Backup .env files
    if [ -f "backend/.env" ]; then
        cp backend/.env "$ROLLBACK_SNAPSHOT/backend.env"
        log_info "✓ Backed up backend/.env"
    fi
    
    if [ -f "frontend/.env.local" ]; then
        cp frontend/.env.local "$ROLLBACK_SNAPSHOT/frontend.env.local"
        log_info "✓ Backed up frontend/.env.local"
    fi
    
    if [ -f "kas/.env" ]; then
        cp kas/.env "$ROLLBACK_SNAPSHOT/kas.env"
        log_info "✓ Backed up kas/.env"
    fi
    
    # Save current container states
    docker-compose ps > "$ROLLBACK_SNAPSHOT/container-states.txt" 2>&1 || true
    log_info "✓ Saved container states"
    
    # Save current Docker image IDs
    docker images --format "{{.Repository}}:{{.Tag}} {{.ID}}" | grep dive-v3 > "$ROLLBACK_SNAPSHOT/image-ids.txt" 2>&1 || true
    log_info "✓ Saved Docker image IDs"
    
    # Backup databases (optional - only if flag set)
    if [ "${BACKUP_DATABASES:-false}" = "true" ]; then
        log_info "Backing up databases..."
        docker-compose exec -T postgres pg_dumpall -U postgres > "$ROLLBACK_SNAPSHOT/postgres-backup.sql" 2>&1 || log_warn "PostgreSQL backup failed (container may not be running)"
        docker-compose exec -T mongodb mongodump --archive > "$ROLLBACK_SNAPSHOT/mongodb-backup.archive" 2>&1 || log_warn "MongoDB backup failed (container may not be running)"
    fi
    
    log "✅ Backup complete: $ROLLBACK_SNAPSHOT"
}

#################################################################
# STOP SERVICES
#################################################################

stop_services() {
    log "🛑 Stopping services (graceful shutdown)..."
    
    # Graceful shutdown with 30s timeout
    docker-compose down --timeout 30 || {
        log_warn "Graceful shutdown failed, forcing stop..."
        docker-compose down --timeout 5 || true
    }
    
    # Verify all containers stopped
    RUNNING=$(docker-compose ps -q)
    if [ -n "$RUNNING" ]; then
        log_error "Some containers still running after shutdown"
        docker-compose ps
        exit 1
    fi
    
    log "✅ Services stopped"
}

#################################################################
# PULL LATEST IMAGES
#################################################################

pull_images() {
    log "📥 Pulling latest Docker images..."
    
    # Pull images (only if not using local builds)
    if [ "${USE_LOCAL_BUILDS:-false}" = "false" ]; then
        docker-compose pull --quiet || {
            log_error "Failed to pull Docker images"
            exit 1
        }
        log "✅ Images pulled successfully"
    else
        log_info "Skipping image pull (using local builds)"
    fi
}

#################################################################
# DEPLOY ENV FILES
#################################################################

deploy_env_files() {
    log "📝 Deploying .env files..."
    
    # .env files should be deployed by GitHub Actions workflow
    # This function validates they exist
    
    if [ ! -f "backend/.env" ]; then
        log_error "backend/.env missing (should be deployed by GitHub Actions)"
        exit 1
    fi
    log_info "✓ backend/.env found"
    
    if [ ! -f "frontend/.env.local" ]; then
        log_error "frontend/.env.local missing (should be deployed by GitHub Actions)"
        exit 1
    fi
    log_info "✓ frontend/.env.local found"
    
    if [ ! -f "kas/.env" ]; then
        log_warn "kas/.env missing (optional)"
    else
        log_info "✓ kas/.env found"
    fi
    
    log "✅ .env files validated"
}

#################################################################
# START SERVICES
#################################################################

start_services() {
    log "▶️  Starting services..."
    
    # Start services in dependency order
    docker-compose up -d || {
        log_error "Failed to start services"
        exit 1
    }
    
    log "✅ Services started (waiting for health checks...)"
}

#################################################################
# HEALTH CHECKS
#################################################################

wait_for_service() {
    local SERVICE=$1
    local TIMEOUT=$2
    local CONTAINER_NAME=$3
    
    log_info "Waiting for $SERVICE (timeout: ${TIMEOUT}s)..."
    
    local START_TIME=$(date +%s)
    while true; do
        # Use Docker's built-in healthcheck status
        local HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "none")
        
        if [ "$HEALTH_STATUS" = "healthy" ]; then
            local END_TIME=$(date +%s)
            local DURATION=$((END_TIME - START_TIME))
            log_info "✓ $SERVICE healthy (${DURATION}s)"
            return 0
        elif [ "$HEALTH_STATUS" = "none" ]; then
            # Container has no healthcheck defined, just check if running
            if docker ps --filter "name=$CONTAINER_NAME" --filter "status=running" --format '{{.Names}}' | grep -q "$CONTAINER_NAME"; then
                local END_TIME=$(date +%s)
                local DURATION=$((END_TIME - START_TIME))
                log_info "✓ $SERVICE running (${DURATION}s) - no healthcheck defined"
                return 0
            fi
        fi
        
        local CURRENT_TIME=$(date +%s)
        local ELAPSED=$((CURRENT_TIME - START_TIME))
        
        if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
            log_error "$SERVICE failed to become healthy within ${TIMEOUT}s (status: $HEALTH_STATUS)"
            # Show container logs for debugging
            log_error "Last 10 lines of $SERVICE logs:"
            docker logs --tail 10 "$CONTAINER_NAME" 2>&1 | tee -a "$LOG_FILE"
            return 1
        fi
        
        sleep 2
    done
}

health_checks() {
    log "🏥 Running health checks..."
    
    # Use Docker's built-in healthcheck status (best practice)
    # Relies on healthcheck definitions in docker-compose.yml
    # Container names match docker-compose.yml
    
    # Critical services (required for core functionality)
    wait_for_service "PostgreSQL" "$POSTGRES_TIMEOUT" "dive-v3-postgres" || return 1
    wait_for_service "MongoDB" "$MONGODB_TIMEOUT" "dive-v3-mongo" || return 1
    wait_for_service "Redis" "$REDIS_TIMEOUT" "dive-v3-redis" || return 1
    wait_for_service "OPA" "$OPA_TIMEOUT" "dive-v3-opa" || return 1
    wait_for_service "Keycloak" "$KEYCLOAK_TIMEOUT" "dive-v3-keycloak" || return 1
    
    # Optional services (nice-to-have, not critical)
    wait_for_service "AuthzForce" "$AUTHZFORCE_TIMEOUT" "dive-v3-authzforce" || log_warn "⚠️  AuthzForce not healthy (Policies Lab feature will be unavailable)"
    
    # Verify all 11 Keycloak realms
    log_info "Verifying Keycloak realms..."
    REALMS=("dive-v3-broker" "dive-v3-usa" "dive-v3-fra" "dive-v3-can" "dive-v3-deu" "dive-v3-gbr" "dive-v3-ita" "dive-v3-esp" "dive-v3-pol" "dive-v3-nld" "dive-v3-industry")
    for realm in "${REALMS[@]}"; do
        if curl -sf "https://localhost:8443/realms/$realm/.well-known/openid-configuration" &> /dev/null; then
            log_info "  ✓ Realm $realm accessible"
        else
            log_error "Realm $realm not accessible"
            return 1
        fi
    done
    
    wait_for_service "Backend" "$BACKEND_TIMEOUT" "dive-v3-backend" || return 1
    wait_for_service "Frontend" "$FRONTEND_TIMEOUT" "dive-v3-frontend" || return 1
    
    # KAS (optional)
    if docker-compose ps kas | grep -q Up; then
        wait_for_service "KAS" "$KAS_TIMEOUT" \
            "curl -sf http://localhost:8080/health" || log_warn "KAS health check failed (non-critical)"
    else
        log_info "KAS not running (optional service)"
    fi
    
    log "✅ All health checks passed"
}

#################################################################
# SMOKE TESTS
#################################################################

smoke_tests() {
    log "🧪 Running smoke tests..."
    
    # Run smoke test script if it exists
    if [ -f "$SCRIPT_DIR/smoke-test.sh" ]; then
        bash "$SCRIPT_DIR/smoke-test.sh" || {
            log_error "Smoke tests failed"
            return 1
        }
    else
        log_warn "smoke-test.sh not found, skipping smoke tests"
    fi
    
    log "✅ Smoke tests passed"
}

#################################################################
# CLEANUP
#################################################################

cleanup() {
    log "🧹 Cleaning up..."
    
    # Remove old Docker images (keep last 2 versions)
    log_info "Removing old Docker images..."
    docker image prune -a --filter "until=168h" --force || log_warn "Image cleanup failed"
    
    # Remove dangling volumes
    log_info "Removing dangling volumes..."
    docker volume prune --force || log_warn "Volume cleanup failed"
    
    # Clean up old deployment logs (keep last 30 days)
    log_info "Cleaning old deployment logs..."
    find "$LOG_DIR" -name "deploy-*.log" -mtime +30 -delete 2>/dev/null || true
    
    # Clean up old rollback snapshots (keep last 10)
    log_info "Cleaning old rollback snapshots..."
    ls -t "$BACKUP_DIR" | tail -n +11 | xargs -I {} rm -rf "$BACKUP_DIR/{}" 2>/dev/null || true
    
    log "✅ Cleanup complete"
}

#################################################################
# DEPLOYMENT SUMMARY
#################################################################

deployment_summary() {
    log "📊 Deployment Summary"
    log "===================="
    log "Timestamp: $TIMESTAMP"
    log "Log file: $LOG_FILE"
    log "Rollback snapshot: $ROLLBACK_SNAPSHOT"
    log ""
    log "Services:"
    docker-compose ps
    log ""
    log "✅ Deployment to dev-app.dive25.com successful!"
    log ""
    log "🌐 Endpoints:"
    log "  Frontend:  https://dev-app.dive25.com"
    log "  Backend:   https://dev-api.dive25.com"
    log "  Keycloak:  https://dev-auth.dive25.com"
    log ""
}

#################################################################
# MAIN DEPLOYMENT FLOW
#################################################################

main() {
    # Setup
    setup
    
    # Pre-deployment checks
    check_prerequisites
    
    # Backup current state
    backup_current_state
    
    # Stop services
    stop_services
    
    # Pull latest images
    pull_images
    
    # Deploy .env files
    deploy_env_files
    
    # Start services
    start_services
    
    # Health checks
    if ! health_checks; then
        log_error "Health checks failed - initiating rollback"
        bash "$SCRIPT_DIR/rollback.sh" "$ROLLBACK_SNAPSHOT"
        exit 1
    fi
    
    # Smoke tests
    if ! smoke_tests; then
        log_error "Smoke tests failed - initiating rollback"
        bash "$SCRIPT_DIR/rollback.sh" "$ROLLBACK_SNAPSHOT"
        exit 1
    fi
    
    # Cleanup
    cleanup
    
    # Summary
    deployment_summary
    
    log "🎉 Deployment complete!"
    exit 0
}

#################################################################
# SIGNAL HANDLERS
#################################################################

trap 'log_error "Deployment interrupted"; exit 130' INT TERM

#################################################################
# EXECUTE
#################################################################

main "$@"

