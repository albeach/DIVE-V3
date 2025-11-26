#!/bin/bash
#
# DIVE V3 - Safe Stop Script
#
# This script stops all services WITHOUT deleting data.
# To delete data, use scripts/reset.sh instead.
#
# Usage:
#   ./scripts/stop.sh [options]
#
# Options:
#   --backup    Create a backup before stopping
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

BACKUP=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --backup) BACKUP=true ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
done

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  DIVE V3 - Safe Stop${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Optional backup
if [[ "$BACKUP" == "true" ]]; then
  echo -e "${CYAN}→ Creating backup...${NC}"
  "$SCRIPT_DIR/backup.sh"
fi

# Stop without -v flag (preserves data)
echo -e "${CYAN}→ Stopping services...${NC}"
docker compose down

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Services Stopped${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Data volumes are preserved. To restart:"
echo "  ./scripts/start.sh"
echo ""
echo "To delete all data (DESTRUCTIVE):"
echo "  ./scripts/reset.sh"
echo ""


