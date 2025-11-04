# Phase 3 Implementation Guide - PKI & Revocation

**Duration:** 3 weeks (December 9-27, 2025)  
**Effort:** 33 working days  
**Status:** 🚧 Ready for Implementation  
**Compliance Improvement:** +20% ADatP-5663 (88% → 91%) + **100% ACP-240** ✨

---

## OVERVIEW

Phase 3 delivers critical security infrastructure: enterprise PKI integration, CRL-based certificate revocation, and cross-realm identity lifecycle management. This phase completes **ACP-240 compliance** and advances **ADatP-5663** to 91%.

### Prerequisites

- ✅ Phase 1 Complete (metadata signing, ACR/LoA, SAML IdP)
- ✅ Phase 2 Complete (metadata management, LDAP, delegation)
- ⚠️ **Enterprise PKI Access** (coordinate with PKI team - 2-3 week lead time)
- ✅ Java Development Kit 11+ (for Keycloak SPI development)

### Success Criteria

- [ ] All 6 tasks completed and tested
- [ ] Enterprise PKI certificates deployed
- [ ] CRL checking operational
- [ ] Cross-realm revocation working
- [ ] **ACP-240: 100% compliance** ✨
- [ ] **ADatP-5663: 91% compliance**
- [ ] All CI/CD pipelines passing
- [ ] Phase 3 demo delivered to stakeholders

---

## TASK 3.1: ENTERPRISE PKI INTEGRATION

**Owner:** DevOps Engineer + Security Architect  
**Effort:** 10 days  
**Priority:** Critical  
**ADatP-5663:** §3.7 (PKI Trust Establishment)

### Objective

Replace self-signed certificates with enterprise PKI-issued certificates for all DIVE V3 services (Keycloak, Backend, KAS, Frontend).

### Prerequisites

- [ ] Enterprise PKI access approved
- [ ] Certificate Signing Requests (CSRs) prepared
- [ ] Root CA and Intermediate CA certificates obtained

### Implementation

**File:** `scripts/generate-enterprise-csrs.sh`

```bash
#!/bin/bash
# NATO Compliance: ADatP-5663 §3.7 - Enterprise PKI Integration
# Phase 3, Task 3.1 - Generate Certificate Signing Requests

set -euo pipefail

echo "=== Generating Enterprise PKI Certificate Signing Requests ==="
echo "ADatP-5663 §3.7 - PKI Trust Establishment"
echo ""

# Configuration
ORG="DIVE V3 Coalition"
ORG_UNIT="Identity and Access Management"
COUNTRY="US"
STATE="Virginia"
LOCALITY="Arlington"

# Certificate subjects
declare -A SERVICES=(
  ["keycloak"]="keycloak.dive-v3.mil"
  ["backend"]="api.dive-v3.mil"
  ["kas"]="kas.dive-v3.mil"
  ["frontend"]="app.dive-v3.mil"
)

CSR_DIR="certs/enterprise-pki/csrs"
KEY_DIR="certs/enterprise-pki/private"

mkdir -p "$CSR_DIR" "$KEY_DIR"
chmod 700 "$KEY_DIR"  # Restrict private key directory

for service in "${!SERVICES[@]}"; do
  CN="${SERVICES[$service]}"
  KEY_FILE="$KEY_DIR/${service}.key"
  CSR_FILE="$CSR_DIR/${service}.csr"
  
  echo "Generating CSR for $service ($CN)..."
  
  # Generate private key (RSA 4096-bit for high security)
  openssl genrsa -out "$KEY_FILE" 4096
  chmod 600 "$KEY_FILE"
  
  # Generate CSR
  openssl req -new -key "$KEY_FILE" -out "$CSR_FILE" -subj \
    "/C=$COUNTRY/ST=$STATE/L=$LOCALITY/O=$ORG/OU=$ORG_UNIT/CN=$CN"
  
  # Add Subject Alternative Names (SAN)
  cat > "${CSR_FILE}.conf" <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req

[req_distinguished_name]

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = $CN
DNS.2 = localhost
DNS.3 = ${service}.dive-v3.local
EOF
  
  # Regenerate CSR with SANs
  openssl req -new -key "$KEY_FILE" -out "$CSR_FILE" \
    -config "${CSR_FILE}.conf" \
    -subj "/C=$COUNTRY/ST=$STATE/L=$LOCALITY/O=$ORG/OU=$ORG_UNIT/CN=$CN"
  
  echo "✅ CSR generated: $CSR_FILE"
done

echo ""
echo "=== CSR Generation Complete ==="
echo "Next steps:"
echo "1. Submit CSRs to enterprise PKI team:"
for service in "${!SERVICES[@]}"; do
  echo "   - $CSR_DIR/${service}.csr (${SERVICES[$service]})"
done
echo "2. Obtain signed certificates from PKI team"
echo "3. Place certificates in certs/enterprise-pki/certs/"
echo "4. Run: ./scripts/deploy-enterprise-certs.sh"
```

**File:** `scripts/deploy-enterprise-certs.sh`

```bash
#!/bin/bash
# NATO Compliance: ADatP-5663 §3.7 - Deploy Enterprise Certificates
# Phase 3, Task 3.1

set -euo pipefail

echo "=== Deploying Enterprise PKI Certificates ==="

CERT_DIR="certs/enterprise-pki/certs"
KEY_DIR="certs/enterprise-pki/private"
CHAIN_DIR="certs/enterprise-pki/chain"

# Verify all certificates present
SERVICES=("keycloak" "backend" "kas" "frontend")

for service in "${SERVICES[@]}"; do
  CERT="$CERT_DIR/${service}.crt"
  KEY="$KEY_DIR/${service}.key"
  
  if [ ! -f "$CERT" ]; then
    echo "❌ Missing certificate: $CERT"
    exit 1
  fi
  
  if [ ! -f "$KEY" ]; then
    echo "❌ Missing private key: $KEY"
    exit 1
  fi
  
  # Verify certificate matches private key
  CERT_MODULUS=$(openssl x509 -noout -modulus -in "$CERT" | openssl md5)
  KEY_MODULUS=$(openssl rsa -noout -modulus -in "$KEY" | openssl md5)
  
  if [ "$CERT_MODULUS" != "$KEY_MODULUS" ]; then
    echo "❌ Certificate/key mismatch for $service"
    exit 1
  fi
  
  echo "✅ $service: Certificate and key validated"
done

# Deploy to services
echo ""
echo "Deploying certificates to services..."

# 1. Keycloak
cp "$CERT_DIR/keycloak.crt" keycloak/certs/
cp "$KEY_DIR/keycloak.key" keycloak/certs/
cp "$CHAIN_DIR/root-ca.crt" keycloak/certs/
cp "$CHAIN_DIR/intermediate-ca.crt" keycloak/certs/

# Create Java Keystore for Keycloak
openssl pkcs12 -export \
  -in "$CERT_DIR/keycloak.crt" \
  -inkey "$KEY_DIR/keycloak.key" \
  -out keycloak/certs/keycloak.p12 \
  -name keycloak \
  -passout pass:changeit

keytool -importkeystore \
  -srckeystore keycloak/certs/keycloak.p12 \
  -srcstoretype PKCS12 \
  -srcstorepass changeit \
  -destkeystore keycloak/certs/keycloak.jks \
  -deststorepass changeit

echo "✅ Keycloak certificates deployed"

# 2. Backend
cp "$CERT_DIR/backend.crt" backend/certs/
cp "$KEY_DIR/backend.key" backend/certs/
cp "$CHAIN_DIR/root-ca.crt" backend/certs/
cp "$CHAIN_DIR/intermediate-ca.crt" backend/certs/

echo "✅ Backend certificates deployed"

# 3. KAS
cp "$CERT_DIR/kas.crt" kas/certs/
cp "$KEY_DIR/kas.key" kas/certs/
cp "$CHAIN_DIR/root-ca.crt" kas/certs/

echo "✅ KAS certificates deployed"

# 4. Frontend (if serving over HTTPS)
cp "$CERT_DIR/frontend.crt" frontend/certs/
cp "$KEY_DIR/frontend.key" frontend/certs/

echo "✅ Frontend certificates deployed"

# 5. Update environment variables
echo ""
echo "Updating .env.local with certificate paths..."

cat >> .env.local <<EOF

# Enterprise PKI Certificates (Phase 3, Task 3.1)
KC_HTTPS_CERTIFICATE_FILE=/opt/keycloak/certs/keycloak.crt
KC_HTTPS_CERTIFICATE_KEY_FILE=/opt/keycloak/certs/keycloak.key
BACKEND_TLS_CERT=/app/certs/backend.crt
BACKEND_TLS_KEY=/app/certs/backend.key
KAS_TLS_CERT=/app/certs/kas.crt
KAS_TLS_KEY=/app/certs/kas.key
ROOT_CA_CERT=/app/certs/root-ca.crt
EOF

echo "✅ Environment variables updated"

# 6. Restart services
echo ""
echo "Restarting services with enterprise certificates..."
docker-compose restart keycloak backend kas

echo ""
echo "✅ Enterprise PKI deployment complete!"
echo ""
echo "Verification:"
echo "1. Test Keycloak HTTPS: curl --cacert $CHAIN_DIR/root-ca.crt https://keycloak.dive-v3.mil:8443"
echo "2. Test Backend HTTPS: curl --cacert $CHAIN_DIR/root-ca.crt https://api.dive-v3.mil:4000/health"
echo "3. Verify certificate chain: openssl s_client -connect keycloak.dive-v3.mil:8443 -showcerts"
```

**File:** `terraform/modules/pki-trust/truststore.tf`

```hcl
# NATO Compliance: ADatP-5663 §3.7 - PKI Truststore Configuration
# Phase 3, Task 3.1

terraform {
  required_providers {
    keycloak = {
      source  = "mrparkers/keycloak"
      version = "~> 4.0"
    }
  }
}

# Import Root CA certificate into Keycloak truststore
# Note: Keycloak 26.4 uses Java truststore at JAVA_HOME/lib/security/cacerts
# This is managed via Dockerfile and environment variables

# Generate truststore from Root CA and Intermediate CA
resource "null_resource" "generate_truststore" {
  triggers = {
    root_ca        = filemd5("${path.module}/../../certs/enterprise-pki/chain/root-ca.crt")
    intermediate_ca = filemd5("${path.module}/../../certs/enterprise-pki/chain/intermediate-ca.crt")
  }

  provisioner "local-exec" {
    command = <<EOT
      # Create truststore with Root CA
      keytool -import -trustcacerts -noprompt \
        -alias dive-root-ca \
        -file ${path.module}/../../certs/enterprise-pki/chain/root-ca.crt \
        -keystore ${path.module}/../../keycloak/certs/truststore.jks \
        -storepass changeit

      # Add Intermediate CA
      keytool -import -trustcacerts -noprompt \
        -alias dive-intermediate-ca \
        -file ${path.module}/../../certs/enterprise-pki/chain/intermediate-ca.crt \
        -keystore ${path.module}/../../keycloak/certs/truststore.jks \
        -storepass changeit
    EOT
  }
}

# Output truststore information
output "truststore_path" {
  description = "Path to Keycloak truststore with enterprise PKI CAs"
  value       = "${path.module}/../../keycloak/certs/truststore.jks"
}

output "pki_trust_status" {
  description = "PKI trust establishment status"
  value = {
    root_ca        = "DIVE Root CA (imported)"
    intermediate_ca = "DIVE Intermediate CA (imported)"
    truststore     = "keycloak/certs/truststore.jks"
    compliance     = "ADatP-5663 §3.7 - PKI Trust Establishment"
  }
}
```

### Testing

```bash
# 1. Generate CSRs
./scripts/generate-enterprise-csrs.sh

# Expected output:
# ✅ CSR generated: certs/enterprise-pki/csrs/keycloak.csr
# ✅ CSR generated: certs/enterprise-pki/csrs/backend.csr
# ✅ CSR generated: certs/enterprise-pki/csrs/kas.csr
# ✅ CSR generated: certs/enterprise-pki/csrs/frontend.csr

# 2. Submit CSRs to enterprise PKI team
# (Manual coordination - 2-3 week lead time)

# 3. Obtain signed certificates
# Place in certs/enterprise-pki/certs/

# 4. Deploy certificates
./scripts/deploy-enterprise-certs.sh

# 5. Test HTTPS connectivity
curl --cacert certs/enterprise-pki/chain/root-ca.crt \
  https://keycloak.dive-v3.mil:8443/realms/dive-v3-broker/.well-known/openid-configuration

# Expected: OIDC discovery metadata returned (200 OK)

# 6. Verify certificate chain
openssl s_client -connect keycloak.dive-v3.mil:8443 -showcerts | grep -A 1 "Subject:"

# Expected:
# Subject: CN=keycloak.dive-v3.mil
# Subject: CN=DIVE Intermediate CA
# Subject: CN=DIVE Root CA
```

### Acceptance Criteria

- [ ] CSRs generated for all 4 services
- [ ] Enterprise PKI certificates obtained (signed by enterprise CA)
- [ ] Private keys generated and secured (4096-bit RSA)
- [ ] Certificates deployed to all services
- [ ] Truststore created with Root CA and Intermediate CA
- [ ] HTTPS connectivity verified (all services)
- [ ] Certificate chain validation successful
- [ ] Self-signed certificates removed
- [ ] No wildcard certificates used (ADatP-5663 prohibition)
- [ ] Separate signing and encryption certificates (Task 3.3)

---

## TASK 3.2: CRL CHECKING CONFIGURATION

**Owner:** DevOps Engineer  
**Effort:** 4 days  
**Priority:** High  
**ADatP-5663:** §3.7 (Certificate Revocation)

### Objective

Configure Certificate Revocation List (CRL) checking for X.509 certificate validation.

### Implementation

**File:** `scripts/setup-crl-distribution.sh`

```bash
#!/bin/bash
# NATO Compliance: ADatP-5663 §3.7 - CRL Distribution Point
# Phase 3, Task 3.2

set -euo pipefail

echo "=== Setting up CRL Distribution Point ==="

CRL_DIR="/var/www/crl"
CRL_HTTP_PORT="8090"

# 1. Create CRL directory
mkdir -p "$CRL_DIR"
chmod 755 "$CRL_DIR"

# 2. Generate initial CRL (empty - no revoked certificates yet)
cat > generate-crl.sh <<'EOF'
#!/bin/bash
# Generate CRL from CA

CA_KEY="certs/enterprise-pki/ca/ca.key"
CA_CERT="certs/enterprise-pki/ca/ca.crt"
CRL_FILE="/var/www/crl/dive-root-ca.crl"

openssl ca \
  -gencrl \
  -keyfile "$CA_KEY" \
  -cert "$CA_CERT" \
  -out "$CRL_FILE" \
  -config openssl.cnf

# Convert to DER format (alternative format)
openssl crl -in "$CRL_FILE" -outform DER -out "${CRL_FILE%.crl}.der"

echo "✅ CRL generated: $CRL_FILE"
EOF

chmod +x generate-crl.sh
./generate-crl.sh

# 3. Start HTTP server for CRL distribution
cat > docker-compose.crl.yml <<EOF
version: '3.8'

services:
  crl-server:
    image: nginx:alpine
    container_name: dive-crl-server
    ports:
      - "${CRL_HTTP_PORT}:80"
    volumes:
      - /var/www/crl:/usr/share/nginx/html:ro
    restart: always
    networks:
      - dive-network

networks:
  dive-network:
    external: true
EOF

docker-compose -f docker-compose.crl.yml up -d

echo "✅ CRL distribution point started: http://localhost:${CRL_HTTP_PORT}/dive-root-ca.crl"

# 4. Schedule daily CRL generation
cat > /etc/cron.daily/generate-dive-crl <<'EOF'
#!/bin/bash
cd /path/to/dive-v3
./generate-crl.sh
EOF

chmod +x /etc/cron.daily/generate-dive-crl

echo "✅ Daily CRL generation scheduled"
```

**File:** `terraform/modules/pki-trust/crl-checking.tf`

```hcl
# NATO Compliance: ADatP-5663 §3.7 - CRL Checking Configuration
# Phase 3, Task 3.2

terraform {
  required_providers {
    keycloak = {
      source  = "mrparkers/keycloak"
      version = "~> 4.0"
    }
  }
}

# Configure X.509 authentication with CRL checking
# Update existing X509 authenticator configurations

resource "keycloak_authentication_execution_config" "x509_with_crl" {
  realm_id     = "dive-v3-broker"
  execution_id = keycloak_authentication_execution.x509.id
  alias        = "X509 with CRL Checking"

  config = {
    # Certificate validation
    x509_cert_auth_enabled           = "true"
    
    # CRL Checking (ADatP-5663 §3.7)
    crl_checking_enabled             = "true"
    crl_relative_path                = "/certs/dive-root-ca.crl"
    
    # CRL Distribution Point URL
    enable_crldp                     = "true"  # Use CRL Distribution Point from certificate
    
    # Fallback CRL URL (if certificate doesn't specify CRLDP)
    crl_uri                          = "http://localhost:8090/dive-root-ca.crl"
    
    # OCSP (if available)
    enable_ocsp                      = "false"  # Phase 3 doesn't include OCSP
    
    # Certificate Policy Validation
    certificate_policy_validation    = "true"
    certificate_policy_mode          = "ALL"
    
    # Key Usage Validation (ADatP-5663: Separate signing & encryption)
    key_usage_validation             = "true"
    extended_key_usage_validation    = "true"
    
    # User mapping
    user_mapper_selection            = "USERNAME_OR_EMAIL"
    username_mapper_selection        = "CN"
  }
}

# Output CRL configuration
output "crl_checking_status" {
  description = "CRL checking configuration"
  value = {
    enabled          = "true"
    crl_url          = "http://localhost:8090/dive-root-ca.crl"
    distribution_point = "Enabled (read from certificate)"
    ocsp_enabled     = "false (Phase 3 scope)"
    compliance       = "ADatP-5663 §3.7 - Certificate Revocation"
  }
}
```

### Testing

```bash
# 1. Setup CRL distribution
sudo ./scripts/setup-crl-distribution.sh

# 2. Verify CRL accessible
curl http://localhost:8090/dive-root-ca.crl -o test.crl
openssl crl -in test.crl -text -noout

# Expected: CRL with 0 revoked certificates

# 3. Test certificate revocation
# Revoke test certificate
openssl ca -revoke certs/test-cert.crt -config openssl.cnf

# Regenerate CRL
./generate-crl.sh

# Verify revoked certificate in CRL
openssl crl -in /var/www/crl/dive-root-ca.crl -text -noout | grep "Serial Number"

# 4. Apply Terraform CRL configuration
cd terraform/modules/pki-trust
terraform apply

# 5. Test X.509 authentication with CRL checking
# Attempt authentication with revoked certificate
# Expected: Authentication denied (certificate revoked)

# 6. Test with valid certificate
# Expected: Authentication successful
```

### Acceptance Criteria

- [ ] CRL distribution point deployed (HTTP server on port 8090)
- [ ] Initial CRL generated (PEM and DER formats)
- [ ] Daily CRL generation scheduled (cron job)
- [ ] Keycloak X.509 authenticator configured with CRL checking
- [ ] CRL Distribution Point (CRLDP) extension in certificates
- [ ] Test: Revoked certificate rejected
- [ ] Test: Valid certificate accepted
- [ ] CRL accessible: `http://localhost:8090/dive-root-ca.crl`

---

## TASK 3.3: SEPARATE SIGNING & ENCRYPTION KEYS

**Owner:** Security Architect  
**Effort:** 3 days  
**Priority:** High  
**ADatP-5663:** §3.7 (Separate Keys Requirement)

### Objective

Configure separate signing and encryption keys for each Keycloak realm (ADatP-5663 requirement).

### Implementation

**File:** `terraform/modules/pki-trust/realm-keys.tf`

```hcl
# NATO Compliance: ADatP-5663 §3.7 - Separate Signing & Encryption Keys
# Phase 3, Task 3.3

terraform {
  required_providers {
    keycloak = {
      source  = "mrparkers/keycloak"
      version = "~> 4.0"
    }
  }
}

variable "realms" {
  description = "List of realms requiring separate signing/encryption keys"
  type        = list(string)
  default = [
    "dive-v3-broker",
    "dive-v3-usa",
    "dive-v3-fra",
    "dive-v3-can",
    "dive-v3-deu",
    "dive-v3-gbr",
    "dive-v3-ita",
    "dive-v3-esp",
    "dive-v3-pol",
    "dive-v3-nld",
    "dive-v3-industry"
  ]
}

# Generate separate signing and encryption keys for each realm

# RSA Signing Key (SIG usage)
resource "keycloak_realm_keystore_rsa_generated" "signing_keys" {
  for_each = toset(var.realms)
  
  name      = "${each.key}-signing-key"
  realm_id  = each.key
  
  # Key specifications
  algorithm    = "RS256"
  key_size     = 4096  # High security (ADatP-5663)
  priority     = 100   # Highest priority
  enabled      = true
  active       = true
  
  # Key usage: Signature only
  # Keycloak automatically sets use="sig" in JWKS
}

# RSA Encryption Key (ENC usage) - For SAML
resource "keycloak_realm_keystore_rsa_generated" "encryption_keys" {
  for_each = toset(var.realms)
  
  name      = "${each.key}-encryption-key"
  realm_id  = each.key
  
  # Key specifications
  algorithm    = "RSA-OAEP"  # Encryption algorithm
  key_size     = 4096
  priority     = 90          # Lower than signing key
  enabled      = true
  active       = true
  
  # Key usage: Encryption only
  # Used for SAML assertion encryption
}

# Output key configuration
output "realm_keys" {
  description = "Separate signing and encryption keys per realm"
  value = {
    for realm in var.realms : realm => {
      signing_key    = "${realm}-signing-key (RS256, 4096-bit)"
      encryption_key = "${realm}-encryption-key (RSA-OAEP, 4096-bit)"
      compliance     = "ADatP-5663 §3.7 - Separate Signing & Encryption Keys"
    }
  }
}
```

**File:** `scripts/verify-separate-keys.sh`

```bash
#!/bin/bash
# Verify separate signing and encryption keys

REALM="${1:-dive-v3-broker}"

echo "=== Verifying Separate Keys for Realm: $REALM ==="

# Get JWKS (contains signing keys)
JWKS=$(curl -s "http://localhost:8081/realms/$REALM/protocol/openid-connect/certs")

echo "Signing Keys:"
echo "$JWKS" | jq -r '.keys[] | select(.use=="sig") | "\(.kid): \(.alg) \(.kty)"'

echo ""
echo "Encryption Keys:"
echo "$JWKS" | jq -r '.keys[] | select(.use=="enc") | "\(.kid): \(.alg) \(.kty)"'

# Verify at least 1 signing and 1 encryption key
SIG_COUNT=$(echo "$JWKS" | jq '[.keys[] | select(.use=="sig")] | length')
ENC_COUNT=$(echo "$JWKS" | jq '[.keys[] | select(.use=="enc")] | length')

if [ "$SIG_COUNT" -ge 1 ] && [ "$ENC_COUNT" -ge 1 ]; then
  echo ""
  echo "✅ Separate signing ($SIG_COUNT) and encryption ($ENC_COUNT) keys verified"
  echo "ADatP-5663 §3.7 compliant"
else
  echo ""
  echo "❌ Missing keys: signing=$SIG_COUNT, encryption=$ENC_COUNT"
  exit 1
fi
```

### Testing

```bash
# 1. Apply Terraform configuration
cd terraform/modules/pki-trust
terraform apply

# 2. Verify keys generated in Keycloak
# Admin Console → Realm Settings → Keys
# Expected: Separate signing (SIG) and encryption (ENC) keys

# 3. Test signing key usage
# Login to realm → Obtain ID token → Verify signature uses signing key
jwt_header=$(echo $ID_TOKEN | cut -d. -f1 | base64 -d)
echo $jwt_header | jq .kid
# Should match signing key ID

# 4. Test encryption key (SAML assertion encryption)
# For Spain SAML IdP, enable "Want Assertions Encrypted"
# Expected: SAML response encrypted with realm encryption key

# 5. Run verification script for all realms
for realm in dive-v3-broker dive-v3-usa dive-v3-fra; do
  ./scripts/verify-separate-keys.sh $realm
done

# Expected: ✅ for all realms
```

### Acceptance Criteria

- [ ] Separate signing keys generated for all 11 realms (RS256, 4096-bit)
- [ ] Separate encryption keys generated for all 11 realms (RSA-OAEP, 4096-bit)
- [ ] JWKS contains both `use=sig` and `use=enc` keys
- [ ] ID tokens signed with signing key (verify via `kid`)
- [ ] SAML assertions encrypted with encryption key (if enabled)
- [ ] Verification script confirms separate keys
- [ ] Documentation: Key usage policies documented

---

## TASK 3.4: EVENT LISTENER SPI (LIFECYCLE)

**Owner:** Backend Developer (Java)  
**Effort:** 7 days  
**Priority:** High  
**ADatP-5663:** §4.7 (Identity Lifecycle Management)

### Objective

Develop custom Keycloak Event Listener SPI to broadcast identity lifecycle events (user deletion, logout) to federated realms.

### Implementation

**File:** `keycloak/providers/dive-identity-lifecycle-spi/pom.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>mil.dive.keycloak</groupId>
    <artifactId>dive-identity-lifecycle-spi</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>

    <name>DIVE Identity Lifecycle Event Listener</name>
    <description>NATO ADatP-5663 §4.7 - Identity Lifecycle Management</description>

    <properties>
        <maven.compiler.source>11</maven.compiler.source>
        <maven.compiler.target>11</maven.compiler.target>
        <keycloak.version>26.0.0</keycloak.version>
    </properties>

    <dependencies>
        <!-- Keycloak Server SPI -->
        <dependency>
            <groupId>org.keycloak</groupId>
            <artifactId>keycloak-server-spi</artifactId>
            <version>${keycloak.version}</version>
            <scope>provided</scope>
        </dependency>

        <dependency>
            <groupId>org.keycloak</groupId>
            <artifactId>keycloak-server-spi-private</artifactId>
            <version>${keycloak.version}</version>
            <scope>provided</scope>
        </dependency>

        <dependency>
            <groupId>org.keycloak</groupId>
            <artifactId>keycloak-services</artifactId>
            <version>${keycloak.version}</version>
            <scope>provided</scope>
        </dependency>

        <!-- Redis Client (for event publishing) -->
        <dependency>
            <groupId>redis.clients</groupId>
            <artifactId>jedis</artifactId>
            <version>5.0.0</version>
        </dependency>

        <!-- Logging -->
        <dependency>
            <groupId>org.jboss.logging</groupId>
            <artifactId>jboss-logging</artifactId>
            <version>3.5.0.Final</version>
            <scope>provided</scope>
        </dependency>
    </dependencies>

    <build>
        <finalName>dive-identity-lifecycle-spi</finalName>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.11.0</version>
            </plugin>
        </plugins>
    </build>
</project>
```

**File:** `keycloak/providers/dive-identity-lifecycle-spi/src/main/java/mil/dive/keycloak/DiveIdentityLifecycleListener.java`

```java
package mil.dive.keycloak;

import org.jboss.logging.Logger;
import org.keycloak.events.Event;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.EventType;
import org.keycloak.events.admin.AdminEvent;
import org.keycloak.events.admin.OperationType;
import org.keycloak.events.admin.ResourceType;
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;

/**
 * NATO Compliance: ADatP-5663 §4.7 - Identity Lifecycle Event Listener
 * 
 * Broadcasts identity lifecycle events to federated realms:
 * - User deletion
 * - User logout
 * - Credential revocation
 * 
 * Events published to Redis Pub/Sub for consumption by revocation service.
 */
public class DiveIdentityLifecycleListener implements EventListenerProvider {
    
    private static final Logger log = Logger.getLogger(DiveIdentityLifecycleListener.class);
    private final JedisPool jedisPool;
    private final String redisChannel = "dive:identity-lifecycle";

    public DiveIdentityLifecycleListener(JedisPool jedisPool) {
        this.jedisPool = jedisPool;
    }

    @Override
    public void onEvent(Event event) {
        // Handle user events (logout, etc.)
        if (event.getType() == EventType.LOGOUT) {
            publishLifecycleEvent("LOGOUT", event.getUserId(), event.getRealmId());
        }
    }

    @Override
    public void onEvent(AdminEvent adminEvent, boolean includeRepresentation) {
        // Handle admin events (user deletion, credential revocation)
        
        if (adminEvent.getResourceType() == ResourceType.USER) {
            if (adminEvent.getOperationType() == OperationType.DELETE) {
                publishLifecycleEvent("USER_DELETED", extractUserId(adminEvent), adminEvent.getRealmId());
            }
        }
        
        if (adminEvent.getResourceType() == ResourceType.USER_CREDENTIALS) {
            if (adminEvent.getOperationType() == OperationType.DELETE) {
                publishLifecycleEvent("CREDENTIAL_REVOKED", extractUserId(adminEvent), adminEvent.getRealmId());
            }
        }
    }

    /**
     * Publishes lifecycle event to Redis Pub/Sub
     */
    private void publishLifecycleEvent(String eventType, String userId, String realmId) {
        try (Jedis jedis = jedisPool.getResource()) {
            String message = String.format(
                "{\"eventType\":\"%s\",\"userId\":\"%s\",\"realmId\":\"%s\",\"timestamp\":\"%s\"}",
                eventType,
                userId,
                realmId,
                System.currentTimeMillis()
            );
            
            jedis.publish(redisChannel, message);
            
            log.infof(
                "✅ Identity lifecycle event published: %s for user %s in realm %s",
                eventType, userId, realmId
            );
        } catch (Exception e) {
            log.errorf(
                "❌ Failed to publish lifecycle event: %s",
                e.getMessage()
            );
            // Don't throw - event listener failures shouldn't break authentication
        }
    }

    /**
     * Extracts user ID from admin event resource path
     */
    private String extractUserId(AdminEvent adminEvent) {
        String resourcePath = adminEvent.getResourcePath();
        // Path format: "users/USER_ID" or "users/USER_ID/credentials/CRED_ID"
        String[] parts = resourcePath.split("/");
        if (parts.length >= 2) {
            return parts[1];
        }
        return "unknown";
    }

    @Override
    public void close() {
        // Cleanup if needed
    }
}
```

**File:** `keycloak/providers/dive-identity-lifecycle-spi/src/main/java/mil/dive/keycloak/DiveIdentityLifecycleListenerFactory.java`

```java
package mil.dive.keycloak;

import org.keycloak.Config;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.EventListenerProviderFactory;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.JedisPoolConfig;

public class DiveIdentityLifecycleListenerFactory implements EventListenerProviderFactory {
    
    private JedisPool jedisPool;

    @Override
    public EventListenerProvider create(KeycloakSession session) {
        return new DiveIdentityLifecycleListener(jedisPool);
    }

    @Override
    public void init(Config.Scope config) {
        String redisHost = config.get("redisHost", "localhost");
        int redisPort = config.getInt("redisPort", 6379);
        
        JedisPoolConfig poolConfig = new JedisPoolConfig();
        poolConfig.setMaxTotal(10);
        poolConfig.setMaxIdle(5);
        poolConfig.setMinIdle(1);
        
        this.jedisPool = new JedisPool(poolConfig, redisHost, redisPort);
    }

    @Override
    public void postInit(KeycloakSessionFactory factory) {
        // No post-initialization needed
    }

    @Override
    public void close() {
        if (jedisPool != null) {
            jedisPool.close();
        }
    }

    @Override
    public String getId() {
        return "dive-identity-lifecycle";
    }
}
```

**File:** `keycloak/providers/dive-identity-lifecycle-spi/src/main/resources/META-INF/services/org.keycloak.events.EventListenerProviderFactory`

```
mil.dive.keycloak.DiveIdentityLifecycleListenerFactory
```

**File:** `scripts/build-and-deploy-spi.sh`

```bash
#!/bin/bash
# Build and deploy Keycloak Event Listener SPI

set -euo pipefail

SPI_DIR="keycloak/providers/dive-identity-lifecycle-spi"
JAR_NAME="dive-identity-lifecycle-spi.jar"

echo "=== Building DIVE Identity Lifecycle SPI ==="

cd "$SPI_DIR"

# Build with Maven
mvn clean package

# Copy JAR to Keycloak providers directory
cp "target/$JAR_NAME" "../$JAR_NAME"

echo "✅ SPI built and deployed: keycloak/providers/$JAR_NAME"

# Restart Keycloak to load new provider
echo ""
echo "Restarting Keycloak to load SPI..."
docker-compose restart keycloak

echo ""
echo "✅ Keycloak restarted. Verify SPI loaded:"
echo "   1. Check logs: docker logs dive-keycloak | grep 'dive-identity-lifecycle'"
echo "   2. Admin Console → Events → Config → Event Listeners"
echo "   3. Should see: dive-identity-lifecycle"
```

### Testing

```bash
# 1. Build SPI
./scripts/build-and-deploy-spi.sh

# 2. Enable event listener in Keycloak
# Admin Console → Events → Config → Event Listeners
# Add: dive-identity-lifecycle

# Or via Terraform:
# terraform apply -target=keycloak_event_listener.dive_lifecycle

# 3. Test user deletion event
# Delete test user → Should publish to Redis
redis-cli
> SUBSCRIBE dive:identity-lifecycle
# Delete user in Keycloak
# Expected: Message received with USER_DELETED event

# 4. Test logout event
# Logout user → Should publish to Redis
# Expected: Message with LOGOUT event

# 5. Verify events in backend
# Backend should subscribe to Redis channel and process events
```

### Acceptance Criteria

- [ ] Event Listener SPI compiled (Maven build successful)
- [ ] JAR deployed to `keycloak/providers/`
- [ ] SPI loaded by Keycloak (check logs)
- [ ] Event listener enabled in all 11 realms
- [ ] User deletion triggers `USER_DELETED` event
- [ ] User logout triggers `LOGOUT` event
- [ ] Credential revocation triggers `CREDENTIAL_REVOKED` event
- [ ] Events published to Redis Pub/Sub channel
- [ ] Events contain: eventType, userId, realmId, timestamp

---

## TASK 3.5: REVOCATION SERVICE

**Owner:** Backend Developer  
**Effort:** 5 days  
**Priority:** High  
**ADatP-5663:** §4.7 (Revocation Broadcasting)

### Objective

Implement backend revocation service that subscribes to lifecycle events and maintains federation-wide revocation list.

### Implementation

**File:** `backend/src/services/revocation.service.ts`

```typescript
/**
 * NATO Compliance: ADatP-5663 §4.7 - Revocation Service
 * Phase 3, Task 3.5
 * 
 * Subscribes to identity lifecycle events and maintains federation-wide
 * revocation list. Broadcasts revocations to all federated realms.
 */

import Redis from 'ioredis';
import { getDb } from '../config/mongodb';
import { logger } from '../utils/logger';
import axios from 'axios';

interface RevocationEvent {
  eventType: 'USER_DELETED' | 'LOGOUT' | 'CREDENTIAL_REVOKED';
  userId: string;
  realmId: string;
  timestamp: number;
}

interface Revocation {
  uniqueID: string;
  revokedAt: Date;
  reason: string;
  issuingRealm: string;
  eventType: string;
}

export class RevocationService {
  private redis: Redis;
  private subscriber: Redis;
  private readonly channel = 'dive:identity-lifecycle';
  private readonly collection = 'revocations';

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  /**
   * Starts subscribing to lifecycle events
   */
  async startListening(): Promise<void> {
    logger.info(`Subscribing to identity lifecycle events: ${this.channel}`);

    this.subscriber.subscribe(this.channel, (err, count) => {
      if (err) {
        logger.error(`Failed to subscribe to ${this.channel}: ${err}`);
        return;
      }
      logger.info(`Subscribed to ${count} channel(s)`);
    });

    this.subscriber.on('message', async (channel, message) => {
      if (channel === this.channel) {
        await this.handleLifecycleEvent(message);
      }
    });

    logger.info('✅ Revocation service listening for lifecycle events');
  }

  /**
   * Handles incoming lifecycle event
   */
  private async handleLifecycleEvent(message: string): Promise<void> {
    try {
      const event: RevocationEvent = JSON.parse(message);
      logger.info(
        `Lifecycle event received: ${event.eventType} for user ${event.userId} in ${event.realmId}`
      );

      // Process based on event type
      switch (event.eventType) {
        case 'USER_DELETED':
          await this.handleUserDeleted(event);
          break;
        case 'LOGOUT':
          await this.handleLogout(event);
          break;
        case 'CREDENTIAL_REVOKED':
          await this.handleCredentialRevoked(event);
          break;
        default:
          logger.warn(`Unknown event type: ${event.eventType}`);
      }
    } catch (error) {
      logger.error(`Error handling lifecycle event: ${error}`);
    }
  }

  /**
   * Handles user deletion (permanent revocation)
   */
  private async handleUserDeleted(event: RevocationEvent): Promise<void> {
    logger.warn(`⚠️ User deleted: ${event.userId} in ${event.realmId}`);

    // Get user's uniqueID before deletion
    const uniqueID = await this.getUserUniqueID(event.userId, event.realmId);

    if (!uniqueID) {
      logger.error(`Cannot revoke: uniqueID not found for user ${event.userId}`);
      return;
    }

    // Add to revocation list
    await this.addRevocation({
      uniqueID,
      revokedAt: new Date(event.timestamp),
      reason: 'User deleted from identity provider',
      issuingRealm: event.realmId,
      eventType: event.eventType,
    });

    // Broadcast to federated realms (Task 3.6)
    await this.broadcastRevocation(uniqueID, event.realmId);
  }

  /**
   * Handles user logout (temporary invalidation)
   */
  private async handleLogout(event: RevocationEvent): Promise<void> {
    logger.info(`User logout: ${event.userId} in ${event.realmId}`);
    
    // Logout is temporary - just log for audit
    // Don't add to permanent revocation list
    // Token revocation handled by Keycloak's built-in revocation endpoint
  }

  /**
   * Handles credential revocation
   */
  private async handleCredentialRevoked(event: RevocationEvent): Promise<void> {
    logger.warn(`Credential revoked: ${event.userId} in ${event.realmId}`);

    const uniqueID = await this.getUserUniqueID(event.userId, event.realmId);

    if (uniqueID) {
      await this.addRevocation({
        uniqueID,
        revokedAt: new Date(event.timestamp),
        reason: 'User credentials revoked',
        issuingRealm: event.realmId,
        eventType: event.eventType,
      });
    }
  }

  /**
   * Adds revocation to MongoDB revocation list
   */
  async addRevocation(revocation: Revocation): Promise<void> {
    try {
      const db = await getDb();
      const collection = db.collection(this.collection);

      await collection.insertOne({
        ...revocation,
        createdAt: new Date(),
      });

      logger.warn(`➕ Revocation added: ${revocation.uniqueID}`);

      // Also add to Redis cache for fast lookup
      const cacheKey = `revoked:${revocation.uniqueID}`;
      await this.redis.set(cacheKey, '1', 'EX', 86400 * 90); // 90 days (ACP-240)
    } catch (error) {
      logger.error(`Failed to add revocation: ${error}`);
    }
  }

  /**
   * Checks if user is revoked
   */
  async isRevoked(uniqueID: string): Promise<boolean> {
    try {
      // Check Redis cache first (fast)
      const cached = await this.redis.get(`revoked:${uniqueID}`);
      if (cached) {
        return true;
      }

      // Check MongoDB (slower, but authoritative)
      const db = await getDb();
      const collection = db.collection(this.collection);

      const revocation = await collection.findOne({ uniqueID });
      return revocation !== null;
    } catch (error) {
      logger.error(`Revocation check error: ${error}`);
      // Fail-secure: Deny access if revocation check fails
      return true;
    }
  }

  /**
   * Gets user's uniqueID from Keycloak
   */
  private async getUserUniqueID(
    userId: string,
    realmId: string
  ): Promise<string | null> {
    try {
      // Call Keycloak Admin REST API
      const adminToken = await this.getAdminToken();
      const response = await axios.get(
        `${process.env.KEYCLOAK_URL}/admin/realms/${realmId}/users/${userId}`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      const user = response.data;
      return user.attributes?.uniqueID?.[0] || null;
    } catch (error) {
      logger.error(`Failed to get uniqueID for user ${userId}: ${error}`);
      return null;
    }
  }

  /**
   * Gets Keycloak admin token
   */
  private async getAdminToken(): Promise<string> {
    const response = await axios.post(
      `${process.env.KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'admin-cli',
        client_secret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || '',
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    return response.data.access_token;
  }

  /**
   * Broadcasts revocation to federated realms (Task 3.6)
   */
  private async broadcastRevocation(
    uniqueID: string,
    issuingRealm: string
  ): Promise<void> {
    // Implemented in Task 3.6
    logger.info(`Broadcasting revocation: ${uniqueID} from ${issuingRealm}`);
  }

  /**
   * Stops listening
   */
  async stop(): Promise<void> {
    await this.subscriber.unsubscribe(this.channel);
    await this.subscriber.quit();
    await this.redis.quit();
    logger.info('Revocation service stopped');
  }
}

export const revocationService = new RevocationService();

// Start listening on server startup
export async function startRevocationService(): Promise<void> {
  await revocationService.startListening();
}
```

**File:** `backend/src/middleware/revocation-check.middleware.ts`

```typescript
/**
 * Revocation Check Middleware
 * 
 * Checks if user is revoked before authorizing access.
 * ADatP-5663 §4.7: IdPs SHALL broadcast revocation
 */

import { Request, Response, NextFunction } from 'express';
import { revocationService } from '../services/revocation.service';
import { logger } from '../utils/logger';

export async function checkRevocation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = (req as any).user;

  if (!user || !user.uniqueID) {
    return next();
  }

  try {
    const isRevoked = await revocationService.isRevoked(user.uniqueID);

    if (isRevoked) {
      logger.warn(`Access denied: User ${user.uniqueID} is revoked`);
      res.status(403).json({
        error: 'Forbidden',
        message: 'User credentials have been revoked',
        code: 'USER_REVOKED',
      });
      return;
    }

    next();
  } catch (error) {
    logger.error(`Revocation check error: ${error}`);
    // Fail-secure: Deny access if revocation check fails
    res.status(503).json({
      error: 'Service Unavailable',
      message: 'Revocation check failed',
    });
  }
}
```

### Testing

```bash
# 1. Build and deploy Event Listener SPI
./scripts/build-and-deploy-spi.sh

# 2. Start revocation service in backend
cd backend
npm run dev

# Expected log: "✅ Revocation service listening for lifecycle events"

# 3. Test user deletion revocation
# Delete test user in Keycloak Admin Console
redis-cli
> SUBSCRIBE dive:identity-lifecycle
# Expected: {"eventType":"USER_DELETED","userId":"...","realmId":"dive-v3-usa"}

# 4. Verify revocation added to MongoDB
mongo
> use dive_v3
> db.revocations.find()
# Expected: Revocation entry with uniqueID

# 5. Test revocation check
# Attempt to access resource with revoked user's token
# Expected: 403 Forbidden - User revoked

# 6. Test revocation cache
redis-cli
> GET revoked:user-uniqueID
# Expected: "1"
```

### Acceptance Criteria

- [ ] Event Listener SPI deployed and loaded
- [ ] Revocation service subscribed to Redis channel
- [ ] User deletion triggers revocation event
- [ ] Revocation added to MongoDB `revocations` collection
- [ ] Revocation cached in Redis (90-day TTL per ACP-240)
- [ ] Revocation check middleware integrated
- [ ] Revoked users denied access (403 Forbidden)
- [ ] Federation-wide revocation list maintained

---

## TASK 3.6: CROSS-REALM REVOCATION NOTIFICATION

**Owner:** Backend Developer  
**Effort:** 4 days  
**Priority:** High  
**ADatP-5663:** §4.7 (Revocation Broadcasting)

### Objective

Implement cross-realm revocation notification using Keycloak Admin REST API to invalidate sessions across all federated realms.

### Implementation

**File:** `backend/src/services/cross-realm-revocation.service.ts`

```typescript
/**
 * NATO Compliance: ADatP-5663 §4.7 - Cross-Realm Revocation Broadcasting
 * Phase 3, Task 3.6
 */

import axios from 'axios';
import { logger } from '../utils/logger';

interface RealmEndpoint {
  realmId: string;
  adminUrl: string;
}

export class CrossRealmRevocationService {
  private readonly keycloakUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';
  
  // All realms in federation
  private readonly realms: RealmEndpoint[] = [
    { realmId: 'dive-v3-broker', adminUrl: `${this.keycloakUrl}/admin/realms/dive-v3-broker` },
    { realmId: 'dive-v3-usa', adminUrl: `${this.keycloakUrl}/admin/realms/dive-v3-usa` },
    { realmId: 'dive-v3-fra', adminUrl: `${this.keycloakUrl}/admin/realms/dive-v3-fra` },
    { realmId: 'dive-v3-can', adminUrl: `${this.keycloakUrl}/admin/realms/dive-v3-can` },
    { realmId: 'dive-v3-deu', adminUrl: `${this.keycloakUrl}/admin/realms/dive-v3-deu` },
    { realmId: 'dive-v3-gbr', adminUrl: `${this.keycloakUrl}/admin/realms/dive-v3-gbr` },
    { realmId: 'dive-v3-ita', adminUrl: `${this.keycloakUrl}/admin/realms/dive-v3-ita` },
    { realmId: 'dive-v3-esp', adminUrl: `${this.keycloakUrl}/admin/realms/dive-v3-esp` },
    { realmId: 'dive-v3-pol', adminUrl: `${this.keycloakUrl}/admin/realms/dive-v3-pol` },
    { realmId: 'dive-v3-nld', adminUrl: `${this.keycloakUrl}/admin/realms/dive-v3-nld` },
    { realmId: 'dive-v3-industry', adminUrl: `${this.keycloakUrl}/admin/realms/dive-v3-industry` },
  ];

  /**
   * Broadcasts revocation to all federated realms
   * 
   * ADatP-5663 §4.7: IdPs SHALL broadcast revocation upon departure
   */
  async broadcastRevocation(
    uniqueID: string,
    issuingRealm: string,
    reason: string
  ): Promise<{
    total: number;
    success: number;
    failed: number;
    failures: string[];
  }> {
    logger.warn(
      `🔔 Broadcasting revocation: ${uniqueID} from ${issuingRealm} (reason: ${reason})`
    );

    const results = await Promise.allSettled(
      this.realms.map((realm) =>
        this.revokeInRealm(realm, uniqueID, issuingRealm)
      )
    );

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    const summary = {
      total: this.realms.length,
      success: successes.length,
      failed: failures.length,
      failures: failures.map((f) =>
        f.status === 'rejected' ? f.reason : 'Unknown error'
      ),
    };

    logger.info(
      `Revocation broadcast complete: ${summary.success}/${summary.total} realms notified`
    );

    if (summary.failed > 0) {
      logger.error(
        `⚠️ Failed to notify ${summary.failed} realms: ${summary.failures.join(', ')}`
      );
    }

    return summary;
  }

  /**
   * Revokes user in single realm
   */
  private async revokeInRealm(
    realm: RealmEndpoint,
    uniqueID: string,
    issuingRealm: string
  ): Promise<void> {
    try {
      // Skip issuing realm (already revoked)
      if (realm.realmId === issuingRealm) {
        return;
      }

      // Get admin token
      const adminToken = await this.getAdminToken();

      // Find user by uniqueID attribute
      const users = await this.findUserByUniqueID(
        realm,
        uniqueID,
        adminToken
      );

      if (users.length === 0) {
        logger.debug(`User ${uniqueID} not found in ${realm.realmId}`);
        return;
      }

      const user = users[0];

      // Logout all sessions for user
      await axios.post(
        `${realm.adminUrl}/users/${user.id}/logout`,
        {},
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      logger.info(`✅ User ${uniqueID} logged out from ${realm.realmId}`);

      // Set not-before policy to invalidate all existing tokens
      const notBefore = Math.floor(Date.now() / 1000);
      await axios.put(
        `${realm.adminUrl}/users/${user.id}`,
        {
          ...user,
          notBefore,
        },
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );

      logger.info(
        `✅ Not-before policy set for ${uniqueID} in ${realm.realmId}`
      );
    } catch (error) {
      logger.error(
        `Failed to revoke ${uniqueID} in ${realm.realmId}: ${error}`
      );
      throw error; // Propagate for retry
    }
  }

  /**
   * Finds user by uniqueID attribute in realm
   */
  private async findUserByUniqueID(
    realm: RealmEndpoint,
    uniqueID: string,
    adminToken: string
  ): Promise<any[]> {
    const response = await axios.get(`${realm.adminUrl}/users`, {
      params: {
        q: `uniqueID:${uniqueID}`,
        max: 1,
      },
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    return response.data;
  }

  /**
   * Gets Keycloak admin token with retry
   */
  private async getAdminToken(): Promise<string> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await axios.post(
          `${this.keycloakUrl}/realms/master/protocol/openid-connect/token`,
          new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'admin-cli',
            client_secret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || '',
          }),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 5000,
          }
        );

        return response.data.access_token;
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Admin token request failed (attempt ${i + 1}/${maxRetries})`);
        
        // Exponential backoff
        if (i < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
      }
    }

    throw new Error(`Failed to get admin token after ${maxRetries} attempts: ${lastError}`);
  }

  /**
   * Stops revocation service
   */
  async stop(): Promise<void> {
    await this.redis.quit();
    await this.subscriber.quit();
    logger.info('Cross-realm revocation service stopped');
  }
}

export const crossRealmRevocationService = new CrossRealmRevocationService();
```

**File:** `scripts/test-cross-realm-revocation.sh`

```bash
#!/bin/bash
# Test cross-realm revocation broadcasting

set -euo pipefail

echo "=== Testing Cross-Realm Revocation Broadcasting ==="

# 1. Create test user in USA realm
echo "Creating test user..."
TEST_USER_ID=$(curl -X POST "http://localhost:8081/admin/realms/dive-v3-usa/users" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test-revocation-user",
    "email": "test@revocation.mil",
    "enabled": true,
    "attributes": {
      "uniqueID": ["test-revocation-001"],
      "clearance": ["SECRET"],
      "countryOfAffiliation": ["USA"]
    }
  }' | jq -r .id)

echo "Test user created: $TEST_USER_ID"

# 2. Login test user (create sessions in multiple realms via broker)
echo "Creating user sessions..."
# (Manual: Login via frontend to create federated sessions)

# 3. Delete user (trigger revocation broadcast)
echo "Deleting user (should trigger revocation broadcast)..."
curl -X DELETE "http://localhost:8081/admin/realms/dive-v3-usa/users/$TEST_USER_ID" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"

# 4. Wait for revocation propagation
sleep 5

# 5. Check revocation in MongoDB
echo "Checking revocation list..."
mongo dive_v3 --eval 'db.revocations.find({uniqueID: "test-revocation-001"})'

# Expected: Revocation entry found

# 6. Check revocation in other realms (sessions should be invalidated)
echo "Verifying sessions invalidated in all realms..."
for realm in dive-v3-broker dive-v3-fra dive-v3-can; do
  curl -s "http://localhost:8081/admin/realms/$realm/users?q=uniqueID:test-revocation-001" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq .
done

# Expected: User sessions logged out in all realms

echo ""
echo "✅ Cross-realm revocation test complete"
```

### Testing

```bash
# 1. Start revocation service
cd backend
npm run dev

# Expected log: "✅ Revocation service listening for lifecycle events"

# 2. Run cross-realm revocation test
./scripts/test-cross-realm-revocation.sh

# 3. Verify revocation in all 11 realms
# Expected: User logged out from all realms

# 4. Test revocation check middleware
# Attempt API call with revoked user token
curl -H "Authorization: Bearer ${REVOKED_USER_TOKEN}" \
  http://localhost:4000/api/resources

# Expected: 403 Forbidden - User revoked

# 5. Verify revocation persistence (90 days per ACP-240)
redis-cli
> TTL revoked:test-revocation-001
# Expected: ~7776000 seconds (90 days)
```

### Acceptance Criteria

- [ ] Cross-realm revocation service implemented
- [ ] Revocation broadcasts to all 11 realms
- [ ] User sessions invalidated across realms (logout API)
- [ ] Not-before policies set per realm
- [ ] Retry logic with exponential backoff (3 attempts)
- [ ] Revocation check middleware integrated
- [ ] Revoked users denied access (403 Forbidden)
- [ ] Test: User deleted in USA realm → Revoked in all realms
- [ ] Broadcast success rate >95% (allow for transient failures)

---

## PHASE 3 SUMMARY

**Total Effort:** 33 days  
**Total Tasks:** 6  
**Total Deliverables:** 20+ files created

### Deliverables Checklist

**Task 3.1: Enterprise PKI**
- [ ] `scripts/generate-enterprise-csrs.sh`
- [ ] `scripts/deploy-enterprise-certs.sh`
- [ ] `terraform/modules/pki-trust/truststore.tf`
- [ ] Enterprise certificates for all 4 services
- [ ] Java keystores (Keycloak)

**Task 3.2: CRL Checking**
- [ ] `scripts/setup-crl-distribution.sh`
- [ ] `terraform/modules/pki-trust/crl-checking.tf`
- [ ] CRL distribution HTTP server
- [ ] Daily CRL generation (cron job)

**Task 3.3: Separate Keys**
- [ ] `terraform/modules/pki-trust/realm-keys.tf`
- [ ] `scripts/verify-separate-keys.sh`
- [ ] Signing keys (RS256) for all 11 realms
- [ ] Encryption keys (RSA-OAEP) for all 11 realms

**Task 3.4: Event Listener SPI**
- [ ] `keycloak/providers/dive-identity-lifecycle-spi/` (Java project)
- [ ] `scripts/build-and-deploy-spi.sh`
- [ ] Event listener JAR deployed

**Task 3.5: Revocation Service**
- [ ] `backend/src/services/revocation.service.ts`
- [ ] `backend/src/middleware/revocation-check.middleware.ts`
- [ ] MongoDB `revocations` collection
- [ ] Redis revocation cache

**Task 3.6: Cross-Realm Notification**
- [ ] `backend/src/services/cross-realm-revocation.service.ts`
- [ ] `scripts/test-cross-realm-revocation.sh`
- [ ] Integration with all 11 realms

### Compliance Impact

**Before Phase 3:**
- ACP-240: 90%
- ADatP-5663: 88%

**After Phase 3:**
- **ACP-240: 100%** ✅ **COMPLETE!**
- **ADatP-5663: 91%** (+3%)

**ACP-240 Requirements Completed:**
- ✅ PKI trust establishment (§8: Strong AuthN)
- ✅ Certificate revocation (§8: Best practices)
- ✅ Identity lifecycle management (§2: Federated Identity)
- ✅ Cross-domain revocation broadcasting (§3: ABAC with fresh attributes)

### Next Steps

1. **Week 1 (Dec 9-13):** Tasks 3.1-3.2 (PKI integration, CRL)
2. **Week 2 (Dec 16-20):** Task 3.3 (separate keys), Task 3.4 (Event SPI)
3. **Week 3 (Dec 23-27):** Tasks 3.5-3.6 (revocation service, broadcasting)
4. **Phase 3 Demo:** December 27, 2025
5. **Holiday Break:** December 28-31, 2025
6. **Phase 4 Kickoff:** December 30, 2025 (or January 2, 2026)

---

**Last Updated:** November 4, 2025  
**Status:** Ready for Implementation  
**Critical Path:** Enterprise PKI access (2-3 week lead time - START NOW!)

