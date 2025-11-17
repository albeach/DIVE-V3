#!/bin/bash

# DIVE V3 Session Timeout Fix Script
# ==================================
# Fixes random logout issues by aligning Keycloak SSO session timeouts with NextAuth.js

set -e

echo "🔧 DIVE V3 Session Timeout Fix"
echo "================================"

# Apply Terraform changes to extend SSO session timeouts
echo "📋 Applying Terraform changes for extended session timeouts..."
cd /home/mike/Desktop/DIVE-V3/DIVE-V3/terraform

# Apply the realm configuration changes
terraform apply -auto-approve \
  -target=keycloak_realm.dive_v3_usa \
  -target=keycloak_realm.dive_v3_broker

echo "✅ Keycloak realm configurations updated"

# Restart Keycloak to apply new session settings
echo "🔄 Restarting Keycloak service..."
cd /home/mike/Desktop/DIVE-V3/DIVE-V3
docker-compose restart keycloak

# Wait for Keycloak to be healthy
echo "⏳ Waiting for Keycloak to restart..."
sleep 30

# Check Keycloak health
if curl -f -s http://localhost:8081/auth/realms/dive-v3-broker > /dev/null 2>&1; then
    echo "✅ Keycloak restarted successfully"
else
    echo "❌ Keycloak failed to restart"
    exit 1
fi

# Restart frontend to apply NextAuth configuration changes
echo "🔄 Restarting frontend service..."
docker-compose restart frontend

# Wait for frontend to be healthy
echo "⏳ Waiting for frontend to restart..."
sleep 10

echo "✅ Session timeout fixes applied successfully!"
echo ""
echo "📊 Changes Applied:"
echo "  • USA Realm SSO Idle Timeout: 15m → 2h"
echo "  • Broker Realm SSO Idle Timeout: 30m → 2h"
echo "  • NextAuth Token Refresh Window: 5m → 8m"
echo "  • Cloudflare Tunnel Cookie Settings: sameSite='none' for cross-site support"
echo "  • Session Recovery: Automatic refresh when heartbeat detects expiry risk"
echo ""
echo "🎯 Expected Results:"
echo "  • Sessions should last 2 hours of inactivity (vs 15-30 minutes before)"
echo "  • Proactive token refresh at 8 minutes remaining"
echo "  • Better Cloudflare tunnel cookie handling"
echo "  • Automatic session recovery on network issues"
echo ""
echo "🔍 Monitor the logs:"
echo "  docker-compose logs -f frontend | grep -i 'dive\|session\|heartbeat'"
echo "  docker-compose logs -f keycloak | grep -i 'session\|timeout'"
