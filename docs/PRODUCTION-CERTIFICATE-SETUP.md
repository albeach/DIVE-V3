# Production Certificate Setup Guide

This guide provides step-by-step instructions for setting up production-grade PKI certificates for external SAML and OIDC identity providers.

## Overview

Production deployments require trusted certificates from a Certificate Authority (CA) instead of self-signed certificates. This guide covers:

1. Certificate requirements and specifications
2. Certificate generation and acquisition
3. Certificate installation and configuration
4. Certificate rotation and renewal
5. Troubleshooting common issues

## Certificate Requirements

### SAML Certificates (Spain IdP)

**Required**:
- X.509 certificate (PEM format)
- RSA or EC private key (minimum 2048-bit RSA or 256-bit EC)
- Certificate chain (intermediate + root CA)

**Specifications**:
- Key Usage: Digital Signature, Key Encipherment
- Extended Key Usage: Server Authentication
- Subject Alternative Names: DNS names for SAML endpoints
- Validity: 1-2 years maximum (recommend 90 days for automated renewal)

### OIDC Certificates (USA IdP)

**Required**:
- X.509 certificate for HTTPS endpoints
- Private key (minimum 2048-bit RSA or 256-bit EC)
- Full certificate chain

**Specifications**:
- Key Usage: Digital Signature, Key Encipherment
- Extended Key Usage: Server Authentication, Client Authentication
- Subject Alternative Names: All OIDC endpoint URLs
- Validity: 90 days (automated renewal recommended)

## Option 1: Let's Encrypt (Recommended for Internet-Facing)

### Prerequisites

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot

# Or use Docker
docker pull certbot/certbot
```

### Generate Certificate for Spain SAML

```bash
# Using standalone mode (requires port 80/443)
sudo certbot certonly --standalone \
  -d spain-idp.example.com \
  -m admin@example.com \
  --agree-tos \
  --non-interactive

# Certificate saved to:
# /etc/letsencrypt/live/spain-idp.example.com/fullchain.pem
# /etc/letsencrypt/live/spain-idp.example.com/privkey.pem
```

### Generate Certificate for USA OIDC

```bash
sudo certbot certonly --standalone \
  -d usa-idp.example.com \
  -m admin@example.com \
  --agree-tos \
  --non-interactive

# Certificate saved to:
# /etc/letsencrypt/live/usa-idp.example.com/fullchain.pem
# /etc/letsencrypt/live/usa-idp.example.com/privkey.pem
```

### Automated Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Set up automatic renewal (cron)
sudo crontab -e

# Add line (runs daily at 2am):
0 2 * * * certbot renew --quiet --deploy-hook "docker-compose restart spain-saml usa-oidc"
```

## Option 2: Commercial CA (DigiCert, GlobalSign, etc.)

### Step 1: Generate Certificate Signing Request (CSR)

```bash
# Spain SAML CSR
openssl req -new -newkey rsa:4096 -nodes \
  -keyout spain-idp-production.key \
  -out spain-idp-production.csr \
  -subj "/C=ES/ST=Madrid/L=Madrid/O=Spanish Defense Ministry/CN=spain-idp.mde.es" \
  -addext "subjectAltName=DNS:spain-idp.mde.es,DNS:saml.mde.es"

# USA OIDC CSR
openssl req -new -newkey rsa:4096 -nodes \
  -keyout usa-idp-production.key \
  -out usa-idp-production.csr \
  -subj "/C=US/ST=Virginia/L=Arlington/O=U.S. Department of Defense/CN=login.mil" \
  -addext "subjectAltName=DNS:login.mil,DNS:oidc.mil"
```

### Step 2: Submit CSR to CA

1. Login to CA portal (DigiCert, GlobalSign, etc.)
2. Choose certificate type (OV or EV recommended)
3. Upload CSR file
4. Complete domain validation
5. Download signed certificate

### Step 3: Validate Certificate

```bash
# Verify certificate matches private key
openssl x509 -noout -modulus -in spain-idp-production.crt | openssl md5
openssl rsa -noout -modulus -in spain-idp-production.key | openssl md5
# Hashes should match

# Verify certificate chain
openssl verify -CAfile ca-bundle.crt spain-idp-production.crt
```

## Option 3: Internal PKI (For Private Networks)

### Step 1: Create Internal CA

```bash
# Generate CA private key
openssl genrsa -aes256 -out dive-ca.key 4096

# Generate CA certificate (10 years)
openssl req -new -x509 -days 3650 -key dive-ca.key -out dive-ca.crt \
  -subj "/C=US/O=DIVE V3/CN=DIVE Internal CA"
```

### Step 2: Generate Service Certificates

```bash
# Spain SAML certificate
openssl genrsa -out spain-idp.key 4096

openssl req -new -key spain-idp.key -out spain-idp.csr \
  -subj "/C=ES/O=Spanish Defense Ministry/CN=spain-saml" \
  -addext "subjectAltName=DNS:spain-saml,DNS:spain-saml.dive-external-idps"

openssl x509 -req -in spain-idp.csr -CA dive-ca.crt -CAkey dive-ca.key \
  -CAcreateserial -out spain-idp.crt -days 365 \
  -extensions v3_req -extfile <(cat <<EOF
[v3_req]
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:spain-saml,DNS:spain-saml.dive-external-idps
EOF
)

# USA OIDC certificate (similar process)
```

## Installation and Configuration

### Spain SAML (SimpleSAMLphp)

```bash
# Copy certificates to SimpleSAMLphp directory
cp spain-idp-production.crt external-idps/spain-saml/cert/server.crt
cp spain-idp-production.key external-idps/spain-saml/cert/server.pem
cp ca-bundle.crt external-idps/spain-saml/cert/ca-bundle.crt

# Set proper permissions
chmod 644 external-idps/spain-saml/cert/server.crt
chmod 600 external-idps/spain-saml/cert/server.pem

# Update SimpleSAMLphp config
cat > external-idps/spain-saml/config/config.php <<EOF
\$config['metadata.sign.certificate'] = 'server.crt';
\$config['metadata.sign.privatekey'] = 'server.pem';
EOF

# Restart SimpleSAMLphp
docker-compose restart spain-saml
```

### USA OIDC (Keycloak)

```bash
# Copy certificates
mkdir -p external-idps/usa-oidc/certs
cp usa-idp-production.crt external-idps/usa-oidc/certs/tls.crt
cp usa-idp-production.key external-idps/usa-oidc/certs/tls.key
cp ca-bundle.crt external-idps/usa-oidc/certs/ca-bundle.crt

# Set permissions
chmod 644 external-idps/usa-oidc/certs/tls.crt
chmod 600 external-idps/usa-oidc/certs/tls.key

# Update docker-compose.yml
cat >> external-idps/docker-compose.yml <<EOF
  usa-oidc:
    environment:
      KC_HTTPS_CERTIFICATE_FILE: /opt/keycloak/certs/tls.crt
      KC_HTTPS_CERTIFICATE_KEY_FILE: /opt/keycloak/certs/tls.key
      KC_HTTPS_PORT: 8443
    volumes:
      - ./usa-oidc/certs:/opt/keycloak/certs:ro
    ports:
      - "8443:8443"
EOF

# Restart Keycloak
docker-compose restart usa-oidc
```

### DIVE Keycloak Broker

```bash
# Update DIVE IdP configuration with production certificate
# This is done via Terraform or Admin API

module "spain_saml_idp" {
  source = "./modules/external-idp-saml"
  
  idp_certificate = file("${path.module}/certs/spain-idp-production.crt")
  # ... other configuration
}
```

## Certificate Rotation

### Automated Rotation (Let's Encrypt)

```bash
# Create renewal hook script
cat > /etc/letsencrypt/renewal-hooks/deploy/restart-idps.sh <<'EOF'
#!/bin/bash
cd /path/to/DIVE-V3/external-idps
docker-compose restart spain-saml usa-oidc
EOF

chmod +x /etc/letsencrypt/renewal-hooks/deploy/restart-idps.sh
```

### Manual Rotation

```bash
# 1. Generate new certificate (follow steps above)

# 2. Deploy new certificate (zero-downtime)
cp new-cert.crt external-idps/spain-saml/cert/server.crt
cp new-cert.key external-idps/spain-saml/cert/server.pem

# 3. Reload configuration (graceful restart)
docker-compose exec spain-saml sv reload apache2

# 4. Verify new certificate
openssl s_client -connect spain-saml:8443 -showcerts </dev/null | \
  openssl x509 -noout -dates
```

## Security Best Practices

### 1. Key Storage

```bash
# Encrypt private keys at rest
openssl rsa -aes256 -in server.key -out server.key.encrypted

# Store in secrets vault (HashiCorp Vault, AWS Secrets Manager)
vault kv put secret/dive/spain-saml \
  certificate=@server.crt \
  private_key=@server.key
```

### 2. Certificate Monitoring

```bash
# Monitor expiration dates
#!/bin/bash
CERT_FILE="external-idps/spain-saml/cert/server.crt"
EXPIRY_DATE=$(openssl x509 -enddate -noout -in "$CERT_FILE" | cut -d= -f2)
DAYS_UNTIL_EXPIRY=$(( ($(date -d "$EXPIRY_DATE" +%s) - $(date +%s)) / 86400 ))

if [ $DAYS_UNTIL_EXPIRY -lt 30 ]; then
  echo "WARNING: Certificate expires in $DAYS_UNTIL_EXPIRY days!"
  # Send alert
fi
```

### 3. Certificate Revocation

```bash
# Check revocation status
openssl ocsp -issuer ca.crt -cert server.crt \
  -url http://ocsp.ca.example.com \
  -CAfile ca-bundle.crt
```

## Troubleshooting

### Certificate Chain Issues

**Error**: `certificate verify failed: unable to get local issuer certificate`

**Solution**:
```bash
# Verify chain is complete
openssl s_client -connect spain-saml:8443 -showcerts

# Add intermediate certificates
cat server.crt intermediate.crt > fullchain.crt
```

### SAN Missing

**Error**: `certificate doesn't match requested hostname`

**Solution**:
```bash
# Check SANs
openssl x509 -text -noout -in server.crt | grep "Subject Alternative Name" -A 1

# Regenerate with correct SANs
```

### Permission Denied

**Error**: `Permission denied` when reading private key

**Solution**:
```bash
chmod 600 server.key
chown root:root server.key
```

## Certificate Validation Checklist

Before deploying to production:

- [ ] Certificate is from trusted CA or internal CA is trusted
- [ ] Private key is secured (encrypted, restricted permissions)
- [ ] Certificate chain is complete
- [ ] SANs include all necessary DNS names
- [ ] Certificate is valid for at least 30 days
- [ ] Key size meets minimum requirements (2048-bit RSA or 256-bit EC)
- [ ] OCSP/CRL endpoints are accessible
- [ ] Renewal process is automated
- [ ] Monitoring alerts are configured
- [ ] Backup of certificates and keys exists

## Automation Scripts

### Terraform Certificate Management

```hcl
# terraform/certificates.tf
resource "tls_private_key" "spain_saml" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "tls_cert_request" "spain_saml" {
  private_key_pem = tls_private_key.spain_saml.private_key_pem

  subject {
    common_name  = "spain-idp.mde.es"
    organization = "Spanish Defense Ministry"
    country      = "ES"
  }

  dns_names = [
    "spain-idp.mde.es",
    "saml.mde.es",
  ]
}

# Use ACME provider for Let's Encrypt
resource "acme_certificate" "spain_saml" {
  account_key_pem = acme_registration.reg.account_key_pem
  common_name     = "spain-idp.mde.es"

  dns_challenge {
    provider = "route53"
  }
}
```

## References

- Let's Encrypt Documentation: https://letsencrypt.org/docs/
- OpenSSL Documentation: https://www.openssl.org/docs/
- SAML Metadata Signing: http://docs.oasis-open.org/security/saml/v2.0/
- OIDC Key Management: https://openid.net/specs/openid-connect-core-1_0.html#Signing


