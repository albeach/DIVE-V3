#!/bin/bash
# =============================================================================
# DIVE V3 Complete Spoke Initialization
# =============================================================================
# Master script that runs all initialization steps in order
# Usage: ./init-all.sh <INSTANCE_CODE>
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTANCE_CODE="${1:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

if [[ -z "$INSTANCE_CODE" ]]; then
    echo "Usage: $0 <INSTANCE_CODE>"
    echo "Example: $0 FRA"
    exit 1
fi

CODE_LOWER=$(echo "$INSTANCE_CODE" | tr '[:upper:]' '[:lower:]')
CODE_UPPER=$(echo "$INSTANCE_CODE" | tr '[:lower:]' '[:upper:]')
PROJECT_PREFIX="${COMPOSE_PROJECT_NAME:-$CODE_LOWER}"

container_name() {
    local service="$1"
    echo "${PROJECT_PREFIX}-${service}-1"
}

echo ""
echo -e "${MAGENTA}╔══════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║                                                                          ║${NC}"
echo -e "${MAGENTA}║    ██████╗ ██╗██╗   ██╗███████╗    ██╗   ██╗██████╗                      ║${NC}"
echo -e "${MAGENTA}║    ██╔══██╗██║██║   ██║██╔════╝    ██║   ██║╚════██╗                     ║${NC}"
echo -e "${MAGENTA}║    ██║  ██║██║██║   ██║█████╗      ██║   ██║ █████╔╝                     ║${NC}"
echo -e "${MAGENTA}║    ██║  ██║██║╚██╗ ██╔╝██╔══╝      ╚██╗ ██╔╝ ╚═══██╗                     ║${NC}"
echo -e "${MAGENTA}║    ██████╔╝██║ ╚████╔╝ ███████╗     ╚████╔╝ ██████╔╝                     ║${NC}"
echo -e "${MAGENTA}║    ╚═════╝ ╚═╝  ╚═══╝  ╚══════╝      ╚═══╝  ╚═════╝                      ║${NC}"
echo -e "${MAGENTA}║                                                                          ║${NC}"
echo -e "${MAGENTA}║              SPOKE INITIALIZATION - ${CODE_UPPER} Instance                        ║${NC}"
echo -e "${MAGENTA}╚══════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Track timing
START_TIME=$(date +%s)

# =============================================================================
# Step 1: Wait for services to be healthy
# =============================================================================
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  STEP 1/4: Waiting for services to be healthy...${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

SERVICES=("postgres-${CODE_LOWER}" "mongodb-${CODE_LOWER}" "keycloak-${CODE_LOWER}")
MAX_WAIT=120
WAITED=0

for SERVICE in "${SERVICES[@]}"; do
    CONTAINER="$(container_name "${SERVICE}")"
    echo -n "  Waiting for ${CONTAINER}... "
    
    while ! docker ps --format '{{.Names}} {{.Status}}' | grep -q "${CONTAINER}.*healthy"; do
        if [[ $WAITED -ge $MAX_WAIT ]]; then
            echo -e "${RED}TIMEOUT${NC}"
            echo "  Service ${CONTAINER} did not become healthy within ${MAX_WAIT}s"
            exit 1
        fi
        sleep 5
        WAITED=$((WAITED + 5))
        echo -n "."
    done
    echo -e "${GREEN}✓${NC}"
done

echo ""

# =============================================================================
# Step 2: Initialize Databases
# =============================================================================
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  STEP 2/4: Initializing Databases${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

"${SCRIPT_DIR}/init-databases.sh" "${INSTANCE_CODE}"

# =============================================================================
# Step 3: Initialize Keycloak
# =============================================================================
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  STEP 3/4: Configuring Keycloak${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

"${SCRIPT_DIR}/init-keycloak.sh" "${INSTANCE_CODE}"
"${SCRIPT_DIR}/seed-users.sh" "${INSTANCE_CODE}"

# =============================================================================
# Step 4: Seed Resources
# =============================================================================
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  STEP 4/4: Seeding Sample Resources${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

"${SCRIPT_DIR}/seed-resources.sh" "${INSTANCE_CODE}"

# =============================================================================
# Complete!
# =============================================================================
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                                          ║${NC}"
echo -e "${GREEN}║                    🎉 SPOKE INITIALIZATION COMPLETE! 🎉                  ║${NC}"
echo -e "${GREEN}║                                                                          ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                                                                          ║${NC}"
echo -e "${GREEN}║  Instance: ${CODE_UPPER}                                                           ║${NC}"
echo -e "${GREEN}║  Time: ${DURATION} seconds                                                       ║${NC}"
echo -e "${GREEN}║                                                                          ║${NC}"
echo -e "${GREEN}║  ✓ PostgreSQL: NextAuth tables created                                  ║${NC}"
echo -e "${GREEN}║  ✓ MongoDB: Collections and indexes created                             ║${NC}"
echo -e "${GREEN}║  ✓ Keycloak: Realm, client, and scopes configured                       ║${NC}"
echo -e "${GREEN}║  ✓ Users: 5 test users with DIVE attributes                             ║${NC}"
echo -e "${GREEN}║  ✓ Resources: 7 sample documents seeded                                 ║${NC}"
echo -e "${GREEN}║                                                                          ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                                                                          ║${NC}"
echo -e "${GREEN}║  Access URLs:                                                           ║${NC}"
echo -e "${GREEN}║    Frontend: https://${CODE_LOWER}-app.dive25.com                                ║${NC}"
echo -e "${GREEN}║    Keycloak: https://${CODE_LOWER}-idp.dive25.com                                ║${NC}"
echo -e "${GREEN}║    Backend:  https://${CODE_LOWER}-api.dive25.com                                ║${NC}"
echo -e "${GREEN}║                                                                          ║${NC}"
echo -e "${GREEN}║  Test Credentials:                                                      ║${NC}"
echo -e "${GREEN}║    See output above for generated passwords                             ║${NC}"
echo -e "${GREEN}║                                                                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""





