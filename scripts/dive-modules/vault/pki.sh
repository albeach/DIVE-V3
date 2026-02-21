#!/usr/bin/env bash
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

    local code
    code=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")

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
            local _db_policy="dive-v3-db-spoke-${code}"

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
            local fed_secret
            fed_secret=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
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
    local shared_client
    shared_client=$(vault_get_secret "auth" "shared/keycloak-client" "secret" 2>/dev/null || true)
    local shared_blacklist
    shared_blacklist=$(vault_get_secret "core" "shared/redis-blacklist" "password" 2>/dev/null || true)
    local opal_token
    opal_token=$(vault_get_secret "opal" "master-token" "token" 2>/dev/null || true)

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
# vault_spoke_is_provisioned was removed; stale export cleaned up


# Load PKI credential management functions
source "$(dirname "${BASH_SOURCE[0]}")/pki-credentials.sh"
