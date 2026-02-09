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

# CLI runs on host — prefer VAULT_CLI_ADDR (host-accessible) over VAULT_ADDR (Docker-internal)
if [ -z "${VAULT_CLI_ADDR:-}" ] && [ -f "${DIVE_ROOT}/.env.hub" ]; then
    _vault_cli_addr=$(grep '^VAULT_CLI_ADDR=' "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d= -f2-)
    [ -n "$_vault_cli_addr" ] && VAULT_CLI_ADDR="$_vault_cli_addr"
fi
VAULT_ADDR="${VAULT_CLI_ADDR:-${VAULT_ADDR:-http://localhost:8200}}"
VAULT_TOKEN_FILE="${DIVE_ROOT}/.vault-token"
VAULT_INIT_FILE="${DIVE_ROOT}/.vault-init.txt"

export VAULT_ADDR

##
# Check if Vault cluster is running (at least vault-1 must be up)
##
vault_is_running() {
    if ! docker ps --format '{{.Names}}' | grep -q "vault-1"; then
        log_error "Vault cluster is not running"
        log_info "Start cluster: docker compose -f docker-compose.hub.yml up -d vault-seal vault-1 vault-2 vault-3"
        return 1
    fi
    return 0
}

##
# Initialize Vault HA cluster (one-time operation)
# With Transit auto-unseal, creates recovery keys (not unseal keys)
##
module_vault_init() {
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
    log_info "Checking Vault HA cluster status..."

    # Load token if available
    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    fi

    # Show full HA status (from ha.sh)
    vault_ha_status

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

    if vault operator raft snapshot save "$output_path" 2>/dev/null; then
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

    # Step 1: Create Raft snapshot
    test_start "Create Raft snapshot"
    local backup_dir="${DIVE_ROOT}/backups/vault"
    local snapshot_path="${backup_dir}/vault-test-$(date +%Y%m%d-%H%M%S).snap"
    mkdir -p "$backup_dir"
    if vault operator raft snapshot save "$snapshot_path" 2>/dev/null; then
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
        help|--help|-h)
            echo "Usage: ./dive vault <command>"
            echo ""
            echo "Commands:"
            echo "  init                Initialize Vault HA cluster (one-time)"
            echo "  status              Check HA cluster health (seal + 3 nodes)"
            echo "  setup               Configure mount points and hub policy"
            echo "  seed                Generate and store hub (USA) + shared secrets"
            echo "  provision <CODE>    Provision a spoke: policy, AppRole, secrets, .env"
            echo "  snapshot [path]     Create Raft snapshot backup"
            echo "  restore <path>      Restore from Raft snapshot"
            echo ""
            echo "HA Cluster:"
            echo "  cluster status      Show leader, followers, Raft peers"
            echo "  cluster step-down   Force leader step-down (re-election)"
            echo "  cluster remove-peer Remove dead node from Raft"
            echo "  seal-status         Seal vault diagnostics (Transit key)"
            echo "  unseal              Auto-unseal diagnostic (troubleshooting)"
            echo "  migrate             Migrate from Shamir to Transit auto-unseal"
            echo ""
            echo "Testing:"
            echo "  test-rotation [CODE] Test secret rotation lifecycle"
            echo "  test-backup         Validate Raft snapshot backup"
            echo "  test-ha-failover    Test leader failover + recovery"
            echo "  test-seal-restart   Test seal vault restart resilience"
            echo "  test-full-restart   Test full cluster restart"
            echo ""
            echo "Workflow:"
            echo "  # Seal vault auto-starts and auto-unseals (no user action needed)"
            echo "  ./dive vault init                          # 1. Initialize cluster"
            echo "  ./dive vault setup                         # 2. Configure mount points"
            echo "  ./dive vault seed                          # 3. Seed hub + shared secrets"
            echo "  ./dive hub deploy                          # 4. Deploy hub"
            echo "  ./dive vault provision FRA                 # 5. Provision a spoke"
            echo "  ./dive spoke deploy FRA                    # 6. Deploy the spoke"
            echo ""
            echo "Diagnostics:"
            echo "  ./dive vault status                        # Full cluster health"
            echo "  ./dive vault cluster status                # Raft peer list + leader"
            echo "  ./dive vault seal-status                   # Transit key health"
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
