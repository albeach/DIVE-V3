# Federation Attribute Propagation - Quick Start

## ✅ Solution Status: **WORKING & PERSISTENT**

**Date:** 2025-12-13  
**Tested:** USA Hub ↔ GBR Spoke  
**Success Rate:** 75% (3 of 4 DIVE attributes propagating)

---

## What Works Now

### ✅ Attributes Successfully Propagating
| Attribute | Example Value | Status |
|-----------|--------------|--------|
| `clearance` | `"SECRET"` | ✅ Working |
| `countryOfAffiliation` | `"GBR"` | ✅ Working |
| `uniqueID` | `"testuser-gbr-1@gbr.dive25.com"` | ✅ Working |
| `acpCOI` | `["FVEY", "NATO-COSMIC"]` | ⚠️ Not propagated |

### ⚠️ Known Limitation: acpCOI
**Issue:** Multi-valued array attribute causes Keycloak "cannot map type" error  
**Impact:** COI-based authorization policies won't work for federated users  
**Workaround:** OPA can infer COI from `countryOfAffiliation` (e.g., GBR → FVEY)  
**Proper Fix:** Requires custom JavaScript protocol mapper (follow-up task)

---

## How It Works (Architecture)

### 1. GBR User Attributes (Source)
```json
{
  "username": "testuser-gbr-1",
  "attributes": {
    "clearance": ["SECRET"],
    "countryOfAffiliation": ["GBR"],
    "uniqueID": ["testuser-gbr-1@gbr.dive25.com"],
    "acpCOI": ["FVEY", "NATO-COSMIC"]
  }
}
```

### 2. GBR Protocol Mappers Extract Attributes
- **clearance:** `aggregate.attrs=true` → extracts `"SECRET"` from `["SECRET"]`
- **countryOfAffiliation:** `aggregate.attrs=true` → extracts `"GBR"` from `["GBR"]`
- **uniqueID:** `aggregate.attrs=true` → extracts string from array
- **acpCOI:** ❌ No mapper (causes errors)

### 3. GBR Token Contains Attributes
```json
{
  "sub": "367d480e-...",
  "clearance": "SECRET",
  "countryOfAffiliation": "GBR",
  "uniqueID": "testuser-gbr-1@gbr.dive25.com"
}
```

### 4. USA Hub IdP Extracts Claims
USA Hub's `gbr-idp` protocol mappers extract claims from GBR token and save to USA Hub user attributes.

### 5. USA Hub User Profile
```json
{
  "username": "testuser-gbr-1",
  "attributes": {
    "clearance": ["SECRET"],
    "countryOfAffiliation": ["GBR"],
    "uniqueID": ["testuser-gbr-1@gbr.dive25.com"]
  },
  "federatedIdentities": [{
    "identityProvider": "gbr-idp",
    "userId": "367d480e-..."
  }]
}
```

---

## Automatic Configuration (Backend)

### What the Backend Does Automatically

**File:** `backend/src/services/keycloak-federation.service.ts`

#### 1. Creates DIVE Client Scopes
```typescript
await this.ensureDiveClientScopes();
```
- Creates: `clearance`, `countryOfAffiliation`, `acpCOI`, `uniqueID` scopes
- **NEW:** Automatically adds protocol mappers via `ensureProtocolMapperForScope()`

#### 2. Creates Cross-Border Client
```typescript
await this.ensureCrossBorderClient('dive-v3-cross-border-client', secret);
```
- Creates client for federation callbacks
- **CRITICAL:** Assigns DIVE scopes as **DEFAULT** (not optional)

#### 3. Creates IdP Protocol Mappers
```typescript
await this.createDIVEAttributeMappers(idpAlias);
```
- Maps incoming claims to user attributes
- Sync mode: `INHERIT` (updates on every login)

---

## Manual Steps Still Required

### 1. Add Attributes to Source Users

**For each test user in the SOURCE Keycloak (e.g., GBR):**

```bash
# Connect to GBR Keycloak
GBR_ADMIN_PW=$(gcloud secrets versions access latest --secret=dive-v3-keycloak-gbr --project=dive25)
docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user admin --password "$GBR_ADMIN_PW"

# Get user ID
GBR_USER_ID=$(docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh get users \
  -r dive-v3-broker-gbr -q username=testuser-gbr-1 | jq -r '.[0].id')

# Add DIVE attributes
docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh update users/$GBR_USER_ID \
  -r dive-v3-broker-gbr \
  -s 'attributes.clearance=["SECRET"]' \
  -s 'attributes.countryOfAffiliation=["GBR"]' \
  -s 'attributes.acpCOI=["FVEY","NATO-COSMIC"]' \
  -s 'attributes.uniqueID=["testuser-gbr-1@gbr.dive25.com"]'
```

**Why Manual?**
- User attributes are specific to each deployment
- Backend doesn't create test users (only configuration)

---

## Testing the Setup

### 1. Browser Test (End-to-End)
```bash
# Steps:
1. Clear browser cookies for localhost
2. Navigate to: https://localhost:3000
3. Click: "United Kingdom"
4. Login: testuser-gbr-1 / TestUser2025!Pilot
5. Verify: ✅ Authentication succeeds
```

### 2. Verify Attributes in USA Hub
```bash
USA_KC_PW=$(gcloud secrets versions access latest --secret=dive-v3-keycloak-usa --project=dive25)
docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user admin --password "$USA_KC_PW"

# Get federated user
docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh get users \
  -r dive-v3-broker -q username=testuser-gbr-1 | \
  jq '.[] | {username, attributes, federatedIdentities}'
```

**Expected Output:**
```json
{
  "username": "testuser-gbr-1",
  "attributes": {
    "clearance": ["SECRET"],
    "countryOfAffiliation": ["GBR"],
    "uniqueID": ["testuser-gbr-1@gbr.dive25.com"]
  },
  "federatedIdentities": [{
    "identityProvider": "gbr-idp",
    "userId": "367d480e-36ca-493f-b807-19fa38364cea"
  }]
}
```

### 3. Verify Token Claims (GBR)
```bash
# Get a test token
TOKEN=$(curl -sk -X POST "https://localhost:8446/realms/dive-v3-broker-gbr/protocol/openid-connect/token" \
  -d "grant_type=password" \
  -d "client_id=dive-v3-cross-border-client" \
  -d "client_secret=$(gcloud secrets versions access latest --secret=dive-v3-federation-gbr-usa --project=dive25)" \
  -d "username=testuser-gbr-1" \
  -d "password=TestUser2025!Pilot" | jq -r '.access_token')

# Decode token
echo $TOKEN | cut -d. -f2 | base64 -d 2>/dev/null | jq '{clearance, countryOfAffiliation, uniqueID}'
```

**Expected Output:**
```json
{
  "clearance": "SECRET",
  "countryOfAffiliation": "GBR",
  "uniqueID": "testuser-gbr-1@gbr.dive25.com"
}
```

---

## Troubleshooting

### Problem: "cannot map type for token claim"

**Symptoms:**
- GBR Keycloak logs show: `RuntimeException: cannot map type for token claim`
- USA Hub shows: "Identity Provider Unavailable"

**Cause:** Protocol mapper trying to serialize array as string

**Solution:**
```bash
# Verify protocol mappers have aggregate.attrs=true
docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh get \
  client-scopes/{SCOPE_ID}/protocol-mappers/models -r dive-v3-broker-gbr | \
  jq '.[] | {name, config: {aggregate_attrs: .config."aggregate.attrs", multivalued: .config.multivalued}}'
```

**Expected:**
- `aggregate.attrs`: `"true"`
- `multivalued`: `"false"`

**If missing, delete and recreate federation:**
```bash
./dive federation unlink gbr  # Delete existing
./dive federation link gbr    # Re-create with fix
```

---

### Problem: Attributes not appearing in USA Hub

**Symptoms:**
- Authentication succeeds
- USA Hub user profile shows empty `attributes: {}`

**Possible Causes:**

#### 1. GBR user has empty attributes
```bash
# Check GBR user
docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh get users \
  -r dive-v3-broker-gbr -q username=testuser-gbr-1 | jq '.[0].attributes'
```
**Fix:** Add attributes (see "Manual Steps" above)

#### 2. USA Hub IdP has no protocol mappers
```bash
# Check USA Hub IdP mappers
docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh get \
  identity-provider/instances/gbr-idp/mappers -r dive-v3-broker | jq '[.[] | .name]'
```
**Expected:** `["clearance-mapper", "countryOfAffiliation-mapper", "uniqueID-mapper", ...]`

**Fix:** Re-run federation linking:
```bash
./dive federation link gbr
```

#### 3. DIVE scopes are OPTIONAL instead of DEFAULT
```bash
# Check GBR client scopes
docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh get \
  clients/{CLIENT_UUID}/default-client-scopes -r dive-v3-broker-gbr | \
  jq '[.[] | .name] | sort'
```
**Expected:** Should include `clearance`, `countryOfAffiliation`, `uniqueID`

**Fix:** Backend automatically assigns as DEFAULT (if using latest code)

#### 4. Federated user needs to be recreated
```bash
# Delete federated user (forces re-creation on next login)
USA_USER_ID=$(docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh get users \
  -r dive-v3-broker -q username=testuser-gbr-1 | jq -r '.[0].id')
docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh delete \
  users/$USA_USER_ID -r dive-v3-broker

# Re-test login
```

---

### Problem: "invalid_scope" error

**Symptoms:**
- Browser redirected to error page
- Message: "Invalid scopes: clearance countryOfAffiliation acpCOI uniqueID"

**Cause:** USA Hub requests scope that doesn't exist in GBR

**Solution:**
```bash
# Verify scopes exist in GBR
docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh get client-scopes \
  -r dive-v3-broker-gbr | jq '[.[] | select(.name | IN("clearance", "countryOfAffiliation", "acpCOI", "uniqueID"))] | length'
```

**Expected:** `4`

**If missing:**
```bash
# Re-run federation linking (backend creates scopes automatically)
./dive federation link gbr
```

---

## Implementation Details

### Key Backend Changes

#### 1. `ensureProtocolMapperForScope()` Method
**File:** `backend/src/services/keycloak-federation.service.ts`  
**Line:** ~220-300

**Purpose:** Automatically creates protocol mappers for DIVE client scopes

**Configuration:**
```typescript
{
  'user.attribute': scopeName,
  'claim.name': scopeName,
  'jsonType.label': 'String',
  'id.token.claim': 'true',
  'access.token.claim': 'true',
  'userinfo.token.claim': 'true',
  'multivalued': 'false',
  'aggregate.attrs': 'true',  // CRITICAL: Extract first element from array
}
```

**Special Handling:**
- **acpCOI:** Skipped to avoid "cannot map type" error
- **Other scopes:** `aggregate.attrs=true` extracts first element from Keycloak's internal array storage

#### 2. `assignDiveScopesToClient()` Update
**File:** `backend/src/services/keycloak-federation.service.ts`  
**Line:** ~420

**Change:**
```typescript
// OLD: addOptionalClientScope
// NEW: addDefaultClientScope
await this.kcAdmin.clients.addDefaultClientScope({
  id: clientUuid,
  clientScopeId: scope.id,
});
```

**Why DEFAULT?**
- **OPTIONAL scopes:** Only included if explicitly requested OR user consents
- **DEFAULT scopes:** Automatically included in ALL tokens

**Without this change:** Attributes won't be in tokens, even with correct mappers!

---

## Architecture Decision: aggregate.attrs

### Problem
Keycloak stores ALL user attributes as arrays internally:
```json
{
  "clearance": ["SECRET"],              // Array with 1 element
  "countryOfAffiliation": ["GBR"],      // Array with 1 element
}
```

Protocol mappers with `multivalued=false` + `jsonType=String` cannot handle arrays, causing:
```
RuntimeException: cannot map type for token claim
```

### Solution
Add `aggregate.attrs=true` to protocol mapper config:
- Extracts first element from array: `["SECRET"]` → `"SECRET"`
- Serializes as JSON string: `"SECRET"` (not `["SECRET"]`)

### Why This Works
- Keycloak's `OIDCAttributeMapperHelper.mapAttributeValue()` method checks `aggregate.attrs`
- If `true`: Uses `UserModel.getFirstAttribute()` instead of `UserModel.getAttributeStream()`
- Result: Single string value instead of array

### Limitation
Only works for single-valued attributes. Multi-valued attributes (like `acpCOI`) require custom mappers.

---

## Future Work: acpCOI Custom Mapper

### Option A: JavaScript Protocol Mapper
```javascript
// mapper-script.js
var acpCOI = user.getAttribute('acpCOI');
if (acpCOI && acpCOI.size() > 0) {
  var cois = [];
  for (var i = 0; i < acpCOI.size(); i++) {
    cois.push(acpCOI.get(i));
  }
  token.setOtherClaims('acpCOI', cois);
}
```

**Pros:**
- Proper JSON array serialization
- Flexible logic

**Cons:**
- Requires enabling Keycloak script providers
- Security consideration (script execution)

### Option B: Hardcoded List Mapper
Use `oidc-hardcoded-claim-mapper`:
```json
{
  "claim.name": "acpCOI",
  "claim.value": "[\"FVEY\", \"NATO-COSMIC\"]",
  "jsonType": "JSON"
}
```

**Pros:**
- No scripting required
- Simple configuration

**Cons:**
- Not dynamic (doesn't use user attributes)
- Less accurate

### Option C: OPA Inference
In OPA policy, infer COI from `countryOfAffiliation`:
```rego
derived_coi := cois if {
  input.subject.countryOfAffiliation == "GBR"
  cois := ["FVEY"]
}
```

**Pros:**
- No Keycloak changes required
- Centralized logic

**Cons:**
- Less accurate than user-assigned COI
- Policy complexity

**Recommendation:** Implement Option A (JavaScript mapper) for production

---

## References

- **Complete Technical Solution:** `docs/federation-issuer-solution.md`
- **Quick Reference Guide:** `docs/federation-quick-reference.md`
- **Backend Code:** `backend/src/services/keycloak-federation.service.ts`
- **Keycloak Protocol Mappers:** https://www.keycloak.org/docs/latest/server_admin/#_protocol-mappers

---

## Change Log

### 2025-12-13 - Initial Implementation
- ✅ Created `ensureProtocolMapperForScope()` method
- ✅ Updated `assignDiveScopesToClient()` to use DEFAULT scopes
- ✅ Added `aggregate.attrs=true` for single-valued attributes
- ⚠️ Removed acpCOI protocol mapper (temporary workaround)
- ✅ Documented complete solution
- ✅ Manual configuration applied to USA ↔ GBR federation
- ✅ Testing verified: 3 out of 4 attributes working

**Next:** Implement acpCOI custom mapper (follow-up task)
