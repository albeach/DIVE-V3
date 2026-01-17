#!/usr/bin/env bash
#
# DIVE V3 Federation State Audit Script
#
# Audits and reports divergence between Keycloak IdPs, MongoDB spokes,
# and running Docker containers.
#
# Usage:
#   ./scripts/audit-federation-state.sh           # Human-readable output
#   ./scripts/audit-federation-state.sh --json    # JSON output
#   ./scripts/audit-federation-state.sh --quick   # Quick summary only
#
# @version 1.0.0
# @date 2026-01-17

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
JSON_OUTPUT=false
QUICK_MODE=false
for arg in "$@"; do
  case $arg in
    --json)
      JSON_OUTPUT=true
      ;;
    --quick)
      QUICK_MODE=true
      ;;
    --help|-h)
      echo "DIVE V3 Federation State Audit"
      echo ""
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --json    Output results as JSON"
      echo "  --quick   Quick summary only (no TypeScript execution)"
      echo "  --help    Show this help message"
      exit 0
      ;;
  esac
done

# Quick mode - bash-only summary
if [ "$QUICK_MODE" = true ]; then
  echo -e "${BLUE}🔍 DIVE V3 Federation State - Quick Audit${NC}"
  echo "=================================================="
  echo ""
  
  # Get Keycloak IdPs via curl
  echo -e "${YELLOW}🔐 Keycloak IdPs:${NC}"
  KC_TOKEN=$(curl -ks -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=password&client_id=admin-cli&username=admin&password=${KC_ADMIN_PASSWORD:-DivePilot2025!SecureAdmin}" \
    | jq -r '.access_token' 2>/dev/null || echo "")
  
  KC_IDPS=""
  if [ -n "$KC_TOKEN" ] && [ "$KC_TOKEN" != "null" ]; then
    KC_IDPS=$(curl -ks "https://localhost:8443/admin/realms/dive-v3-broker-usa/identity-provider/instances" \
      -H "Authorization: Bearer $KC_TOKEN" \
      | jq -r '.[].alias' 2>/dev/null | sort || echo "")
    if [ -n "$KC_IDPS" ]; then
      echo "   $KC_IDPS" | tr '\n' ', ' | sed 's/,$/\n/'
      KC_COUNT=$(echo "$KC_IDPS" | wc -l | tr -d ' ')
      echo "   Count: $KC_COUNT"
    else
      echo "   (No IdPs found or error fetching)"
    fi
  else
    echo "   (Could not authenticate to Keycloak)"
  fi
  echo ""
  
  # Get running Docker containers
  echo -e "${YELLOW}🐳 Running Spoke Containers:${NC}"
  DOCKER_SPOKES=$(docker ps --format "{{.Names}}" 2>/dev/null | grep -E "dive-spoke-.*-(frontend|backend)" | sed -E 's/dive-spoke-([a-z]+)-.*/\1/' | sort -u | tr '[:lower:]' '[:upper:]' || echo "")
  if [ -n "$DOCKER_SPOKES" ]; then
    echo "   $DOCKER_SPOKES" | tr '\n' ', ' | sed 's/,$/\n/'
    DOCKER_COUNT=$(echo "$DOCKER_SPOKES" | grep -v "^$" | wc -l | tr -d ' ')
    echo "   Count: $DOCKER_COUNT"
  else
    echo "   None"
    DOCKER_COUNT=0
  fi
  echo ""
  
  # Compare
  echo -e "${YELLOW}⚖️ Divergence:${NC}"
  if [ -n "$KC_IDPS" ]; then
    KC_CODES=$(echo "$KC_IDPS" | sed 's/-idp$//' | tr '[:lower:]' '[:upper:]' | sort)
    
    # Find IdPs not in Docker
    STALE=""
    for code in $KC_CODES; do
      if [ -n "$DOCKER_SPOKES" ]; then
        if ! echo "$DOCKER_SPOKES" | grep -q "^$code$"; then
          STALE="$STALE $code"
        fi
      else
        STALE="$STALE $code"
      fi
    done
    
    if [ -n "$STALE" ]; then
      echo -e "   ${RED}❌ Stale IdPs (not running):${NC}$STALE"
    else
      echo -e "   ${GREEN}✅ All IdPs have running containers${NC}"
    fi
  else
    echo "   (Cannot compare - Keycloak data not available)"
  fi
  echo ""
  exit 0
fi

# Full audit - run TypeScript script
echo -e "${BLUE}🔍 DIVE V3 Federation State Audit${NC}"
echo "=================================================="
echo ""

cd "$PROJECT_ROOT/backend"

if [ "$JSON_OUTPUT" = true ]; then
  npx ts-node src/scripts/audit-federation-divergence.ts --json
else
  npx ts-node src/scripts/audit-federation-divergence.ts
fi
