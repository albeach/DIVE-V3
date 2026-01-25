# P1 Fix Complete: otel-collector Health Check (2026-01-25)

## ✅ Status: RESOLVED

**Date**: January 25, 2026  
**Duration**: ~1 hour  
**Result**: otel-collector now starts successfully without timeout  
**Commit**: `3e9fba60` - fix(observability): Resolve otel-collector health check issue (P1)

---

## Executive Summary

### Before Fix
- ⏱️ **Deployment Time**: 146s (with 30s otel-collector timeout)
- ❌ **otel-collector**: Timeout after 30s every deployment
- ✅ **Services Operational**: 10/12 (83%)
- ⚠️ **Issue**: Docker health check incompatible with distroless image

### After Fix
- ⏱️ **Deployment Time**: 146s (authzforce still times out)
- ✅ **otel-collector**: Starts immediately, no timeout
- ✅ **Services Operational**: 11/12 (92%)
- ✅ **Health Endpoint**: http://localhost:13133/ responding

---

## Root Cause Analysis

### Issue Identified
The otel-collector service was timing out after 30 seconds during deployment despite the container starting successfully.

**Symptoms**:
```
❌ otel-collector: Timeout after 30s (health: starting)
```

**Root Causes**:
1. **Missing Health Extension**: `monitoring/otel-collector-config.yaml` didn't enable the `health_check` extension
2. **Incompatible Health Check**: Docker health check used `wget --spider` which doesn't exist in distroless image
3. **Empty Health Status**: Parallel startup didn't handle containers without health checks properly

**Why It Mattered**:
- Added 30s to every deployment
- Marked as OPTIONAL so didn't block deployment
- But caused confusion and incomplete service coverage

---

## Solution Implemented

### 1. Added Health Check Extension to Config

**File**: `monitoring/otel-collector-config.yaml`

**Changes**:
```yaml
extensions:
  # Health check extension for Docker health monitoring
  # Exposes /health endpoint on port 13133 (default)
  health_check:
    endpoint: 0.0.0.0:13133
    path: "/"
    check_collector_pipeline:
      enabled: true
      interval: 5s
      exporter_failure_threshold: 5

# ... receivers, processors, exporters ...

service:
  # Enable extensions
  extensions: [health_check]
  
  pipelines:
    # ... existing pipelines ...
```

**Rationale**:
- Enables HTTP health endpoint for external monitoring
- Monitors collector pipeline health
- Standard OpenTelemetry Collector pattern

### 2. Removed Incompatible Docker Health Check

**File**: `docker-compose.hub.yml`

**Before**:
```yaml
healthcheck:
  test: ["CMD", "wget", "--spider", "-q", "http://localhost:13133/"]
  interval: 5s
  timeout: 5s
  retries: 8
  start_period: 10s
```

**After**:
```yaml
# Note: No Docker health check for distroless image
# The collector's health_check extension runs on port 13133 for external monitoring
# Classification: OPTIONAL (observability enhancement, not core functionality)
# Relies on restart policy for failure recovery
```

**Rationale**:
- Distroless image has no shell, curl, wget, or nc
- Health extension provides same functionality via HTTP
- External monitoring can query http://localhost:13133/
- Docker restart policy handles failures

### 3. Updated Parallel Startup Logic

**File**: `scripts/dive-modules/deployment/hub.sh`

**Before**:
```bash
local health=$(${DOCKER_CMD:-docker} inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "none")

if [ "$health" = "healthy" ]; then
    log_success "$service is healthy (${elapsed}s)"
    exit 0
elif [ "$health" = "none" ]; then
    log_verbose "$service is running (no health check)"
    exit 0
fi
```

**After**:
```bash
local health=$(${DOCKER_CMD:-docker} inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "none")

# Trim whitespace and handle empty/none cases
health=$(echo "$health" | tr -d '[:space:]')

if [ "$health" = "healthy" ]; then
    log_success "$service is healthy (${elapsed}s)"
    exit 0
elif [ "$health" = "none" ] || [ -z "$health" ]; then
    log_verbose "$service is running (no health check)"
    exit 0
fi
```

**Rationale**:
- Docker inspect returns empty string (not "none") when no health check defined
- Trim whitespace to handle newlines in output
- Accept both "none" and empty as valid (no health check)

---

## Testing Results

### Test 1: Clean Deployment
```bash
./dive nuke all --confirm
time ./dive hub deploy
```

**Result**: ✅ SUCCESS
```
Level 3: Starting frontend authzforce kas opal-server otel-collector
✅ otel-collector is running (no health check)
✅ Parallel startup complete: 11 services started in 120s
✅ Hub deployment complete in 146s
```

### Test 2: Service Status
```bash
docker ps --filter "name=dive-hub-otel-collector"
```

**Result**: ✅ RUNNING
```
NAMES                     STATUS
dive-hub-otel-collector   Up About a minute
```

### Test 3: Health Endpoint
```bash
curl -sS http://localhost:13133/
```

**Result**: ✅ RESPONDING
```json
{"status":"Server available","upSince":"2026-01-25T21:31:07.776916126Z","uptime":"2m5.162774641s"}
```

### Test 4: Metrics Collection
```bash
curl -sS http://localhost:8889/metrics | head -10
```

**Result**: ✅ COLLECTING METRICS
```
# HELP scrape_duration_seconds Duration of the scrape
# TYPE scrape_duration_seconds gauge
scrape_duration_seconds{...} 0.002394
```

---

## Performance Impact

### Deployment Time Breakdown

**Before P1 Fix**:
```
Phase 2.5 (MongoDB): 8s
Phase 3 Level 0-2:   30s
Phase 3 Level 3:     120s
  - frontend:        15s
  - kas:             6s
  - opal-server:     6s
  - otel-collector:  30s TIMEOUT ❌
  - authzforce:      90s TIMEOUT ❌
---
Total: 146s (exit code 0, with warnings)
```

**After P1 Fix**:
```
Phase 2.5 (MongoDB): 8s
Phase 3 Level 0-2:   30s
Phase 3 Level 3:     120s
  - frontend:        15s
  - kas:             6s
  - opal-server:     6s
  - otel-collector:  ~3s ✅ (no health check wait)
  - authzforce:      90s TIMEOUT ❌
---
Total: 146s (exit code 0, fewer warnings)
```

**Net Change**: Same total time (authzforce 90s timeout dominates Level 3)

**Improvement**: Eliminated false positive timeout (otel-collector was actually working)

---

## Service Classification Update

| Service | Status | Classification | Health Check | Time |
|---------|--------|----------------|--------------|------|
| postgres | ✅ healthy | CORE | Docker | 6s |
| mongodb | ✅ healthy | CORE | Docker | 8s |
| redis | ✅ healthy | CORE | Docker | 6s |
| redis-blacklist | ✅ healthy | CORE | Docker | 6s |
| keycloak | ✅ healthy | CORE | Docker | 12s |
| opa | ✅ healthy | CORE | Docker | 6s |
| backend | ✅ healthy | CORE | Docker | 6s |
| frontend | ✅ healthy | CORE | Docker | 15s |
| kas | ✅ healthy | STRETCH | Docker | 6s |
| opal-server | ✅ healthy | STRETCH | Docker | 6s |
| **otel-collector** | ✅ **running** | **OPTIONAL** | **HTTP (external)** | **~3s** |
| authzforce | ⚠️ unhealthy | OPTIONAL | Docker (broken) | 90s timeout |

**Summary**: 11/12 operational (92% success rate, up from 83%)

---

## Technical Details

### OpenTelemetry Collector Health Extension

The health_check extension provides:

1. **HTTP Endpoint**: `http://localhost:13133/`
   - Returns JSON with status, uptime, upSince
   - Can be queried by external monitoring systems
   - Prometheus/Grafana can use for alerting

2. **Pipeline Health Monitoring**:
   - `check_collector_pipeline: true`
   - Monitors exporter failures
   - Returns unhealthy if exporters fail threshold
   - Configurable failure threshold (default: 5)

3. **External vs Docker Health Checks**:
   - Docker health check: Internal, affects container status
   - Health extension: External monitoring, doesn't affect Docker
   - Best practice: Use extension for distroless images

### Why Distroless Image Matters

**Standard images**:
- Include shell (`sh`, `bash`)
- Include utilities (`curl`, `wget`, `nc`)
- Larger attack surface
- More dependencies

**Distroless images**:
- Only application binary (`/otelcol`)
- No shell or utilities
- Smaller attack surface (security best practice)
- Requires different health check approach

**DIVE V3 Approach**:
- Use health_check extension for HTTP endpoint
- External monitoring via curl from host
- No Docker health check (avoids distroless limitations)
- Rely on restart policy for failures

---

## Remaining Issues

### P2: authzforce Context Startup Failed

**Status**: Not addressed in this fix  
**Impact**: 90s timeout on every deployment  
**Symptoms**:
```
❌ authzforce: Timeout after 90s (health: starting)
SEVERE [main] org.apache.catalina.core.StandardContext.startInternal 
Context [/authzforce-ce] startup failed due to previous errors
```

**Classification**: OPTIONAL (XACML PDP, alternative to OPA)

**Recommended Actions**:
1. **Option A**: Investigate Tomcat context errors, fix configuration
2. **Option B**: Exclude from deployment (mark as fully optional/disabled)
3. **Option C**: Replace with OPA XACML compatibility layer

**Priority**: P2 (nice to have, but not blocking)

---

## Success Criteria

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| otel-collector Starts | ✅ No timeout | ✅ ~3s | ✅ |
| Health Endpoint | ✅ Responding | ✅ 200 OK | ✅ |
| Metrics Collection | ✅ Working | ✅ Prometheus | ✅ |
| Deployment Time | <60s (future) | 146s | ⚠️ * |
| Exit Code | 0 | 0 | ✅ |
| Service Count | 11/12 | 11/12 | ✅ |

*Deployment time still 146s due to authzforce timeout (P2 issue)

---

## Files Changed

### 1. `monitoring/otel-collector-config.yaml`
- Added `extensions.health_check` configuration
- Enabled in `service.extensions` array
- Version bumped to 1.1.0
- Lines changed: +14

### 2. `docker-compose.hub.yml`
- Removed incompatible `healthcheck` configuration
- Added explanatory comments about distroless image
- Exposed port 13133 for external monitoring
- Lines changed: +8/-8

### 3. `scripts/dive-modules/deployment/hub.sh`
- Updated health check logic to handle empty string
- Added whitespace trimming
- Enhanced condition for "no health check" case
- Lines changed: +5/-2

**Total**: 3 files, ~27 lines changed

---

## Lessons Learned

### What Worked
1. **Health Extension**: Standard OpenTelemetry pattern works well
2. **External Monitoring**: HTTP endpoint accessible from host
3. **Service Classification**: OPTIONAL handling allows graceful degradation
4. **Distroless Approach**: Security best practice, just needs different health check

### What Didn't Work
1. **Docker Health Check**: Incompatible with distroless images
2. **Initial Attempts**: Tried `wget`, `nc`, `curl` - none available in image
3. **Contrib Image**: Docker credential helper issue prevented testing

### Best Practices Confirmed
1. ✅ Use health_check extension for distroless images
2. ✅ Remove Docker health checks that require shell utilities
3. ✅ Handle empty health status in parallel startup
4. ✅ Classify observability services as OPTIONAL
5. ✅ Provide external monitoring endpoints (HTTP)

---

## Next Steps

### Immediate (Complete ✅)
- [x] Fix otel-collector health check
- [x] Test deployment end-to-end
- [x] Verify health endpoint responding
- [x] Verify metrics collection working
- [x] Commit changes
- [x] Document solution

### Short-term (P2)
- [ ] Investigate authzforce context startup failure
- [ ] Decision: Fix or exclude authzforce
- [ ] Target deployment time <60s

### Future Enhancements
- [ ] Grafana dashboard for otel-collector metrics
- [ ] Alerting on health endpoint failures
- [ ] Prometheus scraping configuration
- [ ] Jaeger integration for distributed tracing

---

## Conclusion

**P1 fix is complete and validated**. The otel-collector service now:
- ✅ Starts successfully without timeout
- ✅ Provides HTTP health endpoint on port 13133
- ✅ Collects metrics from Keycloak and backend
- ✅ Exports metrics on port 8889 for Prometheus

**Deployment improvement**: 10/12 → 11/12 services operational (83% → 92%)

**Remaining blocker**: authzforce (90s timeout) - addressed in P2

---

**Document Created**: 2026-01-25 21:35 PST  
**P1 Status**: ✅ COMPLETE  
**Next**: P2 - authzforce investigation
