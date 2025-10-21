# AAL2/FAL2 Implementation Completion Prompt

**Purpose**: Complete remaining AAL2/FAL2 unit test mocks, integrate Identity Assurance UI/UX, finalize documentation, and verify CI/CD  
**Session Type**: New Chat (Full Context Required)  
**Expected Duration**: 3-4 hours  
**Priority**: HIGH (Complete remaining 10% for production deployment)

---

## 📋 EXECUTIVE SUMMARY

### Current State (October 20, 2025 - 03:06 UTC)

**DIVE V3 has achieved**:
- ✅ **PERFECT (100%)** ACP-240 compliance (58/58 requirements)
- ✅ **100%** AAL2/FAL2 **enforcement in production code**
- ✅ **138/138 OPA tests PASSING** (100% pass rate)
- ✅ **613 backend tests PASSING** (baseline stable)
- ✅ **Application OPERATIONAL** (health check passing)
- ✅ **Keycloak fully configured** (via Terraform + Admin API)

**What's Outstanding** (last 10%):
- ⚠️ **23 unit test mocks** in `authz.middleware.test.ts` need updates for strict audience validation
- ⚠️ **Identity Assurance UI/UX** not integrated into existing dashboard
- ⚠️ **Documentation updates** incomplete (implementation plan, README)
- ⚠️ **GitHub CI/CD** not verified with new changes

### Your Mission

Complete the remaining 10% to achieve **100% production deployment readiness**:
1. **Fix all 23 unit test mocks** (best practice approach - no shortcuts)
2. **Integrate Identity Assurance UI** into existing compliance dashboard
3. **Update all documentation** (implementation plan, CHANGELOG, README)
4. **Run full QA testing** (all 671+ tests passing)
5. **Verify GitHub CI/CD workflows** pass with new code

---

## 📚 PROJECT CONTEXT

### DIVE V3 Overview

**DIVE V3** (Coalition Identity, Credential, and Access Management) is a NATO ACP-240 compliant web application demonstrating federated identity management across USA/NATO partners with policy-driven ABAC authorization.

**Tech Stack**:
- **Frontend**: Next.js 15 (App Router), NextAuth.js v5, React 19, TypeScript, Tailwind CSS
- **Backend**: Node.js 20+, Express.js 4.18, TypeScript, MongoDB 7
- **Auth**: Keycloak 25.x (IdP broker), JWT (RS256)
- **Authorization**: OPA (Open Policy Agent) 0.68.0+
- **Infrastructure**: Docker Compose, Terraform (Keycloak IaC)

### Recent Achievement (Oct 19-20, 2025)

**AAL2/FAL2 Identity Assurance Levels Implementation**:
- Gap analysis conducted (800-line report)
- 14 gaps identified and remediated
- AAL2/FAL2 enforcement implemented
- OPA tests: 138/138 passing ✅
- Keycloak configured via Terraform + Admin API
- **Audience validation**: STRICT (no shortcuts) ✅
- **Session timeout**: 15 minutes (was 8 hours - 32x reduction) ✅

**Files Modified**:
- `backend/src/middleware/authz.middleware.ts` (+100 lines)
- `policies/fuel_inventory_abac_policy.rego` (+115 lines)
- `terraform/main.tf` (+95 lines - APPLIED)
- `frontend/src/auth.ts` (session timeout 15 min)
- `backend/src/utils/acp240-logger.ts` (AAL/FAL metadata)
- `policies/tests/aal_fal_enforcement_test.rego` (NEW: 425 lines, 12 tests)

---

## 🏗️ PROJECT DIRECTORY STRUCTURE

```
DIVE-V3/
├── backend/                                      # Express.js API
│   ├── src/
│   │   ├── middleware/
│   │   │   ├── authz.middleware.ts               # ⭐ JWT + AAL2 validation (UPDATED)
│   │   │   └── session.middleware.ts
│   │   ├── services/
│   │   │   ├── resource.service.ts
│   │   │   ├── mfa-detection.service.ts          # MFA capability detection
│   │   │   └── idp-approval.service.ts
│   │   ├── controllers/
│   │   │   ├── compliance.controller.ts          # Compliance dashboard API
│   │   │   └── resource.controller.ts
│   │   ├── utils/
│   │   │   ├── acp240-logger.ts                  # ⭐ Audit logging (UPDATED with AAL/FAL)
│   │   │   └── logger.ts
│   │   ├── types/
│   │   │   └── keycloak.types.ts
│   │   └── __tests__/
│   │       ├── authz.middleware.test.ts          # ⚠️ 23 tests failing (mock issues)
│   │       ├── helpers/
│   │       │   ├── mock-jwt.ts                   # ⭐ UPDATED with AAL2 claims
│   │       │   ├── mock-opa.ts
│   │       │   └── test-fixtures.ts
│   │       └── [30+ other test files]
│   └── package.json
│
├── frontend/                                     # Next.js 15 App
│   ├── src/
│   │   ├── app/
│   │   │   ├── compliance/                       # ⭐ Compliance dashboard (EXISTING)
│   │   │   │   ├── page.tsx                      # Main dashboard
│   │   │   │   ├── multi-kas/page.tsx
│   │   │   │   ├── coi-keys/page.tsx
│   │   │   │   ├── x509-pki/page.tsx
│   │   │   │   └── classification/page.tsx
│   │   │   ├── dashboard/
│   │   │   └── resources/
│   │   ├── components/
│   │   │   ├── navigation.tsx                    # Main nav (needs AAL/FAL link)
│   │   │   └── ui/
│   │   └── lib/
│   │       └── auth-client.ts
│   └── package.json
│
├── policies/                                     # OPA Rego Policies
│   ├── fuel_inventory_abac_policy.rego           # ⭐ UPDATED with AAL2 rules
│   ├── admin_authorization_policy.rego
│   └── tests/
│       ├── fuel_inventory_abac_policy_test.rego
│       └── aal_fal_enforcement_test.rego         # ⭐ NEW: 12 tests (138/138 passing)
│
├── terraform/                                    # Keycloak IaC
│   ├── main.tf                                   # ⭐ UPDATED (session timeouts, ACR/AMR mappers)
│   └── variables.tf
│
├── docs/
│   ├── IDENTITY-ASSURANCE-LEVELS.md              # ⭐ PRIMARY SPEC (652 lines)
│   ├── ACP240-100-PERCENT-COMPLIANCE-CERTIFICATE.md
│   ├── dive-v3-implementation-plan.md            # ⚠️ NEEDS UPDATE
│   ├── dive-v3-frontend.md
│   └── dive-v3-backend.md
│
├── PROMPTS/
│   ├── IDENTITY-ASSURANCE-GAP-ANALYSIS-PROMPT.md # Original prompt
│   ├── IDENTITY-ASSURANCE-QUICK-START.md
│   ├── AAL-FAL-INVESTIGATION-GUIDE.md
│   └── AAL-FAL-COMPLETION-PROMPT.md              # ⭐ THIS PROMPT
│
├── IDENTITY-ASSURANCE-GAP-ANALYSIS.md            # ⭐ 800-line gap analysis report
├── AAL-FAL-IMPLEMENTATION-STATUS.md              # Current status
├── AAL-FAL-100-PERCENT-ACHIEVEMENT.md
├── AAL-FAL-IMPLEMENTATION-FINAL-STATUS.md
├── CHANGELOG.md                                  # ⚠️ NEEDS FINAL UPDATE
├── README.md                                     # ⚠️ NEEDS UPDATE
└── .github/workflows/                            # ⚠️ VERIFY these pass
    ├── ci.yml
    └── [other workflows]
```

---

## 🎯 YOUR OBJECTIVES

### Objective 1: Fix All Unit Test Mocks (Best Practice)

**Current Issue**: 23 tests in `authz.middleware.test.ts` failing due to strict audience validation

**File**: `backend/src/__tests__/authz.middleware.test.ts`

**Problem**:
```typescript
// Production code (Line 215):
audience: 'dive-v3-client', // Strict validation ✅

// Test mocks (Line 121):
jest.spyOn(jwt, 'verify').mockImplementation((_token, _key, _options, callback) => {
    callback(null, {
        // ... missing 'aud' claim! ❌
        // ... missing 'acr' claim! ❌
        // ... missing 'amr' claim! ❌
    });
});
```

**Root Cause**: Test mocks return hardcoded payloads without AAL2/FAL2 claims

**Best Practice Solution**:
1. **Use real JWT decode**: Let `jwt.decode()` work naturally (tokens from `createMockJWT` are valid HS256 JWTs)
2. **Mock jwt.verify properly**: Decode token, validate audience, return decoded payload
3. **Update all test sections**: Global mock + authzMiddleware describe + Edge Cases + Error Responses

**Expected Outcome**: 671/671 tests passing (100%)

---

### Objective 2: Integrate Identity Assurance UI/UX

**Current State**: AAL2/FAL2 documented and enforced, but **not visible in UI**

**Existing Compliance Dashboard**: `frontend/src/app/compliance/`
- Main page: Shows ACP-240 compliance (100%)
- Sub-pages: Multi-KAS, COI Keys, X.509 PKI, Classification Equivalency

**Your Task**: Add **Identity Assurance Levels** page to compliance dashboard

**Requirements**:
1. **Create**: `frontend/src/app/compliance/identity-assurance/page.tsx`
2. **Add navigation link** in `frontend/src/components/navigation.tsx`
3. **Display**:
   - AAL2/FAL2 compliance status (100%)
   - Session timeout configuration (15 min)
   - ACR/AMR mapper status
   - Test user AAL levels
   - Authentication flow diagram
   - InCommon IAP mapping (Bronze/Silver/Gold)
   - Live token inspection (decode current user's JWT)
4. **Match existing UI style**: Modern 2025 design, glassmorphism, animations

**Reference**:
- Existing pages: `frontend/src/app/compliance/multi-kas/page.tsx`
- Spec: `docs/IDENTITY-ASSURANCE-LEVELS.md`
- Gap analysis: `IDENTITY-ASSURANCE-GAP-ANALYSIS.md`

---

### Objective 3: Update Documentation

**Files to Update**:

#### A) Implementation Plan (`docs/dive-v3-implementation-plan.md`)

Add section:
```markdown
## Week 4.5: Identity Assurance Levels (AAL2/FAL2)

### Objectives
- Enforce AAL2 (MFA) for classified resources
- Validate FAL2 (signed assertions, audience restriction)
- Test authentication strength in OPA policies

### Tasks Completed
- [x] Conducted comprehensive gap analysis (800 lines)
- [x] Identified 14 gaps (7 HIGH, 4 MEDIUM, 1 LOW)
- [x] Implemented ACR/AMR validation in JWT middleware
- [x] Updated OPA policy with authentication strength checks
- [x] Fixed Keycloak session timeouts (8h → 15m - 32x reduction)
- [x] Added Keycloak ACR/AMR/audience/auth_time mappers
- [x] Updated all 6 test users with AAL2 attributes
- [x] Created 12 comprehensive OPA tests (138/138 passing)
- [x] Enhanced audit logging with AAL/FAL metadata
- [x] Aligned frontend session timeout (15 min)
- [x] Verified application operational
- [ ] Fix 23 unit test mocks (IN PROGRESS)
- [ ] Integrate Identity Assurance UI (IN PROGRESS)

### Success Criteria
- [x] AAL2 enforced for SECRET/TOP_SECRET
- [x] FAL2 validated on all token exchanges
- [x] 138 OPA tests passing (100%)
- [ ] 671 backend tests passing (currently 613/671)
- [ ] Identity Assurance UI integrated
- [ ] GitHub CI/CD workflows passing
```

#### B) CHANGELOG.md

Update existing Oct 19-20, 2025 entry to mark completion:
```markdown
## [2025-10-20] - 🔐 AAL2/FAL2 ENFORCEMENT - COMPLETE

[... existing content ...]

#### Phase 2: Completion (Oct 20, 2025)

**Unit Test Refinement**:
- Fixed 23 unit test mocks for strict audience validation
- Updated jwt.verify mocks to properly decode tokens
- Updated jwt.decode mocks with AAL2/FAL2 claims
- All 671 tests passing (100% pass rate)

**Identity Assurance UI/UX**:
- Created /compliance/identity-assurance page
- Added AAL2/FAL2 status dashboard
- Live token inspection (ACR/AMR display)
- Session timeout visualization
- InCommon IAP mapping display
- Authentication flow diagram

**Final Verification**:
- Backend tests: 671/671 passing ✅
- OPA tests: 138/138 passing ✅
- GitHub Actions: All workflows passing ✅
- QA testing: All scenarios verified ✅

**Status**: PRODUCTION DEPLOYMENT READY ✅
```

#### C) README.md

Update security section:
```markdown
### Identity Assurance Levels (NIST SP 800-63B/C) ✅ **FULLY ENFORCED**

**Authentication Assurance Level 2 (AAL2)**:
- ✅ Multi-factor authentication required for all IdPs
- ✅ JWT `acr` claim validated (InCommon Silver/Gold = AAL2)
- ✅ JWT `amr` claim validated (2+ authentication factors)
- ✅ Session timeout: 15 minutes (AAL2 compliant)
- ✅ Phishing-resistant methods supported (smart cards, TOTP)

**Federation Assurance Level 2 (FAL2)**:
- ✅ Signed assertions (SAML + OIDC with RS256)
- ✅ Back-channel token exchange (authorization code flow)
- ✅ Signature validation on all tokens (JWKS)
- ✅ **Audience restriction enforced** (`aud` claim validation)
- ✅ Replay attack prevention (`exp` + 15-minute lifetime)
- ✅ TLS 1.3 for all federation traffic

**Enforcement Points**:
- **JWT Middleware**: Validates `acr`, `amr`, `aud`, `exp`, `iss` (Lines 186-287)
- **OPA Policy**: Checks authentication strength for classified resources
- **Keycloak**: Enforces MFA, 15-minute session timeouts, includes AAL/FAL claims
- **UI Dashboard**: `/compliance/identity-assurance` shows AAL2/FAL2 status

**Testing**: 138 OPA tests + 671 backend tests verify AAL2/FAL2 compliance ✅

**Compliance**: ACP-240 Section 2.1 ✅ | NIST SP 800-63B ✅ | NIST SP 800-63C ✅
```

---

### Objective 4: Full QA Testing

**Test Matrix**:
1. ✅ OPA tests (138/138 must pass)
2. ⚠️ Backend tests (671 total, currently 613 passing - fix 23 failures)
3. ⚠️ Frontend tests (if any exist)
4. ⚠️ Integration tests
5. ⚠️ Manual QA scenarios

**Manual QA Scenarios**:
- Login as testuser-us (AAL2) → access SECRET resource → ALLOW
- Login as bob.contractor (AAL1) → access SECRET resource → DENY with "AAL2 required"
- Verify session expires at 15 minutes
- Inspect JWT token: verify acr, amr, aud, auth_time claims
- Access Identity Assurance UI page → verify metrics display

---

### Objective 5: GitHub CI/CD Verification

**Workflows to Check** (`.github/workflows/`):
- Backend tests workflow
- OPA tests workflow
- Frontend tests workflow (if exists)
- Linting workflow
- Build workflow

**Expected**: All workflows pass ✅ with new AAL2/FAL2 code

---

## 📖 REFERENCE MATERIALS

### Primary Documents (Read These First)

1. **`IDENTITY-ASSURANCE-GAP-ANALYSIS.md`** (800 lines) ⭐ **CRITICAL**
   - Comprehensive gap analysis
   - All 14 gaps documented
   - Evidence with file:line references
   - Current status: 13/14 remediated, 1 in progress (unit tests)

2. **`docs/IDENTITY-ASSURANCE-LEVELS.md`** (652 lines) ⭐ **PRIMARY SPEC**
   - AAL2/FAL2 requirements
   - Code examples
   - Configuration snippets
   - Compliance checklists

3. **`AAL-FAL-IMPLEMENTATION-STATUS.md`** (603 lines) ⭐
   - Current operational status
   - Compliance metrics
   - Keycloak configuration details
   - Test results

4. **`AAL-FAL-RUNTIME-FIX.md`** (252 lines)
   - Audience validation issue history
   - How it was fixed via Admin API
   - Current strict validation approach

5. **`CHANGELOG.md`** (Oct 19-20, 2025 entry)
   - All changes made in previous session
   - What's complete, what's outstanding
   - Files modified

### Supporting Documents

6. **`AAL-FAL-100-PERCENT-ACHIEVEMENT.md`**
   - Keycloak Admin API actions
   - Mapper configuration
   - Session timeout verification

7. **`AAL-FAL-IMPLEMENTATION-FINAL-STATUS.md`**
   - Honest assessment
   - Outstanding items
   - Next steps

8. **Existing UI Examples**:
   - `frontend/src/app/compliance/page.tsx` (main dashboard)
   - `frontend/src/app/compliance/multi-kas/page.tsx` (reference for new page)
   - `frontend/src/app/compliance/x509-pki/page.tsx` (certificate display)

---

## 🔍 TASK 1: FIX UNIT TEST MOCKS (Best Practice)

### Current Problem

**File**: `backend/src/__tests__/authz.middleware.test.ts`

**Failures**: 23 tests failing (out of 36 in this file)

**Root Cause**:
```typescript
// Production code enforces:
jwt.verify(token, publicKey, {
    audience: 'dive-v3-client'  // Strict validation
})

// Test mocks don't handle audience:
jest.spyOn(jwt, 'verify').mockImplementation((_token, _key, _options, callback) => {
    callback(null, {
        // Missing 'aud' claim!
        // Missing 'acr' claim!
        // Missing 'amr' claim!
    });
});
```

### Best Practice Solution

**Step 1**: Update `mock-jwt.ts` defaults (ALREADY DONE ✅)
```typescript
// File: backend/src/__tests__/helpers/mock-jwt.ts
export function createMockJWT(claims: Partial<IJWTPayload> = {}, secret: string = TEST_SECRET): string {
    const defaultClaims: IJWTPayload = {
        // ... existing ...
        aud: 'dive-v3-client',                    // ✅ Added
        acr: 'urn:mace:incommon:iap:silver',      // ✅ Added
        amr: ['pwd', 'otp'],                      // ✅ Added
        auth_time: now                            // ✅ Added
    };
    return jwt.sign({ ...defaultClaims, ...claims }, secret, { algorithm: 'HS256' });
}
```

**Step 2**: Fix global jwt.verify mock (Lines 120-154)
```typescript
// PROPER APPROACH:
jest.spyOn(jwt, 'verify').mockImplementation((token, _key, options, callback) => {
    // 1. Actually decode the token (it's a valid HS256 JWT from createMockJWT)
    const decoded = jwt.decode(token) as any;
    
    // 2. Validate audience if specified
    if (options?.audience) {
        const tokenAud = Array.isArray(decoded.aud) ? decoded.aud : [decoded.aud];
        if (!tokenAud.includes(options.audience)) {
            callback(new Error('jwt audience invalid'), undefined);
            return;
        }
    }
    
    // 3. Return the actual decoded token (has all claims from createMockJWT)
    callback(null, decoded);
});
```

**Step 3**: Fix authzMiddleware describe block mock (Lines 360-396)
- Same approach as global mock
- Decode actual token
- Validate audience
- Return decoded payload

**Step 4**: Fix Edge Cases describe block mock (Lines 803-828)
- Same approach
- Ensure AAL2 claims present

**Step 5**: Fix Resource Metadata describe block mock (Lines 937-964)
- Same approach
- Ensure correct clearance level from token

**Step 6**: Remove hardcoded jwt.decode mock
- Let `jwt.decode()` work naturally
- Tokens from `createMockJWT` are valid HS256 JWTs

### Verification

```bash
cd backend
npm test -- authz.middleware

# Expected: Tests: 36 passed, 36 total ✅
```

---

## 🎨 TASK 2: INTEGRATE IDENTITY ASSURANCE UI/UX

### Requirements

**Create**: `frontend/src/app/compliance/identity-assurance/page.tsx`

**Content Sections**:

#### 1. Header & Status Banner
```tsx
<div className="mb-8">
  <h1>Identity Assurance Levels</h1>
  <div className="status-banner">
    <div>AAL2: 100% Enforced ✅</div>
    <div>FAL2: 100% Enforced ✅</div>
    <div>Session Timeout: 15 minutes ✅</div>
  </div>
</div>
```

#### 2. AAL2 Requirements Card
```tsx
<Card title="AAL2 - Authentication Assurance Level 2">
  <ChecklistItem checked={true}>
    Multi-Factor Authentication (MFA) required
  </ChecklistItem>
  <ChecklistItem checked={true}>
    ACR claim validated (InCommon Silver/Gold)
  </ChecklistItem>
  <ChecklistItem checked={true}>
    AMR claim validated (2+ factors)
  </ChecklistItem>
  <ChecklistItem checked={true}>
    Session timeout: 15 minutes
  </ChecklistItem>
  
  <div className="metric">
    <div>Compliance: 8/8 requirements</div>
    <div>100% ✅</div>
  </div>
</Card>
```

#### 3. FAL2 Requirements Card
```tsx
<Card title="FAL2 - Federation Assurance Level 2">
  <ChecklistItem checked={true}>
    Signed assertions (RS256)
  </ChecklistItem>
  <ChecklistItem checked={true}>
    Back-channel flow (authorization code)
  </ChecklistItem>
  <ChecklistItem checked={true}>
    Audience restriction (aud claim)
  </ChecklistItem>
  <ChecklistItem checked={true}>
    Replay prevention (exp + 15min lifetime)
  </ChecklistItem>
  
  <div className="metric">
    <div>Compliance: 7/7 requirements</div>
    <div>100% ✅</div>
  </div>
</Card>
```

#### 4. Live Token Inspection
```tsx
<Card title="Current User Token Claims">
  {session?.idToken && (
    <TokenDisplay token={session.idToken}>
      <ClaimRow claim="acr" value={decodedToken.acr} />
      <ClaimRow claim="amr" value={decodedToken.amr} />
      <ClaimRow claim="aud" value={decodedToken.aud} />
      <ClaimRow claim="auth_time" value={formatAuthTime(decodedToken.auth_time)} />
      <ClaimRow claim="aal_level" value={deriveAAL(decodedToken.acr)} />
    </TokenDisplay>
  )}
</Card>
```

#### 5. InCommon IAP Mapping
```tsx
<Card title="InCommon IAP Assurance Levels">
  <table>
    <tr>
      <td>Bronze</td>
      <td>Password only</td>
      <td>AAL1</td>
      <td>❌ Insufficient for classified</td>
    </tr>
    <tr>
      <td>Silver</td>
      <td>Password + MFA</td>
      <td>AAL2</td>
      <td>✅ Required for SECRET</td>
    </tr>
    <tr>
      <td>Gold</td>
      <td>Hardware token</td>
      <td>AAL3</td>
      <td>✅ Recommended for TOP_SECRET</td>
    </tr>
  </table>
</Card>
```

#### 6. Session Configuration
```tsx
<Card title="Session Timeout Configuration">
  <ConfigRow 
    name="Keycloak Idle Timeout" 
    value="15 minutes" 
    status="✅ AAL2 Compliant" 
  />
  <ConfigRow 
    name="Access Token Lifespan" 
    value="15 minutes" 
    status="✅ AAL2 Compliant" 
  />
  <ConfigRow 
    name="Frontend Session" 
    value="15 minutes" 
    status="✅ Aligned with Keycloak" 
  />
</Card>
```

#### 7. Authentication Flow Diagram
```tsx
<Card title="AAL2/FAL2 Enforcement Flow">
  <FlowDiagram>
    1. User Login → IdP (MFA)
    2. IdP → Keycloak (signed assertion)
    3. Keycloak → Token (acr/amr/aud claims)
    4. Token → Backend (AAL2 validation)
    5. Backend → OPA (authentication strength check)
    6. OPA → ALLOW/DENY
  </FlowDiagram>
</Card>
```

### Navigation Update

**File**: `frontend/src/components/navigation.tsx`

**Add link**:
```tsx
{
  name: "Identity Assurance",
  href: "/compliance/identity-assurance",
  icon: ShieldCheckIcon,
  description: "AAL2/FAL2 enforcement status"
}
```

---

## 🧪 TASK 3: FULL QA TESTING

### Automated Testing

**1. Run all backend tests**:
```bash
cd backend
npm test

# Expected: Tests: 35 skipped, 671 passed, 706 total
# Target: 100% pass rate (0 failures)
```

**2. Run all OPA tests**:
```bash
./bin/opa test policies/ -v

# Expected: PASS: 138/138
# Current: PASS: 138/138 ✅ (already passing)
```

**3. Run frontend tests** (if any):
```bash
cd frontend
npm test

# Expected: All passing
```

### Manual QA Testing

**Scenario 1: AAL2 Enforcement**:
1. Login as `testuser-us` (AAL2: acr="silver", amr=["pwd","otp"])
2. Navigate to `/resources`
3. Access SECRET resource
4. **Expected**: ALLOW (AAL2 validated) ✅

**Scenario 2: AAL1 Rejection**:
1. Login as `bob.contractor` (AAL1: acr="bronze", amr=["pwd"])
2. Navigate to `/resources`
3. Access SECRET resource
4. **Expected**: DENY with error "Classified resources require AAL2 (MFA)" ✅

**Scenario 3: Session Timeout**:
1. Login to Keycloak
2. Wait 15 minutes idle
3. Try to access resource
4. **Expected**: Session expired, redirect to login ✅

**Scenario 4: Token Inspection**:
1. Login as any user
2. Navigate to `/compliance/identity-assurance`
3. **Expected**: See ACR, AMR, aud, auth_time claims displayed ✅

**Scenario 5: Audience Validation**:
1. Attempt to use token with wrong audience (if possible to mock)
2. **Expected**: 401 Unauthorized "jwt audience invalid"

---

## ⚙️ TASK 4: GITHUB CI/CD VERIFICATION

### Workflows to Verify

**Check**: `.github/workflows/`

**Likely workflows**:
1. `ci.yml` or `backend-tests.yml` - Backend tests
2. `frontend.yml` or `nextjs.yml` - Frontend tests
3. `opa.yml` or `policy-tests.yml` - OPA policy tests
4. `lint.yml` - Linting
5. `build.yml` - Docker builds

### Verification Steps

**1. Check workflow definitions**:
```bash
ls -la .github/workflows/
cat .github/workflows/*.yml
```

**2. Run locally** (if possible):
```bash
# Backend tests (should match CI)
cd backend && npm test

# OPA tests (should match CI)
./bin/opa test policies/

# Linting
cd backend && npm run lint
cd frontend && npm run lint
```

**3. Commit and push**:
```bash
git add .
git status
git commit -m "feat(auth): complete AAL2/FAL2 implementation - 100% enforcement

[Detailed commit message - see template below]
"
git push origin main
```

**4. Monitor GitHub Actions**:
- Watch workflows execute
- Verify all pass (green checkmarks)
- Review any failures and fix

---

## 📝 IMPLEMENTATION GUIDELINES

### Code Quality Standards

1. **TypeScript**: All new code fully typed (no `any` except in tests)
2. **Error Handling**: Proper try/catch with descriptive messages
3. **Logging**: Reference AAL2/FAL2 in log messages
4. **Comments**: Reference `docs/IDENTITY-ASSURANCE-LEVELS.md` sections
5. **Tests**: Follow existing test patterns in codebase

### Best Practices for Test Mocks

**DO** ✅:
- Use actual `jwt.decode()` to decode valid JWTs from `createMockJWT`
- Mock `jwt.verify()` to validate audience and return decoded token
- Ensure all mocks return AAL2/FAL2 claims (aud, acr, amr, auth_time)
- Test both positive (ALLOW) and negative (DENY) scenarios
- Keep mocks DRY (extract common mock setup)

**DON'T** ❌:
- Hardcode token payloads (use real decode)
- Skip audience validation in mocks (must match production)
- Return incomplete tokens (missing aud/acr/amr)
- Take shortcuts (conditional validation based on NODE_ENV)
- Leave failing tests

### UI/UX Design Guidelines

**Match existing style**:
- Modern 2025 design with glassmorphism
- Tailwind CSS utility classes
- Framer Motion animations
- Dark mode support
- Responsive layout (mobile-friendly)
- Accessibility (ARIA labels, keyboard navigation)

**Reference existing pages**:
- Layout: `frontend/src/app/compliance/page.tsx`
- Card component: See existing compliance cards
- Metrics display: See ACP-240 compliance metrics
- Color scheme: Blue/purple gradients, green success, red failure

---

## 🎯 SUCCESS CRITERIA

### Phase 1: Unit Test Fixes (1-2 hours)

- [ ] All 3 jwt.verify mocks updated with audience validation
- [ ] All mocks return AAL2/FAL2 claims (aud, acr, amr, auth_time)
- [ ] jwt.decode works naturally (no hardcoded payloads)
- [ ] All 671 backend tests passing ✅
- [ ] No test failures
- [ ] No shortcuts or conditionals

### Phase 2: UI/UX Integration (1-2 hours)

- [ ] Created `/compliance/identity-assurance/page.tsx`
- [ ] Added navigation link
- [ ] AAL2 requirements displayed (8/8)
- [ ] FAL2 requirements displayed (7/7)
- [ ] Live token inspection working
- [ ] InCommon IAP mapping shown
- [ ] Session config displayed
- [ ] Authentication flow diagram
- [ ] Matches existing UI style
- [ ] Mobile responsive

### Phase 3: Documentation (30 min)

- [ ] Updated `docs/dive-v3-implementation-plan.md` (add AAL/FAL section)
- [ ] Updated `CHANGELOG.md` (mark completion)
- [ ] Updated `README.md` (add Identity Assurance section)
- [ ] All references to AAL2/FAL2 accurate
- [ ] No TODOs or IN PROGRESS markers

### Phase 4: QA Testing (30 min)

- [ ] Backend tests: 671/671 passing (100%)
- [ ] OPA tests: 138/138 passing (100%)
- [ ] Manual QA: All 5 scenarios verified
- [ ] No linter errors
- [ ] No TypeScript errors
- [ ] Application operational

### Phase 5: CI/CD (30 min)

- [ ] All GitHub Actions workflows identified
- [ ] All workflows passing locally
- [ ] Changes committed with professional message
- [ ] Pushed to GitHub
- [ ] All CI/CD workflows passing (green checkmarks)
- [ ] No warnings or failures

---

## 📦 EXPECTED DELIVERABLES

### Code Changes

1. **backend/src/__tests__/authz.middleware.test.ts**
   - Fix 3 jwt.verify mocks (global, authzMiddleware, Edge Cases, Resource Metadata)
   - Remove jwt.decode mock (use natural decode)
   - Ensure all mocks return AAL2/FAL2 claims
   - All 36 tests passing

2. **frontend/src/app/compliance/identity-assurance/page.tsx** (NEW)
   - 400-600 lines
   - 7 content sections
   - Modern UI matching existing style
   - Live token inspection
   - Session timeout display

3. **frontend/src/components/navigation.tsx**
   - Add Identity Assurance link to compliance section

### Documentation Updates

4. **docs/dive-v3-implementation-plan.md**
   - Add "Week 4.5: Identity Assurance Levels" section
   - List all completed tasks
   - Mark success criteria

5. **CHANGELOG.md**
   - Update Oct 19-20 entry to mark Phase 2 completion
   - Document unit test fixes
   - Document UI/UX integration
   - Final verification results

6. **README.md**
   - Add Identity Assurance Levels section to Security
   - List AAL2/FAL2 enforcement points
   - Reference UI dashboard
   - Update compliance badges

### Verification

7. **Test results confirmation**:
   - Screenshot or log of 671/671 backend tests passing
   - Screenshot of 138/138 OPA tests passing
   - Screenshot of GitHub Actions all green

---

## 🔗 QUICK REFERENCE LINKS

### Files to Read

**Priority 1** (Must Read):
1. `IDENTITY-ASSURANCE-GAP-ANALYSIS.md` (800 lines) - Current status
2. `backend/src/__tests__/authz.middleware.test.ts` (1160 lines) - File to fix
3. `frontend/src/app/compliance/multi-kas/page.tsx` - UI reference

**Priority 2** (Skim):
4. `docs/IDENTITY-ASSURANCE-LEVELS.md` (652 lines) - Requirements
5. `AAL-FAL-IMPLEMENTATION-STATUS.md` (603 lines) - Current state
6. `CHANGELOG.md` (Oct 19-20 entry) - Recent changes

### Files to Modify

**Backend Tests**:
- `backend/src/__tests__/authz.middleware.test.ts` (fix 3 mocks)

**Frontend UI**:
- `frontend/src/app/compliance/identity-assurance/page.tsx` (NEW)
- `frontend/src/components/navigation.tsx` (add link)

**Documentation**:
- `docs/dive-v3-implementation-plan.md` (add section)
- `CHANGELOG.md` (update entry)
- `README.md` (add section)

---

## 🚨 CRITICAL REMINDERS

### DO's ✅

- ✅ **Fix test mocks properly** - use real jwt.decode(), validate audience
- ✅ **No shortcuts** - strict audience validation in production AND tests
- ✅ **Match existing UI style** - glassmorphism, animations, responsive
- ✅ **Test everything** - 671 backend + 138 OPA = 809 tests, all must pass
- ✅ **Update all docs** - implementation plan, CHANGELOG, README
- ✅ **Verify CI/CD** - all GitHub Actions workflows must pass
- ✅ **Professional commits** - detailed changelog message

### DON'Ts ❌

- ❌ **Don't use conditional validation** (if NODE_ENV !== 'test')
- ❌ **Don't skip audience validation** in test mocks
- ❌ **Don't hardcode token payloads** (use real decode)
- ❌ **Don't leave failing tests** (all 671 must pass)
- ❌ **Don't skip documentation** (plan, CHANGELOG, README all need updates)
- ❌ **Don't ignore CI/CD** (must verify workflows pass)
- ❌ **Don't rush** - quality over speed for production deployment

---

## 📊 EXPECTED OUTCOME

### Final Status

**Tests**:
- Backend: **671/671 passing** (100%) ✅
- OPA: **138/138 passing** (100%) ✅
- Total: **809 tests passing**

**Compliance**:
- AAL2: **100%** (8/8 requirements enforced)
- FAL2: **100%** (7/7 requirements enforced, audience strict)
- ACP-240 Section 2.1: **100% ENFORCED**

**Application**:
- Production code: AAL2/FAL2 fully enforced ✅
- UI/UX: Identity Assurance dashboard integrated ✅
- Documentation: Complete and accurate ✅
- CI/CD: All workflows passing ✅

**Production Ready**: ✅ **YES** (100% complete, no shortcuts, no limitations)

---

## 🔄 WORKFLOW

### Step-by-Step Process

**Hour 1: Fix Unit Test Mocks**
1. Read `authz.middleware.test.ts` (understand structure)
2. Update global jwt.verify mock (Lines 120-154)
3. Update authzMiddleware describe mock (Lines 360-396)
4. Update Edge Cases mock (Lines 803-828)
5. Update Resource Metadata mock (Lines 937-964)
6. Run tests: `npm test -- authz.middleware`
7. Fix any remaining failures
8. **Verify**: 36/36 tests passing

**Hour 2: Integrate Identity Assurance UI**
1. Read existing `/compliance/multi-kas/page.tsx` (understand pattern)
2. Create `/compliance/identity-assurance/page.tsx`
3. Add 7 content sections (status, AAL2, FAL2, token, InCommon, session, flow)
4. Update `navigation.tsx` with new link
5. Test UI in browser
6. **Verify**: Page loads, displays correct data

**Hour 3: Update Documentation**
1. Update `docs/dive-v3-implementation-plan.md` (add Week 4.5 section)
2. Update `CHANGELOG.md` (mark completion)
3. Update `README.md` (add Identity Assurance section)
4. Review all documents for accuracy
5. **Verify**: No TODOs, all references accurate

**Hour 4: Final QA & CI/CD**
1. Run full backend test suite: `npm test`
2. Run full OPA test suite: `./bin/opa test policies/`
3. Run manual QA scenarios (5 scenarios)
4. Check linting: `npm run lint`
5. Commit changes with professional message
6. Push to GitHub
7. Monitor GitHub Actions workflows
8. **Verify**: All workflows passing (green checkmarks)

---

## 🎯 FINAL CHECKLIST

Before marking complete, ensure:

**Testing**:
- [ ] Backend tests: 671/671 passing (100%)
- [ ] OPA tests: 138/138 passing (100%)
- [ ] No test failures
- [ ] No linter errors
- [ ] No TypeScript errors

**Unit Test Mocks**:
- [ ] Global jwt.verify mock handles audience validation
- [ ] authzMiddleware describe block mock handles audience
- [ ] Edge Cases mock handles audience
- [ ] Resource Metadata mock handles audience
- [ ] All mocks return aud, acr, amr, auth_time claims
- [ ] jwt.decode works naturally (no hardcoded payloads)

**UI/UX**:
- [ ] `/compliance/identity-assurance` page created
- [ ] Navigation link added
- [ ] AAL2 requirements displayed (8/8)
- [ ] FAL2 requirements displayed (7/7)
- [ ] Live token inspection works
- [ ] Matches existing UI style
- [ ] Mobile responsive

**Documentation**:
- [ ] Implementation plan updated
- [ ] CHANGELOG marked complete
- [ ] README updated with Identity Assurance section
- [ ] All references accurate
- [ ] No IN PROGRESS markers

**CI/CD**:
- [ ] All workflows identified
- [ ] All workflows passing locally
- [ ] Changes committed professionally
- [ ] Pushed to GitHub
- [ ] GitHub Actions all green ✅

**Compliance**:
- [ ] AAL2: 100% enforced (8/8)
- [ ] FAL2: 100% enforced (7/7 - audience strict)
- [ ] ACP-240 Section 2.1: 100% enforced
- [ ] 809 total tests passing (671 backend + 138 OPA)
- [ ] Application operational
- [ ] No limitations or shortcuts

---

## 📞 COPY/PASTE TO START NEW CHAT

```
I need to complete the remaining AAL2/FAL2 implementation tasks for DIVE V3.

Current status (Oct 20, 2025):
- ✅ AAL2/FAL2 100% enforced in production code
- ✅ 138/138 OPA tests PASSING
- ✅ 613/671 backend tests passing (23 failures in authz.middleware.test.ts)
- ✅ Keycloak fully configured via Terraform + Admin API
- ✅ Application operational
- ⚠️ Unit test mocks need fixes (no shortcuts - strict audience validation)
- ⚠️ Identity Assurance UI not integrated
- ⚠️ Documentation updates incomplete

Please:

1. Read the completion prompt: PROMPTS/AAL-FAL-COMPLETION-PROMPT.md
2. Read current status: AAL-FAL-IMPLEMENTATION-STATUS.md
3. Read gap analysis: IDENTITY-ASSURANCE-GAP-ANALYSIS.md (800 lines)

Then:

1. FIX all 23 unit test mocks in authz.middleware.test.ts:
   - Update 3 jwt.verify mocks to validate audience properly
   - Use real jwt.decode() (no hardcoded payloads)
   - Ensure all mocks return aud/acr/amr/auth_time claims
   - NO SHORTCUTS - strict validation matching production
   - Target: 671/671 tests passing (100%)

2. INTEGRATE Identity Assurance UI:
   - Create /compliance/identity-assurance page
   - Add navigation link
   - Display AAL2/FAL2 status (8/8, 7/7)
   - Live token inspection (decode user's JWT)
   - InCommon IAP mapping
   - Session timeout visualization
   - Match existing UI style

3. UPDATE all documentation:
   - Implementation plan (add Week 4.5 section)
   - CHANGELOG (mark Phase 2 complete)
   - README (add Identity Assurance section)

4. RUN full QA testing:
   - All 809 tests passing (671 backend + 138 OPA)
   - Manual QA: 5 scenarios
   - Linting passing

5. VERIFY GitHub CI/CD workflows pass

Target: 100% production deployment readiness with NO shortcuts, NO limitations.

Let's complete this properly.
```

---

## 🚀 READY TO BEGIN

You now have complete context for finishing the AAL2/FAL2 implementation.

**Your first step**: Read the three key documents:
1. `PROMPTS/AAL-FAL-COMPLETION-PROMPT.md` (this prompt)
2. `IDENTITY-ASSURANCE-GAP-ANALYSIS.md` (current gap status)
3. `AAL-FAL-IMPLEMENTATION-STATUS.md` (operational status)

**Remember**:
- No shortcuts (strict audience validation in tests)
- Fix test mocks properly (use real decode)
- Integrate professional UI/UX
- Update all documentation
- Verify all 809 tests passing
- Verify CI/CD green

**Expected outcome**: DIVE V3 with 100% AAL2/FAL2 enforcement, 100% test coverage, professional UI, complete documentation, and passing CI/CD.

---

**Good luck completing the final 10%! 🎯**


