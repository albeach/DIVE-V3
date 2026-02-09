# Base Test Fixture Migration Guide

## Why This Prevents Drift

**Problem**: Without unified fixtures, each test file can:
- Create inline user objects (missing `countryCode`)
- Hardcode IdP display names (breaks when changed)
- Implement discovery differently (inconsistent)
- Forget cleanup (test pollution)

**Solution**: Base test fixture enforces:
- ✅ Single source of truth for users (`TEST_USERS`)
- ✅ Automatic IdP discovery (no manual setup)
- ✅ Consistent auth patterns (`auth` helper)
- ✅ Automatic cleanup (`afterEach` built-in)

---

## Migration Steps

### Step 1: Change Import

**Before:**
```typescript
import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';
import { loginAs, logout, getDiscoveredIdPs } from './helpers/auth';
import { isIdPAvailable, type DiscoveredIdPs } from './helpers/idp-discovery';
```

**After:**
```typescript
import { test, expect, skipIfNotAvailable } from './fixtures/base-test';
// That's it! Everything else is provided by fixtures
```

### Step 2: Remove Manual Discovery

**Before:**
```typescript
let discoveredIdPs: DiscoveredIdPs | null = null;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  discoveredIdPs = await getDiscoveredIdPs(page);
  await page.close();
});
```

**After:**
```typescript
// Nothing needed - discovery is automatic via fixture
```

### Step 3: Remove Manual Cleanup

**Before:**
```typescript
test.afterEach(async ({ page }) => {
  try {
    await logout(page);
  } catch (error) {
    console.log('Logout failed');
  }
});
```

**After:**
```typescript
// Nothing needed - cleanup is automatic via fixture
```

### Step 4: Update Test Signatures

**Before:**
```typescript
test('My test', async ({ page }) => {
  await loginAs(page, TEST_USERS.USA.SECRET);
  // ...
});
```

**After:**
```typescript
test('My test', async ({ page, auth, users }) => {
  await auth.loginAs(users.USA.SECRET, { otpCode: '123456' });
  // ...
});
```

### Step 5: Update Skip Logic

**Before:**
```typescript
test('FRA test', async ({ page }) => {
  test.skip(!discoveredIdPs || !await isIdPAvailable(discoveredIdPs, 'FRA'), 'FRA not deployed');
  await loginAs(page, TEST_USERS.FRA.SECRET);
});
```

**After:**
```typescript
test('FRA test', async ({ page, auth, users, idps }) => {
  skipIfNotAvailable(idps, 'FRA');
  await auth.loginAs(users.FRA.SECRET, { otpCode: '123456' });
});
```

---

## Complete Example: identity-drawer.spec.ts

**Before (Old Pattern):**
```typescript
import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';
import { TEST_CONFIG } from './fixtures/test-config';
import { loginAs, logout, getDiscoveredIdPs } from './helpers/auth';
import { DashboardPage } from './pages/DashboardPage';
import { isIdPAvailable, type DiscoveredIdPs } from './helpers/idp-discovery';

let discoveredIdPs: DiscoveredIdPs | null = null;

test.describe('Identity Drawer', { tag: ['@fast'] }, () => {
    test.beforeAll(async ({ browser }) => {
        const page = await browser.newPage();
        discoveredIdPs = await getDiscoveredIdPs(page);
        await page.close();
    });
    
    test.afterEach(async ({ page }) => {
        try {
            await logout(page);
        } catch (error) {
            console.log('Logout failed');
        }
    });

    test('USA test', async ({ page }) => {
        await loginAs(page, TEST_USERS.USA.SECRET);
        await expect(page).toHaveURL(/dashboard/);
    });

    test('FRA test', async ({ page }) => {
        test.skip(!discoveredIdPs || !await isIdPAvailable(discoveredIdPs, 'FRA'), 'FRA not deployed');
        await loginAs(page, TEST_USERS.FRA.SECRET);
        await expect(page).toHaveURL(/dashboard/);
    });
});
```

**After (New Pattern):**
```typescript
import { test, expect, skipIfNotAvailable } from './fixtures/base-test';
import { DashboardPage } from './pages/DashboardPage';

test.describe('Identity Drawer', { tag: ['@fast'] }, () => {
    // No beforeAll needed - discovery is automatic
    // No afterEach needed - cleanup is automatic

    test('USA test', async ({ page, auth, users }) => {
        await auth.loginAs(users.USA.SECRET, { otpCode: '123456' });
        await expect(page).toHaveURL(/dashboard/);
        // Cleanup is automatic
    });

    test('FRA test', async ({ page, auth, users, idps }) => {
        skipIfNotAvailable(idps, 'FRA'); // One line skip
        await auth.loginAs(users.FRA.SECRET, { otpCode: '123456' });
        await expect(page).toHaveURL(/dashboard/);
        // Cleanup is automatic
    });
});
```

**Diff Summary:**
- ✅ 10 lines removed (imports, beforeAll, afterEach)
- ✅ No manual discovery
- ✅ No manual cleanup
- ✅ Cleaner skip logic
- ✅ Cannot accidentally use inline users
- ✅ Cannot accidentally hardcode IdP names

---

## Enforcement

To prevent future drift, add to `.cursorrules`:

```markdown
### E2E Test Standards (MANDATORY)

**ALWAYS use base-test fixture:**
```typescript
import { test, expect } from './fixtures/base-test';
```

**NEVER use raw Playwright test:**
```typescript
import { test } from '@playwright/test'; // ❌ FORBIDDEN
```

**NEVER create inline user objects:**
```typescript
const user = { username: '...', password: '...' }; // ❌ FORBIDDEN
await auth.loginAs(users.USA.SECRET); // ✅ CORRECT
```

**NEVER hardcode IdP names:**
```typescript
await page.click('button:has-text("United States")'); // ❌ FORBIDDEN
await auth.loginAs(users.USA.SECRET); // ✅ CORRECT (discovery handled automatically)
```

**NEVER implement manual discovery:**
```typescript
const idps = await discoverAvailableIdPs(page); // ❌ FORBIDDEN (unless in base-test.ts)
// Use fixtures: async ({ idps }) => { ... } // ✅ CORRECT
```
```

---

## Benefits Summary

| Aspect | Without Base Fixture | With Base Fixture |
|--------|---------------------|-------------------|
| **User management** | Can drift (inline objects) | Enforced (fixture only) |
| **Discovery** | Manual (each test) | Automatic (once per worker) |
| **Cleanup** | Manual (often forgotten) | Automatic (always happens) |
| **Skip logic** | Verbose (5+ lines) | Concise (1 line) |
| **Type safety** | Partial | Full |
| **Performance** | Discover per-test | Discover once per worker |
| **Code duplication** | High (30+ lines boilerplate) | None |
| **Maintainability** | Low (scattered logic) | High (centralized) |

---

## Migration Priority

1. **High Priority** (Core test suites):
   - `all-test-users.spec.ts`
   - `key-test-users.spec.ts`
   - `auth-confirmed-frontend.spec.ts`

2. **Medium Priority** (Feature tests):
   - `identity-drawer.spec.ts`
   - `session-lifecycle.spec.ts`
   - `coi-*.spec.ts`

3. **Low Priority** (Specialized tests):
   - Dynamic instance tests
   - Federation tests
   - Admin tests

---

## Next Steps

1. ✅ Create `base-test.ts` fixture
2. ✅ Create example and migration guide
3. ⏭️ Migrate high-priority test files
4. ⏭️ Update `.cursorrules` to enforce
5. ⏭️ Add pre-commit hook to check imports
6. ⏭️ Update documentation

**Result**: No more drift, consistent patterns, automatic discovery and cleanup.
