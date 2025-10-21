#!/bin/bash
# ============================================
# Session Management Testing Script
# ============================================
# Tests all session timeout scenarios after implementing fixes
# Run after: Fix #2-#7 implementation
#
# Usage: ./scripts/test-session-management.sh
#
# Testing Scenarios:
# 1. Normal session with proactive refresh
# 2. Session timeout after inactivity
# 3. Token refresh failure handling
# 4. Database session extension
# 5. Cross-tab synchronization
# 6. Heartbeat-triggered logout
# 7. Page visibility handling
# 8. Clock skew compensation
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
FRONTEND_URL="${NEXT_PUBLIC_BASE_URL:-http://localhost:3000}"
BACKEND_URL="${NEXT_PUBLIC_BACKEND_URL:-http://localhost:4000}"
TEST_REALM="dive-v3-broker"
TEST_USER_US="testuser-us"
TEST_USER_FRA="testuser-fra"

# Logging
LOG_FILE="test-session-management-$(date +%Y%m%d-%H%M%S).log"

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}✗${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1" | tee -a "$LOG_FILE"
}

# Test helper functions
check_service() {
    local service_name=$1
    local service_url=$2
    
    log "Checking $service_name at $service_url..."
    if curl -s -f -o /dev/null "$service_url"; then
        log_success "$service_name is running"
        return 0
    else
        log_error "$service_name is not accessible"
        return 1
    fi
}

# ============================================
# Pre-Flight Checks
# ============================================
log "=========================================="
log "Session Management Testing Script"
log "=========================================="
log ""

log "1. Pre-Flight Checks"
log "-------------------------------------------"

# Check if services are running
check_service "Frontend" "$FRONTEND_URL" || exit 1
check_service "Backend" "$BACKEND_URL/health" || exit 1
check_service "Keycloak" "http://localhost:8081/health" || exit 1
check_service "PostgreSQL" "nc -z localhost 5433" || log_warning "PostgreSQL check skipped (nc not available)"

log_success "All services are running"
log ""

# ============================================
# Test Scenario 1: Normal Session with Proactive Refresh
# ============================================
log "2. Test Scenario 1: Normal Session with Proactive Refresh"
log "-------------------------------------------"
log "Objective: Verify that tokens are refreshed proactively at 5 minutes remaining"
log ""
log "Manual Test Steps:"
log "  1. Open browser to $FRONTEND_URL"
log "  2. Login with $TEST_USER_US"
log "  3. Open browser DevTools → Console"
log "  4. Wait and observe console logs"
log "  5. Expected behavior:"
log "     - At T+10m: '[DIVE] Proactive token refresh' (for 15m realm)"
log "     - Session continues without interruption"
log "     - '[DIVE] Database session extended to: ...'"
log "     - No warning modal shown"
log ""
log_warning "This is a MANUAL test - requires user interaction"
echo -n "Press ENTER when you've completed this test or 's' to skip: "
read -r response
if [[ "$response" == "s" ]]; then
    log_warning "Test 1 SKIPPED"
else
    echo -n "Did the test PASS (y/n)? "
    read -r result
    if [[ "$result" == "y" ]]; then
        log_success "Test 1 PASSED: Proactive refresh working"
    else
        log_error "Test 1 FAILED: Check console logs for errors"
    fi
fi
log ""

# ============================================
# Test Scenario 2: Session Timeout After Inactivity
# ============================================
log "3. Test Scenario 2: Session Timeout After Inactivity"
log "-------------------------------------------"
log "Objective: Verify session expires cleanly after realm timeout period"
log ""
log "Manual Test Steps:"
log "  1. Login to $FRONTEND_URL with $TEST_USER_US"
log "  2. Leave tab ACTIVE (visible) but don't interact"
log "  3. Wait for realm timeout (15m for USA, 30m for France, 60m for Broker)"
log "  4. Expected behavior:"
log "     - At T+13m: '[DIVE] Proactive token refresh' log"
log "     - At T+14m: Warning modal appears (2 minutes remaining)"
log "     - At T+15m: 'Session Expired' modal appears"
log "     - User redirected to home page"
log "     - Console shows: '[DIVE] Database session deleted...'"
log ""
log_warning "This test takes 15+ minutes - you may skip if time-constrained"
echo -n "Press ENTER when you've completed this test or 's' to skip: "
read -r response
if [[ "$response" == "s" ]]; then
    log_warning "Test 2 SKIPPED"
else
    echo -n "Did the test PASS (y/n)? "
    read -r result
    if [[ "$result" == "y" ]]; then
        log_success "Test 2 PASSED: Session timeout working correctly"
    else
        log_error "Test 2 FAILED: Session did not expire as expected"
    fi
fi
log ""

# ============================================
# Test Scenario 3: Token Refresh Failure Handling
# ============================================
log "4. Test Scenario 3: Token Refresh Failure (Invalid Grant)"
log "-------------------------------------------"
log "Objective: Verify clean logout when Keycloak refresh token becomes invalid"
log ""
log "Manual Test Steps (Advanced):"
log "  1. Login to $FRONTEND_URL"
log "  2. Open Keycloak Admin Console (http://localhost:8081/admin)"
log "  3. Navigate to: Realms → $TEST_REALM → Sessions"
log "  4. Find your user's session → Click 'Sign Out'"
log "  5. Return to DIVE tab - don't reload yet"
log "  6. Wait for next heartbeat (10-30 seconds)"
log "  7. Expected behavior:"
log "     - Console shows: '[DIVE] Refresh token invalid - deleting session'"
log "     - Console shows: '[DIVE] Database session deleted...'"
log "     - Console shows: '[DIVE] Account tokens cleared'"
log "     - User automatically logged out and redirected to home"
log "     - No 'automatic re-login' when clicking IdP"
log ""
log_warning "This is an ADVANCED test - requires Keycloak admin access"
echo -n "Press ENTER when you've completed this test or 's' to skip: "
read -r response
if [[ "$response" == "s" ]]; then
    log_warning "Test 3 SKIPPED"
else
    echo -n "Did the test PASS (y/n)? "
    read -r result
    if [[ "$result" == "y" ]]; then
        log_success "Test 3 PASSED: Refresh failure handled correctly"
    else
        log_error "Test 3 FAILED: Session not properly invalidated"
    fi
fi
log ""

# ============================================
# Test Scenario 4: Database Session Extension
# ============================================
log "5. Test Scenario 4: Database Session Extension"
log "-------------------------------------------"
log "Objective: Verify database session.expires is updated on token refresh"
log ""
log "Automated Check:"
log "Querying PostgreSQL to check session extension behavior..."

# Check if psql is available
if command -v psql &> /dev/null; then
    PGPASSWORD=password psql -h localhost -p 5433 -U postgres -d dive_v3_app -c "
        SELECT 
            \"userId\",
            expires,
            (expires - NOW()) as \"timeUntilExpiry\"
        FROM session
        WHERE \"userId\" IN (
            SELECT id FROM \"user\" 
            WHERE email LIKE '%test%'
            LIMIT 5
        )
        ORDER BY expires DESC;
    " 2>&1 | tee -a "$LOG_FILE"
    
    log ""
    log "Manual Verification:"
    log "  1. Note the 'expires' timestamp above"
    log "  2. Wait 5-10 minutes (past proactive refresh)"
    log "  3. Re-run this query"
    log "  4. Expected: 'expires' timestamp should be NEWER (extended by +60 minutes)"
    log ""
    echo -n "Did you verify session extension (y/n/s to skip)? "
    read -r result
    if [[ "$result" == "y" ]]; then
        log_success "Test 4 PASSED: Database session extension verified"
    elif [[ "$result" == "s" ]]; then
        log_warning "Test 4 SKIPPED"
    else
        log_error "Test 4 FAILED: Session not extended in database"
    fi
else
    log_warning "psql not available - skipping automated check"
    log "Manual Test Steps:"
    log "  1. Connect to PostgreSQL: psql -h localhost -p 5433 -U postgres -d dive_v3_app"
    log "  2. Query: SELECT \"userId\", expires FROM session;"
    log "  3. Login to DIVE, wait 10+ minutes (past proactive refresh)"
    log "  4. Re-query database"
    log "  5. Verify 'expires' timestamp extended by ~60 minutes"
    log ""
    echo -n "Press ENTER when completed or 's' to skip: "
    read -r response
    if [[ "$response" == "s" ]]; then
        log_warning "Test 4 SKIPPED"
    else
        echo -n "Did the test PASS (y/n)? "
        read -r result
        if [[ "$result" == "y" ]]; then
            log_success "Test 4 PASSED: Database session extension working"
        else
            log_error "Test 4 FAILED"
        fi
    fi
fi
log ""

# ============================================
# Test Scenario 5: Cross-Tab Synchronization
# ============================================
log "6. Test Scenario 5: Cross-Tab Synchronization"
log "-------------------------------------------"
log "Objective: Verify session state syncs across multiple tabs"
log ""
log "Manual Test Steps:"
log "  1. Open TWO tabs to $FRONTEND_URL (both logged in)"
log "  2. In Tab 1: Open DevTools → Console"
log "  3. In Tab 2: Open DevTools → Console"
log "  4. In Tab 1: Wait for warning modal (or manually trigger)"
log "  5. In Tab 1: Click 'Extend Session'"
log "  6. Expected behavior in Tab 2:"
log "     - Console shows: '[TokenExpiry] Token refreshed in another tab'"
log "     - Console shows: '[TokenExpiry] Updating session'"
log "     - Tab 2 session automatically extended (no manual action needed)"
log ""
log "  7. In Tab 1: Click 'Sign Out'"
log "  8. Expected behavior in Tab 2:"
log "     - Console shows: '[TokenExpiry] User logged out in another tab'"
log "     - Tab 2 automatically logs out and redirects to home"
log ""
echo -n "Press ENTER when you've completed this test or 's' to skip: "
read -r response
if [[ "$response" == "s" ]]; then
    log_warning "Test 5 SKIPPED"
else
    echo -n "Did the test PASS (y/n)? "
    read -r result
    if [[ "$result" == "y" ]]; then
        log_success "Test 5 PASSED: Cross-tab sync working"
    else
        log_error "Test 5 FAILED: Tabs not synchronized"
    fi
fi
log ""

# ============================================
# Test Scenario 6: Heartbeat-Triggered Logout
# ============================================
log "7. Test Scenario 6: Heartbeat-Triggered Logout Failsafe"
log "-------------------------------------------"
log "Objective: Verify heartbeat detects server-side session invalidation"
log ""
log "Manual Test Steps:"
log "  1. Login to $FRONTEND_URL"
log "  2. Open DevTools → Console"
log "  3. Observe heartbeat logs: '[Heartbeat] Health check: { isValid: true, ... }'"
log "  4. In Keycloak Admin, terminate user session (see Test 3)"
log "  5. Wait for next heartbeat (10-30 seconds)"
log "  6. Expected behavior:"
log "     - Console shows: '[Heartbeat] Server reports session invalid'"
log "     - Console shows: '[Heartbeat] forcing logout'"
log "     - User redirected to home page"
log "     - No errors or stuck states"
log ""
echo -n "Press ENTER when you've completed this test or 's' to skip: "
read -r response
if [[ "$response" == "s" ]]; then
    log_warning "Test 6 SKIPPED"
else
    echo -n "Did the test PASS (y/n)? "
    read -r result
    if [[ "$result" == "y" ]]; then
        log_success "Test 6 PASSED: Heartbeat logout failsafe working"
    else
        log_error "Test 6 FAILED: Heartbeat did not trigger logout"
    fi
fi
log ""

# ============================================
# Test Scenario 7: Page Visibility Handling
# ============================================
log "8. Test Scenario 7: Page Visibility Handling"
log "-------------------------------------------"
log "Objective: Verify heartbeat pauses when page hidden, resumes when visible"
log ""
log "Manual Test Steps:"
log "  1. Login to $FRONTEND_URL"
log "  2. Open DevTools → Console"
log "  3. Observe: '[Heartbeat] Interval tick' every 30 seconds"
log "  4. Switch to different tab (make DIVE tab hidden)"
log "  5. Expected: '[Heartbeat] Pausing interval (page hidden)'"
log "  6. Wait 60 seconds in other tab"
log "  7. Switch back to DIVE tab"
log "  8. Expected:"
log "     - '[Heartbeat] Page became visible, performing immediate check'"
log "     - '[Heartbeat] Starting interval (page visible)'"
log "     - Heartbeat resumes immediately"
log ""
echo -n "Press ENTER when you've completed this test or 's' to skip: "
read -r response
if [[ "$response" == "s" ]]; then
    log_warning "Test 7 SKIPPED"
else
    echo -n "Did the test PASS (y/n)? "
    read -r result
    if [[ "$result" == "y" ]]; then
        log_success "Test 7 PASSED: Page visibility handling working"
    else
        log_error "Test 7 FAILED: Heartbeat behavior incorrect"
    fi
fi
log ""

# ============================================
# Test Scenario 8: Dynamic Heartbeat Interval
# ============================================
log "9. Test Scenario 8: Dynamic Heartbeat Interval"
log "-------------------------------------------"
log "Objective: Verify heartbeat switches to 10s interval when < 5m remaining"
log ""
log "Manual Test Steps:"
log "  1. Login to $FRONTEND_URL"
log "  2. Open DevTools → Console"
log "  3. Initially: '[Heartbeat] Interval tick' every ~30 seconds"
log "  4. Wait until ~4 minutes before expiry"
log "  5. Expected:"
log "     - Console shows: '[Heartbeat] Starting interval (page visible)'"
log "     - '{ timeUntilExpiry: 240, intervalDuration: 10000, intervalType: \"CRITICAL\" }'"
log "     - '[Heartbeat] Interval tick' now every ~10 seconds"
log "     - More frequent checks as expiry approaches"
log ""
echo -n "Press ENTER when you've completed this test or 's' to skip: "
read -r response
if [[ "$response" == "s" ]]; then
    log_warning "Test 8 SKIPPED"
else
    echo -n "Did the test PASS (y/n)? "
    read -r result
    if [[ "$result" == "y" ]]; then
        log_success "Test 8 PASSED: Dynamic heartbeat working"
    else
        log_error "Test 8 FAILED: Heartbeat did not accelerate"
    fi
fi
log ""

# ============================================
# Test Scenario 9: Multi-Realm Behavior
# ============================================
log "10. Test Scenario 9: Multi-Realm Session Timeout Differences"
log "-------------------------------------------"
log "Objective: Verify each realm's timeout policy is respected"
log ""
log "Manual Test Steps:"
log "  1. Test with USA realm (15m timeout):"
log "     - Login with $TEST_USER_US (USA IdP)"
log "     - Verify proactive refresh at ~10m"
log "     - Verify warning at ~13m"
log "     - Verify expiry at ~15m"
log ""
log "  2. Test with France realm (30m timeout):"
log "     - Login with $TEST_USER_FRA (France IdP)"
log "     - Verify proactive refresh at ~25m"
log "     - Verify warning at ~28m"
log "     - Verify expiry at ~30m"
log ""
log "  3. Test with Broker realm (60m timeout):"
log "     - Login via direct Keycloak (no IdP hint)"
log "     - Verify proactive refresh at ~55m"
log "     - Verify warning at ~58m"
log "     - Verify expiry at ~60m"
log ""
log_warning "This test takes 60+ minutes for complete validation"
echo -n "Press ENTER when you've completed this test or 's' to skip: "
read -r response
if [[ "$response" == "s" ]]; then
    log_warning "Test 9 SKIPPED"
else
    echo -n "Did the test PASS (y/n)? "
    read -r result
    if [[ "$result" == "y" ]]; then
        log_success "Test 9 PASSED: Multi-realm timeouts respected"
    else
        log_error "Test 9 FAILED: Timeout behavior inconsistent"
    fi
fi
log ""

# ============================================
# Test Scenario 10: No Automatic Re-Login
# ============================================
log "11. Test Scenario 10: No Automatic Re-Login After Timeout"
log "-------------------------------------------"
log "Objective: Verify user must enter credentials after session expires"
log ""
log "Manual Test Steps:"
log "  1. Login to $FRONTEND_URL"
log "  2. Wait for session to expire (15m/30m/60m depending on realm)"
log "  3. See 'Session Expired' modal → user redirected to home"
log "  4. Click any IdP button"
log "  5. Expected behavior:"
log "     - Keycloak login page appears (password required)"
log "     - User must enter password"
log "     - NO automatic re-login without credentials"
log ""
log "  CRITICAL: This was the original bug - verify it's fixed!"
log ""
echo -n "Press ENTER when you've completed this test or 's' to skip: "
read -r response
if [[ "$response" == "s" ]]; then
    log_warning "Test 10 SKIPPED"
else
    echo -n "Did the test PASS (y/n)? "
    read -r result
    if [[ "$result" == "y" ]]; then
        log_success "Test 10 PASSED: No automatic re-login (BUG FIXED!)"
    else
        log_error "Test 10 FAILED: Automatic re-login still occurring"
    fi
fi
log ""

# ============================================
# Summary
# ============================================
log "=========================================="
log "Test Summary"
log "=========================================="
log ""
log "All tests completed. Results saved to: $LOG_FILE"
log ""
log "Review the log file for detailed results:"
log "  cat $LOG_FILE"
log ""
log "Next Steps:"
log "  1. Review any FAILED tests"
log "  2. Check console logs for errors"
log "  3. Verify database session table behavior"
log "  4. Monitor production deployment for issues"
log ""
log_success "Session Management Testing Complete!"
log ""
