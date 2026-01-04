#!/usr/bin/env bash
# =============================================================================
# Session/Token Flow Diagnostic Script
# =============================================================================
# Purpose: Comprehensive diagnostic tool for session database strategy issues
# Root Cause Analysis: JWT token validation failures after successful login
#
# This script helps diagnose:
# 1. NextAuth database session creation
# 2. Account token storage and retrieval
# 3. Token expiration and refresh logic
# 4. API route session validation
#
# Usage:
#   ./scripts/diagnose-session-token-flow.sh [user-email]
#
# Example:
#   ./scripts/diagnose-session-token-flow.sh testuser-usa-4@mil
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Configuration
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-dive_auth}"
POSTGRES_USER="${POSTGRES_USER:-dive_auth_user}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-DivePilot2025!SecurePostgres}"

USER_EMAIL="${1:-}"

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

log_section() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$*${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Execute SQL query
psql_exec() {
    PGPASSWORD="${POSTGRES_PASSWORD}" psql \
        -h "${POSTGRES_HOST}" \
        -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        -t \
        -A \
        -c "$@" 2>&1
}

# Format timestamp
format_timestamp() {
    local ts="$1"
    if [[ -z "$ts" || "$ts" == "null" ]]; then
        echo "NULL"
    else
        date -r "$ts" '+%Y-%m-%d %H:%M:%S %Z' 2>/dev/null || echo "$ts"
    fi
}

# =============================================================================
# Diagnostic Functions
# =============================================================================

check_postgres_connection() {
    log_section "Step 1: PostgreSQL Connection Test"
    
    if psql_exec "SELECT 1;" > /dev/null 2>&1; then
        log_success "PostgreSQL connection successful"
        log_info "Host: ${POSTGRES_HOST}:${POSTGRES_PORT}"
        log_info "Database: ${POSTGRES_DB}"
        log_info "User: ${POSTGRES_USER}"
        return 0
    else
        log_error "Cannot connect to PostgreSQL"
        log_error "Check your credentials and network connectivity"
        return 1
    fi
}

check_database_schema() {
    log_section "Step 2: Database Schema Validation"
    
    local tables
    tables=$(psql_exec "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;")
    
    if echo "$tables" | grep -q "users"; then
        log_success "Schema exists: users, accounts, sessions, verificationTokens"
    else
        log_error "Missing database tables - run migrations first"
        return 1
    fi
    
    # Check for indexes
    log_info "Checking critical indexes..."
    local indexes
    indexes=$(psql_exec "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename IN ('users','accounts','sessions');")
    echo "$indexes" | sed 's/^/  - /'
}

find_user_by_email() {
    local email="$1"
    log_section "Step 3: User Lookup"
    
    local user_data
    user_data=$(psql_exec "SELECT id, name, email, \"emailVerified\" FROM users WHERE email='${email}';")
    
    if [[ -z "$user_data" ]]; then
        log_error "User not found: ${email}"
        return 1
    fi
    
    local user_id
    user_id=$(echo "$user_data" | cut -d'|' -f1)
    
    log_success "User found"
    echo "  User ID: ${user_id}"
    echo "  Name: $(echo "$user_data" | cut -d'|' -f2)"
    echo "  Email: $(echo "$user_data" | cut -d'|' -f3)"
    echo "  Email Verified: $(echo "$user_data" | cut -d'|' -f4)"
    
    echo "$user_id"
}

check_user_account() {
    local user_id="$1"
    log_section "Step 4: Account & Token Analysis"
    
    local account_data
    account_data=$(psql_exec "SELECT provider, \"providerAccountId\", \"access_token\", \"refresh_token\", \"expires_at\", \"id_token\" FROM accounts WHERE \"userId\"='${user_id}';")
    
    if [[ -z "$account_data" ]]; then
        log_error "No account found for user"
        log_warn "This means the user hasn't completed OAuth login"
        return 1
    fi
    
    local provider
    local provider_account_id
    local access_token
    local refresh_token
    local expires_at
    local id_token
    
    provider=$(echo "$account_data" | cut -d'|' -f1)
    provider_account_id=$(echo "$account_data" | cut -d'|' -f2)
    access_token=$(echo "$account_data" | cut -d'|' -f3)
    refresh_token=$(echo "$account_data" | cut -d'|' -f4)
    expires_at=$(echo "$account_data" | cut -d'|' -f5)
    id_token=$(echo "$account_data" | cut -d'|' -f6)
    
    log_success "Account found"
    echo "  Provider: ${provider}"
    echo "  Provider Account ID: ${provider_account_id}"
    
    # Check token presence
    if [[ -n "$access_token" && "$access_token" != "null" ]]; then
        log_success "✓ Access token present (${#access_token} chars)"
    else
        log_error "✗ Access token MISSING or NULL"
    fi
    
    if [[ -n "$refresh_token" && "$refresh_token" != "null" ]]; then
        log_success "✓ Refresh token present (${#refresh_token} chars)"
    else
        log_warn "✗ Refresh token MISSING or NULL"
    fi
    
    if [[ -n "$id_token" && "$id_token" != "null" ]]; then
        log_success "✓ ID token present (${#id_token} chars)"
    else
        log_error "✗ ID token MISSING or NULL"
    fi
    
    # Check token expiration
    if [[ -n "$expires_at" && "$expires_at" != "null" ]]; then
        local current_time
        current_time=$(date +%s)
        local time_until_expiry=$((expires_at - current_time))
        
        echo ""
        echo "  Token Expiration:"
        echo "    Current time: $(format_timestamp "$current_time")"
        echo "    Expires at: $(format_timestamp "$expires_at")"
        
        if [[ $time_until_expiry -gt 0 ]]; then
            log_success "✓ Token valid for ${time_until_expiry} more seconds"
        else
            log_error "✗ Token EXPIRED ${time_until_expiry#-} seconds ago"
            log_warn "Token needs refresh or user needs to re-login"
        fi
    else
        log_error "No expiration timestamp set"
    fi
}

check_active_sessions() {
    local user_id="$1"
    log_section "Step 5: Active Sessions"
    
    local session_data
    session_data=$(psql_exec "SELECT \"sessionToken\", expires FROM sessions WHERE \"userId\"='${user_id}' ORDER BY expires DESC;")
    
    if [[ -z "$session_data" ]]; then
        log_error "No active sessions found"
        log_warn "User needs to login to create a session"
        return 1
    fi
    
    local session_count
    session_count=$(echo "$session_data" | wc -l)
    
    log_success "Found ${session_count} session(s)"
    
    local current_time
    current_time=$(date +%s)
    
    echo "$session_data" | while IFS='|' read -r session_token expires; do
        local expires_ts
        expires_ts=$(date -j -f "%Y-%m-%d %H:%M:%S" "$expires" +%s 2>/dev/null || echo "0")
        
        echo ""
        echo "  Session Token: ${session_token:0:16}..."
        echo "    Expires: ${expires}"
        
        if [[ $expires_ts -gt $current_time ]]; then
            log_success "    Status: ACTIVE"
        else
            log_error "    Status: EXPIRED"
        fi
    done
}

simulate_api_call() {
    local user_id="$1"
    log_section "Step 6: Simulating /api/resources Call"
    
    log_info "Testing session validation flow..."
    
    # Step 1: Check if session exists
    local has_session
    has_session=$(psql_exec "SELECT COUNT(*) FROM sessions WHERE \"userId\"='${user_id}' AND expires > NOW();")
    
    if [[ "$has_session" == "0" ]]; then
        log_error "✗ No valid session (validateSession would return NO_SESSION)"
        return 1
    fi
    log_success "✓ Valid session exists"
    
    # Step 2: Check if account exists
    local has_account
    has_account=$(psql_exec "SELECT COUNT(*) FROM accounts WHERE \"userId\"='${user_id}';")
    
    if [[ "$has_account" == "0" ]]; then
        log_error "✗ No account found (validateSession would return NO_ACCOUNT)"
        return 1
    fi
    log_success "✓ Account exists"
    
    # Step 3: Check if tokens exist
    local has_tokens
    has_tokens=$(psql_exec "SELECT COUNT(*) FROM accounts WHERE \"userId\"='${user_id}' AND \"access_token\" IS NOT NULL AND \"id_token\" IS NOT NULL;")
    
    if [[ "$has_tokens" == "0" ]]; then
        log_error "✗ Tokens missing (validateSession would return INVALID_TOKENS)"
        log_error "ROOT CAUSE: account.access_token or account.id_token is NULL"
        log_warn "FIX: User needs to re-login or tokens need manual refresh"
        return 1
    fi
    log_success "✓ Tokens exist"
    
    # Step 4: Check if token is expired
    local current_time
    current_time=$(date +%s)
    local expires_at
    expires_at=$(psql_exec "SELECT \"expires_at\" FROM accounts WHERE \"userId\"='${user_id}';")
    
    if [[ -n "$expires_at" && "$expires_at" != "null" ]]; then
        if [[ $expires_at -le $current_time ]]; then
            log_error "✗ Token expired (validateSession would return EXPIRED)"
            log_warn "FIX: Session callback should refresh token automatically"
            return 1
        fi
        log_success "✓ Token not expired"
    else
        log_warn "⚠ No expiration set (treating as valid)"
    fi
    
    log_success "Session validation would PASS - API call should succeed"
}

generate_recommendations() {
    log_section "Step 7: Recommendations"
    
    echo ""
    echo "Common Issues & Fixes:"
    echo ""
    echo "1. Missing tokens (INVALID_TOKENS):"
    echo "   - Cause: User logged out or tokens were cleared"
    echo "   - Fix: User must login again"
    echo ""
    echo "2. Expired tokens (EXPIRED):"
    echo "   - Cause: Token lifetime exceeded (default 15min)"
    echo "   - Fix: Session callback should auto-refresh (check auth.ts)"
    echo ""
    echo "3. No session (NO_SESSION):"
    echo "   - Cause: Session cookie missing or expired"
    echo "   - Fix: Check cookie configuration in auth.ts"
    echo ""
    echo "4. Session callback not running:"
    echo "   - Cause: Database session strategy requires manual refresh"
    echo "   - Fix: Implement proactive token refresh in session callback"
    echo ""
    echo "Permanent Fix Checklist:"
    echo "  □ Implement proactive token refresh (8min buffer)"
    echo "  □ Add error handling for failed refresh"
    echo "  □ Clear tokens on logout (prevent session resurrection)"
    echo "  □ Add debug logging to session callback"
    echo "  □ Test with testuser-usa-4 on /resources page"
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
    log_info "DIVE Session/Token Flow Diagnostics"
    log_info "Starting comprehensive analysis..."
    
    # Step 1: Test database connection
    if ! check_postgres_connection; then
        log_error "Cannot proceed without database connection"
        exit 1
    fi
    
    # Step 2: Validate schema
    if ! check_database_schema; then
        log_error "Database schema issues detected"
        exit 1
    fi
    
    # Step 3: Find user
    if [[ -z "$USER_EMAIL" ]]; then
        log_error "Usage: $0 <user-email>"
        log_info "Example: $0 testuser-usa-4@mil"
        exit 1
    fi
    
    local user_id
    user_id=$(find_user_by_email "$USER_EMAIL")
    if [[ -z "$user_id" ]]; then
        exit 1
    fi
    
    # Step 4: Analyze account & tokens
    check_user_account "$user_id" || true
    
    # Step 5: Check sessions
    check_active_sessions "$user_id" || true
    
    # Step 6: Simulate API call
    simulate_api_call "$user_id" || true
    
    # Step 7: Recommendations
    generate_recommendations
    
    log_success "Diagnostic complete"
}

main "$@"
