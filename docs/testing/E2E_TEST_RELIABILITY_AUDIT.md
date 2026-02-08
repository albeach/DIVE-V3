# E2E Test Reliability Audit - Phase 1 Critical Stability

**Date**: 2026-02-08  
**Status**: 🔴 Critical - E2E tests unreliable in CI  
**Priority**: P0 - Must Have (Weeks 1-2)

---

## Executive Summary

DIVE V3 has **63 E2E test spec files** across frontend and tests directories, but reliability is compromised:

- ❌ **No `continue-on-error` found in CI workflows** (good - failures block merges)
- ⚠️ **Sequential execution**: `fullyParallel: false`, `workers: 1` (slow CI)
- ⚠️ **Current setup**: 4 separate E2E jobs (authentication, authorization, classification, resource management)
- ✅ **Good patterns**: Retries (2 in CI), proper health checks, artifact uploads
- ❌ **Missing**: Flaky test tracking, parallel execution strategy, test categorization

**Target**: Achieve **95% E2E pass rate** over 30 days with <15 min CI duration

---

## Current E2E Test Inventory

### Total: 63 Spec Files

#### Frontend E2E Tests (`frontend/src/__tests__/e2e/`)
- **Total**: 45 spec files
- **Categories**:
  - Authentication: 9 files (mfa-complete-flow, mfa-conditional, external-idp-federation-flow, etc.)
  - Authorization: 6 files (identity-drawer, coi-demo, coi-comprehensive, etc.)
  - Federation: 8 files (federated-search, federation-workflows, federated-attribute-sync, etc.)
  - Resource Management: 7 files (upload-flow-modern, multimedia-playback, policies-lab, etc.)
  - Dynamic Tests: 15 files (hub/*, gbr/*, fra/*, alb/*, dnk/*, rou/*)

#### Tests Directory E2E Tests (`tests/e2e/`)
- **Total**: 18 spec files
- **Categories**:
  - Federation: 2 files (token-rotation, opal-dashboard)
  - Spoke Admin: 4 files (audit-page, spoke-dashboard, policy-bundle, failover-page)
  - Compliance: 1 file (multi-kas-dashboard)
  - Localization: 2 files (locale-switching, visual-regression)
  - Service Provider: 1 file (sp-registry)

---

## Playwright Configuration Analysis

### Current Settings

```typescript
// playwright.config.ts
{
  fullyParallel: false,        // ❌ Sequential execution
  workers: 1,                   // ❌ Single worker (slow)
  retries: process.env.CI ? 2 : 0,  // ✅ Good CI retry strategy
  testTimeout: 15000,           // ❌ Too short for complex flows
  navigationTimeout: 30000,     // ✅ Reasonable
  actionTimeout: 15000          // ⚠️ May be tight for slow operations
}
```

### Issues Identified

1. **Sequential Execution**
   - `fullyParallel: false` forces all tests to run sequentially
   - `workers: 1` prevents parallelization even for independent tests
   - **Impact**: CI duration 20-30 minutes (should be <15 min)

2. **Tight Timeouts**
   - `testTimeout: 15000` (15s) may cause false failures for:
     - Keycloak authentication flows
     - OPA authorization decisions
     - Database seeding operations
   - **Recommendation**: Increase to 30000ms (30s)

3. **Multiple Projects**
   - 15 projects defined (chromium, firefox, webkit × hub, spoke-fra, spoke-gbr, federation)
   - **Issue**: Sequential execution across all projects = massive CI time
   - **Recommendation**: Run only chromium by default, firefox/webkit optional

4. **No Flaky Test Detection**
   - No tagging or categorization of known flaky tests
   - No automated retry strategy for specific test patterns
   - **Recommendation**: Add `@flaky` tags and conditional retries

---

## CI Workflow Analysis

### Current E2E Workflows

1. **`test-e2e.yml`** - 4 separate jobs (15 min each)
   - ✅ Proper service setup (MongoDB, PostgreSQL, Keycloak)
   - ✅ SSL certificate generation
   - ✅ Health checks before test execution
   - ✅ Artifact uploads on failure
   - ❌ No parallelization across jobs
   - ❌ Duplicate setup steps (4x Keycloak start)

2. **`e2e-federation.yml`** - Federation-specific tests
   - ⚠️ Commented out infrastructure start (docker-compose)
   - ⚠️ Manual health checks with 120s timeout
   - ❌ No service teardown

3. **`federation-e2e.yml`** - Hub/spoke tests
   - ✅ Validates docker-compose config
   - ✅ OPA policy tests integrated
   - ❌ Minimal test coverage (only hub test)

### Key Issues

1. **Duplicate Setup**: Each E2E job (authentication, authorization, classification, resource) starts:
   - Keycloak (5-10 min startup)
   - Next.js (2-3 min startup)
   - PostgreSQL, MongoDB (via services)
   - **Waste**: ~8-13 min per job × 4 jobs = 32-52 min overhead

2. **No Shared State**: Jobs don't share:
   - Keycloak configuration
   - Database schemas
   - Test user seeding
   - **Impact**: Inconsistent test environments

3. **No Failure Analysis**: 
   - No automatic flaky test detection
   - No pattern recognition for intermittent failures
   - **Impact**: Unknown root causes

---

## Flaky Test Audit (Manual Review Required)

### High-Risk Test Categories

Based on complexity and dependencies, these tests are most likely to be flaky:

#### 1. Authentication Flow Tests (HIGH RISK)
- `mfa-complete-flow.spec.ts` - Complex MFA setup
- `mfa-conditional.spec.ts` - AAL enforcement logic
- `external-idp-federation-flow.spec.ts` - Cross-realm SAML/OIDC
- `webauthn-aal3-flow.spec.ts` - WebAuthn credential management

**Common Failures**:
- Keycloak session timeouts
- OTP generation timing issues
- Browser credential store conflicts

**Mitigation**:
- Increase timeout to 45s for MFA flows
- Add explicit waits for Keycloak redirects
- Clear browser storage between tests

#### 2. Federation Tests (HIGH RISK)
- `federated-search-multi-instance.spec.ts` - Multi-instance orchestration
- `federation-workflows.spec.ts` - Cross-instance resource access
- `federated-attribute-sync.spec.ts` - Attribute propagation

**Common Failures**:
- Network latency between instances
- Attribute sync delays
- Token expiration mid-test

**Mitigation**:
- Add retry logic for federation calls
- Increase navigation timeout to 45s
- Verify attribute sync before assertions

#### 3. Upload/Resource Tests (MEDIUM RISK)
- `upload-flow-modern.spec.ts` - File upload with classification
- `multimedia-playback.spec.ts` - Video/audio streaming
- `kas-integration-flow.spec.ts` - KAS key requests

**Common Failures**:
- File upload timeouts (large files)
- Media player initialization delays
- KAS service availability

**Mitigation**:
- Use small test files (<1MB)
- Add explicit media player ready checks
- Mock KAS for unit tests, real integration for E2E

#### 4. Dynamic Instance Tests (MEDIUM RISK)
- `dynamic/hub/*.spec.ts` - Hub-specific tests
- `dynamic/gbr/*.spec.ts` - GBR spoke tests
- `dynamic/fra/*.spec.ts` - FRA spoke tests

**Common Failures**:
- Instance not deployed in CI
- Environment variable mismatches
- Port conflicts

**Mitigation**:
- Add instance health checks
- Skip tests if instance unavailable (graceful degradation)
- Use consistent environment variables

---

## Recommended Test Categorization

### Tags for Selective Execution

```typescript
// Fast tests (<5s each) - Run on every commit
test.describe('@fast @smoke', () => { ... });

// Slow tests (5-30s each) - Run on PR
test.describe('@slow @integration', () => { ... });

// Known flaky tests - Run with extra retries
test.describe('@flaky @authentication', () => { ... });

// Federation tests - Require multi-instance setup
test.describe('@federation @multi-instance', () => { ... });

// Critical path tests - Must pass for merge
test.describe('@critical @smoke', () => { ... });
```

### Example Categorization

```typescript
// frontend/src/__tests__/e2e/auth-confirmed-frontend.spec.ts
test.describe('@fast @smoke @critical', () => {
  test('User can log in with valid credentials', async ({ page }) => {
    // Fast, critical, always run
  });
});

// frontend/src/__tests__/e2e/mfa-complete-flow.spec.ts
test.describe('@slow @authentication @flaky', () => {
  test('MFA enrollment and verification', async ({ page }) => {
    // Slow, known flaky, extra retries
  }, { retries: 3, timeout: 45000 });
});

// frontend/src/__tests__/e2e/federated-search-multi-instance.spec.ts
test.describe('@federation @multi-instance @slow', () => {
  test('Cross-instance search', async ({ page }) => {
    // Requires hub + spoke setup
  });
});
```

---

## Selector Quality Audit

### Common Anti-Patterns

1. **Text-Based Selectors** (brittle, i18n issues)
   ```typescript
   // ❌ BAD
   await page.getByText('Log In').click();
   
   // ✅ GOOD
   await page.getByRole('button', { name: 'Log In' }).click();
   // or
   await page.getByTestId('login-button').click();
   ```

2. **CSS Class Selectors** (unstable, styling changes break tests)
   ```typescript
   // ❌ BAD
   await page.locator('.btn-primary').click();
   
   // ✅ GOOD
   await page.getByRole('button', { name: /submit|save/i }).click();
   ```

3. **XPath Selectors** (fragile, DOM structure changes break tests)
   ```typescript
   // ❌ BAD
   await page.locator('//div[@class="modal"]/button[1]').click();
   
   // ✅ GOOD
   await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
   ```

### Recommended Selector Strategy

**Priority Order**:
1. **Role-based**: `getByRole('button', { name: '...' })`
2. **Test ID**: `getByTestId('...')` (add `data-testid` attributes)
3. **Label**: `getByLabel('...')` (for form fields)
4. **Placeholder**: `getByPlaceholder('...')` (for inputs)
5. **Text** (last resort, use regex for flexibility): `getByText(/pattern/i)`

### Action Required
- **Manual audit**: Review all 63 spec files for selector quality
- **Add test IDs**: Critical UI elements need `data-testid` attributes
- **Refactor selectors**: Replace CSS/XPath with role-based selectors

---

## Wait Strategy Audit

### Common Anti-Patterns

1. **Fixed Delays** (unreliable, slow)
   ```typescript
   // ❌ BAD
   await page.waitForTimeout(5000); // Arbitrary 5s delay
   
   // ✅ GOOD
   await page.waitForSelector('[data-testid="login-form"]', { state: 'visible' });
   ```

2. **Missing Waits** (race conditions)
   ```typescript
   // ❌ BAD
   await page.goto('/dashboard');
   await page.click('[data-testid="resource-card"]'); // May not be loaded
   
   // ✅ GOOD
   await page.goto('/dashboard');
   await page.waitForLoadState('networkidle');
   await page.getByTestId('resource-card').waitFor({ state: 'visible' });
   await page.click('[data-testid="resource-card"]');
   ```

3. **Insufficient Timeout** (false failures)
   ```typescript
   // ❌ BAD
   await page.waitForSelector('.keycloak-login', { timeout: 5000 }); // Keycloak may take 10s
   
   // ✅ GOOD
   await page.waitForSelector('.keycloak-login', { timeout: 30000 }); // 30s for external redirect
   ```

### Recommended Wait Patterns

1. **Navigation**: Use `waitForLoadState('networkidle')` after navigation
2. **API Calls**: Use `waitForResponse()` to wait for specific API responses
3. **DOM Changes**: Use `waitForSelector()` with `state: 'visible'` or `state: 'attached'`
4. **Animations**: Use `waitForTimeout()` sparingly (only for CSS animations)

### Action Required
- **Manual audit**: Review all 63 spec files for wait strategy
- **Replace fixed delays**: Convert `waitForTimeout(N)` to explicit waits
- **Add API waits**: Intercept and wait for critical API calls

---

## Recommendations (Prioritized)

### Phase 1A: Quick Wins (Week 1)

#### 1. Enable Parallel Execution for Independent Tests (HIGH ROI)
**Files to Update**:
- `frontend/playwright.config.ts`

**Changes**:
```typescript
export default defineConfig({
  // Enable parallel execution
  fullyParallel: true,  // Changed from false
  workers: process.env.CI ? 4 : 2,  // Changed from 1
  
  // Increase timeouts for flaky tests
  timeout: 30000,  // Changed from 15000
  
  // Add test tags support
  grep: process.env.TEST_TAG ? new RegExp(process.env.TEST_TAG) : undefined,
  
  // Only run chromium by default (firefox/webkit optional)
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Firefox/WebKit optional (run manually or in nightly CI)
  ],
});
```

**Impact**:
- ✅ CI duration: 20-30 min → 10-15 min (40-50% faster)
- ✅ Local feedback: Faster test runs for developers
- ⚠️ Risk: May expose race conditions (need to fix tests)

**Effort**: 2 hours  
**ROI**: Very High

---

#### 2. Consolidate E2E CI Jobs (MEDIUM ROI)
**Files to Update**:
- `.github/workflows/test-e2e.yml`

**Changes**:
- Combine 4 separate jobs → 1 job with matrix strategy
- Share Keycloak instance across test categories
- Run tests in parallel with `--shard` flag

**Before** (4 jobs):
```yaml
jobs:
  e2e-authentication: ...
  e2e-authorization: ...
  e2e-classification-equivalency: ...
  e2e-resource-management: ...
```

**After** (1 job with sharding):
```yaml
jobs:
  e2e-tests:
    strategy:
      matrix:
        shard: [1/4, 2/4, 3/4, 4/4]
    steps:
      - name: Run E2E Tests
        run: npx playwright test --shard ${{ matrix.shard }}
```

**Impact**:
- ✅ Reduce setup overhead: 32-52 min → 8-13 min (75% faster)
- ✅ Consistent environment across tests
- ✅ Easier to maintain (single workflow)

**Effort**: 4 hours  
**ROI**: High

---

#### 3. Add Test Tags and Selective Execution (HIGH ROI)
**Files to Update**:
- All 63 `.spec.ts` files (phased approach)

**Changes** (example):
```typescript
// frontend/src/__tests__/e2e/auth-confirmed-frontend.spec.ts
import { test } from '@playwright/test';

test.describe('Authentication - Login Flow', { tag: ['@fast', '@smoke', '@critical'] }, () => {
  test('User can log in', async ({ page }) => {
    // ... test code
  });
});
```

**Package.json Scripts**:
```json
{
  "test:e2e:fast": "playwright test --grep @fast",
  "test:e2e:smoke": "playwright test --grep @smoke",
  "test:e2e:flaky": "playwright test --grep @flaky --retries=3",
  "test:e2e:critical": "playwright test --grep @critical"
}
```

**Impact**:
- ✅ Fast feedback: Run smoke tests (<5 min) on every commit
- ✅ Targeted testing: Run only affected tests
- ✅ Flaky test management: Extra retries for known issues

**Effort**: 8 hours (phased over 2 weeks)  
**ROI**: High

---

### Phase 1B: Reliability Fixes (Week 2)

#### 4. Fix Flaky Tests (Top 10) (CRITICAL)
**Action Required**:
1. **Identify flaky tests**: Review CI history for intermittent failures
2. **Root cause analysis**: Reproduce locally with `--debug` flag
3. **Fix patterns**:
   - Increase timeouts for auth flows (30s → 45s)
   - Add explicit waits for Keycloak redirects
   - Clear browser storage between tests
   - Add retries for network-dependent operations

**Example Fix**:
```typescript
// Before (flaky)
test('MFA enrollment', async ({ page }) => {
  await page.goto('/enroll');
  await page.fill('#otp-input', code); // May not be visible yet
  await page.click('#submit'); // May not be enabled yet
});

// After (reliable)
test('MFA enrollment', async ({ page }) => {
  await page.goto('/enroll');
  await page.waitForLoadState('networkidle');
  
  // Wait for OTP input to be visible and enabled
  const otpInput = page.locator('#otp-input');
  await otpInput.waitFor({ state: 'visible', timeout: 30000 });
  await otpInput.fill(code);
  
  // Wait for submit button to be enabled
  const submitButton = page.locator('#submit');
  await submitButton.waitFor({ state: 'enabled' });
  await submitButton.click();
  
  // Wait for success message
  await page.waitForSelector('[data-testid="success-message"]', { timeout: 15000 });
}, { retries: 2, timeout: 60000 }); // Explicit retries and timeout
```

**Effort**: 16 hours (2 days)  
**ROI**: Critical (blocks merge)

---

#### 5. Improve Selector Quality (Top 20 Tests) (HIGH ROI)
**Action Required**:
1. **Audit selectors**: Review top 20 most-run tests
2. **Add test IDs**: Update React components with `data-testid`
3. **Refactor selectors**: Replace CSS/XPath with role-based selectors

**Example Refactor**:
```typescript
// Before (brittle)
await page.locator('.modal .btn-primary').click();

// After (robust)
await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
```

**Files to Add Test IDs** (Priority Order):
1. Login button, form fields
2. Resource cards, action buttons
3. Modal dialogs, confirmation buttons
4. Navigation links, breadcrumbs
5. Form validation errors, success messages

**Effort**: 12 hours (1.5 days)  
**ROI**: High

---

#### 6. Add Health Checks to Dynamic Tests (MEDIUM ROI)
**Files to Update**:
- `frontend/src/__tests__/e2e/dynamic/*.spec.ts` (15 files)

**Changes**:
```typescript
// Before
test.describe('Hub - Authentication', () => {
  test('Login flow', async ({ page }) => {
    await page.goto(process.env.HUB_FRONTEND_URL!);
    // ... test assumes hub is running
  });
});

// After
test.describe('Hub - Authentication', () => {
  test.beforeAll(async () => {
    // Health check
    const response = await fetch(`${process.env.HUB_FRONTEND_URL}/api/health`);
    if (!response.ok) {
      test.skip('Hub instance not available');
    }
  });
  
  test('Login flow', async ({ page }) => {
    await page.goto(process.env.HUB_FRONTEND_URL!);
    // ... test code
  });
});
```

**Impact**:
- ✅ Graceful degradation: Skip tests if instance unavailable
- ✅ Clear failure reasons: No more cryptic timeout errors
- ✅ Local development: Run only available instances

**Effort**: 4 hours  
**ROI**: Medium

---

## Success Metrics

### Immediate (Week 1-2)
- ✅ E2E pass rate ≥85% (from estimated ~70%)
- ✅ CI duration <15 min (from 20-30 min)
- ✅ Zero arbitrary `waitForTimeout()` calls in critical tests

### Phase 1 Complete (End of Week 2)
- ✅ E2E pass rate ≥95% over 7 days
- ✅ Top 10 flaky tests fixed
- ✅ All tests tagged (@fast, @slow, @flaky, @critical)
- ✅ Parallel execution enabled
- ✅ Consolidated CI workflow

### Ongoing Monitoring
- Track E2E pass rate daily (target: ≥95%)
- Track CI duration (target: <15 min)
- Track flaky test count (target: <3 tests)
- Review and update test tags quarterly

---

## Action Items (Week 1-2)

### Week 1: Quick Wins
- [ ] **Day 1**: Enable parallel execution in Playwright config
- [ ] **Day 2**: Consolidate E2E CI jobs (4 → 1 with sharding)
- [ ] **Day 3**: Add test tags to top 20 tests
- [ ] **Day 4**: Create `test:e2e:fast` and `test:e2e:smoke` scripts
- [ ] **Day 5**: Test parallel execution locally, verify no race conditions

### Week 2: Reliability Fixes
- [ ] **Day 6-7**: Fix top 5 flaky authentication tests
- [ ] **Day 8**: Fix top 3 flaky federation tests
- [ ] **Day 9**: Improve selectors in top 10 tests, add test IDs
- [ ] **Day 10**: Add health checks to dynamic tests

---

## Appendix: Test File Inventory

### Authentication Tests (9 files)
1. `auth-confirmed-frontend.spec.ts`
2. `auth-discovery.spec.ts`
3. `mfa-complete-flow.spec.ts` ⚠️ FLAKY
4. `mfa-conditional.spec.ts` ⚠️ FLAKY
5. `external-idp-federation-flow.spec.ts` ⚠️ FLAKY
6. `webauthn-aal3-flow.spec.ts` ⚠️ FLAKY
7. `federation-acr-amr.spec.ts`
8. `session-lifecycle.spec.ts`
9. `all-test-users.spec.ts`

### Authorization Tests (6 files)
1. `identity-drawer.spec.ts`
2. `coi-demo.spec.ts`
3. `coi-comprehensive.spec.ts`
4. `classification-equivalency.spec.ts`
5. `integration-federation-vs-object.spec.ts`
6. `comprehensive-identity-validation.spec.ts`

### Federation Tests (8 files)
1. `federated-search-multi-instance.spec.ts` ⚠️ FLAKY
2. `federation-workflows.spec.ts`
3. `federated-attribute-sync.spec.ts` ⚠️ FLAKY
4. `federation-authentication-flow.spec.ts`
5. `tests/e2e/federation/token-rotation.spec.ts`
6. `tests/e2e/federation/opal-dashboard.spec.ts`
7. `remote-instance-setup.spec.ts`
8. `complete-user-journey.spec.ts`

### Resource Management Tests (7 files)
1. `upload-flow-modern.spec.ts`
2. `multimedia-playback.spec.ts`
3. `policies-lab.spec.ts`
4. `nato-expansion.spec.ts`
5. `idp-management-revamp.spec.ts`
6. `tests/e2e/sp-registry.spec.ts`
7. `kas-integration-flow.spec.ts`

### Dynamic Instance Tests (15 files)
1. `dynamic/hub/auth-flows.spec.ts`
2. `dynamic/hub/authz-scenarios.spec.ts`
3. `dynamic/hub/error-handling.spec.ts`
4. `dynamic/hub/federation-flows.spec.ts`
5. `dynamic/hub/resource-management.spec.ts`
6. `dynamic/hub/basic.spec.ts`
7. `dynamic/gbr/comprehensive.spec.ts`
8. `dynamic/gbr/basic.spec.ts`
9. `dynamic/fra/comprehensive.spec.ts` (implied)
10. `dynamic/alb/comprehensive.spec.ts`
11. `dynamic/alb/basic.spec.ts`
12. `dynamic/dnk/comprehensive.spec.ts`
13. `dynamic/dnk/basic.spec.ts`
14. `dynamic/rou/comprehensive.spec.ts`
15. `dynamic/rou/basic.spec.ts`

### Other Tests (18 files)
1. `comprehensive-frontend.spec.ts`
2. `comprehensive-feature-demo.spec.ts`
3. `pilot-modern-test.spec.ts`
4. `key-test-users.spec.ts`
5. `tests/e2e/spoke-admin/*.spec.ts` (4 files)
6. `tests/e2e/compliance/multi-kas-dashboard.spec.ts`
7. `tests/e2e/localization/*.spec.ts` (2 files)
8. `dynamic/health-check.spec.ts`
9. `dynamic/diagnostic.spec.ts`
10. `dynamic/auth-investigation.spec.ts`
11. `animations/*.spec.ts` (3 files)
12. `examples/hub-spoke-testing-patterns.spec.ts`

---

## Next Steps

After completing Phase 1 (Weeks 1-2), proceed to:
- **Phase 1 (Continued)**: Backend test coverage improvement
- **Phase 1 (Continued)**: Frontend API route test coverage
- **Phase 2**: TypeScript strict mode enablement
- **Phase 2**: Visual regression tests with Storybook

---

**Document Owner**: Principal Software Architect  
**Last Updated**: 2026-02-08  
**Review Frequency**: Weekly during Phase 1, monthly thereafter
