#!/bin/bash
# Keycloak Configuration Diagnostic Script
# Purpose: Show what's actually active in your Keycloak setup

set -euo pipefail

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Keycloak Configuration Diagnostic${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Check 1: Custom SPI Deployment
echo -e "${YELLOW}[1/5] Custom SPI Deployment Status${NC}"
if docker exec dive-v3-keycloak ls -la /opt/keycloak/providers/dive-keycloak-spi.jar 2>/dev/null > /dev/null; then
    echo -e "  ${GREEN}✅ Custom SPI JAR is deployed${NC}"
    docker exec dive-v3-keycloak ls -lh /opt/keycloak/providers/dive-keycloak-spi.jar 2>/dev/null
    CUSTOM_SPI_DEPLOYED=true
else
    echo -e "  ${RED}❌ Custom SPI JAR not found${NC}"
    CUSTOM_SPI_DEPLOYED=false
fi

# Check 2: SPI Loaded in Keycloak
echo -e "\n${YELLOW}[2/5] Custom SPI Loaded in Keycloak${NC}"
if docker logs dive-v3-keycloak 2>&1 | grep -q "direct-grant-otp-setup"; then
    echo -e "  ${GREEN}✅ Custom SPI 'direct-grant-otp-setup' is loaded${NC}"
    docker logs dive-v3-keycloak 2>&1 | grep "direct-grant-otp-setup" | tail -2
    CUSTOM_SPI_LOADED=true
else
    echo -e "  ${RED}❌ Custom SPI not loaded (no log entries found)${NC}"
    CUSTOM_SPI_LOADED=false
fi

# Check 3: Terraform Configuration
echo -e "\n${YELLOW}[3/5] Terraform Direct Grant OTP Configuration${NC}"
cd terraform
if terraform state show module.broker_mfa.keycloak_authentication_execution.direct_grant_otp[0] 2>/dev/null | grep -q "authenticator"; then
    AUTHENTICATOR=$(terraform state show module.broker_mfa.keycloak_authentication_execution.direct_grant_otp[0] 2>/dev/null | grep "authenticator" | awk '{print $3}' | tr -d '"')
    
    if [ "$AUTHENTICATOR" == "direct-grant-validate-otp" ]; then
        echo -e "  ${GREEN}✅ Using Standard Keycloak OTP Validator${NC}"
        echo -e "     Authenticator: ${GREEN}direct-grant-validate-otp${NC} (built-in)"
        TERRAFORM_USES_CUSTOM=false
    elif [ "$AUTHENTICATOR" == "direct-grant-otp-setup" ]; then
        echo -e "  ${GREEN}✅ Using Custom SPI OTP Setup${NC}"
        echo -e "     Authenticator: ${BLUE}direct-grant-otp-setup${NC} (custom)"
        TERRAFORM_USES_CUSTOM=true
    else
        echo -e "  ${RED}⚠️  Unknown authenticator: $AUTHENTICATOR${NC}"
        TERRAFORM_USES_CUSTOM="unknown"
    fi
else
    echo -e "  ${RED}❌ Could not read Terraform state${NC}"
    TERRAFORM_USES_CUSTOM="error"
fi
cd - > /dev/null

# Check 4: Recent Keycloak OTP Activity
echo -e "\n${YELLOW}[4/5] Recent OTP Authentication Activity${NC}"
if docker logs dive-v3-keycloak 2>&1 | grep -i "otp" | tail -5 | wc -l | grep -q "0"; then
    echo -e "  ${YELLOW}⚠️  No recent OTP activity found in logs${NC}"
else
    echo -e "  ${GREEN}✅ Recent OTP activity (last 5 events):${NC}"
    docker logs dive-v3-keycloak 2>&1 | grep -i "otp" | tail -5 | sed 's/^/     /'
fi

# Check 5: Keycloak 26 Migration Status
echo -e "\n${YELLOW}[5/5] Keycloak 26 Session Note Mappers${NC}"
cd terraform
if terraform state list 2>/dev/null | grep -q "broker_acr"; then
    ACR_MAPPER=$(terraform state show "keycloak_generic_protocol_mapper.broker_acr" 2>/dev/null | grep "protocol_mapper" | awk '{print $3}' | tr -d '"')
    
    if [[ "$ACR_MAPPER" == *"session"* ]]; then
        echo -e "  ${GREEN}✅ ACR mapper using session notes (Keycloak 26 compatible)${NC}"
        echo -e "     Mapper: ${GREEN}$ACR_MAPPER${NC}"
    else
        echo -e "  ${RED}⚠️  ACR mapper NOT using session notes${NC}"
        echo -e "     Mapper: ${RED}$ACR_MAPPER${NC}"
        echo -e "     ${RED}This may cause AAL2 issues with Keycloak 26+${NC}"
    fi
else
    echo -e "  ${YELLOW}⚠️  Could not find ACR mapper in Terraform state${NC}"
fi
cd - > /dev/null

# Summary and Recommendation
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}   Summary & Recommendation${NC}"
echo -e "${BLUE}========================================${NC}\n"

if [ "$CUSTOM_SPI_DEPLOYED" = true ] && [ "$TERRAFORM_USES_CUSTOM" = false ]; then
    echo -e "${YELLOW}⚠️  CONFIGURATION MISMATCH DETECTED${NC}\n"
    echo -e "   ${RED}Problem:${NC}"
    echo -e "   • Custom SPI is deployed to Keycloak"
    echo -e "   • BUT Terraform is configured to use standard Keycloak authenticator"
    echo -e "   • This means the custom SPI is NOT being used\n"
    
    echo -e "   ${GREEN}Recommendation:${NC}"
    echo -e "   ${GREEN}Choose ONE approach:${NC}\n"
    
    echo -e "   ${BLUE}Option 1: Remove Custom SPI (Simplify)${NC}"
    echo -e "   docker exec dive-v3-keycloak rm -f /opt/keycloak/providers/dive-keycloak-spi.jar"
    echo -e "   docker restart dive-v3-keycloak"
    echo -e "   ${GREEN}→ Keep current Terraform config (already using standard authenticator)${NC}\n"
    
    echo -e "   ${BLUE}Option 2: Activate Custom SPI${NC}"
    echo -e "   Edit: terraform/modules/realm-mfa/direct-grant.tf (line 77)"
    echo -e "   Change: authenticator = \"direct-grant-validate-otp\""
    echo -e "   To:     authenticator = \"direct-grant-otp-setup\""
    echo -e "   Then:   cd terraform && terraform apply"
    echo -e "   ${YELLOW}→ Update frontend to handle OTP enrollment UI${NC}\n"
    
elif [ "$CUSTOM_SPI_DEPLOYED" = true ] && [ "$TERRAFORM_USES_CUSTOM" = true ]; then
    echo -e "${GREEN}✅ CONFIGURATION CONSISTENT${NC}\n"
    echo -e "   • Custom SPI is deployed"
    echo -e "   • Terraform is configured to use custom SPI"
    echo -e "   • ${GREEN}Your setup is using the custom OTP enrollment flow${NC}\n"
    
    echo -e "   ${BLUE}Next Steps:${NC}"
    echo -e "   1. Verify frontend handles mfaSetupRequired response"
    echo -e "   2. Test OTP enrollment for new users"
    echo -e "   3. Verify ACR/AMR claims in tokens after MFA login\n"
    
elif [ "$CUSTOM_SPI_DEPLOYED" = false ] && [ "$TERRAFORM_USES_CUSTOM" = false ]; then
    echo -e "${GREEN}✅ CONFIGURATION CONSISTENT (Standard Keycloak)${NC}\n"
    echo -e "   • No custom SPI deployed"
    echo -e "   • Terraform uses standard Keycloak authenticators"
    echo -e "   • ${GREEN}Your setup is using built-in Keycloak OTP validation${NC}\n"
    
    echo -e "   ${BLUE}Next Steps:${NC}"
    echo -e "   1. Verify users can enroll OTP via Keycloak account page"
    echo -e "   2. Test OTP validation during login"
    echo -e "   3. Consider archiving unused custom SPI code:\n"
    echo -e "      mkdir -p archive/custom-spi-\$(date +%Y%m%d)"
    echo -e "      mv keycloak/extensions archive/custom-spi-\$(date +%Y%m%d)/"
    echo -e "      mv CUSTOM-SPI-*.md archive/custom-spi-\$(date +%Y%m%d)/\n"
    
elif [ "$CUSTOM_SPI_DEPLOYED" = false ] && [ "$TERRAFORM_USES_CUSTOM" = true ]; then
    echo -e "${RED}❌ CONFIGURATION ERROR${NC}\n"
    echo -e "   ${RED}Problem:${NC}"
    echo -e "   • Terraform expects custom SPI 'direct-grant-otp-setup'"
    echo -e "   • BUT custom SPI is NOT deployed to Keycloak"
    echo -e "   • ${RED}Authentication will FAIL${NC}\n"
    
    echo -e "   ${GREEN}Fix:${NC}"
    echo -e "   ${BLUE}Option 1: Deploy Custom SPI${NC}"
    echo -e "   cd keycloak/extensions"
    echo -e "   mvn clean package"
    echo -e "   docker cp target/dive-keycloak-extensions.jar dive-v3-keycloak:/opt/keycloak/providers/dive-keycloak-spi.jar"
    echo -e "   docker restart dive-v3-keycloak\n"
    
    echo -e "   ${BLUE}Option 2: Update Terraform to Use Standard Authenticator${NC}"
    echo -e "   Edit: terraform/modules/realm-mfa/direct-grant.tf (line 77)"
    echo -e "   Change: authenticator = \"direct-grant-otp-setup\""
    echo -e "   To:     authenticator = \"direct-grant-validate-otp\""
    echo -e "   Then:   cd terraform && terraform apply\n"
    
else
    echo -e "${YELLOW}⚠️  Could not determine configuration status${NC}"
    echo -e "   Please review the diagnostic output above manually\n"
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Additional Resources${NC}"
echo -e "${BLUE}========================================${NC}\n"
echo -e "   📚 Full Guide: KEYCLOAK-SIMPLIFICATION-GUIDE.md"
echo -e "   📚 Keycloak 26 Migration: KEYCLOAK-26-README.md"
echo -e "   📚 Custom SPI Docs: CUSTOM-SPI-COMPLETE.md\n"

echo -e "${GREEN}Diagnostic complete!${NC}\n"

