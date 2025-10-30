# mTLS Production Requirement for KAS

**Status**: PILOT - mTLS NOT IMPLEMENTED (Documentation Only)  
**Production Requirement**: MANDATORY before production deployment

## Overview

The Key Access Service (KAS) must enforce mutual TLS (mTLS) in production to ensure:
1. Client authentication before key release
2. Encrypted communication channel
3. Protection against man-in-the-middle attacks

## Pilot Status

**Current Implementation**: HTTP without mTLS  
**Justification**: Pilot environment, local development only  
**Risk Assessment**: ACCEPTABLE FOR PILOT (not for production)

## Production Implementation

### Required Changes

1. **Server Configuration** (kas/src/server.ts)

```typescript
import https from 'https';
import fs from 'fs';

// Replace http server with https
const server = https.createServer({
  key: fs.readFileSync(process.env.KAS_TLS_KEY || '/certs/kas-key.pem'),
  cert: fs.readFileSync(process.env.KAS_TLS_CERT || '/certs/kas-cert.pem'),
  ca: fs.readFileSync(process.env.KAS_TLS_CA || '/certs/ca-cert.pem'),
  requestCert: true,         // Require client certificate
  rejectUnauthorized: true   // Reject invalid client certs
}, app);

server.listen(PORT);
```

2. **Client Certificate Validation**

```typescript
app.use((req, res, next) => {
  const clientCert = req.socket.getPeerCertificate();
  
  if (!clientCert || !clientCert.subject) {
    return res.status(401).json({
      error: 'Client certificate required',
      message: 'KAS requires valid client certificate for authentication'
    });
  }
  
  // Validate certificate attributes
  const clientDN = clientCert.subject.CN;
  logger.info('Client certificate validated', { clientDN });
  
  next();
});
```

3. **Certificate Management**

- **Certificate Authority**: Use organizational PKI
- **Client Certificates**: Issue per-service certificates
- **Renewal**: Automate certificate rotation (< 90 days validity)
- **Revocation**: Implement CRL or OCSP checking

### Docker Compose Configuration

```yaml
services:
  kas:
    image: dive-v3-kas
    ports:
      - "8443:8443"  # HTTPS port
    volumes:
      - ./certs/kas-key.pem:/certs/kas-key.pem:ro
      - ./certs/kas-cert.pem:/certs/kas-cert.pem:ro
      - ./certs/ca-cert.pem:/certs/ca-cert.pem:ro
    environment:
      - KAS_PORT=8443
      - KAS_TLS_KEY=/certs/kas-key.pem
      - KAS_TLS_CERT=/certs/kas-cert.pem
      - KAS_TLS_CA=/certs/ca-cert.pem
```

### Backend Client Configuration

```typescript
// backend/src/services/kas-client.ts
import https from 'https';
import axios from 'axios';
import fs from 'fs';

const kasClient = axios.create({
  baseURL: process.env.KAS_URL || 'https://localhost:8443',
  httpsAgent: new https.Agent({
    cert: fs.readFileSync(process.env.BACKEND_TLS_CERT),
    key: fs.readFileSync(process.env.BACKEND_TLS_KEY),
    ca: fs.readFileSync(process.env.BACKEND_TLS_CA),
    rejectUnauthorized: true
  })
});
```

## Certificate Generation (Development/Testing)

```bash
#!/bin/bash
# Generate self-signed certificates for testing

# CA certificate
openssl req -x509 -newkey rsa:4096 -days 365 -nodes \
  -keyout ca-key.pem -out ca-cert.pem \
  -subj "/CN=DIVE-V3-CA/O=DIVE-V3/C=US"

# KAS server certificate
openssl req -newkey rsa:4096 -nodes \
  -keyout kas-key.pem -out kas-csr.pem \
  -subj "/CN=dive-v3-kas/O=DIVE-V3/C=US"

openssl x509 -req -in kas-csr.pem -days 365 \
  -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial \
  -out kas-cert.pem

# Backend client certificate
openssl req -newkey rsa:4096 -nodes \
  -keyout backend-key.pem -out backend-csr.pem \
  -subj "/CN=dive-v3-backend/O=DIVE-V3/C=US"

openssl x509 -req -in backend-csr.pem -days 365 \
  -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial \
  -out backend-cert.pem

# Cleanup CSRs
rm kas-csr.pem backend-csr.pem
```

## Testing mTLS

```bash
# Test KAS with client certificate
curl --cert backend-cert.pem --key backend-key.pem \
     --cacert ca-cert.pem \
     https://localhost:8443/health

# Test without certificate (should fail)
curl https://localhost:8443/health
# Expected: SSL certificate problem
```

## Compliance Requirements

- **NIST SP 800-52**: TLS configuration guidelines
- **FIPS 140-2**: Cryptographic module requirements
- **ACP-240**: Mutual authentication for key access services

## Implementation Timeline

- **Phase 4 (Pilot)**: Documentation only ✅
- **Phase 5 (Pre-Production)**: Generate test certificates, implement mTLS
- **Phase 6 (Production)**: Integrate with organizational PKI

## References

- [Node.js HTTPS Documentation](https://nodejs.org/api/https.html)
- [NIST SP 800-52 Rev. 2](https://csrc.nist.gov/publications/detail/sp/800-52/rev-2/final)
- [STANAG 4778](https://nso.nato.int/nso/nsdd/listpromulg.html?_STANAG_4778)

---

**Phase 4 Status**: ✅ Documented (Implementation deferred to Phase 5)  
**Production Readiness**: ⚠️ BLOCKED until mTLS implemented

