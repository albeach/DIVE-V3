#!/bin/bash

# ============================================
# DIVE V3 Pre-Flight Check
# ============================================
# Verify all services are healthy before testing
# Run this before ANY manual testing session

set -e

FAILED=0

echo "=========================================="
echo "DIVE V3 Pre-Flight System Check"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check service
check_service() {
    local name=$1
    local command=$2
    local expected=$3
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ $name${NC}"
        return 0
    else
        echo -e "${RED}❌ $name - FAILED${NC}"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# Function to check endpoint
check_endpoint() {
    local name=$1
    local url=$2
    
    if curl -f -s "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ $name${NC}"
        return 0
    else
        echo -e "${RED}❌ $name - NOT RESPONDING${NC}"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

echo "1. Docker Services"
echo "===================="
check_service "Docker daemon" "docker info"
check_service "Docker Compose" "docker-compose version"
echo ""

echo "2. Infrastructure Services"
echo "=========================="
check_endpoint "Keycloak" "http://localhost:8081/health/ready"
check_endpoint "PostgreSQL (via Keycloak)" "http://localhost:8081/health/ready"
check_endpoint "MongoDB" "http://localhost:27017"
check_endpoint "OPA" "http://localhost:8181/health"
echo ""

echo "3. Application Services"
echo "======================"
check_endpoint "Backend API" "http://localhost:4000/health"
check_endpoint "Frontend" "http://localhost:3000"
echo ""

echo "4. OPA Policy Validation"
echo "========================"
# Check OPA has Week 2 policy loaded
OPA_RESPONSE=$(curl -s -X POST http://localhost:8181/v1/data/dive/authorization/allow \
  -H "Content-Type: application/json" \
  -d '{"input":{"subject":{"authenticated":true,"uniqueID":"test","clearance":"SECRET","countryOfAffiliation":"USA","acpCOI":[]},"action":{"operation":"view"},"resource":{"resourceId":"test","classification":"SECRET","releasabilityTo":["USA"],"COI":[]},"context":{"currentTime":"2025-10-11T00:00:00Z","sourceIP":"127.0.0.1","deviceCompliant":true,"requestId":"test"}}}')

if echo "$OPA_RESPONSE" | jq -e '.result == true' > /dev/null 2>&1; then
    echo -e "${GREEN}✅ OPA Week 2 policy loaded${NC}"
else
    echo -e "${RED}❌ OPA policy not working - Response: $OPA_RESPONSE${NC}"
    FAILED=$((FAILED + 1))
fi

# Run OPA tests
echo ""
echo "5. OPA Unit Tests"
echo "================="
if docker-compose exec -T opa opa test /policies/ 2>&1 | grep -q "PASS: 53/53"; then
    echo -e "${GREEN}✅ All 53 OPA tests passing${NC}"
else
    echo -e "${RED}❌ OPA tests not all passing${NC}"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "6. Database Status"
echo "=================="
# Check PostgreSQL tables
TABLES=$(docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -t -c "\dt" 2>/dev/null | wc -l)
if [ "$TABLES" -gt 3 ]; then
    echo -e "${GREEN}✅ PostgreSQL tables exist ($(($TABLES - 2)) tables)${NC}"
else
    echo -e "${RED}❌ PostgreSQL tables missing${NC}"
    FAILED=$((FAILED + 1))
fi

# Check MongoDB resources
RESOURCES=$(docker exec dive-v3-mongo mongosh --quiet dive-v3 --eval "db.resources.count()" 2>/dev/null)
if [ "$RESOURCES" -eq 8 ]; then
    echo -e "${GREEN}✅ MongoDB has 8 resources${NC}"
else
    echo -e "${YELLOW}⚠️  MongoDB has $RESOURCES resources (expected 8)${NC}"
fi

# Check active sessions
SESSIONS=$(docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -t -c "SELECT COUNT(*) FROM session WHERE expires > NOW();" 2>/dev/null | tr -d ' ')
ACCOUNTS=$(docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -t -c "SELECT COUNT(*) FROM account;" 2>/dev/null | tr -d ' ')
echo -e "   Active sessions: $SESSIONS"
echo -e "   Account records: $ACCOUNTS"

echo ""
echo "7. Environment Configuration"
echo "============================"
if [ -f .env.local ]; then
    echo -e "${GREEN}✅ .env.local exists${NC}"
    
    # Check critical variables
    if grep -q "AUTH_SECRET=" .env.local && [ "$(grep AUTH_SECRET .env.local | cut -d= -f2 | wc -c)" -gt 32 ]; then
        echo -e "${GREEN}✅ AUTH_SECRET configured ($(grep AUTH_SECRET .env.local | cut -d= -f2 | wc -c) chars)${NC}"
    else
        echo -e "${RED}❌ AUTH_SECRET missing or too short${NC}"
        FAILED=$((FAILED + 1))
    fi
    
    if grep -q "KEYCLOAK_CLIENT_SECRET=" .env.local && [ -n "$(grep KEYCLOAK_CLIENT_SECRET .env.local | cut -d= -f2)" ]; then
        echo -e "${GREEN}✅ KEYCLOAK_CLIENT_SECRET configured${NC}"
    else
        echo -e "${RED}❌ KEYCLOAK_CLIENT_SECRET missing${NC}"
        FAILED=$((FAILED + 1))
    fi
else
    echo -e "${RED}❌ .env.local not found${NC}"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "8. Token Expiration Check"
echo "========================="
if [ "$ACCOUNTS" -gt 0 ]; then
    TOKEN_STATUS=$(docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -t -A -c "
    SELECT 
      CASE 
        WHEN expires_at > EXTRACT(EPOCH FROM NOW())::INTEGER THEN 'VALID'
        ELSE 'EXPIRED'
      END as status,
      expires_at - EXTRACT(EPOCH FROM NOW())::INTEGER as seconds_until_expiry
    FROM account
    LIMIT 1;
    " 2>/dev/null)
    
    STATUS=$(echo "$TOKEN_STATUS" | cut -d'|' -f1)
    TTL=$(echo "$TOKEN_STATUS" | cut -d'|' -f2)
    
    if [ "$STATUS" = "VALID" ]; then
        echo -e "${GREEN}✅ Access tokens valid (expires in ${TTL}s)${NC}"
    else
        echo -e "${YELLOW}⚠️  Access tokens expired (${TTL}s ago) - re-login recommended${NC}"
    fi
else
    echo -e "   No account records (fresh login required)"
fi

echo ""
echo "=========================================="
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ ALL CHECKS PASSED - Ready for testing${NC}"
    echo "=========================================="
    exit 0
else
    echo -e "${RED}❌ $FAILED CHECK(S) FAILED - Fix issues before testing${NC}"
    echo "=========================================="
    echo ""
    echo "Common Fixes:"
    echo "  - Restart unhealthy services: docker-compose restart <service>"
    echo "  - Check logs: docker-compose logs <service>"
    echo "  - Restart all: docker-compose down && docker-compose up -d"
    exit 1
fi

