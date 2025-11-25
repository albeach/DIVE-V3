#!/bin/bash

# DIVE V3 Instance Warm-Up Script
# Run this before demos to pre-compile all pages and ensure zero 502 errors
# 
# This script:
# 1. Hits each frontend to trigger compilation
# 2. Retries until successful (with backoff)
# 3. Verifies all pages are working
# 4. Reports status

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "\n${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       DIVE V3 Instance Warm-Up Script                          ║${NC}"
echo -e "${CYAN}║       Run this BEFORE your demo to eliminate 502 errors        ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}\n"

# Configuration
INSTANCES=(
    "USA|https://usa-app.dive25.com"
    "FRA|https://fra-app.dive25.com"
    "DEU|https://deu-app.dive25.com"
)

MAX_RETRIES=20
RETRY_DELAY=5
TIMEOUT=30

# Function to warm up an instance
warm_up_instance() {
    local name=$1
    local url=$2
    local attempt=1
    
    echo -e "${BLUE}▸${NC} Warming up ${CYAN}${name}${NC} instance..."
    
    while [ $attempt -le $MAX_RETRIES ]; do
        echo -e "  Attempt $attempt/$MAX_RETRIES: Hitting $url..."
        
        # Try to fetch the page (with cache-busting headers)
        cache_buster="?_=$(date +%s)"
        http_code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time $TIMEOUT \
            -H "Cache-Control: no-cache, no-store" \
            -H "Pragma: no-cache" \
            "${url}${cache_buster}" 2>/dev/null || echo "000")
        
        if [ "$http_code" = "200" ]; then
            echo -e "  ${GREEN}✓${NC} ${name} is ready! (HTTP $http_code)"
            
            # Hit additional pages to fully warm up
            echo -e "  ${BLUE}▸${NC} Pre-compiling additional routes..."
            curl -sk -o /dev/null --max-time $TIMEOUT "$url/dashboard" 2>/dev/null || true
            curl -sk -o /dev/null --max-time $TIMEOUT "$url/api/health" 2>/dev/null || true
            
            return 0
        elif [ "$http_code" = "502" ] || [ "$http_code" = "503" ] || [ "$http_code" = "000" ]; then
            echo -e "  ${YELLOW}⚠${NC} Not ready yet (HTTP $http_code), waiting ${RETRY_DELAY}s..."
            sleep $RETRY_DELAY
            ((attempt++))
        else
            echo -e "  ${YELLOW}⚠${NC} Unexpected status (HTTP $http_code), retrying..."
            sleep $RETRY_DELAY
            ((attempt++))
        fi
    done
    
    echo -e "  ${RED}✗${NC} ${name} failed to warm up after $MAX_RETRIES attempts"
    return 1
}

# Function to verify all instances are healthy
verify_all_healthy() {
    echo -e "\n${BLUE}━━━ Final Verification (with cache bypass) ━━━${NC}\n"
    
    local all_healthy=true
    
    for instance in "${INSTANCES[@]}"; do
        IFS='|' read -r name url <<< "$instance"
        
        # Use cache-busting to ensure fresh response
        cache_buster="?verify=$(date +%s%N)"
        http_code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 15 \
            -H "Cache-Control: no-cache, no-store, must-revalidate" \
            -H "Pragma: no-cache" \
            -H "Expires: 0" \
            "${url}${cache_buster}" 2>/dev/null || echo "000")
        
        if [ "$http_code" = "200" ]; then
            echo -e "${GREEN}✓${NC} ${name}: Ready (HTTP $http_code)"
        else
            echo -e "${RED}✗${NC} ${name}: Not ready (HTTP $http_code)"
            all_healthy=false
        fi
    done
    
    echo ""
    
    if [ "$all_healthy" = true ]; then
        echo -e "${GREEN}═══════════════════════════════════════════════════════════════════${NC}"
        echo -e "${GREEN}  ✓ ALL INSTANCES READY FOR DEMO!                                  ${NC}"
        echo -e "${GREEN}═══════════════════════════════════════════════════════════════════${NC}\n"
        return 0
    else
        echo -e "${RED}═══════════════════════════════════════════════════════════════════${NC}"
        echo -e "${RED}  ✗ SOME INSTANCES NOT READY - Check logs and retry                ${NC}"
        echo -e "${RED}═══════════════════════════════════════════════════════════════════${NC}\n"
        return 1
    fi
}

# Main execution
echo -e "${BLUE}Starting warm-up sequence...${NC}\n"

# Warm up each instance in parallel
for instance in "${INSTANCES[@]}"; do
    IFS='|' read -r name url <<< "$instance"
    warm_up_instance "$name" "$url" &
done

# Wait for all warm-ups to complete
wait

# Wait for Cloudflare cache to expire (502 errors are cached for ~30s)
echo -e "\n${BLUE}▸${NC} Waiting 35s for Cloudflare cache to clear..."
echo -e "  (Cloudflare caches 502 errors for ~30 seconds)"
sleep 35

# Final verification
verify_all_healthy

echo -e "${CYAN}Tip:${NC} Run this script 2-3 minutes before your demo starts."
echo -e "${CYAN}Tip:${NC} Keep browser tabs open to the instances to maintain warm cache.\n"

