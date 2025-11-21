#!/bin/bash

# ============================================
# DIVE V3 - Ubuntu 24.04.3 LTS Setup Script
# ============================================
# Prepares Ubuntu environment for DIVE V3 Docker deployment
# Usage: sudo ./scripts/setup-ubuntu.sh

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}DIVE V3 - Ubuntu 24.04.3 LTS Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if running on Ubuntu
if [ ! -f /etc/os-release ]; then
    echo -e "${RED}❌ Cannot detect OS. This script is for Ubuntu 24.04.3 LTS.${NC}"
    exit 1
fi

source /etc/os-release
if [ "$ID" != "ubuntu" ]; then
    echo -e "${RED}❌ This script is designed for Ubuntu. Detected: ${ID}${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Detected: ${PRETTY_NAME}${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ This script must be run as root (use sudo)${NC}"
    exit 1
fi

# Get the actual user who ran sudo
ACTUAL_USER=${SUDO_USER:-$(whoami)}
echo -e "${BLUE}Setting up for user: ${ACTUAL_USER}${NC}"
echo ""

# Step 1: Update system
echo -e "${BLUE}[1/9] Updating system packages...${NC}"
apt-get update -qq
apt-get upgrade -y -qq
echo -e "${GREEN}✅ System updated${NC}"
echo ""

# Step 2: Install Docker
echo -e "${BLUE}[2/9] Installing Docker...${NC}"
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    echo -e "${GREEN}✅ Docker already installed: ${DOCKER_VERSION}${NC}"
else
    # Remove old versions
    apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
    
    # Install dependencies
    apt-get install -y \
        ca-certificates \
        curl \
        gnupg \
        lsb-release
    
    # Add Docker's official GPG key
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    
    # Add Docker repository
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker Engine
    apt-get update -qq
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    echo -e "${GREEN}✅ Docker installed${NC}"
fi
echo ""

# Step 3: Configure Docker for user
echo -e "${BLUE}[3/9] Configuring Docker permissions...${NC}"
if ! groups ${ACTUAL_USER} | grep -q docker; then
    usermod -aG docker ${ACTUAL_USER}
    echo -e "${GREEN}✅ User ${ACTUAL_USER} added to docker group${NC}"
    echo -e "${YELLOW}⚠️  You must log out and back in for this to take effect${NC}"
else
    echo -e "${GREEN}✅ User ${ACTUAL_USER} already in docker group${NC}"
fi
echo ""

# Step 4: Start Docker
echo -e "${BLUE}[4/9] Starting Docker service...${NC}"
systemctl enable docker
systemctl start docker
if systemctl is-active --quiet docker; then
    echo -e "${GREEN}✅ Docker service is running${NC}"
else
    echo -e "${RED}❌ Failed to start Docker service${NC}"
    exit 1
fi
echo ""

# Step 5: Verify Docker Compose V2
echo -e "${BLUE}[5/9] Verifying Docker Compose...${NC}"
if docker compose version &> /dev/null; then
    COMPOSE_VERSION=$(docker compose version)
    echo -e "${GREEN}✅ ${COMPOSE_VERSION}${NC}"
else
    echo -e "${RED}❌ Docker Compose V2 not found${NC}"
    exit 1
fi
echo ""

# Step 6: Configure firewall
echo -e "${BLUE}[6/9] Configuring UFW firewall...${NC}"
if command -v ufw &> /dev/null; then
    # Allow DIVE V3 ports
    ufw allow 3000/tcp comment "DIVE V3 Frontend"
    ufw allow 4000/tcp comment "DIVE V3 Backend"
    ufw allow 8081/tcp comment "Keycloak HTTP"
    ufw allow 8443/tcp comment "Keycloak HTTPS"
    ufw allow 8181/tcp comment "OPA"
    ufw allow 8080/tcp comment "KAS"
    
    # Reload firewall
    ufw --force enable
    ufw reload
    
    echo -e "${GREEN}✅ Firewall configured${NC}"
else
    echo -e "${YELLOW}⚠️  UFW not installed, skipping firewall configuration${NC}"
fi
echo ""

# Step 7: Create directories with correct permissions
echo -e "${BLUE}[7/9] Creating application directories...${NC}"
cd "$(dirname "$0")/.."  # Go to project root

# Get actual user's UID and GID
ACTUAL_UID=$(id -u ${ACTUAL_USER})
ACTUAL_GID=$(id -g ${ACTUAL_USER})

# Backend directories
mkdir -p backend/logs backend/uploads/idp-themes
chown -R 1001:1001 backend/logs backend/uploads

# Frontend directories
mkdir -p frontend/.next
chown -R 1001:1001 frontend/.next

# KAS directories
mkdir -p kas/logs
chown -R 1001:1001 kas/logs

# Policy uploads
mkdir -p policies/uploads
chown -R 1001:1001 policies/uploads

# Keep root ownership for source files
chown -R ${ACTUAL_UID}:${ACTUAL_GID} backend/src frontend/src kas/src policies/*.rego

echo -e "${GREEN}✅ Directories created and permissions set${NC}"
echo ""

# Step 8: Install mkcert for SSL certificates
echo -e "${BLUE}[8/9] Installing mkcert for SSL certificates...${NC}"
if command -v mkcert &> /dev/null; then
    echo -e "${GREEN}✅ mkcert already installed${NC}"
else
    # Install mkcert
    apt-get install -y libnss3-tools
    curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
    chmod +x mkcert-v*-linux-amd64
    mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
    
    # Install local CA as actual user
    su - ${ACTUAL_USER} -c "mkcert -install"
    
    echo -e "${GREEN}✅ mkcert installed${NC}"
fi

# Trust DIVE certificates if they exist
if [ -f keycloak/certs/certificate.pem ]; then
    cp keycloak/certs/certificate.pem /usr/local/share/ca-certificates/dive-v3.crt
    update-ca-certificates
    echo -e "${GREEN}✅ DIVE certificates trusted${NC}"
else
    echo -e "${YELLOW}⚠️  DIVE certificates not found. Run certificate setup script.${NC}"
fi
echo ""

# Step 9: Configure system limits
echo -e "${BLUE}[9/9] Configuring system resource limits...${NC}"

# Check if limits already configured
if grep -q "# DIVE V3 limits" /etc/security/limits.conf; then
    echo -e "${GREEN}✅ System limits already configured${NC}"
else
    cat >> /etc/security/limits.conf << 'EOF'

# DIVE V3 limits
* soft nofile 65536
* hard nofile 65536
* soft nproc 4096
* hard nproc 4096
EOF
    
    # Apply sysctl settings
    cat >> /etc/sysctl.conf << 'EOF'

# DIVE V3 kernel parameters
fs.file-max = 100000
vm.max_map_count = 262144
EOF
    
    sysctl -p > /dev/null
    echo -e "${GREEN}✅ System limits configured${NC}"
fi
echo ""

# Final summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Ubuntu setup complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Log out and back in (for Docker group membership)"
echo "2. Generate SSL certificates:"
echo "   ./scripts/generate-dev-certs.sh"
echo "3. Start DIVE V3:"
echo "   docker compose up -d"
echo "4. Verify deployment:"
echo "   ./scripts/verify-platform-compatibility.sh"
echo ""
echo -e "${BLUE}Useful commands:${NC}"
echo "  docker compose ps          # View running services"
echo "  docker compose logs -f     # View logs"
echo "  docker compose down        # Stop all services"
echo "  docker system prune -a     # Clean up Docker (if needed)"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: You must log out and log back in for Docker permissions to take effect${NC}"
echo ""












