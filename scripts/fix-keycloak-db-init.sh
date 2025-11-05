#!/bin/bash

###############################################################################
# Fix Keycloak Database Initialization
###############################################################################
# This script fixes the Keycloak PostgreSQL database initialization issue
# where migration_model and databasechangeloglock tables don't exist.
# 
# Symptoms:
#   - "relation migration_model does not exist"
#   - "relation public.databasechangeloglock does not exist"
#   - Keycloak fails to start or initialize properly
#
# Root Cause:
#   - Keycloak container started before PostgreSQL was fully ready
#   - Database schema was not properly initialized
#
# Solution:
#   - Stop Keycloak
#   - Recreate the keycloak database
#   - Restart Keycloak to trigger proper schema initialization
###############################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║       DIVE V3 - Keycloak Database Initialization Fix          ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if we're in the project root
if [ ! -f docker-compose.yml ]; then
    echo -e "${RED}Error: docker-compose.yml not found${NC}"
    echo "Please run this script from the DIVE V3 project root"
    exit 1
fi

echo -e "${YELLOW}⚠️  WARNING: This will recreate the Keycloak database${NC}"
echo "All Keycloak configuration will be lost and needs to be reapplied via Terraform."
echo ""
read -p "Do you want to continue? (y/N): " CONFIRM

if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo -e "${YELLOW}Step 1: Stopping Keycloak container${NC}"
docker compose stop keycloak
echo -e "${GREEN}✓${NC} Keycloak stopped"
echo ""

echo -e "${YELLOW}Step 2: Recreating Keycloak database${NC}"

# Wait for PostgreSQL to be ready
echo -n "Waiting for PostgreSQL..."
for i in {1..30}; do
    if docker compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        echo -e " ${GREEN}✓${NC}"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

# Drop and recreate the keycloak database
echo "Dropping existing keycloak database..."
docker compose exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS keycloak;" 2>/dev/null || true

echo "Creating new keycloak database..."
docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE keycloak OWNER postgres;" 

echo -e "${GREEN}✓${NC} Database recreated"
echo ""

echo -e "${YELLOW}Step 3: Restarting Keycloak${NC}"
docker compose start keycloak

echo ""
echo -n "Waiting for Keycloak to initialize (this may take 1-2 minutes)..."

KEYCLOAK_READY=0
for i in {1..60}; do
    # Check if Keycloak is ready
    if docker compose logs keycloak 2>/dev/null | grep -q "started in"; then
        KEYCLOAK_READY=1
        break
    fi
    
    # Check for initialization errors
    if docker compose logs keycloak 2>/dev/null | grep -q "ERROR:  relation \"migration_model\" does not exist"; then
        echo ""
        echo -e "${RED}✗ Database initialization still failing${NC}"
        echo ""
        echo "Additional troubleshooting needed. Try:"
        echo "  1. docker compose down -v    (removes all volumes)"
        echo "  2. docker compose up -d      (fresh start)"
        echo "  3. Run this script again"
        exit 1
    fi
    
    echo -n "."
    sleep 3
done

echo ""

if [ $KEYCLOAK_READY -eq 1 ]; then
    echo -e "${GREEN}✓${NC} Keycloak initialized successfully"
    echo ""
    echo -e "${YELLOW}Step 4: Verify database schema${NC}"
    
    # Check if migration_model table exists
    if docker compose exec -T postgres psql -U postgres -d keycloak -c "\dt migration_model" 2>/dev/null | grep -q "migration_model"; then
        echo -e "${GREEN}✓${NC} migration_model table exists"
    else
        echo -e "${RED}✗${NC} migration_model table missing"
        exit 1
    fi
    
    # Check if databasechangeloglock table exists
    if docker compose exec -T postgres psql -U postgres -d keycloak -c "\dt databasechangeloglock" 2>/dev/null | grep -q "databasechangeloglock"; then
        echo -e "${GREEN}✓${NC} databasechangeloglock table exists"
    else
        echo -e "${RED}✗${NC} databasechangeloglock table missing"
        exit 1
    fi
    
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                                ║${NC}"
    echo -e "${GREEN}║              Database Fix Complete! ✓                          ║${NC}"
    echo -e "${GREEN}║                                                                ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}Next Steps:${NC}"
    echo ""
    echo "  1. Reapply Terraform configuration:"
    echo "     ${BLUE}cd terraform && terraform apply -auto-approve${NC}"
    echo ""
    echo "  2. Restart application services:"
    echo "     ${BLUE}docker compose restart backend nextjs${NC}"
    echo ""
    echo "  3. Test authentication:"
    echo "     ${BLUE}Open https://localhost:3000${NC}"
    echo ""
else
    echo -e "${YELLOW}⚠️  Keycloak startup timeout${NC}"
    echo ""
    echo "Check Keycloak logs:"
    echo "  docker compose logs keycloak --tail 50"
    echo ""
fi

