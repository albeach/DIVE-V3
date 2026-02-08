#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Orchestration Database Integration Test
# =============================================================================
# Validates database backend integration with orchestration framework
# =============================================================================

set -eo pipefail  # Remove -u to allow unbound variables in sourced modules

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export DIVE_ROOT

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  DIVE V3 Orchestration Database Integration Test${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Load orchestration modules
source "${DIVE_ROOT}/scripts/dive-modules/common.sh"
source "${DIVE_ROOT}/scripts/dive-modules/deployment-state.sh"
source "${DIVE_ROOT}/scripts/dive-modules/orchestration/state.sh"

# Enable database backend
export ORCH_DB_ENABLED=true
export ORCH_DB_DUAL_WRITE=true
export ORCH_DB_SOURCE_OF_TRUTH=file

TEST_INSTANCE="tst"
PASSED=0
FAILED=0

test_case() {
    local name="$1"
    local command="$2"

    echo -n "Testing: $name ... "

    if eval "$command" >/dev/null 2>&1; then
        echo -e "${GREEN}PASS${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}FAIL${NC}"
        ((FAILED++))
        return 1
    fi
}

echo "1. Database Connection Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_case "Database connection available" \
    "orch_db_check_connection"

test_case "Can execute SQL query" \
    "orch_db_exec 'SELECT 1;' | grep -q '1'"

test_case "Can execute JSON query" \
    "orch_db_exec_json 'SELECT 1 as test;' | jq -e '.[0].test == 1' >/dev/null"

echo ""
echo "2. State Management Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_case "Set deployment state writes to database" \
    "orch_db_set_state '$TEST_INSTANCE' 'DEPLOYING' 'Test deployment' && \
     docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c \"SELECT state FROM deployment_states WHERE instance_code = '$TEST_INSTANCE' ORDER BY timestamp DESC LIMIT 1;\" | grep -q 'DEPLOYING'"

test_case "Get deployment state returns correct value" \
    "[ \"\$(orch_db_get_state '$TEST_INSTANCE')\" = 'DEPLOYING' ]"

test_case "State transition recorded in audit log" \
    "docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c \"SELECT COUNT(*) FROM state_transitions WHERE instance_code = '$TEST_INSTANCE' AND to_state = 'DEPLOYING';\" | grep -q '1'"

test_case "Record deployment step creates entry" \
    "orch_db_record_step '$TEST_INSTANCE' 'test_step' 'COMPLETED' && \
     docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c \"SELECT status FROM deployment_steps WHERE instance_code = '$TEST_INSTANCE' AND step_name = 'test_step';\" | grep -q 'COMPLETED'"

echo ""
echo "3. Circuit Breaker Persistence Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_case "Update circuit breaker state" \
    "orch_db_update_circuit_breaker 'test_operation' 'OPEN' 3 0 && \
     docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c \"SELECT state FROM circuit_breakers WHERE operation_name = 'test_operation';\" | grep -q 'OPEN'"

test_case "Get circuit breaker state" \
    "[ \"\$(orch_db_get_circuit_state 'test_operation')\" = 'OPEN' ]"

echo ""
echo "4. Error Recording Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_case "Record orchestration error" \
    "orch_db_record_error '$TEST_INSTANCE' 'TEST_ERROR' 2 'test_component' 'Test error message' 'Fix by doing X' && \
     docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c \"SELECT COUNT(*) FROM orchestration_errors WHERE instance_code = '$TEST_INSTANCE' AND error_code = 'TEST_ERROR';\" | grep -q '1'"

test_case "Get unresolved errors count" \
    "count=\$(orch_db_get_unresolved_errors '$TEST_INSTANCE' 2) && [ \$count -ge 0 ]"

echo ""
echo "5. Metrics Recording Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_case "Record orchestration metric" \
    "orch_db_record_metric '$TEST_INSTANCE' 'deployment_duration' 120 'seconds' && \
     docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c \"SELECT COUNT(*) FROM orchestration_metrics WHERE instance_code = '$TEST_INSTANCE' AND metric_name = 'deployment_duration';\" | grep -q '1'"

echo ""
echo "6. Checkpoint Management Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_case "Register checkpoint in database" \
    "orch_db_register_checkpoint 'test_checkpoint_001' '$TEST_INSTANCE' 'COMPLETE' '/tmp/checkpoint' 'Test checkpoint' && \
     docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c \"SELECT checkpoint_id FROM checkpoints WHERE checkpoint_id = 'test_checkpoint_001';\" | grep -q 'test_checkpoint_001'"

test_case "Get latest checkpoint" \
    "latest=\$(orch_db_get_latest_checkpoint '$TEST_INSTANCE') && [ -n \"\$latest\" ]"

echo ""
echo "7. Query Function Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_case "Get state history (JSON)" \
    "history=\$(orch_db_get_state_history '$TEST_INSTANCE' 5) && echo \"\$history\" | jq -e 'type == \"array\"' >/dev/null"

test_case "Database helper function get_current_state" \
    "docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c \"SELECT get_current_state('$TEST_INSTANCE');\" | grep -q 'DEPLOYING'"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}Test Results:${NC}"
echo "  Total Tests: $((PASSED + FAILED))"
echo -e "  ${GREEN}Passed: $PASSED${NC}"
echo -e "  ${RED}Failed: $FAILED${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Cleanup test data
echo "Cleaning up test data..."
docker exec dive-hub-postgres psql -U postgres -d orchestration -c "DELETE FROM deployment_states WHERE instance_code = '$TEST_INSTANCE';" >/dev/null 2>&1
docker exec dive-hub-postgres psql -U postgres -d orchestration -c "DELETE FROM state_transitions WHERE instance_code = '$TEST_INSTANCE';" >/dev/null 2>&1
docker exec dive-hub-postgres psql -U postgres -d orchestration -c "DELETE FROM deployment_steps WHERE instance_code = '$TEST_INSTANCE';" >/dev/null 2>&1
docker exec dive-hub-postgres psql -U postgres -d orchestration -c "DELETE FROM orchestration_errors WHERE instance_code = '$TEST_INSTANCE';" >/dev/null 2>&1
docker exec dive-hub-postgres psql -U postgres -d orchestration -c "DELETE FROM orchestration_metrics WHERE instance_code = '$TEST_INSTANCE';" >/dev/null 2>&1
docker exec dive-hub-postgres psql -U postgres -d orchestration -c "DELETE FROM checkpoints WHERE instance_code = '$TEST_INSTANCE';" >/dev/null 2>&1
docker exec dive-hub-postgres psql -U postgres -d orchestration -c "DELETE FROM circuit_breakers WHERE operation_name LIKE 'test_%';" >/dev/null 2>&1

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All integration tests PASSED!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Run unit tests: bash tests/unit/orchestration-framework.test.sh"
    echo "  2. Enable database backend in production: export ORCH_DB_ENABLED=true"
    echo "  3. Deploy hub with database logging: ./dive hub deploy"
    exit 0
else
    echo -e "${RED}❌ Some tests FAILED. Please review errors above.${NC}"
    exit 1
fi
