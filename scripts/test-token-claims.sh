#!/usr/bin/env bash
# ============================================
# DIVE V3 Token Claims Validation Script
# ============================================
# Validates JWT token claims from Keycloak
# Version: 2.0.0
# Tests: ACR, AMR, clearance, uniqueID, auth_time, exp, iat
#
# Usage:
#   ./scripts/test-token-claims.sh <access_token>
#   ./scripts/test-token-claims.sh $(cat token.txt)

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ============================================
# Helper Functions
# ============================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_claim() {
    local claim_name="$1"
    local claim_value="$2"
    echo -e "${CYAN}  $claim_name:${NC} $claim_value"
}

# Decode JWT part (1=header, 2=payload, 3=signature)
decode_jwt_part() {
    local jwt="$1"
    local part="$2"
    
    local encoded=$(echo "$jwt" | cut -d. -f"$part")
    
    # Add padding if needed
    local padding=$((4 - ${#encoded} % 4))
    if [ "$padding" -ne 4 ]; then
        encoded="${encoded}$(printf '=%.0s' $(seq 1 $padding))"
    fi
    
    echo "$encoded" | base64 -d 2>/dev/null | jq -r '.' 2>/dev/null || echo "{}"
}

# ============================================
# Token Validation Functions
# ============================================

validate_jwt_structure() {
    local token="$1"
    
    log_info "Validating JWT structure..."
    
    # Count parts (should be 3: header.payload.signature)
    local parts=$(echo "$token" | tr '.' '\n' | wc -l | tr -d ' ')
    
    if [ "$parts" -ne 3 ]; then
        log_error "Invalid JWT structure: expected 3 parts, got $parts"
        return 1
    fi
    
    log_success "JWT structure valid (3 parts: header.payload.signature)"
    return 0
}

validate_header() {
    local token="$1"
    
    log_info "Validating JWT header..."
    
    local header=$(decode_jwt_part "$token" 1)
    
    local alg=$(echo "$header" | jq -r '.alg // empty')
    local typ=$(echo "$header" | jq -r '.typ // empty')
    local kid=$(echo "$header" | jq -r '.kid // empty')
    
    log_claim "Algorithm (alg)" "$alg"
    log_claim "Type (typ)" "$typ"
    log_claim "Key ID (kid)" "$kid"
    
    if [ "$alg" != "RS256" ]; then
        log_warn "Algorithm is not RS256 (got: $alg)"
    else
        log_success "Algorithm is RS256 (asymmetric signing)"
    fi
    
    if [ "$typ" != "JWT" ]; then
        log_warn "Type is not JWT (got: $typ)"
    else
        log_success "Type is JWT"
    fi
    
    echo ""
}

validate_required_claims() {
    local token="$1"
    
    log_info "Validating required OIDC claims..."
    
    local payload=$(decode_jwt_part "$token" 2)
    
    local iss=$(echo "$payload" | jq -r '.iss // empty')
    local sub=$(echo "$payload" | jq -r '.sub // empty')
    local aud=$(echo "$payload" | jq -r '.aud // empty')
    local exp=$(echo "$payload" | jq -r '.exp // empty')
    local iat=$(echo "$payload" | jq -r '.iat // empty')
    local jti=$(echo "$payload" | jq -r '.jti // empty')
    
    local all_valid=true
    
    # Issuer
    if [ -z "$iss" ]; then
        log_error "Missing required claim: iss (issuer)"
        all_valid=false
    else
        log_success "iss (issuer): $iss"
    fi
    
    # Subject
    if [ -z "$sub" ]; then
        log_error "Missing required claim: sub (subject)"
        all_valid=false
    else
        log_success "sub (subject): $sub"
    fi
    
    # Audience
    if [ -z "$aud" ]; then
        log_error "Missing required claim: aud (audience)"
        all_valid=false
    else
        log_success "aud (audience): $aud"
    fi
    
    # Expiration
    if [ -z "$exp" ]; then
        log_error "Missing required claim: exp (expiration)"
        all_valid=false
    else
        local exp_date=$(date -r "$exp" 2>/dev/null || echo "invalid")
        log_success "exp (expiration): $exp ($exp_date)"
    fi
    
    # Issued At
    if [ -z "$iat" ]; then
        log_error "Missing required claim: iat (issued at)"
        all_valid=false
    else
        local iat_date=$(date -r "$iat" 2>/dev/null || echo "invalid")
        log_success "iat (issued at): $iat ($iat_date)"
    fi
    
    # JWT ID
    if [ -z "$jti" ]; then
        log_warn "Missing claim: jti (JWT ID) - not critical"
    else
        log_success "jti (JWT ID): $jti"
    fi
    
    echo ""
    
    if [ "$all_valid" = false ]; then
        return 1
    fi
    
    return 0
}

validate_dive_claims() {
    local token="$1"
    
    log_info "Validating DIVE V3 custom claims..."
    
    local payload=$(decode_jwt_part "$token" 2)
    
    local unique_id=$(echo "$payload" | jq -r '.uniqueID // empty')
    local clearance=$(echo "$payload" | jq -r '.clearance // empty')
    local country=$(echo "$payload" | jq -r '.countryOfAffiliation // empty')
    local acpCOI=$(echo "$payload" | jq -r '.acpCOI // empty')
    local dutyOrg=$(echo "$payload" | jq -r '.dutyOrg // empty')
    local orgUnit=$(echo "$payload" | jq -r '.orgUnit // empty')
    
    local all_valid=true
    
    # uniqueID (REQUIRED)
    if [ -z "$unique_id" ]; then
        log_error "Missing REQUIRED claim: uniqueID"
        all_valid=false
    else
        log_success "uniqueID: $unique_id"
    fi
    
    # clearance (REQUIRED)
    if [ -z "$clearance" ]; then
        log_error "Missing REQUIRED claim: clearance"
        all_valid=false
    else
        case "$clearance" in
            UNCLASSIFIED|CONFIDENTIAL|SECRET|TOP_SECRET)
                log_success "clearance: $clearance (valid level)"
                ;;
            *)
                log_error "clearance: $clearance (INVALID - not a standard level)"
                all_valid=false
                ;;
        esac
    fi
    
    # countryOfAffiliation (REQUIRED)
    if [ -z "$country" ]; then
        log_warn "Missing claim: countryOfAffiliation (optional for some users)"
    else
        if [ "${#country}" -eq 3 ]; then
            log_success "countryOfAffiliation: $country (ISO 3166-1 alpha-3)"
        else
            log_warn "countryOfAffiliation: $country (expected ISO 3166-1 alpha-3, 3 chars)"
        fi
    fi
    
    # acpCOI (OPTIONAL)
    if [ -z "$acpCOI" ] || [ "$acpCOI" = "null" ]; then
        log_info "acpCOI: not set (optional)"
    else
        log_success "acpCOI: $acpCOI"
    fi
    
    # dutyOrg (OPTIONAL)
    if [ -z "$dutyOrg" ] || [ "$dutyOrg" = "null" ]; then
        log_info "dutyOrg: not set (optional)"
    else
        log_success "dutyOrg: $dutyOrg"
    fi
    
    # orgUnit (OPTIONAL)
    if [ -z "$orgUnit" ] || [ "$orgUnit" = "null" ]; then
        log_info "orgUnit: not set (optional)"
    else
        log_success "orgUnit: $orgUnit"
    fi
    
    echo ""
    
    if [ "$all_valid" = false ]; then
        return 1
    fi
    
    return 0
}

validate_aal_claims() {
    local token="$1"
    
    log_info "Validating AAL (Authentication Assurance Level) claims..."
    
    local payload=$(decode_jwt_part "$token" 2)
    
    local acr=$(echo "$payload" | jq -r '.acr // empty')
    local amr=$(echo "$payload" | jq -r '.amr // empty')
    local auth_time=$(echo "$payload" | jq -r '.auth_time // empty')
    local clearance=$(echo "$payload" | jq -r '.clearance // empty')
    
    local all_valid=true
    
    # ACR (Authentication Context Class Reference)
    if [ -z "$acr" ]; then
        log_error "Missing REQUIRED claim: acr (Authentication Context Class Reference)"
        all_valid=false
    else
        case "$acr" in
            0)
                log_success "acr: 0 (AAL1 - Password only)"
                ;;
            1)
                log_success "acr: 1 (AAL2 - Multi-factor authentication)"
                ;;
            2)
                log_success "acr: 2 (AAL3 - Hardware-backed authentication)"
                ;;
            *)
                log_warn "acr: $acr (non-standard value)"
                ;;
        esac
    fi
    
    # AMR (Authentication Methods Reference)
    if [ -z "$amr" ] || [ "$amr" = "null" ]; then
        log_error "Missing REQUIRED claim: amr (Authentication Methods Reference)"
        all_valid=false
    else
        # AMR should be a JSON array
        if echo "$amr" | jq -e 'type == "array"' >/dev/null 2>&1; then
            local amr_methods=$(echo "$amr" | jq -r '.[]' | tr '\n' ',' | sed 's/,$//')
            log_success "amr: [$amr_methods] (RFC-8176 compliant array)"
            
            # Validate AMR values
            local has_pwd=$(echo "$amr" | jq -r '.[] | select(. == "pwd")' | wc -l | tr -d ' ')
            local has_otp=$(echo "$amr" | jq -r '.[] | select(. == "otp")' | wc -l | tr -d ' ')
            local has_hwk=$(echo "$amr" | jq -r '.[] | select(. == "hwk")' | wc -l | tr -d ' ')
            
            if [ "$has_pwd" -gt 0 ]; then
                log_info "  - pwd (password) ✓"
            fi
            if [ "$has_otp" -gt 0 ]; then
                log_info "  - otp (one-time password) ✓"
            fi
            if [ "$has_hwk" -gt 0 ]; then
                log_info "  - hwk (hardware key) ✓"
            fi
        else
            log_warn "amr: $amr (expected JSON array, got: $(echo "$amr" | jq -r 'type'))"
        fi
    fi
    
    # auth_time (Authentication Time)
    if [ -z "$auth_time" ]; then
        log_error "Missing REQUIRED claim: auth_time (authentication timestamp)"
        all_valid=false
    else
        local auth_date=$(date -r "$auth_time" 2>/dev/null || echo "invalid")
        local current_time=$(date +%s)
        local age=$((current_time - auth_time))
        
        log_success "auth_time: $auth_time ($auth_date)"
        
        if [ "$age" -lt 0 ]; then
            log_error "auth_time is in the future! Clock skew detected."
            all_valid=false
        elif [ "$age" -gt 900 ]; then  # 15 minutes
            log_warn "auth_time is > 15 minutes old (age: ${age}s)"
        else
            log_success "auth_time age: ${age}s (< 15 minutes)"
        fi
    fi
    
    # Cross-validation: ACR vs AMR vs Clearance
    if [ -n "$acr" ] && [ -n "$amr" ] && [ -n "$clearance" ]; then
        log_info "Cross-validating ACR/AMR/Clearance consistency..."
        
        local has_otp=$(echo "$amr" | jq -r '.[] | select(. == "otp")' | wc -l | tr -d ' ')
        
        if [ "$clearance" = "UNCLASSIFIED" ]; then
            if [ "$acr" != "0" ]; then
                log_warn "UNCLASSIFIED user should have ACR=0, got ACR=$acr"
            fi
            if [ "$has_otp" -gt 0 ]; then
                log_warn "UNCLASSIFIED user should not have OTP in AMR"
            fi
        else
            # CONFIDENTIAL, SECRET, TOP_SECRET should require MFA
            if [ "$acr" != "1" ]; then
                log_error "Classified user ($clearance) should have ACR=1, got ACR=$acr"
                all_valid=false
            fi
            if [ "$has_otp" -eq 0 ]; then
                log_error "Classified user ($clearance) should have 'otp' in AMR"
                all_valid=false
            fi
        fi
    fi
    
    echo ""
    
    if [ "$all_valid" = false ]; then
        return 1
    fi
    
    return 0
}

validate_token_lifetime() {
    local token="$1"
    
    log_info "Validating token lifetime (AAL2 compliance)..."
    
    local payload=$(decode_jwt_part "$token" 2)
    
    local exp=$(echo "$payload" | jq -r '.exp // empty')
    local iat=$(echo "$payload" | jq -r '.iat // empty')
    
    if [ -z "$exp" ] || [ -z "$iat" ]; then
        log_error "Cannot validate lifetime: exp or iat missing"
        return 1
    fi
    
    local lifetime=$((exp - iat))
    local current_time=$(date +%s)
    local time_remaining=$((exp - current_time))
    
    log_claim "Issued at (iat)" "$(date -r "$iat")"
    log_claim "Expires at (exp)" "$(date -r "$exp")"
    log_claim "Lifetime" "${lifetime}s ($(($lifetime / 60)) minutes)"
    log_claim "Time remaining" "${time_remaining}s ($(($time_remaining / 60)) minutes)"
    
    # AAL2 compliance: access token lifetime ≤ 15 minutes (900 seconds)
    if [ "$lifetime" -le 900 ]; then
        log_success "Token lifetime compliant: ${lifetime}s ≤ 900s (15 minutes)"
    else
        log_error "Token lifetime TOO LONG: ${lifetime}s > 900s (15 minutes)"
        log_error "AAL2 compliance VIOLATION!"
        return 1
    fi
    
    # Check if token is expired
    if [ "$time_remaining" -lt 0 ]; then
        log_error "Token is EXPIRED (expired ${time_remaining#-}s ago)"
        return 1
    else
        log_success "Token is valid (expires in ${time_remaining}s)"
    fi
    
    echo ""
    return 0
}

print_full_token() {
    local token="$1"
    
    echo "============================================"
    echo "FULL TOKEN PAYLOAD (JSON)"
    echo "============================================"
    echo ""
    
    local payload=$(decode_jwt_part "$token" 2)
    echo "$payload" | jq '.'
    
    echo ""
}

# ============================================
# Main Script
# ============================================

main() {
    if [ $# -eq 0 ]; then
        echo "Usage: $0 <access_token>"
        echo ""
        echo "Example:"
        echo "  $0 eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
        echo ""
        echo "Or pipe from file:"
        echo "  cat token.txt | xargs $0"
        exit 1
    fi
    
    local access_token="$1"
    
    # Check dependencies
    if ! command -v jq &> /dev/null; then
        log_error "jq is required but not installed. Install with: brew install jq"
        exit 1
    fi
    
    echo "============================================"
    echo "DIVE V3 Token Claims Validation"
    echo "Version: 2.0.0 (Native Keycloak 26.4.2)"
    echo "============================================"
    echo ""
    
    local all_tests_passed=true
    
    # Test 1: JWT Structure
    if ! validate_jwt_structure "$access_token"; then
        all_tests_passed=false
    fi
    echo ""
    
    # Test 2: Header
    validate_header "$access_token"
    
    # Test 3: Required OIDC Claims
    if ! validate_required_claims "$access_token"; then
        all_tests_passed=false
    fi
    
    # Test 4: DIVE V3 Custom Claims
    if ! validate_dive_claims "$access_token"; then
        all_tests_passed=false
    fi
    
    # Test 5: AAL Claims (ACR, AMR, auth_time)
    if ! validate_aal_claims "$access_token"; then
        all_tests_passed=false
    fi
    
    # Test 6: Token Lifetime
    if ! validate_token_lifetime "$access_token"; then
        all_tests_passed=false
    fi
    
    # Print full payload
    print_full_token "$access_token"
    
    # Final result
    echo "============================================"
    echo "VALIDATION RESULT"
    echo "============================================"
    echo ""
    
    if [ "$all_tests_passed" = true ]; then
        echo -e "${GREEN}✓ ALL VALIDATIONS PASSED${NC}"
        echo ""
        log_success "Token is valid and AAL2/ACP-240 compliant"
        return 0
    else
        echo -e "${RED}✗ SOME VALIDATIONS FAILED${NC}"
        echo ""
        log_error "Token has compliance issues - review errors above"
        return 1
    fi
}

# Run main
main "$@"

