# =============================================================================
# DIVE V3 CLI - Certificate Verification & Vault Node TLS
# =============================================================================
# Sourced by certificates.sh — do not execute directly.
#
# Sections: verification, system trust store, vault node TLS bootstrap/rotation
# =============================================================================

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

