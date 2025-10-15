# Phase 1 Implementation Prompt - Validation & Test Harness

**FOR USE IN NEW CHAT SESSION**  
**Date Created:** 2025-10-15  
**Prerequisites:** Phase 0 Complete ✅

---

## CONTEXT: Phase 0 Completion Summary

### What Was Delivered in Phase 0

**Branch:** `feature/phase0-hardening-observability` (14 commits, ready to merge)

**Implemented Features:**
1. ✅ Prometheus metrics service (`backend/src/services/metrics.service.ts`)
   - Endpoints: `/api/admin/metrics` (Prometheus) + `/api/admin/metrics/summary` (JSON)
   - Tracks: approval duration, test results, validation failures, API errors
   
2. ✅ Service Level Objectives defined (`docs/SLO.md`)
   - API Availability: 95%
   - Approval Latency p95: <15s
   - Auth Success Rate: 99%
   - OPA Latency p95: <200ms
   - Security Bypasses: 0 (zero tolerance)

3. ✅ Security baseline established
   - Next.js 15.4.6 → 15.5.4 (fixed CRITICAL CVE-1108952, CVSS 9.1)
   - Backend: 0 vulnerabilities
   - Frontend: 0 critical, 4 moderate dev-only

4. ✅ Documentation complete
   - `docs/SLO.md` - Service Level Objectives
   - `docs/PHASE0-SECRETS-MANAGEMENT.md` - Secrets for pilot
   - `docs/SECURITY-AUDIT-2025-10-15.md` - Baseline audit
   - `docs/PHASE0-COMPLETION-SUMMARY.md` - Exit criteria
   - `docs/PHASE0-README.md` - Quick start guide

5. ✅ IdP selector fixes
   - Fixed Industry Partner flag (🏢 not 🇺🇸)
   - Added Direct Keycloak Login button
   - Created cleanup script for rogue test IdPs

**Files Modified/Created:** 20 files, +5,366 lines  
**Status:** Ready for merge to main

### Current System State

**Operational Stack:**
- Keycloak 23.0 (IdP broker) - http://localhost:8081
- Next.js 15.5.4 (UI) - http://localhost:3000  
- Express.js Backend (PEP) - http://localhost:4000
- OPA 0.68.0 (PDP) - http://localhost:8181
- MongoDB 7.0 (resource metadata + submissions)
- KAS (Key Access Service) - http://localhost:8080

**Active IdPs (Terraform-managed):**
- `canada-idp` (OIDC) - Mock Canada realm
- `france-idp` (SAML) - Mock France realm
- `industry-idp` (OIDC) - Mock Industry realm

**Admin Workflow:**
- Partners submit IdPs via `/admin/idp/new` (6-step wizard)
- Submissions stored in MongoDB (`idp_submissions` collection)
- Super_admins review at `/admin/approvals`
- Approval creates IdP in Keycloak + attribute mappers
- Currently: **100% manual approval** (no automated validation)

**Test Users:**
- `testuser-us` / `Password123!` (SECRET clearance, USA, [NATO-COSMIC, FVEY])
- `testuser-us-confid` / `Password123!` (CONFIDENTIAL clearance)
- `testuser-us-unclass` / `Password123!` (UNCLASSIFIED clearance)

---

## PHASE 1 OBJECTIVE

**Goal:** Implement automated security validation and test harness to reduce manual review burden and prevent insecure/broken IdPs from going live.

**Business Impact:**
- **Security:** Block weak crypto (SHA-1, MD5), outdated TLS (<1.2)
- **Reliability:** Catch configuration errors before production (95% reduction in failures)
- **Efficiency:** Reduce manual review time from 30min → 5min per IdP

**Scope:** Pilot-appropriate (no over-engineering for <10 users)

**Duration:** 2-3 weeks  
**Exit Criteria:** 95% of valid IdPs pass automated checks; broken IdPs fail fast with actionable errors

---

## DELIVERABLES

### 1. TLS Validation Service (2 days)

**File:** `backend/src/services/idp-validation.service.ts` (NEW)

**Function:** `validateTLS(url: string): Promise<ITLSCheckResult>`

**Requirements:**
- Use Node.js `tls.connect()` to probe endpoint
- Check TLS version ≥ 1.2 (reject 1.0, 1.1)
- Extract cipher suite name
- Validate certificate not expired
- Score: TLS 1.3 = 15pts, TLS 1.2 = 12pts, <1.2 = 0pts (fail)

**Return Type:**
```typescript
interface ITLSCheckResult {
  pass: boolean;
  version: string; // 'TLSv1.3', 'TLSv1.2', etc.
  cipher: string; // 'ECDHE-RSA-AES256-GCM-SHA384'
  score: number; // 0-15
  errors: string[];
}
```

**Test Cases:**
- ✅ TLS 1.3 with strong cipher → pass (15pts)
- ✅ TLS 1.2 with AES256 → pass (12pts)
- ❌ TLS 1.1 → fail (0pts, rejection message)
- ❌ TLS 1.0 → fail (0pts)
- ❌ Expired certificate → fail
- ❌ Self-signed certificate → warn but allow for pilot

**Integration:** Call from `createIdPHandler()` during submission

---

### 2. Crypto Algorithm Validator (2 days)

**File:** `backend/src/services/idp-validation.service.ts` (extend)

**Function:** `validateAlgorithms(config: IOIDCIdPConfig | ISAMLIdPConfig): Promise<IAlgorithmCheckResult>`

**Requirements:**

**For OIDC:**
- Fetch JWKS from `config.jwksUrl`
- Extract `alg` from each key
- Check against deny-list: `['HS1', 'RS1', 'none']`
- Require: `RS256`, `RS512`, `ES256`, `ES512`, `PS256`, `PS512`
- Score: SHA-256+ = 25pts, SHA-1 tolerated = 10pts (warn), MD5 = 0pts (fail)

**For SAML:**
- Parse metadata XML `<Signature>` element
- Extract `SignatureMethod` algorithm
- Check against: `http://www.w3.org/2001/04/xmldsig-more#rsa-sha256` (good)
- Deny: `http://www.w3.org/2000/09/xmldsig#rsa-sha1` (weak)
- Score: SHA-256+ = 25pts, SHA-1 = 10pts, MD5 = 0pts

**Return Type:**
```typescript
interface IAlgorithmCheckResult {
  pass: boolean;
  algorithms: string[]; // ['RS256', 'RS512']
  violations: string[]; // ['Weak algorithm: RS1']
  score: number; // 0-25
  recommendations: string[];
}
```

**Test Cases:**
- ✅ OIDC with RS256 → pass (25pts)
- ✅ SAML with SHA-256 → pass (25pts)
- ⚠️ OIDC with RS1 → warn (10pts, logged)
- ❌ SAML with MD5 → fail (0pts, rejected)
- ❌ OIDC with 'none' algorithm → fail (security risk)

---

### 3. SAML Metadata XML Parser (3 days)

**File:** `backend/src/services/saml-metadata-parser.service.ts` (NEW)

**Function:** `parseSAMLMetadata(xmlString: string): Promise<ISAMLMetadataResult>`

**Requirements:**
- Use `xml2js` library to parse XML
- Validate against SAML 2.0 XSD schema (relaxed for pilot)
- Extract:
  - `EntityDescriptor/@entityID`
  - `SingleSignOnService/@Location`
  - `SingleLogoutService/@Location` (optional)
  - `<X509Certificate>` data
  - `<SignatureMethod>` algorithm
- Check certificate:
  - Not expired (compare `notAfter` to current date)
  - Not expiring soon (<30 days = warning)
  - Valid X.509 format
- **Important:** For pilot, allow self-signed certificates with warning

**Return Type:**
```typescript
interface ISAMLMetadataResult {
  valid: boolean;
  entityId: string;
  ssoUrl: string;
  sloUrl?: string;
  certificate: {
    valid: boolean;
    notBefore: string;
    notAfter: string;
    daysUntilExpiry: number;
    issuer: string;
    warnings: string[];
  };
  signatureAlgorithm: string;
  errors: string[];
  warnings: string[];
}
```

**Test Cases:**
- ✅ Valid metadata with SHA-256 cert → pass
- ✅ Valid metadata with cert expiring in 60 days → pass + warning
- ❌ Malformed XML (missing `<EntityDescriptor>`) → fail
- ❌ Expired certificate → fail
- ❌ Missing `SingleSignOnService` → fail
- ⚠️ Self-signed certificate → warn but pass (pilot-appropriate)

**Sample SAML Metadata (for testing):**
```xml
<EntityDescriptor entityID="https://idp.example.com">
  <IDPSSODescriptor>
    <KeyDescriptor use="signing">
      <KeyInfo><X509Data><X509Certificate>MII...</X509Certificate></X509Data></KeyInfo>
    </KeyDescriptor>
    <SingleSignOnService 
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://idp.example.com/saml/sso"/>
  </IDPSSODescriptor>
</EntityDescriptor>
```

**Dependencies:** `npm install xml2js @types/xml2js node-forge`

---

### 4. OIDC Discovery Validator (2 days)

**File:** `backend/src/services/oidc-discovery.service.ts` (NEW)

**Function:** `validateOIDCDiscovery(issuer: string): Promise<IOIDCDiscoveryResult>`

**Requirements:**
- Fetch `${issuer}/.well-known/openid-configuration`
- Timeout: 5 seconds
- Validate required fields exist:
  - `authorization_endpoint`
  - `token_endpoint`
  - `jwks_uri`
  - `issuer` (must match input)
  - `response_types_supported` (must include "code")
  - `subject_types_supported`
- Check optional but recommended:
  - `userinfo_endpoint`
  - `end_session_endpoint`
  - `scopes_supported` (should include "openid", "profile", "email")
  - `acr_values_supported` (for MFA detection)
- Fetch JWKS from `jwks_uri` and validate:
  - Returns valid JSON
  - Contains at least one key
  - Keys have required fields (`kid`, `kty`, `use`, `alg`)

**Return Type:**
```typescript
interface IOIDCDiscoveryResult {
  valid: boolean;
  issuer: string;
  endpoints: {
    authorization: string;
    token: string;
    jwks: string;
    userinfo?: string;
    endSession?: string;
  };
  jwks: {
    reachable: boolean;
    keyCount: number;
    algorithms: string[];
  };
  mfaSupport: {
    detected: boolean;
    acrValues: string[];
  };
  errors: string[];
  warnings: string[];
}
```

**Test Cases:**
- ✅ Valid Okta discovery → pass
- ✅ Valid Azure AD discovery → pass
- ❌ 404 on discovery URL → fail
- ❌ Discovery missing `token_endpoint` → fail
- ❌ JWKS unreachable → fail
- ⚠️ Missing `userinfo_endpoint` → warn but pass

**Example Discovery URLs (for testing):**
- Okta: `https://dev-12345.okta.com/.well-known/openid-configuration`
- Azure AD: `https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration`
- Google: `https://accounts.google.com/.well-known/openid-configuration`

---

### 5. MFA Detection Service (2 days)

**File:** `backend/src/services/mfa-detection.service.ts` (NEW)

**Function:** `detectMFA(config: IOIDCIdPConfig | ISAMLIdPConfig, discoveryData?: IOIDCDiscoveryResult): Promise<IMFACheckResult>`

**Requirements:**

**For OIDC:**
- Check if `acr_values_supported` in discovery includes MFA-related values:
  - `urn:mace:incommon:iap:silver` (InCommon Silver - MFA required)
  - `urn:mace:incommon:iap:bronze` (InCommon Bronze - basic auth)
  - `phr`, `phrh` (NIST 800-63 authenticator levels)
- Check if scopes include `mfa` or `multifactor`
- **Cannot verify without test login** - score based on discovery hints only

**For SAML:**
- Parse metadata for `<AuthnContextClassRef>` elements
- Look for: `urn:oasis:names:tc:SAML:2.0:ac:classes:MultiFactor`
- Or: `urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport` (basic)

**Scoring:**
- MFA policy documented (uploaded PDF) = 20pts
- ACR/AMR hints in discovery = 15pts
- No evidence = 0pts

**Return Type:**
```typescript
interface IMFACheckResult {
  detected: boolean;
  evidence: string[]; // ['acr_values_supported includes silver', 'scope includes mfa']
  score: number; // 0-20
  confidence: 'high' | 'medium' | 'low'; // Based on evidence quality
  recommendations: string[];
}
```

**Test Cases:**
- ✅ Discovery with `acr_values_supported: ['urn:mace:incommon:iap:silver']` → score 15, high confidence
- ✅ SAML with MultiFactor `AuthnContextClassRef` → score 15, high confidence
- ⚠️ No MFA hints in discovery → score 0, recommend uploading policy doc
- ⚠️ Scope includes 'mfa' but no ACR values → score 10, medium confidence

---

### 6. Integration into IdP Submission Workflow (1 day)

**File:** `backend/src/controllers/admin.controller.ts` (MODIFY)

**Update:** `createIdPHandler()` function

**Flow:**
```typescript
export const createIdPHandler = async (req: Request, res: Response) => {
  const createRequest: IIdPCreateRequest = req.body;
  
  // STEP 1: Validate configuration (NEW - Phase 1)
  const validationResults = {
    tlsCheck: await idpValidationService.validateTLS(
      createRequest.config.issuer || createRequest.config.singleSignOnServiceUrl
    ),
    algorithmCheck: await idpValidationService.validateAlgorithms(createRequest.config),
    endpointCheck: await idpValidationService.checkEndpointReachability(createRequest.config),
    
    // Protocol-specific
    metadataCheck: createRequest.protocol === 'saml'
      ? await samlMetadataParser.parseSAMLMetadata(createRequest.config.metadata)
      : null,
    
    discoveryCheck: createRequest.protocol === 'oidc'
      ? await oidcDiscoveryService.validateOIDCDiscovery(createRequest.config.issuer)
      : null,
    
    mfaCheck: await mfaDetectionService.detectMFA(createRequest.config, discoveryCheck)
  };
  
  // STEP 2: Calculate preliminary risk score (Phase 2 feature, stub for now)
  const preliminaryScore = calculatePreliminaryScore(validationResults);
  
  // STEP 3: Check for critical failures
  const criticalFailures = [
    !validationResults.tlsCheck.pass,
    !validationResults.algorithmCheck.pass,
    createRequest.protocol === 'saml' && !validationResults.metadataCheck?.valid,
    createRequest.protocol === 'oidc' && !validationResults.discoveryCheck?.valid
  ].filter(Boolean);
  
  if (criticalFailures.length > 0) {
    // Reject submission immediately
    return res.status(400).json({
      success: false,
      error: 'Validation Failed',
      message: 'IdP configuration contains critical security issues',
      validationResults,
      details: {
        tlsErrors: validationResults.tlsCheck.errors,
        algorithmErrors: validationResults.algorithmCheck.violations,
        metadataErrors: validationResults.metadataCheck?.errors || [],
        discoveryErrors: validationResults.discoveryCheck?.errors || []
      }
    });
  }
  
  // STEP 4: Store submission with validation results
  const submissionId = await idpApprovalService.submitIdPForApproval({
    ...createRequest,
    validationResults, // NEW - Phase 1
    preliminaryScore   // NEW - Phase 1
  });
  
  // STEP 5: Record metrics
  metricsService.recordValidationResult(validationResults);
  
  res.status(201).json({
    success: true,
    data: {
      submissionId,
      validationResults,
      score: preliminaryScore,
      status: 'pending'
    }
  });
};
```

**Impact:**
- Partners get **immediate feedback** on config errors
- Admins only review **pre-validated** submissions
- Broken IdPs never reach approval queue

---

### 7. Validation Results UI (1 day)

**File:** `frontend/src/app/admin/idp/new/page.tsx` (MODIFY)

**Enhancement:** Add validation status panel in wizard Step 5 (Review)

**UI Mockup:**
```
┌─────────────────────────────────────────────────┐
│  Step 5: Review Configuration                  │
├─────────────────────────────────────────────────┤
│                                                 │
│  Validation Results:                            │
│                                                 │
│  ✅ TLS Version: TLSv1.3                        │
│  ✅ Cipher: ECDHE-RSA-AES256-GCM-SHA384         │
│  ✅ Signature Algorithm: RS256                  │
│  ✅ OIDC Discovery: All endpoints reachable     │
│  ⚠️  MFA Detection: No evidence found           │
│                                                 │
│  Preliminary Score: 62/100 (Silver Tier)        │
│                                                 │
│  [Test Connection]                              │
└─────────────────────────────────────────────────┘
```

**React Component:**
```tsx
<ValidationResultsPanel 
  results={validationResults}
  score={preliminaryScore}
  onRevalidate={() => fetchValidation()}
/>
```

**Color Coding:**
- ✅ Green: All checks passed
- ⚠️ Yellow: Warnings (non-critical)
- ❌ Red: Failures (blocks submission)

---

### 8. Test Harness with Playwright (5 days) - STRETCH GOAL

**File:** `backend/src/services/idp-test-harness.service.ts` (NEW)

**Function:** `testLogin(alias: string, testCredentials: ITestCredentials): Promise<ITestResult>`

**Requirements:**
- Use Playwright to automate browser
- Flow:
  1. Navigate to `http://localhost:3000?kc_idp_hint=${alias}`
  2. Wait for IdP login page to load
  3. Fill in test username/password
  4. Click submit
  5. Wait for redirect back to DIVE
  6. Intercept callback and extract token
  7. Parse token claims
  8. Validate required DIVE attributes present
  9. Check if MFA was actually used (parse AMR claim)
  10. Take screenshot if failure

**Pilot Simplification:**
- **Manual test login acceptable** for pilot (automated test harness is stretch goal)
- Provide **test login button** in admin UI that opens IdP in new window
- Admin manually verifies login works and claims are correct
- For Phase 1, focus on **validation** (TLS, crypto, metadata) over full automation

**Return Type:**
```typescript
interface ITestResult {
  success: boolean;
  duration_ms: number;
  claimsReceived: string[];
  claimsMissing: string[]; // Expected but not received
  mfaDetected: boolean; // Based on AMR claim
  screenshot?: string; // base64 encoded image (on failure)
  errorMessage?: string;
  idpResponseTime_ms: number;
}
```

**Test Cases:**
- ✅ Valid OIDC IdP → claims received, no errors
- ✅ Valid SAML IdP → claims mapped correctly
- ❌ Wrong redirect_uri → error captured
- ❌ Missing clearance claim → claimsMissing populated
- ❌ IdP timeout (>30s) → timeout error

**Priority for Pilot:** **DEFER to Phase 2** (focus on validation first)

---

### 9. MongoDB Schema Updates (1 day)

**File:** `backend/src/types/admin.types.ts` (MODIFY)

**Update:** `IIdPSubmission` interface

```typescript
interface IIdPSubmission {
  // Existing fields
  submissionId: string;
  alias: string;
  displayName: string;
  description?: string;
  protocol: 'oidc' | 'saml';
  config: IOIDCIdPConfig | ISAMLIdPConfig;
  attributeMappings: IDIVEAttributeMappings;
  status: 'pending' | 'approved' | 'rejected';
  submittedBy: string;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  
  // NEW - Phase 1
  validationResults: {
    tlsCheck: ITLSCheckResult;
    algorithmCheck: IAlgorithmCheckResult;
    endpointCheck: IEndpointCheckResult;
    metadataCheck?: ISAMLMetadataResult; // SAML only
    discoveryCheck?: IOIDCDiscoveryResult; // OIDC only
    mfaCheck: IMFACheckResult;
  };
  
  // NEW - Phase 1 (preliminary, full scoring in Phase 2)
  preliminaryScore: {
    total: number; // Sum of component scores
    breakdown: {
      tlsScore: number;      // 0-15
      cryptoScore: number;   // 0-25
      mfaScore: number;      // 0-20
    };
    computedAt: string;
  };
}
```

**Migration:** No DB migration needed (MongoDB is schemaless; new fields additive)

---

### 10. Unit Tests (2 days)

**Files:** `backend/src/__tests__/idp-validation.test.ts` (NEW)

**Test Coverage Target:** 90%

**Test Suites:**

```typescript
describe('TLS Validation Service', () => {
  describe('validateTLS()', () => {
    it('should pass for TLS 1.3', async () => {
      const result = await idpValidationService.validateTLS('https://valid-tls13.com');
      expect(result.pass).toBe(true);
      expect(result.version).toBe('TLSv1.3');
      expect(result.score).toBe(15);
    });
    
    it('should pass for TLS 1.2', async () => {
      const result = await idpValidationService.validateTLS('https://valid-tls12.com');
      expect(result.pass).toBe(true);
      expect(result.version).toBe('TLSv1.2');
      expect(result.score).toBe(12);
    });
    
    it('should fail for TLS 1.1', async () => {
      const result = await idpValidationService.validateTLS('https://old-tls11.com');
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.errors).toContain('TLS version too old');
    });
    
    it('should handle connection timeouts', async () => {
      const result = await idpValidationService.validateTLS('https://timeout.example.com');
      expect(result.pass).toBe(false);
      expect(result.errors[0]).toMatch(/timeout|unreachable/i);
    });
  });
});

describe('Crypto Algorithm Validator', () => {
  describe('validateAlgorithms()', () => {
    it('should pass for RS256 in OIDC', async () => {
      const config = { jwksUrl: 'https://idp.com/jwks.json' };
      const result = await idpValidationService.validateAlgorithms(config);
      expect(result.pass).toBe(true);
      expect(result.algorithms).toContain('RS256');
      expect(result.score).toBe(25);
    });
    
    it('should warn for SHA-1 in SAML', async () => {
      const metadata = '<Signature><SignatureMethod Algorithm="...rsa-sha1"/></Signature>';
      const result = await idpValidationService.validateAlgorithms({ metadata });
      expect(result.pass).toBe(true); // Warn but allow for pilot
      expect(result.violations).toContain('Weak algorithm: SHA-1');
      expect(result.score).toBe(10);
    });
    
    it('should fail for MD5', async () => {
      const metadata = '<Signature><SignatureMethod Algorithm="...md5"/></Signature>';
      const result = await idpValidationService.validateAlgorithms({ metadata });
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });
  });
});

describe('SAML Metadata Parser', () => {
  it('should parse valid metadata', async () => {
    const xml = `<EntityDescriptor entityID="test">...</EntityDescriptor>`;
    const result = await samlMetadataParser.parseSAMLMetadata(xml);
    expect(result.valid).toBe(true);
    expect(result.entityId).toBe('test');
  });
  
  it('should reject malformed XML', async () => {
    const xml = '<EntityDescriptor>missing closing tag';
    const result = await samlMetadataParser.parseSAMLMetadata(xml);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid XML');
  });
  
  it('should detect expired certificate', async () => {
    const xmlWithExpiredCert = `<X509Certificate>...</X509Certificate>`;
    const result = await samlMetadataParser.parseSAMLMetadata(xmlWithExpiredCert);
    expect(result.certificate.valid).toBe(false);
    expect(result.errors).toContain('Certificate expired');
  });
});
```

**Run:** `npm run test:unit -- --testPathPattern=validation`

---

### 11. Integration Tests (1 day)

**File:** `backend/src/__tests__/idp-validation.integration.test.ts` (NEW)

**Test Full Workflow:**

```typescript
describe('IdP Submission with Validation', () => {
  it('should accept valid OIDC IdP', async () => {
    const response = await request(app)
      .post('/api/admin/idps')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        alias: 'test-oidc',
        displayName: 'Test OIDC IdP',
        protocol: 'oidc',
        config: {
          issuer: 'https://valid-idp.com',
          clientId: 'test',
          clientSecret: 'secret',
          authorizationUrl: 'https://valid-idp.com/authorize',
          tokenUrl: 'https://valid-idp.com/token',
          jwksUrl: 'https://valid-idp.com/.well-known/jwks.json'
        },
        attributeMappings: { /* ... */ }
      });
    
    expect(response.status).toBe(201);
    expect(response.body.data.validationResults.tlsCheck.pass).toBe(true);
    expect(response.body.data.validationResults.algorithmCheck.pass).toBe(true);
  });
  
  it('should reject IdP with TLS 1.0', async () => {
    const response = await request(app)
      .post('/api/admin/idps')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        alias: 'test-weak-tls',
        protocol: 'oidc',
        config: {
          issuer: 'https://old-tls10.com',
          // ... rest of config
        }
      });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation Failed');
    expect(response.body.details.tlsErrors).toContain('TLS version too old');
  });
  
  it('should reject SAML with invalid metadata XML', async () => {
    const response = await request(app)
      .post('/api/admin/idps')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        alias: 'test-bad-saml',
        protocol: 'saml',
        config: {
          metadata: '<EntityDescriptor>malformed XML'
        }
      });
    
    expect(response.status).toBe(400);
    expect(response.body.details.metadataErrors).toBeDefined();
  });
});
```

---

### 12. CI/CD Workflow Updates (1 day)

**File:** `.github/workflows/ci.yml` (MODIFY or `.github/workflows/phase1-validation.yml` NEW)

**Add Jobs:**

```yaml
name: Phase 1 - Validation Tests

on:
  push:
    branches: [main, develop, 'feature/phase1-*']
  pull_request:
    branches: [main, develop]

jobs:
  security-audit:
    name: Security Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Backend Audit
        run: |
          cd backend
          npm ci
          npm audit --audit-level=moderate
      
      - name: Frontend Audit
        run: |
          cd frontend
          npm ci
          npm audit --audit-level=critical

  validation-service-tests:
    name: Validation Service Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install Dependencies
        run: |
          cd backend
          npm ci
      
      - name: Run Validation Tests
        run: |
          cd backend
          npm run test:unit -- --testPathPattern=validation --coverage
      
      - name: Upload Coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/coverage/lcov.info
          flags: validation-services

  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    services:
      mongodb:
        image: mongo:7.0
        ports:
          - 27017:27017
        env:
          MONGO_INITDB_ROOT_USERNAME: admin
          MONGO_INITDB_ROOT_PASSWORD: password
      
      opa:
        image: openpolicyagent/opa:0.68.0
        ports:
          - 8181:8181
        options: >-
          --health-cmd "curl -f http://localhost:8181/health || exit 1"
          --health-interval 10s
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install Dependencies
        run: |
          cd backend
          npm ci
      
      - name: Run Integration Tests
        run: |
          cd backend
          npm run test:integration
        env:
          MONGODB_URL: mongodb://admin:password@localhost:27017
          OPA_URL: http://localhost:8181

  type-check:
    name: TypeScript Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Backend Type Check
        run: |
          cd backend
          npm ci
          npm run typecheck
      
      - name: Frontend Type Check
        run: |
          cd frontend
          npm ci
          npm run build
```

**Success Criteria:**
- ✅ All tests pass on every commit
- ✅ Security audit shows 0 critical CVEs
- ✅ Type check passes (no TypeScript errors)
- ✅ Integration tests pass with MongoDB + OPA

---

### 13. Documentation Updates (1 day)

**Files to Update:**

**A. Implementation Plan**
```markdown
# File: dive-v3-implementation-plan.md (if exists) or create IMPLEMENTATION-PLAN.md

## Phase 1: Validation & Test Harness ✅

**Status:** Complete (2025-10-XX)
**Duration:** 2 weeks actual (vs. 3 weeks estimated)

**Delivered:**
- TLS validation service (rejects TLS <1.2)
- Crypto algorithm validator (denies SHA-1, MD5)
- SAML metadata XML parser
- OIDC discovery validator
- MFA detection service
- Integration into submission workflow
- Comprehensive unit + integration tests

**Exit Criteria Met:** 6/6
- ✅ 95% of valid IdPs pass automated checks
- ✅ Broken IdPs fail with actionable error messages
- ✅ Test coverage >90% for validation services
- ✅ CI/CD pipeline enforces validation on every commit
- ✅ Documentation complete
- ✅ No new security vulnerabilities introduced
```

**B. CHANGELOG.md**
```markdown
# Changelog

All notable changes to DIVE V3 will be documented in this file.

## [Unreleased]

### Phase 1 - Validation & Test Harness (2025-10-XX)

#### Added
- TLS version validator (rejects TLS 1.0/1.1, scores TLS 1.2/1.3)
- Crypto algorithm checker (denies MD5, SHA-1, weak ciphers)
- SAML metadata XML parser with certificate validation
- OIDC discovery endpoint validator (.well-known/openid-configuration)
- MFA detection service (ACR/AMR claims, AuthnContextClassRef)
- Real-time validation in IdP submission workflow
- Validation results UI panel in wizard (Step 5)
- Comprehensive test suite (unit + integration)

#### Changed
- IdP submission now validates config before storing in MongoDB
- Admin approval queue shows pre-validation status
- Preliminary risk score displayed (full scoring in Phase 2)

#### Security
- Automated detection of weak cryptography
- TLS downgrade attack prevention
- Certificate expiry validation

#### Tests
- 45+ unit tests for validation services
- 15+ integration tests for submission workflow
- Coverage: 92% (up from 71%)

### Phase 0 - Hardening & Observability (2025-10-15)

#### Added
- Prometheus metrics service (/api/admin/metrics)
- Service Level Objectives (5 core SLOs)
- Direct Keycloak login button on main page
- Cleanup script for rogue test IdPs

#### Fixed
- CRITICAL: Next.js 15.4.6 → 15.5.4 (CVE-1108952, auth bypass)
- IdP selector flag mapping (Industry Partner now shows 🏢)

#### Documentation
- SLO definitions (docs/SLO.md)
- Secrets management guide (docs/PHASE0-SECRETS-MANAGEMENT.md)
- Security audit baseline (docs/SECURITY-AUDIT-2025-10-15.md)
```

**C. README.md**
```markdown
# DIVE V3 - Coalition ICAM Pilot

## Recent Updates

### Phase 1: Validation & Test Harness ✅ (Current)

Automated security validation now runs on every IdP submission:
- ✅ TLS version ≥1.2 enforced
- ✅ Weak crypto algorithms blocked (SHA-1, MD5)
- ✅ SAML metadata XML validated
- ✅ OIDC discovery endpoints checked
- ✅ MFA detection (preliminary scoring)

**Impact:** 95% reduction in broken IdP deployments

### Phase 0: Observability Baseline ✅

- ✅ Prometheus metrics at `/api/admin/metrics`
- ✅ 5 SLOs defined (95% API availability, <15s approval latency)
- ✅ CRITICAL security vulnerability fixed (Next.js)
- ✅ Direct Keycloak login added for test users

## Quick Start

See [docs/PHASE0-README.md](docs/PHASE0-README.md) for setup instructions.

## Testing

```bash
# Run all tests
cd backend && npm test

# Run only validation tests
npm run test:unit -- --testPathPattern=validation

# Check code coverage
npm run test:coverage
```

## Monitoring

```bash
# View metrics
curl http://localhost:4000/api/admin/metrics/summary

# Check SLO compliance
# See: docs/SLO.md for weekly review process
```
```

---

### 14. Phase 1 Completion Checklist

**Before marking Phase 1 complete:**

**Code:**
- [ ] TLS validation service implemented and tested
- [ ] Crypto algorithm validator implemented and tested
- [ ] SAML metadata parser implemented and tested
- [ ] OIDC discovery validator implemented and tested
- [ ] MFA detection service implemented
- [ ] Integration into submission workflow complete
- [ ] Validation results UI added to wizard
- [ ] All unit tests passing (>90% coverage)
- [ ] All integration tests passing
- [ ] TypeScript compiles without errors
- [ ] ESLint passes (no new warnings)

**Testing:**
- [ ] Tested with valid OIDC IdP (Okta, Azure AD, or Google)
- [ ] Tested with valid SAML IdP (or mock)
- [ ] Tested rejection of TLS 1.0/1.1
- [ ] Tested rejection of SHA-1/MD5 algorithms
- [ ] Tested malformed SAML XML rejection
- [ ] Tested OIDC discovery 404 handling
- [ ] Manual test of full submission workflow
- [ ] Verified metrics recording validation results

**CI/CD:**
- [ ] GitHub Actions workflow added/updated
- [ ] Security audit job passing
- [ ] Validation tests job passing
- [ ] Integration tests job passing
- [ ] Type check job passing
- [ ] All jobs passing on feature branch

**Documentation:**
- [ ] Implementation plan updated
- [ ] CHANGELOG.md updated with Phase 1 entries
- [ ] README.md updated with new features
- [ ] API documentation updated (if endpoints changed)
- [ ] Phase 1 completion summary written

**Metrics:**
- [ ] Validation failure metrics recording correctly
- [ ] Preliminary scores appearing in submissions
- [ ] No performance degradation (<100ms added latency)
- [ ] Metrics visible at `/api/admin/metrics/summary`

**Review:**
- [ ] Code review by backend lead
- [ ] Security review (no new vulnerabilities)
- [ ] Product review (meets requirements)
- [ ] QA testing complete

---

## SUCCESS CRITERIA (Phase 1 Exit)

### Quantitative Metrics

| **Metric** | **Target** | **Measurement** |
|-----------|------------|-----------------|
| **Validation Coverage** | 95% of IdPs validated | `(validated_submissions / total_submissions) × 100` |
| **False Positive Rate** | <5% | `(valid_IdPs_rejected / total_valid) × 100` |
| **Test Coverage** | >90% | Jest coverage report |
| **Validation Latency** | <3s added | Compare submission time before/after |
| **Error Actionability** | 100% | All errors include fix instructions |

### Qualitative Criteria

- ✅ Admin feedback: "Error messages are clear and actionable"
- ✅ Partner feedback: "I understand why my IdP was rejected"
- ✅ Security team: "We trust automated validation"
- ✅ No regression in existing features

---

## TECHNICAL SPECIFICATIONS

### TypeScript Interfaces (NEW)

```typescript
// backend/src/types/validation.types.ts

export interface ITLSCheckResult {
  pass: boolean;
  version: string;
  cipher: string;
  certificateValid: boolean;
  certificateExpiry?: Date;
  score: number; // 0-15
  errors: string[];
  warnings: string[];
}

export interface IAlgorithmCheckResult {
  pass: boolean;
  algorithms: string[];
  violations: string[];
  score: number; // 0-25
  recommendations: string[];
}

export interface IEndpointCheckResult {
  reachable: boolean;
  latency_ms: number;
  score: number; // 0-10
  errors: string[];
}

export interface ISAMLMetadataResult {
  valid: boolean;
  entityId: string;
  ssoUrl: string;
  sloUrl?: string;
  certificate: {
    valid: boolean;
    notBefore: string;
    notAfter: string;
    daysUntilExpiry: number;
    issuer: string;
    warnings: string[];
  };
  signatureAlgorithm: string;
  errors: string[];
  warnings: string[];
}

export interface IOIDCDiscoveryResult {
  valid: boolean;
  issuer: string;
  endpoints: {
    authorization: string;
    token: string;
    jwks: string;
    userinfo?: string;
    endSession?: string;
  };
  jwks: {
    reachable: boolean;
    keyCount: number;
    algorithms: string[];
  };
  mfaSupport: {
    detected: boolean;
    acrValues: string[];
  };
  errors: string[];
  warnings: string[];
}

export interface IMFACheckResult {
  detected: boolean;
  evidence: string[];
  score: number; // 0-20
  confidence: 'high' | 'medium' | 'low';
  recommendations: string[];
}

export interface IValidationResults {
  tlsCheck: ITLSCheckResult;
  algorithmCheck: IAlgorithmCheckResult;
  endpointCheck: IEndpointCheckResult;
  metadataCheck?: ISAMLMetadataResult; // SAML only
  discoveryCheck?: IOIDCDiscoveryResult; // OIDC only
  mfaCheck: IMFACheckResult;
}

export interface IPreliminaryScore {
  total: number; // Sum of component scores (max 60 without full risk scoring)
  breakdown: {
    tlsScore: number;      // 0-15
    cryptoScore: number;   // 0-25
    mfaScore: number;      // 0-20
  };
  computedAt: string;
}
```

---

### Environment Variables (NEW)

**Add to `backend/.env`:**

```bash
# Phase 1: Validation Settings
TLS_MIN_VERSION=1.2
ALLOWED_SIGNATURE_ALGORITHMS=RS256,RS512,ES256,ES512,PS256,PS512
DENIED_SIGNATURE_ALGORITHMS=HS1,MD5,SHA1,RS1,none
ENDPOINT_TIMEOUT_MS=5000

# Validation strictness (pilot vs production)
VALIDATION_STRICT_MODE=false  # false for pilot (allows SHA-1 with warning)
ALLOW_SELF_SIGNED_CERTS=true  # true for pilot (warn but don't reject)

# Metrics
RECORD_VALIDATION_METRICS=true
```

**Add to `backend/.env.example`:**
```bash
# Phase 1: Validation Configuration
# TLS_MIN_VERSION=1.2
# ALLOWED_SIGNATURE_ALGORITHMS=RS256,RS512,ES256,ES512
# ENDPOINT_TIMEOUT_MS=5000
# VALIDATION_STRICT_MODE=false
```

---

### NPM Dependencies (NEW)

**Add to `backend/package.json`:**

```json
{
  "dependencies": {
    "xml2js": "^0.6.2",
    "node-forge": "^1.3.1",
    "axios": "^1.6.2"  // Already present
  },
  "devDependencies": {
    "@types/xml2js": "^0.4.14",
    "@types/node-forge": "^1.3.10"
  }
}
```

**Install:**
```bash
cd backend
npm install xml2js node-forge
npm install --save-dev @types/xml2js @types/node-forge
```

---

## IMPLEMENTATION STRATEGY

### Week 1: Core Validators

**Days 1-2:** TLS Validation + Algorithm Checker
- Implement `idp-validation.service.ts` with TLS and crypto functions
- Write unit tests (target: 30+ tests)
- Integration with existing codebase

**Days 3-4:** SAML Metadata Parser
- Implement `saml-metadata-parser.service.ts`
- XML parsing with error handling
- Certificate extraction and validation
- Write unit tests (target: 20+ tests)

**Day 5:** OIDC Discovery Validator
- Implement `oidc-discovery.service.ts`
- Fetch `.well-known/openid-configuration`
- JWKS validation
- Write unit tests (target: 15+ tests)

### Week 2: Integration & Testing

**Days 1-2:** MFA Detection + Workflow Integration
- Implement `mfa-detection.service.ts`
- Integrate all validators into `createIdPHandler()`
- Update MongoDB schema (additive - no migration)

**Days 3-4:** UI + Testing
- Add validation results panel to wizard
- Write integration tests
- Manual QA testing with real IdP examples

**Day 5:** CI/CD + Documentation
- Setup GitHub Actions workflow
- Update CHANGELOG, README, implementation plan
- Write Phase 1 completion summary

---

## REFERENCE MATERIALS

### Phase 0 Documentation (READ THESE FIRST)

**Location:** Branch `feature/phase0-hardening-observability`

**Critical Files:**
1. **`docs/PHASE0-README.md`** - Quick start, environment setup
2. **`docs/SLO.md`** - Service Level Objectives, error budgets
3. **`docs/SECURITY-AUDIT-2025-10-15.md`** - Security baseline
4. **`PHASE0-IMPLEMENTATION-COMPLETE.md`** - Phase 0 summary

**Relevant Code:**
5. **`backend/src/services/metrics.service.ts`** - Metrics implementation (reference pattern)
6. **`backend/src/controllers/admin.controller.ts`** - Where to integrate validation
7. **`backend/src/services/idp-approval.service.ts`** - Submission workflow
8. **`backend/src/types/admin.types.ts`** - TypeScript interfaces

### Existing Patterns to Follow

**Service Pattern:**
```typescript
// Reference: backend/src/services/metrics.service.ts
class ValidationService {
  async validateTLS(url: string): Promise<ITLSCheckResult> {
    try {
      logger.debug('Validating TLS', { url });
      // Implementation
      logger.info('TLS validation complete', { url, result });
      return result;
    } catch (error) {
      logger.error('TLS validation failed', { url, error });
      throw error;
    }
  }
}

export const validationService = new ValidationService();
```

**Error Handling Pattern:**
```typescript
// Reference: backend/src/controllers/admin.controller.ts
if (!validationResult.pass) {
  const response: IAdminAPIResponse = {
    success: false,
    error: 'Validation Failed',
    message: 'IdP configuration contains security issues',
    details: validationResult.errors,
    requestId
  };
  return res.status(400).json(response);
}
```

**Test Pattern:**
```typescript
// Reference: backend/src/__tests__/admin.test.ts
describe('Validation Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  it('should validate TLS correctly', async () => {
    const result = await validationService.validateTLS('https://example.com');
    expect(result.pass).toBe(true);
    expect(result.version).toBe('TLSv1.3');
  });
});
```

### External References

**TLS Validation:**
- Node.js TLS API: https://nodejs.org/api/tls.html
- Reference implementation: See `resources/mpe-experiment-main` for patterns

**SAML Metadata:**
- SAML 2.0 Metadata Spec: http://docs.oasis-open.org/security/saml/v2.0/saml-metadata-2.0-os.pdf
- xml2js library: https://github.com/Leonidas-from-XIV/node-xml2js

**OIDC Discovery:**
- OpenID Connect Discovery Spec: https://openid.net/specs/openid-connect-discovery-1_0.html
- Example: https://accounts.google.com/.well-known/openid-configuration

**Certificate Validation:**
- node-forge library: https://github.com/digitalbazaar/forge
- X.509 parsing examples in documentation

---

## TESTING REQUIREMENTS

### Unit Test Coverage (Target: >90%)

**Test Matrix:**

| **Service** | **Test Cases** | **Mock Requirements** |
|------------|---------------|----------------------|
| TLS Validation | 8 cases | Mock tls.connect() responses |
| Algorithm Checker | 10 cases | Mock JWKS fetch, XML parsing |
| SAML Parser | 12 cases | Sample XML files (valid/invalid) |
| OIDC Discovery | 10 cases | Mock HTTP responses |
| MFA Detection | 5 cases | Mock discovery data |

**Test Files:**
- `backend/src/__tests__/tls-validation.test.ts`
- `backend/src/__tests__/algorithm-validation.test.ts`
- `backend/src/__tests__/saml-metadata-parser.test.ts`
- `backend/src/__tests__/oidc-discovery.test.ts`
- `backend/src/__tests__/mfa-detection.test.ts`

**Test Data:**
- Store sample metadata/discovery in `backend/src/__tests__/fixtures/`
- Include: valid SAML XML, invalid SAML XML, Okta discovery JSON, expired cert example

### Integration Tests (Target: 15+ tests)

**Scenarios:**
1. Submit valid OIDC IdP → validation passes → stored in MongoDB
2. Submit IdP with TLS 1.0 → validation fails → 400 error with details
3. Submit SAML with expired cert → validation fails → certificate error shown
4. Submit OIDC with unreachable JWKS → validation fails → network error shown
5. Submit IdP with missing required fields → validation fails → field errors shown

**Test Environment:**
- MongoDB in-memory server or Docker container
- Mock HTTP server for IdP endpoints (use `nock` or `msw`)
- Real OPA container for policy decisions

---

## QA TESTING PLAN

### Manual Testing Scenarios

**Scenario 1: Valid OIDC IdP (Happy Path)**

```
1. Navigate to /admin/idp/new
2. Select protocol: OIDC
3. Fill in (use real Okta/Azure AD test tenant or mock):
   - Issuer: https://dev-12345.okta.com
   - Client ID: test
   - Client Secret: test
   - (Auto-populate via discovery)
4. Proceed to Step 5 (Review)
5. Expected:
   ✅ TLS Version: TLSv1.3
   ✅ Signature Algorithm: RS256
   ✅ Discovery: All endpoints valid
   ✅ Score: 40/60 (TLS=15, Crypto=25, MFA=0)
6. Submit for approval
7. Expected: 201 Created, submission stored
```

**Scenario 2: Invalid TLS (Negative Test)**

```
1. Navigate to /admin/idp/new
2. Select protocol: OIDC
3. Fill in:
   - Issuer: https://old-tls.badssl.com/ (known TLS 1.0 site)
4. Proceed to validation
5. Expected:
   ❌ TLS Version: TLSv1.0 (REJECTED)
   Error: "TLS version too old. Minimum required: TLS 1.2"
   Score: 0/60
6. Attempt to submit
7. Expected: 400 Bad Request with TLS error details
```

**Scenario 3: Malformed SAML (Negative Test)**

```
1. Navigate to /admin/idp/new
2. Select protocol: SAML
3. Upload/paste invalid XML:
   <EntityDescriptor>missing closing tag
4. Proceed to validation
5. Expected:
   ❌ Metadata Validation: FAILED
   Error: "Invalid XML: Expected closing tag for EntityDescriptor"
6. Attempt to submit
7. Expected: 400 Bad Request with XML error
```

**QA Checklist:**
- [ ] Happy path (valid OIDC)
- [ ] Happy path (valid SAML)
- [ ] Reject TLS 1.0
- [ ] Reject TLS 1.1
- [ ] Warn on SHA-1 (but allow)
- [ ] Reject MD5
- [ ] Reject malformed SAML XML
- [ ] Reject expired certificate
- [ ] Handle discovery 404
- [ ] Handle JWKS unreachable
- [ ] Verify metrics recorded
- [ ] Check error messages actionable

---

## COMMIT STRATEGY

### Branch Naming

```
feature/phase1-validation-services
```

### Commit Message Format

Follow Conventional Commits:

```
feat(validation): add TLS version validator

Implements TLS socket probe to check version and cipher.
Rejects TLS <1.2, scores TLS 1.3 higher than 1.2.

- Add validateTLS() function
- Add unit tests (8 test cases)
- Integrate with submission workflow
- Record metrics for TLS failures

Closes: #123
```

**Commit Granularity:**
- One feature = one commit
- Tests in same commit as implementation
- Documentation updates separate commit
- Keep commits <500 lines for easy review

### Suggested Commit Sequence

```
1. feat(validation): add TLS validator with tests
2. feat(validation): add crypto algorithm checker
3. feat(validation): add SAML metadata parser
4. feat(validation): add OIDC discovery validator
5. feat(validation): add MFA detection service
6. feat(validation): integrate validators into submission workflow
7. feat(ui): add validation results panel to wizard
8. test(validation): add integration tests for workflow
9. ci: add validation test job to GitHub Actions
10. docs: update CHANGELOG and README for Phase 1
11. docs: add Phase 1 completion summary
```

---

## FILE STRUCTURE TO CREATE

```
dive-v3/
├── backend/src/
│   ├── services/
│   │   ├── idp-validation.service.ts           (NEW - 400 lines)
│   │   ├── saml-metadata-parser.service.ts     (NEW - 300 lines)
│   │   ├── oidc-discovery.service.ts           (NEW - 250 lines)
│   │   └── mfa-detection.service.ts            (NEW - 150 lines)
│   │
│   ├── types/
│   │   └── validation.types.ts                 (NEW - 200 lines)
│   │
│   ├── __tests__/
│   │   ├── tls-validation.test.ts              (NEW - 200 lines)
│   │   ├── algorithm-validation.test.ts        (NEW - 150 lines)
│   │   ├── saml-metadata-parser.test.ts        (NEW - 250 lines)
│   │   ├── oidc-discovery.test.ts              (NEW - 200 lines)
│   │   ├── mfa-detection.test.ts               (NEW - 100 lines)
│   │   ├── idp-validation.integration.test.ts  (NEW - 300 lines)
│   │   └── fixtures/
│   │       ├── valid-saml-metadata.xml         (NEW - test data)
│   │       ├── invalid-saml-metadata.xml       (NEW - test data)
│   │       ├── okta-discovery.json             (NEW - test data)
│   │       └── azure-ad-discovery.json         (NEW - test data)
│   │
│   └── controllers/
│       └── admin.controller.ts                 (MODIFY - add validation)
│
├── frontend/src/
│   ├── components/admin/
│   │   └── validation-results-panel.tsx        (NEW - 200 lines)
│   │
│   └── app/admin/idp/new/
│       └── page.tsx                            (MODIFY - integrate panel)
│
├── .github/workflows/
│   └── phase1-validation.yml                   (NEW - CI/CD workflow)
│
├── docs/
│   ├── PHASE1-COMPLETION-SUMMARY.md            (NEW - exit criteria)
│   ├── PHASE1-README.md                        (NEW - usage guide)
│   └── api/
│       └── VALIDATION-API.md                   (NEW - API docs)
│
├── CHANGELOG.md                                (UPDATE)
└── README.md                                   (UPDATE)
```

**Estimated Lines of Code:**
- Services: ~1,100 lines
- Tests: ~1,200 lines
- Types: ~200 lines
- UI: ~200 lines
- Documentation: ~1,500 lines
- **Total:** ~4,200 lines

---

## PROMPT FOR AI ASSISTANT (NEW CHAT)

```
**Role & Tone:**
Act as a senior backend engineer and security architect with expertise in Node.js, TypeScript, TLS/crypto validation, SAML 2.0, OIDC, and automated testing. Be implementation-focused, pragmatic, and pilot-appropriate.

**Objective:**
Implement Phase 1 of the DIVE V3 IdP onboarding risk assessment system: automated validation services to check TLS version, cryptographic algorithms, SAML metadata, and OIDC discovery endpoints before IdP approval.

**Context - Phase 0 Complete:**

Phase 0 established observability baseline with:
- ✅ Prometheus metrics service (backend/src/services/metrics.service.ts)
- ✅ 5 Service Level Objectives defined (docs/SLO.md)
- ✅ Security audit baseline (0 critical CVEs)
- ✅ IdP selector fixes (Industry flag, direct login button)
- ✅ Comprehensive documentation (7 guides, 2,795 lines)

**Branch:** `feature/phase0-hardening-observability` (14 commits, ready to merge)

**Current State:**
- Keycloak 23.0 IdP broker with 3 mock IdPs (canada, france, industry)
- Next.js 15.5.4 UI with 6-step IdP wizard (/admin/idp/new)
- Express.js backend with manual approval workflow
- MongoDB stores submissions (idp_submissions collection)
- **Gap:** No automated security validation (all approval is manual)

**Your Task:**

Implement automated validation services for IdP submissions:

1. **TLS Validation Service** (2 days)
   - File: backend/src/services/idp-validation.service.ts (NEW)
   - Function: validateTLS(url) → checks version ≥1.2, cipher strength
   - Scoring: TLS 1.3=15pts, TLS 1.2=12pts, <1.2=0pts (fail)
   - Test cases: 8+ covering TLS 1.0/1.1/1.2/1.3, timeouts, cert expiry

2. **Crypto Algorithm Validator** (2 days)
   - Extend: backend/src/services/idp-validation.service.ts
   - Function: validateAlgorithms(config) → checks JWKS (OIDC) or XML signature (SAML)
   - Deny-list: SHA-1, MD5, HS1, RS1, 'none'
   - Allow-list: RS256, RS512, ES256, ES512, PS256, PS512
   - Scoring: SHA-256+=25pts, SHA-1=10pts (warn), MD5=0pts (fail)
   - Test cases: 10+ covering strong/weak/denied algorithms

3. **SAML Metadata Parser** (3 days)
   - File: backend/src/services/saml-metadata-parser.service.ts (NEW)
   - Function: parseSAMLMetadata(xml) → validates XML, extracts cert, checks expiry
   - Use: xml2js for parsing, node-forge for certificates
   - Pilot-appropriate: Allow self-signed certs with warning
   - Test cases: 12+ covering valid XML, malformed XML, expired cert, missing elements

4. **OIDC Discovery Validator** (2 days)
   - File: backend/src/services/oidc-discovery.service.ts (NEW)
   - Function: validateOIDCDiscovery(issuer) → fetches .well-known, validates endpoints
   - Check: authorization_endpoint, token_endpoint, jwks_uri reachability
   - Extract: acr_values_supported for MFA detection
   - Test cases: 10+ covering valid discovery, 404, missing fields, JWKS unreachable

5. **MFA Detection Service** (2 days)
   - File: backend/src/services/mfa-detection.service.ts (NEW)
   - Function: detectMFA(config, discovery) → scores based on ACR/AMR hints
   - OIDC: Check acr_values_supported for MFA-related URNs
   - SAML: Parse AuthnContextClassRef for MultiFactor
   - Scoring: Documented policy=20pts, ACR hints=15pts, none=0pts

6. **Integration** (1 day)
   - Modify: backend/src/controllers/admin.controller.ts (createIdPHandler)
   - Call all validators before storing submission
   - Reject if critical failures (TLS <1.2, denied algorithms, invalid XML)
   - Store validationResults in MongoDB
   - Record metrics via metricsService.recordValidationResult()

7. **UI Panel** (1 day)
   - File: frontend/src/components/admin/validation-results-panel.tsx (NEW)
   - Display validation status in wizard Step 5
   - Color-coded: green=pass, yellow=warn, red=fail
   - Show preliminary score

8. **Testing** (2 days)
   - Write 65+ unit tests (90% coverage target)
   - Write 15+ integration tests
   - Manual QA with 10 test scenarios
   - Verify CI/CD pipeline passes

9. **Documentation** (1 day)
   - Update CHANGELOG.md with Phase 1 entries
   - Update README.md with validation features
   - Write docs/PHASE1-COMPLETION-SUMMARY.md
   - Update implementation plan

**Technical Specifications:**

TypeScript interfaces defined in: docs/PHASE1-IMPLEMENTATION-PROMPT.md (this file)
- ITLSCheckResult, IAlgorithmCheckResult, ISAMLMetadataResult, etc.

Environment variables needed:
```bash
TLS_MIN_VERSION=1.2
ALLOWED_SIGNATURE_ALGORITHMS=RS256,RS512,ES256,ES512,PS256,PS512
DENIED_SIGNATURE_ALGORITHMS=HS1,MD5,SHA1,RS1,none
ENDPOINT_TIMEOUT_MS=5000
VALIDATION_STRICT_MODE=false  # Pilot mode
```

Dependencies to install:
```bash
cd backend
npm install xml2js node-forge
npm install --save-dev @types/xml2js @types/node-forge
```

**Success Criteria (Phase 1 Exit):**

Quantitative:
- ✅ 95% of valid IdPs pass automated validation
- ✅ Test coverage >90% for validation services
- ✅ False positive rate <5%
- ✅ Validation latency <3s added to submission
- ✅ All CI/CD jobs passing

Qualitative:
- ✅ Error messages are actionable (include fix instructions)
- ✅ No regression in existing features
- ✅ Admin approval time reduced by 50% (from 30min → 15min)

**Constraints:**

1. **Pilot-Appropriate:**
   - Don't build full test harness with Playwright (defer to Phase 2)
   - Allow SHA-1 with warning (strict mode for production)
   - Allow self-signed certificates with warning
   - Simple in-memory metrics (no Prometheus server yet)

2. **Code Quality:**
   - TypeScript strict mode
   - ESLint passing
   - No `any` types
   - Comprehensive JSDoc comments

3. **Testing:**
   - Every validator must have unit tests
   - Integration tests for full workflow
   - Manual QA before marking complete

4. **Documentation:**
   - Update CHANGELOG.md
   - Update README.md
   - Write Phase 1 completion summary
   - API documentation for new endpoints

**Reference Files to Read:**

Critical (read first):
1. docs/PHASE0-README.md - Setup and environment
2. docs/SLO.md - Service level objectives
3. backend/src/services/metrics.service.ts - Service pattern
4. backend/src/controllers/admin.controller.ts - Integration point
5. backend/src/types/admin.types.ts - Existing interfaces

Supporting:
6. docs/PHASE0-COMPLETION-SUMMARY.md - Phase 0 achievements
7. docs/SECURITY-AUDIT-2025-10-15.md - Security baseline
8. backend/src/__tests__/admin.test.ts - Test patterns

**Deliverables:**

1. 4 new validation services (fully tested)
2. Updated submission workflow with validation
3. Validation results UI panel
4. 65+ unit tests (>90% coverage)
5. 15+ integration tests
6. GitHub Actions workflow for CI/CD
7. Updated documentation (CHANGELOG, README, completion summary)

**Timeline:**

Week 1: Core validators (TLS, crypto, SAML, OIDC)
Week 2: MFA detection, integration, testing, docs
Total: 2-3 weeks

**Now proceed with implementation following the specifications above. Start by creating the base validation service with TLS checker, then build incrementally with tests for each component.**
```

---

## ADDITIONAL CONTEXT

### Pilot Philosophy (IMPORTANT)

**Don't Over-Engineer:**
- ✅ Simple in-memory validation results (no separate validation DB)
- ✅ Synchronous validation (no async job queue)
- ✅ Pilot-friendly: allow SHA-1 with warning, allow self-signed certs
- ❌ Don't build: Full test automation with Playwright (Phase 2)
- ❌ Don't build: Distributed validation workers
- ❌ Don't build: Real-time validation as user types

**Build for <10 Users:**
- Simple is better than clever
- Documentation > code complexity
- Manual QA acceptable (don't need 100% test automation)

---

### Integration Points

**Where to Hook In:**

1. **Submission Flow:**
   - `backend/src/controllers/admin.controller.ts` line ~233
   - Before `idpApprovalService.submitIdPForApproval()`
   - Add validation step, reject if critical failures

2. **Metrics Recording:**
   - `backend/src/services/metrics.service.ts`
   - Add: `recordValidationResult(results)`
   - Track: validation failures by type

3. **MongoDB Storage:**
   - Collection: `idp_submissions`
   - Add fields: `validationResults`, `preliminaryScore`
   - No migration needed (MongoDB schemaless)

4. **Frontend Wizard:**
   - `frontend/src/app/admin/idp/new/page.tsx`
   - Step 5 (Review) - add validation panel
   - Show real-time validation status

---

### Known Issues to Avoid

**From Phase 0 Experience:**

1. **TypeScript Compilation:**
   - Always import Request/Response from Express
   - Prefix unused params with underscore: `_req`
   - Run `npm run build` before committing

2. **Test Failures:**
   - Pre-existing failures in `error.middleware.test.ts` (not related to Phase 1)
   - Don't let them block you
   - Focus on new validation tests

3. **Docker Compose:**
   - Warnings about KEYCLOAK_CLIENT_SECRET normal (loaded from Terraform)
   - Keycloak shows "unhealthy" but is functional (known issue)

---

### Acceptance Criteria (Checklist)

**Before submitting PR:**

- [ ] All 4 validators implemented (TLS, crypto, SAML, OIDC)
- [ ] MFA detection service implemented
- [ ] Integration into submission workflow complete
- [ ] Validation results UI panel added
- [ ] 65+ unit tests written and passing
- [ ] 15+ integration tests written and passing
- [ ] Test coverage >90% (check: `npm run test:coverage`)
- [ ] TypeScript compiles: `npm run build`
- [ ] ESLint passes: `npm run lint`
- [ ] Manual QA complete (10 scenarios tested)
- [ ] CI/CD pipeline passing (all jobs green)
- [ ] CHANGELOG.md updated
- [ ] README.md updated
- [ ] Phase 1 completion summary written
- [ ] No new security vulnerabilities (`npm audit`)
- [ ] Code reviewed by team lead

---

**END OF IMPLEMENTATION PROMPT**

**Next Step:** Copy this entire prompt to a new chat session and begin Phase 1 implementation.

