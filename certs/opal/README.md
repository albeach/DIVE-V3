# DIVE V3 - OPAL TLS Certificates
## Phase 7: Production Hardening

This directory contains TLS certificates for secure OPAL deployment.

## Certificate Structure

```
certs/opal/
├── ca.crt              # Root CA certificate
├── ca.key              # Root CA private key (DO NOT COMMIT!)
├── server.crt          # OPAL Server certificate
├── server.key          # OPAL Server private key
├── client.crt          # OPAL Client certificate
├── client.key          # OPAL Client private key
├── jwt-signing-key.pem     # JWT signing private key
├── jwt-signing-key.pub.pem # JWT signing public key
└── bundle-signing.pub.pem  # Bundle verification public key
```

## Generation Script

Run the following to generate all certificates:

```bash
# Generate certificates
./scripts/generate-opal-certs.sh

# Or manually:
cd certs/opal

# 1. Generate CA
openssl genrsa -out ca.key 4096
openssl req -new -x509 -days 3650 -key ca.key -out ca.crt \
  -subj "/C=US/ST=Virginia/O=DIVE V3/CN=DIVE V3 CA"

# 2. Generate Server Certificate
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr \
  -subj "/C=US/ST=Virginia/O=DIVE V3/CN=opal-server"
openssl x509 -req -days 365 -in server.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out server.crt \
  -extfile <(printf "subjectAltName=DNS:opal-server,DNS:opal-server-tls,DNS:localhost")

# 3. Generate Client Certificate
openssl genrsa -out client.key 2048
openssl req -new -key client.key -out client.csr \
  -subj "/C=US/ST=Virginia/O=DIVE V3/CN=opal-client"
openssl x509 -req -days 365 -in client.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out client.crt

# 4. Generate JWT Signing Key
openssl genrsa -out jwt-signing-key.pem 4096
openssl rsa -in jwt-signing-key.pem -pubout -out jwt-signing-key.pub.pem
```

## Security Notes

1. **Never commit private keys to Git!** Use `.gitignore`:
   ```
   certs/opal/*.key
   certs/opal/*.pem
   !certs/opal/*.pub.pem
   ```

2. **Store private keys in GCP Secret Manager:**
   ```bash
   gcloud secrets create dive-v3-opal-server-key --project=dive25
   gcloud secrets versions add dive-v3-opal-server-key --data-file=server.key
   ```

3. **Certificate rotation:** Rotate certificates annually or immediately if compromised.

## Environment Variables

Set these in your deployment:

```bash
# OPAL Server
OPAL_SERVER_SSL_ENABLED=true
OPAL_SERVER_SSL_CERT_PATH=/certs/server.crt
OPAL_SERVER_SSL_KEY_PATH=/certs/server.key
OPAL_SERVER_SSL_CA_PATH=/certs/ca.crt

# OPAL Client
OPAL_CLIENT_SSL_ENABLED=true
OPAL_CLIENT_SSL_CERT_PATH=/certs/client.crt
OPAL_CLIENT_SSL_KEY_PATH=/certs/client.key
OPAL_CLIENT_SSL_CA_PATH=/certs/ca.crt
```

## Testing TLS

```bash
# Test server certificate
openssl s_client -connect localhost:7002 -CAfile ca.crt

# Verify certificate
openssl verify -CAfile ca.crt server.crt
openssl verify -CAfile ca.crt client.crt
```

## JWT Token Generation

For OPAL client authentication:

```bash
# Generate JWT token using the signing key
# (Use backend/src/scripts/generate-opal-jwt.ts)
npx ts-node --esm backend/src/scripts/generate-opal-jwt.ts
```

## Related Documentation

- [OPAL TLS Configuration](https://docs.opal.ac/getting-started/configuration/tls)
- [Phase 7 Implementation](../docs/PHASE-7-IMPLEMENTATION-PROMPT.md)







