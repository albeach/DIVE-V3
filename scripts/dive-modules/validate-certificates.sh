#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Certificate Validation Script
# =============================================================================
# Validates that all deployed spokes have federation-compatible certificates
# with required SANs for container-to-container SSL
# =============================================================================
# Usage: ./scripts/dive-modules/validate-certificates.sh
#        ./dive certificates validate-all
# =============================================================================

# Set DIVE_ROOT if not already set
if [ -z "$DIVE_ROOT" ]; then
    DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
    export DIVE_ROOT
fi

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

##
# Validate a single spoke's certificate has required SANs
#
# Arguments:
#   $1 - Spoke code (e.g., svk, hun, pol)
#
# Returns:
#   0 - Certificate valid
#   1 - Certificate invalid or missing
##
validate_spoke_certificate() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower
    code_lower=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")

    local cert_path="${DIVE_ROOT}/instances/${code_lower}/certs/certificate.pem"

    # Check if certificate exists
    if [ ! -f "$cert_path" ]; then
        echo -e "  ${RED}✗ Certificate not found: $cert_path${NC}"
        return 1
    fi

    # Check certificate expiration
    local expiry
    expiry=$(openssl x509 -in "$cert_path" -enddate -noout 2>/dev/null | cut -d= -f2)
    local expiry_epoch
    expiry_epoch=$(date -j -f "%b %d %T %Y %Z" "$expiry" +%s 2>/dev/null || echo "0")
    local now_epoch
    now_epoch=$(date +%s)

    if [ "$expiry_epoch" -le "$now_epoch" ]; then
        echo -e "  ${RED}✗ Certificate expired: $expiry${NC}"
        return 1
    fi

    # Required SANs for federation
    local required_sans=(
        "dive-spoke-${code_lower}-keycloak"
        "dive-spoke-${code_lower}-backend"
        "localhost"
    )

    # Optional but recommended SANs
    local optional_sans=(
        "dive-hub-keycloak"
        "${code_lower}-idp.dive25.com"
    )

    local missing_required=()
    local missing_optional=()
    local cert_text
    cert_text=$(openssl x509 -in "$cert_path" -text -noout 2>/dev/null)

    # Check required SANs
    for san in "${required_sans[@]}"; do
        if ! echo "$cert_text" | grep -q "$san"; then
            missing_required+=("$san")
        fi
    done

    # Check optional SANs
    for san in "${optional_sans[@]}"; do
        if ! echo "$cert_text" | grep -q "$san"; then
            missing_optional+=("$san")
        fi
    done

    # Report results
    if [ ${#missing_required[@]} -eq 0 ]; then
        if [ ${#missing_optional[@]} -eq 0 ]; then
            echo -e "  ${GREEN}✓ Certificate valid - all SANs present${NC}"
            return 0
        else
            echo -e "  ${YELLOW}⚠ Certificate valid - missing optional SANs:${NC}"
            for san in "${missing_optional[@]}"; do
                echo -e "    - $san"
            done
            echo -e "    ${GRAY}(Federation will work, but bidirectional SSL may have issues)${NC}"
            return 0
        fi
    else
        echo -e "  ${RED}✗ Certificate INVALID - missing required SANs:${NC}"
        for san in "${missing_required[@]}"; do
            echo -e "    - $san ${RED}(CRITICAL)${NC}"
        done
        if [ ${#missing_optional[@]} -gt 0 ]; then
            echo -e "  ${YELLOW}Also missing optional SANs:${NC}"
            for san in "${missing_optional[@]}"; do
                echo -e "    - $san"
            done
        fi
        echo -e "  ${CYAN}Fix: Remove certificate and redeploy${NC}"
        echo -e "    rm instances/${code_lower}/certs/certificate.pem instances/${code_lower}/certs/key.pem"
        echo -e "    ./dive spoke deploy ${code_upper}"
        return 1
    fi
}

##
# Validate Hub certificate (SSOT: instances/hub/certs)
##
validate_hub_certificate() {
    local cert_path="${DIVE_ROOT}/instances/hub/certs/certificate.pem"

    if [ ! -f "$cert_path" ]; then
        echo -e "  ${RED}✗ Hub certificate not found: $cert_path${NC}"
        return 1
    fi

    # Required SANs for Hub
    local required_sans=(
        "dive-hub-keycloak"
        "dive-hub-backend"
        "localhost"
    )

    local cert_text
    cert_text=$(openssl x509 -in "$cert_path" -text -noout 2>/dev/null)

    local missing=()
    for san in "${required_sans[@]}"; do
        if ! echo "$cert_text" | grep -q "$san"; then
            missing+=("$san")
        fi
    done

    if [ ${#missing[@]} -eq 0 ]; then
        # Check for wildcard SANs (best practice)
        if echo "$cert_text" | grep -q "*.dive25.com"; then
            echo -e "  ${GREEN}✓ Hub certificate valid - has wildcard SANs (supports all spokes)${NC}"
        else
            echo -e "  ${YELLOW}⚠ Hub certificate valid - but missing wildcard SANs${NC}"
            echo -e "    ${GRAY}Consider regenerating with: ./dive certificates update-hub-sans${NC}"
        fi
        return 0
    else
        echo -e "  ${RED}✗ Hub certificate INVALID - missing required SANs:${NC}"
        for san in "${missing[@]}"; do
            echo -e "    - $san"
        done
        return 1
    fi
}

##
# Validate all deployed spokes
##
validate_all_certificates() {
    echo ""
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  DIVE V3 Certificate Validation${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo ""

    # Validate Hub
    echo -e "${CYAN}Hub (USA):${NC}"
    validate_hub_certificate
    echo ""

    # Find all deployed spokes (have running containers)
    local deployed_spokes
    deployed_spokes=$(docker ps --format '{{.Names}}' 2>/dev/null | \
        grep -E "^dive-spoke-.*-keycloak$" | \
        sed 's/dive-spoke-\(.*\)-keycloak/\1/' | \
        tr '[:lower:]' '[:upper:]' || true)

    if [ -z "$deployed_spokes" ]; then
        log_warn "No deployed spokes found"
        return 0
    fi

    local total=0
    local valid=0
    local invalid=0

    for spoke in $deployed_spokes; do
        ((total++))
        echo -e "${CYAN}Spoke ${spoke}:${NC}"
        if validate_spoke_certificate "$spoke"; then
            ((valid++))
        else
            ((invalid++))
        fi
        echo ""
    done

    # Summary
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Summary: $total spokes validated${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${GREEN}✓ Valid:   $valid${NC}"
    echo -e "  ${RED}✗ Invalid: $invalid${NC}"
    echo ""

    if [ "$invalid" -eq 0 ]; then
        echo -e "${GREEN}🎉 All certificates are federation-compatible!${NC}"
        return 0
    else
        echo -e "${RED}❌ Some certificates need regeneration${NC}"
        echo ""
        echo "Fix invalid certificates:"
        echo "  1. Remove old certificate: rm instances/{code}/certs/*.pem"
        echo "  2. Redeploy: ./dive spoke deploy {CODE}"
        echo ""
        return 1
    fi
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

# If sourced, export functions; if executed, run validation
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    validate_all_certificates "$@"
fi
