#!/bin/bash

# DIVE V3 Keep-Warm Script
# Run this in the background during your demo to keep instances responsive
# 
# This script periodically pings all instances to:
# 1. Keep Next.js compilation cache hot
# 2. Maintain Cloudflare tunnel connections
# 3. Prevent cold starts

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
PING_INTERVAL=30  # seconds between pings
INSTANCES=(
    "USA|https://usa-app.dive25.com"
    "FRA|https://fra-app.dive25.com"
    "DEU|https://deu-app.dive25.com"
)

echo -e "\n${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       DIVE V3 Keep-Warm Service                                ║${NC}"
echo -e "${CYAN}║       Press Ctrl+C to stop                                     ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}\n"

echo -e "${BLUE}▸${NC} Pinging instances every ${PING_INTERVAL} seconds..."
echo -e "${BLUE}▸${NC} Keep this running in the background during your demo\n"

ping_count=0

while true; do
    ((ping_count++))
    timestamp=$(date '+%H:%M:%S')
    
    echo -e "${BLUE}[${timestamp}]${NC} Ping #${ping_count}"
    
    for instance in "${INSTANCES[@]}"; do
        IFS='|' read -r name url <<< "$instance"
        
        http_code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
        
        if [ "$http_code" = "200" ]; then
            echo -e "  ${GREEN}✓${NC} ${name}: OK"
        else
            echo -e "  ${YELLOW}⚠${NC} ${name}: HTTP ${http_code}"
        fi
    done
    
    echo ""
    sleep $PING_INTERVAL
done


