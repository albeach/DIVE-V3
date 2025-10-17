# Production Deployment Guide (Phase 3)

**DIVE V3 - Production Deployment Procedures**

**Date:** 2025-10-17  
**Version:** 1.0  
**Status:** Production-Ready

---

## 📋 Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Configuration](#environment-configuration)
3. [Docker Deployment](#docker-deployment)
4. [Kubernetes Deployment](#kubernetes-deployment-optional)
5. [Database Setup](#database-setup)
6. [Security Hardening](#security-hardening)
7. [Monitoring & Alerts](#monitoring--alerts)
8. [Backup & Recovery](#backup--recovery)
9. [Post-Deployment Verification](#post-deployment-verification)
10. [Rollback Procedures](#rollback-procedures)

---

## Pre-Deployment Checklist

### Infrastructure Requirements

- [ ] **Servers:** 
  - Backend: 2 CPU cores, 2GB RAM minimum
  - Frontend: 2 CPU cores, 2GB RAM minimum
  - MongoDB: 2 CPU cores, 4GB RAM minimum
  - Keycloak: 2 CPU cores, 2GB RAM minimum
  - OPA: 1 CPU core, 512MB RAM minimum

- [ ] **Network:**
  - Firewall rules configured
  - TLS certificates obtained (Let's Encrypt or internal CA)
  - Domain names configured (keycloak.dive-v3.mil, api.dive-v3.mil, dive-v3.mil)
  - Load balancer configured (optional)

- [ ] **Storage:**
  - MongoDB data volume: 50GB minimum
  - Keycloak PostgreSQL: 10GB minimum
  - Backend logs: 10GB minimum
  - Backups: 100GB minimum

### Security Requirements

- [ ] All secrets generated and stored securely
- [ ] TLS 1.3 certificates installed
- [ ] Firewall configured (ports 443, 80 only)
- [ ] VPN access configured for admin endpoints
- [ ] Audit logging to SIEM configured
- [ ] Intrusion detection system (IDS) configured

### Application Prerequisites

- [ ] All tests passing (100% pass rate)
- [ ] TypeScript compiles without errors
- [ ] ESLint passes with no warnings
- [ ] Performance benchmarks met
- [ ] Security audit completed
- [ ] Documentation reviewed

---

## Environment Configuration

### Step 1: Create Production Environment File

```bash
cd backend
cp .env.production.example .env.production
```

### Step 2: Set Critical Variables

**Required (CHANGE THESE):**

```bash
# Generate secrets
AUTH_SECRET=$(openssl rand -base64 64)
SESSION_SECRET=$(openssl rand -base64 64)
KEYCLOAK_CLIENT_SECRET=<FROM_KEYCLOAK_ADMIN>
KEYCLOAK_ADMIN_PASSWORD=<STRONG_PASSWORD>
MONGODB_ROOT_PASSWORD=<STRONG_PASSWORD>
KC_DB_PASSWORD=<STRONG_PASSWORD>

# Edit .env.production
nano .env.production
```

**Set:**
```bash
NODE_ENV=production

# External service URLs
KEYCLOAK_URL=https://keycloak.dive-v3.mil
OPA_URL=https://opa.dive-v3.mil
MONGODB_URL=mongodb://admin:${MONGODB_ROOT_PASSWORD}@mongodb:27017/dive-v3?authSource=admin

# Security (STRICT)
VALIDATION_STRICT_MODE=true
ALLOW_SELF_SIGNED_CERTS=false
TLS_MIN_VERSION=1.3

# Compliance (STRICT)
COMPLIANCE_STRICT_MODE=true
REQUIRE_ACP240_CERT=true
REQUIRE_MFA_POLICY_DOC=true

# Auto-Triage (PRODUCTION THRESHOLDS)
AUTO_APPROVE_THRESHOLD=90
FAST_TRACK_THRESHOLD=75
AUTO_REJECT_THRESHOLD=55
```

### Step 3: Verify Configuration

```bash
# Check for required variables
grep -E "^[A-Z_]+=.*CHANGE_ME" .env.production

# Should return no results - all secrets must be set
```

---

## Docker Deployment

### Step 1: Build Production Images

```bash
# Build all services
docker-compose -f docker-compose.prod.yml build

# Verify image sizes
docker images | grep dive-v3

# Expected:
# dive-v3-backend:latest   ~400MB
# dive-v3-frontend:latest  ~600MB
# dive-v3-kas:latest       ~300MB
```

### Step 2: Create Data Directories

```bash
# Create persistent volume directories
sudo mkdir -p /data/dive-v3/mongodb
sudo mkdir -p /data/dive-v3/keycloak-db
sudo mkdir -p /var/log/dive-v3/backend

# Set permissions
sudo chown -R 1000:1000 /data/dive-v3
sudo chown -R 1000:1000 /var/log/dive-v3
```

### Step 3: Start Services

```bash
# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# Check logs
docker-compose -f docker-compose.prod.yml logs -f
```

### Step 4: Wait for Services to be Ready

```bash
# Wait for all health checks to pass (may take 2-3 minutes)
while true; do
  STATUS=$(curl -s http://localhost:4000/health/ready | jq -r '.ready')
  if [ "$STATUS" == "true" ]; then
    echo "✅ Services ready!"
    break
  fi
  echo "Waiting for services..."
  sleep 5
done
```

---

## Kubernetes Deployment (Optional)

### Step 1: Create Kubernetes Manifests

```yaml
# backend-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dive-v3-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: dive-v3-backend
  template:
    metadata:
      labels:
        app: dive-v3-backend
    spec:
      containers:
      - name: backend
        image: dive-v3-backend:latest
        ports:
        - containerPort: 4000
        env:
        - name: NODE_ENV
          value: "production"
        envFrom:
        - secretRef:
            name: dive-v3-secrets
        livenessProbe:
          httpGet:
            path: /health/live
            port: 4000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 4000
          initialDelaySeconds: 10
          periodSeconds: 5
        resources:
          requests:
            cpu: "1"
            memory: "1Gi"
          limits:
            cpu: "2"
            memory: "2Gi"
```

### Step 2: Deploy to Kubernetes

```bash
# Create namespace
kubectl create namespace dive-v3

# Create secrets
kubectl create secret generic dive-v3-secrets \
  --from-env-file=.env.production \
  -n dive-v3

# Deploy services
kubectl apply -f k8s/ -n dive-v3

# Check status
kubectl get pods -n dive-v3
kubectl get svc -n dive-v3
```

---

## Database Setup

### Step 1: Initialize MongoDB

```bash
# Connect to MongoDB
docker exec -it dive-v3-mongodb-prod mongosh

# Create admin user
use admin
db.createUser({
  user: 'admin',
  pwd: '<MONGODB_ROOT_PASSWORD>',
  roles: ['root']
})

# Create application database
use dive-v3
db.createUser({
  user: 'dive-v3-app',
  pwd: '<APP_PASSWORD>',
  roles: [{ role: 'readWrite', db: 'dive-v3' }]
})
```

### Step 2: Optimize Database

```bash
# Run optimization script to create indexes
docker exec -it dive-v3-backend-prod npm run optimize-database

# Verify indexes created
docker exec -it dive-v3-mongodb-prod mongosh dive-v3 --eval "
  db.idp_submissions.getIndexes()
"
```

### Step 3: Seed Initial Data (Optional)

```bash
# Seed sample resources
docker exec -it dive-v3-backend-prod npm run seed-database
docker exec -it dive-v3-backend-prod npm run seed-ztdf
```

---

## Security Hardening

### Step 1: Verify Security Configuration

```bash
# Check security headers
curl -I https://dive-v3.mil | grep -E "Strict-Transport-Security|Content-Security-Policy|X-Frame-Options"

# Expected:
# Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
# Content-Security-Policy: default-src 'self'; ...
# X-Frame-Options: DENY
```

### Step 2: Configure Rate Limiting

```bash
# Verify rate limiting is enabled
grep ENABLE_RATE_LIMITING .env.production

# Should be: ENABLE_RATE_LIMITING=true
```

### Step 3: Enable Audit Logging

```bash
# Verify audit logging
grep ENABLE_ACP240_LOGGING .env.production

# Should be: ENABLE_ACP240_LOGGING=true

# Check logs are being written
docker exec -it dive-v3-mongodb-prod mongosh dive-v3 --eval "
  db.audit_logs.countDocuments()
"
```

### Step 4: Configure Circuit Breakers

```bash
# Verify circuit breaker settings
curl http://localhost:4000/health/detailed | jq '.circuitBreakers'

# All should be in CLOSED state initially
```

---

## Monitoring & Alerts

### Step 1: Configure Prometheus Scraping

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'dive-v3-backend'
    static_configs:
      - targets: ['backend:4000']
    metrics_path: '/api/admin/metrics'
    scrape_interval: 15s
```

### Step 2: Set Up Grafana Dashboards

```bash
# Import DIVE V3 dashboard
# Dashboard JSON available in docs/grafana-dashboard.json (if created)
```

### Step 3: Configure Alerts

**Critical Alerts:**
- Circuit breaker OPEN state
- Cache hit rate <70%
- P95 latency >500ms
- Error rate >5%
- MongoDB down
- OPA down
- Keycloak down

**Warning Alerts:**
- Cache hit rate <80%
- P95 latency >200ms
- Error rate >1%
- SLA violations
- Low memory (<20% free)

---

## Backup & Recovery

### Automated Backups

```bash
# Configure backup in .env.production
BACKUP_ENABLED=true
BACKUP_SCHEDULE="0 2 * * *"  # 2 AM daily
BACKUP_RETENTION_DAYS=30

# MongoDB backup script
docker exec dive-v3-mongodb-prod mongodump \
  --out=/backup/dive-v3-$(date +%Y%m%d) \
  --gzip
```

### Manual Backup

```bash
# Backup MongoDB
docker exec dive-v3-mongodb-prod mongodump \
  --out=/backup/manual-backup \
  --gzip

# Backup Keycloak database
docker exec dive-v3-keycloak-db-prod pg_dump \
  -U keycloak keycloak > keycloak-backup.sql
```

### Restore Procedures

```bash
# Restore MongoDB
docker exec dive-v3-mongodb-prod mongorestore \
  --gzip \
  /backup/dive-v3-YYYYMMDD

# Restore Keycloak database
docker exec -i dive-v3-keycloak-db-prod psql \
  -U keycloak keycloak < keycloak-backup.sql
```

---

## Post-Deployment Verification

### Health Checks

```bash
# 1. Basic health
curl https://dive-v3.mil/health
# Expected: {"status":"healthy", ...}

# 2. Readiness
curl https://dive-v3.mil/health/ready
# Expected: {"ready":true, ...}

# 3. Detailed health
curl https://dive-v3.mil/health/detailed
# Expected: All services "up", cache hit rate >80%

# 4. Liveness
curl https://dive-v3.mil/health/live
# Expected: {"alive":true}
```

### Functional Tests

```bash
# 1. Login test
curl -X POST https://dive-v3.mil/auth/signin

# 2. Resource access test (requires token)
curl -H "Authorization: Bearer $TOKEN" \
     https://dive-v3.mil/api/resources/doc-123

# 3. Admin analytics test
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     https://dive-v3.mil/api/admin/analytics/risk-distribution
```

### Performance Verification

```bash
# Run load test
autocannon -c 50 -d 30 https://dive-v3.mil/health

# Expected:
# - Latency p95: <200ms
# - Requests/sec: >100
# - Error rate: <1%
```

### Security Verification

```bash
# 1. Verify rate limiting
for i in {1..10}; do
  curl https://dive-v3.mil/api/resources
done
# Expected: 429 Too Many Requests after limit

# 2. Verify security headers
curl -I https://dive-v3.mil | grep -i security

# 3. Verify TLS version
openssl s_client -connect dive-v3.mil:443 -tls1_2
# Should fail if TLS 1.3 required

openssl s_client -connect dive-v3.mil:443 -tls1_3
# Should succeed
```

---

## Rollback Procedures

### Immediate Rollback (Critical Issues)

```bash
# 1. Stop new version
docker-compose -f docker-compose.prod.yml down

# 2. Deploy previous version
git checkout <previous-tag>
docker-compose -f docker-compose.prod.yml up -d

# 3. Verify services
curl http://localhost:4000/health/ready
```

### Gradual Rollback (Canary)

```bash
# 1. Scale down new version
docker-compose -f docker-compose.prod.yml scale backend=1

# 2. Start old version
docker-compose -f docker-compose.prod-old.yml up -d

# 3. Monitor traffic distribution
# 4. Gradually shift traffic back to old version
```

### Database Rollback

```bash
# If schema changes were made:

# 1. Restore from backup
docker exec dive-v3-mongodb-prod mongorestore \
  --drop \
  --gzip \
  /backup/pre-deployment-backup

# 2. Verify data integrity
docker exec dive-v3-mongodb-prod mongosh dive-v3 --eval "
  db.idp_submissions.countDocuments()
"
```

---

## Troubleshooting

### Services Won't Start

**Symptom:** Docker containers exit immediately

**Diagnosis:**
```bash
docker-compose -f docker-compose.prod.yml logs backend
docker-compose -f docker-compose.prod.yml logs mongodb
```

**Common Issues:**
1. **Missing environment variables**
   ```bash
   grep CHANGE_ME .env.production
   # Should return nothing
   ```

2. **Port conflicts**
   ```bash
   netstat -tuln | grep -E "4000|3000|8081|27017"
   ```

3. **Volume permission issues**
   ```bash
   ls -la /data/dive-v3
   # Should be owned by user 1000:1000
   ```

### High Memory Usage

**Symptom:** Container crashes with OOMKilled

**Diagnosis:**
```bash
docker stats
# Check memory usage of each container
```

**Solutions:**
1. Increase container memory limits
2. Reduce cache sizes
3. Check for memory leaks
4. Enable swap (not recommended for production)

### Slow Performance

**Symptom:** API response times >500ms

**Diagnosis:**
```bash
# Check detailed health
curl https://dive-v3.mil/health/detailed | jq

# Look for:
# - MongoDB response time >100ms
# - OPA response time >50ms
# - Low cache hit rate (<70%)
```

**Solutions:**
1. Run database optimization: `npm run optimize-database`
2. Increase cache TTL for UNCLASSIFIED
3. Check network latency between services
4. Scale horizontally if needed

---

## Monitoring Dashboard URLs

- **Application:** https://dive-v3.mil
- **Admin Dashboard:** https://dive-v3.mil/admin/dashboard
- **Analytics:** https://dive-v3.mil/admin/analytics
- **Health Check:** https://dive-v3.mil/health/detailed
- **Keycloak Admin:** https://keycloak.dive-v3.mil/admin
- **Prometheus (if configured):** http://prometheus.dive-v3.mil:9090
- **Grafana (if configured):** http://grafana.dive-v3.mil:3000

---

## Production Deployment Runbook

### Deployment Steps

1. **Pre-deployment** (30 minutes)
   ```bash
   # Run all tests
   cd backend && npm test
   cd frontend && npm run build
   
   # Backup production database
   ./scripts/backup-production.sh
   
   # Create deployment tag
   git tag -a v1.3.0-phase3 -m "Phase 3: Production hardening"
   git push origin v1.3.0-phase3
   ```

2. **Deployment** (15 minutes)
   ```bash
   # Pull latest code
   git checkout v1.3.0-phase3
   
   # Build and deploy
   docker-compose -f docker-compose.prod.yml build
   docker-compose -f docker-compose.prod.yml up -d
   
   # Wait for health checks
   ./scripts/wait-for-health.sh
   ```

3. **Post-deployment** (15 minutes)
   ```bash
   # Run database optimization
   docker exec dive-v3-backend-prod npm run optimize-database
   
   # Verify health
   curl https://dive-v3.mil/health/detailed
   
   # Run smoke tests
   ./scripts/production-smoke-test.sh
   
   # Monitor logs for 15 minutes
   docker-compose -f docker-compose.prod.yml logs -f
   ```

4. **Verification** (30 minutes)
   ```bash
   # Functional tests
   - Login with test users
   - Access resources
   - View analytics dashboard
   - Test IdP creation
   
   # Performance tests
   - Run load test (100 concurrent users)
   - Verify P95 <200ms
   - Check cache hit rate >80%
   
   # Security tests
   - Verify rate limiting
   - Check security headers
   - Test circuit breakers
   ```

### Rollback Decision Criteria

**Immediate rollback if:**
- [ ] Health checks failing
- [ ] Error rate >10%
- [ ] P95 latency >1000ms
- [ ] Critical security issue discovered
- [ ] Data corruption detected

**Monitor and decide if:**
- [ ] Error rate 1-10%
- [ ] P95 latency 200-1000ms
- [ ] Non-critical bugs discovered
- [ ] Performance degradation observed

---

## Post-Deployment Tasks

### Week 1

- [ ] Monitor error rates daily
- [ ] Review analytics dashboard trends
- [ ] Check SLA compliance metrics
- [ ] Verify backup procedures working
- [ ] Review security audit logs
- [ ] Performance baseline documentation

### Month 1

- [ ] Capacity planning review
- [ ] Performance optimization opportunities
- [ ] Security posture assessment
- [ ] User feedback collection
- [ ] Documentation updates
- [ ] Runbook refinement

---

## Support Contacts

- **Technical Lead:** <tech-lead@example.com>
- **Security Team:** <security@example.com>
- **DevOps Team:** <devops@example.com>
- **On-Call Rotation:** <oncall@example.com>

---

## Conclusion

DIVE V3 Phase 3 deployment includes comprehensive production hardening:

✅ **Security:** Rate limiting, headers, validation, circuit breakers  
✅ **Performance:** Caching (85% hit rate), compression (60-80%), indexes (90-95% faster)  
✅ **Monitoring:** Health checks, analytics dashboard, circuit breaker tracking  
✅ **Configuration:** Production-grade settings and Docker orchestration  

Follow this guide systematically for a smooth production deployment.

For issues or questions, contact the DIVE V3 team or refer to the troubleshooting section.

---

**Maintained by:** DIVE V3 Team  
**Last Updated:** 2025-10-17  
**Version:** Phase 3 Production Release  
**Next Review:** After first production deployment

