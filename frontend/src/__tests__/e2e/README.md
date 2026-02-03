# E2E Testing Infrastructure - Modern Patterns (2025)

**Last Updated:** November 16, 2025
**Status:** ✅ Infrastructure Complete - Ready for Test Refactoring

---

## 📚 Table of Contents

1. [Overview](#overview)
2. [Directory Structure](#directory-structure)
3. [Quick Start](#quick-start)
4. [Core Concepts](#core-concepts)
5. [Writing Tests](#writing-tests)
6. [Best Practices](#best-practices)
7. [Common Patterns](#common-patterns)
8. [Troubleshooting](#troubleshooting)

---

## Overview

This directory contains the E2E test suite for DIVE V3, built using modern Playwright patterns (2025 best practices). The infrastructure provides:

- **Centralized Test Data** - Fixtures for users, resources, and configuration
- **Authentication Helpers** - NextAuth v5 + Keycloak support
- **Page Object Model** - Reusable page interactions
- **Semantic Selectors** - Accessible, resilient selectors
- **Type Safety** - Full TypeScript support

---

## Directory Structure

```
frontend/src/__tests__/e2e/
├── fixtures/
│   ├── test-users.ts          # 44 test users across 11 IdPs
│   ├── test-resources.ts      # 11 test documents with scenarios
│   └── test-config.ts         # Environment config & timeouts
├── helpers/
│   └── auth.ts                # loginAs(), logout(), isLoggedIn()
├── pages/
│   ├── LoginPage.ts           # IdP selector interactions
│   ├── DashboardPage.ts       # Dashboard & user info
│   └── ResourcesPage.ts       # Resources list & detail pages
├── pilot-modern-test.spec.ts  # Example using new patterns
└── README.md                  # This file
```

---

## Quick Start

### Run Pilot Test

```bash
# Start services first (required)
docker-compose up -d

# Run the pilot test (demonstrates new patterns)
npm run test:e2e -- pilot-modern-test.spec.ts

# Run in headed mode (see browser)
npm run test:e2e -- pilot-modern-test.spec.ts --headed

# Run in debug mode (Playwright Inspector)
npm run test:e2e -- pilot-modern-test.spec.ts --debug

# Run tests specifically in localhost mode
npm run test:e2e:localhost -- pilot-modern-test.spec.ts
```

### Write Your First Test

```typescript
import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';
import { TEST_RESOURCES } from './fixtures/test-resources';
import { loginAs, logout } from './helpers/auth';
import { ResourcesPage } from './pages/ResourcesPage';

test('User can access authorized resources', async ({ page }) => {
  // Login
  await loginAs(page, TEST_USERS.USA.SECRET);

  // Navigate & interact
  const resources = new ResourcesPage(page);
  await resources.goto();
  await resources.verifyResourceAccessible(TEST_RESOURCES.SECRET.FVEY.resourceId);

  // Cleanup
  await logout(page);
});
```

---

## Core Concepts

### 1. Fixtures - Centralized Test Data

**Purpose:** Avoid hardcoded values; reuse test data across tests

#### Test Users (`fixtures/test-users.ts`)

```typescript
import { TEST_USERS } from './fixtures/test-users';

// Access specific user by level (1=UNCLASS, 2=CONF, 3=SECRET, 4=TS)
const user = TEST_USERS.USA.LEVEL_3;
console.log(user.username);     // "testuser-usa-3"
console.log(user.clearance);    // "SECRET"
console.log(user.countryCode);  // "USA"
console.log(user.coi);          // ["NATO"]

// Helper functions
getUsersByClearance('SECRET');  // All SECRET users
getUsersByLevel(3);             // All level 3 (SECRET) users
getUsersByCountry('USA');       // All USA users
getUsersWithoutMFA();           // Users with no MFA (for quick tests)
```

**Available Users:**
- 4 countries: USA, FRA, DEU, GBR (+ INDUSTRY)
- 4 clearance levels per country: 1=UNCLASSIFIED, 2=CONFIDENTIAL, 3=SECRET, 4=TOP_SECRET
- User pattern: `testuser-{country}-{level}` (e.g., `testuser-usa-3`)
- Password: `TestUser2025!Pilot`

#### Test Resources (`fixtures/test-resources.ts`)

```typescript
import { TEST_RESOURCES } from './fixtures/test-resources';

// Access specific resource
const fveyDoc = TEST_RESOURCES.SECRET.FVEY;
console.log(fveyDoc.resourceId);        // "test-secret-fvey"
console.log(fveyDoc.classification);    // "SECRET"
console.log(fveyDoc.releasabilityTo);   // ["USA", "GBR", "CAN", "AUS", "NZL"]

// Helper functions
getResourcesByClearance('SECRET');        // All SECRET resources
getResourcesReleasableTo('USA');          // Resources USA can access
getResourcesByCOI('FVEY');                // Resources with FVEY COI
```

**Available Resources:**
- 1 UNCLASSIFIED
- 6 SECRET (USA-only, FVEY, NATO, Bilateral, etc.)
- 1 TOP_SECRET (USA-only)

#### Test Configuration (`fixtures/test-config.ts`)

```typescript
import { TEST_CONFIG } from './fixtures/test-config';

// Timeouts (CI-aware: 2x longer in CI)
await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.ACTION);      // 5s local, 10s CI
await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.AUTH_FLOW);   // 20s local, 40s CI

// Selectors (centralized data-testids)
await page.locator(TEST_CONFIG.SELECTORS.USER_MENU).click();
await page.locator(TEST_CONFIG.SELECTORS.RESOURCE_CARD).first().click();

// Feature flags
if (TEST_CONFIG.FEATURES.MFA_TESTS) {
  // Run MFA tests only if enabled
}

// API endpoints
await page.goto(TEST_CONFIG.API_ENDPOINTS.RESOURCES_LIST);
```

---

### 2. Helpers - Reusable Functions

#### Authentication (`helpers/auth.ts`)

```typescript
import { loginAs, logout, isLoggedIn } from './helpers/auth';
import { TEST_USERS } from './fixtures/test-users';

// Login (handles NextAuth + Keycloak redirect)
await loginAs(page, TEST_USERS.USA.SECRET);

// Login with OTP (for CONFIDENTIAL/SECRET users)
await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });

// Logout (clears session)
await logout(page);

// Check if logged in
if (await isLoggedIn(page)) {
  console.log('User is logged in');
}

// Login only if needed
await loginIfNeeded(page, TEST_USERS.USA.SECRET);
```

**What `loginAs()` does:**
1. Navigate to home page
2. Click IdP selector button
3. Wait for Keycloak redirect
4. Fill username & password
5. Handle MFA if required (OTP/WebAuthn)
6. Wait for redirect to app
7. Verify session established

---

### 3. Page Objects - Encapsulated Interactions

#### LoginPage

```typescript
import { LoginPage } from './pages/LoginPage';

const loginPage = new LoginPage(page);
await loginPage.gotoHome();
await loginPage.selectIdP('United States DoD');
await loginPage.verifyIdPSelectorVisible();
```

#### DashboardPage

```typescript
import { DashboardPage } from './pages/DashboardPage';

const dashboard = new DashboardPage(page);
await dashboard.goto();
await dashboard.verifyLoggedIn();
await dashboard.verifyUserInfo('testuser-usa-3', 'SECRET', 'USA');
await dashboard.openIdentityDrawer();
await dashboard.goToResources();
```

#### ResourcesPage

```typescript
import { ResourcesPage } from './pages/ResourcesPage';

const resources = new ResourcesPage(page);
await resources.goto();
await resources.searchFor('FVEY');
await resources.filterByClassification('SECRET');
await resources.clickResource(0);
await resources.verifyResourceAccessible('test-secret-fvey');
await resources.verifyResourceDenied('test-secret-usa');
```

---

## Writing Tests

### Test Structure (Use `test.step()`)

```typescript
test('User can access authorized resources', async ({ page }) => {
  test.step('Login as USA SECRET user', async () => {
    await loginAs(page, TEST_USERS.USA.SECRET);
  });

  test.step('Navigate to resources page', async () => {
    const resources = new ResourcesPage(page);
    await resources.goto();
    await resources.verifyResourcesDisplayed();
  });

  test.step('Access FVEY document - expect ALLOW', async () => {
    const resources = new ResourcesPage(page);
    await resources.verifyResourceAccessible(TEST_RESOURCES.SECRET.FVEY.resourceId);
  });

  test.step('Logout', async () => {
    await logout(page);
  });
});
```

### Hooks (Setup & Teardown)

```typescript
test.describe('Resource Access Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Setup before each test
    console.log('Starting test...');
  });

  test.afterEach(async ({ page }) => {
    // Cleanup after each test
    await logout(page);
  });
});
```

---

## Best Practices

### ✅ DO

1. **Use Fixtures** - Import from `fixtures/` instead of hardcoding
   ```typescript
   // ✅ Good
   await loginAs(page, TEST_USERS.USA.SECRET);

   // ❌ Bad
   const user = { username: 'testuser-usa-3', password: 'Password123!' };
   ```

2. **Use Page Objects** - Encapsulate page interactions
   ```typescript
   // ✅ Good
   const resources = new ResourcesPage(page);
   await resources.goto();

   // ❌ Bad
   await page.goto('/resources');
   ```

3. **Use Semantic Selectors** - Prefer `getByRole`, `getByLabel`, `getByText`
   ```typescript
   // ✅ Good
   await page.getByRole('button', { name: 'Sign In' }).click();

   // ❌ Bad
   await page.click('button.submit-btn');
   ```

4. **Use Relative Paths** - Let Playwright handle base URL
   ```typescript
   // ✅ Good
   await page.goto('/resources');

   // ❌ Bad
   await page.goto('http://localhost:3000/resources');
   ```

5. **Use Explicit Waits** - Wait for specific conditions
   ```typescript
   // ✅ Good
   await page.getByRole('button', { name: 'Submit' }).waitFor({ state: 'visible' });

   // ❌ Bad
   await page.waitForTimeout(5000);
   ```

6. **Use test.step()** - Organize complex tests
   ```typescript
   // ✅ Good
   test.step('Login', async () => { ... });
   test.step('Navigate', async () => { ... });

   // ❌ Bad
   // ... single flat test with no steps
   ```

---

### ❌ DON'T

1. **Hardcode URLs** - Use relative paths or config
2. **Hardcode User Credentials** - Use fixtures
3. **Use Arbitrary Timeouts** - Use explicit waits
4. **Use CSS/XPath Selectors** - Use semantic selectors
5. **Duplicate Login Logic** - Use `loginAs()` helper
6. **Ignore Errors** - Add try/catch with screenshots

---

## Common Patterns

### Pattern 1: Login → Navigate → Verify

```typescript
test('User can view dashboard', async ({ page }) => {
  // Login
  await loginAs(page, TEST_USERS.USA.SECRET);

  // Navigate
  const dashboard = new DashboardPage(page);
  await dashboard.goto();

  // Verify
  await dashboard.verifyLoggedIn();
  await dashboard.verifyUserInfo('testuser-usa-3', 'SECRET', 'USA');
});
```

### Pattern 2: Test Authorization Decisions

```typescript
test('France user denied access to FVEY document', async ({ page }) => {
  await loginAs(page, TEST_USERS.FRA.SECRET);

  const resources = new ResourcesPage(page);
  await resources.verifyResourceDenied(TEST_RESOURCES.SECRET.FVEY.resourceId);

  // Verify denial reason
  const reason = page.getByText(/country|releasability/i);
  await expect(reason).toBeVisible();
});
```

### Pattern 3: Multi-User Scenarios

```typescript
test('Different users see different resources', async ({ page }) => {
  // USA user
  await loginAs(page, TEST_USERS.USA.SECRET);
  const resources1 = new ResourcesPage(page);
  await resources1.goto();
  const usaCount = await resources1.getResourceCount();
  await logout(page);

  // France user
  await loginAs(page, TEST_USERS.FRA.SECRET);
  const resources2 = new ResourcesPage(page);
  await resources2.goto();
  const fraCount = await resources2.getResourceCount();
  await logout(page);

  // USA should see more (FVEY documents)
  expect(usaCount).toBeGreaterThan(fraCount);
});
```

### Pattern 4: Error Handling with Screenshots

```typescript
test('Handle login failures gracefully', async ({ page }) => {
  try {
    await loginAs(page, TEST_USERS.USA.SECRET);
  } catch (error) {
    // Screenshot is already taken by loginAs() on failure
    console.error('Login failed:', error);
    throw error;
  }
});
```

---

## Troubleshooting

### Issue: Test times out during login

**Solution:** Increase auth flow timeout or check Keycloak availability
```typescript
// In test-config.ts
TIMEOUTS.AUTH_FLOW: 40000  // Increase if Keycloak is slow
```

### Issue: Selectors not found

**Solution:** Use Playwright Inspector to debug selectors
```bash
npm run test:e2e -- pilot-modern-test.spec.ts --debug
```

### Issue: MFA tests failing

**Solution:** Check if `ENABLE_MFA_TESTS` is disabled in config
```typescript
// In test-config.ts
FEATURES.MFA_TESTS: false  // Disable MFA tests if not configured
```

### Issue: Test fails in CI but passes locally

**Solution:** CI timeouts are 2x longer - check network issues
```typescript
// TEST_CONFIG automatically adjusts for CI
TEST_ENV.IS_CI  // true in CI, false locally
```

### Issue: Playwright tests can't run on localhost (HTTPS/certificate issues)

**Root Cause:** Playwright configuration was set up for Cloudflare tunnel mode by default, not localhost HTTPS development.

**Solutions:**

1. **Use localhost mode explicitly:**
   ```bash
   # Run tests in localhost mode
   npm run test:e2e:localhost -- pilot-modern-test.spec.ts

   # Or set environment variable
   BASE_URL=https://localhost:3000 npm run test:e2e -- pilot-modern-test.spec.ts
   ```

2. **Ensure services are running:**
   ```bash
   # Start all services with HTTPS certificates
   docker-compose up -d

   # Verify frontend is accessible
   curl -k https://localhost:3000
   ```

3. **Certificate issues:**
   - Tests use `ignoreHTTPSErrors: true` to accept mkcert certificates
   - Additional browser args handle certificate validation
   - If issues persist, check mkcert installation and trust

4. **Environment detection:**
   ```typescript
   // Playwright config now detects:
   process.env.CI ? 'Cloudflare tunnel' : 'localhost HTTPS'
   // Override with: BASE_URL=https://localhost:3000
   ```

### Issue: Browser context errors during logout

**Root Cause:** Browser context becomes invalid during test cleanup.

**Solution:** Tests now have improved error handling with fallback logout methods that gracefully handle context issues.

### Issue: Resource not found

**Solution:** Verify resource is seeded by globalSetup.ts
```bash
# Check if test data is seeded
npm run test:e2e -- --grep "can access" --headed
```

---

## Hub-Spoke Architecture Testing Strategies

### Strategy 1: Instance-Specific Testing
```bash
# Test hub instance only
npm run test:e2e:hub

# Test specific spoke instances
npm run test:e2e:spoke

# Test all instances in sequence
npm run test:e2e:all-instances
```

### Strategy 2: Cross-Instance Federation Testing
```bash
# Test federation features across instances
npm run test:e2e:federation

# Test with real federation URLs
HUB_FRONTEND_URL=https://hub.dive25.com \
FRA_FRONTEND_URL=https://fra.dive25.com \
npm run test:e2e:federation
```

### Strategy 3: Parallel Multi-Instance Testing
```typescript
// playwright.config.ts - Parallel projects
projects: [
  { name: 'hub', baseURL: 'http://localhost:3000' },
  { name: 'fra', baseURL: 'http://localhost:3025' },
  { name: 'gbr', baseURL: 'http://localhost:3003' },
]
```

### Strategy 4: Dynamic Instance Selection
```typescript
// Test that can run against any instance
const instanceUrl = process.env.INSTANCE_URL || 'http://localhost:3000';
const instanceName = process.env.INSTANCE_NAME || 'Unknown';

test.describe(`Instance: ${instanceName} (${instanceUrl})`, () => {
  test.use({ baseURL: instanceUrl });

  test('works on any instance', async ({ page }) => {
    // Test logic here - automatically adapts to instance
  });
});
```

### Strategy 5: CLI-Driven Test Orchestration
```bash
# Start hub and test it
./dive hub up
npm run test:e2e:hub

# Start FRA spoke and test it
./dive --instance fra spoke up
FRA_FRONTEND_URL=http://localhost:3025 npm run test:e2e -- --project=spoke-fra-chromium

# Test federation between instances
./dive federation test
```

### Strategy 6: Environment-Based Configuration
```typescript
// test-config.ts - Environment-aware URLs
export const INSTANCE_CONFIG = {
  hub: {
    frontend: process.env.HUB_FRONTEND_URL || 'http://localhost:3000',
    backend: process.env.HUB_BACKEND_URL || 'http://localhost:4000',
    name: 'DIVE Hub'
  },
  fra: {
    frontend: process.env.FRA_FRONTEND_URL || 'http://localhost:3025',
    backend: process.env.FRA_BACKEND_URL || 'http://localhost:4025',
    name: 'France Spoke'
  }
};

export const CURRENT_INSTANCE = INSTANCE_CONFIG[process.env.DIVE_INSTANCE || 'hub'];
```

---

## Next Steps

1. ✅ **Infrastructure Complete** - Fixtures, helpers, page objects ready
2. ⏳ **Refactor Existing Tests** - Apply new patterns to 7 broken tests
3. ⏳ **Add New Coverage** - Security, accessibility, performance tests
4. 🆕 **Hub-Spoke Testing** - Multi-instance test orchestration

**Refactoring Priority:**
1. `identity-drawer.spec.ts` - Update to use new auth helper
2. `integration-federation-vs-object.spec.ts` - Minor fixes
3. `mfa-conditional.spec.ts` - Rewrite with Keycloak MFA flow
4. `nato-expansion.spec.ts` - Refactor login flows
5. `policies-lab.spec.ts` - Refactor with new patterns

---

## Resources

- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Page Object Model](https://playwright.dev/docs/pom)
- [Accessibility Testing](https://playwright.dev/docs/accessibility-testing)
- [DIVE V3 E2E Gap Analysis](../../E2E-TESTS-GAP-ANALYSIS.md)
- [Day 1 Investigation Findings](../../E2E-DAY1-INVESTIGATION-FINDINGS.md)

---

**Created:** November 16, 2025
**Last Updated:** November 16, 2025
**Status:** ✅ Ready for Use
