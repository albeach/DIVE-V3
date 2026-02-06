#!/bin/bash
# =============================================================================
# Stop Cloudflared Tunnels for USA (Hub), FRA, and GBR
# =============================================================================
# Purpose:
#   Stop all running cloudflared tunnels for DIVE V3 instances
#
# Usage:
#   ./scripts/stop-cloudflared-tunnels.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}Stopping Cloudflared Tunnels for DIVE V3 Federation${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo ""

# Function to stop a tunnel
stop_tunnel() {
    local instance=$1
    local pid_file="${PROJECT_ROOT}/logs/cloudflared-${instance}.pid"

    if [ -f "${pid_file}" ]; then
        local pid=$(cat "${pid_file}")

        if ps -p "${pid}" > /dev/null 2>&1; then
            echo -e "${GREEN}🛑 Stopping ${instance} tunnel (PID: ${pid})...${NC}"
            kill "${pid}" 2>/dev/null || true

            # Wait for process to stop (max 5 seconds)
            for i in {1..5}; do
                if ! ps -p "${pid}" > /dev/null 2>&1; then
                    echo -e "${GREEN}✅ ${instance} tunnel stopped${NC}"
                    rm -f "${pid_file}"
                    return 0
                fi
                sleep 1
            done

            # Force kill if still running
            if ps -p "${pid}" > /dev/null 2>&1; then
                echo -e "${YELLOW}⚠️  Force killing ${instance} tunnel...${NC}"
                kill -9 "${pid}" 2>/dev/null || true
                rm -f "${pid_file}"
            fi
        else
            echo -e "${YELLOW}⚠️  ${instance} tunnel PID file exists but process not running${NC}"
            rm -f "${pid_file}"
        fi
    else
        # Try to find and kill by process name
        local pids=$(pgrep -f "cloudflared.*${instance}" || true)
        if [ -n "${pids}" ]; then
            echo -e "${GREEN}🛑 Stopping ${instance} tunnel (found by name)...${NC}"
            echo "${pids}" | xargs kill 2>/dev/null || true
            sleep 1
            echo -e "${GREEN}✅ ${instance} tunnel stopped${NC}"
        else
            echo -e "${YELLOW}⚠️  ${instance} tunnel is not running${NC}"
        fi
    fi
    echo ""
}

# Stop all tunnels
stop_tunnel "usa"
stop_tunnel "fra"
stop_tunnel "gbr"

# Summary
echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}All Cloudflared Tunnels Stopped${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo ""

# Check for any remaining cloudflared processes
remaining=$(pgrep -f "cloudflared" || true)
if [ -n "${remaining}" ]; then
    echo -e "${YELLOW}⚠️  Warning: Some cloudflared processes are still running:${NC}"
    ps aux | grep cloudflared | grep -v grep || true
    echo ""
    echo "To force kill all: pkill -9 cloudflared"
else
    echo -e "${GREEN}✅ No cloudflared processes remaining${NC}"
fi
echo ""
