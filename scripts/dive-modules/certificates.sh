#!/usr/local/bin/bash
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
if [ -z "$DIVE_COMMON_LOADED" ]; then
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

    # Ensure CA directory exists and has root CA
    mkdir -p "$certs_dir/ca"
    
    local ca_path
    ca_path=$(get_mkcert_ca_path)
    
    if [ -f "$ca_path" ]; then
        cp "$ca_path" "$certs_dir/ca/rootCA.pem"
        chmod 644 "$certs_dir/ca/rootCA.pem"
    else
        log_warn "mkcert CA not found, truststore will be incomplete"
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
    
    local ca_path
    ca_path=$(get_mkcert_ca_path)
    
    if [ -f "$ca_path" ]; then
        cp "$ca_path" "$certs_dir/ca/rootCA.pem"
        chmod 644 "$certs_dir/ca/rootCA.pem"
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

    # WILDCARD APPROACH: Support any current or future spoke without regeneration
    # No hardcoded country lists - uses wildcards for maximum flexibility

    local base_hostnames="localhost 127.0.0.1 ::1 host.docker.internal *.localhost"

    # Hub-specific hostnames
    local hub_hostnames="dive-hub-keycloak dive-hub-backend dive-hub-frontend dive-hub-opa dive-hub-opal-server dive-hub-kas"
    hub_hostnames="$hub_hostnames keycloak hub-keycloak backend frontend opa opal-server"
    hub_hostnames="$hub_hostnames hub.dive25.com usa-idp.dive25.com usa-api.dive25.com usa-app.dive25.com"

    # Wildcard patterns for spoke support (any NATO or partner country)
    local wildcard_patterns="*.dive25.com *.dive25.local"

    # Combine all hostnames
    local all_hostnames="$base_hostnames $hub_hostnames $wildcard_patterns"

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

    # SANs for spoke certificate
    # CRITICAL: Include BOTH spoke AND hub hostnames for bidirectional SSL
    local hostnames="localhost 127.0.0.1 ::1 host.docker.internal"

    # Spoke's own Docker container names (for internal spoke communication)
    # Pattern 1: dive-spoke-{code}-{service}
    hostnames="$hostnames dive-spoke-${code_lower}-keycloak"
    hostnames="$hostnames dive-spoke-${code_lower}-backend"
    hostnames="$hostnames dive-spoke-${code_lower}-frontend"
    hostnames="$hostnames dive-spoke-${code_lower}-opa"
    hostnames="$hostnames dive-spoke-${code_lower}-opal-client"
    hostnames="$hostnames dive-spoke-${code_lower}-mongodb"
    hostnames="$hostnames dive-spoke-${code_lower}-postgres"
    hostnames="$hostnames dive-spoke-${code_lower}-redis"
    hostnames="$hostnames dive-spoke-${code_lower}-kas"

    # Pattern 2: {service}-{code} (for internal references)
    hostnames="$hostnames keycloak-${code_lower} backend-${code_lower} frontend-${code_lower}"
    hostnames="$hostnames opa-${code_lower} mongodb-${code_lower} postgres-${code_lower}"
    hostnames="$hostnames redis-${code_lower} opal-client-${code_lower} kas-${code_lower}"

    # Pattern 3: {code}-{service}-{code}-1 (docker compose pattern)
    hostnames="$hostnames ${code_lower}-keycloak-${code_lower}-1"

    # Spoke public DNS names
    hostnames="$hostnames ${code_lower}-idp.dive25.com"
    hostnames="$hostnames ${code_lower}-api.dive25.com"
    hostnames="$hostnames ${code_lower}-app.dive25.com"

    # HUB container names (critical for spoke → hub SSL connections)
    hostnames="$hostnames dive-hub-keycloak dive-hub-backend dive-hub-frontend dive-hub-opa dive-hub-opal-server"
    hostnames="$hostnames hub-keycloak keycloak backend frontend opa opal-server"
    hostnames="$hostnames hub.dive25.com usa-idp.dive25.com usa-api.dive25.com usa-app.dive25.com"

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
        verify)
            verify_federation_certificates "$@"
            ;;
        verify-all)
            verify_all_certificates
            ;;
        check)
            check_mkcert_ready
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
    echo "  ${CYAN}verify${NC} [spoke]              Verify certificate configuration"
    echo "  ${CYAN}verify-all${NC}                  Verify certificates for all spokes"
    echo "  ${CYAN}check${NC}                       Check mkcert prerequisites"
    echo ""
    echo "Examples:"
    echo "  ./dive certs sync-ca                   # Sync local mkcert CA everywhere"
    echo "  ./dive certs prepare-federation alb    # Full setup for ALB spoke"
    echo "  ./dive certs prepare-all               # Full setup for all spokes"
    echo "  ./dive certs update-hub-sans           # Add all spokes to Hub cert"
    echo "  ./dive certs verify alb                # Verify ALB certificates"
    echo "  ./dive certs verify-all                # Verify all spokes"
    echo ""
}
