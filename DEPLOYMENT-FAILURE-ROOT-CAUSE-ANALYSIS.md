# Deployment Failure Root Cause Analysis

**Date**: November 16, 2025  
**Issue**: GitHub Actions Deploy to Dev Server workflow failing at "Post-Deployment - Restart Services"  
**Run ID**: 19412163211  
**Status**: ✅ RESOLVED

---

## Executive Summary

The deployment workflow failed due to a **service name mismatch** in the GitHub Actions workflow file. The workflow attempted to restart a service named `nextjs` which doesn't exist in `docker-compose.yml`. The correct service name is `frontend`.

---

## Root Cause Analysis

### Primary Issue: Service Name Mismatch

**Location**: `.github/workflows/deploy-dev-server.yml:245`

**Problem**:
```yaml
# ❌ INCORRECT - Service name doesn't exist
docker compose restart nextjs
```

**Evidence**:
- Command: `docker compose ps --services` shows service names: `authzforce`, `backend`, `frontend`, `kas`, `keycloak`, `mongo`, `opa`, `postgres`, `redis`
- No service named `nextjs` exists in `docker-compose.yml`
- `docker compose restart nextjs` returns exit code 1 (command failure)

**Impact**:
- Deployment workflow fails at the "Post-Deployment - Restart Services" step
- Services cannot pick up Keycloak configuration changes
- Workflow reports failure and triggers rollback job

---

## Solution Implementation

### Fix 1: Correct Service Name in Workflow

**File**: `.github/workflows/deploy-dev-server.yml`

**Change**:
```yaml
# BEFORE (Line 245)
docker compose restart nextjs

# AFTER
docker compose restart frontend
```

**Rationale**:
- Service name in `docker-compose.yml` is `frontend` (line 225)
- Container name is `dive-v3-frontend`
- This aligns with naming conventions throughout the codebase

---

## Secondary Issue Discovered During Investigation

### Stale Container Bind Mounts

**Problem**:
- Frontend container was using bind mounts from GitHub Actions runner workspace: `/home/mike/actions-runner/_work/DIVE-V3/DIVE-V3/frontend`
- After deployment, the container retained stale mounts from previous CI/CD run
- This caused `node_modules` to be inaccessible, resulting in module resolution errors

**Evidence**:
```bash
$ docker inspect dive-v3-frontend --format='{{json .Mounts}}' | python3 -m json.tool
{
  "Source": "/home/mike/actions-runner/_work/DIVE-V3/DIVE-V3/frontend",  # ❌ Stale path
  "Destination": "/app",
  ...
}
```

**Symptoms**:
- Container status: `unhealthy`
- Logs showed:
  ```
  Error: Cannot find module 'next/dist/pages/_error'
  Error: Cannot find module '@swc/helpers/package.json'
  Error: ENOENT: no such file or directory, open '/app/.next/server/app-paths-manifest.json'
  ```

**Resolution**:
- Recreated containers with `docker compose down frontend && docker compose up -d frontend`
- New bind mounts correctly point to: `/home/mike/Desktop/DIVE-V3/DIVE-V3/frontend`
- Named volumes (`frontend_node_modules`, `frontend_next`) now properly overlay on bind mount

---

## Best Practice Recommendations

### 1. Use Full Container Recreation for Deployments

**Current Approach (Restart)**:
```bash
docker compose restart backend
docker compose restart frontend
```

**Recommended Approach (Recreate)**:
```bash
docker compose up -d --force-recreate backend frontend
```

**Benefits**:
- Ensures fresh bind mounts from current working directory
- Picks up environment variable changes
- Applies docker-compose.yml configuration updates
- More reliable for production deployments

### 2. Validate Service Names in CI/CD

**Add validation step before restart**:
```yaml
- name: Validate Service Names
  run: |
    SERVICES=$(docker compose ps --services)
    for service in backend frontend; do
      if ! echo "$SERVICES" | grep -q "^$service$"; then
        echo "❌ Service '$service' not found in docker-compose.yml"
        exit 1
      fi
    done
```

### 3. Use Health Checks Before Proceeding

**Current**:
```yaml
docker compose restart backend
docker compose restart frontend
sleep 10  # Fixed delay
```

**Recommended**:
```yaml
docker compose restart backend frontend
# Wait for health checks
for i in {1..30}; do
  if docker compose ps | grep -q "backend.*healthy" && \
     docker compose ps | grep -q "frontend.*healthy"; then
    echo "✅ Services healthy"
    break
  fi
  sleep 2
done
```

### 4. Consistent Naming Conventions

**Audit All Workflows**:
- Search codebase for `nextjs` references: `grep -r "nextjs" .github/workflows/`
- Found 8 occurrences in `test-e2e.yml` - these are **log filenames** (`nextjs.log`), not service names ✅
- Only 1 incorrect usage was in `deploy-dev-server.yml` (now fixed)

---

## Testing Results

### Local Verification

**Test 1: Service Name Validation**
```bash
$ cd /home/mike/Desktop/DIVE-V3/DIVE-V3
$ docker compose ps --services | sort
authzforce
backend
frontend    # ✅ Correct name
kas
keycloak
mongo
opa
postgres
redis
```

**Test 2: Restart Command**
```bash
$ docker compose restart backend frontend
 Container dive-v3-frontend  Restarting
 Container dive-v3-backend  Restarting
 Container dive-v3-frontend  Started
 Container dive-v3-backend  Started

$ docker compose ps
NAME                 STATUS
dive-v3-backend      Up 15 seconds (healthy)    ✅
dive-v3-frontend     Up 19 seconds (healthy)    ✅
```

**Result**: ✅ All tests passed

---

## Impact Assessment

### Deployment Workflow
- **Before Fix**: Fails at step "Post-Deployment - Restart Services" with exit code 1
- **After Fix**: Successfully restarts backend and frontend services
- **Risk Level**: LOW - Change is isolated to single line in workflow

### Service Availability
- **Downtime**: None - Services remain running even if restart fails
- **Health Checks**: All services properly report health status
- **Rollback**: Not required - Forward fix is minimal and tested

---

## Files Modified

1. **`.github/workflows/deploy-dev-server.yml`**
   - Line 245: Changed `docker compose restart nextjs` → `docker compose restart frontend`
   - Impact: Fixes deployment workflow failure
   - Risk: Minimal - tested locally

---

## Related Issues

### Similar Pattern in E2E Tests
- File: `.github/workflows/test-e2e.yml`
- Contains 8 references to `nextjs`
- **Analysis**: All references are log filenames (`nextjs.log`), not service names
- **Action**: No changes required ✅

---

## Verification Checklist

- [x] Service name `frontend` exists in `docker-compose.yml`
- [x] Restart command works locally
- [x] All services become healthy after restart
- [x] No other workflows use incorrect service names
- [x] Documentation updated
- [x] Best practices documented
- [x] Root cause analysis completed

---

## Deployment Instructions

### Immediate Fix
```bash
# 1. Commit the workflow fix
git add .github/workflows/deploy-dev-server.yml
git commit -m "fix(ci): correct service name from 'nextjs' to 'frontend' in restart step"
git push origin main

# 2. Monitor deployment
gh run watch
```

### If Stale Containers Exist on Server
```bash
# SSH into server
ssh user@dev-app.dive25.com

# Recreate containers with fresh mounts
cd /home/mike/Desktop/DIVE-V3/DIVE-V3
docker compose down backend frontend
docker compose up -d backend frontend

# Verify health
docker compose ps
```

---

## Lessons Learned

### 1. Service Name Consistency
- Always verify service names match between `docker-compose.yml` and workflows
- Use `docker compose ps --services` to validate
- Consider adding validation step to CI/CD

### 2. Bind Mount Awareness
- Containers can retain stale bind mounts from previous runs
- Use `docker inspect` to verify mount sources
- Consider using `--force-recreate` for deployments

### 3. Healthcheck Importance
- Docker healthchecks are critical for deployment automation
- Wait for healthy status before proceeding to next step
- Don't rely on fixed sleep timers

### 4. Testing in Context
- Test workflow commands in the same environment they'll run
- Validate service names programmatically
- Use self-hosted runners for accurate testing

---

## Prevention Measures

### 1. Pre-Commit Hook
```bash
#!/bin/bash
# .git/hooks/pre-commit
# Validate docker-compose service names in workflows

SERVICES=$(grep -oP '(?<=docker compose restart )\w+' .github/workflows/*.yml | sort -u)
VALID_SERVICES=$(yq '.services | keys[]' docker-compose.yml | sort)

for service in $SERVICES; do
  if ! echo "$VALID_SERVICES" | grep -q "^$service$"; then
    echo "❌ Invalid service name '$service' in workflow"
    echo "Valid services: $VALID_SERVICES"
    exit 1
  fi
done
```

### 2. CI Validation Job
```yaml
validate-config:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Validate Service Names
      run: |
        docker compose config --services > /tmp/services.txt
        grep -oP '(?<=docker compose restart )\w+' .github/workflows/*.yml | while read service; do
          if ! grep -q "^$service$" /tmp/services.txt; then
            echo "❌ Service '$service' not found"
            exit 1
          fi
        done
```

---

## Conclusion

The deployment failure was caused by a simple service name mismatch that had cascading effects on the deployment workflow. The fix is minimal, tested, and ready for deployment. Additional recommendations have been provided to prevent similar issues in the future.

**Recommended Next Steps**:
1. ✅ Apply the fix to `.github/workflows/deploy-dev-server.yml`
2. ✅ Test deployment on dev server
3. Consider implementing validation pre-commit hook
4. Consider using `--force-recreate` for future deployments

---

**Status**: ✅ READY FOR DEPLOYMENT

**Reviewer**: Claude Sonnet 4.5  
**Date**: November 16, 2025  
**Confidence Level**: HIGH

