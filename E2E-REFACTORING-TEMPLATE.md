# E2E Test Refactoring Template

**Date:** November 16, 2025  
**Purpose:** Step-by-step guide for refactoring old E2E tests with new patterns

---

## 📋 Pre-Refactoring Checklist

Before starting, verify:
- [ ] Test file identified (e.g., `mfa-conditional.spec.ts`)
- [ ] Test file read and understood
- [ ] Required routes exist (check `E2E-DAY1-INVESTIGATION-FINDINGS.md`)
- [ ] Required APIs exist (check findings document)
- [ ] Test users available (check `fixtures/test-users.ts`)
- [ ] Decision made: REFACTOR or REWRITE?

---

## 🔄 Refactoring Steps

### Step 1: Add Modern Imports

**Before:**
```typescript
import { test, expect } from '@playwright/test';

// Maybe some hardcoded values
const BASE_URL = 'http://localhost:3000';
const TEST_USER = 'testuser-us';
```

**After:**
```typescript
import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';
import { TEST_RESOURCES } from './fixtures/test-resources';
import { TEST_CONFIG } from './fixtures/test-config';
import { loginAs, logout } from './helpers/auth';
import { DashboardPage } from './pages/DashboardPage';
import { ResourcesPage } from './pages/ResourcesPage';
import { LoginPage } from './pages/LoginPage';
```

---

### Step 2: Update File Header Comment

**Before:**
```typescript
// No comment or minimal comment
```

**After:**
```typescript
/**
 * [Test Name] E2E Test (REFACTORED - Modern Patterns)
 * 
 * [Brief description of what the test covers]
 * 
 * REFACTORED: November 16, 2025
 * - ✅ Uses centralized test users (fixtures/test-users.ts)
 * - ✅ Uses authentication helper (helpers/auth.ts)
 * - ✅ Uses Page Object Model (pages/*)
 * - ✅ Uses test.step() for clarity
 * - ✅ Proper cleanup (logout)
 * - ✅ Explicit waits (no arbitrary timeouts)
 * - ✅ Semantic selectors (getByRole, getByLabel, getByText)
 */
```

---

### Step 3: Replace Hardcoded URLs

**Before:**
```typescript
const BASE_URL = 'http://localhost:3000';
await page.goto(`${BASE_URL}/resources`);
```

**After:**
```typescript
// Use relative path - Playwright prepends baseURL from config
await page.goto('/resources');
```

---

### Step 4: Replace Custom Login Logic

**Before:**
```typescript
async function loginAs(page, username, password) {
  await page.goto('/login');
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);
}

// In test
await loginAs(page, 'testuser-us', 'password');
```

**After:**
```typescript
// Just use the helper
import { loginAs } from './helpers/auth';
import { TEST_USERS } from './fixtures/test-users';

await loginAs(page, TEST_USERS.USA.SECRET);
```

---

### Step 5: Add Proper Cleanup

**Before:**
```typescript
test('my test', async ({ page }) => {
  // ... test code
  // No cleanup
});
```

**After:**
```typescript
test.describe('My Test Suite', () => {
  test.afterEach(async ({ page }) => {
    try {
      await logout(page);
    } catch (error) {
      console.log('⚠️ Logout failed (may already be logged out):', error);
    }
  });
  
  test('my test', async ({ page }) => {
    // ... test code
  });
});
```

---

### Step 6: Replace Arbitrary Timeouts

**Before:**
```typescript
await page.click('button');
await page.waitForTimeout(5000); // Arbitrary wait
```

**After:**
```typescript
import { TEST_CONFIG } from './fixtures/test-config';

await page.getByRole('button', { name: 'Submit' }).click();
await page.waitForURL('/dashboard', { 
  timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION 
});

// Or use explicit element wait
await page.getByText('Success').waitFor({ 
  state: 'visible', 
  timeout: TEST_CONFIG.TIMEOUTS.ACTION 
});
```

---

### Step 7: Modernize Selectors

**Before (Fragile):**
```typescript
await page.click('button:has-text("Sign In")');
await page.fill('input[type="text"]', 'username');
await page.locator('.submit-button').click();
await page.locator('#user-menu').click();
```

**After (Semantic):**
```typescript
await page.getByRole('button', { name: 'Sign In' }).click();
await page.getByLabel('Username').fill('username');
await page.getByRole('button', { name: 'Submit' }).click();
await page.getByTestId('user-menu').click();
```

---

### Step 8: Use Page Objects

**Before:**
```typescript
await page.goto('/resources');
await page.fill('[data-testid="search"]', 'NATO');
await page.click('[data-testid="resource-card"]:first-child');
```

**After:**
```typescript
import { ResourcesPage } from './pages/ResourcesPage';

const resources = new ResourcesPage(page);
await resources.goto();
await resources.searchFor('NATO');
await resources.clickResource(0);
```

---

### Step 9: Use test.step() for Clarity

**Before:**
```typescript
test('user can access resources', async ({ page }) => {
  // Login
  await loginAs(page, TEST_USERS.USA.SECRET);
  
  // Navigate
  await page.goto('/resources');
  
  // Verify
  await expect(page.getByText('Resources')).toBeVisible();
});
```

**After:**
```typescript
test('user can access resources', async ({ page }) => {
  test.step('Login as USA SECRET user', async () => {
    await loginAs(page, TEST_USERS.USA.SECRET);
  });
  
  test.step('Navigate to resources page', async () => {
    const resources = new ResourcesPage(page);
    await resources.goto();
  });
  
  test.step('Verify resources are displayed', async () => {
    const resources = new ResourcesPage(page);
    await resources.verifyResourcesDisplayed();
  });
});
```

---

### Step 10: Replace Hardcoded Test Data

**Before:**
```typescript
const testUser = {
  username: 'testuser-us-secret',
  password: 'Password123!',
  clearance: 'SECRET',
  country: 'USA'
};

const testResource = {
  id: 'test-secret-fvey',
  classification: 'SECRET',
  releasabilityTo: ['USA', 'GBR', 'CAN']
};
```

**After:**
```typescript
import { TEST_USERS } from './fixtures/test-users';
import { TEST_RESOURCES } from './fixtures/test-resources';

// Access pre-defined users and resources
const user = TEST_USERS.USA.SECRET;
const resource = TEST_RESOURCES.SECRET.FVEY;
```

---

## 📝 Complete Refactoring Example

### Before (Old Pattern)

```typescript
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

async function login(page, username, password) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button:has-text("Sign In")');
  await page.waitForTimeout(5000);
}

test('user can view resources', async ({ page }) => {
  await login(page, 'testuser-us-secret', 'Password123!');
  await page.goto(`${BASE_URL}/resources`);
  await page.waitForTimeout(2000);
  
  const title = await page.locator('h1').textContent();
  expect(title).toContain('Resources');
  
  await page.click('.resource-card:first-child');
  await page.waitForTimeout(1000);
  
  const content = page.locator('.resource-content');
  await expect(content).toBeVisible();
});
```

### After (New Pattern)

```typescript
/**
 * Resources E2E Test (REFACTORED - Modern Patterns)
 * 
 * Tests resource list, search, and access control
 * 
 * REFACTORED: November 16, 2025
 * - ✅ Uses centralized test users (fixtures/test-users.ts)
 * - ✅ Uses authentication helper (helpers/auth.ts)
 * - ✅ Uses Page Object Model (pages/ResourcesPage.ts)
 * - ✅ Uses test.step() for clarity
 * - ✅ Proper cleanup (logout)
 * - ✅ Explicit waits (no arbitrary timeouts)
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';
import { TEST_CONFIG } from './fixtures/test-config';
import { loginAs, logout } from './helpers/auth';
import { ResourcesPage } from './pages/ResourcesPage';

test.describe('Resources Access (Refactored)', () => {
  test.afterEach(async ({ page }) => {
    try {
      await logout(page);
    } catch (error) {
      console.log('⚠️ Logout failed:', error);
    }
  });

  test('user can view and access resources', async ({ page }) => {
    test.step('Login as USA SECRET user', async () => {
      await loginAs(page, TEST_USERS.USA.SECRET);
    });

    test.step('Navigate to resources page', async () => {
      const resources = new ResourcesPage(page);
      await resources.goto();
      await resources.verifyResourcesDisplayed();
    });

    test.step('Click first resource', async () => {
      const resources = new ResourcesPage(page);
      await resources.clickResource(0);
      
      // Verify detail page loaded
      await page.waitForURL(/\/resources\/.+/, {
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      });
    });

    test.step('Verify resource content is visible', async () => {
      const content = page.getByTestId('resource-content')
        .or(page.locator('.resource-content'));
      
      await expect(content).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });
});
```

---

## 🎯 Refactoring Patterns by Test Type

### Pattern A: Authentication Tests

**Focus:** Login flows, MFA, IdP selection

**Key Changes:**
1. Use `loginAs()` helper with MFA support
2. Use `LoginPage` Page Object for IdP selection
3. Verify Keycloak flow (not custom login pages)

**Template:**
```typescript
test('MFA login flow', async ({ page }) => {
  test.step('Select IdP', async () => {
    const loginPage = new LoginPage(page);
    await loginPage.gotoHome();
    await loginPage.selectUSA();
  });
  
  test.step('Login with OTP', async () => {
    await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
  });
  
  test.step('Verify session', async () => {
    const dashboard = new DashboardPage(page);
    await dashboard.verifyLoggedIn();
  });
});
```

---

### Pattern B: Authorization Tests

**Focus:** Resource access, ALLOW/DENY decisions

**Key Changes:**
1. Use `TEST_RESOURCES` fixture
2. Use `ResourcesPage.verifyResourceAccessible()` / `verifyResourceDenied()`
3. Test scenarios from `fixtures/test-resources.ts`

**Template:**
```typescript
test('USA user can access FVEY document', async ({ page }) => {
  test.step('Login as USA SECRET user', async () => {
    await loginAs(page, TEST_USERS.USA.SECRET);
  });
  
  test.step('Verify FVEY document is accessible', async () => {
    const resources = new ResourcesPage(page);
    await resources.verifyResourceAccessible(
      TEST_RESOURCES.SECRET.FVEY.resourceId
    );
  });
});

test('France user denied access to FVEY document', async ({ page }) => {
  test.step('Login as France SECRET user', async () => {
    await loginAs(page, TEST_USERS.FRA.SECRET);
  });
  
  test.step('Verify FVEY document is denied', async () => {
    const resources = new ResourcesPage(page);
    await resources.verifyResourceDenied(
      TEST_RESOURCES.SECRET.FVEY.resourceId
    );
  });
});
```

---

### Pattern C: Multi-User Tests

**Focus:** Different users, different behaviors

**Key Changes:**
1. Logout between users
2. Use `TEST_USERS` fixtures for multiple countries
3. Compare results

**Template:**
```typescript
test('Different users see different resources', async ({ page }) => {
  let usaCount = 0;
  let fraCount = 0;
  
  test.step('Login as USA user and count resources', async () => {
    await loginAs(page, TEST_USERS.USA.SECRET);
    const resources = new ResourcesPage(page);
    await resources.goto();
    usaCount = await resources.getResourceCount();
    await logout(page);
  });
  
  test.step('Login as France user and count resources', async () => {
    await loginAs(page, TEST_USERS.FRA.SECRET);
    const resources = new ResourcesPage(page);
    await resources.goto();
    fraCount = await resources.getResourceCount();
    await logout(page);
  });
  
  test.step('Verify USA sees more (FVEY documents)', async () => {
    expect(usaCount).toBeGreaterThan(fraCount);
  });
});
```

---

## ✅ Post-Refactoring Checklist

After refactoring, verify:
- [ ] All imports added correctly
- [ ] No hardcoded BASE_URL
- [ ] No hardcoded credentials
- [ ] No arbitrary `waitForTimeout()`
- [ ] Uses semantic selectors (`getByRole`, `getByLabel`, `getByText`)
- [ ] Uses Page Objects where appropriate
- [ ] Uses `test.step()` for multi-step tests
- [ ] Has `afterEach` cleanup (logout)
- [ ] Uses `TEST_CONFIG.TIMEOUTS` for waits
- [ ] No linter errors: `npm run lint`
- [ ] Test runs successfully (or documented why not)

---

## 🐛 Common Issues & Solutions

### Issue: "TEST_USERS is not defined"
**Solution:** Add import: `import { TEST_USERS } from './fixtures/test-users';`

---

### Issue: "Cannot find module './pages/ResourcesPage'"
**Solution:** Check path is correct. Should be `'./pages/ResourcesPage'` from test file.

---

### Issue: "loginAs is not a function"
**Solution:** Add import: `import { loginAs, logout } from './helpers/auth';`

---

### Issue: Test times out during login
**Solution:** 
1. Check Keycloak is running: `docker ps | grep keycloak`
2. Increase timeout: `TEST_CONFIG.TIMEOUTS.AUTH_FLOW`
3. Check user exists in fixtures

---

### Issue: Selector not found
**Solution:**
1. Run test in headed mode: `--headed`
2. Use Playwright Inspector: `--debug`
3. Update Page Object selectors
4. Add data-testid to component if needed

---

## 📊 Refactoring Progress Tracker

| Test File | Status | Refactored | Effort | Notes |
|-----------|--------|------------|--------|-------|
| `identity-drawer.spec.ts` | ✅ DONE | Nov 16 | 1h | Now tests 4 scenarios |
| `integration-federation-vs-object.spec.ts` | ✅ DONE | Nov 16 | 15min | Only needed BASE_URL fix |
| `mfa-conditional.spec.ts` | 🔴 TODO | - | 8-12h | Requires MFA verification |
| `nato-expansion.spec.ts` | 🔴 TODO | - | 6-10h | Refactor login flows |
| `policies-lab.spec.ts` | 🔴 TODO | - | 8-12h | Refactor with new patterns |
| `external-idp-federation-flow.spec.ts` | 🔴 TODO | - | 6-10h | Align with NextAuth |
| `idp-management-revamp.spec.ts` | 🔴 TODO | - | 4-8h | Update selectors |
| `classification-equivalency.spec.ts` | 🔴 TODO | - | 8-12h | Remove mock JWT |
| `mfa-complete-flow.spec.ts` | 🔴 TODO | - | 8-12h | Align with Keycloak |

---

## 🚀 Next Test to Refactor

**Recommended Next:** `nato-expansion.spec.ts`

**Why:**
- Medium complexity
- Tests multiple countries (good for `TEST_USERS` practice)
- Doesn't require MFA investigation
- Similar to `identity-drawer.spec.ts` patterns

**Estimated Time:** 6-10 hours

---

**Template Created:** November 16, 2025  
**Last Updated:** November 16, 2025  
**Use This Template For:** All remaining E2E test refactorings


