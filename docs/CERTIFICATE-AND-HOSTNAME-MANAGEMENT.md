# DIVE V3 - Certificate & Hostname Management Guide

## Overview

DIVE V3 uses a dual-certificate architecture to support both local development and coalition federation:

1. **mkcert Certificates** - Self-signed development certificates for HTTPS
2. **DIVE Root CA Certificates** - Coalition-issued certificates for federation trust

This guide explains how to configure certificates and custom hostnames for both local and remote access.

---

## Certificate Architecture

### 1. mkcert Certificates (Development HTTPS)

**Purpose**: Enable HTTPS for local development and testing

**Used By**:
- Keycloak (web console and API endpoints)
- Backend API (HTTPS endpoints)
- Frontend (Next.js HTTPS server)
- KAS (Key Access Service)
- External IdPs (Spain SAML, USA OIDC)

**Location**: `certs/mkcert/` (master), distributed to each service's `certs/` directory

**Trust Model**: Local machine trusts mkcert CA after `mkcert -install`

### 2. DIVE Root CA Certificates (Federation Trust)

**Purpose**: Enable trust for coalition partner certificates

**Used By**:
- Keycloak (validating external IdP certificates)
- Backend API (validating coalition service certificates)
- Frontend (trusted certificate chains)
- KAS (policy-bound key distribution)

**Location**: `dive-certs/` (source), distributed to `<service>/certs/dive-root-cas/`

**Trust Model**: Application-scoped trust (not system-wide)

---

## Quick Start

### Option 1: localhost Only (Default)

```bash
# Generate mkcert certificates for all services
./scripts/setup-mkcert-for-all-services.sh

# Verify installation
./scripts/verify-mkcert-setup.sh

# Start services
docker-compose -f docker-compose.yml -f docker-compose.mkcert.yml up -d
```

### Option 2: Custom Hostname (Remote Access)

```bash
# Configure custom hostname
./scripts/configure-hostname.sh dive.example.com

# This will:
# 1. Generate certificates with custom hostname
# 2. Create docker-compose.hostname.yml override
# 3. Create .env.hostname with public URLs
# 4. Generate hosts file entries

# Update /etc/hosts (see etc-hosts-entry.txt)
sudo nano /etc/hosts

# Start with custom hostname
./start-with-hostname.sh
```

---

## Detailed Configuration

### mkcert Certificate Generation

The `setup-mkcert-for-all-services.sh` script:

1. **Checks mkcert installation**
   ```bash
   brew install mkcert  # macOS
   mkcert -install      # Install local CA
   ```

2. **Generates master certificate** with all hostnames:
   - localhost, 127.0.0.1, ::1
   - Docker service names: keycloak, backend, nextjs, kas, etc.
   - Custom hostname + wildcards (if specified)

3. **Distributes certificates** to all service directories:
   ```
   certs/mkcert/certificate.pem  → master certificate
   certs/mkcert/key.pem          → private key
   certs/mkcert/rootCA.pem       → CA certificate (for trust)
   ```

4. **Creates Docker Compose override** (`docker-compose.mkcert.yml`):
   - Mounts certificates to containers
   - Sets environment variables for HTTPS
   - Configures Node.js to trust CA

### Custom Hostname Configuration

The `configure-hostname.sh` script:

1. **Creates environment file** (`.env.hostname`):
   ```bash
   DIVE_HOSTNAME=dive.example.com
   NEXT_PUBLIC_KEYCLOAK_URL=https://dive.example.com:8443
   NEXT_PUBLIC_API_URL=https://dive.example.com:4000
   # ... etc
   ```

2. **Creates Docker Compose override** (`docker-compose.hostname.yml`):
   - Updates Keycloak KC_HOSTNAME
   - Updates public URLs for browser access
   - Maintains internal Docker network URLs

3. **Generates hosts file entries** (`etc-hosts-entry.txt`):
   ```
   <your-ip> dive.example.com
   <your-ip> keycloak.dive.example.com
   # ... etc
   ```

4. **Regenerates certificates** with new hostname included

---

## Service-Specific Configuration

### Keycloak

**Certificate Requirements**:
- mkcert certificate for HTTPS console/API
- DIVE Root CA truststore for external IdP validation

**Configuration** (docker-compose.yml):
```yaml
keycloak:
  environment:
    # mkcert HTTPS
    KC_HTTPS_CERTIFICATE_FILE: /opt/keycloak/certs/certificate.pem
    KC_HTTPS_CERTIFICATE_KEY_FILE: /opt/keycloak/certs/key.pem
    
    # Hostname for token issuer
    KC_HOSTNAME: localhost  # or custom hostname
    KC_HOSTNAME_STRICT: false
    
    # DIVE Root CA trust
    JAVA_OPTS: >-
      -Djavax.net.ssl.trustStore=/opt/keycloak/certs/dive-root-cas/dive-truststore.jks
      -Djavax.net.ssl.trustStorePassword=changeit
  
  volumes:
    - ./certs/mkcert:/opt/keycloak/certs:ro
    - ./keycloak/certs/dive-root-cas:/opt/keycloak/certs/dive-root-cas:ro
```

### Backend API (Node.js/Express)

**Certificate Requirements**:
- mkcert certificate for HTTPS endpoints
- DIVE Root CA for validating external services

**Configuration** (docker-compose.yml):
```yaml
backend:
  environment:
    # mkcert HTTPS
    HTTPS_ENABLED: "true"
    CERT_FILE: /opt/app/certs/certificate.pem
    KEY_FILE: /opt/app/certs/key.pem
    
    # Trust mkcert CA and DIVE Root CA
    NODE_EXTRA_CA_CERTS: /opt/app/certs/rootCA.pem
    NODE_TLS_REJECT_UNAUTHORIZED: "0"  # Development only
  
  volumes:
    - ./certs/mkcert:/opt/app/certs:ro
    - ./backend/certs/dive-root-cas:/app/certs/dive-root-cas:ro
```

**Code Changes** (backend/src/server.ts):
```typescript
import https from 'https';
import fs from 'fs';

if (process.env.HTTPS_ENABLED === 'true') {
  const options = {
    cert: fs.readFileSync(process.env.CERT_FILE!),
    key: fs.readFileSync(process.env.KEY_FILE!),
  };
  https.createServer(options, app).listen(PORT);
} else {
  app.listen(PORT);
}
```

### Frontend (Next.js)

**Certificate Requirements**:
- mkcert certificate for HTTPS development server
- DIVE Root CA for server-side API calls

**Configuration** (docker-compose.yml):
```yaml
nextjs:
  environment:
    # Public URLs (browser)
    NEXT_PUBLIC_KEYCLOAK_URL: https://localhost:8443  # or custom
    NEXT_PUBLIC_API_URL: https://localhost:4000
    
    # Internal URLs (server-side)
    KEYCLOAK_BASE_URL: https://keycloak:8443
    BACKEND_URL: https://backend:4000
    
    # Trust certificates
    NODE_EXTRA_CA_CERTS: /opt/app/certs/rootCA.pem
    AUTH_TRUST_HOST: "true"
  
  volumes:
    - ./certs/mkcert:/opt/app/certs:ro
    - ./frontend/certs/dive-root-cas:/app/certs/dive-root-cas:ro
```

**Code Changes** (frontend/server.js):
```javascript
const https = require('https');
const fs = require('fs');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  if (process.env.HTTPS_ENABLED === 'true') {
    https.createServer({
      cert: fs.readFileSync(process.env.CERT_FILE),
      key: fs.readFileSync(process.env.KEY_FILE),
    }, (req, res) => handle(req, res))
    .listen(3000);
  }
});
```

### KAS (Key Access Service)

**Certificate Requirements**:
- mkcert certificate for HTTPS API
- DIVE Root CA for policy engine communication

**Configuration**: Similar to Backend API

### External IdPs

**Spain SAML IdP** (SimpleSAMLphp):
```yaml
spain-saml:
  environment:
    SSL_CERT_FILE: /opt/app/certs/certificate.pem
    SSL_KEY_FILE: /opt/app/certs/key.pem
  volumes:
    - ./certs/mkcert:/opt/app/certs:ro
```

**USA OIDC IdP** (Keycloak):
```yaml
usa-oidc:
  environment:
    KC_HTTPS_CERTIFICATE_FILE: /opt/app/certs/certificate.pem
    KC_HTTPS_CERTIFICATE_KEY_FILE: /opt/app/certs/key.pem
    KC_HOSTNAME: localhost  # or custom
  volumes:
    - ./certs/mkcert:/opt/app/certs:ro
```

---

## Remote Access Configuration

### For Server Host

1. **Set custom hostname**:
   ```bash
   ./scripts/configure-hostname.sh dive.mydomain.com
   ```

2. **Update DNS** (or `/etc/hosts` for testing):
   ```bash
   # Add to /etc/hosts
   192.168.1.100 dive.mydomain.com
   192.168.1.100 keycloak.dive.mydomain.com
   192.168.1.100 backend.dive.mydomain.com
   192.168.1.100 frontend.dive.mydomain.com
   ```

3. **Start services**:
   ```bash
   ./start-with-hostname.sh
   ```

### For Remote Clients

1. **Add hosts entry**:
   ```bash
   # Windows: C:\Windows\System32\drivers\etc\hosts
   # macOS/Linux: /etc/hosts
   192.168.1.100 dive.mydomain.com
   ```

2. **Trust mkcert CA certificate**:
   ```bash
   # Option 1: Install mkcert CA from server
   # Copy certs/mkcert/rootCA.pem from server
   # macOS:
   sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain rootCA.pem
   
   # Linux:
   sudo cp rootCA.pem /usr/local/share/ca-certificates/mkcert-ca.crt
   sudo update-ca-certificates
   
   # Windows:
   # Double-click rootCA.pem → Install Certificate → Trusted Root Certification Authorities
   ```

3. **Access services**:
   - Frontend: https://dive.mydomain.com:3000
   - Keycloak: https://dive.mydomain.com:8443

---

## Production Deployment

### For Production Environments

**DO NOT use mkcert certificates in production**. Instead:

1. **Obtain valid SSL certificates**:
   - Let's Encrypt (free, automated)
   - Commercial CA (Digicert, GlobalSign, etc.)
   - Organization PKI

2. **Replace certificate paths**:
   ```yaml
   keycloak:
     environment:
       KC_HTTPS_CERTIFICATE_FILE: /opt/keycloak/certs/production.crt
       KC_HTTPS_CERTIFICATE_KEY_FILE: /opt/keycloak/certs/production.key
     volumes:
       - /etc/ssl/certs/production.crt:/opt/keycloak/certs/production.crt:ro
       - /etc/ssl/private/production.key:/opt/keycloak/certs/production.key:ro
   ```

3. **Use reverse proxy** (recommended):
   - Nginx or Traefik handles SSL termination
   - Services communicate over internal HTTP
   - Certificates managed centrally

4. **DIVE Root CA certificates**:
   - Keep DIVE Root CA trust for federation
   - These are valid for coalition partners

---

## Troubleshooting

### Certificate Not Trusted

**Problem**: Browser shows "Your connection is not private"

**Solution**:
```bash
# Reinstall mkcert CA
mkcert -install

# Verify CA is installed
mkcert -CAROOT

# Check certificate
openssl x509 -in certs/mkcert/certificate.pem -noout -text
```

### Keycloak Token Issuer Mismatch

**Problem**: "Invalid issuer" errors

**Solution**:
- Ensure `KC_HOSTNAME` matches the URL used by clients
- Update `NEXT_PUBLIC_KEYCLOAK_URL` to match `KC_HOSTNAME`
- Restart Keycloak after hostname changes

### Service-to-Service SSL Errors

**Problem**: "certificate verify failed" between containers

**Solution**:
```yaml
# Option 1: Trust mkcert CA
environment:
  NODE_EXTRA_CA_CERTS: /opt/app/certs/rootCA.pem

# Option 2: Disable verification (development only)
environment:
  NODE_TLS_REJECT_UNAUTHORIZED: "0"
```

### Custom Hostname Not Resolving

**Problem**: "ERR_NAME_NOT_RESOLVED"

**Solution**:
```bash
# Check hosts file
cat /etc/hosts | grep dive

# Test DNS resolution
nslookup dive.mydomain.com
ping dive.mydomain.com

# Verify Docker networking
docker-compose exec backend ping keycloak
```

---

## File Structure

```
DIVE-V3/
├── certs/
│   └── mkcert/                    # Master mkcert certificates
│       ├── certificate.pem        # SSL certificate
│       ├── key.pem                # Private key
│       └── rootCA.pem             # CA certificate
│
├── dive-certs/                    # DIVE Root CA (federation)
│   ├── NLDECCDIVEROOTCAG1.cacert.pem
│   └── NLDRSADIVEROOTCAG1.cacert.pem
│
├── keycloak/certs/
│   ├── certificate.pem            # mkcert cert (copy)
│   ├── key.pem                    # mkcert key (copy)
│   ├── rootCA.pem                 # mkcert CA (copy)
│   └── dive-root-cas/
│       ├── dive-truststore.jks    # Java keystore
│       └── *.pem                  # DIVE Root CAs
│
├── backend/certs/
│   ├── certificate.pem
│   ├── key.pem
│   ├── rootCA.pem
│   └── dive-root-cas/
│
├── frontend/certs/
│   ├── certificate.pem
│   ├── key.pem
│   ├── rootCA.pem
│   └── dive-root-cas/
│
├── kas/certs/
│   └── (same structure)
│
├── docker-compose.yml             # Base configuration
├── docker-compose.mkcert.yml      # mkcert override
├── docker-compose.hostname.yml    # Custom hostname override
├── .env.hostname                  # Hostname-specific env vars
└── etc-hosts-entry.txt            # Sample hosts file entries
```

---

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `scripts/setup-mkcert-for-all-services.sh` | Generate and distribute mkcert certificates |
| `scripts/configure-hostname.sh` | Configure custom hostname |
| `scripts/verify-mkcert-setup.sh` | Verify certificate installation |
| `scripts/install-dive-certs.sh` | Install DIVE Root CA certificates |
| `scripts/test-dive-cert-trust.sh` | Test DIVE Root CA trust |
| `start-with-hostname.sh` | Start services with custom hostname |

---

## Best Practices

### Development
1. Use mkcert for local HTTPS
2. Use localhost or `.local` domain
3. Keep `NODE_TLS_REJECT_UNAUTHORIZED=0` (development only)
4. Regenerate certificates if hostnames change

### Testing
1. Use custom hostname matching production domain structure
2. Test with real DNS entries (not just hosts file)
3. Distribute CA certificate to all test clients
4. Test federation with external IdPs

### Production
1. Replace mkcert with valid CA certificates
2. Use reverse proxy for SSL termination
3. Enable certificate pinning for critical endpoints
4. Monitor certificate expiration
5. Keep DIVE Root CA trust for coalition federation

---

## Security Considerations

### mkcert Certificates

**Scope**: Local development only
**Trust**: Machine-specific (requires CA installation)
**Risk**: Low (self-signed, not trusted externally)

⚠️ **DO NOT**:
- Use in production
- Share private keys
- Commit rootCA-key.pem to version control

### DIVE Root CA Certificates

**Scope**: Coalition federation trust
**Trust**: Application-scoped (not system-wide)
**Risk**: Low (read-only mounts, verified checksums)

✅ **DO**:
- Verify checksums before installation
- Keep certificates up to date
- Monitor for revocation notices
- Restrict trust to DIVE-signed certificates

---

## Support

### Resources
- mkcert documentation: https://github.com/FiloSottile/mkcert
- DIVE Root CA: `docs/Dive_2025-2_PKI_NLD_v01_signed.pdf`
- Certificate verification: `./scripts/verify-dive-certs.sh`

### Common Issues
1. Certificate not trusted → Reinstall mkcert CA
2. Hostname mismatch → Update KC_HOSTNAME
3. Service-to-service SSL → Trust rootCA.pem
4. Remote access → Update hosts file + trust CA

### Getting Help
```bash
# Check certificate status
./scripts/verify-mkcert-setup.sh
./scripts/test-dive-cert-trust.sh

# View logs
docker-compose logs keycloak | grep -i ssl
docker-compose logs backend | grep -i cert

# Test connectivity
curl -v https://localhost:8443/health
openssl s_client -connect localhost:8443
```

---

## Summary

| Aspect | mkcert | DIVE Root CA |
|--------|--------|--------------|
| **Purpose** | Local HTTPS | Federation trust |
| **Scope** | All services | Certificate validation |
| **Installation** | `setup-mkcert-for-all-services.sh` | `install-dive-certs.sh` |
| **Trust Model** | System CA | Application trust |
| **Production** | ❌ Replace with real certs | ✅ Keep for federation |
| **Remote Access** | Requires CA distribution | Already trusted in apps |

---

**Need help?** Run `./scripts/verify-mkcert-setup.sh` to diagnose issues.

