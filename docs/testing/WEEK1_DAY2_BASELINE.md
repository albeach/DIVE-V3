# Week 1 Day 2 Baseline - E2E Test Inventory

**Date**: 2026-02-08  
**Objective**: Document current E2E test suite before parallel execution testing

---

## Test Suite Overview

**Total E2E Tests**: 52 spec files (in frontend/src/__tests__/e2e/)  
**Configuration**: 
- Parallel: `fullyParallel: true`
- Workers: 2 (local), 4 (CI)
- Timeout: 30000ms (increased from 15000ms)
- Browser Projects: 5 (reduced from 15)

---

## Test Categories

### Authentication Tests (9 files)
- auth-confirmed-frontend.spec.ts
- auth-discovery.spec.ts
- mfa-complete-flow.spec.ts
- mfa-conditional.spec.ts
- external-idp-federation-flow.spec.ts
- webauthn-aal3-flow.spec.ts
- federation-acr-amr.spec.ts
- session-lifecycle.spec.ts
- all-test-users.spec.ts

### Authorization Tests (6 files)
- identity-drawer.spec.ts
- coi-demo.spec.ts
- coi-comprehensive.spec.ts
- classification-equivalency.spec.ts
- integration-federation-vs-object.spec.ts
- comprehensive-identity-validation.spec.ts

### Federation Tests (8 files)
- federated-search-multi-instance.spec.ts
- federation-workflows.spec.ts
- federated-attribute-sync.spec.ts
- federation-authentication-flow.spec.ts
- remote-instance-setup.spec.ts
- complete-user-journey.spec.ts
- [+ tests/e2e/federation/*.spec.ts]

### Resource Management Tests (7 files)
- upload-flow-modern.spec.ts
- multimedia-playback.spec.ts
- policies-lab.spec.ts
- nato-expansion.spec.ts
- idp-management-revamp.spec.ts
- kas-integration-flow.spec.ts
- [+ tests/e2e/sp-registry.spec.ts]

### Dynamic Instance Tests (22 files)
- dynamic/hub/*.spec.ts (5 files)
- dynamic/gbr/*.spec.ts (2 files)
- dynamic/rou/*.spec.ts (2 files)
- dynamic/dnk/*.spec.ts (2 files)
- dynamic/alb/*.spec.ts (2 files)
- dynamic/health-check.spec.ts
- dynamic/diagnostic.spec.ts
- dynamic/auth-investigation.spec.ts

---

## Configuration Changes (Week 1 Quick Wins)

### Before (Sequential)
- `fullyParallel: false`
- `workers: 1`
- `timeout: 15000ms`
- Browser projects: 15 (3 browsers × 5 project types)
- Expected CI duration: 45-60 minutes

### After (Parallel)
- `fullyParallel: true` ✅
- `workers: process.env.CI ? 4 : 2` ✅
- `timeout: 30000ms` ✅
- Browser projects: 5 (Chromium only)
- Expected CI duration: 20-25 minutes (50-58% faster)

---

## Testing Plan

### Phase 1: CI Verification (This Branch)
1. Trigger CI with new parallel configuration
2. Monitor execution across 4 workers
3. Measure actual CI duration
4. Identify any race conditions or flaky tests

### Phase 2: Analysis
1. Compare CI duration to baseline (45-60 min)
2. Calculate actual improvement percentage
3. Document flaky tests identified
4. Create prioritized fix list

### Phase 3: Next Steps
Based on CI results:
- If <5% flakiness → Proceed to Day 3 (test tagging)
- If >5% flakiness → Fix critical issues, re-test

---

## Success Criteria

- [ ] CI completes successfully (no crashes)
- [ ] Duration <30 minutes (target: 20-25 min)
- [ ] Pass rate >90% (target: 95%+)
- [ ] Flaky tests identified and documented
- [ ] No obvious race conditions

---

## CI Workflow Monitored

`.github/workflows/test-e2e.yml`:
- 4 separate jobs (authentication, authorization, classification, resource)
- Each job runs subset of tests sequentially
- **Note**: Day 4 will consolidate these into 1 job with sharding

---

**Created**: 2026-02-08  
**Branch**: test/week1-day2-parallel-verification  
**CI Run**: [To be filled after push]
