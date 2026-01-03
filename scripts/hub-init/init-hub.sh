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
echo -e "${CYAN}  Step 1/3: Configuring Client (Logout URIs)                    ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

"$SCRIPT_DIR/configure-hub-client.sh"

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Step 2/3: Seeding Users                                       ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

"$SCRIPT_DIR/seed-hub-users.sh"

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Step 3/3: Seeding Resources                                   ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

"$SCRIPT_DIR/seed-hub-resources.sh" 200

# =============================================================================
# Disable VERIFY_PROFILE and UPDATE_PROFILE (ACP-240 PII Minimization)
# =============================================================================
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Configuring ACP-240 PII Minimization                          ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Get admin token
ADMIN_PASSWORD=$(docker exec dive-hub-keycloak printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null || echo "admin")
TOKEN=$(curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" \
    -d "grant_type=password" \
    -d "username=admin" \
    -d "password=${ADMIN_PASSWORD}" \
    -d "client_id=admin-cli" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
    # Disable VERIFY_PROFILE
    curl -sk -X PUT "https://localhost:8443/admin/realms/dive-v3-broker-usa/authentication/required-actions/VERIFY_PROFILE" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "alias": "VERIFY_PROFILE",
            "name": "Verify Profile",
            "providerId": "VERIFY_PROFILE",
            "enabled": false,
            "defaultAction": false,
            "priority": 90
        }' 2>/dev/null && echo -e "${GREEN}✓${NC} VERIFY_PROFILE disabled"

    # Disable UPDATE_PROFILE
    curl -sk -X PUT "https://localhost:8443/admin/realms/dive-v3-broker-usa/authentication/required-actions/UPDATE_PROFILE" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "alias": "UPDATE_PROFILE",
            "name": "Update Profile",
            "providerId": "UPDATE_PROFILE",
            "enabled": false,
            "defaultAction": false,
            "priority": 40
        }' 2>/dev/null && echo -e "${GREEN}✓${NC} UPDATE_PROFILE disabled"
else
    echo -e "${YELLOW}⚠${NC} Could not get admin token - profile actions not disabled"
fi

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
