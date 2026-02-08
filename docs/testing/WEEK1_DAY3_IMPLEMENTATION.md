# Week 1 Day 3 - Test Tagging Implementation Guide

**Date Started**: 2026-02-08  
**Estimated Duration**: 4 hours  
**Prerequisites**: ✅ Day 2 Complete (Parallel execution verified)

---

## 🎯 **Objective**

Add test tags (`@fast`, `@smoke`, `@critical`, `@flaky`) to enable selective test execution and reduce feedback time.

**Benefits**:
- Developers can run fast tests locally (<5 min)
- CI can run smoke tests on every commit (<10 min)
- Critical tests run before merge (<20 min)
- Flaky tests isolated for fixing

---

## 📋 **Tagging Strategy**

### Tag Definitions

| Tag | Criteria | Duration | Use Case |
|-----|----------|----------|----------|
| **@fast** | <5s execution, no external deps | <5 min total | Local development, commit hooks |
| **@smoke** | Critical path, core functionality | <10 min total | CI on every commit |
| **@critical** | Must pass for merge, full scenarios | <20 min total | PR checks, pre-deploy |
| **@flaky** | Known intermittent failures | Variable | Isolated fixing, extra retries |

### Examples

```typescript
// Fast test (simple, no auth)
test('Homepage loads correctly', { tag: '@fast' }, async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/DIVE V3/);
});

// Smoke test (critical path)
test('User can login', { tag: ['@smoke', '@critical'] }, async ({ page }) => {
  await loginAs(page, TEST_USERS.USA.UNCLASSIFIED);
  await expect(page).toHaveURL(/dashboard/);
});

// Flaky test (needs extra retries)
test('MFA enrollment', { tag: ['@critical', '@flaky'] }, async ({ page }) => {
  // Complex flow with timing issues
}, { retries: 3, timeout: 60000 });
```

---

## 📝 **Implementation Plan**

### Phase 1: Tag 20 Priority Tests (2 hours)

#### 1. Authentication Tests (9 files) - 1 hour

| File | Tags | Rationale |
|------|------|-----------|
| `auth-confirmed-frontend.spec.ts` | `@fast @smoke @critical` | Basic login, fast, critical path |
| `mfa-complete-flow.spec.ts` | `@critical @flaky` | Complex MFA, known timing issues |
| `mfa-conditional.spec.ts` | `@critical @flaky` | Conditional MFA, timing sensitive |
| `external-idp-federation-flow.spec.ts` | `@critical @flaky` | SAML/OIDC federation, slow redirects |
| `webauthn-aal3-flow.spec.ts` | `@critical @flaky` | WebAuthn, browser-specific |
| `federation-acr-amr.spec.ts` | `@critical` | Federation claims, stable |
| `session-lifecycle.spec.ts` | `@fast @smoke` | Session management, fast |
| `auth-discovery.spec.ts` | `@fast` | IdP discovery, no auth required |
| `all-test-users.spec.ts` | `@smoke` | Multi-user validation, smoke test |

#### 2. Authorization Tests (6 files) - 30 minutes

| File | Tags | Rationale |
|------|------|-----------|
| `identity-drawer.spec.ts` | `@fast @smoke @critical` | ABAC UI, fast, critical |
| `coi-demo.spec.ts` | `@smoke` | COI scenarios, smoke test |
| `coi-comprehensive.spec.ts` | `@critical` | Full COI coverage |
| `classification-equivalency.spec.ts` | `@critical` | Clearance mapping, critical |
| `integration-federation-vs-object.spec.ts` | `@critical` | Federation authz |
| `comprehensive-identity-validation.spec.ts` | `@smoke` | Identity validation, smoke |

#### 3. Resource Management Tests (5 files) - 30 minutes

| File | Tags | Rationale |
|------|------|-----------|
| `upload-flow-modern.spec.ts` | `@critical` | File upload, critical feature |
| `multimedia-playback.spec.ts` | `@slow` | Video/audio, slow loading |
| `policies-lab.spec.ts` | `@smoke @critical` | OPA policies, critical |
| `nato-expansion.spec.ts` | `@smoke` | NATO scenarios, smoke test |
| `idp-management-revamp.spec.ts` | `@smoke` | IdP management, smoke |

### Phase 2: Test Selective Execution (2 hours)

#### 1. Fast Tests (<5 min) - 30 minutes
```bash
# Should run ~5-8 tests
npm run test:e2e:fast

# Expected:
# - auth-confirmed-frontend.spec.ts
# - session-lifecycle.spec.ts
# - auth-discovery.spec.ts
# - identity-drawer.spec.ts
# Total: <5 minutes
```

#### 2. Smoke Tests (<10 min) - 30 minutes
```bash
# Should run ~12-15 tests
npm run test:e2e:smoke

# Expected:
# - All @fast tests
# - all-test-users.spec.ts
# - coi-demo.spec.ts
# - comprehensive-identity-validation.spec.ts
# - policies-lab.spec.ts
# - nato-expansion.spec.ts
# - idp-management-revamp.spec.ts
# Total: <10 minutes
```

#### 3. Critical Tests (<20 min) - 30 minutes
```bash
# Should run ~20+ tests
npm run test:e2e:critical

# Expected:
# - All @smoke tests
# - mfa-complete-flow.spec.ts
# - mfa-conditional.spec.ts
# - external-idp-federation-flow.spec.ts
# - webauthn-aal3-flow.spec.ts
# - All authz @critical tests
# - All resource @critical tests
# Total: <20 minutes
```

#### 4. Flaky Tests (variable) - 30 minutes
```bash
# Should run ~5 tests with 3 retries each
npm run test:e2e:flaky

# Expected:
# - mfa-complete-flow.spec.ts (3 retries)
# - mfa-conditional.spec.ts (3 retries)
# - external-idp-federation-flow.spec.ts (3 retries)
# - webauthn-aal3-flow.spec.ts (3 retries)
# Total: Variable (focus on stability, not speed)
```

---

## 🔧 **Implementation Steps**

### Step 1: Create Tagging Strategy Document (15 min)

Create `docs/testing/TEST_TAGGING_STRATEGY.md` with tag definitions and examples.

### Step 2: Tag Authentication Tests (1 hour)

For each file:
1. Open test file
2. Add tags to test.describe() or individual tests
3. Add extra retries/timeouts for @flaky tests
4. Verify syntax with TypeScript compiler

Example:
```typescript
// Before
test.describe('MFA Complete Flow', () => {
  test('User can enroll with OTP', async ({ page }) => {
    // ...
  });
});

// After
test.describe('MFA Complete Flow', { tag: ['@critical', '@flaky'] }, () => {
  test('User can enroll with OTP', async ({ page }) => {
    // ...
  }, { retries: 3, timeout: 60000 });
});
```

### Step 3: Tag Authorization Tests (30 min)

Follow same pattern for 6 authorization test files.

### Step 4: Tag Resource Management Tests (30 min)

Follow same pattern for 5 resource management test files.

### Step 5: Test Fast Execution (15 min)

```bash
npm run test:e2e:fast
# Verify <5 min duration
```

### Step 6: Test Smoke Execution (15 min)

```bash
npm run test:e2e:smoke
# Verify <10 min duration
```

### Step 7: Test Critical Execution (15 min)

```bash
npm run test:e2e:critical
# Verify <20 min duration
```

### Step 8: Test Flaky Execution (15 min)

```bash
npm run test:e2e:flaky
# Verify extra retries working
```

### Step 9: Create Day 3 Summary (15 min)

Document:
- Tests tagged: 20/63 (32%)
- Fast tests: duration, count
- Smoke tests: duration, count
- Critical tests: duration, count
- Flaky tests: count, retry behavior

---

## ✅ **Success Criteria**

| Metric | Target | How to Verify |
|--------|--------|---------------|
| **Tests Tagged** | 20 files | Count @fast/@smoke/@critical/@flaky in code |
| **Fast Tests** | <5 min | `npm run test:e2e:fast` |
| **Smoke Tests** | <10 min | `npm run test:e2e:smoke` |
| **Critical Tests** | <20 min | `npm run test:e2e:critical` |
| **Selective Execution** | Working | Each script runs correct subset |
| **Retry Logic** | Working | @flaky tests retry 3 times |

---

## 📊 **Expected Outcomes**

### Test Distribution

| Category | Files | Expected Duration | Use Case |
|----------|-------|-------------------|----------|
| **Fast** | ~5 | <5 min | Local dev |
| **Smoke** | ~10 | <10 min | Commit CI |
| **Critical** | ~20 | <20 min | PR CI |
| **Flaky** | ~5 | Variable | Fixing |
| **All** | 63 | ~25 min | Full suite |

### Developer Workflow

**Before Commit**:
```bash
npm run test:e2e:fast  # <5 min
```

**CI on Commit**:
```bash
npm run test:e2e:smoke  # <10 min
```

**CI on PR**:
```bash
npm run test:e2e:critical  # <20 min
```

**Before Deploy**:
```bash
npm run test:e2e  # ~25 min (full suite)
```

---

## 🚧 **Common Issues & Solutions**

### Issue: Tags not working
**Solution**: Check Playwright version supports tag syntax (v1.42+)

### Issue: Tests running slow
**Solution**: Verify parallel execution still enabled in playwright.config.ts

### Issue: Wrong tests running
**Solution**: Check grep pattern in package.json scripts

### Issue: Flaky tests still failing
**Solution**: Increase retries/timeouts, check for race conditions

---

## 📈 **Metrics to Track**

After Day 3 completion:
- [ ] Tests tagged: __/20 (target: 20/20)
- [ ] Fast test duration: __ min (target: <5 min)
- [ ] Smoke test duration: __ min (target: <10 min)
- [ ] Critical test duration: __ min (target: <20 min)
- [ ] Selective execution working: ✓/✗
- [ ] Developer feedback: Positive/Negative

---

## ⏭️ **Next Steps (Day 4)**

After Day 3 complete:
1. Consolidate CI jobs (4 → 1 with sharding)
2. Apply tags to CI workflow
3. Reduce CI duration from ~88 min → ~27 min

---

**Document Owner**: Testing & Quality Team  
**Last Updated**: 2026-02-08  
**Estimated Time**: 4 hours  
**Actual Time**: TBD
