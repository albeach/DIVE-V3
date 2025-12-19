#!/bin/bash

# DIVE V3 - Generate Self-Signed Certificates for Spain SAML IdP
# This script creates X.509 certificates for SimpleSAMLphp SAML signing/encryption

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="$SCRIPT_DIR/../spain-saml/cert"

echo "================================================"
echo "DIVE V3 - Spain SAML Certificate Generator"
echo "================================================"

# Create cert directory if it doesn't exist
mkdir -p "$CERT_DIR"

# Check if certificates already exist
if [ -f "$CERT_DIR/server.crt" ] && [ -f "$CERT_DIR/server.pem" ]; then
    read -p "Certificates already exist. Regenerate? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing certificates."
        exit 0
    fi
    echo "Regenerating certificates..."
fi

# Certificate details
COUNTRY="ES"
STATE="Madrid"
LOCALITY="Madrid"
ORGANIZATION="Spanish Defense Ministry"
ORGANIZATIONAL_UNIT="IT Department"
COMMON_NAME="spain-saml"
EMAIL="tic@mde.es"
DAYS_VALID=3650  # 10 years (development only)

echo "Generating self-signed certificate for Spain SAML IdP..."
echo "  Country: $COUNTRY"
echo "  Organization: $ORGANIZATION"
echo "  Common Name: $COMMON_NAME"
echo "  Valid for: $DAYS_VALID days"
echo ""

# Generate private key and certificate in one step
openssl req -x509 -nodes -days $DAYS_VALID -newkey rsa:4096 \
    -keyout "$CERT_DIR/server.pem" \
    -out "$CERT_DIR/server.crt" \
    -subj "/C=$COUNTRY/ST=$STATE/L=$LOCALITY/O=$ORGANIZATION/OU=$ORGANIZATIONAL_UNIT/CN=$COMMON_NAME/emailAddress=$EMAIL" \
    -addext "subjectAltName=DNS:spain-saml,DNS:localhost,DNS:spain-saml.dive-external-idps,IP:127.0.0.1"

# Set proper permissions
chmod 600 "$CERT_DIR/server.pem"
chmod 644 "$CERT_DIR/server.crt"

echo ""
echo "✅ Certificates generated successfully!"
echo ""
echo "Files created:"
echo "  Private Key: $CERT_DIR/server.pem"
echo "  Certificate: $CERT_DIR/server.crt"
echo ""

# Display certificate info
echo "Certificate details:"
openssl x509 -in "$CERT_DIR/server.crt" -noout -text | grep -A 2 "Subject:"
openssl x509 -in "$CERT_DIR/server.crt" -noout -dates

echo ""
echo "================================================"
echo "⚠️  WARNING: Development Only"
echo "================================================"
echo "These are self-signed certificates for DEVELOPMENT ONLY."
echo "For production, use certificates from a trusted CA."
echo ""
echo "To trust this certificate in your browser:"
echo "1. Navigate to https://localhost:8443/simplesaml/"
echo "2. Accept the security warning"
echo "3. Add exception for this certificate"
echo ""
echo "Next steps:"
echo "  1. Start external IdPs: docker-compose up -d"
echo "  2. Verify SAML metadata: curl -k https://localhost:8443/simplesaml/saml2/idp/metadata.php"
echo "  3. Onboard Spain IdP via DIVE V3 Super Admin wizard"
echo ""
