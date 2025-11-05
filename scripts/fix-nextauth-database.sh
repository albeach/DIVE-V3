#!/bin/bash

###############################################################################
# Quick Fix: Initialize NextAuth Database Tables
# Run this if you're getting "relation account does not exist" errors
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "========================================"
echo "  NextAuth Database Initialization"
echo "========================================"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Check if docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}✗ Docker is not running${NC}"
    exit 1
fi

# Check if postgres container exists
if ! docker ps -a | grep -q dive-v3-postgres; then
    echo -e "${RED}✗ PostgreSQL container (dive-v3-postgres) not found${NC}"
    echo "  Please start the stack first: docker compose up -d"
    exit 1
fi

# Check if postgres is running
if ! docker ps | grep -q dive-v3-postgres; then
    echo -e "${YELLOW}⚠ PostgreSQL container is not running. Starting...${NC}"
    docker compose start postgres
    sleep 5
fi

# Wait for PostgreSQL to be ready
echo -n "Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
    if docker compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        echo -e " ${GREEN}✓${NC}"
        break
    fi
    echo -n "."
    sleep 1
done

# Check if SQL file exists
if [ ! -f "frontend/create-nextauth-tables.sql" ]; then
    echo -e "${RED}✗ SQL file not found: frontend/create-nextauth-tables.sql${NC}"
    exit 1
fi

# Copy SQL file to container
echo -n "Copying SQL file to PostgreSQL container..."
if docker cp frontend/create-nextauth-tables.sql dive-v3-postgres:/tmp/create-tables.sql > /dev/null 2>&1; then
    echo -e " ${GREEN}✓${NC}"
else
    echo -e " ${RED}✗${NC}"
    echo "  Failed to copy SQL file"
    exit 1
fi

# Execute SQL script
echo -n "Creating NextAuth tables..."
if docker compose exec -T postgres psql -U postgres -d dive_v3_app -f /tmp/create-tables.sql > /tmp/nextauth-init.log 2>&1; then
    echo -e " ${GREEN}✓${NC}"
else
    # Check if tables already exist (this is OK)
    if grep -q "already exists" /tmp/nextauth-init.log; then
        echo -e " ${YELLOW}⚠ Tables already exist (this is OK)${NC}"
    else
        echo -e " ${RED}✗${NC}"
        echo "  Error creating tables. Log:"
        cat /tmp/nextauth-init.log
        exit 1
    fi
fi

# Verify tables exist
echo -n "Verifying tables..."
TABLES=$(docker compose exec -T postgres psql -U postgres -d dive_v3_app -t -c "SELECT tablename FROM pg_tables WHERE tablename IN ('account', 'user', 'session', 'verificationToken') ORDER BY tablename;" 2>/dev/null | wc -l)

if [ "$TABLES" -ge 4 ]; then
    echo -e " ${GREEN}✓${NC}"
    echo ""
    echo -e "${GREEN}✓ Success!${NC} NextAuth tables are initialized:"
    docker compose exec -T postgres psql -U postgres -d dive_v3_app -c "SELECT tablename FROM pg_tables WHERE tablename IN ('account', 'user', 'session', 'verificationToken') ORDER BY tablename;"
else
    echo -e " ${RED}✗${NC}"
    echo "  Expected 4 tables, found $TABLES"
    exit 1
fi

echo ""
echo "Restarting frontend to pick up database connection..."
docker compose restart nextjs

echo ""
echo -e "${GREEN}✓ All done!${NC} You should now be able to log in."
echo ""
echo "If you still have issues, check the logs:"
echo "  docker compose logs nextjs --tail=50"
echo ""

