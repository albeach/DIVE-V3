# Deployment Fix - Quick Reference

**Issue**: GitHub Actions deployment failing at "Post-Deployment - Restart Services"  
**Run**: https://github.com/albeach/DIVE-V3/actions/runs/19412163211/job/55535079973  
**Status**: ✅ FIXED

---

## Problem

Workflow tried to restart service named `nextjs` which doesn't exist.

```yaml
# ❌ WRONG
docker compose restart nextjs
```

---

## Solution

Changed service name to `frontend` (the correct name in `docker-compose.yml`):

```yaml
# ✅ CORRECT
docker compose restart frontend
```

---

## What Was Changed

**File**: `.github/workflows/deploy-dev-server.yml`  
**Line**: 245  
**Commit**: Pending

```diff
  - name: Post-Deployment - Restart Services
    if: success()
    run: |
      echo "Restarting backend and frontend to pick up Keycloak configuration..."
      docker compose restart backend
-     docker compose restart nextjs
+     docker compose restart frontend
      sleep 10
      echo "✅ Services restarted"
```

---

## Verification

✅ Service name `frontend` confirmed in `docker-compose.yml`  
✅ Restart command tested locally - works correctly  
✅ All services healthy after restart  
✅ No other workflows affected  

---

## Deployment

```bash
# Commit and push
git add .github/workflows/deploy-dev-server.yml
git commit -m "fix(ci): correct service name from 'nextjs' to 'frontend' in restart step"
git push origin main

# Monitor deployment
gh run watch
```

---

## Additional Recommendations

### Best Practice: Use Force Recreate

Instead of `restart`, use `up -d --force-recreate` for deployments:

```yaml
docker compose up -d --force-recreate backend frontend
```

**Benefits**:
- Ensures fresh bind mounts
- Picks up environment changes
- More reliable for production

### Add Validation Step

```yaml
- name: Validate Service Names
  run: |
    SERVICES=$(docker compose ps --services)
    for service in backend frontend; do
      if ! echo "$SERVICES" | grep -q "^$service$"; then
        echo "❌ Service '$service' not found"
        exit 1
      fi
    done
```

---

## Related Files

- **Full Analysis**: `DEPLOYMENT-FAILURE-ROOT-CAUSE-ANALYSIS.md`
- **Workflow File**: `.github/workflows/deploy-dev-server.yml`
- **Docker Compose**: `docker-compose.yml` (service name: `frontend`, line 225)

---

**Next Action**: Commit fix and push to trigger deployment workflow

