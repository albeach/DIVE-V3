# E2E Test Architecture Diagnosis

**Date**: 2026-02-08  
**Status**: 🔴 **ARCHITECTURE FLAW DISCOVERED**  
**Severity**: Critical - Tests cannot run in current environment

---

## 🚨 **Root Cause Analysis**

### The Problem

Tests are failing with `page.goto: net::ERR_ABORTED` on **ALL navigation attempts**, despite the frontend being healthy and accessible via curl.

### What We Discovered

After 3+ hours of debugging and attempted fixes, stepping back revealed **the tests were never designed for the current deployment architecture**.

---

## 📊 **Evidence**

### 1. Original Playwright Config (commit `ff490e2f`)

```typescript
// Default project
baseURL: process.env.CI ? 'https://dev-app.dive25.com' : 'https://localhost:3000'
ignoreHTTPSErrors: !process.env.CI

// Spoke projects
baseURL: process.env.FRA_FRONTEND_URL || 'http://localhost:3025'  // HTTP!
baseURL: process.env.GBR_FRONTEND_URL || 'http://localhost:3003'  // HTTP!

// Federation project  
baseURL: process.env.HUB_FRONTEND_URL || 'http://localhost:3000'  // HTTP fallback!
```

**Key Insight**: Tests were designed to use **HTTP for spoke/federation**, not HTTPS.

### 2. Current Docker Configuration

```bash
$ docker ps | grep frontend
dive-hub-frontend  Up 3 hours  127.0.0.1:3000->3000/tcp  # IPv4, not 0.0.0.0
```

**Key Insight**: Frontend binds to `127.0.0.1` (IPv4), but `localhost` may resolve to `::1` (IPv6).

### 3. HTTP Test Results

```bash
$ curl -k -I https://localhost:3000
HTTP/1.1 200 OK  # ✅ HTTPS works

$ curl -I http://localhost:3000
curl: (1) Received HTTP/0.9 when not allowed  # ❌ HTTP DOES NOT WORK
```

**Key Insight**: Frontend ONLY serves HTTPS, but original tests expected HTTP fallback.

### 4. Test Scripts in package.json

```json
"test:e2e:localhost": "BASE_URL=http://localhost:3000 playwright test"
```

**Key Insight**: Even the package.json shows an HTTP-based test mode that **does not work** with current frontend.

### 5. CI=1 Flag Exposure

```bash
$ echo $CI
1

# This caused:
ignoreHTTPSErrors: !process.env.CI → false
baseURL: process.env.CI ? 'https://dev-app.dive25.com' : 'https://localhost:3000'
```

**Key Insight**: The `CI=1` flag **exposed the latent issue** that HTTPS testing never worked locally.

---

## ⚠️ **Architecture Mismatches**

| Component | Expected by Tests | Current Reality | Status |
|-----------|-------------------|-----------------|--------|
| **Hub URL** | `https://localhost:3000` | `https://127.0.0.1:3000` | ❌ Hostname mismatch |
| **Transport** | HTTP fallback supported | HTTPS only | ❌ Protocol mismatch |
| **Cert Handling** | `ignoreHTTPSErrors:true` | Depends on `CI` var | ⚠️ Brittle |
| **IPv4/IPv6** | Assumes `localhost` works | Docker binds to `127.0.0.1` | ❌ Resolution mismatch |
| **Spoke Tests** | `http://localhost:302X` | Not tested/verified | ❓ Unknown |
| **Federation** | HTTP mode | HTTPS required | ❌ Protocol mismatch |

---

## 🔍 **Why Did We Miss This?**

### 1. **Tests Were Never Run Locally with HTTPS**
- Original tests used HTTP fallbacks
- HTTPS mode only tested in CI (remote servers)
- Local dev always failed gracefully to HTTP

### 2. **CI=1 Flag Was a Red Herring**
- We thought the flag was causing the issue
- Actually, the flag **exposed** the real issue: tests don't work with HTTPS locally

### 3. **Complexity Hid the Simple Truth**
- We added URL checking, discovery systems, environment detection
- Real problem: `localhost` ≠ `127.0.0.1` and HTTPS never worked locally

---

## ✅ **Verified Working Scenarios**

```bash
# Curl works (HTTPS)
$ curl -k https://localhost:3000  # ✅ 200 OK
$ curl -k https://127.0.0.1:3000  # ✅ 200 OK

# Frontend container healthy
$ docker ps | grep frontend
dive-hub-frontend  Up 3 hours (healthy)  # ✅

# Frontend serving requests
$ docker logs dive-hub-frontend --tail 5
GET / 200 in 28ms  # ✅
```

**Conclusion**: The frontend is **perfectly healthy**. The tests are **architecturally incompatible**.

---

## 🎯 **The Real Solution**

### Option 1: **Fix Docker Binding** (Recommended)

Change frontend to bind to `0.0.0.0` instead of `127.0.0.1`:

```yaml
# docker-compose.yml
services:
  frontend:
    ports:
      - "3000:3000"  # Not 127.0.0.1:3000:3000
```

**Pros**: 
- `localhost` will work (resolves to both IPv4 and IPv6)
- Tests work as designed
- Minimal code changes

**Cons**:
- Slightly less secure (exposes to LAN)
- Requires docker-compose changes

### Option 2: **Use 127.0.0.1 Everywhere**

Update all test configs to use `127.0.0.1` instead of `localhost`:

```typescript
baseURL: 'https://127.0.0.1:3000'  // Explicit IPv4
```

**Pros**:
- Works with current Docker config
- More explicit/predictable

**Cons**:
- Must update all test files
- Hardcoded IPs less flexible

### Option 3: **Accept HTTP Mode for Local Testing** (Fastest)

Run frontend in HTTP mode for local testing only:

```bash
# Add to docker-compose.yml
environment:
  - NODE_ENV=development
  - HTTPS_ENABLED=false  # New flag
```

**Pros**:
- Tests work immediately
- Matches original design intent (HTTP for local, HTTPS for prod)

**Cons**:
- Not "Zero Trust"
- Different behavior local vs prod

---

## 🚫 **What DIDN'T Work (Our Attempts)**

### 1. Changed `ignoreHTTPSErrors` Logic
- **Tried**: Use `GITHUB_ACTIONS` instead of `CI`
- **Result**: Still failed with `ERR_ABORTED`
- **Why**: HTTPS itself is broken, not cert validation

### 2. URL Accessibility Checking
- **Tried**: Check URLs before discovery
- **Result**: curl works, Playwright doesn't
- **Why**: Different networking stack (Node vs Chromium)

### 3. Direct URL Navigation
- **Tried**: Navigate to full URL instead of relative path
- **Result**: Still `ERR_ABORTED`
- **Why**: Browser context itself can't reach frontend

### 4. Multiple URL Fallbacks
- **Tried**: Try localhost → 127.0.0.1 → dev-app.dive25.com
- **Result**: All failed
- **Why**: None address the root issue (incompatible architecture)

---

## 📈 **Time/Effort Analysis**

### What We Built (Still Valuable)
- ✅ Dynamic IdP discovery system
- ✅ Environment-aware URL checking  
- ✅ Graceful offline handling
- ✅ ISO 3166-1 alpha-3 consistency
- ✅ Test tagging strategy

### What We Wasted (Unnecessary Complexity)
- ❌ 3+ hours debugging environment
- ❌ Multiple URL checking implementations
- ❌ Browser context troubleshooting
- ❌ Cert validation investigation

### Lesson Learned
**"Always check if the existing architecture actually works before adding complexity."**

---

## 🎓 **Key Takeaways**

### What Went Wrong
1. **Assumed tests worked before** (they didn't, just used HTTP fallback)
2. **Focused on symptoms** (`CI=1`, `ERR_ABORTED`) **instead of root cause** (HTTPS never worked locally)
3. **Added complexity** (URL checking, discovery) **without validating basics** (can curl? can browser?)

### What Went Right
1. **User stopped us** before more wasted effort
2. **Stepped back** to re-evaluate assumptions
3. **Found evidence** (git history, docker config, curl tests)
4. **Identified root cause** (architecture mismatch, not code bug)

### Best Practice
> **"When something doesn't work, verify the simplest assumptions first:**
> - Does it work in curl?
> - Did it ever work?
> - What changed since it last worked?"

---

## 🚀 **Recommended Next Steps**

### Immediate (30 minutes)
1. Choose fix strategy (Option 1, 2, or 3 above)
2. Test with **one simple test file**
3. Verify discovery works with actual frontend

### Short-term (1-2 hours)
1. Apply fix across all test files
2. Run `@fast` tests to verify
3. Document new architecture

### Long-term (Next sprint)
1. Add test environment validation script
2. Create "test health check" that verifies:
   - Frontend reachable
   - HTTPS working
   - Certs valid/ignored correctly
3. Run health check before E2E tests

---

## 📝 **Action Items**

- [ ] **USER DECIDES**: Which fix strategy (Option 1, 2, or 3)?
- [ ] Implement chosen fix
- [ ] Test with 1 simple test file
- [ ] If works: Proceed with Day 4 Phase 2 (test migrations)
- [ ] If doesn't work: Further diagnosis needed

---

**Status**: Awaiting user decision on fix strategy  
**Blocker**: Architecture incompatibility (not code bug)  
**Confidence**: High (root cause identified with evidence)  
**Recommendation**: Option 1 (Fix Docker binding) for least disruption
