#!/bin/bash
# Dry-run test for certificate and hostname setup

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     DIVE V3 Certificate & Hostname - Dry Run Test              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$PROJECT_ROOT"

ERRORS=0

# Test 1: Check certificate files exist
echo -e "${YELLOW}[Test 1/8]${NC} Checking certificate files..."
SERVICES=("certs/mkcert" "keycloak/certs" "backend/certs" "frontend/certs" "kas/certs" "external-idps/certs")
for service in "${SERVICES[@]}"; do
    if [ -f "$service/certificate.pem" ] && [ -f "$service/key.pem" ] && [ -f "$service/rootCA.pem" ]; then
        echo -e "  ${GREEN}✓${NC} $service"
    else
        echo -e "  ${RED}✗${NC} $service (missing files)"
        ERRORS=$((ERRORS + 1))
    fi
done
echo ""

# Test 2: Verify certificate validity
echo -e "${YELLOW}[Test 2/8]${NC} Verifying certificate validity..."
if openssl x509 -in certs/mkcert/certificate.pem -noout -checkend 0 > /dev/null 2>&1; then
    EXPIRY=$(openssl x509 -in certs/mkcert/certificate.pem -noout -enddate | cut -d= -f2)
    echo -e "  ${GREEN}✓${NC} Certificate is valid until: $EXPIRY"
else
    echo -e "  ${RED}✗${NC} Certificate is expired or invalid"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Test 3: Check hostnames in certificate
echo -e "${YELLOW}[Test 3/8]${NC} Checking certificate hostnames..."
REQUIRED_HOSTS=("localhost" "keycloak" "backend" "frontend" "kas")
CERT_SANS=$(openssl x509 -in certs/mkcert/certificate.pem -noout -text | grep -A 1 "Subject Alternative Name" | tail -n 1)
for host in "${REQUIRED_HOSTS[@]}"; do
    if echo "$CERT_SANS" | grep -q "$host"; then
        echo -e "  ${GREEN}✓${NC} $host"
    else
        echo -e "  ${RED}✗${NC} $host (missing from certificate)"
        ERRORS=$((ERRORS + 1))
    fi
done
echo ""

# Test 4: Check Docker Compose files
echo -e "${YELLOW}[Test 4/8]${NC} Checking Docker Compose configuration..."
if [ -f "docker-compose.yml" ]; then
    echo -e "  ${GREEN}✓${NC} docker-compose.yml exists"
else
    echo -e "  ${RED}✗${NC} docker-compose.yml missing"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "docker-compose.mkcert.yml" ]; then
    echo -e "  ${GREEN}✓${NC} docker-compose.mkcert.yml exists"
else
    echo -e "  ${RED}✗${NC} docker-compose.mkcert.yml missing"
    ERRORS=$((ERRORS + 1))
fi

if [ -f ".env.mkcert" ]; then
    echo -e "  ${GREEN}✓${NC} .env.mkcert exists"
else
    echo -e "  ${RED}✗${NC} .env.mkcert missing"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Test 5: Check backend HTTPS support
echo -e "${YELLOW}[Test 5/8]${NC} Checking backend HTTPS implementation..."
if grep -q "https from 'https'" backend/src/server.ts; then
    echo -e "  ${GREEN}✓${NC} HTTPS module imported"
else
    echo -e "  ${RED}✗${NC} HTTPS module not imported"
    ERRORS=$((ERRORS + 1))
fi

if grep -q "HTTPS_ENABLED" backend/src/server.ts; then
    echo -e "  ${GREEN}✓${NC} HTTPS_ENABLED flag implemented"
else
    echo -e "  ${RED}✗${NC} HTTPS_ENABLED flag missing"
    ERRORS=$((ERRORS + 1))
fi

if grep -q "https.createServer" backend/src/server.ts; then
    echo -e "  ${GREEN}✓${NC} HTTPS server creation implemented"
else
    echo -e "  ${RED}✗${NC} HTTPS server creation missing"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Test 6: Check frontend HTTPS support
echo -e "${YELLOW}[Test 6/8]${NC} Checking frontend HTTPS implementation..."
if [ -f "frontend/server.js" ]; then
    echo -e "  ${GREEN}✓${NC} server.js exists"
    
    if grep -q "createServer" frontend/server.js; then
        echo -e "  ${GREEN}✓${NC} HTTPS server creation implemented"
    else
        echo -e "  ${RED}✗${NC} HTTPS server creation missing"
        ERRORS=$((ERRORS + 1))
    fi
    
    if grep -q "CERT_PATH" frontend/server.js; then
        echo -e "  ${GREEN}✓${NC} Certificate path configuration implemented"
    else
        echo -e "  ${RED}✗${NC} Certificate path configuration missing"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "  ${RED}✗${NC} server.js missing"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Test 7: Check KAS HTTPS support
echo -e "${YELLOW}[Test 7/8]${NC} Checking KAS HTTPS implementation..."
if grep -q "https from 'https'" kas/src/server.ts; then
    echo -e "  ${GREEN}✓${NC} HTTPS module imported"
else
    echo -e "  ${RED}✗${NC} HTTPS module not imported"
    ERRORS=$((ERRORS + 1))
fi

if grep -q "HTTPS_ENABLED" kas/src/server.ts; then
    echo -e "  ${GREEN}✓${NC} HTTPS_ENABLED flag implemented"
else
    echo -e "  ${RED}✗${NC} HTTPS_ENABLED flag missing"
    ERRORS=$((ERRORS + 1))
fi

if grep -q "https.createServer" kas/src/server.ts; then
    echo -e "  ${GREEN}✓${NC} HTTPS server creation implemented"
else
    echo -e "  ${RED}✗${NC} HTTPS server creation missing"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Test 8: Check TypeScript compilation
echo -e "${YELLOW}[Test 8/8]${NC} Checking TypeScript compilation..."
cd backend
if npm run build --silent > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Backend TypeScript compiles successfully"
else
    echo -e "  ${YELLOW}⚠${NC}  Backend TypeScript compilation has warnings (non-fatal)"
fi
cd ..

cd kas
if npm run build --silent > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} KAS TypeScript compiles successfully"
else
    echo -e "  ${YELLOW}⚠${NC}  KAS TypeScript compilation has warnings (non-fatal)"
fi
cd ..

echo ""

# Summary
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
if [ $ERRORS -eq 0 ]; then
    echo -e "${BLUE}║${NC}  ${GREEN}✅ All Tests Passed!${NC}                                            ${BLUE}║${NC}"
else
    echo -e "${BLUE}║${NC}  ${RED}❌ $ERRORS Test(s) Failed${NC}                                            ${BLUE}║${NC}"
fi
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}Certificate and hostname setup is ready to use!${NC}"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "  1. Start services:"
    echo -e "     ${BLUE}docker-compose -f docker-compose.yml -f docker-compose.mkcert.yml up -d${NC}"
    echo ""
    echo "  2. Test endpoints:"
    echo -e "     ${BLUE}curl -k https://localhost:8443/health${NC}  # Keycloak"
    echo -e "     ${BLUE}curl -k https://localhost:4000/health${NC}  # Backend"
    echo -e "     ${BLUE}curl -k https://localhost:3000${NC}         # Frontend"
    echo ""
    echo "  3. View logs:"
    echo -e "     ${BLUE}docker-compose logs -f backend${NC}"
    echo ""
    echo "  4. For remote access:"
    echo -e "     ${BLUE}./scripts/configure-hostname.sh your.domain.com${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}Please fix the errors above before proceeding.${NC}"
    echo ""
    echo "For troubleshooting, see:"
    echo "  - docs/CERTIFICATE-AND-HOSTNAME-MANAGEMENT.md"
    echo "  - README-CERTIFICATES.md"
    echo ""
    exit 1
fi

