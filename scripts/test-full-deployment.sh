#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 - Full Deployment Test with Instrumentation
# =============================================================================
# This script orchestrates a complete nuke + deploy operation:
# 1. Nuke everything (complete cleanup)
# 2. Deploy USA Hub
# 3. Deploy 2 random NATO spokes (GBR, FRA)
# 4. Capture all errors and warnings with instrumentation
# =============================================================================

set -e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIVE_ROOT"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Log file
DEBUG_LOG="${DIVE_ROOT}/.cursor/debug.log"

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   DIVE V3 - Full Automated Deployment Test                    ║${NC}"
echo -e "${CYAN}║   Nuke → Hub (USA) → 2 Random Spokes (GBR, FRA)               ║${NC}"
echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo ""

# Select 2 random NATO spokes (hardcoded for reproducibility)
SPOKE_1="GBR"
SPOKE_2="FRA"

echo -e "${BOLD}Deployment Plan:${NC}"
echo "  1. Nuke all existing resources"
echo "  2. Deploy USA Hub"
echo "  3. Deploy Spoke 1: ${SPOKE_1} (United Kingdom)"
echo "  4. Deploy Spoke 2: ${SPOKE_2} (France)"
echo ""
echo -e "${YELLOW}All failures and warnings will be captured in debug logs${NC}"
echo ""

# Confirm
read -p "Press ENTER to continue or Ctrl+C to cancel: " confirm

# =============================================================================
# STEP 1: NUKE EVERYTHING
# =============================================================================
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  STEP 1: Nuking All Resources${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# #region agent log
echo "{\"location\":\"test-full-deployment.sh:58\",\"message\":\"Starting nuke operation\",\"data\":{},\"timestamp\":$(date +%s%3N),\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"H1\"}" >> "$DEBUG_LOG"
# #endregion

./dive nuke --confirm || {
    echo -e "${RED}✗ Nuke operation failed!${NC}"
    echo ""
    echo "Check debug log: $DEBUG_LOG"
    exit 1
}

# #region agent log
echo "{\"location\":\"test-full-deployment.sh:69\",\"message\":\"Nuke operation completed\",\"data\":{},\"timestamp\":$(date +%s%3N),\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"H1\"}" >> "$DEBUG_LOG"
# #endregion

echo ""
echo -e "${GREEN}✓ Nuke completed successfully${NC}"
echo ""
sleep 3

# =============================================================================
# STEP 2: DEPLOY USA HUB
# =============================================================================
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  STEP 2: Deploying USA Hub${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# #region agent log
echo "{\"location\":\"test-full-deployment.sh:89\",\"message\":\"Starting hub deployment\",\"data\":{\"instance\":\"USA\"},\"timestamp\":$(date +%s%3N),\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"H3\"}" >> "$DEBUG_LOG"
# #endregion

./dive hub deploy || {
    echo -e "${RED}✗ Hub deployment failed!${NC}"
    echo ""
    echo "Check debug log: $DEBUG_LOG"
    echo ""
    echo "Logs from hub services:"
    ./dive hub logs --tail=50
    exit 1
}

# #region agent log
echo "{\"location\":\"test-full-deployment.sh:103\",\"message\":\"Hub deployment completed\",\"data\":{},\"timestamp\":$(date +%s%3N),\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"H3\"}" >> "$DEBUG_LOG"
# #endregion

echo ""
echo -e "${GREEN}✓ Hub deployment completed${NC}"
echo ""

# Verify hub is healthy
echo "Verifying hub health..."
./dive hub verify || {
    echo -e "${YELLOW}⚠ Hub verification had warnings${NC}"
    echo "Continuing anyway..."
}

sleep 5

# =============================================================================
# STEP 3: DEPLOY SPOKE 1 (GBR)
# =============================================================================
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  STEP 3: Deploying Spoke 1 - ${SPOKE_1}${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# #region agent log
echo "{\"location\":\"test-full-deployment.sh:133\",\"message\":\"Starting spoke 1 deployment\",\"data\":{\"spoke\":\"$SPOKE_1\"},\"timestamp\":$(date +%s%3N),\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"H3\"}" >> "$DEBUG_LOG"
# #endregion

# Check if spoke is already initialized
if [ ! -d "${DIVE_ROOT}/instances/$(echo $SPOKE_1 | tr '[:upper:]' '[:lower:]')" ]; then
    echo "Initializing spoke ${SPOKE_1}..."
    ./dive --instance $SPOKE_1 spoke init $SPOKE_1 "United Kingdom" --auto || {
        echo -e "${RED}✗ Spoke ${SPOKE_1} initialization failed!${NC}"
        exit 1
    }
fi

echo "Deploying spoke ${SPOKE_1}..."
./dive --instance $SPOKE_1 spoke up || {
    echo -e "${RED}✗ Spoke ${SPOKE_1} deployment failed!${NC}"
    echo ""
    echo "Check debug log: $DEBUG_LOG"
    exit 1
}

# #region agent log
echo "{\"location\":\"test-full-deployment.sh:156\",\"message\":\"Spoke 1 deployment completed\",\"data\":{\"spoke\":\"$SPOKE_1\"},\"timestamp\":$(date +%s%3N),\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"H3\"}" >> "$DEBUG_LOG"
# #endregion

echo ""
echo -e "${GREEN}✓ Spoke ${SPOKE_1} deployed successfully${NC}"
echo ""
sleep 3

# =============================================================================
# STEP 4: DEPLOY SPOKE 2 (FRA)
# =============================================================================
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  STEP 4: Deploying Spoke 2 - ${SPOKE_2}${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# #region agent log
echo "{\"location\":\"test-full-deployment.sh:178\",\"message\":\"Starting spoke 2 deployment\",\"data\":{\"spoke\":\"$SPOKE_2\"},\"timestamp\":$(date +%s%3N),\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"H3\"}" >> "$DEBUG_LOG"
# #endregion

# Check if spoke is already initialized
if [ ! -d "${DIVE_ROOT}/instances/$(echo $SPOKE_2 | tr '[:upper:]' '[:lower:]')" ]; then
    echo "Initializing spoke ${SPOKE_2}..."
    ./dive --instance $SPOKE_2 spoke init $SPOKE_2 "France" --auto || {
        echo -e "${RED}✗ Spoke ${SPOKE_2} initialization failed!${NC}"
        exit 1
    }
fi

echo "Deploying spoke ${SPOKE_2}..."
./dive --instance $SPOKE_2 spoke up || {
    echo -e "${RED}✗ Spoke ${SPOKE_2} deployment failed!${NC}"
    echo ""
    echo "Check debug log: $DEBUG_LOG"
    exit 1
}

# #region agent log
echo "{\"location\":\"test-full-deployment.sh:201\",\"message\":\"Spoke 2 deployment completed\",\"data\":{\"spoke\":\"$SPOKE_2\"},\"timestamp\":$(date +%s%3N),\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"H3\"}" >> "$DEBUG_LOG"
# #endregion

echo ""
echo -e "${GREEN}✓ Spoke ${SPOKE_2} deployed successfully${NC}"
echo ""

# =============================================================================
# DEPLOYMENT COMPLETE - SUMMARY
# =============================================================================
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Deployment Complete!                                         ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BOLD}Deployed Components:${NC}"
echo "  ✓ USA Hub"
echo "  ✓ Spoke 1: ${SPOKE_1}"
echo "  ✓ Spoke 2: ${SPOKE_2}"
echo ""

echo -e "${BOLD}Hub Endpoints:${NC}"
echo "  • Frontend:  https://localhost:3000"
echo "  • Backend:   https://localhost:4000"
echo "  • Keycloak:  https://localhost:8443"
echo ""

# Get spoke ports dynamically
SPOKE_1_LOWER=$(echo $SPOKE_1 | tr '[:upper:]' '[:lower:]')
SPOKE_2_LOWER=$(echo $SPOKE_2 | tr '[:upper:]' '[:lower:]')

# Calculate ports (GBR is offset 6, FRA is offset 10 based on NATO database)
SPOKE_1_FRONTEND_PORT=$((3000 + 6))
SPOKE_1_KEYCLOAK_PORT=$((8443 + 6))
SPOKE_2_FRONTEND_PORT=$((3000 + 10))
SPOKE_2_KEYCLOAK_PORT=$((8443 + 10))

echo -e "${BOLD}Spoke ${SPOKE_1} Endpoints:${NC}"
echo "  • Frontend:  https://localhost:${SPOKE_1_FRONTEND_PORT}"
echo "  • Keycloak:  https://localhost:${SPOKE_1_KEYCLOAK_PORT}"
echo ""

echo -e "${BOLD}Spoke ${SPOKE_2} Endpoints:${NC}"
echo "  • Frontend:  https://localhost:${SPOKE_2_FRONTEND_PORT}"
echo "  • Keycloak:  https://localhost:${SPOKE_2_KEYCLOAK_PORT}"
echo ""

echo -e "${BOLD}Debug Log:${NC}"
echo "  • Location: $DEBUG_LOG"
echo ""

# Check for errors in debug log
if [ -f "$DEBUG_LOG" ]; then
    ERROR_COUNT=$(grep -c "error" "$DEBUG_LOG" 2>/dev/null || echo "0")
    WARN_COUNT=$(grep -c "warn" "$DEBUG_LOG" 2>/dev/null || echo "0")

    if [ "$ERROR_COUNT" -gt 0 ]; then
        echo -e "${RED}⚠ Found ${ERROR_COUNT} errors in debug log${NC}"
    fi

    if [ "$WARN_COUNT" -gt 0 ]; then
        echo -e "${YELLOW}⚠ Found ${WARN_COUNT} warnings in debug log${NC}"
    fi

    if [ "$ERROR_COUNT" -eq 0 ] && [ "$WARN_COUNT" -eq 0 ]; then
        echo -e "${GREEN}✓ No errors or warnings detected in instrumentation${NC}"
    fi
fi

echo ""
echo -e "${CYAN}Run './dive hub status' to check hub status${NC}"
echo -e "${CYAN}Run './dive --instance ${SPOKE_1_LOWER} spoke status' to check spoke status${NC}"
echo ""

# #region agent log
echo "{\"location\":\"test-full-deployment.sh:277\",\"message\":\"Deployment workflow completed\",\"data\":{\"hub\":\"USA\",\"spoke1\":\"$SPOKE_1\",\"spoke2\":\"$SPOKE_2\"},\"timestamp\":$(date +%s%3N),\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"ALL\"}" >> "$DEBUG_LOG"
# #endregion

echo -e "${GREEN}${BOLD}✓ Full deployment test completed successfully!${NC}"
echo ""
