# =============================================================================
# DIVE V3 - Hub Deployment Phase Functions
# =============================================================================
# Sourced by deployment/hub.sh — do not execute directly.
#
# Phase functions: database_init, preflight, initialization, vault_bootstrap,
#   mongodb_init, build, services, keycloak_config, realm_verify, kas_register,
#   seeding, kas_init, vault_db_engine
# =============================================================================

##
# Idempotently set a key=value in .env.hub (add or update).
# Also exports to current shell for immediate use.
##
_hub_set_env() {
    local key="$1" value="$2"
    local env_file="${DIVE_ROOT}/.env.hub"

    export "$key=$value"

    [ ! -f "$env_file" ] && return 0

    if grep -q "^${key}=" "$env_file" 2>/dev/null; then
        # Update existing (portable sed: macOS + Linux)
        if [[ "$(uname)" == "Darwin" ]]; then
            sed -i '' "s|^${key}=.*|${key}=${value}|" "$env_file"
        else
            sed -i "s|^${key}=.*|${key}=${value}|" "$env_file"
        fi
    else
        echo "${key}=${value}" >> "$env_file"
    fi
}

hub_phase_database_init() {
    local instance_code="$1"
    local pipeline_mode="$2"

    log_info "Phase 2: PostgreSQL and Orchestration Database initialization"

    cd "$DIVE_ROOT" || return 1

    # -------------------------------------------------------------------------
    # Step 0: Ensure hub certificates exist (required for PostgreSQL TLS)
    # After a nuke, certs are cleaned. PKI is available from Phase 1.
    # -------------------------------------------------------------------------
    local cert_dir="${DIVE_ROOT}/instances/hub/certs"
    if [ ! -f "${cert_dir}/certificate.pem" ]; then
        log_info "Hub certificates not found — generating before infra services start..."
        mkdir -p "$cert_dir"
        source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"

        if use_vault_pki 2>/dev/null && type generate_hub_certificate_vault &>/dev/null; then
            if generate_hub_certificate_vault; then
                log_success "Hub certificates issued from Vault PKI"
            else
                log_warn "Vault PKI cert generation failed — trying fallback"
                if is_cloud_environment 2>/dev/null; then
                    log_info "Cloud: generating self-signed hub certificate with OpenSSL..."
                    openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
                        -keyout "${cert_dir}/key.pem" -out "${cert_dir}/certificate.pem" \
                        -subj "/CN=hub.dive-v3.local" \
                        -addext "subjectAltName=DNS:localhost,DNS:backend,DNS:keycloak,DNS:frontend,DNS:opal-server,DNS:kas,DNS:postgres,DNS:mongodb,DNS:redis,IP:127.0.0.1${INSTANCE_PRIVATE_IP:+,IP:${INSTANCE_PRIVATE_IP}}${INSTANCE_PUBLIC_IP:+,IP:${INSTANCE_PUBLIC_IP}}" \
                        2>/dev/null
                elif command -v mkcert >/dev/null 2>&1; then
                    cd "$cert_dir"
                    mkcert -cert-file certificate.pem -key-file key.pem \
                        localhost "*.localhost" 127.0.0.1 \
                        backend keycloak opa mongodb postgres redis kas opal-server frontend \
                        >/dev/null 2>&1
                    cd "$DIVE_ROOT"
                fi
            fi
        elif is_cloud_environment 2>/dev/null; then
            log_info "Cloud: generating self-signed hub certificate with OpenSSL..."
            openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
                -keyout "${cert_dir}/key.pem" -out "${cert_dir}/certificate.pem" \
                -subj "/CN=hub.dive-v3.local" \
                -addext "subjectAltName=DNS:localhost,DNS:backend,DNS:keycloak,DNS:frontend,DNS:opal-server,DNS:kas,DNS:postgres,DNS:mongodb,DNS:redis,IP:127.0.0.1${INSTANCE_PRIVATE_IP:+,IP:${INSTANCE_PRIVATE_IP}}${INSTANCE_PUBLIC_IP:+,IP:${INSTANCE_PUBLIC_IP}}" \
                2>/dev/null
        elif command -v mkcert >/dev/null 2>&1; then
            cd "$cert_dir"
            mkcert -cert-file certificate.pem -key-file key.pem \
                localhost "*.localhost" 127.0.0.1 \
                backend keycloak opa mongodb postgres redis kas opal-server frontend \
                >/dev/null 2>&1
            cd "$DIVE_ROOT"
        fi

        # Fix permissions for Docker containers (non-root users need read access)
        chmod 644 "${cert_dir}/key.pem" 2>/dev/null || true
        chmod 644 "${cert_dir}/certificate.pem" 2>/dev/null || true

        # Build SSOT CA bundle
        _rebuild_ca_bundle
        log_verbose "CA bundle built at ${DIVE_ROOT}/certs/ca-bundle/rootCA.pem"
    fi

    # -------------------------------------------------------------------------
    # Step 0b: Ensure fullchain.pem + ca/rootCA.pem exist
    # PostgreSQL, Redis, Keycloak, OPA all mount instances/hub/certs as /certs
    # and reference /certs/fullchain.pem + /certs/ca/rootCA.pem.
    # OpenSSL self-signed fallback only creates certificate.pem + key.pem.
    # -------------------------------------------------------------------------
    if [ -f "${cert_dir}/certificate.pem" ] && [ ! -f "${cert_dir}/fullchain.pem" ]; then
        log_info "Creating fullchain.pem from certificate.pem..."
        if [ -f "${cert_dir}/ca/rootCA.pem" ]; then
            # Chain: leaf cert + CA
            cat "${cert_dir}/certificate.pem" "${cert_dir}/ca/rootCA.pem" > "${cert_dir}/fullchain.pem"
        else
            # Self-signed: the cert IS its own CA
            cp "${cert_dir}/certificate.pem" "${cert_dir}/fullchain.pem"
            mkdir -p "${cert_dir}/ca"
            cp "${cert_dir}/certificate.pem" "${cert_dir}/ca/rootCA.pem"
        fi
        chmod 644 "${cert_dir}/fullchain.pem"
        chmod 644 "${cert_dir}/ca/rootCA.pem"
    fi

    # Ensure CA bundle includes something useful for self-signed certs
    local ca_bundle="${DIVE_ROOT}/certs/ca-bundle/rootCA.pem"
    if [ ! -s "$ca_bundle" ] && [ -f "${cert_dir}/ca/rootCA.pem" ]; then
        mkdir -p "$(dirname "$ca_bundle")"
        cp "${cert_dir}/ca/rootCA.pem" "$ca_bundle"
        chmod 644 "$ca_bundle"
    fi

    # Start PostgreSQL container only
    log_verbose "Starting PostgreSQL container..."

    if ! ${DOCKER_CMD:-docker} compose $HUB_COMPOSE_FILES up -d postgres >/dev/null 2>&1; then
        log_error "Failed to start PostgreSQL container"
        return 1
    fi

    # Wait for PostgreSQL to be ready
    local max_wait=60
    local elapsed=0
    log_verbose "Waiting for PostgreSQL to be ready..."

    while [ $elapsed -lt $max_wait ]; do
        if ${DOCKER_CMD:-docker} exec dive-hub-postgres pg_isready -U postgres >/dev/null 2>&1; then
            log_success "PostgreSQL is ready"
            break
        fi
        sleep 1  # OPTIMIZATION: Faster polling for responsiveness
        ((elapsed += 1))
    done

    if [ $elapsed -ge $max_wait ]; then
        log_error "PostgreSQL failed to become ready within ${max_wait}s"
        return 1
    fi

    # Ensure PostgreSQL password matches .env.hub (PostgreSQL 18 initdb may not
    # apply POSTGRES_PASSWORD correctly with SCRAM-SHA-256)
    local pg_password
    pg_password=$(grep '^POSTGRES_PASSWORD_USA=' "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d= -f2-)
    if [ -n "$pg_password" ]; then
        ${DOCKER_CMD:-docker} exec dive-hub-postgres psql -U postgres -c \
            "ALTER USER postgres WITH PASSWORD '${pg_password}';" >/dev/null 2>&1 || true
    fi

    # Create and initialize orchestration database
    log_verbose "Creating orchestration database..."
    ${DOCKER_CMD:-docker} exec dive-hub-postgres psql -U postgres -c "CREATE DATABASE orchestration;" >/dev/null 2>&1 || true

    # Apply orchestration schema
    if [ -f "${DIVE_ROOT}/scripts/migrations/001_orchestration_state_db.sql" ]; then
        log_verbose "Applying orchestration schema..."

        local temp_migration="/tmp/orchestration_migration_$$.sql"
        grep -v '^\\c orchestration' "${DIVE_ROOT}/scripts/migrations/001_orchestration_state_db.sql" > "${temp_migration}"

        ${DOCKER_CMD:-docker} cp "${temp_migration}" dive-hub-postgres:/tmp/migration.sql
        rm -f "${temp_migration}"

        if ! ${DOCKER_CMD:-docker} exec dive-hub-postgres psql -U postgres -d orchestration -f /tmp/migration.sql >/dev/null 2>&1; then
            log_error "Failed to apply orchestration schema"
            ${DOCKER_CMD:-docker} exec dive-hub-postgres rm -f /tmp/migration.sql
            return 1
        fi

        ${DOCKER_CMD:-docker} exec dive-hub-postgres rm -f /tmp/migration.sql

        # Verify required tables exist
        local required_tables=("deployment_states" "state_transitions" "deployment_steps"
                               "deployment_locks" "circuit_breakers" "orchestration_errors"
                               "orchestration_metrics" "checkpoints")
        local missing_tables=0

        for table in "${required_tables[@]}"; do
            if ! ${DOCKER_CMD:-docker} exec dive-hub-postgres psql -U postgres -d orchestration -c "\d $table" >/dev/null 2>&1; then
                log_error "Required table missing: $table"
                missing_tables=$((missing_tables + 1))
            fi
        done

        if [ $missing_tables -gt 0 ]; then
            log_error "$missing_tables required tables missing"
            return 1
        fi

        log_success "Orchestration database initialized (8 tables verified)"
    else
        log_error "Orchestration schema file not found"
        return 1
    fi

    # Apply federation schema if available
    if [ -f "${DIVE_ROOT}/scripts/sql/002_federation_schema.sql" ]; then
        log_verbose "Applying federation schema..."
        ${DOCKER_CMD:-docker} exec -i dive-hub-postgres psql -U postgres -d orchestration < "${DIVE_ROOT}/scripts/sql/002_federation_schema.sql" >/dev/null 2>&1 || \
            log_verbose "Federation schema already exists"
    fi

    log_success "Phase 2 complete: Orchestration database ready for state tracking"
    return 0
}

hub_phase_preflight() {
    local instance_code="$1"
    local pipeline_mode="$2"
    hub_preflight
}

hub_phase_initialization() {
    local instance_code="$1"
    local pipeline_mode="$2"
    hub_init
}

hub_phase_vault_bootstrap() {
    local instance_code="$1"
    local pipeline_mode="$2"

    log_info "Vault bootstrap: ensuring Vault cluster is running and configured"

    cd "$DIVE_ROOT" || {
        log_error "Failed to change to DIVE_ROOT=$DIVE_ROOT"
        return 1
    }

    # -------------------------------------------------------------------------
    # Step 0: Ensure .env.hub exists (required by docker-compose.hub.yml)
    # -------------------------------------------------------------------------
    # Docker Compose validates ALL service env vars even when starting only
    # vault-seal. On a fresh clone, .env.hub doesn't exist yet — create it
    # with bootstrap values so compose can parse the file.
    if [ ! -f "${DIVE_ROOT}/.env.hub" ]; then
        log_info "Creating bootstrap .env.hub (first-time deployment)"
        cat > "${DIVE_ROOT}/.env.hub" << 'BOOTSTRAP_EOF'
# Auto-generated bootstrap .env.hub — values replaced by Vault seed phase
INSTANCE=USA
INSTANCE_NAME=United States (Hub)
COMPOSE_PROJECT_NAME=dive-hub
ENVIRONMENT=local
PORT=4000
KEYCLOAK_CLIENT_SECRET_USA=bootstrap-will-be-replaced
KEYCLOAK_ADMIN_PASSWORD=bootstrap-will-be-replaced
POSTGRES_PASSWORD_USA=bootstrap-will-be-replaced
MONGO_PASSWORD_USA=bootstrap-will-be-replaced
REDIS_PASSWORD_USA=bootstrap-will-be-replaced
REDIS_PASSWORD_BLACKLIST=bootstrap-will-be-replaced
OPAL_DATA_SOURCE_TOKEN=bootstrap-will-be-replaced
OPAL_AUTH_MASTER_TOKEN=bootstrap-will-be-replaced
HUB_OPAL_TOKEN=bootstrap-will-be-replaced
BOOTSTRAP_EOF
        log_verbose "Bootstrap .env.hub created with placeholder values"
    fi

    # Ensure .env symlink exists (docker compose reads .env for variable substitution)
    if [ ! -e "${DIVE_ROOT}/.env" ] || [ "$(readlink "${DIVE_ROOT}/.env" 2>/dev/null)" != ".env.hub" ]; then
        ln -sf .env.hub "${DIVE_ROOT}/.env"
        log_verbose "Created .env -> .env.hub symlink"
    fi

    # Ensure vault CLI is in PATH (macOS: /usr/local/bin, Homebrew ARM: /opt/homebrew/bin)
    if ! command -v vault &>/dev/null; then
        for _vp in /usr/local/bin /opt/homebrew/bin; do
            if [ -x "${_vp}/vault" ]; then
                export PATH="${_vp}:$PATH"
                break
            fi
        done
        if ! command -v vault &>/dev/null; then
            log_error "Vault CLI not found — install: brew install hashicorp/tap/vault"
            return 1
        fi
    fi

    # -------------------------------------------------------------------------
    # Step 1: Generate Vault node TLS certificates
    # -------------------------------------------------------------------------
    local vault_profile
    vault_profile=$(_vault_get_profile)

    if [ "$vault_profile" = "vault-ha" ]; then
        log_info "Generating Vault node TLS certificates..."
        source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"
        if ! generate_vault_node_certs; then
            log_error "Failed to generate Vault node certs — cannot start TLS-enabled cluster"
            return 1
        fi
    fi

    # -------------------------------------------------------------------------
    # Step 2: Start Vault containers (skip if already running + healthy)
    # -------------------------------------------------------------------------
    # Ensure dive-shared network exists (compose declares it as external: true)
    if ! ${DOCKER_CMD:-docker} network inspect dive-shared >/dev/null 2>&1; then
        ${DOCKER_CMD:-docker} network create dive-shared 2>/dev/null || true
    fi

    # Check if Vault is already running and healthy (idempotent re-deploy)
    local vault_already_running=false
    if [ "$vault_profile" = "vault-ha" ]; then
        local v1_health
        v1_health=$(${DOCKER_CMD:-docker} inspect "${COMPOSE_PROJECT_NAME:-dive-hub}-vault-1" --format='{{.State.Health.Status}}' 2>/dev/null || echo "none")
        if [ "$v1_health" = "healthy" ]; then
            vault_already_running=true
            log_success "Vault cluster already running and healthy — skipping container startup"
        fi
    else
        local vd_health
        vd_health=$(${DOCKER_CMD:-docker} inspect "${COMPOSE_PROJECT_NAME:-dive-hub}-vault-dev" --format='{{.State.Health.Status}}' 2>/dev/null || echo "none")
        if [ "$vd_health" = "healthy" ]; then
            vault_already_running=true
            log_success "Vault dev already running and healthy — skipping container startup"
        fi
    fi

    if [ "$vault_already_running" = "false" ]; then
    log_info "Starting Vault services (profile: ${vault_profile})..."

    # Start ONLY Vault-specific services — not all services in the compose file.
    # `docker compose --profile X up -d` starts all non-profiled services too,
    # which would prematurely start MongoDB/Redis/Postgres before they're configured.
    if [ "$vault_profile" = "vault-ha" ]; then
        # Start vault-seal FIRST and wait for healthy before starting cluster nodes.
        # vault-1/2/3 depend on vault-seal for Transit auto-unseal — if started
        # simultaneously, compose may fail the dependency check before vault-seal
        # finishes its initialization (transit engine + token creation).
        log_info "Starting vault-seal (Transit auto-unseal engine)..."
        if ! ${DOCKER_CMD:-docker} compose $HUB_COMPOSE_FILES --profile "$vault_profile" up -d vault-seal 2>&1; then
            log_error "Failed to start vault-seal"
            return 1
        fi

        # Wait for vault-seal to be healthy
        local seal_container="${COMPOSE_PROJECT_NAME:-dive-hub}-vault-seal"
        local seal_wait=0
        log_info "Waiting for vault-seal to become healthy..."
        while [ $seal_wait -lt 30 ]; do
            local seal_health
            seal_health=$(${DOCKER_CMD:-docker} inspect "$seal_container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
            if [ "$seal_health" = "healthy" ]; then
                log_success "vault-seal healthy (${seal_wait}s)"
                break
            fi
            sleep 1  # OPTIMIZATION: Faster polling for responsiveness
            seal_wait=$((seal_wait + 1))
        done

        if [ $seal_wait -ge 30 ]; then
            log_error "vault-seal did not become healthy within 30s"
            log_info "Check logs: docker logs ${seal_container}"
            return 1
        fi

        # Now start cluster nodes (vault-seal is healthy, dependency satisfied)
        log_info "Starting Vault cluster nodes (vault-1, vault-2, vault-3)..."
        if ! ${DOCKER_CMD:-docker} compose $HUB_COMPOSE_FILES --profile "$vault_profile" up -d vault-1 vault-2 vault-3 2>&1; then
            log_error "Failed to start Vault cluster nodes"
            return 1
        fi
    else
        if ! ${DOCKER_CMD:-docker} compose $HUB_COMPOSE_FILES --profile "$vault_profile" up -d vault-dev 2>&1; then
            log_error "Failed to start vault-dev"
            return 1
        fi
    fi

    # Wait for Vault to be healthy
    local vault_container="${COMPOSE_PROJECT_NAME:-dive-hub}-vault-1"
    local vault_timeout=60
    if [ "$vault_profile" = "vault-dev" ]; then
        vault_container="${COMPOSE_PROJECT_NAME:-dive-hub}-vault-dev"
        vault_timeout=15
    fi

    log_info "Waiting for Vault to become healthy (timeout: ${vault_timeout}s)..."
    local vault_wait=0
    while [ $vault_wait -lt $vault_timeout ]; do
        local health
        health=$(${DOCKER_CMD:-docker} inspect "$vault_container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
        if [ "$health" = "healthy" ]; then
            log_success "Vault healthy (${vault_wait}s)"
            break
        fi
        sleep 1  # OPTIMIZATION: Faster polling for responsiveness
        vault_wait=$((vault_wait + 1))
    done

    if [ $vault_wait -ge $vault_timeout ]; then
        log_error "Vault did not become healthy within ${vault_timeout}s"
        log_info "Check logs: docker logs ${vault_container}"
        return 1
    fi

    # Wait for Raft leader election (required after container restart/recreation)
    # Docker health check passes before Raft cluster elects a leader, which causes
    # "local node not active but active cluster node not found" errors.
    if [ "$vault_profile" = "vault-ha" ]; then
        log_verbose "Waiting for Vault Raft leader election..."
        local leader_wait=0
        while [ $leader_wait -lt 30 ]; do
            if VAULT_SKIP_VERIFY=1 vault status 2>/dev/null | grep -q "HA Mode.*active"; then
                log_verbose "Vault Raft leader elected (${leader_wait}s)"
                break
            fi
            sleep 2
            leader_wait=$((leader_wait + 2))
        done
        if [ $leader_wait -ge 30 ]; then
            log_warn "Vault leader election timeout — proceeding (may retry)"
        fi
    fi

    fi  # end: vault_already_running=false

    # -------------------------------------------------------------------------
    # Step 3: Initialize Vault if not yet initialized
    # -------------------------------------------------------------------------
    # Source vault module for init/setup/seed functions
    source "${DIVE_ROOT}/scripts/dive-modules/vault/module.sh"

    # Check Vault initialization status BEFORE loading stale tokens
    local status_json
    status_json=$(vault status -format=json 2>/dev/null || true)
    local is_initialized
    is_initialized=$(echo "$status_json" | grep -o '"initialized": *[a-z]*' | sed 's/.*: *//')

    if [ "$is_initialized" != "true" ]; then
        # Vault is NOT initialized — remove any stale credential files from a previous
        # deployment. These contain tokens for a now-destroyed Vault instance.
        if [ -f "$VAULT_TOKEN_FILE" ] || [ -f "$VAULT_INIT_FILE" ]; then
            log_warn "Vault uninitialized but stale credentials found — removing"
            rm -f "$VAULT_TOKEN_FILE" "$VAULT_INIT_FILE" 2>/dev/null || true
            unset VAULT_TOKEN
        fi
        log_info "Vault not initialized — running vault init..."
        if ! module_vault_init; then
            log_error "Vault initialization failed"
            return 1
        fi
        log_success "Vault initialized"
    else
        log_verbose "Vault already initialized"
        # Load token if it exists (Vault IS initialized, so token should be valid)
        if [ -f "$VAULT_TOKEN_FILE" ]; then
            VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
            export VAULT_TOKEN
        fi
    fi

    # Verify unsealed
    if ! vault status 2>/dev/null | grep -q "Sealed.*false"; then
        log_error "Vault is sealed after init — Transit auto-unseal may have failed"
        log_info "Check seal vault: docker logs ${COMPOSE_PROJECT_NAME:-dive-hub}-vault-seal"
        return 1
    fi

    # -------------------------------------------------------------------------
    # Step 4: Setup mount points and policies if not configured
    # -------------------------------------------------------------------------
    if ! vault secrets list 2>/dev/null | grep -q "^dive-v3/core/"; then
        log_info "Vault not configured — running vault setup..."
        if ! module_vault_setup; then
            log_error "Vault setup failed"
            return 1
        fi
        log_success "Vault setup complete"
    else
        log_verbose "Vault mount points already configured"
    fi

    # -------------------------------------------------------------------------
    # Step 4b: Setup PKI engines if not configured (Root CA + Intermediate CA)
    # -------------------------------------------------------------------------
    if ! vault secrets list 2>/dev/null | grep -q "^pki_int/"; then
        log_info "Vault PKI not configured — running PKI setup..."
        if type module_vault_pki_setup &>/dev/null; then
            if module_vault_pki_setup; then
                log_success "Vault PKI setup complete (Root CA + Intermediate CA)"
                # Auto-set CERT_PROVIDER + SECRETS_PROVIDER so subsequent phases use Vault
                _hub_set_env "CERT_PROVIDER" "vault"
                _hub_set_env "SECRETS_PROVIDER" "vault"
            else
                log_warn "Vault PKI setup failed — spoke certs will use mkcert fallback"
            fi
        else
            log_verbose "module_vault_pki_setup not available — skipping PKI"
        fi
    else
        log_verbose "Vault PKI engines already configured"
        # Ensure CERT_PROVIDER + SECRETS_PROVIDER are set even on resume
        _hub_set_env "CERT_PROVIDER" "vault"
        _hub_set_env "SECRETS_PROVIDER" "vault"
    fi

    # -------------------------------------------------------------------------
    # Step 5: Seed secrets if not yet seeded
    # -------------------------------------------------------------------------
    if ! vault kv get dive-v3/core/usa/postgres >/dev/null 2>&1; then
        log_info "Vault secrets not seeded — running vault seed..."
        if ! module_vault_seed; then
            log_error "Vault seed failed"
            return 1
        fi
        log_success "Vault secrets seeded"
        _hub_set_env "SECRETS_PROVIDER" "vault"
    else
        log_verbose "Vault secrets already seeded"
        _hub_set_env "SECRETS_PROVIDER" "vault"
    fi

    # -------------------------------------------------------------------------
    # Step 6: Rotate bootstrap certs to Vault PKI if available
    # -------------------------------------------------------------------------
    if [ "$vault_profile" = "vault-ha" ]; then
        if type _vault_node_certs_are_bootstrap &>/dev/null && _vault_node_certs_are_bootstrap; then
            log_info "Bootstrap certs detected — attempting rotation to Vault PKI..."
            if _rotate_vault_node_certs_to_pki; then
                log_success "Vault node certs rotated to Vault PKI"
            else
                log_verbose "Vault PKI rotation deferred (PKI not yet initialized)"
            fi
        fi
    fi

    # Mark Vault as bootstrapped for Phase 7 (Services) to skip redundant startup
    export HUB_VAULT_BOOTSTRAPPED=true

    log_success "Vault bootstrap complete — cluster ready for secret operations"
    return 0
}

##
# Install the Vault Root CA into the host system trust store (pipeline-friendly).
# Runs after Vault PKI setup and cert generation — ensures browsers trust the
# DIVE V3 certificate chain without manual intervention.
#
# This is non-blocking: if sudo isn't available, it warns with instructions.
# Spokes use the same Hub Root CA, so this only needs to run during hub deploy.
##
_hub_install_ca_trust() {
    # Source certificates module if not already loaded
    if ! type install_vault_ca_to_system_truststore &>/dev/null; then
        source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"
    fi

    # Extract the current Root CA fingerprint
    local root_ca_file="${DIVE_ROOT}/certs/vault-pki/ca-chain.pem"
    if [ ! -f "$root_ca_file" ]; then
        log_verbose "No Vault PKI chain found — skipping CA trust installation"
        return 0
    fi

    # Get fingerprint of the Root CA (last cert in chain)
    local cert_count
    cert_count=$(grep -c "BEGIN CERTIFICATE" "$root_ca_file" 2>/dev/null || echo "0")
    local current_fingerprint=""

    if [ "$cert_count" -ge 1 ]; then
        local tmp_root="${DIVE_ROOT}/.tmp-pipeline-root-ca.pem"
        # Extract the last cert (Root CA — self-signed)
        awk -v n="$cert_count" '/-----BEGIN CERTIFICATE-----/{c++} c==n{print} /-----END CERTIFICATE-----/{if(c==n) exit}' \
            "$root_ca_file" > "$tmp_root"
        current_fingerprint=$(openssl x509 -in "$tmp_root" -noout -fingerprint -sha256 2>/dev/null | sed 's/.*=//')
        rm -f "$tmp_root"
    fi

    if [ -z "$current_fingerprint" ]; then
        log_verbose "Could not determine Root CA fingerprint — skipping trust check"
        return 0
    fi

    # Check if this exact CA is already trusted in the system keychain
    local os_type
    os_type=$(uname -s)
    local already_trusted=false

    if [ "$os_type" = "Darwin" ]; then
        # macOS: Check system keychain for a cert with matching fingerprint
        local keychain_fingerprint
        keychain_fingerprint=$(security find-certificate -c "DIVE V3 Root CA" -Z /Library/Keychains/System.keychain 2>/dev/null \
            | grep "SHA-256" | head -1 | sed 's/.*: //')
        if [ -n "$keychain_fingerprint" ]; then
            # Normalize both to uppercase hex without colons/spaces
            local norm_current norm_keychain
            norm_current=$(echo "$current_fingerprint" | tr -d ':' | tr '[:lower:]' '[:upper:]')
            norm_keychain=$(echo "$keychain_fingerprint" | tr -d ':' | tr -d ' ' | tr '[:lower:]' '[:upper:]')
            if [ "$norm_current" = "$norm_keychain" ]; then
                already_trusted=true
            fi
        fi
    elif [ "$os_type" = "Linux" ]; then
        # Linux: Check if the cert file exists and matches
        local system_ca="/usr/local/share/ca-certificates/dive-v3-root-ca.crt"
        if [ -f "$system_ca" ]; then
            local system_fingerprint
            system_fingerprint=$(openssl x509 -in "$system_ca" -noout -fingerprint -sha256 2>/dev/null | sed 's/.*=//')
            if [ "$current_fingerprint" = "$system_fingerprint" ]; then
                already_trusted=true
            fi
        fi
    fi

    if [ "$already_trusted" = "true" ]; then
        log_success "Vault Root CA already trusted in system keychain (fingerprint matches)"
        return 0
    fi

    # CA not trusted or fingerprint changed — install it
    log_info "Installing Vault Root CA to system trust store (browsers will trust DIVE certificates)..."

    if [ "$os_type" = "Darwin" ]; then
        # Try non-interactive sudo first (succeeds if user has recent sudo session or NOPASSWD)
        local root_ca_pem="${DIVE_ROOT}/.tmp-pipeline-root-ca.pem"
        awk -v n="$cert_count" '/-----BEGIN CERTIFICATE-----/{c++} c==n{print} /-----END CERTIFICATE-----/{if(c==n) exit}' \
            "$root_ca_file" > "$root_ca_pem"

        if sudo -n security add-trusted-cert -d -r trustRoot \
            -k /Library/Keychains/System.keychain "$root_ca_pem" 2>/dev/null; then
            log_success "Vault Root CA installed in macOS system keychain"
            rm -f "$root_ca_pem"
            return 0
        fi

        # Non-interactive failed — try interactive (user sees password prompt in terminal)
        echo ""
        log_info "sudo password required to trust the Vault Root CA in your browser"
        log_info "(This prevents SEC_ERROR_BAD_SIGNATURE errors in Firefox/Chrome)"
        echo ""
        if sudo security add-trusted-cert -d -r trustRoot \
            -k /Library/Keychains/System.keychain "$root_ca_pem" 2>/dev/null; then
            log_success "Vault Root CA installed in macOS system keychain"
            echo ""
            echo "  Chrome/Safari: Trusted immediately (restart browser)"
            echo "  Firefox:       Set security.enterprise_roots.enabled=true in about:config"
            echo ""
            rm -f "$root_ca_pem"
            return 0
        fi

        # Both attempts failed — warn but don't block
        rm -f "$root_ca_pem"
        log_warn "Could not install Root CA (sudo required)"
        log_warn "Run manually after deployment: ./dive vault trust-ca"
        return 0
    elif [ "$os_type" = "Linux" ]; then
        local root_ca_pem="${DIVE_ROOT}/.tmp-pipeline-root-ca.pem"
        awk -v n="$cert_count" '/-----BEGIN CERTIFICATE-----/{c++} c==n{print} /-----END CERTIFICATE-----/{if(c==n) exit}' \
            "$root_ca_file" > "$root_ca_pem"

        local ca_dest="/usr/local/share/ca-certificates/dive-v3-root-ca.crt"
        if sudo -n cp "$root_ca_pem" "$ca_dest" 2>/dev/null && sudo -n update-ca-certificates 2>/dev/null; then
            log_success "Vault Root CA installed in Linux system CA store"
            rm -f "$root_ca_pem"
            return 0
        fi

        echo ""
        log_info "sudo password required to trust the Vault Root CA in your browser"
        echo ""
        if sudo cp "$root_ca_pem" "$ca_dest" && sudo update-ca-certificates; then
            log_success "Vault Root CA installed in Linux system CA store"
            rm -f "$root_ca_pem"
            return 0
        fi

        rm -f "$root_ca_pem"
        log_warn "Could not install Root CA (sudo required)"
        log_warn "Run manually after deployment: ./dive vault trust-ca"
        return 0
    fi

    return 0
}

hub_phase_mongodb_init() {
    local instance_code="$1"
    local pipeline_mode="$2"
    _hub_init_mongodb_replica_set
}

hub_phase_build() {
    local instance_code="$1"
    local pipeline_mode="$2"

    log_info "Building Docker images..."

    cd "$DIVE_ROOT"

    # Build images WITHOUT circuit breaker output capture
    # This is heavyweight I/O that must stream to stdout
    local build_log="${DIVE_ROOT}/logs/docker-builds/hub-build-$(date +%Y%m%d-%H%M%S).log"
    mkdir -p "$(dirname "$build_log")"

    log_info "Build output: $build_log"

    if ${DOCKER_CMD:-docker} compose $HUB_COMPOSE_FILES --profile "$(_vault_get_profile)" build 2>&1 | tee "$build_log"; then
        log_success "Docker images built successfully"
        return 0
    else
        log_error "Failed to build Docker images"
        log_error "Full build log: $build_log"
        return 1
    fi
}

##
# Ensure OPAL JWT signing keys exist before starting services.
# SSOT: Vault KV v2 at dive-v3/opal/jwt-signing.
# Files on disk at certs/opal/ are a cache derived from Vault.
#
# Key formats (OPAL requirement):
#   Private key: PEM (-----BEGIN PRIVATE KEY-----)
#   Public key:  SSH (ssh-rsa AAAA...) — OPAL's cast_public_key() calls load_ssh_public_key()
#
# Flow: Vault restore → Disk check → Generate fresh → Store in Vault
##
_hub_ensure_opal_keys() {
    local opal_dir="${DIVE_ROOT}/certs/opal"
    mkdir -p "$opal_dir"

    # Phase 1: Try to restore from Vault (SSOT)
    if vault_is_authenticated 2>/dev/null; then
        local vault_priv=""
        vault_priv=$(vault_get_secret "opal" "jwt-signing" "private_key_pem" 2>/dev/null || true)
        if [ -n "$vault_priv" ]; then
            local vault_pub_ssh=""
            vault_pub_ssh=$(vault_get_secret "opal" "jwt-signing" "public_key_ssh" 2>/dev/null || true)
            if [ -n "$vault_pub_ssh" ]; then
                local vault_pub_pem=""
                vault_pub_pem=$(vault_get_secret "opal" "jwt-signing" "public_key_pem" 2>/dev/null || true)
                echo "$vault_priv" > "$opal_dir/jwt-signing-key.pem"
                echo "$vault_pub_ssh" > "$opal_dir/jwt-signing-key.pub.ssh"
                [ -n "$vault_pub_pem" ] && echo "$vault_pub_pem" > "$opal_dir/jwt-signing-key.pub.pem"
                chmod 644 "$opal_dir/jwt-signing-key.pem"
                chmod 644 "$opal_dir/jwt-signing-key.pub.ssh"
                chmod 644 "$opal_dir/jwt-signing-key.pub.pem" 2>/dev/null || true
                log_success "OPAL JWT signing keys restored from Vault"
                return 0
            fi
        fi
    fi

    # Phase 2: Check if correct files already exist on disk
    if [ -f "$opal_dir/jwt-signing-key.pem" ] && [ -f "$opal_dir/jwt-signing-key.pub.ssh" ]; then
        log_verbose "OPAL JWT signing keys already exist (PEM + SSH)"
        _hub_opal_keys_to_vault "$opal_dir" 2>/dev/null || true
        return 0
    fi

    # Phase 2b: PEM exists but SSH missing — convert without regenerating
    if [ -f "$opal_dir/jwt-signing-key.pem" ] && [ ! -f "$opal_dir/jwt-signing-key.pub.ssh" ]; then
        log_info "Converting existing OPAL public key to SSH format..."
        if [ ! -f "$opal_dir/jwt-signing-key.pub.pem" ]; then
            openssl rsa -in "$opal_dir/jwt-signing-key.pem" \
                -pubout -out "$opal_dir/jwt-signing-key.pub.pem" 2>/dev/null
        fi
        ssh-keygen -i -m PKCS8 -f "$opal_dir/jwt-signing-key.pub.pem" \
            > "$opal_dir/jwt-signing-key.pub.ssh" 2>/dev/null || {
            log_error "Failed to convert OPAL public key to SSH format"
            return 1
        }
        chmod 644 "$opal_dir/jwt-signing-key.pub.ssh"
        _hub_opal_keys_to_vault "$opal_dir" 2>/dev/null || true
        log_success "OPAL public key converted to SSH format (existing private key preserved)"
        return 0
    fi

    # Phase 3: Generate fresh keys
    log_info "Generating OPAL JWT signing keys..."
    openssl genrsa -out "$opal_dir/jwt-signing-key.pem" 4096 2>/dev/null
    openssl rsa -in "$opal_dir/jwt-signing-key.pem" \
        -pubout -out "$opal_dir/jwt-signing-key.pub.pem" 2>/dev/null

    # Convert PEM public key to SSH format (OPAL requires ssh-rsa format)
    ssh-keygen -i -m PKCS8 -f "$opal_dir/jwt-signing-key.pub.pem" \
        > "$opal_dir/jwt-signing-key.pub.ssh" 2>/dev/null || {
        log_error "Failed to convert public key to SSH format"
        return 1
    }

    chmod 644 "$opal_dir/jwt-signing-key.pem"
    chmod 644 "$opal_dir/jwt-signing-key.pub.ssh"
    chmod 644 "$opal_dir/jwt-signing-key.pub.pem"

    # Store in Vault (best-effort)
    _hub_opal_keys_to_vault "$opal_dir" 2>/dev/null || true

    log_success "OPAL JWT signing keys generated at $opal_dir"
}

##
# Upload OPAL JWT signing keys to Vault KV v2 (idempotent, best-effort).
##
_hub_opal_keys_to_vault() {
    local opal_dir="$1"
    vault_is_authenticated 2>/dev/null || return 0

    local priv_pem pub_ssh pub_pem
    priv_pem=$(cat "$opal_dir/jwt-signing-key.pem")
    pub_ssh=$(cat "$opal_dir/jwt-signing-key.pub.ssh")
    pub_pem=$(cat "$opal_dir/jwt-signing-key.pub.pem" 2>/dev/null || echo "")

    local json_payload
    json_payload=$(jq -n \
        --arg priv "$priv_pem" \
        --arg pub_ssh "$pub_ssh" \
        --arg pub_pem "$pub_pem" \
        '{private_key_pem: $priv, public_key_ssh: $pub_ssh, public_key_pem: $pub_pem}')

    if vault_set_secret "opal" "jwt-signing" "$json_payload"; then
        log_verbose "OPAL JWT signing keys stored in Vault (dive-v3/opal/jwt-signing)"
    else
        log_warn "Could not store OPAL keys in Vault (non-fatal)"
    fi
}

##
# Ensure OPAL data source token exists (service-to-service auth).
# SSOT: Vault KV v2 (dive-v3/opal/data-source-token)
# Fallback: .env.hub → generate fresh → store in Vault + .env files
##
_hub_ensure_opal_data_token() {
    local token=""

    # Strategy 1: Vault SSOT
    if vault_is_authenticated 2>/dev/null; then
        token=$(vault_get_secret "opal" "data-source-token" "token" 2>/dev/null || true)
        if [ -n "$token" ]; then
            log_verbose "OPAL data source token loaded from Vault"
        fi
    fi

    # Strategy 2: .env.hub fallback
    if [ -z "$token" ] && [ -f "$DIVE_ROOT/.env.hub" ]; then
        token=$(grep "^OPAL_DATA_SOURCE_TOKEN=" "$DIVE_ROOT/.env.hub" 2>/dev/null | cut -d= -f2)
        [ -n "$token" ] && log_verbose "OPAL data source token loaded from .env.hub"
    fi

    # Strategy 3: Generate fresh
    if [ -z "$token" ]; then
        token=$(openssl rand -base64 48 | tr -d '/+=' | cut -c1-64)
        log_info "Generated new OPAL data source token"

        # Store in Vault (best-effort)
        if vault_is_authenticated 2>/dev/null; then
            local json_payload
            json_payload=$(jq -n --arg t "$token" '{token: $t}')
            if vault_set_secret "opal" "data-source-token" "$json_payload"; then
                log_verbose "OPAL data source token stored in Vault"
            fi
        fi
    fi

    # Write to .env.hub (cross-platform via _hub_set_env)
    # .env is a symlink to .env.hub, so this updates both
    _hub_set_env "OPAL_DATA_SOURCE_TOKEN" "$token"

    export OPAL_DATA_SOURCE_TOKEN="$token"
    log_success "OPAL data source token ready"
}

hub_phase_services() {
    local instance_code="$1"
    local pipeline_mode="$2"

    # SERVICES phase now ONLY starts services (build happens in BUILD phase)
    log_info "Starting hub services..."

    # DIVE_ROOT is set by the main dive script and should already be in environment
    # If not set, infer from script location
    if [ -z "$DIVE_ROOT" ]; then
        DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
        export DIVE_ROOT
    fi

    cd "$DIVE_ROOT" || {
        log_error "Failed to change to DIVE_ROOT=$DIVE_ROOT"
        return 1
    }

    # Ensure OPAL JWT signing keys exist (required by opal-server entrypoint)
    _hub_ensure_opal_keys

    # Ensure OPAL data source token exists (service-to-service auth for data endpoints)
    _hub_ensure_opal_data_token

    # Ensure dive-shared network exists
    if ! ${DOCKER_CMD:-docker} network inspect dive-shared >/dev/null 2>&1; then
        log_verbose "Creating dive-shared network..."
        if ! ${DOCKER_CMD:-docker} network create dive-shared 2>/dev/null; then
            log_error "Failed to create dive-shared network"
            return 1
        fi
    fi

    # Load secrets
    if ! load_secrets; then
        log_error "Failed to load secrets"
        return 1
    fi

    # Start services (parallel or sequential)
    local use_parallel="${PARALLEL_STARTUP_ENABLED:-true}"

    if [ "$use_parallel" = "true" ] && type hub_parallel_startup &>/dev/null; then
        log_info "Using parallel service startup (dependency-aware)"
        if ! hub_parallel_startup; then
            log_error "Parallel service startup failed"
            return 1
        fi
    else
        log_info "Using sequential service startup"
        if ! ${DOCKER_CMD:-docker} compose $HUB_COMPOSE_FILES up -d; then
            log_error "Sequential service startup failed"
            return 1
        fi
    fi

    # Provision Hub OPAL client token (after services are up)
    _hub_provision_opal_client_token

    # Start shared services stack (token-store, Prometheus, Grafana, Alertmanager)
    _hub_start_shared_stack

    log_success "Hub services started successfully"
    return 0
}

# ============================================================================
# Shared Services Stack (token-store, monitoring, exporters)
# ============================================================================
# Seeds shared .env from hub secrets, syncs certs, starts the stack.
# Requires: .env.hub populated, instances/hub/certs/ present, dive-shared network.
# ============================================================================
_hub_start_shared_stack() {
    local shared_dir="${DIVE_ROOT}/docker/instances/shared"
    if [ ! -f "${shared_dir}/docker-compose.yml" ]; then
        log_warn "Shared services stack not found at ${shared_dir} — skipping"
        return 0
    fi

    log_info "Starting shared services stack (token-store, Prometheus, Grafana)..."

    # Seed shared .env + certs from hub (load-secrets.sh reads .env.hub)
    if [ -f "${shared_dir}/load-secrets.sh" ]; then
        DIVE_ROOT="${DIVE_ROOT}" bash "${shared_dir}/load-secrets.sh" || {
            log_warn "load-secrets.sh failed — shared stack may use stale secrets"
        }
    fi

    # Start the stack
    if ${DOCKER_CMD:-docker} compose -f "${shared_dir}/docker-compose.yml" up -d 2>/dev/null; then
        log_success "Shared services stack started"
    else
        log_warn "Shared services stack failed to start (non-fatal)"
    fi

    return 0
}

# ============================================================================
# Hub OPAL Client Token Provisioning & Startup
# ============================================================================
# After all services are up (OPAL server healthy), generate a real JWT client
# token and start the hub's OPAL client with it. The OPAL client is in the
# "opal" profile so it does NOT start during parallel startup — it starts
# here with a real token, eliminating the placeholder token pattern entirely.
# ============================================================================
_hub_provision_opal_client_token() {
    log_info "Provisioning Hub OPAL client token..."

    local master_token
    master_token=$(grep "^OPAL_AUTH_MASTER_TOKEN=" "$DIVE_ROOT/.env.hub" 2>/dev/null | cut -d= -f2)

    if [ -z "$master_token" ]; then
        log_warn "OPAL_AUTH_MASTER_TOKEN not found — skipping OPAL client"
        return 0
    fi

    local opal_url="https://localhost:${OPAL_PORT:-7002}"
    local max_attempts=10

    for attempt in $(seq 1 $max_attempts); do
        local token
        token=$(curl -sk --max-time 5 \
            -X POST "${opal_url}/token" \
            -H "Authorization: Bearer ${master_token}" \
            -H "Content-Type: application/json" \
            -d '{"type": "client"}' 2>/dev/null | jq -r '.token // empty')

        if [ -n "$token" ]; then
            # Store in .env.hub (cross-platform via _hub_set_env)
            _hub_set_env "HUB_OPAL_TOKEN" "$token"

            # Start OPAL client with real token (profile: opal)
            log_info "Starting OPAL client with real token..."
            ${DOCKER_CMD:-docker} compose --profile opal -f "$HUB_COMPOSE_FILE" up -d opal-client

            # Wait for OPAL client to become healthy
            local opal_container="${COMPOSE_PROJECT_NAME:-dive-hub}-opal-client"
            local opal_timeout=60
            local opal_elapsed=0
            while [ $opal_elapsed -lt $opal_timeout ]; do
                local health
                health=$(${DOCKER_CMD:-docker} inspect "$opal_container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "not_found")
                if [ "$health" = "healthy" ]; then
                    log_success "Hub OPAL client started and healthy"
                    return 0
                elif [ "$health" = "not_found" ]; then
                    log_error "OPAL client container not found"
                    return 1
                fi
                sleep 3
                opal_elapsed=$((opal_elapsed + 3))
            done

            log_warn "OPAL client started but not yet healthy after ${opal_timeout}s (non-blocking)"
            return 0
        fi

        log_verbose "OPAL token attempt $attempt/$max_attempts..."
        sleep 2
    done

    log_warn "Could not provision OPAL client token (OPAL server may not be ready)"
    return 0  # Non-fatal
}

hub_phase_keycloak_config() {
    local instance_code="$1"
    local pipeline_mode="$2"
    hub_configure_keycloak
}

hub_phase_realm_verify() {
    local instance_code="$1"
    local pipeline_mode="$2"
    hub_verify_realm
}

hub_phase_kas_register() {
    local instance_code="$1"
    local pipeline_mode="$2"

    # Load hub seed module for KAS registration
    if [ -f "${MODULES_DIR}/hub/seed.sh" ]; then
        source "${MODULES_DIR}/hub/seed.sh"
        if type _hub_register_kas &>/dev/null; then
            _hub_register_kas
            return $?
        fi
    fi
    log_warn "KAS registration function not available"
    return 0  # Non-fatal
}

hub_phase_seeding() {
    local instance_code="$1"
    local pipeline_mode="$2"
    hub_seed 5000
}

hub_phase_kas_init() {
    local instance_code="$1"
    local pipeline_mode="$2"
    _hub_init_kas
}

hub_phase_vault_db_engine() {
    local instance_code="$1"
    local pipeline_mode="$2"

    # Skip if Vault not bootstrapped or secrets provider isn't vault
    local secrets_provider
    secrets_provider=$(grep '^SECRETS_PROVIDER=' "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d= -f2- || echo "")
    if [ "$secrets_provider" != "vault" ]; then
        log_verbose "SECRETS_PROVIDER is not 'vault' — skipping database engine setup"
        return 0
    fi

    if [ "${HUB_VAULT_BOOTSTRAPPED:-false}" != "true" ]; then
        log_verbose "Vault not bootstrapped — skipping database engine setup"
        return 0
    fi

    log_info "Configuring Vault database secrets engine..."

    # Ensure vault module (includes db-engine.sh) is loaded
    if ! type module_vault_db_setup &>/dev/null; then
        source "${DIVE_ROOT}/scripts/dive-modules/vault/module.sh"
    fi

    if ! module_vault_db_setup; then
        log_warn "Vault database engine setup failed — backend will use static credentials"
        return 0  # Non-fatal: graceful degradation
    fi

    # Ensure VAULT_DB_ROLE is set in .env.hub for backend
    if ! grep -q '^VAULT_DB_ROLE=' "${DIVE_ROOT}/.env.hub" 2>/dev/null; then
        _vault_update_env "${DIVE_ROOT}/.env.hub" "VAULT_DB_ROLE" "backend-hub-rw"
        _vault_update_env "${DIVE_ROOT}/.env.hub" "VAULT_DB_ROLE_KAS" "kas-hub-ro"
    fi

    # Recreate services that need updated credentials:
    # - backend: dynamic MongoDB credentials (VAULT_DB_ROLE)
    # - keycloak: rotated PG password (KC_DB_PASSWORD via static role)
    # - frontend: rotated PG password (nextauth_user via FRONTEND_DATABASE_URL)
    # NOTE: `up -d --force-recreate` re-reads .env.hub; `restart` does not.
    log_info "Recreating services with updated Vault credentials..."
    if ${DOCKER_CMD:-docker} compose $HUB_COMPOSE_FILES --env-file "${DIVE_ROOT}/.env.hub" up -d --force-recreate --no-build backend keycloak frontend >/dev/null 2>&1; then
        # Wait for Keycloak to become healthy (longest startup)
        local kc_wait=0
        local kc_max=90
        while [ $kc_wait -lt $kc_max ]; do
            local kc_health
            kc_health=$(${DOCKER_CMD:-docker} inspect dive-hub-keycloak --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
            if [ "$kc_health" = "healthy" ]; then
                log_success "Services recreated with Vault credentials (${kc_wait}s)"
                return 0
            fi
            sleep 1
            kc_wait=$((kc_wait + 1))
        done
        log_warn "Keycloak health timeout (${kc_max}s) — check: docker logs dive-hub-keycloak"
    else
        log_warn "Service recreation failed — some credentials may be stale"
    fi

    return 0  # Non-fatal
}

##
# Internal MongoDB replica set initialization
# Extracted from hub_deploy() for circuit breaker wrapping
##
_hub_init_mongodb_replica_set() {
    # Load secrets for MONGO_PASSWORD
    if ! load_secrets; then
        log_error "Failed to load secrets - cannot initialize MongoDB"
        return 1
    fi

    # Start MongoDB first
    log_verbose "Starting MongoDB container..."
    if ! ${DOCKER_CMD:-docker} compose $HUB_COMPOSE_FILES up -d mongodb >/dev/null 2>&1; then
        log_error "Failed to start MongoDB container"
        return 1
    fi

    # Wait for MongoDB container to be healthy
    log_verbose "Waiting for MongoDB container to be healthy..."
    local mongo_wait=0
    local mongo_max_wait=60
    while [ $mongo_wait -lt $mongo_max_wait ]; do
        if ${DOCKER_CMD:-docker} ps --filter "name=dive-hub-mongodb" --filter "health=healthy" --format "{{.Names}}" | grep -q "dive-hub-mongodb"; then
            log_verbose "MongoDB container is healthy (${mongo_wait}s)"
            break
        fi
        sleep 1  # OPTIMIZATION: Reduced from 2s to 1s for faster detection
        mongo_wait=$((mongo_wait + 1))
    done

    if [ $mongo_wait -ge $mongo_max_wait ]; then
        log_warn "MongoDB container not healthy after ${mongo_max_wait}s, attempting replica set init anyway..."
    fi

    # Initialize replica set
    if [ ! -f "${DIVE_ROOT}/scripts/init-mongo-replica-set-post-start.sh" ]; then
        log_error "MongoDB initialization script not found"
        return 1
    fi

    if ! bash "${DIVE_ROOT}/scripts/init-mongo-replica-set-post-start.sh" dive-hub-mongodb admin "$MONGO_PASSWORD"; then
        log_error "MongoDB replica set initialization FAILED"
        return 1
    fi

    log_success "MongoDB replica set initialized and PRIMARY"
    export HUB_MONGODB_RS_INITIALIZED=true

    # OPTIMIZATION: Remove fixed 3s sleep - healthcheck already ensures PRIMARY status
    # If additional stabilization needed, callers can implement their own polling
    log_verbose "MongoDB replica set ready (no artificial delay - healthcheck ensures PRIMARY)"

    return 0
}

##
# Internal KAS initialization
# Extracted from hub_deploy() for circuit breaker wrapping
##
_hub_init_kas() {
    if docker ps --format '{{.Names}}' | grep -q "${HUB_COMPOSE_PROJECT:-dive-hub}-kas"; then
        log_info "Waiting for KAS to be healthy..."
        local kas_wait=0
        local kas_max_wait=60

        while [ $kas_wait -lt $kas_max_wait ]; do
            local kas_health=$(docker inspect "${HUB_COMPOSE_PROJECT:-dive-hub}-kas" \
                --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")

            if [ "$kas_health" = "healthy" ]; then
                log_success "KAS is healthy"
                break
            fi

            sleep 2
            ((kas_wait += 2))
        done

        if [ $kas_wait -ge $kas_max_wait ]; then
            log_warn "KAS health check timeout after ${kas_max_wait}s"
            return 1
        fi

        # Verify health endpoint
        local kas_port="${KAS_HOST_PORT:-8085}"
        if curl -sf -k "https://localhost:${kas_port}/health" >/dev/null 2>&1; then
            log_success "KAS health endpoint responding on port ${kas_port}"
        fi
    else
        log_info "KAS container not found - skipping (optional service)"
    fi

    return 0
}

##
# Execute hub deployment pipeline with circuit breaker protection
#
# This is the new orchestrated entry point for hub deployment that provides:
#   - Deployment lock to prevent concurrent deployments
#   - Circuit breaker protection for each phase
#   - Failure threshold enforcement
#   - Checkpoint-based resume capability
#
# Arguments:
#   $1 - Pipeline mode (deploy|up|resume)
#
# Returns:
#   0 - Success
#   1 - Failure
##
