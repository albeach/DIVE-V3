#!/bin/bash
#
# DIVE V3 Policies Lab - Health Check Script
#
# This script verifies all required services are running and healthy.
# Exit code 0 = all healthy, Exit code 1 = one or more services unhealthy
#
# Usage: ./scripts/health-check.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"
OPA_URL="${OPA_URL:-http://localhost:8181}"
AUTHZFORCE_URL="${AUTHZFORCE_URL:-http://localhost:8282}"
MONGODB_CONTAINER="${MONGODB_CONTAINER:-dive-v3-mongodb}"

# Counters
TOTAL_CHECKS=4
PASSED_CHECKS=0
FAILED_CHECKS=0

echo "=================================="
echo "DIVE V3 - Policies Lab Health Check"
echo "=================================="
echo ""

# Function to check HTTP endpoint
check_http() {
    local service_name=$1
    local url=$2
    local expected_status=${3:-200}
    
    echo -n "Checking $service_name... "
    
    if response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "$url" 2>&1); then
        if [ "$response" -eq "$expected_status" ] || [ "$response" -eq 200 ] || [ "$response" -eq 404 ]; then
            echo -e "${GREEN}✅ HEALTHY${NC} (HTTP $response)"
            ((PASSED_CHECKS++))
            return 0
        else
            echo -e "${RED}❌ UNHEALTHY${NC} (HTTP $response, expected $expected_status)"
            ((FAILED_CHECKS++))
            return 1
        fi
    else
        echo -e "${RED}❌ UNREACHABLE${NC} (Connection failed)"
        ((FAILED_CHECKS++))
        return 1
    fi
}

# Function to check MongoDB
check_mongodb() {
    echo -n "Checking MongoDB... "
    
    if docker exec "$MONGODB_CONTAINER" mongosh --quiet --eval 'db.adminCommand({ping: 1}).ok' > /dev/null 2>&1; then
        echo -e "${GREEN}✅ HEALTHY${NC}"
        ((PASSED_CHECKS++))
        return 0
    else
        echo -e "${RED}❌ UNHEALTHY${NC} (ping failed)"
        ((FAILED_CHECKS++))
        return 1
    fi
}

# Run health checks
echo "Running health checks..."
echo ""

# 1. Backend API
check_http "Backend API" "$BACKEND_URL/api/health"

# 2. OPA
check_http "OPA" "$OPA_URL/health"

# 3. AuthzForce
check_http "AuthzForce CE" "$AUTHZFORCE_URL/authzforce-ce/"

# 4. MongoDB
check_mongodb

# Summary
echo ""
echo "=================================="
echo "Health Check Summary"
echo "=================================="
echo -e "Total Checks: $TOTAL_CHECKS"
echo -e "Passed: ${GREEN}$PASSED_CHECKS${NC}"
echo -e "Failed: ${RED}$FAILED_CHECKS${NC}"
echo ""

if [ $FAILED_CHECKS -eq 0 ]; then
    echo -e "${GREEN}✅ All services healthy!${NC}"
    exit 0
else
    echo -e "${RED}❌ $FAILED_CHECKS service(s) unhealthy${NC}"
    echo ""
    echo "Troubleshooting tips:"
    echo "  1. Check Docker services: docker-compose ps"
    echo "  2. Check logs: docker-compose logs [service]"
    echo "  3. Verify ports not in use: lsof -i :[port]"
    echo "  4. Restart services: docker-compose restart [service]"
    exit 1
fi

