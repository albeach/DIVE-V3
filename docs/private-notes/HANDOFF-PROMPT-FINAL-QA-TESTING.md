# DIVE V3 - Comprehensive QA, Integration Testing & Production Deployment Prompt

## Context & Current State

You are working on **DIVE V3** (Digital Identity Verification Environment), a coalition-friendly ICAM web application demonstrating federated identity management with policy-driven ABAC authorization. The project has successfully completed **Policies Lab feature development** and **OPA Rego v1 migration** but requires comprehensive QA testing, integration verification, and production deployment preparation.

### Recent Completed Work (October 26, 2025)

1. **OPA Rego v1 Migration** ✅ COMPLETE
   - Upgraded OPA from v0.68.0 → v1.9.0 (latest)
   - Multi-architecture support (ARM64/AMD64) configured
   - Fixed 6 Rego v1 syntax issues in 4 policy files
   - OPA responding to queries (7 policies loaded)
   - See: `OPA-REGO-V1-MIGRATION-COMPLETE.md`

2. **Policies Lab Backend** ✅ COMPLETE
   - 9/9 integration tests passing
   - Policy upload, validation, evaluation (Rego + XACML)
   - OPA + AuthzForce integration working
   - See: `POLICIES-LAB-FINAL-STATUS.md`, `CHANGELOG.md` lines 1-400

3. **Keycloak Health Check** ✅ FIXED
   - Changed endpoint from `/health/ready` → `/realms/master`
   - Keycloak 26.0.7 responding correctly

### Current System Status
- **8/8 Docker services operational**
- **Backend API:** Responding (port 4000)
- **Frontend:** Rendering (port 3000)
- **OPA:** v1.9.0, policies loaded, health responding
- **Keycloak:** v26.0.7, realms accessible
- **MongoDB, Postgres, Redis, AuthzForce:** All operational

## Outstanding Critical Tasks

### Priority 1: Integration Tests with Real Services (NO MOCKS)
**Current State:** Backend integration tests use mocked OPA/AuthzForce responses  
**Issue:** Real service integration not verified in automated tests  
**Impact:** HIGH - Production reliability unknown  
**Location:** `backend/src/__tests__/policies-lab.integration.test.ts`

**Required Actions:**
1. Create new test suite: `backend/src/__tests__/policies-lab-real-services.integration.test.ts`
2. Remove all `jest.mock('../services/*)` and `jest.mock('axios')` 
3. Start real OPA container on port 8181
4. Start real AuthzForce container on port 8282
5. Test full policy lifecycle:
   - Upload Rego → Real OPA validation
   - Evaluate Rego → Real OPA query (`/v1/data/dive/lab/...`)
   - Upload XACML → Real AuthzForce validation
   - Evaluate XACML → Real AuthzForce PDP call
6. Verify response structures match expectations
7. Test error scenarios (OPA down, AuthzForce unavailable)
8. Document results in `INTEGRATION-TESTS-REAL-SERVICES-REPORT.md`

**Files to Reference:**
- `backend/src/services/policy-execution.service.ts` - Real OPA/AuthzForce calls
- `backend/src/adapters/xacml-adapter.ts` - XACML request/response handling
- `docker-compose.yml` - Service configuration

### Priority 2: CI/CD Pipeline Verification
**Current State:** GitHub Actions workflow exists but not locally verified  
**Issue:** CI/CD may fail on push  
**Impact:** MEDIUM - Deployment blocked if CI fails  
**Location:** `.github/workflows/policies-lab-ci.yml`

**Required Actions:**
1. Install `act` (GitHub Actions local runner): `brew install act`
2. Run workflow locally: `act -j test-backend`
3. Verify all jobs pass:
   - ✅ AuthzForce starts and becomes healthy
   - ✅ Backend tests pass
   - ✅ Test coverage reports generated
   - ✅ Trivy security scan passes
4. If failures occur:
   - Fix workflow configuration
   - Update service health checks
   - Adjust timeout values
5. Push to GitHub and verify Actions tab shows green
6. Document results in `CI-CD-VERIFICATION-REPORT.md`

**Files to Reference:**
- `.github/workflows/policies-lab-ci.yml` - Workflow definition
- `docker-compose.yml` - Local service configuration for comparison

### Priority 3: Frontend Jest Configuration & Unit Tests
**Current State:** Jest not installed, test files exist but can't run  
**Issue:** Frontend unit tests skipped (120+ tests)  
**Impact:** MEDIUM - Frontend regressions not caught  
**Location:** `frontend/src/__tests__/components/policies-lab/`

**Required Actions:**
1. Install dependencies:
   ```bash
   cd frontend
   npm install --save-dev jest @testing-library/react @testing-library/jest-dom @testing-library/user-event jest-environment-jsdom
   ```
2. Create `frontend/jest.config.js`:
   ```javascript
   module.exports = {
     testEnvironment: 'jsdom',
     setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
     moduleNameMapper: {
       '^@/(.*)$': '<rootDir>/src/$1',
       '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
     },
     transform: {
       '^.+\\.(ts|tsx)$': ['@swc/jest', { jsc: { parser: { syntax: 'typescript', tsx: true } } }],
     },
   };
   ```
3. Create `frontend/jest.setup.js`:
   ```javascript
   import '@testing-library/jest-dom';
   ```
4. Update `frontend/package.json`:
   ```json
   "scripts": {
     "test": "jest",
     "test:watch": "jest --watch",
     "test:coverage": "jest --coverage"
   }
   ```
5. Run tests: `npm test`
6. Fix any failures in:
   - `PolicyUpload.test.tsx`
   - `PolicyEditor.test.tsx`
   - `PolicyComparison.test.tsx`
   - `EvaluationPanel.test.tsx`
   - `DecisionTrace.test.tsx`
7. Target: 80%+ test coverage
8. Document results in `FRONTEND-JEST-SETUP-REPORT.md`

**Files to Reference:**
- `frontend/src/__tests__/components/policies-lab/*.test.tsx` - Existing test files
- `frontend/package.json` - Dependencies

### Priority 4: E2E Test Authentication Flow
**Current State:** E2E tests fail at login (Keycloak auth flow incomplete)  
**Issue:** Tests try direct email/password but app uses Keycloak IdP flow  
**Impact:** MEDIUM - E2E automation blocked  
**Location:** `frontend/src/__tests__/e2e/policies-lab.spec.ts`

**Required Actions:**
1. Fix `loginIfNeeded()` helper in E2E tests:
   ```typescript
   async function loginIfNeeded(page: Page) {
     const isLoggedIn = await page.locator('[data-testid="user-menu"]').isVisible().catch(() => false);
     
     if (!isLoggedIn) {
       // Navigate with IdP hint
       await page.goto(`${BASE_URL}/login?idp=us-idp`);
       
       // Click sign-in button (triggers Keycloak redirect)
       await page.click('text=Sign in with', { timeout: 10000 });
       
       // Wait for Keycloak
       await page.waitForURL(/.*keycloak.*/, { timeout: 15000 });
       
       // Fill Keycloak credentials
       await page.fill('#username', 'testuser-us');
       await page.fill('#password', 'password123');
       await page.click('#kc-login');
       
       // Wait for redirect back
       await page.waitForURL(/.*localhost:3000.*/, { timeout: 15000 });
       await page.waitForTimeout(2000);
     }
   }
   ```
2. Verify Keycloak test users exist:
   - Check `terraform/keycloak/dive-v3-usa/users.tf`
   - Ensure `testuser-us` has proper attributes
3. Run E2E tests: `npm run test:e2e`
4. Fix any remaining failures
5. Add E2E tests to CI/CD pipeline
6. Document results in `E2E-AUTHENTICATION-FIX-REPORT.md`

**Files to Reference:**
- `frontend/src/__tests__/e2e/policies-lab.spec.ts` - E2E test suite
- `frontend/src/__tests__/e2e/idp-management-revamp.spec.ts` - Working auth example

### Priority 5: Documentation Updates & Git Commit
**Current State:** Multiple completion reports exist, need consolidation  
**Issue:** CHANGELOG, README, implementation plan need updates  
**Impact:** HIGH - Project state unclear for future work  

**Required Actions:**
1. **Update CHANGELOG.md:**
   - Add OPA Rego v1 Migration entry (after line 400)
   - Add Integration Testing Results entry
   - Add CI/CD Verification entry
   - Mark Policies Lab as "✅ PRODUCTION DEPLOYED" (if all tests pass)

2. **Update README.md:**
   - Update "Current Status" section
   - Update "Getting Started" with new OPA version
   - Add "Testing" section with all test commands
   - Update "Deployment" section

3. **Update Implementation Plan:**
   - Mark completed tasks as ✅
   - Update Week 4 status
   - Add post-deployment tasks

4. **Create Final QA Report:**
   - Consolidate all test results
   - Include integration, CI/CD, E2E, frontend tests
   - Performance metrics from all test suites
   - Known issues and mitigations
   - Sign-off for production deployment
   - File: `FINAL-PRODUCTION-QA-REPORT.md`

5. **Git Commit Strategy:**
   ```bash
   # Stage all changes
   git add .
   
   # Commit with detailed message
   git commit -m "feat(qa): Complete comprehensive QA testing and OPA v1.9.0 migration
   
   - Upgraded OPA to v1.9.0 with Rego v1 syntax compliance
   - Fixed 6 policy files for Rego v1 compatibility
   - Integration tests with real OPA/AuthzForce (X/X passing)
   - CI/CD pipeline verified and passing
   - Frontend Jest configured (120+ tests passing)
   - E2E authentication flow fixed (10/10 scenarios passing)
   - All 8 Docker services operational and healthy
   
   BREAKING CHANGE: OPA policies now require Rego v1 syntax
   
   Closes #XX (Policies Lab)
   Closes #XX (OPA Migration)
   Closes #XX (QA Testing)"
   
   # Push to feature branch
   git push origin feature/policies-lab-qa-complete
   
   # Create PR with comprehensive description
   ```

6. **Create GitHub PR:**
   - Title: "[READY FOR MERGE] Policies Lab: Complete QA Testing & OPA v1.9.0 Migration"
   - Description: Include all test results, screenshots, performance metrics
   - Attach: `FINAL-PRODUCTION-QA-REPORT.md`
   - Request review from: Team Lead

## Project Directory Structure

```
DIVE-V3/
├── .github/
│   └── workflows/
│       ├── policies-lab-ci.yml          # CI/CD workflow to verify
│       └── main.yml                     # Existing workflows
├── backend/
│   ├── src/
│   │   ├── __tests__/
│   │   │   ├── policies-lab.integration.test.ts        # Current (mocked)
│   │   │   ├── policies-lab-real-services.test.ts     # NEW: Real integration
│   │   │   ├── policy-execution.service.test.ts
│   │   │   ├── policy-validation.service.test.ts
│   │   │   └── xacml-adapter.test.ts
│   │   ├── controllers/
│   │   │   └── policies-lab.controller.ts
│   │   ├── services/
│   │   │   ├── policy-execution.service.ts    # Real OPA/AuthzForce calls
│   │   │   ├── policy-lab.service.ts
│   │   │   └── policy-validation.service.ts
│   │   ├── adapters/
│   │   │   └── xacml-adapter.ts                # XACML conversion
│   │   ├── routes/
│   │   │   └── policies-lab.routes.ts
│   │   └── types/
│   │       └── policies-lab.types.ts
│   ├── Dockerfile.dev
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── __tests__/
│   │   │   ├── components/
│   │   │   │   └── policies-lab/
│   │   │   │       ├── PolicyUpload.test.tsx       # Need Jest config
│   │   │   │       ├── PolicyEditor.test.tsx
│   │   │   │       ├── PolicyComparison.test.tsx
│   │   │   │       ├── EvaluationPanel.test.tsx
│   │   │   │       └── DecisionTrace.test.tsx
│   │   │   └── e2e/
│   │   │       ├── policies-lab.spec.ts            # Need auth fix
│   │   │       └── idp-management-revamp.spec.ts   # Working example
│   │   ├── app/
│   │   │   └── policies/
│   │   │       └── lab/
│   │   └── components/
│   │       └── policies-lab/
│   ├── jest.config.js           # NEW: Create this
│   ├── jest.setup.js            # NEW: Create this
│   ├── package.json
│   ├── playwright.config.ts
│   └── tsconfig.json
├── policies/
│   ├── federation_abac_policy.rego          # ✅ Rego v1 compliant
│   ├── object_abac_policy.rego              # ✅ Rego v1 compliant
│   ├── fuel_inventory_abac_policy.rego      # ✅ Rego v1 compliant
│   ├── admin_authorization_policy.rego      # ✅ Rego v1 compliant
│   └── uploads/                              # User-uploaded policies
├── authzforce/
│   ├── conf/
│   └── data/
├── keycloak/
│   ├── Dockerfile
│   ├── certs/
│   └── themes/
├── terraform/
│   └── keycloak/
│       └── dive-v3-usa/
│           └── users.tf                      # Test users
├── docker-compose.yml                        # ✅ OPA v1.9.0, health checks fixed
├── CHANGELOG.md                              # Update with final results
├── README.md                                 # Update with new instructions
├── OPA-REGO-V1-MIGRATION-COMPLETE.md        # Recent completion report
├── POLICIES-LAB-FINAL-STATUS.md             # Recent completion report
└── FINAL-PRODUCTION-QA-REPORT.md            # NEW: Create comprehensive report
```

## Key Documentation References

### Project Specifications
1. **`docs/dive-v3-requirements.md`** - Overall project requirements
2. **`docs/dive-v3-backend.md`** - Backend architecture and API specs
3. **`docs/dive-v3-frontend.md`** - Frontend architecture and components
4. **`docs/dive-v3-security.md`** - Security requirements and threat model
5. **`docs/dive-v3-techStack.md`** - Technology stack and versions
6. **`docs/policies-lab-implementation.md`** - Policies Lab detailed spec

### Recent Completion Reports
1. **`OPA-REGO-V1-MIGRATION-COMPLETE.md`** - OPA upgrade details and issues resolved
2. **`POLICIES-LAB-FINAL-STATUS.md`** - Backend integration test results
3. **`POLICIES-LAB-FINAL-QA-REPORT.md`** - Initial QA report (backend only)
4. **`CHANGELOG.md` lines 1-400** - Feature description and backend completion

### Resource Material
1. **`resources/mpe-experiment-main/`** - Reference OPA policy patterns
2. **`resources/keycloak-react-main/`** - Next.js + Keycloak integration examples
3. **OPA Documentation:** https://www.openpolicyagent.org/docs/latest/
4. **Rego v1 Migration:** https://www.openpolicyagent.org/docs/v0-upgrade
5. **AuthzForce Documentation:** https://authzforce-ce-fiware.readthedocs.io/

### Testing Frameworks
1. **Jest:** https://jestjs.io/docs/getting-started
2. **React Testing Library:** https://testing-library.com/docs/react-testing-library/intro/
3. **Playwright:** https://playwright.dev/docs/intro
4. **Supertest:** https://github.com/visionmedia/supertest
5. **MongoDB Memory Server:** https://github.com/nodkz/mongodb-memory-server

## Specific Test Commands

### Backend Tests
```bash
# Current mocked tests
cd backend && npm test -- policies-lab.integration.test.ts

# NEW: Real service integration
cd backend && npm test -- policies-lab-real-services.test.ts

# All backend tests
cd backend && npm test

# With coverage
cd backend && npm test -- --coverage
```

### Frontend Tests
```bash
# After Jest setup
cd frontend && npm test

# Specific test file
cd frontend && npm test -- PolicyUpload.test.tsx

# With coverage
cd frontend && npm test -- --coverage

# Watch mode
cd frontend && npm test:watch
```

### E2E Tests
```bash
# After auth fix
cd frontend && npm run test:e2e

# Specific spec
cd frontend && npx playwright test policies-lab.spec.ts

# Debug mode
cd frontend && npx playwright test --debug

# UI mode
cd frontend && npx playwright test --ui
```

### CI/CD Local Testing
```bash
# Install act
brew install act

# Run backend tests job
act -j test-backend

# Run full workflow
act push

# Specific event
act pull_request
```

### Service Health Checks
```bash
# OPA
curl http://localhost:8181/health
curl http://localhost:8181/v1/policies

# Keycloak
curl http://localhost:8081/realms/master

# AuthzForce
curl http://localhost:8282/authzforce-ce/

# Backend
curl http://localhost:4000/api/health

# Frontend
curl http://localhost:3000/
```

## Success Criteria

### Integration Tests (Real Services)
- [ ] All OPA integration tests passing (upload, validate, evaluate)
- [ ] All AuthzForce integration tests passing
- [ ] Error scenarios handled (service down, timeout)
- [ ] Performance: p95 < 200ms for policy evaluation
- [ ] Documentation: Results documented in report

### CI/CD Pipeline
- [ ] `act` runs successfully locally
- [ ] GitHub Actions workflow passes on push
- [ ] All jobs green (test, lint, security scan)
- [ ] Test coverage reports generated
- [ ] No security vulnerabilities found

### Frontend Testing
- [ ] Jest configured and running
- [ ] All 120+ component tests passing
- [ ] Test coverage > 80%
- [ ] No console errors in tests
- [ ] Documentation: Setup guide created

### E2E Testing
- [ ] Authentication flow working
- [ ] All 10 Playwright scenarios passing
- [ ] No flaky tests
- [ ] Screenshots on failure
- [ ] Documentation: Auth flow documented

### Documentation & Deployment
- [ ] CHANGELOG.md updated
- [ ] README.md updated with test instructions
- [ ] FINAL-PRODUCTION-QA-REPORT.md created
- [ ] All changes committed with detailed message
- [ ] PR created with comprehensive description
- [ ] Production deployment checklist complete

## Important Notes

1. **Systematic Approach:** Work through priorities 1-5 sequentially. Don't skip ahead.

2. **Best Practices:**
   - Write tests that fail first, then make them pass
   - Use meaningful test descriptions
   - Clean up after tests (delete test data)
   - Document all assumptions
   - No shortcuts - verify everything

3. **Real Services Testing:**
   - Start Docker services before tests
   - Wait for health checks to pass
   - Use `beforeAll()` to verify connectivity
   - Use `afterAll()` to cleanup test data

4. **Performance Monitoring:**
   - Log latency for each operation
   - Target: p95 < 200ms
   - Alert if p95 > 500ms

5. **Error Handling:**
   - Test happy path AND error scenarios
   - Verify proper HTTP status codes
   - Check error message clarity
   - Ensure no sensitive data in errors

6. **Security:**
   - Never commit secrets
   - Use test users only
   - Verify JWT validation
   - Check authorization on all endpoints

7. **Git Workflow:**
   - Create feature branch
   - Make atomic commits
   - Write descriptive commit messages
   - Create PR with checklist
   - Request review before merge

## Your Mission

Complete all 5 priorities systematically:
1. ✅ Create integration tests with real OPA/AuthzForce (no mocks)
2. ✅ Verify CI/CD pipeline with `act` and GitHub Actions
3. ✅ Configure Jest and run all frontend unit tests
4. ✅ Fix E2E authentication flow and verify all scenarios pass
5. ✅ Update all documentation and create comprehensive production QA report

After completion, create a detailed PR for final review and production deployment approval.

**Work systematically. No shortcuts. Verify everything. Document thoroughly.**

Good luck! 🚀



