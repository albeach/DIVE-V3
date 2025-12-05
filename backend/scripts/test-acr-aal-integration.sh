#!/bin/bash
#
# ACR/AAL Integration Test Runner
# 
# This script runs integration tests to verify that users receive correct ACR/AAL
# based on clearance level by authenticating with real Keycloak instances.
#
# Usage:
#   ./scripts/test-acr-aal-integration.sh
#
# Environment Variables:
#   KEYCLOAK_URL_USA - USA Keycloak URL (default: https://usa-idp.dive25.com)
#   KEYCLOAK_URL_FRA - FRA Keycloak URL (default: https://fra-idp.dive25.com)
#   KEYCLOAK_URL_DEU - DEU Keycloak URL (default: https://deu-idp.dive25.com)
#   TEST_USER_PASSWORD - Test user password (default: TestUser2025!Pilot)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🔐 ACR/AAL Integration Verification Test"
echo "========================================"
echo ""
echo "This test will authenticate real users across Keycloak instances:"
echo "  - testuser-usa-3 (SECRET) → Should get AAL2"
echo "  - testuser-fra-2 (CONFIDENTIAL) → Should get AAL2"
echo "  - testuser-deu-4 (TOP_SECRET) → Should get AAL3"
echo ""
echo "Password: ${TEST_USER_PASSWORD:-TestUser2025!Pilot}"
echo ""

# Check if Keycloak URLs are set
if [ -z "$KEYCLOAK_URL_USA" ] && [ -z "$KEYCLOAK_URL_FRA" ] && [ -z "$KEYCLOAK_URL_DEU" ]; then
    echo "⚠️  Warning: No Keycloak URLs specified. Using defaults:"
    echo "   USA: https://usa-idp.dive25.com"
    echo "   FRA: https://fra-idp.dive25.com"
    echo "   DEU: https://deu-idp.dive25.com"
    echo ""
fi

# Run the integration test
cd "$BACKEND_DIR"

echo "Running integration tests..."
echo ""

RUN_INTEGRATION_TESTS=true npm test -- acr-aal-integration-verification.test.ts

echo ""
echo "✅ Integration test complete!"





