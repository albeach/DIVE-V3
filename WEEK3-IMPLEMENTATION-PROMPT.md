# DIVE V3 Week 3 Implementation Prompt

## Context from Previous Weeks (Completed)

**Week 1 Status:** ✅ COMPLETE - All 9 requirements met, integration tests passing, committed to GitHub  
**Week 2 Status:** ✅ COMPLETE - All objectives met, 53 OPA tests passing, 8 manual scenarios verified, committed to GitHub

**Repository:** https://github.com/albeach/DIVE-V3  
**Branch:** main  
**Latest Commit:** fd0897f (Week 2 complete + CI fixes)  
**Services Running:** Frontend (:3000), Backend (:4000), Keycloak (:8081), MongoDB (:27017), PostgreSQL (:5433), OPA (:8181)

---

## What's Already Built and Working

### Week 1 Foundation (Oct 10-16)
- ✅ Keycloak realm `dive-v3-pilot` with U.S. IdP configured (OIDC)
- ✅ Next.js 15 frontend with NextAuth.js v5 (database session strategy)
- ✅ Express.js backend API with resource endpoints
- ✅ PostgreSQL with NextAuth tables + OAuth token refresh
- ✅ MongoDB with 8 sample resources
- ✅ OPA 0.68.0 policy engine running
- ✅ Full Docker Compose stack operational
- ✅ GitHub Actions CI/CD pipeline

**Test Users (U.S. IdP only):**
- `testuser-us` / `Password123!` - uniqueID: john.doe@mil, clearance: SECRET, country: USA, COI: [NATO-COSMIC, FVEY]
- `testuser-us-confid` / `Password123!` - clearance: CONFIDENTIAL, country: USA, COI: [FVEY]
- `testuser-us-unclass` / `Password123!` - clearance: UNCLASSIFIED, country: USA, COI: []

### Week 2 Authorization (Oct 11)
- ✅ **Complete OPA Rego Policy** (`policies/fuel_inventory_abac_policy.rego` - 238 lines)
  - 5 ABAC rules: clearance, releasability, COI, embargo, missing attributes
  - Fail-secure pattern with `default allow := false`
  - Structured decision output with evaluation details

- ✅ **Comprehensive OPA Test Suite** (`policies/tests/comprehensive_test_suite.rego` - 380 lines)
  - 53 tests passing (100% pass rate)
  - Covers: clearance (16), releasability (10), COI (9), embargo (6), attributes (5), auth (2), obligations (2), reasons (3)

- ✅ **PEP Middleware** (`backend/src/middleware/authz.middleware.ts` - 624 lines)
  - JWT validation using direct JWKS fetch + jwk-to-pem
  - Identity attribute extraction with defensive COI parsing
  - OPA integration with decision caching (60s TTL)
  - Comprehensive error handling and audit logging

- ✅ **Authorization Decision UI** (`frontend/src/app/resources/`)
  - Resources list page with color-coded classifications
  - Resource detail page with allow/deny views
  - Policy evaluation details display

- ✅ **Session Management** (`frontend/src/auth.ts` - 362 lines)
  - Database session strategy (PostgreSQL)
  - OAuth 2.0 automatic token refresh
  - Keycloak federated logout integration
  - Explicit PKCE/state/nonce cookie configuration

- ✅ **Manual Testing Verified:** All 8 scenarios passing (4 allow, 4 deny)

**Critical Files NOT to Modify:**
- `frontend/src/auth.ts` - Database sessions working perfectly
- `backend/src/middleware/authz.middleware.ts` - PEP working correctly
- `policies/fuel_inventory_abac_policy.rego` - All tests passing
- `terraform/main.tf` - U.S. IdP and protocol mappers configured
- `.github/workflows/ci.yml` - CI/CD passing

---

## Week 3 Objectives (Oct 24-30, 2025)

**Primary Goal:** Onboard France/Canada/Industry IdPs, implement claim enrichment, create negative test suite

### Critical Path Tasks

**Priority 1: Configure France IdP (SAML)**
- **File:** `terraform/main.tf` (add new resource block)
- **Reference:** `dive-v3-implementation-plan.md` Section 7.2 (SAML configuration)
- **Requirements:**
  - Add `keycloak_saml_identity_provider` resource for France
  - SAML metadata XML from FranceConnect (or mock test IdP)
  - Entity ID: `https://franceconnect.gouv.fr`
  - SSO URL: `https://franceconnect.gouv.fr/saml/sso`
  - Certificate: Use test certificate for development
  - Alias: `france-idp`

**Priority 2: Create SAML→OIDC Protocol Mappers for France**
- **File:** `terraform/main.tf` (add mapper resources)
- **Challenge:** French SAML attributes have different names
- **Mappings Required:**
  - French `<urn:france:identite:clearance>` → `clearance`
  - French `<urn:france:identite:nationality>` → `countryOfAffiliation` 
  - French clearance levels: `CONFIDENTIEL_DEFENSE` → `CONFIDENTIAL`, `SECRET_DEFENSE` → `SECRET`
  - **Pattern:** Use `keycloak_custom_identity_provider_mapper` with attribute importer

**Priority 3: Configure Canada IdP (OIDC)**
- **File:** `terraform/main.tf` (add OIDC IdP)
- **Pattern:** Similar to existing U.S. IdP configuration
- **Requirements:**
  - Add `keycloak_oidc_identity_provider` resource
  - Discovery URL: `https://gccf.login.canada.ca/.well-known/openid-configuration` (or mock)
  - Client ID and secret: Use test credentials
  - Alias: `canada-idp`
  - Protocol mappers: Map Canadian claims to standard DIVE attributes

**Priority 4: Configure Industry IdP (OIDC)**
- **File:** `terraform/main.tf` (add third OIDC IdP)
- **Assumption:** Azure AD or Okta for contractors
- **Requirements:**
  - Add `keycloak_oidc_identity_provider` resource
  - Discovery URL: Azure AD or Okta endpoint
  - Alias: `industry-idp`
  - **Challenge:** Industry users may lack `clearance` or `countryOfAffiliation`
  - **Solution:** Claim enrichment service (next priority)

**Priority 5: Implement Claim Enrichment Service**
- **File:** `backend/src/middleware/enrichment.middleware.ts` (NEW)
- **Reference:** Week 3 task table, enrichment rules
- **Purpose:** Fill in missing attributes for non-standard IdPs (Industry)
- **Logic:**
  - If `countryOfAffiliation` missing: Infer from email domain
    - `@*.mil` → USA
    - `@*.gouv.fr` → FRA
    - `@*.gc.ca` → CAN
    - Contractors: Default to USA, log enrichment
  - If `clearance` missing: Default to UNCLASSIFIED, log enrichment
  - If `acpCOI` missing: Default to empty array
- **Apply:** Before PEP authz middleware in resource routes
- **Logging:** Log ALL enrichments with original + enriched values

**Priority 6: Add Negative Test Suite to OPA**
- **File:** `policies/tests/negative_test_suite.rego` (NEW)
- **Reference:** Week 3 deliverable "20+ failing test cases"
- **Coverage Required:**
  - Invalid clearance levels (not in enum)
  - Invalid country codes (not ISO 3166-1 alpha-3)
  - Malformed COI arrays
  - Missing required fields (uniqueID, clearance, countryOfAffiliation)
  - Empty releasabilityTo array
  - Future embargo dates
  - Expired tokens (if applicable to policy)
  - Edge cases: null values, wrong types, boundary conditions
- **Target:** 20+ tests, all should result in `allow = false`

**Priority 7: Update IdP Selection UI**
- **File:** `frontend/src/app/page.tsx` (update existing IdP picker)
- **Requirements:**
  - Currently shows placeholder for 4 IdPs
  - Add actual IdP selection buttons:
    - 🇺🇸 United States (OIDC) - already working
    - 🇫🇷 France (SAML) - new
    - 🇨🇦 Canada (OIDC) - new
    - 🏢 Industry Partner (OIDC) - new
  - Each button redirects to Keycloak with `kc_idp_hint` parameter
  - Example: `/api/auth/signin?idpHint=france-idp`

**Priority 8: Multi-IdP Integration Testing**
- **Requirement:** 1 successful authentication per IdP
- **Test Users to Create (in Terraform or Keycloak):**
  - France: `testuser-fra` / `Password123!` - clearance: SECRET, country: FRA, COI: [NATO-COSMIC]
  - Canada: `testuser-can` / `Password123!` - clearance: CONFIDENTIAL, country: CAN, COI: [CAN-US]
  - Industry: `testuser-industry` / `Password123!` - clearance: UNCLASSIFIED (enriched), country: USA (enriched), COI: []
- **Verification:** Each user can log in, see dashboard with attributes, access appropriate resources

---

## Reference Materials

### Implementation Plan Sections

**Section 3 (Week 3 Tasks):** Lines 57-79 in `dive-v3-implementation-plan.md`
- Complete task table with inputs, outputs, acceptance criteria
- Risk mitigation strategies
- Dependency tracking

**Section 7 (Keycloak Configuration):** Keycloak multi-IdP setup patterns
- OIDC provider configuration examples
- SAML provider configuration examples
- Protocol mapper patterns

### Resource Materials to Reference

**Keycloak Multi-IdP Patterns:**
- `resources/keycloak-react-main/terraform/main.tf` - OIDC provider configuration example
- Current `terraform/main.tf` - U.S. IdP already configured, extend for FRA/CAN/Industry

**Claim Enrichment Patterns:**
- `dive-v3-security.md` - Enrichment rules and logging requirements
- `.cursorrules` - Attribute naming conventions (uniqueID, clearance, countryOfAffiliation, acpCOI)

**OPA Testing Patterns:**
- `policies/tests/comprehensive_test_suite.rego` - Existing test structure
- `resources/mpe-experiment-main/tests/` - Negative test examples

### Critical Requirements from .cursorrules

**Attribute Naming (EXACT):**
- `uniqueID` (required) - Unique user identifier
- `clearance` (required) - UNCLASSIFIED | CONFIDENTIAL | SECRET | TOP_SECRET
- `countryOfAffiliation` (required) - ISO 3166-1 alpha-3 (USA, FRA, CAN, GBR, DEU)
- `acpCOI` (optional) - Array of COI tags ["NATO-COSMIC", "FVEY", "CAN-US", "US-ONLY"]

**Security Requirements:**
- Log ALL claim enrichments for audit
- PII minimization (only uniqueID in logs)
- Default deny if enrichment fails
- Validate enriched values before use

---

## Week 3 Acceptance Criteria

Must achieve by completion:

### Functional Requirements
1. ✅ 4 IdPs operational (U.S., France, Canada, Industry)
2. ✅ SAML and OIDC both supported in Keycloak
3. ✅ Claim enrichment handles missing attributes
4. ✅ creationDate embargo enforced (already done in Week 2)
5. ✅ 20+ negative OPA test cases passing
6. ✅ Multi-IdP integration: 1 successful auth per IdP

### Test Scenarios to Verify

**France SAML:**
1. French user logs in via SAML → Dashboard shows FRA attributes
2. French user (SECRET, FRA, NATO-COSMIC) → doc-fra-defense (FRA-only) = ✅ ALLOW
3. French user (SECRET, FRA) → doc-us-only-tactical (USA-only) = ❌ DENY (country mismatch)

**Canada OIDC:**
1. Canadian user logs in via OIDC → Dashboard shows CAN attributes
2. Canadian user (CONFIDENTIAL, CAN, CAN-US) → doc-can-logistics (CAN+USA) = ✅ ALLOW
3. Canadian user → doc-fra-defense (FRA-only) = ❌ DENY (country mismatch)

**Industry OIDC (with enrichment):**
1. Industry user logs in → Enrichment infers country from email
2. Dashboard shows enriched attributes with indicator
3. Industry contractor (UNCLASSIFIED, USA enriched) → doc-industry-partner = ✅ ALLOW
4. Industry contractor → doc-fvey-intel (TOP_SECRET) = ❌ DENY (clearance)

**Negative Tests:**
1. User with invalid clearance → ❌ DENY
2. User with invalid country code → ❌ DENY
3. Resource with empty releasabilityTo → ❌ DENY for all users
4. Malformed COI array → ❌ DENY
5. (15+ more edge cases)

### CI/CD Requirements

**GitHub Actions must pass:**
- ✅ OPA syntax check (`opa check`)
- ✅ OPA unit tests (`opa test policies/ -v` - now 73+ tests: 53 existing + 20 negative)
- ✅ Backend TypeScript check (with new enrichment middleware)
- ✅ Frontend TypeScript check (with updated IdP picker)
- ✅ Integration tests (backend + MongoDB + OPA)
- ✅ Multi-IdP smoke tests (if time permits)

**Test Coverage Target:**
- Positive tests: 53 (from Week 2) ✅
- Negative tests: 20+ (Week 3) 
- **Total: 73+ OPA tests, 100% passing**

---

## Implementation Order (Critical Path)

### Day 1: Mock/Test IdP Setup
1. Research SAML test IdP options (or create mock SAML responses)
2. Obtain Canada OIDC test credentials (or mock)
3. Set up Industry IdP (Azure AD test tenant or mock)
4. Document all IdP endpoints and credentials

### Day 2-3: Keycloak Configuration
5. Add France SAML IdP to Terraform
6. Create SAML attribute mappers (clearance mapping: CONFIDENTIEL_DEFENSE → CONFIDENTIAL)
7. Add Canada OIDC IdP to Terraform
8. Add Industry OIDC IdP to Terraform
9. Create test users for each IdP (or configure in external IdPs)
10. Test: Each IdP login flow works, token contains claims

### Day 4: Claim Enrichment
11. Create enrichment middleware
12. Implement email domain → country inference
13. Implement default clearance for missing attribute
14. Add enrichment logging
15. Apply enrichment middleware before authz middleware
16. Test: Industry user gets enriched attributes

### Day 5: Negative Testing
17. Write 20+ negative OPA test cases
18. Categories: invalid inputs, missing fields, boundary conditions, malformed data
19. Run `opa test` - verify all negative tests result in deny
20. Add to CI/CD pipeline

### Day 6: UI and Integration
21. Update IdP picker page with 4 IdP options
22. Add visual indicators for enriched claims on dashboard
23. Test each IdP login flow
24. Verify dashboard shows correct attributes for each IdP

### Day 7: QA and Commit
25. Run full OPA test suite (73+ tests)
26. Manual test: 1 login per IdP
27. Manual test: Cross-IdP resource access scenarios
28. Run `./scripts/preflight-check.sh`
29. Verify GitHub Actions passes locally
30. Commit with proper CI/CD verification
31. Push to GitHub and verify all jobs pass

---

## Test-Driven Development Approach

**Write tests BEFORE implementation (same as Week 2):**

1. Write negative OPA test for invalid clearance FIRST
2. Test will PASS (deny expected, deny received)
3. Verify test catches the invalid case
4. Repeat for each negative scenario

**Example Negative Test:**
```rego
# Test FIRST
test_deny_invalid_clearance_level if {
  not authorization.allow with input as {
    "subject": {"clearance": "SUPER_SECRET"}, # Invalid level
    "resource": {"classification": "SECRET"}
  }
}

# Policy already handles this (Week 2 implementation):
is_insufficient_clearance := msg if {
  not clearance_levels[input.subject.clearance]
  msg := sprintf("Invalid clearance level: %s", [input.subject.clearance])
}
```

---

## Quality Standards

### Code Quality
- ✅ No TypeScript `any` types (use proper interfaces)
- ✅ All functions have explicit return types
- ✅ Comprehensive error handling
- ✅ Structured logging (Winston format from Week 1)
- ✅ Input validation for enrichment service

### Testing Requirements
- ✅ 73+ OPA tests (53 existing + 20 negative, 100% pass required)
- ✅ Manual testing: 1 auth per IdP (France, Canada, Industry)
- ✅ Cross-IdP scenarios: French user → FRA doc (allow), French user → USA doc (deny)
- ✅ Enrichment verification: Industry user shows enriched country
- ✅ GitHub Actions all green before claiming complete

### Performance Targets (Same as Week 2)
- ✅ OPA decision latency < 200ms (p95)
- ✅ Enrichment latency < 10ms
- ✅ Total authorization latency < 250ms

---

## Reference Sections in Documentation

### dive-v3-implementation-plan.md
- **Section 1, Week 3 Table (Lines 57-79):** Complete task breakdown
- **Section 2:** Architecture showing multi-IdP flow
- **Section 4:** Attribute mapping tables (includes French/Canadian mappings)
- **Section 7:** Keycloak configuration steps (SAML + OIDC patterns)

### dive-v3-security.md
- **Claim Enrichment Rules:** Email domain inference patterns
- **Audit Logging:** Requirements for enrichment logging
- **Security Guidelines:** Validation before enrichment

### .cursorrules
- **Attribute Specifications (Lines 124-127):** Exact attribute names
- **OPA Policy Conventions (Lines 100-134):** Testing requirements
- **Edge Cases to Handle (Lines 332-350):** Missing attributes, empty arrays, clock skew

### Week 2 Lessons Learned (Apply to Week 3)
- **SESSION-MANAGEMENT-ARCHITECTURE.md:** Database sessions handle multiple IdPs
- **TOKEN-REFRESH-FIX.md:** OAuth refresh works across all IdPs
- **LOGOUT-FIX-SUMMARY.md:** Federated logout pattern reusable
- **Defensive parsing:** COI attribute parsing pattern works for all IdPs

---

## Mock IdP Strategy (If Real IdPs Unavailable)

### Option 1: Keycloak Test Realms (Recommended)
- Create separate Keycloak realm for each "external" IdP
- Configure as identity broker to dive-v3-pilot realm
- Benefit: Full SAML/OIDC flow testing without external dependencies
- Example: `france-test-realm` → SAML broker → `dive-v3-pilot`

### Option 2: Hardcoded Test Tokens
- Create test users directly in dive-v3-pilot realm
- Use custom attributes to simulate different IdPs
- Benefit: Faster setup, no external services needed
- Limitation: Doesn't test actual SAML/OIDC flows

**Recommendation:** Use Option 1 (Keycloak test realms) for more realistic testing

---

## Expected File Structure After Week 3

```
terraform/
└── main.tf (updated)
    ├── Existing: U.S. OIDC IdP + mappers
    ├── NEW: France SAML IdP + attribute mappers
    ├── NEW: Canada OIDC IdP + protocol mappers
    ├── NEW: Industry OIDC IdP + protocol mappers
    ├── NEW: Test users for France, Canada, Industry
    └── Updated: IdP picker with 4 options

backend/src/middleware/
├── authz.middleware.ts (existing, DO NOT MODIFY)
└── enrichment.middleware.ts (NEW)

backend/src/routes/
└── resource.routes.ts (updated)
    # OLD: router.get('/:id', authzMiddleware, getResourceHandler);
    # NEW: router.get('/:id', enrichmentMiddleware, authzMiddleware, getResourceHandler);

frontend/src/app/
└── page.tsx (updated IdP picker)
    # Add buttons for France, Canada, Industry with idpHint

policies/tests/
├── comprehensive_test_suite.rego (existing, 53 tests)
└── negative_test_suite.rego (NEW, 20+ tests)

docs/
└── WEEK3-STATUS.md (NEW - implementation tracking)
```

---

## Critical Instructions

### DO NOT BREAK
- Week 2 authorization flow (currently working perfectly)
- Database session strategy (fixes cookie size issue)
- OAuth token refresh (handles expiration gracefully)
- PEP middleware (JWT + OPA integration working)
- Existing 53 OPA tests (must continue passing)

### MUST USE
- Same exact attribute names: `uniqueID`, `clearance`, `countryOfAffiliation`, `acpCOI`
- ISO 3166-1 alpha-3: FRA (not FR), CAN (not CA), USA (not US)
- Classification enum: UNCLASSIFIED | CONFIDENTIAL | SECRET | TOP_SECRET (exact casing)
- Fail-secure pattern: Enrichment failure → deny access, log error

### MUST TEST
- Run `opa test policies/ -v` after adding negative tests (should show 73+/73+ PASS)
- Test each IdP login manually (France, Canada, Industry)
- Verify enrichment logs show inferred values
- Confirm GitHub Actions passes before claiming complete
- Use `./scripts/preflight-check.sh` before AND after implementation

---

## Edge Cases to Handle (Week 3 Specific)

1. **SAML Attribute Names:** French claims use URN format, must map to standard names
2. **Clearance Level Mapping:** French levels differ (CONFIDENTIEL_DEFENSE vs CONFIDENTIAL)
3. **Missing Claims from Industry IdP:** Enrichment must fill gaps, log all inferences
4. **Email Domain Edge Cases:** What if domain not recognized? Default + log warning
5. **Multiple Concurrent IdP Sessions:** Each IdP creates separate account record (handled by DrizzleAdapter)
6. **Token Refresh Across IdPs:** Each IdP's refresh_token handled independently
7. **Logout from Multi-IdP:** Federated logout works for OIDC, SAML SLO may differ

---

## Success Criteria for Week 3 Completion

**Functional:**
- [ ] France SAML IdP working - user can log in, see FRA in country
- [ ] Canada OIDC IdP working - user can log in, see CAN in country
- [ ] Industry OIDC IdP working - user can log in, see enriched attributes
- [ ] Claim enrichment infers country from email for Industry users
- [ ] All 4 IdPs show on home page IdP picker
- [ ] 20+ negative OPA tests passing (total 73+ tests)

**Technical:**
- [ ] `opa test policies/ -v` shows 73+/73+ PASS
- [ ] Terraform applies without errors (4 IdPs configured)
- [ ] Enrichment middleware logs all inferences
- [ ] TypeScript compilation passes (frontend + backend)
- [ ] GitHub Actions all jobs green

**Documentation:**
- [ ] WEEK3-STATUS.md created with implementation details
- [ ] CHANGELOG.md updated with Week 3 changes
- [ ] README.md Week 3 checkbox marked complete
- [ ] Enrichment logic documented in code comments
- [ ] SAML/OIDC mapper configurations documented

---

## Prompt for Week 3 Chat

**Start the new chat with this:**

```
You are continuing Week 3 of the DIVE V3 Coalition ICAM Pilot implementation.

CONTEXT:
- Week 1 COMPLETE: Keycloak + U.S. IdP + Next.js + MongoDB + Backend API (committed: 4f92818)
- Week 2 COMPLETE: OPA integration, 53 tests passing, PEP middleware, decision UI, all 8 manual scenarios verified (committed: fd0897f)
- Repository: https://github.com/albeach/DIVE-V3 (branch: main)
- All services running locally and verified healthy via preflight-check.sh
- Authorization flow working end-to-end with U.S. IdP

WEEK 3 OBJECTIVE:
Implement multi-IdP federation (France SAML, Canada OIDC, Industry OIDC) with claim enrichment.

CRITICAL TASKS:
1. Configure France IdP (SAML) in Keycloak via Terraform
   - Add keycloak_saml_identity_provider resource
   - Create SAML→OIDC attribute mappers
   - Map French clearance levels (CONFIDENTIEL_DEFENSE → CONFIDENTIAL)
   - Test: French user can log in and see FRA in countryOfAffiliation

2. Configure Canada IdP (OIDC) in Keycloak via Terraform
   - Add keycloak_oidc_identity_provider resource
   - Create protocol mappers for Canadian claims
   - Test: Canadian user can log in and see CAN in countryOfAffiliation

3. Configure Industry IdP (OIDC) in Keycloak via Terraform
   - Add keycloak_oidc_identity_provider for Azure AD/Okta
   - Test: Industry user can log in (may have missing claims)

4. Implement Claim Enrichment Service
   - File: backend/src/middleware/enrichment.middleware.ts (NEW)
   - Logic: Infer countryOfAffiliation from email domain (@*.mil→USA, @*.gouv.fr→FRA, @*.gc.ca→CAN)
   - Default: clearance=UNCLASSIFIED if missing
   - Apply: BEFORE authzMiddleware in resource.routes.ts
   - Logging: Log ALL enrichments with original + enriched values

5. Create Negative Test Suite
   - File: policies/tests/negative_test_suite.rego (NEW)
   - Coverage: 20+ tests for invalid/missing/malformed inputs
   - All tests should result in allow=false
   - Run: opa test policies/ -v (should show 73+/73+ PASS)

6. Update IdP Picker UI
   - File: frontend/src/app/page.tsx
   - Add: 4 IdP buttons (🇺🇸 US, 🇫🇷 France, 🇨🇦 Canada, 🏢 Industry)
   - Redirect: /api/auth/signin?idpHint=<idp-alias>

7. Create test users for new IdPs
   - France: testuser-fra (SECRET, FRA, NATO-COSMIC)
   - Canada: testuser-can (CONFIDENTIAL, CAN, CAN-US)
   - Industry: bob.contractor@lockheed.com (no clearance/country, will be enriched)

REFERENCE MATERIALS:
- dive-v3-implementation-plan.md Section 3 (Week 3 tasks, lines 57-79)
- dive-v3-security.md (enrichment rules)
- terraform/main.tf (existing U.S. IdP pattern to extend)
- policies/tests/comprehensive_test_suite.rego (test structure to follow)
- .cursorrules (attribute naming, security requirements)

MOCK IdP STRATEGY:
If real France/Canada IdPs unavailable, use Keycloak test realms as mock IdPs:
- Create france-test-realm with SAML enabled
- Create canada-test-realm with OIDC enabled
- Broker from these realms to dive-v3-pilot realm
- Benefit: Full SAML/OIDC flow without external dependencies

ACCEPTANCE CRITERIA:
- All 4 IdPs working (U.S., France, Canada, Industry)
- Claim enrichment logs all inferences
- 73+ OPA tests passing (53 existing + 20 negative)
- Manual testing: 1 successful auth per IdP
- Cross-IdP scenarios work (French user → FRA doc allow, French user → USA doc deny)
- GitHub Actions CI/CD passes (OPA tests, TypeScript, build)
- Code follows all .cursorrules conventions

QUALITY REQUIREMENTS:
- Run full QA testing (automated + manual)
- Commit with proper CI/CD verification
- All tests must pass before claiming complete
- Use ./scripts/preflight-check.sh before and after implementation

DO NOT BREAK:
- Week 2 authorization flow (working perfectly)
- Database session strategy (handles all IdPs)
- PEP middleware (works with any IdP's tokens)
- Existing 53 OPA tests (must continue passing)

START BY:
Reading dive-v3-implementation-plan.md Section 3 (Week 3 tasks) and deciding on mock IdP strategy.
Use Keycloak test realms as mock IdPs if external IdPs unavailable.
Implement France SAML IdP first (most complex), then Canada/Industry OIDC.
Write negative tests early to catch edge cases.

TESTING CHECKLIST:
- [ ] 73+ OPA tests passing (opa test policies/ -v)
- [ ] TypeScript compilation passes (frontend + backend)
- [ ] Preflight check passes (./scripts/preflight-check.sh)
- [ ] France user can log in via SAML
- [ ] Canada user can log in via OIDC
- [ ] Industry user can log in with enrichment
- [ ] Enrichment logs show inferred values
- [ ] Cross-IdP resource access scenarios work
- [ ] GitHub Actions pipeline passes (all 4 jobs green)
- [ ] Documentation updated (WEEK3-STATUS.md, CHANGELOG.md, README.md)

SUCCESS METRIC:
Week 3 is complete when all 4 IdPs work, enrichment fills missing claims,
73+ OPA tests pass, manual testing verifies each IdP, and GitHub CI/CD is green.
```

---

## Important Notes for Week 3

### Leverage Week 2 Infrastructure
- ✅ PEP middleware already handles any IdP's tokens (just validates JWT)
- ✅ Session management already supports multiple IdPs (separate account per provider)
- ✅ OPA policy already handles any country/COI (just evaluates attributes)
- ✅ Decision UI already works for all IdPs (displays whoever is logged in)

**Week 3 only needs to:**
1. Add IdP connectors to Keycloak (Terraform)
2. Map foreign claims to standard attributes (protocol mappers)
3. Fill missing attributes (enrichment middleware)
4. Add negative tests (edge case coverage)
5. Update IdP picker UI (show all 4 options)

### Testing Strategy
- **OPA Tests:** Focus on negative cases (invalid inputs, missing attributes)
- **Manual Tests:** Focus on IdP-specific flows (SAML vs OIDC, enrichment)
- **Integration Tests:** Cross-IdP scenarios (French user accessing various resources)
- **Jest Tests:** Add for enrichment middleware (new business logic)

### Key Risks and Mitigations
1. **Real IdPs unavailable:** Use Keycloak test realms as mocks
2. **SAML complexity:** Reference keycloak-react-main SAML examples
3. **Attribute name mismatches:** Document all mappings in Terraform comments
4. **Enrichment accuracy:** Log all inferences, allow manual override
5. **Token format differences:** Defensive parsing (like COI in Week 2)

---

## File Checklist for Week 3

**Must Create:**
- [ ] `backend/src/middleware/enrichment.middleware.ts`
- [ ] `policies/tests/negative_test_suite.rego`
- [ ] `docs/WEEK3-STATUS.md`

**Must Update:**
- [ ] `terraform/main.tf` (add 3 IdPs + mappers)
- [ ] `frontend/src/app/page.tsx` (4 IdP buttons)
- [ ] `backend/src/routes/resource.routes.ts` (add enrichment middleware)
- [ ] `CHANGELOG.md` (Week 3 changes)
- [ ] `README.md` (Week 3 complete checkbox)

**Must NOT Modify (unless critical bug):**
- [ ] `policies/fuel_inventory_abac_policy.rego` (embargo already implemented)
- [ ] `policies/tests/comprehensive_test_suite.rego` (keep 53 tests intact)
- [ ] `backend/src/middleware/authz.middleware.ts` (PEP working perfectly)
- [ ] `frontend/src/auth.ts` (database sessions working)

---

## Helpful Commands for Week 3

```bash
# Pre-flight check (run FIRST, always)
./scripts/preflight-check.sh

# Terraform changes
cd terraform
terraform plan      # Review changes before applying
terraform apply     # Apply IdP configurations
terraform output    # Get client secrets

# Test OPA with new negative tests
docker-compose exec opa opa test /policies/ -v
# Should show: PASS: 73+/73+

# Test enrichment middleware
# After implementing, check logs for enrichment entries

# Verify multi-IdP in Keycloak Admin Console
open http://localhost:8081/admin
# Identity Providers → Should see: us-idp, france-idp, canada-idp, industry-idp

# Test login for each IdP
# France: http://localhost:3000?idpHint=france-idp
# Canada: http://localhost:3000?idpHint=canada-idp
# Industry: http://localhost:3000?idpHint=industry-idp

# Check GitHub Actions locally before push
cd backend && npm run typecheck
cd frontend && npm run typecheck
docker-compose exec opa opa test /policies/ -v
```

---

**CRITICAL SUCCESS FACTORS:**
1. Use `./scripts/preflight-check.sh` religiously
2. Test each IdP immediately after adding (don't wait until all are added)
3. Write negative OPA tests early (TDD approach)
4. Log all enrichments for audit trail
5. Commit incrementally (France → Canada → Industry → Enrichment → Negative tests)
6. Verify CI/CD passes locally before each push

**WEEK 3 GOAL:** 4 IdPs working + enrichment + 73+ tests passing + GitHub Actions green

