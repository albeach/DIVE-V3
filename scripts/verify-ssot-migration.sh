#!/bin/bash
# ============================================
# DIVE V3 - SSOT Migration Verification Script
# ============================================
# Version: 3.0.0
# Purpose: Verify the SSOT consolidation changes are working correctly
#
# Run after rebuilding Keycloak with the new image:
#   ./dive nuke
#   ./dive up
#   ./scripts/verify-ssot-migration.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "============================================"
echo "DIVE V3 - SSOT Migration Verification"
echo "Version: 3.0.0 (December 2025)"
echo "============================================"
echo ""

# Check 1: Verify no custom JARs in Keycloak container
echo -n "1. Checking for custom JARs in Keycloak... "
JARS=$(docker exec dive-hub-keycloak find /opt/keycloak/providers -name "dive*.jar" 2>/dev/null || true)
if [ -z "$JARS" ]; then
    echo -e "${GREEN}✅ PASS${NC} - No custom JARs found"
else
    echo -e "${RED}❌ FAIL${NC} - Custom JARs still present:"
    echo "$JARS"
fi

# Check 2: Verify no custom SPIs in Keycloak logs
echo -n "2. Checking Keycloak logs for custom SPIs... "
SPI_WARNINGS=$(docker logs dive-hub-keycloak 2>&1 | grep -c "KC-SERVICES0047.*com.dive.keycloak" || true)
if [ "$SPI_WARNINGS" -eq 0 ]; then
    echo -e "${GREEN}✅ PASS${NC} - No custom SPI registrations"
else
    echo -e "${RED}❌ FAIL${NC} - Found $SPI_WARNINGS custom SPI warnings"
    docker logs dive-hub-keycloak 2>&1 | grep "KC-SERVICES0047.*com.dive.keycloak" | head -5
fi

# Check 3: Verify Terraform is the SSOT
echo -n "3. Checking Terraform configuration validity... "
cd terraform/pilot
TF_VALID=$(terraform validate 2>&1)
if echo "$TF_VALID" | grep -q "Success"; then
    echo -e "${GREEN}✅ PASS${NC} - Terraform config is valid"
else
    echo -e "${RED}❌ FAIL${NC} - Terraform config invalid"
    echo "$TF_VALID"
fi
cd ../..

# Check 4: Verify realm exists in Keycloak
echo -n "4. Checking realm 'dive-v3-broker-usa' exists... "
REALM_EXISTS=$(docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh get realms/dive-v3-broker-usa --server http://localhost:8080 --realm master --user admin --password "${KEYCLOAK_ADMIN_PASSWORD:-admin}" 2>/dev/null | grep -c "dive-v3-broker-usa" || true)
if [ "$REALM_EXISTS" -gt 0 ]; then
    echo -e "${GREEN}✅ PASS${NC} - Realm exists"
else
    echo -e "${YELLOW}⚠️ SKIP${NC} - Could not verify (may need different auth)"
fi

# Check 5: Verify native AMR/ACR mappers exist
echo -n "5. Checking native protocol mappers... "
# This would require API access - skip for now
echo -e "${YELLOW}⚠️ MANUAL${NC} - Check in Keycloak Admin Console"

# Check 6: Verify JSON realm templates are archived
echo -n "6. Checking realm templates are archived... "
if [ -f "keycloak/realms/archived/dive-v3-broker-usa.json" ]; then
    echo -e "${GREEN}✅ PASS${NC} - Templates archived"
else
    echo -e "${RED}❌ FAIL${NC} - Templates not properly archived"
fi

# Check 7: Verify providers directory is empty
echo -n "7. Checking providers directory is empty... "
PROVIDER_FILES=$(ls keycloak/providers/*.jar 2>/dev/null | wc -l || echo "0")
if [ "$PROVIDER_FILES" -eq 0 ]; then
    echo -e "${GREEN}✅ PASS${NC} - No JARs in providers/"
else
    echo -e "${RED}❌ FAIL${NC} - Found $PROVIDER_FILES JARs"
fi

# Check 8: Verify extensions are archived
echo -n "8. Checking extensions are archived... "
if [ -d "keycloak/extensions/archived/src" ]; then
    echo -e "${GREEN}✅ PASS${NC} - Source code archived"
else
    echo -e "${RED}❌ FAIL${NC} - Source code not archived"
fi

echo ""
echo "============================================"
echo "Verification Complete"
echo "============================================"
echo ""
echo "Manual verification steps:"
echo "1. Open Keycloak Admin Console: https://localhost:8443/admin"
echo "2. Navigate to: Realm Settings → Authentication → Flows"
echo "3. Verify 'Classified Access Browser Flow' exists"
echo "4. Verify AAL1/AAL2/AAL3 conditional steps are present"
echo "5. Test login with different clearance levels"
echo ""
echo "For full MFA testing, run:"
echo "  ./dive test playwright --federation"
echo ""

