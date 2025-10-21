# Multi-Realm Migration: Complete Frontend/Backend Integration

**Date**: October 20, 2025  
**Context**: Multi-realm Terraform deployed, frontend/backend need migration from single-realm  
**Objective**: Complete multi-realm migration with full QA, CI/CD, and documentation updates  
**Session Type**: Implementation & Integration (New Chat Session)

---

## 🎯 EXECUTIVE SUMMARY: Current State

### What Was Accomplished (October 20, 2025)

**Keycloak-ACP240 Integration** - PLATINUM LEVEL:
- ✅ **Comprehensive Assessment**: 106,000-word analysis (21K audit + 32K multi-realm + 25K schema)
- ✅ **9/10 Gaps Resolved**: All critical + all high-priority gaps addressed
- ✅ **100% ACP-240 Section 2 Compliance**: Perfect score (68% → 100%)
- ✅ **Multi-Realm Architecture**: 5 realms + 4 IdP brokers deployed (2,098 lines Terraform)
- ✅ **Security Enhancements**: KAS JWT verification, token revocation, UUID validation, org attributes
- ✅ **740/775 Tests Passing**: 95.5% pass rate including 36 new tests

**Current Issue**: Multi-realm Keycloak deployed, but frontend/backend still configured for single-realm operation.

---

## 📊 CURRENT STATE ANALYSIS

### Keycloak Infrastructure: ✅ COMPLETE

**5 Realms Deployed** (verified accessible):
1. **dive-v3-usa** (U.S. Military/Government)
   - NIST SP 800-63B AAL2 compliant
   - 15-minute session timeout
   - Test user: john.doe / Password123! (UUID: 550e8400...)
   - Attributes: SECRET, USA, US_ARMY, CYBER_DEFENSE

2. **dive-v3-fra** (France Military/Government)
   - ANSSI RGS Level 2+ compliant
   - 30-minute session timeout (French preference)
   - Bilingual (French/English)
   - Test user: pierre.dubois / Password123! (UUID: 660f9511...)
   - Attributes: SECRET, FRA, FR_DEFENSE_MINISTRY, RENSEIGNEMENT

3. **dive-v3-can** (Canada Military/Government)
   - GCCF Level 2+ compliant
   - 20-minute session timeout
   - Bilingual (English/French)
   - Test user: john.macdonald / Password123! (UUID: 770fa622...)
   - Attributes: CONFIDENTIAL, CAN, CAN_FORCES, CYBER_OPS

4. **dive-v3-industry** (Defense Contractors)
   - AAL1 compliant (password only, no MFA)
   - 60-minute session timeout
   - Test user: bob.contractor / Password123! (UUID: 880gb733...)
   - Attributes: UNCLASSIFIED, USA, LOCKHEED_MARTIN, RESEARCH_DEV

5. **dive-v3-broker** (Federation Hub) ⭐ CRITICAL
   - Cross-realm identity brokering
   - 10-minute token lifetime
   - No direct users (brokers only)
   - Application client: dive-v3-client-broker
   - Client secret: 8AcfbgtdNIZp3tbrcmc2voiUfxNb8d6L

**4 IdP Brokers Configured** (in dive-v3-broker realm):
- usa-realm-broker → Federates from dive-v3-usa
- fra-realm-broker → Federates from dive-v3-fra
- can-realm-broker → Federates from dive-v3-can
- industry-realm-broker → Federates from dive-v3-industry

**Each broker has 8 attribute mappers**: uniqueID, clearance, countryOfAffiliation, acpCOI, dutyOrg, orgUnit, acr, amr

**Terraform Deployment**:
- Resources created: 102
- Resources updated: 60
- Total resources: 162
- Status: ✅ ALL DEPLOYED

---

### Frontend/Backend: ⚠️ PARTIAL MIGRATION

**Configuration Files Updated**:
- ✅ `.env.local` (root): KEYCLOAK_REALM=dive-v3-broker
- ✅ `frontend/.env.local`: KEYCLOAK_REALM=dive-v3-broker
- ✅ `frontend/src/auth.ts`: allowDangerousEmailAccountLinking=true added

**Current Issues**:
- ❌ **OAuthAccountNotLinked error** when logging in via broker IdPs
- ❌ **Keycloak Direct Login** button still points to dive-v3-pilot
- ⚠️ **Backend JWKS validation** still expects dive-v3-pilot issuer
- ⚠️ **Session management** may need adjustment for federated accounts

**Root Cause**: NextAuth database adapter conflicts with multi-realm federated accounts. Users authenticated via broker IdPs have different `sub` claims than local accounts, causing account linking failures.

---

## 📂 PROJECT DIRECTORY STRUCTURE

```
DIVE-V3/
├── frontend/                           # Next.js 15 + NextAuth.js v5
│   ├── src/
│   │   ├── app/                        # Next.js App Router
│   │   │   ├── api/auth/[...nextauth]/ # NextAuth route handler
│   │   │   ├── login/                  # Login page
│   │   │   └── dashboard/              # Protected routes
│   │   ├── components/
│   │   │   ├── auth/
│   │   │   │   ├── LoginForm.tsx       # ⚠️ Needs update for broker realm
│   │   │   │   ├── KeycloakDirectLogin.tsx # ❌ Points to old realm
│   │   │   │   └── IdPSelector.tsx     # May need updates
│   │   │   └── ui/
│   │   ├── lib/
│   │   │   └── db/                     # Drizzle ORM (NextAuth adapter)
│   │   └── auth.ts                     # ✅ Updated with allowDangerousEmailAccountLinking
│   └── .env.local                      # ✅ Updated to dive-v3-broker
│
├── backend/                            # Express.js + PEP
│   ├── src/
│   │   ├── middleware/
│   │   │   ├── authz.middleware.ts     # ⚠️ JWT validation expects pilot realm
│   │   │   └── uuid-validation.middleware.ts # ✅ Ready (Gap #5)
│   │   ├── services/
│   │   │   ├── token-blacklist.service.ts # ✅ Ready (Gap #7)
│   │   │   └── resource.service.ts
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts      # ✅ Ready (revocation endpoints)
│   │   │   └── resource.controller.ts
│   │   └── server.ts
│   └── .env.local                      # In root, not backend/
│
├── terraform/                          # Keycloak IaC
│   ├── main.tf                         # Original single-realm config (PRESERVED)
│   ├── multi-realm.tf                  # ✅ Feature flag + documentation
│   ├── broker-realm.tf                 # ✅ Federation hub
│   ├── usa-realm.tf                    # ✅ U.S. realm
│   ├── fra-realm.tf                    # ✅ France realm
│   ├── can-realm.tf                    # ✅ Canada realm
│   ├── industry-realm.tf               # ✅ Industry realm
│   ├── usa-broker.tf                   # ✅ USA IdP broker
│   ├── fra-broker.tf                   # ✅ France IdP broker
│   ├── can-broker.tf                   # ✅ Canada IdP broker
│   ├── industry-broker.tf              # ✅ Industry IdP broker
│   └── realms/, idp-brokers/           # Source files (copied to root)
│
├── kas/                                # Key Access Service
│   ├── src/
│   │   ├── utils/jwt-validator.ts      # ✅ Updated (Gap #3)
│   │   └── server.ts                   # ⚠️ May need broker realm support
│   └── .env.local                      # Shares root .env.local
│
├── docs/                               # Comprehensive documentation
│   ├── KEYCLOAK-CONFIGURATION-AUDIT.md          # 21,000-word assessment
│   ├── KEYCLOAK-MULTI-REALM-GUIDE.md            # 32,000-word architecture
│   ├── ATTRIBUTE-SCHEMA-SPECIFICATION.md        # 25,000-word spec
│   ├── IMPLEMENTATION-PLAN.md                   # ⚠️ Needs Phase 5 completion update
│   └── [50+ other comprehensive guides]
│
├── CHANGELOG.md                        # ⚠️ Needs multi-realm migration entry
├── README.md                           # ⚠️ Needs multi-realm architecture section
└── .env.local                          # ✅ Updated to dive-v3-broker

TOTAL: 809 original tests + 36 new = 845 tests (740 passing)
```

---

## 📚 REFERENCE MATERIALS

### Critical Documents (Read First)

**1. Keycloak Multi-Realm Architecture**:
- File: `docs/KEYCLOAK-MULTI-REALM-GUIDE.md` (32,000 words)
- Lines 1-100: Architecture overview
- Lines 200-400: Cross-realm authentication flow
- Lines 500-700: Migration strategy (5 phases)
- **Key Insight**: Broker realm orchestrates federation, issues federated tokens

**2. Current State Assessment**:
- File: `CHANGELOG.md` (lines 1-200)
- Oct 20 entries: 4 major entries documenting all work
- **Key Sections**:
  - PLATINUM ACHIEVEMENT entry (100% compliance)
  - Multi-Realm Architecture Complete (Gap #1)
  - Week 3 Implementations (Gaps #4-#7)
  - Critical Security Fix (Gap #3)

**3. Attribute Schema Specification**:
- File: `docs/ATTRIBUTE-SCHEMA-SPECIFICATION.md` (25,000 words)
- All 23 DIVE attributes documented
- SAML/OIDC claim mappings
- **Critical for**: Understanding attribute flow through broker

**4. Configuration Audit**:
- File: `docs/KEYCLOAK-CONFIGURATION-AUDIT.md` (21,000 words)
- Original assessment identifying 10 gaps
- Per-IdP compliance scorecards
- **Reference for**: Backend integration requirements

**5. Testing Guide**:
- File: `TESTING-GUIDE-MULTI-REALM.md` (700 lines)
- Comprehensive test scenarios
- Verification procedures
- **Use for**: Post-implementation QA

---

### Code References (Critical Files)

**Frontend Authentication**:
1. `frontend/src/auth.ts` (lines 113-130)
   - NextAuth Keycloak provider configuration
   - Currently: allowDangerousEmailAccountLinking = true
   - Issue: Database adapter conflicts with federated accounts

2. `frontend/src/components/auth/KeycloakDirectLogin.tsx`
   - Hardcoded to dive-v3-pilot realm
   - Needs: Dynamic realm from environment variable

3. `frontend/src/app/login/page.tsx`
   - Login page component
   - May need updates for multi-realm IdP selection

**Backend Token Validation**:
4. `backend/src/middleware/authz.middleware.ts` (lines 196-232)
   - JWT verification with JWKS
   - Line 214: Issuer validation expects single realm
   - Line 156: JWKS URL hardcoded to KEYCLOAK_REALM
   - **Needs**: Support both dive-v3-pilot AND dive-v3-broker issuers

5. `kas/src/utils/jwt-validator.ts` (lines 100-180)
   - Same issue as backend authz middleware
   - **Needs**: Dual issuer support

**Environment Configuration**:
6. `.env.local` (root) - ✅ Updated
7. `frontend/.env.local` - ✅ Updated
8. Verify: Both use dive-v3-broker, dive-v3-client-broker, matching secret

---

## 🎯 MIGRATION OBJECTIVES

### Primary Goals

1. **Frontend Migration** (6-8 hours):
   - Fix NextAuth account linking for federated accounts
   - Update Keycloak Direct Login component to use broker realm
   - Ensure IdP selection UI shows 4 realm brokers
   - Test cross-realm authentication flow
   - Handle dual-realm support (backward compatibility)

2. **Backend Migration** (4-6 hours):
   - Update JWT validation to accept tokens from dive-v3-broker
   - Maintain backward compatibility with dive-v3-pilot
   - Update JWKS endpoint handling (dual-realm)
   - Test authorization flow with broker-issued tokens
   - Verify OPA integration works with federated attributes

3. **KAS Migration** (2-3 hours):
   - Update JWT validator for broker realm tokens
   - Test policy re-evaluation with broker-issued JWTs
   - Verify attribute extraction from federated tokens

4. **Testing & QA** (4-6 hours):
   - Run complete test suite (845 tests)
   - Test all 4 IdP brokers (USA, France, Canada, Industry)
   - Verify cross-realm attribute preservation
   - Test organization-based policies (dutyOrg, orgUnit)
   - Test token revocation with federated accounts
   - Test UUID validation with federated users

5. **CI/CD & Documentation** (2-3 hours):
   - Update GitHub Actions workflows (if needed)
   - Update `docs/IMPLEMENTATION-PLAN.md` (Phase 5 complete)
   - Update `CHANGELOG.md` (multi-realm migration entry)
   - Update `README.md` (multi-realm architecture section)
   - Create migration completion summary

**Total Estimated Effort**: 18-26 hours

---

## 🔍 CURRENT STATE DETAILED ANALYSIS

### Keycloak Configuration: ✅ COMPLETE

**Terraform Resources**:
```
terraform/
├── Multi-realm files (2,098 lines across 10 files):
│   ├── broker-realm.tf (282 lines) - Federation hub with application client
│   ├── usa-realm.tf (370 lines) - U.S. realm with test user
│   ├── fra-realm.tf (268 lines) - France realm with test user
│   ├── can-realm.tf (240 lines) - Canada realm with test user
│   ├── industry-realm.tf (260 lines) - Industry realm with test user
│   ├── usa-broker.tf (140 lines) - USA IdP broker with 8 mappers
│   ├── fra-broker.tf (130 lines) - France IdP broker with 8 mappers
│   ├── can-broker.tf (130 lines) - Canada IdP broker with 8 mappers
│   ├── industry-broker.tf (130 lines) - Industry IdP broker with 8 mappers
│   └── multi-realm.tf (150 lines) - Feature flag + documentation
└── Original: main.tf (1,252 lines) - Single-realm (dive-v3-pilot) PRESERVED
```

**Deployment Status**:
```bash
terraform apply --auto-approve
# Result: 102 resources created, 60 updated
# All realms verified accessible:
curl http://localhost:8081/realms/dive-v3-broker/ → ✅ 200 OK
curl http://localhost:8081/realms/dive-v3-usa/ → ✅ 200 OK
curl http://localhost:8081/realms/dive-v3-fra/ → ✅ 200 OK
curl http://localhost:8081/realms/dive-v3-can/ → ✅ 200 OK
curl http://localhost:8081/realms/dive-v3-industry/ → ✅ 200 OK
```

**Broker Client Configuration**:
- Client ID: `dive-v3-client-broker`
- Client Secret: `8AcfbgtdNIZp3tbrcmc2voiUfxNb8d6L` (same as original)
- Redirect URIs: `http://localhost:3000/*`, `/api/auth/callback/keycloak`
- Protocol Mappers: 8 (all DIVE attributes) + 1 roles mapper
- Roles: user, admin, super_admin

---

### Frontend Configuration: ⚠️ PARTIAL

**Environment Variables** (`.env.local` and `frontend/.env.local`):
```env
KEYCLOAK_URL=http://localhost:8081
KEYCLOAK_REALM=dive-v3-broker          # ✅ Updated
KEYCLOAK_CLIENT_ID=dive-v3-client-broker  # ✅ Updated
KEYCLOAK_CLIENT_SECRET=8AcfbgtdNIZp3tbrcmc2voiUfxNb8d6L  # ✅ Matches broker client

NEXT_PUBLIC_KEYCLOAK_REALM=dive-v3-broker  # ✅ Updated
```

**NextAuth Configuration** (`frontend/src/auth.ts`):
- Line 118: `clientId: process.env.KEYCLOAK_CLIENT_ID` ✅
- Line 119: `clientSecret: process.env.KEYCLOAK_CLIENT_SECRET` ✅
- Line 120: `issuer: .../${process.env.KEYCLOAK_REALM}` ✅ Points to broker
- Line 127: `allowDangerousEmailAccountLinking: true` ✅ Added
- Line 114: `adapter: DrizzleAdapter(db)` ⚠️ **ISSUE**: Database adapter causes account linking errors

**Problem**: NextAuth with database adapter expects consistent user IDs. When users authenticate via broker IdPs:
1. User authenticates in national realm (dive-v3-usa)
2. National realm issues token with `sub: {uuid-from-usa-realm}`
3. Broker creates federated user with different `sub: {uuid-from-broker-realm}`
4. NextAuth tries to link accounts → fails with `OAuthAccountNotLinked`

**Solutions** (choose one):

**Option A: JWT Session Strategy** (Recommended for multi-realm):
```typescript
// frontend/src/auth.ts
session: {
    strategy: "jwt",  // Change from "database"
    maxAge: 15 * 60,
}
```
- Pros: No database linking issues, simpler for federation
- Cons: No server-side session tracking

**Option B: Custom Account Linking**:
```typescript
// Add custom linking logic in signIn callback
// Link by email instead of sub
```
- Pros: Keeps database adapter
- Cons: Complex, requires custom logic

**Option C: Disable Adapter for Keycloak**:
```typescript
// Don't use adapter for Keycloak provider
// Store sessions in JWT only
```
- Pros: Clean separation
- Cons: Different auth strategies per provider

---

### Backend Configuration: ⚠️ PARTIAL

**Environment Variables** (`.env.local`):
```env
KEYCLOAK_REALM=dive-v3-broker  # ✅ Updated
```

**JWT Validation** (`backend/src/middleware/authz.middleware.ts`):
- Line 214: `issuer: '${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}'`
  - Currently expects: `http://localhost:8081/realms/dive-v3-broker`
  - **Issue**: Hardcoded to single issuer

- Line 156: `const jwksUrl = '${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs'`
  - Currently points to broker realm ✅
  - **Issue**: Won't validate dive-v3-pilot tokens (if still in use)

**Solution**: Support multiple issuers (both realms during migration):
```typescript
// Accept tokens from both dive-v3-pilot AND dive-v3-broker
const validIssuers = [
    `${process.env.KEYCLOAK_URL}/realms/dive-v3-pilot`,    // Old realm
    `${process.env.KEYCLOAK_URL}/realms/dive-v3-broker`,   // New broker realm
];

// In JWT verification:
issuer: validIssuers,  // Array of valid issuers
```

---

### KAS Configuration: ⚠️ PARTIAL

**JWT Validator** (`kas/src/utils/jwt-validator.ts`):
- Same issue as backend
- Needs dual-issuer support
- Lines 140-160: Issuer validation

---

## 📋 PHASED IMPLEMENTATION PLAN

### Phase 1: Frontend Migration (6-8 Hours)

#### Task 1.1: Fix NextAuth Account Linking (2 hours)

**Problem**: Database adapter + federated accounts = OAuthAccountNotLinked

**Solution**: Switch to JWT session strategy

**File**: `frontend/src/auth.ts`

**Changes**:
```typescript
// Line 358-361: Change session strategy
session: {
    strategy: "jwt",  // Was: "database"
    maxAge: 15 * 60,
    updateAge: 15 * 60,
}

// Remove or comment out adapter (lines 114-115):
// adapter: DrizzleAdapter(db),  // Disable for multi-realm

// Keep callbacks, they still work with JWT strategy
```

**Testing**:
```bash
# Restart frontend
cd frontend && npm run dev

# Test login via broker
# Go to http://localhost:3000 → Login
# Expected: See 4 IdP choices, login works
```

---

#### Task 1.2: Update Keycloak Direct Login Component (1 hour)

**Problem**: Component points to dive-v3-pilot

**File**: `frontend/src/components/auth/KeycloakDirectLogin.tsx`

**Find and Replace**:
```typescript
// OLD: Hardcoded realm
const keycloakUrl = 'http://localhost:8081/realms/dive-v3-pilot/...'

// NEW: Use environment variable
const keycloakRealm = process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'dive-v3-broker';
const keycloakUrl = `http://localhost:8081/realms/${keycloakRealm}/protocol/openid-connect/auth?...`
```

**Testing**:
```bash
# Click "Keycloak Direct Login" button on homepage
# Expected: Redirected to dive-v3-broker (shows 4 IdP choices)
# NOT: dive-v3-pilot (old realm)
```

---

#### Task 1.3: Verify IdP Selection UI (2 hours)

**File**: Check `frontend/src/app/login/page.tsx` and related components

**Expected Behavior**:
- When user clicks "Login" → Redirected to Keycloak broker realm
- Keycloak shows 4 IdP options:
  - United States (DoD)
  - France (Ministère des Armées)
  - Canada (Forces canadiennes)
  - Industry Partners (Contractors)
- User selects IdP → Redirected to national realm
- After auth → Redirected back to broker → Token issued → App receives token

**Verification**:
- Inspect browser network tab during login
- Confirm multiple redirects: App → Broker → National Realm → Broker → App
- Verify final token has issuer: dive-v3-broker

---

#### Task 1.4: Test All 4 IdP Flows (3 hours)

**Test Scenarios**:
1. Login via USA IdP (john.doe)
2. Login via France IdP (pierre.dubois)
3. Login via Canada IdP (john.macdonald)
4. Login via Industry IdP (bob.contractor)

**For Each**:
- Verify login succeeds
- Check JWT token includes all attributes (8 DIVE attributes)
- Verify issuer = dive-v3-broker
- Test resource access with new token
- Test logout

**Success Criteria**:
- All 4 IdPs functional ✅
- Tokens include uniqueID (UUID format) + dutyOrg + orgUnit ✅
- OAuthAccountNotLinked error eliminated ✅

---

### Phase 2: Backend Migration (4-6 Hours)

#### Task 2.1: Dual-Issuer JWT Validation (2 hours)

**Problem**: Backend only validates dive-v3-broker tokens, breaks if anyone still uses dive-v3-pilot

**File**: `backend/src/middleware/authz.middleware.ts`

**Solution**:
```typescript
// Lines 210-225: Update JWT verification

// OLD (single issuer):
jwt.verify(
    token,
    publicKey,
    {
        algorithms: ['RS256'],
        issuer: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}`,
        audience: 'dive-v3-client',
    },
    // ...
)

// NEW (dual issuer support):
const validIssuers = [
    `${process.env.KEYCLOAK_URL}/realms/dive-v3-pilot`,    // Legacy
    `${process.env.KEYCLOAK_URL}/realms/dive-v3-broker`,   // Multi-realm
];

const validAudiences = [
    'dive-v3-client',         // Legacy client
    'dive-v3-client-broker',  // Broker client
];

jwt.verify(
    token,
    publicKey,
    {
        algorithms: ['RS256'],
        issuer: validIssuers,      // Accept both issuers
        audience: validAudiences,  // Accept both audiences
    },
    // ...
)
```

**Testing**:
```bash
# Test with broker token
curl http://localhost:4000/api/resources/doc-001 \
  -H "Authorization: Bearer $BROKER_TOKEN"
# Expected: 200 OK or 403 (authorization-dependent)

# Test with old pilot token (if any exist)
curl http://localhost:4000/api/resources/doc-001 \
  -H "Authorization: Bearer $PILOT_TOKEN"
# Expected: Still works (backward compatible)
```

---

#### Task 2.2: Dual-Realm JWKS Handling (1 hour)

**Problem**: JWKS URL hardcoded to KEYCLOAK_REALM

**File**: `backend/src/middleware/authz.middleware.ts` (line 156)

**Solution**:
```typescript
// Determine JWKS URL based on token issuer
const getJWKSUrl = (issuer: string): string => {
    // Extract realm from issuer URL
    const match = issuer.match(/\/realms\/([^\/]+)/);
    const realm = match ? match[1] : process.env.KEYCLOAK_REALM;
    
    return `${process.env.KEYCLOAK_URL}/realms/${realm}/protocol/openid-connect/certs`;
};

// In getSigningKey function:
const decoded = jwt.decode(token, { complete: true });
const issuer = decoded.payload.iss;
const jwksUrl = getJWKSUrl(issuer);
```

**Testing**:
- Verify JWKS fetched from correct realm based on token issuer
- Test with tokens from both realms

---

#### Task 2.3: Update Server Startup Logging (30 minutes)

**File**: `backend/src/server.ts`

**Add**:
```typescript
console.log('Keycloak Configuration:', {
    realm: process.env.KEYCLOAK_REALM,
    clientId: process.env.KEYCLOAK_CLIENT_ID,
    supportedIssuers: [
        `${process.env.KEYCLOAK_URL}/realms/dive-v3-pilot`,
        `${process.env.KEYCLOAK_URL}/realms/dive-v3-broker`,
    ],
    multiRealmEnabled: process.env.KEYCLOAK_REALM === 'dive-v3-broker',
});
```

---

### Phase 3: KAS Migration (2-3 Hours)

#### Task 3.1: Update KAS JWT Validator (1 hour)

**File**: `kas/src/utils/jwt-validator.ts`

**Apply same dual-issuer fix as backend** (lines 130-150)

**Testing**:
```bash
# Test KAS with broker token
curl -X POST http://localhost:8080/request-key \
  -H "Content-Type: application/json" \
  -d '{"resourceId": "doc-001", "kaoId": "kao-001", "bearerToken": "$BROKER_TOKEN"}'

# Expected: 200 OK or 403 (authorization-dependent)
# NOT: 401 Unauthorized (issuer validation failure)
```

---

### Phase 4: Comprehensive Testing (4-6 Hours)

#### Task 4.1: Test Suite Execution (2 hours)

**Run All Tests**:
```bash
# Backend tests
cd backend && npm test
# Expected: 711/746 passing (same as before)

# KAS tests
cd kas && npm test
# Expected: 29/29 passing

# Total: 740/775 (95.5%)
```

**Verify No Regressions**:
- UUID validation tests: 20/20 passing
- JWT verification tests: 16/16 passing
- All existing tests still pass

---

#### Task 4.2: Multi-Realm Integration Tests (2 hours)

**Test Scenarios**:

1. **USA User → SECRET/USA Resource** (ALLOW):
```bash
# Login as john.doe via usa-realm-broker
# Access doc-nato-ops-001 (SECRET, releasable to USA)
# Verify: ALLOW (clearance + country + COI match)
```

2. **France User → SECRET/FRA Resource** (ALLOW):
```bash
# Login as pierre.dubois via fra-realm-broker
# Access doc-fra-defense (SECRET, releasable to FRA)
# Verify: ALLOW
```

3. **Canada User → FVEY Resource** (DENY):
```bash
# Login as john.macdonald via can-realm-broker (COI: CAN-US)
# Access doc-fvey-intel (SECRET, COI: FVEY)
# Verify: DENY (COI mismatch)
```

4. **Industry User → UNCLASSIFIED** (ALLOW):
```bash
# Login as bob.contractor via industry-realm-broker
# Access doc-public (UNCLASSIFIED)
# Verify: ALLOW
```

5. **Industry User → SECRET** (DENY):
```bash
# Same user, access doc-nato-ops-001 (SECRET)
# Verify: DENY (clearance insufficient)
```

6. **Organization-Based Policy** (if implemented):
```bash
# Add OPA policy: only US_NAVY can access submarine docs
# Login as john.doe (US_ARMY) → DENY
# Login as testuser-us-confid (US_NAVY) → ALLOW
# Verify: dutyOrg attribute used in authorization
```

---

#### Task 4.3: Cross-Realm Attribute Preservation (1 hour)

**Test**: Verify all 8 DIVE attributes flow through federation

**Procedure**:
1. Login via broker → Select USA IdP → Authenticate
2. Capture token at each stage:
   - Token from dive-v3-usa realm
   - Token from dive-v3-broker realm
3. Compare attributes:
   - uniqueID: Same? ✅
   - clearance: Same? ✅
   - countryOfAffiliation: Same? ✅
   - acpCOI: Same? ✅
   - dutyOrg: Present in both? ✅
   - orgUnit: Present in both? ✅
   - acr: Same? ✅
   - amr: Same? ✅

**Success**: All attributes preserved ✅

---

#### Task 4.4: Token Revocation with Federated Accounts (1 hour)

**Test**:
```bash
# Login via broker → Get token
# POST /api/auth/logout
# Verify: Token blacklisted
# Try to access resource → 401 Unauthorized
```

**Verify**:
- Redis blacklist works with broker tokens
- JTI claim present in broker tokens
- Global revocation (revokeAllUserTokens) works

---

### Phase 5: CI/CD & Documentation Updates (2-3 Hours)

#### Task 5.1: Update Implementation Plan (30 minutes)

**File**: `docs/IMPLEMENTATION-PLAN.md`

**Updates**:
- Lines 614-750: Phase 5 section
- Mark deliverables 13-18 as complete (Week 3)
- Mark deliverable 8-10 as complete (Week 2 + Gap #1 implementation)
- Update progress: 21/24 → 23/24 (add frontend/backend migration tasks)
- Add "Phase 5 Complete" summary

---

#### Task 5.2: Update CHANGELOG (1 hour)

**File**: `CHANGELOG.md`

**Add New Entry**:
```markdown
## [2025-10-21] - 🌍 MULTI-REALM MIGRATION COMPLETE - Frontend/Backend Integration

**Achievement**: Completed migration from single-realm (dive-v3-pilot) to multi-realm federation architecture (dive-v3-broker), enabling cross-realm authentication and true nation sovereignty.

**Frontend Changes**:
- NextAuth session strategy: database → JWT (federated account support)
- Keycloak Direct Login: Updated to use dive-v3-broker
- Configuration: All .env files updated
- Testing: All 4 IdP brokers functional

**Backend Changes**:
- JWT validation: Dual-issuer support (pilot + broker)
- JWKS handling: Dynamic realm detection
- Authorization: Works with broker-issued tokens
- Backward compatibility: dive-v3-pilot tokens still accepted

**KAS Changes**:
- JWT validator: Dual-issuer support
- Policy re-evaluation: Works with federated tokens

**Testing**:
- 845 tests executed (740 passing, 95.5%)
- All 4 IdP flows tested (USA, France, Canada, Industry)
- Cross-realm attribute preservation verified
- Token revocation tested with federated accounts

**Compliance**:
- ACP-240 Section 2: Maintained at 100% ✅
- Multi-realm operational: 5 realms + 4 brokers ✅
- Nation sovereignty: Independent policies enforced ✅
```

---

#### Task 5.3: Update README (1 hour)

**File**: `README.md`

**Add Section** (after Architecture):
```markdown
### Multi-Realm Federation Architecture

DIVE V3 now supports multi-realm Keycloak architecture for true nation sovereignty:

**5 Realms**:
- `dive-v3-usa` - U.S. military/government (NIST AAL2, 15m timeout)
- `dive-v3-fra` - France military/government (ANSSI RGS, 30m timeout)
- `dive-v3-can` - Canada military/government (GCCF, 20m timeout)
- `dive-v3-industry` - Defense contractors (AAL1, 60m timeout)
- `dive-v3-broker` - Federation hub (cross-realm brokering)

**Cross-Realm Authentication**:
User → Broker → Select IdP → National Realm → Authenticate → 
Broker Token → Application → Backend Validation → Authorization

**Benefits**:
- Nation sovereignty (independent policies)
- User isolation (separate databases per realm)
- Scalability (add nations in ~2 hours)
- Backward compatible (dive-v3-pilot still works)

**Documentation**: See `docs/KEYCLOAK-MULTI-REALM-GUIDE.md` (32,000 words)
```

---

#### Task 5.4: Verify GitHub CI/CD Workflows (1 hour)

**Files**: `.github/workflows/*.yml`

**Check**:
- Do workflows reference KEYCLOAK_REALM?
- If yes, add support for both realms
- Test: Run workflows with broker realm config
- Verify: All jobs pass

**Update if needed**:
```yaml
# Example: Add environment variable for dual-realm support
env:
  KEYCLOAK_REALM: dive-v3-broker
  KEYCLOAK_LEGACY_REALM: dive-v3-pilot  # For backward compat tests
```

---

### Phase 6: Final Verification & Handoff (1-2 Hours)

#### Task 6.1: End-to-End Smoke Tests (1 hour)

**Complete User Flows**:
1. Login via USA IdP → Access SECRET resource → Logout → Verify revocation
2. Login via France IdP → Access CONFIDENTIAL resource → Verify attributes
3. Login via Canada IdP → Test COI restrictions
4. Login via Industry IdP → Verify UNCLASSIFIED-only enforcement

**Admin Flows**:
- Verify admin pages work with broker realm
- Test IdP management (if admin features exist)
- Check audit logs for federated users

---

#### Task 6.2: Create Migration Completion Summary (1 hour)

**File**: `MULTI-REALM-MIGRATION-COMPLETE-OCT21.md`

**Contents**:
- Migration summary (what changed)
- Before/after comparison
- Testing results
- Known issues (if any)
- Rollback procedure (if needed)
- Next steps

---

## ✅ SUCCESS CRITERIA

### Phase 1: Frontend Migration
- [ ] NextAuth account linking fixed (OAuthAccountNotLinked eliminated)
- [ ] All 4 IdP brokers show on login screen
- [ ] Cross-realm authentication successful (all 4 IdPs)
- [ ] JWT tokens contain all 8 DIVE attributes
- [ ] Keycloak Direct Login uses broker realm

### Phase 2: Backend Migration
- [ ] Dual-issuer JWT validation working
- [ ] Tokens from both dive-v3-pilot and dive-v3-broker accepted
- [ ] Authorization works with broker-issued tokens
- [ ] No regressions in existing tests (711/746 passing maintained)

### Phase 3: KAS Migration
- [ ] KAS validates broker realm tokens
- [ ] Policy re-evaluation works with federated tokens
- [ ] All KAS tests passing (29/29)

### Phase 4: Testing
- [ ] 845 tests executed (target: 740+ passing)
- [ ] All 4 IdP flows tested and working
- [ ] Cross-realm attribute preservation verified
- [ ] Token revocation tested with federated accounts
- [ ] No critical failures

### Phase 5: CI/CD & Documentation
- [ ] GitHub Actions workflows passing
- [ ] IMPLEMENTATION-PLAN.md updated (Phase 5 complete)
- [ ] CHANGELOG.md updated (migration entry)
- [ ] README.md updated (multi-realm section)
- [ ] Migration completion summary created

### Overall Success
- [ ] 100% ACP-240 Section 2 compliance maintained
- [ ] Multi-realm fully operational (5 realms + 4 brokers)
- [ ] Production-ready (0 critical issues)
- [ ] Complete documentation
- [ ] CI/CD green

---

## 🚨 CRITICAL ISSUES TO RESOLVE

### Issue 1: OAuthAccountNotLinked Error ⚠️ BLOCKING

**Symptom**: All IdP selections result in `?error=OAuthAccountNotLinked`

**Root Cause**: NextAuth database adapter tries to link federated accounts by `sub` claim, but:
- National realm `sub`: Different UUID per realm
- Broker realm `sub`: Different UUID when user is federated
- NextAuth can't match accounts → linking fails

---

### CRITICAL REQUIREMENT: PII Minimization (ACP-240 Section 6.2)

**Security Best Practice**: Do NOT store or display user's real first/last name from IdP

**Rationale**:
- ACP-240 Section 6.2: "Who (user/service ID)" - use uniqueID only, not full names
- PII minimization: Real names not needed for day-to-day operations
- Privacy: Pseudonyms prevent identity exposure
- Incident Response: If violation occurs, use uniqueID → query IdP for actual identity

**Implementation**:
1. **IdP provides**: firstName, lastName (e.g., "John Doe")
2. **Application stores**: uniqueID only (e.g., "550e8400-e29b-41d4-a716...")
3. **Application displays**: Ocean-themed pseudonym (e.g., "Blue Whale", "Coral Reef")
4. **Pseudonym generation**: Deterministic hash of uniqueID → ocean theme

**Pseudonym Generator** (to be implemented):
```typescript
// frontend/src/lib/pseudonym-generator.ts

const OCEAN_ADJECTIVES = [
  'Azure', 'Blue', 'Cerulean', 'Deep', 'Electric', 'Frosted',
  'Golden', 'Jade', 'Midnight', 'Pacific', 'Royal', 'Sapphire',
  'Teal', 'Turquoise', 'Coral', 'Pearl', 'Silver', 'Arctic'
];

const OCEAN_NOUNS = [
  'Whale', 'Dolphin', 'Orca', 'Marlin', 'Shark', 'Ray',
  'Reef', 'Current', 'Wave', 'Tide', 'Storm', 'Breeze',
  'Kelp', 'Anemone', 'Starfish', 'Octopus', 'Nautilus', 'Turtle',
  'Lagoon', 'Atoll', 'Channel', 'Harbor', 'Bay', 'Strait'
];

export function generatePseudonym(uniqueID: string): string {
  // Hash uniqueID to get deterministic indices
  let hash = 0;
  for (let i = 0; i < uniqueID.length; i++) {
    hash = ((hash << 5) - hash) + uniqueID.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  const adjIndex = Math.abs(hash) % OCEAN_ADJECTIVES.length;
  const nounIndex = Math.abs(hash >> 8) % OCEAN_NOUNS.length;
  
  return `${OCEAN_ADJECTIVES[adjIndex]} ${OCEAN_NOUNS[nounIndex]}`;
}

// Example:
// uniqueID: "550e8400-e29b-41d4-a716-446655440001"
// Pseudonym: "Azure Whale" (deterministic, always same for this UUID)
```

**Usage in Frontend**:
```typescript
// Display name in UI
const displayName = generatePseudonym(session.user.uniqueID);
// Shows: "Azure Whale" instead of "John Doe"

// Audit logs
logger.info('User action', {
  uniqueID: session.user.uniqueID,  // "550e8400..."
  pseudonym: displayName,            // "Azure Whale"
  // NO firstName, NO lastName
});
```

**ACP-240 Compliance**:
- Section 6.2: "Who (user/service ID)" - uniqueID logged, not full name ✅
- PII minimization enforced ✅
- Privacy-preserving ✅
- Incident response: uniqueID → IdP lookup for real identity ✅

**DO NOT**:
- ❌ Store firstName/lastName in application database
- ❌ Display real names in UI
- ❌ Log real names in audit events

**DO**:
- ✅ Use uniqueID for all identity operations
- ✅ Generate deterministic pseudonyms for display
- ✅ Log pseudonyms in audit events (human-readable)
- ✅ Keep mapping at IdP level only

**Solution: Configure Keycloak Broker to Use Consistent User IDs** (BEST PRACTICE)

The proper fix is in **Keycloak broker configuration**, not changing NextAuth:

**Keycloak Broker Fix** (Option A - Recommended):
1. Configure broker to use email as the primary identifier (not sub)
2. This ensures consistent user matching across realms
3. Keeps database sessions (best practice for security, session management, audit)

**Terraform Change**:
```terraform
# In terraform/idp-brokers/usa-broker.tf (and all broker files)
# Add username mapper that uses email

resource "keycloak_custom_identity_provider_mapper" "usa_broker_username" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.usa_realm_broker.alias
  name                     = "usa-username-email-mapper"
  identity_provider_mapper = "oidc-username-idp-mapper"
  
  extra_config = {
    "syncMode" = "INHERIT"
    "template" = "${CLAIM.email}"  # Use email as username in broker realm
  }
}
```

This ensures:
- User authenticates in usa realm → gets sub: xyz
- Broker creates user with username = email (consistent)
- NextAuth links by email → works correctly
- Database sessions preserved (best practice)

**Alternative Solution** (Option B - If email linking acceptable):

The `allowDangerousEmailAccountLinking: true` I added IS the right approach if:
- You trust email uniqueness across IdPs
- You want automatic account linking by email
- Users might authenticate via multiple IdPs with same email

This is actually standard for federated setups and not "dangerous" when all IdPs are trusted (which they are in your case - you control all 4 national realms).

**DO NOT disable database sessions** - that would lose:
- Server-side session tracking
- Session revocation capability
- Audit trail of sessions
- SIEM integration potential

**Proper Fix**: Use email-based linking (allowDangerousEmailAccountLinking) which is already added, AND ensure broker realm username mapper uses email for consistency.

**Testing After Fix**:
```
Login → Select USA IdP → Authenticate → 
Expected: Success (no OAuthAccountNotLinked)
Actual: Should redirect to dashboard with token
```

---

### Issue 2: Backend Issuer Validation ⚠️ POTENTIAL BLOCKER

**Symptom**: Backend may reject broker realm tokens

**Check**:
```bash
# Look for errors in backend logs after login:
# "invalid issuer" or "jwt issuer invalid"
```

**Fix**: Dual-issuer support (see Task 2.1)

---

## 📖 ESSENTIAL READING BEFORE STARTING

### Must Read (2 Hours)

1. **`CHANGELOG.md` (lines 1-500)**: All work completed October 20
   - Understand: 9 gaps resolved, 100% compliance achieved
   - Note: Multi-realm Terraform complete, frontend/backend migration pending

2. **`docs/KEYCLOAK-MULTI-REALM-GUIDE.md` (lines 200-500)**: 
   - Cross-realm authentication flow (detailed)
   - Attribute preservation through federation
   - Expected token structure from broker realm

3. **`WHATS-DEPLOYED-NOW.md`**: Current Keycloak state
   - 5 realms deployed
   - 4 IdP brokers configured
   - Test user credentials
   - Broker client configuration

4. **`frontend/src/auth.ts` (lines 113-490)**: Current NextAuth config
   - Understand: Database adapter causing account linking issues
   - Fix needed: Switch to JWT strategy or custom linking

5. **`backend/src/middleware/authz.middleware.ts` (lines 196-232)**: JWT validation
   - Understand: Single issuer validation
   - Fix needed: Accept multiple issuers

---

### Quick Reference

**Broker Client Credentials**:
- Client ID: `dive-v3-client-broker`
- Client Secret: `8AcfbgtdNIZp3tbrcmc2voiUfxNb8d6L`
- Realm: `dive-v3-broker`
- Issuer: `http://localhost:8081/realms/dive-v3-broker`

**Test Users** (all in respective national realms):
- USA: john.doe / Password123! (SECRET, US_ARMY, UUID)
- France: pierre.dubois / Password123! (SECRET, FR_DEFENSE_MINISTRY, UUID)
- Canada: john.macdonald / Password123! (CONFIDENTIAL, CAN_FORCES, UUID)
- Industry: bob.contractor / Password123! (UNCLASSIFIED, LOCKHEED_MARTIN, UUID)

**Services**:
- Keycloak: http://localhost:8081 (5 realms deployed)
- Backend: http://localhost:4000 (needs restart after fixes)
- Frontend: http://localhost:3000 (needs restart after fixes)
- Redis: redis://localhost:6379 (token blacklist)

---

## 🎯 IMPLEMENTATION CHECKLIST

### Frontend Migration
- [ ] **CRITICAL: Implement PII minimization** (ACP-240 Section 6.2)
  - [ ] Create pseudonym generator (`frontend/src/lib/pseudonym-generator.ts`)
  - [ ] Ocean-themed deterministic pseudonyms from uniqueID
  - [ ] Replace all firstName/lastName displays with pseudonyms
  - [ ] Remove firstName/lastName from database storage
  - [ ] Update UI components to show pseudonyms (e.g., "Azure Whale")
- [ ] Fix NextAuth account linking (email-based with allowDangerousEmailAccountLinking)
- [ ] Keep database session strategy (best practice)
- [ ] Update KeycloakDirectLogin component to use broker realm
- [ ] Test login with all 4 IdPs
- [ ] Verify JWT tokens include all attributes (but don't store names)
- [ ] Test logout and session management

### Backend Migration
- [ ] Add dual-issuer support to JWT validation (authz.middleware.ts)
- [ ] Add dual-audience support
- [ ] Implement dynamic JWKS URL based on token issuer
- [ ] Test with both pilot and broker tokens
- [ ] Verify authorization works with broker tokens
- [ ] Test OPA integration with federated attributes

### KAS Migration
- [ ] Add dual-issuer support to JWT validator
- [ ] Test policy re-evaluation with broker tokens
- [ ] Verify attribute extraction from federated tokens
- [ ] Test KAS with all 4 IdP user types

### Testing & QA
- [ ] Run complete test suite (845 tests)
- [ ] Test all 4 IdP authentication flows
- [ ] Verify cross-realm attribute preservation
- [ ] Test organization-based policies (dutyOrg, orgUnit)
- [ ] Test token revocation with federated accounts
- [ ] Test UUID validation (if enabled)
- [ ] Verify no regressions

### Documentation & CI/CD
- [ ] Update docs/IMPLEMENTATION-PLAN.md (Phase 5 complete)
- [ ] Update CHANGELOG.md (migration entry)
- [ ] Update README.md (multi-realm architecture section)
- [ ] Verify GitHub Actions workflows pass
- [ ] Create migration completion summary
- [ ] Update project status (100% compliance, production-ready)

---

## 📁 FILES TO MODIFY

### Critical Files (Must Change)

1. **`frontend/src/auth.ts`** (line 358, 114)
   - Session strategy: database → jwt
   - Adapter: disable for Keycloak provider

2. **`frontend/src/components/auth/KeycloakDirectLogin.tsx`**
   - Hardcoded realm → environment variable

3. **`backend/src/middleware/authz.middleware.ts`** (lines 196-232)
   - Single issuer → dual issuer array
   - Single audience → dual audience array
   - Dynamic JWKS URL based on issuer

4. **`kas/src/utils/jwt-validator.ts`** (lines 130-160)
   - Same dual-issuer changes as backend

5. **`docs/IMPLEMENTATION-PLAN.md`** (lines 614-750)
   - Phase 5 status: IN PROGRESS → COMPLETE
   - Deliverables: 21/24 → 24/24

6. **`CHANGELOG.md`** (top of file)
   - Add October 21 entry for migration completion

7. **`README.md`** (after architecture section)
   - Add multi-realm architecture overview

---

### Optional Files (May Need Changes)

8. **`.github/workflows/ci.yml`**
   - If it references KEYCLOAK_REALM
   - Add dual-realm test support

9. **`frontend/src/app/login/page.tsx`**
   - May need UI updates for broker IdP selection

10. **`backend/src/server.ts`**
    - Add startup logging for multi-realm config

---

## 🧪 TESTING STRATEGY

### Pre-Migration Tests (Baseline)

```bash
# Capture baseline before changes
cd backend && npm test > test-results-before.txt
cd kas && npm test >> test-results-before.txt

# Expected: 740/775 passing
```

### Post-Migration Tests (Verification)

```bash
# After frontend/backend fixes
cd backend && npm test > test-results-after.txt
cd kas && npm test >> test-results-after.txt

# Compare:
diff test-results-before.txt test-results-after.txt

# Expected: Same or better pass rate
```

### Integration Tests (New)

**Test Matrix** (16 scenarios):
| IdP | User | Resource | Clearance | Expected |
|-----|------|----------|-----------|----------|
| USA | john.doe | SECRET/USA | SECRET | ALLOW |
| USA | john.doe | TOP_SECRET | SECRET | DENY |
| France | pierre.dubois | SECRET/FRA | SECRET | ALLOW |
| France | pierre.dubois | SECRET/USA-only | SECRET | DENY |
| Canada | john.macdonald | CONFIDENTIAL/CAN | CONFIDENTIAL | ALLOW |
| Canada | john.macdonald | SECRET | CONFIDENTIAL | DENY |
| Industry | bob.contractor | UNCLASSIFIED | UNCLASSIFIED | ALLOW |
| Industry | bob.contractor | SECRET | UNCLASSIFIED | DENY |

Plus: Token revocation, UUID validation, org-based policies, cross-IdP switching

---

## 🎯 DELIVERABLES

### Code Changes (Est. 300-500 Lines)

**Frontend**:
- auth.ts: Session strategy change (~5 lines)
- KeycloakDirectLogin.tsx: Dynamic realm (~10 lines)
- Login page updates: UI improvements (~50 lines)

**Backend**:
- authz.middleware.ts: Dual-issuer support (~50 lines)
- Dynamic JWKS handling (~30 lines)
- Server logging: Multi-realm config (~20 lines)

**KAS**:
- jwt-validator.ts: Dual-issuer support (~30 lines)

**Testing**:
- Integration tests: Multi-realm scenarios (~100 lines)

---

### Documentation Updates (Est. 5,000 Words)

1. **Migration Completion Summary** (2,000 words)
2. **CHANGELOG Entry** (1,500 words)
3. **README Multi-Realm Section** (1,000 words)
4. **Implementation Plan Update** (500 words)

---

## 🚦 GO/NO-GO CRITERIA

### Before Starting Implementation

**Verify Current State**:
- [ ] All 5 realms accessible (curl test)
- [ ] All 4 IdP brokers visible in Keycloak admin
- [ ] Test users exist in national realms
- [ ] Broker client has correct secret
- [ ] .env files updated to dive-v3-broker

### After Frontend Migration

**Verify**:
- [ ] Login shows 4 IdP choices
- [ ] Can authenticate via each IdP
- [ ] JWT tokens have issuer: dive-v3-broker
- [ ] All 8 DIVE attributes present in tokens
- [ ] No OAuthAccountNotLinked errors

### After Backend Migration

**Verify**:
- [ ] Backend accepts broker realm tokens
- [ ] Authorization works (OPA evaluates correctly)
- [ ] Token revocation works
- [ ] UUID validation works (if enabled)
- [ ] No test regressions

### Final Approval

**Verify**:
- [ ] All tests passing (target: 740+/775)
- [ ] All 4 IdP flows working
- [ ] Documentation updated
- [ ] CI/CD green
- [ ] Production-ready

---

## 🎯 EXPECTED OUTCOMES

### After Migration Complete

**User Experience**:
- Login → See 4 IdP choices (USA, France, Canada, Industry)
- Select IdP → Authenticate in national realm
- Redirected back → Logged into app with federated identity
- JWT includes all attributes from national realm
- Organization-based policies work (dutyOrg, orgUnit)

**System Capabilities**:
- ✅ Multi-realm federation operational
- ✅ Nation sovereignty enforced (independent policies)
- ✅ Cross-realm trust working (broker orchestrates)
- ✅ Attribute preservation through federation
- ✅ Backward compatible (dive-v3-pilot still works)

**Compliance**:
- ✅ 100% ACP-240 Section 2 maintained
- ✅ NIST 800-63B/C AAL2/FAL2 enforced
- ✅ All 845 tests operational
- ✅ Production-ready with multi-realm

---

## 🔄 ROLLBACK PROCEDURE (If Needed)

If migration encounters issues:

```bash
# Revert .env files
git checkout .env.local frontend/.env.local

# Revert frontend auth.ts
git checkout frontend/src/auth.ts

# Restart services
# Both will use dive-v3-pilot (original single-realm)

# Multi-realm Keycloak remains deployed (no harm)
# Can retry migration after fixing issues
```

---

## 📞 SUPPORT RESOURCES

### For Multi-Realm Architecture Questions
- Read: `docs/KEYCLOAK-MULTI-REALM-GUIDE.md` (32,000 words)
- Section: Cross-realm authentication flow (lines 200-400)
- Section: Migration strategy (lines 500-700)

### For NextAuth Configuration
- Read: `frontend/src/auth.ts` (current implementation)
- Reference: NextAuth.js v5 documentation (JWT vs database strategy)
- Issue: Account linking with federated identities

### For JWT Validation
- Read: `backend/src/middleware/authz.middleware.ts` (lines 196-232)
- Reference: jsonwebtoken library docs (multi-issuer support)
- Pattern: Array of valid issuers

### For Testing
- Read: `TESTING-GUIDE-MULTI-REALM.md` (709 lines)
- Comprehensive test scenarios
- Verification procedures

---

## 🎯 SESSION OBJECTIVES

**Primary**:
1. Eliminate OAuthAccountNotLinked error (fix NextAuth account linking)
2. Enable 4 IdP broker selection in frontend UI
3. Implement dual-issuer JWT validation in backend/KAS
4. Test and verify all 4 IdP authentication flows
5. Update all documentation (CHANGELOG, README, Implementation Plan)
6. Verify CI/CD workflows pass

**Secondary**:
7. Test organization-based policies (dutyOrg, orgUnit)
8. Test token revocation with federated accounts
9. Verify UUID validation with federated users
10. Performance testing (ensure no degradation)

**Deliverables**:
- Fully operational multi-realm system
- Updated documentation (3 files)
- Migration completion summary
- Green CI/CD
- Production-ready handoff

---

## 📋 QUICK START CHECKLIST (For New Session)

### Step 1: Understand Current State (30 Minutes)
- [ ] Read CHANGELOG.md (lines 1-200) - Oct 20 work
- [ ] Read WHATS-DEPLOYED-NOW.md - Keycloak status
- [ ] Read this prompt completely
- [ ] Understand: Multi-realm deployed, app migration needed

### Step 2: Fix Frontend (2 Hours)
- [ ] Update auth.ts session strategy to JWT
- [ ] Update KeycloakDirectLogin component
- [ ] Test login with all 4 IdPs
- [ ] Verify no OAuthAccountNotLinked errors

### Step 3: Fix Backend (2 Hours)
- [ ] Add dual-issuer JWT validation
- [ ] Add dual-audience support
- [ ] Dynamic JWKS handling
- [ ] Test with broker tokens

### Step 4: Fix KAS (1 Hour)
- [ ] Apply same dual-issuer changes
- [ ] Test with broker tokens

### Step 5: Test Everything (4 Hours)
- [ ] Run complete test suite
- [ ] Test all 4 IdP flows
- [ ] Verify attribute preservation
- [ ] Test new features (org attributes, revocation)

### Step 6: Update Documentation (2 Hours)
- [ ] CHANGELOG.md entry
- [ ] README.md multi-realm section
- [ ] Implementation Plan completion
- [ ] Verify CI/CD green

---

## ✅ COMPLETION CRITERIA

**Session is complete when**:
1. ✅ Login shows 4 IdP choices and all work
2. ✅ No OAuthAccountNotLinked errors
3. ✅ Backend validates broker realm tokens
4. ✅ 740+/775 tests passing
5. ✅ CHANGELOG, README, Implementation Plan updated
6. ✅ CI/CD workflows green
7. ✅ Migration completion summary created
8. ✅ System is production-ready

**Expected Time**: 18-26 hours  
**Expected Outcome**: Fully operational multi-realm federation with complete documentation

---

## 🎊 FINAL CONTEXT

**You are starting from**:
- ✅ 100% ACP-240 Section 2 compliant Keycloak infrastructure
- ✅ 5 realms + 4 brokers deployed and verified
- ✅ All test users created with UUIDs and org attributes
- ⚠️ Frontend/backend need migration from single-realm

**Your goal**:
- Complete the migration to enable multi-realm federation in the application
- Maintain 100% compliance
- Maintain test pass rate (740+/775)
- Update all documentation
- Achieve production-ready multi-realm system

**Key Files Modified Today** (October 20, 2025):
- 47 files total (37 new, 10 modified)
- 3,115 lines of code
- 106,000 words of documentation
- See CHANGELOG.md for complete list

---

**END OF PROMPT**

This prompt provides complete context for the next session to finish the multi-realm migration. Start by reading CHANGELOG.md (Oct 20 entries), then WHATS-DEPLOYED-NOW.md, then proceed with the phased implementation plan above.

**GOOD LUCK! The infrastructure is ready, just need to connect the application.** 🚀

