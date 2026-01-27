# FRA Spoke - Comprehensive Error Analysis & Remediation Plan

**Date**: 2026-01-27  
**Instance**: dive-spoke-fra  
**Status**: Running but with critical errors

---

## Executive Summary

The FRA spoke has **7 critical errors** and **multiple warnings** that need systematic resolution. The most critical issue is **MongoDB replica set not initialized**, causing backend failures.

### Error Severity Classification

| Severity | Count | Impact |
|----------|-------|--------|
| **CRITICAL** | 3 | Service functionality blocked |
| **HIGH** | 4 | Features unavailable, functionality degraded |
| **MEDIUM** | 6 | Performance/security concerns |
| **LOW** | 8+ | Configuration recommendations |

---

## Critical Errors (Must Fix Immediately)

### 1. MongoDB Replica Set Not Initialized ⚠️ CRITICAL

**Container**: `dive-spoke-fra-mongodb`

**Error**:
```
MongoServerError: not primary
NotYetInitialized: Replication has not yet been configured
```

**Impact**: Backend cannot initialize OPAL data store, causing service failures

**Root Cause**: MongoDB started but replica set (`rs0-fra`) was never initialized

**Backend Impact**:
```json
{
  "error": "not primary",
  "message": "Failed to initialize MongoDB OPAL Data Store",
  "mongoUrl": "mongodb://admin:****@mongodb-fra:27017/?authSource=admin&directConnection=true"
}
```

**Fix**:
```bash
# Execute MongoDB replica set initialization
docker exec dive-spoke-fra-mongodb mongosh --eval "
rs.initiate({
  _id: 'rs0-fra',
  version: 1,
  members: [
    { _id: 0, host: 'mongodb-fra:27017', priority: 10 }
  ]
})
"

# Wait for replica set to stabilize (30 seconds)
sleep 30

# Verify replica set state (should be 1 = PRIMARY)
docker exec dive-spoke-fra-mongodb mongosh --quiet --eval "rs.status().myState"

# Restart backend to reinitialize
docker restart dive-spoke-fra-backend
```

**Prevention**: Add replica set initialization to deployment pipeline  
**File**: `scripts/dive-modules/spoke/pipeline/phase-deployment.sh`

---

### 2. SPOKE_TOKEN Missing ⚠️ CRITICAL

**Container**: `dive-spoke-fra-backend`

**Error**:
```json
{
  "level": "error",
  "message": "SPOKE_TOKEN environment variable is required for spoke mode. Register the spoke first."
}
```

**Impact**: Spoke cannot authenticate with Hub for federation operations

**Root Cause**: Spoke has not been registered with Hub yet (federation status: "unregistered")

**Fix**:
```bash
# Register spoke with Hub
./dive spoke register FRA

# This will:
# 1. Submit CSR to Hub
# 2. Receive signed certificate
# 3. Get SPOKE_TOKEN for authentication
# 4. Update instances/fra/config.json with federation status
# 5. Update instances/fra/.env with SPOKE_TOKEN

# After registration, restart backend
docker restart dive-spoke-fra-backend
```

**Verification**:
```bash
# Check config.json for status
jq '.federation.status' instances/fra/config.json
# Expected: "approved" or "active"

# Check .env for token
grep SPOKE_TOKEN instances/fra/.env
# Expected: SPOKE_TOKEN=eyJhbGciOiJSUzI1NiIs...
```

---

### 3. OPAL_AUTH_MASTER_TOKEN Missing ⚠️ CRITICAL

**Container**: `dive-spoke-fra-backend`

**Error**:
```json
{
  "level": "warn",
  "message": "OPAL_AUTH_MASTER_TOKEN not set - OPAL token generation will fail"
}
```

**Impact**: OPAL client cannot authenticate with OPAL server for policy/data updates

**Root Cause**: Environment variable not set during deployment

**Fix**:
```bash
# Generate OPAL master token (32-byte random)
OPAL_TOKEN=$(openssl rand -base64 32)

# Add to FRA spoke .env file
echo "OPAL_AUTH_MASTER_TOKEN=${OPAL_TOKEN}" >> instances/fra/.env

# Also add to Hub OPAL server if not set
grep -q "OPAL_AUTH_MASTER_TOKEN" instances/hub/.env || \
  echo "OPAL_AUTH_MASTER_TOKEN=${OPAL_TOKEN}" >> instances/hub/.env

# Restart affected services
docker restart dive-spoke-fra-backend
docker restart dive-spoke-fra-opal-client

# If Hub OPAL server was updated
docker restart dive-hub-opal-server
```

**Long-term Fix**: Add to deployment pipeline  
**File**: `scripts/dive-modules/spoke/pipeline/spoke-secrets.sh`

```bash
# Add OPAL token generation
if ! grep -q "OPAL_AUTH_MASTER_TOKEN" "${instance_dir}/.env"; then
    local opal_token=$(openssl rand -base64 32)
    echo "OPAL_AUTH_MASTER_TOKEN=${opal_token}" >> "${instance_dir}/.env"
    log_info "Generated OPAL master token"
fi
```

---

## High Priority Errors (Fix Soon)

### 4. DATABASE_URL Not Configured (PostgreSQL Audit)

**Container**: `dive-spoke-fra-backend`

**Warning**:
```json
{
  "level": "warn",
  "message": "DATABASE_URL not configured - PostgreSQL audit persistence disabled"
}
```

**Impact**: Audit logs not persisted to PostgreSQL, only in-memory

**Root Cause**: `DATABASE_URL` environment variable not set

**Fix**:
```bash
# Add DATABASE_URL to .env
cat >> instances/fra/.env <<EOF
DATABASE_URL=postgresql://postgres:$(grep POSTGRES_PASSWORD instances/fra/.env | cut -d'=' -f2)@postgres-fra:5432/dive_v3
EOF

# Restart backend
docker restart dive-spoke-fra-backend
```

**Verification**:
```bash
# Check backend logs for PostgreSQL connection
docker logs dive-spoke-fra-backend 2>&1 | grep -i "audit.*postgres"
```

---

### 5. PostgreSQL Migration Tables Missing

**Container**: `dive-spoke-fra-postgres`

**Errors**:
```
ERROR:  relation "migration_model" does not exist at character 25
ERROR:  relation "public.databasechangeloglock" does not exist at character 22
```

**Impact**: Database schema not initialized, migrations cannot run

**Root Cause**: Keycloak tried to access migration tables before they were created

**Fix**:
```bash
# Initialize PostgreSQL schema for Keycloak
docker exec -i dive-spoke-fra-postgres psql -U postgres -d keycloak_fra <<EOF
CREATE TABLE IF NOT EXISTS public.databasechangelog (
  id VARCHAR(255) NOT NULL,
  author VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  dateexecuted TIMESTAMP NOT NULL,
  orderexecuted INTEGER NOT NULL,
  exectype VARCHAR(10) NOT NULL,
  md5sum VARCHAR(35),
  description VARCHAR(255),
  comments VARCHAR(255),
  tag VARCHAR(255),
  liquibase VARCHAR(20),
  contexts VARCHAR(255),
  labels VARCHAR(255),
  deployment_id VARCHAR(10)
);

CREATE TABLE IF NOT EXISTS public.databasechangeloglock (
  id INTEGER NOT NULL,
  locked BOOLEAN NOT NULL,
  lockgranted TIMESTAMP,
  lockedby VARCHAR(255),
  CONSTRAINT pk_databasechangeloglock PRIMARY KEY (id)
);

INSERT INTO public.databasechangeloglock (id, locked) VALUES (1, FALSE) ON CONFLICT DO NOTHING;
EOF

# Restart Keycloak to run migrations
docker restart dive-spoke-fra-keycloak
```

**Note**: Keycloak should auto-create these on first boot, but timing issues can prevent this

---

### 6. MongoDB System Locale Warning

**Container**: `dive-spoke-fra-mongodb`

**Warning**:
```
WARNING:  no usable system locales were found
```

**Impact**: Potential string collation issues in MongoDB queries

**Fix**: Add locale environment variables to docker-compose.yml

```yaml
# instances/fra/docker-compose.yml
services:
  mongodb-fra:
    environment:
      - LC_ALL=C.UTF-8
      - LANG=C.UTF-8
```

**Apply**:
```bash
# Edit docker-compose.yml
# Then recreate container
docker-compose -f instances/fra/docker-compose.yml up -d mongodb-fra
```

---

### 7. Redis Config File Warning

**Container**: `dive-spoke-fra-redis`

**Warning**:
```
Warning: no config file specified, using the default config
```

**Impact**: Redis running with default settings (no persistence, no ACLs)

**Fix**: Create Redis configuration file

```bash
# Create Redis config
cat > instances/fra/redis.conf <<EOF
# Redis configuration for FRA spoke
port 6379
bind 0.0.0.0
protected-mode yes
requirepass $(grep REDIS_PASSWORD instances/fra/.env | cut -d'=' -f2)

# Persistence
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfilename "appendonly.aof"

# Limits
maxmemory 256mb
maxmemory-policy allkeys-lru
EOF

# Update docker-compose.yml to mount config
# services:
#   redis-fra:
#     command: redis-server /usr/local/etc/redis/redis.conf
#     volumes:
#       - ./redis.conf:/usr/local/etc/redis/redis.conf:ro

# Recreate Redis with config
docker-compose -f instances/fra/docker-compose.yml up -d redis-fra
```

---

## Medium Priority Warnings (Address When Possible)

### 8. MongoDB System Performance Warnings

**Container**: `dive-spoke-fra-mongodb`

**Warnings**:
```
- transparent_hugepage/defrag should be 'defer+madvise' (currently: 'madvise')
- transparent_hugepage/khugepaged/max_ptes_none should be 0 (currently: 511)
- vm.max_map_count too low (currently: 262144, recommended: 838860)
- vm.swappiness should be 0 or 1 (currently: 60)
```

**Impact**: Suboptimal MongoDB performance, potential memory issues under load

**Fix** (macOS Docker Desktop):

These are Linux kernel parameters. On Docker Desktop for Mac, they cannot be changed directly. Document as known limitations or ignore.

**Fix** (Linux production):
```bash
# Add to /etc/sysctl.conf
sudo tee -a /etc/sysctl.conf <<EOF
vm.max_map_count=838860
vm.swappiness=1
EOF

sudo sysctl -p

# Add to /etc/rc.local for transparent hugepages
echo never > /sys/kernel/mm/transparent_hugepage/defrag
echo 0 > /sys/kernel/mm/transparent_hugepage/khugepaged/max_ptes_none
```

**Current Action**: Document as acceptable for development/testing

---

### 9. MongoDB Collection Warnings (FTDC)

**Container**: `dive-spoke-fra-mongodb`

**Warnings** (repeating every second):
```
NamespaceNotFound: Collection [local.oplog.rs] not found
NamespaceNotFound: Collection [config.transactions] not found
NamespaceNotFound: Collection [config.image_collection] not found
```

**Impact**: Full-Time Diagnostic Data Capture (FTDC) cannot collect all metrics

**Root Cause**: Collections don't exist until replica set is initialized and used

**Fix**: These will auto-create after replica set initialization (Error #1 fix)

**Verification After RS Init**:
```bash
docker exec dive-spoke-fra-mongodb mongosh --quiet --eval "
  db.getSiblingDB('local').getCollectionNames()
"
# Should include: oplog.rs

docker exec dive-spoke-fra-mongodb mongosh --quiet --eval "
  db.getSiblingDB('config').getCollectionNames()
"
# Should include: transactions, image_collection
```

---

### 10. MongoDB Key Cache Refresh Failures

**Container**: `dive-spoke-fra-mongodb`

**Warnings**:
```
Failed to refresh key cache
ReadConcernMajorityNotAvailableYet: Read concern majority reads are currently not possible
```

**Impact**: Clustering features not available (expected for single-node replica set)

**Root Cause**: Single-node replica set cannot achieve "majority" read concern

**Fix**: Not needed for single-node deployments. This is expected behavior.

**Suppression** (optional):
```yaml
# docker-compose.yml - add to mongodb command
command: >
  --setParameter enableMajorityReadConcern=false
```

---

### 11-14. Additional MongoDB Warnings

The following are informational/startup warnings:

11. **XFS Filesystem Recommended**: MongoDB prefers XFS over APFS (macOS filesystem)
12. **Access Control Warning**: Auth is enabled, this is a false warning
13. **Session Collection Not Set Up**: Will auto-create on first use
14. **LogicalSessionCache Errors**: Temporary during initialization

**Action**: Monitor but no immediate fix required

---

## Low Priority Items (Configuration Improvements)

### 15. PostgreSQL Trust Authentication

**Warning**:
```
enabling "trust" authentication for local connections
```

**Impact**: Security risk (local connections don't require password)

**Fix**: Configure pg_hba.conf for md5 authentication

### 16-21. Various Configuration Recommendations

See MongoDB production notes for additional optimizations

---

## Systematic Remediation Plan

### Phase 1: Critical Fixes (Do First)

```bash
# 1. Initialize MongoDB Replica Set
docker exec dive-spoke-fra-mongodb mongosh --eval "
rs.initiate({
  _id: 'rs0-fra',
  version: 1,
  members: [{ _id: 0, host: 'mongodb-fra:27017', priority: 10 }]
})
"
sleep 30

# 2. Add OPAL Master Token
OPAL_TOKEN=$(openssl rand -base64 32)
echo "OPAL_AUTH_MASTER_TOKEN=${OPAL_TOKEN}" >> instances/fra/.env

# 3. Register Spoke with Hub
./dive spoke register FRA

# 4. Restart Backend
docker restart dive-spoke-fra-backend dive-spoke-fra-opal-client

# 5. Verify Fixes
docker logs dive-spoke-fra-backend 2>&1 | tail -50
```

### Phase 2: High Priority Fixes

```bash
# 6. Add DATABASE_URL
cat >> instances/fra/.env <<EOF
DATABASE_URL=postgresql://postgres:$(grep POSTGRES_PASSWORD instances/fra/.env | cut -d'=' -f2)@postgres-fra:5432/dive_v3
EOF

# 7. Fix PostgreSQL Migration Tables
docker exec -i dive-spoke-fra-postgres psql -U postgres -d keycloak_fra < /path/to/migration_init.sql

# 8. Restart Services
docker restart dive-spoke-fra-backend dive-spoke-fra-keycloak
```

### Phase 3: Configuration Improvements

```bash
# 9. Add Locale to MongoDB
# Edit docker-compose.yml, add LC_ALL and LANG

# 10. Add Redis Config
# Create redis.conf, mount in docker-compose.yml

# 11. Recreate Containers
docker-compose -f instances/fra/docker-compose.yml up -d
```

---

## Verification Checklist

After fixes, verify each error is resolved:

```bash
# ✅ MongoDB is PRIMARY
docker exec dive-spoke-fra-mongodb mongosh --quiet --eval "rs.status().myState"
# Expected: 1

# ✅ Backend OPAL initialized
docker logs dive-spoke-fra-backend 2>&1 | grep "OPAL.*initialized"
# Expected: No errors

# ✅ SPOKE_TOKEN present
grep SPOKE_TOKEN instances/fra/.env
# Expected: SPOKE_TOKEN=eyJ...

# ✅ No critical errors in backend
docker logs dive-spoke-fra-backend 2>&1 | grep -i "error" | wc -l
# Expected: 0 or very low

# ✅ All containers healthy
docker ps --filter "name=dive-spoke-fra" --format "{{.Names}}\t{{.Status}}"
# Expected: All show "healthy"
```

---

## Long-Term Prevention

### Code Changes Required

1. **MongoDB RS Initialization**: Add to deployment pipeline
   - File: `scripts/dive-modules/spoke/pipeline/phase-deployment.sh`
   - Add: Check if RS initialized, run rs.initiate() if not

2. **OPAL Token Generation**: Add to secrets generation
   - File: `scripts/dive-modules/spoke/pipeline/spoke-secrets.sh`
   - Add: Generate OPAL_AUTH_MASTER_TOKEN if not present

3. **DATABASE_URL Auto-Configuration**: Add to .env generation
   - File: Same as above
   - Add: Construct DATABASE_URL from POSTGRES_PASSWORD

4. **Spoke Registration Prompt**: Add to deployment completion
   - File: `scripts/dive-modules/spoke/spoke-deploy.sh`
   - Add: Prompt user to run `./dive spoke register` after deployment

### Testing Requirements

1. Create automated test that deploys spoke and verifies no errors
2. Add health check that validates MongoDB RS status
3. Add backend startup validation that checks for required env vars

---

## Summary

**Total Errors Found**: 21 (3 critical, 4 high, 6 medium, 8 low)

**Must Fix Immediately**:
1. ⚠️ MongoDB Replica Set not initialized
2. ⚠️ SPOKE_TOKEN missing (requires registration)
3. ⚠️ OPAL_AUTH_MASTER_TOKEN missing

**Should Fix Soon**:
4. DATABASE_URL not configured
5. PostgreSQL migration tables missing
6. MongoDB locale warning
7. Redis config missing

**Time Estimate**:
- Phase 1 (Critical): 10-15 minutes
- Phase 2 (High Priority): 10-15 minutes
- Phase 3 (Config): 20-30 minutes
- **Total**: ~45-60 minutes

**Next Action**: Execute Phase 1 fixes immediately
