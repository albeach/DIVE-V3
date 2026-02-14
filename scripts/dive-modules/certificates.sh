#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Certificate Management Module
# =============================================================================
# Commands: prepare-federation, update-hub-sans, install-ca, verify-certs
#
# Manages SSL certificates and truststores for federation:
# - mkcert root CA installation in Keycloak truststores
# - Hub certificate generation with all spoke SANs
# - Spoke certificate generation with Hub connectivity
#
# This module eliminates the need for post-deployment fix scripts.
# =============================================================================
# Version: 1.0.0
# Date: 2025-12-15
# =============================================================================

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CONSTANTS
# =============================================================================

# Hub container name for SAN inclusion - SSOT defined in common.sh
# HUB_KEYCLOAK_CONTAINER is exported from common.sh, no need to redefine
HUB_KEYCLOAK_INTERNAL_HOST="${HUB_KEYCLOAK_CONTAINER:-dive-hub-keycloak}"

# Truststore filename
MKCERT_CA_FILENAME="mkcert-rootCA.pem"

# =============================================================================
# PREREQUISITE CHECKS
# =============================================================================

##
# Check if mkcert is installed and root CA exists
#
# Returns:
#   0 - mkcert ready
#   1 - mkcert not installed
#   2 - root CA not found
##
check_mkcert_ready() {
    if ! command -v mkcert &> /dev/null; then
        log_error "mkcert is not installed"
        echo ""
        echo "Install mkcert:"
        echo "  macOS:  brew install mkcert"
        echo "  Linux:  apt install mkcert OR brew install mkcert"
        echo "  Windows: choco install mkcert"
        echo ""
        echo "Then run: mkcert -install"
        return 1
    fi

    local ca_root
    ca_root=$(mkcert -CAROOT 2>/dev/null)

    if [ -z "$ca_root" ] || [ ! -f "$ca_root/rootCA.pem" ]; then
        log_error "mkcert root CA not found"
        echo ""
        echo "Run: mkcert -install"
        return 2
    fi

    log_verbose "mkcert ready: $ca_root/rootCA.pem"
    return 0
}

##
# Get mkcert root CA path
##
get_mkcert_ca_path() {
    local ca_root
    ca_root=$(mkcert -CAROOT 2>/dev/null)
    echo "$ca_root/rootCA.pem"
}

# =============================================================================
# CA BUNDLE MANAGEMENT
# =============================================================================

##
# Build the SSOT CA trust bundle
#
# Combines mkcert CA + Vault PKI CA chain into a single PEM file at
# certs/ca-bundle/rootCA.pem. All app services and federation-aware services
# mount this one bundle. Infra services (postgres, mongo, redis) use the
# Vault-only chain from their instance certs dir.
#
# Arguments:
#   $1 - Output file path (optional, default: certs/ca-bundle/rootCA.pem)
#
# Returns:
#   0 - Always (best-effort)
##
_rebuild_ca_bundle() {
    ensure_dive_root
    local output_file="${1:-${DIVE_ROOT}/certs/ca-bundle/rootCA.pem}"

    mkdir -p "$(dirname "$output_file")"
    : > "$output_file"

    # 1. Include mkcert CA (development trust provider)
    if command -v mkcert &>/dev/null; then
        local mkcert_ca
        mkcert_ca=$(get_mkcert_ca_path 2>/dev/null) || true
        if [ -f "$mkcert_ca" ]; then
            cat "$mkcert_ca" >> "$output_file"
        fi
    fi

    # 2. Include Vault PKI CA chain from stable location (never clobbered by issuance)
    local vault_ca="${DIVE_ROOT}/certs/vault-pki/ca-chain.pem"
    if [ -f "$vault_ca" ] && [ -s "$vault_ca" ]; then
        cat "$vault_ca" >> "$output_file"
    fi

    chmod 644 "$output_file"
}

##
# Copy the SSOT CA bundle into a spoke instance directory
#
# Spoke infra services (postgres, mongo, redis) mount ./certs/ and reference
# /certs/ca/rootCA.pem. This copies the SSOT bundle there so infra services
# trust both mkcert and Vault PKI CAs.
#
# Arguments:
#   $1 - Spoke code (e.g., DEU)
##
_rebuild_spoke_ca_bundle() {
    local spoke_code="${1:?Spoke code required}"
    local spoke_dir="${DIVE_ROOT}/instances/$(lower "$spoke_code")"
    local ca_bundle="${DIVE_ROOT}/certs/ca-bundle/rootCA.pem"

    # Ensure the SSOT bundle exists
    if [ ! -f "$ca_bundle" ] || [ ! -s "$ca_bundle" ]; then
        _rebuild_ca_bundle
    fi

    mkdir -p "$spoke_dir/certs/ca" "$spoke_dir/truststores"
    cp "$ca_bundle" "$spoke_dir/certs/ca/rootCA.pem" 2>/dev/null || true
    cp "$ca_bundle" "$spoke_dir/certs/rootCA.pem" 2>/dev/null || true
    cp "$ca_bundle" "$spoke_dir/truststores/mkcert-rootCA.pem" 2>/dev/null || true
}

# =============================================================================
# TRUSTSTORE MANAGEMENT
# =============================================================================

##
# Install mkcert root CA in a Keycloak truststore directory
#
# Arguments:
#   $1 - Target truststore directory (e.g., instances/alb/truststores)
#
# Returns:
#   0 - Success
#   1 - mkcert not ready
#   2 - Copy failed
##
install_mkcert_ca_to_truststore() {
    local target_dir="${1:?Target directory required}"

    if ! check_mkcert_ready; then
        return 1
    fi

    local ca_path
    ca_path=$(get_mkcert_ca_path)

    if [ ! -f "$ca_path" ]; then
        log_error "mkcert root CA not found at: $ca_path"
        return 1
    fi

    # Create truststore directory if it doesn't exist
    mkdir -p "$target_dir"

    # Copy root CA
    if cp "$ca_path" "$target_dir/$MKCERT_CA_FILENAME"; then
        chmod 644 "$target_dir/$MKCERT_CA_FILENAME"
        log_verbose "Installed mkcert root CA to: $target_dir/$MKCERT_CA_FILENAME"
        return 0
    else
        log_error "Failed to copy mkcert root CA to: $target_dir"
        return 2
    fi
}

##
# Generate Java PKCS12 truststore from mkcert root CA
#
# This truststore is required for Keycloak to trust other Keycloak instances
# during federation (server-to-server token endpoint calls).
#
# Arguments:
#   $1 - Target directory for truststore (e.g., instances/svk/certs)
#   $2 - Truststore password (optional, defaults to 'changeit')
#
# Returns:
#   0 - Success
#   1 - keytool not found
#   2 - mkcert CA not found
#   3 - Truststore generation failed
##
generate_java_truststore() {
    local target_dir="${1:?Target directory required}"
    local truststore_password="${2:-changeit}"
    local truststore_file="$target_dir/truststore.p12"

    # Check for keytool
    if ! command -v keytool &>/dev/null; then
        log_error "keytool not found - Java JDK required"
        return 1
    fi

    # Check mkcert CA
    if ! check_mkcert_ready; then
        return 2
    fi

    local ca_path
    ca_path=$(get_mkcert_ca_path)

    if [ ! -f "$ca_path" ]; then
        log_error "mkcert root CA not found at: $ca_path"
        return 2
    fi

    # Create directory if needed
    mkdir -p "$target_dir"

    # Remove existing truststore to avoid "alias already exists" error
    rm -f "$truststore_file"

    # Generate PKCS12 truststore
    if keytool -importcert -noprompt -trustcacerts \
        -alias mkcert-ca \
        -file "$ca_path" \
        -keystore "$truststore_file" \
        -storepass "$truststore_password" \
        -storetype PKCS12 2>/dev/null; then
        
        chmod 644 "$truststore_file"
        log_verbose "Generated Java truststore: $truststore_file"
        return 0
    else
        log_error "Failed to generate Java truststore"
        return 3
    fi
}

##
# Generate Java truststore for a spoke instance
#
# This is the main entry point for deployment pipeline integration.
# It creates the truststore that allows Keycloak to trust federation IdPs.
#
# Arguments:
#   $1 - Instance code (e.g., SVK, TST)
#
# Returns:
#   0 - Success
#   1 - Failure
##
generate_spoke_truststore() {
    local instance_code="${1:?Instance code required}"
    local code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local certs_dir="$spoke_dir/certs"

    log_step "Generating Java truststore for $instance_code"

    # Ensure CA directory exists and has SSOT CA bundle
    mkdir -p "$certs_dir/ca"

    local ca_bundle="${DIVE_ROOT}/certs/ca-bundle/rootCA.pem"
    if [ -f "$ca_bundle" ] && [ -s "$ca_bundle" ]; then
        cp "$ca_bundle" "$certs_dir/ca/rootCA.pem"
        chmod 644 "$certs_dir/ca/rootCA.pem"
    else
        # Fallback to mkcert CA if SSOT bundle not yet built
        local ca_path
        ca_path=$(get_mkcert_ca_path 2>/dev/null) || true
        if [ -f "$ca_path" ]; then
            cp "$ca_path" "$certs_dir/ca/rootCA.pem"
            chmod 644 "$certs_dir/ca/rootCA.pem"
        else
            log_warn "No CA bundle or mkcert CA found, truststore will be incomplete"
        fi
    fi

    # Generate the truststore
    if generate_java_truststore "$certs_dir" "changeit"; then
        log_success "Java truststore generated for $instance_code"
        return 0
    else
        log_error "Failed to generate Java truststore for $instance_code"
        return 1
    fi
}

##
# Generate Java truststore for the Hub instance
#
# Arguments: none
#
# Returns:
#   0 - Success
#   1 - Failure
##
generate_hub_truststore() {
    local hub_dir="${DIVE_ROOT}/instances/hub"
    local certs_dir="$hub_dir/certs"

    log_step "Generating Java truststore for Hub"

    # Ensure CA directory exists
    mkdir -p "$certs_dir/ca"

    # Use SSOT CA bundle for truststore (includes mkcert + Vault PKI)
    local ca_bundle="${DIVE_ROOT}/certs/ca-bundle/rootCA.pem"
    if [ -f "$ca_bundle" ] && [ -s "$ca_bundle" ]; then
        cp "$ca_bundle" "$certs_dir/mkcert-rootCA.pem"
        chmod 644 "$certs_dir/mkcert-rootCA.pem"
    else
        # Fallback to mkcert CA if SSOT bundle not yet built
        local ca_path
        ca_path=$(get_mkcert_ca_path 2>/dev/null) || true
        if [ -f "$ca_path" ]; then
            cp "$ca_path" "$certs_dir/mkcert-rootCA.pem"
            chmod 644 "$certs_dir/mkcert-rootCA.pem"
        fi
    fi

    if generate_java_truststore "$certs_dir" "changeit"; then
        log_success "Java truststore generated for Hub"
        return 0
    else
        log_error "Failed to generate Java truststore for Hub"
        return 1
    fi
}

##
# Install mkcert root CA in a running Keycloak container
#
# Arguments:
#   $1 - Container name (e.g., dive-hub-keycloak, alb-keycloak-alb-1)
#
# Returns:
#   0 - Success
#   1 - Container not running
#   2 - Copy failed
##
install_mkcert_ca_to_container() {
    local container="${1:?Container name required}"

    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        log_warn "Container not running: $container"
        return 1
    fi

    if ! check_mkcert_ready; then
        return 1
    fi

    local ca_path
    ca_path=$(get_mkcert_ca_path)
    local truststore_path="/opt/keycloak/conf/truststores/$MKCERT_CA_FILENAME"

    # Ensure truststore directory exists in container
    docker exec "$container" mkdir -p /opt/keycloak/conf/truststores 2>/dev/null || true

    # Copy CA to container
    if docker cp "$ca_path" "${container}:${truststore_path}" 2>/dev/null; then
        log_success "Installed mkcert root CA in container: $container"
        return 0
    else
        log_error "Failed to copy mkcert root CA to container: $container"
        return 2
    fi
}

##
# Install mkcert root CA in Hub Keycloak (both file and running container)
#
# Returns:
#   0 - Success
#   1 - Failed
##
install_mkcert_ca_in_hub() {
    ensure_dive_root
    local hub_dir="${DIVE_ROOT}/instances/hub"
    local truststore_dir="$hub_dir/truststores"

    log_step "Installing mkcert root CA in Hub..."

    # Install to file system (for docker-compose mount)
    if [ -d "$hub_dir" ]; then
        install_mkcert_ca_to_truststore "$truststore_dir" || return 1
    fi

    # Install to running container (for immediate effect)
    if docker ps --format '{{.Names}}' | grep -q "^${HUB_KEYCLOAK_CONTAINER}$"; then
        install_mkcert_ca_to_container "$HUB_KEYCLOAK_CONTAINER"
        log_info "Note: Restart Hub Keycloak to load new CA: docker restart $HUB_KEYCLOAK_CONTAINER"
    fi

    log_success "mkcert root CA installed in Hub"
    return 0
}

##
# Install mkcert root CA in a spoke Keycloak
#
# Arguments:
#   $1 - Spoke code (e.g., alb, bel, dnk)
#
# Returns:
#   0 - Success
#   1 - Failed
##
install_mkcert_ca_in_spoke() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower
    code_lower=$(lower "$spoke_code")

    ensure_dive_root
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local truststore_dir="$spoke_dir/truststores"

    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke directory not found: $spoke_dir"
        return 1
    fi

    log_step "Installing mkcert root CA in spoke: $(upper "$spoke_code")..."

    # Install to file system
    install_mkcert_ca_to_truststore "$truststore_dir" || return 1

    # Install to running container if it exists
    local container="${code_lower}-keycloak-${code_lower}-1"
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        install_mkcert_ca_to_container "$container"
    fi

    log_success "mkcert root CA installed in spoke: $(upper "$spoke_code")"
    return 0
}

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
# VAULT PKI CERTIFICATE PROVIDER
# =============================================================================
# Alternative to mkcert: issue certificates from Vault PKI Intermediate CA.
# Activated by setting CERT_PROVIDER=vault in .env.hub
# All output files use identical names/paths as mkcert — zero service changes.
# =============================================================================

##
# Return --cacert flag for curl when Vault is TLS-enabled.
# Uses VAULT_CACERT env var or auto-detects from node1/ca.pem.
#
# Output: "--cacert /path/to/ca.pem" or empty string
##
_vault_curl_cacert_flag() {
    local cacert_path="${VAULT_CACERT:-}"

    # Auto-detect from node1 CA if not set
    if [ -z "$cacert_path" ] && type _vault_cacert_path &>/dev/null; then
        cacert_path=$(_vault_cacert_path 2>/dev/null || true)
    fi

    if [ -n "$cacert_path" ] && [ -f "$cacert_path" ]; then
        echo "--cacert $cacert_path"
    fi
}

##
# Check if Vault PKI should be used for certificate generation
#
# Returns:
#   0 - Use Vault PKI (CERT_PROVIDER=vault)
#   1 - Use mkcert (default)
##
use_vault_pki() {
    local provider="${CERT_PROVIDER:-}"

    # Check .env.hub if not set in environment
    if [ -z "$provider" ] && [ -f "${DIVE_ROOT}/.env.hub" ]; then
        provider=$(grep '^CERT_PROVIDER=' "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d= -f2- || true)
    fi

    [ "$provider" = "vault" ]
}

##
# Issue a certificate from Vault PKI Intermediate CA
#
# Arguments:
#   $1 - PKI role name (e.g., "hub-services", "spoke-fra-services")
#   $2 - Common Name (e.g., "dive-hub-services", "dive-spoke-fra-services")
#   $3 - Space-separated list of DNS SANs
#   $4 - Comma-separated list of IP SANs (default: "127.0.0.1,::1")
#   $5 - Target directory for certificate files
#   $6 - TTL (default: "2160h" = 90 days)
#
# Writes:
#   $5/certificate.pem  - Server certificate
#   $5/key.pem          - Private key
#   $5/ca/rootCA.pem    - Full CA chain (intermediate + root)
#   $5/rootCA.pem       - Copy of CA chain
#
# Returns:
#   0 - Success
#   1 - Vault not available or issuance failed
##
_vault_pki_issue_cert() {
    local role_name="$1"
    local common_name="$2"
    local dns_sans="$3"
    local ip_sans="${4:-127.0.0.1,::1}"
    local target_dir="$5"
    local ttl="${6:-2160h}"

    # Resolve Vault address (prefer CLI addr on host, Docker addr in container)
    local vault_addr="${VAULT_CLI_ADDR:-${VAULT_ADDR:-https://localhost:8200}}"
    local vault_token="${VAULT_TOKEN:-}"

    # Load token if not set
    if [ -z "$vault_token" ] && [ -f "${DIVE_ROOT}/.vault-token" ]; then
        vault_token=$(cat "${DIVE_ROOT}/.vault-token")
    fi

    if [ -z "$vault_token" ]; then
        log_error "Vault PKI: No token available"
        return 1
    fi

    # Convert space-separated DNS SANs to comma-separated
    local dns_csv
    dns_csv=$(echo "$dns_sans" | tr ' ' ',')

    log_verbose "Vault PKI: Issuing cert via role=$role_name, ttl=$ttl"
    log_verbose "  DNS SANs: $dns_csv"
    log_verbose "  IP SANs:  $ip_sans"

    # Issue certificate via Vault PKI API (curl + jq, not vault CLI)
    local cacert_flag
    cacert_flag=$(_vault_curl_cacert_flag)
    local response
    # shellcheck disable=SC2086
    response=$(curl -sL $cacert_flag -X POST \
        -H "X-Vault-Token: $vault_token" \
        -H "Content-Type: application/json" \
        -d "{
            \"common_name\": \"$common_name\",
            \"alt_names\": \"$dns_csv\",
            \"ip_sans\": \"$ip_sans\",
            \"ttl\": \"$ttl\",
            \"format\": \"pem\"
        }" \
        "${vault_addr}/v1/pki_int/issue/${role_name}" 2>/dev/null)

    if [ -z "$response" ]; then
        log_error "Vault PKI: Empty response from ${vault_addr}/v1/pki_int/issue/${role_name}"
        return 1
    fi

    # Check for errors in response
    local errors
    errors=$(printf '%s\n' "$response" | jq -r '.errors // empty' 2>/dev/null)
    if [ -n "$errors" ] && [ "$errors" != "null" ] && [ "$errors" != "" ]; then
        log_error "Vault PKI: Issuance failed: $errors"
        return 1
    fi

    # Extract certificate, key, and CA chain from JSON response
    local certificate private_key issuing_ca ca_chain
    certificate=$(printf '%s\n' "$response" | jq -r '.data.certificate // empty')
    private_key=$(printf '%s\n' "$response" | jq -r '.data.private_key // empty')
    issuing_ca=$(printf '%s\n' "$response" | jq -r '.data.issuing_ca // empty')
    ca_chain=$(printf '%s\n' "$response" | jq -r 'if .data.ca_chain then .data.ca_chain | join("\n") else empty end' 2>/dev/null || true)

    if [ -z "$certificate" ] || [ -z "$private_key" ]; then
        log_error "Vault PKI: Missing certificate or private key in response"
        return 1
    fi

    # Write files to target directory (same names as mkcert output)
    mkdir -p "$target_dir" "$target_dir/ca"

    printf '%s\n' "$certificate" > "$target_dir/certificate.pem"
    printf '%s\n' "$private_key" > "$target_dir/key.pem"

    # CA chain: use ca_chain (includes issuing CA + root) when available,
    # otherwise fall back to issuing_ca alone. Avoids duplicate intermediate.
    if [ -n "$ca_chain" ] && [ "$ca_chain" != "null" ]; then
        printf '%s\n' "$ca_chain" > "$target_dir/ca/rootCA.pem"
    else
        printf '%s\n' "$issuing_ca" > "$target_dir/ca/rootCA.pem"
    fi

    # Copy CA to alternate location expected by some services
    cp "$target_dir/ca/rootCA.pem" "$target_dir/rootCA.pem" 2>/dev/null || true

    # Write Vault PKI CA chain to stable SSOT location (never clobbered by bundle rebuilds)
    local vault_pki_dir="${DIVE_ROOT}/certs/vault-pki"
    mkdir -p "$vault_pki_dir"
    cp "$target_dir/ca/rootCA.pem" "$vault_pki_dir/ca-chain.pem" 2>/dev/null || true
    chmod 644 "$vault_pki_dir/ca-chain.pem" 2>/dev/null || true

    # Set permissions (matching mkcert convention)
    chmod 600 "$target_dir/key.pem"
    chmod 644 "$target_dir/certificate.pem"
    chmod 644 "$target_dir/ca/rootCA.pem"
    chmod 644 "$target_dir/rootCA.pem" 2>/dev/null || true

    # Generate fullchain.pem (leaf cert + CA chain) for Keycloak/nginx/reverse proxy
    {
        printf '%s\n' "$certificate"
        cat "$target_dir/ca/rootCA.pem"
    } > "$target_dir/fullchain.pem"
    chmod 644 "$target_dir/fullchain.pem"

    # Create privkey.pem symlink for nginx compatibility
    ln -sf key.pem "$target_dir/privkey.pem" 2>/dev/null || cp "$target_dir/key.pem" "$target_dir/privkey.pem"

    log_success "Vault PKI: Certificate issued (role=$role_name, ttl=$ttl)"
    return 0
}

##
# Generate Java PKCS12 truststore from a CA PEM file
# Shared between Vault PKI and mkcert certificate paths.
#
# Arguments:
#   $1 - Path to CA PEM file (root or chain)
#   $2 - Target directory for truststore.p12
#
# Returns:
#   0 - Success
#   1 - keytool not found or generation failed
##
_generate_truststore_from_ca() {
    local ca_pem="$1"
    local target_dir="$2"
    local truststore_file="$target_dir/truststore.p12"

    if ! command -v keytool &>/dev/null; then
        log_warn "keytool not found — Java truststore not generated"
        return 1
    fi

    if [ ! -f "$ca_pem" ]; then
        log_warn "CA PEM not found at $ca_pem"
        return 1
    fi

    rm -f "$truststore_file"

    if keytool -importcert -noprompt -trustcacerts \
        -alias dive-v3-ca \
        -file "$ca_pem" \
        -keystore "$truststore_file" \
        -storepass changeit \
        -storetype PKCS12 2>/dev/null; then
        chmod 644 "$truststore_file"
        log_verbose "Generated Java truststore: $truststore_file"
        return 0
    else
        log_error "Failed to generate Java truststore"
        return 1
    fi
}

##
# Generate hub certificate from Vault PKI
#
# Issues a certificate via the hub-services role with all hub service
# container names as SANs. Drop-in replacement for mkcert hub cert.
#
# Returns:
#   0 - Success
#   1 - Failed
##
generate_hub_certificate_vault() {
    ensure_dive_root
    local cert_dir="${DIVE_ROOT}/instances/hub/certs"

    log_step "Generating hub certificate from Vault PKI..."

    # Check if valid certificates already exist (skip if not expired)
    if [ -f "$cert_dir/certificate.pem" ] && [ -f "$cert_dir/key.pem" ]; then
        local expiry_check
        expiry_check=$(openssl x509 -in "$cert_dir/certificate.pem" -checkend 86400 2>/dev/null && echo "valid" || echo "expiring")
        if [ "$expiry_check" = "valid" ]; then
            # Verify it was issued by Vault (not mkcert)
            if openssl x509 -in "$cert_dir/certificate.pem" -noout -issuer 2>/dev/null | grep -q "DIVE V3"; then
                log_info "Hub certificate exists and is valid (Vault PKI) — skipping regeneration"
                return 0
            fi
        fi
    fi

    mkdir -p "$cert_dir"

    # Hub DNS SANs — delegated to SSOT function
    local dns_sans
    dns_sans=$(_hub_service_sans)

    local ip_sans="127.0.0.1,::1"

    if _vault_pki_issue_cert "hub-services" "dive-hub-services" "$dns_sans" "$ip_sans" "$cert_dir" "2160h"; then
        log_success "Hub certificate issued from Vault PKI"

        # Rebuild SSOT CA bundle (mkcert + Vault PKI) — _vault_pki_issue_cert
        # already wrote Vault chain to certs/vault-pki/ca-chain.pem
        _rebuild_ca_bundle

        # Copy combined bundle to hub truststore locations
        local ca_bundle="${DIVE_ROOT}/certs/ca-bundle/rootCA.pem"
        local truststore_dir="${DIVE_ROOT}/instances/hub/truststores"
        mkdir -p "$truststore_dir"
        cp "$ca_bundle" "$truststore_dir/mkcert-rootCA.pem" 2>/dev/null || true
        cp "$ca_bundle" "$cert_dir/mkcert-rootCA.pem" 2>/dev/null || true

        # Generate Java truststore for Keycloak federation (from combined bundle)
        _generate_truststore_from_ca "$ca_bundle" "$cert_dir"

        return 0
    else
        log_error "Hub certificate issuance from Vault PKI failed"
        return 1
    fi
}

##
# Generate spoke certificate from Vault PKI
#
# Issues a certificate via the spoke-{code}-services role with spoke
# and hub service container names as SANs. Drop-in replacement for mkcert.
#
# Arguments:
#   $1 - Spoke code (e.g., fra, deu, gbr)
#
# Returns:
#   0 - Success
#   1 - Failed
##
generate_spoke_certificate_vault() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower
    code_lower=$(lower "$spoke_code")

    ensure_dive_root
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local cert_dir="$spoke_dir/certs"

    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke directory not found: $spoke_dir"
        return 1
    fi

    log_step "Generating spoke certificate for $(upper "$spoke_code") from Vault PKI..."

    mkdir -p "$cert_dir" "$cert_dir/ca"

    # Spoke DNS SANs — delegated to SSOT function
    local dns_sans
    dns_sans=$(_spoke_service_sans "$code_lower")

    local ip_sans="127.0.0.1,::1"
    local role_name="spoke-${code_lower}-services"

    if _vault_pki_issue_cert "$role_name" "dive-spoke-${code_lower}-services" \
        "$dns_sans" "$ip_sans" "$cert_dir" "2160h"; then
        log_success "Spoke certificate issued from Vault PKI for $(upper "$spoke_code")"

        # Rebuild SSOT CA bundle and copy to spoke instance dir
        _rebuild_ca_bundle
        _rebuild_spoke_ca_bundle "$code_lower"

        # Generate Java truststore for Keycloak federation (from combined bundle)
        local ca_bundle="${DIVE_ROOT}/certs/ca-bundle/rootCA.pem"
        _generate_truststore_from_ca "$ca_bundle" "$cert_dir"

        return 0
    else
        log_error "Spoke certificate issuance from Vault PKI failed for $(upper "$spoke_code")"
        return 1
    fi
}

# =============================================================================
# VERIFICATION
# =============================================================================

##
# Verify certificate trust chain for federation
#
# Arguments:
#   $1 - Spoke code (e.g., alb, nzl)
#
# Returns:
#   0 - All checks pass
#   1 - One or more checks failed
##
verify_federation_certificates() {
    local spoke_code="${1:-}"
    local code_lower
    code_lower=$(lower "${spoke_code:-usa}")
    local code_upper
    code_upper=$(upper "${spoke_code:-usa}")

    echo ""
    echo -e "${BOLD}Certificate Verification: ${code_upper}${NC}"
    echo ""

    local passed=0
    local failed=0

    # Check 1: mkcert installed
    echo -n "  mkcert installed:           "
    if command -v mkcert &>/dev/null; then
        echo -e "${GREEN}✓${NC}"
        passed=$((passed + 1))
    else
        echo -e "${RED}✗${NC}"
        failed=$((failed + 1))
    fi

    # Check 2: mkcert root CA exists
    echo -n "  mkcert root CA exists:      "
    local ca_path
    ca_path=$(get_mkcert_ca_path 2>/dev/null) || true
    if [ -f "$ca_path" ]; then
        echo -e "${GREEN}✓${NC}"
        passed=$((passed + 1))
    else
        echo -e "${RED}✗${NC}"
        failed=$((failed + 1))
    fi

    # Check 3: Hub truststore has CA
    echo -n "  Hub truststore CA:          "
    if [ -f "${DIVE_ROOT}/instances/hub/truststores/$MKCERT_CA_FILENAME" ]; then
        echo -e "${GREEN}✓${NC}"
        passed=$((passed + 1))
    else
        echo -e "${YELLOW}⚠ Not found${NC}"
        failed=$((failed + 1))
    fi

    # Check 4: Hub certificate exists
    echo -n "  Hub certificate:            "
    if [ -f "${DIVE_ROOT}/instances/hub/certs/certificate.pem" ]; then
        echo -e "${GREEN}✓${NC}"
        passed=$((passed + 1))
    else
        echo -e "${RED}✗${NC}"
        failed=$((failed + 1))
    fi

    # Check 5: Spoke truststore has CA (if spoke exists)
    if [ -n "$spoke_code" ] && [ -d "${DIVE_ROOT}/instances/${code_lower}" ]; then
        echo -n "  Spoke truststore CA:        "
        if [ -f "${DIVE_ROOT}/instances/${code_lower}/truststores/$MKCERT_CA_FILENAME" ]; then
            echo -e "${GREEN}✓${NC}"
            passed=$((passed + 1))
        else
            echo -e "${YELLOW}⚠ Not found${NC}"
            failed=$((failed + 1))
        fi

        echo -n "  Spoke certificate:          "
        if [ -f "${DIVE_ROOT}/instances/${code_lower}/certs/certificate.pem" ]; then
            echo -e "${GREEN}✓${NC}"
            passed=$((passed + 1))
        else
            echo -e "${RED}✗${NC}"
            failed=$((failed + 1))
        fi
    fi

    # Check 6: Hub cert has spoke hostname (if spoke specified)
    if [ -n "$spoke_code" ] && [ -f "${DIVE_ROOT}/instances/hub/certs/certificate.pem" ]; then
        echo -n "  Hub cert has spoke SAN:     "
        local spoke_hostname="${code_lower}-keycloak-${code_lower}-1"
        if openssl x509 -in "${DIVE_ROOT}/instances/hub/certs/certificate.pem" -noout -text 2>/dev/null | grep -q "$spoke_hostname"; then
            echo -e "${GREEN}✓${NC}"
            passed=$((passed + 1))
        else
            echo -e "${YELLOW}⚠ Missing: $spoke_hostname${NC}"
            failed=$((failed + 1))
        fi
    fi

    echo ""
    echo "  Result: $passed passed, $failed failed"
    echo ""

    [ $failed -eq 0 ]
}

##
# Verify all spokes' certificates in batch
#
# Arguments:
#   None (operates on all known spokes)
#
# Returns:
#   0 - All spokes pass
#   1 - At least one spoke failed
##
verify_all_certificates() {
    ensure_dive_root

    echo ""
    echo -e "${BOLD}Certificate Verification: All Spokes${NC}"
    echo ""

    local total_passed=0
    local total_failed=0
    local spokes_ok=0
    local spokes_fail=0

    # Get all spoke directories
    local spoke_dirs=()
    for dir in "${DIVE_ROOT}"/instances/*/; do
        local basename
        basename=$(basename "$dir")
        # Skip hub and usa (that's the Hub)
        if [[ "$basename" != "hub" && "$basename" != "usa" && "$basename" != "shared" && -d "$dir" ]]; then
            spoke_dirs+=("$basename")
        fi
    done

    if [ ${#spoke_dirs[@]} -eq 0 ]; then
        log_warn "No spoke instances found"
        return 0
    fi

    printf "  %-10s  %-10s  %-10s  %-10s\n" "SPOKE" "CERT" "CA" "STATUS"
    echo "  ──────────────────────────────────────────────"

    for spoke in "${spoke_dirs[@]}"; do
        local cert_ok="✗"
        local ca_ok="✗"
        local status="${RED}FAIL${NC}"

        # Check spoke certificate
        if [ -f "${DIVE_ROOT}/instances/${spoke}/certs/certificate.pem" ]; then
            cert_ok="${GREEN}✓${NC}"
        fi

        # Check spoke CA
        if [ -f "${DIVE_ROOT}/instances/${spoke}/truststores/$MKCERT_CA_FILENAME" ]; then
            ca_ok="${GREEN}✓${NC}"
        fi

        if [ -f "${DIVE_ROOT}/instances/${spoke}/certs/certificate.pem" ]; then
            status="${GREEN}OK${NC}"
            spokes_ok=$((spokes_ok + 1))
        else
            spokes_fail=$((spokes_fail + 1))
        fi

        printf "  %-10s  %b  %b  %b\n" "$(upper "$spoke")" "$cert_ok" "$ca_ok" "$status"
    done

    echo ""
    echo "  Summary: $spokes_ok OK, $spokes_fail failed (${#spoke_dirs[@]} total)"
    echo ""

    [ $spokes_fail -eq 0 ]
}

##
# Prepare certificates for all spokes in batch
#
# Arguments:
#   None (operates on all known spokes)
#
# Returns:
#   0 - All spokes succeeded
#   1 - At least one spoke failed
##
prepare_all_certificates() {
    ensure_dive_root

    echo ""
    echo -e "${BOLD}Preparing Certificates for All Spokes${NC}"
    echo ""

    local success=0
    local fail=0

    # Get all spoke directories
    for dir in "${DIVE_ROOT}"/instances/*/; do
        local spoke
        spoke=$(basename "$dir")
        # Skip hub and usa
        if [[ "$spoke" != "hub" && "$spoke" != "usa" && "$spoke" != "shared" && -d "$dir" ]]; then
            echo -e "${CYAN}>>> Processing: $(upper "$spoke")${NC}"
            if prepare_federation_certificates "$spoke" 2>&1 | sed 's/^/  /'; then
                success=$((success + 1))
            else
                fail=$((fail + 1))
            fi
            echo ""
        fi
    done

    echo -e "${BOLD}Batch Complete: $success succeeded, $fail failed${NC}"
    echo ""

    [ $fail -eq 0 ]
}

# =============================================================================
# MKCERT CA SYNC (Phase 3.1)
# =============================================================================
# Quickly sync local mkcert CA to all instances
# This is useful when switching development machines or after mkcert reinstall
# =============================================================================

##
# Sync local mkcert root CA to all instances
#
# This command copies the current local mkcert CA to:
# - All spoke instances (instances/*/certs/ca/rootCA.pem)
# - Hub instance (instances/hub/certs/ca/rootCA.pem)
# - All truststore directories
#
# Use this when:
# - Setting up a new development machine
# - After reinstalling mkcert
# - When SSL health checks fail due to CA mismatch
#
# Arguments:
#   None
#
# Returns:
#   0 - All instances synced
#   1 - Sync failed
##
sync_mkcert_ca_to_all() {
    ensure_dive_root

    if ! check_mkcert_ready; then
        log_error "mkcert not ready. Run: mkcert -install"
        return 1
    fi

    local ca_path
    ca_path=$(get_mkcert_ca_path)
    local ca_issuer
    ca_issuer=$(openssl x509 -in "$ca_path" -issuer -noout 2>/dev/null | sed 's/issuer=//')

    echo ""
    echo -e "${BOLD}Syncing mkcert CA to All Instances${NC}"
    echo ""
    echo -e "  Local CA: ${CYAN}$ca_path${NC}"
    echo -e "  Issuer:   ${CYAN}$ca_issuer${NC}"
    echo ""

    local success=0
    local fail=0
    local skipped=0

    # Sync to all instance directories
    for dir in "${DIVE_ROOT}"/instances/*/; do
        local instance
        instance=$(basename "$dir")
        
        # Skip non-instance directories
        [[ "$instance" == "shared" ]] && continue
        
        local targets=(
            "$dir/certs/ca/rootCA.pem"
            "$dir/certs/rootCA.pem"
            "$dir/truststores/mkcert-rootCA.pem"
        )
        
        local instance_updated=false
        
        for target_dir in "${targets[@]}"; do
            local target_parent
            target_parent=$(dirname "$target_dir")
            
            # Only create and copy if parent directory exists or can be created
            if [ -d "$target_parent" ] || mkdir -p "$target_parent" 2>/dev/null; then
                if [ -f "$target_dir" ]; then
                    # Check if update needed (compare CA subjects)
                    local existing_issuer
                    existing_issuer=$(openssl x509 -in "$target_dir" -issuer -noout 2>/dev/null | sed 's/issuer=//')
                    if [ "$existing_issuer" = "$ca_issuer" ]; then
                        continue  # Already up to date
                    fi
                fi
                
                if cp "$ca_path" "$target_dir" 2>/dev/null; then
                    chmod 644 "$target_dir"
                    instance_updated=true
                fi
            fi
        done
        
        if $instance_updated; then
            echo -e "  ${GREEN}✓${NC} $(upper "$instance")"
            success=$((success + 1))
        else
            skipped=$((skipped + 1))
        fi
    done

    echo ""
    echo -e "${BOLD}Sync Complete:${NC} $success updated, $skipped already current"
    echo ""

    if [ $success -gt 0 ]; then
        log_info "Note: Restart services to load new CA certificates"
        echo "  Hub:   docker compose -f docker-compose.hub.yml restart"
        echo "  Spoke: cd instances/<code> && docker compose restart"
    fi

    return 0
}

# =============================================================================
# SYSTEM TRUST STORE MANAGEMENT
# =============================================================================

##
# Print Firefox HSTS cache clearing instructions
##
_print_firefox_hsts_clear_instructions() {
    echo ""
    echo "Firefox HSTS Cache Clearing:"
    echo ""
    echo "  Option A (quick): Clear site data"
    echo "    1. Press Cmd+Shift+Delete (macOS) or Ctrl+Shift+Delete (Linux)"
    echo "    2. Select 'Everything' for time range"
    echo "    3. Check 'Site Preferences' and 'Cache', click 'Clear Now'"
    echo ""
    echo "  Option B (targeted): Delete HSTS entry for localhost"
    echo "    1. Close Firefox completely"
    echo "    2. Open about:support > Profile Directory"
    echo "    3. Edit SiteSecurityServiceState.txt"
    echo "    4. Delete any line containing 'localhost'"
    echo "    5. Restart Firefox"
    echo ""
    echo "  Option C (enable enterprise roots): Trust system CA in Firefox"
    echo "    1. Open about:config in Firefox"
    echo "    2. Set security.enterprise_roots.enabled = true"
    echo "    3. Restart Firefox"
    echo ""
}

##
# Install Vault Root CA in the system trust store
#
# Enables browsers and system tools to trust Vault PKI certificates.
# macOS: Uses 'security add-trusted-cert' for the system keychain
# Linux: Copies to /usr/local/share/ca-certificates/ + update-ca-certificates
#
# Usage: ./dive certs trust-ca  OR  ./dive vault trust-ca
##
install_vault_ca_to_system_truststore() {
    ensure_dive_root

    local root_ca=""
    local tmp_root_ca="${DIVE_ROOT}/.tmp-trust-root-ca.pem"

    # Strategy 1: Extract Root CA from the hub instance chain file
    # This is the authoritative source — it matches the cert chain served by hub services
    local hub_chain="${DIVE_ROOT}/instances/hub/certs/ca/rootCA.pem"
    if [ -f "$hub_chain" ]; then
        local cert_count
        cert_count=$(grep -c "BEGIN CERTIFICATE" "$hub_chain" 2>/dev/null || echo "0")
        if [ "$cert_count" -ge 2 ]; then
            # Extract the last cert in the chain (Root CA — self-signed)
            awk -v n="$cert_count" '/-----BEGIN CERTIFICATE-----/{c++} c==n{print} /-----END CERTIFICATE-----/{if(c==n) exit}' \
                "$hub_chain" > "$tmp_root_ca"
            if openssl x509 -in "$tmp_root_ca" -noout -subject 2>/dev/null | grep -q "DIVE"; then
                root_ca="$tmp_root_ca"
                log_info "Extracted Root CA from hub instance chain"
            fi
        fi
    fi

    # Strategy 2: Export Root CA from Vault PKI API
    if [ -z "$root_ca" ]; then
        log_info "Attempting to export Root CA from Vault PKI..."
        local vault_addr="${VAULT_CLI_ADDR:-${VAULT_ADDR:-https://localhost:8200}}"
        local vault_token="${VAULT_TOKEN:-}"
        if [ -z "$vault_token" ] && [ -f "${DIVE_ROOT}/.vault-token" ]; then
            vault_token=$(cat "${DIVE_ROOT}/.vault-token")
        fi

        if [ -n "$vault_token" ]; then
            local cacert_flag
            cacert_flag=$(_vault_curl_cacert_flag)
            local ca_pem
            # shellcheck disable=SC2086
            ca_pem=$(curl -sL $cacert_flag -H "X-Vault-Token: $vault_token" \
                "${vault_addr}/v1/pki/cert/ca" 2>/dev/null | jq -r '.data.certificate // empty' 2>/dev/null)
            if [ -n "$ca_pem" ] && echo "$ca_pem" | grep -q "BEGIN CERTIFICATE"; then
                printf '%s\n' "$ca_pem" > "$tmp_root_ca"
                root_ca="$tmp_root_ca"
                log_info "Exported Root CA from Vault PKI API"
            fi
        fi
    fi

    # Strategy 3: Fall back to mkcert root CA (dev/local environments)
    if [ -z "$root_ca" ]; then
        local mkcert_root
        mkcert_root=$(get_mkcert_ca_path 2>/dev/null) || true
        if [ -n "$mkcert_root" ] && [ -f "$mkcert_root" ]; then
            root_ca="$mkcert_root"
            log_info "Using mkcert Root CA (no Vault PKI available)"
        else
            log_error "No Root CA found: no hub chain, no Vault PKI, no mkcert root CA"
            rm -f "$tmp_root_ca"
            return 1
        fi
    fi

    # Display cert info
    local subject fingerprint
    subject=$(openssl x509 -in "$root_ca" -noout -subject 2>/dev/null | sed 's/subject=//')
    fingerprint=$(openssl x509 -in "$root_ca" -noout -fingerprint 2>/dev/null | sed 's/.*=//')

    echo ""
    log_info "Installing Root CA to System Trust Store"
    echo ""
    echo "  Subject:      ${subject}"
    echo "  Fingerprint:  ${fingerprint}"
    echo ""

    local os_type rc
    os_type=$(uname -s)

    case "$os_type" in
        Darwin)
            log_info "Installing to macOS system keychain (requires sudo)..."
            if sudo security add-trusted-cert -d -r trustRoot \
                -k /Library/Keychains/System.keychain "$root_ca"; then
                log_success "Root CA installed in macOS system keychain"
                echo ""
                echo "  Chrome/Safari: Trusted immediately (restart browser)"
                echo "  Firefox:       Set security.enterprise_roots.enabled=true in about:config"
                echo "                 Or import manually: Preferences > Privacy > Certificates > Import"
                _print_firefox_hsts_clear_instructions
                rc=0
            else
                log_error "Failed to install Root CA (sudo required)"
                rc=2
            fi
            ;;
        Linux)
            log_info "Installing to Linux system CA store (requires sudo)..."
            local ca_dest="/usr/local/share/ca-certificates/dive-v3-root-ca.crt"
            if sudo cp "$root_ca" "$ca_dest" && sudo update-ca-certificates; then
                log_success "Root CA installed in Linux system CA store"
                echo ""
                echo "  System tools (curl, wget): Trusted immediately"
                echo "  Chrome/Chromium: Trusted immediately (restart browser)"
                echo "  Firefox: Set security.enterprise_roots.enabled=true in about:config"
                _print_firefox_hsts_clear_instructions
                rc=0
            else
                log_error "Failed to install Root CA"
                rc=2
            fi
            ;;
        *)
            log_error "Unsupported OS: ${os_type}"
            log_info "Manually import ${root_ca} into your system trust store"
            rc=2
            ;;
    esac

    rm -f "$tmp_root_ca"
    return "$rc"
}

##
# Remove Vault Root CA from system trust store
##
remove_vault_ca_from_system_truststore() {
    local os_type
    os_type=$(uname -s)

    case "$os_type" in
        Darwin)
            log_info "Removing DIVE V3 Root CA from macOS keychain..."
            if sudo security delete-certificate -c "DIVE V3 Root CA" \
                /Library/Keychains/System.keychain 2>/dev/null; then
                log_success "Root CA removed from macOS system keychain"
            else
                log_warn "Root CA not found in system keychain (may already be removed)"
            fi
            ;;
        Linux)
            local ca_dest="/usr/local/share/ca-certificates/dive-v3-root-ca.crt"
            if [ -f "$ca_dest" ]; then
                sudo rm -f "$ca_dest" && sudo update-ca-certificates
                log_success "Root CA removed from Linux CA store"
            else
                log_warn "Root CA not found in CA store"
            fi
            ;;
        *)
            log_error "Unsupported OS: $(uname -s)"
            ;;
    esac
}

# =============================================================================
# VAULT NODE TLS CERTIFICATES
# =============================================================================
# Two-phase approach for Vault node TLS:
#   Phase A (cold start):  OpenSSL bootstrap CA — used when Vault PKI is not
#                          yet available (initial cluster startup).
#   Phase B (steady state): After module_vault_pki_setup(), re-issue node certs
#                          from Vault PKI Intermediate CA via rolling restart.
#   Dev/mkcert fallback:   In non-production mode, mkcert is still used.
# =============================================================================

## Bootstrap CA directory (one-time, 7-day TTL, OpenSSL self-signed)
VAULT_BOOTSTRAP_CA_DIR="${DIVE_ROOT:-$(pwd)}/certs/vault/bootstrap-ca"

## Vault node cert validity (OpenSSL bootstrap certs)
VAULT_BOOTSTRAP_CERT_DAYS="${VAULT_BOOTSTRAP_CERT_DAYS:-7}"

##
# Get the path to the CA certificate that should be used for CLI→Vault TLS.
#
# Priority:
#   1. Vault PKI ca.pem (if node1 cert issued by Vault PKI Intermediate CA)
#   2. Bootstrap CA ca.pem (if node1 cert issued by bootstrap CA)
#   3. mkcert CA (dev/local mode)
#   4. Empty string (Vault TLS disabled / HTTP mode)
#
# Output: absolute path to CA PEM file (or empty string)
##
_vault_cacert_path() {
    local node1_ca="${DIVE_ROOT:-$(pwd)}/certs/vault/node1/ca.pem"

    # If node1 has a ca.pem, use it (works for both bootstrap and Vault PKI)
    if [ -f "$node1_ca" ]; then
        echo "$node1_ca"
        return 0
    fi

    # mkcert fallback for dev/local mode
    if command -v mkcert &>/dev/null; then
        local mkcert_ca
        mkcert_ca="$(mkcert -CAROOT 2>/dev/null)/rootCA.pem"
        if [ -f "$mkcert_ca" ]; then
            echo "$mkcert_ca"
            return 0
        fi
    fi

    # No CA available
    echo ""
}

##
# Generate a one-time OpenSSL self-signed bootstrap CA for Vault node TLS.
# Only used during initial Vault cluster startup before Vault PKI is available.
# Stored in certs/vault/bootstrap-ca/ with a 7-day TTL.
#
# Idempotent: skips generation if bootstrap CA exists and is still valid.
#
# Returns:
#   0 - Bootstrap CA ready (generated or already valid)
#   1 - OpenSSL not available or generation failed
##
_generate_bootstrap_ca() {
    ensure_dive_root
    local ca_dir="$VAULT_BOOTSTRAP_CA_DIR"
    local ca_key="$ca_dir/ca-key.pem"
    local ca_cert="$ca_dir/ca.pem"

    # Idempotent: reuse if CA cert exists and has >1 day remaining
    if [ -f "$ca_cert" ] && [ -f "$ca_key" ]; then
        local days_left
        days_left=$(_cert_days_remaining "$ca_cert")
        if [ "$days_left" -gt 1 ] 2>/dev/null; then
            log_verbose "Bootstrap CA valid for ${days_left} days — reusing"
            return 0
        fi
        log_info "Bootstrap CA expires in ${days_left} days — regenerating"
    fi

    if ! command -v openssl &>/dev/null; then
        log_error "OpenSSL is required for bootstrap CA generation"
        return 1
    fi

    mkdir -p "$ca_dir"

    log_info "Generating bootstrap CA for Vault node TLS (${VAULT_BOOTSTRAP_CERT_DAYS}-day TTL)..."

    # Generate RSA 4096 CA key
    if ! openssl genrsa -out "$ca_key" 4096 2>/dev/null; then
        log_error "Failed to generate bootstrap CA key"
        return 1
    fi
    chmod 600 "$ca_key"

    # Generate self-signed CA certificate
    if ! openssl req -x509 -new -nodes \
        -key "$ca_key" \
        -sha256 \
        -days "$VAULT_BOOTSTRAP_CERT_DAYS" \
        -out "$ca_cert" \
        -subj "/O=DIVE Federation/CN=DIVE V3 Vault Bootstrap CA" 2>/dev/null; then
        log_error "Failed to generate bootstrap CA certificate"
        rm -f "$ca_key"
        return 1
    fi
    chmod 644 "$ca_cert"

    log_success "Bootstrap CA generated: $ca_cert (${VAULT_BOOTSTRAP_CERT_DAYS}-day TTL)"
    return 0
}

##
# Generate a TLS certificate for a single Vault node using the bootstrap CA.
#
# Arguments:
#   $1 - Node name (node1, node2, node3)
#   $2 - Output directory (e.g., certs/vault/node1)
#
# Returns:
#   0 - Certificate generated
#   1 - Failed
##
_generate_bootstrap_node_cert() {
    local node="${1:?Node name required}"
    local node_dir="${2:?Output directory required}"
    local ca_key="$VAULT_BOOTSTRAP_CA_DIR/ca-key.pem"
    local ca_cert="$VAULT_BOOTSTRAP_CA_DIR/ca.pem"

    if [ ! -f "$ca_key" ] || [ ! -f "$ca_cert" ]; then
        log_error "Bootstrap CA not found — run _generate_bootstrap_ca() first"
        return 1
    fi

    mkdir -p "$node_dir"

    # Build SANs from SSOT
    local dns_sans ip_sans
    dns_sans=$(_vault_node_dns_sans "$node")
    ip_sans=$(_vault_node_ip_sans)

    # Create OpenSSL extensions config for SANs
    local ext_file
    ext_file=$(mktemp)
    {
        echo "[v3_req]"
        echo "basicConstraints = CA:FALSE"
        echo "keyUsage = digitalSignature, keyEncipherment"
        echo "extendedKeyUsage = serverAuth, clientAuth"
        echo "subjectAltName = @alt_names"
        echo ""
        echo "[alt_names]"
        local i=1
        local san
        for san in $dns_sans; do
            echo "DNS.${i} = ${san}"
            i=$((i + 1))
        done
        i=1
        for san in $ip_sans; do
            echo "IP.${i} = ${san}"
            i=$((i + 1))
        done
    } > "$ext_file"

    # Generate node key
    if ! openssl genrsa -out "$node_dir/key.pem" 2048 2>/dev/null; then
        log_error "Failed to generate key for Vault ${node}"
        rm -f "$ext_file"
        return 1
    fi
    chmod 600 "$node_dir/key.pem"

    # Generate CSR
    if ! openssl req -new \
        -key "$node_dir/key.pem" \
        -out "$node_dir/node.csr" \
        -subj "/O=DIVE Federation/CN=${node}" 2>/dev/null; then
        log_error "Failed to generate CSR for Vault ${node}"
        rm -f "$ext_file"
        return 1
    fi

    # Sign with bootstrap CA
    if ! openssl x509 -req \
        -in "$node_dir/node.csr" \
        -CA "$ca_cert" \
        -CAkey "$ca_key" \
        -CAcreateserial \
        -out "$node_dir/certificate.pem" \
        -days "$VAULT_BOOTSTRAP_CERT_DAYS" \
        -sha256 \
        -extensions v3_req \
        -extfile "$ext_file" 2>/dev/null; then
        log_error "Failed to sign certificate for Vault ${node}"
        rm -f "$ext_file" "$node_dir/node.csr"
        return 1
    fi

    chmod 644 "$node_dir/certificate.pem"

    # Copy bootstrap CA cert for retry_join TLS verification
    cp "$ca_cert" "$node_dir/ca.pem"
    chmod 644 "$node_dir/ca.pem"

    # Clean up temp files
    rm -f "$ext_file" "$node_dir/node.csr"

    log_success "Vault ${node}: bootstrap certificate generated (${VAULT_BOOTSTRAP_CERT_DAYS}-day TTL)"
    return 0
}

##
# Check whether current Vault node certs were issued by the bootstrap CA
# (as opposed to Vault PKI Intermediate CA).
#
# Returns:
#   0 - Bootstrap certs detected (or no certs)
#   1 - Vault PKI certs already in place
##
_vault_node_certs_are_bootstrap() {
    ensure_dive_root
    local cert_file="${DIVE_ROOT}/certs/vault/node1/certificate.pem"

    if [ ! -f "$cert_file" ]; then
        return 0  # No certs = treat as bootstrap needed
    fi

    # Check issuer — bootstrap CA has "Bootstrap" in CN, Vault PKI has "Intermediate"
    if openssl x509 -in "$cert_file" -noout -issuer 2>/dev/null | grep -q "Bootstrap"; then
        return 0
    fi

    return 1
}

##
# Rotate Vault node TLS certificates from bootstrap CA to Vault PKI.
#
# After Vault PKI is initialized (module_vault_pki_setup), this function:
#   1. Creates a "vault-node-services" PKI role in pki_int/
#   2. Issues new certs for each node via Vault PKI Intermediate CA
#   3. Performs rolling restart: one node at a time, verifying cluster health
#
# Prerequisites:
#   - Vault is running and PKI is initialized (pki_int/ exists)
#   - VAULT_TOKEN is set (or .vault-token exists)
#
# Idempotent: skips if node certs already issued by Vault PKI.
#
# Usage: ./dive certs vault-rotate-to-pki  OR  ./dive vault rotate-node-certs
#
# Returns:
#   0 - All nodes rotated (or already on Vault PKI)
#   1 - Failed
##
_rotate_vault_node_certs_to_pki() {
    ensure_dive_root

    # Skip if not in production mode or if already on Vault PKI certs
    if ! _vault_node_certs_are_bootstrap; then
        log_info "Vault node certs already issued by Vault PKI — skipping rotation"
        return 0
    fi

    log_info "Rotating Vault node TLS from bootstrap CA to Vault PKI..."

    local vault_addr="${VAULT_CLI_ADDR:-${VAULT_ADDR:-https://localhost:8200}}"
    local vault_token="${VAULT_TOKEN:-}"

    if [ -z "$vault_token" ] && [ -f "${DIVE_ROOT}/.vault-token" ]; then
        vault_token=$(cat "${DIVE_ROOT}/.vault-token")
    fi

    if [ -z "$vault_token" ]; then
        log_warn "Vault token not available — cannot rotate to PKI (will use bootstrap certs)"
        return 0
    fi

    # Build --cacert flag for bootstrap CA (current TLS cert issuer)
    local cacert_flag
    cacert_flag=$(_vault_curl_cacert_flag)

    # Check that Vault PKI Intermediate CA is available
    local int_ca_check
    # shellcheck disable=SC2086
    int_ca_check=$(curl -sL $cacert_flag -H "X-Vault-Token: $vault_token" \
        "${vault_addr}/v1/pki_int/cert/ca" 2>/dev/null | jq -r '.data.certificate // empty' 2>/dev/null)
    if [ -z "$int_ca_check" ] || ! echo "$int_ca_check" | grep -q "BEGIN CERTIFICATE"; then
        log_warn "Vault PKI Intermediate CA not available — keeping bootstrap certs"
        return 0
    fi

    # Step 1: Create vault-node-services PKI role (idempotent)
    local node_dns_all="vault-1,vault-2,vault-3,dive-hub-vault,localhost"
    log_info "Creating PKI role: vault-node-services..."

    local role_response
    # shellcheck disable=SC2086
    role_response=$(curl -sL $cacert_flag -X POST \
        -H "X-Vault-Token: $vault_token" \
        -H "Content-Type: application/json" \
        -d "{
            \"allowed_domains\": \"$node_dns_all\",
            \"allow_bare_domains\": true,
            \"allow_subdomains\": false,
            \"allow_any_name\": false,
            \"enforce_hostnames\": true,
            \"allow_ip_sans\": true,
            \"allow_localhost\": true,
            \"server_flag\": true,
            \"client_flag\": true,
            \"max_ttl\": \"2160h\",
            \"key_type\": \"rsa\",
            \"key_bits\": 2048,
            \"require_cn\": false
        }" \
        "${vault_addr}/v1/pki_int/roles/vault-node-services" 2>/dev/null)

    local role_errors
    role_errors=$(printf '%s\n' "$role_response" | jq -r '.errors // empty' 2>/dev/null)
    if [ -n "$role_errors" ] && [ "$role_errors" != "null" ] && [ "$role_errors" != "" ]; then
        log_error "Failed to create vault-node-services PKI role: $role_errors"
        return 1
    fi
    log_success "  PKI role: vault-node-services (constrained to vault-1,vault-2,vault-3)"

    # Step 2: Issue new certs for each node
    local vault_certs_dir="${DIVE_ROOT}/certs/vault"
    local nodes=("node1" "node2" "node3")
    local node_containers=("vault-1" "vault-2" "vault-3")
    local i=0

    for node in "${nodes[@]}"; do
        local node_dir="${vault_certs_dir}/${node}"
        local container_name="${node_containers[$i]}"

        log_info "Issuing Vault PKI cert for ${node} (${container_name})..."

        local dns_sans ip_sans
        dns_sans=$(_vault_node_dns_sans "$node")
        ip_sans=$(_vault_node_ip_sans)

        local dns_csv ip_csv
        dns_csv=$(echo "$dns_sans" | tr ' ' ',')
        ip_csv=$(echo "$ip_sans" | tr ' ' ',')

        # Issue cert via Vault PKI
        local response
        # shellcheck disable=SC2086
        response=$(curl -sL $cacert_flag -X POST \
            -H "X-Vault-Token: $vault_token" \
            -H "Content-Type: application/json" \
            -d "{
                \"common_name\": \"${container_name}\",
                \"alt_names\": \"$dns_csv\",
                \"ip_sans\": \"$ip_csv\",
                \"ttl\": \"2160h\",
                \"format\": \"pem\"
            }" \
            "${vault_addr}/v1/pki_int/issue/vault-node-services" 2>/dev/null)

        local errors
        errors=$(printf '%s\n' "$response" | jq -r '.errors // empty' 2>/dev/null)
        if [ -n "$errors" ] && [ "$errors" != "null" ] && [ "$errors" != "" ]; then
            log_error "Failed to issue cert for ${node}: $errors"
            return 1
        fi

        # Extract certificate components
        local certificate private_key issuing_ca ca_chain
        certificate=$(printf '%s\n' "$response" | jq -r '.data.certificate // empty')
        private_key=$(printf '%s\n' "$response" | jq -r '.data.private_key // empty')
        issuing_ca=$(printf '%s\n' "$response" | jq -r '.data.issuing_ca // empty')
        ca_chain=$(printf '%s\n' "$response" | jq -r 'if .data.ca_chain then .data.ca_chain | join("\n") else empty end' 2>/dev/null || true)

        if [ -z "$certificate" ] || [ -z "$private_key" ]; then
            log_error "Vault PKI returned empty cert/key for ${node}"
            return 1
        fi

        # Write cert files (same layout as bootstrap)
        mkdir -p "$node_dir"
        printf '%s\n' "$certificate" > "$node_dir/certificate.pem"
        printf '%s\n' "$private_key" > "$node_dir/key.pem"

        # CA chain for retry_join verification
        {
            printf '%s\n' "$issuing_ca"
            if [ -n "$ca_chain" ] && [ "$ca_chain" != "null" ]; then
                printf '%s\n' "$ca_chain"
            fi
        } > "$node_dir/ca.pem"

        chmod 600 "$node_dir/key.pem"
        chmod 644 "$node_dir/certificate.pem" "$node_dir/ca.pem"

        log_success "  ${node}: Vault PKI cert issued (90-day TTL)"

        i=$((i + 1))
    done

    # Step 3: Rolling restart of Vault nodes
    log_info "Performing rolling restart of Vault nodes..."

    local compose_project="${COMPOSE_PROJECT_NAME:-dive-hub}"

    for node in "${nodes[@]}"; do
        local container_name
        case "$node" in
            node1) container_name="${compose_project}-vault-1" ;;
            node2) container_name="${compose_project}-vault-2" ;;
            node3) container_name="${compose_project}-vault-3" ;;
        esac

        # Check if container is running
        if ! docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
            log_verbose "  ${container_name} not running — skip restart"
            continue
        fi

        log_info "  Restarting ${container_name}..."
        docker restart "$container_name" >/dev/null 2>&1

        # Wait for node to become healthy (up to 30s)
        local wait_time=0
        while [ $wait_time -lt 30 ]; do
            local health
            health=$(docker inspect "$container_name" --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
            if [ "$health" = "healthy" ]; then
                log_success "  ${container_name}: healthy (${wait_time}s)"
                break
            fi
            sleep 2
            wait_time=$((wait_time + 2))
        done

        if [ $wait_time -ge 30 ]; then
            log_warn "  ${container_name}: did not become healthy within 30s (continuing)"
        fi

        # Brief pause between restarts to allow Raft consensus
        sleep 3
    done

    log_success "Vault node TLS rotated to Vault PKI Intermediate CA"
    log_info "  Verify: openssl x509 -in certs/vault/node1/certificate.pem -noout -issuer"
    return 0
}

##
# Generate TLS certificates for Vault HA cluster nodes.
#
# Production mode:  Uses OpenSSL bootstrap CA (no mkcert dependency).
# Dev/local mode:   Uses mkcert (existing behavior).
#
# Output: certs/vault/node{1,2,3}/{certificate.pem, key.pem, ca.pem}
# Idempotent: skips nodes whose certs have >30 days remaining.
#
# Usage: ./dive certs vault-tls-setup  OR  ./dive vault tls-setup
##
generate_vault_node_certs() {
    ensure_dive_root

    local vault_certs_dir="${DIVE_ROOT}/certs/vault"

    # ── Production mode: use OpenSSL bootstrap CA ──
    if is_production_mode; then
        log_info "Production mode: generating Vault node TLS via bootstrap CA..."

        if ! _generate_bootstrap_ca; then
            log_error "Failed to generate bootstrap CA"
            return 1
        fi

        local node nodes=("node1" "node2" "node3")
        local generated=0 skipped=0

        for node in "${nodes[@]}"; do
            local node_dir="${vault_certs_dir}/${node}"
            local cert_file="${node_dir}/certificate.pem"

            # Idempotent: skip if cert exists and has >1 day remaining
            # (bootstrap certs are short-lived; 1 day is the floor)
            if [ -f "$cert_file" ]; then
                local days_left
                days_left=$(_cert_days_remaining "$cert_file")
                if [ "$days_left" -gt 1 ] 2>/dev/null; then
                    log_verbose "Vault ${node} cert valid for ${days_left} days — skipping"
                    skipped=$((skipped + 1))
                    continue
                fi
                log_info "Vault ${node} cert expires in ${days_left} days — regenerating"
            fi

            if _generate_bootstrap_node_cert "$node" "$node_dir"; then
                generated=$((generated + 1))
            else
                return 1
            fi
        done

        echo ""
        log_success "Vault node TLS (bootstrap): ${generated} generated, ${skipped} skipped"
        echo "  Output: ${vault_certs_dir}/node{1,2,3}/"
        echo ""
        return 0
    fi

    # ── Dev / local mode: use mkcert (original behavior) ──
    if ! check_mkcert_ready; then
        log_error "mkcert required for Vault node TLS certificates"
        return 1
    fi

    local mkcert_ca
    mkcert_ca="$(mkcert -CAROOT)/rootCA.pem"

    if [ ! -f "$mkcert_ca" ]; then
        log_error "mkcert Root CA not found at ${mkcert_ca}"
        return 1
    fi

    log_info "Generating TLS certificates for Vault HA cluster nodes (mkcert)..."

    local node nodes=("node1" "node2" "node3")
    local generated=0 skipped=0

    for node in "${nodes[@]}"; do
        local node_dir="${vault_certs_dir}/${node}"
        local cert_file="${node_dir}/certificate.pem"

        # Idempotent: skip if cert exists and has >30 days remaining
        if [ -f "$cert_file" ]; then
            local days_left
            days_left=$(_cert_days_remaining "$cert_file")
            if [ "$days_left" -gt 30 ] 2>/dev/null; then
                log_verbose "Vault ${node} cert valid for ${days_left} days — skipping"
                skipped=$((skipped + 1))
                continue
            fi
            log_info "Vault ${node} cert expires in ${days_left} days — regenerating"
        fi

        mkdir -p "$node_dir"

        # Build SANs for this node (mkcert format: space-separated DNS + IP)
        local sans
        sans=$(_vault_node_cert_sans "$node")

        # Generate cert with mkcert (skip trust store updates)
        # shellcheck disable=SC2086
        if TRUST_STORES="" mkcert -key-file "$node_dir/key.pem" \
                  -cert-file "$node_dir/certificate.pem" \
                  $sans 2>/dev/null; then
            chmod 600 "$node_dir/key.pem"
            chmod 644 "$node_dir/certificate.pem"

            # Copy mkcert Root CA for retry_join TLS verification
            cp "$mkcert_ca" "$node_dir/ca.pem"
            chmod 644 "$node_dir/ca.pem"

            generated=$((generated + 1))
            log_success "Vault ${node}: certificate generated (SANs: ${sans})"
        else
            log_error "Failed to generate certificate for Vault ${node}"
            return 1
        fi
    done

    echo ""
    log_success "Vault node TLS certificates: ${generated} generated, ${skipped} skipped (valid)"
    echo "  Output: ${vault_certs_dir}/node{1,2,3}/"
    echo ""
    return 0
}

##
# Return DNS SANs for a Vault node (no IP addresses).
# Node 1 includes the dive-hub-vault alias (primary entry point).
#
# Arguments:
#   $1 - Node name: node1, node2, or node3
##
_vault_node_dns_sans() {
    local node="${1:?Node name required}"

    case "$node" in
        node1) echo "vault-1 dive-hub-vault localhost" ;;
        node2) echo "vault-2 localhost" ;;
        node3) echo "vault-3 localhost" ;;
        *)     log_error "Unknown vault node: $node"; return 1 ;;
    esac
}

##
# Return IP SANs for Vault nodes (loopback only).
##
_vault_node_ip_sans() {
    echo "127.0.0.1 ::1"
}

##
# Return combined DNS + IP SANs for a Vault node (mkcert format).
# mkcert accepts mixed DNS/IP as space-separated arguments.
#
# Arguments:
#   $1 - Node name: node1, node2, or node3
##
_vault_node_cert_sans() {
    local node="${1:?Node name required}"
    echo "$(_vault_node_dns_sans "$node") $(_vault_node_ip_sans)"
}

##
# Calculate days until a certificate expires.
# Compatible with macOS (LibreSSL) and Linux (OpenSSL).
#
# Arguments:
#   $1 - Path to PEM certificate file
##
_cert_days_remaining() {
    local cert_file="${1:?Certificate path required}"
    local expiry_epoch now_epoch

    expiry_epoch=$(openssl x509 -in "$cert_file" -noout -enddate 2>/dev/null \
        | sed 's/notAfter=//' \
        | xargs -I{} date -j -f "%b %d %T %Y %Z" "{}" "+%s" 2>/dev/null \
        || openssl x509 -in "$cert_file" -noout -enddate 2>/dev/null \
        | sed 's/notAfter=//' \
        | xargs -I{} date -d "{}" "+%s" 2>/dev/null)

    now_epoch=$(date +%s)

    if [ -n "$expiry_epoch" ] && [ -n "$now_epoch" ]; then
        echo $(( (expiry_epoch - now_epoch) / 86400 ))
    else
        echo "0"
    fi
}

# =============================================================================
# CERTIFICATE REVOCATION (CRL)
# =============================================================================
# Revoke certificates via Vault PKI and trigger CRL rebuild.
# Hub policy (pki-hub.hcl) and hub.hcl both grant pki_int/revoke capability.
# =============================================================================

## CRL auto-rotation interval (seconds). Default: 1 hour.
DIVE_CRL_AUTO_ROTATE_INTERVAL="${DIVE_CRL_AUTO_ROTATE_INTERVAL:-3600}"

##
# Extract the serial number from a PEM certificate file.
#
# Arguments:
#   $1 - Path to PEM certificate file
#
# Output:
#   Colon-delimited serial (e.g., 7a:3b:...) on stdout
#
# Returns:
#   0 - Success
#   1 - File not found or parse error
##
_cert_get_serial() {
    local cert_file="${1:?Certificate path required}"

    if [ ! -f "$cert_file" ]; then
        return 1
    fi

    openssl x509 -in "$cert_file" -noout -serial 2>/dev/null \
        | sed 's/serial=//' | tr '[:upper:]' '[:lower:]'
}

##
# Revoke a single certificate by its serial number via Vault PKI.
#
# Arguments:
#   $1 - Certificate serial number (hex, colon-delimited or plain)
#
# Returns:
#   0 - Revoked (or already revoked)
#   1 - Vault unavailable or revocation failed
##
revoke_certificate_by_serial() {
    local serial="${1:?Serial number required}"

    if ! type use_vault_pki &>/dev/null || ! use_vault_pki; then
        log_error "Certificate revocation requires CERT_PROVIDER=vault"
        return 1
    fi

    local vault_addr="${VAULT_CLI_ADDR:-${VAULT_ADDR:-https://localhost:8200}}"
    local vault_token="${VAULT_TOKEN:-}"

    if [ -z "$vault_token" ] && [ -f "${DIVE_ROOT}/.vault-token" ]; then
        vault_token=$(cat "${DIVE_ROOT}/.vault-token")
    fi

    if [ -z "$vault_token" ]; then
        log_error "Vault token not available for revocation"
        return 1
    fi

    log_info "Revoking certificate serial=$serial..."

    local cacert_flag
    cacert_flag=$(_vault_curl_cacert_flag)
    local response
    # shellcheck disable=SC2086
    response=$(curl -sL $cacert_flag -X POST \
        -H "X-Vault-Token: $vault_token" \
        -H "Content-Type: application/json" \
        -d "{\"serial_number\": \"$serial\"}" \
        "${vault_addr}/v1/pki_int/revoke" 2>/dev/null)

    if [ -z "$response" ]; then
        log_error "Vault PKI revoke: empty response"
        return 1
    fi

    local errors
    errors=$(printf '%s\n' "$response" | jq -r '.errors // empty' 2>/dev/null)
    if [ -n "$errors" ] && [ "$errors" != "null" ] && [ "$errors" != "" ]; then
        # "certificate already revoked" is not an error
        if echo "$errors" | grep -qi "already revoked"; then
            log_info "Certificate serial=$serial was already revoked"
            return 0
        fi
        log_error "Vault PKI revoke failed: $errors"
        return 1
    fi

    local revocation_time
    revocation_time=$(printf '%s\n' "$response" | jq -r '.data.revocation_time // empty' 2>/dev/null)
    log_success "Certificate revoked (serial=$serial, time=$revocation_time)"
    return 0
}

##
# Rotate (rebuild) the CRL on the Intermediate CA.
#
# Returns:
#   0 - CRL rotated
#   1 - Failed
##
rotate_crl() {
    local vault_addr="${VAULT_CLI_ADDR:-${VAULT_ADDR:-https://localhost:8200}}"
    local vault_token="${VAULT_TOKEN:-}"

    if [ -z "$vault_token" ] && [ -f "${DIVE_ROOT}/.vault-token" ]; then
        vault_token=$(cat "${DIVE_ROOT}/.vault-token")
    fi

    if [ -z "$vault_token" ]; then
        log_error "Vault token not available for CRL rotation"
        return 1
    fi

    local cacert_flag
    cacert_flag=$(_vault_curl_cacert_flag)
    local response
    # shellcheck disable=SC2086
    response=$(curl -sL $cacert_flag -X GET \
        -H "X-Vault-Token: $vault_token" \
        "${vault_addr}/v1/pki_int/crl/rotate" 2>/dev/null)

    if [ -z "$response" ]; then
        log_error "CRL rotate: empty response"
        return 1
    fi

    local success
    success=$(printf '%s\n' "$response" | jq -r '.data.success // "false"' 2>/dev/null)
    if [ "$success" = "true" ]; then
        log_success "CRL rotated on Intermediate CA (pki_int/)"
        return 0
    else
        log_warn "CRL rotation returned unexpected response"
        return 1
    fi
}

##
# Revoke a spoke's current certificate and trigger CRL rebuild.
#
# Reads the spoke's certificate.pem, extracts its serial number,
# revokes it in Vault, and rotates the CRL.
#
# Arguments:
#   $1 - Spoke code (e.g., fra, deu, gbr)
#
# Returns:
#   0 - Certificate revoked and CRL rebuilt
#   1 - Failed
##
revoke_spoke_certificates() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower
    code_lower=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")

    ensure_dive_root
    local cert_file="${DIVE_ROOT}/instances/${code_lower}/certs/certificate.pem"

    if [ ! -f "$cert_file" ]; then
        log_warn "No certificate found for spoke ${code_upper} at $cert_file"
        return 0
    fi

    # Verify cert was issued by Vault (not mkcert — mkcert certs can't be revoked via Vault)
    if ! openssl x509 -in "$cert_file" -noout -issuer 2>/dev/null | grep -q "DIVE V3"; then
        log_warn "Spoke ${code_upper} certificate was not issued by Vault PKI — skipping revocation"
        return 0
    fi

    local serial
    serial=$(_cert_get_serial "$cert_file")
    if [ -z "$serial" ]; then
        log_error "Failed to extract serial from ${cert_file}"
        return 1
    fi

    log_step "Revoking certificate for spoke ${code_upper} (serial=${serial})..."

    if revoke_certificate_by_serial "$serial"; then
        # Trigger CRL rebuild so revocation takes effect
        rotate_crl

        # Distribute updated CRL to instances
        _distribute_crl

        log_success "Spoke ${code_upper} certificate revoked and CRL updated"
        return 0
    else
        log_error "Failed to revoke certificate for spoke ${code_upper}"
        return 1
    fi
}

##
# Revoke the hub's current certificate and trigger CRL rebuild.
#
# Returns:
#   0 - Certificate revoked and CRL rebuilt
#   1 - Failed
##
revoke_hub_certificate() {
    ensure_dive_root
    local cert_file="${DIVE_ROOT}/instances/hub/certs/certificate.pem"

    if [ ! -f "$cert_file" ]; then
        log_warn "No hub certificate found at $cert_file"
        return 0
    fi

    if ! openssl x509 -in "$cert_file" -noout -issuer 2>/dev/null | grep -q "DIVE V3"; then
        log_warn "Hub certificate was not issued by Vault PKI — skipping revocation"
        return 0
    fi

    local serial
    serial=$(_cert_get_serial "$cert_file")
    if [ -z "$serial" ]; then
        log_error "Failed to extract serial from hub certificate"
        return 1
    fi

    log_step "Revoking hub certificate (serial=${serial})..."

    if revoke_certificate_by_serial "$serial"; then
        rotate_crl
        _distribute_crl
        log_success "Hub certificate revoked and CRL updated"
        return 0
    else
        log_error "Failed to revoke hub certificate"
        return 1
    fi
}

##
# Download the current CRL from Vault and distribute to instance directories.
#
# CRL is fetched in PEM format and written to:
#   - instances/hub/certs/ca/crl.pem
#   - instances/{spoke}/certs/ca/crl.pem (for each deployed spoke)
#
# Services can optionally validate certificates against this CRL.
##
_distribute_crl() {
    ensure_dive_root
    local vault_addr="${VAULT_CLI_ADDR:-${VAULT_ADDR:-https://localhost:8200}}"

    # Fetch CRL in PEM format from Vault
    local cacert_flag
    cacert_flag=$(_vault_curl_cacert_flag)
    local crl_pem
    # shellcheck disable=SC2086
    crl_pem=$(curl -sL $cacert_flag "${vault_addr}/v1/pki_int/crl/pem" 2>/dev/null)

    if [ -z "$crl_pem" ] || ! echo "$crl_pem" | grep -q "BEGIN X509 CRL"; then
        log_verbose "CRL not available or empty (Vault may not have issued/revoked any certificates yet)"
        return 0
    fi

    local distributed=0

    # Hub
    local hub_crl_dir="${DIVE_ROOT}/instances/hub/certs/ca"
    if [ -d "${DIVE_ROOT}/instances/hub/certs" ]; then
        mkdir -p "$hub_crl_dir"
        printf '%s\n' "$crl_pem" > "$hub_crl_dir/crl.pem"
        chmod 644 "$hub_crl_dir/crl.pem"
        distributed=$((distributed + 1))
    fi

    # Spokes
    local spoke_list="${DIVE_SPOKE_LIST:-gbr fra deu can}"
    local code
    for code in $spoke_list; do
        local spoke_crl_dir="${DIVE_ROOT}/instances/${code}/certs/ca"
        if [ -d "${DIVE_ROOT}/instances/${code}/certs" ]; then
            mkdir -p "$spoke_crl_dir"
            printf '%s\n' "$crl_pem" > "$spoke_crl_dir/crl.pem"
            chmod 644 "$spoke_crl_dir/crl.pem"
            distributed=$((distributed + 1))
        fi
    done

    if [ "$distributed" -gt 0 ]; then
        log_verbose "CRL distributed to ${distributed} instance(s)"
    fi
}

##
# Show CRL status: list revoked certificate serial numbers and metadata.
#
# Output: Human-readable table of revoked certificates.
##
show_crl_status() {
    ensure_dive_root
    local vault_addr="${VAULT_CLI_ADDR:-${VAULT_ADDR:-https://localhost:8200}}"
    local vault_token="${VAULT_TOKEN:-}"

    if [ -z "$vault_token" ] && [ -f "${DIVE_ROOT}/.vault-token" ]; then
        vault_token=$(cat "${DIVE_ROOT}/.vault-token")
    fi

    echo ""
    echo -e "${BOLD}Certificate Revocation List (CRL) Status${NC}"
    echo ""

    # Check Vault PKI availability
    if [ -z "$vault_token" ]; then
        log_error "Vault token not available"
        return 1
    fi

    # Fetch CRL info
    local cacert_flag
    cacert_flag=$(_vault_curl_cacert_flag)
    local crl_pem
    # shellcheck disable=SC2086
    crl_pem=$(curl -sL $cacert_flag "${vault_addr}/v1/pki_int/crl/pem" 2>/dev/null)

    if [ -z "$crl_pem" ] || ! echo "$crl_pem" | grep -q "BEGIN X509 CRL"; then
        echo "  CRL: Not yet generated (no certificates revoked)"
        echo ""
        # Show certificate inventory instead
        _show_cert_inventory
        return 0
    fi

    # Parse CRL with openssl
    local crl_info
    crl_info=$(echo "$crl_pem" | openssl crl -noout -text 2>/dev/null)

    local issuer last_update next_update
    issuer=$(echo "$crl_info" | grep "Issuer:" | sed 's/.*Issuer: //' | head -1)
    last_update=$(echo "$crl_info" | grep "Last Update:" | sed 's/.*Last Update: //')
    next_update=$(echo "$crl_info" | grep "Next Update:" | sed 's/.*Next Update: //')

    echo "  Issuer:       $issuer"
    echo "  Last Update:  $last_update"
    echo "  Next Update:  $next_update"
    echo ""

    # Count revoked certs
    local revoked_count
    revoked_count=$(echo "$crl_info" | grep -c "Serial Number:" 2>/dev/null || true)
    revoked_count="${revoked_count:-0}"
    revoked_count=$(echo "$revoked_count" | head -1 | tr -d '[:space:]')
    echo "  Revoked Certificates: ${revoked_count}"

    if [ "$revoked_count" -gt 0 ] 2>/dev/null; then
        echo ""
        echo "  Serial Numbers:"
        echo "$crl_info" | grep "Serial Number:" | while read -r line; do
            local serial
            serial=$(echo "$line" | sed 's/.*Serial Number: //')
            echo "    - $serial"
        done
    fi

    echo ""

    # Show current certificate inventory
    _show_cert_inventory
}

##
# Print a summary of currently deployed certificates across all instances.
##
_show_cert_inventory() {
    ensure_dive_root

    echo -e "${BOLD}Certificate Inventory:${NC}"
    echo ""
    printf "  %-8s %-14s %-12s %-44s %s\n" "Instance" "Issuer" "Days Left" "Serial" "Status"
    printf "  %-8s %-14s %-12s %-44s %s\n" "--------" "--------------" "---------" "--------------------------------------------" "------"

    # Hub
    local hub_cert="${DIVE_ROOT}/instances/hub/certs/certificate.pem"
    if [ -f "$hub_cert" ]; then
        _print_cert_row "hub" "$hub_cert"
    fi

    # Spokes
    local spoke_list="${DIVE_SPOKE_LIST:-gbr fra deu can}"
    local code
    for code in $spoke_list; do
        local spoke_cert="${DIVE_ROOT}/instances/${code}/certs/certificate.pem"
        if [ -f "$spoke_cert" ]; then
            _print_cert_row "$code" "$spoke_cert"
        fi
    done

    echo ""
}

##
# Print one row of the certificate inventory table.
#
# Arguments:
#   $1 - Instance name (hub, fra, deu, etc.)
#   $2 - Path to certificate.pem
##
_print_cert_row() {
    local instance="$1"
    local cert_file="$2"

    local issuer_short serial days_left status

    # Issuer (truncated)
    if openssl x509 -in "$cert_file" -noout -issuer 2>/dev/null | grep -q "DIVE V3"; then
        issuer_short="Vault PKI"
    elif openssl x509 -in "$cert_file" -noout -issuer 2>/dev/null | grep -q "mkcert"; then
        issuer_short="mkcert"
    else
        issuer_short="unknown"
    fi

    # Serial
    serial=$(_cert_get_serial "$cert_file" 2>/dev/null || echo "n/a")
    # Truncate long serials for display
    if [ "${#serial}" -gt 44 ]; then
        serial="${serial:0:41}..."
    fi

    # Days remaining
    days_left=$(_cert_days_remaining "$cert_file" 2>/dev/null || echo "?")

    # Status
    if [ "$days_left" = "?" ] || [ "$days_left" -le 0 ] 2>/dev/null; then
        status="${RED}EXPIRED${NC}"
    elif [ "$days_left" -lt 14 ] 2>/dev/null; then
        status="${YELLOW}EXPIRING${NC}"
    else
        status="${GREEN}OK${NC}"
    fi

    printf "  %-8s %-14s %-12s %-44s " "$instance" "$issuer_short" "${days_left}d"  "$serial"
    echo -e "$status"
}

# =============================================================================
# EMERGENCY CERTIFICATE ROTATION (Phase 6)
# =============================================================================

##
# Emergency certificate rotation — revoke + reissue + restart containers.
#
# Usage:
#   ./dive certs emergency-rotate hub [--force]
#   ./dive certs emergency-rotate spoke DEU [--force]
#   ./dive certs emergency-rotate all [--force]
#
# --force: Skip confirmation prompt and 30-day-remaining check.
#
# Arguments:
#   $1 - Target: "hub", "spoke", or "all"
#   $2 - Spoke code (if $1 = "spoke")
#   --force flag optional
##
cert_emergency_rotate() {
    ensure_dive_root
    local target="${1:-}"
    local spoke_code="${2:-}"
    local force=false

    if [ -z "$target" ]; then
        log_error "Usage: ./dive certs emergency-rotate <hub|spoke|all> [CODE] [--force]"
        return 1
    fi

    # Parse --force from any position
    for arg in "$@"; do
        [ "$arg" = "--force" ] && force=true
    done

    # Remove --force from spoke_code if it leaked in
    [ "$spoke_code" = "--force" ] && spoke_code=""

    local vault_addr="${VAULT_CLI_ADDR:-${VAULT_ADDR:-https://localhost:8200}}"
    local vault_token="${VAULT_TOKEN:-}"
    if [ -z "$vault_token" ] && [ -f "${DIVE_ROOT}/.vault-token" ]; then
        vault_token=$(cat "${DIVE_ROOT}/.vault-token")
        export VAULT_TOKEN="$vault_token"
    fi

    if [ -z "$vault_token" ]; then
        log_error "Vault token not available — run: ./dive vault init"
        return 1
    fi

    local audit_log="${DIVE_ROOT}/logs/vault/emergency-rotation.log"
    mkdir -p "$(dirname "$audit_log")"

    _emergency_audit() {
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$audit_log"
    }

    echo ""
    log_info "==================================================================="
    log_info "  EMERGENCY CERTIFICATE ROTATION"
    log_info "  Target: ${target} ${spoke_code}"
    log_info "==================================================================="

    if [ "$force" != true ]; then
        echo ""
        log_warn "This will REVOKE and REISSUE certificates, then restart containers."
        log_warn "Services will be briefly unavailable during rotation."
        echo ""
        read -rp "Type 'ROTATE' to confirm: " confirm
        if [ "$confirm" != "ROTATE" ]; then
            log_info "Aborted"
            return 0
        fi
    fi

    local rotated=0 failed=0

    case "$target" in
        hub)
            _emergency_rotate_hub "$force" && rotated=$((rotated + 1)) || failed=$((failed + 1))
            ;;
        spoke)
            if [ -z "$spoke_code" ]; then
                log_error "Spoke code required: ./dive certs emergency-rotate spoke DEU"
                return 1
            fi
            _emergency_rotate_spoke "$spoke_code" "$force" && rotated=$((rotated + 1)) || failed=$((failed + 1))
            ;;
        all)
            # Hub first
            _emergency_rotate_hub "$force" && rotated=$((rotated + 1)) || failed=$((failed + 1))

            # Then all spokes
            local spoke_list="${DIVE_SPOKE_LIST:-}"
            if [ -z "$spoke_list" ] && type _get_provisioned_spokes &>/dev/null; then
                spoke_list=$(_get_provisioned_spokes)
            fi
            [ -z "$spoke_list" ] && spoke_list="gbr fra deu can"

            for code in $spoke_list; do
                _emergency_rotate_spoke "$code" "$force" && rotated=$((rotated + 1)) || failed=$((failed + 1))
            done
            ;;
        *)
            log_error "Unknown target: $target (use hub, spoke, or all)"
            return 1
            ;;
    esac

    echo ""
    log_info "==================================================================="
    log_info "  Emergency Rotation Complete"
    log_info "  Rotated: $rotated  |  Failed: $failed"
    log_info "  Audit log: $audit_log"
    log_info "==================================================================="

    # Export updated metrics
    _cert_metrics_export 2>/dev/null || true

    [ $failed -gt 0 ] && return 1
    return 0
}

##
# Internal: Emergency rotate hub certificate.
##
_emergency_rotate_hub() {
    local force="${1:-false}"
    local cert_file="${DIVE_ROOT}/instances/hub/certs/certificate.pem"

    log_info "Rotating hub certificate..."

    local old_serial="none"
    if [ -f "$cert_file" ]; then
        old_serial=$(_cert_get_serial "$cert_file" 2>/dev/null || echo "unknown")

        # Check if rotation is needed (skip if >30d remaining and not forced)
        if [ "$force" != "true" ]; then
            local days_left
            days_left=$(_cert_days_remaining "$cert_file" 2>/dev/null || echo "0")
            if [ "$days_left" -gt 30 ] 2>/dev/null; then
                log_info "  Hub cert has ${days_left}d remaining — skipping (use --force to override)"
                return 0
            fi
        fi

        # Revoke current cert
        revoke_hub_certificate 2>/dev/null || log_warn "  Revocation failed (cert may not be Vault-issued)"
    fi

    # Issue new certificate
    # Temporarily bypass the "skip if valid" check in generate_hub_certificate_vault
    rm -f "$cert_file" 2>/dev/null || true

    if generate_hub_certificate_vault; then
        local new_serial
        new_serial=$(_cert_get_serial "$cert_file" 2>/dev/null || echo "unknown")
        _emergency_audit "HUB_ROTATED old_serial=${old_serial} new_serial=${new_serial}"
        log_success "  Hub cert rotated: ${old_serial} -> ${new_serial}"

        # Restart hub services
        log_info "  Restarting hub containers..."
        docker compose -f "${DIVE_ROOT}/docker-compose.hub.yml" restart \
            dive-hub-keycloak dive-hub-backend dive-hub-frontend 2>/dev/null || \
            log_warn "  Container restart failed (may need manual restart)"

        return 0
    else
        _emergency_audit "HUB_ROTATION_FAILED old_serial=${old_serial}"
        log_error "  Hub cert rotation failed"
        return 1
    fi
}

##
# Internal: Emergency rotate a spoke certificate.
##
_emergency_rotate_spoke() {
    local spoke_code="${1:?spoke code required}"
    local force="${2:-false}"
    local code_lower
    code_lower=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")
    local cert_file="${DIVE_ROOT}/instances/${code_lower}/certs/certificate.pem"

    log_info "Rotating spoke ${code_upper} certificate..."

    local old_serial="none"
    if [ -f "$cert_file" ]; then
        old_serial=$(_cert_get_serial "$cert_file" 2>/dev/null || echo "unknown")

        if [ "$force" != "true" ]; then
            local days_left
            days_left=$(_cert_days_remaining "$cert_file" 2>/dev/null || echo "0")
            if [ "$days_left" -gt 30 ] 2>/dev/null; then
                log_info "  ${code_upper} cert has ${days_left}d remaining — skipping (use --force to override)"
                return 0
            fi
        fi

        # Revoke current cert
        revoke_spoke_certificates "$code_lower" 2>/dev/null || log_warn "  Revocation failed (cert may not be Vault-issued)"
    fi

    # Issue new certificate
    rm -f "$cert_file" 2>/dev/null || true

    if generate_spoke_certificate_vault "$code_lower"; then
        local new_serial
        new_serial=$(_cert_get_serial "$cert_file" 2>/dev/null || echo "unknown")
        _emergency_audit "SPOKE_ROTATED spoke=${code_lower} old_serial=${old_serial} new_serial=${new_serial}"
        log_success "  ${code_upper} cert rotated: ${old_serial} -> ${new_serial}"

        # Restart spoke services
        local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
        if [ -f "$spoke_dir/docker-compose.yml" ]; then
            log_info "  Restarting ${code_upper} containers..."
            docker compose -f "$spoke_dir/docker-compose.yml" restart 2>/dev/null || \
                log_warn "  Container restart failed (may need manual restart)"
        fi

        return 0
    else
        _emergency_audit "SPOKE_ROTATION_FAILED spoke=${code_lower} old_serial=${old_serial}"
        log_error "  ${code_upper} cert rotation failed"
        return 1
    fi
}

# =============================================================================
# CERTIFICATE MONITORING & METRICS (Phase 5)
# =============================================================================

##
# Export certificate metrics in Prometheus textfile collector format.
#
# Writes metrics for all hub + spoke instance certificates, plus CA certs.
# Uses atomic .tmp → mv pattern for safe concurrent reads.
#
# Metrics:
#   dive_cert_expiry_seconds{instance,issuer}  - seconds until cert expires
#   dive_cert_is_vault_pki{instance}           - 1 if Vault PKI, 0 if mkcert
#   dive_pki_root_ca_expiry_seconds            - seconds until Root CA expires
#   dive_pki_intermediate_ca_expiry_seconds    - seconds until Intermediate CA expires
##
_cert_metrics_export() {
    ensure_dive_root
    local metrics_dir="${DIVE_ROOT}/monitoring/textfile"
    mkdir -p "$metrics_dir"
    local prom_file="${metrics_dir}/cert_expiry.prom"
    local now_epoch
    now_epoch=$(date +%s)

    {
        echo "# DIVE V3 Certificate Metrics"
        echo "# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        echo ""
        echo "# HELP dive_cert_expiry_seconds Seconds until service certificate expires"
        echo "# TYPE dive_cert_expiry_seconds gauge"

        # Hub cert
        local hub_cert="${DIVE_ROOT}/instances/hub/certs/certificate.pem"
        if [ -f "$hub_cert" ]; then
            local days issuer_label
            days=$(_cert_days_remaining "$hub_cert" 2>/dev/null || echo "0")
            issuer_label=$(_cert_issuer_label "$hub_cert")
            echo "dive_cert_expiry_seconds{instance=\"hub\",issuer=\"${issuer_label}\"} $((days * 86400))"
        fi

        # Spoke certs
        local spoke_list="${DIVE_SPOKE_LIST:-}"
        if [ -z "$spoke_list" ] && type _get_provisioned_spokes &>/dev/null; then
            spoke_list=$(_get_provisioned_spokes)
        fi
        [ -z "$spoke_list" ] && spoke_list="gbr fra deu can"

        local code
        for code in $spoke_list; do
            local cert="${DIVE_ROOT}/instances/${code}/certs/certificate.pem"
            if [ -f "$cert" ]; then
                local days issuer_label
                days=$(_cert_days_remaining "$cert" 2>/dev/null || echo "0")
                issuer_label=$(_cert_issuer_label "$cert")
                echo "dive_cert_expiry_seconds{instance=\"${code}\",issuer=\"${issuer_label}\"} $((days * 86400))"
            fi
        done

        # Vault node certs
        local node
        for node in 1 2 3; do
            local node_cert="${DIVE_ROOT}/certs/vault/node${node}/certificate.pem"
            if [ -f "$node_cert" ]; then
                local days issuer_label
                days=$(_cert_days_remaining "$node_cert" 2>/dev/null || echo "0")
                issuer_label=$(_cert_issuer_label "$node_cert")
                echo "dive_cert_expiry_seconds{instance=\"vault-${node}\",issuer=\"${issuer_label}\"} $((days * 86400))"
            fi
        done

        echo ""
        echo "# HELP dive_cert_is_vault_pki Whether certificate was issued by Vault PKI (1) or mkcert (0)"
        echo "# TYPE dive_cert_is_vault_pki gauge"

        # Hub
        if [ -f "$hub_cert" ]; then
            local is_vault=0
            [ "$(_cert_issuer_label "$hub_cert")" = "vault-pki" ] && is_vault=1
            echo "dive_cert_is_vault_pki{instance=\"hub\"} ${is_vault}"
        fi
        for code in $spoke_list; do
            local cert="${DIVE_ROOT}/instances/${code}/certs/certificate.pem"
            if [ -f "$cert" ]; then
                local is_vault=0
                [ "$(_cert_issuer_label "$cert")" = "vault-pki" ] && is_vault=1
                echo "dive_cert_is_vault_pki{instance=\"${code}\"} ${is_vault}"
            fi
        done

        # CA certs (if Vault PKI is available)
        echo ""
        echo "# HELP dive_pki_root_ca_expiry_seconds Seconds until Root CA certificate expires"
        echo "# TYPE dive_pki_root_ca_expiry_seconds gauge"
        echo "# HELP dive_pki_intermediate_ca_expiry_seconds Seconds until Intermediate CA certificate expires"
        echo "# TYPE dive_pki_intermediate_ca_expiry_seconds gauge"

        local vault_addr="${VAULT_CLI_ADDR:-${VAULT_ADDR:-https://localhost:8200}}"
        local vault_token="${VAULT_TOKEN:-}"
        if [ -z "$vault_token" ] && [ -f "${DIVE_ROOT}/.vault-token" ]; then
            vault_token=$(cat "${DIVE_ROOT}/.vault-token")
        fi

        if [ -n "$vault_token" ]; then
            local cacert_flag
            cacert_flag=$(_vault_curl_cacert_flag 2>/dev/null || true)

            # Root CA
            local root_ca_pem
            # shellcheck disable=SC2086
            root_ca_pem=$(curl -sL $cacert_flag -H "X-Vault-Token: ${vault_token}" \
                "${vault_addr}/v1/pki/cert/ca" 2>/dev/null | jq -r '.data.certificate // empty' 2>/dev/null)
            if [ -n "$root_ca_pem" ]; then
                local root_expiry
                root_expiry=$(echo "$root_ca_pem" | openssl x509 -noout -enddate 2>/dev/null | sed 's/notAfter=//')
                if [ -n "$root_expiry" ]; then
                    local root_epoch
                    if date -j >/dev/null 2>&1; then
                        root_epoch=$(date -j -f "%b %d %H:%M:%S %Y %Z" "$root_expiry" "+%s" 2>/dev/null || echo "0")
                    else
                        root_epoch=$(date -d "$root_expiry" "+%s" 2>/dev/null || echo "0")
                    fi
                    [ "$root_epoch" -gt 0 ] && echo "dive_pki_root_ca_expiry_seconds $((root_epoch - now_epoch))"
                fi
            fi

            # Intermediate CA
            local int_ca_pem
            # shellcheck disable=SC2086
            int_ca_pem=$(curl -sL $cacert_flag -H "X-Vault-Token: ${vault_token}" \
                "${vault_addr}/v1/pki_int/cert/ca" 2>/dev/null | jq -r '.data.certificate // empty' 2>/dev/null)
            if [ -n "$int_ca_pem" ]; then
                local int_expiry
                int_expiry=$(echo "$int_ca_pem" | openssl x509 -noout -enddate 2>/dev/null | sed 's/notAfter=//')
                if [ -n "$int_expiry" ]; then
                    local int_epoch
                    if date -j >/dev/null 2>&1; then
                        int_epoch=$(date -j -f "%b %d %H:%M:%S %Y %Z" "$int_expiry" "+%s" 2>/dev/null || echo "0")
                    else
                        int_epoch=$(date -d "$int_expiry" "+%s" 2>/dev/null || echo "0")
                    fi
                    [ "$int_epoch" -gt 0 ] && echo "dive_pki_intermediate_ca_expiry_seconds $((int_epoch - now_epoch))"
                fi
            fi
        fi

    } > "${prom_file}.tmp"

    mv "${prom_file}.tmp" "$prom_file"
    log_verbose "Certificate metrics written to ${prom_file}"
}

##
# Helper: Determine certificate issuer label for metrics.
# Returns "vault-pki", "mkcert", or "unknown".
##
_cert_issuer_label() {
    local cert_file="$1"
    if openssl x509 -in "$cert_file" -noout -issuer 2>/dev/null | grep -q "DIVE V3"; then
        echo "vault-pki"
    elif openssl x509 -in "$cert_file" -noout -issuer 2>/dev/null | grep -q "mkcert"; then
        echo "mkcert"
    elif openssl x509 -in "$cert_file" -noout -issuer 2>/dev/null | grep -q "Bootstrap"; then
        echo "bootstrap"
    else
        echo "unknown"
    fi
}

##
# Print a comprehensive certificate status report.
#
# Shows: hub + all spokes + Vault node certs + Root CA + Intermediate CA
# Colorized: green (>30d), yellow (14-30d), red (<14d), bold red (expired)
#
# Usage: ./dive certs status
##
cert_status_report() {
    ensure_dive_root

    echo ""
    echo -e "${BOLD}DIVE V3 Certificate Status Report${NC}"
    echo -e "${BOLD}$(date -u +"%Y-%m-%d %H:%M:%S UTC")${NC}"
    echo ""

    printf "  %-12s %-14s %-44s %-10s %-12s %s\n" \
        "Instance" "Issuer" "Serial" "Days Left" "Expiry" "Status"
    printf "  %-12s %-14s %-44s %-10s %-12s %s\n" \
        "------------" "--------------" "--------------------------------------------" "----------" "------------" "------"

    # Hub
    _cert_status_row "hub" "${DIVE_ROOT}/instances/hub/certs/certificate.pem"

    # Spokes
    local spoke_list="${DIVE_SPOKE_LIST:-}"
    if [ -z "$spoke_list" ] && type _get_provisioned_spokes &>/dev/null; then
        spoke_list=$(_get_provisioned_spokes)
    fi
    [ -z "$spoke_list" ] && spoke_list="gbr fra deu can"

    local code
    for code in $spoke_list; do
        _cert_status_row "$code" "${DIVE_ROOT}/instances/${code}/certs/certificate.pem"
    done

    # Vault node certs
    local node
    for node in 1 2 3; do
        _cert_status_row "vault-${node}" "${DIVE_ROOT}/certs/vault/node${node}/certificate.pem"
    done

    echo ""

    # CA certificates (if Vault available)
    local vault_addr="${VAULT_CLI_ADDR:-${VAULT_ADDR:-https://localhost:8200}}"
    local vault_token="${VAULT_TOKEN:-}"
    if [ -z "$vault_token" ] && [ -f "${DIVE_ROOT}/.vault-token" ]; then
        vault_token=$(cat "${DIVE_ROOT}/.vault-token")
    fi

    if [ -n "$vault_token" ]; then
        echo -e "  ${BOLD}CA Certificates:${NC}"
        local cacert_flag
        cacert_flag=$(_vault_curl_cacert_flag 2>/dev/null || true)

        # Root CA
        local root_pem
        # shellcheck disable=SC2086
        root_pem=$(curl -sL $cacert_flag -H "X-Vault-Token: ${vault_token}" \
            "${vault_addr}/v1/pki/cert/ca" 2>/dev/null | jq -r '.data.certificate // empty' 2>/dev/null)
        if [ -n "$root_pem" ]; then
            local root_days root_expiry_str
            root_expiry_str=$(echo "$root_pem" | openssl x509 -noout -enddate 2>/dev/null | sed 's/notAfter=//')
            local tmp_root
            tmp_root=$(mktemp)
            echo "$root_pem" > "$tmp_root"
            root_days=$(_cert_days_remaining "$tmp_root" 2>/dev/null || echo "?")
            rm -f "$tmp_root"
            local ca_status="${GREEN}OK${NC}"
            if [ "$root_days" != "?" ] && [ "$root_days" -lt 90 ] 2>/dev/null; then
                ca_status="${YELLOW}EXPIRING${NC}"
            fi
            printf "  %-12s %-14s %-10s " "Root CA" "Self-signed" "${root_days}d"
            echo -e "$ca_status"
        fi

        # Intermediate CA
        local int_pem
        # shellcheck disable=SC2086
        int_pem=$(curl -sL $cacert_flag -H "X-Vault-Token: ${vault_token}" \
            "${vault_addr}/v1/pki_int/cert/ca" 2>/dev/null | jq -r '.data.certificate // empty' 2>/dev/null)
        if [ -n "$int_pem" ]; then
            local int_days
            local tmp_int
            tmp_int=$(mktemp)
            echo "$int_pem" > "$tmp_int"
            int_days=$(_cert_days_remaining "$tmp_int" 2>/dev/null || echo "?")
            rm -f "$tmp_int"
            local int_status="${GREEN}OK${NC}"
            if [ "$int_days" != "?" ] && [ "$int_days" -lt 90 ] 2>/dev/null; then
                int_status="${YELLOW}EXPIRING${NC}"
            fi
            printf "  %-12s %-14s %-10s " "Interm. CA" "Root CA" "${int_days}d"
            echo -e "$int_status"
        fi
        echo ""
    fi

    # Export metrics if called interactively
    _cert_metrics_export 2>/dev/null || true
}

##
# Print one row for the status report.
##
_cert_status_row() {
    local instance="$1"
    local cert_file="$2"

    if [ ! -f "$cert_file" ]; then
        return 0
    fi

    local issuer_short serial days_left expiry_date status_label

    # Issuer
    issuer_short=$(_cert_issuer_label "$cert_file")
    case "$issuer_short" in
        vault-pki) issuer_short="Vault PKI" ;;
        bootstrap) issuer_short="Bootstrap CA" ;;
        mkcert)    issuer_short="mkcert" ;;
        *)         issuer_short="unknown" ;;
    esac

    # Serial
    serial=$(_cert_get_serial "$cert_file" 2>/dev/null || echo "n/a")
    [ "${#serial}" -gt 44 ] && serial="${serial:0:41}..."

    # Days remaining
    days_left=$(_cert_days_remaining "$cert_file" 2>/dev/null || echo "?")

    # Expiry date (short)
    expiry_date=$(openssl x509 -in "$cert_file" -noout -enddate 2>/dev/null \
        | sed 's/notAfter=//' | cut -d' ' -f1-3 || echo "?")

    # Status with color
    if [ "$days_left" = "?" ] || { [ "$days_left" -le 0 ] 2>/dev/null; }; then
        status_label="${RED}${BOLD}EXPIRED${NC}"
    elif [ "$days_left" -lt 14 ] 2>/dev/null; then
        status_label="${RED}CRITICAL${NC}"
    elif [ "$days_left" -lt 30 ] 2>/dev/null; then
        status_label="${YELLOW}WARNING${NC}"
    else
        status_label="${GREEN}OK${NC}"
    fi

    printf "  %-12s %-14s %-44s %-10s %-12s " "$instance" "$issuer_short" "$serial" "${days_left}d" "$expiry_date"
    echo -e "$status_label"
}

# =============================================================================
# OPERATIONAL RUNBOOKS (Phase 6)
# =============================================================================

##
# Print operational runbook for a given emergency scenario.
#
# Usage: ./dive certs runbook <scenario>
# Scenarios: compromised-spoke-key, compromised-intermediate-ca,
#            compromised-root-ca, vault-cluster-failure
##
_cert_runbook() {
    local scenario="${1:-}"

    case "$scenario" in
        compromised-spoke-key)
            cat <<'RUNBOOK'
=============================================================================
  RUNBOOK: Compromised Spoke Key
=============================================================================

  Scenario: A spoke's TLS private key has been compromised.

  Impact: Attacker can impersonate the spoke, intercept MTLS traffic.

  Steps:
    1. IMMEDIATELY revoke the compromised certificate:
         ./dive certs revoke <SPOKE_CODE>

    2. Refresh the spoke's Vault AppRole SecretID:
         ./dive vault refresh-credentials <SPOKE_CODE>

    3. Emergency rotate the spoke certificate:
         ./dive certs emergency-rotate spoke <SPOKE_CODE> --force

    4. Verify the new certificate is active:
         ./dive certs status

    5. Check CRL distribution:
         ./dive certs crl-status

    6. Monitor for any authentication failures:
         docker logs dive-spoke-<code>-keycloak 2>&1 | grep -i "ssl\|tls\|cert"

    7. If the spoke was used for federation, notify other spoke operators
       and verify federation health:
         ./dive federation health

  Time to resolve: ~2 minutes (automated), ~10 minutes (with verification)

=============================================================================
RUNBOOK
            ;;
        compromised-intermediate-ca)
            cat <<'RUNBOOK'
=============================================================================
  RUNBOOK: Compromised Intermediate CA
=============================================================================

  Scenario: The Intermediate CA private key has been compromised.

  Impact: Attacker can issue certificates for ANY service. ALL certs are suspect.

  Steps:
    1. IMMEDIATELY backup current state:
         ./dive vault backup-pki

    2. Rekey the Intermediate CA (generates new key pair + re-issues all certs):
         ./dive vault rekey-intermediate --confirm

       This will:
       - Generate a new Intermediate CA key pair
       - Sign it with the Root CA
       - Revoke and re-issue ALL service certificates
       - Restart ALL services

    3. Verify all certificates are re-issued:
         ./dive certs status

    4. Verify CRL contains all old certificates:
         ./dive certs crl-status

    5. If Vault AppRoles may be compromised:
         ./dive vault refresh-credentials all

    6. Rotate all KV secrets as well (belt-and-suspenders):
         ./dive vault rotate all

    7. Review Vault audit logs for unauthorized certificate issuance:
         ls -la logs/vault/

  Time to resolve: ~5 minutes (automated), ~30 minutes (with full verification)

=============================================================================
RUNBOOK
            ;;
        compromised-root-ca)
            cat <<'RUNBOOK'
=============================================================================
  RUNBOOK: Compromised Root CA
=============================================================================

  Scenario: The Root CA private key has been compromised.

  Impact: TOTAL COMPROMISE — attacker can issue any certificate, including new
          Intermediate CAs. Trust in the entire PKI hierarchy is destroyed.

  THIS REQUIRES MANUAL INTERVENTION — there is no automated recovery.

  Steps:
    1. STOP ALL SERVICES immediately:
         ./dive nuke

    2. Backup current Vault state:
         ./dive vault backup-pki

    3. Destroy the Vault cluster data:
         docker volume rm dive-v3_vault-1-data dive-v3_vault-2-data dive-v3_vault-3-data

    4. Re-initialize Vault:
         ./dive vault init
         ./dive vault setup

    5. Re-create PKI hierarchy with new Root CA:
         ./dive vault pki-setup

    6. Re-provision all spokes:
         ./dive vault seed
         ./dive vault provision DEU
         ./dive vault provision FRA
         (repeat for all spokes)

    7. Generate new TLS certificates for Vault nodes:
         ./dive vault tls-setup

    8. Redeploy everything:
         ./dive hub deploy
         ./dive spoke deploy DEU
         (repeat for all spokes)

    9. Update any external trust stores that had the old Root CA:
         ./dive vault trust-ca

   10. Notify all federation partners that the Root CA has changed.

  Time to resolve: ~1 hour (full redeployment required)

  PREVENTION: Enable Vault audit logging, restrict access to Root CA,
  use the Intermediate CA for all day-to-day operations.

=============================================================================
RUNBOOK
            ;;
        vault-cluster-failure)
            cat <<'RUNBOOK'
=============================================================================
  RUNBOOK: Vault Cluster Failure
=============================================================================

  Scenario: Vault cluster is down — cannot issue/revoke certs, no secret access.

  Impact: New deployments blocked, secret rotation blocked, existing services
          continue operating with cached credentials until lease expiry.

  Steps:
    1. Check cluster status:
         ./dive vault status
         ./dive vault cluster status

    2. Check if seal vault is healthy:
         ./dive vault seal-status

    3. If seal vault is down, restart it:
         docker compose -f docker-compose.hub.yml up -d vault-seal

    4. Restart Vault cluster nodes:
         docker compose -f docker-compose.hub.yml restart vault-1 vault-2 vault-3

    5. Wait for auto-unseal (30s), then check:
         ./dive vault status

    6. If nodes are sealed and seal vault is healthy:
         ./dive vault unseal

    7. If data is corrupted, restore from backup:
         ./dive vault backup-list
         ./dive vault restore-pki <latest-snapshot>

    8. Verify PKI is functional:
         ./dive vault test-pki

    9. Verify all service certificates:
         ./dive certs status

   10. If restore fails completely:
         See: ./dive certs runbook compromised-root-ca
         (start fresh with new PKI hierarchy)

  Time to resolve: ~5 minutes (restart), ~15 minutes (restore from backup)

=============================================================================
RUNBOOK
            ;;
        *)
            echo ""
            echo "Available runbooks:"
            echo "  compromised-spoke-key        — Single spoke key compromised"
            echo "  compromised-intermediate-ca  — Intermediate CA key compromised"
            echo "  compromised-root-ca          — Root CA compromised (manual recovery)"
            echo "  vault-cluster-failure        — Vault cluster down, restore from backup"
            echo ""
            echo "Usage: ./dive certs runbook <scenario>"
            ;;
    esac
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_certificates() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        prepare-federation)
            prepare_federation_certificates "$@"
            ;;
        prepare-all)
            prepare_all_certificates
            ;;
        update-hub-sans)
            update_hub_certificate_sans "$@"
            ;;
        install-hub-ca)
            install_mkcert_ca_in_hub "$@"
            ;;
        install-spoke-ca)
            install_mkcert_ca_in_spoke "$@"
            ;;
        generate-spoke)
            generate_spoke_certificate "$@"
            ;;
        sync-ca)
            sync_mkcert_ca_to_all
            ;;
        trust-ca)
            install_vault_ca_to_system_truststore
            ;;
        untrust-ca)
            remove_vault_ca_from_system_truststore
            ;;
        vault-tls-setup)
            generate_vault_node_certs
            ;;
        vault-rotate-to-pki)
            _rotate_vault_node_certs_to_pki
            ;;
        verify)
            verify_federation_certificates "$@"
            ;;
        verify-all)
            verify_all_certificates
            ;;
        check)
            check_mkcert_ready
            ;;
        revoke)
            revoke_spoke_certificates "$@"
            ;;
        revoke-hub)
            revoke_hub_certificate
            ;;
        crl-status)
            show_crl_status
            ;;
        crl-rotate)
            rotate_crl
            ;;
        crl-distribute)
            _distribute_crl
            ;;
        status)
            cert_status_report
            ;;
        metrics-export)
            _cert_metrics_export
            ;;
        emergency-rotate)
            cert_emergency_rotate "$@"
            ;;
        runbook)
            _cert_runbook "$@"
            ;;
        *)
            module_certificates_help
            ;;
    esac
}

module_certificates_help() {
    echo -e "${BOLD}Certificate Management Commands:${NC}"
    echo ""
    echo "  ${CYAN}prepare-federation${NC} <spoke>  Complete certificate setup for federation"
    echo "  ${CYAN}prepare-all${NC}                 Prepare certificates for all spokes"
    echo "  ${CYAN}update-hub-sans${NC}             Update Hub cert with all spoke SANs"
    echo "  ${CYAN}install-hub-ca${NC}              Install mkcert CA in Hub truststore"
    echo "  ${CYAN}install-spoke-ca${NC} <spoke>    Install mkcert CA in spoke truststore"
    echo "  ${CYAN}generate-spoke${NC} <spoke>      Generate spoke certificate"
    echo "  ${CYAN}sync-ca${NC}                     Sync local mkcert CA to all instances"
    echo "  ${CYAN}trust-ca${NC}                    Install Vault Root CA in system trust store"
    echo "  ${CYAN}untrust-ca${NC}                  Remove Vault Root CA from system trust store"
    echo "  ${CYAN}vault-tls-setup${NC}             Generate TLS certs for Vault HA nodes"
    echo "  ${CYAN}vault-rotate-to-pki${NC}         Rotate Vault node certs to Vault PKI (post-init)"
    echo "  ${CYAN}verify${NC} [spoke]              Verify certificate configuration"
    echo "  ${CYAN}verify-all${NC}                  Verify certificates for all spokes"
    echo "  ${CYAN}check${NC}                       Check mkcert prerequisites"
    echo ""
    echo "Monitoring:"
    echo "  ${CYAN}status${NC}                       Certificate status report (all instances + CAs)"
    echo "  ${CYAN}metrics-export${NC}               Export Prometheus certificate metrics"
    echo ""
    echo "Emergency (Phase 6):"
    echo "  ${CYAN}emergency-rotate${NC} <hub|spoke|all> [CODE] [--force]"
    echo "                                 Revoke + reissue + restart services"
    echo "  ${CYAN}runbook${NC} <scenario>            Print operational runbook for scenario"
    echo "                                 Scenarios: compromised-spoke-key, compromised-intermediate-ca,"
    echo "                                            compromised-root-ca, vault-cluster-failure"
    echo ""
    echo "Revocation (Vault PKI):"
    echo "  ${CYAN}revoke${NC} <spoke>              Revoke spoke certificate and rebuild CRL"
    echo "  ${CYAN}revoke-hub${NC}                  Revoke hub certificate and rebuild CRL"
    echo "  ${CYAN}crl-status${NC}                  Show CRL status and certificate inventory"
    echo "  ${CYAN}crl-rotate${NC}                  Force CRL rebuild on Intermediate CA"
    echo "  ${CYAN}crl-distribute${NC}              Download and distribute CRL to all instances"
    echo ""
    echo "Examples:"
    echo "  ./dive certs sync-ca                   # Sync local mkcert CA everywhere"
    echo "  ./dive certs prepare-federation alb    # Full setup for ALB spoke"
    echo "  ./dive certs prepare-all               # Full setup for all spokes"
    echo "  ./dive certs update-hub-sans           # Add all spokes to Hub cert"
    echo "  ./dive certs verify alb                # Verify ALB certificates"
    echo "  ./dive certs verify-all                # Verify all spokes"
    echo "  ./dive certs revoke deu                # Revoke DEU spoke certificate"
    echo "  ./dive certs crl-status                # Show revocation list status"
    echo ""
}
