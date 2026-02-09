# DIVE V3 E2E Testing Implementation - Handoff Document

**Session Date**: 2026-02-08  
**Branch**: `test/week1-day2-parallel-verification`  
**Status**: ⚠️ **ARCHITECTURE COMPLETE - EXECUTION BLOCKED BY BROWSER ISSUE**  
**Duration**: 6+ hours

---

## 📋 **EXECUTIVE SUMMARY**

### What Was Accomplished ✅

1. **Dynamic IdP Discovery System** (COMPLETE)
   - Created `frontend/src/__tests__/e2e/helpers/idp-discovery.ts`
   - Dynamically discovers available IdPs from frontend
   - Uses actual `displayName` values (not hardcoded)
   - Gracefully skips tests for non-deployed spokes
   - Implements environment-aware testing

2. **Test Tagging Strategy** (COMPLETE)
   - Tagged 20+ test files with `@fast`, `@smoke`, `@critical`, `@flaky`
   - Enables selective test execution
   - Documented in `docs/testing/TEST_TAGGING_STRATEGY.md`

3. **Root Cause Analysis** (COMPLETE)
   - Identified hardcoded IdP assumptions as critical flaw
   - Diagnosed `localhost` vs `127.0.0.1` binding mismatch
   - Documented Docker security best practices
   - Created `docs/testing/ARCHITECTURE_DIAGNOSIS.md`

4. **Security Best Practice Implementation** (COMPLETE)
   - Kept Docker binding at `127.0.0.1` (secure, localhost-only)
   - Updated Playwright config to use explicit IPv4 address
   - Followed industry standards per Docker security guidelines

### What's Blocked ❌

**E2E Tests Still Fail with `ERR_ABORTED`**
- `curl` can access `https://127.0.0.1:3000` ✅
- Playwright's Chromium browser cannot ❌
- Issue: Browser-level certificate rejection (not config/URL)

---

## 🎯 **NEW SESSION OBJECTIVE**

**Goal**: Get E2E tests running successfully with dynamic IdP discovery

**Success Criteria**:
1. At least ONE test file passes (`identity-drawer.spec.ts`)
2. Tests can navigate to `https://127.0.0.1:3000`
3. Dynamic IdP discovery works in live environment
4. No `ERR_ABORTED` errors

**Current Blocker**: Chromium browser rejects mkcert self-signed certificates despite `ignoreHTTPSErrors: true`

---

## 📁 **KEY ARTIFACTS & FILES**

### Documentation Created
```
docs/testing/
├── ARCHITECTURE_DIAGNOSIS.md          (Root cause analysis)
├── CRITICAL_ISSUE_HARDCODED_IDP_ASSUMPTIONS.md  (Hardcoded test problem)
├── DEEPER_INVESTIGATION_NEEDED.md     (Current blocker analysis)
├── TEST_TAGGING_STRATEGY.md           (Tag definitions)
├── WEEK1_DAY2_COMPREHENSIVE_SUMMARY.md (Day 2 results)
├── WEEK1_DAY3_SUMMARY.md              (Day 3 results)
├── WEEK1_DAY4_FINAL_SUMMARY.md        (Day 4 results)
└── WEEK1_DAY4_PLAN.md                 (Original plan)
```

### Code Changes
```
frontend/
├── playwright.config.ts               (Updated: 127.0.0.1, GITHUB_ACTIONS)
└── src/__tests__/e2e/
    ├── helpers/
    │   ├── idp-discovery.ts          (NEW: Dynamic discovery)
    │   └── auth.ts                   (Updated: Uses discovery)
    ├── fixtures/
    │   └── test-users.ts             (Verified: Has countryCode)
    └── example-dynamic-testing.spec.ts (NEW: Reference implementation)

templates/spoke/
└── docker-compose.template.yml       (Updated: 127.0.0.1 binding)
```

### Git Status
- **Branch**: `test/week1-day2-parallel-verification`
- **Commits**: 8 commits since start
- **Latest**: `fix(security): Use 127.0.0.1 binding + Playwright config`
- **Pushed**: Yes (all changes synced)

---

## 🔍 **DETAILED CONTEXT**

### The Journey: How We Got Here

#### **Week 1 Day 2: Parallel Execution** ✅
- Goal: Verify E2E tests run in parallel
- Result: SUCCESS - Tests run but many fail
- Discovery: Import path issues fixed
- Next: Investigate DEU test failures

#### **Week 1 Day 3: Test Tagging** ✅
- Goal: Tag tests for selective execution
- Result: SUCCESS - 20 files tagged
- Discovery: **CRITICAL ISSUE** - Tests hardcode IdP expectations
- Problem: Tests expected "Germany" button, actual was "DEU Instance"
- Problem: Tests tried to test 31 NATO countries even when only USA+DEU deployed

#### **Week 1 Day 4: Dynamic Discovery** ⚠️
- Goal: Implement dynamic IdP discovery
- Phase 1: Created discovery system ✅
- Phase 2: Test migrations (BLOCKED)
- Blocker: Tests get `ERR_ABORTED` when navigating

#### **Root Cause Investigation** 🔍
1. **Initial Hypothesis**: Import paths wrong ❌ (Fixed, still failed)
2. **Second Hypothesis**: IdP names hardcoded ✅ (TRUE - solved with discovery)
3. **Third Hypothesis**: CI=1 env var breaks tests ❌ (Red herring)
4. **Fourth Hypothesis**: `localhost` vs `127.0.0.1` mismatch ❌ (Symptoms, not cause)
5. **Current Hypothesis**: **Chromium doesn't trust mkcert certs** ⬅️ YOU ARE HERE

### User's Key Insight (Critical Moment)
> "I want you to take a step back and stop trying to FORCE a solution to work. We are trying to bandaid what may be a broken architecture, so please take a step back to re-evaluate."

This led to discovering the real issue wasn't the code but the test environment itself.

---

## 🚧 **CURRENT STATE**

### What Works ✅
```bash
# Frontend is healthy
$ docker ps | grep frontend
dive-hub-frontend  Up 10 minutes (healthy)  127.0.0.1:3000->3000/tcp

# curl can access it
$ curl -k -I https://127.0.0.1:3000
HTTP/1.1 200 OK

# Docker logs show requests
$ docker logs dive-hub-frontend --tail 5
GET / 200 in 28ms
```

### What Doesn't Work ❌
```bash
# Playwright tests fail
$ npx playwright test identity-drawer.spec.ts --max-failures=1
Error: page.goto: net::ERR_ABORTED at https://127.0.0.1:3000/dashboard
```

### Configuration Status
```typescript
// playwright.config.ts
baseURL: 'https://127.0.0.1:3000'           // ✅ Correct
ignoreHTTPSErrors: !process.env.GITHUB_ACTIONS  // ✅ True locally

// Docker binding
ports: "127.0.0.1:3000:3000"                // ✅ Secure (best practice)
```

---

## 🎯 **PHASED IMPLEMENTATION PLAN**

### **PHASE 1: RESOLVE BROWSER CERT ISSUE** (Priority: CRITICAL)

**Goal**: Get Playwright to successfully navigate to `https://127.0.0.1:3000`

#### Option 1A: Install mkcert CA System-Wide (RECOMMENDED)
**SMART Goal**: Install mkcert CA in macOS system trust store within 10 minutes

**Steps**:
```bash
# 1. Install mkcert CA globally
mkcert -install

# 2. Verify CA is installed
security find-certificate -a -c "mkcert" -p

# 3. Reinstall Playwright browsers to pick up new CA
npx playwright install --force chromium

# 4. Test
cd frontend
npx playwright test identity-drawer.spec.ts --max-failures=1
```

**Success Criteria**:
- [ ] Test reaches homepage (no ERR_ABORTED)
- [ ] At least 1 test navigates to `/dashboard`
- [ ] No certificate errors in console

**Risk**: Low - mkcert is designed for this use case  
**Time**: 15 minutes  
**Rollback**: `mkcert -uninstall`

---

#### Option 1B: Add Chromium Browser Flags (FALLBACK)
**SMART Goal**: Bypass cert validation with browser flags if Option 1A fails

**Implementation**:
```typescript
// frontend/playwright.config.ts
use: {
  launchOptions: {
    args: [
      '--ignore-certificate-errors',
      '--allow-insecure-localhost',
      '--disable-web-security'  // Use cautiously
    ]
  },
  baseURL: 'https://127.0.0.1:3000',
  ignoreHTTPSErrors: true,
}
```

**Success Criteria**:
- [ ] Tests can navigate to frontend
- [ ] No `ERR_ABORTED` errors
- [ ] Tests can interact with page

**Risk**: Medium - Disables security (dev only)  
**Time**: 5 minutes  
**Rollback**: Remove `launchOptions`

---

#### Option 1C: Debug Browser Logs (IF BOTH FAIL)
**SMART Goal**: Identify exact error from Chromium logs

**Steps**:
```bash
cd frontend
DEBUG=pw:browser npx playwright test identity-drawer.spec.ts --max-failures=1 2>&1 | tee browser-debug.log
```

**Success Criteria**:
- [ ] Log file shows exact reason for ERR_ABORTED
- [ ] Can see if it's DNS, cert, network, or other

**Time**: 10 minutes

---

### **PHASE 2: VERIFY DYNAMIC DISCOVERY** (Priority: HIGH)

**Goal**: Confirm dynamic IdP discovery works with live environment

**SMART Goal**: Discovery finds USA hub + 0 spokes (current deployment) within 30 seconds

**Prerequisites**: Phase 1 complete (browser can navigate)

**Steps**:
```bash
# 1. Run test with discovery logging
cd frontend
npx playwright test example-dynamic-testing.spec.ts --reporter=list

# 2. Check logs for discovery output
# Should see:
# [IdP Discovery] ✅ Successfully loaded: https://127.0.0.1:3000
# [IdP Discovery] Found IdP options: ['Local', ...]
# [IdP Discovery] ✅ Discovered 0 spokes

# 3. Deploy DEU spoke
cd ../..
./dive spoke deploy DEU "Germany"

# 4. Rerun test
cd frontend
npx playwright test example-dynamic-testing.spec.ts --reporter=list

# 5. Verify discovery finds DEU
# Should see:
# [IdP Discovery] ✅ Discovered 1 spoke: DEU
```

**Success Criteria**:
- [ ] Discovery runs without errors
- [ ] Finds USA hub (displayName "Local" or similar)
- [ ] `mapDisplayNameToCode()` correctly identifies USA
- [ ] After DEU deployment, discovers DEU
- [ ] Uses actual DEU `displayName` from frontend

**Time**: 45 minutes (includes DEU deployment)

---

### **PHASE 3: MIGRATE CORE TEST FILES** (Priority: MEDIUM)

**Goal**: Update 3 core test files to use dynamic discovery

**SMART Goal**: Migrate 3 test files in 2 hours with 0 regressions

**Target Files**:
1. `auth-confirmed-frontend.spec.ts` (40 min)
2. `all-test-users.spec.ts` (40 min)
3. `key-test-users.spec.ts` (40 min)

**Pattern to Follow** (from `auth.ts` refactoring):
```typescript
// 1. Add beforeAll discovery
test.describe('My Test Suite', () => {
  let idps: DiscoveredIdPs;
  
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    idps = await discoverAvailableIdPs(page);
    await page.close();
  });

  // 2. Update each test
  test('USA user test', async ({ page }) => {
    // Check availability BEFORE running test
    if (!isIdPAvailable(idps, 'USA')) {
      test.skip('USA not deployed');
    }
    
    // Rest of test...
    await loginAs(page, TEST_USERS.USA_SECRET);  // Uses discovery internally
  });
});
```

**Success Criteria PER FILE**:
- [ ] `beforeAll` discovers IdPs
- [ ] Tests check `isIdPAvailable()` before running
- [ ] Tests skip gracefully if IdP not deployed
- [ ] No hardcoded IdP names remain
- [ ] All tests pass for USA
- [ ] Tests skip for FRA/GBR/DEU when not deployed

**Time**: 2 hours total

---

### **PHASE 4: RUN TAGGED TEST SUITES** (Priority: MEDIUM)

**Goal**: Verify tagged test execution works and achieves performance targets

**SMART Goal**: `@fast` tests pass 100%, `@smoke` runs < 10 minutes

#### 4A: Fast Tests
```bash
cd frontend
npm run test:e2e:fast  # Runs @fast tagged tests
```

**Success Criteria**:
- [ ] All `@fast` tests pass (or skip gracefully)
- [ ] Total runtime < 2 minutes
- [ ] No ERR_ABORTED errors
- [ ] Only tests for deployed IdPs run

**Time**: 15 minutes

#### 4B: Smoke Tests
```bash
npm run test:e2e:smoke  # Runs @smoke tagged tests
```

**Success Criteria**:
- [ ] `@smoke` suite completes
- [ ] Runtime < 10 minutes
- [ ] Pass rate > 90% (for deployed IdPs)
- [ ] Clear skip messages for non-deployed IdPs

**Time**: 15 minutes

---

### **PHASE 5: DOCUMENTATION & CLEANUP** (Priority: LOW)

**Goal**: Document final solution and clean up experimental code

**SMART Goal**: Create deployment guide in 30 minutes

**Deliverables**:
1. **E2E Testing Setup Guide**
   - mkcert installation
   - Playwright configuration
   - Running tests locally
   - Troubleshooting common issues

2. **Dynamic Discovery Usage Guide**
   - How to use `discoverAvailableIdPs()`
   - Writing environment-aware tests
   - ISO 3166-1 alpha-3 code reference

3. **Update Week 1 Summary**
   - Final Day 4 status
   - Lessons learned
   - Time metrics

**Success Criteria**:
- [ ] Guide enables new developer to run tests in < 15 minutes
- [ ] All decision rationale documented
- [ ] Commit history cleaned up (squash if needed)

**Time**: 1 hour

---

## 📊 **SUCCESS METRICS**

### Quantitative Goals
- [ ] **Test Pass Rate**: >95% for deployed IdPs
- [ ] **@fast Tests**: Complete in <2 minutes
- [ ] **@smoke Tests**: Complete in <10 minutes
- [ ] **Discovery Time**: <5 seconds per test file
- [ ] **Skip Rate**: 100% for non-deployed IdPs (graceful)
- [ ] **ERR_ABORTED**: 0 occurrences

### Qualitative Goals
- [ ] Tests adapt to any IdP deployment combination
- [ ] Clear skip messages when IdP unavailable
- [ ] No hardcoded country names/codes
- [ ] Follows Docker security best practices (127.0.0.1 binding)
- [ ] No unnecessary complexity (KISS principle)

---

## 🚨 **KNOWN ISSUES & WORKAROUNDS**

### Issue 1: ERR_ABORTED on Page Navigation
**Symptom**: `page.goto: net::ERR_ABORTED at https://127.0.0.1:3000`  
**Status**: BLOCKING  
**Workaround**: None yet - Phase 1 addresses this  
**References**: `docs/testing/DEEPER_INVESTIGATION_NEEDED.md`

### Issue 2: Discovery Returns Empty Results
**Symptom**: `[IdP Discovery] ✅ Discovered 0 spokes` when DEU is deployed  
**Status**: NEEDS TESTING  
**Workaround**: Verify `mapDisplayNameToCode()` handles actual displayName  
**References**: `frontend/src/__tests__/e2e/helpers/idp-discovery.ts:52-109`

### Issue 3: CI=1 Environment Variable
**Symptom**: When `CI=1` is set, tests tried to use remote URL  
**Status**: FIXED  
**Solution**: Use `GITHUB_ACTIONS` instead of `CI`  
**References**: Commit `7a4f8b38`

---

## 🛠️ **RECOMMENDED APPROACH FOR NEW SESSION**

### Step-by-Step Start
```bash
# 1. Pull latest from branch
git checkout test/week1-day2-parallel-verification
git pull origin test/week1-day2-parallel-verification

# 2. Verify hub is running
docker ps | grep dive-hub
# Should see: frontend, backend, keycloak (all healthy)

# 3. Read this handoff doc
cat docs/testing/E2E_TESTING_HANDOFF.md

# 4. Read current blocker analysis
cat docs/testing/DEEPER_INVESTIGATION_NEEDED.md

# 5. Start with Phase 1, Option 1A (mkcert CA install)
# See Phase 1 section above for commands

# 6. If Option 1A fails, try Option 1B (browser flags)
# If both fail, run Option 1C (debug logs) and report findings
```

### Critical Questions to Answer
1. **Does `mkcert -install` fix the ERR_ABORTED issue?**
   - If YES: Proceed to Phase 2
   - If NO: Try browser flags (Phase 1, Option 1B)

2. **Does discovery find USA hub?**
   - Check logs for: `[IdP Discovery] ✅ Successfully loaded`
   - Verify: `mapDisplayNameToCode()` works with actual displayName

3. **Can ONE test pass end-to-end?**
   - Target: `example-dynamic-testing.spec.ts`
   - Must: Login → Navigate → Interact → Logout

### What NOT to Do
- ❌ Don't bind Docker to `0.0.0.0` (security risk)
- ❌ Don't add more URL checking complexity
- ❌ Don't try to "fix" `localhost` resolution
- ❌ Don't spend more than 2 hours on Phase 1
- ❌ Don't proceed to Phase 2 until Phase 1 works

---

## 📚 **REFERENCE MATERIALS**

### Key Documentation
- **Architecture Diagnosis**: `docs/testing/ARCHITECTURE_DIAGNOSIS.md`
- **Current Blocker**: `docs/testing/DEEPER_INVESTIGATION_NEEDED.md`
- **IdP Discovery Code**: `frontend/src/__tests__/e2e/helpers/idp-discovery.ts`
- **Auth Helper (Refactored)**: `frontend/src/__tests__/e2e/helpers/auth.ts`
- **Example Test**: `frontend/src/__tests__/e2e/example-dynamic-testing.spec.ts`

### External References
- Docker Security: https://brokkr.net/2022/03/29/publishing-docker-ports-to-127-0-0-1-instead-of-0-0-0-0
- mkcert: https://github.com/FiloSottile/mkcert
- Playwright Certificates: https://playwright.dev/docs/network#ignore-https-errors
- ISO 3166-1 alpha-3: `scripts/nato-countries.sh` (SSOT)

### Git Context
```bash
# View recent commits
git log --oneline -10

# See what changed
git diff origin/main...HEAD --stat

# Check current branch
git branch -v
```

---

## 💬 **RECOMMENDED PROMPT FOR NEW SESSION**

```
I'm continuing work on DIVE V3 E2E test reliability improvements.

**Context**: Previous session implemented a dynamic IdP discovery system to replace hardcoded test assumptions. The architecture is complete and pushed to branch test/week1-day2-parallel-verification, but tests are currently blocked by a Playwright browser certificate issue.

**Current Status**:
- ✅ Dynamic IdP discovery system implemented (frontend/src/__tests__/e2e/helpers/idp-discovery.ts)
- ✅ Test tagging complete (@fast, @smoke, @critical, @flaky)
- ✅ Docker binding set to 127.0.0.1 (secure best practice)
- ✅ Playwright config updated to use 127.0.0.1
- ❌ Tests fail with ERR_ABORTED (browser can't navigate to https://127.0.0.1:3000)
- ✅ curl works fine (frontend is healthy)

**The Problem**: Chromium browser rejects mkcert self-signed certificates despite ignoreHTTPSErrors: true

**What I Need**:
1. Help implementing Phase 1 from the handoff doc (resolve cert issue)
2. Test if mkcert -install fixes it
3. If not, try browser launch flags
4. Once working, verify dynamic discovery with live environment
5. Migrate 3 core test files

**Please read**:
- docs/testing/E2E_TESTING_HANDOFF.md (this file - comprehensive context)
- docs/testing/DEEPER_INVESTIGATION_NEEDED.md (current blocker details)
- docs/testing/ARCHITECTURE_DIAGNOSIS.md (how we got here)

**Start with**: Phase 1, Option 1A (install mkcert CA system-wide)

**Success Criteria**: At least ONE test can navigate to https://127.0.0.1:3000 without ERR_ABORTED

Ready to proceed with Phase 1?
```

---

## 📞 **CONTACT/ESCALATION**

### If Stuck on Phase 1 (>2 hours)
**Escalation Path**:
1. Document exact error from `DEBUG=pw:browser` logs
2. Check Playwright GitHub issues for "ERR_ABORTED mkcert"
3. Consider asking in DIVE project channels
4. **Nuclear option**: Deploy frontend without HTTPS temporarily to isolate issue

### Alternative Approaches (If All Else Fails)
1. Use separate test environment with valid certs (not mkcert)
2. Run tests in CI only (skip local E2E testing)
3. Use HTTP for local dev, HTTPS for CI
4. Investigate Playwright Docker container approach

---

**Document Version**: 1.0  
**Last Updated**: 2026-02-08 23:10 UTC  
**Next Review**: After Phase 1 completion  
**Maintainer**: Testing & Quality Team
