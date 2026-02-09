#!/usr/bin/env bash
# Quick test of database workflow

set -eo pipefail

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export DIVE_ROOT

source "${DIVE_ROOT}/scripts/dive-modules/common.sh"
source "${DIVE_ROOT}/scripts/dive-modules/orchestration/state.sh"

export ORCH_DB_ENABLED=true
export ORCH_DB_DUAL_WRITE=true

echo "Testing complete deployment workflow..."

# Simulate hub deployment states
orch_db_set_state "usa" "INITIALIZING" "Hub deployment started" null
orch_db_record_step "usa" "hub_init" "COMPLETED"

orch_db_set_state "usa" "DEPLOYING" "Starting services" null
orch_db_record_step "usa" "hub_services" "COMPLETED"

orch_db_set_state "usa" "CONFIGURING" "Applying configuration" null
orch_db_record_step "usa" "hub_terraform" "COMPLETED"

orch_db_set_state "usa" "COMPLETE" "Deployment successful" '{"duration":135,"services":11}'
orch_db_record_metric "usa" "deployment_duration" 135 "seconds"
orch_db_record_metric "usa" "service_count" 11 "containers"

echo "✅ Workflow complete"
echo ""
echo "View results:"
echo "  docker exec dive-hub-postgres psql -U postgres -d orchestration -c \\"
echo "    \"SELECT * FROM deployment_states WHERE instance_code = 'usa' ORDER BY timestamp DESC;\""
