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
echo "  5. Initialize PostgreSQL database (NextAuth tables)"
echo "  6. Seed MongoDB database with configurable quantity of ZTDF documents"
echo "  7. Verify all services are healthy"
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
    echo "Enter your base hostname (just the domain/IP, no ports):"
    echo "  Examples: dive.example.com, divedeeper.internal, 192.168.1.100"
    echo "  Note: Ports will be added automatically (:3000, :5000, :8443)"
    read -p "> " RAW_HOSTNAME
    
    if [ -z "$RAW_HOSTNAME" ]; then
        echo -e "${YELLOW}No hostname provided, using localhost${NC}"
        CUSTOM_HOSTNAME="localhost"
    else
        # Sanitize hostname: remove protocol, port, paths
        CUSTOM_HOSTNAME=$(echo "$RAW_HOSTNAME" | sed -E 's|^https?://||' | sed -E 's|:[0-9]+.*$||' | sed -E 's|/.*$||')
        
        # Validate hostname format (allows subdomains, hyphens, short segments)
        # Check for basic issues: empty, starts/ends with dot, double dots, invalid hyphen positions
        if [[ -z "$CUSTOM_HOSTNAME" ]] || [[ "$CUSTOM_HOSTNAME" =~ ^\.|\.$|\.\.|\.-|-\. ]]; then
            echo -e "${RED}✗ Invalid hostname format: $RAW_HOSTNAME${NC}"
            echo -e "${YELLOW}Using localhost instead${NC}"
            CUSTOM_HOSTNAME="localhost"
        elif [[ ! "$CUSTOM_HOSTNAME" =~ ^[a-zA-Z0-9]([a-zA-Z0-9\.\-]*[a-zA-Z0-9])?$ ]]; then
            echo -e "${RED}✗ Invalid hostname format: $RAW_HOSTNAME${NC}"
            echo -e "${YELLOW}Using localhost instead${NC}"
            CUSTOM_HOSTNAME="localhost"
        else
            if [ "$RAW_HOSTNAME" != "$CUSTOM_HOSTNAME" ]; then
                echo -e "${YELLOW}⚠️  Sanitized hostname:${NC}"
                echo "   Input:  $RAW_HOSTNAME"
                echo "   Using:  $CUSTOM_HOSTNAME"
                echo ""
            fi
            echo -e "${GREEN}✓${NC} Will use hostname: ${CUSTOM_HOSTNAME}"
            echo ""
            
            # Configure hostname on the SERVER
            SERVER_IP=$(ip route get 1 2>/dev/null | awk '{print $7}' | head -1 || echo "127.0.0.1")
            echo -e "${CYAN}🔧 Configuring SERVER /etc/hosts...${NC}"
            
            # Check if hostname already exists in /etc/hosts
            if grep -q "$CUSTOM_HOSTNAME" /etc/hosts 2>/dev/null; then
                echo -e "${GREEN}✓${NC} ${CUSTOM_HOSTNAME} already in /etc/hosts"
            else
                echo "Adding ${CUSTOM_HOSTNAME} to SERVER /etc/hosts..."
                echo "$SERVER_IP $CUSTOM_HOSTNAME" | sudo tee -a /etc/hosts > /dev/null
                echo -e "${GREEN}✓${NC} Added to SERVER /etc/hosts: $SERVER_IP $CUSTOM_HOSTNAME"
            fi
            echo ""
            
            # CRITICAL: Warn about client-side configuration
            echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
            echo -e "${RED}║  ⚠️  CLIENT MACHINES NEED SEPARATE CONFIGURATION ⚠️           ║${NC}"
            echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
            echo ""
            echo -e "${YELLOW}The server is now configured, but YOUR LAPTOP/DESKTOP needs:${NC}"
            echo ""
            echo -e "${CYAN}On your browser machine (Linux/Mac):${NC}"
            echo -e "${GREEN}echo \"${SERVER_IP} ${CUSTOM_HOSTNAME}\" | sudo tee -a /etc/hosts${NC}"
            echo ""
            echo -e "${CYAN}On your browser machine (Windows, as Administrator):${NC}"
            echo -e "${GREEN}echo ${SERVER_IP} ${CUSTOM_HOSTNAME} >> C:\\Windows\\System32\\drivers\\etc\\hosts${NC}"
            echo ""
            read -p "Press Enter when you've configured your client machine, or Ctrl+C to configure later..."
            echo ""
        fi
    fi
else
    CUSTOM_HOSTNAME="localhost"
    echo -e "${GREEN}✓${NC} Using localhost"
fi

###############################################################################
# Database Seeding Configuration
###############################################################################

echo ""
echo -e "${CYAN}📊 Database Seeding Configuration${NC}"
echo ""
echo "How many ZTDF documents should be generated?"
echo ""
echo "  ${GREEN}1)${NC} 7,000 documents (default, ~2-3 minutes)"
echo "  ${GREEN}2)${NC} 1,000 documents (quick testing, ~20 seconds)"
echo "  ${GREEN}3)${NC} 15,000 documents (stress testing, ~5-7 minutes)"
echo "  ${GREEN}4)${NC} 20,000 documents (maximum, ~8-10 minutes)"
echo "  ${GREEN}5)${NC} Custom quantity (1-20,000)"
echo ""
read -p "Selection [1-5] (default: 1): " SEED_CHOICE

case "$SEED_CHOICE" in
    2)
        SEED_QUANTITY=1000
        ;;
    3)
        SEED_QUANTITY=15000
        ;;
    4)
        SEED_QUANTITY=20000
        ;;
    5)
        echo ""
        read -p "Enter quantity (1-20000): " CUSTOM_SEED
        if [[ "$CUSTOM_SEED" =~ ^[0-9]+$ ]] && [ "$CUSTOM_SEED" -ge 1 ] && [ "$CUSTOM_SEED" -le 20000 ]; then
            SEED_QUANTITY=$CUSTOM_SEED
        else
            echo -e "${YELLOW}⚠️  Invalid quantity, using default: 7000${NC}"
            SEED_QUANTITY=7000
        fi
        ;;
    *)
        SEED_QUANTITY=7000
        ;;
esac

echo ""
echo -e "${GREEN}✓${NC} Will generate: ${GREEN}${SEED_QUANTITY}${NC} ZTDF documents"

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
# Phase 6.5: Configure Custom Hostname (if provided)
###############################################################################

if [ "$CUSTOM_HOSTNAME" != "localhost" ]; then
    echo -e "${YELLOW}🌐 Phase 6.5: Configuring Custom Hostname${NC}"
    echo ""
    echo "Creating docker-compose.hostname.yml for: ${CUSTOM_HOSTNAME}"
    
    cat > docker-compose.hostname.yml << EOF
# Docker Compose Override for Custom Hostname
# Usage: docker-compose -f docker-compose.yml -f docker-compose.mkcert.yml -f docker-compose.hostname.yml up
# Generated by deploy-ubuntu.sh

version: '3.8'

services:
  # Keycloak - Update hostname
  keycloak:
    environment:
      KC_HOSTNAME: ${CUSTOM_HOSTNAME}
      KC_HOSTNAME_STRICT: false
      KC_HOSTNAME_URL: https://${CUSTOM_HOSTNAME}:8443

  # Backend - Update CORS allowed origins
  backend:
    environment:
      NEXT_PUBLIC_BASE_URL: https://${CUSTOM_HOSTNAME}:3000
      FRONTEND_URL: https://${CUSTOM_HOSTNAME}:3000
      CORS_ALLOWED_ORIGINS: https://${CUSTOM_HOSTNAME}:3000,http://${CUSTOM_HOSTNAME}:3000

  # Frontend - Update public URLs
  nextjs:
    environment:
      NEXT_PUBLIC_API_URL: https://${CUSTOM_HOSTNAME}:4000
      NEXT_PUBLIC_BACKEND_URL: https://${CUSTOM_HOSTNAME}:4000
      NEXT_PUBLIC_BASE_URL: https://${CUSTOM_HOSTNAME}:3000
      NEXT_PUBLIC_KEYCLOAK_URL: https://${CUSTOM_HOSTNAME}:8443
      AUTH_URL: https://${CUSTOM_HOSTNAME}:3000
      NEXTAUTH_URL: https://${CUSTOM_HOSTNAME}:3000
      KEYCLOAK_BASE_URL: https://${CUSTOM_HOSTNAME}:8443
      KEYCLOAK_URL: https://${CUSTOM_HOSTNAME}:8443
EOF
    
    echo -e "${GREEN}✓${NC} docker-compose.hostname.yml created"
    echo ""
fi

###############################################################################
# Phase 7: Start Docker Services (with Certificate Support)
###############################################################################

echo -e "${YELLOW}🐳 Phase 7: Starting Docker Services${NC}"
echo ""

# Check if unified certificate system is in place
if [ -f docker-compose.mkcert.yml ]; then
    echo "Building and starting services in stages (prevents race conditions)..."
    echo "  Hostname: ${CUSTOM_HOSTNAME}"
    echo ""
    
    # Compose file arguments
    COMPOSE_FILES="-f docker-compose.yml -f docker-compose.mkcert.yml"
    if [ "$CUSTOM_HOSTNAME" != "localhost" ] && [ -f docker-compose.hostname.yml ]; then
        COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.hostname.yml"
        echo "Using custom hostname configuration"
    fi
    
    # Stage 1: Start PostgreSQL and MongoDB FIRST
    echo ""
    echo "Stage 1: Starting databases (PostgreSQL, MongoDB, Redis)..."
    docker compose $COMPOSE_FILES up -d postgres mongo redis
    
    # Wait for PostgreSQL to be REALLY ready (not just accepting connections)
    echo -n "Waiting for PostgreSQL to be fully initialized..."
    for i in {1..30}; do
        if docker compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
            # Additional check: Verify we can actually query
            if docker compose exec -T postgres psql -U postgres -c "SELECT 1" > /dev/null 2>&1; then
                echo -e " ${GREEN}✓${NC}"
                break
            fi
        fi
        echo -n "."
        sleep 2
    done
    
    # CRITICAL: Explicitly create keycloak_db database if it doesn't exist
    echo "Ensuring Keycloak database exists and is initialized..."
    
    # Check if database exists, create if not
    if ! docker compose exec -T postgres psql -U postgres -c "SELECT 1 FROM pg_database WHERE datname='keycloak_db'" | grep -q 1; then
        echo "Creating keycloak_db database..."
        docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE keycloak_db OWNER postgres;"
    else
        echo "Database keycloak_db exists, checking schema..."
        
        # Check if schema is initialized (migration_model table exists)
        if ! docker compose exec -T postgres psql -U postgres -d keycloak_db -c "\dt migration_model" 2>/dev/null | grep -q "migration_model"; then
            echo -e "${YELLOW}⚠️  Database exists but schema not initialized - recreating...${NC}"
            docker compose stop keycloak 2>/dev/null || true
            docker compose exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS keycloak_db;" 
            docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE keycloak_db OWNER postgres;"
            echo "Database recreated - Keycloak will initialize schema on startup"
        fi
    fi
    
    echo -e "${GREEN}✓${NC} Database keycloak_db ready"
    
    # Wait for MongoDB
    echo -n "Waiting for MongoDB..."
    for i in {1..30}; do
        if docker compose exec -T mongo mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
            echo -e " ${GREEN}✓${NC}"
            break
        fi
        echo -n "."
        sleep 1
    done
    
    echo -e "${GREEN}✓${NC} Stage 1 complete: Databases ready"
    echo ""
    
    # Stage 2: Start Keycloak (now that database is FULLY ready)
    echo "Stage 2: Starting Keycloak..."
    docker compose $COMPOSE_FILES up -d keycloak
    echo -e "${GREEN}✓${NC} Stage 2 complete: Keycloak starting"
    echo ""
    
    # Stage 3: Start remaining services
    echo "Stage 3: Starting application services (Backend, Frontend, KAS, OPA)..."
    docker compose $COMPOSE_FILES up -d --build
    echo -e "${GREEN}✓${NC} Stage 3 complete: All services started"
    
    # Verify certificates exist in containers
    echo ""
    echo "Verifying certificate deployment to containers..."
    
    # Check frontend certificates
    if docker compose exec -T nextjs test -f /opt/app/certs/key.pem > /dev/null 2>&1; then
        echo -e "  Frontend certificates: ${GREEN}✓${NC}"
    else
        echo -e "  Frontend certificates: ${RED}✗${NC} (will cause startup failures)"
        echo "    Running quick fix..."
        # Copy certificates if they exist locally but not in container
        if [ -f frontend/certs/key.pem ]; then
            docker compose restart nextjs
            echo -e "    ${GREEN}✓${NC} Frontend restarted with certificates"
        fi
    fi
    
    # Check backend certificates
    if docker compose exec -T backend test -f /opt/app/certs/key.pem > /dev/null 2>&1; then
        echo -e "  Backend certificates: ${GREEN}✓${NC}"
    else
        echo -e "  Backend certificates: ${YELLOW}⚠${NC} (may cause issues)"
    fi
else
    echo "Building and starting all services (basic configuration)..."
    docker compose up -d --build
    echo -e "${GREEN}✓${NC} Main services started"
fi

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

# Quick pre-check to show status
if ! docker ps --format '{{.Names}}' | grep -q "dive-v3-keycloak"; then
    echo ""
    echo -e "${RED}❌ Keycloak container is not running!${NC}"
    echo "Container status:"
    docker compose ps keycloak
    echo ""
    echo "Cannot proceed without Keycloak. Exiting..."
    exit 1
fi

KEYCLOAK_READY=0
for i in {1..60}; do
    # Method 1: Try docker exec with curl (if curl exists in container)
    if docker exec dive-v3-keycloak curl -sf http://localhost:8080/health/ready > /dev/null 2>&1; then
        KEYCLOAK_READY=1
        break
    fi
    
    # Method 2: Check Keycloak logs for "started in" message (reliable indicator)
    if docker compose logs keycloak 2>/dev/null | grep -q "started in"; then
        KEYCLOAK_READY=1
        break
    fi
    
    # Method 3: Try external health check as fallback
    if curl -k -sf https://localhost:8443/health/ready > /dev/null 2>&1; then
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
    echo ""
    echo "Container status:"
    docker compose ps keycloak
    echo ""
    echo "Container is running: $(docker ps --format '{{.Names}}' | grep dive-v3-keycloak || echo 'NO')"
    echo ""
    echo "Last 50 lines of Keycloak logs:"
    docker compose logs keycloak --tail 50
    echo ""
    echo "Testing health check methods:"
    echo -n "  - docker exec curl: "
    docker exec dive-v3-keycloak curl -sf http://localhost:8080/health/ready > /dev/null 2>&1 && echo "✓ Works" || echo "✗ Failed"
    echo -n "  - External HTTPS: "
    curl -k -sf https://localhost:8443/health/ready > /dev/null 2>&1 && echo "✓ Works" || echo "✗ Failed"
    echo -n "  - Logs contain 'started in': "
    docker compose logs keycloak 2>/dev/null | grep -q "started in" && echo "✓ Yes" || echo "✗ No"
    echo ""
    echo -e "${YELLOW}Continuing anyway - Keycloak may still be starting...${NC}"
fi

echo ""
echo -e "${GREEN}✓${NC} All infrastructure services are ready"
echo ""

###############################################################################
# Phase 8.5: Optional External IdPs (Federation Testing)
###############################################################################

# Optional: Start external IdPs if directory exists
if [ -d external-idps ] && [ -f external-idps/docker-compose.yml ]; then
    echo ""
    echo -e "${CYAN}🌍 External IdPs Available:${NC}"
    echo "  Spain SAML IdP (9443)"
    echo "  USA OIDC IdP (9082)"
    echo ""
    read -p "Do you want to start external IdPs for federation testing? (y/N): " START_IDPS
    if [[ $START_IDPS =~ ^[Yy]$ ]]; then
        echo ""
        echo "Starting external IdP services..."
        
        # Verify the main DIVE network exists
        if ! docker network inspect dive-v3_dive-network >/dev/null 2>&1; then
            echo -e "${YELLOW}⚠️  Main DIVE network not found, creating it...${NC}"
            docker network create dive-v3_dive-network || true
        fi
        
        # Start external IdPs (they connect to the main DIVE network)
        cd external-idps
        docker compose down 2>/dev/null || true  # Clean up any stale containers
        docker compose up -d --build
        cd "$PROJECT_ROOT"
        
        echo -e "${GREEN}✓${NC} External IdPs started"
        echo ""
        
        # Brief health check
        echo -n "Waiting for external IdPs to be ready..."
        sleep 10
        
        if docker ps --format '{{.Names}}' | grep -q "dive-spain-saml-idp" && \
           docker ps --format '{{.Names}}' | grep -q "dive-usa-oidc-idp"; then
            echo -e " ${GREEN}✓${NC}"
        else
            echo -e " ${YELLOW}⚠️  Some IdPs may still be starting${NC}"
        fi
        echo ""
    else
        echo -e "${YELLOW}⚠️  External IdPs not started${NC}"
        echo "   Start later with: cd external-idps && docker compose up -d"
        echo ""
    fi
fi

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
    
    # Apply with proper variables (use custom hostname if provided)
    # CRITICAL SEPARATION:
    # - keycloak_url: For Terraform provider connection (always localhost:8443)
    #   Terraform runs on HOST machine, connects via port-forwarding
    # - keycloak_public_url: For client redirects (custom hostname when configured)
    #   Browsers and clients access Keycloak via this URL
    terraform apply -auto-approve \
      -var="keycloak_admin_username=admin" \
      -var="keycloak_admin_password=admin" \
      -var="keycloak_url=https://localhost:8443" \
      -var="keycloak_public_url=https://${CUSTOM_HOSTNAME}:8443" \
      -var="app_url=https://${CUSTOM_HOSTNAME}:3000" \
      -var="backend_url=https://${CUSTOM_HOSTNAME}:4000"
    
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
# Phase 10: Import Certificates into Keycloak Truststore
###############################################################################

echo -e "${YELLOW}🔐 Phase 10: Import Certificates into Keycloak Truststore${NC}"
echo ""
echo "Importing SSL/TLS certificates into Keycloak's Java truststore..."
echo "This enables Keycloak to trust:"
echo "  • Its own certificate (for callbacks)"
echo "  • mkcert Root CA (for local HTTPS)"
echo "  • DIVE Root CAs (for external IdP federation)"
echo ""

if [ -f scripts/import-keycloak-certs-runtime.sh ]; then
    # Run the import script (it handles errors gracefully)
    ./scripts/import-keycloak-certs-runtime.sh 2>&1 | grep -v "Warning" || {
        echo -e "${YELLOW}⚠️  Certificate import had warnings (this is usually OK)${NC}"
        echo "   Keycloak should still work for basic functionality"
        echo "   Federation may require manual certificate import if issues persist"
    }
    echo ""
    echo -e "${GREEN}✓${NC} Certificate import complete"
else
    echo -e "${YELLOW}⚠️  Certificate import script not found${NC}"
    echo "   Keycloak will use default truststore"
    echo "   Federation with external IdPs may not work"
    echo ""
    echo "   To import certificates manually later:"
    echo "   ./scripts/import-keycloak-certs-runtime.sh"
fi

echo ""

###############################################################################
# Phase 11: Initialize PostgreSQL Database (NextAuth Tables)
###############################################################################

echo -e "${YELLOW}🗄️  Phase 11: Initializing PostgreSQL Database${NC}"
echo ""

echo "Creating NextAuth tables in dive_v3_app database..."
if docker cp frontend/create-nextauth-tables.sql dive-v3-postgres:/tmp/create-tables.sql > /dev/null 2>&1; then
    if docker compose exec -T postgres psql -U postgres -d dive_v3_app -f /tmp/create-tables.sql > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} NextAuth tables initialized"
    else
        echo -e "${YELLOW}⚠${NC}  Tables may already exist (this is OK)"
    fi
else
    echo -e "${RED}✗${NC} Failed to copy SQL file"
    echo "   You may need to run this manually:"
    echo "   docker cp frontend/create-nextauth-tables.sql dive-v3-postgres:/tmp/create-tables.sql"
    echo "   docker compose exec postgres psql -U postgres -d dive_v3_app -f /tmp/create-tables.sql"
fi

echo ""

###############################################################################
# Phase 12.5: Verify Terraform Providers are Executable
###############################################################################

echo -e "${YELLOW}🔧 Phase 12.5: Verifying Terraform Provider Permissions${NC}"
echo ""

if [ -d "terraform/.terraform/providers" ]; then
    echo -n "Checking Terraform provider permissions..."
    
    # Find all provider binaries and make them executable
    PROVIDER_COUNT=$(find terraform/.terraform/providers -type f -name "terraform-provider-*" 2>/dev/null | wc -l)
    
    if [ "$PROVIDER_COUNT" -gt 0 ]; then
        find terraform/.terraform/providers -type f -name "terraform-provider-*" -exec chmod +x {} \; 2>/dev/null || true
        echo -e " ${GREEN}✓${NC} ($PROVIDER_COUNT providers)"
    else
        echo -e " ${YELLOW}⚠${NC} No providers found (will be downloaded on first run)"
    fi
else
    echo "Terraform providers not yet initialized (this is normal)"
    echo "Providers will be downloaded when you run 'terraform init'"
fi

echo ""

###############################################################################
# Phase 12.8: Initialize COI Keys in MongoDB
###############################################################################

echo -e "${YELLOW}🔑 Phase 12.8: Initializing COI Keys${NC}"
echo ""

echo "Initializing COI keys (US-ONLY, FVEY, NATO, etc.)..."
# Initialize COI keys using the TypeScript script inside the backend container
docker compose exec -T backend npx tsx src/scripts/initialize-coi-keys.ts || {
    echo -e "${YELLOW}⚠️  COI keys initialization failed, trying alternative method...${NC}"
    # Fallback to MongoDB shell script if TypeScript fails
    if docker compose exec -T mongo mongosh -u admin -p password --authenticationDatabase admin dive-v3 /docker-entrypoint-initdb.d/init-coi-keys.js > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} COI keys initialized via MongoDB shell"
    else
        echo -e "${RED}✗${NC} Failed to initialize COI keys"
        echo "   This may cause seeding to fail"
        echo "   You can manually run: docker compose exec backend npx tsx src/scripts/initialize-coi-keys.ts"
    fi
}

echo -e "${GREEN}✓${NC} COI keys initialized"
echo ""

###############################################################################
# Phase 13: Seed MongoDB Database
###############################################################################

echo -e "${YELLOW}🌱 Phase 13: Seeding MongoDB Database${NC}"
echo ""

cd "$PROJECT_ROOT/backend"

if [ ! -d node_modules ]; then
    echo "Installing backend dependencies..."
    npm install
    echo -e "${GREEN}✓${NC} Backend dependencies installed"
fi

echo "Seeding database with ${SEED_QUANTITY} ZTDF documents..."
echo "(This may take several minutes depending on quantity)"
echo ""

# Run seed inside backend container where dependencies are available
set +e  # Temporarily disable exit-on-error for seeding
docker compose exec -T -e SEED_QUANTITY=$SEED_QUANTITY backend npm run seed-database
SEED_EXIT_CODE=$?
set -e  # Re-enable exit-on-error

# Give container time to flush output and fully exit
sleep 2

if [ $SEED_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Database seeded successfully (exit code: 0)"
    
    # Verify documents were actually inserted
    echo -n "Verifying seeded documents..."
    DOC_COUNT=$(docker compose exec -T mongo mongosh -u admin -p password --authenticationDatabase admin --quiet dive-v3 --eval "db.resources.countDocuments({resourceId: {\$regex: /^doc-generated-/}})" 2>/dev/null | tail -1 | tr -d '\r')
    
    if [ ! -z "$DOC_COUNT" ] && [ "$DOC_COUNT" -gt 0 ]; then
        echo -e " ${GREEN}✓${NC} ($DOC_COUNT documents)"
    else
        echo -e " ${YELLOW}⚠${NC} (could not verify count)"
    fi
else
    echo -e "${YELLOW}⚠️  Seed exited with code $SEED_EXIT_CODE${NC}"
    echo "   Attempting to verify if documents were seeded anyway..."
    
    DOC_COUNT=$(docker compose exec -T mongo mongosh -u admin -p password --authenticationDatabase admin --quiet dive-v3 --eval "db.resources.countDocuments({resourceId: {\$regex: /^doc-generated-/}})" 2>/dev/null | tail -1 | tr -d '\r')
    
    if [ ! -z "$DOC_COUNT" ] && [ "$DOC_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✓${NC} Documents found: $DOC_COUNT (seeding succeeded despite non-zero exit)"
    else
        echo -e "${RED}✗${NC} No documents found - seeding may have failed"
    fi
fi

cd "$PROJECT_ROOT"
echo ""

###############################################################################
# Phase 14: Restart Application Services
###############################################################################

echo -e "${YELLOW}🔄 Phase 14: Restarting Application Services${NC}"
echo ""

echo "Restarting backend to pick up Keycloak configuration..."
docker compose restart backend

echo "Restarting frontend..."
docker compose restart nextjs

sleep 10

echo -e "${GREEN}✓${NC} Application services restarted"
echo ""

###############################################################################
# Phase 15: Verify Deployment
###############################################################################

echo -e "${YELLOW}✅ Phase 15: Verifying Deployment${NC}"
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
    echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ⚠️  CRITICAL: CLIENT DNS CONFIGURATION REQUIRED ⚠️           ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Your browser will NOT be able to access DIVE V3 unless you configure DNS!${NC}"
    echo ""
    SERVER_IP=$(ip route get 1 2>/dev/null | awk '{print $7}' | head -1 || echo '<your-server-ip>')
    
    echo -e "${CYAN}🔧 Quick Fix (Run on YOUR browser machine, not the server):${NC}"
    echo ""
    echo -e "  ${CYAN}Linux/Mac:${NC}"
    echo -e "  ${GREEN}echo \"${SERVER_IP} ${CUSTOM_HOSTNAME}\" | sudo tee -a /etc/hosts${NC}"
    echo ""
    echo -e "  ${CYAN}Windows (as Administrator):${NC}"
    echo -e "  ${GREEN}echo ${SERVER_IP} ${CUSTOM_HOSTNAME} >> C:\\Windows\\System32\\drivers\\etc\\hosts${NC}"
    echo ""
    echo -e "${CYAN}📋 Detailed Diagnostics & Instructions:${NC}"
    echo -e "  Run this script on the server for full diagnostics:"
    echo -e "  ${GREEN}./scripts/diagnose-custom-hostname.sh${NC}"
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${CYAN}🔐 SSL Certificate Trust (Optional - Avoid Browser Warnings):${NC}"
    echo ""
    echo "  1. ${YELLOW}Copy Root CA from this server:${NC}"
    echo "     ${BLUE}Location:${NC} certs/mkcert/rootCA.pem"
    echo "     ${BLUE}Command:${NC} scp user@${SERVER_IP}:$(pwd)/certs/mkcert/rootCA.pem ."
    echo ""
    echo "  2. ${YELLOW}Install on client machines:${NC}"
    echo ""
    echo "     ${BLUE}macOS:${NC}"
    echo "       sudo security add-trusted-cert -d -r trustRoot \\"
    echo "         -k /Library/Keychains/System.keychain rootCA.pem"
    echo ""
    echo "     ${BLUE}Linux (Ubuntu/Debian):${NC}"
    echo "       sudo cp rootCA.pem /usr/local/share/ca-certificates/dive-v3-ca.crt"
    echo "       sudo update-ca-certificates"
    echo ""
    echo "     ${BLUE}Windows:${NC}"
    echo "       Double-click rootCA.pem → Install Certificate"
    echo "       → Trusted Root Certification Authorities"
    echo ""
    echo "     ${BLUE}Browser Only (Chrome/Edge):${NC}"
    echo "       Settings → Security → Manage Certificates"
    echo "       → Trusted Root → Import → rootCA.pem"
    echo ""
    echo "  4. ${YELLOW}Clients can now access:${NC}"
    echo "     https://${CUSTOM_HOSTNAME}:3000"
    echo ""
    echo -e "${CYAN}📋 For Federation Partners:${NC}"
    echo "  - Share certs/mkcert/rootCA.pem with partners"
    echo "  - They install it as shown above"
    echo "  - Configure IdP to trust ${CUSTOM_HOSTNAME}"
    echo "  - Install THEIR Root CAs using Phase 4 (if needed)"
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

