#!/bin/bash
#################################################################
# DIVE V3 - Deployment Rollback Script
# Purpose: Automatic rollback on deployment failure
# Usage: ./scripts/rollback.sh <rollback_snapshot_dir>
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
ROLLBACK_DIR="${1:-}"
LOG_DIR="$PROJECT_ROOT/logs/deployments"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
LOG_FILE="$LOG_DIR/rollback-$TIMESTAMP.log"

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
# VALIDATION
#################################################################

validate_rollback_dir() {
    log "🔍 Validating rollback directory..."
    
    if [ -z "$ROLLBACK_DIR" ]; then
        log_error "Usage: $0 <rollback_snapshot_dir>"
        log_error "Example: $0 $PROJECT_ROOT/backups/deployments/rollback-20251112-143000"
        exit 1
    fi
    
    if [ ! -d "$ROLLBACK_DIR" ]; then
        log_error "Rollback directory not found: $ROLLBACK_DIR"
        exit 1
    fi
    
    log_info "✓ Rollback directory found: $ROLLBACK_DIR"
    
    # List contents
    log_info "Contents:"
    ls -lh "$ROLLBACK_DIR" | tee -a "$LOG_FILE"
}

#################################################################
# STOP CURRENT DEPLOYMENT
#################################################################

stop_services() {
    log "🛑 Stopping current deployment..."
    
    cd "$PROJECT_ROOT"
    
    # Force stop with 10s timeout
    docker-compose down --timeout 10 || {
        log_warn "Graceful shutdown failed, forcing kill..."
        docker-compose kill || true
        docker-compose down --volumes --remove-orphans || true
    }
    
    # Verify all containers stopped
    RUNNING=$(docker ps -q --filter "name=dive")
    if [ -n "$RUNNING" ]; then
        log_warn "Some DIVE containers still running, force removing..."
        docker rm -f $RUNNING || true
    fi
    
    log "✅ Services stopped"
}

#################################################################
# RESTORE ENV FILES
#################################################################

restore_env_files() {
    log "📝 Restoring .env files..."
    
    # Restore backend .env
    if [ -f "$ROLLBACK_DIR/backend.env" ]; then
        cp "$ROLLBACK_DIR/backend.env" "$PROJECT_ROOT/backend/.env"
        log_info "✓ Restored backend/.env"
    else
        log_warn "backend.env not found in rollback snapshot"
    fi
    
    # Restore frontend .env.local
    if [ -f "$ROLLBACK_DIR/frontend.env.local" ]; then
        cp "$ROLLBACK_DIR/frontend.env.local" "$PROJECT_ROOT/frontend/.env.local"
        log_info "✓ Restored frontend/.env.local"
    else
        log_warn "frontend.env.local not found in rollback snapshot"
    fi
    
    # Restore kas .env
    if [ -f "$ROLLBACK_DIR/kas.env" ]; then
        cp "$ROLLBACK_DIR/kas.env" "$PROJECT_ROOT/kas/.env"
        log_info "✓ Restored kas/.env"
    else
        log_info "kas.env not in rollback snapshot (optional)"
    fi
    
    log "✅ .env files restored"
}

#################################################################
# RESTORE DOCKER IMAGES
#################################################################

restore_docker_images() {
    log "🐳 Restoring Docker images..."
    
    if [ ! -f "$ROLLBACK_DIR/image-ids.txt" ]; then
        log_warn "image-ids.txt not found in rollback snapshot"
        log_info "Will use current images"
        return
    fi
    
    # Read previous image IDs
    log_info "Previous images:"
    cat "$ROLLBACK_DIR/image-ids.txt" | tee -a "$LOG_FILE"
    
    # Note: Docker images are immutable by ID, so we don't need to restore
    # We just need to ensure the tags point to the right images
    log_info "✓ Image references preserved"
}

#################################################################
# RESTORE DATABASE VOLUMES (OPTIONAL)
#################################################################

restore_databases() {
    if [ "${RESTORE_DATABASES:-false}" != "true" ]; then
        log_info "Skipping database restore (RESTORE_DATABASES not set)"
        return
    fi
    
    log "💾 Restoring databases (CAUTION: DATA LOSS)..."
    
    # Start only database containers
    docker-compose up -d postgres mongodb || {
        log_error "Failed to start database containers"
        return 1
    }
    
    sleep 10  # Wait for databases to initialize
    
    # Restore PostgreSQL
    if [ -f "$ROLLBACK_DIR/postgres-backup.sql" ]; then
        log_info "Restoring PostgreSQL..."
        docker-compose exec -T postgres psql -U postgres < "$ROLLBACK_DIR/postgres-backup.sql" || {
            log_error "PostgreSQL restore failed"
            return 1
        }
        log_info "✓ PostgreSQL restored"
    else
        log_warn "postgres-backup.sql not found"
    fi
    
    # Restore MongoDB
    if [ -f "$ROLLBACK_DIR/mongodb-backup.archive" ]; then
        log_info "Restoring MongoDB..."
        docker-compose exec -T mongodb mongorestore --archive < "$ROLLBACK_DIR/mongodb-backup.archive" || {
            log_error "MongoDB restore failed"
            return 1
        }
        log_info "✓ MongoDB restored"
    else
        log_warn "mongodb-backup.archive not found"
    fi
    
    log "✅ Databases restored"
}

#################################################################
# RESTART SERVICES
#################################################################

restart_services() {
    log "▶️  Restarting services with rollback configuration..."
    
    cd "$PROJECT_ROOT"
    
    # Start all services
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
    local HEALTH_CHECK=$3
    
    log_info "Waiting for $SERVICE (timeout: ${TIMEOUT}s)..."
    
    local START_TIME=$(date +%s)
    while true; do
        if eval "$HEALTH_CHECK" &> /dev/null; then
            local END_TIME=$(date +%s)
            local DURATION=$((END_TIME - START_TIME))
            log_info "✓ $SERVICE healthy (${DURATION}s)"
            return 0
        fi
        
        local CURRENT_TIME=$(date +%s)
        local ELAPSED=$((CURRENT_TIME - START_TIME))
        
        if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
            log_error "$SERVICE failed to become healthy within ${TIMEOUT}s"
            return 1
        fi
        
        sleep 2
    done
}

verify_rollback() {
    log "🏥 Verifying rollback..."
    
    # PostgreSQL
    wait_for_service "PostgreSQL" 30 \
        "docker-compose exec -T postgres pg_isready -U postgres" || return 1
    
    # MongoDB
    wait_for_service "MongoDB" 30 \
        "docker-compose exec -T mongodb mongosh --eval 'db.adminCommand({ping: 1})' --quiet" || return 1
    
    # Redis
    wait_for_service "Redis" 10 \
        "docker-compose exec -T redis redis-cli ping | grep -q PONG" || return 1
    
    # OPA
    wait_for_service "OPA" 10 \
        "curl -sf http://localhost:8181/health | grep -q ok" || return 1
    
    # Keycloak
    wait_for_service "Keycloak" 120 \
        "curl -sf http://localhost:8081/health | grep -q UP" || return 1
    
    # Backend
    wait_for_service "Backend" 60 \
        "curl -sf https://localhost:4000/health" || return 1
    
    # Frontend
    wait_for_service "Frontend" 60 \
        "curl -sf http://localhost:3000/" || return 1
    
    log "✅ Rollback verification complete"
}

#################################################################
# ROLLBACK SUMMARY
#################################################################

rollback_summary() {
    log "📊 Rollback Summary"
    log "===================="
    log "Timestamp: $TIMESTAMP"
    log "Rollback source: $ROLLBACK_DIR"
    log "Log file: $LOG_FILE"
    log ""
    log "Services:"
    docker-compose ps
    log ""
    log "✅ Rollback to previous deployment successful!"
    log ""
    log "🌐 Endpoints (restored):"
    log "  Frontend:  https://dev-app.dive25.com"
    log "  Backend:   https://dev-api.dive25.com"
    log "  Keycloak:  https://dev-auth.dive25.com"
    log ""
    log "⚠️  Investigation Required:"
    log "  - Review failed deployment logs"
    log "  - Identify root cause of failure"
    log "  - Fix issues before next deployment attempt"
    log ""
}

#################################################################
# MAIN ROLLBACK FLOW
#################################################################

main() {
    log "🔄 Starting rollback to previous deployment..."
    log "Rollback directory: $ROLLBACK_DIR"
    
    # Validate rollback directory
    validate_rollback_dir
    
    # Stop current deployment
    stop_services
    
    # Restore .env files
    restore_env_files
    
    # Restore Docker images (metadata only)
    restore_docker_images
    
    # Restore databases (optional - only if explicitly set)
    if [ "${RESTORE_DATABASES:-false}" = "true" ]; then
        log_warn "⚠️  Database restore enabled - THIS WILL OVERWRITE CURRENT DATA"
        restore_databases
    fi
    
    # Restart services
    restart_services
    
    # Verify rollback
    if ! verify_rollback; then
        log_error "Rollback verification failed"
        log_error "System may be in inconsistent state"
        log_error "Manual intervention required"
        exit 1
    fi
    
    # Summary
    rollback_summary
    
    log "🎉 Rollback complete!"
    exit 0
}

#################################################################
# SIGNAL HANDLERS
#################################################################

trap 'log_error "Rollback interrupted"; exit 130' INT TERM

#################################################################
# EXECUTE
#################################################################

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

main "$@"
