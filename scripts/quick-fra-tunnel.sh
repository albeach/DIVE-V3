#!/bin/bash

###############################################################################################
# Quick FRA Tunnel Setup for DIVE V3
# 
# Purpose: Quickly create a Cloudflare tunnel for the FRA instance
# This is a simplified version that creates one tunnel with all services
#
# Prerequisites:
#   - cloudflared CLI installed
#   - Logged into Cloudflare (cloudflared tunnel login)
#   - FRA instance running locally on ports 3001, 4001, 8444, 8083
#
# Usage: 
#   ./scripts/quick-fra-tunnel.sh [tunnel-name]
#   
# Example:
#   ./scripts/quick-fra-tunnel.sh dive-v3-fra
###############################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Configuration
TUNNEL_NAME="${1:-dive-v3-fra}"
CONFIG_DIR="$HOME/.cloudflared"
CONFIG_FILE="$CONFIG_DIR/${TUNNEL_NAME}-config.yml"

clear
echo -e "${MAGENTA}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${MAGENTA}     Cloudflare Tunnel Setup for FRA Instance${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo -e "${RED}❌ cloudflared is not installed${NC}"
    echo ""
    echo "Install it with:"
    echo "  macOS: brew install cloudflared"
    echo "  Linux: wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && sudo dpkg -i cloudflared-linux-amd64.deb"
    exit 1
fi

echo -e "${GREEN}✓ cloudflared is installed${NC}"
echo ""

# Check if FRA services are running
echo -e "${CYAN}Checking FRA services...${NC}"
FRA_RUNNING=true

if ! docker ps | grep -q "frontend-fra"; then
    echo -e "${YELLOW}⚠ FRA frontend not detected on port 3001${NC}"
    FRA_RUNNING=false
fi

if ! docker ps | grep -q "backend-fra"; then
    echo -e "${YELLOW}⚠ FRA backend not detected on port 4001${NC}"
    FRA_RUNNING=false
fi

if ! docker ps | grep -q "keycloak-fra"; then
    echo -e "${YELLOW}⚠ FRA Keycloak not detected on port 8444${NC}"
    FRA_RUNNING=false
fi

if [ "$FRA_RUNNING" = false ]; then
    echo ""
    echo -e "${YELLOW}FRA services not fully running. Start them with:${NC}"
    echo "  ./scripts/deploy-fra-alongside-usa.sh"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo -e "${GREEN}✓ All FRA services detected${NC}"
fi

echo ""
echo -e "${CYAN}═══ Step 1: Check Authentication ═══${NC}"
echo ""

# Check if user is logged in
if ! cloudflared tunnel list &> /dev/null; then
    echo -e "${YELLOW}Not logged into Cloudflare. Logging in...${NC}"
    cloudflared tunnel login
else
    echo -e "${GREEN}✓ Already authenticated with Cloudflare${NC}"
fi

echo ""
echo -e "${CYAN}═══ Step 2: Check/Create Tunnel ═══${NC}"
echo ""

# Check if tunnel already exists
if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
    echo -e "${YELLOW}⚠ Tunnel '$TUNNEL_NAME' already exists${NC}"
    echo ""
    read -p "Delete and recreate? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Deleting existing tunnel..."
        cloudflared tunnel delete "$TUNNEL_NAME" -f || true
        echo "Creating new tunnel..."
        TUNNEL_ID=$(cloudflared tunnel create "$TUNNEL_NAME" 2>&1 | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' | head -1)
    else
        # Get existing tunnel ID
        TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
    fi
else
    echo "Creating tunnel '$TUNNEL_NAME'..."
    TUNNEL_ID=$(cloudflared tunnel create "$TUNNEL_NAME" 2>&1 | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' | head -1)
fi

if [ -z "$TUNNEL_ID" ]; then
    echo -e "${RED}❌ Failed to get tunnel ID${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Tunnel ID: $TUNNEL_ID${NC}"

echo ""
echo -e "${CYAN}═══ Step 3: Configure DNS (Manual Step Required) ═══${NC}"
echo ""

echo -e "${YELLOW}You need to add CNAME records in your Cloudflare dashboard:${NC}"
echo ""
echo "  1. Go to: https://dash.cloudflare.com"
echo "  2. Select your domain"
echo "  3. Go to DNS → Records"
echo "  4. Add these CNAME records:"
echo ""
echo -e "${BLUE}  Name              Target${NC}"
echo "  ────────────────  ─────────────────────────────────────"
echo "  fra-app           ${TUNNEL_ID}.cfargotunnel.com"
echo "  fra-api           ${TUNNEL_ID}.cfargotunnel.com"
echo "  fra-idp           ${TUNNEL_ID}.cfargotunnel.com"
echo "  fra-kas           ${TUNNEL_ID}.cfargotunnel.com"
echo ""
echo -e "${YELLOW}Or use these commands if you have CF_API_TOKEN set:${NC}"
echo ""
echo "  cloudflared tunnel route dns $TUNNEL_NAME fra-app.yourdomain.com"
echo "  cloudflared tunnel route dns $TUNNEL_NAME fra-api.yourdomain.com"
echo "  cloudflared tunnel route dns $TUNNEL_NAME fra-idp.yourdomain.com"
echo "  cloudflared tunnel route dns $TUNNEL_NAME fra-kas.yourdomain.com"
echo ""
read -p "Press Enter when DNS records are configured..."

echo ""
echo -e "${CYAN}═══ Step 4: Create Tunnel Configuration ═══${NC}"
echo ""

# Create configuration file
cat > "$CONFIG_FILE" << EOF
tunnel: $TUNNEL_ID
credentials-file: $CONFIG_DIR/$TUNNEL_ID.json

ingress:
  # Frontend (Next.js) on port 3001
  - hostname: fra-app.*
    service: https://localhost:3001
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  
  # Backend API on port 4001  
  - hostname: fra-api.*
    service: https://localhost:4001
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  
  # Keycloak IdP on port 8444
  - hostname: fra-idp.*
    service: http://localhost:8444
    originRequest:
      noTLSVerify: false
      connectTimeout: 30s
  
  # KAS on port 8083
  - hostname: fra-kas.*
    service: http://localhost:8083
    originRequest:
      noTLSVerify: false
      connectTimeout: 30s
  
  # Health check endpoint
  - hostname: fra-health.*
    service: http://localhost:4001/health
    originRequest:
      noTLSVerify: false
  
  # Catch-all
  - service: http_status:404
EOF

echo -e "${GREEN}✓ Configuration saved to: $CONFIG_FILE${NC}"

echo ""
echo -e "${CYAN}═══ Step 5: Start Tunnel ═══${NC}"
echo ""

echo "Starting tunnel in the background..."
echo ""

# Create a simple launcher script
LAUNCHER_SCRIPT="$CONFIG_DIR/run-${TUNNEL_NAME}.sh"
cat > "$LAUNCHER_SCRIPT" << EOF
#!/bin/bash
echo "Starting $TUNNEL_NAME tunnel..."
echo "Config: $CONFIG_FILE"
echo ""
echo "Tunnel will run in this terminal. Press Ctrl+C to stop."
echo ""
cloudflared tunnel --config "$CONFIG_FILE" run
EOF

chmod +x "$LAUNCHER_SCRIPT"

echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}     Tunnel Setup Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${CYAN}To run the tunnel:${NC}"
echo ""
echo "  Option 1 (Foreground - see logs):"
echo "    cloudflared tunnel --config $CONFIG_FILE run"
echo ""
echo "  Option 2 (Background service):"
echo "    cloudflared service install --config $CONFIG_FILE"
echo "    sudo cloudflared service start"
echo ""
echo "  Option 3 (Quick script):"
echo "    $LAUNCHER_SCRIPT"
echo ""

echo -e "${CYAN}Your FRA instance will be accessible at:${NC}"
echo "  🌐 https://fra-app.yourdomain.com (Frontend)"
echo "  🔌 https://fra-api.yourdomain.com (API)"
echo "  🔑 https://fra-idp.yourdomain.com (Keycloak)"
echo "  🔐 https://fra-kas.yourdomain.com (KAS)"
echo ""

echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Run the tunnel using one of the options above"
echo "  2. Configure Zero Trust policies in Cloudflare dashboard"
echo "  3. Test access to your FRA services"
echo "  4. Set up federation with USA instance"
echo ""

# Offer to start the tunnel now
read -p "Start the tunnel now? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${CYAN}Starting tunnel (press Ctrl+C to stop)...${NC}"
    echo ""
    cloudflared tunnel --config "$CONFIG_FILE" run
fi




