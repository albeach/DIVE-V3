#!/bin/bash
# Quick verification script for session management changes

echo "═══════════════════════════════════════════════════════════════"
echo "Session Management Modernization - Verification Script"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "1. Checking Terraform configuration changes..."
echo "─────────────────────────────────────────────────────────────"

# Check if Terraform config has the new settings
if grep -q "refresh_token_max_reuse.*=.*1" terraform/modules/federated-instance/main.tf; then
    echo -e "${GREEN}✓${NC} Refresh token rotation enabled (refresh_token_max_reuse = 1)"
else
    echo -e "${RED}✗${NC} Refresh token rotation NOT found"
fi

if grep -q "revoke_refresh_token.*=.*true" terraform/modules/federated-instance/main.tf; then
    echo -e "${GREEN}✓${NC} Explicit token revocation enabled (revoke_refresh_token = true)"
else
    echo -e "${RED}✗${NC} Token revocation setting NOT found"
fi

if grep -q 'sso_session_max_lifespan.*=.*"8h"' terraform/modules/federated-instance/main.tf; then
    echo -e "${GREEN}✓${NC} Session max aligned to 8 hours"
else
    echo -e "${RED}✗${NC} Session max NOT 8 hours"
fi

if grep -q 'sso_session_idle_timeout.*=.*"15m"' terraform/modules/federated-instance/main.tf; then
    echo -e "${GREEN}✓${NC} Session idle timeout set to 15 minutes"
else
    echo -e "${RED}✗${NC} Session idle NOT 15 minutes"
fi

if grep -q "remember_me.*=.*false" terraform/modules/federated-instance/main.tf; then
    echo -e "${GREEN}✓${NC} Remember Me disabled"
else
    echo -e "${RED}✗${NC} Remember Me NOT disabled"
fi

echo ""
echo "2. Checking NextAuth session refresh changes..."
echo "─────────────────────────────────────────────────────────────"

if grep -q "8 \* 60 \* 60 \* 1000" frontend/src/app/api/session/refresh/route.ts; then
    echo -e "${GREEN}✓${NC} Session extension changed to 8 hours"
else
    echo -e "${RED}✗${NC} Session extension NOT 8 hours"
fi

if grep -q "MissingRefreshToken" frontend/src/app/api/session/refresh/route.ts; then
    echo -e "${GREEN}✓${NC} Refresh token rotation validation added"
else
    echo -e "${RED}✗${NC} Token rotation validation NOT found"
fi

echo ""
echo "3. Checking backend blacklist integration..."
echo "─────────────────────────────────────────────────────────────"

if grep -q "isTokenBlacklisted" backend/src/middleware/authz.middleware.ts | grep -A 5 "authenticateJWT"; then
    echo -e "${GREEN}✓${NC} Token blacklist check integrated"
else
    echo -e "${YELLOW}⚠${NC} Verifying blacklist integration..."
    if grep -c "isTokenBlacklisted" backend/src/middleware/authz.middleware.ts | grep -q "[1-9]"; then
        echo -e "${GREEN}✓${NC} Token blacklist function is called"
    else
        echo -e "${RED}✗${NC} Token blacklist NOT called"
    fi
fi

if grep -q "areUserTokensRevoked" backend/src/middleware/authz.middleware.ts; then
    echo -e "${GREEN}✓${NC} User-level token revocation check added"
else
    echo -e "${RED}✗${NC} User revocation check NOT found"
fi

echo ""
echo "4. Checking frontend session monitoring..."
echo "─────────────────────────────────────────────────────────────"

if grep -q "WARNING_THRESHOLD = 180" frontend/src/components/auth/token-expiry-checker.tsx; then
    echo -e "${GREEN}✓${NC} Warning threshold updated to 3 minutes (180s)"
else
    echo -e "${RED}✗${NC} Warning threshold NOT 180 seconds"
fi

if grep -q "REFRESH_THRESHOLD = 420" frontend/src/components/auth/token-expiry-checker.tsx; then
    echo -e "${GREEN}✓${NC} Refresh threshold updated to 7 minutes (420s)"
else
    echo -e "${RED}✗${NC} Refresh threshold NOT 420 seconds"
fi

if grep -q "Refresh logic removed" frontend/src/hooks/use-session-heartbeat.ts; then
    echo -e "${GREEN}✓${NC} Duplicate refresh logic removed from heartbeat"
else
    echo -e "${YELLOW}⚠${NC} Checking for removed refresh logic..."
fi

echo ""
echo "5. Checking service health..."
echo "─────────────────────────────────────────────────────────────"

# Check if services are running
if docker ps | grep -q "dive-hub-frontend.*healthy"; then
    echo -e "${GREEN}✓${NC} Frontend service is healthy"
else
    echo -e "${YELLOW}⚠${NC} Frontend service status unknown"
fi

if docker ps | grep -q "dive-hub-backend.*healthy"; then
    echo -e "${GREEN}✓${NC} Backend service is healthy"
else
    echo -e "${YELLOW}⚠${NC} Backend service status unknown"
fi

if docker ps | grep -q "dive-hub-keycloak.*healthy"; then
    echo -e "${GREEN}✓${NC} Keycloak service is healthy"
else
    echo -e "${YELLOW}⚠${NC} Keycloak service status unknown"
fi

echo ""
echo "6. Documentation created..."
echo "─────────────────────────────────────────────────────────────"

if [ -f "docs/session-management.md" ]; then
    echo -e "${GREEN}✓${NC} Architecture documentation created ($(wc -l < docs/session-management.md) lines)"
else
    echo -e "${RED}✗${NC} Architecture documentation NOT found"
fi

if [ -f "docs/testing-session-management.md" ]; then
    echo -e "${GREEN}✓${NC} Testing guide created ($(wc -l < docs/testing-session-management.md) lines)"
else
    echo -e "${RED}✗${NC} Testing guide NOT found"
fi

if [ -f "frontend/tests/session-warning-reliability.test.ts" ]; then
    echo -e "${GREEN}✓${NC} Automated tests created ($(wc -l < frontend/tests/session-warning-reliability.test.ts) lines)"
else
    echo -e "${RED}✗${NC} Automated tests NOT found"
fi

if grep -q "Session Management Configuration" .cursorrules; then
    echo -e "${GREEN}✓${NC} .cursorrules updated with session management section"
else
    echo -e "${RED}✗${NC} .cursorrules NOT updated"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Next Steps:"
echo "═══════════════════════════════════════════════════════════════"
echo "1. Wait for Terraform apply to complete"
echo "2. Test login at: https://localhost:3000"
echo "3. Monitor session refresh in DevTools Console"
echo "4. Verify warnings appear at 3 minutes before expiry"
echo "5. Check backend logs: docker logs -f dive-hub-backend"
echo "6. Review detailed testing guide: docs/testing-session-management.md"
echo ""
echo "To apply Terraform changes to Keycloak:"
echo "  cd terraform/hub && terraform apply -var-file=hub.tfvars"
echo ""
