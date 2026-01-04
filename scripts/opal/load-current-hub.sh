#!/usr/bin/env bash
# Quick-start script to load current Hub realm into OPA
# This is a temporary bridge until full OPAL integration is complete

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Loading Hub Realm into OPA${NC}"
echo -e "${BLUE}════════════════════════════════════════════${NC}"
echo ""

# Get current configuration
INSTANCE="${DIVE_INSTANCE:-USA}"
INSTANCE_LOWER="$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]')"
KEYCLOAK_URL="${NEXT_PUBLIC_KEYCLOAK_URL:-https://localhost:8443}"
KEYCLOAK_REALM="${NEXT_PUBLIC_KEYCLOAK_REALM:-dive-v3-broker-${INSTANCE_LOWER}}"
ISSUER_URL="${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}"

echo "Instance: $INSTANCE"
echo "Issuer: $ISSUER_URL"
echo ""

# Create temp data file
TEMP_DATA=$(mktemp)
cat > "$TEMP_DATA" << EOF
{
  "${ISSUER_URL}": {
    "tenant": "${INSTANCE}",
    "name": "${INSTANCE} Hub (${KEYCLOAK_URL})",
    "country": "${INSTANCE}",
    "trust_level": "DEVELOPMENT",
    "realm": "${KEYCLOAK_REALM}",
    "enabled": true
  }
}
EOF

# Load into OPA via file mount (since bundle prevents direct API push)
echo -e "${BLUE}Updating policy_data.json...${NC}"
jq --argjson new_issuer "$(cat $TEMP_DATA)" \
   '.trusted_issuers += $new_issuer' \
   "$PROJECT_ROOT/policies/policy_data.json" > "$PROJECT_ROOT/policies/policy_data.json.tmp" &&\
mv "$PROJECT_ROOT/policies/policy_data.json.tmp" "$PROJECT_ROOT/policies/policy_data.json"

echo -e "${GREEN}✅ Added issuer to policy_data.json${NC}"
echo ""

# Restart OPA to load updated data
echo -e "${BLUE}Restarting OPA...${NC}"
docker restart dive-hub-opa > /dev/null 2>&1
sleep 5

echo -e "${GREEN}✅ OPA restarted${NC}"
echo ""

# Verify
echo -e "${BLUE}Verifying issuer is trusted...${NC}"
if curl -sk -X POST https://localhost:8181/v1/data/dive/tenant/base/is_trusted_issuer \
   -H "Content-Type: application/json" \
   -d "{\"input\": \"${ISSUER_URL}\"}" 2>&1 | grep -q "true"; then
    echo -e "${GREEN}✅ Issuer is now trusted!${NC}"
else
    echo -e "${RED}❌ Issuer verification failed${NC}"
fi

rm -f "$TEMP_DATA"

echo ""
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Setup Complete${NC}"
echo -e "${GREEN}════════════════════════════════════════════${NC}"
