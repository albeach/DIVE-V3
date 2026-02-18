# =============================================================================
# DIVE V3 CLI - Certificate Core
# =============================================================================
# Sourced by certificates.sh — do not execute directly.
#
# Sections: constants, prerequisites, CA bundle, truststore management,
#   SAN SSOT, hub/spoke cert generation (mkcert + Vault PKI)
# =============================================================================

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

##
# Fetch Hub Vault PKI CA bundle from a remote hub
#
# Used by remote spokes (different EC2 instances, clouds, on-prem) to download
# the hub's Vault PKI CA chain for TLS trust bootstrapping. The hub's nginx
# reverse proxy exposes only unauthenticated PKI CA endpoints (standard PKI
# practice — CA certificates are public by design).
#
# Requires:
#   HUB_EXTERNAL_ADDRESS - Hub's public IP or DNS name
#
# Returns:
#   0 - Success
#   1 - Failure
##
_fetch_hub_ca_bundle() {
    local hub_addr="${HUB_EXTERNAL_ADDRESS:?HUB_EXTERNAL_ADDRESS required}"
    local hub_vault="https://${hub_addr}:8200"
    local ca_dir="${DIVE_ROOT}/certs/vault-pki"

    mkdir -p "$ca_dir"

    log_step "Fetching hub CA bundle from ${hub_vault}..."

    # Vault PKI CA endpoints are public (standard PKI practice)
    # -k: skip TLS verify for bootstrap (we don't trust any CA yet)
    if ! curl -sk --max-time 10 "${hub_vault}/v1/pki/ca/pem" -o "$ca_dir/root-ca.pem"; then
        log_error "Failed to fetch root CA from ${hub_vault}/v1/pki/ca/pem"
        return 1
    fi

    if ! curl -sk --max-time 10 "${hub_vault}/v1/pki_int/ca/pem" -o "$ca_dir/int-ca.pem"; then
        log_error "Failed to fetch intermediate CA from ${hub_vault}/v1/pki_int/ca/pem"
        return 1
    fi

    # Validate we got actual PEM content (not an error page)
    if ! grep -q "BEGIN CERTIFICATE" "$ca_dir/root-ca.pem" 2>/dev/null; then
        log_error "Root CA response is not valid PEM"
        rm -f "$ca_dir/root-ca.pem"
        return 1
    fi

    if ! grep -q "BEGIN CERTIFICATE" "$ca_dir/int-ca.pem" 2>/dev/null; then
        log_error "Intermediate CA response is not valid PEM"
        rm -f "$ca_dir/int-ca.pem"
        return 1
    fi

    # Build chain: intermediate first, then root (standard order)
    cat "$ca_dir/int-ca.pem" "$ca_dir/root-ca.pem" > "$ca_dir/ca-chain.pem"

    # Rebuild the unified CA bundle (includes mkcert + Vault PKI)
    _rebuild_ca_bundle

    log_success "Fetched hub CA bundle from ${hub_vault}"
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


# Load certificate validation and generation functions
source "$(dirname "${BASH_SOURCE[0]}")/validation.sh"

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

    # Set permissions (644 for key: Docker containers run as non-owner UIDs)
    chmod 644 "$target_dir/key.pem"
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

    # IP SANs: loopback + EC2 instance IPs (if running on EC2)
    local ip_sans="127.0.0.1,::1"
    [ -n "${INSTANCE_PRIVATE_IP:-}" ] && ip_sans="${ip_sans},${INSTANCE_PRIVATE_IP}"
    [ -n "${INSTANCE_PUBLIC_IP:-}" ] && ip_sans="${ip_sans},${INSTANCE_PUBLIC_IP}"

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

    # IP SANs: loopback + EC2 instance IPs (if running on EC2)
    local ip_sans="127.0.0.1,::1"
    [ -n "${INSTANCE_PRIVATE_IP:-}" ] && ip_sans="${ip_sans},${INSTANCE_PRIVATE_IP}"
    [ -n "${INSTANCE_PUBLIC_IP:-}" ] && ip_sans="${ip_sans},${INSTANCE_PUBLIC_IP}"
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

