# DIVE V3 - Critical Fixes Required (2026-01-25)

## 🚨 P0 BLOCKERS (Must Fix Immediately)

### 1. MongoDB Replica Set Not Initialized on Deployment Failure

**Problem**: When parallel startup fails, MongoDB replica set initialization (Phase 4a) never runs, causing backend to fall back to in-memory storage.

**Impact**: Backend loses all persistent data, spokes cannot register, policy updates fail.

**Current Behavior**:
```bash
# deployment.hub.sh
hub_parallel_startup  # Fails on authzforce/otel-collector timeout
# Exit deployment - Phase 4a never runs!
```

**Fix** (scripts/dive-modules/deployment/hub.sh):
```bash
# Move Phase 4a BEFORE Phase 3 (parallel startup)

# Phase 2: Initialization
log_info "Phase 2: Initialization"
hub_initialize || exit 1

# Phase 2.5: MongoDB Replica Set (NEW - CRITICAL)
log_info "Phase 2.5: Initializing MongoDB replica set"
if ! bash "${DIVE_ROOT}/scripts/init-mongo-replica-set-post-start.sh" dive-hub-mongodb admin "$MONGO_PASSWORD"; then
  log_error "MongoDB replica set initialization failed"
  return 1
fi

# Phase 3: Parallel startup (now depends on initialized MongoDB)
log_info "Phase 3: Starting services (parallel mode)"
hub_parallel_startup || exit 1
```

**Test**:
```bash
./dive nuke all --confirm
./dive hub deploy
# Verify: curl -ksSf https://localhost:4000/health
# Should return: {"status":"healthy",...}
```

**Estimated Time**: 30 minutes  
**Files to Edit**: `scripts/dive-modules/deployment/hub.sh`

---

### 2. Optional Services Block Entire Deployment

**Problem**: authzforce (90s timeout) and otel-collector (30s timeout) are optional services but their failure blocks deployment.

**Impact**: Deployment takes 2+ minutes and exits with failure even when all CORE services are operational.

**Current Behavior**:
```bash
[0;31m❌ authzforce: Timeout after 90s[0m
[0;31m❌ Level 3 had 2 failures[0m
[0;31m❌ Stopping parallel startup - fix failures and redeploy[0m
```

**Expected Behavior**:
```bash
⚠️  authzforce: Timeout after 90s (optional - skipping)
✅ Level 3 complete (CORE services operational)
```

**Fix** (scripts/dive-modules/deployment/hub.sh):

```bash
# Add service classification arrays at top of hub_parallel_startup()

# Service classification for graceful degradation
CORE_SERVICES=(postgres mongodb redis redis-blacklist keycloak opa backend frontend)
OPTIONAL_SERVICES=(authzforce otel-collector)
STRETCH_SERVICES=(kas opal-server)

# Modify failure handling in wait loop (around line 900)

if ! wait_for_healthy "$service" "$timeout"; then
  # Check if service is CORE or OPTIONAL
  if [[ " ${CORE_SERVICES[*]} " =~ " ${service} " ]]; then
    log_error "$service: Timeout after ${timeout}s (health: $(get_health_status "$service"))"
    log_error "CORE service $service failed - blocking deployment"
    failed=true
  elif [[ " ${OPTIONAL_SERVICES[*]} " =~ " ${service} " ]]; then
    log_warning "$service: Timeout after ${timeout}s (optional - skipping)"
    log_warning "Deployment will continue without optional service $service"
    # Don't set failed=true for optional services
  else
    # STRETCH services: warn but don't block
    log_warning "$service: Timeout after ${timeout}s (stretch goal - skipping)"
  fi
else
  log_success "$service is healthy (${elapsed}s)"
  ((success_count++))
fi
```

**After level completes, check if CORE services succeeded**:
```bash
# After waiting for all services in level
if $failed; then
  # Count how many CORE services failed
  core_failures=0
  for service in "${services_array[@]}"; do
    if [[ " ${CORE_SERVICES[*]} " =~ " ${service} " ]]; then
      if ! docker ps --filter "name=${COMPOSE_PROJECT_NAME}-${service}" --filter "health=healthy" --format "{{.Names}}" | grep -q .; then
        ((core_failures++))
      fi
    fi
  done
  
  if [ $core_failures -gt 0 ]; then
    log_error "Level $level had $core_failures CORE service failures"
    log_error "Stopping parallel startup - fix failures and redeploy"
    return 1
  else
    log_warning "Level $level had failures, but all CORE services operational"
    log_warning "Continuing deployment..."
  fi
fi
```

**Test**:
```bash
./dive nuke all --confirm
./dive hub deploy
# Should succeed even if authzforce/otel-collector timeout
# Verify CORE services: curl -ksSf https://localhost:4000/health
```

**Estimated Time**: 1 hour  
**Files to Edit**: `scripts/dive-modules/deployment/hub.sh`

---

## 📊 Expected Results After P0 Fixes

### Before Fixes
- ⏱️ Deployment Time: 128.99s (FAIL)
- ✅ Core Services: 8/8 (after manual MongoDB fix)
- ❌ MongoDB: Not initialized automatically
- ❌ Exit Status: 1 (failure)

### After Fixes
- ⏱️ Deployment Time: ~41s (SUCCESS)
- ✅ Core Services: 8/8 (automated)
- ✅ MongoDB: Initialized in Phase 2.5
- ✅ Exit Status: 0 (success)
- ⚠️ Optional Services: Skipped with warnings (acceptable)

---

## 🔧 P1 FIXES (High Priority, But Not Blocking)

### 3. otel-collector Health Check Misconfigured

**Problem**: Collector is functional but marked unhealthy (30s timeout).

**Fix**: Update `monitoring/otel-collector-config.yaml`:
```yaml
extensions:
  health_check:
    endpoint: 0.0.0.0:13133  # Ensure this exists
```

Or simplify health check in docker-compose.hub.yml:
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8888/"]  # Default metrics port
```

**Estimated Time**: 30 minutes

---

### 4. authzforce Context Startup Failed

**Problem**: Tomcat starts but WAR deployment fails.

**Investigation Steps**:
1. Check full logs: `docker logs dive-hub-authzforce 2>&1 | grep -i "error"`
2. Review config: `./authzforce/conf/`
3. Check if domain XML files valid
4. Verify Java heap settings

**Options**:
- **Option A**: Fix configuration (if XACML needed)
- **Option B**: Exclude from deployment (mark as fully optional)
- **Option C**: Replace with OPA XACML compat layer

**Estimated Time**: 1-2 hours (investigation + fix)

---

## 🎯 Testing Checklist After Fixes

```bash
# 1. Clean slate deployment
./dive nuke all --confirm
time ./dive hub deploy

# Expected:
# - ✅ Deployment completes in <60s
# - ✅ Exit code: 0
# - ⚠️ Optional services may timeout (acceptable)

# 2. Verify MongoDB replica set
docker exec dive-hub-mongodb mongosh admin -u admin -p "$MONGO_PASSWORD" \
  --eval "rs.status()" --quiet | grep -q "PRIMARY"
# Expected: Exit code 0

# 3. Verify CORE services HTTP endpoints
for endpoint in \
  "https://localhost:3000/" \
  "https://localhost:4000/health" \
  "https://localhost:8443/realms/master" \
  "https://localhost:8181/health" \
  "https://localhost:8085/health"; do
  curl -ksSf "$endpoint" > /dev/null && echo "✅ $endpoint" || echo "❌ $endpoint"
done
# Expected: 5/5 pass

# 4. Verify backend MongoDB connection
curl -ksSf https://localhost:4000/health | jq
# Expected: {"status":"healthy",...} (no MongoDB errors in logs)

# 5. Test idempotency (second deployment should be faster)
./dive hub deploy
# Expected: <30s (services already running)
```

---

## 📝 Implementation Order

### Session 2 (Current)
1. ✅ Audit completed → `docs/SESSION-AUDIT.md`
2. ⏭️ Fix #1: MongoDB replica set initialization (30 min)
3. ⏭️ Fix #2: Optional service classification (1 hour)
4. ⏭️ Test: Full deployment validation (30 min)

**Total Estimated Time**: 2 hours

### Session 3
5. Fix #3: otel-collector health check (30 min)
6. Investigate #4: authzforce failure (1-2 hours)
7. Update validation script with HTTP checks (30 min)

### Session 4+
- Dynamic service discovery
- Comprehensive testing framework
- Performance optimization

---

## 🚀 Quick Fix Commands (For Testing)

```bash
# Manual MongoDB init (temporary workaround)
export MONGO_PASSWORD=$(grep "^MONGO_PASSWORD=" .env.hub | cut -d= -f2)
bash scripts/init-mongo-replica-set-post-start.sh dive-hub-mongodb admin "$MONGO_PASSWORD"

# Check service classification
docker ps -a --filter "name=dive-hub" --format "table {{.Names}}\t{{.Status}}" | \
  grep -E "(postgres|mongodb|redis|keycloak|opa|backend|frontend)" && echo "CORE services" || echo "Missing CORE"

# Verify HTTP endpoints
curl -ksSf https://localhost:4000/health && echo "✅ Backend operational"
```

---

## 📊 Success Metrics

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Deployment Time | 128.99s | <60s | ❌ |
| Core Services Operational | 8/8 | 8/8 | ✅ |
| MongoDB Auto-Init | ❌ | ✅ | ❌ |
| Optional Service Handling | ❌ | ✅ | ❌ |
| HTTP Endpoints Responding | 5/5 | 5/5 | ✅ |
| Exit Code on Success | 1 | 0 | ❌ |

**Goal**: All metrics ✅ after P0 fixes implemented.

---

**Document Created**: 2026-01-25  
**Priority**: P0 (Critical Blockers)  
**Next Action**: Implement Fix #1 (MongoDB replica set)
