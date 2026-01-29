#!/bin/bash
##########################################################################################
# Preview Policy Preset Pack (Dry Run)
#
# Shows what would be created without making changes
#
# Usage: ./preview-pack.sh <PACK_NAME> --tenant <TENANT>
#
# Phase 2, Task 4.2
# Date: 2026-01-28
##########################################################################################

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Default values
PACK_NAME=""
TENANT="USA"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --tenant)
      TENANT="$2"
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
  echo "Usage: $0 <PACK_NAME> --tenant <TENANT>"
  echo ""
  echo "Available packs:"
  ls -1 "$(dirname "$0")/packs/"*.json 2>/dev/null | xargs -n 1 basename | sed 's/.json$//' || echo "  (none)"
  exit 1
fi

# Resolve paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACK_FILE="${SCRIPT_DIR}/packs/${PACK_NAME}.json"

if [ ! -f "$PACK_FILE" ]; then
  echo "ERROR: Pack file not found: $PACK_FILE"
  exit 1
fi

# Load pack
PACK_JSON=$(cat "$PACK_FILE")
DESCRIPTION=$(echo "$PACK_JSON" | jq -r '.description')

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          Policy Pack Preview - Dry Run Mode               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Pack:${NC}        $PACK_NAME"
echo -e "${GREEN}Tenant:${NC}      $TENANT"
echo -e "${GREEN}Description:${NC} $DESCRIPTION"
echo ""

# Federation constraints
echo -e "${BLUE}Federation Constraints to be created:${NC}"
echo ""

CONSTRAINTS=$(echo "$PACK_JSON" | jq -r '.federationConstraints // []')
CONSTRAINT_COUNT=$(echo "$CONSTRAINTS" | jq 'length')

if [ "$CONSTRAINT_COUNT" -eq 0 ]; then
  echo "  (none)"
else
  echo "$CONSTRAINTS" | jq -r '.[] | "  • \(.ownerTenant) → \(.partnerTenant): maxClassification=\(.maxClassification), allowedCOIs=\(.allowedCOIs), deniedCOIs=\(.deniedCOIs)"'
fi

echo ""
echo -e "${BLUE}Tenant Configuration Updates:${NC}"
echo ""

TENANT_CONFIGS=$(echo "$PACK_JSON" | jq -r '.tenantConfigs // {}')
TENANT_CONFIG=$(echo "$TENANT_CONFIGS" | jq -r ".\"$TENANT\" // .\"*\" // {}")

if [ "$TENANT_CONFIG" = "{}" ] || [ "$TENANT_CONFIG" = "null" ]; then
  echo "  (none for tenant $TENANT)"
else
  echo "$TENANT_CONFIG" | jq -r 'to_entries[] | "  • \(.key): \(.value)"'
fi

echo ""
echo -e "${BLUE}COI Definitions to be created:${NC}"
echo ""

COI_DEFS=$(echo "$PACK_JSON" | jq -r '.coiDefinitions // {}')
COI_COUNT=$(echo "$COI_DEFS" | jq 'keys | length')

if [ "$COI_COUNT" -eq 0 ]; then
  echo "  (none)"
else
  echo "$COI_DEFS" | jq -r 'to_entries[] | "  • \(.key): \(.value.name) (members: \(.value.members))"'
fi

echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}This is a preview only. No changes were made.${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "To apply this pack, run:"
echo "  ./apply-pack.sh $PACK_NAME --tenant $TENANT"
echo ""
