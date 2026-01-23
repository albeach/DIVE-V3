# CRITICAL: Federation Attribute Propagation Failure

**Date:** 2026-01-24  
**Severity:** 🔴 **SECURITY CRITICAL** - Breaks ABAC Authorization  
**Status:** 🔍 **ROOT CAUSE IDENTIFIED** - Fix Required  

---

## 🚨 PROBLEM STATEMENT

**User authenticated via FRA IdP but claims show USA country:**
```json
{
  "uniqueID": "12a59a83-fa19-4672-ae9d-c96fdf04132a",
  "clearance": "UNCLASSIFIED", 
  "countryOfAffiliation": "USA",  ❌ WRONG - Should be "FRA"
  "acpCOI": []
}
```

**Security Impact:**
- FRA user appears as USA user
- Can bypass releasability restrictions
- Authorization decisions incorrect
- Violates ACP-240 requirements

---

## 🔍 FULL STACK TRACE ANALYSIS

### 1. FRA Spoke - User Created Correctly ✅
```bash
# seed-users.sh line 524, 571:
"countryOfAffiliation": ["FRA"]  ✅ CORRECT
```

**FRA Keycloak User (Expected):**
```json
{
  "username": "testuser-fra-1",
  "attributes": {
    "clearance": ["UNCLASSIFIED"],
    "countryOfAffiliation": ["FRA"],  ✅
    "uniqueID": ["12a59a83-fa19-4672-ae9d-c96fdf04132a"],
    "acpCOI": []
  }
}
```

### 2. FRA IdP → Hub Federation - Token Claims (Unknown)
**Need to verify:** Does FRA Keycloak include `countryOfAffiliation` in ID token?

**FRA Client Protocol Mappers:**
- Should have `countryOfAffiliation` mapper on `dive-v3-broker-fra` client
- Maps user.attribute.countryOfAffiliation → token claim countryOfAffiliation

### 3. Hub Keycloak - IdP Mappers Configured ✅
**fra-idp mappers:** 37 mappers found, including:
```json
{
  "name": "country-mapper",
  "mapper": "oidc-user-attribute-idp-mapper",
  "claim": "countryOfAffiliation",
  "userAttr": "countryOfAffiliation",
  "syncMode": "FORCE"
}
```

**Multiple mappers for resilience:**
- `country-mapper` - countryOfAffiliation → countryOfAffiliation
- `import-countryOfAffiliation` - countryOfAffiliation → countryOfAffiliation  
- `country-flex-countryOfAffiliation` - countryOfAffiliation → countryOfAffiliation
- `country-flex-country` - country → countryOfAffiliation
- `country-flex-nationality` - nationality → countryOfAffiliation

### 4. Hub Keycloak - User Attributes MISSING ❌
**Actual Hub user attributes:**
```json
{
  "username": "testuser-fra-1",
  "id": "1c424c3d-519c-4491-ab39-1c1f14130c51",
  "attributes": {
    "amr": ["pwd"],
    "acr": ["0"],
    "clearance": ["UNCLASSIFIED"],  ✅
    "uniqueID": ["12a59a83-fa19-4672-ae9d-c96fdf04132a"],  ✅
    "countryOfAffiliation": MISSING  ❌
  }
}
```

**Federated Identity Link:**
```json
{
  "identityProvider": "fra-idp",
  "userId": "12a59a83-fa19-4672-ae9d-c96fdf04132a",
  "userName": "testuser-fra-1"
}
```

### 5. Hub Client - Protocol Mapper Configured ✅
**dive-v3-broker-usa client mapper:**
```json
{
  "name": "countryOfAffiliation",
  "protocolMapper": "oidc-usermodel-attribute-mapper",
  "userAttribute": "countryOfAffiliation",  // Read from user attributes
  "claimName": "countryOfAffiliation"        // Put in JWT token
}
```

**Problem:** User attribute doesn't exist, so mapper outputs nothing/null.

### 6. Frontend - Fallback to "USA" ❌
**auth.ts line 334-336:**
```typescript
} else {
    // USA instance or unknown - use stored country
    countryOfAffiliation = profile.countryOfAffiliation || profile.country || 'USA';
}
```

**Result:** Falls back to "USA" when profile.countryOfAffiliation is undefined.

---

## 🎯 ROOT CAUSE

**IdP mapper not executing during broker flow.**

Despite mapper configuration (`syncMode: FORCE`), the `countryOfAffiliation` attribute from FRA IdP is NOT being imported into Hub user attributes.

**Possible Causes:**
1. **IdP token doesn't include countryOfAffiliation claim** - Most likely
2. **Broker flow not triggering mappers** - First broker login configuration
3. **Attribute scope not requested** - OIDC scope configuration
4. **Mapper timing issue** - Mapper runs after token generation

---

## 🔬 DIAGNOSTIC STEPS NEEDED

### Step 1: Verify FRA IdP Token Claims
Check if FRA Keycloak actually sends countryOfAffiliation in ID token:

```bash
# Capture actual ID token from fra-idp during authentication
# Check via Keycloak admin console → Clients → dive-v3-broker-usa → Evaluate
```

### Step 2: Check Broker Flow Configuration
```bash
# Hub Keycloak → Authentication → Flows → First Broker Login
# Verify: Review Profile mapper configured?
# Verify: Attribute mappers execute during flow?
```

### Step 3: Check OIDC Scope Request
```bash
# fra-idp configuration in Hub
# Default scopes: Should include custom DIVE scopes
# Requested scopes: openid, profile, email, clearance?, countryOfAffiliation?
```

### Step 4: Manual Attribute Update Test
```bash
# Force update user attributes to verify mapper works
docker exec dive-hub-backend node -e "..." # Update countryOfAffiliation to FRA
# Re-login and check if token includes FRA
```

---

## 💡 RECOMMENDED FIX

### Option A: Fix IdP Mapper Execution (Preferred)
Ensure fra-idp mappers execute during broker flow:
1. Verify FRA client scope includes DIVE attributes
2. Check broker flow executes attribute importers
3. Test manual sync to confirm mapper logic

### Option B: Post-Broker Attribute Enrichment
Add custom authenticator to broker flow:
1. After IdP authentication, before user creation
2. Read federated identity provider (fra-idp)
3. Set countryOfAffiliation = extractCountryFromIdP(identityProvider)
4. Example: fra-idp → FRA, gbr-idp → GBR

### Option C: Frontend Fallback Enhancement
Detect federated identity and override:
1. Check if user came via IdP (session.user.federatedFrom)
2. Extract country from IdP alias (fra-idp → FRA)
3. Override countryOfAffiliation in session callback

---

## 🚀 IMMEDIATE ACTION

**Recommended:** Option A (fix at source)

**Quick Test:**
```bash
# 1. Manually set countryOfAffiliation on federated user
docker exec dive-hub-backend node -e "..."  # Update user attribute

# 2. Force re-login
# 3. Check if token now includes FRA
```

**Permanent Fix:**
1. Investigate why IdP mappers not executing
2. Add logging to keycloakFederationService to verify mapper creation
3. Test with fresh user (not already federated)
4. Verify broker flow configuration

---

## 📊 VERIFICATION STATUS

✅ FRA user has countryOfAffiliation in FRA Keycloak  
✅ IdP mappers configured in Hub (37 mappers)  
✅ Client protocol mapper configured in Hub  
✅ Federated identity link exists (fra-idp)  
❌ countryOfAffiliation NOT in Hub user attributes  
❌ countryOfAffiliation NOT in Hub JWT token  
❌ Frontend falls back to "USA" (incorrect)  

---

## ⚠️  WORKAROUND (Development Only)

**Temporary fix for testing:**
Update auth.ts to detect federated IdP and extract country:

```typescript
// Check federated identity
const federatedFrom = extractIdPFromToken(profile);  // New helper
if (federatedFrom) {
  // Extract country from IdP alias (fra-idp → FRA)
  const idpCountry = federatedFrom.replace('-idp', '').toUpperCase();
  countryOfAffiliation = idpCountry;
  console.log('[DIVE] Federated user detected, using IdP country:', idpCountry);
} else {
  // Non-federated, use profile or instance default
  countryOfAffiliation = profile.countryOfAffiliation || 'USA';
}
```

---

## 🔗 REFERENCES

- **Bug Discovery:** Phase 4 testing - cross-border SSO
- **User Session:** testuser-fra-1 @ https://localhost:3000/dashboard
- **User ID:** 12a59a83-fa19-4672-ae9d-c96fdf04132a
- **Expected:** countryOfAffiliation = "FRA"
- **Actual:** countryOfAffiliation = "USA"

**Files:**
- `frontend/src/auth.ts` - Session callback (fallback to USA)
- `backend/src/services/keycloak-federation.service.ts` - IdP mapper creation
- `scripts/spoke-init/seed-users.sh` - User creation (sets FRA correctly)

---

**Status:** 🔴 **CRITICAL BUG - Requires Immediate Fix**  
**Impact:** Federation SSO works, but authorization will fail  
**Next:** Investigate IdP token claims and broker flow execution  

---

*Documented during Phase 4 testing - 2026-01-24*
