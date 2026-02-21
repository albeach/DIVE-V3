#!/bin/bash
#==============================================================================
# Run Federation E2E Integration Tests
#==============================================================================
# Tests full federation pipeline across Hub and Spoke instances.
# Validates attribute mapping, protocol mappers, IdP configuration, and ACR/AMR.
#
# Usage:
#   ./run-federation-tests.sh              # Test all available instances
#   ./run-federation-tests.sh --hub-only   # Test only Hub configuration
#   ./run-federation-tests.sh --spoke gbr  # Test specific spoke
#==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${SCRIPT_DIR}/../.."
PROJECT_ROOT="${SCRIPT_DIR}/../../.."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

#==============================================================================
# Check if instance is running
#==============================================================================
check_instance() {
    local container_name=$1
    local port=$2

    # Check if container is running and healthy
    if docker ps | grep -q "$container_name.*healthy"; then
        return 0
    fi
    return 1
}

#==============================================================================
# Get password from GCP Secret Manager
#==============================================================================
get_gcp_password() {
    local secret_name=$1

    if command -v gcloud &> /dev/null; then
        gcloud secrets versions access latest --secret="$secret_name" --project=dive25 2>/dev/null || echo ""
    else
        echo ""
    fi
}

#==============================================================================
# Get password from Docker container environment
#==============================================================================
get_docker_password() {
    local container_name=$1

    if docker ps | grep -q "$container_name"; then
        docker exec "$container_name" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null || echo ""
    else
        echo ""
    fi
}

#==============================================================================
# Setup environment variables
#==============================================================================
log_info "Setting up test environment..."

# Hub configuration
export KEYCLOAK_HUB_URL="https://localhost:8443"
if check_instance "dive-hub-keycloak" "8443"; then
    log_info "✅ Hub Keycloak is running"
    KEYCLOAK_ADMIN_PASSWORD=$(get_docker_password "dive-hub-keycloak")
    if [ -z "$KEYCLOAK_ADMIN_PASSWORD" ]; then
        KEYCLOAK_ADMIN_PASSWORD=$(get_gcp_password "dive-v3-keycloak-admin-password-usa")
    fi
    export KEYCLOAK_ADMIN_PASSWORD
    log_info "   Hub admin password: ${KEYCLOAK_ADMIN_PASSWORD:0:3}***"
else
    log_error "❌ Hub Keycloak is not running"
    log_error "   Start with: ./dive hub deploy"
    exit 1
fi

# GBR Spoke configuration
export KEYCLOAK_GBR_URL="https://localhost:8474"
if check_instance "dive-spoke-gbr-keycloak" "8474"; then
    log_info "✅ GBR Spoke is running"
    KEYCLOAK_GBR_PASSWORD=$(get_docker_password "dive-spoke-gbr-keycloak")
    if [ -z "$KEYCLOAK_GBR_PASSWORD" ]; then
        KEYCLOAK_GBR_PASSWORD=$(get_gcp_password "dive-v3-keycloak-admin-password-gbr")
    fi
    export KEYCLOAK_GBR_PASSWORD
    log_info "   GBR admin password: ${KEYCLOAK_GBR_PASSWORD:0:3}***"
else
    log_warn "⚠️  GBR Spoke is not running"
    log_warn "   Start with: ./dive spoke deploy gbr"
    log_warn "   Tests will skip GBR-specific validation"
fi

# FRA Spoke configuration
export KEYCLOAK_FRA_URL="https://localhost:8451"
if check_instance "dive-spoke-fra-keycloak" "8451"; then
    log_info "✅ FRA Spoke is running"
    KEYCLOAK_FRA_PASSWORD=$(get_docker_password "dive-spoke-fra-keycloak")
    if [ -z "$KEYCLOAK_FRA_PASSWORD" ]; then
        KEYCLOAK_FRA_PASSWORD=$(get_gcp_password "dive-v3-keycloak-admin-password-fra")
    fi
    export KEYCLOAK_FRA_PASSWORD
    log_info "   FRA admin password: ${KEYCLOAK_FRA_PASSWORD:0:3}***"
else
    log_warn "⚠️  FRA Spoke is not running"
    log_warn "   Start with: ./dive spoke deploy fra"
    log_warn "   Tests will skip FRA-specific validation"
fi

#==============================================================================
# Run tests
#==============================================================================
log_info ""
log_info "Running Federation E2E Integration Tests..."
log_info "============================================="

cd "$BACKEND_DIR"

# Run the federation E2E tests
npx jest \
    --config=jest.config.integration.js \
    --testPathPattern=federation-e2e \
    --verbose \
    "$@"

TEST_EXIT_CODE=$?

#==============================================================================
# Summary
#==============================================================================
echo ""
if [ $TEST_EXIT_CODE -eq 0 ]; then
    log_info "✅ All federation tests passed!"
else
    log_error "❌ Some federation tests failed (exit code: $TEST_EXIT_CODE)"
fi

exit $TEST_EXIT_CODE
