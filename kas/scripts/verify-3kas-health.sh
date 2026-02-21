#!/bin/bash
# ACP-240 KAS Phase 3.5: 3-KAS Health Verification Script
# Verifies all KAS instances are operational and federation-ready

set -e

echo "========================================"
echo "3-KAS Health Verification"
echo "========================================"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Health check function
check_kas_health() {
    local KAS_NAME=$1
    local KAS_PORT=$2
    local KAS_URL="https://localhost:${KAS_PORT}/health"
    
    echo -n "   ${KAS_NAME}: "
    
    if response=$(curl -sk --connect-timeout 5 --max-time 10 "$KAS_URL" 2>&1); then
        if echo "$response" | grep -q '"status":"healthy"'; then
            echo -e "${GREEN}✅ HEALTHY${NC}"
            echo "$response" | jq -r '.message' | sed 's/^/      /'
            return 0
        else
            echo -e "${RED}❌ UNHEALTHY (bad status)${NC}"
            echo "$response" | jq . 2>/dev/null || echo "$response" | sed 's/^/      /'
            return 1
        fi
    else
        echo -e "${RED}❌ UNREACHABLE${NC}"
        echo "      Error: $response"
        return 1
    fi
}

# MongoDB health check
check_mongodb_health() {
    echo -n "   MongoDB: "
    
    if docker exec mongodb-kas-federation mongosh --quiet --eval "db.adminCommand('ping').ok" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ HEALTHY${NC}"
        
        # Check federation_spokes collection
        SPOKE_COUNT=$(docker exec mongodb-kas-federation mongosh --quiet dive-v3-kas-test --eval "db.federation_spokes.countDocuments()" | tail -1)
        echo "      Federation spokes: $SPOKE_COUNT"
        return 0
    else
        echo -e "${RED}❌ UNREACHABLE${NC}"
        return 1
    fi
}

# Network connectivity check
check_network_connectivity() {
    local FROM_CONTAINER=$1
    local TO_CONTAINER=$2
    
    echo -n "      ${FROM_CONTAINER} → ${TO_CONTAINER}: "
    
    if docker exec "$FROM_CONTAINER" ping -c 1 -W 2 "$TO_CONTAINER" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        return 0
    else
        echo -e "${RED}✗${NC}"
        return 1
    fi
}

# mTLS certificate check
check_mtls_certs() {
    local KAS_NAME=$1
    local COUNTRY=$(echo "$KAS_NAME" | sed 's/kas-//')
    
    echo -n "   ${KAS_NAME}: "
    
    # Check if certificate files exist in container
    if docker exec "$KAS_NAME" test -f "/certs/${COUNTRY}/client.crt" && \
       docker exec "$KAS_NAME" test -f "/certs/${COUNTRY}/client.key" && \
       docker exec "$KAS_NAME" test -f "/certs/ca/ca.crt"; then
        echo -e "${GREEN}✅ Certificates present${NC}"
        
        # Verify certificate validity
        CERT_INFO=$(docker exec "$KAS_NAME" openssl x509 -in "/certs/${COUNTRY}/client.crt" -noout -subject -dates 2>&1)
        echo "$CERT_INFO" | sed 's/^/      /'
        return 0
    else
        echo -e "${RED}❌ Certificates missing${NC}"
        return 1
    fi
}

# ============================================
# 1. Check if containers are running
# ============================================
echo "[1/5] Container Status"
echo ""

CONTAINERS=("kas-usa" "kas-fra" "kas-gbr" "mongodb-kas-federation")
ALL_RUNNING=true

for container in "${CONTAINERS[@]}"; do
    echo -n "   $container: "
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        echo -e "${GREEN}✅ RUNNING${NC}"
    else
        echo -e "${RED}❌ NOT RUNNING${NC}"
        ALL_RUNNING=false
    fi
done

if [ "$ALL_RUNNING" = false ]; then
    echo ""
    echo -e "${RED}❌ Not all containers are running. Start with: docker-compose -f docker-compose.3kas.yml up -d${NC}"
    exit 1
fi

# ============================================
# 2. Health Checks
# ============================================
echo ""
echo "[2/5] Health Checks"
echo ""

HEALTH_PASS=true

check_kas_health "KAS-USA" 8081 || HEALTH_PASS=false
check_kas_health "KAS-FRA" 8082 || HEALTH_PASS=false
check_kas_health "KAS-GBR" 8083 || HEALTH_PASS=false
check_mongodb_health || HEALTH_PASS=false

if [ "$HEALTH_PASS" = false ]; then
    echo ""
    echo -e "${RED}❌ Health checks failed${NC}"
    exit 1
fi

# ============================================
# 3. Network Connectivity
# ============================================
echo ""
echo "[3/5] Network Connectivity"
echo ""

NETWORK_PASS=true

echo "   Inter-KAS connectivity:"
check_network_connectivity "kas-usa" "kas-fra" || NETWORK_PASS=false
check_network_connectivity "kas-usa" "kas-gbr" || NETWORK_PASS=false
check_network_connectivity "kas-fra" "kas-gbr" || NETWORK_PASS=false

echo "   KAS → MongoDB connectivity:"
check_network_connectivity "kas-usa" "mongodb-kas-federation" || NETWORK_PASS=false
check_network_connectivity "kas-fra" "mongodb-kas-federation" || NETWORK_PASS=false
check_network_connectivity "kas-gbr" "mongodb-kas-federation" || NETWORK_PASS=false

if [ "$NETWORK_PASS" = false ]; then
    echo ""
    echo -e "${RED}❌ Network connectivity failed${NC}"
    exit 1
fi

# ============================================
# 4. mTLS Certificates
# ============================================
echo ""
echo "[4/5] mTLS Certificates"
echo ""

MTLS_PASS=true

check_mtls_certs "kas-usa" || MTLS_PASS=false
check_mtls_certs "kas-fra" || MTLS_PASS=false
check_mtls_certs "kas-gbr" || MTLS_PASS=false

if [ "$MTLS_PASS" = false ]; then
    echo ""
    echo -e "${YELLOW}⚠️  mTLS certificates check failed (may not be critical if using mock HSM)${NC}"
fi

# ============================================
# 5. Federation Registry
# ============================================
echo ""
echo "[5/5] Federation Registry"
echo ""

echo "   Checking registry data..."
REGISTRY_CHECK=$(docker exec mongodb-kas-federation mongosh --quiet dive-v3-kas-test --eval "
db.federation_spokes.find().forEach(spoke => {
    print('   • ' + spoke.spokeId + ' (' + spoke.organization + ')');
    print('     URL: ' + spoke.kasUrl);
    print('     Agreements: ' + Object.keys(spoke.federationAgreements).join(', '));
});
")

echo "$REGISTRY_CHECK"

# ============================================
# Summary
# ============================================
echo ""
echo "========================================"
if [ "$HEALTH_PASS" = true ] && [ "$NETWORK_PASS" = true ]; then
    echo -e "${GREEN}✅ 3-KAS Environment Ready${NC}"
    echo "========================================"
    echo ""
    echo "All systems operational:"
    echo "   • KAS-USA:  https://localhost:8081/health"
    echo "   • KAS-FRA:  https://localhost:8082/health"
    echo "   • KAS-GBR:  https://localhost:8083/health"
    echo "   • MongoDB:  mongodb://localhost:27018"
    echo ""
    echo "Next steps:"
    echo "   1. Run integration tests: npm run test:integration"
    echo "   2. Run performance tests: npm run test:performance"
    echo "   3. View logs: docker-compose -f docker-compose.3kas.yml logs -f"
    echo ""
    exit 0
else
    echo -e "${RED}❌ 3-KAS Environment NOT Ready${NC}"
    echo "========================================"
    echo ""
    echo "Please check errors above and retry."
    echo ""
    exit 1
fi
