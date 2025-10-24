#!/bin/bash

#################################################
# Deploy AAL2 MFA Fix for admin-dive User
#################################################
# 
# Issue: admin-dive user has hardcoded acr/amr claims
# Fix: Remove hardcoded claims so Keycloak enforces MFA
# 
# User: admin-dive
# Clearance: TOP_SECRET
# Expected: MFA REQUIRED at login
# 
#################################################

set -e

echo "=========================================="
echo "AAL2 MFA Fix for admin-dive User"
echo "=========================================="
echo ""
echo "Issue: admin-dive has TOP_SECRET clearance but"
echo "       hardcoded acr/amr claims bypass MFA enforcement"
echo ""
echo "Fix: Remove hardcoded claims to enable real MFA"
echo "=========================================="
echo ""

# Navigate to terraform directory
cd "$(dirname "$0")/../terraform"

echo "Step 1: Initialize Terraform..."
terraform init -upgrade

echo ""
echo "Step 2: Plan changes..."
echo "Expected: Update admin-dive user attributes (remove acr, amr)"
terraform plan -out=tfplan-admin-dive-mfa-fix

echo ""
echo "=========================================="
echo "Review the plan above"
echo "=========================================="
echo ""
read -p "Apply changes? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Deployment cancelled"
    exit 0
fi

echo ""
echo "Step 3: Applying changes..."
terraform apply tfplan-admin-dive-mfa-fix

echo ""
echo "=========================================="
echo "✅ Deployment Complete"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "1. Clear browser cache and cookies"
echo "2. Go to http://localhost:3000/login/dive-v3-broker"
echo "3. Login with admin-dive / DiveAdmin2025!"
echo "4. You should now be prompted to SET UP MFA"
echo "5. Scan QR code with Google Authenticator"
echo "6. Enter 6-digit code to complete setup"
echo "7. Future logins will require MFA"
echo ""
echo "Verify JWT Claims:"
echo "- After login, check JWT token"
echo "- acr should be '1' (AAL2) not hardcoded"
echo "- amr should be [\"pwd\",\"otp\"] dynamically set"
echo ""
echo "=========================================="
echo ""

