#!/bin/bash
# Apply Terraform redirect URI fixes to existing deployment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "====================================="
echo "Applying Terraform Redirect URI Fixes"
echo "====================================="
echo ""

# Get current hostname from docker-compose.hostname.yml if it exists
if [ -f "$PROJECT_ROOT/docker-compose.hostname.yml" ]; then
    CUSTOM_HOSTNAME=$(grep "KC_HOSTNAME:" "$PROJECT_ROOT/docker-compose.hostname.yml" | head -1 | awk '{print $2}' | tr -d '${} ')
    echo "Detected custom hostname: $CUSTOM_HOSTNAME"
else
    CUSTOM_HOSTNAME="localhost"
    echo "No custom hostname found, using localhost"
fi

echo ""
echo "Step 1: Restart Keycloak with updated Admin Console settings..."
docker compose restart keycloak

echo ""
echo "Waiting for Keycloak to start (30 seconds)..."
sleep 30

echo ""
echo "Step 2: Apply Terraform changes for redirect URIs..."
cd "$PROJECT_ROOT/terraform"

# Initialize if needed
if [ ! -d ".terraform" ]; then
    terraform init
fi

# Apply with custom hostname variables
terraform apply \
  -var="keycloak_url=https://${CUSTOM_HOSTNAME}:8443" \
  -var="app_url=https://${CUSTOM_HOSTNAME}:3000" \
  -var="backend_url=https://${CUSTOM_HOSTNAME}:5000" \
  -auto-approve

echo ""
echo "✓ Terraform redirect URIs updated successfully!"
echo ""
echo "Changes applied:"
echo "  1. All realm redirect URIs now use: https://${CUSTOM_HOSTNAME}:8443"
echo "  2. Frontend redirect URIs now use: https://${CUSTOM_HOSTNAME}:3000"
echo "  3. Keycloak Admin Console locked to: https://${CUSTOM_HOSTNAME}:8443"
echo ""
echo "No need to restart services - changes are live!"
echo ""
echo "Test your changes:"
echo "  1. Access Admin Console: https://${CUSTOM_HOSTNAME}:8443/admin"
echo "  2. Verify it stays on ${CUSTOM_HOSTNAME} (no localhost rollback)"
echo "  3. Test login flow: https://${CUSTOM_HOSTNAME}:3000"
echo ""

