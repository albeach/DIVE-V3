#!/bin/bash
# Verify mkcert certificate installation

set -e

PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"

echo "Verifying mkcert certificate installation..."
echo ""

# Check certificate files exist
CERT_DIRS=(
    "certs/mkcert"
    "keycloak/certs"
    "backend/certs"
    "frontend/certs"
    "kas/certs"
    "external-idps/certs"
)

for dir in "${CERT_DIRS[@]}"; do
    if [ -f "$PROJECT_ROOT/$dir/certificate.pem" ] && [ -f "$PROJECT_ROOT/$dir/key.pem" ]; then
        echo "✅ $dir - certificates present"
    else
        echo "❌ $dir - certificates missing"
    fi
done

echo ""
echo "Testing certificate validity..."
openssl x509 -in "$PROJECT_ROOT/certs/mkcert/certificate.pem" -noout -text | grep -E "(Issuer|Subject|DNS:|Not Before|Not After)" || true
echo ""
echo "✅ Verification complete"
