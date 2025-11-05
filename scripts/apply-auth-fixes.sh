#!/bin/bash

###############################################################################
# Apply Post-Broker Flow Fixes to Keycloak
# This script applies the conditional MFA post-broker flow updates
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo "========================================"
echo "  Apply Post-Broker Flow Fixes"
echo "========================================"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "This will apply Terraform changes that:"
echo "  • Make post-broker MFA conditional (based on clearance)"
echo "  • Apply to ALL realm brokers (USA, FRA, CAN, etc.)"
echo "  • Fix 'invalid username or password' errors"
echo ""
echo -e "${YELLOW}⚠️  This requires Keycloak to be running${NC}"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted"
    exit 0
fi

echo ""

# Check if Keycloak is running
if ! docker compose ps keycloak | grep -q "Up"; then
    echo -e "${RED}✗ Keycloak is not running${NC}"
    echo "  Start it with: docker compose up -d keycloak"
    exit 1
fi

# Wait for Keycloak to be ready
echo -n "Waiting for Keycloak to be ready..."
for i in {1..30}; do
    if curl -k -s https://localhost:8443/health/ready > /dev/null 2>&1; then
        echo -e " ${GREEN}✓${NC}"
        break
    fi
    echo -n "."
    sleep 2
done

echo ""

# Navigate to terraform directory
cd terraform

# Check if terraform is initialized
if [ ! -d ".terraform" ]; then
    echo "Initializing Terraform..."
    terraform init
    echo ""
fi

# Fix provider permissions if needed
if [ -d ".terraform/providers" ]; then
    find .terraform/providers -type f -name "terraform-provider-*" -exec chmod +x {} \; 2>/dev/null || true
fi

echo "Applying Terraform changes..."
echo ""
echo -e "${CYAN}Changes to apply:${NC}"
echo "  • Post-Broker Flow: Conditional OTP (clearance-based)"
echo "  • All Broker Realms: Updated flow configuration"
echo ""

# Target only the specific resources we changed
terraform apply \
    -target=module.broker_mfa.keycloak_authentication_subflow.post_broker_conditional_otp \
    -target=module.broker_mfa.keycloak_authentication_execution.post_broker_condition_clearance \
    -target=module.broker_mfa.keycloak_authentication_execution_config.post_broker_condition_config \
    -target=module.broker_mfa.keycloak_authentication_execution.post_broker_otp_form \
    -target=keycloak_oidc_identity_provider.usa_realm_broker \
    -target=keycloak_oidc_identity_provider.fra_realm_broker \
    -target=keycloak_oidc_identity_provider.can_realm_broker \
    -target=keycloak_oidc_identity_provider.industry_realm_broker \
    -target=keycloak_oidc_identity_provider.deu_realm_broker \
    -target=keycloak_oidc_identity_provider.gbr_realm_broker \
    -target=keycloak_oidc_identity_provider.ita_realm_broker \
    -target=keycloak_oidc_identity_provider.esp_realm_broker \
    -target=keycloak_oidc_identity_provider.pol_realm_broker \
    -target=keycloak_oidc_identity_provider.nld_realm_broker

APPLY_EXIT_CODE=$?

cd "$PROJECT_ROOT"

echo ""

if [ $APPLY_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ Terraform changes applied successfully!${NC}"
    echo ""
    echo "Post-broker flow is now conditional:"
    echo "  ✅ UNCLASSIFIED users: No OTP required"
    echo "  ✅ SECRET/TOP_SECRET users: OTP required on first login"
    echo ""
    echo "Test the login now:"
    echo "  1. Go to: https://localhost:3000"
    echo "  2. Login with: testuser-usa-unclass (should work without OTP)"
    echo "  3. Login with: testuser-usa-secret (will prompt for OTP setup/entry)"
    echo ""
else
    echo -e "${RED}✗ Terraform apply failed${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check Keycloak is running: docker compose ps keycloak"
    echo "  2. Check Keycloak logs: docker compose logs keycloak --tail=50"
    echo "  3. Try manual apply: cd terraform && terraform apply"
    echo ""
    exit 1
fi

