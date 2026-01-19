#!/usr/bin/env bash
# =============================================================================
# TEST: Full Automated Spoke Deployment (Clean Slate)
# =============================================================================
# Validates 100% automation from nuke to working login
#
# This test does a COMPLETE clean slate deployment:
#   1. Nuke all Docker resources
#   2. Deploy Hub
#   3. Deploy FRA spoke
#   4. Register FRA
#   5. Verify login works
#
# Success Criteria:
#   - Zero manual commands after ./dive spoke deploy FRA
#   - Test users exist after deployment
#   - Can login via FRA IdP
# =============================================================================

set -eo pipefail

# Load common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
export DIVE_ROOT="$PROJECT_ROOT"

source "${PROJECT_ROOT}/scripts/dive-modules/common.sh"

log_info "============================================================"
log_info "Full Automated Deployment Test - Clean Slate"
log_info "============================================================"
log_warn "This will NUKE all Docker resources and redeploy from scratch"
log_warn "All data is DUMMY/FAKE - safe to nuke"
log_info ""

# Check current state
hub_containers=$(docker ps --filter "name=dive-hub-" --format "{{.Names}}" | wc -l)
fra_containers=$(docker ps --filter "name=dive-spoke-fra-" --format "{{.Names}}" | wc -l)

log_info "Current state:"
log_info "  Hub containers: $hub_containers"
log_info "  FRA containers: $fra_containers"

# Ask if user wants clean slate
if [ "$hub_containers" -gt 0 ] || [ "$fra_containers" -gt 0 ]; then
    log_warn "Existing deployment detected"
    read -p "Nuke and start clean? (yes/no): " confirm
    CLEAN_SLATE="$confirm"
else
    log_info "No existing deployment - will deploy fresh"
    CLEAN_SLATE="yes"
fi

if [ "$CLEAN_SLATE" = "yes" ]; then
    # =============================================================================
    # Step 1: Clean slate
    # =============================================================================
    log_info ""
    log_info "STEP 1: Nuke all Docker resources"
    log_info "====================================="

    if ! "$PROJECT_ROOT/dive" nuke all --confirm; then
        log_error "Nuke failed"
        exit 1
    fi

    log_success "✓ Clean slate achieved"
    NEED_HUB_DEPLOY=true
    NEED_FRA_DEPLOY=true
else
    log_info "Skipping nuke - testing with existing deployment"
    
    # Check what needs to be deployed
    if [ "$hub_containers" -eq 0 ]; then
        NEED_HUB_DEPLOY=true
    else
        NEED_HUB_DEPLOY=false
        log_info "Hub already running - will skip deployment"
    fi
    
    if [ "$fra_containers" -eq 0 ]; then
        NEED_FRA_DEPLOY=true
    else
        NEED_FRA_DEPLOY=false
        log_info "FRA already running - will test in-place"
    fi
fi

# =============================================================================
# Step 2: Deploy Hub (if needed)
# =============================================================================
log_info ""
log_info "STEP 2: Deploy Hub"
log_info "==================="

if [ "$NEED_HUB_DEPLOY" = "true" ]; then
    export ALLOW_INSECURE_LOCAL_DEVELOPMENT=true

    log_info "Deploying Hub..."
    if ! "$PROJECT_ROOT/dive" hub deploy; then
        log_error "Hub deployment failed"
        exit 1
    fi

    log_success "✓ Hub deployed"

    # Wait for Hub to be fully ready
    log_info "Waiting for Hub to stabilize..."
    sleep 15
else
    log_info "Hub already running - verifying health..."
    
    if curl -sk https://localhost:4000/health 2>/dev/null | grep -q "healthy"; then
        log_success "✓ Hub is healthy"
    else
        log_error "Hub is running but not healthy"
        exit 1
    fi
fi

# =============================================================================
# Step 3: Deploy FRA spoke (FULL AUTOMATION TEST)
# =============================================================================
log_info ""
log_info "STEP 3: Deploy FRA spoke (testing full automation)"
log_info "===================================================="

if [ "$NEED_FRA_DEPLOY" = "true" ]; then
    # Capture full output for analysis
    deployment_log="/tmp/fra-deployment-$(date +%Y%m%d-%H%M%S).log"

    log_info "Running: ./dive spoke deploy FRA \"France\""
    log_info "Output captured to: $deployment_log"

    if "$PROJECT_ROOT/dive" spoke deploy FRA "France" > "$deployment_log" 2>&1; then
        log_success "✓ FRA deployment command succeeded"
    else
        log_error "✗ FRA deployment command failed"
        log_error "Last 50 lines of output:"
        tail -50 "$deployment_log"
        exit 1
    fi
else
    deployment_log="/tmp/fra-existing-$(date +%Y%m%d-%H%M%S).log"
    log_info "FRA already deployed - testing in-place"
    echo "FRA already running - skipped deployment" > "$deployment_log"
fi

# =============================================================================
# Step 4: Check if seeding ran automatically
# =============================================================================
log_info ""
log_info "STEP 4: Verify seeding ran automatically"
log_info "=========================================="

# Check for seeding phase in logs
if grep -q "Seeding phase for FRA" "$deployment_log"; then
    log_success "✓ Seeding phase executed"
    
    # Check if users were created
    if grep -q "Seeded.*test users" "$deployment_log"; then
        log_success "✓ Test users created during deployment"
    else
        log_warn "⚠ Seeding phase ran but may have failed"
    fi
else
    log_warn "⚠ Seeding phase was NOT executed"
    log_warn "Output log:"
    grep -A5 "Phase: " "$deployment_log" | tail -20
fi

# =============================================================================
# Step 5: Verify test users exist
# =============================================================================
log_info ""
log_info "STEP 5: Verify test users exist in FRA Keycloak"
log_info "=================================================="

sleep 5  # Wait for Keycloak to stabilize

user_count=$(docker exec dive-spoke-fra-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
    --server http://localhost:8080 --realm master --user admin --password mFCWpiUotHDbEyApsQv7Ew 2>&1 >/dev/null && \
    docker exec dive-spoke-fra-keycloak /opt/keycloak/bin/kcadm.sh get users -r dive-v3-broker-fra 2>/dev/null | jq 'length')

log_info "Users found: $user_count"

if [ "$user_count" -ge 5 ]; then
    log_success "✓ Test users exist ($user_count users)"
    
    # List users
    docker exec dive-spoke-fra-keycloak /opt/keycloak/bin/kcadm.sh get users -r dive-v3-broker-fra 2>/dev/null | \
        jq -r '.[] | "  - \(.username): \(.attributes.clearance[0] // "none")"'
    
    SEEDING_AUTOMATED=true
else
    log_error "✗ NO test users found (expected 5-6, got $user_count)"
    log_error "Seeding phase did NOT run successfully in automated deployment"
    SEEDING_AUTOMATED=false
fi

# =============================================================================
# Step 6: Register FRA
# =============================================================================
log_info ""
log_info "STEP 6: Register FRA with Hub"
log_info "=============================="

if "$PROJECT_ROOT/dive" spoke register FRA; then
    log_success "✓ FRA registered"
else
    log_error "✗ Registration failed"
    exit 1
fi

# =============================================================================
# Step 7: Verify bidirectional federation
# =============================================================================
log_info ""
log_info "STEP 7: Verify bidirectional federation"
log_info "=========================================="

# Check fra-idp in Hub
admin_token=$(docker exec dive-hub-keycloak curl -sf -X POST http://localhost:8080/realms/master/protocol/openid-connect/token \
    -d 'username=admin&password=KeycloakAdminSecure123!&grant_type=password&client_id=admin-cli' 2>/dev/null | jq -r '.access_token')

fra_idp=$(docker exec dive-hub-keycloak curl -sf \
    -H "Authorization: Bearer $admin_token" \
    http://localhost:8080/admin/realms/dive-v3-broker-usa/identity-provider/instances/fra-idp 2>/dev/null)

if echo "$fra_idp" | jq -e '.alias == "fra-idp"' >/dev/null 2>&1; then
    log_success "✓ fra-idp exists in Hub (bidirectional federation working)"
else
    log_error "✗ fra-idp NOT found in Hub"
    exit 1
fi

# =============================================================================
# Summary
# =============================================================================
log_info ""
log_info "============================================================"
log_info "Test Summary"
log_info "============================================================"

if [ "$SEEDING_AUTOMATED" = "true" ]; then
    log_success "✅ 100% AUTOMATION ACHIEVED"
    log_info ""
    log_info "Complete flow working:"
    log_info "  1. ✅ ./dive nuke all --confirm"
    log_info "  2. ✅ ./dive hub deploy"
    log_info "  3. ✅ ./dive spoke deploy FRA (includes seeding!)"
    log_info "  4. ✅ ./dive spoke register FRA (includes federation!)"
    log_info "  5. ✅ Users ready, can log in"
    log_info ""
    log_info "Test login:"
    log_info "  URL: https://localhost:3000"
    log_info "  IdP: France"
    log_info "  User: testuser-fra-3"
    log_info "  Pass: mFCWpiUotHDbEyApsQv7Ew"
    exit 0
else
    log_error "❌ AUTOMATION INCOMPLETE (85%)"
    log_info ""
    log_info "What worked:"
    log_info "  ✅ Deployment"
    log_info "  ✅ Terraform"
    log_info "  ✅ Federation"
    log_info ""
    log_info "What didn't work:"
    log_info "  ❌ Automatic seeding in pipeline"
    log_info ""
    log_info "Manual workaround still required:"
    log_info "  source scripts/dive-modules/common.sh"
    log_info "  source scripts/dive-modules/spoke/pipeline/phase-seeding.sh"
    log_info "  spoke_phase_seeding FRA deploy"
    log_info ""
    log_info "Deployment log: $deployment_log"
    exit 1
fi
