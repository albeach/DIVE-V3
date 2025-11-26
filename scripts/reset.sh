#!/bin/bash
#
# DIVE V3 - Full Reset Script
#
# ⚠️  WARNING: This script DELETES ALL DATA including:
# - Keycloak realms, users, and clients
# - MongoDB resources and metadata
# - Redis sessions and cache
# - All Docker volumes
#
# A backup is automatically created before deletion.
#
# Usage:
#   ./scripts/reset.sh [options]
#
# Options:
#   --yes           Skip confirmation prompt
#   --no-backup     Skip backup (dangerous!)
#   --restart       Restart services after reset
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

SKIP_CONFIRM=false
SKIP_BACKUP=false
RESTART=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --yes) SKIP_CONFIRM=true ;;
    --no-backup) SKIP_BACKUP=true ;;
    --restart) RESTART=true ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
done

echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${RED}  ⚠️  DIVE V3 - FULL RESET (DESTRUCTIVE)${NC}"
echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}This will DELETE ALL DATA:${NC}"
echo "  • Keycloak realms, users, and clients"
echo "  • MongoDB resources and metadata"
echo "  • Redis sessions and cache"
echo "  • All Docker volumes"
echo ""

if [[ "$SKIP_CONFIRM" == "false" ]]; then
  echo -e "${RED}Type 'DELETE ALL DATA' to confirm:${NC}"
  read -r confirmation
  
  if [[ "$confirmation" != "DELETE ALL DATA" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# Backup before destruction
if [[ "$SKIP_BACKUP" == "false" ]]; then
  echo ""
  echo -e "${CYAN}→ Creating backup before reset...${NC}"
  "$SCRIPT_DIR/backup.sh" || {
    echo -e "${YELLOW}⚠ Backup failed, but continuing with reset${NC}"
  }
fi

# Stop all services
echo ""
echo -e "${CYAN}→ Stopping all services...${NC}"
docker compose down --remove-orphans

# Remove volumes
echo ""
echo -e "${CYAN}→ Removing Docker volumes...${NC}"
docker volume rm dive-v3_postgres_data 2>/dev/null || true
docker volume rm dive-v3_mongo_data 2>/dev/null || true
docker volume rm dive-v3_redis_data 2>/dev/null || true
docker volume rm dive-v3_authzforce_data 2>/dev/null || true
docker volume rm dive-v3_frontend_node_modules 2>/dev/null || true

# Also remove any orphaned volumes with dive-v3 prefix
docker volume ls -q | grep "dive-v3" | xargs -r docker volume rm 2>/dev/null || true

echo -e "${GREEN}✓ All volumes removed${NC}"

# Clean up any leftover networks
echo ""
echo -e "${CYAN}→ Cleaning up networks...${NC}"
docker network rm dive-v3_dive-network 2>/dev/null || true
docker network prune -f 2>/dev/null || true

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Reset Complete${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "All data has been deleted."
echo ""

if [[ "$RESTART" == "true" ]]; then
  echo -e "${CYAN}→ Restarting services (--restart was specified)...${NC}"
  "$SCRIPT_DIR/start.sh"
else
  echo "To start fresh:"
  echo "  ./scripts/start.sh"
  echo ""
  echo "After starting, apply Terraform to recreate Keycloak config:"
  echo "  cd terraform && terraform apply"
fi


