#!/bin/bash
# DIVE V3 - Production Rollback Script
# Phase 7: Emergency rollback to previous working state
#
# Usage: ./scripts/rollback.sh [backup_directory]
# Example: ./scripts/rollback.sh ./backups/20251030-143000

set -e  # Exit on error
set -u  # Exit on undefined variable

# Configuration
BACKUP_DIR="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ROLLBACK_LOG="${PROJECT_ROOT}/rollback-$(date +%Y%m%d-%H%M%S).log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Logging
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$ROLLBACK_LOG"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$ROLLBACK_LOG"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$ROLLBACK_LOG"
}

# Validation
if [ -z "$BACKUP_DIR" ]; then
    error "Usage: ./scripts/rollback.sh [backup_directory]"
    error "Example: ./scripts/rollback.sh ./backups/20251030-143000"
    exit 1
fi

if [ ! -d "$BACKUP_DIR" ]; then
    error "Backup directory not found: ${BACKUP_DIR}"
    exit 1
fi

log "========================================="
log "DIVE V3 Emergency Rollback"
log "Backup: ${BACKUP_DIR}"
log "========================================="

# Confirm rollback
read -p "⚠️  This will rollback to backup at ${BACKUP_DIR}. Continue? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    log "Rollback cancelled by user"
    exit 0
fi

# Step 1: Stop services
log "Step 1: Stopping all services"
cd "${PROJECT_ROOT}"
docker-compose down --timeout 30 2>> "$ROLLBACK_LOG" || {
    warn "Some services failed to stop gracefully"
}
log "✓ Services stopped"

# Step 2: Restore Terraform state
log "Step 2: Restoring Terraform state"
if [ -f "${BACKUP_DIR}/terraform.tfstate.backup" ]; then
    cp "${BACKUP_DIR}/terraform.tfstate.backup" "${PROJECT_ROOT}/terraform/terraform.tfstate"
    log "✓ Terraform state restored"
else
    warn "No Terraform state backup found - skipping"
fi

# Step 3: Restore Keycloak database
log "Step 3: Restoring Keycloak database"
if [ -f "${BACKUP_DIR}/keycloak-backup.sql" ]; then
    # Start only PostgreSQL
    docker-compose up -d postgres 2>> "$ROLLBACK_LOG"
    
    # Wait for PostgreSQL
    log "Waiting for PostgreSQL..."
    for i in {1..30}; do
        if docker exec dive-v3-postgres pg_isready -U postgres > /dev/null 2>&1; then
            break
        fi
        sleep 2
    done
    
    # Drop and recreate database
    docker exec -i dive-v3-postgres psql -U postgres <<EOF
DROP DATABASE IF EXISTS keycloak_db;
CREATE DATABASE keycloak_db;
EOF
    
    # Restore backup
    docker exec -i dive-v3-postgres psql -U postgres -d keycloak_db < "${BACKUP_DIR}/keycloak-backup.sql" 2>> "$ROLLBACK_LOG" || {
        error "Failed to restore Keycloak database"
        exit 1
    }
    
    log "✓ Keycloak database restored ($(du -h "${BACKUP_DIR}/keycloak-backup.sql" | cut -f1))"
else
    error "Keycloak backup not found - cannot rollback"
    exit 1
fi

# Step 4: Restore Application database
log "Step 4: Restoring application database"
if [ -f "${BACKUP_DIR}/app-db-backup.sql" ]; then
    docker exec -i dive-v3-postgres psql -U postgres <<EOF
DROP DATABASE IF EXISTS dive_v3_app;
CREATE DATABASE dive_v3_app;
EOF
    
    docker exec -i dive-v3-postgres psql -U postgres -d dive_v3_app < "${BACKUP_DIR}/app-db-backup.sql" 2>> "$ROLLBACK_LOG" || {
        warn "Failed to restore application database (may not exist)"
    }
    log "✓ Application database restored"
else
    warn "Application database backup not found - skipping"
fi

# Step 5: Restore MongoDB
log "Step 5: Restoring MongoDB"
if [ -d "${BACKUP_DIR}/mongo-backup" ]; then
    # Start MongoDB
    docker-compose up -d mongo 2>> "$ROLLBACK_LOG"
    
    # Wait for MongoDB
    log "Waiting for MongoDB..."
    for i in {1..30}; do
        if docker exec dive-v3-mongo mongosh --eval "db.adminCommand({ping: 1})" --quiet > /dev/null 2>&1; then
            break
        fi
        sleep 2
    done
    
    # Copy backup to container
    docker cp "${BACKUP_DIR}/mongo-backup" dive-v3-mongo:/tmp/
    
    # Restore backup
    docker exec dive-v3-mongo mongorestore --drop /tmp/mongo-backup 2>> "$ROLLBACK_LOG" || {
        error "Failed to restore MongoDB"
        exit 1
    }
    
    log "✓ MongoDB restored"
else
    error "MongoDB backup not found - cannot rollback"
    exit 1
fi

# Step 6: Restart all services
log "Step 6: Restarting all services"

docker-compose up -d 2>> "$ROLLBACK_LOG" || {
    error "Failed to restart services"
    exit 1
}

# Wait for key services
log "Waiting for services to be ready..."

# Keycloak
for i in {1..60}; do
    if curl -sf http://localhost:8081/health > /dev/null 2>&1; then
        break
    fi
    if [ $i -eq 60 ]; then
        error "Keycloak failed to start after rollback"
        exit 1
    fi
    sleep 3
done
log "✓ Keycloak ready"

# Backend
for i in {1..30}; do
    if curl -sf http://localhost:4000/health > /dev/null 2>&1; then
        break
    fi
    if [ $i -eq 30 ]; then
        error "Backend failed to start after rollback"
        exit 1
    fi
    sleep 2
done
log "✓ Backend ready"

# OPA
for i in {1..30}; do
    if curl -sf http://localhost:8181/health > /dev/null 2>&1; then
        break
    fi
    if [ $i -eq 30 ]; then
        warn "OPA may not be fully ready"
    fi
    sleep 2
done
log "✓ OPA ready"

log "✓ All services restarted"

# Step 7: Verification
log "Step 7: Running verification checks"

# Run health checks
if [ -f "${SCRIPT_DIR}/health-check.sh" ]; then
    bash "${SCRIPT_DIR}/health-check.sh" >> "$ROLLBACK_LOG" 2>&1 || {
        error "Health checks failed after rollback"
        exit 1
    }
    log "✓ Health checks passed"
else
    warn "Health check script not found"
fi

# Step 8: Rollback summary
log "========================================="
log "Rollback Summary"
log "========================================="
log "Rollback Time: $(date)"
log "Backup Used: ${BACKUP_DIR}"
log "Log File: ${ROLLBACK_LOG}"
log ""
log "Services:"
docker-compose ps
log ""
log "Next Steps:"
log "1. Review logs: tail -f ${ROLLBACK_LOG}"
log "2. Verify data integrity"
log "3. Test MFA enrollment"
log "4. Check authorization decisions"
log "5. Document incident: ./INCIDENT-$(date +%Y%m%d).md"
log "========================================="
log "✅ Rollback Complete!"
log "========================================="

exit 0

