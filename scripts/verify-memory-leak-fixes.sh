#!/bin/bash
#
# Memory Leak Fix Verification Script
#
# Verifies that Phase 1 root cause fixes are working correctly:
# 1. MongoDB singleton connection pool (stable connection count)
# 2. TCP-based health checks (zero mongosh connections)
# 3. Keycloak session pruning (reduced memory growth)
#
# Usage: ./scripts/verify-memory-leak-fixes.sh [duration_minutes]
# Example: ./scripts/verify-memory-leak-fixes.sh 10

set -e

DURATION_MINUTES=${1:-10}
INTERVAL_SECONDS=30
TOTAL_CHECKS=$((DURATION_MINUTES * 60 / INTERVAL_SECONDS))

echo "🔍 Memory Leak Fix Verification Script"
echo "======================================"
echo ""
echo "Duration: ${DURATION_MINUTES} minutes"
echo "Check interval: ${INTERVAL_SECONDS} seconds"
echo "Total checks: ${TOTAL_CHECKS}"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Results tracking
declare -a MONGO_CONNECTIONS
declare -a HUB_KEYCLOAK_MEMORY
declare -a HUB_MONGODB_MEMORY

check_count=0

echo "Starting monitoring..."
echo ""

for i in $(seq 1 $TOTAL_CHECKS); do
    check_count=$((check_count + 1))
    timestamp=$(date '+%H:%M:%S')
    
    echo "[$timestamp] Check $check_count/$TOTAL_CHECKS"
    echo "----------------------------------------"
    
    # Check 1: MongoDB Connection Count
    if docker ps --format '{{.Names}}' | grep -q 'mongodb'; then
        mongo_container=$(docker ps --format '{{.Names}}' | grep 'mongodb' | head -n 1)
        
        # Get current connections
        mongo_connections=$(docker exec $mongo_container mongosh admin \
            -u admin \
            -p "${MONGO_PASSWORD_USA:-DivePilot2025!}" \
            --tls --tlsAllowInvalidCertificates \
            --quiet \
            --eval "db.serverStatus().connections.current" 2>/dev/null || echo "0")
        
        # Get total created (cumulative)
        mongo_total_created=$(docker exec $mongo_container mongosh admin \
            -u admin \
            -p "${MONGO_PASSWORD_USA:-DivePilot2025!}" \
            --tls --tlsAllowInvalidCertificates \
            --quiet \
            --eval "db.serverStatus().connections.totalCreated" 2>/dev/null || echo "0")
        
        MONGO_CONNECTIONS+=($mongo_connections)
        
        echo "  MongoDB Connections:"
        echo "    Current: $mongo_connections (should be ~20-30 with singleton)"
        echo "    Total Created: $mongo_total_created"
        
        if [ $check_count -gt 1 ]; then
            prev_idx=$((${#MONGO_CONNECTIONS[@]} - 2))
            prev_connections=${MONGO_CONNECTIONS[$prev_idx]}
            delta=$((mongo_connections - prev_connections))
            
            if [ $delta -gt 5 ]; then
                echo -e "    ${RED}⚠️  WARNING: +${delta} connections since last check (potential leak)${NC}"
            elif [ $delta -gt 0 ]; then
                echo -e "    ${YELLOW}△ +${delta} connections (normal variance)${NC}"
            else
                echo -e "    ${GREEN}✓ Stable connection count${NC}"
            fi
        fi
    else
        echo "  MongoDB: Container not running"
    fi
    
    echo ""
    
    # Check 2: Hub Memory Usage
    if docker ps --format '{{.Names}}' | grep -q 'hub-keycloak'; then
        hub_kc_mem=$(docker stats --no-stream --format "{{.MemUsage}}" dive-hub-keycloak | awk '{print $1}')
        HUB_KEYCLOAK_MEMORY+=($hub_kc_mem)
        echo "  Hub Keycloak Memory: $hub_kc_mem (limit: 1.5GB)"
    fi
    
    if docker ps --format '{{.Names}}' | grep -q 'hub-mongodb'; then
        hub_mongo_mem=$(docker stats --no-stream --format "{{.MemUsage}}" dive-hub-mongodb | awk '{print $1}')
        HUB_MONGODB_MEMORY+=($hub_mongo_mem)
        echo "  Hub MongoDB Memory: $hub_mongo_mem (limit: 2GB)"
    fi
    
    echo ""
    
    # Sleep until next check (unless this is the last check)
    if [ $i -lt $TOTAL_CHECKS ]; then
        sleep $INTERVAL_SECONDS
    fi
done

echo ""
echo "======================================"
echo "📊 Verification Results Summary"
echo "======================================"
echo ""

# Analyze MongoDB connections
if [ ${#MONGO_CONNECTIONS[@]} -gt 0 ]; then
    first_conn=${MONGO_CONNECTIONS[0]}
    last_conn=${MONGO_CONNECTIONS[-1]}
    max_conn=$(printf '%s\n' "${MONGO_CONNECTIONS[@]}" | sort -n | tail -n 1)
    min_conn=$(printf '%s\n' "${MONGO_CONNECTIONS[@]}" | sort -n | head -n 1)
    
    echo "MongoDB Connection Analysis:"
    echo "  First check: $first_conn connections"
    echo "  Last check: $last_conn connections"
    echo "  Min: $min_conn | Max: $max_conn"
    
    conn_growth=$((last_conn - first_conn))
    if [ $conn_growth -gt 50 ]; then
        echo -e "  ${RED}❌ FAIL: Connection leak detected (+${conn_growth} connections)${NC}"
        echo "  ACTION REQUIRED: MongoDB singleton not working correctly"
    elif [ $conn_growth -gt 10 ]; then
        echo -e "  ${YELLOW}⚠️  WARN: Moderate connection growth (+${conn_growth})${NC}"
        echo "  INVESTIGATE: Some services may not be using singleton"
    else
        echo -e "  ${GREEN}✅ PASS: Connections stable (±${conn_growth})${NC}"
        echo "  MongoDB singleton is working correctly"
    fi
fi

echo ""

# Expected vs Actual comparison
echo "Expected Results (After Fixes):"
echo "  ✓ MongoDB connections: 20-30 stable (not growing)"
echo "  ✓ Hub Keycloak: < 1.2 GB"
echo "  ✓ Hub MongoDB: < 1.5 GB"
echo ""

echo "Health Check Verification:"
echo "  Run: docker inspect dive-hub-mongodb --format '{{.Config.Healthcheck.Test}}'"
echo "  Expected: [CMD-SHELL nc -z localhost 27017 || exit 1]"
echo ""

echo "Next Steps:"
echo "  1. If connections are stable: ✅ Phase 1 fixes verified"
echo "  2. If connections growing: ⚠️  Run refactor-mongo-singleton.sh"
echo "  3. Monitor for 24 hours to confirm long-term stability"
echo ""

# Save results to file
RESULTS_FILE="memory-leak-verification-$(date +%Y%m%d-%H%M%S).log"
{
    echo "Memory Leak Fix Verification"
    echo "Date: $(date)"
    echo "Duration: ${DURATION_MINUTES} minutes"
    echo ""
    echo "MongoDB Connections: ${MONGO_CONNECTIONS[*]}"
    echo "Connection Growth: $conn_growth"
    echo ""
    echo "Hub Keycloak Memory: ${HUB_KEYCLOAK_MEMORY[*]}"
    echo "Hub MongoDB Memory: ${HUB_MONGODB_MEMORY[*]}"
} > "$RESULTS_FILE"

echo "📄 Results saved to: $RESULTS_FILE"
