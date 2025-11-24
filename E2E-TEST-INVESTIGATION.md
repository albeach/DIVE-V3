# E2E Test Investigation - Root Cause Found

**Date:** November 14, 2025  
**Task:** Week 5 Day 1 - E2E Investigation  
**Status:** ✅ **ROOT CAUSE IDENTIFIED**  
**Time:** 30 minutes  

---

## EXECUTIVE SUMMARY

**Finding:** E2E tests are failing due to **JWT algorithm mismatch**

**Root Cause:**
- **Tests create:** HS256 tokens (symmetric HMAC with shared secret)
- **Server expects:** RS256 tokens (asymmetric RSA with public key from Keycloak)

**Result:** All 4 E2E test failures are JWT authentication failures (401 Unauthorized)

---

## TEST FAILURES ANALYZED

### Failing Tests (4 total)

From CI Run 19373177726:

1. **"should list only resources user is authorized to access"**
   - Expected: 200
   - Received: 401
   - Location: resource-access.e2e.test.ts:53

2. **"should return resources list for any authenticated request"**
   - Expected: 200
   - Received: 401
   - Location: resource-access.e2e.test.ts:73

3. **"should reject upload with invalid classification"**
   - Expected: 400
   - Received: 401
   - Location: resource-access.e2e.test.ts:204

4. **"should reject upload with empty releasabilityTo"**
   - Expected: 400
   - Received: 401
   - Location: resource-access.e2e.test.ts:221

**Pattern:** All expect successful auth (200 or 400), all get 401 (unauthorized)

---

## ROOT CAUSE ANALYSIS

### Mock JWT Implementation

**File:** `backend/src/__tests__/helpers/mock-jwt.ts`  
**Line 72:**
```typescript
return jwt.sign({ ...defaultClaims, ...claims }, secret, { algorithm: 'HS256' });
```

**Key Details:**
- Algorithm: **HS256** (HMAC-SHA256)
- Secret: `'test-secret'` (shared secret)
- Type: Symmetric encryption (same key for sign and verify)

---

### Server JWT Validation

**File:** `backend/src/middleware/authz.middleware.ts`  
**Lines 470-495:**
```typescript
jwtService.verify(
    token,
    publicKey,  // ← Expects RSA public key from Keycloak JWKS
    {
        algorithms: ['RS256'],  // ← Expects RSA asymmetric algorithm
        issuer: validIssuers,
        audience: skipAudienceValidation ? undefined : validAudiences,
    },
    (err: any, decoded: any) => {
        if (err) {
            logger.error('JWT verification failed', {
                error: err.message,
                actualIssuer: actualIssuer,
                expectedIssuers: validIssuers
            });
            reject(err);
        } else {
            resolve(decoded as IKeycloakToken);
        }
    }
);
```

**Key Details:**
- Algorithm: **RS256** (RSA-SHA256)
- Key: Public key from Keycloak JWKS endpoint
- Type: Asymmetric encryption (public key verifies, private key signs)

---

### The Mismatch

| Aspect | Mock JWT (Tests) | Server Validation | Match? |
|--------|------------------|-------------------|--------|
| Algorithm | HS256 | RS256 | ❌ NO |
| Key Type | Shared secret | Public key | ❌ NO |
| Encryption | Symmetric | Asymmetric | ❌ NO |
| Issuer | mock-jwt.ts default | Keycloak JWKS | ❌ NO |

**Result:** JWT verification fails → 401 Unauthorized

---

## WHY THIS HAPPENS

### Production Design (Correct)

The server is correctly configured for **production use**:

1. **Real Keycloak** issues tokens with:
   - RS256 algorithm (asymmetric)
   - Signed with Keycloak's private key
   - Verified with Keycloak's public key (from JWKS endpoint)

2. **Server validates** by:
   - Fetching public key from Keycloak JWKS
   - Verifying signature with public key
   - Checking issuer, audience, expiration

This is **industry best practice** for OAuth 2.0 / OpenID Connect.

---

### Test Design (Simplified, But Incompatible)

The E2E tests use **simplified JWT generation**:

1. **Mock JWT helper** creates tokens with:
   - HS256 algorithm (symmetric)
   - Signed with shared secret `'test-secret'`
   - No JWKS endpoint needed

2. **Assumption** was that server would:
   - Accept HS256 tokens in test environment
   - Verify with shared secret
   - Skip JWKS validation

This assumption is **incorrect** - the server doesn't have a test mode for JWT validation.

---

## EVIDENCE FROM LOGS

### From CI Logs (19373177726)

```
JWT verification failed in jwtService.verify
error: invalid algorithm
actualIssuer: http://localhost:8081/realms/dive-v3-broker
expectedIssuers: [valid issuer array]
```

**Interpretation:** 
- Token has HS256 algorithm
- Server expects RS256
- Verification fails → 401

---

## SOLUTION OPTIONS

### Option A: Update Tests to Use RS256 (Recommended) ✅

**Approach:** Generate proper RS256 tokens for tests

**Implementation:**
1. Create test RSA key pair (private + public)
2. Sign test tokens with private key (RS256)
3. Mock JWKS endpoint to return test public key
4. Server validates normally with RS256

**Pros:**
- ✅ Tests match production behavior
- ✅ Validates real JWT verification flow
- ✅ No server code changes needed
- ✅ Industry best practice

**Cons:**
- ⚠️ More complex test setup
- ⚠️ Need to generate/manage RSA keys
- ⚠️ Need to mock JWKS endpoint

**Effort:** 2-3 hours

**Example Implementation:**
```typescript
// Generate test RSA key pair
import { generateKeyPairSync } from 'crypto';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

// Sign token with private key
export function createE2EJW

T(claims: Partial<IJWTPayload> = {}): string {
  return jwt.sign({ ...defaultClaims, ...claims }, privateKey, { 
    algorithm: 'RS256',
    header: { kid: 'test-key-id' }
  });
}

// Mock JWKS endpoint
nock(process.env.KEYCLOAK_URL)
  .get(`/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/certs`)
  .reply(200, {
    keys: [{ kty: 'RSA', kid: 'test-key-id', n: '...', e: 'AQAB' }]
  });
```

---

### Option B: Add Test Mode to Server (Not Recommended) ❌

**Approach:** Make server accept HS256 in test environment

**Implementation:**
1. Add `NODE_ENV === 'test'` check in verifyToken
2. If test mode, verify with shared secret (HS256)
3. If production, verify with public key (RS256)

**Pros:**
- ✅ Tests work as-is
- ✅ Quick fix

**Cons:**
- ❌ Introduces test-only code in production middleware
- ❌ Security risk (test mode in production)
- ❌ Doesn't test real JWT flow
- ❌ Anti-pattern (test code in production)

**Effort:** 1 hour

**Verdict:** ❌ **DO NOT USE** - violates best practices

---

### Option C: Categorize as Integration Tests (Alternative) 🤔

**Approach:** Move E2E tests to integration test suite

**Implementation:**
1. Move `resource-access.e2e.test.ts` to `integration/` directory
2. Tests skip in `npm run test:unit` (testPathIgnorePatterns)
3. Run in separate CI job with real Keycloak instance

**Pros:**
- ✅ Proper categorization (E2E = integration)
- ✅ Tests use real Keycloak tokens
- ✅ No mock complexity

**Cons:**
- ⚠️ Requires Keycloak service in CI
- ⚠️ Slower test execution
- ⚠️ More CI setup complexity

**Effort:** 1-2 hours (CI configuration)

**Verdict:** 🤔 **VIABLE** - proper separation of concerns

---

### Option D: Mock JWKS Endpoint (Hybrid) ✅

**Approach:** Keep tests as unit tests, mock JWKS response

**Implementation:**
1. Generate test RSA key pair (static, committed)
2. Mock Keycloak JWKS endpoint with test public key
3. Sign test tokens with test private key (RS256)
4. Server validates normally (RS256 flow)

**Pros:**
- ✅ Tests run as unit tests (no external services)
- ✅ Validates real JWT verification flow
- ✅ Fast execution
- ✅ Industry standard mocking pattern

**Cons:**
- ⚠️ Need to mock HTTP endpoint (use nock)
- ⚠️ Slightly more setup than HS256

**Effort:** 2-3 hours

**Verdict:** ✅ **RECOMMENDED** - best balance

---

## RECOMMENDED SOLUTION

**Use Option D: Mock JWKS Endpoint with RS256 Test Keys**

### Rationale

1. **Best Practices:** Tests use same flow as production (RS256)
2. **No Production Code Changes:** Server middleware unchanged
3. **Fast Execution:** No external Keycloak needed
4. **Proper Testing:** Validates real JWT verification logic

### Implementation Plan

**Step 1: Generate Test RSA Keys (10 min)**
```bash
# Generate test keys (do once, commit to repo)
openssl genrsa -out test-private-key.pem 2048
openssl rsa -in test-private-key.pem -pubout -out test-public-key.pem
```

**Step 2: Create RS256 JWT Helper (20 min)**
```typescript
// backend/src/__tests__/helpers/mock-jwt-rs256.ts
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const privateKey = fs.readFileSync(
  path.join(__dirname, '../keys/test-private-key.pem'),
  'utf8'
);

export function createE2EJWT(claims: Partial<IJWTPayload> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  
  return jwt.sign(
    {
      sub: 'testuser-us',
      uniqueID: 'testuser-us',
      clearance: 'SECRET',
      countryOfAffiliation: 'USA',
      acpCOI: ['FVEY'],
      iss: process.env.KEYCLOAK_URL + '/realms/' + process.env.KEYCLOAK_REALM,
      aud: 'dive-v3-client',
      exp: now + 3600,
      iat: now,
      ...claims
    },
    privateKey,
    { 
      algorithm: 'RS256',
      header: { kid: 'test-key-1' }
    }
  );
}
```

**Step 3: Mock JWKS Endpoint (30 min)**
```typescript
// backend/src/__tests__/helpers/mock-jwks.ts
import nock from 'nock';
import fs from 'fs';
import path from 'path';
import { importSPKI, exportJWK } from 'jose';

const publicKeyPem = fs.readFileSync(
  path.join(__dirname, '../keys/test-public-key.pem'),
  'utf8'
);

export async function mockKeycloakJWKS() {
  const publicKey = await importSPKI(publicKeyPem, 'RS256');
  const jwk = await exportJWK(publicKey);
  
  nock(process.env.KEYCLOAK_URL!)
    .persist()
    .get(`/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/certs`)
    .reply(200, {
      keys: [{
        ...jwk,
        kid: 'test-key-1',
        use: 'sig',
        alg: 'RS256'
      }]
    });
}
```

**Step 4: Update E2E Tests (60 min)**
```typescript
// resource-access.e2e.test.ts
import { createE2EJWT } from '../helpers/mock-jwt-rs256';
import { mockKeycloakJWKS } from '../helpers/mock-jwks';

describe('Resource Access E2E Tests', () => {
  beforeAll(async () => {
    // Mock JWKS endpoint before any tests
    await mockKeycloakJWKS();
  });
  
  afterAll(() => {
    // Clean up nock mocks
    nock.cleanAll();
  });
  
  const authToken = createE2EJWT({
    uniqueID: 'testuser@dive.mil',
    clearance: 'SECRET',
    countryOfAffiliation: 'USA',
    acpCOI: ['NATO']
  });
  
  // Tests remain the same...
});
```

**Total Effort:** 2 hours

---

## IMPACT ASSESSMENT

### Current State
- 4 E2E tests failing (all JWT auth issues)
- Tests categorized as "needs investigation"
- Blocking path to 100% backend coverage

### After Fix
- 4 E2E tests passing ✅
- Backend: 13 → 9 failures (31% improvement)
- Proper RS256 JWT testing established
- Reusable pattern for future E2E tests

---

## COMPARISON TO OTHER FAILURES

### MongoDB Tests (6 failures)
- **Cause:** Missing MongoDB service
- **Category:** Infrastructure dependency
- **Fix:** MongoDB Memory Server (4-6 hours)

### OAuth Tests (3 failures)
- **Cause:** Missing rate limiting implementation
- **Category:** Feature not implemented
- **Fix:** Add rate limiting (3-4 hours)

### E2E Tests (4 failures) ← **THIS INVESTIGATION**
- **Cause:** JWT algorithm mismatch (HS256 vs RS256)
- **Category:** Test setup issue
- **Fix:** Mock JWKS + RS256 tokens (2 hours)

**E2E is the quickest fix!** ✅

---

## VALIDATION PLAN

### Step 1: Local Testing
```bash
cd backend

# Generate test RSA keys
./scripts/generate-test-rsa-keys.sh

# Run E2E tests
npm test -- resource-access.e2e.test.ts

# Expected: 4/4 passing (was 0/4)
```

### Step 2: CI Validation
```bash
git push origin main
gh run watch

# Expected: Backend 13 → 9 failures
```

### Step 3: Verify Pattern
- Check that mock JWKS is reusable
- Verify other tests still pass
- Ensure no regressions

---

## NEXT STEPS

### Immediate (Week 5 Day 1 Afternoon)
1. ✅ Investigation complete (this document)
2. 🔄 Implement Option D (Mock JWKS + RS256)
3. 🔄 Test locally (4 tests should pass)
4. 🔄 Push to CI and validate

### After E2E Fix (Week 5 Day 2+)
1. MongoDB Memory Server (6 failures, 4-6 hours)
2. OAuth rate limiting (3 failures, 3-4 hours)
3. Target: < 5 backend failures total

---

## LESSONS LEARNED

### What We Discovered
1. **Algorithm mismatch:** HS256 (tests) vs RS256 (server)
2. **Server correctly configured:** Production-ready JWT validation
3. **Tests need update:** Not a server bug, test setup issue
4. **Quick win potential:** 2 hours to fix all 4 tests

### Best Practices Validated
✅ **Investigation first:** 30 minutes to understand vs guessing  
✅ **Root cause analysis:** Found exact mismatch (HS256 vs RS256)  
✅ **Multiple options:** Evaluated 4 solutions with pros/cons  
✅ **Evidence-based:** Used CI logs + code analysis  
✅ **Clear recommendation:** Option D with rationale  

### Patterns Established
- E2E tests should use RS256 (match production)
- Mock JWKS endpoint for unit test speed
- Generate static RSA test keys (commit to repo)
- Use nock for HTTP mocking (industry standard)

---

## DOCUMENTATION REFERENCES

**Created:**
- E2E-TEST-INVESTIGATION.md (this document)

**References:**
- backend/src/middleware/authz.middleware.ts (lines 470-495) - RS256 validation
- backend/src/__tests__/helpers/mock-jwt.ts (line 72) - HS256 generation
- backend/src/__tests__/e2e/resource-access.e2e.test.ts - Failing tests

**CI Runs:**
- 19373177726 - Shows 4 E2E failures with 401 errors

---

**Status:** ✅ Investigation Complete  
**Root Cause:** JWT algorithm mismatch (HS256 vs RS256)  
**Solution:** Mock JWKS with RS256 test keys  
**Effort:** 2 hours  
**Impact:** Fixes 4 tests (13 → 9 failures)  
**Priority:** High (quick win)  
**Next:** Implement Option D

*Investigation completed: November 14, 2025*  
*Time spent: 30 minutes*  
*Approach: Root cause analysis with evidence*

