#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 - Phase 3 Hub Enhanced Spoke Management Tests
# =============================================================================
# Tests for Hub-Spoke federation management, health aggregation,
# audit log aggregation, and dashboard enhancements.
#
# Run: ./tests/docker/phase3-hub-management.sh
#
# Tests:
#   1. Hub spoke registry service exists and has required methods
#   2. Federation routes implement all required endpoints
#   3. Dashboard spoke status endpoint exists
#   4. Hub init scripts exist and are executable
#   5. Policy sync service has required methods
#   6. Audit ingestion endpoint is implemented
#   7. Health aggregation endpoint is implemented
# =============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0

# Project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Test helpers
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((++PASSED)) || true
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((++FAILED)) || true
}

skip() {
    echo -e "${YELLOW}○${NC} $1 (skipped)"
}

section() {
    echo ""
    echo -e "${CYAN}=== $1 ===${NC}"
}

# =============================================================================
# TESTS
# =============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║           DIVE V3 Phase 3: Hub Enhanced Spoke Management Tests         ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""

cd "$PROJECT_ROOT"

# =============================================================================
# Test Group 1: Hub Spoke Registry Service (DIVE-017)
# =============================================================================
section "Hub Spoke Registry Service (DIVE-017)"

REGISTRY_FILE="backend/src/services/hub-spoke-registry.service.ts"

# Test 1.1: Service file exists
if [[ -f "$REGISTRY_FILE" ]]; then
    pass "hub-spoke-registry.service.ts exists"
else
    fail "hub-spoke-registry.service.ts missing"
fi

# Test 1.2: registerSpoke method exists
if grep -q "async registerSpoke" "$REGISTRY_FILE" 2>/dev/null; then
    pass "registerSpoke method exists"
else
    fail "registerSpoke method missing"
fi

# Test 1.3: approveSpoke method exists
if grep -q "async approveSpoke" "$REGISTRY_FILE" 2>/dev/null; then
    pass "approveSpoke method exists"
else
    fail "approveSpoke method missing"
fi

# Test 1.4: suspendSpoke method exists
if grep -q "async suspendSpoke" "$REGISTRY_FILE" 2>/dev/null; then
    pass "suspendSpoke method exists"
else
    fail "suspendSpoke method missing"
fi

# Test 1.5: revokeSpoke method exists
if grep -q "async revokeSpoke" "$REGISTRY_FILE" 2>/dev/null; then
    pass "revokeSpoke method exists"
else
    fail "revokeSpoke method missing"
fi

# Test 1.6: generateSpokeToken method exists
if grep -q "async generateSpokeToken" "$REGISTRY_FILE" 2>/dev/null; then
    pass "generateSpokeToken method exists"
else
    fail "generateSpokeToken method missing"
fi

# Test 1.7: listAllSpokes method exists
if grep -q "async listAllSpokes" "$REGISTRY_FILE" 2>/dev/null; then
    pass "listAllSpokes method exists"
else
    fail "listAllSpokes method missing"
fi

# Test 1.8: listPendingApprovals method exists
if grep -q "async listPendingApprovals" "$REGISTRY_FILE" 2>/dev/null; then
    pass "listPendingApprovals method exists"
else
    fail "listPendingApprovals method missing"
fi

# =============================================================================
# Test Group 2: Health Aggregation (DIVE-018)
# =============================================================================
section "Health Aggregation (DIVE-018)"

FED_ROUTES_FILE="backend/src/routes/federation.routes.ts"

# Test 2.1: checkSpokeHealth method exists
if grep -q "async checkSpokeHealth" "$REGISTRY_FILE" 2>/dev/null; then
    pass "checkSpokeHealth method exists"
else
    fail "checkSpokeHealth method missing"
fi

# Test 2.2: getUnhealthySpokes method exists
if grep -q "async getUnhealthySpokes" "$REGISTRY_FILE" 2>/dev/null; then
    pass "getUnhealthySpokes method exists"
else
    fail "getUnhealthySpokes method missing"
fi

# Test 2.3: recordHeartbeat method exists
if grep -q "async recordHeartbeat" "$REGISTRY_FILE" 2>/dev/null; then
    pass "recordHeartbeat method exists"
else
    fail "recordHeartbeat method missing"
fi

# Test 2.4: /api/federation/health endpoint exists
if grep -q "router.get('/health'" "$FED_ROUTES_FILE" 2>/dev/null; then
    pass "/api/federation/health endpoint exists"
else
    fail "/api/federation/health endpoint missing"
fi

# Test 2.5: /api/federation/health/spokes endpoint exists
if grep -q "router.get('/health/spokes'" "$FED_ROUTES_FILE" 2>/dev/null; then
    pass "/api/federation/health/spokes endpoint exists"
else
    fail "/api/federation/health/spokes endpoint missing"
fi

# Test 2.6: Health aggregation returns spoke status
if grep -q "spokeHealthStatus" "$FED_ROUTES_FILE" 2>/dev/null; then
    pass "Health aggregation returns detailed spoke status"
else
    fail "Health aggregation missing spoke status details"
fi

# Test 2.7: Health aggregation includes policy sync status
if grep -q "policySyncSummary" "$FED_ROUTES_FILE" 2>/dev/null; then
    pass "Health aggregation includes policy sync summary"
else
    fail "Health aggregation missing policy sync summary"
fi

# =============================================================================
# Test Group 3: Policy Distribution (DIVE-019)
# =============================================================================
section "Policy Distribution (DIVE-019)"

POLICY_SYNC_FILE="backend/src/services/policy-sync.service.ts"

# Test 3.1: policy-sync.service.ts exists
if [[ -f "$POLICY_SYNC_FILE" ]]; then
    pass "policy-sync.service.ts exists"
else
    fail "policy-sync.service.ts missing"
fi

# Test 3.2: /api/federation/policy/push endpoint exists
if grep -q "router.post('/policy/push'" "$FED_ROUTES_FILE" 2>/dev/null; then
    pass "/api/federation/policy/push endpoint exists"
else
    fail "/api/federation/policy/push endpoint missing"
fi

# Test 3.3: /api/federation/policy/bundle endpoint exists
if grep -q "router.get('/policy/bundle'" "$FED_ROUTES_FILE" 2>/dev/null; then
    pass "/api/federation/policy/bundle endpoint exists"
else
    fail "/api/federation/policy/bundle endpoint missing"
fi

# Test 3.4: /api/federation/sync/status endpoint exists
if grep -q "router.get('/sync/status'" "$FED_ROUTES_FILE" 2>/dev/null; then
    pass "/api/federation/sync/status endpoint exists"
else
    fail "/api/federation/sync/status endpoint missing"
fi

# =============================================================================
# Test Group 4: Audit Log Aggregation (DIVE-020)
# =============================================================================
section "Audit Log Aggregation (DIVE-020)"

# Test 4.1: /api/federation/audit/ingest endpoint exists
if grep -q "router.post('/audit/ingest'" "$FED_ROUTES_FILE" 2>/dev/null; then
    pass "/api/federation/audit/ingest endpoint exists"
else
    fail "/api/federation/audit/ingest endpoint missing"
fi

# Test 4.2: /api/federation/audit/aggregated endpoint exists
if grep -q "router.get('/audit/aggregated'" "$FED_ROUTES_FILE" 2>/dev/null; then
    pass "/api/federation/audit/aggregated endpoint exists"
else
    fail "/api/federation/audit/aggregated endpoint missing"
fi

# Test 4.3: /api/federation/audit/statistics endpoint exists
if grep -q "router.get('/audit/statistics'" "$FED_ROUTES_FILE" 2>/dev/null; then
    pass "/api/federation/audit/statistics endpoint exists"
else
    fail "/api/federation/audit/statistics endpoint missing"
fi

# Test 4.4: Audit ingestion validates entries
if grep -q "entries array required" "$FED_ROUTES_FILE" 2>/dev/null; then
    pass "Audit ingestion validates entries"
else
    fail "Audit ingestion missing validation"
fi

# Test 4.5: Spoke audit queue service exists
SPOKE_AUDIT_FILE="backend/src/services/spoke-audit-queue.service.ts"
if [[ -f "$SPOKE_AUDIT_FILE" ]]; then
    pass "spoke-audit-queue.service.ts exists"
else
    fail "spoke-audit-queue.service.ts missing"
fi

# Test 4.6: Spoke audit queue has syncToHub method
if grep -q "async syncToHub" "$SPOKE_AUDIT_FILE" 2>/dev/null; then
    pass "syncToHub method exists in spoke audit queue"
else
    fail "syncToHub method missing"
fi

# =============================================================================
# Test Group 5: Spoke Self-Registration (DIVE-021)
# =============================================================================
section "Spoke Self-Registration (DIVE-021)"

# Test 5.1: /api/federation/register endpoint exists
if grep -q "router.post('/register'" "$FED_ROUTES_FILE" 2>/dev/null; then
    pass "/api/federation/register endpoint exists"
else
    fail "/api/federation/register endpoint missing"
fi

# Test 5.2: Registration schema validation
if grep -q "registrationSchema" "$FED_ROUTES_FILE" 2>/dev/null; then
    pass "Registration schema validation exists"
else
    fail "Registration schema validation missing"
fi

# Test 5.3: Registration status polling endpoint exists
if grep -q "router.get('/registration/:spokeId/status'" "$FED_ROUTES_FILE" 2>/dev/null; then
    pass "/api/federation/registration/:spokeId/status endpoint exists"
else
    fail "Registration status polling endpoint missing"
fi

# Test 5.4: Heartbeat endpoint exists
if grep -q "router.post('/heartbeat'" "$FED_ROUTES_FILE" 2>/dev/null; then
    pass "/api/federation/heartbeat endpoint exists"
else
    fail "/api/federation/heartbeat endpoint missing"
fi

# =============================================================================
# Test Group 6: Hub Dashboard Spokes (DIVE-022)
# =============================================================================
section "Hub Dashboard Spokes (DIVE-022)"

DASHBOARD_FILE="backend/src/routes/dashboard.routes.ts"

# Test 6.1: Dashboard routes file exists
if [[ -f "$DASHBOARD_FILE" ]]; then
    pass "dashboard.routes.ts exists"
else
    fail "dashboard.routes.ts missing"
fi

# Test 6.2: /api/dashboard/spokes endpoint exists
if grep -q "router.get('/spokes'" "$DASHBOARD_FILE" 2>/dev/null; then
    pass "/api/dashboard/spokes endpoint exists"
else
    fail "/api/dashboard/spokes endpoint missing"
fi

# Test 6.3: Dashboard spoke status includes health info
if grep -q "isHealthy" "$DASHBOARD_FILE" 2>/dev/null; then
    pass "Dashboard includes spoke health info"
else
    fail "Dashboard missing spoke health info"
fi

# Test 6.4: Dashboard spoke status includes policy sync
if grep -q "policyStatus" "$DASHBOARD_FILE" 2>/dev/null; then
    pass "Dashboard includes policy sync status"
else
    fail "Dashboard missing policy sync status"
fi

# Test 6.5: Dashboard spoke status includes summary cards
if grep -q "summaryCards" "$DASHBOARD_FILE" 2>/dev/null; then
    pass "Dashboard includes summary cards"
else
    fail "Dashboard missing summary cards"
fi

# =============================================================================
# Test Group 7: Hub Init Scripts (GAP-014)
# =============================================================================
section "Hub Init Scripts (GAP-014)"

HUB_INIT_DIR="scripts/hub-init"

# Test 7.1: hub-init directory exists
if [[ -d "$HUB_INIT_DIR" ]]; then
    pass "scripts/hub-init directory exists"
else
    fail "scripts/hub-init directory missing"
fi

# Test 7.2: init-hub.sh exists and is executable
if [[ -f "$HUB_INIT_DIR/init-hub.sh" ]]; then
    pass "init-hub.sh exists"
    if [[ -x "$HUB_INIT_DIR/init-hub.sh" ]]; then
        pass "init-hub.sh is executable"
    else
        fail "init-hub.sh is not executable"
    fi
else
    fail "init-hub.sh missing"
fi

# Test 7.3: seed-hub-users.sh exists
if [[ -f "$HUB_INIT_DIR/seed-hub-users.sh" ]]; then
    pass "seed-hub-users.sh exists"
else
    fail "seed-hub-users.sh missing"
fi

# Test 7.4: seed-hub-resources.sh exists
if [[ -f "$HUB_INIT_DIR/seed-hub-resources.sh" ]]; then
    pass "seed-hub-resources.sh exists"
else
    fail "seed-hub-resources.sh missing"
fi

# Test 7.5: configure-hub-client.sh exists
if [[ -f "$HUB_INIT_DIR/configure-hub-client.sh" ]]; then
    pass "configure-hub-client.sh exists"
else
    fail "configure-hub-client.sh missing"
fi

# =============================================================================
# Test Group 8: CLI Hub Commands
# =============================================================================
section "CLI Hub Commands"

HUB_MODULE="scripts/dive-modules/hub.sh"

# Test 8.1: hub.sh module exists
if [[ -f "$HUB_MODULE" ]]; then
    pass "scripts/dive-modules/hub.sh exists"
else
    fail "scripts/dive-modules/hub.sh missing"
fi

# Test 8.2: hub_spokes function exists
if grep -q "^hub_spokes\(\)" "$HUB_MODULE" 2>/dev/null; then
    pass "hub_spokes function exists"
else
    fail "hub_spokes function missing"
fi

# Test 8.3: hub_spokes_approve function exists
if grep -q "^hub_spokes_approve\(\)" "$HUB_MODULE" 2>/dev/null; then
    pass "hub_spokes_approve function exists"
else
    fail "hub_spokes_approve function missing"
fi

# Test 8.4: hub_push_policy function exists
if grep -q "^hub_push_policy\(\)" "$HUB_MODULE" 2>/dev/null; then
    pass "hub_push_policy function exists"
else
    fail "hub_push_policy function missing"
fi

# Test 8.5: hub_verify function exists
if grep -q "^hub_verify\(\)" "$HUB_MODULE" 2>/dev/null; then
    pass "hub_verify function exists"
else
    fail "hub_verify function missing"
fi

# =============================================================================
# Test Group 9: Federated Search (DIVE-023)
# =============================================================================
section "Federated Search (DIVE-023)"

# Test 9.1: Federated query routes file exists
FED_QUERY_FILE="backend/src/routes/federated-query.routes.ts"
if [[ -f "$FED_QUERY_FILE" ]]; then
    pass "federated-query.routes.ts exists"
else
    fail "federated-query.routes.ts missing"
fi

# Test 9.2: /api/federation/cross-instance/query endpoint exists
if grep -q "'/cross-instance/query'" "$FED_ROUTES_FILE" 2>/dev/null; then
    pass "/api/federation/cross-instance/query endpoint exists"
else
    fail "/api/federation/cross-instance/query endpoint missing"
fi

# Test 9.3: Cross-instance authorization service exists
CROSS_AUTHZ_FILE="backend/src/services/cross-instance-authz.service.ts"
if [[ -f "$CROSS_AUTHZ_FILE" ]]; then
    pass "cross-instance-authz.service.ts exists"
else
    fail "cross-instance-authz.service.ts missing"
fi

# =============================================================================
# Test Group 10: Cross-Border Resource Discovery (DIVE-024)
# =============================================================================
section "Cross-Border Resource Discovery (DIVE-024)"

# Test 10.1: /api/federation/evaluate-policy endpoint exists
if grep -q "router.post('/evaluate-policy'" "$FED_ROUTES_FILE" 2>/dev/null; then
    pass "/api/federation/evaluate-policy endpoint exists"
else
    fail "/api/federation/evaluate-policy endpoint missing"
fi

# Test 10.2: /api/federation/query-resources endpoint exists
if grep -q "'/query-resources'" "$FED_ROUTES_FILE" 2>/dev/null; then
    pass "/api/federation/query-resources endpoint exists"
else
    fail "/api/federation/query-resources endpoint missing"
fi

# Test 10.3: /api/federation/cross-instance/authorize endpoint exists
if grep -q "'/cross-instance/authorize'" "$FED_ROUTES_FILE" 2>/dev/null; then
    pass "/api/federation/cross-instance/authorize endpoint exists"
else
    fail "/api/federation/cross-instance/authorize endpoint missing"
fi

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo "════════════════════════════════════════════════════════════════════════"
echo -e "Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC} (total: $((PASSED + FAILED)))"
echo "════════════════════════════════════════════════════════════════════════"

if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}Phase 3 Hub Enhanced Spoke Management tests PASSED${NC}"
    exit 0
else
    echo -e "${RED}Phase 3 Hub Enhanced Spoke Management tests FAILED${NC}"
    exit 1
fi

