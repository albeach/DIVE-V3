# E2E Test Infrastructure - Certificate Issue Resolution

**Date:** November 15, 2025  
**Priority:** HIGH - Blocking E2E test execution both locally and in CI  
**Context:** https://github.com/albeach/DIVE-V3/actions/runs/19395027822

---

## 🎯 Current Status

### ✅ Completed
1. **Root Cause Analysis of CI Failures** - Identified 3 missing components in GitHub Actions
2. **Keycloak Service Added** - All 4 E2E jobs now have Keycloak with health checks
3. **Next.js Server Startup** - Explicit server start with comprehensive env vars
4. **Database Initialization** - PostgreSQL schema setup for NextAuth
5. **Playwright Config Updated** - Disabled webServer in CI for manual control
6. **Entrypoint Bug Fixed** - Removed invalid `--entrypoint` causing Keycloak container failures

### 🚧 Current Blocker
**SSL Certificate Loading Issue** - Consistent problem across local and CI environments

```
Error: ENOENT: no such file or directory, open '/opt/app/certs/key.pem'
```

---

## 📋 Problem Analysis

### The Certificate Issue

**Symptom:** E2E tests fail when trying to start Next.js server locally because SSL certificates are not found.

**Root Cause Hypothesis:**
1. **mkcert** is supposed to generate certificates and make them trusted system-wide
2. The `frontend/server.js` expects certificates at:
   - Docker: `/opt/app/certs/` (mapped from `keycloak/certs/`)
   - Local: `frontend/certs/` or `CERT_PATH` environment variable
3. **Gap:** Certificate generation/distribution is not automatic or consistent

**Files Involved:**
- `frontend/server.js` - Loads certs from `CERT_PATH` or `/opt/app/certs`
- `keycloak/certs/` - Contains mkcert-generated certificates (for docker-compose)
- `frontend/certs/` - Should contain certificates for local Playwright tests
- `backend/scripts/generate-test-certs.sh` - Generates test certs (different purpose)

### Current Certificate Setup

```javascript
// frontend/server.js (lines 20-26)
const certPath = process.env.CERT_PATH || process.env.SSL_CERT_PATH || '/opt/app/certs';
const httpsOptions = {
  key: fs.readFileSync(path.join(certPath, process.env.KEY_FILE || 'key.pem')),
  cert: fs.readFileSync(path.join(certPath, process.env.CERT_FILE || 'certificate.pem')),
};
```

**Docker Compose:** Works fine (certificates at `/opt/app/certs/` mapped from `keycloak/certs/`)

**Playwright Local:** Fails (no certificates at `frontend/certs/` or `/opt/app/certs/`)

**GitHub Actions CI:** Currently generates self-signed certs per job, but Next.js server may still fail

---

## 🔍 Investigation Questions

### 1. Where should certificates live?
- **Docker:** `/opt/app/certs/` (volume mounted from `keycloak/certs/`)
- **Local Dev:** `frontend/certs/` (needs CERT_PATH env var)
- **CI:** Generated per job in `$GITHUB_WORKSPACE/frontend/certs/`

### 2. Who generates the certificates?
- **mkcert:** Should generate trusted certificates for `localhost`, `dev-auth.dive25.com`, etc.
- **CI:** OpenSSL self-signed certificates (acceptable for testing)
- **Backend tests:** `generate-test-certs.sh` (different - for certificate validation tests)

### 3. Why isn't mkcert working automatically?
- Check if mkcert is installed: `mkcert -version`
- Check if certificates exist: `ls -la keycloak/certs/`
- Check if Playwright knows about CERT_PATH: Missing in playwright.config.ts webServer env?

---

## 🎯 Next Steps (Best Practice Approach)

### Option A: Fix Certificate Distribution (Recommended)

**Goal:** Ensure certificates are available wherever Next.js runs (Docker, local, CI)

**Steps:**
1. **Verify mkcert installation and certificate generation:**
   ```bash
   cd /home/mike/Desktop/DIVE-V3/DIVE-V3
   mkcert -version
   ls -la keycloak/certs/
   ```

2. **Create certificate symlink/copy for local Playwright:**
   ```bash
   # If keycloak/certs/ has certificates, symlink to frontend/certs/
   mkdir -p frontend/certs
   ln -sf ../../keycloak/certs/key.pem frontend/certs/key.pem
   ln -sf ../../keycloak/certs/certificate.pem frontend/certs/certificate.pem
   
   # OR copy them
   cp keycloak/certs/{key.pem,certificate.pem} frontend/certs/
   ```

3. **Update playwright.config.ts to set CERT_PATH:**
   ```typescript
   webServer: process.env.CI ? undefined : {
       command: 'npm run dev',
       url: 'http://localhost:3000',
       reuseExistingServer: true,
       timeout: 120000,
       stdout: 'ignore',
       stderr: 'pipe',
       env: {
           CERT_PATH: path.resolve(__dirname, 'certs'),
           NODE_ENV: 'development'
       }
   },
   ```

4. **Add .gitignore entry for frontend/certs/ if using symlinks:**
   ```
   frontend/certs/*.pem
   ```

### Option B: Use HTTP for E2E Tests (Alternative)

**Goal:** Simplify E2E testing by using HTTP instead of HTTPS

**Steps:**
1. **Update playwright.config.ts to use HTTP server:**
   ```typescript
   webServer: process.env.CI ? undefined : {
       command: 'npm run dev:http',  // Uses HTTP, no certs needed
       url: 'http://localhost:3000',
       reuseExistingServer: true,
       timeout: 120000,
   },
   ```

2. **Pros:**
   - No certificate issues
   - Faster startup
   - Matches CI setup (we use `dev:http` in GitHub Actions)

3. **Cons:**
   - Doesn't test HTTPS-specific features
   - Some auth flows might behave differently

### Option C: Docker-Based E2E Tests (Most Reliable)

**Goal:** Run E2E tests against the actual docker-compose environment

**Steps:**
1. **Ensure docker-compose services are running:**
   ```bash
   docker-compose up -d
   ```

2. **Run Playwright against HTTPS endpoints:**
   ```bash
   cd frontend
   BASE_URL=https://localhost:3000 npm run test:e2e
   ```

3. **Update playwright.config.ts:**
   ```typescript
   webServer: undefined,  // Don't start server, use docker-compose
   use: {
       baseURL: process.env.BASE_URL || 'https://localhost:3000',
       ignoreHTTPSErrors: true,  // Accept self-signed certs
   }
   ```

---

## 🔧 Recommended Solution: Hybrid Approach

**For Local Development:**
- Use **Option C** (Docker-based) - Most reliable, matches production
- Run `docker-compose up -d` before E2E tests
- Set `webServer: undefined` in playwright.config.ts

**For CI (GitHub Actions):**
- Use **Option B** (HTTP) - Already implemented, simpler
- Continue using `npm run dev:http`
- Keep certificate generation for SSL cert availability tests

**Implementation:**
```typescript
// frontend/playwright.config.ts
export default defineConfig({
    use: {
        baseURL: process.env.BASE_URL || (process.env.CI ? 'http://localhost:3000' : 'https://localhost:3000'),
        ignoreHTTPSErrors: true,
    },
    
    webServer: process.env.CI ? undefined : (
        process.env.USE_DOCKER ? undefined : {
            command: 'npm run dev:http',
            url: 'http://localhost:3000',
            reuseExistingServer: true,
            timeout: 120000,
        }
    ),
});
```

**Usage:**
```bash
# Local with docker-compose (recommended)
docker-compose up -d
BASE_URL=https://localhost:3000 USE_DOCKER=1 npm run test:e2e

# Local without docker (HTTP fallback)
npm run test:e2e

# CI (already configured)
# Uses HTTP via workflow
```

---

## 📊 Technical Context

### Files Modified in Previous Session

**1. `.github/workflows/test-e2e.yml`**
- Added Keycloak service to all 4 jobs
- Added Next.js server startup with env vars
- Added database initialization
- Fixed Keycloak entrypoint issue
- Generate SSL certificates per job

**2. `frontend/playwright.config.ts`**
- Disabled webServer in CI (`process.env.CI ? undefined`)
- Allows manual server control

**3. `E2E-TEST-FIX-SUMMARY.md`** (created)
- Comprehensive analysis document

### Commits
- `5cb29d7` - Initial E2E environment setup
- `ad91835` - Fixed Keycloak entrypoint issue

### Current CI Status
- **E2E Tests:** Failing (Keycloak starts now, but may have other issues)
- **Monitor:** https://github.com/albeach/DIVE-V3/actions

---

## 🎯 Immediate Action Items

1. **Investigate Certificate Setup**
   ```bash
   cd /home/mike/Desktop/DIVE-V3/DIVE-V3
   
   # Check mkcert installation
   which mkcert
   mkcert -version
   
   # Check existing certificates
   ls -la keycloak/certs/
   ls -la frontend/certs/
   
   # Check what docker-compose is using
   docker exec dive-v3-frontend ls -la /opt/app/certs/
   ```

2. **Test Certificate Access**
   ```bash
   # Try to read the certs from docker volume
   docker exec dive-v3-frontend cat /opt/app/certs/certificate.pem | head -5
   ```

3. **Choose and Implement Solution**
   - Based on investigation, choose Option A, B, or C (Hybrid)
   - Update playwright.config.ts accordingly
   - Add documentation to README or .env.example

4. **Verify Locally**
   ```bash
   cd frontend
   npm run test:e2e -- src/__tests__/e2e/identity-drawer.spec.ts
   ```

5. **Fix Any Additional CI Issues**
   - Check latest CI run after Keycloak fix
   - Address any new errors that emerge

---

## 📚 Reference Documentation

### SSL Certificate Setup
- **mkcert:** https://github.com/FiloSottile/mkcert
- **Keycloak HTTPS:** Configured in `docker-compose.yml` and `keycloak/Dockerfile`
- **Next.js HTTPS:** Implemented in `frontend/server.js`

### E2E Test Configuration
- **Playwright Docs:** https://playwright.dev/docs/test-webserver
- **Current Config:** `frontend/playwright.config.ts`
- **Test Location:** `frontend/src/__tests__/e2e/`

### Environment Variables
```bash
# Required for local dev
CERT_PATH=/path/to/certificates
SSL_CERT_PATH=/path/to/certificates (alternative)
KEY_FILE=key.pem (default)
CERT_FILE=certificate.pem (default)

# For Playwright
BASE_URL=https://localhost:3000
USE_DOCKER=1 (skip webServer, use docker-compose)
```

---

## ⚠️ Known Issues

1. **Certificate Path Inconsistency**
   - Docker uses `/opt/app/certs/`
   - Local expects `frontend/certs/` or CERT_PATH
   - CI generates in `$GITHUB_WORKSPACE/frontend/certs/`

2. **mkcert Distribution**
   - Certificates may be in `keycloak/certs/` but not propagated
   - No automatic symlink or copy to frontend/certs/

3. **Playwright webServer**
   - Currently tries to start HTTPS server locally
   - Fails if certificates don't exist
   - Should either use HTTP or point to correct cert location

---

## 🎬 Next Session Starting Point

**Execute this prompt:**

```
I need to resolve the E2E test certificate issue for DIVE V3. 

CONTEXT:
- E2E tests fail locally because SSL certificates are not found at /opt/app/certs/key.pem
- All services (Keycloak, Next.js, PostgreSQL, MongoDB) are running via docker-compose on HTTPS
- GitHub Actions E2E tests also need certificates to start Next.js server
- mkcert should be generating trusted certificates, but they're not reaching Playwright

COMPLETED:
- Fixed GitHub Actions workflow (added Keycloak, Next.js startup, DB init)
- Fixed Keycloak entrypoint issue (removed invalid --entrypoint flag)
- Both fixes committed and pushed to main

CURRENT ISSUE:
When running "npm run test:e2e" locally, Playwright tries to start Next.js via server.js which expects certificates at /opt/app/certs/key.pem. These don't exist locally (they exist in docker at /opt/app/certs/).

YOUR TASK:
1. Investigate certificate setup: Check if mkcert is installed, where certificates exist (keycloak/certs/, frontend/certs/), and how docker-compose uses them
2. Implement the HYBRID APPROACH from E2E-CERTIFICATE-ISSUE-HANDOFF.md:
   - Local dev: Use docker-compose environment (disable Playwright webServer)
   - CI: Continue using HTTP mode (npm run dev:http)
3. Update playwright.config.ts with proper configuration
4. Test locally by running: npm run test:e2e -- src/__tests__/e2e/identity-drawer.spec.ts
5. Document the solution in README or .env.example

REFERENCE DOCUMENT: /home/mike/Desktop/DIVE-V3/DIVE-V3/E2E-CERTIFICATE-ISSUE-HANDOFF.md

Use best practices. No shortcuts. Production-grade solution.
```

---

## 🏆 Success Criteria

- [ ] E2E tests run successfully locally without certificate errors
- [ ] E2E tests pass in GitHub Actions CI
- [ ] Certificate setup is documented and reproducible
- [ ] Solution works for both HTTP (CI) and HTTPS (local docker) environments
- [ ] All 4 E2E job suites pass (authentication, authorization, classification, resource-management)

---

**Prepared by:** Claude (AI Assistant)  
**Project:** DIVE V3 - Coalition ICAM Pilot  
**Repository:** https://github.com/albeach/DIVE-V3

