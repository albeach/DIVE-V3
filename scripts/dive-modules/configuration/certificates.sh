#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 Certificate Management Module (Consolidated)
# =============================================================================
# Certificate generation, rotation, and validation
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   - certificates.sh
#   - validate-certificates.sh
#   - spoke/pki.sh
# =============================================================================

# Prevent multiple sourcing
[ -n "$DIVE_CONFIGURATION_CERTS_LOADED" ] && return 0
export DIVE_CONFIGURATION_CERTS_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

CONFIG_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$CONFIG_DIR")"

if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

CERTS_DIR="${DIVE_ROOT}/certs"
CERT_VALIDITY_DAYS="${CERT_VALIDITY_DAYS:-365}"

# =============================================================================
# CERTIFICATE GENERATION
# =============================================================================

##
# Generate certificate for Hub
##
generate_hub_certificate() {
    local certs_dir="${CERTS_DIR}/hub"
    mkdir -p "$certs_dir"

    log_info "Generating Hub certificates..."

    if command -v mkcert >/dev/null 2>&1; then
        cd "$certs_dir"
        mkcert -cert-file certificate.pem -key-file key.pem \
            localhost "*.localhost" "hub.dive.local" "keycloak" \
            127.0.0.1 ::1 \
            >/dev/null 2>&1
        cd - >/dev/null
    else
        generate_self_signed_cert "$certs_dir" "dive-hub"
    fi

    log_success "Hub certificates generated in $certs_dir"
    return 0
}

##
# Generate certificate for Spoke
#
# Arguments:
#   $1 - Instance code
##
generate_spoke_certificate() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    local certs_dir="${DIVE_ROOT}/instances/${code_lower}/certs"
    mkdir -p "$certs_dir"

    log_info "Generating certificates for Spoke $instance_code..."

    if command -v mkcert >/dev/null 2>&1; then
        cd "$certs_dir"
        mkcert -cert-file certificate.pem -key-file key.pem \
            localhost "*.localhost" "${code_lower}.dive.local" "keycloak" \
            127.0.0.1 ::1 \
            >/dev/null 2>&1
        cd - >/dev/null
    else
        generate_self_signed_cert "$certs_dir" "dive-spoke-${code_lower}"
    fi

    log_success "Spoke certificates generated in $certs_dir"
    return 0
}

##
# Generate self-signed certificate using OpenSSL
#
# Arguments:
#   $1 - Output directory
#   $2 - CN (Common Name)
##
generate_self_signed_cert() {
    local output_dir="$1"
    local cn="$2"

    openssl req -x509 -nodes -days "$CERT_VALIDITY_DAYS" -newkey rsa:2048 \
        -keyout "${output_dir}/key.pem" \
        -out "${output_dir}/certificate.pem" \
        -subj "/CN=${cn}/O=DIVE/OU=Federation" \
        -addext "subjectAltName=DNS:localhost,DNS:*.localhost,DNS:keycloak,IP:127.0.0.1" \
        >/dev/null 2>&1
}

# =============================================================================
# CERTIFICATE ROTATION
# =============================================================================

##
# Rotate certificates for an instance
#
# Arguments:
#   $1 - Instance type: "hub" or "spoke"
#   $2 - Instance code (for spoke)
##
rotate_certificates() {
    local instance_type="$1"
    local instance_code="${2:-}"

    log_warn "Rotating certificates for $instance_type ${instance_code:-}..."

    local certs_dir

    if [ "$instance_type" = "hub" ]; then
        certs_dir="${CERTS_DIR}/hub"
    else
        local code_lower=$(lower "$instance_code")
        certs_dir="${DIVE_ROOT}/instances/${code_lower}/certs"
    fi

    # Backup existing certificates
    if [ -f "${certs_dir}/certificate.pem" ]; then
        local backup_dir="${certs_dir}/backup_$(date +%Y%m%d_%H%M%S)"
        mkdir -p "$backup_dir"
        cp "${certs_dir}/certificate.pem" "${backup_dir}/"
        cp "${certs_dir}/key.pem" "${backup_dir}/"
        log_info "Old certificates backed up to $backup_dir"
    fi

    # Generate new certificates
    if [ "$instance_type" = "hub" ]; then
        generate_hub_certificate
    else
        generate_spoke_certificate "$instance_code"
    fi

    log_success "Certificate rotation complete"
    log_warn "IMPORTANT: Restart services to apply new certificates"

    return 0
}

# =============================================================================
# CERTIFICATE VALIDATION
# =============================================================================

##
# Validate certificate file
#
# Arguments:
#   $1 - Certificate file path
##
validate_certificate() {
    local cert_file="$1"

    if [ ! -f "$cert_file" ]; then
        log_error "Certificate file not found: $cert_file"
        return 1
    fi

    # Check certificate validity
    local expiry=$(openssl x509 -in "$cert_file" -noout -enddate 2>/dev/null | cut -d= -f2)

    if [ -z "$expiry" ]; then
        log_error "Invalid certificate file: $cert_file"
        return 1
    fi

    # Check if expired
    local expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$expiry" +%s 2>/dev/null)
    local now_epoch=$(date +%s)

    if [ "$expiry_epoch" -lt "$now_epoch" ]; then
        log_error "Certificate expired: $cert_file"
        return 1
    fi

    # Check days until expiry
    local days_remaining=$(( (expiry_epoch - now_epoch) / 86400 ))

    if [ $days_remaining -lt 30 ]; then
        log_warn "Certificate expiring in $days_remaining days: $cert_file"
    else
        log_verbose "Certificate valid for $days_remaining days: $cert_file"
    fi

    return 0
}

##
# Validate all certificates for an instance
#
# Arguments:
#   $1 - Instance type: "hub" or "spoke"
#   $2 - Instance code (for spoke)
##
validate_instance_certificates() {
    local instance_type="$1"
    local instance_code="${2:-}"

    local certs_dir

    if [ "$instance_type" = "hub" ]; then
        certs_dir="${CERTS_DIR}/hub"
    else
        local code_lower=$(lower "$instance_code")
        certs_dir="${DIVE_ROOT}/instances/${code_lower}/certs"
    fi

    log_info "Validating certificates for $instance_type ${instance_code:-}..."

    local valid=0
    local total=0

    for cert_file in "${certs_dir}"/*.pem; do
        [ -f "$cert_file" ] || continue
        [[ "$cert_file" == *"key.pem" ]] && continue

        ((total++))
        if validate_certificate "$cert_file"; then
            ((valid++))
        fi
    done

    if [ $total -eq 0 ]; then
        log_warn "No certificates found in $certs_dir"
        return 1
    fi

    log_info "Certificate validation: $valid/$total valid"
    [ $valid -eq $total ]
}

##
# Check certificate expiry across all instances
##
check_certificate_expiry() {
    echo "=== Certificate Expiry Status ==="
    echo ""

    # Hub certificates
    if [ -d "${CERTS_DIR}/hub" ]; then
        echo "Hub:"
        for cert_file in "${CERTS_DIR}/hub"/*.pem; do
            [ -f "$cert_file" ] || continue
            [[ "$cert_file" == *"key.pem" ]] && continue

            local expiry=$(openssl x509 -in "$cert_file" -noout -enddate 2>/dev/null | cut -d= -f2)
            printf "  %-30s %s\n" "$(basename "$cert_file")" "$expiry"
        done
        echo ""
    fi

    # Spoke certificates
    for spoke_dir in "${DIVE_ROOT}/instances"/*/; do
        [ -d "${spoke_dir}certs" ] || continue

        local code=$(basename "$spoke_dir")
        echo "Spoke $(upper "$code"):"

        for cert_file in "${spoke_dir}certs"/*.pem; do
            [ -f "$cert_file" ] || continue
            [[ "$cert_file" == *"key.pem" ]] && continue

            local expiry=$(openssl x509 -in "$cert_file" -noout -enddate 2>/dev/null | cut -d= -f2)
            printf "  %-30s %s\n" "$(basename "$cert_file")" "$expiry"
        done
        echo ""
    done
}

# =============================================================================
# CERTIFICATE INFO
# =============================================================================

##
# Show certificate details
#
# Arguments:
#   $1 - Certificate file path
##
show_certificate_info() {
    local cert_file="$1"

    if [ ! -f "$cert_file" ]; then
        log_error "Certificate file not found: $cert_file"
        return 1
    fi

    echo "=== Certificate: $(basename "$cert_file") ==="
    echo ""
    openssl x509 -in "$cert_file" -noout -text | head -30
}

# =============================================================================
# MKCERT INTEGRATION
# =============================================================================

##
# Install mkcert CA (for development)
##
mkcert_install_ca() {
    if ! command -v mkcert >/dev/null 2>&1; then
        log_error "mkcert not found"
        log_error "Install: brew install mkcert (macOS) or see https://github.com/FiloSottile/mkcert"
        return 1
    fi

    log_info "Installing mkcert CA..."
    mkcert -install
    log_success "mkcert CA installed"
}

##
# Get mkcert CA root path
##
mkcert_ca_root() {
    if command -v mkcert >/dev/null 2>&1; then
        mkcert -CAROOT
    else
        echo ""
    fi
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f generate_hub_certificate
export -f generate_spoke_certificate
export -f generate_self_signed_cert
export -f rotate_certificates
export -f validate_certificate
export -f validate_instance_certificates
export -f check_certificate_expiry
export -f show_certificate_info
export -f mkcert_install_ca
export -f mkcert_ca_root

log_verbose "Certificates module loaded"
