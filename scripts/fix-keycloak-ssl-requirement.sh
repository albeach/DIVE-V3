#!/bin/bash

###############################################################################
# Fix Keycloak SSL Requirement - Proper Solution
#
# After PostgreSQL volume recreation, master realm requires HTTPS
# This script disables SSL requirement so Terraform can authenticate
###############################################################################

set -e

echo "🔧 Fixing Keycloak Master Realm SSL Requirement"
echo "=============================================="
echo ""

# Wait for Keycloak to be fully started
echo "⏳ Waiting for Keycloak to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:8081/health/ready > /dev/null 2>&1; then
        echo "✅ Keycloak is ready"
        break
    fi
    echo "Waiting... ($i/30)"
    sleep 2
done

# Use Keycloak Admin Console API via curl with basic auth
echo "🔑 Updating master realm SSL requirement..."

# Get current master realm config
MASTER_REALM=$(curl -s -X GET "http://localhost:8081/admin/realms/master" \
  -u "admin:admin" \
  -H "Content-Type: application/json" 2>/dev/null)

if echo "$MASTER_REALM" | grep -q "realm"; then
    echo "✅ Successfully accessed master realm with basic auth"
    
    # Update SSL requirement to NONE
    echo "$MASTER_REALM" | jq '.sslRequired = "none"' > /tmp/master-realm.json
    
    curl -X PUT "http://localhost:8081/admin/realms/master" \
      -u "admin:admin" \
      -H "Content-Type: application/json" \
      -d @/tmp/master-realm.json \
      2>/dev/null
    
    echo "✅ Master realm updated - SSL requirement disabled"
    rm -f /tmp/master-realm.json
else
    echo "❌ Failed to access master realm"
    echo "Keycloak may still be initializing. Wait 60 seconds and try again."
    exit 1
fi

echo ""
echo "🧪 Testing Terraform authentication..."
TOKEN=$(curl -s -X POST http://localhost:8081/realms/master/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin&grant_type=password&client_id=admin-cli" | jq -r '.access_token' 2>/dev/null)

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    echo "✅ Successfully got admin token!"
    echo "Token: ${TOKEN:0:50}..."
    echo ""
    echo "🎉 Keycloak is now ready for Terraform!"
    echo ""
    echo "Next step:"
    echo "  cd terraform && terraform apply -auto-approve"
else
    echo "❌ Still can't get token"
    echo "Response was: $TOKEN"
    exit 1
fi

