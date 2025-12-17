#!/bin/bash
# =============================================================================
# DIVE V3 - Load Testing Script
# =============================================================================
# Runs k6 load tests for performance validation
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

# Configuration
BASE_URL="${BASE_URL:-http://localhost:4000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
CLIENT_SECRET="${CLIENT_SECRET:-test-secret}"

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo "❌ k6 is not installed. Please install it first:"
    echo "   macOS: brew install k6"
    echo "   Linux: https://k6.io/docs/getting-started/installation/"
    exit 1
fi

echo "🚀 Starting DIVE V3 Load Tests"
echo "================================"
echo "Base URL: ${BASE_URL}"
echo "Keycloak URL: ${KEYCLOAK_URL}"
echo ""

# Run main load test
echo "📊 Running main load test (100 concurrent users)..."
k6 run \
  --env BASE_URL="${BASE_URL}" \
  --env FRONTEND_URL="${FRONTEND_URL}" \
  --env KEYCLOAK_URL="${KEYCLOAK_URL}" \
  --env CLIENT_SECRET="${CLIENT_SECRET}" \
  "${PROJECT_ROOT}/tests/load/k6-load-test.js"

echo ""
echo "🔐 Running authentication flow load test..."
k6 run \
  --env KEYCLOAK_URL="${KEYCLOAK_URL}" \
  --env CLIENT_SECRET="${CLIENT_SECRET}" \
  "${PROJECT_ROOT}/tests/load/k6-auth-flow-test.js"

echo ""
echo "✅ Load tests complete!"

