# E2E Tests - Quick Reference Card

**Last Updated:** November 15, 2025  
**Full Analysis:** See `E2E-TESTS-GAP-ANALYSIS.md`

---

## 📊 At A Glance

| Metric | Value |
|--------|-------|
| **Total Test Files** | 9 |
| **Total Test Scenarios** | ~80+ |
| **✅ Working** | 2 files (22%) |
| **🔴 Broken/Outdated** | 7 files (78%) |
| **Estimated Fix Time** | 104-156 hours (3-4 weeks) |

---

## 🗂️ Test File Status

| File | Status | Tests | Priority | Effort | Action |
|------|--------|-------|----------|--------|--------|
| `identity-drawer.spec.ts` | ✅ WORKING | 1 | LOW | 1h | Minor updates |
| `integration-federation-vs-object.spec.ts` | ✅ WORKING | 10 | LOW | 2h | Minor updates |
| `mfa-conditional.spec.ts` | 🔴 OUTDATED | 6 | HIGH | 8-12h | REWRITE |
| `nato-expansion.spec.ts` | 🔴 OUTDATED | 10+ | MEDIUM | 6-10h | REFACTOR |
| `policies-lab.spec.ts` | 🔴 OUTDATED | 10 | LOW | 8-16h | INVESTIGATE |
| `external-idp-federation-flow.spec.ts` | 🔴 OUTDATED | 8+ | MEDIUM | 6-10h | REFACTOR |
| `idp-management-revamp.spec.ts` | 🔴 PARTIAL | 10 | MEDIUM | 4-8h | REFACTOR |
| `classification-equivalency.spec.ts` | 🔴 OUTDATED | 4+ | MEDIUM | 8-12h | REWRITE |
| `mfa-complete-flow.spec.ts` | 🔴 OUTDATED | 11 | HIGH | 8-12h | REFACTOR |

---

## 🎯 Top 6 Issues (All Tests Affected)

1. **Hardcoded BASE_URL** → Use relative paths
2. **Auth Architecture Mismatch** → Use NextAuth helpers
3. **Fragile Selectors** → Use semantic selectors
4. **No Page Object Model** → Create POM
5. **No Test Data Management** → Create fixtures
6. **Poor Error Handling** → Add waits & debugging

---

## 🚀 Quick Wins (Fix These First)

```typescript
// ❌ OLD PATTERN (Bad)
const BASE_URL = 'http://localhost:3000';
await page.goto(`${BASE_URL}/login`);
await page.click('button:has-text("Sign In")');

// ✅ NEW PATTERN (Good)
await page.goto('/login');
await page.getByRole('button', { name: 'Sign In' }).click();
```

---

## 📅 3-Day Action Plan

### Day 1: Investigation
- [ ] List all app routes: `find frontend/src/app -name "page.tsx"`
- [ ] List API endpoints: `grep -r "app.get\|app.post" backend/src/`
- [ ] Verify test users exist in Keycloak
- [ ] Check if `/policies/lab` route exists

### Day 2: Infrastructure
- [ ] Create `fixtures/test-users.ts`
- [ ] Create `fixtures/test-resources.ts`
- [ ] Create `helpers/auth.ts`
- [ ] Create `pages/LoginPage.ts`

### Day 3: Pilot
- [ ] Refactor `identity-drawer.spec.ts` with new patterns
- [ ] Run test locally: `npm run test:e2e -- identity-drawer.spec.ts`
- [ ] Document new patterns in comment
- [ ] Get approval, proceed with Phase 2

---

## 🏗️ New File Structure

```
frontend/src/__tests__/e2e/
├── fixtures/
│   ├── test-users.ts           # Centralized user data
│   ├── test-resources.ts       # Sample documents
│   └── test-config.ts          # Environment config
├── pages/
│   ├── LoginPage.ts            # POM: Login
│   ├── DashboardPage.ts        # POM: Dashboard
│   ├── ResourcesPage.ts        # POM: Resources
│   └── AdminPage.ts            # POM: Admin
├── helpers/
│   ├── auth.ts                 # loginAs(), logout()
│   ├── api.ts                  # API testing utils
│   └── assertions.ts           # Custom expects
└── [test files].spec.ts        # Actual tests
```

---

## 💡 Code Templates

### Authentication Helper

```typescript
// helpers/auth.ts
export async function loginAs(page: Page, userKey: string) {
  await page.goto('/');
  await page.getByRole('button', { name: /USA DoD/i }).click();
  await page.waitForURL(/.*keycloak.*/i);
  // ... fill Keycloak form
  await page.waitForURL('/dashboard');
}
```

### Page Object Example

```typescript
// pages/ResourcesPage.ts
export class ResourcesPage {
  constructor(private page: Page) {}
  
  async goto() {
    await this.page.goto('/resources');
  }
  
  async searchFor(query: string) {
    await this.page.getByPlaceholder(/search/i).fill(query);
  }
}
```

### Modern Test Pattern

```typescript
import { test, expect } from '@playwright/test';
import { loginAs } from '../helpers/auth';
import { ResourcesPage } from '../pages/ResourcesPage';

test('user can search resources', async ({ page }) => {
  await loginAs(page, 'US_SECRET');
  
  const resourcesPage = new ResourcesPage(page);
  await resourcesPage.goto();
  await resourcesPage.searchFor('NATO');
  
  expect(await resourcesPage.getResourceCount()).toBeGreaterThan(0);
});
```

---

## ⚠️ Critical Decisions Needed

1. **Does `/policies/lab` exist?** → Check routes before refactoring
2. **MFA: Keycloak or App?** → Impacts 17 tests
3. **Which APIs exist?** → Audit backend before testing
4. **Test user seeding?** → May need automation

---

## 📞 Getting Help

- **Full Analysis:** `E2E-TESTS-GAP-ANALYSIS.md`
- **Playwright Docs:** https://playwright.dev/docs/intro
- **Best Practices:** https://playwright.dev/docs/best-practices
- **POM Guide:** https://playwright.dev/docs/pom

---

**Next:** Read full gap analysis, then start Day 1 investigation

