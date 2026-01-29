#!/bin/bash
##########################################################################################
# List Available Policy Preset Packs
#
# Usage: ./list-packs.sh
#
# Phase 2, Task 4.2
# Date: 2026-01-28
##########################################################################################

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m'

# Resolve script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKS_DIR="${SCRIPT_DIR}/packs"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          DIVE V3 - Available Policy Packs                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ ! -d "$PACKS_DIR" ]; then
  echo "No policy packs directory found."
  exit 1
fi

COUNT=1
for pack_file in "$PACKS_DIR"/*.json; do
  if [ -f "$pack_file" ]; then
    PACK_NAME=$(basename "$pack_file" .json)
    DESCRIPTION=$(jq -r '.description // "No description"' "$pack_file")
    USE_CASE=$(jq -r '.metadata.use_case // "N/A"' "$pack_file")

    echo -e "${GREEN}${COUNT}. ${PACK_NAME}${NC}"
    echo "   Description: $DESCRIPTION"
    echo "   Use Case:    $USE_CASE"
    echo ""

    COUNT=$((COUNT + 1))
  fi
done

if [ "$COUNT" -eq 1 ]; then
  echo "No policy packs found in $PACKS_DIR"
fi

echo "To preview a pack:"
echo "  ./preview-pack.sh <PACK_NAME> --tenant <TENANT>"
echo ""
echo "To apply a pack:"
echo "  ./apply-pack.sh <PACK_NAME> --tenant <TENANT>"
echo ""
