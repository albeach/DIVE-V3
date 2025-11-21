#!/bin/bash
# Test DIVE Root CA certificate trust in all components

set -e

PROJECT_ROOT="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3"
CERTS_DIR="$PROJECT_ROOT/dive-certs"

echo "============================================"
echo "DIVE Root CA Trust Verification Tests"
echo "============================================"
echo ""

# Test 1: Verify certificates can be read by OpenSSL
echo "Test 1: OpenSSL Certificate Parsing"
echo "----------------------------------------"
for cert in NLDECCDIVEROOTCAG1.cacert.pem NLDRSADIVEROOTCAG1.cacert.pem; do
    if openssl x509 -in "$CERTS_DIR/$cert" -noout -subject -issuer -dates; then
        echo "✅ $cert: Valid PEM format"
    else
        echo "❌ $cert: Invalid or corrupted"
    fi
done
echo ""

# Test 2: Verify test certificates against Root CAs
echo "Test 2: Certificate Chain Validation"
echo "----------------------------------------"
if [ -f "$CERTS_DIR/test_ecc.crt" ]; then
    if openssl verify -CAfile "$CERTS_DIR/NLDECCDIVEROOTCAG1.cacert.pem" \
        "$CERTS_DIR/test_ecc.crt" 2>&1 | grep -q "OK"; then
        echo "✅ ECC test certificate validates against Root CA"
    else
        echo "⚠️  ECC test certificate validation failed (may be expected if intermediate CA required)"
    fi
fi

if [ -f "$CERTS_DIR/test_rsa.crt" ]; then
    if openssl verify -CAfile "$CERTS_DIR/NLDRSADIVEROOTCAG1.cacert.pem" \
        "$CERTS_DIR/test_rsa.crt" 2>&1 | grep -q "OK"; then
        echo "✅ RSA test certificate validates against Root CA"
    else
        echo "⚠️  RSA test certificate validation failed (may be expected if intermediate CA required)"
    fi
fi
echo ""

# Test 3: Check if certificates are installed in components
echo "Test 3: Component Installation Check"
echo "----------------------------------------"
for component in backend frontend keycloak kas; do
    CERT_PATH="$PROJECT_ROOT/$component/certs/dive-root-cas/dive-root-cas.pem"
    if [ -f "$CERT_PATH" ]; then
        CERT_COUNT=$(grep -c "BEGIN CERTIFICATE" "$CERT_PATH")
        echo "✅ $component: Found $CERT_COUNT certificates"
    else
        echo "❌ $component: Certificates not installed at $CERT_PATH"
    fi
done
echo ""

# Test 4: Check Keycloak Java KeyStore
echo "Test 4: Keycloak Java KeyStore"
echo "----------------------------------------"
KEYSTORE="$PROJECT_ROOT/keycloak/certs/dive-root-cas/dive-truststore.jks"
if [ -f "$KEYSTORE" ]; then
    if keytool -list -keystore "$KEYSTORE" -storepass changeit 2>/dev/null | grep -q "nld.*root-ca"; then
        echo "✅ Keycloak truststore contains NLD Root CAs"
        keytool -list -keystore "$KEYSTORE" -storepass changeit 2>/dev/null | grep "Alias name:" | sed 's/^/   /'
    else
        echo "⚠️  Keycloak truststore exists but certificates not found"
    fi
else
    echo "❌ Keycloak truststore not found at $KEYSTORE"
fi
echo ""

# Test 5: Node.js Runtime Test
echo "Test 5: Node.js Certificate Loading"
echo "----------------------------------------"
node -e "
const fs = require('fs');
const path = require('path');
const certPath = '$PROJECT_ROOT/backend/certs/dive-root-cas/dive-root-cas.pem';
try {
    if (fs.existsSync(certPath)) {
        const certData = fs.readFileSync(certPath, 'utf8');
        const certCount = (certData.match(/BEGIN CERTIFICATE/g) || []).length;
        console.log('✅ Node.js can read certificate bundle: ' + certCount + ' certificates');
    } else {
        console.log('❌ Certificate bundle not found at: ' + certPath);
    }
} catch (error) {
    console.log('❌ Error reading certificates: ' + error.message);
}
" 2>/dev/null || echo "⚠️  Node.js not available for testing"
echo ""

# Test 6: Docker Container Test (if running)
echo "Test 6: Docker Container Certificate Access"
echo "----------------------------------------"
for service in backend frontend keycloak kas; do
    if docker-compose ps "$service" 2>/dev/null | grep -q "Up"; then
        echo "Testing $service container..."
        docker-compose exec -T "$service" test -f /app/certs/dive-root-cas/dive-root-cas.pem 2>/dev/null && \
            echo "✅ $service: Certificate accessible in container" || \
            echo "⚠️  $service: Certificate not accessible (check volume mount)"
    else
        echo "⚠️  $service: Container not running"
    fi
done
echo ""

# Test 7: Environment Variable Check
echo "Test 7: Environment Variable Configuration"
echo "----------------------------------------"
for service in backend frontend kas; do
    if docker-compose ps "$service" 2>/dev/null | grep -q "Up"; then
        ENV_VAR=$(docker-compose exec -T "$service" printenv NODE_EXTRA_CA_CERTS 2>/dev/null || echo "NOT SET")
        if [ "$ENV_VAR" != "NOT SET" ]; then
            echo "✅ $service: NODE_EXTRA_CA_CERTS=$ENV_VAR"
        else
            echo "⚠️  $service: NODE_EXTRA_CA_CERTS not set"
        fi
    fi
done
echo ""

echo "============================================"
echo "Verification Complete"
echo "============================================"
echo ""
echo "Summary:"
echo "  • All certificates should show ✅ or ⚠️ with explanation"
echo "  • ❌ indicates a problem that needs attention"
echo ""
echo "If any tests failed, review:"
echo "  1. Run: ./scripts/install-dive-certs.sh"
echo "  2. Check: docker-compose.yml volume mounts"
echo "  3. Check: docker-compose.yml environment variables"
echo "  4. Restart: docker-compose down && docker-compose up -d"
echo ""












