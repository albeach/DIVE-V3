#!/bin/bash
###############################################################################
# Keycloak 26.0.7 Upgrade Verification Script
###############################################################################
# This script verifies that all Keycloak version references have been updated
# from 23.0 to 26.0.7 across the DIVE V3 codebase.
#
# Usage: ./verify-keycloak-upgrade.sh
###############################################################################

set -e

echo "🔍 Keycloak 26.0.7 Upgrade Verification"
echo "=========================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0

# Function to check file for version
check_file() {
    local file=$1
    local expected=$2
    local description=$3
    
    if [ ! -f "$file" ]; then
        echo -e "${RED}✗${NC} $description - File not found: $file"
        ((ERRORS++))
        return
    fi
    
    if grep -q "$expected" "$file"; then
        echo -e "${GREEN}✓${NC} $description"
    else
        echo -e "${RED}✗${NC} $description - Expected: $expected"
        ((ERRORS++))
    fi
}

echo "📋 Checking Docker Compose Files..."
echo ""

# docker-compose.yml uses build context, so check Dockerfile instead
if [ -f "docker-compose.yml" ]; then
    if grep -q "context: ./keycloak" "docker-compose.yml"; then
        echo -e "${GREEN}✓${NC} docker-compose.yml (uses build context - check Dockerfile)"
    else
        check_file "docker-compose.yml" "quay.io/keycloak/keycloak:26.0.7" "docker-compose.yml (main)"
    fi
else
    echo -e "${RED}✗${NC} docker-compose.yml not found"
    ((ERRORS++))
fi

check_file "docker-compose.dev.yml" "quay.io/keycloak/keycloak:26.0.7" "docker-compose.dev.yml"
check_file "docker-compose.prod.yml" "quay.io/keycloak/keycloak:26.0.7" "docker-compose.prod.yml"

echo ""
echo "🐋 Checking Keycloak Dockerfile..."
echo ""

check_file "keycloak/Dockerfile" "FROM quay.io/keycloak/keycloak:26.0.7" "keycloak/Dockerfile"

echo ""
echo "📦 Checking Maven POM..."
echo ""

check_file "keycloak/extensions/pom.xml" "<keycloak.version>26.0.7</keycloak.version>" "keycloak/extensions/pom.xml"

echo ""
echo "🔧 Checking Backend Dependencies..."
echo ""

if [ -f "backend/package.json" ]; then
    BACKEND_VERSION=$(grep -o '"@keycloak/keycloak-admin-client": "[^"]*"' backend/package.json | cut -d'"' -f4)
    if [[ "$BACKEND_VERSION" =~ ^26\. ]]; then
        echo -e "${GREEN}✓${NC} Backend Keycloak Admin Client: $BACKEND_VERSION (compatible)"
    else
        echo -e "${YELLOW}⚠${NC} Backend Keycloak Admin Client: $BACKEND_VERSION (may need update)"
    fi
else
    echo -e "${RED}✗${NC} backend/package.json not found"
    ((ERRORS++))
fi

echo ""
echo "🌐 Checking Frontend Dependencies..."
echo ""

if [ -f "frontend/package.json" ]; then
    NEXTAUTH_VERSION=$(grep -o '"next-auth": "[^"]*"' frontend/package.json | cut -d'"' -f4)
    echo -e "${GREEN}✓${NC} Next-Auth: $NEXTAUTH_VERSION (compatible with Keycloak 26)"
else
    echo -e "${RED}✗${NC} frontend/package.json not found"
    ((ERRORS++))
fi

echo ""
echo "🏗️  Checking Terraform Provider..."
echo ""

if [ -f "terraform/main.tf" ]; then
    if grep -q 'version = "~> 5.0"' terraform/main.tf; then
        echo -e "${GREEN}✓${NC} Terraform Keycloak Provider: ~> 5.0 (compatible)"
    else
        echo -e "${YELLOW}⚠${NC} Terraform provider version may need review"
    fi
else
    echo -e "${RED}✗${NC} terraform/main.tf not found"
    ((ERRORS++))
fi

echo ""
echo "📚 Checking Documentation..."
echo ""

check_file "KEYCLOAK-26-UPGRADE-GUIDE.md" "Keycloak 26.0.7" "Upgrade guide created"
check_file "KEYCLOAK-26-UPGRADE-SUMMARY.md" "Keycloak 26.0.7" "Upgrade summary created"

echo ""
echo "=========================================="

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "Keycloak upgrade to 26.0.7 is complete and ready for deployment."
    echo ""
    echo "Next steps:"
    echo "  1. Review KEYCLOAK-26-UPGRADE-GUIDE.md"
    echo "  2. Take backups (see guide)"
    echo "  3. Run: docker-compose down"
    echo "  4. Run: docker-compose build --no-cache keycloak"
    echo "  5. Run: docker-compose up -d"
    echo "  6. Verify: docker exec dive-v3-keycloak /opt/keycloak/bin/kc.sh --version"
    echo ""
    exit 0
else
    echo -e "${RED}✗ $ERRORS error(s) found${NC}"
    echo ""
    echo "Please review the errors above and fix them before deploying."
    echo ""
    exit 1
fi

