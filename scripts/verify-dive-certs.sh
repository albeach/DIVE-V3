#!/bin/bash
# DIVE Root CA Certificate Verification Script
# Verifies checksums and inspects certificate properties

set -e

CERT_DIR="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/dive-certs"
CHECKSUM_FILE="$CERT_DIR/checksums.sha256"

echo "============================================"
echo "DIVE Root CA Certificate Verification"
echo "============================================"
echo ""

# Step 1: Verify checksums
echo "Step 1: Verifying SHA256 checksums..."
cd "$CERT_DIR"

if ! shasum -a 256 -c checksums.sha256; then
    echo "❌ CHECKSUM VERIFICATION FAILED!"
    echo "Do not proceed with certificate installation."
    exit 1
fi

echo "✅ All checksums verified successfully"
echo ""

# Step 2: Inspect Root CA certificates
echo "Step 2: Inspecting Root CA certificates..."
echo ""

for cert in NLDECCDIVEROOTCAG1.cacert.pem NLDRSADIVEROOTCAG1.cacert.pem; do
    if [ -f "$cert" ]; then
        echo "----------------------------------------"
        echo "Certificate: $cert"
        echo "----------------------------------------"
        
        # Display certificate details
        openssl x509 -in "$cert" -text -noout | grep -A 3 "Issuer:\|Subject:\|Validity\|Public Key Algorithm"
        
        # Verify it's self-signed (Root CA)
        if openssl verify -CAfile "$cert" "$cert" 2>&1 | grep -q "OK"; then
            echo "✅ Self-signed Root CA verified"
        else
            echo "⚠️  Certificate verification check"
        fi
        
        # Check expiration
        if openssl x509 -in "$cert" -checkend 86400 -noout; then
            echo "✅ Certificate is valid (not expired)"
        else
            echo "❌ Certificate is expired or expires within 24 hours"
        fi
        
        echo ""
    else
        echo "⚠️  Certificate file $cert not found"
        echo ""
    fi
done

# Step 3: Verify chain certificates
echo "Step 3: Inspecting certificate chains..."
echo ""

for chain in NLD-ECC-DIVE-chain.pem NLD-RSA-DIVE-chain.pem; do
    if [ -f "$chain" ]; then
        echo "----------------------------------------"
        echo "Chain: $chain"
        echo "----------------------------------------"
        
        # Count certificates in chain
        CERT_COUNT=$(grep -c "BEGIN CERTIFICATE" "$chain")
        echo "Number of certificates in chain: $CERT_COUNT"
        
        # Display chain structure
        openssl crl2pkcs7 -nocrl -certfile "$chain" | \
            openssl pkcs7 -print_certs -text -noout | \
            grep "Subject:" | nl
        
        echo ""
    else
        echo "⚠️  Chain file $chain not found"
        echo ""
    fi
done

echo "============================================"
echo "Verification Complete"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. Review certificate details above"
echo "2. If valid, run: ./scripts/install-dive-certs.sh"
echo "3. Restart all services to pick up new trust store"












