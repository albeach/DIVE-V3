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

set -euo pipefail

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
    _vault_cli_addr=$(grep '^VAULT_CLI_ADDR=' "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d= -f2-)
    [ -n "$_vault_cli_addr" ] && VAULT_CLI_ADDR="$_vault_cli_addr"
fi
VAULT_ADDR="${VAULT_CLI_ADDR:-${VAULT_ADDR:-http://localhost:8200}}"
VAULT_TOKEN_FILE="${DIVE_ROOT}/.vault-token"
VAULT_INIT_FILE="${DIVE_ROOT}/.vault-init.txt"

export VAULT_ADDR

# Dev mode: use well-known root token
if _vault_is_dev_mode; then
    VAULT_TOKEN="${VAULT_TOKEN:-root}"
    export VAULT_TOKEN
fi

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

    # Check if unsealed
    if ! vault status 2>/dev/null | grep -q "Sealed.*false"; then
        log_error "Vault is sealed - check seal vault: ./dive vault seal-status"
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

    # Check if unsealed
    if ! vault status 2>/dev/null | grep -q "Sealed.*false"; then
        log_error "Vault is sealed - check seal vault: ./dive vault seal-status"
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
        if VAULT_ADDR="http://localhost:${_snap_port}" vault operator raft snapshot save "$output_path" 2>/dev/null; then
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

##
# Seed Vault with fresh secrets for all instances
# Generates cryptographically random secrets and stores in Vault KV v2
# Usage: ./dive vault seed
##
module_vault_seed() {
    log_info "Seeding Vault with hub (USA) and shared secrets..."

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

    # Check if unsealed
    if ! vault status 2>/dev/null | grep -q "Sealed.*false"; then
        log_error "Vault is sealed - check seal vault: ./dive vault seal-status"
        return 1
    fi

    # Source secrets module for vault_set_secret()
    source "${DIVE_ROOT}/scripts/dive-modules/configuration/secrets.sh"

    # Hub only — spoke secrets are provisioned via: ./dive vault provision <CODE>
    local all_instances=("usa")
    local total_seeded=0
    local total_failed=0

    # ==========================================================================
    # Instance-specific secrets (per instance)
    # ==========================================================================
    for instance in "${all_instances[@]}"; do
        log_info "Seeding secrets for $(upper "$instance")..."

        local postgres_pw=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
        local mongodb_pw=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
        local redis_pw=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
        local keycloak_pw=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
        local nextauth_secret=$(openssl rand -base64 32)

        local secrets_data=(
            "core:${instance}/postgres:{\"password\":\"${postgres_pw}\"}"
            "core:${instance}/mongodb:{\"password\":\"${mongodb_pw}\"}"
            "core:${instance}/redis:{\"password\":\"${redis_pw}\"}"
            "core:${instance}/keycloak-admin:{\"password\":\"${keycloak_pw}\"}"
            "auth:${instance}/nextauth:{\"secret\":\"${nextauth_secret}\"}"
        )

        for entry in "${secrets_data[@]}"; do
            local category="${entry%%:*}"
            local rest="${entry#*:}"
            local path="${rest%%:\{*}"
            local value="{${rest#*:\{}"

            if vault_set_secret "$category" "$path" "$value"; then
                total_seeded=$((total_seeded + 1))
                log_verbose "  Seeded: dive-v3/${category}/${path}"
            else
                total_failed=$((total_failed + 1))
                log_error "  Failed: dive-v3/${category}/${path}"
            fi
        done
    done

    # ==========================================================================
    # Shared secrets (not instance-specific)
    # ==========================================================================
    log_info "Seeding shared secrets..."

    local keycloak_client_secret=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
    local redis_blacklist_pw=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
    local opal_master_token=$(openssl rand -hex 32)
    local kas_signing_key=$(openssl rand -base64 32)
    local kas_encryption_key=$(openssl rand -base64 32)

    local shared_secrets=(
        "auth:shared/keycloak-client:{\"secret\":\"${keycloak_client_secret}\"}"
        "core:shared/redis-blacklist:{\"password\":\"${redis_blacklist_pw}\"}"
        "opal:master-token:{\"token\":\"${opal_master_token}\"}"
        "auth:shared/kas-signing:{\"key\":\"${kas_signing_key}\"}"
        "auth:shared/kas-encryption:{\"key\":\"${kas_encryption_key}\"}"
    )

    for entry in "${shared_secrets[@]}"; do
        local category="${entry%%:*}"
        local rest="${entry#*:}"
        local path="${rest%%:\{*}"
        local value="{${rest#*:\{}"

        if vault_set_secret "$category" "$path" "$value"; then
            total_seeded=$((total_seeded + 1))
            log_verbose "  Seeded: dive-v3/${category}/${path}"
        else
            total_failed=$((total_failed + 1))
            log_error "  Failed: dive-v3/${category}/${path}"
        fi
    done

    # ==========================================================================
    # Federation secrets — skipped at seed time (created during vault provision)
    # ==========================================================================
    local -a pairs=()
    log_verbose "Federation pairs are generated during spoke provisioning"

    # ==========================================================================
    # Sync key secrets to .env files for Docker Compose interpolation
    # ==========================================================================
    log_info "Syncing secrets to .env files for Docker Compose..."

    # Sync hub secrets to .env.hub
    local hub_env="${DIVE_ROOT}/.env.hub"
    if [ -f "$hub_env" ]; then
        local usa_pg=$(vault_get_secret "core" "usa/postgres" "password")
        local usa_mongo=$(vault_get_secret "core" "usa/mongodb" "password")
        local usa_redis=$(vault_get_secret "core" "usa/redis" "password")
        local usa_kc=$(vault_get_secret "core" "usa/keycloak-admin" "password")
        local shared_client=$(vault_get_secret "auth" "shared/keycloak-client" "secret")
        local shared_blacklist=$(vault_get_secret "core" "shared/redis-blacklist" "password")
        local opal_token=$(vault_get_secret "opal" "master-token" "token")
        local usa_auth=$(vault_get_secret "auth" "usa/nextauth" "secret")

        # Instance-scoped secrets (all with _USA suffix)
        _vault_update_env "$hub_env" "POSTGRES_PASSWORD_USA" "$usa_pg"
        _vault_update_env "$hub_env" "KC_ADMIN_PASSWORD_USA" "$usa_kc"
        _vault_update_env "$hub_env" "KC_BOOTSTRAP_ADMIN_PASSWORD_USA" "$usa_kc"
        _vault_update_env "$hub_env" "KEYCLOAK_ADMIN_PASSWORD_USA" "$usa_kc"
        _vault_update_env "$hub_env" "MONGO_PASSWORD_USA" "$usa_mongo"
        _vault_update_env "$hub_env" "REDIS_PASSWORD_USA" "$usa_redis"
        _vault_update_env "$hub_env" "AUTH_SECRET_USA" "$usa_auth"
        _vault_update_env "$hub_env" "NEXTAUTH_SECRET_USA" "$usa_auth"
        _vault_update_env "$hub_env" "JWT_SECRET_USA" "$usa_auth"
        _vault_update_env "$hub_env" "KEYCLOAK_CLIENT_SECRET_USA" "$shared_client"
        # Shared secrets (no suffix)
        _vault_update_env "$hub_env" "REDIS_PASSWORD_BLACKLIST" "$shared_blacklist"
        _vault_update_env "$hub_env" "OPAL_AUTH_MASTER_TOKEN" "$opal_token"

        log_success "Hub .env.hub synced with Vault secrets"
    else
        log_warn "Hub .env.hub not found - Docker Compose will need Vault env vars"
    fi

    # Spoke .env files are synced during: ./dive vault provision <CODE>

    # ==========================================================================
    # Summary
    # ==========================================================================
    echo ""
    log_info "==================================================================="
    log_info "  Vault Secret Seeding Summary"
    log_info "==================================================================="
    log_info "  Seeded:  $total_seeded secrets"
    if [ $total_failed -gt 0 ]; then
        log_error "  Failed:  $total_failed secrets"
    fi
    log_info "  Instances: usa (hub only)"
    log_info "  Shared:    keycloak-client, redis-blacklist, opal-master-token, kas-signing, kas-encryption"
    log_info "  Next:      ./dive vault provision <CODE> to add spokes"
    log_info "==================================================================="

    if [ $total_failed -gt 0 ]; then
        return 1
    fi
    return 0
}

##
# Helper: update or append an env var in a .env file
##
_vault_update_env() {
    local env_file="$1"
    local var_name="$2"
    local var_value="$3"

    if [ -z "$var_value" ]; then
        return 0
    fi

    if grep -q "^${var_name}=" "$env_file" 2>/dev/null; then
        local tmpfile=$(mktemp)
        sed "s|^${var_name}=.*|${var_name}=${var_value}|" "$env_file" > "$tmpfile" && mv "$tmpfile" "$env_file"
    else
        echo "${var_name}=${var_value}" >> "$env_file"
    fi
}

##
# Check if a spoke has been provisioned in Vault (policy + AppRole + secrets)
# Usage: vault_spoke_is_provisioned <code>
# Returns 0 if provisioned, 1 if not
##
vault_spoke_is_provisioned() {
    local code=$(lower "${1:?spoke code required}")

    # Check AppRole exists
    if ! vault read "auth/approle/role/spoke-${code}" >/dev/null 2>&1; then
        return 1
    fi

    # Check at least one secret exists
    if ! vault_get_secret "core" "${code}/postgres" "password" >/dev/null 2>&1; then
        return 1
    fi

    return 0
}

##
# One-time setup of Vault PKI certificate authority hierarchy
# Creates: Root CA (pki/), Intermediate CA (pki_int/), hub-services role
# Usage: ./dive vault pki-setup
##
module_vault_pki_setup() {
    log_info "Setting up Vault PKI certificate authority..."

    if ! vault_is_running; then return 1; fi

    # Load token
    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    else
        log_error "Vault token not found - run: ./dive vault init"
        return 1
    fi

    # Check if unsealed
    if ! vault status 2>/dev/null | grep -q "Sealed.*false"; then
        log_error "Vault is sealed - check seal vault: ./dive vault seal-status"
        return 1
    fi

    # Step 1: Enable Root CA PKI engine
    log_info "Step 1/6: Enabling Root CA PKI engine (pki/)..."
    if vault secrets list 2>/dev/null | grep -q "^pki/"; then
        log_verbose "  Root CA PKI engine already enabled"
    else
        if vault secrets enable -path=pki pki >/dev/null 2>&1; then
            vault secrets tune -max-lease-ttl=87600h pki >/dev/null 2>&1
            log_success "  Enabled Root CA PKI engine (10yr max TTL)"
        else
            log_error "Failed to enable Root CA PKI engine"
            return 1
        fi
    fi

    # Step 2: Generate Root CA (idempotent — check if CA already exists)
    log_info "Step 2/6: Generating Root CA certificate..."
    local root_ca_pem
    root_ca_pem=$(vault read -field=certificate pki/cert/ca 2>/dev/null || true)
    if [ -n "$root_ca_pem" ] && echo "$root_ca_pem" | grep -q "BEGIN CERTIFICATE"; then
        log_verbose "  Root CA already exists"
    else
        if vault write -format=json pki/root/generate/internal \
            common_name="DIVE V3 Root CA" \
            organization="DIVE Federation" \
            ttl=87600h \
            key_type=rsa \
            key_bits=4096 >/dev/null 2>&1; then
            log_success "  Root CA generated (CN=DIVE V3 Root CA, 10yr TTL)"
        else
            log_error "Failed to generate Root CA"
            return 1
        fi
    fi

    # Step 3: Configure Root CA URLs
    log_info "Step 3/6: Configuring Root CA URLs..."
    vault write pki/config/urls \
        issuing_certificates="${VAULT_ADDR}/v1/pki/ca" \
        crl_distribution_points="${VAULT_ADDR}/v1/pki/crl" >/dev/null 2>&1
    log_success "  Root CA URLs configured"

    # Step 4: Enable Intermediate CA PKI engine
    log_info "Step 4/6: Enabling Intermediate CA PKI engine (pki_int/)..."
    if vault secrets list 2>/dev/null | grep -q "^pki_int/"; then
        log_verbose "  Intermediate CA PKI engine already enabled"
    else
        if vault secrets enable -path=pki_int pki >/dev/null 2>&1; then
            vault secrets tune -max-lease-ttl=26280h pki_int >/dev/null 2>&1
            log_success "  Enabled Intermediate CA PKI engine (3yr max TTL)"
        else
            log_error "Failed to enable Intermediate CA PKI engine"
            return 1
        fi
    fi

    # Step 5: Generate Intermediate CA, sign with Root, import
    log_info "Step 5/6: Generating and signing Intermediate CA..."
    local int_ca_pem
    int_ca_pem=$(vault read -field=certificate pki_int/cert/ca 2>/dev/null || true)
    if [ -n "$int_ca_pem" ] && echo "$int_ca_pem" | grep -q "BEGIN CERTIFICATE"; then
        log_verbose "  Intermediate CA already exists"
    else
        # Generate CSR
        local csr
        csr=$(vault write -field=csr pki_int/intermediate/generate/internal \
            common_name="DIVE V3 Intermediate CA" \
            organization="DIVE Federation" \
            key_type=rsa \
            key_bits=4096 2>/dev/null)

        if [ -z "$csr" ]; then
            log_error "Failed to generate Intermediate CA CSR"
            return 1
        fi

        # Sign CSR with Root CA
        local signed_cert
        signed_cert=$(vault write -field=certificate pki/root/sign-intermediate \
            csr="$csr" \
            format=pem_bundle \
            ttl=26280h 2>/dev/null)

        if [ -z "$signed_cert" ]; then
            log_error "Failed to sign Intermediate CA with Root CA"
            return 1
        fi

        # Import signed cert back into intermediate
        if vault write pki_int/intermediate/set-signed \
            certificate="$signed_cert" >/dev/null 2>&1; then
            log_success "  Intermediate CA generated and signed by Root CA (3yr TTL)"
        else
            log_error "Failed to import signed Intermediate CA"
            return 1
        fi
    fi

    # Step 6: Create hub-services PKI role + configure URLs
    log_info "Step 6/6: Creating PKI roles and applying policies..."

    # Configure Intermediate CA URLs
    vault write pki_int/config/urls \
        issuing_certificates="${VAULT_ADDR}/v1/pki_int/ca" \
        crl_distribution_points="${VAULT_ADDR}/v1/pki_int/crl" >/dev/null 2>&1

    # Create hub-services role (allow_any_name=true for Docker container hostnames)
    if vault write pki_int/roles/hub-services \
        allow_any_name=true \
        allow_ip_sans=true \
        allow_localhost=true \
        max_ttl=2160h \
        key_type=rsa \
        key_bits=2048 \
        require_cn=false >/dev/null 2>&1; then
        log_success "  Created PKI role: hub-services (90-day max TTL)"
    else
        log_error "Failed to create hub-services PKI role"
        return 1
    fi

    # Apply PKI-specific hub policy
    if [ -f "${DIVE_ROOT}/vault_config/policies/pki-hub.hcl" ]; then
        vault policy write dive-v3-pki-hub "${DIVE_ROOT}/vault_config/policies/pki-hub.hcl" >/dev/null 2>&1
        log_success "  Applied policy: dive-v3-pki-hub"
    fi

    # Re-apply hub policy (now includes PKI paths)
    if [ -f "${DIVE_ROOT}/vault_config/policies/hub.hcl" ]; then
        vault policy write dive-v3-hub "${DIVE_ROOT}/vault_config/policies/hub.hcl" >/dev/null 2>&1
        log_success "  Updated policy: dive-v3-hub (with PKI paths)"
    fi

    echo ""
    log_success "Vault PKI setup complete!"
    log_info ""
    log_info "==================================================================="
    log_info "PKI Hierarchy:"
    log_info "  Root CA:         pki/     (CN=DIVE V3 Root CA, 10yr TTL)"
    log_info "  Intermediate CA: pki_int/ (CN=DIVE V3 Intermediate CA, 3yr TTL)"
    log_info "  Hub role:        hub-services (90-day cert TTL)"
    log_info ""
    log_info "Next steps:"
    log_info "  1. Set CERT_PROVIDER=vault in .env.hub"
    log_info "  2. Deploy hub:        ./dive hub deploy"
    log_info "  3. Provision spoke:   ./dive vault provision <CODE>"
    log_info "     (auto-creates spoke PKI role)"
    log_info "==================================================================="
}

##
# Provision a single spoke in Vault: policy, AppRole, secrets, .env sync
# Usage: ./dive vault provision <CODE>
##
module_vault_provision() {
    local spoke_code="${1:-}"

    if [ -z "$spoke_code" ]; then
        log_error "Usage: ./dive vault provision <CODE>"
        log_info "Example: ./dive vault provision FRA"
        return 1
    fi

    local code=$(lower "$spoke_code")
    local code_upper=$(upper "$spoke_code")

    # Reject hub instance
    if [ "$code" = "usa" ]; then
        log_error "Cannot provision USA as a spoke — it is the hub instance"
        log_info "Hub secrets are managed via: ./dive vault seed"
        return 1
    fi

    log_info "Provisioning spoke ${code_upper} in Vault..."

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

    # Check if unsealed
    if ! vault status 2>/dev/null | grep -q "Sealed.*false"; then
        log_error "Vault is sealed - check seal vault: ./dive vault seal-status"
        return 1
    fi

    # Source secrets module for vault_set_secret()/vault_get_secret()
    source "${DIVE_ROOT}/scripts/dive-modules/configuration/secrets.sh"

    local total_seeded=0
    local total_failed=0

    # ==========================================================================
    # Step 1: Generate policy from template
    # ==========================================================================
    log_info "Creating Vault policy for ${code_upper}..."

    local template="${DIVE_ROOT}/vault_config/policies/spoke-template.hcl"
    if [ ! -f "$template" ]; then
        log_error "Policy template not found: $template"
        return 1
    fi

    if sed "s/{{SPOKE_CODE}}/${code}/g" "$template" | vault policy write "dive-v3-spoke-${code}" - >/dev/null 2>&1; then
        log_success "  Created policy: dive-v3-spoke-${code}"
    else
        log_error "  Failed to create policy: dive-v3-spoke-${code}"
        return 1
    fi

    # ==========================================================================
    # Step 2: Create AppRole
    # ==========================================================================
    log_info "Creating AppRole for ${code_upper}..."

    if vault write "auth/approle/role/spoke-${code}" \
        token_policies="dive-v3-spoke-${code}" \
        token_ttl=1h \
        token_max_ttl=24h \
        secret_id_ttl=0 >/dev/null 2>&1; then
        log_success "  Created AppRole: spoke-${code}"
    else
        log_error "  Failed to create AppRole: spoke-${code}"
        return 1
    fi

    # Extract role_id and secret_id
    local role_id secret_id
    role_id=$(vault read -field=role_id "auth/approle/role/spoke-${code}/role-id" 2>/dev/null)
    secret_id=$(vault write -field=secret_id -f "auth/approle/role/spoke-${code}/secret-id" 2>/dev/null)

    if [ -z "$role_id" ] || [ -z "$secret_id" ]; then
        log_error "  Failed to generate AppRole credentials"
        return 1
    fi

    log_success "  AppRole credentials generated"

    # ==========================================================================
    # Step 2b: Create spoke PKI role (if PKI is enabled)
    # ==========================================================================
    if vault secrets list 2>/dev/null | grep -q "^pki_int/"; then
        log_info "Creating PKI role for ${code_upper}..."

        # Create spoke-specific PKI role (allow_any_name=true for Docker container hostnames)
        if vault write "pki_int/roles/spoke-${code}-services" \
            allow_any_name=true \
            allow_ip_sans=true \
            allow_localhost=true \
            max_ttl=2160h \
            key_type=rsa \
            key_bits=2048 \
            require_cn=false >/dev/null 2>&1; then
            log_success "  Created PKI role: spoke-${code}-services"
        else
            log_warn "  Failed to create PKI role (non-fatal, cert issuance may fail)"
        fi

        # Create PKI-specific spoke policy from template
        local pki_template="${DIVE_ROOT}/vault_config/policies/pki-spoke-template.hcl"
        if [ -f "$pki_template" ]; then
            if sed "s/{{SPOKE_CODE}}/${code}/g" "$pki_template" | \
                vault policy write "dive-v3-pki-spoke-${code}" - >/dev/null 2>&1; then
                log_success "  Applied policy: dive-v3-pki-spoke-${code}"
            else
                log_warn "  Failed to create PKI policy (non-fatal)"
            fi

            # Update AppRole to include PKI policy
            vault write "auth/approle/role/spoke-${code}" \
                token_policies="dive-v3-spoke-${code},dive-v3-pki-spoke-${code}" \
                token_ttl=1h \
                token_max_ttl=24h \
                secret_id_ttl=0 >/dev/null 2>&1 && \
                log_success "  Updated AppRole with PKI policy" || \
                log_warn "  Failed to update AppRole with PKI policy (non-fatal)"
        fi
    else
        log_verbose "PKI not enabled — skipping spoke PKI role (use: ./dive vault pki-setup)"
    fi

    # ==========================================================================
    # Step 2c: Create spoke database roles (if database engine is enabled)
    # ==========================================================================
    if vault secrets list 2>/dev/null | grep -q "^database/"; then
        _vault_db_provision_spoke "$code"

        # Add database policy to AppRole
        local current_policies
        current_policies=$(vault read -field=token_policies "auth/approle/role/spoke-${code}" 2>/dev/null || true)
        if [ -n "$current_policies" ]; then
            # Build policy list from current + db policy
            local db_policy="dive-v3-db-spoke-${code}"

            # Create spoke-specific DB policy from template concept
            # Spokes use the same spoke-template.hcl which now includes database paths
            # No separate db-spoke-template needed since spoke-template.hcl covers it

            log_verbose "  Database paths included in spoke policy via spoke-template.hcl"
        fi
    else
        log_verbose "Database engine not enabled — skipping spoke DB roles (use: ./dive vault db-setup)"
    fi

    # ==========================================================================
    # Step 3: Seed instance-specific secrets
    # ==========================================================================
    log_info "Seeding secrets for ${code_upper}..."

    local postgres_pw=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
    local mongodb_pw=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
    local redis_pw=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
    local keycloak_pw=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
    local nextauth_secret=$(openssl rand -base64 32)

    local secrets_data=(
        "core:${code}/postgres:{\"password\":\"${postgres_pw}\"}"
        "core:${code}/mongodb:{\"password\":\"${mongodb_pw}\"}"
        "core:${code}/redis:{\"password\":\"${redis_pw}\"}"
        "core:${code}/keycloak-admin:{\"password\":\"${keycloak_pw}\"}"
        "auth:${code}/nextauth:{\"secret\":\"${nextauth_secret}\"}"
    )

    for entry in "${secrets_data[@]}"; do
        local category="${entry%%:*}"
        local rest="${entry#*:}"
        local path="${rest%%:\{*}"
        local value="{${rest#*:\{}"

        if vault_set_secret "$category" "$path" "$value"; then
            total_seeded=$((total_seeded + 1))
        else
            total_failed=$((total_failed + 1))
            log_error "  Failed: dive-v3/${category}/${path}"
        fi
    done

    # ==========================================================================
    # Step 4: Generate federation pair secrets with existing instances
    # ==========================================================================
    log_info "Generating federation pair secrets..."

    # Discover existing instances by listing Vault core paths
    local existing_instances=()
    local vault_list
    vault_list=$(vault kv list -format=json dive-v3/core/ 2>/dev/null || echo "[]")
    while IFS= read -r inst; do
        inst="${inst%/}"  # Strip trailing slash
        [ -n "$inst" ] && [ "$inst" != "shared" ] && existing_instances+=("$inst")
    done < <(echo "$vault_list" | grep '"' | tr -d '", ')

    for other in "${existing_instances[@]}"; do
        [ "$other" = "$code" ] && continue  # Skip self
        # Alphabetical sort for consistent pair naming
        local pair
        if [[ "$code" < "$other" ]]; then
            pair="${code}-${other}"
        else
            pair="${other}-${code}"
        fi
        # Only create if pair doesn't already exist
        if ! vault_get_secret "federation" "$pair" "client-secret" >/dev/null 2>&1; then
            local fed_secret=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
            if vault_set_secret "federation" "$pair" "{\"client-secret\":\"${fed_secret}\"}"; then
                total_seeded=$((total_seeded + 1))
                log_verbose "  Seeded: dive-v3/federation/${pair}"
            else
                total_failed=$((total_failed + 1))
            fi
        else
            log_verbose "  Exists: dive-v3/federation/${pair}"
        fi
    done

    # ==========================================================================
    # Step 5: Sync to spoke .env file
    # ==========================================================================
    log_info "Syncing secrets to instance .env..."

    local spoke_dir="${DIVE_ROOT}/instances/${code}"
    local spoke_env="${spoke_dir}/.env"
    mkdir -p "$spoke_dir"

    # Read shared secrets from Vault
    local shared_client=$(vault_get_secret "auth" "shared/keycloak-client" "secret" 2>/dev/null || true)
    local shared_blacklist=$(vault_get_secret "core" "shared/redis-blacklist" "password" 2>/dev/null || true)
    local opal_token=$(vault_get_secret "opal" "master-token" "token" 2>/dev/null || true)

    # Create or update spoke .env
    [ ! -f "$spoke_env" ] && touch "$spoke_env"

    _vault_update_env "$spoke_env" "SECRETS_PROVIDER" "vault"
    _vault_update_env "$spoke_env" "VAULT_ADDR" "http://dive-hub-vault:8200"
    _vault_update_env "$spoke_env" "VAULT_ROLE_ID" "$role_id"
    _vault_update_env "$spoke_env" "VAULT_SECRET_ID" "$secret_id"
    _vault_update_env "$spoke_env" "POSTGRES_PASSWORD_${code_upper}" "$postgres_pw"
    _vault_update_env "$spoke_env" "MONGO_PASSWORD_${code_upper}" "$mongodb_pw"
    _vault_update_env "$spoke_env" "REDIS_PASSWORD_${code_upper}" "$redis_pw"
    _vault_update_env "$spoke_env" "KEYCLOAK_ADMIN_PASSWORD_${code_upper}" "$keycloak_pw"
    _vault_update_env "$spoke_env" "AUTH_SECRET_${code_upper}" "$nextauth_secret"
    _vault_update_env "$spoke_env" "KEYCLOAK_CLIENT_SECRET_${code_upper}" "$shared_client"
    _vault_update_env "$spoke_env" "KEYCLOAK_CLIENT_SECRET_USA" "$shared_client"
    _vault_update_env "$spoke_env" "REDIS_PASSWORD_BLACKLIST" "$shared_blacklist"
    _vault_update_env "$spoke_env" "OPAL_AUTH_MASTER_TOKEN" "$opal_token"

    log_success "Spoke .env synced: $spoke_env"

    # ==========================================================================
    # Step 6: Verify
    # ==========================================================================
    local verify_pw
    verify_pw=$(vault_get_secret "core" "${code}/postgres" "password" 2>/dev/null)
    if [ "$verify_pw" = "$postgres_pw" ]; then
        log_success "Verification passed: secrets readable by hub token"
    else
        log_warn "Verification: could not read back secret (may be a policy issue)"
    fi

    # ==========================================================================
    # Summary
    # ==========================================================================
    echo ""
    log_info "==================================================================="
    log_info "  Spoke ${code_upper} Provisioned in Vault"
    log_info "==================================================================="
    log_info "  Secrets seeded: $total_seeded"
    [ $total_failed -gt 0 ] && log_error "  Failed: $total_failed"
    log_info "  Policy:    dive-v3-spoke-${code}"
    log_info "  AppRole:   spoke-${code}"
    log_info "  Env file:  $spoke_env"
    log_info "  Next:      ./dive spoke deploy ${code_upper}"
    log_info "==================================================================="

    [ $total_failed -gt 0 ] && return 1
    return 0
}
export -f vault_spoke_is_provisioned

##
# Test secret rotation lifecycle (non-destructive)
#
# Validates:
#   1. Read current secret from Vault
#   2. Write new value
#   3. Read back and verify
#   4. Restore original value
#   5. Verify spoke still healthy
#
# Usage: ./dive vault test-rotation [CODE]
##
module_vault_test_rotation() {
    local target_code="${1:-DEU}"
    local code_lower=$(echo "$target_code" | tr '[:upper:]' '[:lower:]')

    # Load test framework
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh"
    else
        log_error "Testing framework not found"
        return 1
    fi

    # Ensure Vault is running and unsealed
    if ! vault_is_running; then return 1; fi
    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    fi

    test_suite_start "Secret Rotation Test (${target_code})"

    # Step 1: Read current Redis password from Vault
    test_start "Read current secret from Vault"
    local secret_path="dive-v3/core/${code_lower}/redis"
    local original_value
    original_value=$(vault kv get -field=password "$secret_path" 2>/dev/null)
    if [ -n "$original_value" ]; then
        test_pass
    else
        test_fail "Cannot read $secret_path"
        test_suite_end
        return 1
    fi

    # Step 2: Write new test value
    test_start "Write rotated secret to Vault"
    local test_value="rotation-test-$(date +%s)"
    if vault kv put "$secret_path" password="$test_value" >/dev/null 2>&1; then
        test_pass
    else
        test_fail "Cannot write to $secret_path"
        test_suite_end
        return 1
    fi

    # Step 3: Read back and verify
    test_start "Readback matches rotated value"
    local readback
    readback=$(vault kv get -field=password "$secret_path" 2>/dev/null)
    if [ "$readback" = "$test_value" ]; then
        test_pass
    else
        test_fail "Readback mismatch (expected: $test_value, got: $readback)"
    fi

    # Step 4: Restore original value (non-destructive)
    test_start "Restore original secret"
    if vault kv put "$secret_path" password="$original_value" >/dev/null 2>&1; then
        test_pass
    else
        test_fail "Cannot restore original value"
    fi

    # Step 5: Verify restore
    test_start "Restored value matches original"
    local restored
    restored=$(vault kv get -field=password "$secret_path" 2>/dev/null)
    if [ "$restored" = "$original_value" ]; then
        test_pass
    else
        test_fail "Restore mismatch"
    fi

    # Step 6: Spoke health check (verify nothing broken)
    test_start "${target_code}: Spoke still healthy after rotation"
    if type -t spoke_verify &>/dev/null; then
        if spoke_verify "$target_code" >/dev/null 2>&1; then
            test_pass
        else
            test_fail "Spoke verification failed"
        fi
    else
        test_skip "spoke_verify not available"
    fi

    test_suite_end
}

##
# Test Vault backup/restore lifecycle
#
# Validates:
#   1. Create Raft snapshot
#   2. Snapshot file exists
#   3. Snapshot is non-empty
#   4. Secrets still readable after snapshot
#   5. List all snapshots
#
# Usage: ./dive vault test-backup
##
module_vault_test_backup() {
    if _vault_is_dev_mode; then
        log_info "Skipping backup test in dev mode (no Raft storage)"
        return 0
    fi
    # Load test framework
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh"
    else
        log_error "Testing framework not found"
        return 1
    fi

    # Ensure Vault is running and unsealed
    if ! vault_is_running; then return 1; fi
    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    fi

    test_suite_start "Vault Backup/Restore Validation"

    # Step 1: Create Raft snapshot (try each port — standby redirects to Docker hostname)
    test_start "Create Raft snapshot"
    local backup_dir="${DIVE_ROOT}/backups/vault"
    local snapshot_path="${backup_dir}/vault-test-$(date +%Y%m%d-%H%M%S).snap"
    mkdir -p "$backup_dir"
    local _snap_ok=false
    for _p in 8200 8202 8204; do
        if VAULT_ADDR="http://localhost:${_p}" vault operator raft snapshot save "$snapshot_path" 2>/dev/null; then
            _snap_ok=true
            break
        fi
    done
    if [ "$_snap_ok" = true ]; then
        test_pass
    else
        test_fail "Snapshot creation failed"
        test_suite_end
        return 1
    fi

    # Step 2: Snapshot file exists
    test_start "Snapshot file exists"
    if [ -f "$snapshot_path" ]; then
        test_pass
    else
        test_fail "File not found: $snapshot_path"
    fi

    # Step 3: Snapshot is non-empty
    test_start "Snapshot is non-empty"
    local snap_size
    snap_size=$(du -h "$snapshot_path" 2>/dev/null | awk '{print $1}')
    local snap_bytes
    snap_bytes=$(wc -c < "$snapshot_path" 2>/dev/null | tr -d ' ')
    if [ "${snap_bytes:-0}" -gt 0 ] 2>/dev/null; then
        test_pass
    else
        test_fail "Snapshot is empty"
    fi

    # Step 4: Secrets still readable after snapshot
    test_start "Secrets readable after snapshot"
    local test_read
    test_read=$(vault kv get -field=password "dive-v3/core/usa/postgres" 2>/dev/null)
    if [ -n "$test_read" ]; then
        test_pass
    else
        test_fail "Cannot read dive-v3/core/usa/postgres"
    fi

    # Step 5: List all snapshots
    test_start "Backup directory has snapshots"
    local snap_count=0
    if [ -d "$backup_dir" ]; then
        snap_count=$(ls -1 "$backup_dir"/*.snap 2>/dev/null | wc -l | tr -d ' ')
    fi
    if [ "${snap_count:-0}" -gt 0 ] 2>/dev/null; then
        test_pass
    else
        test_fail "No snapshots found in $backup_dir"
    fi

    # Summary info
    echo ""
    echo "  Snapshot: $snapshot_path ($snap_size)"
    echo "  Total backups: $snap_count"

    test_suite_end
}

##
# Migrate from Shamir to Transit auto-unseal (delegates to migration script)
##
module_vault_migrate() {
    local migrate_script="${DIVE_ROOT}/scripts/migrate-vault-to-ha.sh"
    if [ ! -f "$migrate_script" ]; then
        log_error "Migration script not found: $migrate_script"
        return 1
    fi
    bash "$migrate_script" "$@"
}

# =============================================================================
# HA Cluster Tests
# =============================================================================

##
# Test HA failover: stop leader, verify secret readable from follower, restart
##
module_vault_test_ha_failover() {
    if _vault_is_dev_mode; then
        log_info "Skipping HA failover test in dev mode (single node)"
        return 0
    fi
    # Load test framework
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh"
    else
        log_error "Testing framework not found"
        return 1
    fi

    test_suite_start "Vault HA Failover"

    if [ ! -f "$VAULT_TOKEN_FILE" ]; then
        log_error "No Vault token found"
        return 1
    fi

    VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
    export VAULT_TOKEN

    # Test 1: Write a test secret
    test_start "Write test secret"
    local test_key="ha-failover-test-$(date +%s)"
    if vault kv put dive-v3/core/ha-test value="$test_key" >/dev/null 2>&1; then
        test_pass
    else
        test_fail "Failed to write test secret"
        test_suite_end
        return 1
    fi

    # Test 2: Identify and stop leader
    test_start "Stop leader node"
    local leader_container=""
    for port in 8200 8202 8204; do
        local is_self
        is_self=$(VAULT_ADDR="http://localhost:$port" VAULT_TOKEN="$VAULT_TOKEN" \
            vault read -format=json sys/leader 2>/dev/null | \
            grep -o '"is_self": *[a-z]*' | sed 's/.*: *//' || echo "false")
        if [ "$is_self" = "true" ]; then
            case $port in
                8200) leader_container="${COMPOSE_PROJECT_NAME:-dive-hub}-vault-1" ;;
                8202) leader_container="${COMPOSE_PROJECT_NAME:-dive-hub}-vault-2" ;;
                8204) leader_container="${COMPOSE_PROJECT_NAME:-dive-hub}-vault-3" ;;
            esac
            break
        fi
    done

    if [ -z "$leader_container" ]; then
        test_fail "Could not identify leader"
        test_suite_end
        return 1
    fi

    docker stop "$leader_container" >/dev/null 2>&1
    test_pass

    # Test 3: Wait for re-election and verify read from follower
    test_start "Read secret after leader loss"
    sleep 10  # Wait for Raft re-election

    local read_success=false
    for port in 8200 8202 8204; do
        local val
        val=$(VAULT_ADDR="http://localhost:$port" VAULT_TOKEN="$VAULT_TOKEN" \
            vault kv get -field=value dive-v3/core/ha-test 2>/dev/null || true)
        if [ "$val" = "$test_key" ]; then
            read_success=true
            break
        fi
    done

    if [ "$read_success" = true ]; then
        test_pass
    else
        test_fail "Could not read secret from any surviving node"
    fi

    # Test 4: Restart stopped leader
    test_start "Restart stopped node"
    docker start "$leader_container" >/dev/null 2>&1
    sleep 10

    if docker ps --format '{{.Names}}' | grep -q "$leader_container"; then
        test_pass
    else
        test_fail "Node failed to restart"
    fi

    # Test 5: Verify cluster reforms (3 peers)
    test_start "Verify 3-peer cluster"
    local peer_count
    peer_count=$(vault operator raft list-peers -format=json 2>/dev/null | \
        grep -c '"node_id"' || echo "0")

    if [ "$peer_count" -ge 3 ]; then
        test_pass
    else
        test_skip "Only $peer_count peers (may still be rejoining)"
    fi

    # Cleanup
    vault kv delete dive-v3/core/ha-test >/dev/null 2>&1 || true

    test_suite_end
}

##
# Test seal vault restart: verify cluster stays unsealed when seal vault restarts
##
module_vault_test_seal_restart() {
    if _vault_is_dev_mode; then
        log_info "Skipping seal restart test in dev mode (no seal vault)"
        return 0
    fi
    # Load test framework
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh"
    else
        log_error "Testing framework not found"
        return 1
    fi

    test_suite_start "Vault Seal Restart Resilience"

    local seal_container="${COMPOSE_PROJECT_NAME:-dive-hub}-vault-seal"

    # Test 1: Stop seal vault
    test_start "Stop seal vault"
    docker stop "$seal_container" >/dev/null 2>&1
    test_pass

    # Test 2: Verify cluster nodes stay unsealed
    test_start "Cluster stays unsealed without seal vault"
    sleep 3
    if vault status 2>/dev/null | grep -q "Sealed.*false"; then
        test_pass
    else
        test_fail "Cluster became sealed"
    fi

    # Test 3: Restart seal vault
    test_start "Restart seal vault"
    docker start "$seal_container" >/dev/null 2>&1
    sleep 10
    if docker compose -f docker-compose.hub.yml ps vault-seal 2>/dev/null | grep -q "healthy"; then
        test_pass
    else
        test_skip "Seal vault may still be starting"
    fi

    # Test 4: Restart a cluster node — verify it auto-unseals
    test_start "Restart vault-1, verify auto-unseal"
    local node_container="${COMPOSE_PROJECT_NAME:-dive-hub}-vault-1"
    docker restart "$node_container" >/dev/null 2>&1
    sleep 15

    if VAULT_ADDR="http://localhost:8200" vault status 2>/dev/null | grep -q "Sealed.*false"; then
        test_pass
    else
        test_fail "vault-1 did not auto-unseal"
    fi

    test_suite_end
}

##
# Test full cluster restart: stop everything, restart in order, verify data intact
##
module_vault_test_full_restart() {
    if _vault_is_dev_mode; then
        log_info "Skipping full restart test in dev mode (single node)"
        return 0
    fi
    # Load test framework
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh"
    else
        log_error "Testing framework not found"
        return 1
    fi

    test_suite_start "Vault Full Cluster Restart"

    if [ ! -f "$VAULT_TOKEN_FILE" ]; then
        log_error "No Vault token found"
        return 1
    fi

    VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
    export VAULT_TOKEN

    local seal_container="${COMPOSE_PROJECT_NAME:-dive-hub}-vault-seal"

    # Test 1: Write a canary secret
    test_start "Write canary secret"
    local canary="full-restart-$(date +%s)"
    if vault kv put dive-v3/core/restart-test value="$canary" >/dev/null 2>&1; then
        test_pass
    else
        test_fail "Failed to write canary"
        test_suite_end
        return 1
    fi

    # Test 2: Stop all 4 vault containers
    test_start "Stop all vault containers"
    docker stop "${COMPOSE_PROJECT_NAME:-dive-hub}-vault-3" \
        "${COMPOSE_PROJECT_NAME:-dive-hub}-vault-2" \
        "${COMPOSE_PROJECT_NAME:-dive-hub}-vault-1" \
        "$seal_container" >/dev/null 2>&1
    test_pass

    # Test 3: Restart in correct order
    test_start "Restart seal vault first"
    docker start "$seal_container" >/dev/null 2>&1
    sleep 10
    if docker ps --format '{{.Names}}' | grep -q "$seal_container"; then
        test_pass
    else
        test_fail "Seal vault failed to start"
        test_suite_end
        return 1
    fi

    test_start "Restart cluster nodes"
    docker start "${COMPOSE_PROJECT_NAME:-dive-hub}-vault-1" \
        "${COMPOSE_PROJECT_NAME:-dive-hub}-vault-2" \
        "${COMPOSE_PROJECT_NAME:-dive-hub}-vault-3" >/dev/null 2>&1
    sleep 20  # Wait for auto-unseal + Raft election

    if vault status 2>/dev/null | grep -q "Sealed.*false"; then
        test_pass
    else
        test_fail "Cluster did not auto-unseal"
        test_suite_end
        return 1
    fi

    # Test 4: Verify canary secret
    test_start "Verify canary secret after restart"
    local read_val
    read_val=$(vault kv get -field=value dive-v3/core/restart-test 2>/dev/null || true)
    if [ "$read_val" = "$canary" ]; then
        test_pass
    else
        test_fail "Canary mismatch: expected '$canary', got '$read_val'"
    fi

    # Cleanup
    vault kv delete dive-v3/core/restart-test >/dev/null 2>&1 || true

    test_suite_end
}

##
# Test Vault PKI certificate lifecycle
# Validates Root CA, Intermediate CA, cert issuance, SANs, chain verification
# Usage: ./dive vault test-pki
##
module_vault_test_pki() {
    # Load test framework
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh"
    else
        log_error "Testing framework not found"
        return 1
    fi

    source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"

    test_suite_start "Vault PKI Certificate Automation"

    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    fi

    # Test 1: Root CA exists
    test_start "Root CA exists in pki/"
    local root_ca_pem
    root_ca_pem=$(vault read -field=certificate pki/cert/ca 2>/dev/null || true)
    if [ -n "$root_ca_pem" ] && echo "$root_ca_pem" | grep -q "BEGIN CERTIFICATE"; then
        test_pass
    else
        test_fail "No Root CA found in pki/"
    fi

    # Test 2: Intermediate CA exists
    test_start "Intermediate CA exists in pki_int/"
    local int_ca_pem
    int_ca_pem=$(vault read -field=certificate pki_int/cert/ca 2>/dev/null || true)
    if [ -n "$int_ca_pem" ] && echo "$int_ca_pem" | grep -q "BEGIN CERTIFICATE"; then
        test_pass
    else
        test_fail "No Intermediate CA found in pki_int/"
    fi

    # Test 3: Issue hub certificate
    test_start "Issue hub certificate via hub-services role"
    local test_dir
    test_dir=$(mktemp -d)
    if _vault_pki_issue_cert "hub-services" "test-hub-pki" \
        "localhost dive-hub-keycloak dive-hub-backend" "127.0.0.1,::1" \
        "$test_dir" "1h"; then
        test_pass
    else
        test_fail "Hub cert issuance failed"
        rm -rf "$test_dir"
        test_suite_end
        return 1
    fi

    # Test 4: Certificate files present
    test_start "Certificate files present (certificate.pem, key.pem, ca/rootCA.pem)"
    if [ -f "$test_dir/certificate.pem" ] && [ -f "$test_dir/key.pem" ] && [ -f "$test_dir/ca/rootCA.pem" ]; then
        test_pass
    else
        test_fail "Missing certificate files in $test_dir"
    fi

    # Test 5: Certificate has expected SANs
    test_start "Certificate has expected SANs"
    if openssl x509 -in "$test_dir/certificate.pem" -noout -text 2>/dev/null | grep -q "dive-hub-keycloak"; then
        test_pass
    else
        test_fail "SAN 'dive-hub-keycloak' not found in certificate"
    fi

    # Test 6: CA chain validates certificate
    test_start "CA chain validates certificate"
    if openssl verify -CAfile "$test_dir/ca/rootCA.pem" "$test_dir/certificate.pem" 2>/dev/null | grep -q "OK"; then
        test_pass
    else
        test_fail "Certificate verification failed against CA chain"
    fi

    # Test 7: Java truststore generation
    test_start "Java truststore generation"
    if command -v keytool &>/dev/null; then
        if _generate_truststore_from_ca "$test_dir/ca/rootCA.pem" "$test_dir" && \
           [ -f "$test_dir/truststore.p12" ]; then
            test_pass
        else
            test_fail "truststore.p12 not created"
        fi
    else
        test_skip "keytool not available"
    fi

    # Cleanup
    rm -rf "$test_dir"

    test_suite_end
}

##
# Test Vault monitoring infrastructure
# Validates: telemetry endpoint, key metrics, all nodes, Prometheus config, snapshot
# Usage: ./dive vault test-monitoring
##
module_vault_test_monitoring() {
    # Load test framework
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh"
    else
        log_error "Testing framework not found"
        return 1
    fi

    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    fi

    test_suite_start "Vault Monitoring Infrastructure"

    # Test 1: Metrics endpoint returns 200
    test_start "Vault metrics endpoint responds (vault-1)"
    local metrics_response
    metrics_response=$(curl -sf "http://localhost:8200/v1/sys/metrics?format=prometheus" 2>/dev/null || true)
    if [ -n "$metrics_response" ]; then
        test_pass
    else
        test_fail "No response from http://localhost:8200/v1/sys/metrics?format=prometheus"
    fi

    # Test 2: Key metric present (vault_core_unsealed)
    test_start "Key metric vault_core_unsealed present"
    if echo "$metrics_response" | grep -q "vault_core_unsealed"; then
        test_pass
    else
        test_fail "vault_core_unsealed not found in metrics output"
    fi

    # Test 3: All 4 nodes respond on metrics endpoint
    test_start "All 4 Vault nodes expose metrics"
    local nodes_ok=0
    local node_ports=(8200 8202 8204 8210)
    for port in "${node_ports[@]}"; do
        if curl -sf "http://localhost:${port}/v1/sys/metrics?format=prometheus" >/dev/null 2>&1; then
            nodes_ok=$((nodes_ok + 1))
        fi
    done
    if [ "$nodes_ok" -eq 4 ]; then
        test_pass
    else
        test_fail "Only ${nodes_ok}/4 nodes responding on metrics endpoint"
    fi

    # Test 4: Prometheus config has vault-cluster job
    test_start "Prometheus config has vault-cluster scrape job"
    local prom_config="${DIVE_ROOT}/monitoring/prometheus.yml"
    if [ -f "$prom_config" ] && grep -q "vault-cluster" "$prom_config"; then
        test_pass
    else
        test_fail "vault-cluster job not found in $prom_config"
    fi

    # Test 5: Alert rules file exists and has vault rules
    test_start "Vault alert rules configured"
    local alerts_file="${DIVE_ROOT}/monitoring/alerts/vault-alerts.yml"
    if [ -f "$alerts_file" ] && grep -q "VaultNodeSealed" "$alerts_file"; then
        test_pass
    else
        test_fail "Vault alert rules not found at $alerts_file"
    fi

    # Test 6: Grafana dashboard exists
    test_start "Vault Grafana dashboard exists"
    local dashboard_file="${DIVE_ROOT}/monitoring/dashboards/vault-cluster.json"
    if [ -f "$dashboard_file" ] && grep -q "vault-ha-cluster" "$dashboard_file"; then
        test_pass
    else
        test_fail "Vault dashboard not found at $dashboard_file"
    fi

    # Test 7: Snapshot command works (try each port — standby nodes redirect to Docker-internal leader hostname)
    test_start "Vault snapshot command succeeds"
    local test_snap="${DIVE_ROOT}/backups/vault/vault-monitoring-test-$(date +%s).snap"
    mkdir -p "$(dirname "$test_snap")"
    local snap_ok=false
    for snap_port in 8200 8202 8204; do
        if VAULT_ADDR="http://localhost:${snap_port}" vault operator raft snapshot save "$test_snap" 2>/dev/null; then
            snap_ok=true
            break
        fi
    done
    if [ "$snap_ok" = true ]; then
        local snap_size
        snap_size=$(wc -c < "$test_snap" 2>/dev/null | tr -d ' ')
        if [ "${snap_size:-0}" -gt 0 ] 2>/dev/null; then
            test_pass
        else
            test_fail "Snapshot file is empty"
        fi
        rm -f "$test_snap"
    else
        test_fail "vault operator raft snapshot save failed on all ports"
    fi

    test_suite_end
}

##
# Show current Vault environment configuration
##
module_vault_env() {
    local vault_profile
    vault_profile=$(_vault_get_profile)
    local is_dev="no"
    _vault_is_dev_mode && is_dev="yes"

    echo ""
    echo "==================================================================="
    echo "  Vault Environment Configuration"
    echo "==================================================================="
    echo ""
    echo "  DIVE_ENV:          ${DIVE_ENV:-local} (default: local)"
    echo "  Vault Profile:     ${vault_profile}"
    echo "  Dev Mode:          ${is_dev}"
    echo "  VAULT_ADDR:        ${VAULT_ADDR}"
    echo "  VAULT_CLI_ADDR:    ${VAULT_CLI_ADDR:-not set}"
    echo "  SECRETS_PROVIDER:  ${SECRETS_PROVIDER:-not set}"
    echo ""

    if [ "$is_dev" = "yes" ]; then
        echo "  Topology:          Single node (in-memory)"
        echo "  Root Token:        root"
        echo "  TLS:               Disabled"
        echo "  Audit:             Optional"
        echo "  Data Persistence:  None (re-seeded each deploy)"
    else
        echo "  Topology:          4-node HA (seal + 3 Raft)"
        echo "  Auto-Unseal:       Transit (via vault-seal)"
        if is_production_mode; then
            echo "  TLS:               Mandatory"
            echo "  Audit:             Mandatory"
        else
            echo "  TLS:               Optional"
            echo "  Audit:             Optional"
        fi
        echo "  Data Persistence:  Raft volumes"
    fi
    echo ""
    echo "==================================================================="
}

##
# Test multi-environment Vault configuration
##
module_vault_test_env() {
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh"
    fi

    local vault_profile
    vault_profile=$(_vault_get_profile)

    test_suite_start "Vault Multi-Environment Configuration"

    # Test 1: Profile function returns expected value
    test_start "Profile detection for DIVE_ENV=${DIVE_ENV:-local}"
    if [ -n "$vault_profile" ]; then
        test_pass "profile=$vault_profile"
    else
        test_fail "No profile returned"
    fi

    # Test 2: Vault is running (correct container type)
    test_start "Vault container running (profile: $vault_profile)"
    if vault_is_running; then
        test_pass
    else
        test_fail "Vault not running"
    fi

    # Test 3: Vault is unsealed
    test_start "Vault is unsealed"
    if vault status 2>/dev/null | grep -q "Sealed.*false"; then
        test_pass
    else
        test_fail "Vault is sealed or not responding"
    fi

    # Test 4: Can read/write secrets
    test_start "Secret read/write functional"
    if vault kv put dive-v3/core/env-test value="test-$(date +%s)" >/dev/null 2>&1; then
        vault kv delete dive-v3/core/env-test >/dev/null 2>&1
        test_pass
    else
        test_fail "Cannot write secrets"
    fi

    # Test 5+: Mode-specific checks
    if _vault_is_dev_mode; then
        test_start "Dev mode: root token works"
        if VAULT_TOKEN=root vault status >/dev/null 2>&1; then
            test_pass
        else
            test_fail "Root token 'root' not accepted"
        fi
    else
        test_start "HA mode: 3 Raft peers"
        local peers
        peers=$(vault operator raft list-peers -format=json 2>/dev/null | grep -c '"node_id"' || echo "0")
        if [ "$peers" -ge 3 ]; then
            test_pass "$peers peers"
        else
            test_fail "Only $peers Raft peers (expected 3)"
        fi

        test_start "HA mode: Seal vault healthy"
        if docker ps --format '{{.Names}}' | grep -q "vault-seal"; then
            test_pass
        else
            test_fail "Seal vault not running"
        fi
    fi

    test_suite_end
}

##
# Main module dispatcher
##
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
        help|--help|-h)
            echo "Usage: ./dive vault <command>"
            echo ""
            echo "Commands:"
            echo "  init                Initialize Vault (dev: auto, HA: recovery keys)"
            echo "  status              Check Vault health (dev or HA cluster)"
            echo "  setup               Configure mount points and hub policy"
            echo "  seed                Generate and store hub (USA) + shared secrets"
            echo "  provision <CODE>    Provision a spoke: policy, AppRole, secrets, .env"
            echo "  env                 Show current Vault environment (dev/staging/prod)"
            echo "  trust-ca            Install Vault Root CA in system trust store"
            echo "  untrust-ca          Remove Vault Root CA from system trust store"
            echo "  pki-setup           Setup PKI Root CA + Intermediate CA (one-time)"
            echo "  db-setup            Setup database secrets engine (one-time)"
            echo "  db-status           Show database engine status and roles"
            echo "  snapshot [path]     Create Raft snapshot backup (HA only)"
            echo "  restore <path>      Restore from Raft snapshot (HA only)"
            echo "  backup-run          Create snapshot + prune old (${VAULT_BACKUP_RETENTION_DAYS:-7}-day retention)"
            echo "  backup-list         List all snapshots with size/date"
            echo "  backup-schedule     Enable/disable daily automated backups"
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
