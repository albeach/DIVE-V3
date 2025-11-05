#!/bin/bash
# Visual demonstration of the certificate and hostname solution

cat << 'EOF'

╔════════════════════════════════════════════════════════════════════════╗
║     DIVE V3 Certificate & Hostname Architecture - Visual Guide        ║
╚════════════════════════════════════════════════════════════════════════╝


┌────────────────────────────────────────────────────────────────────────┐
│                    PROBLEM STATEMENT                                   │
└────────────────────────────────────────────────────────────────────────┘

BEFORE:
  ❌ Only 3 services had certificates (Keycloak, Backend, Frontend)
  ❌ Hardcoded localhost URLs
  ❌ Remote access difficult
  ❌ Certificate management fragmented

AFTER:
  ✅ ALL services have certificates
  ✅ Configurable hostname support
  ✅ Easy remote access
  ✅ Unified certificate management


┌────────────────────────────────────────────────────────────────────────┐
│                    ARCHITECTURE DIAGRAM                                │
└────────────────────────────────────────────────────────────────────────┘

                           ┌─────────────────┐
                           │  Client Browser │
                           │  (Remote/Local) │
                           └────────┬────────┘
                                    │
                       HTTPS (trusts mkcert CA)
                                    │
                        ┌───────────▼──────────────┐
                        │  Custom Hostname DNS     │
                        │  dive.example.com        │
                        │  (or localhost)          │
                        └───────────┬──────────────┘
                                    │
┌───────────────────────────────────▼───────────────────────────────────┐
│                         DIVE V3 Docker Network                        │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              mkcert Certificate Layer                        │   │
│  │  Master: certs/mkcert/certificate.pem                        │   │
│  │          - localhost, 127.0.0.1                              │   │
│  │          - all service names                                 │   │
│  │          - custom hostname + wildcards                       │   │
│  └────────────────────────┬─────────────────────────────────────┘   │
│                           │ (distributed to all services)            │
│         ┌─────────────────┼─────────────────┬──────────────────┐    │
│         │                 │                 │                  │    │
│    ┌────▼─────┐    ┌─────▼────┐    ┌──────▼───┐    ┌────────▼───┐ │
│    │ Keycloak │    │ Backend  │    │ Frontend │    │    KAS     │ │
│    │  :8443   │    │  :4000   │    │  :3000   │    │   :8080    │ │
│    │          │    │          │    │          │    │            │ │
│    │ /certs/  │    │ /certs/  │    │ /certs/  │    │  /certs/   │ │
│    │  ├─cert  │    │  ├─cert  │    │  ├─cert  │    │   ├─cert   │ │
│    │  ├─key   │    │  ├─key   │    │  ├─key   │    │   ├─key    │ │
│    │  └─CA    │    │  └─CA    │    │  └─CA    │    │   └─CA     │ │
│    └──────────┘    └──────────┘    └──────────┘    └────────────┘ │
│                                                                      │
│    ┌──────────┐    ┌──────────┐    ┌─────────┐    ┌──────────┐    │
│    │  Spain   │    │   USA    │    │   OPA   │    │  Mongo   │    │
│    │  SAML    │    │  OIDC    │    │  :8181  │    │  :27017  │    │
│    │  :9443   │    │  :9082   │    │ /certs/ │    │ /certs/  │    │
│    │ /certs/  │    │ /certs/  │    └─────────┘    └──────────┘    │
│    └──────────┘    └──────────┘                                    │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │         DIVE Root CA Layer (Federation Trust)                │  │
│  │  dive-certs/NLD*.pem → <service>/certs/dive-root-cas/       │  │
│  │  Purpose: Validate coalition partner certificates           │  │
│  │  Used by: Keycloak (SAML/OIDC), Backend (API calls)         │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘


┌────────────────────────────────────────────────────────────────────────┐
│                    FILE STRUCTURE                                      │
└────────────────────────────────────────────────────────────────────────┘

DIVE-V3/
│
├─ certs/
│  └─ mkcert/                     ← MASTER CERTIFICATE LOCATION
│     ├─ certificate.pem          ← SSL cert (all hostnames)
│     ├─ key.pem                  ← Private key
│     └─ rootCA.pem               ← CA for trust
│
├─ keycloak/certs/               ← SERVICE-SPECIFIC COPIES
│  ├─ certificate.pem
│  ├─ key.pem
│  ├─ rootCA.pem
│  └─ dive-root-cas/             ← Federation trust
│
├─ backend/certs/                 (same structure)
├─ frontend/certs/                (same structure)
├─ kas/certs/                     (same structure)
├─ external-idps/certs/           (same structure)
│
├─ docker-compose.yml             ← Base configuration
├─ docker-compose.mkcert.yml      ← Certificate overlay
├─ docker-compose.hostname.yml    ← Hostname overlay
│
└─ scripts/
   ├─ quick-setup-certificates.sh       ← ⭐ START HERE
   ├─ setup-mkcert-for-all-services.sh
   ├─ configure-hostname.sh
   └─ verify-mkcert-setup.sh


┌────────────────────────────────────────────────────────────────────────┐
│                    CONFIGURATION FLOW                                  │
└────────────────────────────────────────────────────────────────────────┘

Step 1: Generate Master Certificate
   └─> mkcert creates certificate with all hostnames
       └─> Saved to: certs/mkcert/certificate.pem

Step 2: Distribute to Services
   └─> Copy to each service's certs/ directory
       └─> keycloak/certs/, backend/certs/, etc.

Step 3: Docker Compose Configuration
   └─> docker-compose.mkcert.yml mounts certificates
       └─> Sets NODE_EXTRA_CA_CERTS, CERT_FILE, KEY_FILE

Step 4: Hostname Configuration (if custom)
   └─> docker-compose.hostname.yml sets URLs
       └─> KC_HOSTNAME, NEXT_PUBLIC_*, etc.

Step 5: Start Services
   └─> docker-compose -f docker-compose.yml \
                      -f docker-compose.mkcert.yml \
                      -f docker-compose.hostname.yml up


┌────────────────────────────────────────────────────────────────────────┐
│                    URL CONFIGURATION                                   │
└────────────────────────────────────────────────────────────────────────┘

LOCALHOST SETUP:
   Browser URLs:       https://localhost:3000   (Frontend)
                       https://localhost:4000   (Backend)
                       https://localhost:8443   (Keycloak)
   
   Internal URLs:      https://keycloak:8443    (Docker network)
                       https://backend:4000
                       https://nextjs:3000

CUSTOM HOSTNAME SETUP (dive.example.com):
   Browser URLs:       https://dive.example.com:3000   (Frontend)
                       https://dive.example.com:4000   (Backend)
                       https://dive.example.com:8443   (Keycloak)
   
   Internal URLs:      https://keycloak:8443    (unchanged)
                       https://backend:4000
                       https://nextjs:3000

   Environment:        KC_HOSTNAME=dive.example.com
                       NEXT_PUBLIC_KEYCLOAK_URL=https://dive.example.com:8443
                       NEXT_PUBLIC_API_URL=https://dive.example.com:4000


┌────────────────────────────────────────────────────────────────────────┐
│                    DOCKER VOLUME MOUNTS                                │
└────────────────────────────────────────────────────────────────────────┘

Each service gets TWO certificate mounts:

1. mkcert Certificates (HTTPS):
   Host:       certs/mkcert/
   Container:  /opt/app/certs/  (or /opt/keycloak/certs/)
   Mode:       :ro (read-only)
   Purpose:    Enable HTTPS on service

2. DIVE Root CA (Federation Trust):
   Host:       <service>/certs/dive-root-cas/
   Container:  /app/certs/dive-root-cas/ (or /opt/keycloak/certs/dive-root-cas/)
   Mode:       :ro (read-only)
   Purpose:    Trust coalition certificates


┌────────────────────────────────────────────────────────────────────────┐
│                    ENVIRONMENT VARIABLES                               │
└────────────────────────────────────────────────────────────────────────┘

Node.js Services (Backend, Frontend, KAS):
   HTTPS_ENABLED=true
   CERT_FILE=/opt/app/certs/certificate.pem
   KEY_FILE=/opt/app/certs/key.pem
   CA_FILE=/opt/app/certs/rootCA.pem
   NODE_EXTRA_CA_CERTS=/opt/app/certs/rootCA.pem
   NODE_TLS_REJECT_UNAUTHORIZED=0  (dev only)

Keycloak:
   KC_HTTPS_CERTIFICATE_FILE=/opt/keycloak/certs/certificate.pem
   KC_HTTPS_CERTIFICATE_KEY_FILE=/opt/keycloak/certs/key.pem
   KC_HOSTNAME=localhost  (or custom)
   JAVA_OPTS=-Djavax.net.ssl.trustStore=...dive-truststore.jks


┌────────────────────────────────────────────────────────────────────────┐
│                    REMOTE ACCESS WORKFLOW                              │
└────────────────────────────────────────────────────────────────────────┘

┌──────────────┐                          ┌──────────────┐
│    SERVER    │                          │    CLIENT    │
└──────────────┘                          └──────────────┘

1. Run setup
   └─> ./scripts/quick-setup-certificates.sh
       (Choose custom hostname)

2. Update server /etc/hosts              3. Get server IP
   └─> 192.168.1.100 dive.example.com       └─> ifconfig | grep inet

3. Start services                        4. Update client /etc/hosts
   └─> ./start-with-hostname.sh             └─> 192.168.1.100 dive.example.com

5. Note CA location                      5. Get CA from server
   └─> certs/mkcert/rootCA.pem              └─> scp server:certs/mkcert/rootCA.pem .

                                         6. Install CA
                                            └─> macOS: security add-trusted-cert
                                                Linux: update-ca-certificates
                                                Windows: certmgr.msc

                                         7. Access service
                                            └─> https://dive.example.com:3000


┌────────────────────────────────────────────────────────────────────────┐
│                    TROUBLESHOOTING FLOW                                │
└────────────────────────────────────────────────────────────────────────┘

Issue: "Your connection is not private"
  ├─> Check: Is mkcert CA installed?
  │   └─> Run: mkcert -install
  └─> Check: Is correct CA trusted?
      └─> Verify: mkcert -CAROOT

Issue: "Certificate verify failed" (container-to-container)
  ├─> Check: Is NODE_EXTRA_CA_CERTS set?
  │   └─> View: docker-compose.mkcert.yml
  └─> Check: Is rootCA.pem mounted?
      └─> Test: docker-compose exec backend ls /opt/app/certs/

Issue: "Invalid token issuer"
  ├─> Check: Does KC_HOSTNAME match client URL?
  │   └─> Compare: docker-compose.hostname.yml
  └─> Check: Is NEXT_PUBLIC_KEYCLOAK_URL correct?
      └─> View: .env.hostname

Issue: "ERR_NAME_NOT_RESOLVED"
  ├─> Check: /etc/hosts entry exists?
  │   └─> Run: cat /etc/hosts | grep dive
  └─> Check: DNS resolution working?
      └─> Run: nslookup dive.example.com


┌────────────────────────────────────────────────────────────────────────┐
│                    COMMAND REFERENCE                                   │
└────────────────────────────────────────────────────────────────────────┘

SETUP:
  ./scripts/quick-setup-certificates.sh        Interactive setup
  ./scripts/setup-mkcert-for-all-services.sh   Generate certificates
  ./scripts/configure-hostname.sh HOSTNAME     Set custom hostname
  ./scripts/verify-mkcert-setup.sh             Verify installation

START:
  Localhost:
    docker-compose -f docker-compose.yml \
                   -f docker-compose.mkcert.yml up -d

  Custom hostname:
    ./start-with-hostname.sh

VERIFY:
  openssl x509 -in certs/mkcert/certificate.pem -noout -text
  curl -v https://localhost:8443/health
  docker-compose exec backend ls -la /opt/app/certs/

DEBUG:
  docker-compose logs keycloak | grep -i ssl
  docker-compose logs backend | grep -i cert
  openssl s_client -connect localhost:8443


┌────────────────────────────────────────────────────────────────────────┐
│                    PRODUCTION MIGRATION PATH                           │
└────────────────────────────────────────────────────────────────────────┘

Development (NOW):
  mkcert certificates
  └─> Self-signed, local CA
      └─> Quick setup, easy trust for dev team

Staging/Demo:
  mkcert OR Let's Encrypt
  └─> Custom hostname, real DNS
      └─> Distribute CA to stakeholders

Production:
  Valid CA certificates (Let's Encrypt/Commercial)
  └─> Reverse proxy (Nginx/Traefik)
      └─> SSL termination at edge
          └─> Internal HTTP or mTLS

The infrastructure created by this solution works for ALL stages - just
swap the certificates in certs/mkcert/ with production certificates.


┌────────────────────────────────────────────────────────────────────────┐
│                    KEY BENEFITS                                        │
└────────────────────────────────────────────────────────────────────────┘

✅ Unified Management
   └─> One command to setup all certificates

✅ Full Coverage
   └─> ALL services have certificates, not just 3

✅ Flexible Hostnames
   └─> localhost for dev, custom for remote

✅ Easy Remote Access
   └─> Distribute one CA file, update one hosts entry

✅ Docker Native
   └─> Volume mounts, compose overlays, no hacks

✅ Development Focused
   └─> Quick setup, easy verification, clear docs

✅ Production Ready
   └─> Architecture supports real certificates

✅ Coalition Compatible
   └─> Works alongside DIVE Root CA system


╔════════════════════════════════════════════════════════════════════════╗
║                       QUICK START                                      ║
╚════════════════════════════════════════════════════════════════════════╝

                ./scripts/quick-setup-certificates.sh
                               ↓
                      Choose localhost or custom
                               ↓
                  Follow prompts, update hosts file
                               ↓
              docker-compose [...] up -d  (or use helper script)
                               ↓
                     Access https://your-host:3000
                               ↓
                         ✅ Complete!


For complete documentation, see:
  • README-CERTIFICATES.md (Quick start)
  • docs/CERTIFICATE-AND-HOSTNAME-MANAGEMENT.md (Full guide)
  • CERTIFICATE-HOSTNAME-SOLUTION-SUMMARY.txt (Summary)

EOF

