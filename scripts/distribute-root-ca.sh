#!/bin/bash
# ============================================
# DIVE V3: Distribute mkcert Root CA for Federation Partners
# ============================================
# Purpose: Package and provide instructions for sharing your mkcert Root CA
#          with federation partners so they can trust your DIVE V3 instance

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║       DIVE V3 - Distribute Root CA for Federation             ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if mkcert Root CA exists
if [ ! -f certs/mkcert/rootCA.pem ]; then
    echo -e "${RED}❌ Error: mkcert Root CA not found at certs/mkcert/rootCA.pem${NC}"
    echo ""
    echo "Please run certificate setup first:"
    echo "  ./scripts/setup-mkcert-for-all-services.sh"
    exit 1
fi

echo -e "${GREEN}✓${NC} Found mkcert Root CA certificate"
echo ""

# Get hostname
HOSTNAME=$(grep -r "DIVE_HOSTNAME" docker-compose.hostname.yml 2>/dev/null | head -1 | sed 's/.*DIVE_HOSTNAME=//' | tr -d '"' || echo "localhost")
SERVER_IP=$(ip route get 1 2>/dev/null | awk '{print $7}' | head -1 || hostname -I | awk '{print $1}' || echo '<your-server-ip>')

# Create distribution package
DIST_DIR="$PROJECT_ROOT/federation-ca-distribution"
mkdir -p "$DIST_DIR"

# Copy Root CA
cp certs/mkcert/rootCA.pem "$DIST_DIR/dive-v3-root-ca.pem"

# Create installation instructions
cat > "$DIST_DIR/INSTALLATION-INSTRUCTIONS.txt" << EOF
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║       DIVE V3 Root CA Installation Instructions               ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝

OVERVIEW
--------
This Root CA certificate allows your system to trust HTTPS connections
to the DIVE V3 instance hosted at:

  Server IP: $SERVER_IP
  Hostname:  $HOSTNAME
  Frontend:  https://$HOSTNAME:3000
  Backend:   https://$HOSTNAME:4000
  Keycloak:  https://$HOSTNAME:8443

WHY IS THIS NEEDED?
-------------------
DIVE V3 uses locally-generated certificates (mkcert) for development
and demonstration purposes. To establish federation trust and access
the instance securely, you must install this Root CA on your client
machines.

⚠️  SECURITY NOTE: Only install Root CAs from trusted sources!
    Verify the fingerprint with the DIVE V3 administrator before
    installing this certificate.

CERTIFICATE FINGERPRINT
------------------------
EOF

# Add certificate fingerprint
openssl x509 -in "$DIST_DIR/dive-v3-root-ca.pem" -noout -fingerprint -sha256 >> "$DIST_DIR/INSTALLATION-INSTRUCTIONS.txt"

cat >> "$DIST_DIR/INSTALLATION-INSTRUCTIONS.txt" << 'EOF'

INSTALLATION STEPS
==================

1. MACOS
--------
Open Terminal and run:

  sudo security add-trusted-cert -d -r trustRoot \
    -k /Library/Keychains/System.keychain dive-v3-root-ca.pem

Verification:
  security find-certificate -c "mkcert" -a

2. LINUX (Ubuntu/Debian/RHEL/CentOS)
-------------------------------------
Open Terminal and run:

  sudo cp dive-v3-root-ca.pem /usr/local/share/ca-certificates/dive-v3-root-ca.crt
  sudo update-ca-certificates

Verification:
  ls -l /etc/ssl/certs/ | grep dive-v3

3. WINDOWS
----------
Option A - System-Wide (Recommended):
  1. Right-click dive-v3-root-ca.pem
  2. Select "Install Certificate"
  3. Choose "Local Machine" (requires Administrator)
  4. Select "Place all certificates in the following store"
  5. Click "Browse" → Select "Trusted Root Certification Authorities"
  6. Click "Next" → "Finish"

Option B - Current User Only:
  Same as above, but choose "Current User" in step 3

4. BROWSER ONLY (Chrome/Edge/Brave)
------------------------------------
If you only need browser access (not CLI tools):

  1. Open browser Settings
  2. Search for "certificates"
  3. Click "Manage Certificates"
  4. Go to "Trusted Root Certification Authorities" (Windows)
     or "Authorities" (macOS/Linux)
  5. Click "Import"
  6. Select dive-v3-root-ca.pem
  7. Click "OK"

5. FIREFOX (Separate Certificate Store)
----------------------------------------
Firefox uses its own certificate store:

  1. Open Firefox Settings
  2. Search for "certificates"
  3. Click "View Certificates"
  4. Go to "Authorities" tab
  5. Click "Import"
  6. Select dive-v3-root-ca.pem
  7. Check "Trust this CA to identify websites"
  8. Click "OK"

6. JAVA APPLICATIONS (Keycloak, etc.)
--------------------------------------
For Java-based federation partners using Keycloak:

  # Find your Java installation
  JAVA_HOME=$(readlink -f $(which java) | sed "s:/bin/java::")
  
  # Import to Java truststore
  sudo keytool -import -trustcacerts -noprompt \
    -alias dive-v3-mkcert-ca \
    -file dive-v3-root-ca.pem \
    -keystore $JAVA_HOME/lib/security/cacerts \
    -storepass changeit

7. DOCKER CONTAINERS
--------------------
If your IdP runs in Docker and needs to trust DIVE V3:

  # Add to Dockerfile
  COPY dive-v3-root-ca.pem /usr/local/share/ca-certificates/
  RUN update-ca-certificates
  
  # Or mount at runtime
  volumes:
    - ./dive-v3-root-ca.pem:/usr/local/share/ca-certificates/dive-v3-ca.crt:ro

DNS/HOSTS CONFIGURATION
=======================

In addition to installing the Root CA, add this entry to /etc/hosts
(Linux/macOS) or C:\Windows\System32\drivers\etc\hosts (Windows):

EOF

echo "  $SERVER_IP $HOSTNAME" >> "$DIST_DIR/INSTALLATION-INSTRUCTIONS.txt"

cat >> "$DIST_DIR/INSTALLATION-INSTRUCTIONS.txt" << 'EOF'

VERIFICATION
============

After installation, verify the certificate is trusted:

1. Browser Test:
   Navigate to: https://EOF
echo "$HOSTNAME:3000" >> "$DIST_DIR/INSTALLATION-INSTRUCTIONS.txt"
cat >> "$DIST_DIR/INSTALLATION-INSTRUCTIONS.txt" << 'EOF'
   You should NOT see any certificate warnings.

2. Command Line Test (Linux/macOS):
   curl https://EOF
echo "$HOSTNAME:3000/api/health" >> "$DIST_DIR/INSTALLATION-INSTRUCTIONS.txt"
cat >> "$DIST_DIR/INSTALLATION-INSTRUCTIONS.txt" << 'EOF'
   Should return health status without certificate errors.

3. OpenSSL Test:
   openssl s_client -connect EOF
echo "$HOSTNAME:3000 -CAfile dive-v3-root-ca.pem" >> "$DIST_DIR/INSTALLATION-INSTRUCTIONS.txt"
cat >> "$DIST_DIR/INSTALLATION-INSTRUCTIONS.txt" << 'EOF'
   Look for "Verify return code: 0 (ok)"

TROUBLESHOOTING
===============

"Certificate not trusted" error persists:
  - Restart browser completely (all windows)
  - Restart application that needs to trust certificate
  - On macOS: Restart keychain: killall -HUP mDNSResponder
  - On Linux: Re-run update-ca-certificates
  - Verify certificate is in correct store

"DNS resolution failed":
  - Check /etc/hosts entry is correct
  - Verify server IP is reachable: ping EOF
echo "$SERVER_IP" >> "$DIST_DIR/INSTALLATION-INSTRUCTIONS.txt"
cat >> "$DIST_DIR/INSTALLATION-INSTRUCTIONS.txt" << 'EOF'
  - Flush DNS cache

UNINSTALLATION
==============

To remove the Root CA:

macOS:
  sudo security delete-certificate -c "mkcert" /Library/Keychains/System.keychain

Linux:
  sudo rm /usr/local/share/ca-certificates/dive-v3-root-ca.crt
  sudo update-ca-certificates --fresh

Windows:
  1. Press Win+R, type "certmgr.msc"
  2. Go to Trusted Root Certification Authorities → Certificates
  3. Find "mkcert" certificate
  4. Right-click → Delete

SUPPORT
=======

For questions or issues:
  - Contact DIVE V3 Administrator
  - Check DIVE V3 documentation: docs/CERTIFICATE-AND-HOSTNAME-MANAGEMENT.md
  - Verify fingerprint before installation

This certificate is for DEVELOPMENT/DEMONSTRATION purposes only.
DO NOT use in production environments without proper PKI infrastructure.
EOF

# Create a simple README
cat > "$DIST_DIR/README.md" << EOF
# DIVE V3 Root CA Distribution Package

## Files Included

- **dive-v3-root-ca.pem** - Root CA certificate to install
- **INSTALLATION-INSTRUCTIONS.txt** - Detailed installation guide

## Quick Start

### For macOS
\`\`\`bash
sudo security add-trusted-cert -d -r trustRoot \\
  -k /Library/Keychains/System.keychain dive-v3-root-ca.pem
\`\`\`

### For Linux
\`\`\`bash
sudo cp dive-v3-root-ca.pem /usr/local/share/ca-certificates/dive-v3-root-ca.crt
sudo update-ca-certificates
\`\`\`

### For Windows
Right-click \`dive-v3-root-ca.pem\` → Install Certificate → Trusted Root Certification Authorities

## DNS Configuration

Add to your /etc/hosts (or C:\\Windows\\System32\\drivers\\etc\\hosts):

\`\`\`
$SERVER_IP $HOSTNAME
\`\`\`

## Access URLs

- Frontend: https://$HOSTNAME:3000
- Backend API: https://$HOSTNAME:4000
- Keycloak Admin: https://$HOSTNAME:8443/admin

## Support

See INSTALLATION-INSTRUCTIONS.txt for complete details and troubleshooting.
EOF

echo ""
echo -e "${GREEN}✓${NC} Federation distribution package created!"
echo ""
echo -e "${CYAN}Location:${NC} $DIST_DIR"
echo ""
echo -e "${CYAN}Contents:${NC}"
echo "  - dive-v3-root-ca.pem (Root CA certificate)"
echo "  - INSTALLATION-INSTRUCTIONS.txt (Detailed guide)"
echo "  - README.md (Quick reference)"
echo ""

# Create a tarball
cd "$PROJECT_ROOT"
tar -czf dive-v3-root-ca-distribution.tar.gz -C "$(dirname "$DIST_DIR")" "$(basename "$DIST_DIR")"

echo -e "${GREEN}✓${NC} Created archive: dive-v3-root-ca-distribution.tar.gz"
echo ""

echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "  1. ${CYAN}Verify fingerprint with partners:${NC}"
openssl x509 -in "$DIST_DIR/dive-v3-root-ca.pem" -noout -fingerprint -sha256 | sed 's/^/     /'
echo ""
echo "  2. ${CYAN}Share the distribution package:${NC}"
echo "     - Send: dive-v3-root-ca-distribution.tar.gz"
echo "     - Or share directory: $DIST_DIR"
echo ""
echo "  3. ${CYAN}Partners follow instructions in:${NC}"
echo "     INSTALLATION-INSTRUCTIONS.txt"
echo ""
echo "  4. ${CYAN}Test federation:${NC}"
echo "     - Partners should be able to access https://$HOSTNAME:3000"
echo "     - No certificate warnings should appear"
echo "     - External IdPs can now trust your Keycloak instance"
echo ""

# Show DNS/hosts reminder
echo -e "${YELLOW}⚠️  REMINDER FOR PARTNERS:${NC}"
echo ""
echo "They MUST add this to their /etc/hosts (or equivalent):"
echo ""
echo -e "  ${BLUE}$SERVER_IP $HOSTNAME${NC}"
echo ""

echo -e "${GREEN}Distribution package ready for federation partners!${NC}"

