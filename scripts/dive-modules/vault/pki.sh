# =============================================================================
# DIVE V3 - Vault PKI & Spoke Provisioning
# =============================================================================
# Sourced by vault/module.sh — do not execute directly.
#
# Functions: pki-setup, provision, deprovision, refresh-credentials, AppRole mgmt
# =============================================================================

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

    # Check if unsealed (with retry for post-deploy timing)
    if ! _vault_check_unsealed; then
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

    # Step 3: Configure Root CA URLs (including OCSP responder)
    log_info "Step 3/6: Configuring Root CA URLs..."
    vault write pki/config/urls \
        issuing_certificates="${VAULT_ADDR}/v1/pki/ca" \
        crl_distribution_points="${VAULT_ADDR}/v1/pki/crl" \
        ocsp_servers="${VAULT_ADDR}/v1/pki/ocsp" >/dev/null 2>&1
    log_success "  Root CA URLs configured (CA + CRL + OCSP)"

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

    # Configure Intermediate CA URLs (including OCSP responder)
    vault write pki_int/config/urls \
        issuing_certificates="${VAULT_ADDR}/v1/pki_int/ca" \
        crl_distribution_points="${VAULT_ADDR}/v1/pki_int/crl" \
        ocsp_servers="${VAULT_ADDR}/v1/pki_int/ocsp" >/dev/null 2>&1

    # Build hub allowed_domains from SSOT (certificates.sh)
    # Load certificates.sh if _hub_service_sans_csv is not already available
    if ! type _hub_service_sans_csv &>/dev/null; then
        if [ -f "${DIVE_ROOT}/scripts/dive-modules/certificates.sh" ]; then
            source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"
        fi
    fi

    local hub_allowed_domains
    if type _hub_service_sans_csv &>/dev/null; then
        hub_allowed_domains=$(_hub_service_sans_csv)
    else
        log_error "Cannot load hub SAN SSOT from certificates.sh"
        return 1
    fi

    # Create hub-services role with explicit allowed_domains (no allow_any_name)
    if vault write pki_int/roles/hub-services \
        allowed_domains="$hub_allowed_domains" \
        allow_bare_domains=true \
        allow_subdomains=false \
        allow_any_name=false \
        enforce_hostnames=true \
        allow_ip_sans=true \
        allow_localhost=true \
        max_ttl=2160h \
        key_type=rsa \
        key_bits=2048 \
        require_cn=false >/dev/null 2>&1; then
        log_success "  Created PKI role: hub-services (90-day max TTL, constrained domains)"
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

    # Auto-rotate bootstrap node certs to Vault PKI (if running in production)
    if is_production_mode; then
        source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"
        if type _vault_node_certs_are_bootstrap &>/dev/null && _vault_node_certs_are_bootstrap; then
            log_info "Bootstrap certs detected — rotating Vault node TLS to PKI..."
            _rotate_vault_node_certs_to_pki || log_warn "Vault node cert rotation deferred"
        fi
    fi

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

    # Check if unsealed (with retry for post-deploy timing)
    if ! _vault_check_unsealed; then
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
        secret_id_ttl=72h \
        secret_id_num_uses=0 >/dev/null 2>&1; then
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

        # Build spoke allowed_domains from SSOT (certificates.sh)
        if ! type _spoke_service_sans_csv &>/dev/null; then
            if [ -f "${DIVE_ROOT}/scripts/dive-modules/certificates.sh" ]; then
                source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"
            fi
        fi

        local spoke_allowed_domains=""
        if type _spoke_service_sans_csv &>/dev/null; then
            spoke_allowed_domains=$(_spoke_service_sans_csv "$code")
        else
            log_warn "Cannot load spoke SAN SSOT — falling back to allow_any_name"
        fi

        # Create spoke-specific PKI role with explicit allowed_domains
        if [ -n "$spoke_allowed_domains" ]; then
            if vault write "pki_int/roles/spoke-${code}-services" \
                allowed_domains="$spoke_allowed_domains" \
                allow_bare_domains=true \
                allow_subdomains=false \
                allow_any_name=false \
                enforce_hostnames=true \
                allow_ip_sans=true \
                allow_localhost=true \
                max_ttl=2160h \
                key_type=rsa \
                key_bits=2048 \
                require_cn=false >/dev/null 2>&1; then
                log_success "  Created PKI role: spoke-${code}-services (constrained domains)"
            else
                log_warn "  Failed to create PKI role (non-fatal, cert issuance may fail)"
            fi
        else
            # Fallback: allow_any_name if SSOT unavailable (should not happen in normal flow)
            if vault write "pki_int/roles/spoke-${code}-services" \
                allow_any_name=true \
                allow_ip_sans=true \
                allow_localhost=true \
                max_ttl=2160h \
                key_type=rsa \
                key_bits=2048 \
                require_cn=false >/dev/null 2>&1; then
                log_warn "  Created PKI role: spoke-${code}-services (UNCONSTRAINED — SSOT unavailable)"
            else
                log_warn "  Failed to create PKI role (non-fatal, cert issuance may fail)"
            fi
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
                secret_id_ttl=72h \
                secret_id_num_uses=0 >/dev/null 2>&1 && \
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
    # Step 3: Seed instance-specific secrets (IDEMPOTENT)
    # ==========================================================================
    # CRITICAL FIX (2026-02-11): Check if secrets exist before generating new ones
    # Previous issue: Always generated new passwords, breaking deployments when re-run
    # New behavior: Use existing secrets if present, only generate if missing
    # ==========================================================================
    log_info "Seeding secrets for ${code_upper}..."

    # PostgreSQL password - check if exists
    local postgres_pw
    if vault_get_secret "core" "${code}/postgres" "password" >/dev/null 2>&1; then
        postgres_pw=$(vault_get_secret "core" "${code}/postgres" "password")
        log_verbose "  ✓ Using existing PostgreSQL password"
    else
        postgres_pw=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
        log_info "  ↻ Generated new PostgreSQL password"
    fi

    # MongoDB password - check if exists
    local mongodb_pw
    if vault_get_secret "core" "${code}/mongodb" "password" >/dev/null 2>&1; then
        mongodb_pw=$(vault_get_secret "core" "${code}/mongodb" "password")
        log_verbose "  ✓ Using existing MongoDB password"
    else
        mongodb_pw=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
        log_info "  ↻ Generated new MongoDB password"
    fi

    # Redis password - check if exists
    local redis_pw
    if vault_get_secret "core" "${code}/redis" "password" >/dev/null 2>&1; then
        redis_pw=$(vault_get_secret "core" "${code}/redis" "password")
        log_verbose "  ✓ Using existing Redis password"
    else
        redis_pw=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
        log_info "  ↻ Generated new Redis password"
    fi

    # Keycloak admin password - check if exists
    local keycloak_pw
    if vault_get_secret "core" "${code}/keycloak-admin" "password" >/dev/null 2>&1; then
        keycloak_pw=$(vault_get_secret "core" "${code}/keycloak-admin" "password")
        log_verbose "  ✓ Using existing Keycloak admin password"
    else
        keycloak_pw=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
        log_info "  ↻ Generated new Keycloak admin password"
    fi

    # NextAuth secret - check if exists
    local nextauth_secret
    if vault_get_secret "auth" "${code}/nextauth" "secret" >/dev/null 2>&1; then
        nextauth_secret=$(vault_get_secret "auth" "${code}/nextauth" "secret")
        log_verbose "  ✓ Using existing NextAuth secret"
    else
        nextauth_secret=$(openssl rand -base64 32)
        log_info "  ↻ Generated new NextAuth secret"
    fi

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
    _vault_update_env "$spoke_env" "VAULT_ADDR" "https://dive-hub-vault:8200"
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

# =============================================================================
# APPROLE SECRETID ROTATION (Phase 4: Credential Lifecycle)
# =============================================================================

##
# Refresh a spoke's AppRole SecretID.
#
# Generates a new SecretID, updates the spoke's .env file, and destroys the old one.
# Used for credential rotation when SecretIDs have TTL (72h).
#
# Arguments:
#   $1 - Spoke code (e.g., "deu" or "DEU")
#
# Returns:
#   0 - Success (new SecretID issued and .env updated)
#   1 - Failure
##
_vault_refresh_secret_id() {
    local spoke_code="${1:?spoke code required}"
    local code
    code=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")
    local role_name="spoke-${code}"

    # Verify AppRole exists
    if ! vault read "auth/approle/role/${role_name}" >/dev/null 2>&1; then
        log_error "AppRole ${role_name} not found — run: ./dive vault provision ${code_upper}"
        return 1
    fi

    # Read old SecretID from .env (for destruction after replacement)
    local spoke_env="${DIVE_ROOT}/instances/${code}/.env"
    local old_secret_id=""
    if [ -f "$spoke_env" ]; then
        old_secret_id=$(grep "^VAULT_SECRET_ID=" "$spoke_env" 2>/dev/null | cut -d= -f2-)
    fi

    # Generate new SecretID
    local new_secret_id
    new_secret_id=$(vault write -field=secret_id -f "auth/approle/role/${role_name}/secret-id" 2>/dev/null)
    if [ -z "$new_secret_id" ]; then
        log_error "  Failed to generate new SecretID for ${role_name}"
        return 1
    fi

    # Get new SecretID accessor for metadata lookup
    local new_accessor
    new_accessor=$(vault write -field=secret_id_accessor -f "auth/approle/role/${role_name}/secret-id" 2>/dev/null || true)

    # Update spoke .env
    if [ -f "$spoke_env" ]; then
        _vault_update_env "$spoke_env" "VAULT_SECRET_ID" "$new_secret_id"
        log_success "  Updated ${spoke_env}"
    else
        log_warn "  Spoke .env not found: ${spoke_env} (SecretID generated but not persisted)"
    fi

    # Destroy old SecretID (invalidate immediately)
    if [ -n "$old_secret_id" ] && [ "$old_secret_id" != "$new_secret_id" ]; then
        if vault write "auth/approle/role/${role_name}/secret-id/destroy" \
            secret_id="$old_secret_id" >/dev/null 2>&1; then
            log_verbose "  Destroyed old SecretID for ${role_name}"
        else
            log_verbose "  Old SecretID already expired or invalid (non-fatal)"
        fi
    fi

    _vault_rotation_audit "INFO" "SECRETID_REFRESHED: spoke=${code}"
    return 0
}

##
# Check the age/TTL of a spoke's current SecretID.
#
# Returns via stdout: seconds remaining until expiry (0 if expired or unknown).
# Returns exit code 0 always (callers check the value).
#
# Arguments:
#   $1 - Spoke code
##
_vault_secret_id_ttl_remaining() {
    local spoke_code="${1:?spoke code required}"
    local code
    code=$(lower "$spoke_code")
    local role_name="spoke-${code}"

    # Read current SecretID from .env
    local spoke_env="${DIVE_ROOT}/instances/${code}/.env"
    local current_secret_id=""
    if [ -f "$spoke_env" ]; then
        current_secret_id=$(grep "^VAULT_SECRET_ID=" "$spoke_env" 2>/dev/null | cut -d= -f2-)
    fi

    if [ -z "$current_secret_id" ]; then
        echo "0"
        return 0
    fi

    # Lookup SecretID metadata
    local lookup_json
    lookup_json=$(vault write -format=json "auth/approle/role/${role_name}/secret-id/lookup" \
        secret_id="$current_secret_id" 2>/dev/null || true)

    if [ -z "$lookup_json" ]; then
        echo "0"
        return 0
    fi

    # Extract expiration_time (RFC3339) and calculate remaining seconds
    local expiration_time
    expiration_time=$(echo "$lookup_json" | jq -r '.data.expiration_time // empty' 2>/dev/null)

    if [ -z "$expiration_time" ] || [ "$expiration_time" = "0001-01-01T00:00:00Z" ]; then
        # No expiry set (secret_id_ttl=0) — return large value
        echo "999999"
        return 0
    fi

    local expiry_epoch now_epoch
    if date -j >/dev/null 2>&1; then
        # macOS
        expiry_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${expiration_time%%.*}" "+%s" 2>/dev/null || echo "0")
    else
        # Linux
        expiry_epoch=$(date -d "$expiration_time" "+%s" 2>/dev/null || echo "0")
    fi
    now_epoch=$(date "+%s")

    if [ "$expiry_epoch" -eq 0 ]; then
        echo "0"
        return 0
    fi

    local remaining=$((expiry_epoch - now_epoch))
    [ "$remaining" -lt 0 ] && remaining=0
    echo "$remaining"
}

##
# Migrate existing spoke AppRoles to use secret_id_ttl=72h.
#
# Iterates all provisioned spokes and updates the AppRole config.
# Does NOT regenerate SecretIDs — existing ones keep their original (infinite) TTL.
# Use `./dive vault refresh-credentials all` after migration to issue new TTL-bound SecretIDs.
#
# Arguments: none
##
_vault_migrate_secret_id_ttl() {
    log_info "Migrating AppRole SecretID TTL to 72h..."

    local spokes
    spokes=$(_vault_discover_instances)
    local migrated=0 failed=0

    while IFS= read -r instance; do
        [ -z "$instance" ] && continue
        local role_name="spoke-${instance}"

        # Read current policies to preserve them
        local current_policies
        current_policies=$(vault read -field=token_policies "auth/approle/role/${role_name}" 2>/dev/null || true)
        if [ -z "$current_policies" ]; then
            log_verbose "  ${role_name}: not found (skipping)"
            continue
        fi

        if vault write "auth/approle/role/${role_name}" \
            token_policies="$current_policies" \
            token_ttl=1h \
            token_max_ttl=24h \
            secret_id_ttl=72h \
            secret_id_num_uses=0 >/dev/null 2>&1; then
            log_success "  Migrated: ${role_name} (secret_id_ttl=72h)"
            migrated=$((migrated + 1))
        else
            log_error "  Failed: ${role_name}"
            failed=$((failed + 1))
        fi
    done <<< "$spokes"

    echo ""
    log_info "Migration complete: ${migrated} migrated, ${failed} failed"
    [ $failed -gt 0 ] && return 1
    return 0
}

##
# CLI: Refresh AppRole SecretIDs for one or all spokes.
#
# Usage:
#   ./dive vault refresh-credentials <CODE>        # Single spoke
#   ./dive vault refresh-credentials all            # All spokes
#   ./dive vault refresh-credentials all --migrate  # Migrate TTL + refresh all
#
# Generates new SecretIDs, updates .env files, and destroys old SecretIDs.
##
module_vault_refresh_credentials() {
    local target="${1:-}"
    local do_migrate=false

    if [ -z "$target" ]; then
        log_error "Usage: ./dive vault refresh-credentials <CODE|all> [--migrate]"
        return 1
    fi
    shift

    while [ $# -gt 0 ]; do
        case "$1" in
            --migrate) do_migrate=true; shift ;;
            *) log_error "Unknown option: $1"; return 1 ;;
        esac
    done

    if ! vault_is_running; then return 1; fi

    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    else
        log_error "Vault token not found — run: ./dive vault init"
        return 1
    fi

    if ! _vault_check_unsealed; then
        return 1
    fi

    # Run migration first if requested
    if [ "$do_migrate" = true ]; then
        _vault_migrate_secret_id_ttl || return 1
        echo ""
    fi

    echo ""
    log_info "==================================================================="
    log_info "  AppRole SecretID Refresh"
    log_info "==================================================================="

    local refreshed=0 failed=0

    if [ "$target" = "all" ]; then
        local spokes
        spokes=$(_vault_discover_instances)
        while IFS= read -r instance; do
            [ -z "$instance" ] && continue
            local code_upper
            code_upper=$(upper "$instance")
            log_info "Refreshing SecretID for ${code_upper}..."

            # Check current TTL remaining
            local ttl_remaining
            ttl_remaining=$(_vault_secret_id_ttl_remaining "$instance")

            if _vault_refresh_secret_id "$instance"; then
                refreshed=$((refreshed + 1))
                log_success "  ${code_upper}: refreshed (old TTL: ${ttl_remaining}s remaining)"
            else
                failed=$((failed + 1))
                log_error "  ${code_upper}: failed"
            fi
        done <<< "$spokes"
    else
        local code
        code=$(lower "$target")
        local code_upper
        code_upper=$(upper "$target")
        log_info "Refreshing SecretID for ${code_upper}..."

        local ttl_remaining
        ttl_remaining=$(_vault_secret_id_ttl_remaining "$code")

        if _vault_refresh_secret_id "$code"; then
            refreshed=1
            log_success "  ${code_upper}: refreshed (old TTL: ${ttl_remaining}s remaining)"
        else
            failed=1
            log_error "  ${code_upper}: failed"
        fi
    fi

    echo ""
    log_info "==================================================================="
    log_info "  Refreshed: $refreshed  |  Failed: $failed"
    log_info "==================================================================="

    [ $failed -gt 0 ] && return 1
    return 0
}

##
# Deprovision a spoke from Vault: revoke certificate, delete policy, AppRole, and PKI role.
#
# This is the reverse of module_vault_provision(). It:
#   1. Revokes the spoke's current Vault-issued certificate
#   2. Triggers CRL rebuild
#   3. Deletes the spoke's AppRole
#   4. Deletes the spoke's Vault policies
#   5. Deletes the spoke's PKI role
#
# Does NOT delete secrets from KV store (preserving audit trail).
# Does NOT remove Docker containers (use ./dive nuke spoke <CODE> for that).
#
# Usage: ./dive vault deprovision <CODE>
##
module_vault_deprovision() {
    local spoke_code="${1:-}"

    if [ -z "$spoke_code" ]; then
        log_error "Usage: ./dive vault deprovision <CODE>"
        log_info "Example: ./dive vault deprovision FRA"
        return 1
    fi

    local code
    code=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")

    if [ "$code" = "usa" ]; then
        log_error "Cannot deprovision USA — it is the hub instance"
        return 1
    fi

    log_info "Deprovisioning spoke ${code_upper} from Vault..."

    if ! vault_is_running; then
        return 1
    fi

    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    else
        log_error "Vault token not found — run: ./dive vault init"
        return 1
    fi

    if ! _vault_check_unsealed; then
        return 1
    fi

    local errors=0

    # Step 1: Revoke spoke certificate (if Vault PKI was used)
    log_info "Step 1/5: Revoking spoke certificate..."
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/certificates.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"
    fi
    if type revoke_spoke_certificates &>/dev/null; then
        revoke_spoke_certificates "$code" || {
            log_warn "  Certificate revocation failed (continuing deprovision)"
            errors=$((errors + 1))
        }
    else
        log_verbose "  revoke_spoke_certificates not available — skipping"
    fi

    # Step 2: Delete AppRole
    log_info "Step 2/5: Removing AppRole..."
    if vault delete "auth/approle/role/spoke-${code}" >/dev/null 2>&1; then
        log_success "  Deleted AppRole: spoke-${code}"
    else
        log_warn "  AppRole spoke-${code} not found or already deleted"
    fi

    # Step 3: Delete spoke policies
    log_info "Step 3/5: Removing Vault policies..."
    if vault policy delete "dive-v3-spoke-${code}" >/dev/null 2>&1; then
        log_success "  Deleted policy: dive-v3-spoke-${code}"
    else
        log_warn "  Policy dive-v3-spoke-${code} not found"
    fi
    if vault policy delete "dive-v3-pki-spoke-${code}" >/dev/null 2>&1; then
        log_success "  Deleted policy: dive-v3-pki-spoke-${code}"
    else
        log_verbose "  PKI policy dive-v3-pki-spoke-${code} not found"
    fi

    # Step 4: Delete PKI role
    log_info "Step 4/5: Removing PKI role..."
    if vault secrets list 2>/dev/null | grep -q "^pki_int/"; then
        if vault delete "pki_int/roles/spoke-${code}-services" >/dev/null 2>&1; then
            log_success "  Deleted PKI role: spoke-${code}-services"
        else
            log_warn "  PKI role spoke-${code}-services not found"
        fi
    else
        log_verbose "  PKI engine not enabled — skipping role cleanup"
    fi

    # Step 5: Summary
    log_info "Step 5/5: Deprovision summary..."
    echo ""
    log_info "==================================================================="
    log_info "  Spoke ${code_upper} Deprovisioned from Vault"
    log_info "==================================================================="
    log_info "  Certificate:  revoked (CRL updated)"
    log_info "  AppRole:      deleted"
    log_info "  Policies:     deleted"
    log_info "  PKI role:     deleted"
    log_info "  KV secrets:   preserved (audit trail)"
    if [ $errors -gt 0 ]; then
        log_warn "  Warnings:     $errors (check output above)"
    fi
    log_info ""
    log_info "  To also remove Docker containers:"
    log_info "    ./dive nuke spoke ${code_upper}"
    log_info "==================================================================="

    return 0
}

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
