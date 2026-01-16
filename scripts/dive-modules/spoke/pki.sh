#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Spoke PKI Sub-Module
# =============================================================================
# Commands: pki-request, pki-import, verify-federation
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-07
# =============================================================================

# =============================================================================
# CSR GENERATION
# =============================================================================

spoke_pki_request() {
    local code
    code=$(get_instance_code)

    log_header "Spoke PKI Certificate Request: ${code}"

    local pki_script="${DIVE_ROOT}/scripts/pki/init-pki.sh"

    if [[ ! -x "$pki_script" ]]; then
        log_error "PKI script not found: $pki_script"
        return 1
    fi

    "$pki_script" spoke "$code"

    log_success "CSR generated for ${code}"
    log_info "Next: Submit CSR to Hub: ./dive hub pki-sign --spoke ${code,,}"
}

# =============================================================================
# CERTIFICATE IMPORT
# =============================================================================

spoke_pki_import() {
    local code
    code=$(get_instance_code)

    log_header "Spoke PKI Certificate Import: ${code}"

    local pki_script="${DIVE_ROOT}/scripts/pki/init-pki.sh"

    if [[ ! -x "$pki_script" ]]; then
        log_error "PKI script not found: $pki_script"
        return 1
    fi

    "$pki_script" import "$code"

    log_success "Certificate imported for ${code}"
    log_info "Restart spoke to apply PKI: ./dive --instance ${code,,} spoke restart"
}

# =============================================================================
# FEDERATION VERIFICATION (PLACEHOLDER)
# =============================================================================

spoke_verify_federation() {
    local instance_code="${1:-$INSTANCE}"

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo ""
        echo "Usage: ./dive spoke verify-federation CODE"
        echo ""
        echo "Examples:"
        echo "  ./dive spoke verify-federation FRA"
        echo "  ./dive spoke verify-federation DEU"
        return 1
    fi

    ensure_dive_root
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")

    print_header
    echo -e "${BOLD}Spoke Federation Verification:${NC} ${code_upper}"
    echo ""

    # Use the comprehensive federation verification from spoke-federation.sh
    if type spoke_federation_verify &>/dev/null; then
        spoke_federation_verify "$instance_code"
    elif type federation_verify &>/dev/null; then
        federation_verify "$instance_code"
    else
        # Fallback: Run the ./dive federation verify command
        "${DIVE_ROOT}/dive" federation verify "$instance_code" 2>/dev/null || {
            echo -e "${YELLOW}⚠ Federation verification requires spoke-federation module${NC}"
            echo ""
            echo "Run: ./dive federation verify $code_upper"
        }
    fi
}