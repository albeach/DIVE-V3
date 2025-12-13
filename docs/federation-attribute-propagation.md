# Federation Attribute Propagation - Complete Solution

## Executive Summary

**Status:** ✅ **WORKING** - Federation with attribute propagation fully operational  
**Date:** 2025-12-13  
**Completion:** 3 out of 4 DIVE attributes working (acpCOI requires custom mapper)

This document describes the complete solution for propagating DIVE V3 security attributes (clearance, countryOfAffiliation, acpCOI, uniqueID) across federated Keycloak instances.

---

## The Problem

### Initial Symptom
User `testuser-gbr-1` successfully authenticated from GBR to USA Hub, but **NO DIVE attributes were transmitted**. The USA Hub user profile had:
```json
{
  "username": "testuser-gbr-1",
  "attributes": {}  // EMPTY!
}
```

### Subsequent Error
After adding protocol mappers:
```
Server error - Configuration
ERROR: cannot map type for token claim
WARN: Multiple values found '[FVEY, NATO-COSMIC]' for protocol mapper 'acpCOI' 
      but expected just single value
```

---

## Root Causes Identified

### 1. Missing User Attributes in Source (GBR)
The GBR test user (`testuser-gbr-1`) had **empty attributes**.

**Fix:** Add DIVE attributes to user profile:
```bash
docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh update users/{USER_ID} \
  -r dive-v3-broker-gbr \
  -s 'attributes.clearance=["SECRET"]' \
  -s 'attributes.countryOfAffiliation=["GBR"]' \
  -s 'attributes.acpCOI=["FVEY","NATO-COSMIC"]' \
  -s 'attributes.uniqueID=["testuser-gbr-1@gbr.dive25.com"]'
```

### 2. Missing Protocol Mappers in USA Hub IdP
The USA Hub's `gbr-idp` had **zero protocol mappers** to extract claims from GBR tokens.

**Fix:** Add OIDC attribute mappers:
```bash
docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh create \
  identity-provider/instances/gbr-idp/mappers -r dive-v3-broker \
  -s name=clearance-mapper \
  -s identityProviderAlias=gbr-idp \
  -s identityProviderMapper=oidc-user-attribute-idp-mapper \
  -s 'config."claim"=clearance' \
  -s 'config."user.attribute"=clearance' \
  -s 'config."syncMode"=INHERIT'
```

### 3. Missing Protocol Mappers in GBR Client Scopes
GBR's `dive-v3-cross-border-client` scopes existed but had **no protocol mappers** to include user attributes in tokens.

**Fix:** Add protocol mappers to each client scope.

### 4. DIVE Scopes as OPTIONAL Instead of DEFAULT ⚠️ **CRITICAL**
The DIVE client scopes were assigned as **OPTIONAL**, not **DEFAULT**. This meant they were NOT automatically included in tokens.

**Fix:** Move DIVE scopes from optional to default client scopes.

### 5. Keycloak's Internal Array Storage 🔑 **KEY INSIGHT**
Keycloak **ALWAYS** stores user attributes as arrays internally, even for single values:
```json
{
  "clearance": ["SECRET"],              // Array with 1 element
  "countryOfAffiliation": ["GBR"],      // Array with 1 element
  "acpCOI": ["FVEY", "NATO-COSMIC"]     // Array with 2 elements
}
```

Protocol mappers with `multivalued=false` + `jsonType=String` **cannot handle arrays**, causing the error:
```
RuntimeException: cannot map type for token claim
```

**Fix:** Add `aggregate.attrs=true` to extract the first element for single-valued attributes.

### 6. acpCOI Multi-Valued Array Mapper Incompatibility
The standard `oidc-usermodel-attribute-mapper` cannot properly handle multi-valued arrays with `jsonType=JSON`.

**Workaround:** Remove the protocol mapper for `acpCOI` (scope remains available, but claim not included in token).

**TODO:** Implement custom JavaScript mapper or attribute aggregator for `acpCOI`.

---

## The Solution

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ATTRIBUTE PROPAGATION FLOW                    │
└─────────────────────────────────────────────────────────────────┘

1. GBR USER ATTRIBUTES (Source)
   ┌──────────────────────────────────────────┐
   │ testuser-gbr-1                            │
   │ attributes: {                             │
   │   clearance: ["SECRET"]                   │
   │   countryOfAffiliation: ["GBR"]           │
   │   acpCOI: ["FVEY", "NATO-COSMIC"]         │
   │   uniqueID: ["testuser-gbr-1@gbr..."]     │
   │ }                                         │
   └──────────────────────────────────────────┘
                    │
                    │ (User authenticates)
                    ▼
2. GBR CLIENT SCOPE PROTOCOL MAPPERS
   ┌──────────────────────────────────────────┐
   │ clearance scope → mapper:                 │
   │   multivalued=false                       │
   │   aggregate.attrs=true                    │
   │   jsonType=String                         │
   │   Result: "SECRET" (string)               │
   │                                           │
   │ countryOfAffiliation scope → mapper:      │
   │   multivalued=false                       │
   │   aggregate.attrs=true                    │
   │   jsonType=String                         │
   │   Result: "GBR" (string)                  │
   │                                           │
   │ uniqueID scope → mapper:                  │
   │   multivalued=false                       │
   │   aggregate.attrs=true                    │
   │   jsonType=String                         │
   │   Result: "testuser-gbr-1@..." (string)   │
   │                                           │
   │ acpCOI scope:                             │
   │   ⚠️  NO MAPPER (workaround)               │
   │   Result: Not included in token           │
   └──────────────────────────────────────────┘
                    │
                    │ (Token generated)
                    ▼
3. GBR ID TOKEN / ACCESS TOKEN
   ┌──────────────────────────────────────────┐
   │ {                                         │
   │   "sub": "367d480e-...",                  │
   │   "clearance": "SECRET",                  │
   │   "countryOfAffiliation": "GBR",          │
   │   "uniqueID": "testuser-gbr-1@gbr...",    │
   │   // acpCOI missing                       │
   │ }                                         │
   └──────────────────────────────────────────┘
                    │
                    │ (OIDC callback to USA Hub)
                    ▼
4. USA HUB IdP PROTOCOL MAPPERS
   ┌──────────────────────────────────────────┐
   │ Extract claims from GBR token:            │
   │   clearance-mapper                        │
   │   countryOfAffiliation-mapper             │
   │   uniqueID-mapper                         │
   │   acpCOI-mapper (will be empty)           │
   │                                           │
   │ syncMode: INHERIT                         │
   │ Result: Attributes copied to USA Hub user │
   └──────────────────────────────────────────┘
                    │
                    ▼
5. USA HUB USER ATTRIBUTES (Destination)
   ┌──────────────────────────────────────────┐
   │ testuser-gbr-1 (federated)                │
   │ attributes: {                             │
   │   clearance: ["SECRET"]                   │
   │   countryOfAffiliation: ["GBR"]           │
   │   uniqueID: ["testuser-gbr-1@gbr..."]     │
   │   // acpCOI missing                       │
   │ }                                         │
   │                                           │
   │ federatedIdentities: [{                   │
   │   identityProvider: "gbr-idp",            │
   │   userId: "367d480e-..."                  │
   │ }]                                        │
   └──────────────────────────────────────────┘
                    │
                    ▼
6. AVAILABLE FOR OPA AUTHORIZATION ✅
```

---

## Backend Implementation (Persistent)

### 1. Enhanced `ensureDiveClientScopes()` Method

**Location:** `backend/src/services/keycloak-federation.service.ts`

**Changes:**
```typescript
for (const scopeConfig of requiredScopes) {
  // Create scope if doesn't exist
  // ...
  
  // NEW: Add protocol mapper to the scope
  await this.ensureProtocolMapperForScope(scopeConfig.name);
}
```

**Effect:** Automatically creates protocol mappers when scopes are created.

### 2. New Method: `ensureProtocolMapperForScope()`

```typescript
private async ensureProtocolMapperForScope(scopeName: string): Promise<void> {
  // Skip acpCOI - multivalued arrays cause "cannot map type" error
  if (scopeName === 'acpCOI') {
    logger.info('Skipping protocol mapper for acpCOI (multivalued - requires custom mapper)');
    return;
  }

  // Create protocol mapper for single-valued attributes
  await this.kcAdmin.clientScopes.addProtocolMapper({
    id: scope.id,
    realm: this.realm
  }, {
    name: `${scopeName}-mapper`,
    protocol: 'openid-connect',
    protocolMapper: 'oidc-usermodel-attribute-mapper',
    config: {
      'user.attribute': scopeName,
      'claim.name': scopeName,
      'jsonType.label': 'String',
      'id.token.claim': 'true',
      'access.token.claim': 'true',
      'userinfo.token.claim': 'true',
      'multivalued': 'false',
      'aggregate.attrs': 'true',  // CRITICAL: Extract first element
    },
  });
}
```

**Key Configuration:**
- ✅ `aggregate.attrs=true`: Extracts first element from Keycloak's internal array storage
- ✅ `multivalued=false`: Outputs as single string, not array
- ✅ `jsonType=String`: Serializes as JSON string
- ⚠️ `acpCOI`: Skipped to avoid "cannot map type" error

### 3. Updated `assignDiveScopesToClient()` Method

**Changed:** Line ~334
```typescript
// OLD: addOptionalClientScope
await this.kcAdmin.clients.addOptionalClientScope({
  id: clientUuid,
  clientScopeId: scope.id,
});

// NEW: addDefaultClientScope
await this.kcAdmin.clients.addDefaultClientScope({
  id: clientUuid,
  clientScopeId: scope.id,
});
```

**Critical Difference:**
- **OPTIONAL scopes:** Only included if explicitly requested by client OR user consents
- **DEFAULT scopes:** Automatically included in ALL tokens

### 4. Existing `createDIVEAttributeMappers()` Method

**Already working!** Creates IdP protocol mappers in USA Hub to extract claims from GBR tokens.

**No changes needed** - this method already creates the correct mappers with `syncMode: INHERIT`.

---

## Configuration Matrix

### GBR Keycloak (Source)

#### User Attributes (Internal Storage)
| Attribute | Value | Storage Format |
|-----------|-------|----------------|
| clearance | `["SECRET"]` | Array (1 element) |
| countryOfAffiliation | `["GBR"]` | Array (1 element) |
| uniqueID | `["testuser-gbr-1@gbr.dive25.com"]` | Array (1 element) |
| acpCOI | `["FVEY", "NATO-COSMIC"]` | Array (2 elements) |

#### Client Scopes (Protocol Mappers)
| Scope | Mapper | Config | Result in Token |
|-------|--------|--------|-----------------|
| clearance | ✅ Yes | aggregate.attrs=true, multivalued=false, jsonType=String | `"SECRET"` (string) |
| countryOfAffiliation | ✅ Yes | aggregate.attrs=true, multivalued=false, jsonType=String | `"GBR"` (string) |
| uniqueID | ✅ Yes | aggregate.attrs=true, multivalued=false, jsonType=String | `"testuser-gbr-1@gbr.dive25.com"` (string) |
| acpCOI | ❌ **NO MAPPER** | N/A | Not included |

#### Client Configuration
```json
{
  "clientId": "dive-v3-cross-border-client",
  "defaultClientScopes": [
    "openid", "profile", "email",
    "clearance", "countryOfAffiliation", "uniqueID", "acpCOI"
  ]
}
```

**Critical:** All DIVE scopes are **DEFAULT**, not optional.

### USA Hub Keycloak (Destination)

#### IdP Configuration
```json
{
  "alias": "gbr-idp",
  "config": {
    "defaultScope": "openid profile email clearance countryOfAffiliation acpCOI uniqueID"
  }
}
```

#### IdP Protocol Mappers
| Mapper | Claim | User Attribute | Sync Mode |
|--------|-------|----------------|-----------|
| clearance-mapper | `clearance` | `clearance` | INHERIT |
| countryOfAffiliation-mapper | `countryOfAffiliation` | `countryOfAffiliation` | INHERIT |
| uniqueID-mapper | `uniqueID` | `uniqueID` | INHERIT |
| acpCOI-mapper | `acpCOI` | `acpCOI` | INHERIT |

**Sync Mode INHERIT:** Updates user attributes on every login.

---

## Current Working State

### ✅ Attributes Successfully Propagated
- **clearance:** `"SECRET"` (string)
- **countryOfAffiliation:** `"GBR"` (string)
- **uniqueID:** `"testuser-gbr-1@gbr.dive25.com"` (string)

### ⚠️ Known Limitation
- **acpCOI:** Not included in tokens (protocol mapper removed to avoid error)

**Impact:**
- Authorization policies that require COI membership will fail
- User can authenticate but may not access COI-restricted resources

**Workaround:**
- Set default COI in OPA policy for federated users
- OR implement custom JavaScript protocol mapper

---

## Manual Configuration Steps (Applied)

These steps were manually applied to the current deployment. The backend code updates ensure they're automatically applied for future instances.

### 1. Add User Attributes (GBR)
```bash
GBR_ADMIN_PW=$(gcloud secrets versions access latest --secret=dive-v3-keycloak-gbr --project=dive25)
docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user admin --password "$GBR_ADMIN_PW"

GBR_USER_ID=$(docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh get users \
  -r dive-v3-broker-gbr -q username=testuser-gbr-1 | jq -r '.[0].id')

docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh update users/$GBR_USER_ID \
  -r dive-v3-broker-gbr \
  -s 'attributes.clearance=["SECRET"]' \
  -s 'attributes.countryOfAffiliation=["GBR"]' \
  -s 'attributes.acpCOI=["FVEY","NATO-COSMIC"]' \
  -s 'attributes.uniqueID=["testuser-gbr-1@gbr.dive25.com"]'
```

### 2. Add Protocol Mappers to GBR Client Scopes
```bash
# For each single-valued scope (clearance, countryOfAffiliation, uniqueID)
docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh create \
  client-scopes/{SCOPE_ID}/protocol-mappers/models -r dive-v3-broker-gbr \
  -s name={SCOPE_NAME}-mapper \
  -s protocol=openid-connect \
  -s protocolMapper=oidc-usermodel-attribute-mapper \
  -s 'config."user.attribute"={SCOPE_NAME}' \
  -s 'config."claim.name"={SCOPE_NAME}' \
  -s 'config."jsonType.label"=String' \
  -s 'config."id.token.claim"=true' \
  -s 'config."access.token.claim"=true' \
  -s 'config."userinfo.token.claim"=true' \
  -s 'config."multivalued"=false' \
  -s 'config."aggregate.attrs"=true'  # CRITICAL!

# For acpCOI: DELETE the mapper (causes errors)
docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh delete \
  client-scopes/{COI_SCOPE_ID}/protocol-mappers/models/{MAPPER_ID} \
  -r dive-v3-broker-gbr
```

### 3. Move DIVE Scopes to DEFAULT (Critical!)
```bash
TOKEN=$(curl -sk -X POST "https://localhost:8446/realms/master/protocol/openid-connect/token" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=$GBR_ADMIN_PW" | jq -r '.access_token')

GBR_CLIENT_UUID="c6f63fe4-e8e6-449a-b833-8934995d1458"

# For each DIVE scope
for SCOPE_ID in {clearance,country,coi,uniqueid}_SCOPE_IDS; do
  curl -sk -X PUT \
    "https://localhost:8446/admin/realms/dive-v3-broker-gbr/clients/$GBR_CLIENT_UUID/default-client-scopes/$SCOPE_ID" \
    -H "Authorization: Bearer $TOKEN"
done
```

### 4. Add IdP Mappers (USA Hub)
```bash
# Already handled by backend's createDIVEAttributeMappers() method
# No manual intervention needed
```

---

## Backend Code Changes (Persistent)

### Files Modified

#### 1. `backend/src/services/keycloak-federation.service.ts`

**Line ~215: Added `ensureProtocolMapperForScope()` call:**
```typescript
for (const scopeConfig of requiredScopes) {
  // Create scope...
  
  // NEW: Add protocol mapper to the scope
  await this.ensureProtocolMapperForScope(scopeConfig.name);
}
```

**Line ~220-300: New method `ensureProtocolMapperForScope()`:**
- Automatically creates protocol mappers for client scopes
- Skips `acpCOI` to avoid "cannot map type" error
- Configures `aggregate.attrs=true` for single-valued attributes

**Line ~420: Changed `addOptionalClientScope` → `addDefaultClientScope`:**
```typescript
// Assign each DIVE scope as DEFAULT (not optional)
await this.kcAdmin.clients.addDefaultClientScope({
  id: clientUuid,
  clientScopeId: scope.id,
});
```

---

## Testing & Verification

### Manual Test (Browser)
```bash
# 1. Clear browser cookies for localhost
# 2. Navigate to https://localhost:3000
# 3. Click "United Kingdom"
# 4. Login: testuser-gbr-1 / TestUser2025!Pilot
# 5. Verify successful authentication ✅
```

### Verify Attributes in USA Hub
```bash
USA_KC_PW="..."
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

### Verify Token Claims (GBR)
```bash
# Get a test token from GBR
TOKEN=$(curl -sk -X POST "https://localhost:8446/realms/dive-v3-broker-gbr/protocol/openid-connect/token" \
  -d "grant_type=password" \
  -d "client_id=dive-v3-cross-border-client" \
  -d "client_secret={SECRET}" \
  -d "username=testuser-gbr-1" \
  -d "password=TestUser2025!Pilot" | jq -r '.access_token')

# Decode token
echo $TOKEN | cut -d. -f2 | base64 -d 2>/dev/null | jq .
```

**Expected Claims:**
```json
{
  "sub": "367d480e-...",
  "clearance": "SECRET",
  "countryOfAffiliation": "GBR",
  "uniqueID": "testuser-gbr-1@gbr.dive25.com",
  "email": "testuser-gbr-1@gbr.dive25.com"
}
```

---

## Troubleshooting

### Error: "cannot map type for token claim"

**Cause:** Protocol mapper trying to serialize array as string

**Solutions:**
1. **Single-valued attributes:** Add `aggregate.attrs=true` to extract first element
2. **Multi-valued attributes:** Remove the mapper temporarily OR use custom script mapper

### Error: "invalid_scope"

**Cause:** USA Hub requests scope that doesn't exist in GBR

**Solution:** Ensure scope exists in GBR, even if it has no mapper:
```bash
# Scope can exist without mapper - just won't include claim in token
```

### Error: Attributes not appearing in USA Hub

**Causes:**
1. GBR user has empty attributes
2. USA Hub IdP has no protocol mappers
3. DIVE scopes are OPTIONAL instead of DEFAULT
4. Federated user needs to be recreated

**Solution:**
```bash
# Delete federated user to force re-creation
USA_USER_ID=$(docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh get users \
  -r dive-v3-broker -q username=testuser-gbr-1 | jq -r '.[0].id')
docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh delete \
  users/$USA_USER_ID -r dive-v3-broker
```

---

## Known Limitations & Future Work

### 1. acpCOI Multi-Valued Attribute ⚠️

**Current State:** Not propagated (mapper removed)

**Impact:** 
- COI-based authorization policies cannot evaluate user's COI membership
- User can authenticate but may be denied access to COI-restricted resources

**Solutions to Implement:**

**Option A: Custom JavaScript Protocol Mapper**
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

**Option B: Hardcoded List Mapper**
- Use `oidc-hardcoded-claim-mapper` with JSON array
- Less flexible, but works without scripting

**Option C: Default COI in OPA**
- Assume federated users from GBR have FVEY membership
- Less accurate, but pragmatic for pilot

### 2. Attribute Sync on Profile Updates

**Current:** Attributes synced only on login (`syncMode: INHERIT`)

**Limitation:** If GBR user's clearance changes, USA Hub won't know until next login

**Future:** Implement webhook or periodic sync for critical attribute changes

### 3. Attribute Enrichment

**Current:** Relies on source IdP having all attributes

**Future:** Implement attribute enrichment in USA Hub:
- Derive `countryOfAffiliation` from email domain for industry users
- Apply default `clearance` for unclassified users
- Handle missing attributes gracefully

---

## Deployment Checklist

### For Each New Federation Instance

- [ ] **Step 1:** Add DIVE attributes to test users in source Keycloak
- [ ] **Step 2:** Run `dive federation link {INSTANCE}` (backend auto-configures)
- [ ] **Step 3:** Verify scopes are DEFAULT (not optional)
- [ ] **Step 4:** Test authentication flow
- [ ] **Step 5:** Verify attributes in destination user profile
- [ ] **Step 6:** Test authorization with OPA policy

### Backend Handles Automatically
- ✅ Creates DIVE client scopes
- ✅ Adds protocol mappers (except acpCOI)
- ✅ Assigns scopes as DEFAULT to cross-border client
- ✅ Creates IdP protocol mappers in destination

### Manual Steps Still Required
- ⚠️ Add user attributes to source Keycloak users
- ⚠️ Fix acpCOI multi-valued mapper (custom solution)

---

## Security Considerations

### Attribute Trust
- Attributes from federated IdPs are **TRUSTED** by default
- No validation or verification of attribute values
- **Risk:** Malicious IdP could assert false clearance levels

**Mitigations:**
1. Federation trust established via manual spoke approval
2. Certificate-based mutual authentication (TLS)
3. Audit logs track attribute assertions
4. Consider attribute validation rules in OPA

### Attribute Disclosure
- GBR users' attributes are visible to USA Hub
- Includes PII (uniqueID, email)
- Clearance levels revealed

**Best Practices:**
1. Only federate with trusted partners
2. Log attribute access for audit
3. Apply data retention policies
4. Minimize attribute sharing (only request necessary attributes)

---

## References

- Keycloak Identity Brokering: https://www.keycloak.org/docs/latest/server_admin/#_identity_broker
- Protocol Mappers: https://www.keycloak.org/docs/latest/server_admin/#_protocol-mappers
- Client Scopes: https://www.keycloak.org/docs/latest/server_admin/#_client_scopes
- OIDC Core Spec: https://openid.net/specs/openid-connect-core-1_0.html

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

**Status:** Core functionality working, acpCOI requires follow-up implementation.

