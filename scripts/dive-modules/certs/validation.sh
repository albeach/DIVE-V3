#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Certificate Validation & Generation
# =============================================================================
# Extracted from certs/core.sh (Phase 13e)
# =============================================================================

[ -n "${DIVE_CERTS_VALIDATION_LOADED:-}" ] && return 0

# =============================================================================
# HUB CERTIFICATE SAN MANAGEMENT
# =============================================================================

##
# Get list of all spoke container hostnames for Hub certificate SANs
#
# Outputs:
#   Space-separated list of hostnames
##
get_all_spoke_hostnames() {
    ensure_dive_root
    local hostnames=""

    # Scan instances directory for ACTUALLY DEPLOYED spokes only
    for instance_dir in "${DIVE_ROOT}/instances"/*/; do
        local code
        code=$(basename "$instance_dir")

        # Skip hub and shared directories
        [ "$code" = "hub" ] && continue
        [ "$code" = "shared" ] && continue
        [ ! -f "$instance_dir/docker-compose.yml" ] && continue

        # Add spoke container hostnames (multiple patterns for compatibility)
        # Pattern 1: dive-spoke-{code}-* (legacy)
        hostnames="$hostnames dive-spoke-${code}-keycloak dive-spoke-${code}-backend dive-spoke-${code}-frontend"
        # Pattern 2: {code}-* (new standard)
        hostnames="$hostnames ${code}-keycloak ${code}-backend ${code}-frontend"
        # Pattern 3: keycloak-{code} (alternate)
        hostnames="$hostnames keycloak-${code} ${code}-keycloak-${code}-1"
    done

    # Remove duplicates and trim
    echo "$hostnames" | tr ' ' '\n' | sort -u | tr '\n' ' '
}

##
# Generate or update Hub certificate with all spoke SANs
#
# This ensures Hub Keycloak certificate includes all spoke container hostnames
# so SSL connections from spokes to Hub work without trust errors.
#
# Returns:
#   0 - Success
#   1 - mkcert not ready
#   2 - Generation failed
##
update_hub_certificate_sans() {
    ensure_dive_root
    local hub_certs_dir="${DIVE_ROOT}/instances/hub/certs"

    if ! check_mkcert_ready; then
        return 1
    fi

    log_step "Updating Hub certificate with wildcard SANs..."

    mkdir -p "$hub_certs_dir"

    # DNS SANs from SSOT + IP literals and wildcards for mkcert flexibility
    local dns_sans
    dns_sans=$(_hub_service_sans)

    # mkcert supports IP literals inline and wildcards for future-proofing
    local all_hostnames="$dns_sans 127.0.0.1 ::1 *.localhost *.dive25.com *.dive25.local"

    log_verbose "Hub certificate SANs (wildcard mode): $all_hostnames"

    # Backup existing certificate
    if [ -f "$hub_certs_dir/certificate.pem" ]; then
        cp "$hub_certs_dir/certificate.pem" "$hub_certs_dir/certificate.pem.bak.$(date +%Y%m%d-%H%M%S)"
        cp "$hub_certs_dir/key.pem" "$hub_certs_dir/key.pem.bak.$(date +%Y%m%d-%H%M%S)"
    fi

    # Generate certificate with wildcard SANs
    # shellcheck disable=SC2086
    if mkcert -key-file "$hub_certs_dir/key.pem" \
              -cert-file "$hub_certs_dir/certificate.pem" \
              $all_hostnames 2>/dev/null; then
        chmod 600 "$hub_certs_dir/key.pem"
        chmod 644 "$hub_certs_dir/certificate.pem"

        # Generate fullchain.pem for uniform TLS config (mkcert: leaf + root CA)
        local mkcert_root
        mkcert_root=$(get_mkcert_ca_path)
        if [ -f "$mkcert_root" ]; then
            mkdir -p "$hub_certs_dir/ca"
            cp "$mkcert_root" "$hub_certs_dir/ca/rootCA.pem"
            # Keycloak KC_TRUSTSTORE_PATHS references mkcert-rootCA.pem
            cp "$mkcert_root" "$hub_certs_dir/mkcert-rootCA.pem"
            cat "$hub_certs_dir/certificate.pem" "$hub_certs_dir/ca/rootCA.pem" > "$hub_certs_dir/fullchain.pem"
            chmod 644 "$hub_certs_dir/fullchain.pem"
        fi

        local san_count
        san_count=$(echo "$all_hostnames" | wc -w | tr -d ' ')
        log_success "Hub certificate updated with $san_count SANs (wildcard mode - supports all spokes)"

        return 0
    else
        log_error "Failed to generate Hub certificate"
        return 2
    fi
}

##
# Add a specific spoke hostname to Hub certificate
#
# Arguments:
#   $1 - Spoke code (e.g., alb, nzl)
#
# This is called during spoke deployment to ensure the Hub cert
# includes the new spoke's container hostname.
#
# Returns:
#   0 - Success
#   1 - Failed
##
add_spoke_to_hub_certificate() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower
    code_lower=$(lower "$spoke_code")

    log_step "Adding spoke $code_lower to Hub certificate..."

    # For now, we regenerate the full cert with all SANs
    # A more efficient approach would be to check and only add if missing
    update_hub_certificate_sans
}

# =============================================================================
# SPOKE CERTIFICATE GENERATION
# =============================================================================

##
# Generate spoke certificate with Hub connectivity SANs
#
# Arguments:
#   $1 - Spoke code (e.g., alb, nzl)
#
# Returns:
#   0 - Success
#   1 - Failed
##
generate_spoke_certificate() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower
    code_lower=$(lower "$spoke_code")

    ensure_dive_root
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local certs_dir="$spoke_dir/certs"

    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke directory not found: $spoke_dir"
        return 1
    fi

    if ! check_mkcert_ready; then
        return 1
    fi

    log_step "Generating spoke certificate for: $(upper "$spoke_code")..."

    mkdir -p "$certs_dir"

    # Backup existing certificate
    if [ -f "$certs_dir/certificate.pem" ]; then
        cp "$certs_dir/certificate.pem" "$certs_dir/certificate.pem.bak.$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
        cp "$certs_dir/key.pem" "$certs_dir/key.pem.bak.$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
    fi

    # SANs from SSOT + IP literals for mkcert
    local hostnames
    hostnames="$(_spoke_service_sans "$code_lower") 127.0.0.1 ::1"

    log_verbose "Spoke certificate SANs (including Hub + all spoke services): $hostnames"

    # CRITICAL FIX (2026-01-15): Skip browser trust store updates during cert generation
    # Root cause: mkcert tries to verify NSS (Firefox) trust stores, causing hung certutil processes
    # Solution: Set TRUST_STORES="" to skip all trust store operations (we only need cert files)
    # Best practice: Certificate generation should NOT modify system trust stores
    # shellcheck disable=SC2086
    if TRUST_STORES="" mkcert -key-file "$certs_dir/key.pem" \
              -cert-file "$certs_dir/certificate.pem" \
              $hostnames 2>/dev/null; then
        chmod 600 "$certs_dir/key.pem"
        chmod 644 "$certs_dir/certificate.pem"

        # Generate fullchain.pem for uniform TLS config (mkcert: leaf + root CA)
        local mkcert_root
        mkcert_root=$(get_mkcert_ca_path)
        if [ -f "$mkcert_root" ]; then
            mkdir -p "$certs_dir/ca"
            cp "$mkcert_root" "$certs_dir/ca/rootCA.pem"
            cat "$certs_dir/certificate.pem" "$certs_dir/ca/rootCA.pem" > "$certs_dir/fullchain.pem"
            chmod 644 "$certs_dir/fullchain.pem"
        fi

        log_success "Spoke certificate generated for: $(upper "$spoke_code")"
        return 0
    else
        log_error "Failed to generate spoke certificate"
        return 1
    fi
}

# =============================================================================
# COMPLETE FEDERATION CERTIFICATE SETUP
# =============================================================================

##
# Prepare all certificates for federation between Hub and a spoke
#
# This is the main entry point called during spoke deployment.
# It handles all certificate-related federation setup:
# 1. Install mkcert root CA in Hub truststore
# 2. Add spoke hostname to Hub certificate
# 3. Generate spoke certificate
# 4. Install mkcert root CA in spoke truststore
#
# Arguments:
#   $1 - Spoke code (e.g., alb, nzl)
#
# Returns:
#   0 - All steps successful
#   1 - One or more steps failed
##
prepare_federation_certificates() {
    local spoke_code="${1:?Spoke code required}"
    local code_upper
    code_upper=$(upper "$spoke_code")

    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  FEDERATION CERTIFICATE SETUP: ${code_upper}${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    local failed=0

    # Step 1: Check prerequisites
    log_step "Step 1/4: Checking mkcert prerequisites..."
    if ! check_mkcert_ready; then
        log_error "Prerequisites not met"
        return 1
    fi
    log_success "Prerequisites OK"

    # Step 2: Install mkcert CA in Hub
    log_step "Step 2/4: Installing mkcert root CA in Hub truststore..."
    if ! install_mkcert_ca_in_hub; then
        log_warn "Hub CA installation had issues (continuing)"
        failed=$((failed + 1))
    fi

    # Step 3: Update Hub certificate with spoke SANs
    log_step "Step 3/4: Updating Hub certificate with spoke SANs..."
    if ! add_spoke_to_hub_certificate "$spoke_code"; then
        log_error "Failed to update Hub certificate"
        failed=$((failed + 1))
    fi

    # Step 4: Generate spoke certificate and install CA
    log_step "Step 4/4: Setting up spoke certificates..."
    if ! generate_spoke_certificate "$spoke_code"; then
        log_error "Failed to generate spoke certificate"
        failed=$((failed + 1))
    fi

    if ! install_mkcert_ca_in_spoke "$spoke_code"; then
        log_warn "Spoke CA installation had issues (continuing)"
        failed=$((failed + 1))
    fi

    # Summary
    echo ""
    if [ $failed -eq 0 ]; then
        log_success "Federation certificates prepared successfully!"
        echo ""
        echo "  ✓ mkcert root CA installed in Hub truststore"
        echo "  ✓ Hub certificate updated with spoke SANs"
        echo "  ✓ Spoke certificate generated"
        echo "  ✓ mkcert root CA installed in spoke truststore"
        echo ""
        return 0
    else
        log_warn "Certificate setup completed with $failed warning(s)"
        echo ""
        echo "  Some certificate steps had issues."
        echo "  Federation may still work, but verify with:"
        echo "  ./dive federation validate --spoke $spoke_code"
        echo ""
        return 1
    fi
}

# =============================================================================
# SAN DEFINITIONS — SINGLE SOURCE OF TRUTH
# =============================================================================
# All certificate SAN lists are defined here. Both mkcert and Vault PKI paths
# call these functions to guarantee consistency. When a service is added or
# renamed, update ONLY these functions — all callers inherit the change.
# =============================================================================

##
# Hub service DNS SANs (SSOT)
#
# Returns the canonical list of DNS SANs for hub certificates, space-separated.
# Used by: generate_hub_certificate_vault(), check_certs(), update_hub_certificate_sans()
#
# Output format: space-separated hostnames (no IP addresses)
# IP SANs are handled separately by callers.
##
_hub_service_sans() {
    local sans=""

    # Loopback / Docker host aliases
    sans="localhost host.docker.internal"

    # Certificate CN (must match allowed_domains for Vault PKI issuance)
    sans="$sans dive-hub-services"

    # Hub container names (dive-hub-{service} convention)
    sans="$sans dive-hub-keycloak dive-hub-backend dive-hub-frontend"
    sans="$sans dive-hub-opa dive-hub-opal-server dive-hub-kas"
    sans="$sans dive-hub-mongodb dive-hub-postgres dive-hub-redis"
    sans="$sans dive-hub-redis-blacklist dive-hub-authzforce"

    # Service aliases (used in compose networks)
    sans="$sans keycloak backend frontend opa opal-server kas"
    sans="$sans mongodb postgres redis redis-blacklist authzforce"

    # Compose short names (hub-{service})
    sans="$sans hub-keycloak"

    # External DNS names
    sans="$sans hub.dive.local hub.dive25.com"
    sans="$sans usa-idp.dive25.com usa-api.dive25.com usa-app.dive25.com"

    printf '%s' "$sans"
}

##
# Hub service DNS SANs as comma-separated list (for Vault PKI allowed_domains)
#
# Returns: comma-separated list suitable for Vault role allowed_domains parameter
##
_hub_service_sans_csv() {
    _hub_service_sans | tr ' ' ','
}

##
# Spoke service DNS SANs (SSOT)
#
# Arguments:
#   $1 - Spoke code (lowercase, e.g., fra, deu, gbr)
#
# Returns the canonical list of DNS SANs for a spoke certificate, space-separated.
# Used by: generate_spoke_certificate_vault(), generate_spoke_certificate()
#
# Output format: space-separated hostnames (no IP addresses)
##
_spoke_service_sans() {
    local code_lower="${1:?Spoke code required}"
    local sans=""

    # Loopback / Docker host aliases
    sans="localhost host.docker.internal"

    # Certificate CN (must match allowed_domains for Vault PKI issuance)
    sans="$sans dive-spoke-${code_lower}-services"

    # Spoke container names: dive-spoke-{code}-{service}
    local services="keycloak backend frontend opa opal-client mongodb postgres redis kas"
    local svc
    for svc in $services; do
        sans="$sans dive-spoke-${code_lower}-${svc}"
    done

    # Alternate patterns: {service}-{code}
    for svc in $services; do
        sans="$sans ${svc}-${code_lower}"
    done

    # Docker compose pattern: {code}-keycloak-{code}-1
    sans="$sans ${code_lower}-keycloak-${code_lower}-1"

    # Spoke public DNS names
    sans="$sans ${code_lower}-idp.dive25.com"
    sans="$sans ${code_lower}-api.dive25.com"
    sans="$sans ${code_lower}-app.dive25.com"

    # Hub container names (CRITICAL for spoke → hub SSL connections)
    sans="$sans dive-hub-keycloak dive-hub-backend dive-hub-frontend"
    sans="$sans dive-hub-opa dive-hub-opal-server"
    sans="$sans hub-keycloak keycloak backend frontend opa opal-server"
    sans="$sans hub.dive25.com usa-idp.dive25.com usa-api.dive25.com usa-app.dive25.com"

    printf '%s' "$sans"
}

##
# Spoke service DNS SANs as comma-separated list (for Vault PKI allowed_domains)
#
# Arguments:
#   $1 - Spoke code (lowercase)
#
# Returns: comma-separated list suitable for Vault role allowed_domains parameter
##
_spoke_service_sans_csv() {
    _spoke_service_sans "$1" | tr ' ' ','
}

# =============================================================================

export DIVE_CERTS_VALIDATION_LOADED=1
