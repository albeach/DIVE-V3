#!/bin/bash
##########################################################################################
# Rollback Policy Preset Pack
#
# Removes all constraints from a policy pack (soft delete - sets status='suspended')
#
# Usage: ./rollback-pack.sh <PACK_NAME> --tenant <TENANT>
#
# Phase 2, Task 4.2
# Date: 2026-01-28
##########################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default values
PACK_NAME=""
TENANT="USA"
ADMIN_TOKEN="${DIVE_ADMIN_TOKEN:-}"
API_URL="${DIVE_API_URL:-https://localhost:4000}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --tenant)
      TENANT="$2"
      shift 2
      ;;
    --token)
      ADMIN_TOKEN="$2"
      shift 2
      ;;
    --api-url)
      API_URL="$2"
      shift 2
      ;;
    *)
      if [ -z "$PACK_NAME" ]; then
        PACK_NAME="$1"
      fi
      shift
      ;;
  esac
done

# Validation
if [ -z "$PACK_NAME" ]; then
  echo -e "${RED}ERROR: Pack name required${NC}"
  echo "Usage: $0 <PACK_NAME> --tenant <TENANT>"
  exit 1
fi

# Resolve paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACK_FILE="${SCRIPT_DIR}/packs/${PACK_NAME}.json"

if [ ! -f "$PACK_FILE" ]; then
  echo -e "${RED}ERROR: Pack file not found: $PACK_FILE${NC}"
  exit 1
fi

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          Policy Pack Rollback - Remove Constraints        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}⚠  WARNING: This will REMOVE all constraints from pack ${PACK_NAME}${NC}"
echo ""
echo -e "Tenant: $TENANT"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# Load pack
PACK_JSON=$(cat "$PACK_FILE")
CONSTRAINTS=$(echo "$PACK_JSON" | jq -r '.federationConstraints // []')

echo ""
echo -e "${BLUE}Removing federation constraints...${NC}"

REMOVED_COUNT=0
echo "$CONSTRAINTS" | jq -c '.[]' | while read -r constraint; do
  OWNER=$(echo "$constraint" | jq -r '.ownerTenant')
  PARTNER=$(echo "$constraint" | jq -r '.partnerTenant')

  # Only remove if owner matches tenant
  if [ "$OWNER" = "$TENANT" ] || [ "$OWNER" = "*" ]; then
    echo "  → Removing: $OWNER → $PARTNER"

    curl -s -X DELETE "${API_URL}/api/federation-constraints/${OWNER}/${PARTNER}" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      -k \
      -o /tmp/rollback-response.json

    SUCCESS=$(jq -r '.success // false' /tmp/rollback-response.json 2>/dev/null || echo "false")
    if [ "$SUCCESS" = "true" ]; then
      echo -e "     ${GREEN}✓${NC} Removed successfully"
      REMOVED_COUNT=$((REMOVED_COUNT + 1))
    else
      ERROR=$(jq -r '.error // "Unknown error"' /tmp/rollback-response.json 2>/dev/null || echo "Unknown error")
      echo -e "     ${YELLOW}⚠${NC} $ERROR"
    fi
  fi
done

echo ""
echo -e "${BLUE}Triggering OPAL distribution...${NC}"

curl -s -X POST "${API_URL}/api/opal/force-sync" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -k \
  -o /dev/null

echo -e "     ${GREEN}✓${NC} OPAL sync triggered"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                   ✅ Rollback Complete!                    ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Policy pack ${PACK_NAME} rolled back for tenant ${TENANT}."
echo "Changes will propagate to all spokes within ~1 second."
echo ""
