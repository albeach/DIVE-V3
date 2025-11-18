# E2E HTTPS Fix - Iteration 2

**Date**: November 16, 2025  
**Previous**: E2E-HTTPS-FIX-COMPLETE.md  
**Status**: ⚙️ IN PROGRESS - Testing Fix

---

## 🔍 Issue Found in First Attempt

After deploying the HTTPS changes (commits `13a9a81` and `f68f195`), the E2E tests still failed. Analysis revealed:

### Problem 1: Keycloak Health Check Port Mismatch ❌

**Classification Equivalency** and **Resource Management** jobs were checking the wrong port:

```yaml
# ❌ WRONG - Checking application port
if curl -k -f https://localhost:8443/health/ready 2>/dev/null; then
```

**Result**: 5-minute timeout waiting for health endpoint that doesn't exist

**Why It Failed**:
- Keycloak 26.x has **separated architecture**:
  - Port 8443: Application endpoints (admin API, realms, OIDC)
  - Port 9000: Management interface (health, metrics, readiness)
- Health checks MUST use port 9000

### Problem 2: Next.js HTTPS Server Startup Issue 🚧

**Authentication Flows** job showed:

```
[AUTH] ❌ Login failed for testuser-esp-secret: 
page.goto: net::ERR_ABORTED at https://localhost:3000/
```

**Possible Causes**:
1. Certificate path not being found by custom `server.js`
2. HTTPS server failing to start silently
3. Missing dependencies for HTTPS server

---

## 🔧 Fix Applied - Iteration 2

### Commit: `8447b4f` - Health Check Port Fix

**File**: `.github/workflows/test-e2e.yml`

**Changed Lines**: 576 and 768

```diff
- if curl -k -f https://localhost:8443/health/ready 2>/dev/null; then
-   echo "✅ Keycloak is ready on HTTPS"
+ if curl -k -f https://localhost:9000/health/ready 2>/dev/null; then
+   echo "✅ Keycloak is ready on HTTPS (management port 9000)"
```

**Impact**:
- Classification Equivalency job should now pass Keycloak configuration
- Resource Management job should now pass Keycloak configuration
- Consistent with Authentication and Authorization jobs (already using port 9000)

---

## 📊 Previous Test Results Analysis

### CI/CD Run #19411837223 (Failed)

#### ✅ What Worked:
1. **Keycloak Container Started** - Up and running on ports 8443/9000
2. **Authentication Job** - Keycloak configuration passed ✅
3. **Authorization Job** - Keycloak configuration passed ✅  
4. **SSL Certificates** - Generated successfully for both Keycloak and Frontend

#### ❌ What Failed:

**Job 1: Classification Equivalency**
- Configure Keycloak: ❌ TIMEOUT (5 minutes)
- Reason: Checking port 8443 instead of 9000
- Next.js never started (skipped due to previous failure)

**Job 2: Authentication Flows**  
- Keycloak: ✅ PASSED (using correct port 9000)
- Next.js: ✅ Started
- Tests: ❌ FAILED - `net::ERR_ABORTED` at `https://localhost:3000/`

**Job 3: Authorization Checks**
- Keycloak: ✅ PASSED (using correct port 9000)
- Next.js: ✅ Started  
- OPA: ✅ Started
- Tests: ❌ FAILED - Similar connection errors

**Job 4: Resource Management**
- Configure Keycloak: ❌ TIMEOUT (5 minutes)
- Reason: Checking port 8443 instead of 9000
- Subsequent steps skipped

---

## 🎯 Expected Outcomes - Iteration 2

### Infrastructure Layer (Should Pass Now ✅)
1. ✅ Keycloak starts on 8443/9000
2. ✅ All 4 jobs pass Keycloak configuration (port 9000 health check)
3. ✅ Next.js starts with HTTPS
4. ✅ SSL certificates loaded correctly

### Test Execution Layer (Still Unknown 🔍)
- Tests may still fail due to:
  - Certificate trust issues in Playwright
  - Next.js HTTPS server configuration
  - Test assertions expecting different responses

---

## 🔬 Next Debugging Steps

### If Keycloak Times Out Again:
1. Check Docker container logs: `docker logs keycloak`
2. Verify port 9000 is exposed: `docker ps` should show `0.0.0.0:9000->9000/tcp`
3. Test health endpoint from host: `curl -k https://localhost:9000/health/ready`

### If Next.js Fails to Start:
1. Check `nextjs.log` in CI artifacts
2. Verify certificate path:  
   ```bash
   ls -la ${{ github.workspace }}/frontend/certs/
   ```
3. Test HTTPS server locally:
   ```bash
   export CERT_PATH=./frontend/certs
   cd frontend && npm run dev
   curl -k https://localhost:3000
   ```

### If Tests Fail with ERR_ABORTED:
1. Check if server is responding: `curl -k -I https://localhost:3000`
2. Review Playwright config - verify `ignoreHTTPSErrors: true` is set
3. Check NextAuth configuration - ensure `NEXTAUTH_URL` is HTTPS
4. Examine test logs for certificate errors

---

## 📋 All Commits This Session

1. **13a9a81** - Fix test-config.ts Keycloak URL (HTTP → HTTPS)
2. **f68f195** - Fix CI/CD workflows to use HTTPS for Next.js (32 files changed)
3. **8447b4f** - Fix Keycloak health check ports for remaining 2 jobs

---

## 🚦 Current CI/CD Status

**Run**: In Progress  
**Commit**: `8447b4f`  
**Branch**: `main`  
**Workflow**: E2E Tests  

**Watch Command**:
```bash
gh run watch
# or
gh run list --limit 5
```

---

## 📝 Technical Notes

### Keycloak 26.x Port Architecture
```
┌─────────────────────────────────────┐
│   Keycloak 26.4.2 Container         │
├─────────────────────────────────────┤
│  Port 8443 (HTTPS)                  │
│  - Admin API (/admin/realms)        │
│  - Realms (/realms/*)               │
│  - OIDC endpoints                   │
│  - SAML endpoints                   │
├─────────────────────────────────────┤
│  Port 9000 (HTTPS - Management)     │
│  - /health/ready  ← HEALTH CHECK    │
│  - /health/live                     │
│  - /metrics                         │
└─────────────────────────────────────┘
```

### Next.js HTTPS Server (server.js)
```javascript
const certPath = process.env.CERT_PATH || '/opt/app/certs';
const httpsOptions = {
  key: fs.readFileSync(path.join(certPath, 'key.pem')),
  cert: fs.readFileSync(path.join(certPath, 'certificate.pem')),
};
createServer(httpsOptions, handler).listen(3000);
// > Ready on https://localhost:3000
```

### Certificate Locations in CI
```
${{ github.workspace }}/
├── frontend/certs/
│   ├── key.pem
│   └── certificate.pem
└── keycloak-certs/
    ├── key.pem
    └── cert.pem
```

---

## ✅ Success Criteria

**Infrastructure** (Primary Goal):
- [ ] All 4 E2E jobs complete Keycloak configuration step
- [ ] Next.js starts successfully on HTTPS in all jobs
- [ ] No 5-minute timeouts
- [ ] Health checks pass on port 9000

**Tests** (Secondary - May Need Additional Work):
- [ ] Tests can connect to https://localhost:3000
- [ ] Keycloak redirects work with HTTPS
- [ ] NextAuth sessions establish correctly
- [ ] At least 1 test scenario passes end-to-end

---

**STATUS**: Waiting for CI/CD results from commit `8447b4f`

**ETA**: 6-8 minutes

🚀


