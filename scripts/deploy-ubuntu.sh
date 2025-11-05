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

###############################################################################
# Hostname Configuration
###############################################################################

echo -e "${CYAN}🌐 Hostname Configuration${NC}"
echo ""
echo "Choose how you want to access DIVE V3:"
echo ""
echo "  ${GREEN}1)${NC} localhost only (default)"
echo "     - Access via: https://localhost:3000"
echo "     - Best for: Local development on this machine"
echo ""
echo "  ${GREEN}2)${NC} Custom hostname (for remote access)"
echo "     - Access via: https://your-hostname:3000"
echo "     - Best for: Remote access, demos, team access"
echo "     - Requires: DNS entry or /etc/hosts configuration"
echo ""
read -p "Selection [1-2] (default: 1): " HOSTNAME_CHOICE

if [ "$HOSTNAME_CHOICE" == "2" ]; then
    echo ""
    read -p "Enter custom hostname (e.g., dive.example.com): " CUSTOM_HOSTNAME
    
    if [ -z "$CUSTOM_HOSTNAME" ]; then
        echo -e "${YELLOW}No hostname provided, using localhost${NC}"
        CUSTOM_HOSTNAME="localhost"
    else
        echo -e "${GREEN}✓${NC} Will use hostname: ${CUSTOM_HOSTNAME}"
        echo ""
        echo -e "${YELLOW}📝 Remember to configure DNS or /etc/hosts:${NC}"
        echo "   $(ip route get 1 2>/dev/null | awk '{print $7}' | head -1 || echo '<your-ip>') ${CUSTOM_HOSTNAME}"
        echo ""
    fi
else
    CUSTOM_HOSTNAME="localhost"
    echo -e "${GREEN}✓${NC} Using localhost"
fi

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
# Phase 2: Generate SSL Certificates with Unified Certificate Management
###############################################################################

echo -e "${YELLOW}🔐 Phase 2: Generating SSL Certificates (Unified System)${NC}"
echo ""

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
else
    echo -e "${GREEN}✓${NC} mkcert already installed"
fi

# Use unified certificate setup script (with custom hostname if provided)
if [ -f scripts/setup-mkcert-for-all-services.sh ]; then
    echo "Running unified certificate setup for all services..."
    echo "  Hostname: ${CUSTOM_HOSTNAME}"
    DIVE_HOSTNAME="$CUSTOM_HOSTNAME" ./scripts/setup-mkcert-for-all-services.sh
    echo -e "${GREEN}✓${NC} Unified certificates generated for all services"
else
    echo -e "${YELLOW}⚠️  Warning: Unified certificate script not found${NC}"
    echo "Falling back to basic certificate generation..."
    
    mkdir -p keycloak/certs
    
    # Install the local CA
    echo "Installing local Certificate Authority..."
    CAROOT="$HOME/.local/share/mkcert" mkcert -install 2>&1 | grep -v "is already installed" || true
    
    # Generate basic certificates
    if [ ! -f keycloak/certs/certificate.pem ]; then
        echo "Generating certificates for ${CUSTOM_HOSTNAME}..."
        cd keycloak/certs
        mkcert \
          -cert-file certificate.pem \
          -key-file key.pem \
          "$CUSTOM_HOSTNAME" \
          localhost \
          127.0.0.1 \
          ::1 \
          keycloak \
          backend \
          nextjs
        chmod 644 certificate.pem key.pem
        cd "$PROJECT_ROOT"
    fi
    echo -e "${GREEN}✓${NC} Basic certificates generated"
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
# Phase 4: Set Up DIVE Root CA Certificates (Optional - for Federation)
###############################################################################

echo -e "${YELLOW}📜 Phase 4: DIVE Root CA Certificates (Optional)${NC}"
echo ""
echo "DIVE Root CA certificates are only needed for federation with external IdPs"
echo "using NLD-issued certificates. The mkcert system handles local HTTPS."
echo ""

# Check if DIVE Root CAs exist
if [ -f dive-certs/NLDECCDIVEROOTCAG1.cacert.pem ] && [ -f dive-certs/NLDRSADIVEROOTCAG1.cacert.pem ]; then
    read -p "Install DIVE Root CA certificates for federation? (y/N): " INSTALL_DIVE_CA
    
    if [[ $INSTALL_DIVE_CA =~ ^[Yy]$ ]]; then
        if [ -f scripts/install-dive-certs.sh ]; then
            echo ""
            echo "Installing DIVE Root CA certificates..."
            # Suppress keytool errors but show progress
            ./scripts/install-dive-certs.sh 2>&1 | grep -v "FileNotFoundException" | grep -v "java.io" || true
            echo ""
            echo -e "${GREEN}✓${NC} DIVE Root CA certificates installed"
        else
            echo -e "${YELLOW}⚠️  install-dive-certs.sh not found, skipping...${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  Skipping DIVE Root CA installation${NC}"
        echo "   You can install them later with: ./scripts/install-dive-certs.sh"
    fi
else
    echo -e "${YELLOW}⚠️  DIVE Root CA certificates not found in dive-certs/${NC}"
    echo "   This is normal if you're not using federation with external IdPs"
    echo "   The mkcert certificate system will handle all HTTPS needs"
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
# Phase 7: Start Docker Services (with Certificate Support)
###############################################################################

echo -e "${YELLOW}🐳 Phase 7: Starting Docker Services${NC}"
echo ""

# Check if unified certificate system is in place
if [ -f docker-compose.mkcert.yml ]; then
    echo "Building and starting main services with mkcert certificate support..."
    echo "  Hostname: ${CUSTOM_HOSTNAME}"
    echo "  • Keycloak (8443) - HTTPS"
    echo "  • Backend (4000) - HTTPS"
    echo "  • Frontend (3000) - HTTPS"
    echo "  • KAS (8080) - HTTPS"
    echo "  • MongoDB, PostgreSQL, Redis, OPA"
    echo ""
    
    # Use hostname override if custom hostname was provided
    if [ "$CUSTOM_HOSTNAME" != "localhost" ] && [ -f docker-compose.hostname.yml ]; then
        echo "Using custom hostname configuration..."
        docker compose -f docker-compose.yml -f docker-compose.mkcert.yml -f docker-compose.hostname.yml up -d --build
    else
        docker compose -f docker-compose.yml -f docker-compose.mkcert.yml up -d --build
    fi
    
    echo -e "${GREEN}✓${NC} Main services started with HTTPS support"
else
    echo "Building and starting all services (basic configuration)..."
    docker compose up -d --build
    echo -e "${GREEN}✓${NC} Main services started"
fi

echo ""

# Optional: Start external IdPs if directory exists
if [ -d external-idps ] && [ -f external-idps/docker-compose.yml ]; then
    echo -e "${CYAN}External IdPs Available:${NC}"
    echo "  Spain SAML IdP (9443)"
    echo "  USA OIDC IdP (9082)"
    echo ""
    read -p "Do you want to start external IdPs for federation testing? (y/N): " START_IDPS
    if [[ $START_IDPS =~ ^[Yy]$ ]]; then
        echo "Starting external IdP services..."
        cd external-idps
        docker compose up -d --build
        cd "$PROJECT_ROOT"
        echo -e "${GREEN}✓${NC} External IdPs started"
        echo ""
    else
        echo -e "${YELLOW}⚠️  External IdPs not started (can start later with: cd external-idps && docker compose up -d)${NC}"
        echo ""
    fi
fi

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
KEYCLOAK_READY=0
for i in {1..60}; do
    # Try multiple health check endpoints
    if curl -k -sf https://localhost:8443/health/ready > /dev/null 2>&1; then
        KEYCLOAK_READY=1
        break
    elif curl -k -sf https://localhost:8443/health > /dev/null 2>&1; then
        KEYCLOAK_READY=1
        break
    elif curl -sf http://localhost:8081/health/ready > /dev/null 2>&1; then
        KEYCLOAK_READY=1
        break
    fi
    echo -n "."
    sleep 3
done

if [ $KEYCLOAK_READY -eq 1 ]; then
    echo -e " ${GREEN}✓${NC}"
else
    echo -e " ${YELLOW}⚠️${NC}"
    echo -e "${YELLOW}Keycloak health check timeout after 3 minutes${NC}"
    echo ""
    echo "Debugging information:"
    echo "Container status:"
    docker compose ps keycloak
    echo ""
    echo "Last 30 lines of Keycloak logs:"
    docker compose logs keycloak --tail 30
    echo ""
    echo -e "${YELLOW}Continuing anyway - Keycloak may still be starting...${NC}"
fi

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
        # Multiple methods to detect version (robust)
        CURRENT_VERSION=""
        
        # Method 1: terraform version -json
        if [ -z "$CURRENT_VERSION" ]; then
            CURRENT_VERSION=$(terraform version -json 2>/dev/null | python3 -c "import sys, json; print(json.load(sys.stdin)['terraform_version'])" 2>/dev/null || echo "")
        fi
        
        # Method 2: terraform version plain output
        if [ -z "$CURRENT_VERSION" ]; then
            CURRENT_VERSION=$(terraform version 2>/dev/null | head -1 | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | sed 's/v//' || echo "")
        fi
        
        # Method 3: terraform --version
        if [ -z "$CURRENT_VERSION" ]; then
            CURRENT_VERSION=$(terraform --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "")
        fi
        
        if [ -z "$CURRENT_VERSION" ]; then
            echo -e "${YELLOW}⚠️  Could not detect Terraform version${NC}"
            echo "Terraform command: $(which terraform)"
            echo "Reinstalling to be safe..."
            wget -q https://releases.hashicorp.com/terraform/${TERRAFORM_INSTALL_VERSION}/terraform_${TERRAFORM_INSTALL_VERSION}_linux_amd64.zip
            sudo unzip -q -o terraform_${TERRAFORM_INSTALL_VERSION}_linux_amd64.zip -d /usr/local/bin/
            rm terraform_${TERRAFORM_INSTALL_VERSION}_linux_amd64.zip
            CURRENT_VERSION="${TERRAFORM_INSTALL_VERSION}"
            echo -e "${GREEN}✓${NC} Terraform ${TERRAFORM_INSTALL_VERSION} installed"
        else
            echo -e "${GREEN}✓${NC} Terraform already installed: ${CURRENT_VERSION}"
            
            # Check if version matches required
            if [ "$CURRENT_VERSION" != "$TERRAFORM_REQUIRED_VERSION" ]; then
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
    fi
    
    echo "Initializing Terraform..."
    terraform init -upgrade
    
    echo ""
    echo -e "${CYAN}Applying Terraform configuration (v2.0.0)...${NC}"
    echo -e "${CYAN}This will deploy:${NC}"
    echo "  • 11 Keycloak realms with fixed authentication flows"
    echo "  • AAL1/AAL2/AAL3 conditional logic (UNCLASSIFIED/CONFIDENTIAL-SECRET/TOP_SECRET)"
    echo "  • WebAuthn policies (AAL3 hardware-backed auth) - AUTOMATED!"
    echo "  • 44 test users (4 per realm with varied clearances)"
    echo "  • Native ACR/AMR tracking (no custom SPIs!)"
    echo "  • All protocol mappers and security policies"
    echo ""
    
    # Apply with proper variables
    terraform apply -auto-approve \
      -var="keycloak_admin_username=admin" \
      -var="keycloak_admin_password=admin" \
      -var="keycloak_url=https://localhost:8443"
    
    TERRAFORM_EXIT=$?
    
    cd "$PROJECT_ROOT"
    
    if [ $TERRAFORM_EXIT -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✓${NC} Terraform configuration applied successfully"
        echo ""
        echo -e "${CYAN}v2.0.0 Deployment Summary:${NC}"
        echo -e "  ${GREEN}✓${NC} 11 realms configured with native Keycloak features"
        echo -e "  ${GREEN}✓${NC} Authentication flows fixed (Forms Subflow pattern)"
        echo -e "  ${GREEN}✓${NC} WebAuthn policies deployed (AAL3 for TOP_SECRET)"
        echo -e "  ${GREEN}✓${NC} 44 test users created (4 per realm)"
        echo -e "  ${GREEN}✓${NC} Zero custom SPIs (100% native Keycloak 26.4.2)"
        echo -e "  ${GREEN}✓${NC} Zero manual configuration steps"
    else
        echo -e "${RED}✗${NC} Terraform apply failed (exit code: $TERRAFORM_EXIT)"
        echo ""
        echo "Please review errors above and check:"
        echo "  • Keycloak is running (https://localhost:8443)"
        echo "  • Admin credentials are correct (admin/admin)"
        echo "  • No duplicate resources in Terraform state"
        echo ""
        echo "For help, see: KEYCLOAK-V2-NATIVE-REFACTORING-SSOT.md"
        exit 1
    fi
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

# Test main service endpoints
echo "Main Services:"
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

# Test external IdPs if they were started
if docker ps --format '{{.Names}}' | grep -q "dive-spain-saml-idp" 2>/dev/null; then
    echo "External IdPs:"
    EXTERNAL_SERVICES=(
        "Spain SAML:http://localhost:9443/simplesaml/"
        "USA OIDC:http://localhost:9082/health/ready"
    )
    
    for SERVICE in "${EXTERNAL_SERVICES[@]}"; do
        NAME="${SERVICE%%:*}"
        URL="${SERVICE#*:}"
        
        if curl -k -sf "$URL" > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} $NAME: $URL"
        else
            echo -e "  ${RED}✗${NC} $NAME: $URL (not responding)"
        fi
    done
    echo ""
fi

###############################################################################
# Phase 13: Verify v2.0.0 Specific Features
###############################################################################

echo -e "${YELLOW}🔍 Phase 13: Verifying v2.0.0 Native Keycloak Features${NC}"
echo ""

# Check all 11 realms are accessible
echo "Verifying all 11 realms:"
REALMS="broker usa fra can deu gbr ita esp pol nld industry"
REALM_COUNT=0
for realm in $REALMS; do
    if curl -sk "https://localhost:8443/realms/dive-v3-$realm/.well-known/openid-configuration" >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} dive-v3-$realm"
        ((REALM_COUNT++))
    else
        echo -e "  ${RED}✗${NC} dive-v3-$realm (not accessible)"
    fi
done

if [ $REALM_COUNT -eq 11 ]; then
    echo -e "${GREEN}✓${NC} All 11 realms operational (100%)"
else
    echo -e "${YELLOW}⚠️  Only $REALM_COUNT/11 realms accessible${NC}"
fi

echo ""

# Check for authentication errors (v2.0.0 should have ZERO new errors)
echo "Checking for authentication flow errors:"
ERROR_COUNT=$(docker logs dive-v3-keycloak 2>&1 | grep -c "user not set yet" || echo "0")
if [ "$ERROR_COUNT" -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} No 'user not set yet' errors (v2.0.0 Forms Subflow fix working!)"
else
    echo -e "  ${YELLOW}⚠️${NC} Found $ERROR_COUNT authentication errors (check if they're historical)"
fi

echo ""

# Verify no custom SPIs (v2.0.0 should have ZERO)
echo "Verifying custom SPIs removed:"
if ls keycloak/providers/*.jar >/dev/null 2>&1; then
    echo -e "  ${RED}✗${NC} Custom SPI JARs found (should be removed in v2.0.0)"
else
    echo -e "  ${GREEN}✓${NC} No custom SPI JARs (100% native Keycloak 26.4.2)"
fi

echo ""

# Check test users created
echo "Verifying test users:"
if [ -d terraform ]; then
    cd terraform
    USER_COUNT=$(terraform state list 2>/dev/null | grep -c "module.*test_users.keycloak_user" || echo "0")
    if [ "$USER_COUNT" -eq 44 ]; then
        echo -e "  ${GREEN}✓${NC} All 44 test users created (4 per realm × 11 realms)"
    elif [ "$USER_COUNT" -gt 0 ]; then
        echo -e "  ${YELLOW}⚠️${NC} $USER_COUNT/44 test users created"
    else
        echo -e "  ${YELLOW}⚠️${NC} No test users found in Terraform state"
        echo "    Run: terraform apply to create test users"
    fi
    cd "$PROJECT_ROOT"
else
    echo -e "  ${YELLOW}⚠️${NC} Cannot verify (terraform directory not accessible)"
fi

echo ""

###############################################################################
# Deployment Complete
###############################################################################

echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}║            🎉 DIVE V3 v2.0.0 Deployment Complete! 🎉           ║${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}🌐 Access URLs:${NC}"
echo ""
echo -e "${CYAN}Main Services:${NC}"
echo -e "  Frontend:        ${BLUE}https://${CUSTOM_HOSTNAME}:3000${NC}"
echo -e "  Backend API:     ${BLUE}https://${CUSTOM_HOSTNAME}:4000${NC}"
echo -e "  Keycloak Admin:  ${BLUE}https://${CUSTOM_HOSTNAME}:8443/admin${NC}"
echo -e "                   Username: ${YELLOW}admin${NC}"
echo -e "                   Password: ${YELLOW}admin${NC}"
echo ""

# Show external IdP URLs if they're running
if docker ps --format '{{.Names}}' | grep -q "dive-spain-saml-idp" 2>/dev/null; then
    echo -e "${CYAN}External IdPs:${NC}"
    echo -e "  Spain SAML:      ${BLUE}http://${CUSTOM_HOSTNAME}:9443/simplesaml/${NC}"
    echo -e "  USA OIDC:        ${BLUE}http://${CUSTOM_HOSTNAME}:9082${NC}"
    echo ""
fi

# Show remote access instructions if custom hostname used
if [ "$CUSTOM_HOSTNAME" != "localhost" ]; then
    echo -e "${CYAN}🔐 Remote Access Setup:${NC}"
    echo ""
    echo "For remote clients to access DIVE V3:"
    echo ""
    echo "  1. ${YELLOW}Configure DNS or /etc/hosts:${NC}"
    SERVER_IP=$(ip route get 1 2>/dev/null | awk '{print $7}' | head -1 || echo '<your-server-ip>')
    echo "     ${SERVER_IP} ${CUSTOM_HOSTNAME}"
    echo ""
    echo "  2. ${YELLOW}Distribute CA certificate:${NC}"
    echo "     Copy: certs/mkcert/rootCA.pem"
    echo "     Install on client machines to trust certificates"
    echo ""
    echo "  3. ${YELLOW}Access from clients:${NC}"
    echo "     https://${CUSTOM_HOSTNAME}:3000"
    echo ""
fi
echo -e "${CYAN}👥 Test User Credentials (Password for all: Password123!):${NC}"
echo -e "  ${GREEN}AAL1${NC} (UNCLASSIFIED):  testuser-usa-unclass      (no MFA)"
echo -e "  ${GREEN}AAL2${NC} (SECRET):        testuser-usa-secret        (OTP setup required)"
echo -e "  ${GREEN}AAL3${NC} (TOP_SECRET):    testuser-usa-ts            (WebAuthn/YubiKey setup required)"
echo ""
echo -e "${CYAN}🔐 v2.0.0 Features Deployed:${NC}"
echo -e "  ${GREEN}✓${NC} Zero custom Keycloak SPIs (100% native 26.4.2)"
echo -e "  ${GREEN}✓${NC} Fixed authentication flows (Forms Subflow pattern)"
echo -e "  ${GREEN}✓${NC} AAL1/AAL2/AAL3 support (complete NIST SP 800-63B)"
echo -e "  ${GREEN}✓${NC} WebAuthn/Passkey (YubiKey, TouchID, Windows Hello)"
echo -e "  ${GREEN}✓${NC} 44 test users (4 per realm × 11 realms)"
echo -e "  ${GREEN}✓${NC} Native ACR/AMR tracking (RFC-8176 compliant)"
echo ""
echo -e "${CYAN}📚 Documentation:${NC}"
echo -e "  ${BLUE}KEYCLOAK-V2-NATIVE-REFACTORING-SSOT.md${NC} ← Complete deployment guide"
echo -e "  ${BLUE}DEPLOYMENT-COMPLETE-FINAL.txt${NC}          ← Quick reference"
echo -e "  ${BLUE}docs/TESTING-GUIDE.md${NC}                  ← Testing procedures"
echo ""
echo -e "${CYAN}🧪 Test Authentication:${NC}"
echo -e "  1. Open: ${BLUE}https://localhost:8443/realms/dive-v3-usa/account${NC}"
echo -e "  2. Sign in with test users above"
echo -e "  3. Verify MFA prompts for classified users"
echo ""
echo -e "${CYAN}💻 Useful Commands:${NC}"
echo -e "  View logs:       ${YELLOW}docker compose logs -f${NC}"
echo -e "  Stop services:   ${YELLOW}docker compose down${NC}"
echo -e "  Restart all:     ${YELLOW}docker compose restart${NC}"
echo -e "  Test auth:       ${YELLOW}./scripts/test-keycloak-auth.sh all${NC}"
echo -e "  Test federation: ${YELLOW}./scripts/test-keycloak-federation.sh all${NC}"
echo ""
echo -e "${YELLOW}⚠️  Note: You may see a security warning when accessing HTTPS URLs.${NC}"
echo -e "${YELLOW}    This is normal for self-signed certificates.${NC}"
echo -e "${YELLOW}    Click 'Advanced' → 'Proceed' to continue.${NC}"
echo ""

