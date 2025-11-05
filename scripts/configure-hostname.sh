#!/bin/bash
# Configure custom hostname for DIVE V3
# This script updates all configuration files to use a custom hostname instead of localhost

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get hostname from argument or environment
CUSTOM_HOSTNAME="${1:-${DIVE_HOSTNAME:-localhost}}"

if [ "$CUSTOM_HOSTNAME" == "localhost" ]; then
    echo -e "${RED}❌ Please specify a custom hostname${NC}"
    echo ""
    echo "Usage:"
    echo "  $0 your.domain.com"
    echo "  or"
    echo "  DIVE_HOSTNAME=your.domain.com $0"
    echo ""
    echo "Example:"
    echo "  $0 dive.example.com"
    echo ""
    exit 1
fi

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  DIVE V3 - Custom Hostname Configuration${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Hostname: ${GREEN}${CUSTOM_HOSTNAME}${NC}"
echo ""

# Backup configuration files
BACKUP_DIR="$PROJECT_ROOT/backups/hostname-config-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo -e "${YELLOW}Creating backups...${NC}"
cp "$PROJECT_ROOT/docker-compose.yml" "$BACKUP_DIR/"
cp "$PROJECT_ROOT/.env" "$BACKUP_DIR/" 2>/dev/null || touch "$BACKUP_DIR/.env"
echo -e "${GREEN}✅ Backups created in: ${BACKUP_DIR}${NC}"
echo ""

# Create hostname-specific environment file
echo -e "${YELLOW}Creating hostname configuration...${NC}"
cat > "$PROJECT_ROOT/.env.hostname" << EOF
# Custom Hostname Configuration
# Generated: $(date)
# Hostname: ${CUSTOM_HOSTNAME}

DIVE_HOSTNAME=${CUSTOM_HOSTNAME}

# Public URLs (for browser/external access)
NEXT_PUBLIC_KEYCLOAK_URL=https://${CUSTOM_HOSTNAME}:8443
NEXT_PUBLIC_API_URL=https://${CUSTOM_HOSTNAME}:4000
NEXT_PUBLIC_BACKEND_URL=https://${CUSTOM_HOSTNAME}:4000
NEXT_PUBLIC_BASE_URL=https://${CUSTOM_HOSTNAME}:3000
NEXT_PUBLIC_FRONTEND_URL=https://${CUSTOM_HOSTNAME}:3000

# NextAuth/Auth.js URLs
AUTH_URL=https://${CUSTOM_HOSTNAME}:3000
NEXTAUTH_URL=https://${CUSTOM_HOSTNAME}:3000

# Keycloak public endpoint
KC_HOSTNAME=${CUSTOM_HOSTNAME}

# Internal Docker network URLs (unchanged - use service names)
KEYCLOAK_URL=https://keycloak:8443
KEYCLOAK_BASE_URL=https://keycloak:8443
BACKEND_URL=https://backend:4000
FRONTEND_INTERNAL_URL=https://nextjs:3000
EOF

echo -e "${GREEN}✅ Configuration saved to .env.hostname${NC}"
echo ""

# Create docker-compose override for hostname
echo -e "${YELLOW}Creating docker-compose override for hostname...${NC}"
cat > "$PROJECT_ROOT/docker-compose.hostname.yml" << EOF
# Docker Compose Override for Custom Hostname
# Usage: docker-compose -f docker-compose.yml -f docker-compose.hostname.yml up
#
# This override configures all services to use: ${CUSTOM_HOSTNAME}

version: '3.8'

services:
  keycloak:
    environment:
      # Set Keycloak hostname for consistent token issuer
      KC_HOSTNAME: ${CUSTOM_HOSTNAME}
      KC_HOSTNAME_STRICT: false
      KC_HOSTNAME_PORT: 8443
      # Frontend URL for admin console redirects
      KC_FRONTEND_URL: https://${CUSTOM_HOSTNAME}:8443
      # Admin console URL
      KC_ADMIN_URL: https://${CUSTOM_HOSTNAME}:8443

  backend:
    environment:
      # Public URL for CORS and redirects
      PUBLIC_URL: https://${CUSTOM_HOSTNAME}:4000
      # Frontend URL for CORS
      FRONTEND_URL: https://${CUSTOM_HOSTNAME}:3000
      # Keycloak public URL (for JWKS in token validation responses)
      KEYCLOAK_PUBLIC_URL: https://${CUSTOM_HOSTNAME}:8443

  nextjs:
    environment:
      # Public URLs (browser-side)
      NEXT_PUBLIC_KEYCLOAK_URL: https://${CUSTOM_HOSTNAME}:8443
      NEXT_PUBLIC_API_URL: https://${CUSTOM_HOSTNAME}:4000
      NEXT_PUBLIC_BACKEND_URL: https://${CUSTOM_HOSTNAME}:4000
      NEXT_PUBLIC_BASE_URL: https://${CUSTOM_HOSTNAME}:3000
      # NextAuth URLs
      AUTH_URL: https://${CUSTOM_HOSTNAME}:3000
      NEXTAUTH_URL: https://${CUSTOM_HOSTNAME}:3000
      # Trust host for NextAuth
      AUTH_TRUST_HOST: "true"

  kas:
    environment:
      # Public URL
      PUBLIC_URL: https://${CUSTOM_HOSTNAME}:8080
      # Frontend URL for CORS
      FRONTEND_URL: https://${CUSTOM_HOSTNAME}:3000

networks:
  dive-network:
    driver: bridge
EOF

echo -e "${GREEN}✅ Docker Compose override created${NC}"
echo ""

# Create hosts file entry suggestion
echo -e "${YELLOW}Creating hosts file configuration...${NC}"
cat > "$PROJECT_ROOT/etc-hosts-entry.txt" << EOF
# Add these entries to your /etc/hosts file for local testing
# Or configure your DNS server with these records

# Get your machine's IP address:
#   macOS/Linux: ifconfig | grep "inet " | grep -v 127.0.0.1
#   Windows: ipconfig

# Format: <your-ip-address> <hostname>

# Main hostname
<YOUR-IP> ${CUSTOM_HOSTNAME}

# Service-specific subdomains (optional, for cleaner URLs)
<YOUR-IP> keycloak.${CUSTOM_HOSTNAME}
<YOUR-IP> backend.${CUSTOM_HOSTNAME}
<YOUR-IP> frontend.${CUSTOM_HOSTNAME}
<YOUR-IP> kas.${CUSTOM_HOSTNAME}

# For local testing only (same machine)
127.0.0.1 ${CUSTOM_HOSTNAME}
127.0.0.1 keycloak.${CUSTOM_HOSTNAME}
127.0.0.1 backend.${CUSTOM_HOSTNAME}
127.0.0.1 frontend.${CUSTOM_HOSTNAME}
127.0.0.1 kas.${CUSTOM_HOSTNAME}

# External IdPs
<YOUR-IP> spain.${CUSTOM_HOSTNAME}
<YOUR-IP> usa.${CUSTOM_HOSTNAME}
EOF

echo -e "${GREEN}✅ Hosts file template created: etc-hosts-entry.txt${NC}"
echo ""

# Generate updated certificates with new hostname
if command -v mkcert &> /dev/null; then
    echo -e "${YELLOW}Regenerating certificates with new hostname...${NC}"
    DIVE_HOSTNAME="$CUSTOM_HOSTNAME" "$PROJECT_ROOT/scripts/setup-mkcert-for-all-services.sh"
    echo -e "${GREEN}✅ Certificates updated${NC}"
    echo ""
else
    echo -e "${YELLOW}⚠️  mkcert not found - skipping certificate generation${NC}"
    echo "   Install mkcert and run: ./scripts/setup-mkcert-for-all-services.sh"
    echo ""
fi

# Create start script with hostname
cat > "$PROJECT_ROOT/start-with-hostname.sh" << EOF
#!/bin/bash
# Start DIVE V3 with custom hostname: ${CUSTOM_HOSTNAME}

set -e

echo "Starting DIVE V3 with hostname: ${CUSTOM_HOSTNAME}"
echo ""

# Load environment
set -a
source .env 2>/dev/null || true
source .env.hostname 2>/dev/null || true
set +a

# Start services
docker-compose \\
    -f docker-compose.yml \\
    -f docker-compose.hostname.yml \\
    -f docker-compose.mkcert.yml \\
    up -d

echo ""
echo "Services started successfully!"
echo ""
echo "Access DIVE V3 at:"
echo "  Frontend:  https://${CUSTOM_HOSTNAME}:3000"
echo "  Backend:   https://${CUSTOM_HOSTNAME}:4000"
echo "  Keycloak:  https://${CUSTOM_HOSTNAME}:8443"
echo "  KAS:       https://${CUSTOM_HOSTNAME}:8080"
echo ""
echo "⚠️  Remember to:"
echo "  1. Update /etc/hosts with entries from etc-hosts-entry.txt"
echo "  2. Install mkcert CA: mkcert -install"
echo ""
EOF

chmod +x "$PROJECT_ROOT/start-with-hostname.sh"

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Hostname Configuration Complete!${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}📋 Configuration Summary:${NC}"
echo "  Hostname: ${CUSTOM_HOSTNAME}"
echo "  Config: .env.hostname"
echo "  Override: docker-compose.hostname.yml"
echo "  Hosts: etc-hosts-entry.txt"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo ""
echo "  1. Update /etc/hosts (or DNS):"
echo "     ${BLUE}sudo nano /etc/hosts${NC}"
echo "     (Copy entries from etc-hosts-entry.txt)"
echo ""
echo "  2. Install mkcert CA (if not done):"
echo "     ${BLUE}mkcert -install${NC}"
echo ""
echo "  3. Start services with hostname:"
echo "     ${BLUE}./start-with-hostname.sh${NC}"
echo "     or"
echo "     ${BLUE}docker-compose -f docker-compose.yml -f docker-compose.hostname.yml -f docker-compose.mkcert.yml up -d${NC}"
echo ""
echo "  4. Access services at:"
echo "     Frontend:  ${BLUE}https://${CUSTOM_HOSTNAME}:3000${NC}"
echo "     Backend:   ${BLUE}https://${CUSTOM_HOSTNAME}:4000${NC}"
echo "     Keycloak:  ${BLUE}https://${CUSTOM_HOSTNAME}:8443${NC}"
echo ""
echo -e "${YELLOW}📋 Remote Access:${NC}"
echo "  Clients connecting remotely need to:"
echo "  1. Add DNS/hosts entry: <server-ip> ${CUSTOM_HOSTNAME}"
echo "  2. Trust the mkcert CA certificate"
echo "     (located in: certs/mkcert/rootCA.pem)"
echo ""
echo -e "${YELLOW}📋 Backups:${NC}"
echo "  ${BACKUP_DIR}"
echo ""

exit 0

