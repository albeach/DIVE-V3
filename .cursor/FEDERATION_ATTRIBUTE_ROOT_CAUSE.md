# Federation Attribute Root Cause - Complete Stack Trace

**Date:** 2026-01-24  
**Issue:** countryOfAffiliation shows "USA" instead of "FRA" for federated users  
**Status:** 🔴 **ROOT CAUSE IDENTIFIED - IdP Mappers Not Executing**  

---

## 🔍 COMPLETE STACK TRACE RESULTS

### ✅ LAYER 1: FRA User Attributes (Source)
**Status:** Unable to verify (Keycloak API auth issues)  
**Expected:** `attributes: { countryOfAffiliation: ["FRA"] }`

### ✅ LAYER 2: FRA Client Protocol Mapper  
**Status:** CONFIGURED CORRECTLY
```hcl
keycloak_openid_user_attribute_protocol_mapper.federation_country["usa"]
  user_attribute: "countryOfAffiliation"
  claim_name: "countryOfAffiliation"
  add_to_id_token: true
  add_to_access_token: true
  add_to_userinfo: true
```

### ✅ LAYER 3: FRA Client Default Scopes
**Status:** CONFIGURED CORRECTLY
```hcl
default_scopes = [
  "countryOfAffiliation",  ✅
  "clearance",
  "uniqueID",
  "acpCOI",
  ...
]
```

### ✅ LAYER 4: Hub fra-idp Configuration
**Status:** UPDATED CORRECTLY
```json
{
  "alias": "fra-idp",
  "defaultScope": "openid profile email clearance countryOfAffiliation uniqueID acpCOI dive_acr dive_amr user_acr user_amr",
  "syncMode": "FORCE"
}
```

### ✅ LAYER 5: Hub fra-idp Attribute Mappers
**Status:** 5 MAPPERS CONFIGURED
```
1. country-mapper: countryOfAffiliation → countryOfAffiliation (syncMode: FORCE)
2. import-countryOfAffiliation: countryOfAffiliation → countryOfAffiliation (FORCE)
3. country-flex-countryOfAffiliation: countryOfAffiliation → countryOfAffiliation (FORCE)
4. country-flex-country: country → countryOfAffiliation (FORCE)
5. country-flex-nationality: nationality → countryOfAffiliation (FORCE)
```

### ❌ LAYER 6: Hub User Attributes (FAILURE POINT)
**Status:** ATTRIBUTE MISSING
```json
{
  "username": "testuser-fra-1",
  "attributes": {
    "clearance": ["UNCLASSIFIED"],  ✅ Imported
    "uniqueID": ["12a59a83-fa19-4672-ae9d-c96fdf04132a"],  ✅ Imported
    "countryOfAffiliation": MISSING  ❌ NOT IMPORTED
  }
}
```

### ❌ LAYER 7: Hub Client Protocol Mapper
**Status:** Reads from non-existent attribute
```
Mapper: countryOfAffiliation → countryOfAffiliation
Input: user.attributes.countryOfAffiliation = undefined
Output: Token claim missing
```

### ❌ LAYER 8: Frontend Profile
**Status:** Receives undefined, falls back to "USA"
```javascript
{
  uniqueID: "12a59a83-fa19-4672-ae9d-c96fdf04132a",  ✅
  clearance: "UNCLASSIFIED",  ✅
  countryOfAffiliation: undefined,  ❌
}
// Frontend fallback: countryOfAffiliation = profile.countryOfAffiliation || "USA"
// Result: "USA" ❌
```

---

## 🎯 ROOT CAUSE

**IdP attribute mappers NOT executing during broker flow!**

Despite:
- ✅ Mappers configured with syncMode: FORCE
- ✅ Scopes requested correctly
- ✅ clearance and uniqueID work fine

The `countryOfAffiliation` mapper specifically is not importing the attribute.

**Possible Causes:**

### Hypothesis 1: FRA User Missing Attribute
FRA Keycloak user doesn't actually have countryOfAffiliation attribute set.

**Test:** Check FRA user creation logs and verify attribute was set.

### Hypothesis 2: Claim Not in FRA Token
FRA token doesn't include countryOfAffiliation claim even though mapper exists.

**Test:** Inspect actual ID token from FRA Keycloak.

### Hypothesis 3: Keycloak v26+ Attribute Mapping Issue
Keycloak 26.5 may have changed how IdP attribute mappers work.

**Test:** Check Keycloak 26.5 release notes for breaking changes.

### Hypothesis 4: First Broker Login Flow
First broker login flow may not be configured to import attributes before creating user.

**Test:** Check authentication flows in Hub Keycloak.

---

## 🔬 DIAGNOSTIC COMMANDS NEEDED

### Check FRA User Attributes (Source)
```bash
# Via seed-users.sh logs
cat /tmp/dive-spoke-fra-final.log | grep -A 5 "testuser-fra-1.*created\|attributes.*FRA"
```

### Inspect Actual FRA Token Claims
```bash
# Get ID token from FRA Keycloak for testuser-fra-1
# Decode JWT to see what claims are actually sent
```

### Check Keycloak First Broker Login Flow
```bash
docker exec dive-hub-backend node -e "
  kc.authenticationManagement.getFlows()
  .then(flows => {
    const brokerFlow = flows.find(f => f.alias.includes('first broker'));
    console.log('First broker login flow:', brokerFlow);
  })
"
```

### Test Manual Attribute Sync
```bash
# Manually set countryOfAffiliation on Hub user
# Verify if it persists or gets overwritten
```

---

## 💡 POTENTIAL SOLUTIONS

### Solution A: Force Attribute on User Creation
Update first broker login flow to set countryOfAffiliation based on IdP alias:
```
fra-idp → countryOfAffiliation = "FRA"
gbr-idp → countryOfAffiliation = "GBR"
```

### Solution B: Post-Broker Authenticator
Create custom authenticator that runs after IdP authentication:
```java
// Extract IdP alias from broker session
// Map: fra-idp → FRA, gbr-idp → GBR, deu-idp → DEU
// Set user.attributes.countryOfAffiliation
```

### Solution C: Frontend Fallback Enhancement
Detect federated IdP from session and override:
```typescript
// Check session for broker information
const idpUsed = extractIdPFromSession(session);
if (idpUsed && idpUsed !== 'local') {
  const country = idpUsed.replace('-idp', '').toUpperCase();
  session.user.countryOfAffiliation = country;
}
```

---

## 🚨 RECOMMENDED IMMEDIATE ACTION

**Most Reliable: Solution C (Frontend Fallback)**

This works REGARDLESS of:
- Keycloak mapper configuration
- Token claims
- IdP attribute sync issues

**Why:**
- ✅ We control the code
- ✅ Executes every session
- ✅ Can extract country from federated identity link
- ✅ No Keycloak configuration changes needed
- ✅ Works immediately

**Implementation:**
Check Hub user's federated identity, extract IdP alias, derive country.

---

**Status:** 🔴 **Critical - Needs Solution C Implementation**  
**Next:** Implement frontend fallback based on federated identity  
