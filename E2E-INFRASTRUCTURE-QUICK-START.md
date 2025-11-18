# E2E Infrastructure - Quick Start Guide

**Status:** ✅ READY TO USE  
**Date:** November 16, 2025

---

## 🚀 Run Pilot Test (5 seconds)

```bash
cd frontend
npm run test:e2e -- pilot-modern-test.spec.ts --headed
```

---

## 📝 Write Your First Test (Copy & Paste)

Create `frontend/src/__tests__/e2e/my-first-test.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';
import { TEST_RESOURCES } from './fixtures/test-resources';
import { loginAs, logout } from './helpers/auth';
import { ResourcesPage } from './pages/ResourcesPage';

test('USA user can access FVEY document', async ({ page }) => {
  // 1. Login
  await loginAs(page, TEST_USERS.USA.SECRET);
  
  // 2. Navigate
  const resources = new ResourcesPage(page);
  await resources.goto();
  
  // 3. Verify access
  await resources.verifyResourceAccessible(TEST_RESOURCES.SECRET.FVEY.resourceId);
  
  // 4. Cleanup
  await logout(page);
});
```

Run it:
```bash
npm run test:e2e -- my-first-test.spec.ts --headed
```

---

## 📚 Common Imports

```typescript
// Fixtures
import { TEST_USERS } from './fixtures/test-users';
import { TEST_RESOURCES } from './fixtures/test-resources';
import { TEST_CONFIG } from './fixtures/test-config';

// Helpers
import { loginAs, logout, isLoggedIn } from './helpers/auth';

// Page Objects
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ResourcesPage } from './pages/ResourcesPage';

// Playwright
import { test, expect } from '@playwright/test';
```

---

## 🔑 Quick Reference

### Login as Different Users
```typescript
await loginAs(page, TEST_USERS.USA.UNCLASS);      // No MFA
await loginAs(page, TEST_USERS.USA.SECRET);        // OTP required
await loginAs(page, TEST_USERS.FRA.SECRET);        // France
await loginAs(page, TEST_USERS.DEU.SECRET);        // Germany
await loginAs(page, TEST_USERS.INDUSTRY.SECRET);   // Contractor
```

### Access Test Resources
```typescript
TEST_RESOURCES.UNCLASSIFIED.BASIC              // Public doc
TEST_RESOURCES.SECRET.FVEY                     // FVEY intel
TEST_RESOURCES.SECRET.USA_ONLY                 // US-only
TEST_RESOURCES.SECRET.NATO                     // NATO coalition
TEST_RESOURCES.TOP_SECRET.USA_RESTRICTED       // TS USA
```

### Use Page Objects
```typescript
// Dashboard
const dashboard = new DashboardPage(page);
await dashboard.goto();
await dashboard.verifyLoggedIn();
await dashboard.openIdentityDrawer();

// Resources
const resources = new ResourcesPage(page);
await resources.goto();
await resources.searchFor('NATO');
await resources.verifyResourceAccessible('test-secret-fvey');

// Login
const loginPage = new LoginPage(page);
await loginPage.gotoHome();
await loginPage.selectUSA();
```

---

## ⏱️ Timeouts

```typescript
import { TEST_CONFIG } from './fixtures/test-config';

TEST_CONFIG.TIMEOUTS.ACTION        // 5s (10s in CI)
TEST_CONFIG.TIMEOUTS.NAVIGATION    // 15s (30s in CI)
TEST_CONFIG.TIMEOUTS.AUTH_FLOW     // 20s (40s in CI)
```

---

## 🎯 Common Patterns

### Authorization Test (ALLOW)
```typescript
await loginAs(page, TEST_USERS.USA.SECRET);
const resources = new ResourcesPage(page);
await resources.verifyResourceAccessible('test-secret-fvey');
```

### Authorization Test (DENY)
```typescript
await loginAs(page, TEST_USERS.FRA.SECRET);
const resources = new ResourcesPage(page);
await resources.verifyResourceDenied('test-secret-fvey');
```

### Multi-User Test
```typescript
await loginAs(page, TEST_USERS.USA.SECRET);
// ... test USA user behavior ...
await logout(page);

await loginAs(page, TEST_USERS.FRA.SECRET);
// ... test France user behavior ...
await logout(page);
```

---

## 🐛 Debug Tests

```bash
# Open Playwright Inspector
npm run test:e2e -- my-test.spec.ts --debug

# Run in headed mode
npm run test:e2e -- my-test.spec.ts --headed

# Show browser console
PWDEBUG=console npm run test:e2e -- my-test.spec.ts
```

---

## 📖 Full Documentation

- **Quick Start:** This file
- **Complete Guide:** `frontend/src/__tests__/e2e/README.md`
- **Gap Analysis:** `E2E-TESTS-GAP-ANALYSIS.md`
- **Day 1 Findings:** `E2E-DAY1-INVESTIGATION-FINDINGS.md`
- **Day 2 Summary:** `E2E-DAY2-INFRASTRUCTURE-COMPLETE.md`

---

**Ready to refactor existing tests?**  
Start with: `identity-drawer.spec.ts` (simplest) or `integration-federation-vs-object.spec.ts` (already working)


