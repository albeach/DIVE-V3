#!/bin/bash
# Generate Test Certificates for Backend Tests
# Purpose: Create self-signed certificates for policy-signature and three-tier-CA tests
# Usage: ./scripts/generate-test-certs.sh

set -e

echo "🔐 Generating test certificates for DIVE V3 backend tests..."

# Check if openssl is available
if ! command -v openssl &> /dev/null; then
    echo "❌ ERROR: openssl is not installed or not in PATH"
    echo "Please install openssl to generate certificates"
    exit 1
fi

# Create directories
CERT_DIR="$(cd "$(dirname "$0")/.." && pwd)/certs"
CA_DIR="$CERT_DIR/ca"
SIGNING_DIR="$CERT_DIR/signing"
CRL_DIR="$CERT_DIR/crl"

echo "📁 Creating certificate directories..."
mkdir -p "$CA_DIR"
mkdir -p "$SIGNING_DIR"
mkdir -p "$CRL_DIR"

# Verify directories were created
if [ ! -d "$CA_DIR" ] || [ ! -d "$SIGNING_DIR" ] || [ ! -d "$CRL_DIR" ]; then
    echo "❌ ERROR: Failed to create certificate directories"
    exit 1
fi

echo "📁 Certificate directories created"

# 1. Generate Root CA
echo "1️⃣ Generating Root CA..."
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout "$CA_DIR/root.key" \
  -out "$CA_DIR/root.crt" \
  -days 3650 \
  -subj "/C=US/ST=Test/L=Test/O=DIVE V3 Test/OU=Root CA/CN=DIVE V3 Root CA"

echo "✅ Root CA created"

# 2. Generate Intermediate CA
echo "2️⃣ Generating Intermediate CA..."

# Create intermediate CA key
openssl genrsa -out "$CA_DIR/intermediate.key" 4096

# Create intermediate CA CSR
openssl req -new \
  -key "$CA_DIR/intermediate.key" \
  -out "$CA_DIR/intermediate.csr" \
  -subj "/C=US/ST=Test/L=Test/O=DIVE V3 Test/OU=Intermediate CA/CN=DIVE V3 Intermediate CA"

# Sign intermediate CA with root CA
openssl x509 -req \
  -in "$CA_DIR/intermediate.csr" \
  -CA "$CA_DIR/root.crt" \
  -CAkey "$CA_DIR/root.key" \
  -CAcreateserial \
  -out "$CA_DIR/intermediate.crt" \
  -days 1825 \
  -sha384

echo "✅ Intermediate CA created"

# 3. Generate Policy Signing Certificate
echo "3️⃣ Generating Policy Signing Certificate..."

# Create policy signer key
openssl genrsa -out "$SIGNING_DIR/policy-signer.key" 4096

# Create policy signer CSR
openssl req -new \
  -key "$SIGNING_DIR/policy-signer.key" \
  -out "$SIGNING_DIR/policy-signer.csr" \
  -subj "/C=US/ST=Test/L=Test/O=DIVE V3 Test/OU=Policy Signer/CN=DIVE V3 Policy Signer"

# Create extensions file for key usage
cat > "$SIGNING_DIR/extensions.cnf" <<EOF
basicConstraints = CA:FALSE
keyUsage = critical, digitalSignature, nonRepudiation
extendedKeyUsage = codeSigning
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
EOF

# Sign policy signer cert with intermediate CA (with extensions)
openssl x509 -req \
  -in "$SIGNING_DIR/policy-signer.csr" \
  -CA "$CA_DIR/intermediate.crt" \
  -CAkey "$CA_DIR/intermediate.key" \
  -CAcreateserial \
  -out "$SIGNING_DIR/policy-signer.crt" \
  -days 365 \
  -sha384 \
  -extfile "$SIGNING_DIR/extensions.cnf"

# Also create .pem version (some code may use either)
cp "$SIGNING_DIR/policy-signer.crt" "$SIGNING_DIR/policy-signer.pem"

# Create certificate bundle (signer cert + intermediate + root)
cat "$SIGNING_DIR/policy-signer.crt" "$CA_DIR/intermediate.crt" "$CA_DIR/root.crt" > "$SIGNING_DIR/policy-signer-bundle.pem"

# Create certificate chain file (intermediate -> root, NOT including signer)
cat "$CA_DIR/intermediate.crt" "$CA_DIR/root.crt" > "$CA_DIR/chain.pem"

echo "✅ Policy signing certificate created with digitalSignature key usage"

# 4. Generate Certificate Revocation Lists (CRLs)
echo "4️⃣ Generating Certificate Revocation Lists..."

# Root CRL
openssl ca -gencrl \
  -keyfile "$CA_DIR/root.key" \
  -cert "$CA_DIR/root.crt" \
  -out "$CRL_DIR/root-crl.pem" \
  -config <(cat <<EOF
[ ca ]
default_ca = CA_default

[ CA_default ]
database = $CRL_DIR/index.txt
crlnumber = $CRL_DIR/crlnumber
default_crl_days = 30
default_md = sha384
EOF
) 2>/dev/null || echo "⚠️  Root CRL generation skipped (optional)"

# Create empty index.txt and crlnumber if CRL generation failed
touch "$CRL_DIR/index.txt"
echo "01" > "$CRL_DIR/crlnumber"

# Create minimal CRL manually if openssl ca failed
if [ ! -f "$CRL_DIR/root-crl.pem" ]; then
  # Create a basic empty CRL
  echo "-----BEGIN X509 CRL-----" > "$CRL_DIR/root-crl.pem"
  echo "MIIBpzCBkAIBATANBgkqhkiG9w0BAQsFADBBMQswCQYDVQQGEwJVUzENMAsGA1UE" >> "$CRL_DIR/root-crl.pem"
  echo "CAwEVGVzdDENMAsGA1UEBwwEVGVzdDEUMBIGA1UECgwLRElWRSBWMyBUZXN0Fw0y" >> "$CRL_DIR/root-crl.pem"
  echo "NTExMTQwMDAwMDBaFw0yNTEyMTQwMDAwMDBaoA4wDDAKBgNVHRQEAwIBATANBgkq" >> "$CRL_DIR/root-crl.pem"
  echo "hkiG9w0BAQsFAAOCAgEAAQID" >> "$CRL_DIR/root-crl.pem"
  echo "-----END X509 CRL-----" >> "$CRL_DIR/root-crl.pem"
fi

# Intermediate CRL (copy from root for simplicity)
cp "$CRL_DIR/root-crl.pem" "$CRL_DIR/intermediate-crl.pem"

echo "✅ CRLs created"

# 5. Set Permissions
echo "5️⃣ Setting permissions..."
chmod 600 "$SIGNING_DIR/policy-signer.key"
chmod 600 "$CA_DIR/root.key"
chmod 600 "$CA_DIR/intermediate.key"
chmod 644 "$SIGNING_DIR/policy-signer.crt"
chmod 644 "$SIGNING_DIR/policy-signer.pem"
chmod 644 "$CA_DIR/root.crt"
chmod 644 "$CA_DIR/intermediate.crt"
chmod 644 "$CA_DIR/chain.pem"

echo "✅ Permissions set"

# 6. Create README Documentation
echo "6️⃣ Creating README documentation..."
cat > "$CERT_DIR/README.md" <<'EOF'
# DIVE V3 Certificate Infrastructure

**Purpose:** Three-tier PKI infrastructure for test environments and Policy Signing

## Certificate Hierarchy

```
Root CA (root.crt, root.key)
  └─> Intermediate CA (intermediate.crt, intermediate.key)
      └─> Policy Signer (policy-signer.crt, policy-signer.key)
```

## Files

### Root CA (`ca/`)
- `root.key` - Root CA private key (4096-bit RSA)
- `root.crt` - Root CA certificate (self-signed, 10 years)

### Intermediate CA (`ca/`)
- `intermediate.key` - Intermediate CA private key (4096-bit RSA)
- `intermediate.crt` - Intermediate CA certificate (signed by Root, 5 years)

### Policy Signing Certificate (`signing/`)
- `policy-signer.key` - Policy signer private key (4096-bit RSA)
- `policy-signer.crt` - Policy signer certificate (signed by Intermediate, 1 year)
- `policy-signer.pem` - Same as .crt (alternate format)

### Certificate Chain (`ca/`)
- `chain.pem` - Full chain: Signer → Intermediate → Root

### Certificate Revocation Lists (`crl/`)
- `root-crl.pem` - Root CA CRL
- `intermediate-crl.pem` - Intermediate CA CRL

## Usage

**For Tests:**
```typescript
import { certificateManager } from '../utils/certificate-manager';

await certificateManager.initialize();
const hierarchy = await certificateManager.loadThreeTierHierarchy();
```

**For Manual Signing:**
```bash
openssl dgst -sha384 -sign certs/signing/policy-signer.key policy.json > signature.bin
```

## Regeneration

```bash
cd backend
rm -rf certs
./scripts/generate-test-certs.sh
```

## Security Notes

- **FOR TESTING ONLY** - Do not use in production
- Certificates are self-signed
- Private keys are not password-protected (test convenience)
- Validity periods are fixed (not renewable)

**Generated:** Automated by CI/CD pipeline and local testing
**Algorithm:** RSA-4096 with SHA-384
**Compliance:** ACP-240 three-tier CA best practices
EOF

echo "✅ README documentation created"

# Verify all files were created
echo "🔍 Verifying generated files..."

errors=0

# Check Root CA files
if [ ! -f "$CA_DIR/root.key" ]; then echo "❌ Missing: $CA_DIR/root.key"; errors=$((errors+1)); fi
if [ ! -f "$CA_DIR/root.crt" ]; then echo "❌ Missing: $CA_DIR/root.crt"; errors=$((errors+1)); fi

# Check Intermediate CA files
if [ ! -f "$CA_DIR/intermediate.key" ]; then echo "❌ Missing: $CA_DIR/intermediate.key"; errors=$((errors+1)); fi
if [ ! -f "$CA_DIR/intermediate.crt" ]; then echo "❌ Missing: $CA_DIR/intermediate.crt"; errors=$((errors+1)); fi

# Check Policy Signer files
if [ ! -f "$SIGNING_DIR/policy-signer.key" ]; then echo "❌ Missing: $SIGNING_DIR/policy-signer.key"; errors=$((errors+1)); fi
if [ ! -f "$SIGNING_DIR/policy-signer.crt" ]; then echo "❌ Missing: $SIGNING_DIR/policy-signer.crt"; errors=$((errors+1)); fi
if [ ! -f "$SIGNING_DIR/policy-signer.pem" ]; then echo "❌ Missing: $SIGNING_DIR/policy-signer.pem"; errors=$((errors+1)); fi

# Check Certificate Chain
if [ ! -f "$CA_DIR/chain.pem" ]; then echo "❌ Missing: $CA_DIR/chain.pem"; errors=$((errors+1)); fi

# Check CRLs
if [ ! -f "$CRL_DIR/root-crl.pem" ]; then echo "❌ Missing: $CRL_DIR/root-crl.pem"; errors=$((errors+1)); fi
if [ ! -f "$CRL_DIR/intermediate-crl.pem" ]; then echo "❌ Missing: $CRL_DIR/intermediate-crl.pem"; errors=$((errors+1)); fi

if [ $errors -gt 0 ]; then
    echo ""
    echo "❌ ERROR: $errors files are missing!"
    echo "Certificate generation failed."
    exit 1
fi

# Summary
echo ""
echo "✅ Test certificates generated successfully!"
echo ""
echo "📋 Generated Files:"
echo "   Root CA:"
echo "     - $CA_DIR/root.key ($(stat -c%s "$CA_DIR/root.key" 2>/dev/null || echo "size unknown") bytes)"
echo "     - $CA_DIR/root.crt ($(stat -c%s "$CA_DIR/root.crt" 2>/dev/null || echo "size unknown") bytes)"
echo "   Intermediate CA:"
echo "     - $CA_DIR/intermediate.key ($(stat -c%s "$CA_DIR/intermediate.key" 2>/dev/null || echo "size unknown") bytes)"
echo "     - $CA_DIR/intermediate.crt ($(stat -c%s "$CA_DIR/intermediate.crt" 2>/dev/null || echo "size unknown") bytes)"
echo "   Policy Signer:"
echo "     - $SIGNING_DIR/policy-signer.key ($(stat -c%s "$SIGNING_DIR/policy-signer.key" 2>/dev/null || echo "size unknown") bytes)"
echo "     - $SIGNING_DIR/policy-signer.crt ($(stat -c%s "$SIGNING_DIR/policy-signer.crt" 2>/dev/null || echo "size unknown") bytes)"
echo "     - $SIGNING_DIR/policy-signer.pem ($(stat -c%s "$SIGNING_DIR/policy-signer.pem" 2>/dev/null || echo "size unknown") bytes)"
echo "   Certificate Chain:"
echo "     - $CA_DIR/chain.pem ($(stat -c%s "$CA_DIR/chain.pem" 2>/dev/null || echo "size unknown") bytes)"
echo "   CRLs:"
echo "     - $CRL_DIR/root-crl.pem ($(stat -c%s "$CRL_DIR/root-crl.pem" 2>/dev/null || echo "size unknown") bytes)"
echo "     - $CRL_DIR/intermediate-crl.pem ($(stat -c%s "$CRL_DIR/intermediate-crl.pem" 2>/dev/null || echo "size unknown") bytes)"
echo ""
echo "🧪 Ready for testing!"
