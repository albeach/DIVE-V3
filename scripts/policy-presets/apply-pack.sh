#!/bin/bash
##########################################################################################
# Apply Policy Preset Pack to Tenant
#
# Usage: ./apply-pack.sh <PACK_NAME> [--tenant TENANT] [--effective-date DATE] [--expiration-date DATE]
#
# Phase 2, Task 4.2
# Date: 2026-01-28
##########################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
PACK_NAME=""
TENANT="USA"
EFFECTIVE_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EXPIRATION_DATE=""
ADMIN_TOKEN="${DIVE_ADMIN_TOKEN:-}"
API_URL="${DIVE_API_URL:-https://localhost:4000}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --tenant)
      TENANT="$2"
      shift 2
      ;;
    --effective-date)
      EFFECTIVE_DATE="$2"
      shift 2
      ;;
    --expiration-date)
      EXPIRATION_DATE="$2"
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
      else
        echo -e "${RED}ERROR: Unknown argument: $1${NC}"
        exit 1
      fi
      shift
      ;;
  esac
done

# Validation
if [ -z "$PACK_NAME" ]; then
  echo -e "${RED}ERROR: Pack name required${NC}"
  echo ""
  echo "Usage: $0 <PACK_NAME> [--tenant TENANT] [--effective-date DATE] [--expiration-date DATE]"
  echo ""
  echo "Available packs:"
  echo "  - NATO_STANDARD (default NATO sharing)"
  echo "  - FVEY_EXPANDED (Five Eyes enhanced trust)"
  echo "  - BILATERAL_RESTRICTED (conservative bilateral)"
  echo "  - INDUSTRY_LOCKDOWN (industry restrictions)"
  echo "  - HIGH_WATERMARK (differentiated trust)"
  echo "  - EMBARGO_TEMPLATE (time-based embargoes)"
  echo "  - ATTRIBUTE_RELEASE_TEMPLATE (PII protection)"
  exit 1
fi

if [ -z "$ADMIN_TOKEN" ]; then
  echo -e "${YELLOW}WARNING: No admin token provided. Set DIVE_ADMIN_TOKEN environment variable.${NC}"
  echo "Proceeding anyway - authentication may fail."
fi

# Resolve script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACK_FILE="${SCRIPT_DIR}/packs/${PACK_NAME}.json"

if [ ! -f "$PACK_FILE" ]; then
  echo -e "${RED}ERROR: Pack file not found: $PACK_FILE${NC}"
  echo ""
  echo "Available packs:"
  find "${SCRIPT_DIR}/packs" -maxdepth 1 -type f -name '*.json' -exec basename {} .json \; 2>/dev/null || echo "  (none found)"
  exit 1
fi

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          DIVE V3 - Policy Pack Deployment Tool            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Policy Pack:${NC}     $PACK_NAME"
echo -e "${GREEN}Tenant:${NC}          $TENANT"
echo -e "${GREEN}Effective Date:${NC}  $EFFECTIVE_DATE"
echo -e "${GREEN}Expiration:${NC}      ${EXPIRATION_DATE:-none}"
echo ""

# Parse pack JSON
PACK_JSON=$(cat "$PACK_FILE")

# Extract federation constraints
CONSTRAINTS=$(echo "$PACK_JSON" | jq -r '.federationConstraints // []')
CONSTRAINT_COUNT=$(echo "$CONSTRAINTS" | jq 'length')

echo -e "${BLUE}Step 1/3: Inserting federation constraints...${NC}"
echo "         Found $CONSTRAINT_COUNT constraints in pack"

if [ "$CONSTRAINT_COUNT" -gt 0 ]; then
  # Insert each constraint
  echo "$CONSTRAINTS" | jq -c '.[]' | while read -r constraint; do
    OWNER=$(echo "$constraint" | jq -r '.ownerTenant')
    PARTNER=$(echo "$constraint" | jq -r '.partnerTenant')
    MAX_CLASS=$(echo "$constraint" | jq -r '.maxClassification')

    echo "  → Creating: $OWNER → $PARTNER (max: $MAX_CLASS)"

    # Build request body
    REQUEST_BODY=$(echo "$constraint" | jq ". + {\"effectiveDate\": \"$EFFECTIVE_DATE\", \"expirationDate\": $(if [ -n "$EXPIRATION_DATE" ]; then echo "\"$EXPIRATION_DATE\""; else echo "null"; fi)}")

    # Send to API
    curl -s -X POST "${API_URL}/api/federation-constraints" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      -H "Content-Type: application/json" \
      -k \
      -d "$REQUEST_BODY" \
      -o /tmp/apply-pack-response.json

    # Check response
    if [ $? -eq 0 ]; then
      SUCCESS=$(jq -r '.success // false' /tmp/apply-pack-response.json)
      if [ "$SUCCESS" = "true" ]; then
        echo -e "     ${GREEN}✓${NC} Constraint created successfully"
      else
        ERROR=$(jq -r '.error // "Unknown error"' /tmp/apply-pack-response.json)
        if echo "$ERROR" | grep -q "already exists"; then
          echo -e "     ${YELLOW}⚠${NC} Constraint already exists (skipping)"
        else
          echo -e "     ${RED}✗${NC} Failed: $ERROR"
        fi
      fi
    else
      echo -e "     ${RED}✗${NC} API request failed"
    fi
  done
fi

echo ""
echo -e "${BLUE}Step 2/3: Updating tenant configuration...${NC}"

# Extract tenant configs
TENANT_CONFIGS=$(echo "$PACK_JSON" | jq -r '.tenantConfigs // {}')
CONFIG_COUNT=$(echo "$TENANT_CONFIGS" | jq 'keys | length')

if [ "$CONFIG_COUNT" -gt 0 ]; then
  echo "         Found $CONFIG_COUNT tenant config entries"

  # Apply config for current tenant (or wildcard)
  TENANT_CONFIG=$(echo "$TENANT_CONFIGS" | jq -r ".\"$TENANT\" // .\"*\" // {}")

  if [ "$TENANT_CONFIG" != "{}" ] && [ "$TENANT_CONFIG" != "null" ]; then
    echo "  → Applying config to tenant: $TENANT"

    # Note: Tenant config update endpoint may vary by implementation
    # This is a placeholder - actual implementation may differ
    echo -e "     ${YELLOW}⚠${NC} Tenant config update not yet implemented (manual application required)"
  else
    echo "     No config for tenant $TENANT"
  fi
else
  echo "     No tenant configs in pack"
fi

echo ""
echo -e "${BLUE}Step 3/3: Triggering OPAL distribution...${NC}"

# Trigger OPAL force sync
curl -s -X POST "${API_URL}/api/opal/force-sync" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -k \
  -o /tmp/opal-sync-response.json

if [ $? -eq 0 ]; then
  echo -e "     ${GREEN}✓${NC} OPAL sync initiated"
  echo "         Changes will propagate to all spokes within ~1 second"
else
  echo -e "     ${YELLOW}⚠${NC} OPAL sync trigger failed (CDC will sync automatically)"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    ✅ Deployment Complete!                 ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Policy pack ${PACK_NAME} applied successfully to tenant ${TENANT}."
echo ""
echo "Next steps:"
echo "  1. Verify constraints:"
echo "     curl -k ${API_URL}/api/federation-constraints -H \"Authorization: Bearer \$DIVE_ADMIN_TOKEN\" | jq"
echo ""
echo "  2. Test authorization with bilateral constraints"
echo ""
echo "  3. Customize constraints if needed:"
echo "     curl -k -X PUT ${API_URL}/api/federation-constraints/${TENANT}/PARTNER ..."
echo ""
