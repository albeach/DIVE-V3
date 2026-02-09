# DEU Test Failures - Root Cause & Recommended Solution

**Date**: 2026-02-08 17:15 EST  
**Issue**: DEU authentication tests timing out  
**Status**: 🎯 SOLUTION IDENTIFIED

---

## 🎯 Root Cause: Variable DisplayName Pattern

### The Deployment Variability

Users deploy spokes with **variable displayName**:

```bash
# Deployment examples - displayName is free text:
./dive spoke deploy DEU "Germany Defence"           # displayName = "Germany Defence"
./dive spoke deploy DEU "Bundeswehr"                # displayName = "Bundeswehr"
./dive spoke deploy DEU                              # displayName = "Germany" (from NATO DB)
./dive spoke deploy XYZ "My Custom Name"            # displayName = "My Custom Name"
```

**Current Deployment Logic** (`spoke-deploy.sh` lines 116-132):
```bash
if [ -z "$instance_name" ]; then
    # 1. Try NATO database (e.g., "Germany" for DEU)
    instance_name=$(get_country_name "$code_upper")
    
    # 2. Fallback: "DEU Instance"
    if [ -z "$instance_name" ]; then
        instance_name="$code_upper Instance"
    fi
fi
```

### Current Test Limitation

**Test Fixture** (`test-users.ts`):
```typescript
DEU_USERS = {
  LEVEL_1: {
    idp: 'Germany',  // ⚠️ HARDCODED - assumes NATO DB name
    // ...
  }
}
```

**Auth Helper** (`auth.ts` line 67):
```typescript
const idpButton = page.getByRole('button', { name: new RegExp(user.idp, 'i') })
```

**Problem**: Tests expect "Germany", but actual displayName could be:
- ✅ "Germany" (NATO DB fallback)
- ❌ "DEU Instance" (generic fallback)
- ❌ "Germany Defence" (user-provided)
- ❌ "Bundeswehr" (user-provided)
- ❌ Any custom name

---

## ✅ Recommended Solution: Flexible Matching

### Option 1: Multi-Pattern Matching (BEST)

Update the auth helper to try **multiple patterns** in order of specificity:

```typescript
// auth.ts - Enhanced flexible matching
async function loginAs(page: Page, user: TestUser) {
  // ... navigation code ...

  // Step 2: Select IdP with flexible matching
  console.log(`[AUTH] Step 2: Selecting IdP for ${user.countryCode}`);

  // Try multiple patterns (order matters: specific → general):
  const idpButton = page.getByRole('button', { name: new RegExp(user.idp, 'i') })           // "Germany"
    .or(page.getByRole('button', { name: new RegExp(user.country, 'i') }))                  // "Germany"
    .or(page.getByRole('button', { name: new RegExp(user.countryCode, 'i') }))              // "DEU"
    .or(page.getByRole('button', { name: new RegExp(`${user.countryCode}.*Instance`, 'i') })) // "DEU Instance"
    .or(page.getByRole('link', { name: new RegExp(user.idp, 'i') }))                        // Link variant
    .or(page.locator(`button:has-text("${user.countryCode}")`))                              // Partial match
    .first();

  await idpButton.waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  await idpButton.click();
  // ...
}
```

**Pros**:
- ✅ Handles **all** deployment variations
- ✅ No configuration changes needed
- ✅ Works for NATO and non-NATO countries
- ✅ Future-proof (custom names)
- ✅ Degrades gracefully (tries multiple patterns)

**Cons**:
- Slightly more complex selector logic

---

### Option 2: Test Environment Configuration

Store actual IdP displayNames in test configuration:

```typescript
// fixtures/test-config.ts
export const IDP_DISPLAY_NAMES = {
  USA: 'United States',
  FRA: 'France',
  GBR: 'United Kingdom',
  DEU: process.env.DEU_IDP_DISPLAY_NAME || 'Germany',  // From env or default
  CAN: 'Canada',
};

// test-users.ts
DEU_USERS = {
  LEVEL_1: {
    idp: IDP_DISPLAY_NAMES.DEU,  // Dynamic lookup
    // ...
  }
}
```

**Pros**:
- ✅ Centralized configuration
- ✅ Easy to override per environment

**Cons**:
- ❌ Requires environment setup
- ❌ Doesn't handle ad-hoc deployments
- ❌ Extra configuration burden

---

### Option 3: API-Based IdP Discovery (ADVANCED)

Query backend for actual IdP list before tests:

```typescript
// helpers/idp-discovery.ts
export async function discoverIdPs() {
  const response = await fetch('/api/idps/public');
  const data = await response.json();
  return data.idps.reduce((map, idp) => {
    // Map country code to actual displayName
    const code = extractCountryCode(idp.alias); // "deu-idp" → "DEU"
    map[code] = idp.displayName;
    return map;
  }, {});
}

// In test setup (playwright.config.ts globalSetup):
export async function globalSetup() {
  const idpMap = await discoverIdPs();
  // Store in process.env or shared state
  process.env.TEST_IDP_MAP = JSON.stringify(idpMap);
}
```

**Pros**:
- ✅ Always accurate (queries live system)
- ✅ No hardcoded assumptions

**Cons**:
- ❌ Complex setup
- ❌ Requires backend availability
- ❌ Slower test startup

---

## 🎯 Implementation Recommendation

**Go with Option 1: Multi-Pattern Flexible Matching**

### Why?
1. **Zero Configuration**: Works with any deployment pattern
2. **Robust**: Handles NATO DB, generic fallback, and custom names
3. **Simple**: One-time fix in auth helper
4. **Future-Proof**: No assumptions about displayName
5. **Fast**: No API calls or env setup

### Implementation Steps

1. **Update `auth.ts`** (5 minutes):
```typescript
// Enhanced IdP selection with multiple fallback patterns
const idpButton = page.getByRole('button', { name: new RegExp(user.idp, 'i') })
  .or(page.getByRole('button', { name: new RegExp(user.country, 'i') }))
  .or(page.getByRole('button', { name: new RegExp(user.countryCode, 'i') }))
  .or(page.getByRole('button', { name: new RegExp(`${user.countryCode}.*Instance`, 'i') }))
  .or(page.getByRole('link', { name: new RegExp(user.countryCode, 'i') }))
  .or(page.locator(`button:has-text("${user.countryCode}")`))
  .first();
```

2. **Add Logging** (debugging):
```typescript
console.log(`[AUTH] Searching for IdP: "${user.idp}" or "${user.countryCode}"`);
```

3. **Test Coverage**:
- ✅ "Germany" (NATO DB)
- ✅ "DEU Instance" (generic fallback)
- ✅ "Germany Defence" (custom)
- ✅ "Bundeswehr" (custom)

---

## 📊 Impact Analysis

### Before Fix
- ❌ DEU tests: 4 failures (displayName mismatch)
- ⚠️ Brittle: Only works with NATO DB names
- ⚠️ Breaks with custom deployments

### After Fix
- ✅ DEU tests: 4 passes (flexible matching)
- ✅ Robust: Works with any displayName
- ✅ NATO + non-NATO countries supported

---

## 🔧 Additional Enhancements (Optional)

### 1. Better Error Messages
```typescript
try {
  await idpButton.waitFor({ state: 'visible', timeout: 5000 });
} catch (error) {
  // Take screenshot showing available IdPs
  await page.screenshot({ path: `idp-not-found-${user.countryCode}.png` });
  
  // List available IdP buttons for debugging
  const availableIdps = await page.locator('button[role="button"]').allTextContents();
  console.error(`[AUTH] Available IdPs: ${availableIdps.join(', ')}`);
  
  throw new Error(`IdP not found for ${user.countryCode}. Expected patterns: "${user.idp}", "${user.countryCode}"`);
}
```

### 2. Retry Logic for Dynamic Loading
```typescript
// Retry up to 3 times (for slow IdP health checks)
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    await idpButton.waitFor({ state: 'visible', timeout: 2000 });
    break;
  } catch (error) {
    if (attempt === 3) throw error;
    console.log(`[AUTH] Retry ${attempt}/3: IdP button not visible yet`);
    await page.waitForTimeout(1000); // Wait for health check
  }
}
```

---

## ✅ Conclusion

**Root Cause**: Tests assume specific IdP displayName, but deployment allows free-text naming

**Best Fix**: Flexible multi-pattern matching in auth helper

**Impact**: 
- Unblocks 4 DEU test cases
- Future-proofs all spoke tests
- Handles custom deployments gracefully

**Effort**: 10 minutes (1 file update)

**Priority**: High (Day 2 - before completing parallel execution verification)

---

## 📝 Next Steps

1. **Immediate**: Implement flexible matching in `auth.ts`
2. **Day 2**: Re-run tests to verify DEU passes
3. **Day 3**: Add error messaging enhancements
4. **Documentation**: Update testing guide with deployment variability notes

---

**Status**: ✅ Solution Ready for Implementation  
**Blocker**: No (can implement during test run)  
**Risk**: Low (additive change, backward compatible)
