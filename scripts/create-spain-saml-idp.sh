#!/bin/bash
#
# DIVE V3 - Create Spain SAML IdP via Backend API
# 
# This script automates the IdP Onboarding Wizard workflow by:
# 1. Authenticating as super_admin
# 2. Submitting Spain SAML configuration to backend API
# 3. Auto-validation and risk scoring
# 4. Auto-approval (if score >= 85)
# 5. Verification of IdP registration
#
# Usage: ./scripts/create-spain-saml-idp.sh

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin-dive}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-DiveAdmin2025!}"
REALM="${REALM:-dive-v3-broker}"
CLIENT_ID="${CLIENT_ID:-dive-v3-client}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}DIVE V3 - Spain SAML IdP Creation${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# ============================================
# Step 1: Get Admin Access Token via Direct Grant
# ============================================

echo -e "${YELLOW}Step 1: Authenticating as super_admin via custom login...${NC}"

# Use backend's custom login endpoint which handles Direct Grant properly
LOGIN_RESPONSE=$(curl -s -X POST \
  "${BACKEND_URL}/api/auth/custom-login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "'"${ADMIN_USERNAME}"'",
    "password": "'"${ADMIN_PASSWORD}"'",
    "realmId": "'"${REALM}"'"
  }')

SUCCESS=$(echo $LOGIN_RESPONSE | jq -r '.success')
ACCESS_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.data.accessToken')

if [ "$SUCCESS" != "true" ] || [ "$ACCESS_TOKEN" == "null" ] || [ -z "$ACCESS_TOKEN" ]; then
  echo -e "${RED}❌ Authentication failed${NC}"
  echo "Response: $LOGIN_RESPONSE"
  echo ""
  echo -e "${YELLOW}Trying alternative method (Keycloak admin-cli)...${NC}"
  
  # Fallback: Use Keycloak master realm admin token
  TOKEN_RESPONSE=$(curl -s -X POST \
    "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=admin" \
    -d "password=admin" \
    -d "grant_type=password" \
    -d "client_id=admin-cli")
  
  ADMIN_TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.access_token')
  
  if [ "$ADMIN_TOKEN" == "null" ] || [ -z "$ADMIN_TOKEN" ]; then
    echo -e "${RED}❌ Both authentication methods failed${NC}"
    exit 1
  fi
  
  # Note: Using master realm admin token - backend will need to accept this
  ACCESS_TOKEN=$ADMIN_TOKEN
  echo -e "${YELLOW}⚠️  Using master realm admin token (may have permission issues)${NC}"
fi

echo -e "${GREEN}✅ Authentication successful${NC}"
echo ""

# ============================================
# Step 2: Read Spain SAML Certificate
# ============================================

echo -e "${YELLOW}Step 2: Reading Spain SAML certificate...${NC}"

CERT_PATH="external-idps/spain-saml/cert/server.crt"

if [ ! -f "$CERT_PATH" ]; then
  echo -e "${YELLOW}⚠️  Certificate not found locally, extracting from container...${NC}"
  mkdir -p external-idps/spain-saml/cert
  docker exec dive-spain-saml-idp cat /var/www/simplesamlphp/cert/server.crt > $CERT_PATH
fi

# Read certificate (strip header/footer, keep just the base64 content)
CERTIFICATE=$(cat $CERT_PATH)

if [ -z "$CERTIFICATE" ]; then
  echo -e "${RED}❌ Failed to read certificate${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Certificate loaded${NC}"
echo ""

# ============================================
# Step 3: Submit Spain SAML IdP to Backend
# ============================================

echo -e "${YELLOW}Step 3: Submitting Spain SAML IdP configuration...${NC}"

# Create the IdP configuration JSON
# Note: Using localhost:9443 for external access, spain-saml:8443 for internal Docker network
# Since Keycloak needs to reach SimpleSAMLphp, we need to use the Docker network hostname
IDP_CONFIG=$(cat <<EOF
{
  "alias": "esp-realm-external",
  "displayName": "Spain Ministry of Defense (External SAML)",
  "description": "External Spain SAML IdP for coalition federation testing - SimpleSAMLphp implementation",
  "protocol": "saml",
  "config": {
    "entityId": "https://spain-saml:8443/simplesaml/saml2/idp/metadata.php",
    "singleSignOnServiceUrl": "https://spain-saml:8443/simplesaml/saml2/idp/SSOService.php",
    "singleLogoutServiceUrl": "https://spain-saml:8443/simplesaml/saml2/idp/SingleLogoutService.php",
    "certificate": $(echo "$CERTIFICATE" | jq -R -s '.'),
    "signatureAlgorithm": "RSA_SHA256",
    "nameIDFormat": "urn:oasis:names:tc:SAML:2.0:nameid-format:transient",
    "wantAssertionsSigned": false,
    "wantAuthnRequestsSigned": false,
    "validateSignature": false,
    "postBindingResponse": true,
    "postBindingAuthnRequest": false
  },
  "attributeMappings": {
    "uniqueID": {
      "claim": "uid",
      "userAttribute": "uniqueID",
      "required": true
    },
    "clearance": {
      "claim": "nivelSeguridad",
      "userAttribute": "clearanceOriginal",
      "required": true,
      "notes": "Spanish clearances will be normalized by backend: SECRETO→SECRET, CONFIDENCIAL→CONFIDENTIAL, etc."
    },
    "countryOfAffiliation": {
      "claim": "",
      "userAttribute": "countryOfAffiliation",
      "hardcodedValue": "ESP",
      "required": true,
      "notes": "All Spain SAML users get ESP country code"
    },
    "acpCOI": {
      "claim": "grupoInteresCompartido",
      "userAttribute": "acpCOI",
      "multiValued": true,
      "required": false,
      "notes": "Community of Interest tags (e.g., NATO-COSMIC, OTAN-ESP)"
    }
  }
}
EOF
)

echo "Configuration:"
echo "$IDP_CONFIG" | jq '.'
echo ""

# Submit to backend API
API_RESPONSE=$(curl -s -X POST \
  "${BACKEND_URL}/api/admin/idps" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: spain-saml-$(date +%s)" \
  -d "$IDP_CONFIG")

echo "API Response:"
echo "$API_RESPONSE" | jq '.'
echo ""

# Check response
SUCCESS=$(echo $API_RESPONSE | jq -r '.success')
if [ "$SUCCESS" != "true" ]; then
  echo -e "${RED}❌ IdP creation failed${NC}"
  echo "$API_RESPONSE" | jq '.'
  exit 1
fi

echo -e "${GREEN}✅ IdP submission successful${NC}"

# ============================================
# Step 4: Display Validation Results
# ============================================

echo ""
echo -e "${YELLOW}Step 4: Validation Results${NC}"
echo -e "${BLUE}----------------------------------------${NC}"

# Extract results
SUBMISSION_ID=$(echo $API_RESPONSE | jq -r '.data.submissionId')
RISK_SCORE=$(echo $API_RESPONSE | jq -r '.data.comprehensiveRiskScore.finalScore')
TIER=$(echo $API_RESPONSE | jq -r '.data.comprehensiveRiskScore.tier')
DECISION=$(echo $API_RESPONSE | jq -r '.data.approvalDecision.action')
AUTO_APPROVED=$(echo $API_RESPONSE | jq -r '.data.autoApproved')

echo "Submission ID: $SUBMISSION_ID"
echo "Risk Score: $RISK_SCORE/100 ($TIER tier)"
echo "Decision: $DECISION"
echo "Auto-Approved: $AUTO_APPROVED"
echo ""

# Display validation checks
echo "Security Validation:"
echo $API_RESPONSE | jq -r '.data.validationResults | to_entries[] | "  \(.key): \(.value.status)"'
echo ""

# ============================================
# Step 5: Verify IdP Registration
# ============================================

echo -e "${YELLOW}Step 5: Verifying IdP registration...${NC}"

sleep 2

PUBLIC_IDPS=$(curl -s "${BACKEND_URL}/api/idps/public")
ESP_IDP=$(echo $PUBLIC_IDPS | jq '.idps[] | select(.alias == "esp-realm-external")')

if [ -z "$ESP_IDP" ] || [ "$ESP_IDP" == "null" ]; then
  echo -e "${RED}❌ Spain SAML IdP not found in public IdP list${NC}"
  echo "Available IdPs:"
  echo $PUBLIC_IDPS | jq '.idps[] | .alias'
  echo ""
  echo -e "${YELLOW}⚠️  IdP may be pending approval. Checking submission status...${NC}"
  
  # Check submission status
  SUBMISSION_STATUS=$(curl -s -X GET \
    "${BACKEND_URL}/api/admin/idps/submissions/${SUBMISSION_ID}" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}")
  
  echo "Submission Status:"
  echo $SUBMISSION_STATUS | jq '.'
else
  echo -e "${GREEN}✅ Spain SAML IdP registered successfully${NC}"
  echo ""
  echo "IdP Details:"
  echo $ESP_IDP | jq '.'
fi

echo ""

# ============================================
# Step 6: Summary
# ============================================

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

if [ "$AUTO_APPROVED" == "true" ]; then
  echo -e "${GREEN}✅ Spain SAML IdP created and auto-approved${NC}"
  echo ""
  echo "Next Steps:"
  echo "1. Navigate to http://localhost:3000/"
  echo "2. Look for 'Spain Ministry of Defense (External SAML)' 🇪🇸"
  echo "3. Click to authenticate via SimpleSAMLphp"
  echo "4. Test with credentials:"
  echo "   - Username: user1"
  echo "   - Password: user1pass"
  echo ""
  echo "Test Resource Access:"
  echo "  curl -H \"Authorization: Bearer \$TOKEN\" http://localhost:4000/api/resources"
else
  echo -e "${YELLOW}⚠️  IdP requires manual approval${NC}"
  echo "Risk Score: $RISK_SCORE (threshold: 85)"
  echo "Decision: $DECISION"
  echo ""
  echo "To approve manually:"
  echo "  curl -X POST ${BACKEND_URL}/api/admin/idps/submissions/${SUBMISSION_ID}/approve \\"
  echo "    -H \"Authorization: Bearer \$ACCESS_TOKEN\""
fi

echo ""
echo -e "${GREEN}Script completed successfully!${NC}"

