# Week 1 Day 4 - Dynamic IdP Discovery Implementation

**Date**: 2026-02-08  
**Prerequisites**: ✅ Day 3 Complete (Test tagging + issue identified)  
**Duration**: 8 hours  
**Team**: 1 engineer

---

## 🎯 **Objective**

Refactor E2E tests to use dynamic IdP discovery, eliminating hardcoded assumptions and achieving 100% pass rate for available IdPs.

**Success Criteria:**
- [x] Day 3: Test tagging complete
- [x] Day 3: Critical issue identified (hardcoded IdP assumptions)
- [x] Day 3: Dynamic discovery solution designed
- [ ] Day 4: Auth helper refactored
- [ ] Day 4: Top 3 auth test files refactored
- [ ] Day 4: @fast tests achieve 100% pass rate (for USA + DEU)
- [ ] Day 4: @smoke tests run <10 min
- [ ] Day 4: Documentation updated

---

## 🚨 **Problem Recap (Day 3 Discovery)**

**Root Cause:** Tests hardcode IdP names and assume all 32 NATO nations are deployed.

**Example Failure:**
```
Error: IdP not found for USA. Expected patterns: "United States", "USA"
Available buttons: ["DEU Instance", "Local", ...]
```

**Current State:**
- 35/40 @fast tests failing (87.5% failure rate)
- Tests expect: USA, FRA, DEU, GBR, ALB, DNK, ROU
- Actually deployed: USA, DEU only
- Issue: Hardcoded displayNames + assumptions about deployed spokes

---

## ✅ **Solution (Day 3 Designed)**

**Key Files Created:**
1. `helpers/idp-discovery.ts` - Dynamic discovery helper
2. `example-dynamic-testing.spec.ts` - Reference implementation
3. `CRITICAL_ISSUE_HARDCODED_IDP_ASSUMPTIONS.md` - Full analysis

**Core Concept:**
```typescript
// BEFORE (Broken)
test('DEU login', async ({ page }) => {
  await page.click('button:has-text("Germany")'); // ❌ Fails if name != "Germany"
});

// AFTER (Smart)
test('DEU login', async ({ page }) => {
  const idps = await discoverAvailableIdPs(page);
  test.skip(!isIdPAvailable(idps, 'DEU'), 'DEU not deployed');
  
  const displayName = getIdPDisplayName(idps, 'DEU'); // "DEU Instance"
  await page.click(`button:has-text("${displayName}")`); // ✅ Works!
});
```

---

## 📋 **Implementation Plan**

### Phase 1: Core Refactoring (Morning - 4 hours)

#### Task 4.1: Refactor Auth Helper (2 hours)

**File:** `frontend/src/__tests__/e2e/helpers/auth.ts`

**Changes:**
1. Import `discoverAvailableIdPs`, `getIdPDisplayName`
2. Add discovery to `beforeAll` or cache globally
3. Update `loginAs()` to use discovered displayName instead of hardcoded `user.idp`
4. Update flexible matching to use discovery results

**Before:**
```typescript
async function loginAs(page: Page, user: TestUser) {
  await page.goto('/');
  
  // Hardcoded expectation from fixture
  const idpButton = page.getByRole('button', { name: new RegExp(user.idp, 'i') });
  await idpButton.click();
}
```

**After:**
```typescript
let globalIdPs: DiscoveredIdPs | null = null;

async function ensureDiscovery(page: Page) {
  if (!globalIdPs) {
    globalIdPs = await discoverAvailableIdPs(page);
  }
  return globalIdPs;
}

async function loginAs(page: Page, user: TestUser) {
  const idps = await ensureDiscovery(page);
  
  // Skip if IdP not available
  if (!isIdPAvailable(idps, user.countryCode)) {
    throw new Error(`IdP not available: ${user.countryCode}`);
  }
  
  await page.goto('/');
  
  // Use discovered displayName
  const displayName = getIdPDisplayName(idps, user.countryCode);
  const idpButton = page.getByRole('button', { name: new RegExp(displayName!, 'i') });
  await idpButton.click();
}
```

#### Task 4.2: Update TEST_USERS Fixture (1 hour)

**File:** `frontend/src/__tests__/e2e/fixtures/test-users.ts`

**Changes:**
1. Add `countryCode` field (ISO 3166-1 alpha-3) to all test users
2. Keep `idp` field for reference but mark as deprecated
3. Update exports to use country codes

**Before:**
```typescript
export const TEST_USERS = {
  USA: {
    UNCLASS: { username: 'testuser-usa-1', idp: 'United States', ... }
  },
  DEU: {
    UNCLASS: { username: 'testuser-deu-1', idp: 'Germany', ... }
  }
};
```

**After:**
```typescript
export const TEST_USERS = {
  USA: {
    UNCLASS: { 
      username: 'testuser-usa-1', 
      countryCode: 'USA',  // ✅ Added
      country: 'United States',
      idp: 'United States',  // @deprecated - Use countryCode with dynamic discovery
      ... 
    }
  },
  DEU: {
    UNCLASS: { 
      username: 'testuser-deu-1', 
      countryCode: 'DEU',  // ✅ Added
      country: 'Germany',
      idp: 'Germany',  // @deprecated - Use countryCode with dynamic discovery
      ... 
    }
  }
};
```

#### Task 4.3: Test Refactored Helper (1 hour)

**Test Script:**
```bash
cd frontend
TEST_TAG='@fast' npx playwright test identity-drawer.spec.ts --reporter=list
```

**Success Criteria:**
- ✅ Helper discovers available IdPs (USA, DEU)
- ✅ Uses actual displayNames ("Local", "DEU Instance")
- ✅ Tests pass for USA tests
- ✅ Tests pass for DEU tests
- ✅ No hardcoded IdP name assumptions

---

### Phase 2: Test File Migration (Afternoon - 4 hours)

#### Task 4.4: Refactor auth-confirmed-frontend.spec.ts (1.5 hours)

**Changes:**
1. Add `beforeAll` discovery
2. Update all `loginAs()` calls to use dynamic discovery
3. Add graceful skips for unavailable IdPs
4. Remove hardcoded IdP name expectations

**Pattern:**
```typescript
test.describe('Auth Tests', () => {
  let availableIdPs: DiscoveredIdPs;
  
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    availableIdPs = await discoverAvailableIdPs(page);
    await page.close();
  });
  
  test('USA user login', async ({ page }) => {
    // Auto-skips if USA not available (shouldn't happen for hub)
    await loginAs(page, TEST_USERS.USA.UNCLASS);
    await expectLoggedIn(page, TEST_USERS.USA.UNCLASS);
  });
  
  test('DEU user login', async ({ page }) => {
    // Auto-skips if DEU not deployed
    test.skip(!isIdPAvailable(availableIdPs, 'DEU'), 'DEU spoke not deployed');
    await loginAs(page, TEST_USERS.DEU.UNCLASS);
    await expectLoggedIn(page, TEST_USERS.DEU.UNCLASS);
  });
});
```

#### Task 4.5: Refactor all-test-users.spec.ts (1 hour)

**Changes:**
1. Iterate over discovered IdPs instead of hardcoded list
2. Generate tests dynamically based on availability
3. Skip unavailable countries gracefully

**Pattern:**
```typescript
test.describe('All Available Test Users', () => {
  let availableIdPs: DiscoveredIdPs;
  
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    availableIdPs = await discoverAvailableIdPs(page);
    await page.close();
  });
  
  // Hub (USA) - Always test
  test('USA UNCLASSIFIED', async ({ page }) => {
    await loginAs(page, TEST_USERS.USA.UNCLASS);
    await expectLoggedIn(page, TEST_USERS.USA.UNCLASS);
  });
  
  // Spokes - Test only if deployed
  for (const [code, idp] of availableIdPs.spokes.entries()) {
    if (TEST_USERS[code]) {
      test(`${code} UNCLASSIFIED`, async ({ page }) => {
        await loginAs(page, TEST_USERS[code].UNCLASS);
        await expectLoggedIn(page, TEST_USERS[code].UNCLASS);
      });
    }
  }
});
```

#### Task 4.6: Refactor key-test-users.spec.ts (1 hour)

Similar pattern to `all-test-users.spec.ts` but focusing on priority users.

#### Task 4.7: Verify All @fast Tests Pass (30 min)

**Command:**
```bash
TEST_TAG='@fast' npx playwright test --reporter=list
```

**Expected Result:**
```
40 passed (USA + DEU tests)
0 failed
0 skipped (no unavailable spokes referenced)
Duration: <5 min
```

---

## 🎯 **Success Metrics**

| Metric | Before (Day 3) | Target (Day 4) | How to Verify |
|--------|----------------|----------------|---------------|
| **@fast pass rate** | 12.5% (5/40) | 100% (40/40) | `TEST_TAG='@fast' npm test` |
| **@fast duration** | 2.8 min | <3 min | Time in test output |
| **Hardcoded assumptions** | 3 test files | 0 files | Code review |
| **Dynamic discovery** | Not used | Used by all tests | Check imports |
| **Graceful skips** | 0 (timeouts) | Auto-skip if not deployed | Test output |

---

## 📊 **Expected Outcomes**

### Current Environment (USA + DEU)

**Before (Day 3):**
- Tests run: 40 @fast tests
- Tests pass: 5 (12.5%)
- Tests fail: 35 (87.5%)
- Failure reason: Hardcoded IdP names, missing spokes
- Duration: 2.8 min (with failures)

**After (Day 4):**
- Tests run: 40 @fast tests (USA + DEU tests only)
- Tests pass: 40 (100%)
- Tests fail: 0
- Tests skip: 0 (no unavailable IdPs referenced)
- Duration: <3 min (no timeouts)

### Future Environment (USA + DEU + FRA + GBR)

**Automatic Adaptation:**
```bash
# No code changes needed - discovery finds FRA + GBR
npm run test:e2e:fast

# Result:
# ✅ USA tests: 10 passed
# ✅ DEU tests: 10 passed
# ✅ FRA tests: 10 passed  # NEW (auto-discovered)
# ✅ GBR tests: 10 passed  # NEW (auto-discovered)
# Total: 40 passed
```

---

## 🛠️ **Testing Strategy**

### Incremental Validation

**Step 1:** Test auth helper in isolation
```bash
# Create temporary test file
touch frontend/src/__tests__/e2e/test-dynamic-auth.spec.ts

test('Auth helper uses dynamic discovery', async ({ page }) => {
  const idps = await discoverAvailableIdPs(page);
  expect(idps.hub).toBeDefined();
  expect(idps.spokes.has('DEU')).toBe(true);
  
  await loginAs(page, TEST_USERS.USA.UNCLASS);
  await expectLoggedIn(page, TEST_USERS.USA.UNCLASS);
});
```

**Step 2:** Test one file at a time
```bash
npx playwright test identity-drawer.spec.ts
npx playwright test auth-confirmed-frontend.spec.ts
npx playwright test all-test-users.spec.ts
```

**Step 3:** Test all @fast
```bash
TEST_TAG='@fast' npx playwright test
```

**Step 4:** Test @smoke and @critical
```bash
TEST_TAG='@smoke' npx playwright test
TEST_TAG='@critical' npx playwright test
```

---

## 📝 **Code Standards**

### ISO 3166-1 Alpha-3 Codes

**SSOT:** `scripts/nato-countries.sh`

All code MUST use ISO 3166-1 alpha-3 codes:
- ✅ USA (not US)
- ✅ DEU (not DE or "Germany")
- ✅ FRA (not FR or "France")
- ✅ GBR (not GB or UK)
- ✅ ALB (not "Albania")
- ✅ DNK (not "Denmark")
- ✅ ROU (not "Romania")

**In Tests:**
```typescript
// ✅ CORRECT
test.skip(!isIdPAvailable(idps, 'DEU'), 'DEU not deployed');
await loginAs(page, TEST_USERS.DEU.UNCLASS);

// ❌ WRONG
test.skip(!isIdPAvailable(idps, 'Germany'), 'Germany not deployed');
await loginAs(page, TEST_USERS.Germany.UNCLASS);
```

---

## 🚧 **Potential Issues & Solutions**

### Issue 1: Discovery Too Slow
**Symptom:** `beforeAll` discovery adds 5-10s per test file  
**Solution:** Cache discovery globally, reuse across files

### Issue 2: Flaky Discovery
**Symptom:** Discovery sometimes fails to find IdPs  
**Solution:** Add retry logic, fallback to environment variables

### Issue 3: Test Users Missing
**Symptom:** Discovery finds FRA but TEST_USERS.FRA doesn't exist  
**Solution:** Add test users for all 32 NATO nations (Day 5 task)

### Issue 4: CI Environment Differences
**Symptom:** Tests pass locally but fail in CI  
**Solution:** Use `DEPLOYED_INSTANCES` env var to force specific IdPs in CI

---

## 📚 **Documentation Updates**

### Files to Update

1. **E2E_TEST_RELIABILITY_AUDIT.md**
   - Update with dynamic discovery solution
   - Remove hardcoded IdP assumptions section

2. **TEST_TAGGING_STRATEGY.md**
   - Add note about dynamic discovery requirement
   - Update examples to use discovery

3. **COMPREHENSIVE_IMPLEMENTATION_GUIDE.md**
   - Mark Day 4 as complete
   - Update Week 1 progress

---

## ⏭️ **Day 5 Preview**

After Day 4 completion, Day 5 will focus on:
1. Consolidate CI jobs (4 → 1 with sharding)
2. Fix remaining flaky tests
3. Add test users for all NATO nations
4. Performance optimization

---

**Document Owner**: Testing & Quality Team  
**Status**: Ready for Execution  
**Est. Duration**: 8 hours  
**Prerequisites**: Day 3 complete ✅
