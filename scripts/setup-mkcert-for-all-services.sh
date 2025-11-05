#!/bin/bash
# Unified mkcert Certificate Generation for All DIVE V3 Services
# This script generates mkcert certificates for all services and supports custom hostnames

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Detect project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Default hostname (can be overridden)
CUSTOM_HOSTNAME="${DIVE_HOSTNAME:-localhost}"

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  DIVE V3 - mkcert Certificate Generator${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""

# Check if mkcert is installed
if ! command -v mkcert &> /dev/null; then
    echo -e "${RED}❌ mkcert is not installed${NC}"
    echo ""
    echo "Install mkcert:"
    echo "  macOS:   brew install mkcert"
    echo "  Linux:   See https://github.com/FiloSottile/mkcert#installation"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ mkcert is installed${NC}"
echo ""

# Install local CA if not already done
echo -e "${YELLOW}Installing local CA (if needed)...${NC}"
mkcert -install
echo ""

# Create certificates directory structure
echo -e "${YELLOW}Creating certificate directories...${NC}"

# Create directories with proper permissions
CERT_DIRS=(
    "$PROJECT_ROOT/certs/mkcert"
    "$PROJECT_ROOT/keycloak/certs"
    "$PROJECT_ROOT/backend/certs"
    "$PROJECT_ROOT/frontend/certs"
    "$PROJECT_ROOT/kas/certs"
    "$PROJECT_ROOT/external-idps/certs"
)

for dir in "${CERT_DIRS[@]}"; do
    mkdir -p "$dir" 2>/dev/null || sudo mkdir -p "$dir"
    # Ensure current user owns the directory
    if [ -d "$dir" ]; then
        sudo chown -R $USER:$USER "$dir" 2>/dev/null || chown -R $USER:$USER "$dir" 2>/dev/null || true
        chmod -R 755 "$dir"
    fi
done

echo -e "${GREEN}✅ Directories created${NC}"
echo ""

# Define all hostnames to include in certificate
HOSTNAMES=(
    "localhost"
    "127.0.0.1"
    "::1"
    "keycloak"
    "backend"
    "nextjs"
    "frontend"
    "kas"
    "opa"
    "mongo"
    "postgres"
    "redis"
    "authzforce"
    "spain-saml"
    "usa-oidc"
    "host.docker.internal"
)

# Add custom hostname if specified
if [ "$CUSTOM_HOSTNAME" != "localhost" ]; then
    echo -e "${BLUE}Using custom hostname: ${CUSTOM_HOSTNAME}${NC}"
    HOSTNAMES+=("$CUSTOM_HOSTNAME")
    HOSTNAMES+=("*.${CUSTOM_HOSTNAME}")
    
    # Add specific service subdomains
    HOSTNAMES+=("keycloak.${CUSTOM_HOSTNAME}")
    HOSTNAMES+=("backend.${CUSTOM_HOSTNAME}")
    HOSTNAMES+=("frontend.${CUSTOM_HOSTNAME}")
    HOSTNAMES+=("kas.${CUSTOM_HOSTNAME}")
    HOSTNAMES+=("opa.${CUSTOM_HOSTNAME}")
    HOSTNAMES+=("spain.${CUSTOM_HOSTNAME}")
    HOSTNAMES+=("usa.${CUSTOM_HOSTNAME}")
    echo ""
fi

# Generate master certificate with all hostnames
echo -e "${YELLOW}Generating master certificate with all hostnames...${NC}"
cd "$PROJECT_ROOT/certs/mkcert"

mkcert \
    -cert-file certificate.pem \
    -key-file key.pem \
    "${HOSTNAMES[@]}"

echo -e "${GREEN}✅ Master certificate generated${NC}"
echo ""

# Display certificate details
echo -e "${BLUE}Certificate includes:${NC}"
openssl x509 -in certificate.pem -noout -text | grep -A 1 "Subject Alternative Name" || echo "  (All specified hostnames)"
echo ""

# Copy certificates to all service directories
echo -e "${YELLOW}Distributing certificates to services...${NC}"

# Function to safely copy certificate files
copy_cert() {
    local src_cert="$1"
    local src_key="$2"
    local dest_dir="$3"
    local service_name="$4"
    
    # Try normal copy first, use sudo if needed
    if cp "$src_cert" "$dest_dir/certificate.pem" 2>/dev/null && \
       cp "$src_key" "$dest_dir/key.pem" 2>/dev/null; then
        chmod 644 "$dest_dir/certificate.pem" "$dest_dir/key.pem" 2>/dev/null || true
        echo -e "  ${GREEN}✓${NC} $service_name"
    else
        sudo cp "$src_cert" "$dest_dir/certificate.pem"
        sudo cp "$src_key" "$dest_dir/key.pem"
        sudo chmod 644 "$dest_dir/certificate.pem" "$dest_dir/key.pem"
        sudo chown $USER:$USER "$dest_dir/certificate.pem" "$dest_dir/key.pem" 2>/dev/null || true
        echo -e "  ${GREEN}✓${NC} $service_name (required elevated permissions)"
    fi
}

# Distribute to all services
copy_cert "certificate.pem" "key.pem" "$PROJECT_ROOT/keycloak/certs" "Keycloak"
copy_cert "certificate.pem" "key.pem" "$PROJECT_ROOT/backend/certs" "Backend"
copy_cert "certificate.pem" "key.pem" "$PROJECT_ROOT/frontend/certs" "Frontend"
copy_cert "certificate.pem" "key.pem" "$PROJECT_ROOT/kas/certs" "KAS"
copy_cert "certificate.pem" "key.pem" "$PROJECT_ROOT/external-idps/certs" "External IdPs"

echo ""

# Get mkcert CA root certificate location
CAROOT=$(mkcert -CAROOT)
echo -e "${YELLOW}Installing mkcert CA in containers...${NC}"
echo -e "  CA Root location: ${CAROOT}"

# Copy CA certificate to shared location
if [ -f "${CAROOT}/rootCA.pem" ]; then
    cp "${CAROOT}/rootCA.pem" "$PROJECT_ROOT/certs/mkcert/rootCA.pem" 2>/dev/null || \
        sudo cp "${CAROOT}/rootCA.pem" "$PROJECT_ROOT/certs/mkcert/rootCA.pem"
    cp "${CAROOT}/rootCA-key.pem" "$PROJECT_ROOT/certs/mkcert/rootCA-key.pem" 2>/dev/null || true
    
    # Distribute CA to service directories for Docker trust
    for dir in keycloak backend frontend kas external-idps; do
        if cp "${CAROOT}/rootCA.pem" "$PROJECT_ROOT/${dir}/certs/rootCA.pem" 2>/dev/null; then
            chmod 644 "$PROJECT_ROOT/${dir}/certs/rootCA.pem" 2>/dev/null || true
        else
            sudo cp "${CAROOT}/rootCA.pem" "$PROJECT_ROOT/${dir}/certs/rootCA.pem"
            sudo chmod 644 "$PROJECT_ROOT/${dir}/certs/rootCA.pem"
            sudo chown $USER:$USER "$PROJECT_ROOT/${dir}/certs/rootCA.pem" 2>/dev/null || true
        fi
    done
    
    echo -e "${GREEN}✅ CA certificate distributed${NC}"
else
    echo -e "${YELLOW}⚠️  Warning: CA certificate not found at ${CAROOT}/rootCA.pem${NC}"
fi
echo ""

# Create environment variable template
echo -e "${YELLOW}Creating environment configuration...${NC}"
cat > "$PROJECT_ROOT/.env.mkcert" << EOF
# mkcert Certificate Configuration
# Generated: $(date)

# Custom hostname for remote access
DIVE_HOSTNAME=${CUSTOM_HOSTNAME}

# Certificate paths (Docker internal)
CERT_FILE=/opt/app/certs/certificate.pem
KEY_FILE=/opt/app/certs/key.pem
CA_FILE=/opt/app/certs/rootCA.pem

# SSL Configuration
NODE_TLS_REJECT_UNAUTHORIZED=0
NODE_EXTRA_CA_CERTS=/opt/app/certs/rootCA.pem

# Public URLs (for browser access)
NEXT_PUBLIC_KEYCLOAK_URL=https://${CUSTOM_HOSTNAME}:8443
NEXT_PUBLIC_API_URL=https://${CUSTOM_HOSTNAME}:4000
NEXT_PUBLIC_FRONTEND_URL=https://${CUSTOM_HOSTNAME}:3000

# Internal Docker URLs (for service-to-service)
KEYCLOAK_URL=https://keycloak:8443
BACKEND_URL=https://backend:4000
FRONTEND_URL=https://nextjs:3000
EOF

echo -e "${GREEN}✅ Configuration saved to .env.mkcert${NC}"
echo ""

# Generate docker-compose override
echo -e "${YELLOW}Creating docker-compose override...${NC}"
cat > "$PROJECT_ROOT/docker-compose.mkcert.yml" << 'EOF'
# Docker Compose Override for mkcert Certificates
# Usage: docker-compose -f docker-compose.yml -f docker-compose.mkcert.yml up

version: '3.8'

services:
  # Keycloak - Already configured, ensure cert paths are correct
  keycloak:
    volumes:
      - ./certs/mkcert:/opt/app/certs:ro
    environment:
      KC_HTTPS_CERTIFICATE_FILE: /opt/app/certs/certificate.pem
      KC_HTTPS_CERTIFICATE_KEY_FILE: /opt/app/certs/key.pem

  # Backend - Add HTTPS support
  backend:
    volumes:
      - ./certs/mkcert:/opt/app/certs:ro
    environment:
      HTTPS_ENABLED: "true"
      CERT_FILE: /opt/app/certs/certificate.pem
      KEY_FILE: /opt/app/certs/key.pem
      CA_FILE: /opt/app/certs/rootCA.pem
      NODE_EXTRA_CA_CERTS: /opt/app/certs/rootCA.pem

  # Frontend - Add HTTPS support
  nextjs:
    volumes:
      - ./certs/mkcert:/opt/app/certs:ro
    environment:
      HTTPS_ENABLED: "true"
      CERT_FILE: /opt/app/certs/certificate.pem
      KEY_FILE: /opt/app/certs/key.pem
      CA_FILE: /opt/app/certs/rootCA.pem
      NODE_EXTRA_CA_CERTS: /opt/app/certs/rootCA.pem

  # KAS - Add HTTPS support
  kas:
    volumes:
      - ./certs/mkcert:/opt/app/certs:ro
    environment:
      HTTPS_ENABLED: "true"
      CERT_FILE: /opt/app/certs/certificate.pem
      KEY_FILE: /opt/app/certs/key.pem
      CA_FILE: /opt/app/certs/rootCA.pem
      NODE_EXTRA_CA_CERTS: /opt/app/certs/rootCA.pem

  # Note: External IdPs (spain-saml, usa-oidc) are defined in external-idps/docker-compose.yml
  # To use certificates with external IdPs, use:
  #   cd external-idps && docker-compose up -d
EOF

echo -e "${GREEN}✅ Override saved to docker-compose.mkcert.yml${NC}"
echo ""

# Create verification script
cat > "$PROJECT_ROOT/scripts/verify-mkcert-setup.sh" << 'VERIFY_EOF'
#!/bin/bash
# Verify mkcert certificate installation

set -e

PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"

echo "Verifying mkcert certificate installation..."
echo ""

# Check certificate files exist
CERT_DIRS=(
    "certs/mkcert"
    "keycloak/certs"
    "backend/certs"
    "frontend/certs"
    "kas/certs"
    "external-idps/certs"
)

for dir in "${CERT_DIRS[@]}"; do
    if [ -f "$PROJECT_ROOT/$dir/certificate.pem" ] && [ -f "$PROJECT_ROOT/$dir/key.pem" ]; then
        echo "✅ $dir - certificates present"
    else
        echo "❌ $dir - certificates missing"
    fi
done

echo ""
echo "Testing certificate validity..."
openssl x509 -in "$PROJECT_ROOT/certs/mkcert/certificate.pem" -noout -text | grep -E "(Issuer|Subject|DNS:|Not Before|Not After)" || true
echo ""
echo "✅ Verification complete"
VERIFY_EOF

chmod +x "$PROJECT_ROOT/scripts/verify-mkcert-setup.sh"

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ mkcert Certificate Setup Complete!${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}📋 What was done:${NC}"
echo "  ✓ Generated mkcert certificates for all services"
echo "  ✓ Distributed certificates to all service directories"
echo "  ✓ Created docker-compose.mkcert.yml override"
echo "  ✓ Created .env.mkcert configuration"
echo "  ✓ Installed CA certificate in all containers"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo ""
echo "  1. Verify installation:"
echo "     ${BLUE}./scripts/verify-mkcert-setup.sh${NC}"
echo ""
echo "  2. Update your services to use HTTPS with the certificates"
echo ""
echo "  3. Restart services with mkcert support:"
echo "     ${BLUE}docker-compose -f docker-compose.yml -f docker-compose.mkcert.yml up -d${NC}"
echo ""
echo "  4. For remote access, add to /etc/hosts or DNS:"
if [ "$CUSTOM_HOSTNAME" != "localhost" ]; then
    echo "     ${BLUE}<your-ip> ${CUSTOM_HOSTNAME}${NC}"
    echo "     ${BLUE}<your-ip> keycloak.${CUSTOM_HOSTNAME}${NC}"
    echo "     ${BLUE}<your-ip> backend.${CUSTOM_HOSTNAME}${NC}"
    echo "     ${BLUE}<your-ip> frontend.${CUSTOM_HOSTNAME}${NC}"
else
    echo "     ${YELLOW}Set DIVE_HOSTNAME environment variable to use custom hostname${NC}"
    echo "     ${BLUE}DIVE_HOSTNAME=mydomain.local ./scripts/setup-mkcert-for-all-services.sh${NC}"
fi
echo ""
echo -e "${YELLOW}📋 Certificate Location:${NC}"
echo "  Master: $PROJECT_ROOT/certs/mkcert/"
echo "  Services: <service>/certs/"
echo ""
echo -e "${YELLOW}📋 Hostname Configuration:${NC}"
echo "  Current: ${CUSTOM_HOSTNAME}"
echo "  To change: DIVE_HOSTNAME=your.domain.com $0"
echo ""

exit 0

