# Test Deployment Workflow - Step-by-Step

**Status:** Ready to test  
**Estimated Time:** 15-20 minutes  
**Date:** November 12, 2025

---

## ✅ Prerequisites Verified

- ✅ GitHub Secrets configured (ENV_BACKEND, ENV_FRONTEND)
- ✅ Self-hosted runner installed (dive-v3-dev-server)
- ✅ Runner showing as "Idle" in GitHub
- ✅ All scripts pushed to GitHub

**Ready for first deployment test!**

---

## 🚀 Deployment Test Procedure

### Step 1: Trigger Deployment Workflow (Web UI)

1. **Open in browser:**
   https://github.com/albeach/DIVE-V3/actions/workflows/deploy-dev-server.yml

2. **Click the "Run workflow" button** (right side, blue button)

3. **Configure workflow:**
   - **Use workflow from:** Branch: `main`
   - **Deployment environment:** `development` (default)
   - **Skip smoke tests:** Leave unchecked (default: false)
   - **Force database backup:** Leave unchecked (default: false)

4. **Click "Run workflow"** (green button)

5. **Workflow should start immediately**
   - You'll see a yellow dot (running)
   - Click on the workflow run to see details

---

### Step 2: Monitor Deployment Progress

The workflow will run these jobs:

#### Job 1: Deploy (10-15 min)
```
✓ Checkout Code
✓ Display Deployment Info
✓ Pre-Deployment - Check Disk Space
✓ Pre-Deployment - Verify Docker
✓ Pre-Deployment - Verify Files
✓ Deploy Backend .env
✓ Deploy Frontend .env.local
✓ Execute Deployment (runs deploy-dev.sh)
  ├─ Backing up current state
  ├─ Stopping services
  ├─ Pulling images
  ├─ Starting services
  └─ Running health checks (8 services)
✓ Post-Deployment - Health Checks
✓ Post-Deployment - Verify Endpoints
✓ Post-Deployment - Smoke Tests
✓ Cleanup Old Docker Resources
✓ Deployment Summary
```

**Expected Runtime:** 10-15 minutes

---

### Step 3: Watch for Success Indicators

**In GitHub Actions logs, you should see:**

```
✅ Pre-deployment checks passed
✅ .env files deployed
✅ Deployment script executing
✅ All health checks passed
✅ Deployment to dev-app.dive25.com successful!

🌐 Endpoints:
  Frontend:  https://dev-app.dive25.com
  Backend:   https://dev-api.dive25.com
  Keycloak:  https://dev-auth.dive25.com
```

---

### Step 4: Verify Deployment (After Workflow Completes)

**Check Services:**

1. **Frontend:**
   - Open: https://dev-app.dive25.com
   - Should load DIVE V3 login page

2. **Backend:**
   - Open: https://dev-api.dive25.com/health
   - Should return: `{"status":"healthy"}`

3. **Keycloak:**
   - Open: https://dev-auth.dive25.com/health
   - Should return: `{"status":"UP"}`

---

## 🔍 What to Watch For

### Success Signs ✅
- Workflow shows green checkmark
- All steps complete without errors
- Health checks all pass
- Endpoints are accessible
- Deployment summary shows success

### Warning Signs ⚠️
- Yellow indicators (warnings but may succeed)
- Slow health checks (may timeout)
- Service startup delays

### Failure Signs ❌
- Red X on any step
- Health check failures
- Rollback job triggers
- Services not accessible

---

## 🔄 If Deployment Fails

**Don't worry!** The workflow has automatic rollback:

1. **Rollback job will trigger automatically**
2. **Previous state will be restored**
3. **Services will remain accessible**
4. **GitHub issue will be created** with failure details

**To investigate:**
- Check the workflow logs for the failed step
- Review the deployment logs artifact
- Check health check results
- Verify .env files are correct in GitHub Secrets

**To retry:**
- Fix the issue
- Click "Re-run jobs" in GitHub Actions
- Or trigger manually again

---

## 📊 Expected Timeline

| Step | Duration | What Happens |
|------|----------|--------------|
| Checkout & Setup | 1-2 min | Clone code, verify files |
| Deploy .env Files | <1 min | Write secrets to files |
| Execute Deployment | 5-7 min | Stop services, deploy, start services |
| Health Checks | 3-5 min | Verify 8 services + 11 Keycloak realms |
| Smoke Tests | 1-2 min | Basic functionality validation |
| Cleanup | 1 min | Remove old Docker images |
| **TOTAL** | **12-18 min** | **Full deployment cycle** |

---

## 🎯 Success Criteria

Deployment is successful when:

- ✅ All workflow steps show green checkmark
- ✅ Health checks pass (8/8 services)
- ✅ Keycloak realms accessible (11/11 realms)
- ✅ Frontend accessible: https://dev-app.dive25.com
- ✅ Backend accessible: https://dev-api.dive25.com/health
- ✅ Keycloak accessible: https://dev-auth.dive25.com/health
- ✅ No rollback triggered
- ✅ Deployment summary shows success

---

## 🐛 Common Issues & Fixes

### Issue 1: Disk space check fails
**Error:** "Insufficient disk space"  
**Fix:** Clean up old Docker images on server:
```bash
docker system prune -a --volumes -f
```

### Issue 2: Health check timeout
**Error:** "Service failed to become healthy"  
**Fix:** Services may just need more time. Check logs:
```bash
docker-compose logs <service-name>
```

### Issue 3: .env deployment fails
**Error:** "Failed to deploy backend/.env"  
**Fix:** Verify GitHub Secrets are correct:
- https://github.com/albeach/DIVE-V3/settings/secrets/actions

### Issue 4: Services won't start
**Error:** Docker errors during startup  
**Fix:** Check Docker daemon is running:
```bash
sudo systemctl status docker
```

---

## 📸 After Deployment - Quick Checks

Run these in your home server terminal to verify:

```bash
# Check all containers running
docker-compose ps

# Check Keycloak health
curl -k https://localhost:8443/health

# Check Backend health
curl -k https://localhost:4000/health

# Check Frontend
curl http://localhost:3000

# Check runner is still idle
sudo systemctl status actions.runner.albeach-DIVE-V3.dive-v3-dev-server.service
```

---

## 📋 Next Steps After Successful Deployment

1. ✅ Verify all endpoints accessible
2. ✅ Test authentication flow (login to frontend)
3. ✅ Test authorization (access a resource)
4. ✅ Review deployment logs
5. ✅ Mark Week 1 as 100% complete!

---

**Ready to trigger the deployment?**

Follow Step 1 above: Go to the workflow page and click "Run workflow"!

Tell me when the workflow completes (success or failure)!

