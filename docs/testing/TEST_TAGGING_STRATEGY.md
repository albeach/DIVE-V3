# DIVE V3 E2E Test Tagging Strategy

**Date Created**: 2026-02-08  
**Status**: Active  
**Purpose**: Enable selective test execution for faster feedback and efficient CI

---

## 🏷️ **Tag Definitions**

### @fast
**Criteria**:
- Execution time: <5 seconds per test
- No authentication required
- No external service dependencies
- No database state changes

**Examples**:
- Page load tests (homepage, public pages)
- Component rendering tests
- Navigation tests (UI only)
- Static content verification

**Use Cases**:
- Local development (instant feedback)
- Commit hooks (pre-commit validation)
- Quick sanity checks

**Target Duration**: <5 minutes for all @fast tests

---

### @smoke
**Criteria**:
- Critical path functionality
- Core features that must work
- Representative of full system health
- Reasonable execution time (<30s each)

**Examples**:
- Basic authentication (UNCLASSIFIED user)
- Resource listing
- Authorization checks (clearance validation)
- IdP selection and discovery
- Basic navigation flows

**Use Cases**:
- CI on every commit (fast feedback)
- Post-deployment verification
- Build validation

**Target Duration**: <10 minutes for all @smoke tests
**Target Count**: 10-15 tests

---

### @critical
**Criteria**:
- Must pass for production deployment
- Covers all core functionality
- May include complex scenarios
- Includes authentication, authorization, federation

**Examples**:
- All authentication flows (MFA, WebAuthn)
- All authorization scenarios (clearance, COI, releasability)
- Resource CRUD operations
- Federation workflows
- Policy enforcement

**Use Cases**:
- PR checks (before merge)
- Pre-deployment validation
- Release testing

**Target Duration**: <20 minutes for all @critical tests
**Target Count**: 20-30 tests

---

### @flaky
**Criteria**:
- Intermittent failures (>5% failure rate)
- Timing-sensitive operations
- External dependency issues
- Known configuration problems

**Examples**:
- MFA enrollment (Keycloak timing)
- SAML redirects (IdP latency)
- WebAuthn flows (browser quirks)
- Session expiration tests

**Use Cases**:
- Isolated fixing sessions
- Extra retry testing (3+ retries)
- Root cause analysis
- Should NOT block CI

**Target**: Reduce @flaky tests from 10 → <3

---

## 📊 **Tag Combinations**

Tests can have multiple tags:

```typescript
// Fast + Smoke: Critical path, fast execution
test('Basic login', { tag: ['@fast', '@smoke', '@critical'] }, ...);

// Critical + Flaky: Important but unreliable
test('MFA enrollment', { tag: ['@critical', '@flaky'] }, ...);

// Smoke + Critical: Core functionality, always run
test('Resource access', { tag: ['@smoke', '@critical'] }, ...);
```

---

## 🎯 **Tagging Guidelines**

### Start Conservative
- When in doubt, tag as `@critical` (better to over-test)
- Add `@fast` only if truly fast (<5s consistently)
- Add `@flaky` if >5% failure rate observed

### Test Isolation
- `@fast` tests should NOT depend on `@critical` tests
- Each tag category should be independently runnable
- No shared state between tagged tests

### Retry Configuration
```typescript
// Fast/Smoke: No retries (should be stable)
test('Homepage loads', { tag: '@fast' }, ...);

// Critical: 1 retry (catch occasional issues)
test('Login flow', { tag: '@critical' }, ..., { retries: 1 });

// Flaky: 3 retries (maximize pass rate while fixing)
test('MFA enrollment', { tag: '@flaky' }, ..., { retries: 3 });
```

---

## 📝 **Implementation Syntax**

### Playwright Test Tags (v1.42+)

**Test Suite Tags** (applies to all tests in suite):
```typescript
import { test, expect } from '@playwright/test';

test.describe('Authentication', { tag: '@smoke' }, () => {
  test('Login works', async ({ page }) => {
    // All tests in this suite inherit @smoke tag
  });
});
```

**Individual Test Tags**:
```typescript
test.describe('Mixed Tests', () => {
  test('Fast test', { tag: '@fast' }, async ({ page }) => {
    // Only this test has @fast
  });
  
  test('Slow test', { tag: ['@critical', '@slow'] }, async ({ page }) => {
    // Multiple tags
  });
});
```

**Test Configuration**:
```typescript
test('Flaky test', { tag: '@flaky' }, async ({ page }) => {
  // Test code
}, { 
  retries: 3,           // Extra retries for flaky
  timeout: 60000        // Longer timeout
});
```

---

## 🚀 **NPM Scripts (Already Configured)**

From `frontend/package.json`:
```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:fast": "TEST_TAG=@fast playwright test",
    "test:e2e:smoke": "TEST_TAG=@smoke playwright test",
    "test:e2e:critical": "TEST_TAG=@critical playwright test",
    "test:e2e:flaky": "TEST_TAG=@flaky playwright test --retries=3"
  }
}
```

**Usage**:
```bash
# Run fast tests locally
npm run test:e2e:fast

# Run smoke tests in CI
npm run test:e2e:smoke

# Run critical tests before merge
npm run test:e2e:critical

# Test flaky tests with extra retries
npm run test:e2e:flaky
```

---

## 📈 **Expected Test Distribution**

### Initial Tagging (Day 3)
| Tag | Test Count | Duration | Files |
|-----|------------|----------|-------|
| @fast | 5-8 | <5 min | 5 |
| @smoke | 10-15 | <10 min | 10 |
| @critical | 20-30 | <20 min | 20 |
| @flaky | 5-10 | Variable | 5 |

### Full Tagging (Future)
| Tag | Test Count | Duration | Files |
|-----|------------|----------|-------|
| @fast | 15-20 | <5 min | 15 |
| @smoke | 25-35 | <10 min | 25 |
| @critical | 40-50 | <20 min | 40 |
| @flaky | <3 | Variable | <3 |
| **Untagged** | 13 | N/A | 13 (dynamic, experimental) |

---

## 🎯 **Success Criteria**

### Day 3 Goals
- [x] Tagging strategy documented
- [ ] 20 files tagged
- [ ] Fast tests: <5 min ✓
- [ ] Smoke tests: <10 min ✓
- [ ] Critical tests: <20 min ✓
- [ ] Selective execution working ✓

### Week 1 Goals
- [ ] Top 10 flaky tests fixed (Day 5)
- [ ] Flaky count: <3 (from 10)
- [ ] CI duration: <25 min (from 50 min)
- [ ] Pass rate: >95% (from ~80%)

---

## 🔍 **Tag Review Process**

### Weekly Review
- Check if @flaky tests are fixed (move to @critical)
- Verify @fast tests stay <5s
- Update tags based on execution data

### Quarterly Review
- Analyze tag distribution
- Adjust criteria if needed
- Retag tests as system evolves

---

## 📚 **Resources**

- Playwright Docs: https://playwright.dev/docs/test-annotations#tag-tests
- Test Tagging Best Practices: https://martinfowler.com/bliki/TestPyramid.html
- DIVE V3 Implementation Guide: `COMPREHENSIVE_IMPLEMENTATION_GUIDE.md`

---

**Document Owner**: Testing & Quality Team  
**Review Frequency**: Weekly during Week 1, Monthly after
**Last Updated**: 2026-02-08
