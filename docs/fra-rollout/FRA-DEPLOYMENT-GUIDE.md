# FRA Instance Deployment Guide

## Overview
This guide provides step-by-step instructions for deploying and operating the FRA instance of DIVE V3, including federation setup with the USA instance.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Infrastructure Setup](#infrastructure-setup)
3. [Deployment Steps](#deployment-steps)
4. [Configuration](#configuration)
5. [Validation](#validation)
6. [Operations](#operations)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Tools
- Docker & Docker Compose (v2.20+)
- Cloudflared CLI (latest)
- Git
- OpenSSL
- jq (for JSON processing)
- curl

### Required Access
- Cloudflare account with Zero Trust access
- GitHub repository access
- Domain control (dive25.com)
- Server/VM with 8GB+ RAM

### Network Requirements
- Ports: 3001 (Frontend), 4001 (Backend), 8443 (Keycloak), 8181 (OPA), 8081 (KAS)
- HTTPS certificates (managed by Cloudflare)
- Internet connectivity for federation

## Infrastructure Setup

### 1. Clone Repository
```bash
git clone https://github.com/albeach/DIVE-V3.git
cd DIVE-V3
```

### 2. Environment Configuration
```bash
# Copy and configure FRA environment
cp .env.example .env.fra
vim .env.fra

# Key variables to set:
NEXT_PUBLIC_KEYCLOAK_URL=https://fra-idp.dive25.com
NEXT_PUBLIC_KEYCLOAK_REALM=dive-v3-broker-fra
NEXT_PUBLIC_APP_URL=https://fra-app.dive25.com
BACKEND_URL=https://fra-api.dive25.com
KAS_URL=https://fra-kas.dive25.com
```

### 3. Cloudflare Tunnel Setup
```bash
# Run tunnel setup script
./scripts/setup-fra-tunnel.sh

# This will:
# - Create primary tunnel (dive-v3-fra)
# - Create standby tunnel (dive-v3-fra-standby)
# - Configure DNS records
# - Set up health checks
```

### 4. Docker Network
```bash
# Create isolated network for FRA services
docker network create dive-fra-network --subnet=172.19.0.0/16
```

## Deployment Steps

### Phase 1: Core Services

#### Deploy Keycloak
```bash
# Start Keycloak with PostgreSQL
docker-compose -f docker-compose.fra.yml up -d keycloak-fra postgres-fra

# Wait for health
./scripts/wait-for-service.sh keycloak-fra 8443

# Import realm configuration
./scripts/setup-fra-keycloak.sh
```

#### Deploy MongoDB
```bash
# Start MongoDB
docker-compose -f docker-compose.fra.yml up -d mongodb-fra

# Initialize with sample data
docker exec -i dive-v3-mongodb-fra mongosh < scripts/init-fra-mongodb.js
```

#### Deploy OPA
```bash
# Start OPA service
docker-compose -f docker-compose.fra.yml up -d opa-fra

# Load French authorization policy
curl -X PUT http://localhost:8182/v1/policies/fra-authorization \
  --data-binary @policies/fra-authorization-policy.rego
```

### Phase 2: Application Services

#### Deploy Backend API
```bash
# Build and start backend
docker-compose -f docker-compose.fra.yml up -d backend-fra

# Verify health
curl http://localhost:4001/health
```

#### Deploy KAS
```bash
# Deploy Key Access Service
./scripts/deploy-fra-kas.sh

# Verify KAS health
curl http://localhost:8081/health
```

#### Deploy Frontend
```bash
# Start Next.js frontend
docker-compose -f docker-compose.fra.yml up -d frontend-fra

# Verify accessibility
curl -I http://localhost:3001
```

### Phase 3: Federation Setup

#### Configure Federation Service
```bash
# Deploy federation components
./scripts/deploy-fra-federation.sh

# Start sync scheduler
curl -X POST http://localhost:4001/federation/scheduler/start
```

#### Exchange Federation Credentials
```bash
# Generate federation token
FEDERATION_SECRET=$(openssl rand -base64 32)
echo "Federation Secret: $FEDERATION_SECRET"

# Configure in both FRA and USA instances
# Add to .env.fra and .env.usa
```

## Configuration

### Keycloak Configuration

#### Test Users
| Username | Password | Clearance | Country | COI |
|----------|----------|-----------|---------|-----|
| marie.dubois | Test123! | SECRET_DEFENSE | FRA | NATO-COSMIC |
| pierre.martin | Test123! | CONFIDENTIEL_DEFENSE | FRA | NATO |
| jacques.bernard | Test123! | TRES_SECRET_DEFENSE | FRA | NATO-COSMIC, EU |
| admin | admin | TOP_SECRET | FRA | ALL |

#### Identity Providers
- **Internal**: Username/password with WebAuthn
- **SAML**: French military IdP (when configured)
- **Federation**: USA instance trust

### OPA Policies

#### French Clearance Mapping
```rego
clearance_map := {
    "NON_PROTEGE": "UNCLASSIFIED",
    "CONFIDENTIEL_DEFENSE": "CONFIDENTIAL",
    "SECRET_DEFENSE": "SECRET",
    "TRES_SECRET_DEFENSE": "TOP_SECRET"
}
```

#### Resource Namespacing
- All FRA resources must use `FRA-` prefix
- Origin realm tracked: `originRealm: "FRA"`
- Version control for conflict resolution

### Cloudflare Configuration

#### DNS Records
```
fra-app.dive25.com    → Tunnel (dive-v3-fra)
fra-api.dive25.com    → Tunnel (dive-v3-fra)
fra-idp.dive25.com    → Tunnel (dive-v3-fra)
fra-kas.dive25.com    → Tunnel (dive-v3-fra)
```

#### Zero Trust Policies
1. **FRA App Access**: Authenticated users only
2. **FRA API Access**: Service tokens + authenticated users
3. **FRA IdP Access**: Public (login page)
4. **FRA KAS Access**: Service tokens only

## Validation

### Run E2E Tests
```bash
# Basic validation
./scripts/test-fra-tunnel.sh
./scripts/test-fra-keycloak.sh
./scripts/test-fra-backend.sh
./scripts/test-fra-federation.sh
./scripts/test-fra-kas.sh

# Comprehensive E2E validation
./scripts/e2e-fra-validation.sh --verbose

# With performance and security tests
./scripts/e2e-fra-validation.sh --performance --security
```

### Verify Federation
```bash
# Check federation status
curl http://localhost:4001/federation/status

# Trigger manual sync
curl -X POST http://localhost:4001/federation/sync \
  -d '{"targetRealm": "USA"}'

# View sync history
curl http://localhost:4001/federation/sync/history
```

### Check Audit Logs
```bash
# Backend audit
curl http://localhost:4001/api/audit/recent

# KAS audit with divergence stats
curl http://localhost:8081/keys/audit

# Federation audit
curl http://localhost:4001/federation/sync/history
```

## Operations

### Daily Operations

#### Health Monitoring
```bash
# Check all services
docker-compose -f docker-compose.fra.yml ps

# Service health endpoints
curl http://localhost:3001/api/health  # Frontend
curl http://localhost:4001/health      # Backend
curl http://localhost:8081/health      # KAS
curl http://localhost:8182/health      # OPA
```

#### Log Review
```bash
# View logs by service
docker logs dive-v3-frontend-fra -f
docker logs dive-v3-backend-fra -f
docker logs dive-v3-kas-fra -f

# Search for errors
docker logs dive-v3-backend-fra 2>&1 | grep ERROR

# Check divergences
docker logs dive-v3-kas-fra 2>&1 | grep DIVERGENCE
```

### Maintenance Tasks

#### Certificate Rotation
```bash
# Cloudflare manages external certificates
# Internal certificates (if any):
./scripts/rotate-internal-certs.sh
```

#### Database Backup
```bash
# MongoDB backup
docker exec dive-v3-mongodb-fra mongodump \
  --out /backup/$(date +%Y%m%d)

# PostgreSQL backup
docker exec dive-v3-postgres-fra pg_dump \
  -U keycloak keycloak > backup/keycloak-$(date +%Y%m%d).sql
```

#### Policy Updates
```bash
# Update OPA policy
curl -X PUT http://localhost:8182/v1/policies/fra-authorization \
  --data-binary @policies/fra-authorization-policy.rego

# Verify policy loaded
curl http://localhost:8182/v1/policies
```

### Incident Response

#### Service Recovery
```bash
# Restart specific service
docker-compose -f docker-compose.fra.yml restart backend-fra

# Full stack restart (ordered)
docker-compose -f docker-compose.fra.yml restart postgres-fra
sleep 10
docker-compose -f docker-compose.fra.yml restart keycloak-fra
docker-compose -f docker-compose.fra.yml restart mongodb-fra
docker-compose -f docker-compose.fra.yml restart opa-fra
docker-compose -f docker-compose.fra.yml restart backend-fra
docker-compose -f docker-compose.fra.yml restart kas-fra
docker-compose -f docker-compose.fra.yml restart frontend-fra
```

#### Tunnel Failover
```bash
# Check tunnel status
cloudflared tunnel list

# Manual failover to standby
systemctl stop cloudflared@dive-v3-fra
systemctl start cloudflared@dive-v3-fra-standby

# Verify failover
curl -I https://fra-app.dive25.com
```

#### Audit Investigation
```bash
# Find specific correlation ID
CORRELATION_ID="abc-123-def"
docker logs dive-v3-backend-fra 2>&1 | grep $CORRELATION_ID
docker logs dive-v3-kas-fra 2>&1 | grep $CORRELATION_ID

# Export audit trail
curl "http://localhost:4001/api/audit/export?correlationId=$CORRELATION_ID" \
  > audit-$CORRELATION_ID.json
```

## Troubleshooting

### Common Issues

#### 1. Keycloak Connection Failed
```bash
# Check Keycloak is running
docker ps | grep keycloak-fra

# Check logs
docker logs dive-v3-keycloak-fra

# Verify realm imported
curl https://fra-idp.dive25.com/realms/dive-v3-broker-fra
```

#### 2. Federation Sync Failing
```bash
# Check federation endpoint
curl http://localhost:4001/federation/status

# Verify USA endpoint accessible
curl https://dev-api.dive25.com/federation/status

# Check credentials
grep FEDERATION_JWT_SECRET .env.fra
```

#### 3. KAS Divergence Detected
```bash
# View divergence details
curl http://localhost:8081/keys/audit | \
  jq '.entries[] | select(.divergence == true)'

# Check OPA policy
curl http://localhost:8182/v1/data/dive/authorization

# Compare decisions
./scripts/debug-divergence.sh
```

#### 4. Performance Degradation
```bash
# Check resource usage
docker stats

# Review slow queries
docker logs dive-v3-mongodb-fra 2>&1 | grep slow

# Check connection pools
curl http://localhost:4001/metrics
```

### Debug Tools

#### Enable Debug Logging
```bash
# Set in .env.fra
LOG_LEVEL=debug
DEBUG=express:*

# Restart services
docker-compose -f docker-compose.fra.yml restart
```

#### Test Authentication Flow
```bash
# Get Keycloak token
./scripts/get-test-token.sh marie.dubois Test123!

# Test API with token
TOKEN=$(./scripts/get-test-token.sh marie.dubois Test123!)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4001/api/resources
```

#### Verify Policy Decision
```bash
# Test OPA directly
cat > /tmp/opa-test.json << EOF
{
  "input": {
    "subject": {
      "clearance": "SECRET",
      "countryOfAffiliation": "FRA"
    },
    "resource": {
      "classification": "SECRET",
      "releasabilityTo": ["FRA", "USA"]
    },
    "action": "read"
  }
}
EOF

curl -X POST http://localhost:8182/v1/data/dive/authorization/decision \
  -d @/tmp/opa-test.json
```

## Performance Tuning

### Database Optimization
```bash
# Add indexes
docker exec -i dive-v3-mongodb-fra mongosh << EOF
use dive-v3-fra;
db.resources.createIndex({ "resourceId": 1 });
db.resources.createIndex({ "classification": 1, "releasabilityTo": 1 });
db.decision_logs.createIndex({ "correlationId": 1 });
EOF
```

### Connection Pooling
```yaml
# In docker-compose.fra.yml
environment:
  - DB_POOL_MIN=10
  - DB_POOL_MAX=100
  - REDIS_MAX_CLIENTS=50
```

### Caching Strategy
```bash
# Enable Redis caching
docker-compose -f docker-compose.fra.yml up -d redis-fra

# Configure in .env.fra
REDIS_URL=redis://localhost:6379
CACHE_TTL=60
```

## Security Hardening

### Network Security
```bash
# Restrict internal network
iptables -A INPUT -s 172.19.0.0/16 -j ACCEPT
iptables -A INPUT -p tcp --dport 8443 -j DROP
```

### Secret Management
```bash
# Rotate secrets quarterly
./scripts/rotate-secrets.sh

# Use Docker secrets in production
docker secret create fra_jwt_key jwt.key
docker secret create fra_db_pass db_password.txt
```

### Audit Compliance
```bash
# Export audit logs for compliance
./scripts/export-audit-logs.sh --start 2025-01-01 --end 2025-12-31

# Generate compliance report
./scripts/generate-compliance-report.sh
```

## Appendix

### Port Reference
| Service | Internal Port | External URL |
|---------|--------------|--------------|
| Frontend | 3001 | https://fra-app.dive25.com |
| Backend | 4001 | https://fra-api.dive25.com |
| Keycloak | 8443 | https://fra-idp.dive25.com |
| KAS | 8081 | https://fra-kas.dive25.com |
| OPA | 8182 | Internal only |
| MongoDB | 27018 | Internal only |
| PostgreSQL | 5433 | Internal only |

### Environment Variables
See `.env.fra` for complete list

### Scripts Reference
- `setup-fra-tunnel.sh` - Cloudflare tunnel setup
- `setup-fra-keycloak.sh` - Keycloak realm configuration
- `deploy-fra-backend.sh` - Backend deployment
- `deploy-fra-federation.sh` - Federation setup
- `deploy-fra-kas.sh` - KAS deployment
- `test-fra-*.sh` - Component testing
- `e2e-fra-validation.sh` - Full E2E testing

---

*Last Updated: 2025-11-24*
*Version: 1.0*









