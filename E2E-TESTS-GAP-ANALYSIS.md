# E2E Tests - Gap Analysis & Modernization Plan

**Date:** November 15, 2025  
**Project:** DIVE V3 Coalition ICAM Pilot  
**Status:** 📋 ANALYSIS COMPLETE - Implementation Required

---

## 🎯 Executive Summary

**Total E2E Test Files:** 9  
**Estimated Outdated/Broken:** 7 (78%)  
**Estimated Working:** 2 (22%)  
**Total Scenarios:** ~80+ test cases

**Overall Assessment:** The E2E test suite was built against earlier application architecture and needs comprehensive updates to align with:
1. Current routing structure (Next.js 15 App Router)
2. Refactored components (Identity Drawer, Navigation, Auth flows)
3. Modern authentication patterns (NextAuth v5)
4. Updated API endpoints and structures
5. 2025 best practices (Page Object Model, accessibility, resilience)

---

## 📊 Test Suite Analysis

### ✅ Working (2 files, ~11 tests)

#### 1. `identity-drawer.spec.ts` - ✅ UPDATED & WORKING
**Status:** Recently fixed for certificate issues  
**Test Count:** 1 test  
**Coverage:**
- Cmd+I keyboard shortcut opening drawer

**Issues:**
- ❌ Uses hardcoded BASE_URL (now fixed to use relative paths)
- ✅ Test infrastructure working (certificates resolved)
- ⚠️ Test failing due to feature implementation (drawer not appearing), NOT infrastructure

**Priority:** LOW - Infrastructure fixed, feature test may need minor updates

---

#### 2. `integration-federation-vs-object.spec.ts` - ✅ LIKELY WORKING
**Status:** Modern patterns, likely functional  
**Test Count:** 10 tests  
**Coverage:**
- Split-view navigation
- Flow map interaction
- Glass dashboard (PERMIT/DENY simulations)
- Attribute diff
- Decision replay
- Export functionality
- Spec/feature toggles

**Quality:** HIGH - Uses modern Playwright patterns (`getByRole`, `getByText`)

**Issues:**
- ⚠️ Uses hardcoded `BASE_URL` instead of relative paths
- ⚠️ Should verify route `/integration/federation-vs-object` still exists

**Priority:** LOW - Minor updates for consistency

---

### 🔴 Broken/Outdated (7 files, ~69+ tests)

#### 3. `mfa-conditional.spec.ts` - 🔴 OUTDATED
**Status:** Testing old authentication architecture  
**Test Count:** 6 tests  
**Coverage:**
- Conditional MFA enforcement by clearance
- Direct Grant flow (smoke test)

**Critical Issues:**
1. ❌ **Wrong Auth Flow** - Tests "Custom Login Flow" with Direct Grant
   - Current app uses NextAuth v5 with Keycloak OAuth/SAML federation
   - Direct Grant API (`/realms/dive-v3-usa/protocol/openid-connect/token`) may not be exposed
2. ❌ **Wrong Routes** - Expects custom login pages at `/login/[idpAlias]`
   - Current app has `/login` + `/login/[idpAlias]` but uses NextAuth signIn()
3. ❌ **Hardcoded URLs** - Uses `http://localhost:3000` instead of relative paths
4. ❌ **Wrong Selectors** - Looks for `button:has-text("United States")` which may not exist
5. ❌ **MFA Architecture Changed** - Tests expect OTP field on same login page
   - Current architecture: Keycloak handles MFA, not custom login page

**Estimated Effort:** HIGH - Requires rewrite (8-12 hours)

**Recommendation:** **REWRITE** - Align with NextAuth + Keycloak architecture

---

#### 4. `nato-expansion.spec.ts` - 🔴 OUTDATED
**Status:** Testing older login flows  
**Test Count:** 10+ tests  
**Coverage:**
- 6-nation login flows (DEU, GBR, ITA, ESP, POL, NLD)
- Clearance mapping verification
- Cross-nation document access
- MFA enforcement

**Critical Issues:**
1. ❌ **Hardcoded BASE_URL** - Uses `http://localhost:3000`
2. ❌ **Login Flow Outdated** - Directly navigates to `/login/${idpAlias}` and fills credentials
   - Current: Should use NextAuth signIn() or IdP selector flow
3. ❌ **MFA Setup Assumptions** - Expects "Multi-Factor Authentication Setup" text
   - Current: Keycloak handles MFA, UI may be different
4. ❌ **Wrong Selectors** - `page.locator('[data-testid="user-clearance"]')`
   - Need to verify these data-testids exist in current components
5. ❌ **API Endpoint Assumptions** - `/api/users/profile`, `/api/authorization/check`
   - May not exist or have different structures

**Estimated Effort:** MEDIUM-HIGH - Refactor login helpers, verify endpoints (6-10 hours)

**Recommendation:** **REFACTOR** - Update login flow, verify API endpoints, modernize selectors

---

#### 5. `policies-lab.spec.ts` - 🔴 OUTDATED
**Status:** Testing non-existent feature  
**Test Count:** 10 tests  
**Coverage:**
- Policy upload (Rego/XACML)
- Policy validation
- Policy evaluation
- Policy list/delete
- Rate limiting

**Critical Issues:**
1. ❌ **Route May Not Exist** - Tests `/policies/lab` route
   - NOT FOUND in current app directory structure
   - Feature may have been removed or relocated
2. ❌ **Hardcoded BASE_URL** - Uses `http://localhost:3000`
3. ❌ **Complex Login Flow** - Custom `loginIfNeeded()` with Keycloak redirects
   - Should use modern auth helper pattern
4. ❌ **File Upload API** - Assumes specific backend endpoints for policy upload
   - Endpoints may not exist

**Estimated Effort:** HIGH - Feature verification required, possible full rewrite (8-16 hours)

**Recommendation:** **INVESTIGATE** - Verify if Policies Lab feature exists, then decide rewrite vs delete

---

#### 6. `external-idp-federation-flow.spec.ts` - 🔴 OUTDATED
**Status:** Testing outdated federation architecture  
**Test Count:** 8+ tests  
**Coverage:**
- Spain SAML login flow
- USA OIDC login flow
- Resource access authorization
- Logout and session cleanup

**Critical Issues:**
1. ❌ **Hardcoded URLs** - Uses `DIVE_URL`, `SPAIN_SAML_URL`, `USA_OIDC_URL`
2. ❌ **Wrong Login Flow** - Expects `button:has-text("Login")` then IdP selection
   - Current: IdP selector is on home page, not behind login button
3. ❌ **SAML/OIDC Direct Navigation** - Tests expect external IdP URLs
   - Current: NextAuth abstracts this, tests should not interact with IdPs directly
4. ❌ **Profile Page Assumptions** - `text=Profile`, `text=Clearance: ${clearance}`
   - Profile UI may have changed
5. ❌ **Resources Route** - Tests `/resources` page which exists, but UI may differ

**Estimated Effort:** MEDIUM-HIGH - Rewrite login flows, verify resource page (6-10 hours)

**Recommendation:** **REFACTOR** - Modernize to use NextAuth patterns, verify UI selectors

---

#### 7. `idp-management-revamp.spec.ts` - 🔴 PARTIALLY OUTDATED
**Status:** Testing admin features with fallbacks  
**Test Count:** 10 tests  
**Coverage:**
- IdP management page load
- Session management
- MFA configuration
- Theme customization
- Custom login pages
- Language toggle
- Command palette (Cmd+K)
- Analytics drill-down
- Batch operations

**Critical Issues:**
1. ❌ **Hardcoded BASE_URL** - Uses `process.env.NEXT_PUBLIC_BASE_URL`
2. ❌ **Wrong Auth Route** - `/auth/signin` does not exist (should be `/login`)
3. ⚠️ **Admin Routes** - Tests `/admin/idp`, `/admin/analytics`
   - ✅ These routes DO exist based on search results
4. ⚠️ **Defensive Tests** - Many `.catch()` fallbacks suggest tests were written before features
5. ❌ **Data Test IDs** - `[data-testid="idp-card"]` may not exist
6. ✅ **Good Patterns** - Uses `test.step()` for clarity

**Estimated Effort:** MEDIUM - Update selectors, verify admin features exist (4-8 hours)

**Recommendation:** **REFACTOR** - Update auth flow, harden selectors, remove defensive catches

---

#### 8. `classification-equivalency.spec.ts` - 🔴 OUTDATED
**Status:** Mock authentication approach needs update  
**Test Count:** 4+ tests (described, not fully shown)  
**Coverage:**
- German GEHEIM document upload
- French user accessing German docs
- US CONFIDENTIAL denial scenarios
- Canadian compliance dashboard (12×4 matrix)

**Critical Issues:**
1. ❌ **Mock JWT Authentication** - Tests create mock JWTs manually
   - This bypasses real authentication, not true E2E
   - Should use actual Keycloak login flow or test API endpoints
2. ❌ **Hardcoded BASE_URL** - Uses `http://localhost:3000`
3. ❌ **Upload API Unknown** - Assumes `/api/resources/upload` endpoint
   - Need to verify if this exists
4. ❌ **Session Cookie Manipulation** - Directly sets `next-auth.session-token`
   - Fragile approach, should use proper auth helpers

**Estimated Effort:** HIGH - Requires real authentication flow (8-12 hours)

**Recommendation:** **REWRITE** - Use real Keycloak login, verify API endpoints, modernize patterns

---

#### 9. `mfa-complete-flow.spec.ts` - 🔴 OUTDATED
**Status:** Testing Keycloak-direct OTP flows  
**Test Count:** 11 tests  
**Coverage:**
- New user OTP setup
- Returning user with MFA
- UNCLASSIFIED user (no MFA)
- Invalid/empty OTP
- Rate limiting
- UX: Remaining attempts warning
- Accessibility
- Performance metrics

**Critical Issues:**
1. ❌ **Direct Keycloak Navigation** - Tests navigate to `/login/${idpAlias}` and interact directly
   - Should use NextAuth abstraction
2. ❌ **Hardcoded BASE_URL** - Uses `http://localhost:3000`
3. ❌ **OTP Setup UI Assumptions** - Looks for specific text: "Multi-Factor Authentication Setup Required"
   - Keycloak handles this, UI may be different or non-existent in app
4. ❌ **speakeasy Library** - Generates TOTP codes, but Keycloak's OTP flow may differ
5. ❌ **Manual Secret Extraction** - `extractSecretFromManualEntry()` assumes specific HTML structure

**Estimated Effort:** HIGH - Requires understanding Keycloak MFA flow (8-12 hours)

**Recommendation:** **REFACTOR** - Align with Keycloak MFA architecture, or mark as integration test

---

## 📋 Common Issues Across All Tests

### 1. **BASE_URL Pattern (9/9 files affected)**
**Problem:** Hardcoded `BASE_URL` constants instead of using Playwright's `baseURL`

**Current (Bad):**
```typescript
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
await page.goto(`${BASE_URL}/login`);
```

**Should Be (Good):**
```typescript
// No BASE_URL constant needed
await page.goto('/login'); // Playwright prepends baseURL from config
```

**Fix:** Global search-replace pattern

---

### 2. **Authentication Architecture Mismatch (7/9 files affected)**
**Problem:** Tests assume direct login form interaction, but app uses NextAuth v5 + Keycloak

**Current App Flow:**
1. Home page (`/`) has IdP selector
2. Click IdP button → NextAuth signIn() with provider
3. Redirects to Keycloak (external)
4. Keycloak authenticates + handles MFA
5. Redirects back to app with session

**Test Anti-Patterns:**
- Directly filling username/password on `/login/[idpAlias]`
- Assuming custom OTP fields in app
- Mock JWT creation

**Fix:** Create standardized auth helper using NextAuth patterns

---

### 3. **Selectors Need Modernization (8/9 files affected)**
**Problem:** Fragile selectors that may break with UI updates

**Anti-Patterns:**
```typescript
// Text selectors (fragile)
await page.click('button:has-text("Sign In")');
await page.locator('text=Multi-Factor Authentication Setup');

// CSS classes (fragile)
await page.locator('.border.rounded-lg').first();

// Unverified data-testids
await page.locator('[data-testid="user-clearance"]');
```

**Best Practices (2025):**
```typescript
// Semantic roles (resilient)
await page.getByRole('button', { name: 'Sign In' });
await page.getByRole('heading', { name: /Dashboard/i });

// Labels (accessible)
await page.getByLabel('Username');
await page.getByPlaceholder('Enter your OTP');

// Test IDs (when necessary)
await page.getByTestId('user-clearance'); // Requires adding data-testid to components
```

**Fix:** Audit and update selectors, add data-testids to key components

---

### 4. **Missing Page Object Model (9/9 files affected)**
**Problem:** Tests directly interact with page, duplicating login/navigation logic

**Current:**
```typescript
// Repeated in every test
await page.goto(`${BASE_URL}/login`);
await page.fill('input[type="text"]', 'username');
await page.fill('input[type="password"]', 'password');
await page.click('button[type="submit"]');
```

**Best Practice (POM):**
```typescript
// e2e/pages/LoginPage.ts
export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  async loginAs(username: string, password: string) {
    await this.page.getByLabel('Username').fill(username);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Sign In' }).click();
    await this.page.waitForURL('/dashboard');
  }
}

// In test
const loginPage = new LoginPage(page);
await loginPage.goto();
await loginPage.loginAs('testuser', 'password');
```

**Fix:** Create page objects for: Login, Dashboard, Resources, Admin

---

### 5. **No Test Data Management (9/9 files affected)**
**Problem:** Hardcoded test users in each file, no centralized test data

**Current:**
```typescript
// Duplicated in multiple files
const TEST_USER_USERNAME = 'testuser-us';
const TEST_USER_PASSWORD = 'password';
```

**Best Practice:**
```typescript
// e2e/fixtures/test-users.ts
export const TEST_USERS = {
  US_SECRET: {
    username: 'testuser-us',
    password: process.env.TEST_USER_PASSWORD || 'Password123!',
    clearance: 'SECRET',
    country: 'USA'
  },
  // ... other users
} as const;

// e2e/fixtures/test-resources.ts
export const TEST_RESOURCES = {
  NATO_COSMIC_DOC: {
    id: 'test-doc-001',
    classification: 'SECRET',
    releasabilityTo: ['USA', 'FRA', 'DEU']
  }
} as const;
```

**Fix:** Create fixtures directory with centralized test data

---

### 6. **Insufficient Error Handling & Debugging (9/9 files affected)**
**Problem:** Tests fail without clear error messages

**Anti-Pattern:**
```typescript
await page.click('button:has-text("Sign In")');
// No wait, no error context
```

**Best Practice:**
```typescript
try {
  await page.getByRole('button', { name: 'Sign In' }).click({ timeout: 5000 });
  await page.waitForURL('/dashboard', { timeout: 10000 });
} catch (error) {
  console.error(`Login failed. Current URL: ${page.url()}`);
  await page.screenshot({ path: 'test-results/login-failure.png' });
  throw error;
}
```

**Fix:** Add explicit waits, better error messages, automatic screenshots

---

## 🎯 Modernization Strategy (2025 Best Practices)

### Phase 1: Infrastructure & Patterns (Week 1)

#### 1.1 Create Testing Foundation
**Files to Create:**
```
frontend/src/__tests__/e2e/
├── fixtures/
│   ├── test-users.ts           # Centralized test users
│   ├── test-resources.ts       # Sample documents
│   └── test-config.ts          # Environment config
├── pages/
│   ├── LoginPage.ts            # Page Object: Login
│   ├── DashboardPage.ts        # Page Object: Dashboard
│   ├── ResourcesPage.ts        # Page Object: Resources
│   └── AdminPage.ts            # Page Object: Admin
├── helpers/
│   ├── auth.ts                 # Authentication helpers
│   ├── api.ts                  # API testing helpers
│   └── assertions.ts           # Custom assertions
└── playwright-global-setup.ts  # Global test setup
```

**Estimated Time:** 8-12 hours

---

#### 1.2 Create Authentication Helper
**File:** `frontend/src/__tests__/e2e/helpers/auth.ts`

```typescript
import { Page } from '@playwright/test';
import { TEST_USERS } from '../fixtures/test-users';

/**
 * Login via NextAuth using IdP selector
 * Works with Keycloak-backed authentication
 */
export async function loginAs(page: Page, userKey: keyof typeof TEST_USERS) {
  const user = TEST_USERS[userKey];

  // Go to home page
  await page.goto('/');

  // Select IdP (e.g., "USA DoD Login")
  await page.getByRole('button', { name: new RegExp(user.idp, 'i') }).click();

  // NextAuth will redirect to Keycloak
  await page.waitForURL(/.*keycloak.*/i, { timeout: 10000 });

  // Fill Keycloak form
  await page.getByLabel(/username|email/i).fill(user.username);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();

  // Wait for redirect back to app
  await page.waitForURL('/dashboard', { timeout: 15000 });

  // Verify session established
  await page.getByTestId('user-menu').waitFor({ state: 'visible', timeout: 5000 });
}

/**
 * Logout and clear session
 */
export async function logout(page: Page) {
  await page.goto('/api/auth/signout');
  await page.getByRole('button', { name: /sign out/i }).click();
  await page.waitForURL('/', { timeout: 5000 });
}
```

**Estimated Time:** 4 hours

---

#### 1.3 Create Page Objects
**Example:** `frontend/src/__tests__/e2e/pages/ResourcesPage.ts`

```typescript
import { Page, expect, Locator } from '@playwright/test';

export class ResourcesPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly resourceCards: Locator;
  readonly filterButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /resources/i });
    this.searchInput = page.getByPlaceholder(/search resources/i);
    this.resourceCards = page.getByTestId('resource-card');
    this.filterButton = page.getByRole('button', { name: /filter/i });
  }

  async goto() {
    await this.page.goto('/resources');
    await this.heading.waitFor({ state: 'visible', timeout: 5000 });
  }

  async searchFor(query: string) {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(500); // Debounce
  }

  async getResourceCount(): Promise<number> {
    return await this.resourceCards.count();
  }

  async clickResource(index: number) {
    await this.resourceCards.nth(index).click();
  }

  async filterByClassification(classification: string) {
    await this.filterButton.click();
    await this.page.getByRole('checkbox', { name: classification }).check();
    await this.page.getByRole('button', { name: /apply/i }).click();
  }
}
```

**Estimated Time:** 3-4 hours per page object (4 pages = 12-16 hours)

---

### Phase 2: Refactor Existing Tests (Week 2-3)

#### Priority 1: Core User Flows (High Value, High Impact)
1. **Authentication Flow** (6-8 hours)
   - Login via all IdPs (USA, FRA, CAN, DEU, GBR, ITA, ESP, POL, NLD, Industry)
   - Logout and session cleanup
   - Session persistence across page reloads

2. **Resource Access** (8-10 hours)
   - View resources list
   - Search and filter
   - View resource details
   - Authorization checks (ALLOW/DENY)

3. **Identity & Profile** (4-6 hours)
   - Identity drawer (Cmd+I)
   - User profile page
   - Display of clearance, country, COI

---

#### Priority 2: Admin Features (Medium Value, High Complexity)
4. **IdP Management** (6-8 hours)
   - Refactor `idp-management-revamp.spec.ts`
   - Update selectors to match current UI
   - Verify session management features

5. **Dashboard & Analytics** (4-6 hours)
   - Admin dashboard navigation
   - Real-time metrics
   - Drill-down interactions

---

#### Priority 3: Advanced Features (Medium Value, Medium Complexity)
6. **Classification Equivalency** (8-10 hours)
   - Rewrite `classification-equivalency.spec.ts`
   - Use real authentication (not mocks)
   - Cross-nation document access scenarios

7. **MFA Flows** (10-12 hours)
   - Investigate current MFA architecture (Keycloak-managed vs app-managed)
   - Rewrite or delete `mfa-conditional.spec.ts` and `mfa-complete-flow.spec.ts`
   - Test conditional MFA by clearance level

---

#### Priority 4: Specialized Features (Low Value, High Risk of Non-Existence)
8. **Policies Lab** (4-16 hours - depends on feature existence)
   - **INVESTIGATE FIRST:** Does `/policies/lab` route exist?
   - If YES: Refactor `policies-lab.spec.ts` (8-12 hours)
   - If NO: Delete test file (1 hour)

9. **NATO Expansion** (6-8 hours)
   - Refactor `nato-expansion.spec.ts`
   - Update login flows for 6 nations
   - Verify clearance mapping

10. **External IdP Federation** (6-8 hours)
    - Refactor `external-idp-federation-flow.spec.ts`
    - Align with NextAuth patterns
    - Test SAML (Spain) and OIDC (USA) flows

---

### Phase 3: New Test Coverage (Week 4)

#### Add Missing Critical Scenarios
1. **Security Edge Cases**
   - Expired session handling
   - Invalid token rejection
   - CSRF protection
   - Rate limiting

2. **Accessibility (A11y)**
   - Keyboard navigation
   - Screen reader compatibility
   - ARIA attributes
   - Focus management

3. **Performance**
   - Page load times (< 2s)
   - API response times (< 500ms)
   - Resource list rendering (< 1s for 100 items)

4. **Error Handling**
   - Network failures
   - Backend errors (500, 503)
   - Invalid input handling
   - Graceful degradation

---

## 📊 Estimated Effort Summary

| Phase | Tasks | Estimated Hours | Priority |
|-------|-------|-----------------|----------|
| **Phase 1: Infrastructure** | Page Objects, Helpers, Fixtures | 24-32 hours | 🔴 HIGH |
| **Phase 2: Refactor (P1)** | Auth, Resources, Identity | 18-24 hours | 🔴 HIGH |
| **Phase 2: Refactor (P2)** | Admin Features | 10-14 hours | 🟡 MEDIUM |
| **Phase 2: Refactor (P3)** | Advanced Features | 24-34 hours | 🟡 MEDIUM |
| **Phase 2: Refactor (P4)** | Specialized Features | 16-32 hours | 🟢 LOW |
| **Phase 3: New Coverage** | Security, A11y, Performance | 12-20 hours | 🟡 MEDIUM |
| **TOTAL** | All Phases | **104-156 hours** | - |

**Realistic Timeline:** 3-4 weeks (1 engineer full-time)

---

## 🎯 Immediate Action Items (Next 3 Days)

### Day 1: Investigation & Planning
1. ✅ Complete gap analysis (DONE - this document)
2. ⏳ **Audit current app routes** - Verify which pages exist
   ```bash
   # List all Next.js routes
   find frontend/src/app -name "page.tsx" -o -name "page.ts"
   ```
3. ⏳ **Verify API endpoints** - Check which backend endpoints exist
   ```bash
   # Search for API route handlers
   grep -r "app.get\|app.post" backend/src/
   ```
4. ⏳ **Test user verification** - Confirm which Keycloak users are seeded
5. ⏳ **Create decision matrix** - Which tests to refactor, rewrite, or delete

### Day 2: Infrastructure Setup
1. ⏳ Create `fixtures/` directory with test data
2. ⏳ Create `helpers/auth.ts` with standardized login helper
3. ⏳ Create `helpers/api.ts` for API testing
4. ⏳ Create first page object (`LoginPage.ts`)
5. ⏳ Write 1 example test using new patterns

### Day 3: Pilot Refactor
1. ⏳ Refactor 1 complete test file (e.g., `identity-drawer.spec.ts`)
2. ⏳ Document new patterns in README
3. ⏳ Run refactored test locally and in CI
4. ⏳ Get team approval on approach
5. ⏳ Proceed with Phase 2

---

## 📚 2025 Best Practices Checklist

Apply these standards to ALL refactored tests:

### ✅ Code Quality
- [ ] Use Page Object Model (POM) for all page interactions
- [ ] Use semantic selectors (`getByRole`, `getByLabel`) over CSS/XPath
- [ ] Add `data-testid` attributes to key components (submit sparingly)
- [ ] Extract magic strings to constants
- [ ] Use TypeScript strict mode
- [ ] Add JSDoc comments to helper functions

### ✅ Reliability
- [ ] Use explicit waits (`waitForURL`, `waitForSelector`)
- [ ] Add retry logic for flaky operations
- [ ] Use `test.step()` for complex scenarios
- [ ] Avoid `waitForTimeout()` (use smart waits)
- [ ] Handle loading states explicitly
- [ ] Test error boundaries

### ✅ Maintainability
- [ ] Centralize test data in fixtures
- [ ] Reuse authentication helpers
- [ ] Follow consistent naming conventions
- [ ] Use relative paths (no hardcoded BASE_URL)
- [ ] Add descriptive test names
- [ ] Group related tests with `test.describe()`

### ✅ Accessibility
- [ ] Test keyboard navigation (Tab, Enter, Escape)
- [ ] Verify ARIA attributes
- [ ] Test with screen reader (axe-playwright)
- [ ] Check color contrast
- [ ] Verify focus indicators

### ✅ Performance
- [ ] Measure page load times
- [ ] Track API response times
- [ ] Use `page.waitForLoadState('networkidle')`
- [ ] Minimize test execution time (parallel where possible)

### ✅ CI/CD Integration
- [ ] Tests pass in GitHub Actions
- [ ] Artifacts uploaded on failure (screenshots, videos, traces)
- [ ] Retry failed tests (2x in CI)
- [ ] Generate HTML report
- [ ] Slack/email notifications on failure

---

## 🚨 Critical Decisions Needed

### 1. **Policies Lab Feature**
**Question:** Does `/policies/lab` feature exist in current app?  
**Impact:** 10 tests (~16 hours potential effort)  
**Action:** Investigate before refactoring

### 2. **MFA Architecture**
**Question:** Is MFA handled entirely by Keycloak or does app have custom UI?  
**Impact:** 17 tests (~24 hours potential effort)  
**Action:** Review Keycloak configuration and app auth flow

### 3. **Test User Management**
**Question:** Are test users seeded automatically or need manual setup?  
**Impact:** All tests  
**Action:** Document user setup process, create seed script if needed

### 4. **API Endpoint Availability**
**Question:** Which backend API endpoints are actually implemented?  
**Impact:** ~30 tests that call APIs directly  
**Action:** Audit backend routes, update API documentation

---

## 📖 Reference Materials

### Documentation to Create
1. **E2E Testing Guide** - How to write/run E2E tests
2. **Page Object Library Docs** - API reference for page objects
3. **Test Data Management** - How to add/update fixtures
4. **Debugging Guide** - How to debug failing tests
5. **CI/CD Pipeline Docs** - How E2E tests run in GitHub Actions

### Training Resources
- [Playwright Best Practices 2025](https://playwright.dev/docs/best-practices)
- [Page Object Model](https://playwright.dev/docs/pom)
- [Accessibility Testing](https://playwright.dev/docs/accessibility-testing)
- [Test Fixtures](https://playwright.dev/docs/test-fixtures)

---

## 🏆 Success Criteria

### Phase 1 Complete When:
- [ ] Page Object Model implemented for 4 key pages
- [ ] Authentication helper working for all IdPs
- [ ] Test fixtures created and documented
- [ ] 1 pilot test refactored and passing

### Phase 2 Complete When:
- [ ] All Priority 1 tests refactored and passing (auth, resources, identity)
- [ ] All Priority 2 tests refactored and passing (admin features)
- [ ] 50%+ of Priority 3/4 tests refactored or deleted

### Phase 3 Complete When:
- [ ] New test coverage added (security, a11y, performance)
- [ ] E2E Testing Guide published
- [ ] CI/CD pipeline optimized (< 15 min total runtime)
- [ ] 80%+ test pass rate in CI

### Overall Success:
- [ ] **60+ passing E2E tests** (up from ~2 currently)
- [ ] **< 5% flakiness rate** (tests pass consistently)
- [ ] **< 15 min CI execution** (for fast feedback)
- [ ] **Well-documented patterns** (easy for team to add new tests)
- [ ] **Confidence in deployments** (E2E tests catch regressions)

---

## 📞 Next Steps

**Immediate (Today):**
1. Review this gap analysis with team
2. Get approval to proceed with refactoring
3. Assign ownership of phases
4. Schedule kickoff meeting

**Short Term (Week 1):**
1. Complete Day 1-3 action items
2. Create infrastructure (fixtures, helpers, page objects)
3. Refactor 1 pilot test file
4. Document new patterns

**Medium Term (Weeks 2-4):**
1. Refactor Priority 1-2 tests
2. Investigate Priority 3-4 features
3. Add new test coverage
4. Optimize CI/CD pipeline

---

**Prepared by:** Claude (AI Assistant)  
**Project:** DIVE V3 - Coalition ICAM Pilot  
**Repository:** https://github.com/albeach/DIVE-V3  
**Last Updated:** November 15, 2025


