#!/usr/bin/env bash
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

    local _total_passed=0
    local _total_failed=0
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
            local -a cacert_args=()
            local _cacert_arg
            while IFS= read -r _cacert_arg; do
                [ -n "$_cacert_arg" ] && cacert_args+=("$_cacert_arg")
            done < <(_vault_curl_cacert_flag)
            local ca_pem
            ca_pem=$(curl -sL "${cacert_args[@]}" -H "X-Vault-Token: $vault_token" \
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


# Load vault bootstrap certificate functions
source "$(dirname "${BASH_SOURCE[0]}")/vault-bootstrap.sh"
