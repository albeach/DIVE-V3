# Week 1 Detailed Implementation - Days 2-5

**Date Started**: 2026-02-08  
**Status**: Ready to Begin  
**Prerequisites**: ✅ Quick Wins Complete (100%)

---

## Overview

With Quick Wins complete, Week 1 focuses on **E2E Test Reliability**:
- Target: <5% flakiness (from estimated 15-20%)
- Target: <25 min CI duration (from 45-60 min)
- Target: 95% pass rate over 7 days

**Effort**: 40 hours (5 days × 8 hours)  
**Team**: 1-2 engineers

---

## Day 2: Verify Parallel Execution (8 hours)

### Objective
Test the parallel execution changes and identify any race conditions or flaky tests introduced.

### Morning (4 hours): Local Testing

#### Task 2.1: Run E2E Tests Locally (1 hour)
```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/frontend

# Test with new parallel config (2 workers locally)
npm run test:e2e

# Monitor output for:
# - Race conditions (tests interfering with each other)
# - Timing-related failures
# - Resource conflicts (ports, databases)
```

**Success Criteria**:
- [ ] Tests complete without crashes
- [ ] No obvious race conditions
- [ ] Duration faster than sequential (~40-50% improvement)

**Document Issues**: Create a table of any flaky tests found

#### Task 2.2: Run Specific Test Categories (1 hour)
```bash
# Test authentication flows (most likely to have issues)
npm run test:e2e -- src/__tests__/e2e/mfa-complete-flow.spec.ts

# Test authorization (may have OPA conflicts)
npm run test:e2e -- src/__tests__/e2e/identity-drawer.spec.ts

# Test resource management
npm run test:e2e -- src/__tests__/e2e/policies-lab.spec.ts
```

**Success Criteria**:
- [ ] Each category runs independently
- [ ] No cross-test contamination
- [ ] Clear error messages if failures occur

#### Task 2.3: Stress Test Parallel Execution (1 hour)
```bash
# Run tests 3 times in succession
npm run test:e2e
npm run test:e2e
npm run test:e2e

# Check for:
# - Consistent pass/fail patterns
# - State cleanup between runs
# - Memory leaks or slowdowns
```

**Success Criteria**:
- [ ] Consistent results across runs
- [ ] No degradation over time
- [ ] Clean test isolation

#### Task 2.4: Document Baseline Metrics (1 hour)
Create `docs/testing/WEEK1_DAY2_BASELINE.md` with:
- Total test count
- Pass rate (%)
- Average duration (local)
- Flaky tests identified
- Race conditions found

### Afternoon (4 hours): CI Testing & Analysis

#### Task 2.5: Trigger CI E2E Tests (30 min)
```bash
# Push a small change to trigger CI
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3
git checkout -b test/week1-day2-parallel-execution
echo "# Week 1 Day 2 test" >> docs/testing/WEEK1_DAY2_BASELINE.md
git add docs/testing/WEEK1_DAY2_BASELINE.md
git commit -m "test: Week 1 Day 2 - Parallel execution verification"
git push origin test/week1-day2-parallel-execution
```

Monitor: `.github/workflows/test-e2e.yml` execution time

#### Task 2.6: Analyze CI Results (2 hours)
Review GitHub Actions run:
- [ ] E2E duration (target: <25 min, baseline: 45-60 min)
- [ ] Pass rate
- [ ] Flaky tests (retries triggered)
- [ ] Resource usage (4 workers)

**Compare**:
| Metric | Before (Sequential) | After (Parallel) | Improvement |
|--------|--------------------|--------------------|--------------|
| Duration | ~50 min | ? min | ? % |
| Workers | 1 | 4 | 300% |
| Pass Rate | ~80% | ? % | ? |

#### Task 2.7: Identify Top 10 Flaky Tests (1.5 hours)
From CI logs and local runs, create prioritized list:

```markdown
## Top 10 Flaky Tests (Week 1 Day 2)

| # | Test File | Failure Rate | Root Cause (Hypothesis) | Priority |
|---|-----------|--------------|-------------------------|----------|
| 1 | mfa-complete-flow.spec.ts | 40% | Keycloak timeout | P0 |
| 2 | external-idp-federation-flow.spec.ts | 30% | SAML redirect timing | P0 |
| ... | ... | ... | ... | ... |
```

#### Task 2.8: Day 2 Checkpoint (30 min)
Create summary:
- Parallel execution status (working/issues)
- Baseline metrics captured
- Top flaky tests identified
- Blockers for Day 3

**Decision Point**:
- ✅ Proceed to Day 3 (test tagging)
- ⚠️ Fix critical issues first (if >30% failure rate)

---

## Day 3: Add Test Tags (8 hours)

### Objective
Tag tests with `@fast`, `@smoke`, `@critical`, `@flaky` for selective execution.

### Morning (4 hours): Tag Top 20 Tests

#### Task 3.1: Create Tagging Strategy (30 min)
Review E2E_TEST_RELIABILITY_AUDIT.md and categorize tests:

**Tagging Criteria**:
- `@fast`: <5s execution, no external dependencies
- `@smoke`: Critical path, must pass for merge
- `@critical`: Core functionality (auth, authz, resource access)
- `@flaky`: Known intermittent failures

#### Task 3.2: Tag Authentication Tests (1 hour)
```typescript
// frontend/src/__tests__/e2e/mfa-complete-flow.spec.ts
import { test } from '@playwright/test';

test.describe('MFA Complete Flow', { tag: ['@critical', '@slow', '@flaky'] }, () => {
  test('User can enroll and verify with OTP', async ({ page }) => {
    // ... existing test code
  }, { retries: 3, timeout: 60000 }); // Extra retries for flaky tests
});
```

**Files to Tag** (9 files):
- [ ] `auth-confirmed-frontend.spec.ts` - @fast @smoke @critical
- [ ] `mfa-complete-flow.spec.ts` - @critical @slow @flaky
- [ ] `mfa-conditional.spec.ts` - @critical @slow @flaky
- [ ] `external-idp-federation-flow.spec.ts` - @critical @slow @flaky
- [ ] `webauthn-aal3-flow.spec.ts` - @critical @slow @flaky
- [ ] `federation-acr-amr.spec.ts` - @critical @slow
- [ ] `session-lifecycle.spec.ts` - @fast @smoke
- [ ] `auth-discovery.spec.ts` - @fast
- [ ] `all-test-users.spec.ts` - @smoke

#### Task 3.3: Tag Authorization Tests (1 hour)
**Files to Tag** (6 files):
- [ ] `identity-drawer.spec.ts` - @fast @smoke @critical
- [ ] `coi-demo.spec.ts` - @smoke
- [ ] `coi-comprehensive.spec.ts` - @critical
- [ ] `classification-equivalency.spec.ts` - @critical
- [ ] `integration-federation-vs-object.spec.ts` - @critical
- [ ] `comprehensive-identity-validation.spec.ts` - @smoke

#### Task 3.4: Tag Resource Management Tests (1 hour)
**Files to Tag** (5 files):
- [ ] `upload-flow-modern.spec.ts` - @critical
- [ ] `multimedia-playback.spec.ts` - @slow
- [ ] `policies-lab.spec.ts` - @smoke @critical
- [ ] `nato-expansion.spec.ts` - @smoke
- [ ] `idp-management-revamp.spec.ts` - @smoke

#### Task 3.5: Morning Checkpoint (30 min)
- [ ] 20 tests tagged
- [ ] Test scripts work: `npm run test:e2e:smoke`
- [ ] Document tag usage in E2E_TEST_RELIABILITY_AUDIT.md

### Afternoon (4 hours): Test Selective Execution

#### Task 3.6: Test Fast Execution (30 min)
```bash
# Run only fast tests (should be <5 min)
npm run test:e2e:fast

# Verify:
# - Only @fast tagged tests run
# - Duration < 5 minutes
# - All tests pass
```

#### Task 3.7: Test Smoke Execution (1 hour)
```bash
# Run smoke tests (should be <10 min)
npm run test:e2e:smoke

# Verify:
# - Critical path covered
# - Suitable for commit hooks
# - Duration < 10 minutes
```

#### Task 3.8: Test Critical Execution (1 hour)
```bash
# Run critical tests (should be <20 min)
npm run test:e2e:critical

# Verify:
# - All core functionality tested
# - Suitable for PR checks
# - Duration < 20 minutes
```

#### Task 3.9: Test Flaky Execution (1 hour)
```bash
# Run flaky tests with extra retries
npm run test:e2e:flaky

# Verify:
# - Tests retry 3 times
# - Helps isolate root causes
# - Better success rate with retries
```

#### Task 3.10: Day 3 Checkpoint (30 min)
Create summary:
- Tests tagged: 20/63 (32%)
- Selective execution working
- Fast tests: <5 min ✓
- Smoke tests: <10 min ✓
- Next: Consolidate CI jobs (Day 4)

---

## Day 4: Consolidate CI E2E Jobs (8 hours)

### Objective
Merge 4 separate CI jobs into 1 with sharding for faster, more maintainable CI.

### Morning (4 hours): Update CI Workflow

#### Task 4.1: Backup Current Workflow (5 min)
```bash
cp .github/workflows/test-e2e.yml .github/workflows/test-e2e.yml.backup
```

#### Task 4.2: Create New Consolidated Job (2 hours)
Edit `.github/workflows/test-e2e.yml`:

```yaml
jobs:
  e2e-tests:
    name: E2E Tests (Shard ${{ matrix.shard }})
    runs-on: ubuntu-latest
    timeout-minutes: 20  # Reduced from 60 (15 min × 4 jobs)
    
    strategy:
      fail-fast: false
      matrix:
        shard: [1/4, 2/4, 3/4, 4/4]
    
    services:
      mongodb:
        image: mongo:7.0
        ports:
          - 27017:27017
      postgres:
        image: postgres:15
        ports:
          - 5432:5432
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: password
          POSTGRES_DB: dive_v3_app
    
    steps:
      # Reuse existing setup steps (certificates, Keycloak, etc.)
      
      - name: Run E2E Tests with Sharding
        run: |
          cd frontend
          npx playwright test --shard ${{ matrix.shard }}
        env:
          # Reuse existing environment variables
          CI: true
      
      - name: Upload Test Results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-results-shard-${{ matrix.shard }}
          path: |
            frontend/playwright-report/
            frontend/test-results/
          retention-days: 7

  e2e-summary:
    name: E2E Test Summary
    runs-on: ubuntu-latest
    needs: [e2e-tests]
    if: always()
    
    steps:
      - name: Generate Summary
        run: |
          echo "## 🎭 E2E Test Results" >> $GITHUB_STEP_SUMMARY
          echo "All 4 shards completed" >> $GITHUB_STEP_SUMMARY
```

#### Task 4.3: Remove Old Jobs (1 hour)
Delete these jobs from `test-e2e.yml`:
- [ ] `e2e-authentication`
- [ ] `e2e-authorization`
- [ ] `e2e-classification-equivalency`
- [ ] `e2e-resource-management`

Keep only:
- [x] `e2e-tests` (new consolidated job)
- [x] `e2e-summary` (updated)

#### Task 4.4: Test Locally (1 hour)
```bash
# Simulate sharding locally
npx playwright test --shard 1/4
npx playwright test --shard 2/4
npx playwright test --shard 3/4
npx playwright test --shard 4/4

# Verify:
# - Each shard runs different tests
# - Total coverage = all tests
# - No duplication
```

### Afternoon (4 hours): CI Integration & Verification

#### Task 4.5: Commit and Push Changes (15 min)
```bash
git add .github/workflows/test-e2e.yml
git commit -m "test: Consolidate E2E CI jobs - 4 jobs → 1 with sharding

Changes:
- Merge authentication, authorization, classification, resource jobs
- Use Playwright sharding (1/4, 2/4, 3/4, 4/4)
- Reduce duplicate setup (Keycloak, certs, DB)
- Reduce timeout: 60 min → 20 min per shard

Expected impact:
- 75% reduction in setup overhead (32-52 min → 8-13 min)
- Consistent environment across all tests
- Easier maintenance (single workflow)"

git push origin test/week1-day4-consolidate-ci
```

#### Task 4.6: Monitor CI Execution (2 hours)
Watch GitHub Actions run:
- [ ] All 4 shards start simultaneously
- [ ] Each shard completes in <20 min
- [ ] No duplicate setup overhead
- [ ] Tests distributed evenly

**Compare**:
| Metric | Before (4 Jobs) | After (1 Job + Sharding) | Improvement |
|--------|-----------------|--------------------------|-------------|
| Setup Time | ~48 min (4×12) | ~12 min (1×12) | 75% faster |
| Test Time | ~40 min (sequential) | ~15 min (parallel) | 63% faster |
| Total CI | ~88 min | ~27 min | 69% faster |

#### Task 4.7: Fix Any Issues (1.5 hours)
Common issues and fixes:
- Shards timing out: Increase `timeout-minutes`
- Uneven distribution: Check test file sizes
- Duplicate artifacts: Ensure unique names per shard

#### Task 4.8: Day 4 Checkpoint (30 min)
Create summary:
- CI jobs consolidated: 4 → 1 ✓
- Sharding working: 4 parallel shards ✓
- Duration improved: ? % faster
- Setup overhead reduced: 75% ✓
- Next: Fix flaky tests (Day 5)

---

## Day 5: Fix Top 10 Flaky Tests (8 hours)

### Objective
Fix the most problematic flaky tests identified on Day 2.

### Strategy

For each flaky test:
1. Reproduce locally
2. Identify root cause
3. Apply fix pattern
4. Verify fix with multiple runs

### Morning (4 hours): Fix Tests #1-5

#### Common Fix Patterns

**Pattern 1: Increase Timeouts**
```typescript
// Before (15s default)
await page.click('#submit');

// After (30s for Keycloak redirects)
await page.click('#submit', { timeout: 30000 });
```

**Pattern 2: Add Explicit Waits**
```typescript
// Before (no wait)
await page.goto('/dashboard');
await page.click('[data-testid="resource-card"]');

// After (wait for load)
await page.goto('/dashboard');
await page.waitForLoadState('networkidle');
await page.getByTestId('resource-card').waitFor({ state: 'visible' });
await page.click('[data-testid="resource-card"]');
```

**Pattern 3: Improve Selectors**
```typescript
// Before (brittle CSS)
await page.locator('.modal .btn-primary').click();

// After (robust role-based)
await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
```

**Pattern 4: Clear State**
```typescript
// Add to test setup
test.beforeEach(async ({ page, context }) => {
  // Clear cookies
  await context.clearCookies();
  
  // Clear localStorage
  await page.evaluate(() => localStorage.clear());
  
  // Clear sessionStorage
  await page.evaluate(() => sessionStorage.clear());
});
```

#### Task 5.1-5.5: Fix Tests #1-5 (4 hours, ~48 min each)

For each test:
1. **Reproduce** (10 min): Run test 5 times, document failure pattern
2. **Root Cause** (15 min): Use `--debug` flag, inspect selectors/timing
3. **Fix** (15 min): Apply appropriate pattern
4. **Verify** (8 min): Run test 10 times, confirm 100% pass rate

### Afternoon (4 hours): Fix Tests #6-10 + Verification

#### Task 5.6-5.10: Fix Tests #6-10 (3 hours)
Continue same pattern for remaining 5 flaky tests.

#### Task 5.11: Final Verification (30 min)
```bash
# Run all E2E tests 3 times
npm run test:e2e
npm run test:e2e
npm run test:e2e

# Target:
# - Pass rate >95% (from ~80%)
# - Flaky tests <3 (from 10)
# - Duration <25 min (from 50 min)
```

#### Task 5.12: Week 1 Checkpoint (30 min)
Create `docs/testing/WEEK1_COMPLETION_REPORT.md`:

```markdown
# Week 1 Completion Report - E2E Test Reliability

## Success Metrics

| Metric | Baseline | Target | Achieved | Status |
|--------|----------|--------|----------|--------|
| E2E Pass Rate | ~80% | ≥95% | ? % | ✓/✗ |
| E2E Duration | 50 min | <25 min | ? min | ✓/✗ |
| Flaky Tests | 10 | <3 | ? | ✓/✗ |
| CI Setup Overhead | 48 min | <13 min | ? min | ✓/✗ |

## Tests Fixed
1. [Test name] - [Root cause] - [Fix applied]
...

## Tests Remaining
- [Any tests still flaky with <5% failure rate]

## Next Steps (Week 2)
- Begin backend test coverage improvement
- Test 20 critical services to 80% coverage
```

---

## Daily Standup Format

Each morning (9 AM):
- Yesterday's progress
- Today's goals
- Blockers

Each evening (5 PM):
- Completed tasks
- Tomorrow's plan
- Questions/concerns

---

## Success Criteria (End of Week 1)

### Must Have (P0)
- [x] Quick Wins complete (100%)
- [ ] E2E pass rate ≥95%
- [ ] E2E duration <25 min
- [ ] Top 10 flaky tests fixed
- [ ] CI jobs consolidated (4 → 1)
- [ ] Test tags added to 20 tests

### Should Have (P1)
- [ ] All 63 tests tagged
- [ ] Baseline metrics documented
- [ ] Week 1 report completed

### Nice to Have (P2)
- [ ] Selector quality audit started
- [ ] Wait strategy improvements beyond top 10

---

## Troubleshooting

### Issue: Parallel tests failing locally
**Solution**: Check for port conflicts, shared state, race conditions

### Issue: CI slower than expected
**Solution**: Check sharding distribution, increase workers if needed

### Issue: Tests still flaky after fixes
**Solution**: Add more retries, increase timeouts, investigate environment differences

### Issue: Can't reproduce flaky test
**Solution**: Run in CI environment, check logs for timing patterns

---

## Resources

- E2E_TEST_RELIABILITY_AUDIT.md - Detailed test analysis
- COMPREHENSIVE_IMPLEMENTATION_GUIDE.md - Full 12-week plan
- WEEK1_QUICK_WINS_PROGRESS.md - Quick wins completion status
- Playwright docs: https://playwright.dev/docs/test-parallel

---

**Document Owner**: Testing & Quality Team  
**Last Updated**: 2026-02-08  
**Review Frequency**: Daily during Week 1
