#!/bin/bash
# =============================================================================
# Check Status of Cloudflared Tunnels for USA (Hub), FRA, and GBR
# =============================================================================
# Purpose:
#   Display the current status of all DIVE V3 cloudflared tunnels
#
# Usage:
#   ./scripts/cloudflared-status.sh
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}==============================================================================${NC}"
echo -e "${BLUE}Cloudflared Tunnel Status - DIVE V3 Federation${NC}"
echo -e "${BLUE}==============================================================================${NC}"
echo ""

# Function to check if tunnel is running
is_tunnel_running() {
    local instance=$1
    local pid_file="${PROJECT_ROOT}/logs/cloudflared-${instance}.pid"
    
    # Check PID file first
    if [ -f "${pid_file}" ]; then
        local pid=$(cat "${pid_file}")
        if ps -p "${pid}" > /dev/null 2>&1; then
            return 0
        fi
    fi
    
    # Fallback: check by config file name
    local config_pattern
    if [ "${instance}" = "usa" ]; then
        config_pattern="config.yml"
    else
        config_pattern="config-${instance}.yml"
    fi
    
    pgrep -f "cloudflared.*${config_pattern}" > /dev/null 2>&1
}

# Function to get connection count from log
get_connection_count() {
    local log_file=$1
    if [ -f "${log_file}" ]; then
        grep "Registered tunnel connection" "${log_file}" | wc -l | tr -d ' '
    else
        echo "0"
    fi
}

# Function to check last log entry time
get_last_log_time() {
    local log_file=$1
    if [ -f "${log_file}" ]; then
        tail -1 "${log_file}" | cut -d' ' -f1
    else
        echo "N/A"
    fi
}

# Check each tunnel
for instance in usa fra gbr; do
    instance_upper=$(echo "${instance}" | tr '[:lower:]' '[:upper:]')
    pid_file="${PROJECT_ROOT}/logs/cloudflared-${instance}.pid"
    log_file="${PROJECT_ROOT}/logs/cloudflared-${instance}.log"
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}${instance_upper} Tunnel${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    if is_tunnel_running "${instance}"; then
        echo -e "Status:        ${GREEN}✅ Running${NC}"
        
        if [ -f "${pid_file}" ]; then
            pid=$(cat "${pid_file}")
            echo -e "PID:           ${pid}"
        fi
        
        connections=$(get_connection_count "${log_file}")
        if [ "${connections}" -gt "0" ]; then
            echo -e "Connections:   ${GREEN}${connections}${NC}"
        else
            echo -e "Connections:   ${YELLOW}${connections} (starting up)${NC}"
        fi
        
        last_log=$(get_last_log_time "${log_file}")
        echo -e "Last Activity: ${last_log}"
        
        # Show domain endpoints
        echo ""
        echo "Domain Endpoints:"
        case "${instance}" in
            usa)
                echo "  🌐 https://usa-app.dive25.com (Frontend)"
                echo "  🔌 https://usa-api.dive25.com (Backend)"
                echo "  🔐 https://usa-idp.dive25.com (Keycloak)"
                echo "  🔑 https://usa-kas.dive25.com (KAS)"
                echo "  📋 https://usa-opa.dive25.com (OPA)"
                echo "  📡 https://usa-opal.dive25.com (OPAL Server)"
                ;;
            fra)
                echo "  🌐 https://fra-app.dive25.com (Frontend)"
                echo "  🔌 https://fra-api.dive25.com (Backend)"
                echo "  🔐 https://fra-idp.dive25.com (Keycloak)"
                echo "  🔑 https://fra-kas.dive25.com (KAS)"
                echo "  📋 https://fra-opa.dive25.com (OPA)"
                echo "  📡 https://fra-opal.dive25.com (OPAL Client)"
                ;;
            gbr)
                echo "  🌐 https://gbr-app.dive25.com (Frontend)"
                echo "  🔌 https://gbr-api.dive25.com (Backend)"
                echo "  🔐 https://gbr-idp.dive25.com (Keycloak)"
                echo "  🔑 https://gbr-kas.dive25.com (KAS)"
                echo "  📋 https://gbr-opa.dive25.com (OPA)"
                echo "  📡 https://gbr-opal.dive25.com (OPAL Client)"
                ;;
        esac
        
    else
        echo -e "Status:        ${RED}❌ Not Running${NC}"
        echo ""
        echo "To start: ./scripts/start-cloudflared-tunnels.sh"
    fi
    
    echo ""
done

echo -e "${BLUE}==============================================================================${NC}"
echo ""

# Show metrics endpoints
echo -e "${BLUE}Metrics Endpoints:${NC}"
echo "  USA: http://localhost:9126/metrics"
echo "  FRA: http://localhost:9127/metrics"
echo "  GBR: http://localhost:9128/metrics"
echo ""

# Show log files
echo -e "${BLUE}Log Files:${NC}"
echo "  USA: ${PROJECT_ROOT}/logs/cloudflared-usa.log"
echo "  FRA: ${PROJECT_ROOT}/logs/cloudflared-fra.log"
echo "  GBR: ${PROJECT_ROOT}/logs/cloudflared-gbr.log"
echo ""

# Show management commands
echo -e "${BLUE}Management Commands:${NC}"
echo "  Start:  ./scripts/start-cloudflared-tunnels.sh"
echo "  Stop:   ./scripts/stop-cloudflared-tunnels.sh"
echo "  Status: ./scripts/cloudflared-status.sh"
echo ""
