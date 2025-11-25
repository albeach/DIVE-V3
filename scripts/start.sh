#!/bin/bash
#
# DIVE V3 - Safe Start Script
#
# This script validates the environment and starts all services.
# It ensures secrets are synchronized before startup.
#
# Usage:
#   ./scripts/start.sh [options]
#
# Options:
#   --force         Skip validation checks
#   --no-sync       Don't regenerate .env from .env.secrets
#   --rebuild       Force rebuild of containers
#   --logs          Follow logs after starting
#
# THIS IS THE RECOMMENDED WAY TO START DIVE V3
# Avoid using: docker compose up -d (bypasses validation)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Parse arguments
FORCE=false
NO_SYNC=false
REBUILD=false
FOLLOW_LOGS=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --force) FORCE=true ;;
    --no-sync) NO_SYNC=true ;;
    --rebuild) REBUILD=true ;;
    --logs) FOLLOW_LOGS=true ;;
    -h|--help)
      echo "Usage: $0 [--force] [--no-sync] [--rebuild] [--logs]"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
done

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  DIVE V3 - Safe Start${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Step 1: Check .env.secrets exists
if [[ ! -f .env.secrets ]]; then
  echo -e "${RED}❌ .env.secrets not found!${NC}"
  echo ""
  echo "Please create it:"
  echo "  cp .env.secrets.example .env.secrets"
  echo "  # Then edit with your passwords"
  exit 1
fi
echo -e "${GREEN}✓ .env.secrets exists${NC}"

# Step 2: Sync environment files
if [[ "$NO_SYNC" == "false" ]]; then
  echo -e "${CYAN}→ Synchronizing environment files...${NC}"
  "$SCRIPT_DIR/sync-env.sh"
fi

# Step 3: Validate .env was created
if [[ ! -f .env ]]; then
  echo -e "${RED}❌ .env not found after sync!${NC}"
  exit 1
fi
echo -e "${GREEN}✓ .env file ready${NC}"

# Step 4: Check for password consistency
source .env.secrets
DOCKER_KC_PASS=$(grep "^KEYCLOAK_ADMIN_PASSWORD=" .env | cut -d= -f2)
DOCKER_PG_PASS=$(grep "^POSTGRES_PASSWORD=" .env | cut -d= -f2)

if [[ "$KEYCLOAK_ADMIN_PASSWORD" != "$DOCKER_KC_PASS" ]]; then
  echo -e "${YELLOW}⚠ Keycloak password mismatch - resyncing...${NC}"
  "$SCRIPT_DIR/sync-env.sh"
fi

# Step 5: Check if volumes exist with old passwords
check_volume_password_mismatch() {
  local VOLUME_NAME="dive-v3_postgres_data"
  
  if docker volume ls -q | grep -q "$VOLUME_NAME"; then
    # Volume exists - check if we can connect with current password
    echo -e "${CYAN}→ Checking PostgreSQL password consistency...${NC}"
    
    # Start just PostgreSQL to test
    docker compose up -d postgres >/dev/null 2>&1
    sleep 5
    
    # Try to connect
    if docker exec dive-v3-postgres psql -U postgres -c "SELECT 1" >/dev/null 2>&1; then
      echo -e "${GREEN}✓ PostgreSQL password matches${NC}"
      return 0
    else
      echo -e "${YELLOW}⚠ PostgreSQL volume has different password${NC}"
      if [[ "$FORCE" == "true" ]]; then
        echo "  --force specified, continuing anyway"
        return 0
      fi
      echo ""
      echo "Options:"
      echo "  1. Reset database (loses data): docker volume rm dive-v3_postgres_data"
      echo "  2. Update password in database manually"
      echo "  3. Run with --force to skip this check"
      echo ""
      read -p "Reset database? (y/N) " -n 1 -r
      echo
      if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Backing up first..."
        "$SCRIPT_DIR/backup.sh" 2>/dev/null || true
        docker compose down postgres >/dev/null 2>&1
        docker volume rm "$VOLUME_NAME" >/dev/null 2>&1 || true
        echo -e "${GREEN}✓ Volume reset${NC}"
      fi
      return 0
    fi
  fi
}

if [[ "$FORCE" == "false" ]]; then
  check_volume_password_mismatch
fi

# Step 6: Start services
echo ""
echo -e "${CYAN}→ Starting DIVE V3 services...${NC}"

COMPOSE_ARGS="up -d"
if [[ "$REBUILD" == "true" ]]; then
  COMPOSE_ARGS="up -d --build --force-recreate"
fi

docker compose $COMPOSE_ARGS

# Step 7: Wait for health checks
echo ""
echo -e "${CYAN}→ Waiting for services to be healthy...${NC}"

wait_for_service() {
  local SERVICE=$1
  local MAX_WAIT=${2:-60}
  local WAIT=0
  
  while [[ $WAIT -lt $MAX_WAIT ]]; do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' "dive-v3-$SERVICE" 2>/dev/null || echo "not found")
    
    case "$STATUS" in
      healthy)
        echo -e "  ${GREEN}✓ $SERVICE is healthy${NC}"
        return 0
        ;;
      unhealthy)
        echo -e "  ${RED}✗ $SERVICE is unhealthy${NC}"
        return 1
        ;;
      *)
        sleep 2
        WAIT=$((WAIT + 2))
        ;;
    esac
  done
  
  echo -e "  ${YELLOW}⚠ $SERVICE health check timeout${NC}"
  return 1
}

wait_for_service postgres 30
wait_for_service keycloak 90
wait_for_service mongo 30
wait_for_service backend 60

# Step 8: Summary
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ DIVE V3 Started Successfully${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Services:"
docker compose ps --format "table {{.Name}}\t{{.Status}}" | head -10
echo ""
echo "URLs:"
echo "  Frontend:  https://usa-app.dive25.com"
echo "  Backend:   https://usa-api.dive25.com"
echo "  Keycloak:  https://usa-idp.dive25.com"
echo "  Local:     https://localhost:3000"
echo ""
echo "Credentials:"
echo "  Admin:     admin / ${KEYCLOAK_ADMIN_PASSWORD}"
echo "  Test User: testuser-usa-3 / Password123!"
echo ""

# Step 9: Follow logs if requested
if [[ "$FOLLOW_LOGS" == "true" ]]; then
  echo "Following logs (Ctrl+C to exit)..."
  docker compose logs -f
fi

