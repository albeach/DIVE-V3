#!/bin/bash
# ACP-240 KAS Phase 3.5: Certificate Generation for 3-KAS Testing
# Generates mTLS certificates for USA, FRA, GBR KAS instances

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CERT_DIR="$PROJECT_ROOT/certs/kas-federation"

echo "========================================"
echo "KAS Federation Certificate Generation"
echo "========================================"
echo ""
echo "Certificate directory: $CERT_DIR"
echo ""

# Create directory structure
mkdir -p "$CERT_DIR"/{ca,usa,fra,gbr}

# ============================================
# 1. Generate CA (Certificate Authority)
# ============================================
echo "[1/4] Generating CA certificate..."

if [ -f "$CERT_DIR/ca/ca.key" ]; then
    echo "   ⚠️  CA certificate already exists, skipping..."
else
    openssl req -x509 -newkey rsa:4096 -days 365 -nodes \
        -keyout "$CERT_DIR/ca/ca.key" \
        -out "$CERT_DIR/ca/ca.crt" \
        -subj "/C=US/ST=Test/L=Test/O=DIVE V3 KAS Federation/OU=Test CA/CN=KAS Federation Test CA" \
        -addext "basicConstraints=critical,CA:TRUE" \
        -addext "keyUsage=critical,keyCertSign,cRLSign"
    
    echo "   ✅ CA certificate generated"
fi

# ============================================
# 2. Generate Certificates for Each KAS
# ============================================
for country in usa fra gbr; do
    COUNTRY_UPPER=$(echo "$country" | tr '[:lower:]' '[:upper:]')
    # Use 2-letter ISO country codes for certificate compatibility
    COUNTRY_CODE=$(echo "$country" | cut -c1-2 | tr '[:lower:]' '[:upper:]')
    echo ""
    echo "[2/4] Generating certificates for KAS-${COUNTRY_UPPER}..."
    
    # Generate private key
    if [ -f "$CERT_DIR/$country/client.key" ]; then
        echo "   ⚠️  Private key already exists, skipping..."
    else
        openssl genrsa -out "$CERT_DIR/$country/client.key" 4096
        echo "   ✅ Private key generated"
    fi
    
    # Generate CSR (Certificate Signing Request)
    if [ -f "$CERT_DIR/$country/client.csr" ]; then
        echo "   ⚠️  CSR already exists, skipping..."
    else
        openssl req -new -key "$CERT_DIR/$country/client.key" \
            -out "$CERT_DIR/$country/client.csr" \
            -subj "/C=${COUNTRY_CODE}/ST=Test/L=Test/O=DIVE V3/OU=KAS/CN=kas-$country" \
            -addext "subjectAltName=DNS:kas-$country,DNS:kas-$country.dive25.com,DNS:localhost"
        echo "   ✅ CSR generated"
    fi
    
    # Sign with CA to create client certificate
    if [ -f "$CERT_DIR/$country/client.crt" ]; then
        echo "   ⚠️  Client certificate already exists, skipping..."
    else
        openssl x509 -req -in "$CERT_DIR/$country/client.csr" \
            -CA "$CERT_DIR/ca/ca.crt" \
            -CAkey "$CERT_DIR/ca/ca.key" \
            -CAcreateserial \
            -out "$CERT_DIR/$country/client.crt" \
            -days 365 \
            -sha256 \
            -extfile <(printf "subjectAltName=DNS:kas-$country,DNS:kas-$country.dive25.com,DNS:localhost\nbasicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=clientAuth,serverAuth")
        
        echo "   ✅ Client certificate signed by CA"
    fi
    
    # Generate self-signed server certificate for HTTPS
    if [ -f "$CERT_DIR/$country/server.key" ]; then
        echo "   ⚠️  Server certificate already exists, skipping..."
    else
        # Generate server private key
        openssl genrsa -out "$CERT_DIR/$country/server.key" 4096
        
        # Generate self-signed server certificate (use 2-letter country code)
        COUNTRY_CODE=$(echo "$country" | cut -c1-2 | tr '[:lower:]' '[:upper:]')
        openssl req -new -x509 -key "$CERT_DIR/$country/server.key" \
            -out "$CERT_DIR/$country/server.crt" \
            -days 365 \
            -subj "/C=${COUNTRY_CODE}/ST=Test/L=Test/O=DIVE V3/OU=KAS/CN=kas-$country" \
            -addext "subjectAltName=DNS:kas-$country,DNS:kas-$country.dive25.com,DNS:localhost,IP:127.0.0.1"
        
        echo "   ✅ Server certificate generated"
    fi
    
    # Copy CA certificate to each country directory
    cp "$CERT_DIR/ca/ca.crt" "$CERT_DIR/$country/ca.crt"
    
    echo "   ✅ Certificates ready for KAS-${COUNTRY_UPPER}"
done

# ============================================
# 3. Verify Certificates
# ============================================
echo ""
echo "[3/4] Verifying certificates..."
for country in usa fra gbr; do
    COUNTRY_UPPER=$(echo "$country" | tr '[:lower:]' '[:upper:]')
    
    # Verify client certificate against CA
    if openssl verify -CAfile "$CERT_DIR/ca/ca.crt" "$CERT_DIR/$country/client.crt" > /dev/null 2>&1; then
        echo "   ✅ KAS-${COUNTRY_UPPER} client certificate valid"
    else
        echo "   ❌ KAS-${COUNTRY_UPPER} client certificate INVALID"
        exit 1
    fi
    
    # Verify server certificate is self-signed (use 2-letter country code)
    COUNTRY_CODE=$(echo "$country" | cut -c1-2 | tr '[:lower:]' '[:upper:]')
    if openssl x509 -in "$CERT_DIR/$country/server.crt" -noout -text | grep -q "C=${COUNTRY_CODE}"; then
        echo "   ✅ KAS-${COUNTRY_UPPER} server certificate valid"
    else
        echo "   ❌ KAS-${COUNTRY_UPPER} server certificate INVALID"
        exit 1
    fi
done

# ============================================
# 4. Display Certificate Information
# ============================================
echo ""
echo "[4/4] Certificate summary:"
echo ""
echo "   CA Certificate:"
echo "      📁 $CERT_DIR/ca/ca.crt"
openssl x509 -in "$CERT_DIR/ca/ca.crt" -noout -subject -dates | sed 's/^/      /'
echo ""

for country in usa fra gbr; do
    COUNTRY_UPPER=$(echo "$country" | tr '[:lower:]' '[:upper:]')
    echo "   KAS-${COUNTRY_UPPER} Certificates:"
    echo "      📁 Client: $CERT_DIR/$country/client.crt"
    echo "      📁 Server: $CERT_DIR/$country/server.crt"
    openssl x509 -in "$CERT_DIR/$country/client.crt" -noout -subject -dates | sed 's/^/      /'
    echo ""
done

echo "========================================"
echo "✅ Certificate generation complete"
echo "========================================"
echo ""
echo "Certificate files created:"
echo "   • CA: $CERT_DIR/ca/{ca.crt,ca.key}"
echo "   • USA: $CERT_DIR/usa/{client.crt,client.key,server.crt,server.key,ca.crt}"
echo "   • FRA: $CERT_DIR/fra/{client.crt,client.key,server.crt,server.key,ca.crt}"
echo "   • GBR: $CERT_DIR/gbr/{client.crt,client.key,server.crt,server.key,ca.crt}"
echo ""
echo "Next steps:"
echo "   1. Run: docker-compose -f docker-compose.3kas.yml up -d"
echo "   2. Verify health: ./kas/scripts/verify-3kas-health.sh"
echo "   3. Run tests: npm run test:integration"
echo ""
