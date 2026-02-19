# =============================================================================
# DIVE V3 - Vault Operations (PKI DR + Secret Seeding)
# =============================================================================
# Sourced by vault/module.sh — do not execute directly.
#
# Functions: backup-pki, restore-pki, rekey-intermediate, seed, env helpers
# =============================================================================

module_vault_backup_pki() {
    if _vault_is_dev_mode; then
        log_warn "Vault dev mode — PKI backup not applicable"
        return 0
    fi

    if ! vault_is_running; then return 1; fi

    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    else
        log_error "Vault token not found — run: ./dive vault init"
        return 1
    fi

    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_dir="${DIVE_ROOT}/backups/pki"
    mkdir -p "$backup_dir"

    echo ""
    log_info "==================================================================="
    log_info "  Vault PKI Backup"
    log_info "==================================================================="

    local errors=0

    # Export Root CA cert
    log_info "Step 1/3: Exporting Root CA certificate..."
    local root_ca_file="${backup_dir}/root-ca-${timestamp}.pem"
    local root_cert
    root_cert=$(vault read -field=certificate pki/cert/ca 2>/dev/null || true)
    if [ -n "$root_cert" ]; then
        echo "$root_cert" > "$root_ca_file"
        log_success "  Root CA cert: $root_ca_file"
    else
        log_warn "  Root CA not available (PKI may not be configured)"
        errors=$((errors + 1))
    fi

    # Export Intermediate CA cert
    log_info "Step 2/3: Exporting Intermediate CA certificate..."
    local int_ca_file="${backup_dir}/intermediate-ca-${timestamp}.pem"
    local int_cert
    int_cert=$(vault read -field=certificate pki_int/cert/ca 2>/dev/null || true)
    if [ -n "$int_cert" ]; then
        echo "$int_cert" > "$int_ca_file"
        log_success "  Intermediate CA cert: $int_ca_file"
    else
        log_warn "  Intermediate CA not available"
        errors=$((errors + 1))
    fi

    # Raft snapshot (includes PKI engine state with private keys)
    log_info "Step 3/3: Creating Vault Raft snapshot..."
    local snap_file="${backup_dir}/vault-pki-snapshot-${timestamp}.snap"
    if module_vault_snapshot "$snap_file"; then
        log_success "  Snapshot: $snap_file"
    else
        log_error "  Raft snapshot failed"
        errors=$((errors + 1))
    fi

    echo ""
    log_info "==================================================================="
    log_info "  PKI Backup Summary"
    log_info "==================================================================="
    log_info "  Backup directory: $backup_dir"
    [ -f "$root_ca_file" ] && log_info "  Root CA cert:       $(du -h "$root_ca_file" | awk '{print $1}')"
    [ -f "$int_ca_file" ] && log_info "  Intermediate cert:  $(du -h "$int_ca_file" | awk '{print $1}')"
    [ -f "$snap_file" ] && log_info "  Raft snapshot:      $(du -h "$snap_file" | awk '{print $1}')"
    [ $errors -gt 0 ] && log_warn "  Warnings: $errors"
    log_info "==================================================================="

    return 0
}

##
# Restore PKI from a Vault Raft snapshot, then re-issue all service certificates.
#
# Steps:
#   1. Restore Raft snapshot (replaces all Vault data)
#   2. Wait for Vault to become healthy
#   3. Verify CA chain integrity
#   4. Re-issue all service certificates (hub + spokes)
#   5. Distribute new CRL
#
# Usage: ./dive vault restore-pki <snapshot-path>
##
module_vault_restore_pki() {
    local snapshot_path="${1:-}"

    if [ -z "$snapshot_path" ]; then
        log_error "Usage: ./dive vault restore-pki <snapshot-path>"
        log_info "Example: ./dive vault restore-pki backups/pki/vault-pki-snapshot-20260210.snap"
        return 1
    fi

    if [ ! -f "$snapshot_path" ]; then
        log_error "Snapshot not found: $snapshot_path"
        return 1
    fi

    echo ""
    log_warn "================================================================="
    log_warn "  VAULT PKI RESTORE"
    log_warn "  This will REPLACE all Vault data and re-issue ALL certificates."
    log_warn "  Snapshot: $snapshot_path"
    log_warn "================================================================="
    echo ""
    if is_interactive; then
        read -rp "Type 'RESTORE' to confirm: " confirm
        if [ "$confirm" != "RESTORE" ]; then
            log_info "Aborted"
            return 0
        fi
    else
        log_warn "Non-interactive mode: auto-confirming PKI restore"
    fi

    # Step 1: Restore snapshot
    log_info "Step 1/5: Restoring Raft snapshot..."
    if ! module_vault_restore "$snapshot_path"; then
        log_error "Snapshot restore failed"
        return 1
    fi

    # Step 2: Wait for Vault to become healthy
    log_info "Step 2/5: Waiting for Vault to become healthy..."
    local retries=30
    while [ $retries -gt 0 ]; do
        if vault status 2>/dev/null | grep -q "Sealed.*false"; then
            log_success "  Vault is unsealed and healthy"
            break
        fi
        sleep 2
        retries=$((retries - 1))
    done
    if [ $retries -eq 0 ]; then
        log_error "  Vault did not become healthy after restore"
        return 1
    fi

    # Step 3: Verify CA chain
    log_info "Step 3/5: Verifying CA chain integrity..."
    local root_cert int_cert
    root_cert=$(vault read -field=certificate pki/cert/ca 2>/dev/null || true)
    int_cert=$(vault read -field=certificate pki_int/cert/ca 2>/dev/null || true)

    if [ -n "$root_cert" ] && [ -n "$int_cert" ]; then
        log_success "  Root CA and Intermediate CA accessible"
    else
        log_error "  CA chain verification failed — PKI engines may be missing"
        return 1
    fi

    # Step 4: Re-issue all certificates
    log_info "Step 4/5: Re-issuing all service certificates..."
    source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"

    if type cert_emergency_rotate &>/dev/null; then
        cert_emergency_rotate "all" "--force"
    else
        log_error "  cert_emergency_rotate not available"
        return 1
    fi

    # Step 5: Distribute CRL
    log_info "Step 5/5: Distributing updated CRL..."
    if type _distribute_crl &>/dev/null; then
        _distribute_crl
    fi

    echo ""
    log_success "PKI restore complete — all certificates re-issued"
    return 0
}

##
# Rekey the Intermediate CA: generate new CSR, sign with Root, re-issue all certs.
#
# WARNING: This is a disruptive operation — requires --confirm flag.
# All service certificates must be re-issued after rekeying.
#
# Usage: ./dive vault rekey-intermediate --confirm
##
module_vault_rekey_intermediate() {
    local confirmed=false
    for arg in "$@"; do
        [ "$arg" = "--confirm" ] && confirmed=true
    done

    if [ "$confirmed" != true ]; then
        echo ""
        log_error "Usage: ./dive vault rekey-intermediate --confirm"
        echo ""
        log_warn "This operation will:"
        log_warn "  1. Generate a new Intermediate CA key pair"
        log_warn "  2. Sign it with the existing Root CA"
        log_warn "  3. Re-issue ALL service certificates (hub + spokes)"
        log_warn "  4. Restart ALL services"
        echo ""
        log_warn "ALL services will be briefly unavailable."
        log_info "Add --confirm to proceed."
        return 1
    fi

    if ! vault_is_running; then return 1; fi

    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    else
        log_error "Vault token not found — run: ./dive vault init"
        return 1
    fi

    echo ""
    log_info "==================================================================="
    log_info "  INTERMEDIATE CA REKEY"
    log_info "==================================================================="

    # Step 1: Backup current state
    log_info "Step 1/5: Backing up current PKI state..."
    module_vault_backup_pki || log_warn "Backup failed (continuing — ensure you have a recent backup)"

    # Step 2: Generate new Intermediate CA
    log_info "Step 2/5: Generating new Intermediate CA key pair..."
    local csr
    csr=$(vault write -field=csr pki_int/intermediate/generate/internal \
        common_name="DIVE V3 Intermediate CA (rekeyed $(date +%Y%m%d))" \
        key_type=rsa \
        key_bits=4096 2>/dev/null)

    if [ -z "$csr" ]; then
        log_error "  Failed to generate Intermediate CA CSR"
        return 1
    fi
    log_success "  New Intermediate CA CSR generated"

    # Step 3: Sign with Root CA
    log_info "Step 3/5: Signing with Root CA..."
    local signed_cert
    signed_cert=$(vault write -field=certificate pki/root/sign-intermediate \
        csr="$csr" \
        format=pem_bundle \
        ttl=43800h 2>/dev/null)

    if [ -z "$signed_cert" ]; then
        log_error "  Failed to sign Intermediate CA"
        return 1
    fi
    log_success "  Intermediate CA signed by Root CA"

    # Step 4: Import signed certificate
    log_info "Step 4/5: Importing signed Intermediate CA..."
    if vault write pki_int/intermediate/set-signed certificate="$signed_cert" >/dev/null 2>&1; then
        log_success "  Intermediate CA imported"
    else
        log_error "  Failed to import signed Intermediate CA"
        return 1
    fi

    # Step 5: Emergency rotate all certificates
    log_info "Step 5/5: Re-issuing all service certificates..."
    source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"

    if type cert_emergency_rotate &>/dev/null; then
        cert_emergency_rotate "all" "--force"
    else
        log_error "  Emergency rotation not available"
        return 1
    fi

    echo ""
    log_info "==================================================================="
    log_success "  Intermediate CA rekeyed and all certificates re-issued"
    log_info "==================================================================="

    return 0
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

    # Check if unsealed FIRST (before attempting any authentication)
    if ! _vault_check_unsealed; then
        return 1
    fi

    # Load token - prefer AppRole (best practice), fallback to root token
    # BEST PRACTICE (2026-02-11): Use AppRole authentication for Hub
    if [ -f "${DIVE_ROOT}/.env.hub" ]; then
        # Extract AppRole credentials using grep (safe - doesn't execute corrupted env files)
        # CRITICAL FIX: Don't source .env.hub - it may contain error messages from previous runs
        local vault_role_id=$(grep "^VAULT_ROLE_ID=" "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d= -f2-)
        local vault_secret_id=$(grep "^VAULT_SECRET_ID=" "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d= -f2-)

        if [ -n "$vault_role_id" ] && [ -n "$vault_secret_id" ]; then
            # Authenticate with AppRole
            local vault_login_response
            vault_login_response=$(vault write -format=json auth/approle/login \
                role_id="$vault_role_id" \
                secret_id="$vault_secret_id" 2>&1)

            if echo "$vault_login_response" | grep -q '"client_token"'; then
                VAULT_TOKEN=$(echo "$vault_login_response" | grep -o '"client_token":"[^"]*' | cut -d'"' -f4)
                export VAULT_TOKEN
                log_verbose "Authenticated to Vault with Hub AppRole"
            else
                log_warn "AppRole authentication failed, falling back to root token"
                # Fallback to root token
                if [ -f "$VAULT_TOKEN_FILE" ]; then
                    VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
                    export VAULT_TOKEN
                else
                    log_error "Vault token not found - run: ./dive vault init"
                    return 1
                fi
            fi
        else
            # No AppRole credentials, use root token (first-time setup)
            if [ -f "$VAULT_TOKEN_FILE" ]; then
                VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
                export VAULT_TOKEN
                log_verbose "Using root token (AppRole not yet configured)"
            else
                log_error "Vault token not found - run: ./dive vault init"
                return 1
            fi
        fi
    else
        # .env.hub doesn't exist, use root token
        if [ -f "$VAULT_TOKEN_FILE" ]; then
            VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
            export VAULT_TOKEN
        else
            log_error "Vault token not found - run: ./dive vault init"
            return 1
        fi
    fi

    # Source secrets module for vault_set_secret()
    source "${DIVE_ROOT}/scripts/dive-modules/configuration/secrets.sh"

    # Hub only — spoke secrets are provisioned via: ./dive vault provision <CODE>
    local all_instances=("usa")
    local total_seeded=0
    local total_failed=0

    # ==========================================================================
    # Instance-specific secrets (per instance) - IDEMPOTENT
    # ==========================================================================
    # CRITICAL FIX (2026-02-11): Check if secrets exist before generating new ones
    # Ensures hub can be re-seeded without breaking existing deployments
    # ==========================================================================
    for instance in "${all_instances[@]}"; do
        log_info "Seeding secrets for $(upper "$instance")..."

        # PostgreSQL password
        local postgres_pw
        if vault_get_secret "core" "${instance}/postgres" "password" >/dev/null 2>&1; then
            postgres_pw=$(vault_get_secret "core" "${instance}/postgres" "password")
            log_verbose "  ✓ Using existing PostgreSQL password"
        else
            postgres_pw=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
            log_info "  ↻ Generated new PostgreSQL password"
        fi

        # MongoDB password
        local mongodb_pw
        if vault_get_secret "core" "${instance}/mongodb" "password" >/dev/null 2>&1; then
            mongodb_pw=$(vault_get_secret "core" "${instance}/mongodb" "password")
            log_verbose "  ✓ Using existing MongoDB password"
        else
            mongodb_pw=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
            log_info "  ↻ Generated new MongoDB password"
        fi

        # Redis password
        local redis_pw
        if vault_get_secret "core" "${instance}/redis" "password" >/dev/null 2>&1; then
            redis_pw=$(vault_get_secret "core" "${instance}/redis" "password")
            log_verbose "  ✓ Using existing Redis password"
        else
            redis_pw=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
            log_info "  ↻ Generated new Redis password"
        fi

        # Keycloak admin password
        local keycloak_pw
        if vault_get_secret "core" "${instance}/keycloak-admin" "password" >/dev/null 2>&1; then
            keycloak_pw=$(vault_get_secret "core" "${instance}/keycloak-admin" "password")
            log_verbose "  ✓ Using existing Keycloak admin password"
        else
            keycloak_pw=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
            log_info "  ↻ Generated new Keycloak admin password"
        fi

        # NextAuth secret
        local nextauth_secret
        if vault_get_secret "auth" "${instance}/nextauth" "secret" >/dev/null 2>&1; then
            nextauth_secret=$(vault_get_secret "auth" "${instance}/nextauth" "secret")
            log_verbose "  ✓ Using existing NextAuth secret"
        else
            nextauth_secret=$(openssl rand -base64 32)
            log_info "  ↻ Generated new NextAuth secret"
        fi

        # Keycloak database password
        local keycloak_db_pw
        if vault_get_secret "core" "${instance}/keycloak-db" "password" >/dev/null 2>&1; then
            keycloak_db_pw=$(vault_get_secret "core" "${instance}/keycloak-db" "password")
            log_verbose "  ✓ Using existing Keycloak DB password"
        else
            keycloak_db_pw=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
            log_info "  ↻ Generated new Keycloak DB password"
        fi

        # NextAuth database password
        local nextauth_db_pw
        if vault_get_secret "core" "${instance}/nextauth-db" "password" >/dev/null 2>&1; then
            nextauth_db_pw=$(vault_get_secret "core" "${instance}/nextauth-db" "password")
            log_verbose "  ✓ Using existing NextAuth DB password"
        else
            nextauth_db_pw=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
            log_info "  ↻ Generated new NextAuth DB password"
        fi

        local secrets_data=(
            "core:${instance}/postgres:{\"password\":\"${postgres_pw}\"}"
            "core:${instance}/mongodb:{\"password\":\"${mongodb_pw}\"}"
            "core:${instance}/redis:{\"password\":\"${redis_pw}\"}"
            "core:${instance}/keycloak-admin:{\"password\":\"${keycloak_pw}\"}"
            "core:${instance}/keycloak-db:{\"password\":\"${keycloak_db_pw}\"}"
            "core:${instance}/nextauth-db:{\"password\":\"${nextauth_db_pw}\"}"
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
        local usa_kc_db=$(vault_get_secret "core" "usa/keycloak-db" "password")
        local usa_na_db=$(vault_get_secret "core" "usa/nextauth-db" "password")
        local shared_client=$(vault_get_secret "auth" "shared/keycloak-client" "secret")
        local shared_blacklist=$(vault_get_secret "core" "shared/redis-blacklist" "password")
        local opal_token=$(vault_get_secret "opal" "master-token" "token")
        local usa_auth=$(vault_get_secret "auth" "usa/nextauth" "secret")

        # Instance-scoped secrets
        _vault_update_env "$hub_env" "POSTGRES_PASSWORD_USA" "$usa_pg"
        _vault_update_env "$hub_env" "KEYCLOAK_ADMIN_PASSWORD" "$usa_kc"
        _vault_update_env "$hub_env" "MONGO_PASSWORD_USA" "$usa_mongo"
        _vault_update_env "$hub_env" "REDIS_PASSWORD_USA" "$usa_redis"
        _vault_update_env "$hub_env" "AUTH_SECRET_USA" "$usa_auth"
        _vault_update_env "$hub_env" "NEXTAUTH_SECRET_USA" "$usa_auth"
        _vault_update_env "$hub_env" "JWT_SECRET_USA" "$usa_auth"
        _vault_update_env "$hub_env" "KEYCLOAK_CLIENT_SECRET_USA" "$shared_client"
        # Service-level DB credentials (used by PG init and Keycloak/Frontend)
        _vault_update_env "$hub_env" "KC_DB_USERNAME" "keycloak_user"
        _vault_update_env "$hub_env" "KC_DB_PASSWORD" "$usa_kc_db"
        _vault_update_env "$hub_env" "FRONTEND_DATABASE_URL" "postgresql://nextauth_user:${usa_na_db}@postgres:5432/dive_v3_app?sslmode=require"
        # Shared secrets (no suffix)
        _vault_update_env "$hub_env" "REDIS_PASSWORD_BLACKLIST" "$shared_blacklist"
        _vault_update_env "$hub_env" "OPAL_AUTH_MASTER_TOKEN" "$opal_token"

        # Full sync to instances/usa/.env (spoke federation reads USA secrets from here)
        local usa_env="${DIVE_ROOT}/instances/usa/.env"
        if [ -f "$usa_env" ]; then
            _vault_update_env "$usa_env" "POSTGRES_PASSWORD_USA" "$usa_pg"
            _vault_update_env "$usa_env" "MONGO_PASSWORD_USA" "$usa_mongo"
            _vault_update_env "$usa_env" "REDIS_PASSWORD_USA" "$usa_redis"
            _vault_update_env "$usa_env" "KEYCLOAK_ADMIN_PASSWORD" "$usa_kc"
            _vault_update_env "$usa_env" "KEYCLOAK_CLIENT_SECRET_USA" "$shared_client"
            _vault_update_env "$usa_env" "AUTH_SECRET_USA" "$usa_auth"
            _vault_update_env "$usa_env" "REDIS_PASSWORD_BLACKLIST" "$shared_blacklist"
            _vault_update_env "$usa_env" "OPAL_AUTH_MASTER_TOKEN" "$opal_token"
            log_verbose "instances/usa/.env fully synced with hub secrets"
        fi

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
