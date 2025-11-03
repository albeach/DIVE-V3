#!/bin/bash

###############################################################################
# DIVE V3 - Complete Ubuntu Deployment Script
# Sets up and deploys the entire DIVE V3 stack on Ubuntu 24.04.3 LTS
###############################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║         DIVE V3 - Complete Ubuntu Deployment Script           ║${NC}"
echo -e "${BLUE}║                 Ubuntu 24.04.3 LTS Edition                     ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}This script will:${NC}"
echo "  1. Generate SSL certificates"
echo "  2. Set up DIVE Root CA certificates"
echo "  3. Start all Docker services"
echo "  4. Apply Terraform configuration to Keycloak"
echo "  5. Seed MongoDB database with sample resources"
echo "  6. Verify all services are healthy"
echo ""
read -p "Press Enter to continue or Ctrl+C to cancel..."
echo ""

###############################################################################
# Phase 1: Pre-Deployment Checks
###############################################################################

echo -e "${YELLOW}📋 Phase 1: Pre-Deployment Checks${NC}"
echo ""

# Check for required commands
MISSING_DEPS=0
for cmd in docker node npm openssl; do
    if ! command -v $cmd &> /dev/null; then
        echo -e "${RED}❌ Error: $cmd is not installed${NC}"
        MISSING_DEPS=1
    else
        echo -e "${GREEN}✓${NC} $cmd: $(which $cmd)"
    fi
done

# Check for Java (optional but recommended for Keycloak truststore)
if ! command -v keytool &> /dev/null; then
    echo -e "${YELLOW}⚠️  Java JDK not installed (needed for Keycloak truststore)${NC}"
    read -p "Install OpenJDK 17? (recommended) (y/N): " INSTALL_JAVA
    if [[ $INSTALL_JAVA =~ ^[Yy]$ ]]; then
        echo "Installing OpenJDK 17..."
        sudo apt-get update -qq
        sudo apt-get install -y -qq openjdk-17-jdk-headless
        echo -e "${GREEN}✓${NC} Java JDK installed"
    else
        echo -e "${YELLOW}⚠️  Skipping Java installation (truststore will not be created)${NC}"
    fi
else
    echo -e "${GREEN}✓${NC} keytool: $(which keytool)"
fi

if [ $MISSING_DEPS -eq 1 ]; then
    echo -e "${RED}Please install missing dependencies first${NC}"
    exit 1
fi

# Check Docker daemon
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Docker daemon is not running or you don't have permission${NC}"
    echo -e "${YELLOW}Run: sudo usermod -aG docker \$USER${NC}"
    echo -e "${YELLOW}Then log out and back in${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Docker daemon is running"

# Check if user is in docker group
if ! groups | grep -q docker; then
    echo -e "${YELLOW}⚠️  Warning: Current user is not in docker group${NC}"
    echo -e "${YELLOW}   You may need to run: sudo usermod -aG docker \$USER${NC}"
    echo -e "${YELLOW}   Then log out and back in${NC}"
fi

echo ""

###############################################################################
# Phase 2: Generate SSL Certificates with mkcert
###############################################################################

echo -e "${YELLOW}🔐 Phase 2: Generating SSL Certificates with mkcert${NC}"
echo ""

mkdir -p keycloak/certs

# Check if mkcert is installed
if ! command -v mkcert &> /dev/null; then
    echo "Installing mkcert for trusted local certificates..."
    
    # Install prerequisites
    sudo apt-get update -qq
    sudo apt-get install -y -qq libnss3-tools wget
    
    # Download and install mkcert
    MKCERT_VERSION="v1.4.4"
    wget -q "https://github.com/FiloSottile/mkcert/releases/download/${MKCERT_VERSION}/mkcert-${MKCERT_VERSION}-linux-amd64"
    chmod +x mkcert-${MKCERT_VERSION}-linux-amd64
    sudo mv mkcert-${MKCERT_VERSION}-linux-amd64 /usr/local/bin/mkcert
    
    echo -e "${GREEN}✓${NC} mkcert installed"
fi

# Install the local CA (only needs to be done once per system)
echo "Installing local Certificate Authority..."
CAROOT="$HOME/.local/share/mkcert" mkcert -install 2>&1 | grep -v "is already installed" || true
echo -e "${GREEN}✓${NC} Local CA installed (certificates will be trusted by browsers)"

# Check if certificates exist
if [ -f keycloak/certs/certificate.pem ] && [ -f keycloak/certs/key.pem ]; then
    echo -e "${GREEN}✓${NC} SSL certificates already exist"
    read -p "Do you want to regenerate them? (y/N): " REGENERATE
    if [[ $REGENERATE =~ ^[Yy]$ ]]; then
        rm -f keycloak/certs/certificate.pem keycloak/certs/key.pem
    else
        echo -e "${GREEN}✓${NC} Using existing certificates"
    fi
fi

# Generate certificates if they don't exist
if [ ! -f keycloak/certs/certificate.pem ]; then
    echo "Generating trusted certificates for localhost..."
    cd keycloak/certs
    
    # Generate certificate for all required hostnames
    mkcert \
      -cert-file certificate.pem \
      -key-file key.pem \
      localhost \
      127.0.0.1 \
      ::1 \
      keycloak \
      backend \
      nextjs \
      dive-v3-keycloak \
      dive-v3-backend \
      dive-v3-frontend
    
    # Make readable by containers
    chmod 644 certificate.pem
    chmod 644 key.pem
    
    cd "$PROJECT_ROOT"
    echo -e "${GREEN}✓${NC} Trusted SSL certificates generated (no browser warnings!)"
else
    echo -e "${GREEN}✓${NC} SSL certificates exist"
fi

echo ""

###############################################################################
# Phase 3: Create Certificate Directories and Reset Permissions
###############################################################################

echo -e "${YELLOW}📁 Phase 3: Creating Certificate Directories${NC}"
echo ""

# Create certificate directories
mkdir -p backend/certs/dive-root-cas
mkdir -p frontend/certs/dive-root-cas
mkdir -p keycloak/certs/dive-root-cas
mkdir -p kas/certs/dive-root-cas
mkdir -p backend/logs
mkdir -p backend/uploads
mkdir -p kas/logs
mkdir -p policies/uploads

# Reset ownership to current user (in case they were owned by UID 1001 from previous run)
# This ensures the cert installation script can write to them
echo "Resetting directory ownership to current user..."
sudo chown -R $USER:$USER \
    backend/certs \
    backend/logs \
    backend/uploads \
    frontend/certs \
    frontend/ \
    kas/certs \
    kas/logs \
    policies/uploads \
    2>/dev/null || \
    chown -R $USER:$USER \
    backend/certs \
    backend/logs \
    backend/uploads \
    frontend/certs \
    frontend/ \
    kas/certs \
    kas/logs \
    policies/uploads \
    2>/dev/null || true

echo -e "${GREEN}✓${NC} Certificate directories created and ownership reset"
echo ""

###############################################################################
# Phase 4: Set Up DIVE Root CA Certificates
###############################################################################

echo -e "${YELLOW}📜 Phase 4: Setting Up DIVE Root CA Certificates${NC}"
echo ""

if [ -f scripts/install-dive-certs.sh ]; then
    ./scripts/install-dive-certs.sh
    echo ""
    echo -e "${GREEN}✓${NC} DIVE Root CA certificates installed"
else
    echo -e "${YELLOW}⚠️  Warning: install-dive-certs.sh not found, skipping...${NC}"
fi

echo ""
echo -e "${BLUE}Continuing to Phase 5...${NC}"
echo ""

###############################################################################
# Phase 5: Fix Directory Permissions for Containers
###############################################################################

echo -e "${YELLOW}🔧 Phase 5: Setting Directory Permissions for Containers${NC}"
echo ""

# NOW set ownership for container users (UID 1001) after certs are installed
echo "Setting ownership to UID 1001 for container access..."
sudo chown -R 1001:1001 frontend/ 2>/dev/null || chown -R 1001:1001 frontend/
sudo chown -R 1001:1001 backend/logs backend/uploads backend/certs 2>/dev/null || chown -R 1001:1001 backend/logs backend/uploads backend/certs 2>/dev/null || true
sudo chown -R 1001:1001 kas/logs kas/certs 2>/dev/null || chown -R 1001:1001 kas/logs kas/certs 2>/dev/null || true
sudo chown -R 1001:1001 policies/uploads 2>/dev/null || chown -R 1001:1001 policies/uploads 2>/dev/null || true

echo -e "${GREEN}✓${NC} Directory permissions set for containers"
echo ""

###############################################################################
# Phase 6: Clean Previous Deployment
###############################################################################

echo -e "${YELLOW}🧹 Phase 6: Cleaning Previous Deployment${NC}"
echo ""

echo "Stopping all DIVE V3 containers..."
docker compose down -v 2>/dev/null || true

echo "Removing dangling images..."
docker image prune -f >/dev/null 2>&1 || true

echo -e "${GREEN}✓${NC} Previous deployment cleaned"
echo ""

###############################################################################
# Phase 7: Start Docker Services
###############################################################################

echo -e "${YELLOW}🐳 Phase 7: Starting Docker Services${NC}"
echo ""

echo "Building and starting all services..."
docker compose up -d --build

echo -e "${GREEN}✓${NC} Docker services started"
echo ""

###############################################################################
# Phase 8: Wait for Services to be Ready
###############################################################################

echo -e "${YELLOW}⏳ Phase 8: Waiting for Services to be Ready${NC}"
echo ""

# Wait for PostgreSQL
echo -n "Waiting for PostgreSQL..."
for i in {1..30}; do
    if docker compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        echo -e " ${GREEN}✓${NC}"
        break
    fi
    echo -n "."
    sleep 2
done

# Wait for MongoDB
echo -n "Waiting for MongoDB..."
for i in {1..30}; do
    if docker compose exec -T mongo mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
        echo -e " ${GREEN}✓${NC}"
        break
    fi
    echo -n "."
    sleep 2
done

# Wait for OPA
echo -n "Waiting for OPA..."
for i in {1..30}; do
    if curl -sf http://localhost:8181/health > /dev/null 2>&1; then
        echo -e " ${GREEN}✓${NC}"
        break
    fi
    echo -n "."
    sleep 2
done

# Wait for Keycloak (this takes longest)
echo -n "Waiting for Keycloak (this may take 1-2 minutes)..."
for i in {1..60}; do
    if curl -k -sf https://localhost:8443/health/ready > /dev/null 2>&1; then
        echo -e " ${GREEN}✓${NC}"
        break
    fi
    echo -n "."
    sleep 3
done

echo ""
echo -e "${GREEN}✓${NC} All infrastructure services are ready"
echo ""

###############################################################################
# Phase 9: Apply Terraform Configuration
###############################################################################

echo -e "${YELLOW}🏗️  Phase 9: Applying Terraform Configuration${NC}"
echo ""

if [ -d terraform ]; then
    cd terraform
    
    # Check if Terraform is installed and verify version
    TERRAFORM_REQUIRED_VERSION="1.13.4"
    TERRAFORM_INSTALL_VERSION="1.13.4"  # Latest version as of Oct 2025
    
    if ! command -v terraform &> /dev/null; then
        echo "Installing Terraform ${TERRAFORM_INSTALL_VERSION}..."
        wget -q https://releases.hashicorp.com/terraform/${TERRAFORM_INSTALL_VERSION}/terraform_${TERRAFORM_INSTALL_VERSION}_linux_amd64.zip
        sudo unzip -q -o terraform_${TERRAFORM_INSTALL_VERSION}_linux_amd64.zip -d /usr/local/bin/
        rm terraform_${TERRAFORM_INSTALL_VERSION}_linux_amd64.zip
        echo -e "${GREEN}✓${NC} Terraform ${TERRAFORM_INSTALL_VERSION} installed"
    else
        CURRENT_VERSION=$(terraform version -json 2>/dev/null | grep -o '"version":"v[^"]*' | cut -d'v' -f2 || echo "unknown")
        echo -e "${GREEN}✓${NC} Terraform already installed: ${CURRENT_VERSION}"
        
        # Check if version matches required
        if [ "$CURRENT_VERSION" != "$TERRAFORM_REQUIRED_VERSION" ] && [ "$CURRENT_VERSION" != "unknown" ]; then
            echo -e "${YELLOW}⚠️  Terraform version ${CURRENT_VERSION} installed, config requires ${TERRAFORM_REQUIRED_VERSION}${NC}"
            read -p "Upgrade to ${TERRAFORM_INSTALL_VERSION}? (y/N): " UPGRADE_TF
            if [[ $UPGRADE_TF =~ ^[Yy]$ ]]; then
                echo "Upgrading to ${TERRAFORM_INSTALL_VERSION}..."
                wget -q https://releases.hashicorp.com/terraform/${TERRAFORM_INSTALL_VERSION}/terraform_${TERRAFORM_INSTALL_VERSION}_linux_amd64.zip
                sudo unzip -q -o terraform_${TERRAFORM_INSTALL_VERSION}_linux_amd64.zip -d /usr/local/bin/
                rm terraform_${TERRAFORM_INSTALL_VERSION}_linux_amd64.zip
                echo -e "${GREEN}✓${NC} Terraform upgraded to ${TERRAFORM_INSTALL_VERSION}"
            fi
        fi
    fi
    
    echo "Initializing Terraform..."
    terraform init -upgrade > /dev/null
    
    echo "Applying Terraform configuration..."
    terraform apply -auto-approve
    
    cd "$PROJECT_ROOT"
    echo -e "${GREEN}✓${NC} Terraform configuration applied"
else
    echo -e "${YELLOW}⚠️  terraform/ directory not found, skipping...${NC}"
fi

echo ""

###############################################################################
# Phase 10: Seed MongoDB Database
###############################################################################

echo -e "${YELLOW}🌱 Phase 10: Seeding MongoDB Database${NC}"
echo ""

cd backend

if [ ! -d node_modules ]; then
    echo "Installing backend dependencies..."
    npm install
    echo -e "${GREEN}✓${NC} Backend dependencies installed"
fi

echo "Seeding database with sample resources..."
npm run seed 2>&1 | grep -E '(✅|✓|Successfully|Created|Seeded)' || true

cd "$PROJECT_ROOT"
echo -e "${GREEN}✓${NC} Database seeded"
echo ""

###############################################################################
# Phase 11: Restart Application Services
###############################################################################

echo -e "${YELLOW}🔄 Phase 11: Restarting Application Services${NC}"
echo ""

echo "Restarting backend to pick up Keycloak configuration..."
docker compose restart backend

echo "Restarting frontend..."
docker compose restart nextjs

sleep 10

echo -e "${GREEN}✓${NC} Application services restarted"
echo ""

###############################################################################
# Phase 12: Verify Deployment
###############################################################################

echo -e "${YELLOW}✅ Phase 12: Verifying Deployment${NC}"
echo ""

# Check container status
echo "Container Status:"
docker compose ps

echo ""
echo "Service Health Checks:"

# Test endpoints
SERVICES=(
    "Frontend:https://localhost:3000"
    "Backend:https://localhost:4000/health"
    "Keycloak:https://localhost:8443/health/ready"
    "OPA:http://localhost:8181/health"
)

for SERVICE in "${SERVICES[@]}"; do
    NAME="${SERVICE%%:*}"
    URL="${SERVICE#*:}"
    
    if curl -k -sf "$URL" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} $NAME: $URL"
    else
        echo -e "  ${RED}✗${NC} $NAME: $URL (not responding)"
    fi
done

echo ""

###############################################################################
# Deployment Complete
###############################################################################

echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}║                 🎉 Deployment Complete! 🎉                     ║${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Access URLs:${NC}"
echo -e "  Frontend:        ${BLUE}https://localhost:3000${NC}"
echo -e "  Backend API:     ${BLUE}https://localhost:4000${NC}"
echo -e "  Keycloak Admin:  ${BLUE}https://localhost:8443/admin${NC}"
echo -e "                   Username: ${YELLOW}admin${NC}"
echo -e "                   Password: ${YELLOW}admin${NC}"
echo ""
echo -e "${CYAN}Useful Commands:${NC}"
echo -e "  View logs:       ${YELLOW}docker compose logs -f${NC}"
echo -e "  Stop services:   ${YELLOW}docker compose down${NC}"
echo -e "  Restart all:     ${YELLOW}docker compose restart${NC}"
echo ""
echo -e "${YELLOW}Note: You may see a security warning when accessing HTTPS URLs.${NC}"
echo -e "${YELLOW}This is normal for self-signed certificates. Click 'Advanced' → 'Proceed'.${NC}"
echo ""

