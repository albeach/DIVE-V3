#!/bin/bash
set -e

echo "=========================================="
echo "DIVE V3 Critical Path Health Check"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILED=0

check_service() {
    local name=$1
    local url=$2
    echo -n "Checking $name... "
    if curl -kfsI --max-time 5 "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        return 0
    else
        echo -e "${RED}✗${NC}"
        FAILED=1
        return 1
    fi
}

check_database() {
    local db_name=$1
    echo -n "Checking PostgreSQL database '$db_name'... "
    if docker exec dive-pilot-postgres psql -U postgres -d "$db_name" -c "SELECT 1;" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        return 0
    else
        echo -e "${RED}✗${NC}"
        FAILED=1
        return 1
    fi
}

check_table() {
    local db_name=$1
    local table_name=$2
    echo -n "  Checking table '$table_name'... "
    if docker exec dive-pilot-postgres psql -U postgres -d "$db_name" -c "SELECT 1 FROM \"$table_name\" LIMIT 1;" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        return 0
    else
        echo -e "${RED}✗${NC}"
        FAILED=1
        return 1
    fi
}

echo "1. Infrastructure Services"
echo "---------------------------"
check_service "Frontend" "https://localhost:3000"
check_service "Backend API" "https://localhost:4000/health"
echo -n "Checking Keycloak... "
if curl -kfsI --max-time 5 "https://localhost:8443/realms/master" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    FAILED=1
fi
check_service "OPA" "http://localhost:8181/health"
check_service "MongoDB" "http://localhost:27017"
echo ""

echo "2. PostgreSQL Databases"
echo "------------------------"
check_database "keycloak_db"
check_database "dive_v3_app"
echo ""

echo "3. NextAuth Tables (dive_v3_app)"
echo "--------------------------------"
check_table "dive_v3_app" "user"
check_table "dive_v3_app" "account"
check_table "dive_v3_app" "session"
check_table "dive_v3_app" "verificationToken"
echo ""

echo "4. Keycloak Realm"
echo "-----------------"
echo -n "Checking 'dive-v3-broker' realm... "
if curl -kfs "https://localhost:8443/realms/dive-v3-broker" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC} (Run: ./dive tf)"
    FAILED=1
fi
echo ""

echo "5. Environment Variables"
echo "-------------------------"
echo -n "Frontend DATABASE_URL... "
if docker exec dive-pilot-frontend env | grep -q "DATABASE_URL"; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    FAILED=1
fi

echo -n "Frontend NEXTAUTH_URL... "
if docker exec dive-pilot-frontend env | grep -q "NEXTAUTH_URL"; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    FAILED=1
fi

echo -n "Frontend KEYCLOAK_CLIENT_ID... "
if docker exec dive-pilot-frontend env | grep -q "KEYCLOAK_CLIENT_ID"; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    FAILED=1
fi
echo ""

echo "=========================================="
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Navigate to: https://localhost:3000"
    echo "2. Click 'Sign in with Keycloak'"
    echo "3. Login with: testuser-usa-1 / TestUser2025!Pilot"
    echo "4. You should reach: https://localhost:3000/dashboard"
    exit 0
else
    echo -e "${RED}✗ Some checks failed${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "- Ensure all services are running: docker compose -f docker-compose.pilot.yml ps"
    echo "- Check logs: docker compose -f docker-compose.pilot.yml logs [service]"
    echo "- Restart services: docker compose -f docker-compose.pilot.yml restart"
    exit 1
fi

