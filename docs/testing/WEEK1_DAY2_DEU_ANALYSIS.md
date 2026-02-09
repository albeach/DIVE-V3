# DEU Test Failures - Root Cause Analysis

**Date**: 2026-02-08 17:00 EST  
**Issue**: DEU authentication tests timing out  
**Status**: 🔍 ROOT CAUSE IDENTIFIED

---

## 🎯 Root Cause

**Mismatch between IdP displayName and test expectations**

### What's Happening

1. **Backend Response** (from `/api/idps/public`):
```json
{
  "alias": "deu-idp",
  "displayName": "DEU Instance",
  "protocol": "oidc",
  "enabled": true
}
```

2. **Test Fixture** (`test-users.ts`):
```typescript
DEU_USERS = {
  LEVEL_1: {
    idp: 'Germany',  // ⚠️ Looking for "Germany"
    // ...
  }
}
```

3. **Auth Helper** (`auth.ts` line 67):
```typescript
const idpButton = page.getByRole('button', { name: new RegExp(user.idp, 'i') })
  // Searches for button matching "Germany" (case-insensitive)
```

4. **Actual UI Button Text**: "DEU Instance"

### Result
Test looks for button with "Germany" → Times out after 5000ms → Fails

---

## ✅ DEU Spoke is Running

Confirmed via `docker ps`:
```
dive-spoke-deu-keycloak      Up 3 hours (healthy)   0.0.0.0:8091->8080/tcp
dive-spoke-deu-frontend      Up 3 hours (healthy)   0.0.0.0:3011->3000/tcp
```

The infrastructure is **fully operational**. This is purely a naming/configuration issue.

---

## 🔧 Solution Options

### Option 1: Update Keycloak IdP Display Name (Recommended)
**Change**: Update DEU IdP displayName from "DEU Instance" → "Germany"

**Pros**:
- Matches user expectations
- Consistent with FRA ("France"), GBR ("United Kingdom"), USA ("United States")
- No test changes required

**Implementation**:
```bash
# Update Keycloak IdP displayName
docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh \
  update identity-provider/instances/deu-idp \
  --target-realm dive-v3-broker \
  --set displayName="Germany"
```

**Files to Update**:
- Hub Keycloak: IdP displayName property
- OR: `instances/deu/config.json` → Update registration payload

---

### Option 2: Update Test Fixtures
**Change**: Update test fixture to use "DEU Instance" instead of "Germany"

**Pros**:
- Quick fix
- No infrastructure changes

**Cons**:
- Less user-friendly naming
- Inconsistent with other countries (France, United Kingdom, etc.)

**Implementation**:
```typescript
// frontend/src/__tests__/e2e/fixtures/test-users.ts
DEU_USERS = {
  LEVEL_1: {
    idp: 'DEU Instance', // Changed from 'Germany'
    // ...
  }
}
```

---

### Option 3: Flexible Matching in Auth Helper
**Change**: Make auth helper match both displayName and country name

**Pros**:
- Most flexible solution
- Handles future naming variations

**Implementation**:
```typescript
// auth.ts
const idpButton = page.getByRole('button', { name: new RegExp(user.idp, 'i') })
  .or(page.getByRole('button', { name: new RegExp(user.country, 'i') }))
  .or(page.getByRole('button', { name: new RegExp(user.countryCode, 'i') }))
  .first();
```

---

## 📊 Impact Analysis

### Current State
- ✅ USA tests: Pass (displayName matches: "United States")
- ✅ GBR tests: Pass (displayName matches: "United Kingdom")
- ❌ DEU tests: Fail (displayName mismatch: "DEU Instance" vs "Germany")
- ❓ FRA tests: Need to verify displayName

### After Fix
All country tests should pass with consistent naming.

---

## 🎯 Recommendation

**Go with Option 1**: Update Keycloak IdP displayName to "Germany"

**Reasoning**:
1. **User-Facing**: "Germany" is more intuitive than "DEU Instance"
2. **Consistency**: Matches pattern of other countries
3. **No Test Changes**: Tests already expect "Germany"
4. **Federation Standard**: Country names are standard for coalition IdPs

---

## 📝 Next Steps

1. **Immediate**: Document this finding in Day 2 progress
2. **Day 2 Completion**: Mark DEU failures as "known issue - naming mismatch"
3. **Day 3/4**: Implement Option 1 fix (update displayName)
4. **Day 5**: Re-run DEU tests to verify fix

---

## 🔍 Related Issues

### Federation Status
From `instances/deu/config.json`:
```json
"federation": {
  "status": "unregistered"
}
```

**Note**: DEU spoke is running but may not be fully federated with hub. This could cause additional issues beyond the displayName mismatch.

**Action**: Verify DEU federation registration status separately.

---

## ✅ Conclusion

**DEU tests are NOT failing due to infrastructure issues.**  
**Root cause**: Simple displayName mismatch between Keycloak config and test expectations.  
**Fix**: 5-minute update to Keycloak IdP displayName.  
**Impact**: Will unblock 4 test cases (DEU LEVEL_1 through LEVEL_4).

---

**Status**: ✅ Analysis Complete  
**Blocker**: No (tests can proceed, DEU marked as known issue)  
**Priority**: Medium (fix during Day 3-4 implementation)
