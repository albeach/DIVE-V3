#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 Phase 2 Migration Script
# =============================================================================
# Applies database schema changes for Phase 2 orchestration improvements
# Safe to run multiple times (idempotent)
# =============================================================================

set -e

# Ensure DIVE_ROOT is set
if [ -z "$DIVE_ROOT" ]; then
    DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    export DIVE_ROOT
fi

# Load common functions
source "${DIVE_ROOT}/scripts/dive-modules/common.sh"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}${BOLD} DIVE V3 Phase 2 Migration${NC}"
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check prerequisites
log_step "Checking prerequisites..."

# 1. Docker running
if ! docker info >/dev/null 2>&1; then
    log_error "Docker is not running"
    exit 1
fi

# 2. Hub PostgreSQL running
if ! docker ps --format '{{.Names}}' | grep -q "^dive-hub-postgres$"; then
    log_error "Hub PostgreSQL is not running"
    log_error "Start Hub first: ./dive hub up"
    exit 1
fi

# 3. Orchestration database exists
if ! docker exec dive-hub-postgres psql -U postgres -lqt | cut -d \| -f 1 | grep -qw orchestration; then
    log_warn "Orchestration database does not exist, creating..."
    docker exec dive-hub-postgres psql -U postgres -c "CREATE DATABASE orchestration;" >/dev/null 2>&1 || true
fi

log_success "Prerequisites checked"

# Backup database
log_step "Creating database backup..."
backup_file="${DIVE_ROOT}/backups/orchestration-pre-phase2-$(date +%Y%m%d-%H%M%S).sql"
mkdir -p "${DIVE_ROOT}/backups"

docker exec dive-hub-postgres pg_dump -U postgres -d orchestration > "$backup_file" 2>/dev/null || {
    log_warn "Backup failed (database may be empty)"
}

if [ -f "$backup_file" ] && [ -s "$backup_file" ]; then
    log_success "Backup created: $backup_file"
else
    log_info "No backup needed (database is empty or new)"
fi

# Apply migration
log_step "Applying Phase 2 database schema..."

migration_file="${DIVE_ROOT}/scripts/migrations/001_orchestration_state_db.sql"

if [ ! -f "$migration_file" ]; then
    log_error "Migration file not found: $migration_file"
    exit 1
fi

# Copy migration to container
docker cp "$migration_file" dive-hub-postgres:/tmp/migration.sql

# Apply migration
if docker exec dive-hub-postgres psql -U postgres -d orchestration -f /tmp/migration.sql >/dev/null 2>&1; then
    log_success "Database schema migration applied"
else
    log_error "Migration failed"
    log_error "Check database logs: docker logs dive-hub-postgres"
    exit 1
fi

# Verify migration
log_step "Verifying migration..."

# Check deployment_locks table exists
if docker exec dive-hub-postgres psql -U postgres -d orchestration \
    -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'deployment_locks';" | grep -q "1"; then
    log_success "✅ deployment_locks table created"
else
    log_error "❌ deployment_locks table not found"
    exit 1
fi

# Check indexes created
local index_count=$(docker exec dive-hub-postgres psql -U postgres -d orchestration \
    -tAc "SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'deployment_locks';" | xargs)

if [ "$index_count" -ge 2 ]; then
    log_success "✅ deployment_locks indexes created ($index_count indexes)"
else
    log_warn "⚠️  Only $index_count indexes found for deployment_locks"
fi

# Verify all expected tables
log_step "Verifying all tables..."
local expected_tables=(
    "deployment_states"
    "state_transitions"
    "deployment_steps"
    "deployment_locks"
    "circuit_breakers"
    "orchestration_errors"
    "orchestration_metrics"
    "checkpoints"
)

local missing_tables=0
for table in "${expected_tables[@]}"; do
    if docker exec dive-hub-postgres psql -U postgres -d orchestration \
        -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = '$table';" | grep -q "1"; then
        log_verbose "  ✓ $table"
    else
        log_error "  ✗ $table (MISSING)"
        ((missing_tables++))
    fi
done

if [ "$missing_tables" -gt 0 ]; then
    log_error "$missing_tables tables missing - migration may be incomplete"
    exit 1
fi

log_success "All tables verified (${#expected_tables[@]}/${#expected_tables[@]})"

# Test basic lock operations
log_step "Testing deployment lock operations..."

source "${DIVE_ROOT}/scripts/dive-modules/orchestration-framework.sh"
source "${DIVE_ROOT}/scripts/dive-modules/orchestration-state-db.sh"

if orch_acquire_deployment_lock "test" 5; then
    log_success "✅ Lock acquisition works"

    if orch_release_deployment_lock "test"; then
        log_success "✅ Lock release works"
    else
        log_error "❌ Lock release failed"
        exit 1
    fi
else
    log_error "❌ Lock acquisition failed"
    exit 1
fi

# Final summary
echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD} Phase 2 Migration Complete!${NC}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo "Migration Summary:"
echo "  ✅ Database schema updated"
echo "  ✅ deployment_locks table created"
echo "  ✅ Indexes created"
echo "  ✅ Lock operations tested"
echo ""

if [ -f "$backup_file" ] && [ -s "$backup_file" ]; then
    echo "Backup saved to: $backup_file"
    echo ""
fi

echo "Next steps:"
echo "  1. Run integration tests: ./tests/orchestration/integration/test-phase2-fixes.sh"
echo "  2. Test deployment: ./dive spoke deploy TST"
echo "  3. Monitor error analytics: source scripts/dive-modules/error-analytics.sh && generate_error_analytics 1"
echo ""

log_success "Migration successful!"
