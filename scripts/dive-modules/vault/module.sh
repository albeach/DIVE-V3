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

VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
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

    # Create spoke policies
    local spokes=("deu" "gbr" "fra" "can")
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
    log_info "1. Migrate secrets:    ./scripts/migrate-secrets-gcp-to-vault.sh"
    log_info "2. Test hub:           export SECRETS_PROVIDER=vault && ./dive hub deploy"
    log_info "3. Test spoke:         export SECRETS_PROVIDER=vault && ./dive spoke deploy deu"
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
            echo "  snapshot [path]     Create Raft snapshot backup"
            echo "  restore <path>      Restore from Raft snapshot"
            echo "  help                Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./dive vault init                          # First-time setup"
            echo "  ./dive vault unseal                        # After container restart"
            echo "  ./dive vault status                        # Check current state"
            echo "  ./dive vault setup                         # Configure Vault"
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
