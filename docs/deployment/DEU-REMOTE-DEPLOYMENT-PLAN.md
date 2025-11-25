# DIVE V3 - Germany (DEU) Remote Deployment Plan

## 🎯 Objective
Deploy the Germany (DEU) DIVE V3 instance on a remote server at prosecurity.biz, creating true geographic federation with USA and FRA instances.

## 📋 Prerequisites Checklist

Before starting, confirm you have:
- [ ] SSH credentials for the remote server
- [ ] Super Admin access to prosecurity.biz Cloudflare Zero Trust
- [ ] Server meets minimum requirements (4GB RAM, 20GB disk, Docker support)
- [ ] Domain/subdomain for DEU instance (e.g., deu-*.prosecurity.biz)

---

## Phase 1: Server Assessment & Preparation
**Timeline: 30 minutes**
**Risk: Low**

### 1.1 SSH Connection & System Audit
```bash
# Connect to remote server
ssh user@<server-ip>

# Check system resources
uname -a                    # OS version
free -h                     # Available RAM
df -h                       # Disk space
nproc                       # CPU cores
```

### 1.2 Required Software Installation
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installations
docker --version
docker-compose --version

# Install utilities
sudo apt install -y git curl jq openssl
```

### 1.3 Directory Structure Setup
```bash
# Create project directory
sudo mkdir -p /opt/dive-v3
sudo chown $USER:$USER /opt/dive-v3
cd /opt/dive-v3
```

### Success Criteria - Phase 1
- [ ] SSH access confirmed
- [ ] Docker and Docker Compose installed
- [ ] At least 4GB RAM available
- [ ] At least 20GB disk space available

---

## Phase 2: Cloudflare Zero Trust Configuration
**Timeline: 45 minutes**
**Risk: Medium**

### 2.1 DNS Planning
Plan these DNS entries for prosecurity.biz:

| Service | Subdomain | Type | Target |
|---------|-----------|------|--------|
| Frontend | `deu-app.prosecurity.biz` | CNAME | Tunnel |
| Backend API | `deu-api.prosecurity.biz` | CNAME | Tunnel |
| Keycloak IdP | `deu-idp.prosecurity.biz` | CNAME | Tunnel |

### 2.2 Create Cloudflare Tunnel

**Option A: Via Dashboard**
1. Go to Cloudflare Zero Trust Dashboard → Networks → Tunnels
2. Click "Create a tunnel"
3. Name: `dive-v3-deu`
4. Choose "Cloudflared" connector
5. Copy the tunnel token

**Option B: Via CLI (on remote server)**
```bash
# Install cloudflared
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Authenticate (opens browser)
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create dive-v3-deu

# Note the tunnel ID and credentials file location
```

### 2.3 Configure Tunnel Routes
```yaml
# /opt/dive-v3/cloudflared/config.yml
tunnel: <TUNNEL-ID>
credentials-file: /opt/dive-v3/cloudflared/credentials.json

ingress:
  # Frontend - Next.js app
  - hostname: deu-app.prosecurity.biz
    service: https://localhost:3000
    originRequest:
      noTLSVerify: true
      
  # Backend API - Express.js
  - hostname: deu-api.prosecurity.biz
    service: https://localhost:4000
    originRequest:
      noTLSVerify: true
      
  # Keycloak IdP
  - hostname: deu-idp.prosecurity.biz
    service: https://localhost:8443
    originRequest:
      noTLSVerify: true
      
  # Catch-all (required)
  - service: http_status:404
```

### 2.4 Configure DNS in Cloudflare Dashboard
1. Go to DNS settings for prosecurity.biz
2. Add CNAME records pointing to the tunnel:
   - `deu-app` → `<TUNNEL-ID>.cfargotunnel.com`
   - `deu-api` → `<TUNNEL-ID>.cfargotunnel.com`
   - `deu-idp` → `<TUNNEL-ID>.cfargotunnel.com`

### Success Criteria - Phase 2
- [ ] Tunnel created and token obtained
- [ ] Config file created with all routes
- [ ] DNS entries configured in Cloudflare
- [ ] Tunnel tested: `cloudflared tunnel run dive-v3-deu`

---

## Phase 3: Application Deployment
**Timeline: 60 minutes**
**Risk: Medium**

### 3.1 Transfer Application Files

**Option A: Git Clone (Recommended)**
```bash
cd /opt/dive-v3
git clone https://github.com/YOUR-ORG/DIVE-V3.git .
# Or use deploy key for private repo
```

**Option B: SCP Transfer (from local machine)**
```bash
# On local machine - create deployment archive
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3
tar -czvf dive-v3-deu.tar.gz \
  docker-compose.yml \
  instances/deu/ \
  frontend/ \
  backend/ \
  keycloak/ \
  policies/ \
  scripts/

# Transfer to remote
scp dive-v3-deu.tar.gz user@<server-ip>:/opt/dive-v3/

# On remote server
cd /opt/dive-v3
tar -xzvf dive-v3-deu.tar.gz
```

### 3.2 Generate SSL Certificates
```bash
cd /opt/dive-v3

# Install mkcert (for development certs)
curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
chmod +x mkcert-v*-linux-amd64
sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert

# Install CA
mkcert -install

# Generate certificates
mkdir -p keycloak/certs frontend/certs backend/certs
mkcert -key-file keycloak/certs/key.pem -cert-file keycloak/certs/certificate.pem \
  localhost deu-idp.prosecurity.biz keycloak
mkcert -key-file frontend/certs/key.pem -cert-file frontend/certs/certificate.pem \
  localhost deu-app.prosecurity.biz frontend
mkcert -key-file backend/certs/key.pem -cert-file backend/certs/certificate.pem \
  localhost deu-api.prosecurity.biz backend
```

### 3.3 Configure Environment Variables
Create `/opt/dive-v3/.env.deu`:

```bash
# Instance Configuration
INSTANCE_CODE=DEU
INSTANCE_NAME=Germany
LOCALE=de

# Public URLs (Cloudflare tunnel endpoints)
NEXT_PUBLIC_BASE_URL=https://deu-app.prosecurity.biz
NEXT_PUBLIC_API_URL=https://deu-api.prosecurity.biz
NEXT_PUBLIC_KEYCLOAK_URL=https://deu-idp.prosecurity.biz

# Internal Docker network URLs
BACKEND_URL=https://backend:4000
KEYCLOAK_URL=https://keycloak:8443

# Keycloak Configuration
KEYCLOAK_REALM=dive-v3-broker
KEYCLOAK_CLIENT_ID=dive-v3-client-broker
KEYCLOAK_CLIENT_SECRET=<generate-new-secret>
KEYCLOAK_ISSUER=https://deu-idp.prosecurity.biz/realms/dive-v3-broker

# NextAuth
NEXTAUTH_URL=https://deu-app.prosecurity.biz
AUTH_SECRET=<generate-with-openssl-rand-base64-32>
AUTH_TRUST_HOST=true

# Database
DATABASE_URL=postgresql://postgres:password@postgres:5432/dive_v3_app

# Federation Partners (USA and FRA instances)
FEDERATION_USA_IDP=https://usa-idp.dive25.com
FEDERATION_FRA_IDP=https://fra-idp.dive25.com
```

### 3.4 Create DEU-Specific Docker Compose
Create `/opt/dive-v3/docker-compose.deu-remote.yml`:

```yaml
version: '3.8'

networks:
  dive-network:
    driver: bridge

volumes:
  postgres_data:
  mongo_data:
  redis_data:

services:
  postgres:
    image: postgres:15-alpine
    container_name: dive-v3-postgres-deu
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/setup/init-db.sh:/docker-entrypoint-initdb.d/init-db.sh
    networks:
      - dive-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  mongo:
    image: mongo:7
    container_name: dive-v3-mongo-deu
    volumes:
      - mongo_data:/data/db
    networks:
      - dive-network
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: dive-v3-redis-deu
    volumes:
      - redis_data:/data
    networks:
      - dive-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  keycloak:
    build:
      context: ./keycloak
      dockerfile: Dockerfile
    container_name: dive-v3-keycloak-deu
    env_file:
      - .env.deu
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak_db
      KC_DB_USERNAME: postgres
      KC_DB_PASSWORD: password
      KC_HOSTNAME: deu-idp.prosecurity.biz
      KC_HOSTNAME_STRICT: false
      KC_HTTP_ENABLED: true
      KC_HTTPS_CERTIFICATE_FILE: /opt/keycloak/certs/certificate.pem
      KC_HTTPS_CERTIFICATE_KEY_FILE: /opt/keycloak/certs/key.pem
      KC_HTTPS_PORT: 8443
      KC_FEATURES: scripts
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD:-admin}
    command: start-dev --spi-login-protocol-openid-connect-suppress-logout-confirmation-screen=true --features=scripts
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "8080:8080"
      - "8443:8443"
    networks:
      - dive-network
    volumes:
      - ./keycloak/certs:/opt/keycloak/certs:ro
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8080/realms/master || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    restart: unless-stopped

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    container_name: dive-v3-backend-deu
    env_file:
      - .env.deu
    environment:
      NODE_ENV: production
      INSTANCE: DEU
      NEXT_PUBLIC_INSTANCE: DEU
    depends_on:
      keycloak:
        condition: service_healthy
      mongo:
        condition: service_healthy
    ports:
      - "4000:4000"
    networks:
      - dive-network
    volumes:
      - ./backend/src:/app/src
      - ./keycloak/certs:/opt/keycloak/certs:ro
      - ./policies:/app/policies:ro
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    container_name: dive-v3-frontend-deu
    env_file:
      - .env.deu
    environment:
      NODE_ENV: development
      NEXT_PUBLIC_INSTANCE: DEU
      NEXT_PUBLIC_INSTANCE_NAME: Germany
      NEXT_PUBLIC_LOCALE: de
    depends_on:
      - keycloak
      - backend
    ports:
      - "3000:3000"
    networks:
      - dive-network
    volumes:
      - ./frontend/src:/app/src
      - ./frontend/public:/app/public
      - ./frontend/certs:/opt/app/certs:ro
    healthcheck:
      test: ["CMD-SHELL", "wget --no-check-certificate -q -O- https://localhost:3000/ || exit 1"]
      interval: 15s
      timeout: 10s
      retries: 5
      start_period: 60s
    restart: unless-stopped

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: dive-v3-cloudflared-deu
    command: tunnel run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
    networks:
      - dive-network
    depends_on:
      - frontend
      - backend
      - keycloak
    restart: unless-stopped
```

### 3.5 Start the Stack
```bash
cd /opt/dive-v3

# Start all services
docker-compose -f docker-compose.deu-remote.yml up -d

# Monitor startup
docker-compose -f docker-compose.deu-remote.yml logs -f

# Check health
docker-compose -f docker-compose.deu-remote.yml ps
```

### Success Criteria - Phase 3
- [ ] All Docker images built successfully
- [ ] All containers running and healthy
- [ ] Logs show no critical errors
- [ ] Keycloak accessible at https://deu-idp.prosecurity.biz

---

## Phase 4: Keycloak Configuration
**Timeline: 45 minutes**
**Risk: Medium**

### 4.1 Initial Keycloak Setup
1. Access Keycloak admin: `https://deu-idp.prosecurity.biz/admin`
2. Login with admin/admin
3. Create realm: `dive-v3-broker`

### 4.2 Configure Client
1. Clients → Create client
2. Client ID: `dive-v3-client-broker`
3. Client authentication: ON
4. Valid redirect URIs:
   - `https://deu-app.prosecurity.biz/*`
   - `https://deu-app.prosecurity.biz/api/auth/callback/keycloak`
5. Web origins: `https://deu-app.prosecurity.biz`
6. Copy client secret to `.env.deu`

### 4.3 Configure Identity Providers (Federation)

**Add USA IdP:**
1. Identity Providers → Add provider → OpenID Connect v1.0
2. Alias: `usa-idp`
3. Display Name: `DIVE V3 - United States`
4. Discovery URL: `https://usa-idp.dive25.com/realms/dive-v3-broker/.well-known/openid-configuration`
5. Client ID: `deu-federation-client`
6. Client Secret: (coordinate with USA admin)

**Add FRA IdP:**
1. Identity Providers → Add provider → OpenID Connect v1.0
2. Alias: `fra-idp`
3. Display Name: `DIVE V3 - France`
4. Discovery URL: `https://fra-idp.dive25.com/realms/dive-v3-broker/.well-known/openid-configuration`
5. Client ID: `deu-federation-client`
6. Client Secret: (coordinate with FRA admin)

### 4.4 Configure Claim Mappers
For each IdP, add mappers:
- `uniqueID` → user attribute
- `clearance` → user attribute
- `countryOfAffiliation` → user attribute
- `acpCOI` → user attribute

### Success Criteria - Phase 4
- [ ] Realm created
- [ ] Client configured
- [ ] USA IdP federation working
- [ ] FRA IdP federation working
- [ ] Test login from DEU via USA IdP

---

## Phase 5: Reciprocal Federation Setup
**Timeline: 30 minutes**
**Risk: Low**

### 5.1 Configure USA Instance to Trust DEU

On USA Keycloak (`usa-idp.dive25.com`):
1. Identity Providers → Add provider → OpenID Connect
2. Alias: `deu-idp`
3. Display Name: `DIVE V3 - Germany`
4. Discovery URL: `https://deu-idp.prosecurity.biz/realms/dive-v3-broker/.well-known/openid-configuration`
5. Client ID: `usa-federation-client`
6. Create corresponding client in DEU Keycloak

### 5.2 Configure FRA Instance to Trust DEU

On FRA Keycloak (`fra-idp.dive25.com`):
1. Identity Providers → Add provider → OpenID Connect
2. Alias: `deu-idp`
3. Display Name: `DIVE V3 - Germany`
4. Discovery URL: `https://deu-idp.prosecurity.biz/realms/dive-v3-broker/.well-known/openid-configuration`

### 5.3 Update Frontend IdP Selectors
Ensure all three frontends show all three IdPs in their selector.

### Success Criteria - Phase 5
- [ ] DEU IdP appears in USA IdP selector
- [ ] DEU IdP appears in FRA IdP selector
- [ ] Cross-login works: USA user → DEU instance
- [ ] Cross-login works: DEU user → USA instance

---

## Phase 6: Testing & Validation
**Timeline: 30 minutes**
**Risk: Low**

### 6.1 Run Validation Script
```bash
# On remote server
cd /opt/dive-v3
./scripts/validate-theme.sh
```

### 6.2 Functional Tests

| Test | Expected Result |
|------|-----------------|
| Access `deu-app.prosecurity.biz` | German-themed landing page |
| Select USA IdP | Redirects to usa-idp.dive25.com |
| Login as USA user | Returns to DEU with USA credentials |
| View dashboard | Correct clearance/COI shown |
| Access resources | OPA policy enforced |

### 6.3 Performance Check
```bash
# Response time test
curl -sk -w "Time: %{time_total}s\n" -o /dev/null https://deu-app.prosecurity.biz

# Should be < 2 seconds
```

### Success Criteria - Phase 6
- [ ] All validation tests pass
- [ ] Cross-instance federation works
- [ ] German localization displays correctly
- [ ] Response time < 2s

---

## Phase 7: Production Hardening
**Timeline: 60 minutes**
**Risk: Medium**

### 7.1 Security Checklist
- [ ] Change default Keycloak admin password
- [ ] Generate strong secrets for all services
- [ ] Enable Cloudflare WAF rules
- [ ] Configure rate limiting
- [ ] Set up monitoring/alerting

### 7.2 Backup Configuration
```bash
# Database backup cron job
echo "0 2 * * * docker exec dive-v3-postgres-deu pg_dump -U postgres keycloak_db > /opt/dive-v3/backups/keycloak-\$(date +\%Y\%m\%d).sql" | crontab -
```

### 7.3 Monitoring Setup
```bash
# Add to docker-compose.deu-remote.yml:
  healthcheck-monitor:
    image: louislam/uptime-kuma:1
    container_name: dive-v3-monitor-deu
    volumes:
      - ./monitoring/data:/app/data
    ports:
      - "3001:3001"
    restart: unless-stopped
```

---

## 📞 Rollback Plan

If issues occur:

1. **Quick rollback**: 
   ```bash
   docker-compose -f docker-compose.deu-remote.yml down
   ```

2. **Remove DNS entries** from Cloudflare

3. **Delete tunnel**: 
   ```bash
   cloudflared tunnel delete dive-v3-deu
   ```

---

## 📊 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DIVE V3 Federation                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │
│  │   USA Instance  │  │   FRA Instance  │  │   DEU Instance  │       │
│  │   (dive25.com)  │  │   (dive25.com)  │  │(prosecurity.biz)│       │
│  │                 │  │                 │  │                 │       │
│  │ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │       │
│  │ │  Frontend   │ │  │ │  Frontend   │ │  │ │  Frontend   │ │       │
│  │ │ usa-app     │ │  │ │ fra-app     │ │  │ │ deu-app     │ │       │
│  │ └─────────────┘ │  │ └─────────────┘ │  │ └─────────────┘ │       │
│  │       │         │  │       │         │  │       │         │       │
│  │ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │       │
│  │ │  Keycloak   │◄├──┼─┤  Keycloak   │◄├──┼─┤  Keycloak   │ │       │
│  │ │ usa-idp     │─┼──┼─►fra-idp     │─┼──┼─►deu-idp     │ │       │
│  │ └─────────────┘ │  │ └─────────────┘ │  │ └─────────────┘ │       │
│  │       │         │  │       │         │  │       │         │       │
│  │ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │       │
│  │ │  Backend    │ │  │ │  Backend    │ │  │ │  Backend    │ │       │
│  │ │ usa-api     │ │  │ │ fra-api     │ │  │ │ deu-api     │ │       │
│  │ └─────────────┘ │  │ └─────────────┘ │  │ └─────────────┘ │       │
│  │       │         │  │       │         │  │       │         │       │
│  │ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │       │
│  │ │    OPA      │ │  │ │    OPA      │ │  │ │    OPA      │ │       │
│  │ └─────────────┘ │  │ └─────────────┘ │  │ └─────────────┘ │       │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘       │
│           │                   │                   │                   │
│           └───────────────────┼───────────────────┘                   │
│                               │                                       │
│                    ┌──────────┴──────────┐                           │
│                    │  Cross-Federation   │                           │
│                    │  - Shared IdP Trust │                           │
│                    │  - Claim Mapping    │                           │
│                    │  - Policy Sync      │                           │
│                    └─────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## ⏱ Total Estimated Time

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Phase 1: Server Prep | 30 min | 30 min |
| Phase 2: Cloudflare Setup | 45 min | 1h 15m |
| Phase 3: App Deployment | 60 min | 2h 15m |
| Phase 4: Keycloak Config | 45 min | 3h |
| Phase 5: Federation | 30 min | 3h 30m |
| Phase 6: Testing | 30 min | 4h |
| Phase 7: Hardening | 60 min | 5h |

**Total: ~5 hours** (can be done in one session or split across days)

---

## 🚀 Ready to Start?

When you're ready, provide:
1. SSH credentials (user@ip or hostname)
2. Confirm Cloudflare ZT access to prosecurity.biz
3. Desired subdomains (deu-app, deu-api, deu-idp or custom)

I'll guide you through each phase step-by-step!

