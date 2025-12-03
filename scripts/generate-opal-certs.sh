#!/bin/bash
# DIVE V3 - OPAL TLS Certificate Generator
# Phase 7: Production Hardening
#
# Generates all certificates required for OPAL TLS deployment:
# - Root CA
# - Server certificate (for OPAL Server)
# - Client certificate (for OPAL Client)
# - JWT signing key pair
#
# Usage: ./scripts/generate-opal-certs.sh [--force]
#
# @version 1.0.0
# @date 2025-12-03

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CERT_DIR="$PROJECT_ROOT/certs/opal"

# Certificate validity (days)
CA_VALIDITY=3650      # 10 years
SERVER_VALIDITY=365   # 1 year
CLIENT_VALIDITY=365   # 1 year

# Check for force flag
FORCE=false
if [[ "$1" == "--force" ]]; then
  FORCE=true
fi

echo "🔐 DIVE V3 - OPAL TLS Certificate Generator"
echo "============================================"
echo ""

# Create directory
mkdir -p "$CERT_DIR"
cd "$CERT_DIR"

# Check if certificates already exist
if [[ -f "ca.crt" && "$FORCE" != "true" ]]; then
  echo "⚠️  Certificates already exist. Use --force to regenerate."
  echo "   Location: $CERT_DIR"
  exit 0
fi

echo "📁 Certificate directory: $CERT_DIR"
echo ""

# ============================================
# 1. Generate Root CA
# ============================================
echo "1️⃣  Generating Root CA..."

openssl genrsa -out ca.key 4096 2>/dev/null
openssl req -new -x509 -days $CA_VALIDITY -key ca.key -out ca.crt \
  -subj "/C=US/ST=Virginia/L=Arlington/O=DIVE V3/OU=Security/CN=DIVE V3 Root CA" \
  2>/dev/null

echo "   ✅ Root CA created (valid for $CA_VALIDITY days)"

# ============================================
# 2. Generate Server Certificate
# ============================================
echo "2️⃣  Generating OPAL Server certificate..."

# Create extensions file for SAN
cat > server.ext << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = opal-server
DNS.2 = opal-server-tls
DNS.3 = localhost
DNS.4 = dive-v3-opal-server
DNS.5 = dive-v3-opal-server-tls
IP.1 = 127.0.0.1
EOF

openssl genrsa -out server.key 2048 2>/dev/null
openssl req -new -key server.key -out server.csr \
  -subj "/C=US/ST=Virginia/L=Arlington/O=DIVE V3/OU=OPAL/CN=opal-server" \
  2>/dev/null
openssl x509 -req -days $SERVER_VALIDITY -in server.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out server.crt -extfile server.ext 2>/dev/null

rm -f server.csr server.ext

echo "   ✅ Server certificate created (valid for $SERVER_VALIDITY days)"

# ============================================
# 3. Generate Client Certificate
# ============================================
echo "3️⃣  Generating OPAL Client certificate..."

# Create extensions file for client
cat > client.ext << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature
extendedKeyUsage = clientAuth
EOF

openssl genrsa -out client.key 2048 2>/dev/null
openssl req -new -key client.key -out client.csr \
  -subj "/C=US/ST=Virginia/L=Arlington/O=DIVE V3/OU=OPAL/CN=opal-client" \
  2>/dev/null
openssl x509 -req -days $CLIENT_VALIDITY -in client.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out client.crt -extfile client.ext 2>/dev/null

rm -f client.csr client.ext

echo "   ✅ Client certificate created (valid for $CLIENT_VALIDITY days)"

# ============================================
# 4. Generate JWT Signing Key
# ============================================
echo "4️⃣  Generating JWT signing key pair..."

openssl genrsa -out jwt-signing-key.pem 4096 2>/dev/null
openssl rsa -in jwt-signing-key.pem -pubout -out jwt-signing-key.pub.pem 2>/dev/null

echo "   ✅ JWT signing keys created"

# ============================================
# 5. Copy Bundle Signing Public Key (if exists)
# ============================================
echo "5️⃣  Checking for bundle signing key..."

BUNDLE_SIGNING_KEY="$PROJECT_ROOT/certs/bundle-signing/signing-key.pub.pem"
if [[ -f "$BUNDLE_SIGNING_KEY" ]]; then
  cp "$BUNDLE_SIGNING_KEY" bundle-signing.pub.pem
  echo "   ✅ Bundle signing public key copied"
else
  echo "   ⚠️  Bundle signing key not found (generate with sign-bundle.ts)"
fi

# ============================================
# 6. Set Permissions
# ============================================
echo "6️⃣  Setting file permissions..."

chmod 600 *.key *.pem 2>/dev/null || true
chmod 644 *.crt *.pub.pem 2>/dev/null || true

echo "   ✅ Permissions set (private keys: 600, public: 644)"

# ============================================
# 7. Verify Certificates
# ============================================
echo ""
echo "🔍 Verifying certificates..."

echo -n "   CA certificate: "
openssl x509 -in ca.crt -noout -text | grep -q "CA:TRUE" && echo "✅ Valid" || echo "❌ Invalid"

echo -n "   Server certificate: "
openssl verify -CAfile ca.crt server.crt 2>/dev/null && echo "" || echo "❌ Invalid"

echo -n "   Client certificate: "
openssl verify -CAfile ca.crt client.crt 2>/dev/null && echo "" || echo "❌ Invalid"

# ============================================
# Summary
# ============================================
echo ""
echo "============================================"
echo "✅ Certificate generation complete!"
echo "============================================"
echo ""
echo "📁 Files created in: $CERT_DIR"
echo ""
ls -la "$CERT_DIR"
echo ""
echo "🔒 Security reminders:"
echo "   1. Add private keys to .gitignore (*.key, *.pem except *.pub.pem)"
echo "   2. Store private keys in GCP Secret Manager for production"
echo "   3. Rotate certificates before expiration"
echo ""
echo "📋 Next steps:"
echo "   1. Start OPAL with TLS:"
echo "      docker-compose -f docker-compose.yml -f docker/opal-server-tls.yml up -d"
echo "   2. Generate JWT token for clients:"
echo "      npx ts-node --esm backend/src/scripts/generate-opal-jwt.ts"
echo ""

