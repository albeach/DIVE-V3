#!/bin/bash
# =============================================================================
# Start Cloudflared Tunnels for USA (Hub), FRA, and GBR
# =============================================================================
# Purpose:
#   Launch cloudflared tunnels to expose instances through dive25.com domains:
#   - USA (Hub): usa-*.dive25.com
#   - FRA: fra-*.dive25.com
#   - GBR: gbr-*.dive25.com
#
# Usage:
#   ./scripts/start-cloudflared-tunnels.sh
#
# Requirements:
#   - cloudflared installed (brew install cloudflare/cloudflare/cloudflared)
#   - Tunnel credentials in cloudflared/ directory
#   - Tunnel configurations in cloudflared/config*.yml
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CLOUDFLARED_DIR="${PROJECT_ROOT}/cloudflared"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}Starting Cloudflared Tunnels for DIVE V3 Federation${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo -e "${RED}ERROR: cloudflared not found${NC}"
    echo "Install with: brew install cloudflare/cloudflare/cloudflared"
    exit 1
fi

# Function to check if tunnel is already running
is_tunnel_running() {
    local instance=$1
    pgrep -f "cloudflared.*${instance}" > /dev/null 2>&1
}

# Function to start a tunnel
start_tunnel() {
    local instance=$1
    local config_file=$2
    local credentials_file=$3
    local log_file="${PROJECT_ROOT}/logs/cloudflared-${instance}.log"

    # Create logs directory if it doesn't exist
    mkdir -p "${PROJECT_ROOT}/logs"

    if is_tunnel_running "${instance}"; then
        echo -e "${YELLOW}⚠️  ${instance} tunnel is already running${NC}"
        return 0
    fi

    echo -e "${GREEN}🚀 Starting ${instance} tunnel...${NC}"
    echo "   Config: ${config_file}"
    echo "   Credentials: ${credentials_file}"
    echo "   Log: ${log_file}"

    # Start tunnel in background
    nohup cloudflared tunnel \
        --config "${config_file}" \
        --credentials-file "${credentials_file}" \
        run > "${log_file}" 2>&1 &

    local pid=$!
    echo "   PID: ${pid}"
    echo "${pid}" > "${PROJECT_ROOT}/logs/cloudflared-${instance}.pid"

    # Wait a moment to check if it started successfully
    sleep 2

    if ps -p "${pid}" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ ${instance} tunnel started successfully${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}❌ Failed to start ${instance} tunnel${NC}"
        echo "   Check log: ${log_file}"
        echo ""
        return 1
    fi
}

# Start USA (Hub) tunnel
echo -e "${GREEN}Starting USA (Hub) Tunnel${NC}"
echo "Domain endpoints:"
echo "  - usa-app.dive25.com → Frontend (port 3000)"
echo "  - usa-api.dive25.com → Backend (port 4000)"
echo "  - usa-idp.dive25.com → Keycloak (port 8443)"
echo "  - usa-kas.dive25.com → KAS (port 8080)"
echo ""
start_tunnel "usa" \
    "${CLOUDFLARED_DIR}/config.yml" \
    "${CLOUDFLARED_DIR}/tunnel-credentials.json"

# Start FRA tunnel
echo -e "${GREEN}Starting FRA Tunnel${NC}"
echo "Domain endpoints:"
echo "  - fra-app.dive25.com → Frontend (port 3000)"
echo "  - fra-api.dive25.com → Backend (port 4000)"
echo "  - fra-idp.dive25.com → Keycloak (port 8443)"
echo "  - fra-kas.dive25.com → KAS (port 8080)"
echo ""
start_tunnel "fra" \
    "${CLOUDFLARED_DIR}/config-fra.yml" \
    "${CLOUDFLARED_DIR}/fra-tunnel-credentials.json"

# Start GBR tunnel
echo -e "${GREEN}Starting GBR Tunnel${NC}"
echo "Domain endpoints:"
echo "  - gbr-app.dive25.com → Frontend (port 3003)"
echo "  - gbr-api.dive25.com → Backend (port 4003)"
echo "  - gbr-idp.dive25.com → Keycloak (port 8446)"
echo "  - gbr-kas.dive25.com → KAS (port 8093)"
echo ""
start_tunnel "gbr" \
    "${CLOUDFLARED_DIR}/config-gbr.yml" \
    "${CLOUDFLARED_DIR}/gbr-tunnel-credentials.json"

# Summary
echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}Tunnel Status Summary${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo ""

for instance in usa fra gbr; do
    instance_upper=$(echo "${instance}" | tr '[:lower:]' '[:upper:]')
    if is_tunnel_running "${instance}"; then
        echo -e "${GREEN}✅ ${instance_upper} tunnel: Running${NC}"
        if [ -f "${PROJECT_ROOT}/logs/cloudflared-${instance}.pid" ]; then
            pid=$(cat "${PROJECT_ROOT}/logs/cloudflared-${instance}.pid")
            echo "   PID: ${pid}"
        fi
    else
        echo -e "${RED}❌ ${instance_upper} tunnel: Not running${NC}"
    fi
done

echo ""
echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}Access URLs${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo ""
echo "USA (Hub):"
echo "  Frontend: https://usa-app.dive25.com"
echo "  Backend:  https://usa-api.dive25.com"
echo "  Keycloak: https://usa-idp.dive25.com"
echo "  KAS:      https://usa-kas.dive25.com"
echo ""
echo "FRA (France):"
echo "  Frontend: https://fra-app.dive25.com"
echo "  Backend:  https://fra-api.dive25.com"
echo "  Keycloak: https://fra-idp.dive25.com"
echo "  KAS:      https://fra-kas.dive25.com"
echo ""
echo "GBR (United Kingdom):"
echo "  Frontend: https://gbr-app.dive25.com"
echo "  Backend:  https://gbr-api.dive25.com"
echo "  Keycloak: https://gbr-idp.dive25.com"
echo "  KAS:      https://gbr-kas.dive25.com"
echo ""
echo -e "${GREEN}==============================================================================${NC}"
echo ""
echo "To stop tunnels: ./scripts/stop-cloudflared-tunnels.sh"
echo "View logs: tail -f logs/cloudflared-{usa,fra,gbr}.log"
echo ""
