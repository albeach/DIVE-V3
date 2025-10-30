# DIVE V3 Operational Runbook

**Version**: 1.0  
**Date**: October 30, 2025  
**Audience**: DevOps, SRE, On-Call Engineers

---

## Table of Contents

1. [Service Operations](#service-operations)
2. [Common Issues & Resolutions](#common-issues--resolutions)
3. [MFA Enrollment Troubleshooting](#mfa-enrollment-troubleshooting)
4. [User Attribute Issues](#user-attribute-issues)
5. [Database Maintenance](#database-maintenance)
6. [Performance Troubleshooting](#performance-troubleshooting)
7. [Security Incidents](#security-incidents)
8. [Incident Response](#incident-response)

---

## Service Operations

### Starting Services

```bash
cd /opt/dive-v3

# Start all services
docker-compose up -d

# Start specific service
docker-compose up -d backend

# Check status
docker-compose ps
```

**Startup Order**:
1. Databases (postgres, mongodb, redis)
2. Keycloak
3. OPA
4. Backend
5. KAS
6. Frontend
7. Monitoring (prometheus, grafana)

### Stopping Services

```bash
# Graceful stop (allows cleanup)
docker-compose stop

# Force stop (immediate)
docker-compose kill

# Stop and remove containers
docker-compose down

# Stop and remove volumes (⚠️ DATA LOSS)
docker-compose down -v
```

### Restarting Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart backend

# Restart with rebuild (after code changes)
docker-compose up -d --build backend
```

### Viewing Logs

```bash
# Tail all logs
docker-compose logs -f

# Tail specific service
docker-compose logs -f backend

# Last 100 lines
docker-compose logs --tail=100 backend

# Search logs
docker-compose logs backend | grep "ERROR"

# Export logs
docker-compose logs --no-color backend > backend-logs-$(date +%Y%m%d).log
```

---

## Common Issues & Resolutions

### Issue: Backend API Returns 500 Error

**Symptoms**:
- HTTP 500 responses
- Frontend shows "Internal Server Error"
- Prometheus alert: HighBackendErrorRate

**Diagnosis**:
```bash
# Check backend logs
docker logs dive-v3-backend --tail 50

# Check if backend is healthy
curl http://localhost:4000/health

# Check database connectivity
docker exec dive-v3-postgres psql -U postgres -c "SELECT 1;"
docker exec dive-v3-mongo mongosh -u admin --eval "db.runCommand({ping:1})"
```

**Common Causes**:
1. **Database connection lost**
   - Check database health
   - Restart backend: `docker-compose restart backend`

2. **OPA unavailable**
   - Check OPA: `curl http://localhost:8181/health`
   - Restart OPA: `docker-compose restart opa`

3. **Out of memory**
   - Check: `docker stats dive-v3-backend`
   - Increase memory limit in docker-compose.yml
   - Restart backend

**Resolution**:
```bash
# Quick fix: Restart backend
docker-compose restart backend

# If persists: Check dependencies
docker-compose ps | grep -v "Up (healthy)"

# Fix unhealthy services first
docker-compose restart <unhealthy-service>
```

---

### Issue: Login Fails with "Invalid Credentials"

**Symptoms**:
- Users cannot log in
- Error: "Invalid username or password"
- No MFA prompt shown

**Diagnosis**:
```bash
# Check Keycloak health
curl http://localhost:8081/health

# Check Keycloak logs
docker logs dive-v3-keycloak --tail 100 | grep ERROR

# Check if realm exists
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get realms/dive-v3-usa \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password admin
```

**Common Causes**:
1. **Wrong realm selected**
   - Verify user is in correct realm (dive-v3-usa, dive-v3-esp, etc.)
   - Check IdP alias matches realm

2. **User disabled**
   - Check user status in Keycloak Admin Console
   - Enable user if needed

3. **Password expired/reset needed**
   - Reset password in Keycloak
   - Send password reset email

**Resolution**:
```bash
# Reset user password
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh set-password \
  --server http://localhost:8080 \
  --realm dive-v3-usa \
  --username alice.general \
  --new-password "NewPassword123!" \
  --temporary
```

---

### Issue: Authorization Denied (403 Forbidden)

**Symptoms**:
- User logs in successfully
- Resource access returns 403
- Frontend shows AccessDenied component

**Diagnosis**:
```bash
# Check decision logs
docker exec dive-v3-mongo mongosh -u admin -p password dive_v3_resources --eval \
  "db.decisions.find({subjectUniqueID: 'alice.general@af.mil'}).sort({timestamp: -1}).limit(5).pretty()"

# Check user attributes
docker exec dive-v3-postgres psql -U postgres -d keycloak_db -c \
  "SELECT ua.name, ua.value FROM user_attribute ua 
   JOIN user_entity ue ON ua.user_id = ue.id 
   WHERE ue.username='alice.general' AND ue.realm_id='dive-v3-usa';"

# Test OPA policy manually
curl -X POST http://localhost:8181/v1/data/dive/authorization/decision \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "subject": {
        "uniqueID": "alice.general@af.mil",
        "clearance": "TOP_SECRET",
        "countryOfAffiliation": "USA"
      },
      "resource": {
        "classification": "SECRET",
        "releasabilityTo": ["USA"]
      }
    }
  }'
```

**Common Causes**:
1. **Insufficient clearance**
   - User: CONFIDENTIAL, Resource: SECRET
   - Fix: Elevate user clearance or downgrade resource

2. **Country not in releasabilityTo**
   - User: FRA, Resource releasable to: [USA, GBR]
   - Fix: Add FRA to releasabilityTo or explain denial

3. **Missing COI membership**
   - User COI: [], Resource requires: FVEY
   - Fix: Add user to FVEY COI

**Resolution**:
```bash
# Update user clearance (if approved)
docker exec dive-v3-postgres psql -U postgres -d keycloak_db -c \
  "UPDATE user_attribute 
   SET value = 'SECRET' 
   WHERE name = 'clearance' 
     AND user_id = (SELECT id FROM user_entity WHERE username='user.name');"

# Or update resource releasability
docker exec dive-v3-mongo mongosh -u admin -p password dive_v3_resources --eval \
  "db.resources.updateOne(
    {resourceId: 'doc-123'},
    {\$addToSet: {releasabilityTo: 'FRA'}}
  )"
```

---

## MFA Enrollment Troubleshooting

### Issue: MFA Setup Fails with "No Pending OTP Setup Found"

**Status**: ✅ **FIXED in Phase 5**

**Symptoms**:
- User initiates MFA setup
- QR code displayed
- User enters TOTP code
- Error: "No pending OTP setup found. Please initiate OTP setup first."

**Root Cause** (Historical): 
- `/api/auth/otp/setup` did not store secret in Redis
- `/api/auth/otp/finalize-enrollment` could not retrieve it

**Fix Applied**: 
- Setup endpoint now stores secret in Redis with 10-minute TTL
- See `PHASE-5-TASK-5.1-MFA-ENROLLMENT-FIX-SUMMARY.md`

**Diagnosis** (if issue recurs):
```bash
# Check if secret was stored in Redis
# (After user completes setup, before entering TOTP code)
docker exec dive-v3-redis redis-cli KEYS "otp:pending:*"

# Check specific user's pending secret
USER_ID="8ea79494-73df-4e07-89da-08326aa1a4c3"
docker exec dive-v3-redis redis-cli GET "otp:pending:$USER_ID"

# Check TTL
docker exec dive-v3-redis redis-cli TTL "otp:pending:$USER_ID"
```

**Expected**:
- Redis key exists: `otp:pending:{userId}`
- TTL: ~600 seconds (10 minutes)
- Value: JSON with secret, createdAt, expiresAt

**If Redis key missing**:
```bash
# Check backend logs for storage errors
docker logs dive-v3-backend | grep "Failed to store OTP secret"

# Check Redis connectivity
docker exec dive-v3-backend nc -zv redis 6379

# Restart Redis if needed
docker-compose restart redis
```

**Resolution**:
1. Clear any stale Redis keys: `docker exec dive-v3-redis redis-cli FLUSHDB`
2. Restart backend: `docker-compose restart backend`
3. Have user retry MFA setup from beginning
4. If persists, check `backend/src/controllers/otp.controller.ts` line 120 (storePendingOTPSecret call)

---

## User Attribute Issues

See `TROUBLESHOOTING-USER-ATTRIBUTES.md` for complete guide.

### Issue: User Clearance Not Displaying

**Symptoms**:
- User logs in successfully
- Dashboard shows no clearance or wrong clearance
- Authorization decisions fail

**Diagnosis**:
```bash
# Check user attributes in database
docker exec dive-v3-postgres psql -U postgres -d keycloak_db -c \
  "SELECT ua.name, ua.value 
   FROM user_attribute ua 
   JOIN user_entity ue ON ua.user_id = ue.id 
   WHERE ue.username='alice.general' 
     AND ue.realm_id='dive-v3-usa' 
   ORDER BY ua.name;"
```

**Expected Attributes**:
- `clearance`: TOP_SECRET
- `clearanceOriginal`: TOP_SECRET (or local equivalent)
- `clearanceCountry`: USA
- `countryOfAffiliation`: USA
- `uniqueID`: alice.general@af.mil
- `acpCOI`: ["FVEY", "NATO-COSMIC"]

**If Missing**:
```bash
# Run attribute population script (Phase 2 fix)
cd /opt/dive-v3
python3 scripts/populate-all-user-attributes.py
```

**Manual Fix** (single user):
```sql
-- Get user ID
SELECT id, username FROM user_entity 
WHERE username='alice.general' AND realm_id='dive-v3-usa';

-- Add clearance attribute
INSERT INTO user_attribute (name, value, user_id) 
VALUES ('clearance', 'TOP_SECRET', 'USER_ID_HERE');

-- Add country attribute
INSERT INTO user_attribute (name, value, user_id) 
VALUES ('countryOfAffiliation', 'USA', 'USER_ID_HERE');
```

---

## Database Maintenance

### PostgreSQL Maintenance

**Vacuum** (reclaim space):
```bash
# Analyze tables
docker exec dive-v3-postgres psql -U postgres -d keycloak_db -c "VACUUM ANALYZE;"

# Full vacuum (requires downtime)
docker-compose stop keycloak
docker exec dive-v3-postgres psql -U postgres -d keycloak_db -c "VACUUM FULL;"
docker-compose start keycloak
```

**Backup**:
```bash
# Backup Keycloak database
docker exec dive-v3-postgres pg_dump -U postgres -Fc keycloak_db > \
  /backups/keycloak_$(date +%Y%m%d_%H%M%S).dump

# Backup application database
docker exec dive-v3-postgres pg_dump -U postgres -Fc dive_v3_app > \
  /backups/app_$(date +%Y%m%d_%H%M%S).dump
```

**Restore**:
```bash
# Restore from backup
docker exec -i dive-v3-postgres pg_restore -U postgres -d keycloak_db < \
  /backups/keycloak_20251030.dump
```

### MongoDB Maintenance

**Check Collection Sizes**:
```bash
docker exec dive-v3-mongo mongosh -u admin -p password dive_v3_resources --eval \
  "db.stats(1024*1024)"  # Size in MB
```

**Verify TTL Index** (decision logs auto-delete after 90 days):
```bash
docker exec dive-v3-mongo mongosh -u admin -p password dive_v3_resources --eval \
  "db.decisions.getIndexes()"

# Should show:
# { "timestamp": 1, "expireAfterSeconds": 7776000 }
```

**Manual Cleanup** (if TTL not working):
```bash
# Delete decisions older than 90 days
docker exec dive-v3-mongo mongosh -u admin -p password dive_v3_resources --eval \
  "db.decisions.deleteMany({
    timestamp: {\$lt: new Date(Date.now() - 90*24*60*60*1000)}
  })"
```

**Backup**:
```bash
docker exec dive-v3-mongo mongodump \
  --username admin \
  --password password \
  --authenticationDatabase admin \
  --db dive_v3_resources \
  --archive=/backups/mongodb_$(date +%Y%m%d).archive \
  --gzip
```

---

## Performance Troubleshooting

### Issue: High Authorization Latency (p95 > 200ms)

**Check OPA Performance**:
```bash
# Query Prometheus
curl -s 'http://localhost:9090/api/v1/query?query=histogram_quantile(0.95,opa_policy_evaluation_duration_seconds_bucket)' | jq .

# Check OPA logs
docker logs dive-v3-opa --tail 100

# Test OPA directly
time curl -X POST http://localhost:8181/v1/data/dive/authorization/decision \
  -d '{"input": {...}}'
```

**Optimization**:
```bash
# Increase OPA cache TTL (in docker-compose.yml)
environment:
  - OPA_CACHE_TTL=300  # 5 minutes instead of 60s

# Restart OPA
docker-compose restart opa
```

### Issue: High Database Load

**PostgreSQL**:
```bash
# Check active connections
docker exec dive-v3-postgres psql -U postgres -c \
  "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Check slow queries
docker exec dive-v3-postgres psql -U postgres -c \
  "SELECT query, calls, total_time, mean_time 
   FROM pg_stat_statements 
   ORDER BY mean_time DESC 
   LIMIT 10;"
```

**MongoDB**:
```bash
# Check current operations
docker exec dive-v3-mongo mongosh -u admin -p password --eval \
  "db.currentOp()"

# Check slow queries
docker exec dive-v3-mongo mongosh -u admin -p password --eval \
  "db.system.profile.find().sort({ts:-1}).limit(10).pretty()"
```

---

## Security Incidents

### Incident: Metadata Tampering Detected

**Alert**: "MetadataTamperingDetected" fired

**Immediate Actions**:
1. **Isolate affected resource**:
   ```bash
   docker exec dive-v3-mongo mongosh -u admin -p password dive_v3_resources --eval \
     "db.resources.updateOne(
       {resourceId: 'AFFECTED_RESOURCE_ID'},
       {\$set: {quarantined: true}}
     )"
   ```

2. **Review decision logs**:
   ```bash
   docker exec dive-v3-mongo mongosh -u admin -p password dive_v3_resources --eval \
     "db.decisions.find({
       resourceId: 'AFFECTED_RESOURCE_ID',
       timestamp: {\$gte: new Date(Date.now() - 24*60*60*1000)}
     }).pretty()"
   ```

3. **Check access logs**:
   ```bash
   docker logs dive-v3-backend | grep "AFFECTED_RESOURCE_ID" | grep "signature verification"
   ```

4. **Notify security team**: Email to security@example.mil

5. **Preserve evidence**: Copy logs to secure location

---

## Incident Response

### P1: Critical Service Down

**Response Time**: 15 minutes  
**Resolution Time**: 1 hour

**Checklist**:
- [ ] Acknowledge alert in PagerDuty
- [ ] Check service health: `docker-compose ps`
- [ ] Review logs: `docker logs <service>`
- [ ] Attempt restart: `docker-compose restart <service>`
- [ ] If restart fails, check dependencies
- [ ] Escalate to senior engineer if not resolved in 30 min
- [ ] Update status page
- [ ] Post-incident review within 24 hours

### P2: Performance Degradation

**Response Time**: 1 hour  
**Resolution Time**: 4 hours

**Checklist**:
- [ ] Check Grafana dashboards
- [ ] Identify bottleneck (CPU, memory, database, network)
- [ ] Apply temporary mitigation (restart, scale up)
- [ ] Schedule permanent fix
- [ ] Monitor metrics for 1 hour after fix

---

## Useful Commands Reference

```bash
# Health check all services
./scripts/health-check.sh

# View all logs
docker-compose logs -f

# Restart all services
docker-compose restart

# Check resource usage
docker stats

# Export decision logs (last 24 hours)
docker exec dive-v3-mongo mongoexport \
  -u admin -p password \
  --authenticationDatabase admin \
  --db dive_v3_resources \
  --collection decisions \
  --query '{"timestamp": {"\$gte": {"\$date": "'$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)'"}}}'  \
  --out decisions_$(date +%Y%m%d).json

# Run OPA tests
docker exec dive-v3-opa opa test /policies -v

# Check Prometheus alerts
curl http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | select(.state=="firing")'
```

---

**Document Version**: 1.0  
**Last Updated**: October 30, 2025  
**Next Review**: January 30, 2026

