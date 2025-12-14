#!/bin/bash
# =============================================================================
# DIVE V3 Hub Initialization Script
# 
# Purpose: Complete initialization of the DIVE V3 Hub instance
# 
# This script:
#   1. Configures Keycloak User Profile for DIVE attributes
#   2. Seeds test users with proper clearances
#   3. Seeds sample resources for ABAC testing
#   4. Configures protocol mappers
#
# Usage: ./init-hub.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         DIVE V3 Hub Initialization                           ║"
echo "║              Instance: USA (Hub)                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# =============================================================================
# Wait for Services
# =============================================================================
echo -e "${BLUE}▶${NC} Waiting for Hub services..."

# Wait for Keycloak
MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -sk https://localhost:8443/health/ready > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Keycloak is ready"
        break
    fi
    sleep 2
    WAITED=$((WAITED + 2))
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo -e "${RED}✗${NC} Keycloak not ready after ${MAX_WAIT}s"
    exit 1
fi

# Wait for MongoDB
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if docker exec dive-hub-mongodb mongosh --quiet --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} MongoDB is ready"
        break
    fi
    sleep 2
    WAITED=$((WAITED + 2))
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo -e "${RED}✗${NC} MongoDB not ready after ${MAX_WAIT}s"
    exit 1
fi

# =============================================================================
# Run Initialization Scripts
# =============================================================================
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Step 1/2: Seeding Users                                       ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

"$SCRIPT_DIR/seed-hub-users.sh"

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Step 2/2: Seeding Resources                                   ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

"$SCRIPT_DIR/seed-hub-resources.sh" 200

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Hub Initialization Complete                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Users created:"
echo "    • testuser-usa-1 (UNCLASSIFIED)"
echo "    • testuser-usa-2 (CONFIDENTIAL)"
echo "    • testuser-usa-3 (SECRET)"
echo "    • testuser-usa-4 (TOP_SECRET)"
echo "    • admin-usa (TOP_SECRET + admin)"
echo ""
echo "  Resources seeded: 200"
echo "    • 50 UNCLASSIFIED"
echo "    • 50 CONFIDENTIAL"
echo "    • 50 SECRET"
echo "    • 50 TOP_SECRET"
echo ""
echo "  ABAC is now fully functional!"
echo ""

