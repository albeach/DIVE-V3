#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Vault CLI Module
# =============================================================================
# Purpose: HashiCorp Vault initialization, unsealing, and management commands
# Usage:
#   ./dive vault init      # One-time Vault initialization
#   ./dive vault unseal    # Unseal Vault after restart
#   ./dive vault status    # Check Vault health
#   ./dive vault setup     # Configure mount points and policies
#
# Notes:
#   - Vault must be running (docker compose -f docker-compose.hub.yml up vault)
#   - Unseal keys stored locally in .vault-init.txt (chmod 600)
#   - Root token stored in .vault-token (gitignored)
#   - No cloud dependencies required (GCP backup optional)
# =============================================================================

set -euo pipefail

# Source common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="${DIVE_ROOT:-$(cd "${SCRIPT_DIR}/../../.." && pwd)}"

source "${DIVE_ROOT}/scripts/dive-modules/common.sh"

# CLI runs on host — prefer VAULT_CLI_ADDR (host-accessible) over VAULT_ADDR (Docker-internal)
if [ -z "${VAULT_CLI_ADDR:-}" ] && [ -f "${DIVE_ROOT}/.env.hub" ]; then
    _vault_cli_addr=$(grep '^VAULT_CLI_ADDR=' "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d= -f2-)
    [ -n "$_vault_cli_addr" ] && VAULT_CLI_ADDR="$_vault_cli_addr"
fi
VAULT_ADDR="${VAULT_CLI_ADDR:-${VAULT_ADDR:-http://127.0.0.1:8200}}"
VAULT_TOKEN_FILE="${DIVE_ROOT}/.vault-token"
VAULT_INIT_FILE="${DIVE_ROOT}/.vault-init.txt"

export VAULT_ADDR

##
# Check if Vault is running
##
vault_is_running() {
    if ! docker ps --format '{{.Names}}' | grep -q "dive-hub-vault"; then
        log_error "Vault container is not running"
        log_info "Start Vault with: docker compose -f docker-compose.hub.yml up -d vault"
        return 1
    fi
    return 0
}

##
# Initialize Vault (one-time operation)
# Creates unseal keys and root token, stored locally
##
module_vault_init() {
    log_info "Initializing HashiCorp Vault..."

    if ! vault_is_running; then
        return 1
    fi

    # Check if already initialized
    if vault status >/dev/null 2>&1; then
        log_warn "Vault is already initialized"
        if [ -f "$VAULT_INIT_FILE" ]; then
            log_info "Initialization data exists at: $VAULT_INIT_FILE"
        fi
        return 0
    fi

    # Initialize Vault with 5 key shares, 3 threshold
    log_info "Initializing Vault with 5 key shares (threshold: 3)..."
    vault operator init -key-shares=5 -key-threshold=3 > "$VAULT_INIT_FILE"

    if [ ! -f "$VAULT_INIT_FILE" ]; then
        log_error "Failed to initialize Vault"
        return 1
    fi

    chmod 600 "$VAULT_INIT_FILE"

    # Extract root token
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

    log_success "Vault initialized successfully"
    log_info "Root token saved to: $VAULT_TOKEN_FILE"
    log_info "Unseal keys saved to: $VAULT_INIT_FILE"

    log_info ""
    log_info "==================================================================="
    log_info "IMPORTANT: Next steps"
    log_info "==================================================================="
    log_info "1. Unseal Vault:       ./dive vault unseal"
    log_info "2. Configure Vault:    ./dive vault setup"
    log_info ""
    log_warn "Keep $VAULT_INIT_FILE in a secure location!"
    log_warn "Anyone with these keys can unseal your Vault."
    log_info "==================================================================="
}

##
# Unseal Vault using keys from local init file
##
module_vault_unseal() {
    log_info "Unsealing Vault..."

    if ! vault_is_running; then
        return 1
    fi

    # Check if already unsealed
    if vault status 2>/dev/null | grep -q "Sealed.*false"; then
        log_success "Vault is already unsealed"
        return 0
    fi

    # Read unseal keys from local init file
    if [ ! -f "$VAULT_INIT_FILE" ]; then
        log_error "Vault init file not found: $VAULT_INIT_FILE"
        log_info "Run './dive vault init' first, or provide the init file"
        return 1
    fi

    log_info "Reading unseal keys from $VAULT_INIT_FILE..."

    local unseal_keys=($(grep 'Unseal Key' "$VAULT_INIT_FILE" | awk '{print $4}'))

    if [ ${#unseal_keys[@]} -lt 3 ]; then
        log_error "Need at least 3 unseal keys, found ${#unseal_keys[@]}"
        return 1
    fi

    log_info "Unsealing Vault (applying 3 of ${#unseal_keys[@]} keys)..."

    for i in 0 1 2; do
        local key_num=$((i+1))
        if vault operator unseal "${unseal_keys[$i]}" >/dev/null 2>&1; then
            log_verbose "  ✓ Unseal key $key_num applied"
        else
            log_error "Failed to apply unseal key $key_num"
            return 1
        fi
    done

    # Verify unsealed
    if vault status 2>/dev/null | grep -q "Sealed.*false"; then
        log_success "Vault unsealed successfully"
    else
        log_error "Vault unsealing failed"
        return 1
    fi
}

##
# Check Vault status
##
module_vault_status() {
    log_info "Checking Vault status..."

    if ! vault_is_running; then
        return 1
    fi

    # Load token if available
    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    fi

    echo ""
    vault status
    echo ""

    # Check seal status
    if vault status 2>/dev/null | grep -q "Sealed.*false"; then
        log_success "Vault is unsealed and ready"
    else
        log_warn "Vault is sealed - run: ./dive vault unseal"
    fi

    # Check if authenticated
    if [ -n "$VAULT_TOKEN" ]; then
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
        log_error "Vault is sealed - run: ./dive vault unseal"
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

    # Create spoke policies (uses configurable DIVE_SPOKE_LIST)
    local spokes=(${DIVE_SPOKE_LIST:-gbr fra deu can})
    for spoke in "${spokes[@]}"; do
        if vault policy write "dive-v3-spoke-${spoke}" \
            "${DIVE_ROOT}/vault_config/policies/spoke-${spoke}.hcl" >/dev/null 2>&1; then
            log_success "  ✓ Created policy: dive-v3-spoke-${spoke}"
        else
            log_warn "  ✗ Failed to create policy: dive-v3-spoke-${spoke}"
        fi
    done

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

    log_info "Creating AppRoles for spokes..."

    # Create AppRoles for each spoke
    for spoke in "${spokes[@]}"; do
        if vault write "auth/approle/role/spoke-${spoke}" \
            token_policies="dive-v3-spoke-${spoke}" \
            token_ttl=1h \
            token_max_ttl=24h \
            secret_id_ttl=0 >/dev/null 2>&1; then
            log_success "  ✓ Created AppRole: spoke-${spoke}"

            # Generate role_id and secret_id for this spoke
            local role_id
            local secret_id

            role_id=$(vault read -field=role_id "auth/approle/role/spoke-${spoke}/role-id" 2>/dev/null)
            secret_id=$(vault write -field=secret_id -f "auth/approle/role/spoke-${spoke}/secret-id" 2>/dev/null)

            if [ -n "$role_id" ] && [ -n "$secret_id" ]; then
                # Save to spoke .env file if it exists
                local env_file="${DIVE_ROOT}/instances/${spoke}/.env"
                if [ -f "$env_file" ]; then
                    # Update or append VAULT_ROLE_ID and VAULT_SECRET_ID
                    if grep -q "^VAULT_ROLE_ID=" "$env_file"; then
                        sed -i.bak "s|^VAULT_ROLE_ID=.*|VAULT_ROLE_ID=${role_id}|" "$env_file"
                    else
                        echo "VAULT_ROLE_ID=${role_id}" >> "$env_file"
                    fi

                    if grep -q "^VAULT_SECRET_ID=" "$env_file"; then
                        sed -i.bak "s|^VAULT_SECRET_ID=.*|VAULT_SECRET_ID=${secret_id}|" "$env_file"
                    else
                        echo "VAULT_SECRET_ID=${secret_id}" >> "$env_file"
                    fi

                    log_verbose "    → Credentials saved to: $env_file"
                else
                    log_warn "    → Spoke .env file not found: $env_file"
                    log_info "    → Role ID: $role_id"
                    log_info "    → Secret ID: [hidden - stored in memory]"
                fi
            fi
        else
            log_warn "  ✗ Failed to create AppRole: spoke-${spoke}"
        fi
    done

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
    log_info "1. Seed secrets:       ./dive vault seed"
    log_info "   (or migrate GCP):   ./scripts/migrate-secrets-gcp-to-vault.sh"
    log_info "2. Deploy hub:         ./dive hub deploy"
    log_info "3. Deploy spoke:       ./dive spoke deploy deu"
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
        log_error "Vault is sealed - run: ./dive vault unseal"
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
    log_info "Seeding Vault with fresh secrets for all instances..."

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
        log_error "Vault is sealed - run: ./dive vault unseal"
        return 1
    fi

    # Source secrets module for vault_set_secret()
    source "${DIVE_ROOT}/scripts/dive-modules/configuration/secrets.sh"

    # All instances: hub (usa) + spokes
    local all_instances=("usa" ${DIVE_SPOKE_LIST:-gbr fra deu can})
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
    # Federation secrets (bidirectional pairs, alphabetically sorted)
    # ==========================================================================
    log_info "Seeding federation secrets..."

    local -a pairs=()
    for i in "${all_instances[@]}"; do
        for j in "${all_instances[@]}"; do
            if [[ "$i" < "$j" ]]; then
                pairs+=("${i}-${j}")
            fi
        done
    done

    for pair in "${pairs[@]}"; do
        local fed_secret=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
        if vault_set_secret "federation" "$pair" "{\"client-secret\":\"${fed_secret}\"}"; then
            total_seeded=$((total_seeded + 1))
            log_verbose "  Seeded: dive-v3/federation/${pair}"
        else
            total_failed=$((total_failed + 1))
            log_error "  Failed: dive-v3/federation/${pair}"
        fi
    done

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

        _vault_update_env "$hub_env" "POSTGRES_PASSWORD_USA" "$usa_pg"
        _vault_update_env "$hub_env" "POSTGRES_PASSWORD" "$usa_pg"
        _vault_update_env "$hub_env" "KC_ADMIN_PASSWORD" "$usa_kc"
        _vault_update_env "$hub_env" "KC_BOOTSTRAP_ADMIN_PASSWORD_USA" "$usa_kc"
        _vault_update_env "$hub_env" "KEYCLOAK_ADMIN_PASSWORD" "$usa_kc"
        _vault_update_env "$hub_env" "KEYCLOAK_ADMIN_PASSWORD_USA" "$usa_kc"
        _vault_update_env "$hub_env" "MONGO_PASSWORD_USA" "$usa_mongo"
        _vault_update_env "$hub_env" "MONGO_PASSWORD" "$usa_mongo"
        _vault_update_env "$hub_env" "REDIS_PASSWORD_USA" "$usa_redis"
        _vault_update_env "$hub_env" "REDIS_PASSWORD_BLACKLIST" "$shared_blacklist"
        _vault_update_env "$hub_env" "KEYCLOAK_CLIENT_SECRET" "$shared_client"
        _vault_update_env "$hub_env" "KEYCLOAK_CLIENT_SECRET_USA" "$shared_client"
        _vault_update_env "$hub_env" "AUTH_SECRET" "$usa_auth"
        _vault_update_env "$hub_env" "AUTH_SECRET_USA" "$usa_auth"
        _vault_update_env "$hub_env" "NEXTAUTH_SECRET" "$usa_auth"
        _vault_update_env "$hub_env" "JWT_SECRET" "$usa_auth"
        _vault_update_env "$hub_env" "OPAL_AUTH_MASTER_TOKEN" "$opal_token"

        log_success "Hub .env.hub synced with Vault secrets"
    else
        log_warn "Hub .env.hub not found - Docker Compose will need Vault env vars"
    fi

    # Sync spoke secrets to instance .env files
    local spokes=(${DIVE_SPOKE_LIST:-gbr fra deu can})
    for spoke in "${spokes[@]}"; do
        local spoke_env="${DIVE_ROOT}/instances/${spoke}/.env"
        if [ -f "$spoke_env" ]; then
            local code_upper=$(upper "$spoke")
            local spoke_pg=$(vault_get_secret "core" "${spoke}/postgres" "password")
            local spoke_mongo=$(vault_get_secret "core" "${spoke}/mongodb" "password")
            local spoke_redis=$(vault_get_secret "core" "${spoke}/redis" "password")
            local spoke_kc=$(vault_get_secret "core" "${spoke}/keycloak-admin" "password")
            local spoke_auth=$(vault_get_secret "auth" "${spoke}/nextauth" "secret")

            _vault_update_env "$spoke_env" "POSTGRES_PASSWORD_${code_upper}" "$spoke_pg"
            _vault_update_env "$spoke_env" "MONGO_PASSWORD_${code_upper}" "$spoke_mongo"
            _vault_update_env "$spoke_env" "REDIS_PASSWORD_${code_upper}" "$spoke_redis"
            _vault_update_env "$spoke_env" "KEYCLOAK_ADMIN_PASSWORD_${code_upper}" "$spoke_kc"
            _vault_update_env "$spoke_env" "AUTH_SECRET_${code_upper}" "$spoke_auth"
            _vault_update_env "$spoke_env" "KEYCLOAK_CLIENT_SECRET_${code_upper}" "$shared_client"
            _vault_update_env "$spoke_env" "KEYCLOAK_CLIENT_SECRET_USA" "$shared_client"
            _vault_update_env "$spoke_env" "REDIS_PASSWORD_BLACKLIST" "$shared_blacklist"
            _vault_update_env "$spoke_env" "OPAL_AUTH_MASTER_TOKEN" "$opal_token"

            log_success "Spoke ${code_upper} .env synced"
        else
            log_verbose "Spoke .env not found: $spoke_env (will be created during spoke init)"
        fi
    done

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
    log_info "  Instances: ${all_instances[*]}"
    log_info "  Shared:    keycloak-client, redis-blacklist, opal-master-token, kas-signing, kas-encryption"
    log_info "  Federation: ${#pairs[@]} bidirectional pairs"
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
        help|--help|-h)
            echo "Usage: ./dive vault <command>"
            echo ""
            echo "Commands:"
            echo "  init                Initialize Vault (one-time operation)"
            echo "  unseal              Unseal Vault after restart"
            echo "  status              Check Vault health and seal status"
            echo "  setup               Configure mount points, policies, and AppRoles"
            echo "  seed                Generate and store fresh secrets for all instances"
            echo "  snapshot [path]     Create Raft snapshot backup"
            echo "  restore <path>      Restore from Raft snapshot"
            echo "  help                Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./dive vault init                          # First-time setup"
            echo "  ./dive vault unseal                        # After container restart"
            echo "  ./dive vault status                        # Check current state"
            echo "  ./dive vault setup                         # Configure Vault"
            echo "  ./dive vault seed                          # Generate fresh secrets"
            echo "  ./dive vault snapshot                      # Backup to backups/vault/"
            echo "  ./dive vault snapshot /tmp/vault.snap      # Backup to specific path"
            echo "  ./dive vault restore /tmp/vault.snap       # Restore from snapshot"
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
