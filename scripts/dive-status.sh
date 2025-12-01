#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Instance Health Status Dashboard
# =============================================================================
# Shows health status of all DIVE V3 instances and services
#
# Usage:
#   ./scripts/dive-status.sh              # Show all instances
#   ./scripts/dive-status.sh --json       # JSON output
#   ./scripts/dive-status.sh USA          # Show specific instance
#   ./scripts/dive-status.sh --watch      # Auto-refresh every 5s
#
# =============================================================================

set -uo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'

# Instance configuration
declare -A INSTANCE_NAMES=(
    ["USA"]="United States"
    ["FRA"]="France"
    ["DEU"]="Germany"
    ["GBR"]="United Kingdom"
    ["CAN"]="Canada"
    ["ITA"]="Italy"
    ["ESP"]="Spain"
    ["NLD"]="Netherlands"
    ["POL"]="Poland"
)

declare -A PORT_OFFSETS=(
    ["USA"]=0 ["FRA"]=1 ["DEU"]=2 ["GBR"]=3 ["CAN"]=4
    ["ITA"]=5 ["ESP"]=6 ["NLD"]=7 ["POL"]=8
)

# Base ports
BASE_FRONTEND_PORT=3000
BASE_BACKEND_PORT=4000
BASE_KEYCLOAK_HTTPS_PORT=8443
BASE_OPA_PORT=8281
BASE_KAS_PORT=8380

# =============================================================================
# FUNCTIONS
# =============================================================================

usage() {
    echo -e "${CYAN}DIVE V3 - Instance Health Dashboard${NC}"
    echo ""
    echo "Usage: $0 [OPTIONS] [INSTANCE_CODE]"
    echo ""
    echo "Options:"
    echo "  --json       Output as JSON"
    echo "  --watch      Auto-refresh every 5 seconds"
    echo "  --compact    Compact output (one line per instance)"
    echo "  --help       Show this help"
    echo ""
    echo "Examples:"
    echo "  $0                 # Show all instances"
    echo "  $0 USA             # Show USA instance"
    echo "  $0 --json          # JSON output"
    echo "  $0 --watch         # Live dashboard"
    exit 0
}

# Check service health
check_service() {
    local url=$1
    local timeout=${2:-5}
    
    local response
    response=$(curl -sf -o /dev/null -w "%{http_code}" --max-time "$timeout" --insecure "$url" 2>/dev/null)
    
    case "$response" in
        2*) echo "healthy" ;;
        4*) echo "error" ;;
        5*) echo "error" ;;
        *)  echo "down" ;;
    esac
}

# Get service status symbol
status_symbol() {
    case "$1" in
        healthy) echo -e "${GREEN}●${NC}" ;;
        degraded) echo -e "${YELLOW}●${NC}" ;;
        error) echo -e "${RED}●${NC}" ;;
        down) echo -e "${DIM}○${NC}" ;;
        *) echo -e "${DIM}?${NC}" ;;
    esac
}

# Check instance health
check_instance_health() {
    local instance=$1
    local instance_lower=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    local offset=${PORT_OFFSETS[$instance]:-0}
    
    # Calculate ports
    local frontend_port=$((BASE_FRONTEND_PORT + offset))
    local backend_port=$((BASE_BACKEND_PORT + offset))
    local keycloak_port=$((BASE_KEYCLOAK_HTTPS_PORT + offset))
    local opa_port=$((BASE_OPA_PORT + offset))
    local kas_port=$((BASE_KAS_PORT + offset))
    
    # Check each service
    local keycloak_status=$(check_service "https://localhost:${keycloak_port}/health/ready")
    local frontend_status=$(check_service "https://localhost:${frontend_port}")
    local backend_status=$(check_service "https://localhost:${backend_port}/health")
    local opa_status=$(check_service "http://localhost:${opa_port}/health")
    local kas_status=$(check_service "http://localhost:${kas_port}/health")
    
    # Check Cloudflare tunnel
    local tunnel_status="down"
    if curl -sf "https://${instance_lower}-app.dive25.com" --max-time 5 >/dev/null 2>&1; then
        tunnel_status="healthy"
    fi
    
    # Determine overall status
    local healthy_count=0
    local total_count=6
    
    [[ "$keycloak_status" == "healthy" ]] && ((healthy_count++))
    [[ "$frontend_status" == "healthy" ]] && ((healthy_count++))
    [[ "$backend_status" == "healthy" ]] && ((healthy_count++))
    [[ "$opa_status" == "healthy" ]] && ((healthy_count++))
    [[ "$kas_status" == "healthy" ]] && ((healthy_count++))
    [[ "$tunnel_status" == "healthy" ]] && ((healthy_count++))
    
    local overall_status="down"
    if [[ $healthy_count -eq $total_count ]]; then
        overall_status="healthy"
    elif [[ $healthy_count -gt 0 ]]; then
        overall_status="degraded"
    fi
    
    # Return as JSON-like structure
    echo "instance:$instance"
    echo "name:${INSTANCE_NAMES[$instance]}"
    echo "overall:$overall_status"
    echo "healthy_count:$healthy_count"
    echo "total_count:$total_count"
    echo "keycloak:$keycloak_status"
    echo "frontend:$frontend_status"
    echo "backend:$backend_status"
    echo "opa:$opa_status"
    echo "kas:$kas_status"
    echo "tunnel:$tunnel_status"
}

# Display instance status (text format)
display_instance_status() {
    local instance=$1
    
    # Get health data
    local health_data
    health_data=$(check_instance_health "$instance")
    
    # Parse data
    local overall=$(echo "$health_data" | grep "^overall:" | cut -d: -f2)
    local healthy_count=$(echo "$health_data" | grep "^healthy_count:" | cut -d: -f2)
    local total_count=$(echo "$health_data" | grep "^total_count:" | cut -d: -f2)
    local keycloak=$(echo "$health_data" | grep "^keycloak:" | cut -d: -f2)
    local frontend=$(echo "$health_data" | grep "^frontend:" | cut -d: -f2)
    local backend=$(echo "$health_data" | grep "^backend:" | cut -d: -f2)
    local opa=$(echo "$health_data" | grep "^opa:" | cut -d: -f2)
    local kas=$(echo "$health_data" | grep "^kas:" | cut -d: -f2)
    local tunnel=$(echo "$health_data" | grep "^tunnel:" | cut -d: -f2)
    local instance_lower=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    
    # Display
    echo ""
    echo -e "  ${CYAN}${instance}${NC} - ${INSTANCE_NAMES[$instance]}"
    echo -e "  $(status_symbol "$overall") Overall: ${healthy_count}/${total_count} services healthy"
    echo ""
    echo -e "    $(status_symbol "$keycloak") Keycloak   $(status_symbol "$frontend") Frontend   $(status_symbol "$backend") Backend"
    echo -e "    $(status_symbol "$opa") OPA        $(status_symbol "$kas") KAS        $(status_symbol "$tunnel") Tunnel"
    echo ""
    echo -e "    ${DIM}https://${instance_lower}-app.dive25.com${NC}"
}

# Display compact status
display_compact_status() {
    local instance=$1
    
    local health_data
    health_data=$(check_instance_health "$instance")
    
    local overall=$(echo "$health_data" | grep "^overall:" | cut -d: -f2)
    local healthy_count=$(echo "$health_data" | grep "^healthy_count:" | cut -d: -f2)
    local total_count=$(echo "$health_data" | grep "^total_count:" | cut -d: -f2)
    
    printf "  $(status_symbol "$overall") %-5s %-20s %s/%s services\n" \
        "$instance" "${INSTANCE_NAMES[$instance]}" "$healthy_count" "$total_count"
}

# Output JSON
output_json() {
    local instances=("$@")
    
    echo "{"
    echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
    echo "  \"instances\": ["
    
    local first=true
    for instance in "${instances[@]}"; do
        [[ "$first" != "true" ]] && echo "    ,"
        first=false
        
        local health_data
        health_data=$(check_instance_health "$instance")
        
        local overall=$(echo "$health_data" | grep "^overall:" | cut -d: -f2)
        local healthy=$(echo "$health_data" | grep "^healthy_count:" | cut -d: -f2)
        local total=$(echo "$health_data" | grep "^total_count:" | cut -d: -f2)
        local keycloak=$(echo "$health_data" | grep "^keycloak:" | cut -d: -f2)
        local frontend=$(echo "$health_data" | grep "^frontend:" | cut -d: -f2)
        local backend=$(echo "$health_data" | grep "^backend:" | cut -d: -f2)
        local opa=$(echo "$health_data" | grep "^opa:" | cut -d: -f2)
        local kas=$(echo "$health_data" | grep "^kas:" | cut -d: -f2)
        local tunnel=$(echo "$health_data" | grep "^tunnel:" | cut -d: -f2)
        local instance_lower=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
        
        cat <<EOF
    {
      "code": "$instance",
      "name": "${INSTANCE_NAMES[$instance]}",
      "url": "https://${instance_lower}-app.dive25.com",
      "status": "$overall",
      "healthy_services": $healthy,
      "total_services": $total,
      "services": {
        "keycloak": "$keycloak",
        "frontend": "$frontend",
        "backend": "$backend",
        "opa": "$opa",
        "kas": "$kas",
        "tunnel": "$tunnel"
      }
    }
EOF
    done
    
    echo "  ]"
    echo "}"
}

# =============================================================================
# MAIN
# =============================================================================

OUTPUT_FORMAT="text"
WATCH_MODE=false
COMPACT=false
SPECIFIC_INSTANCE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --json)
            OUTPUT_FORMAT="json"
            shift
            ;;
        --watch)
            WATCH_MODE=true
            shift
            ;;
        --compact)
            COMPACT=true
            shift
            ;;
        --help|-h)
            usage
            ;;
        *)
            if [[ -z "$SPECIFIC_INSTANCE" ]]; then
                SPECIFIC_INSTANCE=$(echo "$1" | tr '[:lower:]' '[:upper:]')
            fi
            shift
            ;;
    esac
done

# Validate specific instance if provided
if [[ -n "$SPECIFIC_INSTANCE" ]] && [[ -z "${INSTANCE_NAMES[$SPECIFIC_INSTANCE]:-}" ]]; then
    echo -e "${RED}Error: Unknown instance code: $SPECIFIC_INSTANCE${NC}" >&2
    exit 1
fi

# Main display function
display_status() {
    # Determine which instances to check
    local instances_to_check=()
    
    if [[ -n "$SPECIFIC_INSTANCE" ]]; then
        instances_to_check=("$SPECIFIC_INSTANCE")
    else
        # Check all known instances
        for code in USA FRA DEU GBR CAN ITA ESP NLD POL; do
            instances_to_check+=("$code")
        done
    fi
    
    case $OUTPUT_FORMAT in
        json)
            output_json "${instances_to_check[@]}"
            ;;
        text)
            if [[ "$WATCH_MODE" != "true" ]]; then
                echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
                echo -e "${CYAN}║              DIVE V3 - Instance Health Dashboard                  ║${NC}"
                echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
            fi
            
            if [[ "$COMPACT" == "true" ]]; then
                echo ""
                for instance in "${instances_to_check[@]}"; do
                    display_compact_status "$instance"
                done
                echo ""
            else
                for instance in "${instances_to_check[@]}"; do
                    display_instance_status "$instance"
                done
            fi
            
            echo -e "${DIM}  Legend: ${GREEN}●${NC}${DIM} Healthy  ${YELLOW}●${NC}${DIM} Degraded  ${RED}●${NC}${DIM} Error  ○ Down${NC}"
            echo -e "${DIM}  Last updated: $(date '+%H:%M:%S')${NC}"
            ;;
    esac
}

# Watch mode or single run
if [[ "$WATCH_MODE" == "true" ]]; then
    while true; do
        clear
        echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${CYAN}║         DIVE V3 - Instance Health Dashboard (LIVE)               ║${NC}"
        echo -e "${CYAN}║                    Press Ctrl+C to exit                          ║${NC}"
        echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
        display_status
        sleep 5
    done
else
    display_status
fi





