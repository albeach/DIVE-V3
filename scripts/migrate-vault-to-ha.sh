#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Vault Migration: Single-Node Shamir → HA Transit Auto-Unseal
# =============================================================================
# This script migrates an existing single-node Vault with Shamir unseal to a
# 3-node HA Raft cluster with Transit auto-unseal.
#
# IMPORTANT: This is a one-time, irreversible migration (without snapshot restore).
# A pre-migration Raft snapshot is taken automatically as a safety net.
#
# Prerequisites:
#   - Existing Vault is running and unsealed
#   - .vault-init.txt contains current Shamir unseal keys
#   - docker-compose.hub.yml has been updated with the HA topology
#
# Usage:
#   ./scripts/migrate-vault-to-ha.sh
#   ./scripts/migrate-vault-to-ha.sh --dry-run
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

source "${DIVE_ROOT}/scripts/dive-modules/common.sh"

VAULT_INIT_FILE="${DIVE_ROOT}/.vault-init.txt"
VAULT_TOKEN_FILE="${DIVE_ROOT}/.vault-token"
COMPOSE_FILE="${DIVE_ROOT}/docker-compose.hub.yml"
BACKUP_DIR="${DIVE_ROOT}/backups/vault"
DRY_RUN=false

if [ "${1:-}" = "--dry-run" ]; then
    DRY_RUN=true
    log_info "DRY RUN mode — no changes will be made"
fi

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

step() {
    echo ""
    echo -e "${GREEN}═══ Step $1: $2 ═══${NC}"
}

fail() {
    echo -e "${RED}FAILED: $1${NC}"
    echo ""
    echo "Migration aborted. Your existing Vault data is untouched."
    echo "If data was modified, restore from: ${BACKUP_DIR}/pre-ha-migration.snap"
    exit 1
}

# =============================================================================
# Pre-flight checks
# =============================================================================
step "0" "Pre-flight checks"

# Check init file exists
if [ ! -f "$VAULT_INIT_FILE" ]; then
    fail ".vault-init.txt not found — need Shamir keys for seal migration"
fi

# Check token file exists
if [ ! -f "$VAULT_TOKEN_FILE" ]; then
    fail ".vault-token not found — need root token"
fi

# Load token
VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
export VAULT_TOKEN

# Check Vault CLI available
if ! command -v vault &>/dev/null; then
    fail "vault CLI not found in PATH"
fi

# Set CLI address
VAULT_ADDR="${VAULT_CLI_ADDR:-http://localhost:8200}"
export VAULT_ADDR

# Check current Vault is running and unsealed
log_info "Checking current Vault state..."
if ! vault status >/dev/null 2>&1; then
    status_exit=$?
    if [ "$status_exit" -eq 2 ]; then
        fail "Vault is sealed. Unseal it first with the old keys."
    else
        fail "Vault is not running or not reachable at $VAULT_ADDR"
    fi
fi

if vault status 2>/dev/null | grep -q "Sealed.*true"; then
    fail "Vault is sealed. Unseal it before migrating."
fi

log_success "Current Vault is running and unsealed"

# Verify Shamir keys parse correctly
UNSEAL_KEYS=($(grep 'Unseal Key' "$VAULT_INIT_FILE" | awk '{print $4}'))
if [ ${#UNSEAL_KEYS[@]} -lt 3 ]; then
    fail "Need at least 3 unseal keys in .vault-init.txt, found ${#UNSEAL_KEYS[@]}"
fi
log_success "Found ${#UNSEAL_KEYS[@]} Shamir unseal keys"

if [ "$DRY_RUN" = true ]; then
    echo ""
    echo "DRY RUN complete. All pre-flight checks passed."
    echo "Run without --dry-run to execute the migration."
    exit 0
fi

# =============================================================================
# Step 1: Create pre-migration snapshot
# =============================================================================
step "1" "Creating pre-migration Raft snapshot"

mkdir -p "$BACKUP_DIR"
SNAPSHOT_PATH="${BACKUP_DIR}/pre-ha-migration.snap"

vault operator raft snapshot save "$SNAPSHOT_PATH"
SNAP_SIZE=$(wc -c < "$SNAPSHOT_PATH" | tr -d ' ')
log_success "Snapshot saved: $SNAPSHOT_PATH (${SNAP_SIZE} bytes)"

# =============================================================================
# Step 2: Stop all hub services
# =============================================================================
step "2" "Stopping hub services"

log_info "Stopping all services except volumes..."
docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true
log_success "All hub services stopped"

# =============================================================================
# Step 3: Start seal vault and wait for Transit readiness
# =============================================================================
step "3" "Starting seal vault (Transit engine)"

docker compose -f "$COMPOSE_FILE" up -d vault-seal

log_info "Waiting for seal vault to become healthy..."
attempt=0
max_attempts=${DIVE_TIMEOUT_VAULT_SEAL_READY:-30}
while [ $attempt -lt $max_attempts ]; do
    if docker compose -f "$COMPOSE_FILE" ps vault-seal 2>/dev/null | grep -q "healthy"; then
        break
    fi
    attempt=$((attempt + 1))
    sleep 1
done

if [ $attempt -ge $max_attempts ]; then
    fail "Seal vault did not become healthy within ${max_attempts}s"
fi

log_success "Seal vault is healthy and Transit engine ready"

# Verify transit token exists
if ! docker exec "${COMPOSE_PROJECT_NAME:-dive-hub}-vault-seal" test -f /vault/transit/.transit-token 2>/dev/null; then
    fail "Transit token not found in shared volume"
fi
log_success "Transit token available in shared volume"

# =============================================================================
# Step 4: Copy vault_data volume to vault_data_1
# =============================================================================
step "4" "Copying Vault data volume (vault_data → vault_data_1)"

# Use a temporary container to copy data between volumes
log_info "Creating temporary copy container..."
docker volume create vault_data_1 2>/dev/null || true

docker run --rm \
    -v vault_data:/source:ro \
    -v vault_data_1:/dest \
    alpine sh -c "cp -a /source/. /dest/"

log_success "Volume data copied to vault_data_1"

# =============================================================================
# Step 5: Start vault-1 with Transit seal config (migration mode)
# =============================================================================
step "5" "Starting vault-1 with Transit seal (enters migration mode)"

docker compose -f "$COMPOSE_FILE" up -d vault-1

log_info "Waiting for vault-1 to start..."
sleep 5

# Check if vault-1 is in migration mode (sealed, waiting for Shamir keys)
VAULT_ADDR="http://localhost:8200"
export VAULT_ADDR

v1_status=$(vault status -format=json 2>/dev/null || true)
v1_sealed=$(echo "$v1_status" | grep -o '"sealed":[a-z]*' | cut -d: -f2)
v1_migration=$(echo "$v1_status" | grep -o '"migration":[a-z]*' | cut -d: -f2 || echo "false")

if [ "$v1_sealed" = "true" ] || [ "$v1_migration" = "true" ]; then
    log_info "Vault-1 is in seal migration mode — applying old Shamir keys..."
else
    log_warn "Vault-1 may have already been migrated or auto-unsealed"
fi

# =============================================================================
# Step 6: Apply old Shamir keys for seal migration
# =============================================================================
step "6" "Migrating seal type: Shamir → Transit"

log_info "Applying 3 Shamir unseal keys with -migrate flag..."

for i in 0 1 2; do
    key_num=$((i+1))
    if vault operator unseal -migrate "${UNSEAL_KEYS[$i]}" >/dev/null 2>&1; then
        log_info "  Key $key_num/3 applied"
    else
        # It's possible the vault already auto-unsealed via transit
        log_warn "  Key $key_num failed (vault may already be unsealed)"
    fi
done

# Wait for migration to complete
sleep 3

# Verify vault-1 is unsealed
if vault status 2>/dev/null | grep -q "Sealed.*false"; then
    log_success "Vault-1 is unsealed — seal migration complete!"
else
    # Check if already auto-unsealed (no migration needed)
    log_warn "Vault-1 status after migration attempt:"
    vault status 2>/dev/null || true
fi

# =============================================================================
# Step 7: Start vault-2 and vault-3 (auto-join + auto-unseal)
# =============================================================================
step "7" "Starting vault-2 and vault-3 (Raft join + auto-unseal)"

docker compose -f "$COMPOSE_FILE" up -d vault-2 vault-3

log_info "Waiting for cluster formation (${DIVE_TIMEOUT_VAULT_CLUSTER_READY:-60}s max)..."

cluster_ready=false
attempt=0
max_attempts=${DIVE_TIMEOUT_VAULT_CLUSTER_READY:-60}
while [ $attempt -lt $max_attempts ]; do
    peer_count=""
    peer_count=$(VAULT_TOKEN="$(cat "$VAULT_TOKEN_FILE")" \
        vault operator raft list-peers -format=json 2>/dev/null | \
        grep -c '"node_id"' || echo "0")

    if [ "$peer_count" -ge 3 ]; then
        cluster_ready=true
        break
    fi
    attempt=$((attempt + 1))
    sleep 2
done

if [ "$cluster_ready" = true ]; then
    log_success "3-node Raft cluster formed"
else
    log_warn "Cluster may still be forming — check with: ./dive vault cluster status"
fi

# =============================================================================
# Step 8: Verify data integrity
# =============================================================================
step "8" "Verifying data integrity"

VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
export VAULT_TOKEN

# Try to list KV mounts
if vault secrets list 2>/dev/null | grep -q "dive-v3/"; then
    log_success "KV v2 mounts accessible"
else
    log_warn "Could not verify KV mounts — check manually"
fi

# Try to read a known secret
if vault kv list dive-v3/core >/dev/null 2>&1; then
    log_success "Core secrets readable"
else
    log_warn "Could not read core secrets — they may not exist yet"
fi

# =============================================================================
# Step 9: Start remaining hub services
# =============================================================================
step "9" "Starting remaining hub services"

docker compose -f "$COMPOSE_FILE" up -d

log_info "Waiting for services to start..."
sleep 10

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Migration Complete"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Seal Type:     Transit auto-unseal (via vault-seal)"
echo "  Cluster:       3-node Raft (vault-1, vault-2, vault-3)"
echo "  Backup:        $SNAPSHOT_PATH"
echo ""
echo "  Shamir unseal keys in .vault-init.txt are now RECOVERY KEYS."
echo "  They are only needed for seal migration or emergency access."
echo ""
echo "  Next steps:"
echo "    ./dive vault cluster status    # Verify cluster health"
echo "    ./dive vault test-rotation DEU # Test secret access"
echo "    ./dive spoke verify-all        # Verify spoke connectivity"
echo ""
echo "═══════════════════════════════════════════════════════════════"
