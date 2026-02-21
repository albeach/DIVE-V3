#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke-Local Vault Lifecycle
# =============================================================================
# Manages a single-node HashiCorp Vault instance per spoke for data sovereignty.
# Secrets are stored locally — not in Hub Vault or plaintext .env files.
#
# Functions:
#   spoke_vault_start     - Start Vault container (Docker Compose profile)
#   spoke_vault_init      - Shamir init (1 share / 1 threshold)
#   spoke_vault_unseal    - Unseal with stored key
#   spoke_vault_setup     - Enable KV v2 mount
#   spoke_vault_migrate   - Pull secrets from Hub Vault into spoke Vault
#   spoke_vault_sync_env  - Sync critical secrets to .env for Docker Compose
#   spoke_vault_health    - Full health check
# =============================================================================

# Guard against double-sourcing
[ -n "${_SPOKE_VAULT_LOADED:-}" ] && return 0
_SPOKE_VAULT_LOADED=1

# =============================================================================
# CONSTANTS
# =============================================================================
readonly SPOKE_VAULT_KV_MOUNT="spoke-secrets"
readonly SPOKE_VAULT_INIT_FILE=".vault-init"  # Relative to instances/{code}/

# =============================================================================
# HELPERS
# =============================================================================

# Get the Vault container name for a spoke
_spoke_vault_container() {
    echo "dive-spoke-$(lower "$1")-vault"
}

# Execute a vault CLI command inside the spoke Vault container
_spoke_vault_exec() {
    local code="$1"; shift
    local container
    container=$(_spoke_vault_container "$code")
    docker exec -e VAULT_SKIP_VERIFY=true "$container" vault "$@"
}

# Get the init file path
_spoke_vault_init_path() {
    local code_lower
    code_lower=$(lower "$1")
    echo "${DIVE_ROOT}/instances/${code_lower}/${SPOKE_VAULT_INIT_FILE}"
}

# =============================================================================
# LIFECYCLE FUNCTIONS
# =============================================================================

##
# Start the spoke Vault container via Docker Compose profiles.
#
# Arguments:
#   $1 - Instance code (e.g., FRA)
#
# Returns:
#   0 - Container started and healthy
#   1 - Failed to start
##
spoke_vault_start() {
    local code="$1"
    local code_lower
    code_lower=$(lower "$code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local compose_file="${spoke_dir}/docker-compose.yml"

    if [ ! -f "$compose_file" ]; then
        log_error "Spoke compose file not found: $compose_file"
        return 1
    fi

    guided_progress "VAULT SETUP" "${GUIDED_MSG_VAULT_INIT:-Setting up your spoke vault...}"

    log_step "Starting spoke Vault container..."
    COMPOSE_PROFILES=vault docker compose -f "$compose_file" \
        -p "dive-spoke-${code_lower}" up -d "vault-${code_lower}" 2>&1 || {
        log_error "Failed to start Vault container"
        return 1
    }

    # Phase 1: Wait for container to enter Running state
    local container
    container=$(_spoke_vault_container "$code")
    local waited=0
    while [ $waited -lt 30 ]; do
        if docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null | grep -q true; then
            log_verbose "Vault container running (${waited}s)"
            break
        fi
        sleep 2
        waited=$((waited + 2))
    done

    if [ $waited -ge 30 ]; then
        log_error "Vault container failed to start within 30s"
        return 1
    fi

    # Phase 2: Wait for the Vault process to actually be listening on port 8200.
    # Container Running != process accepting connections. vault status returns:
    #   0 = unsealed, 1 = sealed, 2 = uninitialized, 3 = error/not-listening
    # We accept exit codes 0, 1, and 2 as "vault is listening". Exit 3 means not ready.
    log_verbose "Waiting for Vault process to accept connections..."
    local vault_waited=0
    while [ $vault_waited -lt 60 ]; do
        local vault_status_exit
        _spoke_vault_exec "$code" status -tls-skip-verify >/dev/null 2>&1
        vault_status_exit=$?
        # Exit 3 = connection refused / not listening yet
        if [ "$vault_status_exit" -ne 3 ]; then
            log_verbose "Vault process listening (${vault_waited}s, exit=${vault_status_exit})"
            return 0
        fi
        sleep 2
        vault_waited=$((vault_waited + 2))
    done

    log_error "Vault process failed to start listening within 60s"
    return 1
}

##
# Initialize Vault with Shamir seal (1 share / 1 threshold for simplicity).
# Stores unseal key + root token in instances/{code}/.vault-init (chmod 600).
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Initialized (or already initialized)
#   1 - Failed
##
spoke_vault_init() {
    local code="$1"
    local init_file
    init_file=$(_spoke_vault_init_path "$code")

    # Check if already initialized
    if _spoke_vault_exec "$code" status -tls-skip-verify 2>&1 | grep -q "Initialized.*true"; then
        log_verbose "Vault already initialized"
        return 0
    fi

    log_step "Initializing spoke Vault (Shamir seal: 1/1)..."
    guided_explain "Vault Initialization" "${GUIDED_MSG_VAULT_INIT:-Setting up your spoke vault...}"

    local init_output
    init_output=$(_spoke_vault_exec "$code" operator init \
        -key-shares=1 \
        -key-threshold=1 \
        -tls-skip-verify \
        -format=json 2>&1)

    if [ $? -ne 0 ]; then
        log_error "Vault initialization failed"
        log_error "$init_output"
        return 1
    fi

    # Extract key and token
    local unseal_key
    unseal_key=$(echo "$init_output" | jq -r '.unseal_keys_b64[0]' 2>/dev/null)
    local root_token
    root_token=$(echo "$init_output" | jq -r '.root_token' 2>/dev/null)

    if [ -z "$unseal_key" ] || [ -z "$root_token" ]; then
        log_error "Failed to parse Vault init output"
        return 1
    fi

    # Store securely (chmod 600)
    cat > "$init_file" <<EOF
VAULT_UNSEAL_KEY=${unseal_key}
VAULT_ROOT_TOKEN=${root_token}
VAULT_INITIALIZED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF
    chmod 600 "$init_file"

    log_success "Vault initialized — credentials stored in $(basename "$init_file")"
    log_verbose "Init file: $init_file"
    return 0
}

##
# Unseal the spoke Vault using the stored unseal key.
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Unsealed
#   1 - Failed
##
spoke_vault_unseal() {
    local code="$1"
    local init_file
    init_file=$(_spoke_vault_init_path "$code")

    # Check if already unsealed
    if _spoke_vault_exec "$code" status -tls-skip-verify 2>&1 | grep -q "Sealed.*false"; then
        log_verbose "Vault already unsealed"
        return 0
    fi

    if [ ! -f "$init_file" ]; then
        log_error "Vault init file not found: $init_file"
        log_error "Run: spoke_vault_init first"
        return 1
    fi

    guided_explain "Unlocking Vault" "${GUIDED_MSG_VAULT_UNSEAL:-Unlocking your spoke vault so services can access secrets...}"

    # Source the init file to get VAULT_UNSEAL_KEY
    local unseal_key
    unseal_key=$(grep '^VAULT_UNSEAL_KEY=' "$init_file" | cut -d= -f2-)

    if [ -z "$unseal_key" ]; then
        log_error "Unseal key not found in $init_file"
        return 1
    fi

    log_step "Unsealing spoke Vault..."
    local unseal_output
    unseal_output=$(_spoke_vault_exec "$code" operator unseal \
        -tls-skip-verify \
        "$unseal_key" 2>&1)

    if _spoke_vault_exec "$code" status -tls-skip-verify 2>&1 | grep -q "Sealed.*false"; then
        log_success "Vault unsealed"
        return 0
    else
        log_error "Vault unseal failed"
        log_error "$unseal_output"
        return 1
    fi
}

##
# Enable KV v2 secrets engine at spoke-secrets/.
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Mount ready
#   1 - Failed
##
spoke_vault_setup() {
    local code="$1"
    local init_file
    init_file=$(_spoke_vault_init_path "$code")
    local root_token
    root_token=$(grep '^VAULT_ROOT_TOKEN=' "$init_file" | cut -d= -f2-)

    # Check if already mounted
    if _spoke_vault_exec "$code" secrets list -tls-skip-verify -format=json 2>/dev/null | \
        jq -e ".\"${SPOKE_VAULT_KV_MOUNT}/\"" &>/dev/null; then
        log_verbose "KV mount ${SPOKE_VAULT_KV_MOUNT}/ already exists"
        return 0
    fi

    log_step "Enabling KV v2 secrets engine at ${SPOKE_VAULT_KV_MOUNT}/..."
    _spoke_vault_exec "$code" secrets enable \
        -tls-skip-verify \
        -path="${SPOKE_VAULT_KV_MOUNT}" \
        kv-v2 2>&1 || {
        log_error "Failed to enable KV v2 mount"
        return 1
    }

    log_success "KV v2 mount ready: ${SPOKE_VAULT_KV_MOUNT}/"
    return 0
}

##
# Migrate secrets from Hub Vault to spoke-local Vault.
# Uses a time-limited token from the Hub to read secrets,
# then writes them to the spoke's local KV v2 mount.
#
# Arguments:
#   $1 - Instance code
#   $2 - Hub Vault address (e.g., https://dev-usa-vault.dive25.com)
#   $3 - Hub migration token (time-limited, read-only)
#
# Returns:
#   0 - Migration complete
#   1 - Failed
##
spoke_vault_migrate() {
    local code="$1"
    local hub_vault_addr="${2:-}"
    local hub_token="${3:-}"
    local code_lower
    code_lower=$(lower "$code")
    local code_upper
    code_upper=$(upper "$code")

    if [ -z "$hub_vault_addr" ] || [ -z "$hub_token" ]; then
        log_warn "Hub Vault address or token not provided — skipping secret migration"
        log_info "Secrets will need to be populated manually or via .env"
        return 0
    fi

    guided_explain "Secret Migration" "${GUIDED_MSG_VAULT_MIGRATE:-Securely copying secrets from Hub to your local vault...}"
    log_step "Migrating secrets from Hub Vault to spoke-local Vault..."

    local init_file
    init_file=$(_spoke_vault_init_path "$code")
    local spoke_token
    spoke_token=$(grep '^VAULT_ROOT_TOKEN=' "$init_file" | cut -d= -f2-)
    local spoke_container
    spoke_container=$(_spoke_vault_container "$code")

    # List of Hub Vault paths to migrate
    local hub_paths=(
        "dive-v3/core/data/${code_lower}/postgres"
        "dive-v3/core/data/${code_lower}/mongodb"
        "dive-v3/core/data/${code_lower}/redis"
        "dive-v3/core/data/${code_lower}/keycloak"
        "dive-v3/core/data/${code_lower}/nextauth"
        "dive-v3/core/data/${code_lower}/federation"
    )

    local migrated=0
    local failed=0

    for hub_path in "${hub_paths[@]}"; do
        local secret_name
        secret_name=$(basename "$hub_path")
        log_verbose "Migrating: $hub_path → ${SPOKE_VAULT_KV_MOUNT}/core/${code_lower}/${secret_name}"

        # Read from Hub Vault
        local hub_data
        hub_data=$(curl -sk --max-time 10 \
            -H "X-Vault-Token: ${hub_token}" \
            "${hub_vault_addr}/v1/${hub_path}" 2>/dev/null)

        local hub_secrets
        hub_secrets=$(echo "$hub_data" | jq -r '.data.data // empty' 2>/dev/null)

        if [ -z "$hub_secrets" ] || [ "$hub_secrets" = "null" ]; then
            log_verbose "No data at $hub_path (may not exist yet)"
            continue
        fi

        # Write to spoke Vault
        if docker exec -e VAULT_SKIP_VERIFY=true "$spoke_container" vault kv put \
            -tls-skip-verify \
            "${SPOKE_VAULT_KV_MOUNT}/core/${code_lower}/${secret_name}" \
            -<<<"$hub_secrets" 2>/dev/null; then
            migrated=$((migrated + 1))
            log_verbose "Migrated: $secret_name"
        else
            failed=$((failed + 1))
            log_warn "Failed to migrate: $secret_name"
        fi
    done

    if [ $migrated -gt 0 ]; then
        log_success "Migrated $migrated secrets to spoke Vault ($failed failed)"
    else
        log_warn "No secrets migrated (Hub Vault may not have secrets for $code_upper yet)"
    fi

    return 0
}

##
# Sync critical secrets from spoke Vault to .env file.
# Docker Compose reads .env for service environment variables.
# This bridges Vault → Compose without exposing all secrets in plaintext.
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Sync complete
#   1 - Failed
##
spoke_vault_sync_env() {
    local code="$1"
    local code_lower
    code_lower=$(lower "$code")
    local code_upper
    code_upper=$(upper "$code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local env_file="${spoke_dir}/.env"
    local init_file
    init_file=$(_spoke_vault_init_path "$code")

    if [ ! -f "$init_file" ]; then
        log_verbose "No Vault init file — skipping env sync"
        return 0
    fi

    local root_token
    root_token=$(grep '^VAULT_ROOT_TOKEN=' "$init_file" | cut -d= -f2-)
    local spoke_container
    spoke_container=$(_spoke_vault_container "$code")
    local vault_addr="https://vault-${code_lower}:8200"

    # Write Vault connection info to .env
    if [ -f "$env_file" ]; then
        # Remove old Vault entries
        local tmp_env
        tmp_env=$(grep -v '^SPOKE_VAULT_' "$env_file" | grep -v '^VAULT_ADDR_SPOKE' || true)
        echo "$tmp_env" > "$env_file"
    fi

    cat >> "$env_file" <<VAULT_ENV

# Spoke-local Vault (data sovereignty — generated by spoke-vault.sh)
SPOKE_VAULT_ADDR=${vault_addr}
SPOKE_VAULT_TOKEN=${root_token}
SPOKE_VAULT_KV_MOUNT=${SPOKE_VAULT_KV_MOUNT}
VAULT_ENV

    log_verbose "Vault connection info written to .env"
    return 0
}

##
# Full spoke Vault health check.
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Healthy (initialized + unsealed + KV mounted)
#   1 - Unhealthy
##
spoke_vault_health() {
    local code="$1"
    local container
    container=$(_spoke_vault_container "$code")
    local errors=0

    # Check container running
    if ! docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null | grep -q true; then
        log_error "Vault container not running: $container"
        return 1
    fi

    # Check initialized
    if ! _spoke_vault_exec "$code" status -tls-skip-verify 2>&1 | grep -q "Initialized.*true"; then
        log_error "Vault not initialized"
        errors=$((errors + 1))
    fi

    # Check unsealed
    if ! _spoke_vault_exec "$code" status -tls-skip-verify 2>&1 | grep -q "Sealed.*false"; then
        log_error "Vault is sealed"
        errors=$((errors + 1))
    fi

    # Check KV mount exists
    if ! _spoke_vault_exec "$code" secrets list -tls-skip-verify -format=json 2>/dev/null | \
        jq -e ".\"${SPOKE_VAULT_KV_MOUNT}/\"" &>/dev/null; then
        log_warn "KV mount ${SPOKE_VAULT_KV_MOUNT}/ not found"
        errors=$((errors + 1))
    fi

    if [ $errors -eq 0 ]; then
        log_success "Spoke Vault healthy (initialized + unsealed + KV mounted)"
        return 0
    else
        log_error "Spoke Vault has $errors issue(s)"
        return 1
    fi
}
