#!/bin/bash
# =============================================================================
# DIVE V3 Federation Partner Package Creator
# =============================================================================
# Creates a secure package with all necessary federation information
# for trusted external partners
#
# Usage: ./scripts/create-federation-package.sh [partner-name]
# Example: ./scripts/create-federation-package.sh external-keycloak-nl
#
# Output: federation-package-{partner-name}-{date}.tar.gz
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Partner name (from argument or default)
PARTNER_NAME="${1:-external-partner}"
DATE=$(date +%Y%m%d-%H%M%S)
PACKAGE_NAME="federation-package-${PARTNER_NAME}-${DATE}"
TEMP_DIR="${PROJECT_ROOT}/tmp/${PACKAGE_NAME}"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  DIVE V3 Federation Partner Package Creator               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Partner:${NC} ${PARTNER_NAME}"
echo -e "${GREEN}Date:${NC} ${DATE}"
echo ""

# Check prerequisites
echo -e "${YELLOW}[1/8] Checking prerequisites...${NC}"
if [ ! -d "${PROJECT_ROOT}/terraform" ]; then
    echo -e "${RED}Error: Terraform directory not found${NC}"
    exit 1
fi

if [ ! -f "${PROJECT_ROOT}/FEDERATION-PARTNER-INFO.md" ]; then
    echo -e "${RED}Error: Federation documentation not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites check passed${NC}"
echo ""

# Create temp directory
echo -e "${YELLOW}[2/8] Creating package directory...${NC}"
mkdir -p "${TEMP_DIR}"/{certs,docs,configs}
echo -e "${GREEN}✓ Created: ${TEMP_DIR}${NC}"
echo ""

# Copy documentation
echo -e "${YELLOW}[3/8] Copying documentation...${NC}"
cp "${PROJECT_ROOT}/FEDERATION-PARTNER-INFO.md" "${TEMP_DIR}/docs/"
cp "${PROJECT_ROOT}/FEDERATION-QUICK-REFERENCE.txt" "${TEMP_DIR}/docs/"

if [ -f "${PROJECT_ROOT}/dive-certs/QUICKSTART.md" ]; then
    cp "${PROJECT_ROOT}/dive-certs/QUICKSTART.md" "${TEMP_DIR}/docs/DIVE-CERTS-QUICKSTART.md"
fi

echo -e "${GREEN}✓ Documentation copied${NC}"
echo ""

# Copy certificates
echo -e "${YELLOW}[4/8] Copying TLS certificates...${NC}"

# Public certificate (safe to share)
if [ -f "${PROJECT_ROOT}/keycloak/certs/certificate.pem" ]; then
    cp "${PROJECT_ROOT}/keycloak/certs/certificate.pem" "${TEMP_DIR}/certs/keycloak-public.pem"
    echo -e "${GREEN}✓ Keycloak public certificate${NC}"
else
    echo -e "${YELLOW}⚠ Keycloak public certificate not found${NC}"
fi

# Root CA (safe to share)
if [ -f "${PROJECT_ROOT}/keycloak/certs/mkcert-rootCA.pem" ]; then
    cp "${PROJECT_ROOT}/keycloak/certs/mkcert-rootCA.pem" "${TEMP_DIR}/certs/mkcert-rootCA.pem"
    echo -e "${GREEN}✓ mkcert Root CA${NC}"
else
    echo -e "${YELLOW}⚠ mkcert Root CA not found${NC}"
fi
echo ""

# Copy DIVE Root CAs
echo -e "${YELLOW}[5/8] Copying DIVE Root CA certificates...${NC}"

if [ -d "${PROJECT_ROOT}/dive-certs" ]; then
    # Copy individual Root CAs
    if [ -f "${PROJECT_ROOT}/dive-certs/NLDECCDIVEROOTCAG1.cacert.pem" ]; then
        cp "${PROJECT_ROOT}/dive-certs/NLDECCDIVEROOTCAG1.cacert.pem" "${TEMP_DIR}/certs/"
        echo -e "${GREEN}✓ NLD ECC Root CA${NC}"
    fi
    
    if [ -f "${PROJECT_ROOT}/dive-certs/NLDRSADIVEROOTCAG1.cacert.pem" ]; then
        cp "${PROJECT_ROOT}/dive-certs/NLDRSADIVEROOTCAG1.cacert.pem" "${TEMP_DIR}/certs/"
        echo -e "${GREEN}✓ NLD RSA Root CA${NC}"
    fi
    
    # Copy combined bundle
    if [ -d "${PROJECT_ROOT}/keycloak/certs/dive-root-cas" ]; then
        cp -r "${PROJECT_ROOT}/keycloak/certs/dive-root-cas" "${TEMP_DIR}/certs/"
        echo -e "${GREEN}✓ DIVE Root CAs bundle${NC}"
    fi
    
    # Copy checksums
    if [ -f "${PROJECT_ROOT}/dive-certs/checksums.sha256" ]; then
        cp "${PROJECT_ROOT}/dive-certs/checksums.sha256" "${TEMP_DIR}/certs/"
        echo -e "${GREEN}✓ Certificate checksums${NC}"
    fi
else
    echo -e "${YELLOW}⚠ DIVE certificates directory not found${NC}"
fi
echo ""

# Extract client secrets
echo -e "${YELLOW}[6/8] Extracting client secrets from Terraform...${NC}"

SECRETS_FILE="${TEMP_DIR}/configs/client-secrets.txt"
cat > "${SECRETS_FILE}" << 'EOF'
# DIVE V3 Keycloak Client Secrets
# =============================================================================
# 🔐 CONFIDENTIAL - Handle with care
# Distribution: Authorized federation partners only
# Generated: 
EOF

echo "$(date)" >> "${SECRETS_FILE}"
echo "" >> "${SECRETS_FILE}"

# Extract secrets from Terraform state
cd "${PROJECT_ROOT}/terraform" || exit 1

if [ -f "terraform.tfstate" ]; then
    echo "## Broker Realm" >> "${SECRETS_FILE}"
    echo "Client ID: dive-v3-client-broker" >> "${SECRETS_FILE}"
    
    # Try to extract broker client secret
    BROKER_SECRET=$(terraform output -raw client_secret 2>/dev/null || echo "N/A")
    echo "Client Secret: ${BROKER_SECRET}" >> "${SECRETS_FILE}"
    echo "" >> "${SECRETS_FILE}"
    
    # Extract national realm secrets
    echo "## National Realm Clients (All use client ID: dive-v3-broker-client)" >> "${SECRETS_FILE}"
    echo "" >> "${SECRETS_FILE}"
    
    for REALM in usa fra can gbr deu pol ita esp nld industry; do
        REALM_UPPER=$(echo "$REALM" | tr '[:lower:]' '[:upper:]')
        SECRET=$(terraform output -raw "${REALM}_client_secret" 2>/dev/null || echo "N/A")
        
        if [ "$SECRET" != "N/A" ]; then
            echo "${REALM_UPPER} Realm Secret: ${SECRET}" >> "${SECRETS_FILE}"
            echo -e "${GREEN}✓ ${REALM_UPPER} realm secret extracted${NC}"
        else
            echo "${REALM_UPPER} Realm Secret: (not available - retrieve via terraform output)" >> "${SECRETS_FILE}"
            echo -e "${YELLOW}⚠ ${REALM_UPPER} realm secret not available${NC}"
        fi
    done
    
    echo "" >> "${SECRETS_FILE}"
    echo "## OAuth API Client" >> "${SECRETS_FILE}"
    OAUTH_CLIENT_ID=$(terraform output -raw oauth_api_client_id 2>/dev/null || echo "N/A")
    OAUTH_SECRET=$(terraform output -raw oauth_api_client_secret 2>/dev/null || echo "N/A")
    echo "Client ID: ${OAUTH_CLIENT_ID}" >> "${SECRETS_FILE}"
    echo "Client Secret: ${OAUTH_SECRET}" >> "${SECRETS_FILE}"
    
else
    echo -e "${YELLOW}⚠ Terraform state not found - secrets not extracted${NC}"
    echo "Terraform state not available" >> "${SECRETS_FILE}"
    echo "Retrieve secrets manually via: terraform output {secret_name}" >> "${SECRETS_FILE}"
fi

cd "${PROJECT_ROOT}" || exit 1
echo -e "${GREEN}✓ Client secrets extracted${NC}"
echo ""

# Create connection configuration
echo -e "${YELLOW}[7/8] Generating connection configuration...${NC}"

CONFIG_FILE="${TEMP_DIR}/configs/connection-config.yaml"
cat > "${CONFIG_FILE}" << EOF
# DIVE V3 Federation Connection Configuration
# =============================================================================
# Use this file to configure your system to federate with DIVE V3
# =============================================================================

# Network Information
network:
  hostname: MacBook-Pro-3.local
  primary_ip: 10.71.190.17
  alternate_ips:
    - 192.168.64.1
    - 10.0.100.50

# Keycloak Endpoints
keycloak:
  base_url: https://localhost:8443
  network_url: https://10.71.190.17:8443
  admin_console: https://localhost:8443/admin
  
  # Broker Realm (Primary)
  broker_realm:
    name: dive-v3-broker
    issuer: https://localhost:8443/realms/dive-v3-broker
    discovery_url: https://localhost:8443/realms/dive-v3-broker/.well-known/openid-configuration
    authorization_endpoint: https://localhost:8443/realms/dive-v3-broker/protocol/openid-connect/auth
    token_endpoint: https://localhost:8443/realms/dive-v3-broker/protocol/openid-connect/token
    userinfo_endpoint: https://localhost:8443/realms/dive-v3-broker/protocol/openid-connect/userinfo
    jwks_uri: https://localhost:8443/realms/dive-v3-broker/protocol/openid-connect/certs
    end_session_endpoint: https://localhost:8443/realms/dive-v3-broker/protocol/openid-connect/logout
    saml_metadata: https://localhost:8443/realms/dive-v3-broker/protocol/saml/descriptor
    
    client:
      client_id: dive-v3-client-broker
      # Client secret in client-secrets.txt
      access_type: CONFIDENTIAL
      protocol: openid-connect
      
  # National Realms (Pattern)
  national_realms:
    - usa
    - fra
    - can
    - gbr
    - deu
    - pol
    - ita
    - esp
    - nld
    - industry
  
  # Example: USA Realm
  usa_realm:
    name: dive-v3-usa
    issuer: https://localhost:8443/realms/dive-v3-usa
    discovery_url: https://localhost:8443/realms/dive-v3-usa/.well-known/openid-configuration
    client_id: dive-v3-broker-client
    # Client secret in client-secrets.txt

# Required Claims (JWT Token)
claims:
  required:
    - uniqueID        # User unique identifier
    - clearance       # UNCLASSIFIED | CONFIDENTIAL | SECRET | TOP_SECRET
    - countryOfAffiliation  # USA | FRA | CAN | etc. (ISO 3166-1 alpha-3)
  optional:
    - acpCOI          # Community of Interest (JSON array)
    - dutyOrg         # Duty organization
    - orgUnit         # Organizational unit
  authentication:
    - acr             # Authentication Context Class Reference (0, 1, 2)
    - amr             # Authentication Methods Reference (array)

# TLS Configuration
tls:
  certificates:
    # Development certificate (mkcert)
    keycloak_public: certs/keycloak-public.pem
    mkcert_root_ca: certs/mkcert-rootCA.pem
    
    # DIVE Root CAs (NATO Coalition)
    nld_ecc_root_ca: certs/NLDECCDIVEROOTCAG1.cacert.pem
    nld_rsa_root_ca: certs/NLDRSADIVEROOTCAG1.cacert.pem
    dive_bundle: certs/dive-root-cas/dive-root-cas.pem
    dive_truststore_jks: certs/dive-root-cas/dive-truststore.jks
    dive_truststore_password: changeit
  
  trust_setup:
    nodejs: "export NODE_EXTRA_CA_CERTS=/path/to/dive-root-cas.pem"
    java: "-Djavax.net.ssl.trustStore=/path/to/dive-truststore.jks -Djavax.net.ssl.trustStorePassword=changeit"

# Redirect URIs (Add to your IdP whitelist)
redirect_uris:
  - https://localhost:8443/realms/dive-v3-broker/broker/{your-idp-alias}/endpoint
  - https://10.71.190.17:8443/realms/dive-v3-broker/broker/{your-idp-alias}/endpoint
  - https://localhost:3000/*
  - https://localhost:3000/api/auth/callback/keycloak

# Security Configuration
security:
  token_lifetime: 900  # 15 minutes (AAL2 compliant)
  sso_session_idle: 900  # 15 minutes
  sso_session_max: 28800  # 8 hours
  password_policy: "12+ chars, uppercase, lowercase, digits, special chars"
  mfa_methods:
    - TOTP (AAL2)
    - WebAuthn (AAL3)

# Test Users (Development Only)
test_users:
  broker_admin:
    username: admin-dive
    password: DiveAdmin2025!
    realm: dive-v3-broker
    clearance: TOP_SECRET
  
  usa_user:
    username: john.doe
    password: Password123!
    realm: dive-v3-usa
    clearance: SECRET
EOF

echo -e "${GREEN}✓ Connection configuration generated${NC}"
echo ""

# Create README for the package
README_FILE="${TEMP_DIR}/README.txt"
cat > "${README_FILE}" << 'EOF'
╔══════════════════════════════════════════════════════════════════════════════╗
║                    DIVE V3 FEDERATION PARTNER PACKAGE                        ║
╚══════════════════════════════════════════════════════════════════════════════╝

Thank you for partnering with DIVE V3 for federated identity management!

This package contains everything you need to establish federation with our
Keycloak instance.

┌──────────────────────────────────────────────────────────────────────────────┐
│ PACKAGE CONTENTS                                                             │
└──────────────────────────────────────────────────────────────────────────────┘

📁 certs/
  ├── keycloak-public.pem          # DIVE V3 Keycloak public certificate
  ├── mkcert-rootCA.pem            # Development Root CA
  ├── NLDECCDIVEROOTCAG1.cacert.pem  # NLD ECC Root CA (NATO Coalition)
  ├── NLDRSADIVEROOTCAG1.cacert.pem  # NLD RSA Root CA (NATO Coalition)
  ├── dive-root-cas/
  │   ├── dive-root-cas.pem        # Combined Root CA bundle
  │   └── dive-truststore.jks      # Java truststore (password: changeit)
  └── checksums.sha256             # Certificate integrity checksums

📁 docs/
  ├── FEDERATION-PARTNER-INFO.md   # Complete federation guide
  ├── FEDERATION-QUICK-REFERENCE.txt  # Quick reference sheet
  └── DIVE-CERTS-QUICKSTART.md     # Certificate installation guide

📁 configs/
  ├── connection-config.yaml       # Connection configuration
  └── client-secrets.txt           # 🔐 CONFIDENTIAL: Client secrets

📄 README.txt                       # This file

┌──────────────────────────────────────────────────────────────────────────────┐
│ QUICK START                                                                  │
└──────────────────────────────────────────────────────────────────────────────┘

1. VERIFY CERTIFICATE INTEGRITY
   cd certs/
   sha256sum -c checksums.sha256

2. INSTALL DIVE ROOT CAs
   # For Node.js applications
   export NODE_EXTRA_CA_CERTS=/path/to/certs/dive-root-cas/dive-root-cas.pem

   # For Java/Keycloak applications
   -Djavax.net.ssl.trustStore=/path/to/certs/dive-root-cas/dive-truststore.jks
   -Djavax.net.ssl.trustStorePassword=changeit

3. CONFIGURE OIDC FEDERATION
   Use values from configs/connection-config.yaml

   Discovery URL: https://10.71.190.17:8443/realms/dive-v3-broker/.well-known/openid-configuration
   Client ID: dive-v3-client-broker (or realm-specific)
   Client Secret: (See configs/client-secrets.txt)
   Scopes: openid profile email

4. WHITELIST REDIRECT URIS
   Add DIVE V3 callback URLs to your IdP:
   - https://10.71.190.17:8443/realms/dive-v3-broker/broker/{your-alias}/endpoint

5. MAP REQUIRED CLAIMS
   Ensure your IdP sends these claims in the ID token:
   - uniqueID
   - clearance (UNCLASSIFIED | CONFIDENTIAL | SECRET | TOP_SECRET)
   - countryOfAffiliation (ISO 3166-1 alpha-3: USA, FRA, CAN, etc.)
   - acpCOI (optional, JSON array)

6. TEST FEDERATION
   Navigate to: https://10.71.190.17:3000
   Select your IdP and authenticate

┌──────────────────────────────────────────────────────────────────────────────┐
│ SECURITY WARNINGS                                                            │
└──────────────────────────────────────────────────────────────────────────────┘

⚠️  CONFIDENTIAL: configs/client-secrets.txt contains sensitive credentials
    - Store securely (encrypted storage, vault, secrets manager)
    - Do not commit to version control
    - Transmit only via secure channels

⚠️  DEVELOPMENT ONLY: The mkcert certificate is for development use
    - For production, use CA-signed certificates
    - Validate certificate fingerprints before trusting

⚠️  NETWORK SECURITY: Ensure proper firewall rules
    - Only whitelist trusted IP ranges
    - Use VPN or private network for federation traffic
    - Enable rate limiting on token endpoints

┌──────────────────────────────────────────────────────────────────────────────┐
│ DOCUMENTATION                                                                │
└──────────────────────────────────────────────────────────────────────────────┘

For detailed setup instructions, please refer to:
  📖 docs/FEDERATION-PARTNER-INFO.md       (Complete guide)
  📋 docs/FEDERATION-QUICK-REFERENCE.txt   (Quick reference)

┌──────────────────────────────────────────────────────────────────────────────┐
│ SUPPORT                                                                      │
└──────────────────────────────────────────────────────────────────────────────┘

Technical Issues:
  - Contact DIVE V3 system administrator
  - Hostname: MacBook-Pro-3.local
  - Secure Channel: (Refer to docs for contact information)

Keycloak Admin Console:
  - URL: https://10.71.190.17:8443/admin
  - Credentials: (Provided separately via secure channel)

┌──────────────────────────────────────────────────────────────────────────────┐
│ COMPLIANCE                                                                   │
└──────────────────────────────────────────────────────────────────────────────┘

Standards: ACP-240, STANAG 4774/5636, NIST SP 800-63B/C, ISO 3166-1 alpha-3
Classification: UNCLASSIFIED // FOR OFFICIAL USE ONLY
Distribution: Authorized Federation Partners Only

╔══════════════════════════════════════════════════════════════════════════════╗
║  Handle this package per your organization's security policies              ║
╚══════════════════════════════════════════════════════════════════════════════╝
EOF

echo ""
echo -e "${YELLOW}[8/8] Creating archive package...${NC}"

# Create tar.gz archive
cd "${PROJECT_ROOT}/tmp" || exit 1
tar -czf "${PACKAGE_NAME}.tar.gz" "${PACKAGE_NAME}/"

if [ $? -eq 0 ]; then
    PACKAGE_PATH="${PROJECT_ROOT}/tmp/${PACKAGE_NAME}.tar.gz"
    PACKAGE_SIZE=$(du -h "${PACKAGE_PATH}" | cut -f1)
    
    echo -e "${GREEN}✓ Package created successfully${NC}"
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  Package Ready                                            ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}📦 Package:${NC} ${PACKAGE_PATH}"
    echo -e "${GREEN}📏 Size:${NC} ${PACKAGE_SIZE}"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo -e "  1. Review package contents: tar -tzf ${PACKAGE_PATH}"
    echo -e "  2. Verify client secrets: cat tmp/${PACKAGE_NAME}/configs/client-secrets.txt"
    echo -e "  3. Transmit via secure channel (encrypted email, secure file transfer)"
    echo -e "  4. Provide partner with decryption instructions"
    echo ""
    echo -e "${YELLOW}Security Reminder:${NC}"
    echo -e "  🔐 This package contains sensitive credentials"
    echo -e "  🔐 Use encryption for transmission (GPG, age, 7z with password)"
    echo -e "  🔐 Delete package after secure delivery"
    echo ""
    echo -e "${GREEN}✨ Federation package creation complete!${NC}"
    
else
    echo -e "${RED}✗ Failed to create package archive${NC}"
    exit 1
fi

# Cleanup instructions
echo ""
echo -e "${YELLOW}Cleanup:${NC}"
echo -e "  Remove temp directory: rm -rf ${TEMP_DIR}"
echo -e "  Remove archive (after delivery): rm ${PACKAGE_PATH}"
echo ""

