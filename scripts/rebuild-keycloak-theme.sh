#!/bin/bash
# Quick rebuild and restart Keycloak to apply theme changes

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "========================================="
echo "Rebuilding Keycloak with Updated Theme"
echo "========================================="
echo ""

echo "Step 1: Stopping Keycloak..."
docker compose stop keycloak

echo ""
echo "Step 2: Rebuilding Keycloak image with new theme..."
docker compose build keycloak

echo ""
echo "Step 3: Starting Keycloak..."
docker compose up -d keycloak

echo ""
echo "Step 4: Waiting for Keycloak to start (60 seconds)..."
sleep 60

echo ""
echo "========================================="
echo "✅ Keycloak Rebuilt and Restarted"
echo "========================================="
echo ""
echo "Changes applied:"
echo "  • webauthn-register.ftl (passkey registration fix)"
echo ""
echo "Test passkey registration:"
echo "  1. Login as alice.topsecret (password: Pass123!)"
echo "  2. Passkey registration should now work without rfc4648 error"
echo ""

