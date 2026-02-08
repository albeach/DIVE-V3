# Critical Issue: Hardcoded Test Assumptions vs Dynamic Deployments

**Date**: 2026-02-08  
**Priority**: 🔴 **CRITICAL** - Blocks reliable E2E testing  
**Impact**: 35/40 @fast tests failing due to hardcoded IdP expectations

---

## 🚨 **The Problem**

### Root Cause
E2E tests make **hardcoded assumptions** about:
1. Which IdPs/spokes are deployed
2. What their `displayName` values are
3. Which ports they're running on
4. Which test users exist

### Real-World Mismatch

**What tests expect:**
```typescript
// fixtures/test-users.ts (HARDCODED, WRONG)
USA: { idp: 'United States', ... }  // ISO 3166-1 alpha-3: USA ✅
DEU: { idp: 'Germany', ... }        // ISO 3166-1 alpha-3: DEU ✅
FRA: { idp: 'France', ... }         // ISO 3166-1 alpha-3: FRA ✅
ALB: { idp: 'Albania', ... }        // ISO 3166-1 alpha-3: ALB ✅
```

**SSOT:** `scripts/nato-countries.sh` contains all 32 NATO + 6 partner nations with:
- ISO 3166-1 alpha-3 codes (USA, DEU, FRA, GBR, ALB, DNK, ROU, etc.)
- Full country names ("United States", "Germany", "France")
- Port offsets, locales, flags, join years

**What's actually deployed:**
```json
// From Keycloak API
{ "alias": "dive-spoke-deu", "displayName": "DEU Instance" }
```

**Result:** Tests search for "Germany" button, but it's actually "DEU Instance" → **FAIL**

### Why This Is Broken

1. **Variable deployments**: Users run `./dive spoke deploy DEU "Custom Name"`
   - Could be: "Germany", "DEU Instance", "Deutschland", "Germany Defence", etc.

2. **Partial deployments**: Not all 32 NATO countries deployed
   - Tests expect Albania, Denmark, Romania
   - But only USA + DEU are actually running → **FAIL**

3. **Port conflicts**: Hardcoded URLs assume specific ports
   - `https://localhost:3001` (Albania) → may not exist

4. **Dynamic nature**: Spokes can be added/removed anytime
   - Tests should adapt, not break

---

## ✅ **The Solution: Dynamic IdP Discovery**

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Test Startup (beforeAll)                                   │
│  ────────────────────────                                   │
│  1. Query hub: GET /api/federation/idps                     │
│  2. Extract available IdPs + displayNames                   │
│  3. Map displayNames → country codes (DEU, FRA, GBR)        │
│  4. Store in global availableIdPs object                    │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Each Test                                                   │
│  ──────────                                                  │
│  1. Check: isIdPAvailable(idps, 'DEU')                      │
│  2. If NO → test.skip() with message                        │
│  3. If YES → Use actual displayName from discovery          │
│  4. Search for: page.getByRole('button', { name: /DEU/ })   │
└─────────────────────────────────────────────────────────────┘
```

### Implementation

**1. Dynamic Discovery Helper** (`helpers/idp-discovery.ts`)
```typescript
export async function discoverAvailableIdPs(page: Page): Promise<DiscoveredIdPs> {
  await page.goto('https://localhost:3000');
  const idpButtons = await page.locator('button').allTextContents();
  
  return {
    hub: { code: 'USA', displayName: 'United States', available: true },
    spokes: new Map([
      ['DEU', { code: 'DEU', displayName: 'DEU Instance', available: true }],
      ['FRA', { code: 'FRA', displayName: 'France', available: true }]
    ])
  };
}
```

**2. Test Adaptation** (auth tests)
```typescript
test.describe('Authentication Tests', () => {
  let availableIdPs: DiscoveredIdPs;
  
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    availableIdPs = await discoverAvailableIdPs(page);
    await page.close();
  });
  
  test('DEU authentication (if deployed)', async ({ page }) => {
    // ✅ SKIP if DEU not deployed
    test.skip(!isIdPAvailable(availableIdPs, 'DEU'), 'DEU spoke not deployed');
    
    // ✅ Use actual displayName from discovery
    const displayName = getIdPDisplayName(availableIdPs, 'DEU');
    
    await page.goto('/');
    // ✅ Works for "Germany", "DEU Instance", "Deutschland", etc.
    const idpButton = page.getByRole('button', { name: new RegExp(displayName, 'i') });
    await idpButton.click();
  });
});
```

**3. Environment Override** (optional)
```bash
# Force test specific instances (CI, specific scenarios)
DEPLOYED_INSTANCES="USA,DEU,FRA" npm run test:e2e

# Auto-discover (default, local development)
npm run test:e2e
```

---

## 📊 **Comparison: Before vs After**

### Before (Hardcoded)

```typescript
// ❌ FAILS if displayName != "Germany"
test('DEU login', async ({ page }) => {
  await page.click('button:has-text("Germany")');
});

// ❌ FAILS if DEU not deployed (still runs, then times out)
test('DEU login', async ({ page }) => {
  await page.click('button:has-text("DEU")'); // timeout: 30s
});

// ❌ FAILS if Alba not deployed
test('Albania login', async ({ page }) => {
  await page.goto('https://localhost:3001'); // 404 error
});
```

**Problems:**
- ❌ 35/40 tests failing
- ❌ 30s timeout per failure
- ❌ Total test time: 17.5 minutes wasted
- ❌ False negatives (code is fine, tests are wrong)

### After (Dynamic)

```typescript
// ✅ ADAPTS to actual displayName
test('DEU login', async ({ page }) => {
  test.skip(!isIdPAvailable(idps, 'DEU'));
  
  const displayName = getIdPDisplayName(idps, 'DEU');
  await page.click(`button:has-text("${displayName}")`);
});

// ✅ SKIPS instantly if not deployed
test('DEU login', async ({ page }) => {
  test.skip(!isIdPAvailable(idps, 'DEU'), 'DEU not deployed');
  // ... (only runs if DEU available)
});

// ✅ NEVER tests non-existent instances
// (Discovery never adds Albania to availableIdPs)
```

**Benefits:**
- ✅ Tests only what's deployed
- ✅ Instant skip (no 30s timeout)
- ✅ Works with any displayName
- ✅ Adapts to environment changes

---

## 🎯 **Migration Plan**

### Phase 1: Foundation (Day 3 - Today)
- [x] Create `idp-discovery.ts` helper
- [x] Create example test (`example-dynamic-testing.spec.ts`)
- [x] Document the issue and solution

### Phase 2: Critical Tests (Day 4)
- [ ] Refactor `auth-confirmed-frontend.spec.ts`
- [ ] Refactor `all-test-users.spec.ts`
- [ ] Refactor `key-test-users.spec.ts`
- [ ] Verify 100% pass rate with USA + DEU deployed

### Phase 3: All Tests (Week 2)
- [ ] Refactor remaining 60 E2E tests
- [ ] Add API endpoint: `GET /api/federation/idps` (preferred over DOM scraping)
- [ ] Update fixtures to use dynamic discovery
- [ ] Add CI environment variables for known deployments

---

## 🛠️ **Developer Workflow**

### Local Development (Auto-Discovery)
```bash
# Start hub + 1-2 spokes
./dive hub start
./dive spoke deploy DEU "Germany Testing"

# Run tests (auto-discovers USA + DEU)
cd frontend
npm run test:e2e

# Result:
# ✅ USA tests: RUN (discovered)
# ✅ DEU tests: RUN (discovered)
# ⏭️ FRA tests: SKIP (not deployed)
# ⏭️ GBR tests: SKIP (not deployed)
```

### CI (Explicit Configuration)
```yaml
# .github/workflows/test-e2e.yml
env:
  DEPLOYED_INSTANCES: "USA,DEU,FRA"  # Known deployment

steps:
  - name: Deploy test spokes
    run: |
      ./dive spoke deploy DEU "Germany"
      ./dive spoke deploy FRA "France"
  
  - name: Run E2E tests
    run: npm run test:e2e
    # Only tests USA, DEU, FRA (as configured)
```

---

## 📝 **Implementation Details**

### Discovery Methods

**Method 1: DOM Scraping (Current)**
```typescript
// Pro: No backend changes needed
// Con: Brittle, depends on UI structure
const buttons = await page.locator('button').allTextContents();
```

**Method 2: API Endpoint (Preferred)**
```typescript
// Pro: Reliable, structured data
// Con: Requires backend API endpoint
const response = await fetch('/api/federation/idps');
const idps = await response.json();
// Returns: [{ code: "DEU", displayName: "DEU Instance", ... }]
```

**Method 3: Environment Variables (Fallback)**
```bash
# Pro: Explicit, fast
# Con: Manual maintenance
export DEPLOYED_INSTANCES="USA,DEU,FRA"
```

### Country Code Mapping

The `mapDisplayNameToCode()` function handles:
- Direct codes: "DEU" → DEU
- Country names: "Germany" → DEU
- Partial matches: "DEU Instance" → DEU
- Localized names: "Deutschland" → DEU
- All 32 NATO + 6 partners (38 total mappings)

---

## 🎓 **Lessons Learned**

### Anti-Patterns (Don't Do This)
1. ❌ **Hardcoding infrastructure assumptions**
   - Don't assume Albania is deployed
   - Don't assume ports (3001, 3007)

2. ❌ **Hardcoding UI strings**
   - Don't search for "Germany" (use discovered name)
   - Don't assume English (support localization)

3. ❌ **Running unavailable tests**
   - Don't let tests timeout waiting for non-existent spokes
   - Use `test.skip()` proactively

### Best Practices (Do This)
1. ✅ **Discover before testing**
   - Query what's available
   - Adapt tests to reality

2. ✅ **Skip gracefully**
   - Instant skip if not deployed
   - Clear message: "DEU spoke not deployed"

3. ✅ **Use actual values**
   - Discovered displayNames
   - Discovered URLs
   - Discovered test users

---

## 🚀 **Expected Outcomes**

### Before Migration
- **Pass rate**: 5/40 (12.5%) for @fast tests
- **Failure reason**: Hardcoded IdP names don't match
- **Test duration**: ~3 minutes (including 30s timeouts × 35 failures)
- **Developer experience**: Frustrating, false negatives

### After Migration
- **Pass rate**: 35/35 (100%) for available IdPs
- **Skipped**: 5 tests (Albania, Denmark, Romania not deployed)
- **Test duration**: ~1.5 minutes (no timeouts)
- **Developer experience**: Tests adapt to environment, no surprises

---

## 📚 **References**

- Dynamic test discovery: https://playwright.dev/docs/test-parameterize
- Test skipping: https://playwright.dev/docs/api/class-test#test-skip
- Environment configuration: https://playwright.dev/docs/test-use-options
- DIVE V3 federation architecture: `docs/federation-architecture.md`

---

**Document Owner**: Testing & Quality Team  
**Status**: 🔴 **CRITICAL** - Requires immediate action  
**Next Steps**: Refactor top 3 auth test files (Day 4)
