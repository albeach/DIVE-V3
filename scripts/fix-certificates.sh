#!/bin/bash

###############################################################################
# Quick Fix: Generate Missing SSL Certificates
# Run this if frontend/backend/KAS are failing with certificate errors
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo "========================================"
echo "  DIVE V3 - Certificate Generation"
echo "========================================"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Check if mkcert is installed
if ! command -v mkcert &> /dev/null; then
    echo -e "${YELLOW}Installing mkcert...${NC}"
    
    if [ "$(uname)" == "Darwin" ]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install mkcert
        else
            echo -e "${RED}✗ Homebrew not found. Install mkcert manually:${NC}"
            echo "  https://github.com/FiloSottile/mkcert"
            exit 1
        fi
    else
        # Linux
        sudo apt-get update -qq
        sudo apt-get install -y -qq libnss3-tools wget
        
        MKCERT_VERSION="v1.4.4"
        wget -q "https://github.com/FiloSottile/mkcert/releases/download/${MKCERT_VERSION}/mkcert-${MKCERT_VERSION}-linux-amd64"
        chmod +x mkcert-${MKCERT_VERSION}-linux-amd64
        sudo mv mkcert-${MKCERT_VERSION}-linux-amd64 /usr/local/bin/mkcert
    fi
    
    echo -e "${GREEN}✓${NC} mkcert installed"
fi

# Get hostname
HOSTNAME=${DIVE_HOSTNAME:-localhost}
echo "Using hostname: $HOSTNAME"
echo ""

# Install mkcert CA
echo -n "Installing mkcert Root CA..."
mkcert -install > /dev/null 2>&1 || true
echo -e " ${GREEN}✓${NC}"

# Create certificate directories
echo -n "Creating certificate directories..."
mkdir -p keycloak/certs
mkdir -p backend/certs
mkdir -p frontend/certs
mkdir -p kas/certs
mkdir -p certs/mkcert
echo -e " ${GREEN}✓${NC}"

# Generate certificates
echo "Generating SSL certificates for services..."

# Keycloak
if [ ! -f keycloak/certs/key.pem ]; then
    echo -n "  Keycloak..."
    cd keycloak/certs
    mkcert \
      -cert-file certificate.pem \
      -key-file key.pem \
      "$HOSTNAME" localhost 127.0.0.1 ::1 keycloak > /dev/null 2>&1
    cd "$PROJECT_ROOT"
    echo -e " ${GREEN}✓${NC}"
else
    echo -e "  Keycloak... ${YELLOW}exists${NC}"
fi

# Backend
if [ ! -f backend/certs/key.pem ]; then
    echo -n "  Backend..."
    cd backend/certs
    mkcert \
      -cert-file certificate.pem \
      -key-file key.pem \
      "$HOSTNAME" localhost 127.0.0.1 ::1 backend > /dev/null 2>&1
    cd "$PROJECT_ROOT"
    echo -e " ${GREEN}✓${NC}"
else
    echo -e "  Backend... ${YELLOW}exists${NC}"
fi

# Frontend
if [ ! -f frontend/certs/key.pem ]; then
    echo -n "  Frontend..."
    cd frontend/certs
    mkcert \
      -cert-file certificate.pem \
      -key-file key.pem \
      "$HOSTNAME" localhost 127.0.0.1 ::1 nextjs > /dev/null 2>&1
    cd "$PROJECT_ROOT"
    echo -e " ${GREEN}✓${NC}"
else
    echo -e "  Frontend... ${YELLOW}exists${NC}"
fi

# KAS
if [ ! -f kas/certs/key.pem ]; then
    echo -n "  KAS..."
    cd kas/certs
    mkcert \
      -cert-file certificate.pem \
      -key-file key.pem \
      "$HOSTNAME" localhost 127.0.0.1 ::1 kas > /dev/null 2>&1
    cd "$PROJECT_ROOT"
    echo -e " ${GREEN}✓${NC}"
else
    echo -e "  KAS... ${YELLOW}exists${NC}"
fi

# Copy Root CA
echo -n "Copying mkcert Root CA..."
cp "$(mkcert -CAROOT)/rootCA.pem" certs/mkcert/ 2>/dev/null || true
echo -e " ${GREEN}✓${NC}"

# Fix permissions
echo -n "Fixing certificate permissions..."
chmod 644 keycloak/certs/*.pem 2>/dev/null || true
chmod 644 backend/certs/*.pem 2>/dev/null || true
chmod 644 frontend/certs/*.pem 2>/dev/null || true
chmod 644 kas/certs/*.pem 2>/dev/null || true
chmod 600 keycloak/certs/key.pem 2>/dev/null || true
chmod 600 backend/certs/key.pem 2>/dev/null || true
chmod 600 frontend/certs/key.pem 2>/dev/null || true
chmod 600 kas/certs/key.pem 2>/dev/null || true
echo -e " ${GREEN}✓${NC}"

echo ""
echo -e "${GREEN}✓ Certificates generated successfully!${NC}"
echo ""
echo "Certificates created for:"
echo "  • Keycloak: keycloak/certs/"
echo "  • Backend:  backend/certs/"
echo "  • Frontend: frontend/certs/"
echo "  • KAS:      kas/certs/"
echo ""
echo "Restart services to use new certificates:"
echo "  docker compose restart keycloak backend nextjs kas"
echo ""

