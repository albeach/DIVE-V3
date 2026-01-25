#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - NATO Batch Deployment Script
# =============================================================================
# Deploy multiple NATO country spokes in sequence
# Each spoke goes through: init → up → wait → init-keycloak → register
#
# Usage: ./scripts/nato-batch-deploy.sh [COUNTRY_CODES...] [--skip-existing]
#
# Examples:
#   ./scripts/nato-batch-deploy.sh ALB POL NOR     # Deploy 3 countries
#   ./scripts/nato-batch-deploy.sh --all           # Deploy all 32 (not recommended locally)
#   ./scripts/nato-batch-deploy.sh ALB --dry-run   # Preview deployment steps
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
NC='\033[0m'

# Parse arguments
COUNTRIES=()
DRY_RUN=false
SKIP_EXISTING=false
ALL=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --all|-a)
            ALL=true
            shift
            ;;
        --dry-run|-n)
            DRY_RUN=true
            shift
            ;;
        --skip-existing|-s)
            SKIP_EXISTING=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [COUNTRY_CODES...] [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --all, -a          Deploy all 32 NATO countries (not recommended locally)"
            echo "  --dry-run, -n      Preview deployment steps without executing"
            echo "  --skip-existing    Skip countries that are already deployed"
            echo "  --help, -h         Show this help"
            echo ""
            echo "Examples:"
            echo "  $0 ALB POL NOR               Deploy Albania, Poland, Norway"
            echo "  $0 ALB --dry-run             Preview Albania deployment"
            echo "  $0 --all --skip-existing     Deploy missing countries"
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

# If --all, populate with all countries
if [ "$ALL" = true ]; then
    COUNTRIES=($(echo "${!NATO_COUNTRIES[@]}" | tr ' ' '\n' | sort))
fi

if [ ${#COUNTRIES[@]} -eq 0 ]; then
    echo "Usage: $0 <COUNTRY_CODE> [COUNTRY_CODE...] [--dry-run]"
    echo ""
    echo "Recommended for local testing (max 3-5 spokes):"
    echo "  $0 ALB POL NOR"
    echo ""
    echo "See all countries: ./dive spoke list-countries"
    exit 1
fi

# =============================================================================
# Deployment Functions
# =============================================================================

check_spoke_running() {
    local code="$1"
    local code_lower="${code,,}"

    # Check if containers are running
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "${code_lower}-keycloak"; then
        return 0
    fi
    return 1
}

deploy_spoke() {
    local code="$1"
    local name=$(get_country_name "$code")
    local flag=$(get_country_flag "$code")
    local code_lower="${code,,}"

    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}  Deploying: $name ($code) $flag${NC}"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Check if already running
    if [ "$SKIP_EXISTING" = true ] && check_spoke_running "$code"; then
        echo -e "${YELLOW}  ⏭️  Skipping: $code is already running${NC}"
        return 0
    fi

    # Get ports for logging
    eval "$(get_country_ports "$code")"
    echo "  Ports: Frontend=$SPOKE_FRONTEND_PORT, Backend=$SPOKE_BACKEND_PORT, Keycloak=$SPOKE_KEYCLOAK_HTTPS_PORT"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        echo -e "${CYAN}  [DRY-RUN] Would execute:${NC}"
        echo "    1. DIVE_PILOT_MODE=false ./dive spoke init $code \"$name\""
        echo "    2. ./dive --instance $code_lower spoke up"
        echo "    3. Wait for Keycloak health check..."
        echo "    4. ./dive spoke init-keycloak $code_upper"
        echo "    5. ./dive spoke register $code_upper"
        echo "    6. ./dive hub approve $code"
        return 0
    fi

    # Step 1: Initialize spoke
    echo -e "${CYAN}  Step 1/5: Initializing spoke...${NC}"
    local instance_dir="${PROJECT_ROOT}/instances/${code_lower}"

    if [ -f "${instance_dir}/config.json" ]; then
        echo "    ✓ Config exists, skipping init"
    else
        DIVE_PILOT_MODE=false "${PROJECT_ROOT}/dive" spoke init "$code" "$name" || {
            echo -e "${RED}    ✗ Failed to initialize spoke${NC}"
            return 1
        }
    fi

    # Step 2: Start services
    echo -e "${CYAN}  Step 2/5: Starting services...${NC}"
    "${PROJECT_ROOT}/dive" --instance "$code_lower" spoke up || {
        echo -e "${RED}    ✗ Failed to start spoke services${NC}"
        return 1
    }

    # Step 3: Wait for Keycloak
    echo -e "${CYAN}  Step 3/5: Waiting for Keycloak to be healthy...${NC}"
    local max_wait=120
    local waited=0
    while [ $waited -lt $max_wait ]; do
        if curl -sk "https://localhost:${SPOKE_KEYCLOAK_HTTPS_PORT}/health/ready" 2>/dev/null | grep -q "UP"; then
            echo "    ✓ Keycloak is ready"
            break
        fi
        echo -n "."
        sleep 5
        waited=$((waited + 5))
    done
    echo ""

    if [ $waited -ge $max_wait ]; then
        echo -e "${YELLOW}    ⚠ Keycloak health check timed out, continuing anyway...${NC}"
    fi

    # Step 4: Initialize Keycloak
    echo -e "${CYAN}  Step 4/5: Initializing Keycloak realm...${NC}"
    "${PROJECT_ROOT}/dive" --instance "$code_lower" spoke init-keycloak || {
        echo -e "${YELLOW}    ⚠ Keycloak init had issues, may need manual intervention${NC}"
    }

    # Step 5: Register with hub
    echo -e "${CYAN}  Step 5/5: Registering with hub...${NC}"
    "${PROJECT_ROOT}/dive" --instance "$code_lower" spoke register || {
        echo -e "${YELLOW}    ⚠ Registration had issues, may need manual approval${NC}"
    }

    echo ""
    echo -e "${GREEN}  ✓ Deployment complete for $code${NC}"
    echo "    Frontend: https://localhost:${SPOKE_FRONTEND_PORT}"
    echo "    Keycloak: https://localhost:${SPOKE_KEYCLOAK_HTTPS_PORT}"
    echo ""

    return 0
}

# =============================================================================
# Main Execution
# =============================================================================

echo "═══════════════════════════════════════════════════════════════════════"
echo "  DIVE V3 - NATO Batch Deployment"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "  Countries to deploy: ${COUNTRIES[*]}"
echo "  Total: ${#COUNTRIES[@]}"
if [ "$DRY_RUN" = true ]; then
    echo -e "  Mode: ${YELLOW}DRY-RUN (no changes will be made)${NC}"
fi
if [ "$SKIP_EXISTING" = true ]; then
    echo "  Skip existing: Yes"
fi
echo ""

# Check hub is running
if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-hub-keycloak"; then
    echo -e "${RED}ERROR: Hub (USA) must be running before deploying spokes${NC}"
    echo ""
    echo "Start the hub with: ./dive up"
    exit 1
fi
echo -e "${GREEN}✓ Hub is running${NC}"
echo ""

# Deploy each country
successful=0
failed=0

for code in "${COUNTRIES[@]}"; do
    if deploy_spoke "$code"; then
        successful=$((successful + 1))
    else
        failed=$((failed + 1))
        echo -e "${RED}  ✗ Failed to deploy $code${NC}"
    fi
done

# Summary
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  Deployment Summary"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo -e "  Successful: ${GREEN}$successful${NC}"
if [ $failed -gt 0 ]; then
    echo -e "  Failed: ${RED}$failed${NC}"
fi
echo ""
echo "  Next steps:"
echo "    1. Approve pending spokes: ./dive hub spokes list"
echo "    2. Verify connectivity: ./dive spoke verify <CODE>"
echo "    3. Test federation: ./dive test cross-border --from <code> --to usa"
echo ""
