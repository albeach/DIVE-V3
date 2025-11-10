#!/usr/bin/env bash
# ============================================
# DIVE V3 - KAS Tunnel Exposer
# Exposes KAS server for external partner testing
# ============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
KAS_PORT="${KAS_PORT:-8080}"
TUNNEL_METHOD="${1:-ngrok}"  # ngrok, cloudflared, or localtunnel

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   DIVE V3 - KAS Tunnel Exposer        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo

# ============================================
# Check if KAS is running
# ============================================
echo -e "${YELLOW}→${NC} Checking if KAS is running on port ${KAS_PORT}..."

if ! curl -s "http://localhost:${KAS_PORT}/health" > /dev/null 2>&1; then
    echo -e "${RED}✗${NC} KAS is not running on port ${KAS_PORT}"
    echo
    echo "Start KAS with: docker-compose up -d kas"
    echo "Or: cd kas && npm run dev"
    exit 1
fi

echo -e "${GREEN}✓${NC} KAS is running"
echo

# ============================================
# Expose using selected method
# ============================================
case "$TUNNEL_METHOD" in
    ngrok)
        echo -e "${YELLOW}→${NC} Starting ngrok tunnel..."
        echo
        
        if ! command -v ngrok &> /dev/null; then
            echo -e "${RED}✗${NC} ngrok is not installed"
            echo
            echo "Install with:"
            echo "  macOS:   brew install ngrok"
            echo "  Linux:   snap install ngrok"
            echo "  Windows: choco install ngrok"
            echo
            echo "Or download from: https://ngrok.com/download"
            exit 1
        fi
        
        echo -e "${GREEN}Starting ngrok on port ${KAS_PORT}...${NC}"
        echo
        echo -e "${BLUE}════════════════════════════════════════${NC}"
        echo -e "${BLUE}  Share the HTTPS URL with your partner${NC}"
        echo -e "${BLUE}════════════════════════════════════════${NC}"
        echo
        
        ngrok http ${KAS_PORT} --log=stdout
        ;;
        
    cloudflared)
        echo -e "${YELLOW}→${NC} Starting Cloudflare Tunnel..."
        echo
        
        if ! command -v cloudflared &> /dev/null; then
            echo -e "${RED}✗${NC} cloudflared is not installed"
            echo
            echo "Install with:"
            echo "  macOS:   brew install cloudflare/cloudflare/cloudflared"
            echo "  Linux:   wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb"
            echo "           sudo dpkg -i cloudflared-linux-amd64.deb"
            echo "  Windows: Download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation"
            exit 1
        fi
        
        echo -e "${GREEN}Starting Cloudflare Tunnel on port ${KAS_PORT}...${NC}"
        echo
        echo -e "${BLUE}════════════════════════════════════════${NC}"
        echo -e "${BLUE}  Share the URL with your partner${NC}"
        echo -e "${BLUE}════════════════════════════════════════${NC}"
        echo
        
        cloudflared tunnel --url "http://localhost:${KAS_PORT}"
        ;;
        
    localtunnel)
        echo -e "${YELLOW}→${NC} Starting LocalTunnel..."
        echo
        
        if ! command -v lt &> /dev/null; then
            echo -e "${YELLOW}→${NC} Installing localtunnel..."
            npm install -g localtunnel
        fi
        
        echo -e "${GREEN}Starting LocalTunnel on port ${KAS_PORT}...${NC}"
        echo
        echo -e "${BLUE}════════════════════════════════════════${NC}"
        echo -e "${BLUE}  Share the URL with your partner${NC}"
        echo -e "${BLUE}════════════════════════════════════════${NC}"
        echo
        
        lt --port ${KAS_PORT}
        ;;
        
    *)
        echo -e "${RED}✗${NC} Unknown tunnel method: ${TUNNEL_METHOD}"
        echo
        echo "Usage: $0 [ngrok|cloudflared|localtunnel]"
        echo
        echo "Examples:"
        echo "  $0 ngrok        # Use ngrok (recommended)"
        echo "  $0 cloudflared  # Use Cloudflare Tunnel"
        echo "  $0 localtunnel  # Use LocalTunnel"
        exit 1
        ;;
esac

