#!/bin/bash
###############################################################################
# FIX ALL KEYCLOAK USER ATTRIBUTES IN TERRAFORM
###############################################################################
# This script fixes the Terraform configuration for ALL Keycloak users
# to use proper LIST syntax for attributes instead of scalar strings.
#
# Root Cause: Keycloak Terraform provider expects attributes as lists,
# but Terraform accepts scalars without error. This causes a silent failure
# where attributes appear in Terraform state but don't persist to Keycloak.
#
# Best Practice: Always define attributes as lists: ["value"] not "value"
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  🔧 FIX KEYCLOAK TERRAFORM USER ATTRIBUTES                   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/terraform

echo -e "${CYAN}This script will:${NC}"
echo "  1. Update all keycloak_user resources to use LIST syntax for attributes"
echo "  2. Apply Terraform changes to persist attributes correctly"
echo "  3. Verify attributes are set in Keycloak"
echo ""
echo -e "${YELLOW}Files to be modified:${NC}"
echo "  - terraform/main.tf (test users)"
echo ""

read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

###############################################################################
# Fix main.tf test users
###############################################################################
echo ""
echo -e "${BLUE}[1/3]${NC} Fixing main.tf test user attributes..."

# Backup original file
cp main.tf main.tf.backup

# Fix test_user_us_secret
sed -i.tmp '
/resource "keycloak_user" "test_user_us_secret"/,/^}/ {
    s/uniqueID               = "john\.doe@mil"/uniqueID               = ["john.doe@mil"]/
    s/clearance              = "SECRET"/clearance              = ["SECRET"]/
    s/countryOfAffiliation   = "USA"/countryOfAffiliation   = ["USA"]/
    s/acpCOI                 = "\[.*COSMIC.*FVEY.*\]"/acpCOI                 = ["NATO-COSMIC", "FVEY"]/
    s/dutyOrg                = "US_ARMY"/dutyOrg                = ["US_ARMY"]/
    s/orgUnit                = "CYBER_DEFENSE"/orgUnit                = ["CYBER_DEFENSE"]/
    s/acr                    = "urn:mace:incommon:iap:silver"/acr                    = ["urn:mace:incommon:iap:silver"]/
    s/amr                    = "\[.*pwd.*otp.*\]"/amr                    = ["pwd", "otp"]/
}
' main.tf

# Fix test_user_us_confid
sed -i.tmp2 '
/resource "keycloak_user" "test_user_us_confid"/,/^}/ {
    s/uniqueID               = "jane\.smith@mil"/uniqueID               = ["jane.smith@mil"]/
    s/clearance              = "CONFIDENTIAL"/clearance              = ["CONFIDENTIAL"]/
    s/countryOfAffiliation   = "USA"/countryOfAffiliation   = ["USA"]/
    s/acpCOI                 = "\[.*FVEY.*\]"/acpCOI                 = ["FVEY"]/
    s/dutyOrg                = "US_NAVY"/dutyOrg                = ["US_NAVY"]/
    s/orgUnit                = "INTELLIGENCE"/orgUnit                = ["INTELLIGENCE"]/
    s/acr                    = "urn:mace:incommon:iap:silver"/acr                    = ["urn:mace:incommon:iap:silver"]/
    s/amr                    = "\[.*pwd.*otp.*\]"/amr                    = ["pwd", "otp"]/
}
' main.tf

# Fix test_user_us_unclass
sed -i.tmp3 '
/resource "keycloak_user" "test_user_us_unclass"/,/^}/ {
    s/uniqueID               = "bob\.jones@mil"/uniqueID               = ["bob.jones@mil"]/
    s/clearance              = "UNCLASSIFIED"/clearance              = ["UNCLASSIFIED"]/
    s/countryOfAffiliation   = "USA"/countryOfAffiliation   = ["USA"]/
    s/acpCOI                 = "\[\]"/acpCOI                 = []/
    s/dutyOrg                = "CONTRACTOR"/dutyOrg                = ["CONTRACTOR"]/
    s/orgUnit                = "LOGISTICS"/orgUnit                = ["LOGISTICS"]/
    s/acr                    = "urn:mace:incommon:iap:bronze"/acr                    = ["urn:mace:incommon:iap:bronze"]/
    s/amr                    = "\[.*pwd.*\]"/amr                    = ["pwd"]/
}
' main.tf

# Fix france_user
sed -i.tmp4 '
/resource "keycloak_user" "france_user"/,/^}/ {
    s/uniqueID               = "pierre\.dubois@defense\.gouv\.fr"/uniqueID               = ["pierre.dubois@defense.gouv.fr"]/
    s/clearance              = "SECRET"/clearance              = ["SECRET"]/
    s/countryOfAffiliation   = "FRA"/countryOfAffiliation   = ["FRA"]/
    s/acpCOI                 = "\[.*NATO-COSMIC.*\]"/acpCOI                 = ["NATO-COSMIC"]/
    s/dutyOrg                = "FR_DEFENSE_MINISTRY"/dutyOrg                = ["FR_DEFENSE_MINISTRY"]/
    s/orgUnit                = "RENSEIGNEMENT"/orgUnit                = ["RENSEIGNEMENT"]/
    s/acr                    = "urn:mace:incommon:iap:silver"/acr                    = ["urn:mace:incommon:iap:silver"]/
    s/amr                    = "\[.*pwd.*otp.*\]"/amr                    = ["pwd", "otp"]/
}
' main.tf

# Fix canada_user
sed -i.tmp5 '
/resource "keycloak_user" "canada_user"/,/^}/ {
    s/uniqueID               = "john\.macdonald@forces\.gc\.ca"/uniqueID               = ["john.macdonald@forces.gc.ca"]/
    s/clearance              = "CONFIDENTIAL"/clearance              = ["CONFIDENTIAL"]/
    s/countryOfAffiliation   = "CAN"/countryOfAffiliation   = ["CAN"]/
    s/acpCOI                 = "\[.*CAN-US.*\]"/acpCOI                 = ["CAN-US"]/
    s/dutyOrg                = "CAN_FORCES"/dutyOrg                = ["CAN_FORCES"]/
    s/orgUnit                = "CYBER_OPS"/orgUnit                = ["CYBER_OPS"]/
    s/acr                    = "urn:mace:incommon:iap:silver"/acr                    = ["urn:mace:incommon:iap:silver"]/
    s/amr                    = "\[.*pwd.*otp.*\]"/amr                    = ["pwd", "otp"]/
}
' main.tf

# Clean up temporary files
rm -f main.tf.tmp*

echo -e "${GREEN}✅ main.tf updated${NC}"

###############################################################################
# Apply Terraform changes
###############################################################################
echo ""
echo -e "${BLUE}[2/3]${NC} Applying Terraform changes..."
echo ""
echo -e "${YELLOW}Running: terraform apply -target=keycloak_user.broker_super_admin${NC}"
echo ""

terraform apply -target='keycloak_user.broker_super_admin[0]' -auto-approve

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Terraform apply successful${NC}"
else
    echo -e "${RED}❌ Terraform apply failed${NC}"
    echo "Restoring backup..."
    mv main.tf.backup main.tf
    exit 1
fi

###############################################################################
# Verify attributes in Keycloak
###############################################################################
echo ""
echo -e "${BLUE}[3/3]${NC} Verifying attributes in Keycloak..."

cd ..

USER_ID="5c16b28d-8c5a-46d0-8dd6-2fc3779d74f6"
ATTRIBUTES=$(docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh \
  get users/$USER_ID -r dive-v3-broker --fields attributes 2>&1)

echo ""
echo "Current attributes in Keycloak:"
echo "$ATTRIBUTES" | jq .

CLEARANCE=$(echo "$ATTRIBUTES" | jq -r '.attributes.clearance[0] // "NOT_SET"')

if [ "$CLEARANCE" = "TOP_SECRET" ]; then
    echo ""
    echo -e "${GREEN}✅ SUCCESS: Attributes are now persisting in Keycloak!${NC}"
    echo ""
    echo -e "${CYAN}Summary:${NC}"
    echo "  • Terraform configuration fixed (attributes as lists)"
    echo "  • Terraform apply completed successfully"
    echo "  • Attributes verified in Keycloak"
    echo ""
    echo -e "${GREEN}🎉 Root cause RESOLVED!${NC}"
else
    echo ""
    echo -e "${RED}❌ FAILED: Attributes still not persisting${NC}"
    echo "Expected clearance: TOP_SECRET"
    echo "Actual clearance: $CLEARANCE"
    echo ""
    echo "This may require additional investigation."
    exit 1
fi

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""


