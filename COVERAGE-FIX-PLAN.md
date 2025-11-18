# CI/CD Test Coverage Fix Plan

## Problem Statement
GitHub Actions CI/CD pipeline failing due to test coverage below required thresholds.

## Best Practice Approach (NO SHORTCUTS)
✅ Write comprehensive unit tests for all undertested code
✅ Test all edge cases and error paths
✅ Achieve actual coverage, not just lower thresholds
❌ NO lowering coverage thresholds
❌ NO skipping coverage checks
❌ NO using `istanbul ignore` comments

## Coverage Gaps Analysis

### 1. ✅ COMPLETED: compliance-validation.service.ts (1.26% → target 95%)
**Status**: NEW comprehensive test file created with 40+ test cases

**Coverage**:
- ACP-240 compliance checks (all variants)
- STANAG 4774 compliance checks
- STANAG 4778 compliance checks  
- NIST 800-63-3 compliance checks (IAL/AAL/FAL)
- Overall compliance scoring
- Recommendations generation
- Error handling

### 2. ✅ COMPLETED: authz-cache.service.test.ts (87.73% → target 100%)
**Status**: Enhanced with 15+ additional test cases

**Added Coverage**:
- TTL statistics tracking (TOP_SECRET vs SECRET differentiation)
- `pruneExpired()` method
- Error handling in `getCachedDecision()` (try/catch)
- Error handling in `cacheDecision()` (try/catch and failure return)
- Cache event handlers ('flush' event)
- Edge cases in `getDetailedInfo()`
- Classification normalization edge cases

### 3. 🔄 IN PROGRESS: authz.middleware.test.ts (69.33% → target 95%)
**Current**: Large file (1239 lines), needs ~30% more coverage

**Missing Coverage Areas** (identified from code review):
- Error scenarios in `getSigningKey()` when all JWKS URLs fail
- Token blacklist/revocation check branches
- SP (Service Provider) token validation error paths  
- ACR/AMR format variations (numeric vs URN, array vs JSON string)
- Classification equivalency edge cases
- Multi-realm token handling edge cases
- AMR parsing error handling
- Missing required subject attributes
- Various error recovery paths

**Action**: Add 20+ targeted test cases for missing branches

### 4. idp-validation.test.ts (85.41% → target 95%)
**Gap**: ~10% missing coverage

**Likely Missing**:
- Edge cases in validation logic
- Error handling paths
- Boundary conditions
- Complex validation scenarios

**Action**: Review service file and add ~10-15 test cases

### 5. analytics.service.test.ts (90.47% → target 95%)
**Gap**: ~5% missing coverage

**Likely Missing**:
- Error handling in MongoDB operations
- Edge cases in aggregation logic
- Cache invalidation scenarios

**Action**: Add ~5-10 test cases for error paths

### 6. health.service.test.ts (88.8% → target 95%)
**Gap**: ~7% missing coverage

**Likely Missing**:
- Error handling in health checks
- Edge cases in service connectivity checks
- Partial failure scenarios

**Action**: Add ~5-10 test cases

### 7. risk-scoring.test.ts (96.95% → target 100%)
**Gap**: ~3% missing coverage

**Likely Missing**:
- Edge cases in scoring calculations
- Boundary conditions
- Error handling

**Action**: Add ~5 test cases for final edge cases

### 8. Jest Open Handles Issue
**Problem**: "Force exiting Jest: Have you considered using `--detectOpenHandles`"

**Root Cause**: Likely unclosed connections (MongoDB, Redis, HTTP servers)

**Solution**:
- Review `globalTeardown.ts` for proper cleanup
- Ensure all async operations complete
- Add explicit connection closures
- Check for dangling timers/promises

## Implementation Strategy

### Phase 1: Complete Critical Services (IN PROGRESS)
1. ✅ compliance-validation.service.ts (DONE)
2. ✅ authz-cache.service.ts (DONE)
3. 🔄 authz.middleware.ts (IN PROGRESS)
4. idp-validation.test.ts
5. analytics.service.test.ts

### Phase 2: Polish Remaining Services
6. health.service.test.ts
7. risk-scoring.test.ts

### Phase 3: Fix Infrastructure Issues
8. Jest open handles issue
9. Verify all tests pass
10. Run full coverage report

## Expected Outcomes

### Before Fix:
```
Global Coverage:
- Statements: 46.67% ❌
- Branches:   33.77% ❌
- Lines:      46.37% ❌
- Functions:  45.18% ❌
```

### After Fix:
```
Global Coverage:
- Statements: >95% ✅
- Branches:   >95% ✅
- Lines:      >95% ✅
- Functions:  >95% ✅

File-Specific:
- compliance-validation.service.ts: >95% ✅
- authz-cache.service.ts: 100% ✅
- authz.middleware.ts: >95% ✅
- idp-validation.service.ts: >95% ✅
- analytics.service.ts: >95% ✅
- health.service.ts: >95% ✅
- risk-scoring.service.ts: 100% ✅
```

## Success Criteria

✅ All unit tests passing (1509+ tests)
✅ Global coverage ≥95% (all metrics)
✅ File-specific thresholds met
✅ No test timeouts
✅ No open handles warnings
✅ CI/CD pipeline passing (green)
✅ No false positives or test shortcuts
✅ Production-quality test coverage

## Timeline Estimate

- Phase 1: 2-3 hours (authz.middleware + 2 more files)
- Phase 2: 1-2 hours (remaining services)
- Phase 3: 1 hour (infrastructure fixes)
- **Total**: 4-6 hours for complete fix

## Best Practices Followed

1. ✅ Comprehensive test coverage (not superficial)
2. ✅ Test both happy path and error paths
3. ✅ Test edge cases and boundary conditions
4. ✅ Test error handling and recovery
5. ✅ Test with realistic data
6. ✅ Use proper mocking (not shortcuts)
7. ✅ Follow existing test patterns
8. ✅ Document complex test scenarios
9. ✅ Ensure test isolation (beforeEach/afterEach)
10. ✅ Verify tests actually fail when code is broken

## Notes

- This is a **best practice approach** - no shortcuts
- All tests must be meaningful and catch real bugs
- Coverage thresholds stay at 95%/100% (no lowering)
- Jest configuration stays strict (no ignoring)
- This will take time but will result in production-quality coverage
- The extra effort now prevents bugs in production

---

**Next Step**: Continue with authz.middleware.test.ts enhancements, then proceed through remaining files systematically.


