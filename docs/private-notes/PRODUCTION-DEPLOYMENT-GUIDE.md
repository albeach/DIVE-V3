# DIVE V3 Production Deployment Guide

**Version**: 1.0  
**Date**: October 30, 2025  
**Status**: Phase 5 Complete

---

## Table of Contents

1. [Overview](#overview)
2. [Infrastructure Requirements](#infrastructure-requirements)
3. [Pre-Deployment Checklist](#pre-deployment-checklist)
4. [Service Dependencies](#service-dependencies)
5. [Security Hardening](#security-hardening)
6. [Environment Configuration](#environment-configuration)
7. [Deployment Steps](#deployment-steps)
8. [Monitoring & Alerting](#monitoring--alerting)
9. [Backup & Disaster Recovery](#backup--disaster-recovery)
10. [Troubleshooting](#troubleshooting)

---

## Overview

DIVE V3 is a coalition-friendly ICAM system supporting 10 NATO nations with:
- **Federated Authentication**: Keycloak broker + 10 nation IdPs
- **Policy-Driven Authorization**: OPA with 175 test-covered rules
- **Data-Centric Security**: ZTDF cryptographic binding (STANAG 4778)
- **Audit Trail**: 90-day decision and key release logging

**Production Architecture**:
```
Internet → Load Balancer (HTTPS) → Frontend (Next.js)
                                   ↓
                                   Backend API (PEP)
                                   ↓
                        ┌──────────┼──────────┐
                        ↓          ↓          ↓
                    Keycloak     OPA       MongoDB
                        ↓          ↓          ↓
                   PostgreSQL  Redis      KAS
```

---

## Infrastructure Requirements

### Minimum Production Specs

| Component | CPU | RAM | Disk | Notes |
|-----------|-----|-----|------|-------|
| **Frontend** | 2 cores | 2GB | 10GB | Next.js SSR |
| **Backend** | 4 cores | 4GB | 20GB | Express.js + Crypto |
| **Keycloak** | 2 cores | 2GB | 10GB | IdP broker |
| **PostgreSQL** | 2 cores | 4GB | 50GB | Keycloak + app DB |
| **MongoDB** | 2 cores | 4GB | 100GB | Resources + logs |
| **OPA** | 1 core | 512MB | 5GB | Policy engine |
| **Redis** | 1 core | 2GB | 10GB | Sessions + cache |
| **KAS** | 1 core | 1GB | 10GB | Key service |
| **Prometheus** | 2 cores | 4GB | 100GB | Metrics (30-day retention) |
| **Grafana** | 1 core | 1GB | 10GB | Dashboards |
| **Load Balancer** | 2 cores | 2GB | 10GB | Nginx/HAProxy |
| **TOTAL** | **22 cores** | **28GB** | **335GB** | |

### Recommended Production Specs

- **CPU**: 32 cores total (50% headroom)
- **RAM**: 48GB total (70% utilization target)
- **Disk**: 500GB SSD (fast I/O for databases)
- **Network**: 1 Gbps minimum, 10 Gbps recommended
- **Load Balancer**: 2+ instances (HA)
- **Redundancy**: All services 2x replicas minimum

---

## Pre-Deployment Checklist

### Security

- [ ] TLS certificates obtained (Let's Encrypt or commercial CA)
- [ ] mTLS certificates generated for KAS (see `kas/MTLS-PRODUCTION-REQUIREMENT.md`)
- [ ] HSM/KMS integrated (replace simulated KMS)
- [ ] Secrets stored in Vault/AWS Secrets Manager (not `.env` files)
- [ ] Database encryption at rest enabled
- [ ] Database encryption in transit enabled (TLS)
- [ ] Firewall rules configured (allow only necessary ports)
- [ ] DDoS protection enabled (Cloudflare, AWS Shield)
- [ ] Rate limiting configured (per IP, per user)
- [ ] Security headers configured (CSP, HSTS, X-Frame-Options)

### Compliance

- [ ] STANAG 4778 compliance verified (metadata signing)
- [ ] ACP-240 compliance verified (attribute-based access control)
- [ ] Audit logging enabled (90-day retention minimum)
- [ ] PII minimization verified (only uniqueID logged)
- [ ] Data residency requirements met
- [ ] Backup procedures documented
- [ ] Incident response plan created

### Testing

- [ ] All 175 OPA tests passing
- [ ] All 29 crypto tests passing
- [ ] All 19 MFA enrollment tests passing
- [ ] Load testing completed (100 req/s sustained)
- [ ] Penetration testing completed
- [ ] Failover testing completed
- [ ] Backup restore tested

---

## Service Dependencies

### Critical Path

```
Keycloak → PostgreSQL (keycloak_db)
Backend → Keycloak (auth), OPA (authz), MongoDB (resources), Redis (sessions)
OPA → (standalone, no dependencies)
KAS → Backend (policy check), MongoDB (audit)
Frontend → Backend (API)
```

**Startup Order**:
1. PostgreSQL, MongoDB, Redis
2. Keycloak
3. OPA
4. Backend
5. KAS
6. Frontend
7. Prometheus, Grafana (monitoring)

### External Dependencies

- **IdPs**: 10 nation identity providers (configured in Keycloak)
- **HSM/KMS**: AWS KMS, Azure Key Vault, or on-prem HSM
- **Email**: SMTP server for alerts
- **DNS**: DNS records for all services
- **NTP**: Time synchronization (critical for OTP and JWT expiry)

---

## Security Hardening

### 1. TLS/HTTPS Configuration

**Nginx Reverse Proxy** (`/etc/nginx/sites-available/dive-v3`):

```nginx
server {
    listen 443 ssl http2;
    server_name dive.example.mil;

    # TLS configuration
    ssl_certificate /etc/nginx/ssl/dive-v3.crt;
    ssl_certificate_key /etc/nginx/ssl/dive-v3.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Content-Security-Policy "default-src 'self'" always;

    # Rate limiting
    limit_req zone=api_limit burst=20 nodelay;

    # Frontend
    location / {
        proxy_pass http://frontend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api/ {
        proxy_pass http://backend:4000;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Keycloak
    location /auth/ {
        proxy_pass http://keycloak:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name dive.example.mil;
    return 301 https://$server_name$request_uri;
}
```

### 2. Database Security

**PostgreSQL** (`/var/lib/postgresql/data/postgresql.conf`):

```ini
# Network encryption
ssl = on
ssl_cert_file = '/etc/postgresql/ssl/server.crt'
ssl_key_file = '/etc/postgresql/ssl/server.key'
ssl_ca_file = '/etc/postgresql/ssl/ca.crt'

# Authentication
password_encryption = scram-sha-256
ssl_min_protocol_version = 'TLSv1.2'

# Connection limits
max_connections = 200
superuser_reserved_connections = 3

# Performance
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 64MB
```

**MongoDB** (`/etc/mongod.conf`):

```yaml
security:
  authorization: enabled
  
net:
  ssl:
    mode: requireSSL
    PEMKeyFile: /etc/mongodb/ssl/mongodb.pem
    CAFile: /etc/mongodb/ssl/ca.pem

setParameter:
  authenticationMechanisms: SCRAM-SHA-256

storage:
  wiredTiger:
    engineConfig:
      cacheSizeGB: 2
```

### 3. mTLS for KAS

See `kas/MTLS-PRODUCTION-REQUIREMENT.md` for complete mTLS setup.

**Quick Summary**:
```bash
# Generate certificates
openssl req -x509 -newkey rsa:4096 -keyout ka

s-key.pem -out kas-cert.pem -days 365 -nodes

# Configure KAS
# In kas/src/server.ts
const httpsOptions = {
  key: fs.readFileSync('/etc/kas/ssl/kas-key.pem'),
  cert: fs.readFileSync('/etc/kas/ssl/kas-cert.pem'),
  ca: fs.readFileSync('/etc/kas/ssl/ca.pem'),
  requestCert: true,
  rejectUnauthorized: true
};

https.createServer(httpsOptions, app).listen(8080);
```

### 4. HSM/KMS Integration

**AWS KMS Integration** (replace simulated KMS):

```typescript
// backend/src/services/kms.service.ts
import { KMSClient, GenerateDataKeyCommand, DecryptCommand } from "@aws-sdk/client-kms";

const kmsClient = new KMSClient({ region: process.env.AWS_REGION });

async function generateKEK(): Promise<string> {
  const command = new GenerateDataKeyCommand({
    KeyId: process.env.AWS_KMS_KEY_ID,
    KeySpec: 'AES_256'
  });
  
  const { CiphertextBlob } = await kmsClient.send(command);
  return Buffer.from(CiphertextBlob!).toString('base64');
}
```

---

## Environment Configuration

### Production Environment Variables

Create `/etc/dive-v3/.env.production`:

```bash
# Environment
NODE_ENV=production

# URLs
FRONTEND_URL=https://dive.example.mil
BACKEND_URL=https://dive.example.mil/api
KEYCLOAK_URL=https://dive.example.mil/auth
OPA_URL=http://opa:8181
KAS_URL=https://kas.example.mil:8080

# Database - PostgreSQL
POSTGRES_HOST=postgres.example.mil
POSTGRES_PORT=5432
POSTGRES_DB=dive_v3_app
POSTGRES_USER=dive_app_user
POSTGRES_PASSWORD=${VAULT:secret/dive-v3/postgres-password}

# Database - MongoDB
MONGODB_URI=mongodb://dive_app_user:${VAULT:secret/dive-v3/mongodb-password}@mongodb.example.mil:27017/dive_v3_resources?authSource=admin&ssl=true

# Redis
REDIS_URL=redis://:${VAULT:secret/dive-v3/redis-password}@redis.example.mil:6379
REDIS_TLS=true

# Keycloak
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=${VAULT:secret/dive-v3/keycloak-admin-password}

# NextAuth
NEXTAUTH_SECRET=${VAULT:secret/dive-v3/nextauth-secret}
NEXTAUTH_URL=https://dive.example.mil

# AWS KMS (production key management)
AWS_REGION=us-east-1
AWS_KMS_KEY_ID=arn:aws:kms:us-east-1:ACCOUNT:key/KEY-ID

# Monitoring
PROMETHEUS_URL=http://prometheus:9090
GRAFANA_URL=http://grafana:3000

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

**Secrets Management**: Use Vault, AWS Secrets Manager, or Azure Key Vault. Never commit secrets to Git.

---

## Deployment Steps

### Step 1: Prepare Infrastructure

```bash
# Create directory structure
mkdir -p /opt/dive-v3/{config,data,logs,backups}

# Set permissions
chown -R dive-user:dive-group /opt/dive-v3

# Copy configuration files
cp docker-compose.prod.yml /opt/dive-v3/docker-compose.yml
cp .env.production /opt/dive-v3/.env

# Create SSL directories
mkdir -p /opt/dive-v3/ssl/{nginx,postgres,mongodb,kas}
```

### Step 2: Deploy Databases

```bash
cd /opt/dive-v3

# Start databases
docker-compose up -d postgres mongodb redis

# Wait for health
docker-compose ps | grep healthy

# Initialize schemas
docker exec dive-v3-postgres psql -U postgres -f /docker-entrypoint-initdb.d/schema.sql

# Create MongoDB indexes
docker exec dive-v3-mongo mongosh -u admin -p "$MONGODB_PASSWORD" /docker-entrypoint-initdb.d/indexes.js
```

### Step 3: Deploy Keycloak

```bash
# Start Keycloak
docker-compose up -d keycloak

# Wait for startup
until docker exec dive-v3-keycloak curl -sf http://localhost:8080/health; do sleep 5; done

# Apply Terraform configuration
cd terraform
terraform init
terraform plan -out=keycloak.tfplan
terraform apply keycloak.tfplan
```

### Step 4: Deploy Backend Services

```bash
# Start OPA
docker-compose up -d opa

# Verify policies loaded
docker exec dive-v3-opa curl -s http://localhost:8181/v1/policies | jq .

# Start Backend API
docker-compose up -d backend

# Verify health
curl -sf https://dive.example.mil/api/health

# Start KAS
docker-compose up -d kas

# Verify mTLS
curl --cert /opt/dive-v3/ssl/client.pem --key /opt/dive-v3/ssl/client-key.pem \
  https://kas.example.mil:8080/health
```

### Step 5: Deploy Frontend

```bash
# Build production frontend
cd frontend
npm run build

# Start frontend
docker-compose up -d frontend

# Verify
curl -sf https://dive.example.mil
```

### Step 6: Deploy Monitoring

```bash
# Start monitoring stack
docker-compose up -d prometheus grafana alertmanager

# Access Grafana
open https://dive.example.mil:3001
# Login: admin / (check Vault for password)

# Import dashboards
# Dashboards → Import → Upload JSON files from monitoring/grafana/dashboards/
```

### Step 7: Verify Deployment

```bash
# Run health checks
./scripts/health-check.sh

# Expected output:
# ✅ Frontend: Healthy
# ✅ Backend: Healthy  
# ✅ Keycloak: Healthy
# ✅ PostgreSQL: Healthy
# ✅ MongoDB: Healthy
# ✅ Redis: Healthy
# ✅ OPA: Healthy
# ✅ KAS: Healthy
# ✅ Prometheus: Healthy
# ✅ Grafana: Healthy
```

---

## Monitoring & Alerting

### Prometheus Targets

Access: https://dive.example.mil:9090/targets

**Expected Status**: All targets "UP"

### Grafana Dashboards

Access: https://dive.example.mil:3001

**Dashboards**:
1. DIVE V3 Overview
2. Authorization Performance
3. Cryptographic Operations
4. Database Performance
5. MFA Enrollment Metrics

### Critical Alerts

Configure in AlertManager (`monitoring/alertmanager.yml`):

- **PagerDuty**: Critical service failures
- **Slack**: Warning alerts
- **Email**: Daily summaries

---

## Backup & Disaster Recovery

### Automated Backups

**PostgreSQL** (daily at 2 AM):
```bash
# /etc/cron.d/dive-v3-postgres-backup
0 2 * * * postgres pg_dump -U postgres -Fc keycloak_db > /backups/keycloak_$(date +\%Y\%m\%d).dump
0 2 * * * postgres pg_dump -U postgres -Fc dive_v3_app > /backups/app_$(date +\%Y\%m\%d).dump
```

**MongoDB** (daily at 3 AM):
```bash
# /etc/cron.d/dive-v3-mongodb-backup
0 3 * * * mongodb mongodump --uri="mongodb://..." --archive=/backups/mongodb_$(date +\%Y\%m\%d).archive --gzip
```

**Retention**: 30 days local, 90 days offsite (S3/Azure Blob)

### Disaster Recovery

**RTO** (Recovery Time Objective): 4 hours  
**RPO** (Recovery Point Objective): 24 hours

**Recovery Steps**:
1. Restore databases from latest backup
2. Redeploy services from Docker images
3. Restore Terraform state
4. Verify health checks
5. Run smoke tests

---

## Troubleshooting

See `RUNBOOK.md` for detailed troubleshooting procedures.

**Quick Checks**:

```bash
# Check all service health
docker-compose ps

# Check logs
docker-compose logs -f backend
docker-compose logs -f keycloak

# Check Prometheus targets
curl https://dive.example.mil:9090/api/v1/targets | jq '.data.activeTargets[] | {job, health}'

# Check OPA policies
docker exec dive-v3-opa opa test /policies -v

# Check database connections
docker exec dive-v3-postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"
docker exec dive-v3-mongo mongosh -u admin --eval "db.serverStatus().connections"
```

---

## Production Support

**Support Team**: dive-support@example.mil  
**On-Call**: PagerDuty rotation  
**Escalation**: See incident response plan

**SLA Targets**:
- P1 (Critical): 1-hour response, 4-hour resolution
- P2 (High): 4-hour response, 24-hour resolution
- P3 (Medium): 1-day response, 3-day resolution
- P4 (Low): 3-day response, 1-week resolution

---

**Document Version**: 1.0  
**Last Updated**: October 30, 2025  
**Next Review**: January 30, 2026

