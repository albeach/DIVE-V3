#!/bin/bash
# Cloudflare Utilities Script for DIVE V3
# Uses API token from .env.cloudflare or CLOUDFLARE_API_TOKEN env var

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Load .env.cloudflare if it exists
if [ -f "$PROJECT_DIR/.env.cloudflare" ]; then
  source "$PROJECT_DIR/.env.cloudflare"
fi

ZONE_NAME="${CLOUDFLARE_ZONE_NAME:-dive25.com}"
ZONE_ID="${CLOUDFLARE_ZONE_ID:-}"
API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"

# Validate token
if [ -z "$API_TOKEN" ]; then
  echo -e "${RED}Error: CLOUDFLARE_API_TOKEN not set${NC}"
  echo -e "Run: ${CYAN}./scripts/setup-cloudflare-secrets.sh${NC}"
  exit 1
fi

# Commands
case "${1:-help}" in
  purge|purge-cache)
    echo -e "${CYAN}Purging cache for ${ZONE_NAME}...${NC}"
    
    if [ -z "$ZONE_ID" ]; then
      ZONE_ID=$(curl -s "https://api.cloudflare.com/client/v4/zones?name=${ZONE_NAME}" \
        -H "Authorization: Bearer $API_TOKEN" | jq -r '.result[0].id')
    fi
    
    if [ -z "$ZONE_ID" ] || [ "$ZONE_ID" = "null" ]; then
      echo -e "${RED}Error: Could not get zone ID${NC}"
      exit 1
    fi
    
    if [ -n "$2" ]; then
      # Purge specific URLs
      shift
      URLS=$(printf '"%s",' "$@" | sed 's/,$//')
      RESULT=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache" \
        -H "Authorization: Bearer $API_TOKEN" \
        -H "Content-Type: application/json" \
        --data "{\"files\":[$URLS]}")
    else
      # Purge everything
      RESULT=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache" \
        -H "Authorization: Bearer $API_TOKEN" \
        -H "Content-Type: application/json" \
        --data '{"purge_everything":true}')
    fi
    
    if echo "$RESULT" | jq -e '.success' > /dev/null 2>&1; then
      echo -e "${GREEN}✓ Cache purged successfully${NC}"
    else
      echo -e "${RED}✗ Cache purge failed${NC}"
      echo "$RESULT" | jq .
      exit 1
    fi
    ;;
    
  zone|zone-info)
    echo -e "${CYAN}Zone: ${ZONE_NAME}${NC}"
    echo "Zone ID: ${ZONE_ID:-$(curl -s "https://api.cloudflare.com/client/v4/zones?name=${ZONE_NAME}" \
      -H "Authorization: Bearer $API_TOKEN" | jq -r '.result[0].id')}"
    ;;
    
  dns|dns-list)
    echo -e "${CYAN}DNS records for ${ZONE_NAME}:${NC}"
    if [ -z "$ZONE_ID" ]; then
      ZONE_ID=$(curl -s "https://api.cloudflare.com/client/v4/zones?name=${ZONE_NAME}" \
        -H "Authorization: Bearer $API_TOKEN" | jq -r '.result[0].id')
    fi
    curl -s "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
      -H "Authorization: Bearer $API_TOKEN" | jq '.result[] | {name, type, content, proxied}'
    ;;
    
  tunnels|tunnel-list)
    echo -e "${CYAN}Cloudflare Tunnels:${NC}"
    cloudflared tunnel list 2>/dev/null || echo -e "${YELLOW}Run: cloudflared tunnel list${NC}"
    ;;
    
  status|tunnel-status)
    TUNNEL_NAME="${2:-dive-v3-tunnel}"
    echo -e "${CYAN}Checking tunnel: ${TUNNEL_NAME}${NC}"
    if pgrep -f "$TUNNEL_NAME" > /dev/null; then
      echo -e "${GREEN}✓ Tunnel is running${NC}"
    else
      echo -e "${YELLOW}✗ Tunnel not running${NC}"
    fi
    ;;
    
  verify|verify-token)
    echo -e "${CYAN}Verifying API token...${NC}"
    RESULT=$(curl -s "https://api.cloudflare.com/client/v4/user/tokens/verify" \
      -H "Authorization: Bearer $API_TOKEN")
    if echo "$RESULT" | jq -e '.success' > /dev/null 2>&1; then
      echo -e "${GREEN}✓ Token is valid${NC}"
      echo "$RESULT" | jq '.result'
    else
      echo -e "${RED}✗ Token invalid${NC}"
      echo "$RESULT" | jq .
    fi
    ;;
    
  help|*)
    echo "DIVE V3 Cloudflare Utilities"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  purge [urls...]    Purge cache (all or specific URLs)"
    echo "  zone               Show zone information"
    echo "  dns                List DNS records"
    echo "  tunnels            List Cloudflare tunnels"
    echo "  status [name]      Check tunnel status"
    echo "  verify             Verify API token"
    echo "  help               Show this help"
    echo ""
    echo "Config: .env.cloudflare or CLOUDFLARE_API_TOKEN env var"
    ;;
esac
