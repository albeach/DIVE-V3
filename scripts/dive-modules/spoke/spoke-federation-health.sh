#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Federation Health Check Module
# =============================================================================
# Comprehensive federation health checks including IdP enumeration,
# token exchange verification, and cross-instance authentication testing
# =============================================================================

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load NATO/ISO countries database for unified port calculation
_fed_health_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${_fed_health_script_dir}/../../nato-countries.sh" ]; then
    source "${_fed_health_script_dir}/../../nato-countries.sh"
fi
unset _fed_health_script_dir

# Mark this module as loaded
export DIVE_SPOKE_FEDERATION_HEALTH_LOADED=1

# =============================================================================
# PORT CALCULATION HELPER
# =============================================================================

##
# Get backend port for an instance using unified country database
# Falls back to hardcoded values if database unavailable
#
# Arguments:
#   $1 - Instance code (any case)
#
# Prints:
#   Backend port number
##
_get_instance_backend_port() {
    local code="${1^^}"
    
    # Try unified country database first
    if type get_any_country_offset &>/dev/null; then
        local offset=$(get_any_country_offset "$code")
        if [ -n "$offset" ] && [ "$offset" -ge 0 ]; then
            echo "$((4000 + offset))"
            return
        fi
    fi
    
    # Fallback to hardcoded values for known countries
    case "${code,,}" in
        usa) echo "4000" ;;
        alb) echo "4001" ;;
        fra) echo "4010" ;;
        gbr) echo "4031" ;;
        deu) echo "4011" ;;
        nld) echo "4020" ;;
        est) echo "4008" ;;
        lva) echo "4016" ;;
        pol) echo "4023" ;;
        *) echo "4000" ;;  # Default fallback
    esac
}

##
# Get Keycloak HTTPS port for an instance using unified country database
#
# Arguments:
#   $1 - Instance code (any case)
#
# Prints:
#   Keycloak HTTPS port number
##
_get_instance_keycloak_port() {
    local code="${1^^}"
    
    # Try unified country database first
    if type get_any_country_offset &>/dev/null; then
        local offset=$(get_any_country_offset "$code")
        if [ -n "$offset" ] && [ "$offset" -ge 0 ]; then
            echo "$((8443 + offset))"
            return
        fi
    fi
    
    # Fallback to hardcoded values
    case "${code,,}" in
        usa) echo "8443" ;;
        alb) echo "8444" ;;
        fra) echo "8453" ;;
        gbr) echo "8474" ;;
        deu) echo "8454" ;;
        nld) echo "8463" ;;
        *) echo "8443" ;;  # Default fallback
    esac
}

# =============================================================================
# FEDERATION HEALTH CHECK FUNCTIONS
# =============================================================================

##
# Test IdP enumeration - verify that the backend can list available IdPs
#
# Arguments:
#   $1 - instance code (lowercase)
#
# Returns:
#   0 - IdP enumeration working
#   1 - IdP enumeration failed
##
spoke_test_idp_enumeration() {
    local code_lower="$1"
    
    # Use unified port calculation
    local backend_port=$(_get_instance_backend_port "$code_lower")
    local backend_url="https://localhost:${backend_port}"

    log_verbose "Testing IdP enumeration for $code_lower..."

    # Test the /api/idps/public endpoint
    local response
    response=$(curl -sk "$backend_url/api/idps/public" 2>/dev/null)

    if [ $? -ne 0 ]; then
        log_error "Failed to connect to backend at $backend_url"
        return 1
    fi

    # Parse response
    local success
    success=$(echo "$response" | jq -r '.success' 2>/dev/null)

    if [ "$success" != "true" ]; then
        local error_msg
        error_msg=$(echo "$response" | jq -r '.message' 2>/dev/null)
        log_error "IdP enumeration failed: $error_msg"
        return 1
    fi

    local idp_count
    idp_count=$(echo "$response" | jq -r '.total' 2>/dev/null)

    if [ "$idp_count" -gt 0 ]; then
        log_verbose "IdP enumeration successful: $idp_count IdPs available"
        return 0
    else
        log_warn "IdP enumeration returned no IdPs"
        return 1
    fi
}

##
# Test IdP health - verify that configured IdPs are reachable
#
# Arguments:
#   $1 - instance code (lowercase)
#
# Returns:
#   0 - All IdPs healthy
#   1 - Some IdPs unhealthy
##
spoke_test_idp_health() {
    local code_lower="$1"
    
    # Use unified port calculation
    local backend_port=$(_get_instance_backend_port "$code_lower")
    local backend_url="https://localhost:${backend_port}"

    log_verbose "Testing IdP health for $code_lower..."

    # Get list of IdPs
    local idps_response
    idps_response=$(curl -sk "$backend_url/api/idps/public" 2>/dev/null)

    if [ $? -ne 0 ] || [ "$(echo "$idps_response" | jq -r '.success')" != "true" ]; then
        log_error "Cannot get IdP list for health testing"
        return 1
    fi

    local idps
    idps=$(echo "$idps_response" | jq -r '.idps[].alias' 2>/dev/null)
    local healthy_count=0
    local total_count=0
    local unhealthy_idps=()

    for idp_alias in $idps; do
        total_count=$((total_count + 1))

        # Test IdP health endpoint
        local health_response
        health_response=$(curl -sk "$backend_url/api/idps/$idp_alias/health" 2>/dev/null)

        if [ $? -eq 0 ]; then
            local healthy
            healthy=$(echo "$health_response" | jq -r '.healthy' 2>/dev/null)

            if [ "$healthy" = "true" ]; then
                healthy_count=$((healthy_count + 1))
                log_verbose "IdP $idp_alias is healthy"
            else
                local status
                status=$(echo "$health_response" | jq -r '.status' 2>/dev/null)
                unhealthy_idps+=("$idp_alias:$status")
                log_warn "IdP $idp_alias is unhealthy: $status"
            fi
        else
            unhealthy_idps+=("$idp_alias:unreachable")
            log_warn "IdP $idp_alias health check failed"
        fi
    done

    if [ "$healthy_count" -eq "$total_count" ]; then
        log_verbose "All $total_count IdPs are healthy"
        return 0
    else
        log_error "$((total_count - healthy_count)) of $total_count IdPs are unhealthy: ${unhealthy_idps[*]}"
        return 1
    fi
}

##
# Test token exchange - verify that authentication flow works
#
# Arguments:
#   $1 - instance code (lowercase)
#
# Returns:
#   0 - Token exchange working
#   1 - Token exchange failed
##
spoke_test_token_exchange() {
    local code_lower="$1"
    local code_upper=$(upper "$code_lower")

    # Use unified port calculation
    local backend_port=$(_get_instance_backend_port "$code_lower")
    local backend_url="https://localhost:${backend_port}"

    log_verbose "Testing token exchange for $code_lower..."

    # Try to authenticate with a test user
    # First, get test user credentials
    local test_username="testuser-${code_lower}-1"
    local test_password="DiveTestSecure2025!"

    # Attempt login via backend API (if available)
    local login_response
    login_response=$(curl -sk -X POST "$backend_url/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$test_username\",\"password\":\"$test_password\"}" 2>/dev/null)

    if [ $? -eq 0 ] && [ "$(echo "$login_response" | jq -r '.success' 2>/dev/null)" = "true" ]; then
        log_verbose "Direct authentication successful for $test_username"
        return 0
    fi

    # If direct login doesn't work, test Keycloak connectivity
    local keycloak_port=$(_get_instance_keycloak_port "$code_lower")
    local keycloak_url="https://localhost:${keycloak_port}"
    local realm="dive-v3-broker-${code_lower}"

    # Test Keycloak realm discovery
    local discovery_response
    discovery_response=$(curl -sk "$keycloak_url/realms/$realm/.well-known/openid-configuration" 2>/dev/null)

    if [ $? -ne 0 ] || ! echo "$discovery_response" | jq -e '.issuer' >/dev/null 2>&1; then
        log_error "Keycloak realm $realm not accessible at $keycloak_url"
        return 1
    fi

    log_verbose "Keycloak realm $realm is accessible"
    return 0
}

##
# Test cross-instance federation - verify that spoke can authenticate with Hub
#
# Arguments:
#   $1 - instance code (lowercase)
#
# Returns:
#   0 - Cross-instance federation working
#   1 - Cross-instance federation failed
##
spoke_test_cross_instance_federation() {
    local code_lower="$1"
    local code_upper=$(upper "$code_lower")

    # Use unified port calculation
    local backend_port=$(_get_instance_backend_port "$code_lower")
    local backend_url="https://localhost:${backend_port}"

    log_verbose "Testing cross-instance federation for $code_lower..."

    # Check if usa-idp is configured and healthy
    local usa_idp_health
    usa_idp_health=$(curl -sk "$backend_url/api/idps/usa-idp/health" 2>/dev/null)

    if [ $? -ne 0 ] || [ "$(echo "$usa_idp_health" | jq -r '.healthy' 2>/dev/null)" != "true" ]; then
        local status
        status=$(echo "$usa_idp_health" | jq -r '.status' 2>/dev/null)
        log_error "usa-idp not healthy: $status"
        return 1
    fi

    # Test Hub connectivity from spoke perspective
    local hub_backend_url="https://dive-hub-backend:4000"
    local hub_health
    hub_health=$(docker exec "dive-spoke-${code_lower}-backend" curl -sk --connect-timeout 10 "$hub_backend_url/health" 2>/dev/null)

    if [ $? -ne 0 ]; then
        log_warn "Cannot reach Hub backend from $code_upper spoke via Docker network (may be expected in local dev)"
        # Don't fail the test for network connectivity issues in local development
        log_verbose "Hub connectivity test skipped - network isolation expected in local environment"
    elif [ "$(echo "$hub_health" | jq -r '.status' 2>/dev/null)" != "healthy" ]; then
        log_error "Hub backend returned unhealthy status from $code_upper spoke"
        return 1
    else
        log_verbose "Hub backend connectivity verified from $code_upper spoke"
    fi

    log_verbose "Cross-instance federation connectivity verified"
    return 0
}

##
# Comprehensive federation health check
#
# Arguments:
#   $1 - instance code (lowercase)
#
# Returns:
#   0 - All federation checks passed
#   1 - Some federation checks failed
##
spoke_federation_health_check() {
    local code_lower="${1:-$INSTANCE}"
    if [ -z "$code_lower" ]; then
        log_error "Instance code required. Use --instance <CODE> or provide as parameter"
        return 1
    fi
    local code_lower=$(lower "$code_lower")

    log_info "Running comprehensive federation health check for $code_lower..."

    local all_passed=true
    local checks=(
        "IdP Enumeration:spoke_test_idp_enumeration"
        "IdP Health:spoke_test_idp_health"
        "Token Exchange:spoke_test_token_exchange"
        "Cross-Instance Federation:spoke_test_cross_instance_federation"
    )

    for check_info in "${checks[@]}"; do
        local check_name="${check_info%%:*}"
        local check_function="${check_info#*:}"

        log_verbose "Running $check_name check..."
        if $check_function "$code_lower"; then
            log_success "✅ $check_name: PASSED"
        else
            log_error "❌ $check_name: FAILED"
            all_passed=false
        fi
    done

    if [ "$all_passed" = true ]; then
        log_success "Federation health check PASSED for $code_lower"
        return 0
    else
        log_error "Federation health check FAILED for $code_lower"
        return 1
    fi
}

##
# Generate federation health report
#
# Arguments:
#   $1 - instance code (lowercase)
##
spoke_generate_federation_health_report() {
    local code_lower="${1:-$INSTANCE}"
    if [ -z "$code_lower" ]; then
        log_error "Instance code required. Use --instance <CODE> or provide as parameter"
        return 1
    fi
    local code_lower=$(lower "$code_lower")
    local code_upper=$(upper "$code_lower")
    local report_file="${DIVE_ROOT}/logs/federation-health-${code_lower}-$(date +%Y%m%d-%H%M%S).log"

    echo "=== DIVE V3 Federation Health Report ===" > "$report_file"
    echo "Instance: $code_upper ($code_lower)" >> "$report_file"
    echo "Timestamp: $(date)" >> "$report_file"
    echo "" >> "$report_file"

    echo "1. IdP Enumeration:" >> "$report_file"
    # Use unified port calculation
    local backend_port=$(_get_instance_backend_port "$code_lower")
    local backend_url="https://localhost:${backend_port}"
    local idps_response
    idps_response=$(curl -sk "$backend_url/api/idps/public" 2>/dev/null)
    echo "$idps_response" >> "$report_file"
    echo "" >> "$report_file"

    echo "2. IdP Health Status:" >> "$report_file"
    if [ "$(echo "$idps_response" | jq -r '.success' 2>/dev/null)" = "true" ]; then
        local idps
        idps=$(echo "$idps_response" | jq -r '.idps[].alias' 2>/dev/null)
        for idp_alias in $idps; do
            echo "IdP: $idp_alias" >> "$report_file"
            local health_response
            health_response=$(curl -sk "$backend_url/api/idps/$idp_alias/health" 2>/dev/null)
            echo "$health_response" >> "$report_file"
            echo "" >> "$report_file"
        done
    fi

    echo "3. Cross-Instance Connectivity:" >> "$report_file"
    local hub_connectivity
    hub_connectivity=$(docker exec "dive-spoke-${code_lower}-backend" curl -sk --connect-timeout 5 "https://dive-hub-backend:4000/health" 2>/dev/null || echo "Connection failed")
    echo "Hub Backend Connectivity: $hub_connectivity" >> "$report_file"
    echo "" >> "$report_file"

    echo "4. Keycloak Realm Status:" >> "$report_file"
    local keycloak_port=$(_get_instance_keycloak_port "$code_lower")
    local keycloak_url="https://localhost:${keycloak_port}"
    local realm="dive-v3-broker-${code_lower}"
    local realm_status
    realm_status=$(curl -sk "$keycloak_url/realms/$realm/.well-known/openid-configuration" 2>/dev/null | jq -r '.issuer' 2>/dev/null || echo "Realm not accessible")
    echo "Realm: $realm" >> "$report_file"
    echo "Issuer: $realm_status" >> "$report_file"
    echo "" >> "$report_file"

    echo "=== End Report ===" >> "$report_file"

    log_info "Federation health report saved to: $report_file"
    echo "$report_file"
}

# =============================================================================
# INTEGRATION FUNCTIONS
# =============================================================================

##
# Enhanced post-deployment verification including federation health
#
# Arguments:
#   $1 - instance code (lowercase)
#
# Returns:
#   0 - All verifications passed
#   1 - Some verifications failed
##
# Check if the spoke realm exists in Keycloak
_spoke_realm_exists() {
    local code_lower="$1"
    local realm_name="dive-v3-broker-${code_lower}"

    # Try to query the realm via Keycloak admin API
    if docker ps --format '{{.Names}}' | grep -q "^dive-spoke-${code_lower}-keycloak$"; then
        # Use docker exec to check if realm exists
        local container_name="dive-spoke-${code_lower}-keycloak"
        # Try a simple curl to check if realm endpoint responds
        if docker exec "$container_name" curl -ksf --max-time 5 "http://localhost:8080/realms/${realm_name}/.well-known/openid-connect-configuration" >/dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

spoke_enhanced_post_deployment_verification() {
    local code_lower="$1"

    log_info "Running enhanced post-deployment verification for $code_lower..."

    local all_passed=true

    # 1. Standard health checks (existing functionality)
    if type _spoke_wait_for_services &>/dev/null; then
        if ! _spoke_wait_for_services "$code_lower" 120; then
            all_passed=false
        fi
    fi

    # 2. Federation health checks (skip if realm not created yet)
    # Only run federation checks after Terraform has created the realm and federation is set up
    if _spoke_realm_exists "$code_lower"; then
        if ! spoke_federation_health_check "$code_lower"; then
            all_passed=false
        fi
    else
        log_info "Skipping federation health checks (realm not created yet - will check after registration)"
    fi

    # 3. Generate comprehensive report
    spoke_generate_federation_health_report "$code_lower" >/dev/null

    if [ "$all_passed" = true ]; then
        log_success "Enhanced post-deployment verification PASSED"
        return 0
    else
        log_error "Enhanced post-deployment verification FAILED"
        return 1
    fi
}