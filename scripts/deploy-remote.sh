#!/bin/bash
# =============================================================================
# DIVE V3 Remote Deployment Script
# =============================================================================
# Deploys DIVE V3 to a remote server with full automation, resilience, and
# rollback capabilities.
#
# Usage:
#   ./scripts/deploy-remote.sh <server-ip> [environment] [options]
#
# Options:
#   --skip-backup    Skip database backup (NOT RECOMMENDED)
#   --skip-health    Skip health check (NOT RECOMMENDED)
#   --force          Force deployment even if health check fails
#
# Example:
#   ./scripts/deploy-remote.sh 192.168.1.100 production
# =============================================================================

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
REMOTE_SERVER="${1}"
ENVIRONMENT="${2:-production}"
SSH_USER="${SSH_USER:-ubuntu}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/dive-v3}"
SKIP_BACKUP=false
SKIP_HEALTH=false
FORCE_DEPLOY=false

# Parse options
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --skip-health)
            SKIP_HEALTH=true
            shift
            ;;
        --force)
            FORCE_DEPLOY=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# Validation
if [ -z "$REMOTE_SERVER" ]; then
    echo -e "${RED}Error: Remote server IP/hostname required${NC}"
    echo "Usage: $0 <server-ip> [environment] [options]"
    exit 1
fi

print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║          DIVE V3 Remote Deployment                        ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo "Server: ${REMOTE_SERVER}"
    echo "Environment: ${ENVIRONMENT}"
    echo "Path: ${DEPLOY_PATH}"
    echo ""
}

# Test SSH connection
test_ssh() {
    echo -e "${BLUE}🔍 Testing SSH connection...${NC}"
    if ! ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no ${SSH_USER}@${REMOTE_SERVER} "echo 'SSH connection successful'" > /dev/null 2>&1; then
        echo -e "${RED}❌ Cannot connect to ${REMOTE_SERVER}${NC}"
        echo "Please ensure:"
        echo "  1. SSH key is configured"
        echo "  2. Server is accessible"
        echo "  3. User ${SSH_USER} has access"
        exit 1
    fi
    echo -e "${GREEN}✅ SSH connection successful${NC}"
}

# Pre-deployment checks
pre_deployment_checks() {
    echo -e "${BLUE}🔍 Pre-deployment checks...${NC}"
    
    # Check Docker
    if ! ssh ${SSH_USER}@${REMOTE_SERVER} "docker --version" > /dev/null 2>&1; then
        echo -e "${RED}❌ Docker not installed on remote server${NC}"
        exit 1
    fi
    
    # Check Docker Compose
    if ! ssh ${SSH_USER}@${REMOTE_SERVER} "docker compose version" > /dev/null 2>&1; then
        echo -e "${RED}❌ Docker Compose not installed on remote server${NC}"
        exit 1
    fi
    
    # Check DIVE CLI exists
    if ! ssh ${SSH_USER}@${REMOTE_SERVER} "test -f ${DEPLOY_PATH}/dive" > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  DIVE CLI not found at ${DEPLOY_PATH}/dive${NC}"
        echo "Please ensure the repository is cloned on the remote server"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Pre-deployment checks passed${NC}"
}

# Backup databases
backup_databases() {
    if [ "$SKIP_BACKUP" = true ]; then
        echo -e "${YELLOW}⚠️  Skipping database backup (--skip-backup)${NC}"
        return
    fi
    
    echo -e "${BLUE}💾 Backing up databases...${NC}"
    
    # Create backup directory
    ssh ${SSH_USER}@${REMOTE_SERVER} "mkdir -p ${DEPLOY_PATH}/backups"
    
    # Backup PostgreSQL
    ssh ${SSH_USER}@${REMOTE_SERVER} "cd ${DEPLOY_PATH} && docker exec dive-pilot-postgres pg_dump -U postgres dive_v3_app > backups/dive_v3_app_\$(date +%Y%m%d_%H%M%S).sql 2>/dev/null || echo 'Database dive_v3_app not found (first deployment)'"
    ssh ${SSH_USER}@${REMOTE_SERVER} "cd ${DEPLOY_PATH} && docker exec dive-pilot-postgres pg_dump -U postgres keycloak_db > backups/keycloak_db_\$(date +%Y%m%d_%H%M%S).sql 2>/dev/null || echo 'Database keycloak_db not found (first deployment)'"
    
    # Backup MongoDB
    ssh ${SSH_USER}@${REMOTE_SERVER} "cd ${DEPLOY_PATH} && docker exec dive-pilot-mongo mongodump --archive=backups/mongo_\$(date +%Y%m%d_%H%M%S).archive 2>/dev/null || echo 'MongoDB backup failed (may not exist)'"
    
    echo -e "${GREEN}✅ Backups complete${NC}"
}

# Deploy
deploy() {
    echo -e "${BLUE}🚀 Deploying DIVE V3...${NC}"
    
    # Pull latest code
    echo "  Pulling latest code..."
    ssh ${SSH_USER}@${REMOTE_SERVER} "cd ${DEPLOY_PATH} && git pull origin main || git pull origin master"
    
    # Ensure DIVE CLI is executable
    ssh ${SSH_USER}@${REMOTE_SERVER} "chmod +x ${DEPLOY_PATH}/dive"
    
    # Run reset (clean slate deployment)
    echo "  Running clean slate deployment..."
    ssh ${SSH_USER}@${REMOTE_SERVER} "cd ${DEPLOY_PATH} && ./dive reset"
    
    echo -e "${GREEN}✅ Deployment complete${NC}"
}

# Health check
health_check() {
    if [ "$SKIP_HEALTH" = true ]; then
        echo -e "${YELLOW}⚠️  Skipping health check (--skip-health)${NC}"
        return 0
    fi
    
    echo -e "${BLUE}🏥 Running health check...${NC}"
    
    # Wait for services to be ready
    echo "  Waiting for services to start..."
    sleep 30
    
    # Run health check script
    if ssh ${SSH_USER}@${REMOTE_SERVER} "cd ${DEPLOY_PATH} && ./scripts/health-check.sh" > /tmp/health-check.log 2>&1; then
        echo -e "${GREEN}✅ Health check passed${NC}"
        return 0
    else
        echo -e "${RED}❌ Health check failed${NC}"
        echo "Health check output:"
        cat /tmp/health-check.log
        return 1
    fi
}

# Rollback
rollback() {
    echo -e "${RED}⏪ Rolling back to previous version...${NC}"
    
    # Find latest backup
    LATEST_SQL=$(ssh ${SSH_USER}@${REMOTE_SERVER} "ls -t ${DEPLOY_PATH}/backups/dive_v3_app_*.sql 2>/dev/null | head -1" || echo "")
    
    if [ -z "$LATEST_SQL" ]; then
        echo -e "${YELLOW}⚠️  No backup found, cannot rollback${NC}"
        return 1
    fi
    
    echo "  Restoring from: $LATEST_SQL"
    ssh ${SSH_USER}@${REMOTE_SERVER} "cd ${DEPLOY_PATH} && docker exec -i dive-pilot-postgres psql -U postgres dive_v3_app < $LATEST_SQL"
    
    echo -e "${GREEN}✅ Rollback complete${NC}"
}

# Main execution
main() {
    print_header
    
    test_ssh
    pre_deployment_checks
    backup_databases
    deploy
    
    if ! health_check; then
        if [ "$FORCE_DEPLOY" = true ]; then
            echo -e "${YELLOW}⚠️  Health check failed but --force specified, continuing...${NC}"
        else
            echo -e "${RED}❌ Deployment failed health check${NC}"
            rollback
            exit 1
        fi
    fi
    
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║          ✅ DEPLOYMENT SUCCESSFUL                           ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Frontend:  https://${REMOTE_SERVER}:3000"
    echo "Backend:   https://${REMOTE_SERVER}:4000"
    echo "Keycloak:  https://${REMOTE_SERVER}:8443"
}

# Run main
main






