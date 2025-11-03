#!/bin/bash
# DIVE Root CA Certificate Installation Script
# Integrates verified Root CA certificates into all DIVE V3 components

set -e

# Detect project root directory (works on any system)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

CERT_SOURCE="$PROJECT_ROOT/dive-certs"
BACKEND_CERTS="$PROJECT_ROOT/backend/certs/dive-root-cas"
FRONTEND_CERTS="$PROJECT_ROOT/frontend/certs/dive-root-cas"
KEYCLOAK_CERTS="$PROJECT_ROOT/keycloak/certs/dive-root-cas"
KAS_CERTS="$PROJECT_ROOT/kas/certs/dive-root-cas"

echo "============================================"
echo "DIVE Root CA Certificate Installation"
echo "============================================"
echo ""

# Verify certificates exist
if [ ! -f "$CERT_SOURCE/NLDECCDIVEROOTCAG1.cacert.pem" ] || \
   [ ! -f "$CERT_SOURCE/NLDRSADIVEROOTCAG1.cacert.pem" ]; then
    echo "❌ Root CA certificate files not found in $CERT_SOURCE"
    echo "Please ensure the certificate files are present before running this script."
    exit 1
fi

echo "Step 1: Creating certificate directories..."
mkdir -p "$BACKEND_CERTS"
mkdir -p "$FRONTEND_CERTS"
mkdir -p "$KEYCLOAK_CERTS"
mkdir -p "$KAS_CERTS"
echo "✅ Directories created"
echo ""

echo "Step 2: Copying Root CA certificates..."
# Copy Root CA PEM files to each component
for dir in "$BACKEND_CERTS" "$FRONTEND_CERTS" "$KEYCLOAK_CERTS" "$KAS_CERTS"; do
    cp "$CERT_SOURCE/NLDECCDIVEROOTCAG1.cacert.pem" "$dir/"
    cp "$CERT_SOURCE/NLDRSADIVEROOTCAG1.cacert.pem" "$dir/"
    cp "$CERT_SOURCE/NLD-ECC-DIVE-chain.pem" "$dir/"
    cp "$CERT_SOURCE/NLD-RSA-DIVE-chain.pem" "$dir/"
    echo "  ✅ Copied to $(basename $dir)"
done
echo ""

echo "Step 3: Creating combined CA bundle..."
# Create a single bundle file for Node.js applications
cat "$CERT_SOURCE/NLDECCDIVEROOTCAG1.cacert.pem" \
    "$CERT_SOURCE/NLDRSADIVEROOTCAG1.cacert.pem" \
    > "$BACKEND_CERTS/dive-root-cas.pem"

cp "$BACKEND_CERTS/dive-root-cas.pem" "$FRONTEND_CERTS/"
cp "$BACKEND_CERTS/dive-root-cas.pem" "$KAS_CERTS/"
echo "✅ Combined CA bundle created: dive-root-cas.pem"
echo ""

echo "Step 4: Creating Java KeyStore for Keycloak..."
# Keycloak uses Java KeyStore (JKS) for trust store
KEYSTORE_PATH="$KEYCLOAK_CERTS/dive-truststore.jks"
KEYSTORE_PASS="changeit"  # Default Java truststore password

# Remove existing keystore if present
rm -f "$KEYSTORE_PATH"

# Import ECC Root CA
keytool -import -trustcacerts -noprompt \
    -alias nld-ecc-root-ca \
    -file "$CERT_SOURCE/NLDECCDIVEROOTCAG1.cacert.pem" \
    -keystore "$KEYSTORE_PATH" \
    -storepass "$KEYSTORE_PASS" 2>/dev/null || {
        echo "⚠️  keytool not found - Skipping JKS creation"
        echo "   Install Java JDK to create Keycloak truststore"
        echo "   Or manually import certificates into Keycloak later"
    }

# Import RSA Root CA
keytool -import -trustcacerts -noprompt \
    -alias nld-rsa-root-ca \
    -file "$CERT_SOURCE/NLDRSADIVEROOTCAG1.cacert.pem" \
    -keystore "$KEYSTORE_PATH" \
    -storepass "$KEYSTORE_PASS" 2>/dev/null || true

if [ -f "$KEYSTORE_PATH" ]; then
    echo "✅ Java KeyStore created: dive-truststore.jks"
    # List aliases in the keystore (don't fail if grep finds nothing)
    keytool -list -keystore "$KEYSTORE_PATH" -storepass "$KEYSTORE_PASS" 2>/dev/null | grep "Alias name:" || true
else
    echo "⚠️  Java KeyStore not created (keytool required)"
fi
echo ""

echo "Step 5: Updating Docker configurations..."

# Update backend Dockerfile to include CA certificates
cat > "$PROJECT_ROOT/backend/Dockerfile.dive-certs.snippet" << 'EOF'
# DIVE Root CA Certificates
COPY certs/dive-root-cas/*.pem /usr/local/share/ca-certificates/
RUN update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/backend/certs/dive-root-cas/dive-root-cas.pem
EOF
echo "✅ Created backend Dockerfile snippet"

# Update frontend next.config.js snippet
cat > "$PROJECT_ROOT/frontend/dive-ca-config.snippet.js" << 'EOF'
// DIVE Root CA Certificates Configuration
// Add to next.config.js webpack config:
module.exports = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Set Node.js to trust DIVE Root CAs
      process.env.NODE_EXTRA_CA_CERTS = './certs/dive-root-cas/dive-root-cas.pem';
    }
    return config;
  },
};
EOF
echo "✅ Created frontend config snippet"

# Update docker-compose.yml snippet
cat > "$PROJECT_ROOT/dive-certs-compose.snippet.yml" << 'EOF'
# Add to each service in docker-compose.yml:
volumes:
  - ./dive-certs:/app/certs/dive-root-cas:ro
environment:
  - NODE_EXTRA_CA_CERTS=/app/certs/dive-root-cas/dive-root-cas.pem
  # For Keycloak (add to keycloak service):
  - JAVA_OPTS=-Djavax.net.ssl.trustStore=/opt/keycloak/certs/dive-root-cas/dive-truststore.jks -Djavax.net.ssl.trustStorePassword=changeit
EOF
echo "✅ Created docker-compose snippet"
echo ""

echo "Step 6: Creating documentation..."
cat > "$PROJECT_ROOT/dive-certs/README.md" << 'EOF'
# DIVE Root CA Certificates

## Overview
This directory contains Root CA certificates issued by the Netherlands (NLD) for the DIVE coalition event. These certificates must be installed in the trust store of all DIVE V3 components to enable secure federation with external Identity Providers.

## Certificate Files

### Root CA Certificates (PEM format)
- `NLDECCDIVEROOTCAG1.cacert.pem` - NLD ECC Root CA (Elliptic Curve)
- `NLDRSADIVEROOTCAG1.cacert.pem` - NLD RSA Root CA

### Certificate Chains (PEM format)
- `NLD-ECC-DIVE-chain.pem` - Complete ECC certificate chain
- `NLD-RSA-DIVE-chain.pem` - Complete RSA certificate chain

### DER Format (for systems requiring binary format)
- `NLDECCDIVEROOTCAG1.cacert.crt` - NLD ECC Root CA (DER)
- `NLDRSADIVEROOTCAG1.cacert.crt` - NLD RSA Root CA (DER)

### Test Certificates
- `test_ecc.crt` - ECC test certificate for validation
- `test_rsa.crt` - RSA test certificate for validation

## Verification

Before using these certificates, verify their integrity:

```bash
# Verify checksums
cd dive-certs
shasum -a 256 -c checksums.sha256

# Or use the automated script
./scripts/verify-dive-certs.sh
```

## Installation

To install these certificates into your DIVE V3 application:

```bash
# 1. Verify certificates first
./scripts/verify-dive-certs.sh

# 2. Install into all components
./scripts/install-dive-certs.sh

# 3. Restart services
docker-compose down
docker-compose up -d
```

## Usage by Component

### Backend API (Node.js/Express)
- Location: `backend/certs/dive-root-cas/`
- Environment: `NODE_EXTRA_CA_CERTS=./certs/dive-root-cas/dive-root-cas.pem`
- Used for: HTTPS requests to external IdPs, Keycloak JWKS endpoint

### Frontend (Next.js)
- Location: `frontend/certs/dive-root-cas/`
- Environment: `NODE_EXTRA_CA_CERTS=./certs/dive-root-cas/dive-root-cas.pem`
- Used for: Server-side requests to Backend API, NextAuth callbacks

### Keycloak
- Location: `keycloak/certs/dive-root-cas/`
- Format: Java KeyStore (JKS) - `dive-truststore.jks`
- Environment: `-Djavax.net.ssl.trustStore=/opt/keycloak/certs/dive-root-cas/dive-truststore.jks`
- Used for: SAML/OIDC connections to external IdPs

### KAS (Key Access Service)
- Location: `kas/certs/dive-root-cas/`
- Environment: `NODE_EXTRA_CA_CERTS=./certs/dive-root-cas/dive-root-cas.pem`
- Used for: TLS connections to policy engine, key distribution

## Security Notes

1. **Trust Store Scope**: These Root CAs are trusted ONLY for DIVE coalition IdP certificates
2. **Validation**: Always verify checksums before installation
3. **Expiration**: Check certificate expiration dates periodically
4. **Event-Specific**: These certificates are for the DIVE 2025-2 event
5. **Revocation**: Monitor for CRL/OCSP revocation status if provided

## Troubleshooting

### Certificate verification errors
If you encounter "certificate verify failed" errors:

```bash
# Check certificate is in trust store
openssl s_client -connect external-idp.example.mil:443 \
  -CAfile dive-certs/dive-root-cas.pem -showcerts

# Verify certificate chain
openssl verify -CAfile dive-certs/NLDRSADIVEROOTCAG1.cacert.pem \
  dive-certs/test_rsa.crt
```

### Keycloak not trusting external IdP
1. Verify `dive-truststore.jks` is mounted in container
2. Check `JAVA_OPTS` includes trustStore configuration
3. Restart Keycloak service

### Node.js applications
1. Verify `NODE_EXTRA_CA_CERTS` environment variable is set
2. Check file path is correct (relative to working directory)
3. Ensure PEM file contains valid certificates

## References

- Certificate Authority: Netherlands Ministry of Defence
- Certificate Policy OID: (see certificate details)
- Issued For: DIVE 2025-2 Coalition Event
- Documentation: `docs/Dive_2025-2_PKI_NLD_v01_signed.pdf`

## Contact

For questions about these certificates, contact:
- DIVE Event Coordinators
- Netherlands PKI Team
EOF
echo "✅ Created README.md"
echo ""

echo "============================================"
echo "Installation Complete! ✅"
echo "============================================"
echo ""
echo "Certificates installed in:"
echo "  - Backend:  backend/certs/dive-root-cas/"
echo "  - Frontend: frontend/certs/dive-root-cas/"
echo "  - Keycloak: keycloak/certs/dive-root-cas/"
echo "  - KAS:      kas/certs/dive-root-cas/"
echo ""
echo "⚠️  NEXT STEPS REQUIRED:"
echo ""
echo "1. Review configuration snippets created:"
echo "   - backend/Dockerfile.dive-certs.snippet"
echo "   - frontend/dive-ca-config.snippet.js"
echo "   - dive-certs-compose.snippet.yml"
echo ""
echo "2. Integrate these into your actual configuration files"
echo ""
echo "3. Update docker-compose.yml to mount certificates:"
echo "   Run: ./scripts/update-docker-compose-certs.sh"
echo ""
echo "4. Rebuild and restart all services:"
echo "   docker-compose down"
echo "   docker-compose build"
echo "   docker-compose up -d"
echo ""
echo "5. Verify certificate trust:"
echo "   ./scripts/test-dive-cert-trust.sh"
echo ""

# Explicitly exit successfully
exit 0

