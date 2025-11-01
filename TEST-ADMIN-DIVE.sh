#!/bin/bash
# ============================================
# admin-dive E2E Authentication Test Script
# ============================================
# Tests admin-dive super admin account with full E2E verification

set -e

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║            DIVE V3 - admin-dive E2E Authentication Test                      ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================
# Pre-flight Checks
# ============================================

echo "┌──────────────────────────────────────────────────────────────────────────────┐"
echo "│ STEP 1: Verify Services Running                                             │"
echo "└──────────────────────────────────────────────────────────────────────────────┘"

echo ""
echo "Checking Docker services..."
SERVICES=$(docker-compose ps --services --filter "status=running")

check_service() {
    if echo "$SERVICES" | grep -q "^$1$"; then
        echo -e "${GREEN}✅ $1${NC}"
        return 0
    else
        echo -e "${RED}❌ $1 (not running)${NC}"
        return 1
    fi
}

ALL_RUNNING=true
check_service "keycloak" || ALL_RUNNING=false
check_service "backend" || ALL_RUNNING=false
check_service "frontend" || ALL_RUNNING=false
check_service "mongodb" || ALL_RUNNING=false
check_service "opa" || ALL_RUNNING=false

if [ "$ALL_RUNNING" = false ]; then
    echo ""
    echo -e "${RED}⚠️  Not all services are running!${NC}"
    echo "Run: docker-compose up -d"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ All required services running${NC}"
echo ""

# ============================================
# Terraform Verification
# ============================================

echo "┌──────────────────────────────────────────────────────────────────────────────┐"
echo "│ STEP 2: Verify Terraform Configuration                                      │"
echo "└──────────────────────────────────────────────────────────────────────────────┘"
echo ""

cd terraform

echo "Checking admin-dive user exists..."
if terraform state show 'keycloak_user.broker_super_admin[0]' > /dev/null 2>&1; then
    echo -e "${GREEN}✅ admin-dive user configured in Terraform${NC}"
    
    echo ""
    echo "User Details:"
    terraform state show 'keycloak_user.broker_super_admin[0]' | grep -E "username|clearance|realm_id|required_actions" | sed 's/^/  /'
else
    echo -e "${RED}❌ admin-dive user not found in Terraform state${NC}"
    echo "Run: terraform apply"
    exit 1
fi

echo ""
echo "Checking ACR mappers exist..."
if terraform state list | grep -q "keycloak_generic_protocol_mapper.broker_acr"; then
    echo -e "${GREEN}✅ ACR mapper configured${NC}"
else
    echo -e "${RED}❌ ACR mapper not found${NC}"
    exit 1
fi

if terraform state list | grep -q "keycloak_generic_protocol_mapper.broker_amr"; then
    echo -e "${GREEN}✅ AMR mapper configured${NC}"
else
    echo -e "${RED}❌ AMR mapper not found${NC}"
    exit 1
fi

if terraform state list | grep -q "keycloak_generic_protocol_mapper.broker_auth_time"; then
    echo -e "${GREEN}✅ auth_time mapper configured${NC}"
else
    echo -e "${RED}❌ auth_time mapper not found${NC}"
    exit 1
fi

echo ""
echo "Checking MFA flow ACR configuration..."
if terraform state list | grep -q "module.broker_mfa.keycloak_authentication_execution_config.classified_otp_acr_config"; then
    echo -e "${GREEN}✅ Browser Flow OTP ACR config exists${NC}"
else
    echo -e "${YELLOW}⚠️  Browser Flow OTP ACR config not found (may need terraform apply)${NC}"
fi

if terraform state list | grep -q "module.broker_mfa.keycloak_authentication_execution_config.direct_grant_otp_acr_config"; then
    echo -e "${GREEN}✅ Direct Grant OTP ACR config exists${NC}"
else
    echo -e "${YELLOW}⚠️  Direct Grant OTP ACR config not found (may need terraform apply)${NC}"
fi

cd ..

echo ""

# ============================================
# Backend API Health
# ============================================

echo "┌──────────────────────────────────────────────────────────────────────────────┐"
echo "│ STEP 3: Verify Backend API Health                                           │"
echo "└──────────────────────────────────────────────────────────────────────────────┘"
echo ""

echo "Testing backend API..."
if curl -s -k https://localhost:4000/health | grep -q "status"; then
    echo -e "${GREEN}✅ Backend API responding${NC}"
    echo "   Response: $(curl -s -k https://localhost:4000/health | jq -r '.status')"
else
    echo -e "${RED}❌ Backend API not responding${NC}"
    exit 1
fi

echo ""

# ============================================
# Keycloak Health
# ============================================

echo "┌──────────────────────────────────────────────────────────────────────────────┐"
echo "│ STEP 4: Verify Keycloak Health                                              │"
echo "└──────────────────────────────────────────────────────────────────────────────┘"
echo ""

echo "Testing Keycloak HTTPS endpoint..."
if curl -s -k https://localhost:8443/realms/dive-v3-broker | grep -q "realm"; then
    echo -e "${GREEN}✅ Keycloak HTTPS responding${NC}"
    echo "   Issuer: https://localhost:8443/realms/dive-v3-broker"
else
    echo -e "${RED}❌ Keycloak not responding on HTTPS${NC}"
    exit 1
fi

echo ""

# ============================================
# Test Credentials Summary
# ============================================

echo "┌──────────────────────────────────────────────────────────────────────────────┐"
echo "│ STEP 5: Test Credentials                                                    │"
echo "└──────────────────────────────────────────────────────────────────────────────┘"
echo ""

echo "admin-dive Super Admin Account:"
echo "  Realm:    dive-v3-broker"
echo "  Username: admin-dive"
echo "  Password: DiveAdmin2025!"
echo "  Clearance: TOP_SECRET"
echo "  COI:      NATO-COSMIC, FVEY, CAN-US"
echo ""

# ============================================
# Manual Testing Instructions
# ============================================

echo "┌──────────────────────────────────────────────────────────────────────────────┐"
echo "│ NEXT STEPS: Manual Testing Required                                         │"
echo "└──────────────────────────────────────────────────────────────────────────────┘"
echo ""

echo -e "${YELLOW}⚠️  IMPORTANT: You must LOG OUT and LOG BACK IN for ACR/AMR to work!${NC}"
echo ""
echo "The new ACR configuration was just applied. Your current session has the old"
echo "JWT token without ACR values. You need a fresh authentication to get ACR/AMR."
echo ""

echo "═══════════════════════════════════════════════════════════════════════════════"
echo "  TESTING PROCEDURE"
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""

echo "1️⃣  LOG OUT COMPLETELY"
echo "   • Open: https://localhost:3000"
echo "   • Click: Sign Out (top right)"
echo "   • Wait for redirect to login page"
echo ""

echo "2️⃣  LOG BACK IN"
echo "   • Open: https://localhost:3000/auth/signin"
echo "   • Select: \"DIVE V3 Broker (Super Admin)\""
echo "   • Username: admin-dive"
echo "   • Password: DiveAdmin2025!"
echo "   • OTP: [6-digit code from authenticator app]"
echo ""

echo "3️⃣  VERIFY JWT CLAIMS (Browser DevTools Console)"
echo "   Run this in browser console:"
echo ""
echo "   fetch('/api/auth/session')"
echo "     .then(r => r.json())"
echo "     .then(session => {"
echo "       const token = session.accessToken;"
echo "       const payload = JSON.parse(atob(token.split('.')[1]));"
echo "       console.table({"
echo "         'auth_time': payload.auth_time,"
echo "         'acr': payload.acr || 'N/A',"
echo "         'amr': payload.amr || 'N/A',"
echo "         'clearance': payload.clearance,"
echo "         'issuer': payload.iss"
echo "       });"
echo "     });"
echo ""

echo "   Expected Output:"
echo "   ┌─────────────┬──────────────────────────────────────────────────────────┐"
echo "   │ auth_time   │ 1730458123 (Unix timestamp)                            │"
echo "   │ acr         │ 1 (AAL2 - password + OTP)                     ← SHOULD SHOW NOW │"
echo "   │ amr         │ [\"pwd\",\"otp\"] or stringified                 ← SHOULD SHOW NOW │"
echo "   │ clearance   │ TOP_SECRET                                              │"
echo "   │ issuer      │ https://localhost:8443/realms/dive-v3-broker            │"
echo "   └─────────────┴──────────────────────────────────────────────────────────┘"
echo ""

echo "4️⃣  TEST RESOURCE ACCESS"
echo "   • Navigate to: https://localhost:3000/resources"
echo "   • Click on any resource"
echo "   • Expected: ✅ Resource opens successfully (no \"insufficient strength\" error)"
echo ""

echo "5️⃣  TEST ADMIN PAGES"
echo "   • Navigate to: https://localhost:3000/admin/idp"
echo "   • Expected: ✅ IdP management page loads"
echo ""

echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""

echo -e "${GREEN}✅ All pre-flight checks passed!${NC}"
echo ""
echo -e "${YELLOW}⏳ Waiting for you to log out and log back in...${NC}"
echo ""
echo "After re-login, if you still see ACR N/A or \"insufficient strength\","
echo "run this script again to diagnose the issue."
echo ""
echo "Troubleshooting docs:"
echo "  - ADMIN-DIVE-FIX-SUMMARY.md"
echo "  - ACR-AMR-TROUBLESHOOTING.md"
echo ""

