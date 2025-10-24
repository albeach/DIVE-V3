#!/bin/bash

###############################################################################
# Fix admin-dive MFA Enforcement
###############################################################################
#
# PROBLEM: Keycloak Terraform provider v4.4.0 bug - user attributes not applied
# SYMPTOM: admin-dive has TOP_SECRET clearance but MFA not enforced
# ROOT CAUSE: clearance attribute missing in Keycloak → conditional flow fails
#
# This script manually sets the user attributes via Keycloak Admin CLI
#
###############################################################################

set -e

echo "=========================================="
echo "Fix admin-dive MFA Enforcement"
echo "=========================================="
echo ""

# Get user ID
USER_ID=$(docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password admin 2>&1 > /dev/null && \
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users -r dive-v3-broker -q username=admin-dive --fields id 2>&1 | grep '"id"' | head -1 | awk '{print $3}' | tr -d ',"')

echo "User ID: $USER_ID"
echo ""

# Create attributes JSON
cat > /tmp/admin-dive-fix.json << 'EOF'
{
  "attributes": {
    "uniqueID": ["admin@dive-v3.pilot"],
    "clearance": ["TOP_SECRET"],
    "countryOfAffiliation": ["USA"],
    "acpCOI": ["[\"NATO-COSMIC\",\"FVEY\",\"CAN-US\"]"],
    "dutyOrg": ["DIVE_ADMIN"],
    "orgUnit": ["SYSTEM_ADMINISTRATION"]
  }
}
EOF

echo "Setting user attributes..."
docker cp /tmp/admin-dive-fix.json dive-v3-keycloak:/tmp/admin-dive-fix.json

# Update user - use POST to replace all attributes
docker exec dive-v3-keycloak curl -s -X PUT \
  "http://localhost:8080/admin/realms/dive-v3-broker/users/$USER_ID" \
  -H "Authorization: Bearer $(docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password admin 2>&1 > /dev/null && docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get-token 2>&1 | jq -r .access_token)" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "'$USER_ID'",
    "username": "admin-dive",
    "enabled": true,
    "email": "admin@dive-v3.pilot",
    "firstName": "DIVE",
    "lastName": "Administrator",
    "attributes": {
      "uniqueID": ["admin@dive-v3.pilot"],
      "clearance": ["TOP_SECRET"],
      "countryOfAffiliation": ["USA"],
      "acpCOI": ["[\"NATO-COSMIC\",\"FVEY\",\"CAN-US\"]"],
      "dutyOrg": ["DIVE_ADMIN"],
      "orgUnit": ["SYSTEM_ADMINISTRATION"]
    }
  }'

echo ""
echo "✅ Attributes set via REST API"
echo ""

# Verify
echo "Verifying attributes..."
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users/$USER_ID -r dive-v3-broker --fields username,attributes

echo ""
echo "=========================================="
echo "✅ Fix Applied"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "1. Logout of DIVE V3"
echo "2. Clear browser cookies for localhost"
echo "3. Login again at http://localhost:3000/login/dive-v3-broker"
echo "4. You should now be prompted for MFA setup"
echo ""
echo "Expected Flow:"
echo "- Enter username: admin-dive"
echo "- Enter password: DiveAdmin2025!"
echo "- NEW: Scan QR code with authenticator app"
echo "- NEW: Enter 6-digit code"
echo "- Login successful with MFA"
echo ""
echo "=========================================="

