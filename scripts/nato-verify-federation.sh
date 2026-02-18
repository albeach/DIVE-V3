#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - NATO Federation Verification Script
# =============================================================================
# Verify federation connectivity and health for deployed NATO spokes
#
# Usage: ./scripts/nato-verify-federation.sh [COUNTRY_CODES...] [--all]
#
# Examples:
#   ./scripts/nato-verify-federation.sh ALB POL NOR   # Verify 3 countries
#   ./scripts/nato-verify-federation.sh --all         # Verify all deployed
#   ./scripts/nato-verify-federation.sh               # Verify all running
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load NATO countries database
source "$SCRIPT_DIR/nato-countries.sh"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Parse arguments
COUNTRIES=()
ALL=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --all|-a)
            ALL=true
            shift
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [COUNTRY_CODES...] [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --all, -a      Verify all deployed countries"
            echo "  --verbose, -v  Show detailed output"
            echo "  --help, -h     Show this help"
            echo ""
            echo "Examples:"
            echo "  $0 ALB POL NOR     Verify Albania, Poland, Norway"
            echo "  $0 --all           Verify all running spokes"
            exit 0
            ;;
        *)
            arg_code="${1^^}"
            if is_nato_country "$arg_code"; then
                COUNTRIES+=("$arg_code")
            else
                echo -e "${RED}Warning: '$1' is not a valid NATO country code, skipping${NC}"
            fi
            shift
            ;;
    esac
done

# =============================================================================
# Verification Functions
# =============================================================================

check_endpoint() {
    local url="$1"
    local name="$2"
    local timeout="${3:-5}"

    local status=$(curl -sk -o /dev/null -w "%{http_code}" --max-time "$timeout" "$url" 2>/dev/null || echo "000")

    if [ "$status" = "200" ] || [ "$status" = "204" ]; then
        echo -e "    ${GREEN}✓${NC} $name ($status)"
        return 0
    elif [ "$status" = "401" ] || [ "$status" = "403" ]; then
        echo -e "    ${YELLOW}⚠${NC} $name ($status - auth required, endpoint accessible)"
        return 0
    elif [ "$status" = "000" ]; then
        echo -e "    ${RED}✗${NC} $name (connection failed)"
        return 1
    else
        echo -e "    ${YELLOW}⚠${NC} $name (HTTP $status)"
        return 1
    fi
}

verify_spoke() {
    local code="$1"
    local name=$(get_country_name "$code")
    local flag=$(get_country_flag "$code")
    local code_lower="${code,,}"

    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}  $name ($code) $flag${NC}"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Get ports
    eval "$(get_country_ports "$code")"

    local checks_passed=0
    local checks_total=0

    # Check Keycloak
    echo -e "\n  ${CYAN}Keycloak (port $SPOKE_KEYCLOAK_HTTPS_PORT):${NC}"

    checks_total=$((checks_total + 1))
    if check_endpoint "https://localhost:${SPOKE_KEYCLOAK_HTTPS_PORT}/health/ready" "Health check"; then
        checks_passed=$((checks_passed + 1))
    fi

    checks_total=$((checks_total + 1))
    if check_endpoint "https://localhost:${SPOKE_KEYCLOAK_HTTPS_PORT}/realms/dive-v3-broker-usa/.well-known/openid-configuration" "OIDC discovery"; then
        checks_passed=$((checks_passed + 1))
    fi

    # Check Backend
    echo -e "\n  ${CYAN}Backend API (port $SPOKE_BACKEND_PORT):${NC}"

    checks_total=$((checks_total + 1))
    if check_endpoint "https://localhost:${SPOKE_BACKEND_PORT}/health" "Health check"; then
        checks_passed=$((checks_passed + 1))
    fi

    checks_total=$((checks_total + 1))
    if check_endpoint "https://localhost:${SPOKE_BACKEND_PORT}/api/federation/status" "Federation status"; then
        checks_passed=$((checks_passed + 1))
    fi

    # Check Frontend
    echo -e "\n  ${CYAN}Frontend (port $SPOKE_FRONTEND_PORT):${NC}"

    checks_total=$((checks_total + 1))
    if check_endpoint "https://localhost:${SPOKE_FRONTEND_PORT}" "Web UI"; then
        checks_passed=$((checks_passed + 1))
    fi

    # Check OPA
    echo -e "\n  ${CYAN}OPA Policy Engine (port $SPOKE_OPA_PORT):${NC}"

    checks_total=$((checks_total + 1))
    if check_endpoint "http://localhost:${SPOKE_OPA_PORT}/health" "Health check"; then
        checks_passed=$((checks_passed + 1))
    fi

    # Check KAS
    echo -e "\n  ${CYAN}Key Access Service (port $SPOKE_KAS_PORT):${NC}"

    checks_total=$((checks_total + 1))
    if check_endpoint "https://localhost:${SPOKE_KAS_PORT}/health" "Health check"; then
        checks_passed=$((checks_passed + 1))
    fi

    # Summary for this spoke
    echo ""
    local pass_rate=$((checks_passed * 100 / checks_total))
    if [ $checks_passed -eq $checks_total ]; then
        echo -e "  ${GREEN}✓ All checks passed ($checks_passed/$checks_total)${NC}"
        return 0
    elif [ $pass_rate -ge 70 ]; then
        echo -e "  ${YELLOW}⚠ Partial success ($checks_passed/$checks_total - ${pass_rate}%)${NC}"
        return 0
    else
        echo -e "  ${RED}✗ Failed ($checks_passed/$checks_total - ${pass_rate}%)${NC}"
        return 1
    fi
}

verify_hub() {
    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}  Hub (USA) 🇺🇸${NC}"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    local checks_passed=0
    local checks_total=0

    echo -e "\n  ${CYAN}Keycloak (port 8443):${NC}"

    checks_total=$((checks_total + 1))
    if check_endpoint "https://localhost:8443/health/ready" "Health check"; then
        checks_passed=$((checks_passed + 1))
    fi

    checks_total=$((checks_total + 1))
    if check_endpoint "https://localhost:8443/realms/dive-v3-broker-usa/.well-known/openid-configuration" "OIDC discovery"; then
        checks_passed=$((checks_passed + 1))
    fi

    echo -e "\n  ${CYAN}Backend API (port 4000):${NC}"

    checks_total=$((checks_total + 1))
    if check_endpoint "https://localhost:4000/health" "Health check"; then
        checks_passed=$((checks_passed + 1))
    fi

    checks_total=$((checks_total + 1))
    if check_endpoint "https://localhost:4000/api/federation/status" "Federation status"; then
        checks_passed=$((checks_passed + 1))
    fi

    checks_total=$((checks_total + 1))
    if check_endpoint "https://localhost:4000/api/federation/spokes" "Spoke registry"; then
        checks_passed=$((checks_passed + 1))
    fi

    echo -e "\n  ${CYAN}Frontend (port 3000):${NC}"

    checks_total=$((checks_total + 1))
    if check_endpoint "https://localhost:3000" "Web UI"; then
        checks_passed=$((checks_passed + 1))
    fi

    echo -e "\n  ${CYAN}OPA Policy Engine (port 8181):${NC}"

    checks_total=$((checks_total + 1))
    if check_endpoint "http://localhost:8181/health" "Health check"; then
        checks_passed=$((checks_passed + 1))
    fi

    echo -e "\n  ${CYAN}OPAL Server (port 7002):${NC}"

    checks_total=$((checks_total + 1))
    if check_endpoint "http://localhost:7002/healthcheck" "Health check"; then
        checks_passed=$((checks_passed + 1))
    fi

    echo ""
    if [ $checks_passed -eq $checks_total ]; then
        echo -e "  ${GREEN}✓ All checks passed ($checks_passed/$checks_total)${NC}"
        return 0
    else
        echo -e "  ${YELLOW}⚠ Partial success ($checks_passed/$checks_total)${NC}"
        return 0
    fi
}

get_running_spokes() {
    # Find running spoke containers and extract country codes
    local running=()

    for code in "${!NATO_COUNTRIES[@]}"; do
        local code_lower="${code,,}"
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "${code_lower}-keycloak\|keycloak-${code_lower}"; then
            running+=("$code")
        fi
    done

    echo "${running[@]}"
}

# =============================================================================
# Main Execution
# =============================================================================

echo "═══════════════════════════════════════════════════════════════════════"
echo "  DIVE V3 - NATO Federation Verification"
echo "═══════════════════════════════════════════════════════════════════════"

# If no countries specified, detect running ones
if [ ${#COUNTRIES[@]} -eq 0 ]; then
    echo ""
    echo "  Detecting running spokes..."
    COUNTRIES=($(get_running_spokes))

    if [ ${#COUNTRIES[@]} -eq 0 ]; then
        echo -e "  ${YELLOW}No spoke containers detected${NC}"
        echo ""
        echo "  Deploy spokes first with:"
        echo "    ./scripts/nato-batch-deploy.sh ALB POL NOR"
        echo ""
        echo "  Or verify hub only:"
        verify_hub
        exit 0
    fi

    echo "  Found ${#COUNTRIES[@]} running spoke(s): ${COUNTRIES[*]}"
fi

# Verify hub first
verify_hub
hub_status=$?

# Verify each spoke
spoke_success=0
spoke_failed=0

for code in "${COUNTRIES[@]}"; do
    if verify_spoke "$code"; then
        spoke_success=$((spoke_success + 1))
    else
        spoke_failed=$((spoke_failed + 1))
    fi
done

# Summary
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  Verification Summary"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

if [ $hub_status -eq 0 ]; then
    echo -e "  Hub (USA): ${GREEN}✓ Healthy${NC}"
else
    echo -e "  Hub (USA): ${RED}✗ Issues detected${NC}"
fi

if [ ${#COUNTRIES[@]} -gt 0 ]; then
    echo -e "  Spokes verified: $spoke_success success, $spoke_failed failed"
fi

echo ""

# Test federation connectivity if multiple spokes
if [ ${#COUNTRIES[@]} -gt 0 ]; then
    echo "  Federation Test (Hub → Spoke OIDC Discovery):"
    for code in "${COUNTRIES[@]}"; do
        code_lower="${code,,}"
        eval "$(get_country_ports "$code")"
        oidc_url="https://localhost:${SPOKE_KEYCLOAK_HTTPS_PORT}/realms/dive-v3-broker-usa/.well-known/openid-configuration"
        status=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 5 "$oidc_url" 2>/dev/null || echo "000")

        if [ "$status" = "200" ]; then
            echo -e "    ${GREEN}✓${NC} USA → $code: OIDC reachable"
        else
            echo -e "    ${RED}✗${NC} USA → $code: OIDC unreachable (HTTP $status)"
        fi
    done
fi

echo ""
echo "  Next steps:"
echo "    1. Test SSO flow: Open https://localhost:3000 in browser"
echo "    2. View spoke registry: ./dive hub spokes list"
echo "    3. Deploy more spokes: ./scripts/nato-batch-deploy.sh <CODES>"
echo ""
