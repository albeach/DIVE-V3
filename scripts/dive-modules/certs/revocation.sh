# =============================================================================
# DIVE V3 CLI - Certificate Revocation & Emergency Rotation
# =============================================================================
# Sourced by certificates.sh — do not execute directly.
#
# Sections: CRL management, spoke/hub revocation, emergency rotation
# =============================================================================

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

