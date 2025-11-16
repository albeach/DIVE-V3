# E2E HTTPS Fix - Complete

**Date**: November 16, 2025  
**Session**: Continuing from NEXT-SESSION-COMPREHENSIVE-PROMPT.md  
**Status**: ✅ ALL FIXES APPLIED AND COMMITTED

---

## 🎯 Problem Identified

The E2E tests were failing due to **HTTP/HTTPS mismatch** between test configuration and actual server setup:

### Root Causes Found

1. **test-config.ts** (Line 103):
   ```typescript
   // ❌ OLD - Hardcoded HTTP
   KEYCLOAK_BASE: process.env.KEYCLOAK_URL || 'http://localhost:8081',
   
   // ✅ NEW - HTTPS on correct port
   KEYCLOAK_BASE: process.env.KEYCLOAK_URL || 'https://localhost:8443',
   ```

2. **CI/CD Workflows** - Frontend Server:
   ```yaml
   # ❌ OLD - HTTP mode
   nohup npm run dev:http > nextjs.log 2>&1 &
   if curl -f http://localhost:3000 2>/dev/null; then
   
   # ✅ NEW - HTTPS mode
   export CERT_PATH="${{ github.workspace }}/frontend/certs"
   nohup npm run dev > nextjs.log 2>&1 &
   if curl -k -f https://localhost:3000 2>/dev/null; then
   ```

3. **Environment Variables**:
   ```yaml
   # ❌ OLD
   NEXTAUTH_URL: http://localhost:3000
   BASE_URL: http://localhost:3000
   
   # ✅ NEW
   NEXTAUTH_URL: https://localhost:3000
   BASE_URL: https://localhost:3000
   ```

---

## 🔧 Fixes Applied

### Commit 1: `13a9a81` - Test Configuration
**File**: `frontend/src/__tests__/e2e/fixtures/test-config.ts`

```typescript
KEYCLOAK_BASE: process.env.KEYCLOAK_URL || 'https://localhost:8443',
```

**Impact**: Tests now correctly connect to Keycloak HTTPS endpoint

---

### Commit 2: `f68f195` - CI/CD Workflows
**File**: `.github/workflows/test-e2e.yml`

**Changes Applied to ALL 4 Test Jobs:**

1. **Authentication E2E Tests** (lines 211-257)
2. **Authorization E2E Tests** (lines 416-463)
3. **Classification Equivalency E2E Tests** (lines 621-654)
4. **Resource Management E2E Tests** (lines 813-855)

**Specific Changes Per Job:**

#### Start Next.js Server Step:
```yaml
- name: Start Next.js Development Server
  run: |
    cd frontend
    export CERT_PATH="${{ github.workspace }}/frontend/certs"
    nohup npm run dev > nextjs.log 2>&1 &  # HTTPS server
    
    for i in {1..60}; do
      if curl -k -f https://localhost:3000 2>/dev/null; then
        echo "✅ Next.js is ready"
        break
      fi
      sleep 2
    done
    
    curl -k -f https://localhost:3000 || (cat nextjs.log && exit 1)
  env:
    NEXTAUTH_URL: https://localhost:3000  # HTTPS
    KEYCLOAK_URL: https://localhost:8443
    # ... other env vars
```

#### Run Tests Step:
```yaml
- name: Run [Test Type] E2E Tests
  run: cd frontend && npx playwright test [test-file.spec.ts]
  env:
    NEXTAUTH_URL: https://localhost:3000  # HTTPS
    KEYCLOAK_URL: https://localhost:8443
    BASE_URL: https://localhost:3000      # HTTPS
    # ... other env vars
```

---

## 🎯 Why HTTPS Matters

### 1. **Keycloak 26.x Requirement**
- Keycloak 26.x enforces HTTPS by default
- Cannot be disabled in production-like environments
- Management port (9000) and application port (8443) both HTTPS

### 2. **NextAuth Secure Cookies**
- NextAuth uses secure cookies with `sameSite: "lax"`
- Cookies won't persist across HTTP ↔ HTTPS boundaries
- Causes authentication failures in OAuth/OIDC flows

### 3. **Production Parity**
- Dev environment uses Cloudflare tunnel (HTTPS)
- `https://dev-app.dive25.com` is the actual deployment
- Tests should match production behavior

### 4. **Security Best Practices**
- Simulates real-world security requirements
- Tests certificate handling and trust chains
- Validates TLS/SSL configuration

---

## 📁 Files Modified

```
frontend/src/__tests__/e2e/fixtures/test-config.ts  (1 file)
.github/workflows/test-e2e.yml                      (1 file, 4 jobs updated)
```

**Total Lines Changed**: ~100 lines across 2 files

---

## ✅ Verification Steps

### Infrastructure Already Working ✅
From previous session (commit `2e04c54`):
- ✅ Keycloak starts with HTTPS in 11.5 seconds
- ✅ Health checks pass on management port 9000
- ✅ SSL certificates generated with proper SubjectAltName
- ✅ Certificate permissions set correctly (644)
- ✅ User/realm configuration succeeds
- ✅ All dependent services start (PostgreSQL, MongoDB, OPA)

### New HTTPS Configuration ⏳ (Testing Now)
Expecting:
- ✅ Next.js starts with HTTPS using custom server.js
- ✅ Playwright connects to `https://localhost:3000` successfully
- ✅ Tests trust self-signed certificates (`ignoreHTTPSErrors: true`)
- ✅ Keycloak redirects work correctly with HTTPS URLs
- ✅ NextAuth session persistence works with secure cookies

---

## 🔍 How We Found This

1. **Reviewed handoff document** - Infrastructure claimed to be working
2. **Checked Playwright config** - Already had `ignoreHTTPSErrors: true` ✅
3. **Grepped for hardcoded URLs** - Found `http://localhost:8081` in test-config.ts
4. **Examined CI/CD workflows** - Found `npm run dev:http` and HTTP env vars
5. **User insight** - "CI/CD workflows base url should be using HTTPS" 🎯

---

## 📊 Expected CI/CD Results

### Before Fix:
```
✅ Generate SSL Certificates
✅ Start Keycloak with HTTPS
✅ Configure Keycloak
❌ Run E2E Tests - Connection failures to http://localhost:8081
```

### After Fix:
```
✅ Generate SSL Certificates  
✅ Start Keycloak with HTTPS (8443)
✅ Start Next.js with HTTPS (3000)
✅ Configure Keycloak
✅ Run E2E Tests - All connections use HTTPS
```

---

## 🚀 Next Session Guidance

### If Tests Pass ✅
1. Celebrate! Infrastructure + configuration are fully working
2. Review any test-specific failures (assertions, selectors, etc.)
3. Move to Priority 2: Add tests for Policy components

### If Tests Still Fail ❌
Investigate in this order:
1. **Certificate Trust**: Check Playwright logs for SSL errors
2. **Server Startup**: Review `nextjs.log` in CI artifacts
3. **URL Routing**: Verify NextAuth callback URLs are correct
4. **Test Assertions**: Check if test expectations need updating

---

## 📝 Key Technical Details

### SSL Certificate Generation (Already Working)
```bash
# Frontend certificates
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout frontend/certs/key.pem \
  -out frontend/certs/certificate.pem \
  -days 365 \
  -subj "/C=US/ST=Test/L=Test/O=DIVE V3/CN=localhost"

# Keycloak certificates (with SAN)
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout keycloak-certs/key.pem \
  -out keycloak-certs/cert.pem \
  -days 1 \
  -subj "/C=US/ST=Test/L=Test/O=DIVE V3 CI/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,DNS:keycloak,IP:127.0.0.1"

chmod 644 keycloak-certs/*.pem
```

### Custom HTTPS Server (server.js)
```javascript
const { createServer } = require('https');
const certPath = process.env.CERT_PATH || '/opt/app/certs';
const httpsOptions = {
  key: fs.readFileSync(path.join(certPath, 'key.pem')),
  cert: fs.readFileSync(path.join(certPath, 'certificate.pem')),
};

createServer(httpsOptions, handler).listen(3000);
// > Ready on https://localhost:3000
```

### Playwright HTTPS Configuration
```typescript
// playwright.config.ts (already correct!)
use: {
  baseURL: process.env.BASE_URL || 'https://dev-app.dive25.com',
  ignoreHTTPSErrors: true,  // Trust self-signed certs
}
```

---

## 🎓 Lessons Learned

1. **Always check fallback values** - `process.env.VAR || 'default'` can hide misconfigurations
2. **HTTP/HTTPS boundaries break auth flows** - Secure cookies won't cross protocols
3. **Comment hygiene matters** - "HTTP mode for CI simplicity" was misleading
4. **Infrastructure != Configuration** - Server can work perfectly but tests still fail
5. **User insights are valuable** - "Should be using HTTPS" was the key breakthrough

---

## 📌 Summary

**Problem**: E2E tests failing due to HTTP/HTTPS mismatch  
**Root Cause**: Test config and CI workflows using HTTP while services require HTTPS  
**Solution**: Updated all URLs and server commands to use HTTPS consistently  
**Status**: Fixes committed and pushed, CI/CD running  
**Next**: Wait for CI/CD results and address any remaining issues  

**Commits**:
- `13a9a81` - Fix test-config.ts Keycloak URL
- `f68f195` - Fix CI/CD workflows to use HTTPS

---

**END OF FIX DOCUMENTATION**

CI/CD Run: In Progress  
Estimated Time: 6-8 minutes  
Watch: `gh run watch` or GitHub Actions UI

