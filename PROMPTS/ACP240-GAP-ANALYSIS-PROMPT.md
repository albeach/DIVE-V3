# ACP-240 Compliance Gap Analysis - Comprehensive Assessment Prompt

**Purpose**: Conduct an extensive gap analysis between NATO ACP-240 requirements and DIVE V3's current implementation state, then remediate any gaps, update documentation, run full QA testing, and ensure CI/CD pipeline passes.

---

## 📋 TASK OVERVIEW

You are conducting a comprehensive **ACP-240 Compliance Gap Analysis** for the DIVE V3 Coalition ICAM Pilot project. Your objectives are:

1. **Analyze Compliance**: Compare current implementation against ALL ACP-240 requirements in `notes/ACP240-llms.txt`
2. **Identify Gaps**: Document what's missing, partial, or non-compliant
3. **Remediate Gaps**: Implement fixes for critical/high-priority gaps
4. **Update Documentation**: Ensure all docs reflect current state
5. **Run Full QA**: Execute complete test suite and verify 100% pass
6. **CI/CD Verification**: Ensure GitHub Actions pipeline passes locally and on push
7. **Commit & Push**: Professional commit with detailed changelog

---

## 📚 CONTEXT: CURRENT IMPLEMENTATION STATE

### Recent Work Completed (Oct 17, 2025)

**Latest Commit**: `96e608b` - KAS Decryption Fix + Content Viewer Enhancement

**Critical Fixes Implemented**:
1. ✅ **KAS Decryption** - Fixed DEK mismatch; all resources (seeded + uploaded) now decrypt
2. ✅ **ZTDF Integrity Enforcement** - Added mandatory STANAG 4778 validation before decryption
3. ✅ **Modern Content Viewer** - Intelligent rendering for images, PDFs, text, documents
4. ✅ **SOC Alerting** - Critical alerts for tampering attempts
5. ✅ **Fail-Closed Security** - Access denied on integrity violations

**Test Status**:
- Backend: 612 tests passed (28 suites)
- OPA Policies: 126 tests passed
- Total: 738 automated tests, 0 failures
- Coverage: >95% globally, 100% for critical services

**Known Gaps** (documented but not yet implemented):
- ❌ Multi-KAS support (single KAS only)
- ❌ COI-based community keys (per-resource DEKs currently)
- ⚠️ X.509 policy signature verification (TODO placeholder exists)
- ⚠️ HSM integration for key custody (pilot uses software keys)

---

## 🏗️ PROJECT STRUCTURE

```
DIVE-V3/
├── backend/                          # Express.js API (PEP)
│   ├── src/
│   │   ├── controllers/              # Resource, upload, admin endpoints
│   │   │   └── resource.controller.ts  # 🔍 CHECK: ZTDF integrity enforcement
│   │   ├── middleware/               # Auth, authz, validation, logging
│   │   │   └── authz.middleware.ts    # 🔍 CHECK: PEP implementation
│   │   ├── services/                 # Business logic
│   │   │   ├── resource.service.ts   # 🔍 CHECK: ZTDF resource management
│   │   │   └── upload.service.ts     # 🔍 CHECK: File encryption
│   │   ├── utils/
│   │   │   └── ztdf.utils.ts         # 🔍 CHECK: ZTDF creation, validation, crypto
│   │   ├── types/
│   │   │   └── ztdf.types.ts         # 🔍 CHECK: ZTDF interfaces compliance
│   │   └── __tests__/                # 612 tests (28 suites)
│   └── package.json                  # Dependencies
│
├── frontend/                         # Next.js 15 UI
│   ├── src/
│   │   ├── app/                      # App Router pages
│   │   │   ├── resources/[id]/       # Resource detail with KAS request
│   │   │   └── admin/idp/            # IdP management UI
│   │   ├── components/
│   │   │   ├── resources/
│   │   │   │   └── content-viewer.tsx  # 🆕 Modern content viewer
│   │   │   └── ztdf/
│   │   │       ├── KASRequestModal.tsx  # 🔍 CHECK: KAS flow UI
│   │   │       └── KASFlowVisualizer.tsx
│   │   └── lib/                      # Utilities
│   └── package.json                  # Dependencies (includes lucide-react)
│
├── kas/                              # Key Access Service
│   ├── src/
│   │   ├── server.ts                 # 🔍 CHECK: DEK unwrapping, policy re-evaluation
│   │   ├── types/kas.types.ts        # 🔍 CHECK: KAS interfaces
│   │   └── utils/kas-logger.ts       # Audit logging
│   └── Dockerfile                    # KAS containerization
│
├── policies/                         # OPA Rego Policies
│   ├── fuel_inventory_abac_policy.rego  # 🔍 CHECK: ABAC implementation
│   ├── admin_authorization_policy.rego  # Admin access control
│   └── tests/                        # 126 OPA tests
│       ├── comprehensive_test_suite.rego
│       ├── acp240_compliance_tests.rego  # 🔍 CHECK: ACP-240 specific tests
│       └── upload_authorization_tests.rego
│
├── terraform/                        # Keycloak IaC
│   ├── main.tf                       # 🔍 CHECK: IdP configuration
│   ├── realm.tf                      # Realm setup
│   └── client.tf                     # OIDC client config
│
├── scripts/                          # Automation
│   ├── dev-start.sh                  # Start infrastructure
│   ├── preflight-check.sh            # Health checks
│   ├── smoke-test.sh                 # E2E smoke tests
│   ├── performance-benchmark.sh      # Performance validation
│   └── qa-validation.sh              # Pre-deployment QA
│
├── docs/                             # Documentation
│   ├── IMPLEMENTATION-PLAN.md        # 🔍 UPDATE: Implementation roadmap
│   ├── PHASE0-README.md              # Phase 0 completion
│   ├── PHASE1-COMPLETE.md            # Phase 1 completion
│   ├── PHASE2-COMPLETION-SUMMARY.md  # Phase 2 completion
│   ├── PHASE3-COMPLETION-SUMMARY.md  # Phase 3 completion
│   ├── PHASE4-IMPLEMENTATION-PROMPT.md  # Phase 4 guidance
│   └── CI-CD-GUIDE.md                # CI/CD documentation
│
├── notes/
│   └── ACP240-llms.txt               # 🔍 AUTHORITATIVE: ACP-240 requirements
│
├── .github/workflows/
│   └── ci.yml                        # 🔍 CHECK: CI/CD pipeline (10 jobs)
│
├── docker-compose.yml                # Infrastructure services
├── CHANGELOG.md                      # 🔍 UPDATE: Project history
└── README.md                         # 🔍 UPDATE: Project overview

**Total Size**: ~90 TypeScript files (backend), ~76 files (frontend), ~500 test specs
```

---

## 🔍 ACP-240 REQUIREMENTS CHECKLIST

### Reference Document: `notes/ACP240-llms.txt`

Use this file as the **AUTHORITATIVE SOURCE** for all ACP-240 requirements. Key sections:

#### Section 1: Key Concepts & Terminology
- Data-Centric Security (DCS)
- Zero Trust Architecture (ZTA)
- Federated Identity
- Attribute-Based Access Control (ABAC)
- Zero Trust Data Format (ZTDF)

**Gap Analysis Focus**:
- ✅ Are all concepts implemented?
- ❌ Any missing elements?

#### Section 2: Identity Specifications & Federated Identity
**Requirements**:
- Unique Identifier (globally unique, RFC 4122)
- Country of Affiliation (ISO 3166 alpha-3)
- Clearance Level (aligned with STANAG 4774)
- Organization/Unit & Role
- Authentication Context (NIST SP 800-63B AAL, SP 800-63C FAL)
- Signed/encrypted assertions (SAML 2.0 / OIDC)
- Trust framework with assurance levels

**Check**:
- `terraform/realm.tf` - IdP protocol mappers
- `backend/src/middleware/auth.middleware.ts` - JWT validation
- `frontend/src/app/api/auth/[...nextauth]/route.ts` - NextAuth config

#### Section 3: Access Control (ABAC) & Enforcement
**Requirements**:
- Policy engines: XACML or OPA/Rego
- PEPs everywhere (all access points)
- PDPs evaluate subject + resource + environment attributes
- Fail-closed enforcement
- Policy propagation (centralized bundles)
- Two-person review rule
- Attribute freshness (short cache TTL)

**Check**:
- `policies/fuel_inventory_abac_policy.rego` - Main policy
- `backend/src/middleware/authz.middleware.ts` - PEP implementation
- `backend/src/services/authz-cache.service.ts` - Cache TTL configuration
- Policy versioning and distribution mechanism

#### Section 4: Data Markings & Interoperability
**Requirements**:
- Mandatory labeling (classification, releasability, caveats)
- STANAG 4774 labels
- STANAG 4778 cryptographic binding
- Classification equivalency mapping
- Resource attributes (data type, origin, created-at, owner)

**Check**:
- `backend/src/types/ztdf.types.ts` - STANAG 4774 label interface
- `backend/src/utils/ztdf.utils.ts` - Display marking generation
- Classification mapping for coalition partners

#### Section 5: ZTDF & Cryptography ⚠️ CRITICAL
**Requirements**:
- ZTDF structure: Policy section + Payload section + Encryption info
- Policy section: Security metadata + policy assertions (STANAG 4774/5636 derived)
- Payload section: Encrypted data (DEK-based), multiple chunks supported
- Cryptographic binding: Policy metadata hashed/signed
- Hybrid encryption: Symmetric content + asymmetric key wrapping
- Key Access Service (KAS): Holds private keys, mediates access
- **Multi-KAS mode**: Multiple KASs per resource (e.g., one per nation/COI)
- **Community keys**: COI-based keys instead of per-resource DEKs
- Strong hashes: SHA-384 or better
- Digital signatures: X.509 PKI or HMAC
- **MANDATORY**: Verify signatures BEFORE decryption
- **MANDATORY**: Alert SOC if integrity fails

**Check**:
- `backend/src/utils/ztdf.utils.ts` - Encryption, validation, integrity
- `backend/src/controllers/resource.controller.ts` - Integrity enforcement (RECENTLY ADDED)
- `kas/src/server.ts` - KAS implementation
- Multi-KAS support: ❌ NOT IMPLEMENTED
- COI-based keys: ❌ NOT IMPLEMENTED
- X.509 signature verification: ⚠️ TODO placeholder

#### Section 6: Logging & Auditing
**Requirements**:
- Mandatory event categories: Encrypt, Decrypt, Access Denied, Access Modified, Data Shared
- Event details: Who, What, Action, Outcome, When, Attributes/policy used
- KAS actions: Unwrap/rewrap requests and results
- SIEM integration for correlation and anomaly detection

**Check**:
- `backend/src/utils/acp240-logger.ts` - ACP-240 audit logging
- `kas/src/utils/kas-logger.ts` - KAS audit events
- Event categories coverage
- SIEM integration readiness

#### Section 7: Standards & Protocols
- SAML 2.0 / OIDC
- ISO 3166 (country codes)
- RFC 4122 (UUIDs)
- NIST SP 800-63B/C (AAL/FAL)
- STANAG 4774/4778 (labels + binding)
- STANAG 5636 (identity metadata)
- OPA/Rego or XACML
- NIST SP 800-207 (ZTA reference)

**Check**: Verify each standard is properly implemented

#### Section 8: Best Practices & Common Pitfalls
- Fail-closed enforcement
- Strong AuthN (MFA, auth context)
- Consistent attribute schema
- Policy lifecycle as code
- Monitor & audit
- Avoid: Stale access, network-only security, proprietary extensions, weak key protection

**Check**: Best practices adherence

#### Section 9: Implementation Checklist
**Identity & Federation**:
- [ ] IdP supports signed+encrypted SAML/OIDC
- [ ] Attributes aligned (UUID, ISO 3166, clearance, COI, auth context)
- [ ] Trust framework aligned to NIST AAL/FAL

**Policy & Enforcement**:
- [ ] ABAC engine (OPA/Rego)
- [ ] PEP in every service/API
- [ ] Fail-closed validated
- [ ] Policy bundles centralized
- [ ] Two-person review + V&V

**Data Labeling & ZTDF**:
- [ ] STANAG 4774 labels applied
- [ ] STANAG 4778 binding enforced
- [ ] Classification equivalence

**Keys & KAS**:
- [ ] DEK hybrid scheme
- [ ] KAOs per recipient/policy
- [ ] KAS mediates with ABAC
- [ ] HSM-backed custody

**Audit & Monitoring**:
- [ ] Mandatory events emitted
- [ ] Rich context in logs
- [ ] SIEM correlation

---

## 📖 REFERENCE DOCUMENTATION

### Primary References (In Repository)

1. **ACP-240 Requirements**: `notes/ACP240-llms.txt`
   - Authoritative source for all compliance requirements
   - 10 sections covering identity, ABAC, ZTDF, cryptography, audit

2. **Implementation Plans**:
   - `docs/IMPLEMENTATION-PLAN.md` - Original 4-week roadmap
   - `docs/PHASE0-README.md` - Foundation phase
   - `docs/PHASE1-COMPLETE.md` - Authentication phase
   - `docs/PHASE2-COMPLETION-SUMMARY.md` - Authorization phase
   - `docs/PHASE3-COMPLETION-SUMMARY.md` - Multi-IdP & ZTDF phase
   - `docs/PHASE4-IMPLEMENTATION-PROMPT.md` - CI/CD & QA phase

3. **Recent Enhancements**:
   - `ZTDF-COMPLIANCE-AUDIT.md` - Compliance matrix (Oct 17, 2025)
   - `KAS-CONTENT-VIEWER-ENHANCEMENT.md` - Content viewer details
   - `ZTDF-FIXES-COMPLETE.md` - Recent fixes documentation

4. **Technical Specs**:
   - `backend/src/types/ztdf.types.ts` - ZTDF TypeScript interfaces
   - `policies/fuel_inventory_abac_policy.rego` - Main ABAC policy
   - `kas/src/types/kas.types.ts` - KAS interfaces

### External Standards Referenced

1. **NATO Standards**:
   - STANAG 4774 - Security labels (classification, releasability, caveats)
   - STANAG 4778 - Cryptographic binding of metadata
   - STANAG 5636 - Identity metadata exchange
   - NATO ACP-240 (A) - Data-Centric Security architecture

2. **NIST Standards**:
   - SP 800-63B - Digital Identity Guidelines (Authentication)
   - SP 800-63C - Digital Identity Guidelines (Federation)
   - SP 800-207 - Zero Trust Architecture

3. **RFCs & Other**:
   - RFC 4122 - UUIDs for globally unique identifiers
   - ISO 3166 - Country codes (alpha-3: USA, GBR, FRA, etc.)
   - SAML 2.0 - Federation protocol
   - OIDC/OAuth2 - Modern federation protocol

---

## 🎯 GAP ANALYSIS METHODOLOGY

### Step 1: Requirements Extraction
Read `notes/ACP240-llms.txt` section by section and extract ALL requirements:
- MUST requirements (mandatory)
- SHOULD requirements (recommended)
- MAY requirements (optional)

### Step 2: Implementation Mapping
For each requirement, locate the implementing code:
- Search codebase for relevant functionality
- Check test coverage for the requirement
- Verify documentation exists

### Step 3: Gap Classification
Classify each requirement as:
- ✅ **COMPLIANT**: Fully implemented and tested
- ⚠️ **PARTIAL**: Implemented but incomplete or untested
- ❌ **GAP**: Not implemented
- 🔮 **OUT OF SCOPE**: Production-only (e.g., HSM, X.509 PKI)

### Step 4: Priority Assignment
For each gap, assign priority:
- 🔴 **CRITICAL**: Security violation, ACP-240 non-compliance
- 🟠 **HIGH**: Important for compliance, impacts usability
- 🟡 **MEDIUM**: Nice-to-have, improves compliance posture
- 🟢 **LOW**: Optional, future enhancement

### Step 5: Gap Remediation
For CRITICAL and HIGH priority gaps:
1. Implement the missing functionality
2. Add test coverage
3. Update documentation
4. Verify compliance

### Step 6: Documentation Update
Update these files to reflect current state:
- `docs/IMPLEMENTATION-PLAN.md` - Mark completed items
- `CHANGELOG.md` - Add gap remediation entry
- `README.md` - Update compliance section
- Create `ACP240-GAP-ANALYSIS-REPORT.md` with findings

### Step 7: Full QA Testing
Run complete test suite:
```bash
# Backend tests
cd backend && npm test

# OPA policy tests
./bin/opa test policies/ -v

# Integration tests
./verify-kas-decryption.sh

# Linting
cd backend && npm run lint
cd frontend && npm run lint

# TypeScript compilation
cd backend && npm run build
cd frontend && npm run build
```

### Step 8: CI/CD Verification
```bash
# Run CI pipeline locally (using act or manual)
# Check .github/workflows/ci.yml for jobs

# Ensure all jobs pass:
# 1. Backend build & type check
# 2. Backend unit tests
# 3. Backend integration tests
# 4. OPA policy tests
# 5. Frontend build & type check
# 6. Security audit
# 7. Performance tests
# 8. Code quality (linting)
# 9. Docker builds
# 10. Coverage report
```

### Step 9: Commit & Push
```bash
git add -A
git commit -m "feat(acp240): comprehensive gap analysis and remediation

- Conducted full ACP-240 compliance assessment
- Implemented [LIST FIXES]
- Added test coverage for [LIST AREAS]
- Updated documentation (README, CHANGELOG, IMPLEMENTATION-PLAN)
- All tests pass (XXX/XXX)
- CI/CD pipeline verified

COMPLIANCE STATUS:
- Section 1 (Concepts): ✅ COMPLIANT
- Section 2 (Identity): ✅ COMPLIANT
- [etc.]

GAPS REMEDIATED:
- [LIST CRITICAL/HIGH GAPS FIXED]

REMAINING GAPS (LOW PRIORITY):
- [LIST FUTURE ENHANCEMENTS]"

git push origin main
```

---

## 📋 DETAILED ANALYSIS AREAS

### Area 1: Identity & Federation (ACP-240 Section 2)

**Requirements to Verify**:

1. **Unique Identifier (2.1)**
   - Check: Globally unique per RFC 4122?
   - Location: JWT `sub` claim, `uniqueID` field
   - Test: Verify UUID format validation

2. **Country of Affiliation (2.1)**
   - Check: ISO 3166 alpha-3 codes (USA not US)?
   - Location: `countryOfAffiliation` claim
   - Test: Verify country code validation rejects invalid codes

3. **Clearance Level (2.1)**
   - Check: Maps to STANAG 4774 labels?
   - Location: `clearance` claim
   - Test: Verify clearance hierarchy enforcement

4. **Authentication Context (2.1)**
   - Check: Maps to NIST AAL/FAL?
   - Location: JWT `acr` claim or auth context
   - Test: Verify auth context propagates to authorization decisions

5. **IdP Protocols (2.2)**
   - Check: SAML 2.0 and/or OIDC support?
   - Location: Keycloak IdP configurations
   - Test: Verify each IdP (US, France, Canada, Industry)

6. **Assertion Security (2.2)**
   - Check: Signed/encrypted? Back-channel preferred?
   - Location: Keycloak protocol settings
   - Test: Verify signature validation in NextAuth

7. **Trust Framework (2.2)**
   - Check: Common assurance for identity proofing?
   - Location: IdP approval workflow
   - Test: Verify IdP submission review process

8. **Directory Integration (2.2)**
   - Check: Attributes sourced from AD/LDAP?
   - Location: Keycloak user federation
   - Status: ⚠️ May be out of scope for pilot

**Expected Gaps**:
- Authentication context (AAL/FAL) may not be fully mapped
- Directory integration may be simulated for pilot
- Trust framework may be simplified

---

### Area 2: Access Control (ABAC) & Enforcement (ACP-240 Section 3)

**Requirements to Verify**:

1. **ABAC as Default (3.1)**
   - Check: Every request evaluated against policies?
   - Location: `backend/src/middleware/authz.middleware.ts`
   - Test: Verify PEP calls OPA on every resource access

2. **Policy Decision Point (3.2)**
   - Check: OPA/Rego implemented?
   - Location: `policies/fuel_inventory_abac_policy.rego`
   - Test: 126 OPA tests - verify coverage of all scenarios

3. **Policy Enforcement Point (3.2)**
   - Check: PEP in every service/API?
   - Location: Backend middleware chain
   - Test: Verify no endpoints bypass authz

4. **Fail-Closed (3.2)**
   - Check: Deny if PDP down or attributes missing?
   - Location: Circuit breaker pattern in authz middleware
   - Test: `backend/src/__tests__/authz.middleware.test.ts`

5. **Policy Propagation (3.2)**
   - Check: Centrally authored, versioned, distributed?
   - Location: Policies in Git, mounted to OPA container
   - Status: ✅ Likely compliant (Git is version control)

6. **Two-Person Review (3.3)**
   - Check: Policy changes require review?
   - Location: GitHub PR review requirements
   - Status: ⚠️ May need enforcement via branch protection

7. **Attribute Freshness (3.3)**
   - Check: Short cache TTL? Quick revocation?
   - Location: `backend/src/services/authz-cache.service.ts`
   - Test: Verify TTL values (15s for TOP_SECRET, 30s for SECRET, etc.)

**Expected Gaps**:
- Two-person review may not be enforced via GitHub settings
- Attribute freshness TTL may need tuning
- Policy propagation mechanism may be manual

---

### Area 3: ZTDF & Cryptography (ACP-240 Section 5) ⚠️ HIGH RISK

**Requirements to Verify**:

1. **ZTDF Structure (5.1)**
   - Check: Policy + Payload + Encryption info?
   - Location: `backend/src/types/ztdf.types.ts` - `IZTDFObject` interface
   - Test: Verify all ZTDF objects have required sections

2. **Policy Section (5.1)**
   - Check: Security metadata + policy assertions?
   - Location: `IZTDFPolicy` interface with `securityLabel` and `policyAssertions`
   - Test: Verify policy section completeness

3. **Payload Section (5.1)**
   - Check: Encrypted data, multiple chunks supported?
   - Location: `IZTDFPayload` with `encryptedChunks` array
   - Test: Verify chunk handling

4. **Hybrid Encryption (5.2)**
   - Check: Symmetric content + asymmetric key wrapping?
   - Location: `backend/src/utils/ztdf.utils.ts` - `encryptContent()`
   - Status: ⚠️ Pilot mode (symmetric only, wrapping simulated)

5. **Key Access Service (5.2)**
   - Check: Holds private keys, mediates access, re-evaluates policy?
   - Location: `kas/src/server.ts`
   - Test: `backend/src/__tests__/kas-decryption-integration.test.ts`
   - Status: ✅ RECENT FIX (now uses wrappedKey correctly)

6. **Multi-KAS Mode (5.3)** ⚠️ CRITICAL GAP
   - Requirement: "Multiple KAS / Attribute-Specified Keys. A data object can be encrypted in a way that multiple KASs (e.g. one per nation or per community) each hold a portion of the key"
   - Check: Do resources support multiple KAOs?
   - Location: `IZTDFPayload.keyAccessObjects` is an array
   - Current: ✅ Array exists, ❌ Only one KAO per resource
   - **GAP**: Need logic to:
     - Create multiple KAOs per resource
     - Each KAO points to different KAS (by nation/COI)
     - Client selects appropriate KAO based on user's attributes
     - KAS selection algorithm

7. **Community Keys vs National Keys (5.3)** ⚠️ CRITICAL GAP
   - Requirement: "COI keys (e.g. one keypair per coalition or mission group) rather than per-nation encryption"
   - Current: Each resource gets unique random DEK
   - **GAP**: Should use COI-based shared keys
   - Benefits: New coalition members get instant access without re-encryption
   - Implementation needed:
     - COI key registry
     - Key selection based on resource COI
     - Key rotation mechanism

8. **Cryptographic Binding (5.4)**
   - Check: Strong hashes (SHA-384+)?
   - Location: `backend/src/utils/ztdf.utils.ts` - `computeSHA384()`
   - Status: ✅ Implemented

9. **Digital Signatures (5.4)**
   - Check: X.509 PKI for policy signatures?
   - Location: `validateZTDFIntegrity()` function
   - Status: ⚠️ TODO placeholder (line 159-163 in ztdf.utils.ts)
   - **GAP**: Need X.509 signature verification

10. **Integrity Verification BEFORE Decryption (5.4)** ✅ RECENTLY FIXED
    - Requirement: "When a ZTDF object is opened, the system must verify these signatures; if the policy metadata was altered or is invalid, the object must not be decrypted"
    - Check: Is validation enforced?
    - Location: `backend/src/controllers/resource.controller.ts:553-606`
    - Status: ✅ IMPLEMENTED (Oct 17, 2025)
    - Test: Should verify tampering detection

11. **SOC Alerting on Integrity Failure (5.4)** ✅ RECENTLY ADDED
    - Requirement: "Any such integrity failure should also trigger alerts to security operations centers"
    - Check: Are alerts logged?
    - Location: `backend/src/controllers/resource.controller.ts:573-582`
    - Status: ✅ IMPLEMENTED (CRITICAL alert level)

**Expected Critical Gaps**:
- ❌ Multi-KAS support not implemented
- ❌ COI-based community keys not implemented
- ⚠️ X.509 signature verification is TODO
- ⚠️ HSM integration is pilot-mode only

---

### Area 4: Logging & Auditing (ACP-240 Section 6)

**Requirements to Verify**:

1. **Mandatory Event Categories (6.1)**
   - Encrypt: When data is sealed
   - Decrypt: When data is accessed
   - Access Denied: Policy denies access
   - Access Modified: Object changed
   - Data Shared: Release outside COI

   **Check**:
   - `backend/src/utils/acp240-logger.ts` - Event types
   - `kas/src/utils/kas-logger.ts` - KAS events
   - Verify all 5 categories are logged

2. **Event Details (6.2)**
   - Who (user/service ID)
   - What (object/resource ID)
   - Action & Outcome
   - When (timestamp)
   - Attributes/policy used

   **Check**: Log format includes all required fields

3. **KAS Actions (6.2)**
   - Unwrap/rewrap requests
   - Policy evaluation results
   - Key release/denial

   **Check**: `kas/src/server.ts` - Audit events

4. **SIEM Integration (6.3)**
   - Check: Logs in structured format (JSON)?
   - Check: Ready for correlation?
   - Status: Likely ⚠️ PARTIAL (JSON logs exist, SIEM connection may not)

---

## 🔍 SPECIFIC AREAS TO INVESTIGATE

### High-Priority Investigations:

1. **Multi-KAS Implementation Gap**
   ```typescript
   // Current (single KAS):
   keyAccessObjects: [
       { kaoId: 'kao-001', kasUrl: 'http://localhost:8080', wrappedKey: '...' }
   ]
   
   // Required (multi-KAS):
   keyAccessObjects: [
       { kaoId: 'kao-usa', kasUrl: 'https://usa.kas.mil', coiRequired: ['US-ONLY'], wrappedKey: '...' },
       { kaoId: 'kao-fvey', kasUrl: 'https://fvey.kas.nato', coiRequired: ['FVEY'], wrappedKey: '...' },
       { kaoId: 'kao-nato', kasUrl: 'https://nato.kas.nato', coiRequired: ['NATO-COSMIC'], wrappedKey: '...' }
   ]
   ```
   
   **Investigate**:
   - Does `IKeyAccessObject` interface support this?
   - Is there KAO selection logic based on user COI?
   - Can system handle multiple KAS endpoints?

2. **COI-Based Community Keys**
   ```typescript
   // Current (per-resource random DEK):
   const dek = crypto.randomBytes(32);
   
   // Required (COI-based shared key):
   const dekRegistry: Record<string, string> = {
       'FVEY': loadFromVault('fvey-community-dek'),
       'NATO-COSMIC': loadFromVault('nato-cosmic-dek'),
       'US-ONLY': loadFromVault('us-national-dek')
   };
   const dek = dekRegistry[resource.COI[0]];
   ```
   
   **Investigate**:
   - Where is encryption happening? (`backend/src/utils/ztdf.utils.ts:encryptContent`)
   - Can we retrofit COI-based keys?
   - How to handle key rotation?

3. **X.509 Policy Signature Verification**
   ```typescript
   // Current (TODO):
   if (ztdf.policy.policySignature) {
       // TODO: Implement X.509 signature verification
       warnings.push('Policy signature present but verification not yet implemented');
   }
   ```
   
   **Investigate**:
   - Is X.509 PKI infrastructure available?
   - If not, can we use HMAC (symmetric alternative)?
   - What's the signing authority?

4. **Attribute Freshness & Revocation**
   ```typescript
   // Check TTL values:
   const cacheTTL = {
       'TOP_SECRET': 15,    // 15 seconds
       'SECRET': 30,        // 30 seconds
       'CONFIDENTIAL': 60,  // 60 seconds
       'UNCLASSIFIED': 300  // 5 minutes
   };
   ```
   
   **Investigate**:
   - Are these values compliant with ACP-240?
   - Is revocation propagation immediate?
   - Check `backend/src/services/authz-cache.service.ts`

5. **Fail-Closed Posture**
   **Investigate**:
   - What happens if OPA is down?
   - What happens if MongoDB is down?
   - What happens if Keycloak is down?
   - What happens if required attributes are missing?
   - Check: `backend/src/middleware/authz.middleware.ts` circuit breaker

---

## 📊 EXPECTED GAP ANALYSIS REPORT FORMAT

Create a comprehensive report: `ACP240-GAP-ANALYSIS-REPORT.md`

### Template:

```markdown
# ACP-240 Compliance Gap Analysis Report

**Date**: [Current Date]
**Analyst**: [AI Agent]
**Commit**: [Latest Commit Hash]

---

## Executive Summary

- Total Requirements Analyzed: XXX
- Compliant: XXX (XX%)
- Partial: XXX (XX%)
- Gaps: XXX (XX%)
- Out of Scope: XXX (XX%)

**Compliance Level**: [GOLD / SILVER / BRONZE / NON-COMPLIANT]

**Critical Gaps**: XXX (must fix for compliance)
**High Priority Gaps**: XXX (should fix soon)

---

## Detailed Findings by Section

### Section 1: Key Concepts & Terminology
| Requirement | Status | Evidence | Notes |
|-------------|--------|----------|-------|
| DCS Implementation | ✅ COMPLIANT | ZTDF format in use | Metadata embedded in resources |
| ZTA Principles | ✅ COMPLIANT | Continuous verification | PEP/PDP pattern enforced |
| [etc.] | | | |

### Section 2: Identity Specifications
[Same format]

### Section 3: Access Control
[Same format]

### Section 4: Data Markings
[Same format]

### Section 5: ZTDF & Cryptography ⚠️
| Requirement | Status | Evidence | Priority |
|-------------|--------|----------|----------|
| ZTDF Structure | ✅ COMPLIANT | `ztdf.types.ts` | - |
| Integrity Validation | ✅ COMPLIANT | `resource.controller.ts:553` | ✅ FIXED |
| Multi-KAS Support | ❌ GAP | Only single KAS | 🟠 HIGH |
| COI Community Keys | ❌ GAP | Per-resource DEKs | 🟠 HIGH |
| X.509 Signatures | ⚠️ PARTIAL | TODO placeholder | 🟡 MEDIUM |

### Section 6: Logging & Auditing
[Same format]

---

## Gap Remediation Plan

### Critical Gaps (Must Fix)
1. [Gap Name]
   - Requirement: [Quote from ACP-240]
   - Current State: [What exists]
   - Gap: [What's missing]
   - Implementation: [How to fix]
   - Estimated Effort: [Hours]
   - Priority: 🔴 CRITICAL

### High Priority Gaps (Should Fix)
[Same format]

### Medium/Low Priority (Future)
[Same format]

---

## Recommendations

### For Pilot Acceptance:
1. [Required changes]
2. [Required changes]

### For Production Deployment:
1. [Future enhancements]
2. [Future enhancements]

---

## Compliance Certification

[ ] All CRITICAL gaps remediated
[ ] All HIGH priority gaps remediated or documented
[ ] Full test suite passes (100%)
[ ] Documentation updated
[ ] CI/CD pipeline passes
[ ] Ready for compliance review

---

**End of Report**
```

---

## 🎯 SUCCESS CRITERIA

Your gap analysis is successful if:

1. ✅ **All ACP-240 requirements catalogued** from `notes/ACP240-llms.txt`
2. ✅ **Every requirement mapped** to implementation (or documented as gap)
3. ✅ **Critical gaps remediated** (if any)
4. ✅ **High priority gaps** either fixed or accepted with documented risk
5. ✅ **Full test suite passes** (612 backend + 126 OPA = 738 tests)
6. ✅ **CI/CD pipeline verified** locally
7. ✅ **Documentation updated** (README, CHANGELOG, IMPLEMENTATION-PLAN)
8. ✅ **Professional commit** with detailed changelog
9. ✅ **Pushed to GitHub** successfully
10. ✅ **Gap analysis report created** for stakeholders

---

## 🚨 KNOWN ISSUES TO ADDRESS

### From Recent Session (Oct 17, 2025):

1. **Frontend Linting Skipped**
   - Issue: Next.js 15 migration prompt appeared
   - Action: Either complete migration or suppress prompt
   - File: `frontend/package.json` or `next.config.ts`

2. **Multi-KAS Support** ❌ NOT IMPLEMENTED
   - Documented in: `ZTDF-COMPLIANCE-AUDIT.md`
   - Priority: 🟠 HIGH
   - Implement if time allows

3. **COI-Based Keys** ❌ NOT IMPLEMENTED
   - Documented in: `ZTDF-COMPLIANCE-AUDIT.md`
   - Priority: 🟠 HIGH
   - Implement if time allows

4. **X.509 Signature Verification** ⚠️ TODO
   - Location: `backend/src/utils/ztdf.utils.ts:159-163`
   - Priority: 🟡 MEDIUM
   - May defer to production

---

## 📝 DELIVERABLES

At end of gap analysis session, you must deliver:

### 1. Gap Analysis Report
**File**: `ACP240-GAP-ANALYSIS-REPORT.md`
- Executive summary
- Detailed findings by section
- Gap remediation plan
- Compliance certification

### 2. Updated Documentation
**Files**:
- `docs/IMPLEMENTATION-PLAN.md` - Mark gaps remediated
- `CHANGELOG.md` - Add gap analysis entry
- `README.md` - Update compliance section

### 3. Remediation Code (if gaps found)
**Areas**:
- Implement missing CRITICAL features
- Add test coverage
- Update interfaces/types as needed

### 4. Test Results
**Evidence**:
- Backend tests: XXX/XXX passed
- OPA tests: XXX/XXX passed
- Linting: 0 errors
- TypeScript: Compiled successfully
- CI/CD: All jobs passed

### 5. Git Commit
**Format**:
```
feat(acp240): comprehensive gap analysis and remediation

- Analyzed all ACP-240 requirements from notes/ACP240-llms.txt
- Identified X critical gaps, Y high-priority gaps
- Implemented fixes for [LIST]
- Updated documentation and tests
- All tests pass (XXX/XXX)

COMPLIANCE STATUS:
[Table showing section-by-section compliance]

FILES CHANGED:
[List modified files]
```

---

## 🎯 EXECUTION STEPS

### Step-by-Step Instructions:

1. **Read ACP-240 Requirements** (15-20 minutes)
   - Open and read `notes/ACP240-llms.txt` completely
   - Take notes on each section's requirements
   - Flag items that need verification

2. **Map to Current Implementation** (30-45 minutes)
   - For each requirement, search codebase for implementation
   - Use `codebase_search`, `grep`, and `read_file` tools
   - Document findings in structured format

3. **Classify Gaps** (15 minutes)
   - Create compliance matrix
   - Assign priority levels
   - Estimate remediation effort

4. **Remediate Critical Gaps** (1-3 hours, varies)
   - Implement missing CRITICAL features
   - Add test coverage
   - Update documentation

5. **Run Full QA Suite** (10-15 minutes)
   - Backend tests: `cd backend && npm test`
   - OPA tests: `./bin/opa test policies/ -v`
   - Linting: `npm run lint` (backend + frontend)
   - TypeScript: `npm run build`
   - Integration: `./verify-kas-decryption.sh`

6. **Update Documentation** (20-30 minutes)
   - `ACP240-GAP-ANALYSIS-REPORT.md` - Create comprehensive report
   - `docs/IMPLEMENTATION-PLAN.md` - Update status
   - `CHANGELOG.md` - Add entry
   - `README.md` - Update compliance section

7. **Verify CI/CD** (5-10 minutes)
   - Review `.github/workflows/ci.yml`
   - Ensure all jobs would pass
   - Check for any missing test coverage

8. **Commit & Push** (5 minutes)
   - Stage all changes
   - Write detailed commit message
   - Push to GitHub
   - Monitor CI pipeline

---

## ⚠️ CRITICAL CONSTRAINTS

### DO NOT:
- ❌ Skip any ACP-240 sections (analyze ALL 10 sections)
- ❌ Assume compliance without verification (check code)
- ❌ Implement gaps without test coverage
- ❌ Commit without running full test suite
- ❌ Push if any tests fail

### DO:
- ✅ Be thorough and methodical
- ✅ Provide evidence for compliance claims
- ✅ Document gaps with code citations
- ✅ Prioritize security-critical gaps
- ✅ Test everything you implement
- ✅ Keep stakeholders informed (via docs)

---

## 🎯 EXAMPLE WORKFLOW

### Example: Analyzing Section 5.3 (Multi-KAS)

**Step 1: Read Requirement**
```
From ACP240-llms.txt lines 109-111:
"Multi‑KAS: Multiple KASs (per nation/COI) can provide access without re‑encrypting 
historical data. Prefer COI keys over per‑nation keys to support coalition growth 
without mass reprocessing."
```

**Step 2: Search Implementation**
```typescript
// Search: "How many KAOs does each resource have?"
// Result: backend/src/services/upload.service.ts:250-263

const kao = {
    kaoId: `kao-${uploadId}`,
    kasUrl: process.env.KAS_URL || 'http://localhost:8080',
    kasId: 'dive-v3-kas',
    wrappedKey: encryptionResult.dek,
    // ...
};

// Only ONE KAO created
keyAccessObjects: [kao]  // ❌ Single KAS only
```

**Step 3: Classify Gap**
- Status: ❌ GAP
- Priority: 🟠 HIGH (impacts coalition scalability)
- Impact: New members require re-encryption of all historical data

**Step 4: Document Finding**
```markdown
### Multi-KAS Support (ACP-240 Section 5.3)

**Requirement**: "Multiple KASs (per nation/COI) can provide access without re-encrypting historical data"

**Current Implementation**:
- Location: `backend/src/services/upload.service.ts:250-263`
- Status: ❌ GAP
- Evidence: Only one KAO created per resource

**Impact**:
- Cannot add coalition partners without re-encrypting all data
- Single KAS is single point of failure
- No nation-specific or COI-specific key distribution

**Remediation**:
1. Modify `convertToZTDF()` to create multiple KAOs
2. Add KAO selection logic based on user's COI
3. Support multiple KAS endpoints
4. Test with multi-nation scenarios

**Estimated Effort**: 2-3 hours
**Priority**: 🟠 HIGH
```

**Step 5: Implement Fix** (if priority warrants)
```typescript
// backend/src/services/upload.service.ts

// Create multiple KAOs based on resource's releasability/COI
const kaos = [];

// USA KAS (if USA in releasability)
if (metadata.releasabilityTo.includes('USA')) {
    kaos.push({
        kaoId: `kao-usa-${uploadId}`,
        kasUrl: 'https://usa.kas.mil:8080',
        kasId: 'usa-kas',
        wrappedKey: wrapKeyForKAS(dek, 'usa-kas-public-key'),
        policyBinding: {
            countriesAllowed: ['USA'],
            coiRequired: []
        }
    });
}

// FVEY KAS (if FVEY in COI)
if (metadata.COI.includes('FVEY')) {
    kaos.push({
        kaoId: `kao-fvey-${uploadId}`,
        kasUrl: 'https://fvey.kas.nato:8080',
        kasId: 'fvey-community-kas',
        wrappedKey: wrapKeyForKAS(dek, 'fvey-kas-public-key'),
        policyBinding: {
            countriesAllowed: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
            coiRequired: ['FVEY']
        }
    });
}

// Assign all KAOs
keyAccessObjects: kaos
```

**Step 6: Test**
```typescript
// Add test in backend/src/__tests__/ztdf.utils.test.ts

it('should create multiple KAOs for multi-nation resources', () => {
    const metadata = {
        classification: 'SECRET',
        releasabilityTo: ['USA', 'GBR', 'FRA'],
        COI: ['NATO-COSMIC']
    };
    
    const ztdf = createZTDF(content, metadata);
    
    expect(ztdf.payload.keyAccessObjects.length).toBeGreaterThan(1);
    expect(ztdf.payload.keyAccessObjects).toContainEqual(
        expect.objectContaining({ kasId: 'usa-kas' })
    );
});
```

**Step 7: Document**
- Update `CHANGELOG.md`
- Update `ACP240-GAP-ANALYSIS-REPORT.md`
- Mark as remediated

---

## 🔍 KEY QUESTIONS TO ANSWER

### For Each ACP-240 Section:

1. **What does ACP-240 require?** (Quote the requirement)
2. **Where is it implemented?** (File path and line numbers)
3. **How is it tested?** (Test file and test case name)
4. **Is it compliant?** (✅ Full / ⚠️ Partial / ❌ Gap)
5. **If gap, what's the priority?** (🔴🟠🟡🟢)
6. **If gap, how to fix?** (Implementation plan)

### Compliance Matrix Example:

| ACP-240 Req | Location | Tests | Status | Priority |
|-------------|----------|-------|--------|----------|
| RFC 4122 UUIDs | `uniqueID` claim | `auth.test.ts:45` | ✅ | - |
| ISO 3166 codes | `countryOfAffiliation` | `authz.test.ts:120` | ✅ | - |
| STANAG 4774 labels | `ztdf.types.ts:31` | `ztdf.test.ts:264` | ✅ | - |
| STANAG 4778 binding | `resource.controller.ts:553` | `ztdf.test.ts:331` | ✅ | ✅ FIXED |
| Multi-KAS support | - | - | ❌ GAP | 🟠 HIGH |
| COI community keys | - | - | ❌ GAP | 🟠 HIGH |
| X.509 signatures | `ztdf.utils.ts:159` | - | ⚠️ TODO | 🟡 MED |

---

## 🧪 TESTING REQUIREMENTS

### Test Coverage Verification:

1. **Identity & Federation**:
   - [ ] UUID format validation
   - [ ] ISO 3166 country code validation  
   - [ ] Clearance hierarchy enforcement
   - [ ] IdP assertion validation (signature, expiry)
   - [ ] Each IdP tested (US, France, Canada, Industry)

2. **ABAC & Enforcement**:
   - [ ] All authorization scenarios covered (126 OPA tests)
   - [ ] PEP enforcement on all endpoints
   - [ ] Fail-closed when PDP unavailable
   - [ ] Attribute cache TTL respected
   - [ ] Policy bundle propagation

3. **ZTDF & Cryptography**:
   - [ ] ZTDF structure validation
   - [ ] Integrity checks (policy hash, payload hash, chunk hashes)
   - [ ] Encryption/decryption roundtrip
   - [ ] KAS key brokerage
   - [ ] Tampering detection (should fail gracefully)
   - [ ] SOC alerting triggered

4. **Logging & Auditing**:
   - [ ] All 5 event categories logged
   - [ ] Event format includes all required fields
   - [ ] KAS events captured
   - [ ] Logs are structured (JSON)

### Create Missing Tests:

If gaps are found, create tests such as:
- `backend/src/__tests__/acp240-compliance.test.ts`
- `backend/src/__tests__/multi-kas.test.ts`
- `backend/src/__tests__/coi-keys.test.ts`

---

## 📚 ADDITIONAL RESOURCES

### Relevant Documentation Files:

1. **Design & Architecture**:
   - `docs/IMPLEMENTATION-PLAN.md` - Original roadmap
   - `docs/README.md` - Technical overview
   - `backend/TESTING-GUIDE.md` - Test structure

2. **Phase Summaries**:
   - `docs/PHASE0-COMPLETION-SUMMARY.md` - Foundation
   - `docs/PHASE1-COMPLETE.md` - Authentication  
   - `docs/PHASE2-COMPLETION-SUMMARY.md` - Authorization
   - `docs/PHASE3-COMPLETION-SUMMARY.md` - Multi-IdP & ZTDF
   - `docs/PHASE4-IMPLEMENTATION-PROMPT.md` - CI/CD

3. **Security & Compliance**:
   - `docs/SECURITY-AUDIT-2025-10-15.md` - Security review
   - `ZTDF-COMPLIANCE-AUDIT.md` - ZTDF compliance status
   - `docs/ADMIN-GUIDE.md` - Admin operations

4. **Testing**:
   - `backend/src/__tests__/kas-decryption-integration.test.ts` - KAS tests
   - `policies/tests/acp240_compliance_tests.rego` - Policy tests
   - `verify-kas-decryption.sh` - Verification script

---

## 🎯 FINAL CHECKLIST

Before considering the gap analysis complete:

### Analysis Phase:
- [ ] Read all 10 sections of `notes/ACP240-llms.txt`
- [ ] Map every requirement to implementation
- [ ] Create compliance matrix
- [ ] Classify all gaps by priority
- [ ] Document findings in report

### Remediation Phase:
- [ ] Implement all CRITICAL gap fixes
- [ ] Implement HIGH priority fixes (if time permits)
- [ ] Add test coverage for new features
- [ ] Update TypeScript interfaces as needed

### Testing Phase:
- [ ] Run backend tests: `cd backend && npm test`
- [ ] Run OPA tests: `./bin/opa test policies/ -v`
- [ ] Run integration tests: `./verify-kas-decryption.sh`
- [ ] Run linting: `npm run lint` (backend + frontend)
- [ ] Build verification: `npm run build`
- [ ] Verify 100% pass rate

### Documentation Phase:
- [ ] Create `ACP240-GAP-ANALYSIS-REPORT.md`
- [ ] Update `docs/IMPLEMENTATION-PLAN.md`
- [ ] Update `CHANGELOG.md` with gap remediation
- [ ] Update `README.md` compliance section
- [ ] Ensure all new features documented

### CI/CD Phase:
- [ ] Review `.github/workflows/ci.yml`
- [ ] Verify all 10 jobs would pass
- [ ] Check coverage thresholds met
- [ ] Ensure no security vulnerabilities

### Commit Phase:
- [ ] Stage all changes: `git add -A`
- [ ] Write detailed commit message
- [ ] Push to GitHub: `git push origin main`
- [ ] Monitor CI pipeline for green status

---

## 🚀 BEGIN ANALYSIS

**Start with**:
1. Read `notes/ACP240-llms.txt` completely
2. Read recent `CHANGELOG.md` entries to understand current state
3. Review project structure in `backend/src/` and `policies/`
4. Begin systematic section-by-section analysis

**Remember**:
- Be thorough, not superficial
- Provide evidence (file paths, line numbers, test names)
- Prioritize security and compliance
- Document everything
- Test everything you implement

---

## 💡 TIPS FOR EFFECTIVE ANALYSIS

### Use Systematic Search:

```typescript
// For Identity requirements:
codebase_search("How are identity attributes validated and normalized?", ["backend/src/middleware"])

// For ABAC requirements:
codebase_search("How does the PEP enforce authorization decisions from OPA?", ["backend/src/middleware"])

// For ZTDF requirements:
codebase_search("How is ZTDF integrity validated before decryption?", ["backend/src"])

// For Multi-KAS:
codebase_search("How many Key Access Objects are created per resource?", ["backend/src/services"])

// For COI keys:
codebase_search("How are data encryption keys generated for resources?", ["backend/src/utils"])
```

### Look for Patterns:

- **Compliance Markers**: Comments like `// ACP-240:`, `// STANAG 4778:`, `// CRITICAL:`
- **TODO Markers**: `// TODO:`, `// FIXME:`, `// XXX:`
- **Test Coverage**: Every feature should have corresponding tests
- **Type Safety**: TypeScript interfaces should match ACP-240 specs

### Validate With Tests:

- Don't trust code alone - verify tests exist and pass
- Look for negative test cases (denial scenarios)
- Check edge cases (missing attributes, invalid data)
- Verify fail-closed behavior is tested

---

## 🎉 SUCCESS OUTCOME

At the end of this analysis, you will have:

1. ✅ **Complete Compliance Picture** - Know exactly where DIVE V3 stands vs ACP-240
2. ✅ **Remediated Critical Gaps** - All security-critical issues fixed
3. ✅ **Comprehensive Documentation** - Gap analysis report + updated docs
4. ✅ **Full Test Coverage** - 100% pass rate maintained
5. ✅ **CI/CD Ready** - Pipeline passes all checks
6. ✅ **Production Confidence** - Know what's compliant, what's not, and path forward

---

## 📞 SUPPORT RESOURCES

### If You Get Stuck:

1. **For ACP-240 interpretation**: Re-read relevant section in `notes/ACP240-llms.txt`
2. **For implementation details**: Check `docs/IMPLEMENTATION-PLAN.md`
3. **For code examples**: Review recent changes in `CHANGELOG.md`
4. **For test patterns**: Look at existing test files in `backend/src/__tests__/`
5. **For ZTDF specifics**: Read `ZTDF-COMPLIANCE-AUDIT.md`

### Reference Files by Topic:

- **Identity**: `terraform/realm.tf`, `backend/src/middleware/auth.middleware.ts`
- **ABAC**: `policies/fuel_inventory_abac_policy.rego`, `backend/src/middleware/authz.middleware.ts`
- **ZTDF**: `backend/src/utils/ztdf.utils.ts`, `backend/src/types/ztdf.types.ts`
- **KAS**: `kas/src/server.ts`, `backend/src/controllers/resource.controller.ts`
- **Logging**: `backend/src/utils/acp240-logger.ts`, `kas/src/utils/kas-logger.ts`

---

## 🎯 READY TO BEGIN

**Your mission**: Conduct the most thorough ACP-240 compliance analysis possible, remediate gaps, and deliver a production-ready, fully-compliant system.

**Expected duration**: 3-5 hours (depending on gaps found)

**Deliverable**: Comprehensive gap analysis report + remediated code + passing CI/CD pipeline

**Start by reading**: `notes/ACP240-llms.txt` (208 lines, ~10 minutes)

---

**Good luck! Let's achieve full ACP-240 compliance.** 🚀

---

**END OF PROMPT**

---

## 📋 QUICK REFERENCE CARD

```
├─ Read Requirements:  notes/ACP240-llms.txt
├─ Check Implementation: backend/src/, kas/src/, policies/
├─ Review Tests: backend/src/__tests__/, policies/tests/
├─ Document Gaps: ACP240-GAP-ANALYSIS-REPORT.md
├─ Implement Fixes: [Priority-based]
├─ Run Tests: npm test, opa test, verify-kas-decryption.sh
├─ Update Docs: README, CHANGELOG, IMPLEMENTATION-PLAN
├─ Commit: Detailed message with evidence
└─ Push: Monitor CI/CD pipeline
```

**Total Requirements**: ~50-60 discrete items across 10 sections  
**Current Compliance**: Estimated ~85-90% (needs verification)  
**Critical Gaps**: Estimated 2-3 (Multi-KAS, COI keys, possibly others)  
**Target**: 100% compliance or documented acceptance criteria  

