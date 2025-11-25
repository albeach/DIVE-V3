#!/bin/bash
#
# DIVE V3 - Multi-Instance Management Script
#
# Provides status, start, stop, and sync commands for all instances.
#
# Usage:
#   ./scripts/manage-instances.sh status           # Show status of all instances
#   ./scripts/manage-instances.sh start <code>     # Start an instance
#   ./scripts/manage-instances.sh stop <code>      # Stop an instance
#   ./scripts/manage-instances.sh restart <code>   # Restart an instance
#   ./scripts/manage-instances.sh sync <code>      # Sync Keycloak from USA to instance
#   ./scripts/manage-instances.sh logs <code>      # Show logs for an instance
#   ./scripts/manage-instances.sh tunnel <code>    # Start/restart tunnel for instance
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

COMMAND="${1:-status}"
COUNTRY_CODE=$(echo "${2:-}" | tr '[:upper:]' '[:lower:]')

# Helper function for uppercase
to_upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }

# Known instances
KNOWN_INSTANCES=("usa" "fra" "deu" "gbr" "can" "ita" "esp" "pol" "nld")

# Port mapping
get_ports() {
  local code=$1
  case "$code" in
    usa) echo "3000 4000 8443 8081" ;;
    fra) echo "3001 4001 8444 8082" ;;
    deu) echo "3002 4002 8445 8084" ;;
    gbr) echo "3003 4003 8446 8086" ;;
    *)
      local offset=$(echo -n "$code" | md5sum | tr -d -c '0-9' | cut -c1-2)
      offset=$((10#$offset % 90 + 10))
      echo "$((3000 + offset)) $((4000 + offset)) $((8443 + offset)) $((8080 + offset))"
      ;;
  esac
}

show_status() {
  echo -e "${MAGENTA}══════════════════════════════════════════════════════════════════${NC}"
  echo -e "${MAGENTA}  DIVE V3 - Multi-Instance Status${NC}"
  echo -e "${MAGENTA}══════════════════════════════════════════════════════════════════${NC}"
  echo ""
  
  # Check running tunnels
  RUNNING_TUNNELS=$(ps aux | grep cloudflared | grep -v grep | grep -oE "dive-v3-[a-z]+" | sort -u || true)
  
  printf "${CYAN}%-6s %-12s %-12s %-12s %-12s %-10s${NC}\n" "CODE" "FRONTEND" "BACKEND" "KEYCLOAK" "TUNNEL" "STATUS"
  printf "%-6s %-12s %-12s %-12s %-12s %-10s\n" "----" "--------" "-------" "--------" "------" "------"
  
  for code in "${KNOWN_INSTANCES[@]}"; do
    ports=($(get_ports "$code"))
    frontend_port=${ports[0]}
    backend_port=${ports[1]}
    keycloak_port=${ports[2]}
    
    # Check services
    frontend_status="○"
    backend_status="○"
    keycloak_status="○"
    tunnel_status="○"
    overall_status="${RED}DOWN${NC}"
    
    # Frontend check
    if curl -sk "https://localhost:${frontend_port}" -o /dev/null -w '%{http_code}' --max-time 2 2>/dev/null | grep -q "200\|302"; then
      frontend_status="${GREEN}●${NC}"
    fi
    
    # Backend check
    if curl -sk "https://localhost:${backend_port}/health" -o /dev/null --max-time 2 2>/dev/null; then
      backend_status="${GREEN}●${NC}"
    fi
    
    # Keycloak check
    if curl -sk "https://localhost:${keycloak_port}/realms/master" -o /dev/null --max-time 2 2>/dev/null; then
      keycloak_status="${GREEN}●${NC}"
    fi
    
    # Tunnel check
    if echo "$RUNNING_TUNNELS" | grep -q "dive-v3-${code}"; then
      tunnel_status="${GREEN}●${NC}"
    fi
    
    # Overall status
    if [[ "$frontend_status" == *"●"* && "$keycloak_status" == *"●"* ]]; then
      overall_status="${GREEN}UP${NC}"
    elif [[ "$frontend_status" == *"●"* || "$keycloak_status" == *"●"* ]]; then
      overall_status="${YELLOW}PARTIAL${NC}"
    fi
    
    printf "%-6s %-20s %-20s %-20s %-18s %-10s\n" \
      "$(to_upper "$code")" \
      "${frontend_status} :${frontend_port}" \
      "${backend_status} :${backend_port}" \
      "${keycloak_status} :${keycloak_port}" \
      "${tunnel_status} ${code}-*.dive25.com" \
      "$overall_status"
  done
  
  echo ""
  echo -e "${CYAN}Legend:${NC} ${GREEN}●${NC} Running  ○ Stopped"
  echo ""
  echo -e "${CYAN}Quick Commands:${NC}"
  echo "  Start instance:   ./scripts/manage-instances.sh start <code>"
  echo "  Stop instance:    ./scripts/manage-instances.sh stop <code>"
  echo "  View logs:        ./scripts/manage-instances.sh logs <code>"
  echo "  Sync from USA:    ./scripts/manage-instances.sh sync <code>"
  echo ""
}

start_instance() {
  local code=$1
  if [[ -z "$code" ]]; then
    echo -e "${RED}Error: Country code required${NC}"
    exit 1
  fi
  
  echo -e "${CYAN}Starting $(to_upper "$code") instance...${NC}"
  "$SCRIPT_DIR/deploy-instance.sh" "$code"
}

stop_instance() {
  local code=$1
  if [[ -z "$code" ]]; then
    echo -e "${RED}Error: Country code required${NC}"
    exit 1
  fi
  
  echo -e "${CYAN}Stopping $(to_upper "$code") instance...${NC}"
  
  # Stop Docker services
  if [[ "$code" == "usa" ]]; then
    cd "$PROJECT_ROOT" && docker-compose down
  else
    cd "$PROJECT_ROOT" && docker-compose -p "$code" -f "docker-compose.${code}.yml" down 2>/dev/null || true
  fi
  
  # Stop tunnel
  pkill -f "dive-v3-${code}" 2>/dev/null || true
  
  echo -e "${GREEN}✓ $(to_upper "$code") instance stopped${NC}"
}

restart_instance() {
  local code=$1
  stop_instance "$code"
  sleep 2
  start_instance "$code"
}

sync_instance() {
  local code=$1
  if [[ -z "$code" ]]; then
    echo -e "${RED}Error: Country code required${NC}"
    exit 1
  fi
  
  if [[ "$code" == "usa" ]]; then
    echo -e "${YELLOW}Cannot sync USA - it's the primary instance${NC}"
    exit 1
  fi
  
  "$SCRIPT_DIR/sync-keycloak-realm.sh" "usa" "$code"
}

show_logs() {
  local code=$1
  if [[ -z "$code" ]]; then
    echo -e "${RED}Error: Country code required${NC}"
    exit 1
  fi
  
  if [[ "$code" == "usa" ]]; then
    cd "$PROJECT_ROOT" && docker-compose logs -f
  else
    cd "$PROJECT_ROOT" && docker-compose -p "$code" -f "docker-compose.${code}.yml" logs -f
  fi
}

start_tunnel() {
  local code=$1
  if [[ -z "$code" ]]; then
    echo -e "${RED}Error: Country code required${NC}"
    exit 1
  fi
  
  TUNNEL_NAME="dive-v3-${code}"
  TUNNEL_CONFIG="$HOME/.cloudflared/${TUNNEL_NAME}-config.yml"
  
  # For USA, use the main config
  if [[ "$code" == "usa" ]]; then
    TUNNEL_NAME="dive-v3-tunnel"
    TUNNEL_CONFIG="$HOME/.cloudflared/config.yml"
  fi
  
  if [[ ! -f "$TUNNEL_CONFIG" ]]; then
    echo -e "${RED}Tunnel config not found: ${TUNNEL_CONFIG}${NC}"
    exit 1
  fi
  
  # Kill existing
  pkill -f "${TUNNEL_NAME}" 2>/dev/null || true
  sleep 2
  
  # Start
  nohup cloudflared tunnel --config "$TUNNEL_CONFIG" run "$TUNNEL_NAME" > "/tmp/${TUNNEL_NAME}.log" 2>&1 &
  sleep 3
  
  if ps aux | grep -q "[c]loudflared.*${TUNNEL_NAME}"; then
    echo -e "${GREEN}✓ Tunnel ${TUNNEL_NAME} started${NC}"
  else
    echo -e "${RED}✗ Failed to start tunnel${NC}"
    tail -10 "/tmp/${TUNNEL_NAME}.log"
  fi
}

# Main
case "$COMMAND" in
  status) show_status ;;
  start) start_instance "$COUNTRY_CODE" ;;
  stop) stop_instance "$COUNTRY_CODE" ;;
  restart) restart_instance "$COUNTRY_CODE" ;;
  sync) sync_instance "$COUNTRY_CODE" ;;
  logs) show_logs "$COUNTRY_CODE" ;;
  tunnel) start_tunnel "$COUNTRY_CODE" ;;
  *)
    echo "Usage: $0 {status|start|stop|restart|sync|logs|tunnel} [country_code]"
    exit 1
    ;;
esac

