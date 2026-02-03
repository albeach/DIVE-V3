#!/bin/bash
# =============================================================================
# DIVE V3 - OPAL Certificate Generation Script
# =============================================================================
# Generates all certificates required for OPAL deployment:
#   - CA certificate (root authority)
#   - OPAL Server certificate (TLS)
#   - OPAL Client certificate (mTLS)
#   - JWT signing keypair (OPAL auth)
#   - Bundle signing keypair (OPA policy bundles)
#
# Usage: ./scripts/generate-opal-certs.sh
#
# @version 1.0.0
# @date 2025-12-05
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OPAL_CERTS_DIR="$PROJECT_ROOT/certs/opal"
BUNDLE_CERTS_DIR="$PROJECT_ROOT/certs/bundle-signing"

# Certificate validity (days)
CA_VALIDITY=3650    # 10 years
CERT_VALIDITY=365   # 1 year

# Subject fields
COUNTRY="US"
STATE="Virginia"
ORG="DIVE V3"
CA_CN="DIVE V3 CA"
SERVER_CN="opal-server"
CLIENT_CN="opal-client"

echo "=================================================="
echo "DIVE V3 - OPAL Certificate Generation"
echo "=================================================="

# Create directories
mkdir -p "$OPAL_CERTS_DIR"
mkdir -p "$BUNDLE_CERTS_DIR"

# =============================================================================
# 1. Generate CA Certificate
# =============================================================================
echo ""
echo "[1/5] Generating Root CA..."

if [ ! -f "$OPAL_CERTS_DIR/ca.key" ]; then
    openssl genrsa -out "$OPAL_CERTS_DIR/ca.key" 4096
    echo "  ✓ CA private key generated"
else
    echo "  ⊘ CA private key already exists, skipping"
fi

if [ ! -f "$OPAL_CERTS_DIR/ca.crt" ]; then
    openssl req -new -x509 \
        -days $CA_VALIDITY \
        -key "$OPAL_CERTS_DIR/ca.key" \
        -out "$OPAL_CERTS_DIR/ca.crt" \
        -subj "/C=$COUNTRY/ST=$STATE/O=$ORG/CN=$CA_CN"
    echo "  ✓ CA certificate generated"
else
    echo "  ⊘ CA certificate already exists, skipping"
fi

# =============================================================================
# 2. Generate OPAL Server Certificate
# =============================================================================
echo ""
echo "[2/5] Generating OPAL Server Certificate..."

# Create SAN extension file
cat > "$OPAL_CERTS_DIR/server.ext" << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = opal-server
DNS.2 = opal-server-tls
DNS.3 = dive-pilot-opal-server
DNS.4 = localhost
IP.1 = 127.0.0.1
EOF

if [ ! -f "$OPAL_CERTS_DIR/server.key" ]; then
    openssl genrsa -out "$OPAL_CERTS_DIR/server.key" 2048
    echo "  ✓ Server private key generated"
else
    echo "  ⊘ Server private key already exists, skipping"
fi

if [ ! -f "$OPAL_CERTS_DIR/server.crt" ]; then
    # Generate CSR
    openssl req -new \
        -key "$OPAL_CERTS_DIR/server.key" \
        -out "$OPAL_CERTS_DIR/server.csr" \
        -subj "/C=$COUNTRY/ST=$STATE/O=$ORG/CN=$SERVER_CN"

    # Sign with CA
    openssl x509 -req \
        -days $CERT_VALIDITY \
        -in "$OPAL_CERTS_DIR/server.csr" \
        -CA "$OPAL_CERTS_DIR/ca.crt" \
        -CAkey "$OPAL_CERTS_DIR/ca.key" \
        -CAcreateserial \
        -out "$OPAL_CERTS_DIR/server.crt" \
        -extfile "$OPAL_CERTS_DIR/server.ext"

    rm -f "$OPAL_CERTS_DIR/server.csr"
    echo "  ✓ Server certificate generated"
else
    echo "  ⊘ Server certificate already exists, skipping"
fi

# =============================================================================
# 3. Generate OPAL Client Certificate
# =============================================================================
echo ""
echo "[3/5] Generating OPAL Client Certificate..."

# Create client extension file
cat > "$OPAL_CERTS_DIR/client.ext" << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature
extendedKeyUsage = clientAuth
EOF

if [ ! -f "$OPAL_CERTS_DIR/client.key" ]; then
    openssl genrsa -out "$OPAL_CERTS_DIR/client.key" 2048
    echo "  ✓ Client private key generated"
else
    echo "  ⊘ Client private key already exists, skipping"
fi

if [ ! -f "$OPAL_CERTS_DIR/client.crt" ]; then
    # Generate CSR
    openssl req -new \
        -key "$OPAL_CERTS_DIR/client.key" \
        -out "$OPAL_CERTS_DIR/client.csr" \
        -subj "/C=$COUNTRY/ST=$STATE/O=$ORG/CN=$CLIENT_CN"

    # Sign with CA
    openssl x509 -req \
        -days $CERT_VALIDITY \
        -in "$OPAL_CERTS_DIR/client.csr" \
        -CA "$OPAL_CERTS_DIR/ca.crt" \
        -CAkey "$OPAL_CERTS_DIR/ca.key" \
        -CAcreateserial \
        -out "$OPAL_CERTS_DIR/client.crt" \
        -extfile "$OPAL_CERTS_DIR/client.ext"

    rm -f "$OPAL_CERTS_DIR/client.csr"
    echo "  ✓ Client certificate generated"
else
    echo "  ⊘ Client certificate already exists, skipping"
fi

# =============================================================================
# 4. Generate JWT Signing Key (for OPAL auth)
# =============================================================================
echo ""
echo "[4/5] Generating JWT Signing Key..."

if [ ! -f "$OPAL_CERTS_DIR/jwt-signing-key.pem" ]; then
    openssl genrsa -out "$OPAL_CERTS_DIR/jwt-signing-key.pem" 4096
    openssl rsa -in "$OPAL_CERTS_DIR/jwt-signing-key.pem" \
        -pubout -out "$OPAL_CERTS_DIR/jwt-signing-key.pub.pem"
    echo "  ✓ JWT signing keypair generated"
else
    echo "  ⊘ JWT signing key already exists, skipping"
fi

# =============================================================================
# 5. Generate Bundle Signing Key (for OPA policy bundles)
# =============================================================================
echo ""
echo "[5/5] Generating Bundle Signing Key..."

if [ ! -f "$BUNDLE_CERTS_DIR/bundle-signing.key" ]; then
    openssl genrsa -out "$BUNDLE_CERTS_DIR/bundle-signing.key" 2048
    openssl rsa -in "$BUNDLE_CERTS_DIR/bundle-signing.key" \
        -pubout -out "$BUNDLE_CERTS_DIR/bundle-signing.pub"
    echo "  ✓ Bundle signing keypair generated"
else
    echo "  ⊘ Bundle signing key already exists, skipping"
fi

# Copy public key to OPAL certs directory for OPA verification
cp "$BUNDLE_CERTS_DIR/bundle-signing.pub" "$OPAL_CERTS_DIR/bundle-signing.pub.pem"

# =============================================================================
# Clean up extension files
# =============================================================================
rm -f "$OPAL_CERTS_DIR/server.ext" "$OPAL_CERTS_DIR/client.ext"

# =============================================================================
# Verify certificates
# =============================================================================
echo ""
echo "=================================================="
echo "Verifying Certificates..."
echo "=================================================="

echo ""
echo "CA Certificate:"
openssl x509 -in "$OPAL_CERTS_DIR/ca.crt" -noout -subject -dates

echo ""
echo "Server Certificate:"
openssl x509 -in "$OPAL_CERTS_DIR/server.crt" -noout -subject -dates
openssl verify -CAfile "$OPAL_CERTS_DIR/ca.crt" "$OPAL_CERTS_DIR/server.crt"

echo ""
echo "Client Certificate:"
openssl x509 -in "$OPAL_CERTS_DIR/client.crt" -noout -subject -dates
openssl verify -CAfile "$OPAL_CERTS_DIR/ca.crt" "$OPAL_CERTS_DIR/client.crt"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "=================================================="
echo "Certificate Generation Complete!"
echo "=================================================="
echo ""
echo "Generated files:"
echo ""
echo "OPAL Certificates ($OPAL_CERTS_DIR):"
echo "  ca.crt              - Root CA certificate"
echo "  ca.key              - Root CA private key (SECURE!)"
echo "  server.crt          - OPAL Server certificate"
echo "  server.key          - OPAL Server private key"
echo "  client.crt          - OPAL Client certificate"
echo "  client.key          - OPAL Client private key"
echo "  jwt-signing-key.pem - JWT signing private key (SECURE!)"
echo "  jwt-signing-key.pub.pem - JWT signing public key"
echo "  bundle-signing.pub.pem  - Bundle verification public key"
echo ""
echo "Bundle Signing ($BUNDLE_CERTS_DIR):"
echo "  bundle-signing.key  - Bundle signing private key (SECURE!)"
echo "  bundle-signing.pub  - Bundle signing public key"
echo ""
echo "⚠️  IMPORTANT: Store private keys in GCP Secret Manager!"
echo "   Run: gcloud secrets create dive-v3-opal-jwt-key --project=dive25"
echo "        gcloud secrets versions add dive-v3-opal-jwt-key --data-file=$OPAL_CERTS_DIR/jwt-signing-key.pem"
echo ""
echo "   Run: gcloud secrets create dive-v3-bundle-signing-key --project=dive25"
echo "        gcloud secrets versions add dive-v3-bundle-signing-key --data-file=$BUNDLE_CERTS_DIR/bundle-signing.key"
echo ""

