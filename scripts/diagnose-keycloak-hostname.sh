#!/bin/bash
# Diagnostic script to check Keycloak hostname configuration

echo "========================================="
echo "Keycloak Hostname Configuration Diagnostic"
echo "========================================="
echo ""

echo "1. Checking running Keycloak container environment..."
if docker ps | grep -q dive-v3-keycloak; then
    echo "   Container Status: RUNNING"
    echo ""
    echo "   Current KC_HOSTNAME settings:"
    docker exec dive-v3-keycloak printenv | grep KC_HOSTNAME | sort
    echo ""
else
    echo "   Container Status: NOT RUNNING"
    echo ""
fi

echo "2. Checking docker-compose configuration..."
cd "$(dirname "$0")/.."
echo "   Merged configuration (what will be used):"
docker compose config 2>/dev/null | grep -A10 "KC_HOSTNAME" | head -15
echo ""

echo "3. Checking for hostname override files..."
if [ -f "docker-compose.hostname.yml" ]; then
    echo "   ✓ docker-compose.hostname.yml EXISTS"
    echo "   Content:"
    grep -A5 "KC_HOSTNAME" docker-compose.hostname.yml
else
    echo "   ✗ docker-compose.hostname.yml NOT FOUND"
    echo "   (This means hostname is set to 'localhost' from docker-compose.yml)"
fi
echo ""

echo "4. Checking Keycloak logs for errors..."
docker compose logs keycloak 2>&1 | grep -E "ERROR|WARNING.*hostname" | tail -10
echo ""

echo "========================================="
echo "Summary"
echo "========================================="
echo ""

# Get current hostname values
KC_HOST=$(docker compose config 2>/dev/null | grep "KC_HOSTNAME:" | head -1 | awk '{print $2}')
KC_ADMIN=$(docker compose config 2>/dev/null | grep "KC_HOSTNAME_ADMIN:" | head -1 | awk '{print $2}')

echo "Current Configuration:"
echo "  KC_HOSTNAME: ${KC_HOST:-"NOT SET"}"
echo "  KC_HOSTNAME_ADMIN: ${KC_ADMIN:-"NOT SET"}"
echo ""

# Check for common issues
if [[ "$KC_HOST" == http* ]] || [[ "$KC_HOST" == *:* ]]; then
    echo "⚠️  WARNING: KC_HOSTNAME contains URL or port - should be hostname only!"
    echo "   Example of correct value: divedeeper.internal"
    echo "   Your current value: $KC_HOST"
fi

if [[ "$KC_ADMIN" == http* ]] || [[ "$KC_ADMIN" == *:* ]]; then
    echo "⚠️  WARNING: KC_HOSTNAME_ADMIN contains URL or port - should be hostname only!"
    echo "   Example of correct value: divedeeper.internal"
    echo "   Your current value: $KC_ADMIN"
fi

if [ -z "$KC_ADMIN" ]; then
    echo "ℹ️  INFO: KC_HOSTNAME_ADMIN not set (this is OK if using default hostname)"
fi

echo ""
echo "To fix hostname issues, run: ./scripts/set-custom-hostname.sh"
echo ""

