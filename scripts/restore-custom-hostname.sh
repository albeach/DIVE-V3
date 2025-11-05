#!/bin/bash

###############################################################################
# Quick Fix: Restore Custom Hostname After Terraform Apply
# Run this if Terraform overwrote your hostname configuration
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
echo "  Restore Custom Hostname"
echo "========================================"
echo ""

# Get the hostname from environment or docker-compose
if [ -f "docker-compose.hostname.yml" ]; then
    CUSTOM_HOSTNAME=$(grep -A 5 "NEXT_PUBLIC_KEYCLOAK_URL" docker-compose.hostname.yml | grep "NEXT_PUBLIC_KEYCLOAK_URL" | cut -d: -f2- | tr -d ' "' | sed 's/https:\/\///' | cut -d: -f1)
    echo "Found custom hostname configuration: $CUSTOM_HOSTNAME"
elif [ ! -z "$DIVE_HOSTNAME" ]; then
    CUSTOM_HOSTNAME="$DIVE_HOSTNAME"
    echo "Using DIVE_HOSTNAME: $CUSTOM_HOSTNAME"
else
    echo -e "${YELLOW}No custom hostname detected.${NC}"
    echo "Enter your custom hostname (or press Enter to skip):"
    read -p "> " CUSTOM_HOSTNAME
fi

if [ -z "$CUSTOM_HOSTNAME" ] || [ "$CUSTOM_HOSTNAME" == "localhost" ]; then
    echo "No custom hostname configured. Exiting."
    exit 0
fi

echo ""
echo "Restoring hostname configuration for: $CUSTOM_HOSTNAME"
echo ""

# Apply hostname fix script if it exists
if [ -f "scripts/replace-localhost-with-dns.sh" ]; then
    echo "Running hostname replacement script..."
    DIVE_HOSTNAME="$CUSTOM_HOSTNAME" ./scripts/replace-localhost-with-dns.sh
    echo -e "${GREEN}✓${NC} Hostname configuration updated"
else
    echo -e "${YELLOW}⚠️  replace-localhost-with-dns.sh not found${NC}"
    echo "Manually updating terraform.tfvars..."
    
    # Update terraform.tfvars if it exists
    if [ -f "terraform/terraform.tfvars" ]; then
        sed -i.bak "s|https://localhost:8443|https://${CUSTOM_HOSTNAME}:8443|g" terraform/terraform.tfvars
        sed -i.bak "s|http://localhost:3000|https://${CUSTOM_HOSTNAME}:3000|g" terraform/terraform.tfvars
        sed -i.bak "s|http://localhost:4000|https://${CUSTOM_HOSTNAME}:4000|g" terraform/terraform.tfvars
        echo -e "${GREEN}✓${NC} terraform.tfvars updated"
    fi
fi

echo ""
echo "Re-applying Terraform with custom hostname..."
cd terraform

terraform apply -auto-approve

cd ..

echo ""
echo -e "${GREEN}✓ Hostname configuration restored!${NC}"
echo ""
echo "Services should be accessible at:"
echo "  Frontend:  https://${CUSTOM_HOSTNAME}:3000"
echo "  Backend:   https://${CUSTOM_HOSTNAME}:4000"
echo "  Keycloak:  https://${CUSTOM_HOSTNAME}:8443"
echo ""
echo "If issues persist, restart services:"
echo "  docker compose restart"
echo ""

