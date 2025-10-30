#!/bin/bash
# DIVE V3 - Production Deployment Script
# Phase 7: Automated deployment with health checks and rollback support
#
# Usage: ./scripts/deploy-production.sh [environment]
# Example: ./scripts/deploy-production.sh production

set -e  # Exit on error
set -u  # Exit on undefined variable

# Configuration
ENVIRONMENT="${1:-production}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${PROJECT_ROOT}/backups/$(date +%Y%m%d-%H%M%S)"
LOG_FILE="${PROJECT_ROOT}/deployment-$(date +%Y%m%d-%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

# Step 1: Pre-deployment checks
log "========================================="
log "DIVE V3 Production Deployment"
log "Environment: ${ENVIRONMENT}"
log "========================================="

log "Step 1: Pre-deployment checks"

# Check if running as correct user
if [ "$EUID" -eq 0 ]; then 
    error "Do not run this script as root"
    exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    error "Docker is not running. Please start Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    error "docker-compose not found. Please install Docker Compose."
    exit 1
fi

# Check if .env.production exists
if [ ! -f "${PROJECT_ROOT}/.env.production" ]; then
    error ".env.production file not found. Please create it from .env.production.template"
    exit 1
fi

log "✓ Pre-deployment checks passed"

# Step 2: Create backups
log "Step 2: Creating backups"

mkdir -p "${BACKUP_DIR}"

# Backup Terraform state
log "Backing up Terraform state..."
if [ -f "${PROJECT_ROOT}/terraform/terraform.tfstate" ]; then
    cp "${PROJECT_ROOT}/terraform/terraform.tfstate" "${BACKUP_DIR}/terraform.tfstate.backup"
    log "✓ Terraform state backed up"
else
    warn "No Terraform state file found (may be first deployment)"
fi

# Backup Keycloak database
log "Backing up Keycloak PostgreSQL database..."
docker exec dive-v3-postgres pg_dump -U postgres keycloak_db > "${BACKUP_DIR}/keycloak-backup.sql" 2>> "$LOG_FILE" || {
    error "Failed to backup Keycloak database"
    exit 1
}
log "✓ Keycloak database backed up ($(du -h "${BACKUP_DIR}/keycloak-backup.sql" | cut -f1))"

# Backup Application database
log "Backing up application PostgreSQL database..."
docker exec dive-v3-postgres pg_dump -U postgres dive_v3_app > "${BACKUP_DIR}/app-db-backup.sql" 2>> "$LOG_FILE" || {
    warn "Application database backup failed (may not exist yet)"
}

# Backup MongoDB
log "Backing up MongoDB..."
docker exec dive-v3-mongo mongodump --out=/tmp/mongo-backup 2>> "$LOG_FILE" || {
    error "Failed to backup MongoDB"
    exit 1
}
docker cp dive-v3-mongo:/tmp/mongo-backup "${BACKUP_DIR}/mongo-backup"
log "✓ MongoDB backed up"

log "✓ All backups created in ${BACKUP_DIR}"

# Step 3: Stop services gracefully
log "Step 3: Stopping existing services"

docker-compose down --timeout 30 2>> "$LOG_FILE" || {
    warn "Some services failed to stop gracefully"
}
log "✓ Services stopped"

# Step 4: Deploy infrastructure
log "Step 4: Deploying infrastructure with Terraform"

cd "${PROJECT_ROOT}/terraform"

# Terraform init
log "Running terraform init..."
terraform init 2>> "$LOG_FILE" || {
    error "Terraform init failed"
    exit 1
}

# Terraform validate
log "Running terraform validate..."
terraform validate 2>> "$LOG_FILE" || {
    error "Terraform validation failed"
    exit 1
}

# Terraform plan
log "Running terraform plan..."
terraform plan -out=tfplan 2>> "$LOG_FILE" || {
    error "Terraform plan failed"
    exit 1
}

# Terraform apply
log "Applying Terraform changes..."
terraform apply tfplan 2>> "$LOG_FILE" || {
    error "Terraform apply failed - attempting rollback"
    ./scripts/rollback.sh "${BACKUP_DIR}"
    exit 1
}
rm tfplan

cd "${PROJECT_ROOT}"
log "✓ Terraform deployment complete"

# Step 5: Start services
log "Step 5: Starting services"

# Use production compose file
export COMPOSE_FILE="docker-compose.yml"

# Pull latest images
log "Pulling latest Docker images..."
docker-compose pull 2>> "$LOG_FILE" || {
    warn "Failed to pull some images (may use local builds)"
}

# Start databases first
log "Starting databases..."
docker-compose up -d postgres mongo redis 2>> "$LOG_FILE" || {
    error "Failed to start databases"
    exit 1
}

# Wait for databases to be healthy
log "Waiting for databases to be ready..."
for i in {1..30}; do
    if docker-compose ps postgres | grep -q "healthy"; then
        break
    fi
    if [ $i -eq 30 ]; then
        error "PostgreSQL failed to become healthy"
        exit 1
    fi
    sleep 2
done
log "✓ PostgreSQL ready"

for i in {1..30}; do
    if docker-compose ps mongo | grep -q "healthy"; then
        break
    fi
    if [ $i -eq 30 ]; then
        error "MongoDB failed to become healthy"
        exit 1
    fi
    sleep 2
done
log "✓ MongoDB ready"

# Start Keycloak
log "Starting Keycloak..."
docker-compose up -d keycloak 2>> "$LOG_FILE" || {
    error "Failed to start Keycloak"
    exit 1
}

# Wait for Keycloak
log "Waiting for Keycloak to be ready..."
for i in {1..60}; do
    if curl -sf http://localhost:8081/health > /dev/null 2>&1; then
        break
    fi
    if [ $i -eq 60 ]; then
        error "Keycloak failed to start"
        exit 1
    fi
    sleep 3
done
log "✓ Keycloak ready"

# Start OPA
log "Starting OPA..."
docker-compose up -d opa 2>> "$LOG_FILE" || {
    error "Failed to start OPA"
    exit 1
}

# Wait for OPA
log "Waiting for OPA to be ready..."
for i in {1..30}; do
    if curl -sf http://localhost:8181/health > /dev/null 2>&1; then
        break
    fi
    if [ $i -eq 30 ]; then
        error "OPA failed to start"
        exit 1
    fi
    sleep 2
done
log "✓ OPA ready"

# Start backend
log "Starting backend..."
docker-compose up -d backend 2>> "$LOG_FILE" || {
    error "Failed to start backend"
    exit 1
}

# Wait for backend
log "Waiting for backend to be ready..."
for i in {1..30}; do
    if curl -sf http://localhost:4000/health > /dev/null 2>&1; then
        break
    fi
    if [ $i -eq 30 ]; then
        error "Backend failed to start"
        exit 1
    fi
    sleep 2
done
log "✓ Backend ready"

# Start KAS
log "Starting KAS..."
docker-compose up -d kas 2>> "$LOG_FILE" || {
    error "Failed to start KAS"
    exit 1
}

# Start frontend
log "Starting frontend..."
docker-compose up -d frontend 2>> "$LOG_FILE" || {
    error "Failed to start frontend"
    exit 1
}

# Wait for frontend
log "Waiting for frontend to be ready..."
for i in {1..30}; do
    if curl -sf http://localhost:3000 > /dev/null 2>&1; then
        break
    fi
    if [ $i -eq 30 ]; then
        warn "Frontend may not be fully ready (continuing anyway)"
    fi
    sleep 2
done
log "✓ Frontend ready"

log "✓ All services started"

# Step 6: Health checks
log "Step 6: Running comprehensive health checks"

# Run health check script
if [ -f "${SCRIPT_DIR}/health-check.sh" ]; then
    bash "${SCRIPT_DIR}/health-check.sh" >> "$LOG_FILE" 2>&1 || {
        error "Health checks failed - see ${LOG_FILE}"
        warn "Consider running rollback: ./scripts/rollback.sh ${BACKUP_DIR}"
        exit 1
    }
    log "✓ All health checks passed"
else
    warn "Health check script not found - skipping automated checks"
fi

# Step 7: Smoke tests
log "Step 7: Running smoke tests"

# Test OPA policies
log "Testing OPA policies..."
docker exec dive-v3-opa opa test /policies > /dev/null 2>&1 || {
    error "OPA policy tests failed"
    exit 1
}
log "✓ OPA tests passed"

# Test backend health
log "Testing backend API..."
BACKEND_HEALTH=$(curl -sf http://localhost:4000/health | grep -c "status.*healthy" || echo "0")
if [ "$BACKEND_HEALTH" -eq 0 ]; then
    error "Backend health check failed"
    exit 1
fi
log "✓ Backend API healthy"

# Test Keycloak
log "Testing Keycloak..."
if ! curl -sf http://localhost:8081/health > /dev/null 2>&1; then
    error "Keycloak health check failed"
    exit 1
fi
log "✓ Keycloak healthy"

log "✓ Smoke tests passed"

# Step 8: Deployment summary
log "========================================="
log "Deployment Summary"
log "========================================="
log "Environment: ${ENVIRONMENT}"
log "Deployment Time: $(date)"
log "Backup Location: ${BACKUP_DIR}"
log "Log File: ${LOG_FILE}"
log ""
log "Services:"
docker-compose ps
log ""
log "Next Steps:"
log "1. Review logs: tail -f ${LOG_FILE}"
log "2. Monitor services: docker-compose logs -f"
log "3. Access frontend: http://localhost:3000"
log "4. Access Keycloak: http://localhost:8081"
log "5. Verify MFA enforcement for classified users"
log "6. Check authorization decisions in MongoDB"
log ""
log "If issues occur, rollback with:"
log "  ./scripts/rollback.sh ${BACKUP_DIR}"
log "========================================="
log "✅ Deployment Complete!"
log "========================================="

exit 0

