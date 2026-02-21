#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Vault CLI Module
# =============================================================================
# Purpose: HashiCorp Vault initialization, management, and HA cluster ops
# Usage:
#   ./dive vault init            # One-time cluster initialization
#   ./dive vault status          # Check cluster health (seal vault + 3 nodes)
#   ./dive vault setup           # Configure mount points and policies
#   ./dive vault cluster status  # HA cluster overview
#   ./dive vault seal-status     # Seal vault diagnostics
#
# Architecture:
#   vault-seal  → Lightweight Transit engine for auto-unseal
#   vault-1/2/3 → 3-node Raft HA cluster with Transit auto-unseal
#   No manual unsealing required after restarts
#
# Notes:
#   - Recovery keys stored locally in .vault-init.txt (chmod 600)
#   - Root token stored in .vault-token (gitignored)
#   - Seal vault auto-initializes and auto-unseals via entrypoint
#   - No cloud dependencies required
# =============================================================================

# NOTE: Do NOT use set -euo pipefail here — this file is sourced into the parent
# shell, not executed directly. set -e/-u/-o pipefail would affect the parent's
# error handling and cause silent failures in common.sh pipeline expressions.

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="${DIVE_ROOT:-$(cd "${SCRIPT_DIR}/../../.." && pwd)}"

source "${DIVE_ROOT}/scripts/dive-modules/common.sh"
source "${SCRIPT_DIR}/ha.sh"
source "${SCRIPT_DIR}/db-engine.sh"
source "${SCRIPT_DIR}/backup.sh"
source "${SCRIPT_DIR}/rotation.sh"

# CLI runs on host — prefer VAULT_CLI_ADDR (host-accessible) over VAULT_ADDR (Docker-internal)
if [ -z "${VAULT_CLI_ADDR:-}" ] && [ -f "${DIVE_ROOT}/.env.hub" ]; then
    _vault_cli_addr=$(grep '^VAULT_CLI_ADDR=' "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d= -f2- || true)
    [ -n "${_vault_cli_addr:-}" ] && VAULT_CLI_ADDR="$_vault_cli_addr"
fi
VAULT_ADDR="${VAULT_CLI_ADDR:-${VAULT_ADDR:-https://localhost:8200}}"
VAULT_TOKEN_FILE="${DIVE_ROOT}/.vault-token"
VAULT_INIT_FILE="${DIVE_ROOT}/.vault-init.txt"

export VAULT_ADDR

# Auto-detect VAULT_CACERT for CLI TLS verification (if not already set)
if [ -z "${VAULT_CACERT:-}" ] && [[ "$VAULT_ADDR" == https://* ]]; then
    _auto_cacert="${DIVE_ROOT}/certs/vault/node1/ca.pem"
    if [ -f "$_auto_cacert" ]; then
        export VAULT_CACERT="$_auto_cacert"
    else
        # Bootstrap CA fallback
        _auto_cacert="${DIVE_ROOT}/certs/vault/bootstrap-ca/ca.pem"
        if [ -f "$_auto_cacert" ]; then
            export VAULT_CACERT="$_auto_cacert"
        fi
    fi
    unset _auto_cacert
fi

# Cloud/EC2 safety: if no CACERT found, skip TLS verify so vault CLI still works
if [ -z "${VAULT_CACERT:-}" ] && [[ "$VAULT_ADDR" == https://* ]]; then
    export VAULT_SKIP_VERIFY=1
fi

# Validate auto-detected CACERT: if vault is reachable but CACERT fails TLS, fall back
# This prevents hangs when certs/vault/node1/ca.pem is stale or mismatched
if [ -n "${VAULT_CACERT:-}" ] && [ -z "${VAULT_SKIP_VERIFY:-}" ] && [[ "$VAULT_ADDR" == https://* ]]; then
    if command -v timeout &>/dev/null; then
        if ! timeout 3 vault status >/dev/null 2>&1; then
            # CACERT may be stale — try without it
            unset VAULT_CACERT
            export VAULT_SKIP_VERIFY=1
        fi
    fi
fi

# Scheme for per-node CLI calls (derived from VAULT_ADDR)
_VAULT_CLI_SCHEME="${VAULT_ADDR%%://*}"

# Dev mode: use well-known root token
if _vault_is_dev_mode; then
    VAULT_TOKEN="${VAULT_TOKEN:-root}"
    export VAULT_TOKEN
fi

##
# Run a command with timeout (portable: uses `timeout` on Linux, plain exec on macOS)
##
_vault_run_with_timeout() {
    local secs=$1; shift
    if command -v timeout &>/dev/null; then
        timeout "$secs" "$@"
    else
        "$@"
    fi
}

##
# Check if Vault is unsealed (with retry for post-deploy timing)
# Retries up to 3 times with 2s sleep to handle Raft cluster formation
# Falls back to VAULT_SKIP_VERIFY=1 if CACERT-based TLS fails
##
_vault_check_unsealed() {
    local retries=3
    local delay=2
    local cacert_fallback=false

    local i
    for ((i=1; i<=retries; i++)); do
        if _vault_run_with_timeout 5 vault status 2>/dev/null | grep -q "Sealed.*false"; then
            return 0
        fi

        # If VAULT_CACERT is set but vault can't respond, the CA cert may be
        # stale/mismatched — fall back to VAULT_SKIP_VERIFY=1 before retrying
        if [ -n "${VAULT_CACERT:-}" ] && [ "$cacert_fallback" = "false" ]; then
            log_verbose "Vault unreachable with CACERT ($VAULT_CACERT) — retrying with VAULT_SKIP_VERIFY=1"
            unset VAULT_CACERT
            export VAULT_SKIP_VERIFY=1
            cacert_fallback=true
            continue
        fi

        if [ "$i" -lt "$retries" ]; then
            log_verbose "Vault not yet responding (attempt $i/$retries) — retrying in ${delay}s..."
            sleep "$delay"
        fi
    done
    log_error "Vault is sealed or unreachable after ${retries} attempts"
    log_info "Check seal status: ./dive vault seal-status"
    return 1
}

##
# Check if Vault is running (dev: vault-dev, HA: vault-1)
##
vault_is_running() {
    if _vault_is_dev_mode; then
        if ! docker ps --format '{{.Names}}' | grep -q "vault-dev"; then
            log_error "Vault dev container is not running"
            log_info "Start it: docker compose -f docker-compose.hub.yml --profile vault-dev up -d"
            return 1
        fi
    else
        if ! docker ps --format '{{.Names}}' | grep -q "vault-1"; then
            log_error "Vault cluster is not running"
            log_info "Start cluster: docker compose -f docker-compose.hub.yml --profile vault-ha up -d"
            return 1
        fi
    fi
    return 0
}

##
# Initialize Vault (dev: write root token, HA: recovery key ceremony)
##
module_vault_init() {
    # Dev mode: already initialized with well-known root token
    if _vault_is_dev_mode; then
        log_info "Vault running in dev mode — already initialized with root token"
        echo "root" > "$VAULT_TOKEN_FILE"
        chmod 600 "$VAULT_TOKEN_FILE"
        VAULT_TOKEN="root"
        export VAULT_TOKEN
        log_success "Vault dev mode ready (token: root)"
        return 0
    fi

    log_info "Initializing Vault HA cluster..."

    if ! vault_is_running; then
        return 1
    fi

    # Check if already initialized
    local status_json
    status_json=$(vault status -format=json 2>/dev/null || true)
    local is_initialized
    is_initialized=$(echo "$status_json" | grep -o '"initialized": *[a-z]*' | sed 's/.*: *//')

    if [ "$is_initialized" = "true" ]; then
        log_warn "Vault cluster is already initialized"
        if [ -f "$VAULT_INIT_FILE" ]; then
            log_info "Initialization data exists at: $VAULT_INIT_FILE"
        fi
        return 0
    fi

    # Verify seal vault is healthy before init
    if ! docker ps --format '{{.Names}}' | grep -q "vault-seal"; then
        log_error "Seal vault is not running — required for Transit auto-unseal"
        log_info "Start it: docker compose -f docker-compose.hub.yml up -d vault-seal"
        return 1
    fi

    # Transit auto-unseal uses recovery keys instead of unseal keys
    log_info "Initializing with Transit auto-unseal (5 recovery shares, threshold 3)..."
    vault operator init -recovery-shares=5 -recovery-threshold=3 > "$VAULT_INIT_FILE"

    if [ ! -f "$VAULT_INIT_FILE" ]; then
        log_error "Failed to initialize Vault cluster"
        return 1
    fi

    chmod 600 "$VAULT_INIT_FILE"

    # Extract root token (same format for both Shamir and auto-unseal)
    log_info "Extracting root token..."

    VAULT_TOKEN=$(grep 'Initial Root Token' "$VAULT_INIT_FILE" | awk '{print $4}')

    if [ -z "$VAULT_TOKEN" ]; then
        log_error "Failed to extract root token from initialization output"
        return 1
    fi

    # Save root token to file
    echo "$VAULT_TOKEN" > "$VAULT_TOKEN_FILE"
    chmod 600 "$VAULT_TOKEN_FILE"
    export VAULT_TOKEN

    log_success "Vault HA cluster initialized successfully"
    log_info "Root token saved to: $VAULT_TOKEN_FILE"
    log_info "Recovery keys saved to: $VAULT_INIT_FILE"

    log_info ""
    log_info "==================================================================="
    log_info "IMPORTANT: Next steps"
    log_info "==================================================================="
    log_info "1. Configure Vault:    ./dive vault setup"
    log_info "2. Seed secrets:       ./dive vault seed"
    log_info ""
    log_info "Auto-unseal is active — no manual unsealing required after restarts."
    log_warn "Keep $VAULT_INIT_FILE in a secure location!"
    log_warn "Recovery keys are needed for seal migration or emergency access."
    log_info "==================================================================="
}

##
# Unseal diagnostic — with Transit auto-unseal, manual unsealing is not needed.
# This command checks seal vault health and cluster auto-unseal status.
##
module_vault_unseal() {
    if _vault_is_dev_mode; then
        log_info "Vault dev mode — always unsealed, no action needed"
        return 0
    fi

    log_info "Vault HA cluster uses Transit auto-unseal — no manual unsealing required."
    echo ""

    # Check if already unsealed
    if vault status 2>/dev/null | grep -q "Sealed.*false"; then
        log_success "Vault is already unsealed (auto-unseal working correctly)"
        return 0
    fi

    # If sealed, diagnose
    log_warn "Vault appears to be sealed — checking seal vault..."

    if ! docker ps --format '{{.Names}}' | grep -q "vault-seal"; then
        log_error "Seal vault container is NOT running"
        log_info "Start it: docker compose -f docker-compose.hub.yml up -d vault-seal"
        log_info "Then restart sealed nodes: docker compose -f docker-compose.hub.yml restart vault-1 vault-2 vault-3"
        return 1
    fi

    local seal_cli_addr="${VAULT_SEAL_CLI_ADDR:-http://localhost:8210}"
    local seal_status
    seal_status=$(VAULT_ADDR="$seal_cli_addr" vault status -format=json 2>/dev/null || true)

    if [ -z "$seal_status" ]; then
        log_error "Seal vault is not responding at $seal_cli_addr"
        return 1
    fi

    local seal_sealed
    seal_sealed=$(echo "$seal_status" | grep -o '"sealed": *[a-z]*' | sed 's/.*: *//')
    if [ "$seal_sealed" = "true" ]; then
        log_error "Seal vault itself is sealed — Transit key unavailable"
        log_info "The seal vault should auto-unseal on restart. Try:"
        log_info "  docker compose -f docker-compose.hub.yml restart vault-seal"
        return 1
    fi

    log_success "Seal vault is healthy and unsealed"
    log_info "Cluster nodes should auto-unseal. Try restarting them:"
    log_info "  docker compose -f docker-compose.hub.yml restart vault-1 vault-2 vault-3"
}

##
# Check Vault HA cluster status
##
module_vault_status() {
    # Load token if available
    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    fi

    if _vault_is_dev_mode; then
        log_info "Vault Mode: DEV (single node, in-memory)"
        log_info "Vault Address: ${VAULT_ADDR}"
        if vault status 2>/dev/null | grep -q "Sealed.*false"; then
            log_success "Vault is unsealed and ready"
        else
            log_error "Vault is not responding"
            return 1
        fi
    else
        log_info "Checking Vault HA cluster status..."
        vault_ha_status
    fi

    # Check if authenticated
    if [ -n "${VAULT_TOKEN:-}" ]; then
        if vault token lookup >/dev/null 2>&1; then
            log_success "Vault token is valid"
        else
            log_warn "Vault token is invalid or expired"
        fi
    else
        log_warn "No Vault token found - run: ./dive vault init"
    fi
}

##
# Setup Vault mount points and policies
##
module_vault_setup() {
    log_info "Configuring Vault mount points and policies..."

    if ! vault_is_running; then
        return 1
    fi

    # Load token
    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    else
        log_error "Vault token not found - run: ./dive vault init"
        return 1
    fi

    # Check if unsealed (with retry for post-deploy timing)
    if ! _vault_check_unsealed; then
        return 1
    fi

    log_info "Enabling KV v2 secret engines..."

    # Enable KV v2 engines
    local mount_points=("dive-v3/core" "dive-v3/auth" "dive-v3/federation" "dive-v3/opal")

    for mount in "${mount_points[@]}"; do
        if vault secrets list | grep -q "^${mount}/"; then
            log_verbose "  ✓ Mount point already enabled: $mount"
        else
            if vault secrets enable -path="$mount" kv-v2 >/dev/null 2>&1; then
                log_success "  ✓ Enabled KV v2 mount: $mount"
            else
                log_error "Failed to enable mount: $mount"
                return 1
            fi
        fi
    done

    log_info "Creating Vault policies..."

    # Create hub policy
    if vault policy write dive-v3-hub "${DIVE_ROOT}/vault_config/policies/hub.hcl" >/dev/null 2>&1; then
        log_success "  ✓ Created policy: dive-v3-hub"
    else
        log_warn "  ✗ Failed to create policy: dive-v3-hub"
    fi

    # Spoke policies are created dynamically via: ./dive vault provision <CODE>

    log_info "Enabling AppRole authentication..."

    # Enable AppRole auth method
    if vault auth list | grep -q "^approle/"; then
        log_verbose "  ✓ AppRole auth method already enabled"
    else
        if vault auth enable approle >/dev/null 2>&1; then
            log_success "  ✓ Enabled AppRole authentication"
        else
            log_error "Failed to enable AppRole auth"
            return 1
        fi
    fi

    # Create AppRole for Hub (usa) - best practice authentication
    log_info "Creating AppRole for Hub..."
    if vault write auth/approle/role/hub \
        token_policies="dive-v3-hub" \
        token_ttl=24h \
        token_max_ttl=72h \
        secret_id_ttl=72h \
        secret_id_num_uses=0 >/dev/null 2>&1; then

        # Get role_id
        local hub_role_id
        hub_role_id=$(vault read -field=role_id auth/approle/role/hub/role-id 2>/dev/null)

        # Generate secret_id
        local hub_secret_id
        hub_secret_id=$(vault write -field=secret_id -f auth/approle/role/hub/secret-id 2>/dev/null)

        if [ -n "$hub_role_id" ] && [ -n "$hub_secret_id" ]; then
            # Source secrets module for _vault_update_env
            source "${DIVE_ROOT}/scripts/dive-modules/configuration/secrets.sh" 2>/dev/null || true

            # Update .env.hub with AppRole credentials
            _vault_update_env "${DIVE_ROOT}/.env.hub" "VAULT_ROLE_ID" "$hub_role_id"
            _vault_update_env "${DIVE_ROOT}/.env.hub" "VAULT_SECRET_ID" "$hub_secret_id"
            log_success "  ✓ Created AppRole: hub (credentials written to .env.hub)"
        else
            log_warn "  ✗ Failed to get Hub AppRole credentials"
        fi
    else
        log_warn "  ✗ Failed to create AppRole: hub"
    fi

    # Spoke AppRoles are created dynamically via: ./dive vault provision <CODE>

    # Enable audit logging
    log_info "Enabling audit logging..."

    if vault audit list 2>/dev/null | grep -q "file/"; then
        log_verbose "  ✓ File audit device already enabled"
    else
        if vault audit enable file file_path=/vault/logs/audit.log >/dev/null 2>&1; then
            log_success "  ✓ Enabled file audit logging (/vault/logs/audit.log)"
        else
            log_warn "  ✗ Failed to enable audit logging (non-fatal)"
        fi
    fi

    # Production: audit is MANDATORY
    if is_production_mode; then
        if ! vault audit list 2>/dev/null | grep -q "file/"; then
            log_error "PRODUCTION: Audit logging MUST be enabled but is not"
            return 1
        fi
        log_success "Production audit enforcement: PASS"
    fi

    log_success "Vault configuration complete!"
    log_info ""
    log_info "==================================================================="
    log_info "Next steps:"
    log_info "==================================================================="
    log_info "1. Seed hub secrets:     ./dive vault seed"
    log_info "2. Deploy hub:           ./dive hub deploy"
    log_info "3. Provision spoke:      ./dive vault provision <CODE>"
    log_info "4. Deploy spoke:         ./dive spoke deploy <CODE>"
    log_info "==================================================================="
}

##
# Create a Raft snapshot backup
# Usage: ./dive vault snapshot [output-path]
##
module_vault_snapshot() {
    if _vault_is_dev_mode; then
        log_warn "Vault dev mode uses in-memory storage — snapshots not applicable"
        return 0
    fi

    local output_path="${1:-}"

    if ! vault_is_running; then
        return 1
    fi

    # Load token
    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    else
        log_error "Vault token not found - run: ./dive vault init"
        return 1
    fi

    # Check if unsealed (with retry for post-deploy timing)
    if ! _vault_check_unsealed; then
        return 1
    fi

    # Default output path with timestamp
    if [ -z "$output_path" ]; then
        local backup_dir="${DIVE_ROOT}/backups/vault"
        mkdir -p "$backup_dir"
        output_path="${backup_dir}/vault-snapshot-$(date +%Y%m%d-%H%M%S).snap"
    fi

    log_info "Creating Vault Raft snapshot..."
    log_info "  Output: $output_path"

    # Standby nodes redirect to leader using Docker-internal hostname (unreachable from host).
    # Try each cluster port directly — the leader port succeeds without redirect.
    local snap_saved=false
    for _snap_port in 8200 8202 8204; do
        if VAULT_ADDR="${_VAULT_CLI_SCHEME}://localhost:${_snap_port}" vault operator raft snapshot save "$output_path" 2>/dev/null; then
            snap_saved=true
            break
        fi
    done

    if [ "$snap_saved" = true ]; then
        local size
        size=$(du -h "$output_path" | awk '{print $1}')
        log_success "Snapshot created: $output_path ($size)"
    else
        log_error "Failed to create Vault snapshot"
        return 1
    fi
}

##
# Restore a Raft snapshot
# Usage: ./dive vault restore <snapshot-path>
##
module_vault_restore() {
    if _vault_is_dev_mode; then
        log_warn "Vault dev mode uses in-memory storage — restore not applicable"
        return 0
    fi

    local snapshot_path="${1:-}"

    if [ -z "$snapshot_path" ]; then
        log_error "Usage: ./dive vault restore <snapshot-path>"
        return 1
    fi

    if [ ! -f "$snapshot_path" ]; then
        log_error "Snapshot file not found: $snapshot_path"
        return 1
    fi

    if ! vault_is_running; then
        return 1
    fi

    # Load token
    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    else
        log_error "Vault token not found"
        return 1
    fi

    log_warn "Restoring Vault from snapshot: $snapshot_path"
    log_warn "This will REPLACE all current Vault data!"

    if vault operator raft snapshot restore "$snapshot_path" 2>/dev/null; then
        log_success "Snapshot restored successfully"
        log_info "Vault will need to be unsealed: ./dive vault unseal"
    else
        log_error "Failed to restore Vault snapshot"
        return 1
    fi
}

# =============================================================================
# PKI BACKUP & RESTORE (Phase 6: Disaster Recovery)
# =============================================================================

##
# Backup PKI state: export CA certs + take Raft snapshot.
#
# Exports:
#   - Root CA cert (public — key stays in Vault)
#   - Intermediate CA cert (public — key stays in Vault)
#   - Vault Raft snapshot (includes PKI engine state with private keys)
#
# Usage: ./dive vault backup-pki
##

# =============================================================================
# SOURCE SUB-MODULES
# =============================================================================
source "${SCRIPT_DIR}/operations.sh"  # PKI DR, secret seeding, env helpers
source "${SCRIPT_DIR}/pki.sh"         # PKI setup, spoke provisioning, credentials
source "${SCRIPT_DIR}/testing.sh"     # Test suites, env, audit-rotate, DR
source "${SCRIPT_DIR}/partners.sh"    # Federation partner CRUD (Vault KV)

module_vault() {
    local subcommand="${1:-help}"

    case "$subcommand" in
        init)
            module_vault_init
            ;;
        unseal)
            module_vault_unseal
            ;;
        status)
            module_vault_status
            ;;
        setup)
            module_vault_setup
            ;;
        seed)
            module_vault_seed
            ;;
        snapshot)
            shift
            module_vault_snapshot "$@"
            ;;
        restore)
            shift
            module_vault_restore "$@"
            ;;
        provision)
            shift
            module_vault_provision "$@"
            ;;
        deprovision)
            shift
            module_vault_deprovision "$@"
            ;;
        cluster)
            shift
            vault_ha_dispatch "$@"
            ;;
        seal-status)
            vault_ha_seal_status
            ;;
        step-down)
            vault_ha_step_down
            ;;
        migrate)
            shift
            module_vault_migrate "$@"
            ;;
        test-rotation|rotation-test)
            shift
            module_vault_test_rotation "$@"
            ;;
        test-backup|backup-test)
            module_vault_test_backup
            ;;
        test-ha-failover)
            module_vault_test_ha_failover
            ;;
        test-seal-restart)
            module_vault_test_seal_restart
            ;;
        test-full-restart)
            module_vault_test_full_restart
            ;;
        pki-setup)
            module_vault_pki_setup
            ;;
        test-pki)
            module_vault_test_pki
            ;;
        db-setup)
            module_vault_db_setup
            ;;
        db-status)
            module_vault_db_status
            ;;
        db-test)
            module_vault_db_test
            ;;
        backup-run)
            module_vault_backup_run
            ;;
        backup-list)
            module_vault_backup_list
            ;;
        backup-schedule)
            shift
            module_vault_backup_schedule "$@"
            ;;
        test-monitoring)
            module_vault_test_monitoring
            ;;
        test-env)
            module_vault_test_env
            ;;
        env|environment)
            module_vault_env
            ;;
        rotate)
            shift
            module_vault_rotate "$@"
            ;;
        rotation-status)
            module_vault_rotation_status
            ;;
        rotation-check)
            module_vault_rotation_check
            ;;
        test-rotation-full)
            shift
            module_vault_test_rotation_full "$@"
            ;;
        trust-ca)
            source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"
            install_vault_ca_to_system_truststore
            ;;
        untrust-ca)
            source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"
            remove_vault_ca_from_system_truststore
            ;;
        tls-setup)
            source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"
            generate_vault_node_certs
            ;;
        rotate-node-certs)
            source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"
            _rotate_vault_node_certs_to_pki
            ;;
        audit-rotate)
            module_vault_audit_rotate
            ;;
        dr-test)
            module_vault_dr_test
            ;;
        backup-pki)
            module_vault_backup_pki
            ;;
        restore-pki)
            shift
            module_vault_restore_pki "$@"
            ;;
        rekey-intermediate)
            shift
            module_vault_rekey_intermediate "$@"
            ;;
        crl-status)
            source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"
            show_crl_status
            ;;
        crl-rotate)
            source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"
            rotate_crl
            ;;
        refresh-credentials)
            shift
            module_vault_refresh_credentials "$@"
            ;;
        revoke-spoke)
            shift
            source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"
            revoke_spoke_certificates "$@"
            ;;
        partner)
            shift
            module_vault_partner "$@"
            ;;
        help|--help|-h)
            echo "Usage: ./dive vault <command>"
            echo ""
            echo "Commands:"
            echo "  init                Initialize Vault (dev: auto, HA: recovery keys)"
            echo "  status              Check Vault health (dev or HA cluster)"
            echo "  setup               Configure mount points and hub policy"
            echo "  seed                Generate and store hub (USA) + shared secrets"
            echo "  provision <CODE>    Provision a spoke: policy, AppRole, secrets, .env"
            echo "  deprovision <CODE>  Deprovision a spoke: revoke cert, remove AppRole/policy/role"
            echo "  refresh-credentials <CODE|all>  Refresh AppRole SecretID (72h TTL)"
            echo "                      Options: --migrate (apply 72h TTL to existing roles)"
            echo "  env                 Show current Vault environment (dev/staging/prod)"
            echo "  trust-ca            Install Vault Root CA in system trust store"
            echo "  untrust-ca          Remove Vault Root CA from system trust store"
            echo "  tls-setup           Generate TLS certs for Vault HA nodes (production)"
            echo "  rotate-node-certs   Rotate Vault node certs from bootstrap to Vault PKI"
            echo "  pki-setup           Setup PKI Root CA + Intermediate CA (one-time)"
            echo "  db-setup            Setup database secrets engine (one-time)"
            echo "  db-status           Show database engine status and roles"
            echo "  snapshot [path]     Create Raft snapshot backup (HA only)"
            echo "  restore <path>      Restore from Raft snapshot (HA only)"
            echo "  backup-run          Create snapshot + prune old (${VAULT_BACKUP_RETENTION_DAYS:-7}-day retention)"
            echo "  backup-list         List all snapshots with size/date"
            echo "  backup-schedule     Enable/disable daily automated backups"
            echo "  audit-rotate        Rotate audit log (archive + truncate if >100MB)"
            echo "  dr-test             Disaster recovery test (snapshot + restore verify)"
            echo "  backup-pki          Export CA certs + Raft snapshot for PKI DR"
            echo "  restore-pki <snap>  Restore PKI from snapshot + re-issue all certs"
            echo "  rekey-intermediate  Rekey Intermediate CA (DISRUPTIVE — needs --confirm)"
            echo "  crl-status          Show CRL status and certificate inventory"
            echo "  crl-rotate          Force CRL rebuild on Intermediate CA"
            echo "  revoke-spoke <CODE> Revoke a spoke's certificate via Vault PKI"
            echo ""
            echo "Federation Partners:"
            echo "  partner add <CODE>  Register pre-approved partner (auto-derives domains)"
            echo "                      Options: --domain <base>, --trust <level>, --max-classification"
            echo "  partner get <CODE>  Show partner details (JSON)"
            echo "  partner list        List all registered partners"
            echo "  partner remove <CODE> Remove partner registration"
            echo ""
            echo "Rotation:"
            echo "  rotate [category]   Rotate KV v2 secrets (core|auth|opal|federation|all)"
            echo "                      Options: --dry-run, --instance CODE"
            echo "  rotation-status     Dashboard: KV versions, DB TTLs, cert expiry"
            echo "  rotation-check      Health check: sync DB creds, auto-renew PKI certs"
            echo ""
            echo "HA Cluster (DIVE_ENV=staging/production):"
            echo "  cluster status      Show leader, followers, Raft peers"
            echo "  cluster step-down   Force leader step-down (re-election)"
            echo "  cluster remove-peer Remove dead node from Raft"
            echo "  seal-status         Seal vault diagnostics (Transit key)"
            echo "  unseal              Auto-unseal diagnostic (troubleshooting)"
            echo "  migrate             Migrate from Shamir to Transit auto-unseal"
            echo ""
            echo "Testing:"
            echo "  test-env            Test multi-environment configuration"
            echo "  test-rotation [CODE] Test secret rotation lifecycle"
            echo "  test-rotation-full [CODE] Full rotation test (7 checks)"
            echo "  test-backup         Validate Raft snapshot backup (HA only)"
            echo "  test-ha-failover    Test leader failover + recovery (HA only)"
            echo "  test-seal-restart   Test seal vault restart resilience (HA only)"
            echo "  test-full-restart   Test full cluster restart (HA only)"
            echo "  test-pki            Test PKI certificate issuance lifecycle"
            echo "  test-monitoring     Test monitoring infrastructure (7-point)"
            echo "  db-test             Test database credential generation"
            echo ""
            echo "Environment: DIVE_ENV=${DIVE_ENV:-local} (profile: $(_vault_get_profile))"
            echo ""
            echo "Workflow:"
            echo "  ./dive vault init                          # 1. Initialize"
            echo "  ./dive vault setup                         # 2. Configure mount points"
            echo "  ./dive vault seed                          # 3. Seed hub + shared secrets"
            echo "  ./dive hub deploy                          # 4. Deploy hub"
            echo "  ./dive vault provision FRA                 # 5. Provision a spoke"
            echo "  ./dive spoke deploy FRA                    # 6. Deploy the spoke"
            ;;
        *)
            log_error "Unknown vault command: $subcommand"
            log_info "Run './dive vault help' for usage"
            return 1
            ;;
    esac
}

# If script is executed directly (not sourced), run main function
if [ "${BASH_SOURCE[0]}" -ef "$0" ]; then
    module_vault "$@"
fi
