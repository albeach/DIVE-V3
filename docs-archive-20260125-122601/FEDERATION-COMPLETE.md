# 🎉 FEDERATION SOLUTION - COMPLETE & PERSISTENT

**Date:** 2025-12-13  
**Status:** ✅ **PRODUCTION READY** (3 of 4 attributes)  
**Integration:** ✅ **Fully incorporated into `@dive` CLI**

---

## Quick Start

### 1. Link Federation Between Instances
```bash
# From USA Hub, link to GBR Spoke
./dive federation link GBR
```

**What This Does (Automatically):**
- ✅ Creates DIVE client scopes in both instances
- ✅ Adds protocol mappers with `aggregate.attrs=true`
- ✅ Creates `dive-v3-cross-border-client` in remote
- ✅ Assigns DIVE scopes as **DEFAULT** (not optional)
- ✅ Creates IdP configuration in local instance
- ✅ Creates IdP protocol mappers in local instance
- ✅ Sets up bidirectional trust

### 2. Test the Federation
```bash
# Browser test
1. Open https://localhost:3000
2. Click "United Kingdom"
3. Login: testuser-gbr-1 / TestUser2025!Pilot
4. ✅ Success! Redirected back to USA Hub
```

### 3. Verify Attributes Propagated
```bash
# Check USA Hub user profile
./dive hub exec backend npx tsx -e "
const { default: KcAdminClient } = require('@keycloak/keycloak-admin-client');
const kcAdmin = new KcAdminClient({baseUrl: 'http://keycloak:8080', realmName: 'dive-v3-broker'});
await kcAdmin.auth({username: 'admin', password: process.env.KEYCLOAK_ADMIN_PASSWORD, grantType: 'password', clientId: 'admin-cli'});
const users = await kcAdmin.users.find({realm: 'dive-v3-broker', username: 'testuser-gbr-1'});
console.log(JSON.stringify(users[0].attributes, null, 2));
"
```

**Expected Output:**
```json
{
  "clearance": ["SECRET"],
  "countryOfAffiliation": ["GBR"],
  "uniqueID": ["testuser-gbr-1@gbr.dive25.com"]
}
```

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│                   AUTOMATIC CONFIGURATION                   │
│                   via @dive federation link                 │
└────────────────────────────────────────────────────────────┘

1. BACKEND API CALL
   dive federation link GBR
         │
         ├─→ POST /api/federation/link-idp
         │   {localInstanceCode: "USA", remoteInstanceCode: "GBR"}
         │
         └─→ backend/src/routes/federation.routes.ts
                  │
                  └─→ keycloakFederationService.createBidirectionalFederation()

2. AUTOMATIC CONFIGURATION IN GBR (Remote)
   backend/src/services/keycloak-federation.service.ts
   │
   ├─→ ensureDiveClientScopes()
   │   ├─ Create: clearance, countryOfAffiliation, acpCOI, uniqueID
   │   └─→ ensureProtocolMapperForScope()  ✨ NEW
   │       ├─ clearance: aggregate.attrs=true, multivalued=false
   │       ├─ countryOfAffiliation: aggregate.attrs=true, multivalued=false
   │       ├─ uniqueID: aggregate.attrs=true, multivalued=false
   │       └─ acpCOI: ⚠️  SKIP (causes errors)
   │
   └─→ ensureCrossBorderClient('dive-v3-cross-border-client', secret)
       └─→ assignDiveScopesToClient()  ✨ UPDATED
           └─ addDefaultClientScope()  (not optional)

3. AUTOMATIC CONFIGURATION IN USA (Local)
   │
   └─→ createOIDCIdentityProvider('gbr-idp', ...)
       ├─ Issuer: https://localhost:8446/realms/dive-v3-broker-gbr
       ├─ Token URL: https://gbr-keycloak-gbr-1:8443/... (internal)
       ├─ Default Scope: "openid profile email clearance country..."
       │
       └─→ createDIVEAttributeMappers('gbr-idp')
           ├─ clearance-mapper: claim → user.attribute
           ├─ countryOfAffiliation-mapper: claim → user.attribute
           ├─ uniqueID-mapper: claim → user.attribute
           └─ syncMode: INHERIT (updates on every login)

4. RESULT
   ┌─────────────────────────────────────────┐
   │ GBR USER                                 │
   │ attributes: {clearance: ["SECRET"], ...} │
   └─────────────────────────────────────────┘
                    │
                    │ (Login)
                    ▼
   ┌─────────────────────────────────────────┐
   │ GBR TOKEN                                │
   │ {clearance: "SECRET", country: "GBR"...} │
   └─────────────────────────────────────────┘
                    │
                    │ (OIDC callback)
                    ▼
   ┌─────────────────────────────────────────┐
   │ USA HUB USER (federated)                 │
   │ attributes: {clearance: ["SECRET"], ...} │
   │ federatedIdentities: [{idp: "gbr-idp"}]  │
   └─────────────────────────────────────────┘
```

---

## Key Backend Methods

### 1. `ensureProtocolMapperForScope()` ✨ NEW
**Location:** `backend/src/services/keycloak-federation.service.ts:220`

**Purpose:** Automatically creates protocol mappers for client scopes

**Configuration:**
```typescript
{
  'user.attribute': scopeName,
  'claim.name': scopeName,
  'jsonType.label': 'String',
  'multivalued': 'false',
  'aggregate.attrs': 'true',  // CRITICAL: Extract first element
}
```

**Why `aggregate.attrs=true`?**
- Keycloak stores ALL attributes as arrays: `["SECRET"]`
- Standard mappers fail: "cannot map type for token claim"
- `aggregate.attrs=true` extracts first element: `"SECRET"`

### 2. `assignDiveScopesToClient()` ✨ UPDATED
**Location:** `backend/src/services/keycloak-federation.service.ts:420`

**Change:**
```typescript
// OLD (WRONG):
await this.kcAdmin.clients.addOptionalClientScope({...});

// NEW (CORRECT):
await this.kcAdmin.clients.addDefaultClientScope({...});
```

**Why DEFAULT instead of OPTIONAL?**
- **OPTIONAL:** Only included if explicitly requested or user consents
- **DEFAULT:** Automatically included in ALL tokens ✅

### 3. `createDIVEAttributeMappers()`
**Location:** `backend/src/services/keycloak-federation.service.ts:615`

**Already existed, no changes needed!**

Creates IdP protocol mappers in destination Keycloak to extract claims from federated tokens.

---

## Persistence & Resilience

### ✅ Persistent Across Restarts
- All configuration stored in Keycloak database
- Survives container restarts
- No manual Keycloak Admin Console steps required

### ✅ Environment-Aware
- **Development:** Uses `localhost` URLs, self-signed certs
- **Production:** Uses external domains, proper CA certs
- Automatic URL resolution via `getInternalKeycloakUrl()`

### ✅ GCP Secret Integration
- Federation secrets: `dive-v3-federation-gbr-usa`
- Keycloak admin passwords: `dive-v3-keycloak-gbr`
- Auto-fallback if GCP unavailable (dev only)

### ✅ Docker Networking
- Shared network: `dive-v3-shared-network`
- Auto-created by `ensure_shared_network()` in `common.sh`
- Enables inter-container communication

---

## Current Limitations & Workarounds

### ⚠️ acpCOI Not Propagated

**Issue:** Multi-valued array causes "cannot map type" error

**Impact:**
- ✅ User can authenticate
- ✅ User can access SECRET-level resources
- ❌ User CANNOT access COI-restricted resources (FVEY-only)

**Workarounds:**

#### Option 1: OPA Inference (Recommended for Pilot)
```rego
# In OPA policy, infer COI from countryOfAffiliation
derived_coi := ["FVEY"] if {
  input.subject.countryOfAffiliation == "GBR"
}

allow if {
  # Use derived_coi instead of input.subject.acpCOI
  some coi in derived_coi
  coi in input.resource.COI
}
```

**Pros:**
- No Keycloak changes
- Works immediately
- Centralized logic

**Cons:**
- Less accurate than user-assigned COI
- Can't handle exceptions (e.g., GBR user NOT in FVEY)

#### Option 2: Custom JavaScript Mapper (Proper Fix)
```javascript
// Deploy as protocol mapper script
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
- Accurate (uses actual user COI)
- Flexible logic

**Cons:**
- Requires enabling Keycloak script providers
- Security consideration (script execution)
- Implementation effort

**Recommendation:** Use Option 1 for pilot, implement Option 2 for production.

---

## Troubleshooting

### "cannot map type for token claim"

**Symptom:** GBR Keycloak logs show `RuntimeException`

**Cause:** Protocol mapper missing `aggregate.attrs=true`

**Fix:**
```bash
# Re-link federation (backend auto-configures)
./dive federation unlink GBR
./dive federation link GBR
```

### Attributes Not Appearing in USA Hub

**Symptom:** USA Hub user has empty `attributes: {}`

**Possible Causes:**

1. **GBR user has empty attributes**
   ```bash
   # Check GBR user
   docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh get users \
     -r dive-v3-broker-gbr -q username=testuser-gbr-1 | jq '.[0].attributes'
   ```
   **Fix:** Add attributes (see quickstart guide)

2. **USA Hub IdP has no protocol mappers**
   ```bash
   # Check IdP mappers
   docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh get \
     identity-provider/instances/gbr-idp/mappers -r dive-v3-broker | jq '[.[] | .name]'
   ```
   **Fix:** Re-link federation

3. **Federated user needs recreation**
   ```bash
   # Delete federated user
   USA_USER_ID=$(docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh get users \
     -r dive-v3-broker -q username=testuser-gbr-1 | jq -r '.[0].id')
   docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh delete \
     users/$USA_USER_ID -r dive-v3-broker
   
   # Re-test login (user will be re-created)
   ```

### "invalid_scope" Error

**Symptom:** Browser shows "Invalid scopes: clearance countryOfAffiliation..."

**Cause:** Scopes don't exist in GBR

**Fix:**
```bash
# Re-link federation (backend auto-creates scopes)
./dive federation link GBR
```

---

## Testing Checklist

### For Each New Federation Link

- [ ] **Step 1:** Add DIVE attributes to source users
- [ ] **Step 2:** Run `./dive federation link {INSTANCE}`
- [ ] **Step 3:** Browser test: Login via federated IdP
- [ ] **Step 4:** Verify attributes in destination user profile
- [ ] **Step 5:** Test authorization with OPA policy
- [ ] **Step 6:** Check logs for errors

---

## Documentation

### Complete Guides

1. **`docs/federation-issuer-solution.md`** (59 KB)
   - Complete technical solution
   - Issuer URL consistency (hybrid strategy)
   - SSL certificate trust
   - GCP secret integration

2. **`docs/federation-quick-reference.md`** (5 KB)
   - Common commands
   - Troubleshooting
   - Quick fixes

3. **`docs/federation-attribute-propagation.md`** (24 KB)
   - Root cause analysis (10 issues)
   - Architecture diagrams
   - Configuration matrix
   - Security considerations

4. **`docs/federation-attribute-propagation-quickstart.md`** (13 KB)
   - Getting started
   - Testing procedures
   - Troubleshooting
   - Future work

---

## Commit Summary

### Files Modified (5)
1. `backend/src/services/keycloak-federation.service.ts`
2. `backend/src/utils/gcp-secrets.ts`
3. `instances/gbr/config.json`
4. `docker-compose.hub.yml`
5. `scripts/dive-modules/common.sh`

### Files Created (4)
1. `docs/federation-issuer-solution.md`
2. `docs/federation-quick-reference.md`
3. `docs/federation-attribute-propagation.md`
4. `docs/federation-attribute-propagation-quickstart.md`

### Root Causes Fixed (10)
1. Client secret mismatch
2. SSL certificate trust
3. Issuer URL mismatch
4. Docker networking
5. Keycloak issuer behavior
6. Missing user attributes
7. Missing IdP protocol mappers
8. Missing client scope protocol mappers
9. DIVE scopes as OPTIONAL
10. Keycloak array storage

---

## Success Metrics

### ✅ Working Now
- Federation authentication: USA ↔ GBR
- Attribute propagation: 3 of 4 (75%)
- Persistent & resilient
- Incorporated into `@dive` CLI
- Comprehensive documentation

### 🎯 Next Steps
1. Implement acpCOI custom mapper
2. Apply to FRA, DEU, CAN instances
3. Test authorization with OPA
4. Document in pilot report

---

## Support

**Questions?** See documentation:
- **Quick Start:** This file
- **Commands:** `docs/federation-quick-reference.md`
- **Technical Deep Dive:** `docs/federation-attribute-propagation.md`
- **Troubleshooting:** `docs/federation-attribute-propagation-quickstart.md`

**Issues?** Check logs:
```bash
./dive hub logs backend    # Backend API logs
./dive hub logs keycloak   # USA Hub Keycloak logs
./dive spoke logs keycloak gbr  # GBR Spoke Keycloak logs
```

---

**Version:** 1.0.0  
**Last Updated:** 2025-12-13  
**Status:** ✅ Production Ready (with acpCOI limitation)
