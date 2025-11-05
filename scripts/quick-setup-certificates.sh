#!/bin/bash
# DIVE V3 - Quick Certificate & Hostname Setup
# One command to configure everything

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        DIVE V3 - Certificate & Hostname Quick Setup             ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Interactive mode
echo -e "${YELLOW}Choose setup mode:${NC}"
echo "  1) localhost only (default, easiest)"
echo "  2) Custom hostname (for remote access)"
echo ""
read -p "Selection [1-2]: " MODE

if [ "$MODE" == "2" ]; then
    echo ""
    read -p "Enter custom hostname (e.g., dive.example.com): " CUSTOM_HOSTNAME
    
    if [ -z "$CUSTOM_HOSTNAME" ]; then
        echo "No hostname provided, using localhost"
        CUSTOM_HOSTNAME="localhost"
    fi
else
    CUSTOM_HOSTNAME="localhost"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "  Configuration: ${GREEN}${CUSTOM_HOSTNAME}${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Step 1: Check mkcert
echo -e "${YELLOW}[1/5] Checking mkcert installation...${NC}"
if ! command -v mkcert &> /dev/null; then
    echo -e "${YELLOW}⚠️  mkcert not found. Installing...${NC}"
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &> /dev/null; then
            brew install mkcert
        else
            echo "Please install Homebrew first: https://brew.sh"
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "Please install mkcert manually: https://github.com/FiloSottile/mkcert#installation"
        exit 1
    fi
fi
echo -e "${GREEN}✅ mkcert installed${NC}"
echo ""

# Step 2: Setup mkcert
echo -e "${YELLOW}[2/5] Setting up mkcert certificates...${NC}"
if [ "$CUSTOM_HOSTNAME" != "localhost" ]; then
    DIVE_HOSTNAME="$CUSTOM_HOSTNAME" "$PROJECT_ROOT/scripts/setup-mkcert-for-all-services.sh"
else
    "$PROJECT_ROOT/scripts/setup-mkcert-for-all-services.sh"
fi
echo ""

# Step 3: Configure hostname if custom
if [ "$CUSTOM_HOSTNAME" != "localhost" ]; then
    echo -e "${YELLOW}[3/5] Configuring custom hostname...${NC}"
    "$PROJECT_ROOT/scripts/configure-hostname.sh" "$CUSTOM_HOSTNAME"
    echo ""
else
    echo -e "${YELLOW}[3/5] Skipping custom hostname (using localhost)${NC}"
    echo ""
fi

# Step 4: Verify setup
echo -e "${YELLOW}[4/5] Verifying certificate installation...${NC}"
"$PROJECT_ROOT/scripts/verify-mkcert-setup.sh"
echo ""

# Step 5: Summary
echo -e "${YELLOW}[5/5] Creating quick reference...${NC}"
cat > "$PROJECT_ROOT/CERTIFICATE-SETUP-COMPLETE.txt" << EOF
╔══════════════════════════════════════════════════════════════════╗
║         DIVE V3 Certificate Setup Complete ✅                    ║
╚══════════════════════════════════════════════════════════════════╝

Configuration: ${CUSTOM_HOSTNAME}
Date: $(date)

┌──────────────────────────────────────────────────────────────────┐
│ Quick Start                                                      │
└──────────────────────────────────────────────────────────────────┘

EOF

if [ "$CUSTOM_HOSTNAME" != "localhost" ]; then
    cat >> "$PROJECT_ROOT/CERTIFICATE-SETUP-COMPLETE.txt" << EOF
# Start services with custom hostname
./start-with-hostname.sh

# Or manually:
docker-compose -f docker-compose.yml \\
               -f docker-compose.mkcert.yml \\
               -f docker-compose.hostname.yml \\
               up -d

# Access at:
Frontend:  https://${CUSTOM_HOSTNAME}:3000
Backend:   https://${CUSTOM_HOSTNAME}:4000
Keycloak:  https://${CUSTOM_HOSTNAME}:8443

┌──────────────────────────────────────────────────────────────────┐
│ Remote Access Setup                                             │
└──────────────────────────────────────────────────────────────────┘

1. Update /etc/hosts on server and clients:
   $(ip route get 1 | awk '{print $7}' 2>/dev/null || echo "<your-ip>") ${CUSTOM_HOSTNAME}

2. Distribute CA certificate to clients:
   File: certs/mkcert/rootCA.pem
   
   macOS: sudo security add-trusted-cert -d -r trustRoot \\
          -k /Library/Keychains/System.keychain rootCA.pem
   
   Linux: sudo cp rootCA.pem /usr/local/share/ca-certificates/mkcert.crt
          sudo update-ca-certificates
   
   Windows: Double-click rootCA.pem → Install Certificate →
            Trusted Root Certification Authorities

3. Test connection from client:
   curl -v https://${CUSTOM_HOSTNAME}:8443/health

EOF
else
    cat >> "$PROJECT_ROOT/CERTIFICATE-SETUP-COMPLETE.txt" << EOF
# Start services
docker-compose -f docker-compose.yml \\
               -f docker-compose.mkcert.yml \\
               up -d

# Access at:
Frontend:  https://localhost:3000
Backend:   https://localhost:4000
Keycloak:  https://localhost:8443

EOF
fi

cat >> "$PROJECT_ROOT/CERTIFICATE-SETUP-COMPLETE.txt" << EOF
┌──────────────────────────────────────────────────────────────────┐
│ Files Created                                                    │
└──────────────────────────────────────────────────────────────────┘

Certificates:
  certs/mkcert/certificate.pem  - SSL certificate
  certs/mkcert/key.pem          - Private key
  certs/mkcert/rootCA.pem       - CA certificate

Configuration:
  docker-compose.mkcert.yml     - mkcert override
EOF

if [ "$CUSTOM_HOSTNAME" != "localhost" ]; then
    cat >> "$PROJECT_ROOT/CERTIFICATE-SETUP-COMPLETE.txt" << EOF
  docker-compose.hostname.yml   - Hostname override
  .env.hostname                 - Hostname environment vars
  etc-hosts-entry.txt           - Hosts file template
  start-with-hostname.sh        - Quick start script
EOF
fi

cat >> "$PROJECT_ROOT/CERTIFICATE-SETUP-COMPLETE.txt" << EOF

Documentation:
  docs/CERTIFICATE-AND-HOSTNAME-MANAGEMENT.md  - Complete guide

┌──────────────────────────────────────────────────────────────────┐
│ Troubleshooting                                                  │
└──────────────────────────────────────────────────────────────────┘

Certificate not trusted:
  mkcert -install
  ./scripts/verify-mkcert-setup.sh

Service SSL errors:
  docker-compose logs <service> | grep -i ssl
  curl -v https://localhost:<port>/health

Hostname not resolving:
  ping ${CUSTOM_HOSTNAME}
  cat /etc/hosts | grep dive

┌──────────────────────────────────────────────────────────────────┐
│ Next Steps                                                       │
└──────────────────────────────────────────────────────────────────┘

1. Start services (see Quick Start above)
2. Test frontend: https://${CUSTOM_HOSTNAME}:3000
3. Test Keycloak: https://${CUSTOM_HOSTNAME}:8443
4. Review logs: docker-compose logs -f
5. For issues: See docs/CERTIFICATE-AND-HOSTNAME-MANAGEMENT.md

╔══════════════════════════════════════════════════════════════════╗
║  Setup complete! Ready to start DIVE V3 🚀                      ║
╚══════════════════════════════════════════════════════════════════╝
EOF

echo -e "${GREEN}✅ Created: CERTIFICATE-SETUP-COMPLETE.txt${NC}"
echo ""

# Display summary
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                   Setup Complete! ✅                             ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Configuration: ${CUSTOM_HOSTNAME}${NC}"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo ""

if [ "$CUSTOM_HOSTNAME" != "localhost" ]; then
    echo "  1. Update /etc/hosts:"
    echo "     ${BLUE}sudo nano /etc/hosts${NC}"
    echo "     (Add: <your-ip> ${CUSTOM_HOSTNAME})"
    echo ""
    echo "  2. Start services:"
    echo "     ${BLUE}./start-with-hostname.sh${NC}"
    echo ""
    echo "  3. Access frontend:"
    echo "     ${BLUE}https://${CUSTOM_HOSTNAME}:3000${NC}"
    echo ""
    echo "  4. For remote clients, distribute:"
    echo "     ${BLUE}certs/mkcert/rootCA.pem${NC}"
else
    echo "  1. Start services:"
    echo "     ${BLUE}docker-compose -f docker-compose.yml -f docker-compose.mkcert.yml up -d${NC}"
    echo ""
    echo "  2. Access frontend:"
    echo "     ${BLUE}https://localhost:3000${NC}"
    echo ""
    echo "  3. Access Keycloak:"
    echo "     ${BLUE}https://localhost:8443${NC}"
fi

echo ""
echo -e "${YELLOW}📖 Documentation:${NC}"
echo "     ${BLUE}docs/CERTIFICATE-AND-HOSTNAME-MANAGEMENT.md${NC}"
echo ""
echo -e "${YELLOW}📄 Quick Reference:${NC}"
echo "     ${BLUE}CERTIFICATE-SETUP-COMPLETE.txt${NC}"
echo ""

exit 0

