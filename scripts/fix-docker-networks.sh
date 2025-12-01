#!/bin/bash
# =============================================================================
# DIVE V3 - Docker Network Fix Script
# =============================================================================
# Ensures all DIVE V3 containers are connected to the same Docker network.
#
# Problem: When docker-compose is run with different project names (-p flag),
# it creates separate networks (e.g., usa_dive-network vs dive-v3_dive-network).
# This breaks inter-container communication (e.g., backend can't find mongo).
#
# Solution: This script connects all backend containers to the main network
# where MongoDB is running.
#
# Usage:
#   ./scripts/fix-docker-networks.sh
#
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🔧 DIVE V3 - Docker Network Fix"
echo ""

# Find the network where MongoDB is running
MONGO_CONTAINER="dive-v3-mongo"
MONGO_NETWORK=$(docker inspect "$MONGO_CONTAINER" 2>/dev/null | jq -r '.[0].NetworkSettings.Networks | keys[0]' || echo "")

if [[ -z "$MONGO_NETWORK" || "$MONGO_NETWORK" == "null" ]]; then
    echo -e "${RED}❌ MongoDB container ($MONGO_CONTAINER) not found${NC}"
    exit 1
fi

echo "MongoDB network: $MONGO_NETWORK"
echo ""

# Containers that need to connect to MongoDB
BACKEND_CONTAINERS=(
    "dive-v3-backend"
    "dive-v3-backend-fra"
    "dive-v3-backend-gbr"
    "dive-v3-kas"
)

for container in "${BACKEND_CONTAINERS[@]}"; do
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        # Check if already connected
        if docker inspect "$container" 2>/dev/null | jq -e ".[0].NetworkSettings.Networks[\"$MONGO_NETWORK\"]" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ $container already on $MONGO_NETWORK${NC}"
        else
            echo -e "${YELLOW}⚠️  Connecting $container to $MONGO_NETWORK...${NC}"
            docker network connect "$MONGO_NETWORK" "$container" 2>/dev/null || true
            echo -e "${GREEN}✅ $container connected${NC}"
        fi
    fi
done

echo ""
echo -e "${GREEN}✅ Network fix complete${NC}"

# Verify connectivity
echo ""
echo "Verifying MongoDB connectivity from backends..."
for container in "${BACKEND_CONTAINERS[@]}"; do
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        result=$(docker exec "$container" sh -c "getent hosts mongo 2>/dev/null | head -1" || echo "FAILED")
        if [[ -n "$result" && "$result" != "FAILED" ]]; then
            echo -e "  ${GREEN}✅ $container can resolve 'mongo'${NC}"
        else
            echo -e "  ${RED}❌ $container cannot resolve 'mongo'${NC}"
        fi
    fi
done


