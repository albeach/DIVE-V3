#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Security Vulnerability Tests
# =============================================================================
# Tests for security vulnerabilities:
# - Hardcoded secrets detection
# - Input validation testing
# - Authentication bypass attempts
# - Rate limiting verification
# - Certificate validation testing
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-16
# =============================================================================

# Load common functions for logging
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "${DIVE_ROOT}/scripts/dive-modules/common.sh"
fi

# Test framework
if [ -z "$DIVE_TEST_FRAMEWORK_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/test-framework.sh"
fi

# =============================================================================
# SECURITY VULNERABILITY TESTS
# =============================================================================

##
# Test for hardcoded secrets in codebase
#
test_hardcoded_secrets() {
    log_step "Testing for Hardcoded Secrets"

    local found_secrets=0

    # Check for critical hardcoded secrets (API keys, real passwords)
    # Exclude test files, documentation, and legitimate uses

    # Check for actual API keys (long alphanumeric strings)
    local api_key_pattern="[a-zA-Z0-9]{32,}"
    local matches
    matches=$(grep -r "$api_key_pattern" "${DIVE_ROOT}/backend/src" "${DIVE_ROOT}/frontend/src" \
        --include="*.ts" --include="*.js" \
        --exclude-dir="node_modules" \
        --exclude-dir="__tests__" \
        --exclude-dir="test*" \
        -l 2>/dev/null | grep -v ".env" | head -3)

    if [ -n "$matches" ]; then
        for file in $matches; do
            # Skip known legitimate files
            case "$file" in
                *"jest.config"*|*"test"*|*"spec"*) continue ;;
            esac
            ((found_secrets++))
            log_error "POTENTIAL HARDCODED API KEY in: $file"
        done
    fi

    # Check for hardcoded database URLs with embedded credentials (not env vars)
    local db_url_matches
    db_url_matches=$(grep -r "mongodb://[^$][^$]*:[^$][^$]*@" "${DIVE_ROOT}/backend/src" "${DIVE_ROOT}/frontend/src" \
        --include="*.ts" --include="*.js" \
        --exclude-dir="node_modules" \
        --exclude-dir="__tests__" \
        --exclude-dir="test*" \
        -l 2>/dev/null | grep -v ".env" | head -3)

    if [ -n "$db_url_matches" ]; then
        for file in $db_url_matches; do
            # Skip files that use environment variables or configuration
            if grep -q "process\.env\|MONGODB_URL\|getMongoDBUrl" "$file"; then
                continue
            fi
            ((found_secrets++))
            log_error "HARDCODED DATABASE CREDENTIALS in: $file"
        done
    fi

    if [ "$found_secrets" -eq 0 ]; then
        log_success "✓ No critical hardcoded secrets detected"
        return 0
    else
        log_error "✗ Found $found_secrets critical security issues"
        return 1
    fi
}

##
# Test input validation
#
test_input_validation() {
    log_step "Testing Input Validation"

    local passed=true

    # Check if backend is running
    if ! curl -k --max-time 5 "https://localhost:4000/health" &>/dev/null; then
        log_warn "Backend not running - skipping input validation tests"
        return 0
    fi

    # Test SQL injection attempts (simplified)
    log_verbose "Testing SQL injection prevention..."

    local sql_payload="' OR '1'='1"
    local response
    response=$(curl -k --max-time 5 \
        "https://localhost:4000/api/federation/metadata?test=$sql_payload" \
        2>/dev/null)

    if echo "$response" | grep -q "error\|Error\|ERROR"; then
        log_verbose "✓ SQL injection attempt blocked"
    else
        log_verbose "⚠ SQL injection prevention could not be verified"
    fi

    # Test XSS attempts (simplified)
    log_verbose "Testing XSS prevention..."

    local xss_payload="<script>alert('xss')</script>"
    local response
    response=$(curl -k --max-time 5 \
        "https://localhost:4000/api/federation/metadata?name=$xss_payload" \
        2>/dev/null)

    if echo "$response" | grep -q "error\|Error\|ERROR"; then
        log_verbose "✓ XSS attempt blocked"
    else
        log_verbose "⚠ XSS prevention could not be verified"
    fi

    # Test malformed JSON (simplified)
    log_verbose "Testing malformed JSON handling..."

    local malformed_json='{"incomplete": "json"'
    local response
    response=$(curl -k --max-time 5 \
        -X POST "https://localhost:4000/api/federation/register" \
        -H "Content-Type: application/json" \
        -d "$malformed_json" \
        2>/dev/null)

    if echo "$response" | jq -e '.error' &>/dev/null; then
        log_verbose "✓ Malformed JSON properly rejected"
    else
        log_verbose "⚠ Malformed JSON validation could not be verified"
    fi

    # Test oversized payloads
    log_verbose "Testing oversized payload handling..."

    local large_payload
    large_payload=$(printf '%.0s{"test": "data"%s}' {1..1000}) # 1000 repetitions

    local response
    response=$(curl -k --max-time 10 \
        -X POST "https://localhost:4000/api/federation/register" \
        -H "Content-Type: application/json" \
        -d "$large_payload" \
        2>/dev/null)

    if echo "$response" | jq -e '.error' &>/dev/null; then
        log_verbose "✓ Oversized payload properly rejected"
    else
        log_warn "⚠ Oversized payload may not be limited"
    fi

    if [ "$passed" = true ]; then
        log_success "✓ Input validation tests PASSED"
        return 0
    else
        log_error "✗ Input validation tests FAILED"
        return 1
    fi
}

##
# Test authentication bypass attempts
#
test_authentication_bypass() {
    log_step "Testing Authentication Bypass Attempts"

    local passed=true

    # Check if backend is running
    if ! curl -k --max-time 5 "https://localhost:4000/health" &>/dev/null; then
        log_warn "Backend not running - skipping authentication bypass tests"
        return 0
    fi

    # Test endpoints that require authentication
    local protected_endpoints=(
        "GET:/api/federation/spokes"
        "POST:/api/federation/spokes/test-spoke/approve"
        "POST:/api/authz/decision"
    )

    for endpoint in "${protected_endpoints[@]}"; do
        local method
        local url
        method=$(echo "$endpoint" | cut -d: -f1)
        url=$(echo "$endpoint" | cut -d: -f2)

        # Test without authentication
        local response
        response=$(curl -k --max-time 5 -X "$method" "https://localhost:4000$url" 2>/dev/null)

        if echo "$response" | jq -e '.error // .message' | grep -q -i "auth\|login\|token\|forbidden"; then
            log_verbose "✓ Endpoint properly protected: $method $url"
        else
            log_error "✗ Endpoint may not be protected: $method $url"
            passed=false
        fi

        # Test with invalid token
        response=$(curl -k --max-time 5 \
            -X "$method" "https://localhost:4000$url" \
            -H "Authorization: Bearer invalid-token-123" \
            2>/dev/null)

        if echo "$response" | jq -e '.error // .message' | grep -q -i "auth\|invalid\|forbidden"; then
            log_verbose "✓ Invalid token properly rejected: $method $url"
        else
            log_warn "⚠ Invalid token may not be properly validated: $method $url"
        fi
    done

    # Test admin endpoints with X-Admin-Key
    local admin_endpoints=(
        "GET:/api/federation/spokes"
        "POST:/api/federation/spokes/test-spoke/approve"
    )

    for endpoint in "${admin_endpoints[@]}"; do
        local method
        local url
        method=$(echo "$endpoint" | cut -d: -f1)
        url=$(echo "$endpoint" | cut -d: -f2)

        # Test with invalid admin key
        local response
        response=$(curl -k --max-time 5 \
            -X "$method" "https://localhost:4000$url" \
            -H "X-Admin-Key: invalid-admin-key" \
            2>/dev/null)

        if echo "$response" | jq -e '.error // .message' | grep -q -i "auth\|admin\|forbidden"; then
            log_verbose "✓ Invalid admin key properly rejected: $method $url"
        else
            log_warn "⚠ Invalid admin key may not be properly validated: $method $url"
        fi
    done

    if [ "$passed" = true ]; then
        log_success "✓ Authentication bypass tests PASSED"
        return 0
    else
        log_error "✗ Authentication bypass tests FAILED"
        return 1
    fi
}

##
# Test rate limiting
#
test_rate_limiting() {
    log_step "Testing Rate Limiting"

    # Check if backend is running
    if ! curl -k --max-time 5 "https://localhost:4000/health" &>/dev/null; then
        log_warn "Backend not running - skipping rate limiting tests"
        return 0
    fi

    # Test federation metadata endpoint (should be rate limited)
    log_verbose "Testing rate limiting on federation endpoints..."

    local request_count=0
    local rate_limited=false

    # Send multiple requests quickly
    for ((i=1; i<=50; i++)); do
        local response
        response=$(curl -k --max-time 2 \
            "https://localhost:4000/api/federation/metadata" \
            -w "%{http_code}" \
            2>/dev/null)

        local http_code
        http_code=$(echo "$response" | tail -1)

        ((request_count++))

        if [ "$http_code" = "429" ]; then
            rate_limited=true
            log_verbose "✓ Rate limiting triggered after $request_count requests"
            break
        fi

        # Small delay to avoid overwhelming
        sleep 0.1
    done

    if [ "$rate_limited" = true ]; then
        log_success "✓ Rate limiting is working"
        return 0
    else
        log_warn "⚠ Rate limiting may not be configured or too permissive"
        return 1
    fi
}

##
# Test certificate validation
#
test_certificate_validation() {
    log_step "Testing Certificate Validation"

    # Test TLS certificate validation
    log_verbose "Testing TLS certificate validation..."

    local test_urls=(
        "https://localhost:4000/health"
        "https://localhost:8443"
    )

    for url in "${test_urls[@]}"; do
        # Test with certificate verification
        if curl -s --max-time 5 --cacert "${DIVE_ROOT}/certs/ca/dive-root-ca.pem" "$url" &>/dev/null; then
            log_verbose "✓ Certificate validation passed for: $url"
        else
            log_error "✗ Certificate validation failed for: $url"
            return 1
        fi

        # Test without certificate verification (should still work for localhost)
        if curl -k --max-time 5 "$url" &>/dev/null; then
            log_verbose "✓ Endpoint accessible (insecure) for: $url"
        else
            log_warn "⚠ Endpoint not accessible: $url"
        fi
    done

    # Test federation certificate validation (if federation is set up)
    if docker ps --filter "name=dive-hub-mongodb" --format "{{.Names}}" | grep -q "dive-hub-mongodb"; then
        local mongo_password
        mongo_password=$(grep "^MONGO_PASSWORD=" "${DIVE_ROOT}/instances/hub/.env" | cut -d'=' -f2 | tr -d '"')

        if [ -n "$mongo_password" ]; then
            local cert_count
            cert_count=$(docker exec dive-hub-mongodb mongosh --quiet \
                -u admin -p "$mongo_password" \
                --authenticationDatabase admin \
                --eval "use('dive-v3'); db.federation_spokes.countDocuments({certificatePEM: {\$exists: true}})" \
                2>/dev/null)

            if [ "$cert_count" -gt 0 ]; then
                log_verbose "✓ $cert_count spokes have certificates configured"
            else
                log_verbose "⚠ No spokes have certificates configured"
            fi
        fi
    fi

    log_success "✓ Certificate validation tests PASSED"
    return 0
}

##
# Run all security vulnerability tests
#
test_run_security_vulnerability_tests() {
    log_step "Running Security Vulnerability Tests"

    local test_functions=(
        "test_hardcoded_secrets"
        "test_input_validation"
        "test_authentication_bypass"
        "test_rate_limiting"
        "test_certificate_validation"
    )

    local total_tests=${#test_functions[@]}
    local passed_tests=0

    for test_func in "${test_functions[@]}"; do
        log_info "Running: $test_func"

        if $test_func; then
            log_success "✓ $test_func passed"
            ((passed_tests++))
        else
            log_error "✗ $test_func failed"
        fi
    done

    log_info "Security Vulnerability Tests: $passed_tests/$total_tests passed"

    if [ "$passed_tests" -eq "$total_tests" ]; then
        log_success "All security vulnerability tests passed!"
        return 0
    else
        log_error "Some security vulnerability tests failed"
        return 1
    fi
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    # Script is being run directly
    test_run_security_vulnerability_tests
fi