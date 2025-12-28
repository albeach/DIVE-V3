#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Full Stack Test
# =============================================================================
# Tests Hub + N spokes with complete SSO federation verification
# Usage: ./tests/full-stack-test.sh [spoke1] [spoke2] ...
# Example: ./tests/full-stack-test.sh ALB BGR
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_step() { echo -e "${CYAN}▶${NC} $1"; }

# =============================================================================
# CONFIGURATION
# =============================================================================

# Default test spokes if none provided
if [ $# -eq 0 ]; then
    TEST_SPOKES=(ALB BGR)
    log_warn "No spokes specified, using defaults: ${TEST_SPOKES[*]}"
else
    TEST_SPOKES=("$@")
fi

# Get country names
get_country_name() {
    local code="$1"
    case "$code" in
        ALB) echo "Albania" ;;
        BGR) echo "Bulgaria" ;;
        CZE) echo "Czech Republic" ;;
        DNK) echo "Denmark" ;;
        EST) echo "Estonia" ;;
        FRA) echo "France" ;;
        DEU) echo "Germany" ;;
        GRC) echo "Greece" ;;
        HUN) echo "Hungary" ;;
        ISL) echo "Iceland" ;;
        ITA) echo "Italy" ;;
        LVA) echo "Latvia" ;;
        LTU) echo "Lithuania" ;;
        LUX) echo "Luxembourg" ;;
        MNE) echo "Montenegro" ;;
        NLD) echo "Netherlands" ;;
        MKD) echo "North Macedonia" ;;
        NOR) echo "Norway" ;;
        POL) echo "Poland" ;;
        PRT) echo "Portugal" ;;
        ROU) echo "Romania" ;;
        SVK) echo "Slovakia" ;;
        SVN) echo "Slovenia" ;;
        ESP) echo "Spain" ;;
        TUR) echo "Turkey" ;;
        GBR) echo "United Kingdom" ;;
        *) echo "$code" ;;
    esac
}

# =============================================================================
# CLEAN SLATE
# =============================================================================

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           DIVE V3 Full Stack SSO Test                        ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Hub: USA                                                    ║"
echo "║  Spokes: ${#TEST_SPOKES[@]} total                                           ║"
echo "║  $(printf '%-56s' "${TEST_SPOKES[*]}")  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

log_warn "This will NUKE all Docker resources and rebuild from scratch"
read -p "Continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    log_info "Test cancelled"
    exit 0
fi

echo ""
log_step "Step 1/6: Clean slate (nuke all Docker resources)..."
./dive nuke --yes

log_success "Clean slate complete"
echo ""

# =============================================================================
# HUB DEPLOYMENT
# =============================================================================

log_step "Step 2/6: Deploying Hub (USA)..."
echo ""

if ./dive hub deploy; then
    log_success "Hub deployed successfully"
else
    log_error "Hub deployment failed"
    exit 1
fi

echo ""
log_info "Waiting 10s for Hub to stabilize..."
sleep 10

# Verify Hub realm
log_step "Verifying Hub realm..."
if curl -kfs --max-time 5 "https://localhost:8443/realms/dive-v3-broker-usa/.well-known/openid-configuration" >/dev/null 2>&1; then
    log_success "Hub realm 'dive-v3-broker-usa' is accessible"
else
    log_error "Hub realm verification failed"
    exit 1
fi

echo ""

# =============================================================================
# SPOKE DEPLOYMENTS
# =============================================================================

log_step "Step 3/6: Deploying ${#TEST_SPOKES[@]} spokes..."
echo ""

DEPLOYED_SPOKES=()
FAILED_SPOKES=()

for spoke in "${TEST_SPOKES[@]}"; do
    spoke_upper="${spoke^^}"
    spoke_lower="${spoke,,}"
    country_name=$(get_country_name "$spoke_upper")

    echo -e "${CYAN}━━━ Deploying ${spoke_upper} (${country_name}) ━━━${NC}"

    if ./dive spoke deploy "$spoke_upper" "$country_name" 2>&1 | tee "/tmp/dive-spoke-deploy-${spoke_lower}.log"; then
        log_success "${spoke_upper} deployed"
        DEPLOYED_SPOKES+=("$spoke_upper")
    else
        log_error "${spoke_upper} deployment failed"
        FAILED_SPOKES+=("$spoke_upper")
    fi

    echo ""
    sleep 5
done

if [ ${#FAILED_SPOKES[@]} -gt 0 ]; then
    log_error "Some spoke deployments failed: ${FAILED_SPOKES[*]}"
    log_info "Continuing with successful spokes: ${DEPLOYED_SPOKES[*]}"
fi

if [ ${#DEPLOYED_SPOKES[@]} -eq 0 ]; then
    log_error "No spokes deployed successfully"
    exit 1
fi

echo ""

# =============================================================================
# FEDERATION CONFIGURATION
# =============================================================================

log_step "Step 4/6: Configuring federation for ${#DEPLOYED_SPOKES[@]} spokes..."
echo ""

FEDERATED_SPOKES=()
FEDERATION_FAILED=()

for spoke in "${DEPLOYED_SPOKES[@]}"; do
    spoke_lower="${spoke,,}"

    echo -e "${CYAN}━━━ Configuring federation: ${spoke} ━━━${NC}"

    # Configure spoke side (Spoke → Hub)
    log_info "Configuring spoke-side federation..."
    if ./dive federation-setup configure "$spoke_lower" 2>&1 | tee "/tmp/dive-federation-configure-${spoke_lower}.log"; then
        log_success "${spoke} spoke-side configured"
    else
        log_warn "${spoke} spoke-side configuration had issues"
    fi

    sleep 2

    # Register in Hub (Hub → Spoke)
    log_info "Registering spoke in Hub..."
    if ./dive federation-setup register-hub "$spoke_lower" 2>&1 | tee "/tmp/dive-federation-register-${spoke_lower}.log"; then
        log_success "${spoke} registered in Hub"
        FEDERATED_SPOKES+=("$spoke")
    else
        log_error "${spoke} Hub registration failed"
        FEDERATION_FAILED+=("$spoke")
    fi

    echo ""
    sleep 3
done

if [ ${#FEDERATION_FAILED[@]} -gt 0 ]; then
    log_error "Some federations failed: ${FEDERATION_FAILED[*]}"
fi

if [ ${#FEDERATED_SPOKES[@]} -eq 0 ]; then
    log_error "No spokes federated successfully"
    exit 1
fi

echo ""

# =============================================================================
# VERIFICATION
# =============================================================================

log_step "Step 5/6: Verifying SSO infrastructure for ${#FEDERATED_SPOKES[@]} spokes..."
echo ""

VERIFIED_SPOKES=()
VERIFICATION_FAILED=()

for spoke in "${FEDERATED_SPOKES[@]}"; do
    spoke_lower="${spoke,,}"

    echo -e "${CYAN}━━━ Testing SSO: ${spoke} ━━━${NC}"

    if ./dive test sso "$spoke_lower"; then
        log_success "${spoke} SSO verification passed"
        VERIFIED_SPOKES+=("$spoke")
    else
        log_error "${spoke} SSO verification failed"
        VERIFICATION_FAILED+=("$spoke")
    fi

    echo ""
done

echo ""

# =============================================================================
# FINAL SUMMARY
# =============================================================================

log_step "Step 6/6: Final Summary"
echo ""

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              Full Stack Test Results                         ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Deployment Results:                                         ║"
echo "║    Total Spokes Attempted:   ${#TEST_SPOKES[@]}                            ║"
echo "║    Successfully Deployed:    ${#DEPLOYED_SPOKES[@]}                            ║"
echo "║    Deployment Failures:      ${#FAILED_SPOKES[@]}                            ║"
echo "║                                                              ║"
echo "║  Federation Results:                                         ║"
echo "║    Successfully Federated:   ${#FEDERATED_SPOKES[@]}                            ║"
echo "║    Federation Failures:      ${#FEDERATION_FAILED[@]}                            ║"
echo "║                                                              ║"
echo "║  Verification Results:                                       ║"
echo "║    SSO Tests Passed:         ${#VERIFIED_SPOKES[@]}                            ║"
echo "║    SSO Tests Failed:         ${#VERIFICATION_FAILED[@]}                            ║"
echo "╚══════════════════════════════════════════════════════════════╝"

echo ""
if [ ${#VERIFIED_SPOKES[@]} -eq ${#TEST_SPOKES[@]} ]; then
    echo -e "${GREEN}✓ SUCCESS: All spokes deployed, federated, and verified!${NC}"
    exit 0
elif [ ${#VERIFIED_SPOKES[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠ PARTIAL SUCCESS: ${#VERIFIED_SPOKES[@]}/${#TEST_SPOKES[@]} spokes fully verified${NC}"
    echo ""
    echo "Successful spokes: ${VERIFIED_SPOKES[*]}"
    if [ ${#VERIFICATION_FAILED[@]} -gt 0 ]; then
        echo "Failed spokes: ${VERIFICATION_FAILED[*]}"
    fi
    exit 1
else
    echo -e "${RED}✗ FAILURE: No spokes fully verified${NC}"
    exit 1
fi

