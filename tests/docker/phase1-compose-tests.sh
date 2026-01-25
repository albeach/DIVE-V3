#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Phase 1 Compose Consolidation Tests
# =============================================================================
# Tests for compose file consolidation and drift elimination
# Run: ./tests/docker/phase1-compose-tests.sh
# =============================================================================

# Don't use set -e since we test exit codes explicitly

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

passed=0
failed=0

test_result() {
    local name="$1"
    local result="$2"
    if [ "$result" -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $name"
        ((passed++))
    else
        echo -e "${RED}✗${NC} $name"
        ((failed++))
    fi
}

echo ""
echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║           DIVE V3 Phase 1: Compose Consolidation Tests                 ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""

cd "$DIVE_ROOT"

# =============================================================================
# Test 1: Base services file exists
# =============================================================================
echo "=== Base Services File ==="
test -f "docker/base/services.yml"
test_result "Base services.yml exists" $?

# =============================================================================
# Test 2: Base services has all required service definitions
# =============================================================================
echo ""
echo "=== Service Definitions in Base File ==="

grep -q "postgres-base:" docker/base/services.yml 2>/dev/null
test_result "postgres-base service defined" $?

grep -q "mongodb-base:" docker/base/services.yml 2>/dev/null
test_result "mongodb-base service defined" $?

grep -q "redis-base:" docker/base/services.yml 2>/dev/null
test_result "redis-base service defined" $?

grep -q "keycloak-base:" docker/base/services.yml 2>/dev/null
test_result "keycloak-base service defined" $?

grep -q "backend-base:" docker/base/services.yml 2>/dev/null
test_result "backend-base service defined" $?

grep -q "frontend-base:" docker/base/services.yml 2>/dev/null
test_result "frontend-base service defined" $?

grep -q "opa-base:" docker/base/services.yml 2>/dev/null
test_result "opa-base service defined" $?

grep -q "kas-base:" docker/base/services.yml 2>/dev/null
test_result "kas-base service defined" $?

grep -q "opal-client-base:" docker/base/services.yml 2>/dev/null
test_result "opal-client-base service defined" $?

# =============================================================================
# Test 3: Duplicate compose files archived
# =============================================================================
echo ""
echo "=== Duplicate Files Archived ==="

! test -f "docker/instances/usa/docker-compose.yml"
test_result "docker/instances/usa/docker-compose.yml removed" $?

! test -f "docker/instances/fra/docker-compose.yml"
test_result "docker/instances/fra/docker-compose.yml removed" $?

! test -f "docker/instances/gbr/docker-compose.yml"
test_result "docker/instances/gbr/docker-compose.yml removed" $?

# =============================================================================
# Test 4: Spoke compose files use extends pattern
# =============================================================================
echo ""
echo "=== Extends Pattern in Spokes ==="

for spoke in gbr fra dnk pol; do
    compose_file="instances/${spoke}/docker-compose.yml"
    if [ -f "$compose_file" ]; then
        grep -q "extends:" "$compose_file" 2>/dev/null
        test_result "${spoke^^} uses extends pattern" $?
    else
        test_result "${spoke^^} compose file exists" 1
    fi
done

# =============================================================================
# Test 5: Spoke compose files have project names
# =============================================================================
echo ""
echo "=== Project Names in Spokes ==="

for spoke in gbr fra dnk pol esp ita nor; do
    compose_file="instances/${spoke}/docker-compose.yml"
    if [ -f "$compose_file" ]; then
        grep -q "^name: dive-spoke-${spoke}" "$compose_file" 2>/dev/null
        test_result "${spoke^^} has dive-spoke-${spoke} project name" $?
    fi
done

# =============================================================================
# Test 6: Container naming convention
# =============================================================================
echo ""
echo "=== Container Naming Convention ==="

for spoke in gbr fra dnk; do
    compose_file="instances/${spoke}/docker-compose.yml"
    if [ -f "$compose_file" ]; then
        grep -q "container_name: dive-spoke-${spoke}-" "$compose_file" 2>/dev/null
        test_result "${spoke^^} uses dive-spoke-${spoke}-* naming" $?
    fi
done

# =============================================================================
# Test 7: Compose files validate (syntax check)
# =============================================================================
echo ""
echo "=== Compose File Validation ==="

# Validate base services file
docker compose -f docker/base/services.yml config --quiet 2>/dev/null
test_result "Base services.yml is valid" $?

# Validate a sample spoke
if [ -f "instances/gbr/docker-compose.yml" ]; then
    cd instances/gbr
    docker compose config --quiet 2>/dev/null
    result=$?
    cd "$DIVE_ROOT"
    test_result "GBR compose validates with extends" $result
fi

# =============================================================================
# Test 8: No hardcoded passwords
# =============================================================================
echo ""
echo "=== Security: No Hardcoded Passwords ==="

# Check spokes for hardcoded passwords
security_failed=0
for spoke in gbr fra dnk usa deu; do
    compose_file="instances/${spoke}/docker-compose.yml"
    if [ -f "$compose_file" ]; then
        if grep -E "PASSWORD:.*[a-zA-Z0-9]+" "$compose_file" | grep -v '\${' | grep -vq "PASSWORD:"; then
            # Found hardcoded password
            security_failed=1
        fi
    fi
done

[ $security_failed -eq 0 ]
test_result "No hardcoded passwords in spoke files" $?

# =============================================================================
# Test 9: Shared networks defined
# =============================================================================
echo ""
echo "=== Shared Network Configuration ==="

grep -q "dive-v3-shared-network" instances/gbr/docker-compose.yml 2>/dev/null
test_result "GBR references dive-v3-shared-network" $?

grep -q "external: true" instances/gbr/docker-compose.yml 2>/dev/null
test_result "GBR marks shared network as external" $?

# =============================================================================
# Test 10: Common.sh has enhanced ensure_shared_network
# =============================================================================
echo ""
echo "=== Common.sh Network Enhancement ==="

grep -q 'networks=("dive-v3-shared-network" "shared-network")' scripts/dive-modules/common.sh 2>/dev/null
test_result "ensure_shared_network handles multiple networks" $?

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "════════════════════════════════════════════════════════════════════════"
total=$((passed + failed))
echo -e "Results: ${GREEN}$passed passed${NC}, ${RED}$failed failed${NC} (total: $total)"
echo "════════════════════════════════════════════════════════════════════════"

if [ $failed -gt 0 ]; then
    echo -e "${RED}Phase 1 tests FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}Phase 1 tests PASSED${NC}"
    exit 0
fi
