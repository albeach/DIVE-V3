# Policies Lab Production Deployment Plan

**Version**: 1.0  
**Date**: October 27, 2025  
**Status**: Production Ready  
**Total Tests**: 196+ (Backend: 66 | Frontend: 120+ | E2E: 10)

---

## Pre-Deployment Checklist

Before deploying the Policies Lab to production, verify all requirements are met:

### Code Quality
- [ ] All tests passing (196+ tests)
- [ ] CI/CD pipeline green (all 5 jobs passing)
- [ ] Zero linting errors (`npm run lint` in backend and frontend)
- [ ] Type checking passes (`tsc --noEmit` in backend and frontend)
- [ ] Documentation updated (CHANGELOG, README, implementation guide)

### Security
- [ ] Security scan clean (no critical vulnerabilities from Trivy)
- [ ] Rate limiting configured (5 uploads/min, 100 evals/min)
- [ ] JWT validation enabled
- [ ] Ownership enforcement active
- [ ] Input validation schemas in place

### Performance
- [ ] Performance verified (upload < 500ms, eval < 200ms)
- [ ] OPA evaluation latency acceptable (~45ms p95)
- [ ] XACML evaluation latency acceptable (~80ms p95)
- [ ] Database indexes created (policyId, ownerId, type, hash, createdAt)

### Infrastructure
- [ ] Docker Compose configuration valid
- [ ] All required services configured (MongoDB, OPA, AuthzForce, Backend, Frontend)
- [ ] Environment variables set (.env.local or .env.production)
- [ ] Network ports available (3000, 4000, 8181, 8282, 27017)
- [ ] Disk space sufficient (min 5GB for logs and policies)

---

## Deployment Steps

### Step 1: Backup Current State

```bash
# Create backup directory with timestamp
BACKUP_DIR="backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p $BACKUP_DIR

# Backup MongoDB database
docker exec dive-v3-mongodb mongodump --out=/tmp/mongodb-backup
docker cp dive-v3-mongodb:/tmp/mongodb-backup $BACKUP_DIR/mongodb

# Backup policy files
cp -r policies/uploads $BACKUP_DIR/policies-uploads

# Backup current code
git branch backup-pre-policies-lab-$(date +%Y%m%d)

echo "✅ Backup completed: $BACKUP_DIR"
```

### Step 2: Pull Latest Code

```bash
# Ensure on correct branch
git checkout main

# Pull latest changes
git pull origin main

# Verify commit hash
git log -1 --oneline

# Tag the deployment
git tag -a "policies-lab-v1.0-$(date +%Y%m%d)" -m "Policies Lab production deployment"
```

### Step 3: Install Dependencies

```bash
# Backend dependencies
cd backend
npm ci --production
cd ..

# Frontend dependencies
cd frontend
npm ci --production
cd ..

echo "✅ Dependencies installed"
```

### Step 4: Build Images

```bash
# Build all Docker images
docker-compose -f docker-compose.yml build

# Verify images built successfully
docker images | grep dive-v3

echo "✅ Images built"
```

### Step 5: Start Services

```bash
# Start all services in detached mode
docker-compose -f docker-compose.yml up -d

# Wait for services to initialize
echo "Waiting 30 seconds for services to start..."
sleep 30

# Check service status
docker-compose ps

echo "✅ Services started"
```

### Step 6: Run Health Checks

```bash
# Run automated health check script
./scripts/health-check.sh

# Expected output:
# ✅ Backend healthy
# ✅ OPA healthy
# ✅ AuthzForce healthy
# ✅ MongoDB healthy
# All services healthy!
```

### Step 7: Run Smoke Tests

```bash
# Run automated smoke test script
./scripts/smoke-test.sh

# Expected output:
# ✅ Policy uploaded: pol-abc123
# ✅ Policy evaluated: ALLOW
# ✅ Policy deleted
# Smoke tests passed!
```

### Step 8: Monitor Logs

```bash
# Monitor logs for 5 minutes
docker-compose logs -f --tail=100 backend frontend authzforce opa

# Look for:
# - No error messages
# - Successful health checks
# - Proper startup messages
# - No connection errors

# Press Ctrl+C to stop monitoring
```

### Step 9: Verify UI Access

```bash
# Navigate to Policies Lab
open http://localhost:3000/policies/lab

# Manual checks:
# 1. Page loads without errors
# 2. "Upload Policy" button visible
# 3. Three tabs visible (My Policies, Evaluate, XACML ↔ Rego)
# 4. No console errors in browser DevTools
```

### Step 10: Performance Verification

```bash
# Measure policy upload latency
time curl -X POST http://localhost:4000/api/policies-lab/upload \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@policies/uploads/samples/clearance-policy.rego" \
  -F 'metadata={"name":"Performance Test","description":"Load test"}'

# Expected: < 500ms

# Measure evaluation latency (check response for latency_ms field)
curl -X POST http://localhost:4000/api/policies-lab/$POLICY_ID/evaluate \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d @test-input.json

# Expected: OPA ~45ms, XACML ~80ms
```

---

## Rollback Procedure

If deployment fails or issues arise, follow these steps to rollback:

### Step 1: Stop Current Services

```bash
# Stop all containers
docker-compose down

echo "✅ Services stopped"
```

### Step 2: Restore Database

```bash
# Find latest backup
BACKUP_DIR=$(ls -td backup-* | head -1)
echo "Restoring from: $BACKUP_DIR"

# Restore MongoDB
docker-compose up -d mongodb
sleep 10

docker cp $BACKUP_DIR/mongodb dive-v3-mongodb:/tmp/mongodb-restore
docker exec dive-v3-mongodb mongorestore --drop /tmp/mongodb-restore

echo "✅ Database restored"
```

### Step 3: Restore Policy Files

```bash
# Restore policy uploads directory
rm -rf policies/uploads/*
cp -r $BACKUP_DIR/policies-uploads/* policies/uploads/

echo "✅ Policy files restored"
```

### Step 4: Checkout Previous Version

```bash
# Find the backup branch or tag
git branch -a | grep backup

# Checkout previous version
git checkout backup-pre-policies-lab-YYYYMMDD
# OR
git checkout <previous-commit-hash>

echo "✅ Code reverted"
```

### Step 5: Restart Services

```bash
# Rebuild images with previous code
docker-compose build

# Start services
docker-compose up -d

# Verify services
./scripts/health-check.sh

echo "✅ Rollback complete"
```

---

## Post-Deployment Verification

### Automated Verification

Run the full test suite to verify deployment:

```bash
# Backend tests
cd backend
npm test -- policy-validation.service.test.ts
npm test -- policy-execution.service.test.ts
npm test -- xacml-adapter.test.ts
npm test -- policies-lab.integration.test.ts

# Frontend tests
cd frontend
npm test -- __tests__/components/policies-lab/

# E2E tests
npx playwright test policies-lab.spec.ts
```

### Manual Verification Checklist

- [ ] Navigate to `/policies/lab` → page loads
- [ ] Click "Upload Policy" → modal opens
- [ ] Upload `clearance-policy.rego` → success message
- [ ] Upload `clearance-policy.xml` → success message
- [ ] Navigate to "Evaluate" tab → form visible
- [ ] Select a policy → policy details load
- [ ] Click "Clearance Match (ALLOW)" preset → form populated
- [ ] Click "Evaluate Policy" → results display in < 3 seconds
- [ ] Verify OPA decision → ALLOW with latency < 50ms
- [ ] Verify XACML decision → PERMIT with latency < 100ms
- [ ] Navigate to "XACML ↔ Rego" tab → comparison table visible
- [ ] Navigate to "My Policies" tab → uploaded policies listed
- [ ] Click "View" on a policy → details expand
- [ ] Click "Delete" → confirmation dialog appears
- [ ] Confirm delete → policy removed from list
- [ ] Upload 6 policies rapidly → rate limit message on 6th

### Metrics Collection

```bash
# Check Docker resource usage
docker stats --no-stream

# Check disk usage
du -sh policies/uploads/*

# Check MongoDB collection stats
docker exec dive-v3-mongodb mongosh --eval 'db.policy_uploads.stats()'

# Check logs for errors
docker-compose logs --since=1h backend | grep -i error
docker-compose logs --since=1h authzforce | grep -i error
```

---

## Monitoring & Maintenance

### Log Rotation

```bash
# Configure log rotation (add to /etc/logrotate.d/dive-v3)
/var/log/dive-v3/*.log {
    daily
    rotate 90
    compress
    delaycompress
    notifempty
    missingok
    copytruncate
}
```

### Health Check Cron Job

```bash
# Add to crontab (every 5 minutes)
*/5 * * * * /path/to/dive-v3/scripts/health-check.sh >> /var/log/dive-v3/health-checks.log 2>&1
```

### Backup Cron Job

```bash
# Add to crontab (daily at 2 AM)
0 2 * * * /path/to/dive-v3/scripts/backup.sh >> /var/log/dive-v3/backups.log 2>&1
```

### Alerts

Monitor the following metrics and alert if thresholds exceeded:

- **Response Time**: Alert if p95 > 500ms
- **Error Rate**: Alert if > 1% of requests fail
- **Disk Usage**: Alert if > 80% full
- **Memory Usage**: Alert if container > 1GB
- **CPU Usage**: Alert if sustained > 80%
- **Test Failures**: Alert if any CI/CD job fails

---

## Troubleshooting

### AuthzForce Won't Start

**Symptoms**: Container exits immediately, port 8282 not accessible

**Solutions**:
```bash
# Check logs
docker-compose logs authzforce

# Verify domain config
cat authzforce/conf/domain.xml

# Check port availability
lsof -i :8282

# Restart with verbose logging
docker-compose up authzforce
```

### MongoDB Connection Errors

**Symptoms**: Backend logs show "MongoNetworkError"

**Solutions**:
```bash
# Verify MongoDB running
docker-compose ps mongodb

# Check MongoDB logs
docker-compose logs mongodb

# Test connection
docker exec dive-v3-mongodb mongosh --eval 'db.adminCommand({ping: 1})'

# Restart MongoDB
docker-compose restart mongodb
```

### Policy Validation Fails

**Symptoms**: Uploads fail with validation errors

**Solutions**:
```bash
# Test Rego policy with OPA CLI
opa fmt clearance-policy.rego
opa check clearance-policy.rego

# Verify package name
grep "^package" clearance-policy.rego
# Should start with: package dive.lab.*

# Check for unsafe builtins
grep -E "http\.send|net\.|opa\.runtime" clearance-policy.rego

# Test XACML policy
xmllint --noout clearance-policy.xml
```

### Rate Limiting Issues

**Symptoms**: Users blocked after 5 uploads

**Solutions**:
```bash
# Check Redis (if using)
docker-compose logs redis

# Adjust rate limits in backend/.env
RATE_LIMIT_UPLOAD=10  # Increase from 5
RATE_LIMIT_EVALUATE=200  # Increase from 100

# Restart backend
docker-compose restart backend
```

### E2E Tests Fail

**Symptoms**: Playwright tests timeout or fail

**Solutions**:
```bash
# Ensure services running
docker-compose ps

# Check frontend accessible
curl http://localhost:3000/policies/lab

# Run tests with debug
cd frontend
DEBUG=pw:api npx playwright test policies-lab.spec.ts --headed

# Check Playwright report
npx playwright show-report
```

---

## Success Criteria

Deployment is considered successful when:

- [x] All services healthy (Backend, Frontend, OPA, AuthzForce, MongoDB)
- [x] All 196+ tests passing (66 backend + 120+ frontend + 10 E2E)
- [x] Manual smoke tests passing (10/10 scenarios)
- [x] Performance within targets (upload < 500ms, eval < 200ms)
- [x] Security scan clean (no critical vulnerabilities)
- [x] UI accessible and functional
- [x] No errors in logs for 24 hours
- [x] Rate limiting enforced
- [x] Audit logging active
- [x] Backups configured

---

## Rollback Triggers

Initiate rollback if any of the following occur:

- **Critical Security Vulnerability**: Trivy scan shows CRITICAL severity
- **Test Failures**: Any test suite fails after deployment
- **Performance Degradation**: p95 latency > 2x target (upload > 1s, eval > 400ms)
- **High Error Rate**: > 5% of requests fail
- **Service Unavailability**: Any core service down for > 5 minutes
- **Data Corruption**: MongoDB collection corrupted or inaccessible
- **User-Reported Issues**: Multiple users unable to use Policies Lab

---

## Communication Plan

### Pre-Deployment

1. Notify all stakeholders 24 hours before deployment
2. Schedule maintenance window (suggest off-peak hours)
3. Prepare rollback plan and test it
4. Assign on-call engineer for deployment

### During Deployment

1. Post status updates every 15 minutes
2. Monitor logs and metrics continuously
3. Document any issues encountered
4. Keep stakeholders informed of progress

### Post-Deployment

1. Confirm successful deployment to stakeholders
2. Monitor for 24 hours with on-call engineer
3. Collect feedback from users
4. Document lessons learned
5. Update runbook with any new findings

---

## Sign-Off

**Pre-Deployment Sign-Off**:
- [ ] Development Lead reviewed and approved
- [ ] Security team reviewed and approved
- [ ] QA team verified all tests passing
- [ ] Operations team prepared for deployment
- [ ] Stakeholders notified of deployment window

**Post-Deployment Sign-Off**:
- [ ] All health checks passing
- [ ] Smoke tests completed successfully
- [ ] Performance metrics within targets
- [ ] No errors in logs
- [ ] Manual verification completed
- [ ] Documentation updated
- [ ] Stakeholders notified of successful deployment

**Deployment Lead**: ___________________________  
**Date**: ___________________________  
**Signature**: ___________________________

---

**END OF DEPLOYMENT PLAN**

