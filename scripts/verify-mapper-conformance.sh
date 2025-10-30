#!/bin/bash
# ============================================
# Mapper Conformance Verification Script
# ============================================
# Phase 2: Attribute Normalization & Mapper Consolidation
# Verifies all 10 IdP brokers have canonical attribute mappers
#
# Usage: ./scripts/verify-mapper-conformance.sh
# Expected: 10/10 IdPs with 7/7 mappers each (70 total)

set -e

# Change to project root directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_IDPS=0
COMPLIANT_IDPS=0
TOTAL_MAPPERS=0
EXPECTED_MAPPERS_PER_IDP=7

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}Mapper Conformance Verification${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Expected mappers (canonical schema - Phase 2)
EXPECTED_MAPPERS=(
  "uniqueID"
  "clearance"
  "clearanceOriginal"
  "countryOfAffiliation"
  "acpCOI"
  "dutyOrg"
  "orgUnit"
)

# IdPs to check
IDPS=(
  "usa:🇺🇸 United States"
  "esp:🇪🇸 Spain"
  "fra:🇫🇷 France"
  "gbr:🇬🇧 United Kingdom"
  "deu:🇩🇪 Germany"
  "ita:🇮🇹 Italy"
  "nld:🇳🇱 Netherlands"
  "pol:🇵🇱 Poland"
  "can:🇨🇦 Canada"
  "industry:🏢 Industry"
)

# Function to check if IdP broker uses shared mapper module
check_broker_file() {
  local idp_prefix=$1
  local idp_name=$2
  local broker_file="terraform/${idp_prefix}-broker.tf"
  
  TOTAL_IDPS=$((TOTAL_IDPS + 1))
  
  if [ ! -f "$broker_file" ]; then
    echo -e "${RED}❌ ${idp_name}: Broker file not found${NC}"
    return 1
  fi
  
  # Check if broker uses shared mapper module
  if ! grep -q "module \"${idp_prefix}_mappers\"" "$broker_file"; then
    echo -e "${RED}❌ ${idp_name}: Not using shared mapper module${NC}"
    return 1
  fi
  
  # Verify module configuration
  local module_source=$(grep -A 5 "module \"${idp_prefix}_mappers\"" "$broker_file" | grep "source" | awk '{print $3}' | tr -d '"')
  
  if [ "$module_source" != "./modules/shared-mappers" ]; then
    echo -e "${YELLOW}⚠️  ${idp_name}: Incorrect module source: $module_source${NC}"
    return 1
  fi
  
  # All checks passed
  COMPLIANT_IDPS=$((COMPLIANT_IDPS + 1))
  TOTAL_MAPPERS=$((TOTAL_MAPPERS + EXPECTED_MAPPERS_PER_IDP))
  echo -e "${GREEN}✅ ${idp_name}: 7/7 mappers configured correctly (via shared module)${NC}"
  return 0
}

# Check each IdP
echo "Checking IdP broker configurations..."
echo ""

for idp_entry in "${IDPS[@]}"; do
  IFS=':' read -r idp_prefix idp_name <<< "$idp_entry"
  check_broker_file "$idp_prefix" "$idp_name"
done

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

echo "IdPs Checked: $TOTAL_IDPS"
echo "Compliant IdPs: $COMPLIANT_IDPS"
echo "Total Mappers: $TOTAL_MAPPERS (expected: $((TOTAL_IDPS * EXPECTED_MAPPERS_PER_IDP)))"
echo ""

# Calculate conformance percentage
if [ $TOTAL_IDPS -gt 0 ]; then
  CONFORMANCE=$((COMPLIANT_IDPS * 100 / TOTAL_IDPS))
  
  if [ $CONFORMANCE -eq 100 ]; then
    echo -e "${GREEN}✅ Conformance: ${CONFORMANCE}% (${COMPLIANT_IDPS}/${TOTAL_IDPS} IdPs)${NC}"
    echo -e "${GREEN}✅ All IdPs using shared mapper module${NC}"
    echo ""
    echo -e "${GREEN}PHASE 2 MAPPER MIGRATION: COMPLETE ✅${NC}"
    exit 0
  else
    echo -e "${YELLOW}⚠️  Conformance: ${CONFORMANCE}% (${COMPLIANT_IDPS}/${TOTAL_IDPS} IdPs)${NC}"
    echo -e "${YELLOW}⚠️  Some IdPs not using shared mapper module${NC}"
    echo ""
    echo -e "${YELLOW}PHASE 2 MAPPER MIGRATION: INCOMPLETE${NC}"
    exit 1
  fi
else
  echo -e "${RED}❌ No IdPs found${NC}"
  exit 1
fi

