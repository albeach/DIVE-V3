#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Initialization Phase (Compose, Certs, Terraform)
# =============================================================================
# Extracted from phase-initialization.sh (Phase 13d)
# Contains: generate_compose, prepare_certificates, generate_mtls_certs,
#   apply_terraform, check_drift, checkpoint_initialization
# =============================================================================

[ -n "${SPOKE_PHASE_INITIALIZATION_EXTENDED_LOADED:-}" ] && return 0

# =============================================================================
# DOCKER COMPOSE GENERATION
# =============================================================================

##
# Generate docker-compose.yml from template
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_init_generate_compose() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_step "Generating docker-compose.yml"

    # Use the compose generator module if available
    if type spoke_compose_generate &>/dev/null; then
        spoke_compose_generate "$instance_code" "$spoke_dir"
        return $?
    fi

    # Fallback: Use legacy function if available
    if type _create_spoke_docker_compose &>/dev/null; then
        # Get required parameters
        if type get_instance_ports &>/dev/null; then
            eval "$(get_instance_ports "$code_upper")"
        fi

        local instance_name="$code_upper Instance"
        local spoke_id=$(spoke_config_get "$code_upper" "identity.spokeId" "spoke-${code_lower}")
        local idp_hostname="dive-spoke-${code_lower}-keycloak"
        local api_url="https://localhost:${SPOKE_BACKEND_PORT:-4000}"
        local base_url="https://localhost:${SPOKE_FRONTEND_PORT:-3000}"
        local idp_url="https://${idp_hostname}:8443"

        _create_spoke_docker_compose "$spoke_dir" "$code_upper" "$code_lower" "$instance_name" \
            "$spoke_id" "$idp_hostname" "$api_url" "$base_url" "$idp_url" ""

        return $?
    fi

    # No generator available
    if type orch_record_error &>/dev/null; then
        local remediation="Check spoke-compose-generator module is loaded"
        local error_code="${SPOKE_ERROR_COMPOSE_GENERATE:-1030}"
        if type spoke_error_get_remediation &>/dev/null; then
            remediation=$(spoke_error_get_remediation "$error_code" "$instance_code")
        fi
        orch_record_error "$error_code" "${ORCH_SEVERITY_CRITICAL:-1}" \
            "Docker compose generator not available" "initialization" \
            "$remediation"
    fi
    return 1
}

# =============================================================================
# CERTIFICATE GENERATION
# =============================================================================

##
# Prepare federation certificates
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_init_prepare_certificates() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_step "Preparing federation certificates"

    # CRITICAL FIX (2026-01-27): Ensure certs/ca directory exists even if certs exist
    # Keycloak requires rootCA.pem in certs/ca/ for truststore initialization
    # Without this, Keycloak crashes on startup with "No such file or directory"
    mkdir -p "$spoke_dir/certs/ca" "$spoke_dir/truststores"

    # Remote spoke: fetch hub CA bundle for TLS trust bootstrapping
    # Must happen BEFORE cert generation so Vault PKI CA is in the trust store
    if [ -n "${HUB_EXTERNAL_ADDRESS:-}" ] && [ "$HUB_EXTERNAL_ADDRESS" != "localhost" ]; then
        if type _fetch_hub_ca_bundle &>/dev/null; then
            log_step "Fetching hub CA bundle from ${HUB_EXTERNAL_ADDRESS}..."
            _fetch_hub_ca_bundle || log_warn "Hub CA fetch failed — spoke may not trust hub TLS"
        fi
    fi

    # CRITICAL FIX (2026-02-12): Source certificates.sh BEFORE checking use_vault_pki
    # The function use_vault_pki() is defined in certificates.sh — sourcing it inside
    # the conditional that checks for the function creates a chicken-and-egg bug where
    # Vault PKI is never used for spokes, causing CA trust mismatch with Hub.
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/certificates.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"
    fi

    # Vault PKI path: if CERT_PROVIDER=vault, issue from Vault PKI
    # Industry standard: all instances (hub + spokes) use the same PKI hierarchy
    # for consistent cross-instance TLS trust and true data sovereignty
    if type use_vault_pki &>/dev/null && use_vault_pki; then
        log_info "CERT_PROVIDER=vault — using Vault PKI for spoke certificates"
        if type generate_spoke_certificate_vault &>/dev/null && generate_spoke_certificate_vault "$code_lower"; then
            # Rebuild CA bundle: Vault PKI chain + mkcert CA (backward compat)
            if type _rebuild_spoke_ca_bundle &>/dev/null; then
                _rebuild_spoke_ca_bundle "$code_lower"
                log_verbose "Spoke CA bundle rebuilt (Vault PKI + mkcert)"
            fi
            log_success "Federation certificates prepared via Vault PKI"
            return 0
        fi
        log_warn "Vault PKI failed — falling back to mkcert"
    fi

    # Check if certificates already exist
    if [ -f "$spoke_dir/certs/certificate.pem" ] && [ -f "$spoke_dir/certs/key.pem" ]; then
        # CRITICAL: Validate certificate has required SANs for federation
        # Federation requires container name (dive-spoke-{code}-keycloak) in SANs
        # Without this, Hub→Spoke token endpoint calls fail with SSLPeerUnverifiedException
        local required_san="dive-spoke-${code_lower}-keycloak"
        if openssl x509 -in "$spoke_dir/certs/certificate.pem" -text -noout 2>/dev/null | grep -q "$required_san"; then
            log_info "TLS certificates exist and have required SANs - skipping generation"

            # Build CA bundle with ALL trusted CAs (mkcert + Vault PKI)
            # This ensures spoke services trust both CA providers for cross-instance TLS
            if type _rebuild_spoke_ca_bundle &>/dev/null; then
                _rebuild_spoke_ca_bundle "$code_lower"
                log_verbose "Spoke CA bundle rebuilt (mkcert + Vault PKI)"
            fi

            return 0
        else
            log_warn "Existing certificate missing required SAN: $required_san"
            log_warn "Regenerating certificate with federation-compatible SANs..."
            # Backup old certificate
            mv "$spoke_dir/certs/certificate.pem" "$spoke_dir/certs/certificate.pem.backup-$(date +%Y%m%d)" 2>/dev/null || \
                log_verbose "Could not backup old certificate"
            mv "$spoke_dir/certs/key.pem" "$spoke_dir/certs/key.pem.backup-$(date +%Y%m%d)" 2>/dev/null || \
                log_verbose "Could not backup old key"
        fi
    fi

    # ==========================================================================
    # SSOT: Use certificates.sh module for ALL certificate generation
    # ==========================================================================
    # This ensures consistent SANs across all deployment paths
    # FIX (2026-01-15): Consolidated duplicate certificate generation code
    # NOTE (2026-02-12): certificates.sh already sourced at function entry
    # ==========================================================================

    # Use SSOT function with comprehensive SANs (certificates.sh sourced above)
    if type generate_spoke_certificate &>/dev/null; then
        if generate_spoke_certificate "$code_lower"; then
            log_success "Federation certificates prepared via SSOT"

            # Build CA bundle with ALL trusted CAs (mkcert + Vault PKI)
            if type _rebuild_spoke_ca_bundle &>/dev/null; then
                _rebuild_spoke_ca_bundle "$code_lower"
                log_verbose "Spoke CA bundle rebuilt (mkcert + Vault PKI)"
            elif type install_mkcert_ca_in_spoke &>/dev/null; then
                install_mkcert_ca_in_spoke "$code_lower" 2>/dev/null || true
            fi

            # ==========================================================================
            # CRITICAL: Generate Java truststore for Keycloak federation
            # ==========================================================================
            # Without this truststore, Keycloak cannot verify TLS certificates for
            # server-to-server calls (tokenUrl, userInfoUrl, jwksUrl) during federation.
            # Error: "PKIX path building failed: unable to find valid certification path"
            # ==========================================================================
            if type generate_spoke_truststore &>/dev/null; then
                generate_spoke_truststore "$code_lower" || {
                    log_warn "Java truststore generation failed - federation may not work"
                }
            else
                # Inline fallback for truststore generation
                log_verbose "Generating Java truststore (inline fallback)"
                if command -v keytool &>/dev/null && [ -f "$spoke_dir/certs/ca/rootCA.pem" ]; then
                    rm -f "$spoke_dir/certs/truststore.p12"
                    keytool -importcert -noprompt -trustcacerts \
                        -alias mkcert-ca \
                        -file "$spoke_dir/certs/ca/rootCA.pem" \
                        -keystore "$spoke_dir/certs/truststore.p12" \
                        -storepass changeit \
                        -storetype PKCS12 2>/dev/null && {
                        chmod 644 "$spoke_dir/certs/truststore.p12"
                        log_success "Generated Java truststore for Keycloak federation"
                    } || log_warn "Failed to generate Java truststore"
                else
                    log_warn "Cannot generate Java truststore (keytool or rootCA.pem missing)"
                fi
            fi

            return 0
        else
            log_warn "SSOT certificate generation failed, trying fallback..."
        fi
    fi

    # ==========================================================================
    # FALLBACK ONLY: If SSOT unavailable (should never happen in production)
    # ==========================================================================
    log_warn "certificates.sh module not found - using minimal fallback"
    log_warn "This is NOT recommended - ensure certificates.sh is available"

    if ! command -v mkcert &>/dev/null; then
        log_error "mkcert required but not installed"
        log_error "Install: brew install mkcert && mkcert -install"
        return 1
    fi

    # Minimal certificate generation (missing Hub SANs - federation may fail!)
    log_warn "Generating certificate with INCOMPLETE SANs (Hub SANs missing)"
    mkcert -key-file "$spoke_dir/certs/key.pem" \
           -cert-file "$spoke_dir/certs/certificate.pem" \
           localhost 127.0.0.1 ::1 host.docker.internal \
           "dive-spoke-${code_lower}-keycloak" \
           "keycloak-${code_lower}" 2>/dev/null || return 1

    chmod 644 "$spoke_dir/certs/key.pem"   # 644: Docker containers run as non-owner UIDs
    chmod 644 "$spoke_dir/certs/certificate.pem"

    # Generate spoke mTLS certificates
    spoke_init_generate_mtls_certs "$instance_code"

    log_success "Certificates prepared"
    return 0
}

##
# Generate mTLS certificates for spoke federation
##
spoke_init_generate_mtls_certs() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    # Generate unique spoke ID from spoke_config_get (SSOT)
    local spoke_id
    spoke_id=$(spoke_config_get "$code_upper" "identity.spokeId" "spoke-${code_lower}")

    log_verbose "Generating mTLS certificates"

    openssl genrsa -out "$spoke_dir/certs/spoke.key" 4096 2>/dev/null
    openssl req -new \
        -key "$spoke_dir/certs/spoke.key" \
        -out "$spoke_dir/certs/spoke.csr" \
        -subj "/C=${code_upper:0:2}/O=DIVE Federation/OU=Spoke Instances/CN=$spoke_id" 2>/dev/null
    openssl x509 -req -days 365 \
        -in "$spoke_dir/certs/spoke.csr" \
        -signkey "$spoke_dir/certs/spoke.key" \
        -out "$spoke_dir/certs/spoke.crt" 2>/dev/null

    chmod 600 "$spoke_dir/certs/spoke.key"
    chmod 644 "$spoke_dir/certs/spoke.crt"
    chmod 644 "$spoke_dir/certs/spoke.csr"
}

# =============================================================================
# TERRAFORM CONFIGURATION
# =============================================================================

##
# Apply Terraform configuration for Keycloak realm/client
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_init_apply_terraform() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Applying Terraform configuration"

    # Ensure INSTANCE is set for proper secret loading
    export INSTANCE="$code_lower"

    # Export instance-suffixed secrets as TF_VAR environment variables
    local keycloak_password_var="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
    local client_secret_var="KEYCLOAK_CLIENT_SECRET_${code_upper}"

    if [ -n "${!keycloak_password_var}" ]; then
        export TF_VAR_keycloak_admin_password="${!keycloak_password_var}"
    else
        log_error "Missing Keycloak admin password for $code_upper"
        return 1
    fi

    if [ -n "${!client_secret_var}" ]; then
        export TF_VAR_client_secret="${!client_secret_var}"
    else
        log_error "Missing Keycloak client secret for $code_upper"
        return 1
    fi

    # Use test user passwords following Hub pattern:
    # 1. Try TEST_USER_PASSWORD/ADMIN_PASSWORD env vars first
    # 2. Fall back to Keycloak admin password (same as Hub approach)
    export TF_VAR_test_user_password="${TEST_USER_PASSWORD:-${!keycloak_password_var}}"
    export TF_VAR_admin_user_password="${ADMIN_PASSWORD:-${!keycloak_password_var}}"

    # Set Keycloak credentials for provider
    export KEYCLOAK_USER="admin"
    export KEYCLOAK_PASSWORD="${!keycloak_password_var}"

    # Load terraform module if available
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/configuration/terraform.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/configuration/terraform.sh"

        # Check if terraform_spoke function exists
        if type terraform_spoke &>/dev/null; then
            log_verbose "Initializing Terraform workspace"
            if ! terraform_spoke init "$code_upper"; then
                log_warn "Terraform init failed"
                orch_record_error "$SPOKE_ERROR_TERRAFORM_INIT" "$ORCH_SEVERITY_MEDIUM" \
                    "Terraform init failed" "initialization" \
                    "$(spoke_error_get_remediation $SPOKE_ERROR_TERRAFORM_INIT $instance_code)"
                return 1
            fi

            log_verbose "Applying Terraform configuration"
            if ! terraform_spoke apply "$code_upper"; then
                log_warn "Terraform apply failed"
                orch_record_error "$SPOKE_ERROR_TERRAFORM_APPLY" "$ORCH_SEVERITY_MEDIUM" \
                    "Terraform apply failed" "initialization" \
                    "$(spoke_error_get_remediation $SPOKE_ERROR_TERRAFORM_APPLY $instance_code)"
                return 1
            fi

            log_success "Terraform configuration applied"
            echo "  ✓ Keycloak realm 'dive-v3-broker-${code_lower}' created"
            echo "  ✓ Client 'dive-v3-broker-${code_lower}' configured"
            return 0
        fi
    fi

    # If legacy function exists
    if type _spoke_apply_terraform &>/dev/null; then
        _spoke_apply_terraform "$code_upper" "$code_lower"
        return $?
    fi

    log_warn "Terraform module not available - Keycloak configuration may be incomplete"
    return 0
}

# =============================================================================
# DRIFT DETECTION
# =============================================================================

##
# Check for template drift and auto-update if needed
#
# Arguments:
#   $1 - Instance code
##
spoke_init_check_drift() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    # Load drift detection module if available
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/spoke/spoke-drift.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/spoke/spoke-drift.sh"
    fi

    if type spoke_check_drift &>/dev/null; then
        log_step "Checking template version drift..."

        local drift_result
        spoke_check_drift "$code_upper" 2>&1 | tee /tmp/drift-check.log
        drift_result=${PIPESTATUS[0]}

        if [ $drift_result -eq 1 ] || [ $drift_result -eq 2 ]; then
            log_warn "Template drift detected - auto-updating to latest version"

            if type spoke_update_compose &>/dev/null; then
                if spoke_update_compose "$code_upper"; then
                    log_success "Auto-updated to latest template"
                else
                    log_warn "Auto-update failed - deployment may use outdated template"
                fi
            fi
        else
            log_success "Template up-to-date (no drift)"
        fi
    else
        log_verbose "Drift detection not available"
    fi
}

# =============================================================================
# CHECKPOINT VALIDATION
# =============================================================================

##
# Validate initialization phase completed successfully
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Validation passed
#   1 - Validation failed
##
spoke_checkpoint_initialization() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_verbose "Validating initialization checkpoint for $instance_code"

    # Check directory structure
    if [ ! -d "$spoke_dir" ]; then
        log_error "Checkpoint FAILED: Instance directory missing: $spoke_dir"
        return 1
    fi

    if [ ! -d "$spoke_dir/certs" ]; then
        log_error "Checkpoint FAILED: Certs directory missing"
        return 1
    fi

    # Check keyfile is file (not directory) - CRITICAL
    if [ ! -f "$spoke_dir/mongo-keyfile" ]; then
        log_error "Checkpoint FAILED: MongoDB keyfile missing"
        return 1
    fi

    if [ -d "$spoke_dir/mongo-keyfile" ]; then
        log_error "Checkpoint FAILED: MongoDB keyfile is a directory (must be file)"
        return 1
    fi

    # Check keyfile size
    local keyfile_size=$(wc -c < "$spoke_dir/mongo-keyfile" | tr -d ' ')
    if [ "$keyfile_size" -lt 6 ] || [ "$keyfile_size" -gt 1024 ]; then
        log_error "Checkpoint FAILED: MongoDB keyfile size invalid: ${keyfile_size} bytes"
        return 1
    fi

    # Check config files exist
    if [ ! -f "$spoke_dir/.env" ]; then
        log_error "Checkpoint FAILED: .env file missing"
        return 1
    fi

    if [ ! -f "$spoke_dir/docker-compose.yml" ]; then
        log_error "Checkpoint FAILED: docker-compose.yml missing"
        return 1
    fi

    log_verbose "✓ Initialization checkpoint passed"
    return 0
}


export SPOKE_PHASE_INITIALIZATION_EXTENDED_LOADED=1
