#!/bin/bash
# DIVE V3 Multi-Location Tunnel Manager
# Centralized management for all tunnel locations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN="dive25.com"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}=========================================="
    echo -e "DIVE V3 Multi-Location Tunnel Manager"
    echo -e "==========================================${NC}"
    echo ""
}

# List all active tunnels
list_tunnels() {
    echo -e "${BLUE}Active Tunnels:${NC}"
    echo ""
    
    if command -v cloudflared &> /dev/null; then
        cloudflared tunnel list
    else
        echo -e "${RED}❌ cloudflared not installed${NC}"
        return 1
    fi
    
    echo ""
    echo -e "${BLUE}Active Services:${NC}"
    systemctl list-units --type=service --state=active | grep cloudflared || echo "No cloudflared services running"
}

# Show tunnel status for specific location
show_status() {
    local location=$1
    
    if [ -z "$location" ]; then
        echo -e "${RED}❌ Location not specified${NC}"
        echo "Usage: $0 status <location>"
        return 1
    fi
    
    echo -e "${BLUE}Status for location: $location${NC}"
    echo ""
    
    # Check if service exists
    if systemctl list-unit-files | grep -q "cloudflared-${location}"; then
        echo -e "${GREEN}Service Status:${NC}"
        systemctl status cloudflared-${location} --no-pager
        
        echo ""
        echo -e "${GREEN}Recent Logs:${NC}"
        journalctl -u cloudflared-${location} --no-pager -n 10
        
        echo ""
        echo -e "${GREEN}Configuration:${NC}"
        if [ -f ~/.cloudflared/${location}/config.yml ]; then
            cat ~/.cloudflared/${location}/config.yml
        else
            echo -e "${YELLOW}⚠️ Configuration file not found${NC}"
        fi
    else
        echo -e "${RED}❌ Service cloudflared-${location} not found${NC}"
    fi
}

# Start tunnel for specific location
start_tunnel() {
    local location=$1
    
    if [ -z "$location" ]; then
        echo -e "${RED}❌ Location not specified${NC}"
        echo "Usage: $0 start <location>"
        return 1
    fi
    
    echo -e "${BLUE}Starting tunnel for location: $location${NC}"
    
    if systemctl is-active --quiet cloudflared-${location}; then
        echo -e "${YELLOW}⚠️ Tunnel already running${NC}"
        systemctl status cloudflared-${location} --no-pager
    else
        systemctl start cloudflared-${location}
        
        # Wait for startup
        sleep 3
        
        if systemctl is-active --quiet cloudflared-${location}; then
            echo -e "${GREEN}✅ Tunnel started successfully${NC}"
        else
            echo -e "${RED}❌ Failed to start tunnel${NC}"
            journalctl -u cloudflared-${location} --no-pager -n 5
        fi
    fi
}

# Stop tunnel for specific location
stop_tunnel() {
    local location=$1
    
    if [ -z "$location" ]; then
        echo -e "${RED}❌ Location not specified${NC}"
        echo "Usage: $0 stop <location>"
        return 1
    fi
    
    echo -e "${BLUE}Stopping tunnel for location: $location${NC}"
    
    if systemctl is-active --quiet cloudflared-${location}; then
        systemctl stop cloudflared-${location}
        echo -e "${GREEN}✅ Tunnel stopped${NC}"
    else
        echo -e "${YELLOW}⚠️ Tunnel not running${NC}"
    fi
}

# Restart tunnel for specific location
restart_tunnel() {
    local location=$1
    
    if [ -z "$location" ]; then
        echo -e "${RED}❌ Location not specified${NC}"
        echo "Usage: $0 restart <location>"
        return 1
    fi
    
    echo -e "${BLUE}Restarting tunnel for location: $location${NC}"
    
    systemctl restart cloudflared-${location}
    
    # Wait for startup
    sleep 3
    
    if systemctl is-active --quiet cloudflared-${location}; then
        echo -e "${GREEN}✅ Tunnel restarted successfully${NC}"
    else
        echo -e "${RED}❌ Failed to restart tunnel${NC}"
        journalctl -u cloudflared-${location} --no-pager -n 5
    fi
}

# Show logs for specific location
show_logs() {
    local location=$1
    local lines=${2:-50}
    
    if [ -z "$location" ]; then
        echo -e "${RED}❌ Location not specified${NC}"
        echo "Usage: $0 logs <location> [lines]"
        return 1
    fi
    
    echo -e "${BLUE}Logs for location: $location (last $lines lines)${NC}"
    echo ""
    
    if systemctl list-unit-files | grep -q "cloudflared-${location}"; then
        journalctl -u cloudflared-${location} --no-pager -n $lines
    else
        echo -e "${RED}❌ Service cloudflared-${location} not found${NC}"
    fi
}

# Follow logs for specific location
follow_logs() {
    local location=$1
    
    if [ -z "$location" ]; then
        echo -e "${RED}❌ Location not specified${NC}"
        echo "Usage: $0 follow <location>"
        return 1
    fi
    
    echo -e "${BLUE}Following logs for location: $location (Ctrl+C to stop)${NC}"
    echo ""
    
    if systemctl list-unit-files | grep -q "cloudflared-${location}"; then
        journalctl -u cloudflared-${location} -f
    else
        echo -e "${RED}❌ Service cloudflared-${location} not found${NC}"
    fi
}

# Test connectivity for specific location
test_connectivity() {
    local location=$1
    
    if [ -z "$location" ]; then
        echo -e "${RED}❌ Location not specified${NC}"
        echo "Usage: $0 test <location>"
        return 1
    fi
    
    echo -e "${BLUE}Testing connectivity for location: $location${NC}"
    echo ""
    
    # Determine subdomain based on location
    case $location in
        "primary")
            subdomain="app"
            ;;
        "secondary")
            subdomain="backup"
            ;;
        "development")
            subdomain="dev-app"
            ;;
        *)
            subdomain="$location"
            ;;
    esac
    
    local urls=(
        "https://${subdomain}.${DOMAIN}"
        "https://${subdomain/app/api}.${DOMAIN}/health"
        "https://${subdomain/app/auth}.${DOMAIN}/realms/dive-v3-broker"
    )
    
    for url in "${urls[@]}"; do
        echo -n "Testing $url ... "
        
        if curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" | grep -q "200\|302\|401"; then
            echo -e "${GREEN}✅ OK${NC}"
        else
            echo -e "${RED}❌ FAILED${NC}"
        fi
    done
}

# Health check for all locations
health_check() {
    echo -e "${BLUE}Health Check - All Locations${NC}"
    echo ""
    
    # Get all cloudflared services
    local services=$(systemctl list-units --type=service --state=active | grep cloudflared | awk '{print $1}')
    
    if [ -z "$services" ]; then
        echo -e "${YELLOW}⚠️ No active cloudflared services found${NC}"
        return 1
    fi
    
    for service in $services; do
        local location=$(echo $service | sed 's/cloudflared-\(.*\)\.service/\1/')
        
        echo -e "${BLUE}Location: $location${NC}"
        
        # Check service status
        if systemctl is-active --quiet $service; then
            echo -e "  Service: ${GREEN}✅ Active${NC}"
        else
            echo -e "  Service: ${RED}❌ Inactive${NC}"
            continue
        fi
        
        # Check connectivity
        test_connectivity $location
        echo ""
    done
}

# Show usage information
show_usage() {
    echo "DIVE V3 Multi-Location Tunnel Manager"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  list                    - List all tunnels and services"
    echo "  status <location>       - Show status for specific location"
    echo "  start <location>        - Start tunnel for location"
    echo "  stop <location>         - Stop tunnel for location" 
    echo "  restart <location>      - Restart tunnel for location"
    echo "  logs <location> [lines] - Show logs for location (default: 50 lines)"
    echo "  follow <location>       - Follow logs for location"
    echo "  test <location>         - Test connectivity for location"
    echo "  health                  - Health check for all locations"
    echo "  help                    - Show this help message"
    echo ""
    echo "Locations:"
    echo "  primary                 - Production primary location"
    echo "  secondary               - Production secondary/DR location"
    echo "  development             - Development/testing location"
    echo "  <custom>                - Custom location name"
    echo ""
    echo "Examples:"
    echo "  $0 list"
    echo "  $0 status primary"
    echo "  $0 start development"
    echo "  $0 logs primary 100"
    echo "  $0 test secondary"
    echo "  $0 health"
}

# Main command dispatcher
main() {
    print_header
    
    case "${1:-}" in
        "list")
            list_tunnels
            ;;
        "status")
            show_status "$2"
            ;;
        "start")
            start_tunnel "$2"
            ;;
        "stop")
            stop_tunnel "$2"
            ;;
        "restart")
            restart_tunnel "$2"
            ;;
        "logs")
            show_logs "$2" "$3"
            ;;
        "follow")
            follow_logs "$2"
            ;;
        "test")
            test_connectivity "$2"
            ;;
        "health")
            health_check
            ;;
        "help"|"--help"|"-h")
            show_usage
            ;;
        *)
            echo -e "${RED}❌ Unknown command: ${1:-}${NC}"
            echo ""
            show_usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"





