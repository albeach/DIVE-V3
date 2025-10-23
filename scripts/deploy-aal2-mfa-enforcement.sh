#!/bin/bash
# ============================================
# Deploy AAL2 MFA Enforcement
# ============================================
# Fixes Gap #6: ACR/AMR Not Enriched by Keycloak
# Implements conditional MFA for classified clearances
# Reference: docs/AAL2-MFA-ENFORCEMENT-FIX.md

set -e  # Exit on any error

echo "============================================"
echo "DIVE V3: AAL2 MFA Enforcement Deployment"
echo "============================================"
echo ""
echo "⚠️  WARNING: This will modify Keycloak authentication flows"
echo "   All users with clearance >= CONFIDENTIAL will require MFA"
echo ""
read -p "Continue? (yes/no): " CONFIRM

if [[ "$CONFIRM" != "yes" ]]; then
    echo "Deployment cancelled."
    exit 0
fi

# Change to terraform directory
cd "$(dirname "$0")/../terraform"

echo ""
echo "Step 1: Terraform Plan (Review Changes)"
echo "============================================"
terraform plan -out=tfplan-mfa-enforcement

echo ""
echo "Review the plan above. Key changes:"
echo "  - New authentication flows (USA, France, Canada)"
echo "  - Conditional OTP executions"
echo "  - OTP policy configurations"
echo "  - Dynamic ACR/AMR protocol mappers"
echo ""
read -p "Apply these changes? (yes/no): " APPLY

if [[ "$APPLY" != "yes" ]]; then
    echo "Deployment cancelled."
    rm -f tfplan-mfa-enforcement
    exit 0
fi

echo ""
echo "Step 2: Applying Terraform Changes"
echo "============================================"
terraform apply tfplan-mfa-enforcement

rm -f tfplan-mfa-enforcement

echo ""
echo "Step 3: Restart Keycloak (Optional)"
echo "============================================"
echo "Keycloak may need to be restarted to apply authentication flow changes."
read -p "Restart Keycloak now? (yes/no): " RESTART

if [[ "$RESTART" == "yes" ]]; then
    cd ..
    docker-compose restart keycloak
    echo "Waiting for Keycloak to start..."
    sleep 30
    echo "Keycloak restarted."
fi

echo ""
echo "✅ AAL2 MFA Enforcement Deployed Successfully"
echo ""
echo "============================================"
echo "Next Steps: Testing"
echo "============================================"
echo ""
echo "Test 1: UNCLASSIFIED User (No MFA)"
echo "  - Login as: bob.contractor (clearance=UNCLASSIFIED)"
echo "  - Expected: Password only, no OTP prompt"
echo "  - JWT: acr=\"0\", amr=[\"pwd\"]"
echo ""
echo "Test 2: SECRET User (MFA REQUIRED)"
echo "  - Login as: john.doe (clearance=SECRET)"
echo "  - Expected: Password + OTP setup (first time)"
echo "  - JWT: acr=\"1\", amr=[\"pwd\",\"otp\"]"
echo ""
echo "Test 3: TOP SECRET User (MFA REQUIRED)"
echo "  - Login as: super.admin (clearance=TOP_SECRET)"
echo "  - Expected: Password + OTP (mandatory)"
echo "  - JWT: acr=\"1\", amr=[\"pwd\",\"otp\"]"
echo ""
echo "Test 4: Verify JWT Claims"
echo "  - After login, copy JWT from browser DevTools"
echo "  - Paste into jwt.io and verify acr/amr claims"
echo ""
echo "============================================"
echo "Documentation"
echo "============================================"
echo "  - Fix Details: docs/AAL2-MFA-ENFORCEMENT-FIX.md"
echo "  - Gap Analysis: notes/KEYCLOAK-INTEGRATION-ASSESSMENT-COMPLETE.md"
echo "  - OPA Policy: policies/fuel_inventory_abac_policy.rego (lines 694-728)"
echo ""
echo "✅ Deployment Complete"
echo ""

