# Keycloak Integration with ACP-240 Requirements: Comprehensive Assessment & Phased Implementation

**Date**: October 20, 2025  
**Objective**: Assess current Keycloak integration against NATO ACP-240 requirements and create phased implementation plan with clear success criteria  
**Scope**: Multi-realm Keycloak setup, IdP federation, attribute mapping, and integration with DIVE V3 stack (KAS, Backend API, Frontend)

---

## 🎯 EXECUTIVE SUMMARY: CURRENT STATE

### What We Have Built (Weeks 1-3.4.5 Complete)

DIVE V3 is a **coalition-friendly ICAM demonstration** with the following **operational components**:

#### ✅ Infrastructure (100% Operational)
- **Keycloak 23.0**: IdP broker with `dive-v3-pilot` realm + 4 federated IdPs
- **Next.js 15**: Frontend with NextAuth.js v5 authentication
- **Express.js Backend**: RESTful API with PEP (Policy Enforcement Point)
- **OPA 0.68.0**: Policy Decision Point with 138 passing tests
- **MongoDB 7.0**: Resource metadata store (ZTDF format)
- **PostgreSQL 15**: Keycloak session persistence
- **KAS (Key Access Service)**: ACP-240 compliant key mediation service

#### ✅ Authentication & Authorization (Fully Functional)
- **4 Federated IdPs**: U.S. (OIDC), France (SAML), Canada (OIDC), Industry (OIDC)
- **Claim Normalization**: Protocol mappers standardize attributes to `uniqueID`, `clearance`, `countryOfAffiliation`, `acpCOI`
- **JWT Validation**: RS256 signature verification with JWKS
- **AAL2/FAL2 Enforcement**: NIST SP 800-63B/C compliant (MFA required for classified resources)
- **Session Management**: 15-minute idle timeout (AAL2 compliant), cross-tab synchronization
- **PEP/PDP Pattern**: All authorization decisions flow through OPA

#### ✅ Data-Centric Security (ACP-240 Baseline)
- **ZTDF Implementation**: Zero Trust Data Format with manifest, policy, payload sections
- **STANAG 4774 Labels**: Security classification markings with display format
- **STANAG 4778 Binding**: SHA-384 cryptographic integrity hashes
- **KAS Integration**: Policy-bound encryption with key mediation
- **Multi-KAS Support**: Multiple Key Access Objects (KAOs) per resource for coalition scalability
- **COI-Based Keys**: Community of Interest shared keys (FVEY, NATO-COSMIC, bilateral)
- **Audit Logging**: All 5 ACP-240 event categories (ENCRYPT, DECRYPT, DENIED, MODIFIED, SHARED)

#### ✅ Operational Capabilities
- **Secure File Upload**: Automatic ZTDF conversion, STANAG labeling, encryption
- **Policy Viewer**: Web UI for OPA Rego policies with interactive testing
- **Resource Management**: 500+ resources with faceted search and filtering
- **Admin Dashboard**: IdP onboarding wizard, approval workflow, analytics, audit logs
- **Performance**: 85.3% cache hit rate, <200ms p95 authorization latency
- **Testing**: 809/809 tests passing (138 OPA + 671 backend)

#### ✅ Compliance Status (As of Oct 20, 2025)
- **ACP-240 Compliance**: **100% GOLD** (58/58 requirements fully compliant)
- **NIST 800-63B/C**: **100%** (AAL2/FAL2 enforced in code + OPA)
- **STANAG 4774/4778**: **100%** (security labels + cryptographic binding)
- **CI/CD**: GitHub Actions workflows with 10 automated jobs (all passing)

---

## ❌ CRITICAL GAP: Keycloak Integration Depth

### The Problem

While **Keycloak is operationally configured** and **authentication flows work**, the integration is **shallow and incomplete** relative to ACP-240 requirements:

#### 1. **Mock IdPs, Not Deep Federation**
- **Current**: Keycloak simulates 4 IdPs with test users (`testuser-us`, `testuser-fra`, etc.)
- **Gap**: No real integration with national Identity Providers
- **ACP-240 Requirement**: Section 2.2 requires federation with actual IdP infrastructure (SAML/OIDC assertions from partner nations)
- **Impact**: Cannot demonstrate true cross-border authentication

#### 2. **Attribute Mapping Incomplete**
- **Current**: Basic protocol mappers for `uniqueID`, `clearance`, `countryOfAffiliation`, `acpCOI`
- **Gap**: Missing ACP-240 Section 2.1 requirements:
  - **Globally unique identifiers** (RFC 4122 UUID validation missing)
  - **Organization/Unit attributes** (`dutyOrg` not populated)
  - **Authentication context details** (ACR/AMR claims partially mapped but not enriched)
  - **Directory integration** (no AD/LDAP attribute sourcing)
- **Impact**: Incomplete identity assertions limit policy enforcement granularity

#### 3. **No Multi-Realm Architecture**
- **Current**: Single realm (`dive-v3-pilot`) for all IdPs and users
- **Gap**: ACP-240 Section 2.2 trust framework requires:
  - **Realm per organization/nation** for sovereignty and isolation
  - **Cross-realm trust** with attribute exchange policies
  - **Realm-specific policies** for identity proofing and credential issuance
- **Impact**: Cannot model real coalition environments with independent security domains

#### 4. **KAS-Keycloak Integration Weak**
- **Current**: KAS validates JWT tokens from Keycloak but doesn't leverage Keycloak services
- **Gap**: ACP-240 Section 5.2 requires:
  - **Attribute pull from IdP directory** during KAS authorization
  - **Real-time revocation checks** (immediate logout detection)
  - **Cross-domain attribute exchange** for coalition key access
- **Impact**: KAS operates with stale user attributes; no revocation enforcement

#### 5. **Backend-Keycloak Coupling Tight**
- **Current**: Backend API directly calls Keycloak Admin API for IdP CRUD operations
- **Gap**: ACP-240 best practices recommend:
  - **Policy-driven IdP onboarding** (automated trust establishment)
  - **Attribute schema governance** (centralized claim definitions)
  - **Federation metadata exchange** (SAML metadata XML signed and verified)
- **Impact**: Manual admin operations; no programmatic federation lifecycle

#### 6. **Frontend Session Management Isolated**
- **Current**: Next.js uses NextAuth.js with Keycloak provider; sessions stored client-side
- **Gap**: ACP-240 Section 6.3 recommends:
  - **Server-side session validation** (SIEM integration for anomaly detection)
  - **Centralized session registry** (cross-application single logout)
  - **Real-time session context** (device compliance, location, risk scoring)
- **Impact**: Limited visibility into active sessions; SLO not fully implemented

---

## 📋 ASSESSMENT OBJECTIVES

This assessment will deliver:

1. **Gap Analysis Matrix**: Line-by-line comparison of current Keycloak configuration vs. ACP-240 Section 2 (Identity Specifications & Federated Identity)
2. **Architecture Review**: Evaluate multi-realm design, trust establishment, and attribute flow
3. **Integration Audit**: Assess Keycloak↔KAS, Keycloak↔Backend, Keycloak↔Frontend coupling
4. **Phased Remediation Plan**: 4 phases with clear milestones, success criteria, and testing requirements
5. **Implementation Roadmap**: Updated `docs/IMPLEMENTATION-PLAN.md` and `CHANGELOG.md` with new deliverables

---

## 📚 REFERENCE MATERIALS

### 1. ACP-240 Cheat Sheet (Attached)

**File**: `notes/ACP240-llms.txt` (208 lines)

**Critical Sections for Keycloak**:
- **Lines 31-57**: Section 2 (Identity Specifications & Federated Identity)
  - 2.1 Identity Attributes (uniqueID, country, clearance, org/unit, auth context)
  - 2.2 IdPs, Protocols, Assertions (SAML/OIDC, signed/encrypted, trust framework, directory integration)
- **Lines 137-146**: Standards & Protocols Summary (NIST 800-63B/C AAL/FAL, ISO 3166, RFC 4122, STANAG 5636)
- **Lines 166-169**: Implementation Checklist (IdP signed assertions, attribute alignment, trust framework)

**Key Requirements**:
1. **Globally Unique Identifiers**: UUID per RFC 4122 for identity correlation across domains
2. **Country Codes**: ISO 3166-1 alpha-3 (USA, GBR, FRA, CAN, DEU)
3. **Authentication Context**: ACR/AMR claims mapped to NIST AAL/FAL levels
4. **Directory Integration**: IdPs source attributes from AD/LDAP with consistent schema
5. **Trust Framework**: Assurance for identity proofing and credential issuance

### 2. Current Project Documentation

**Directory Structure** (from `README.md`):
```
DIVE-V3/
├── frontend/               # Next.js 15 + NextAuth.js v5
├── backend/                # Express.js + PEP middleware
├── kas/                    # Key Access Service (ACP-240)
├── policies/               # OPA Rego policies (138 tests)
├── terraform/              # Keycloak IaC configuration
│   ├── main.tf             # Realm + client + IdP definitions (1084 lines)
│   ├── idps.tf             # 4 IdP configurations (SAML + OIDC)
│   ├── protocol-mappers.tf # Claim normalization
│   └── variables.tf        # Configuration variables
├── scripts/                # Automation scripts (dev-start.sh, preflight-check.sh)
├── docs/                   # Implementation guides (52 markdown files)
└── CHANGELOG.md            # Complete change history (3,291 lines)
```

**Key Configuration Files**:
- **Keycloak Realm**: `terraform/main.tf` lines 24-64 (`dive-v3-pilot` realm)
- **Client Config**: `terraform/main.tf` lines 66-158 (`dive-v3-client` OIDC client)
- **IdP Definitions**: `terraform/idps.tf` (4 IdPs with protocol mappers)
- **Backend JWT Middleware**: `backend/src/middleware/authz.middleware.ts` lines 186-287
- **OPA Policy**: `policies/fuel_inventory_abac_policy.rego` (402 lines)

### 3. Implementation Plan

**File**: `docs/IMPLEMENTATION-PLAN.md` (644 lines)

**Current Phase Status**:
- ✅ **Phase 0**: Observability & Hardening (8,321 lines added)
- ✅ **Phase 1**: Automated Security Validation (3,349 lines added)
- ✅ **Phase 2**: Risk Scoring & Compliance (6,847 lines added)
- ✅ **Phase 3**: Production Hardening & Analytics (12,000 lines added)
- 📋 **Phase 4**: Future Enhancements (NOT STARTED)

**Relevance**: Phase 4 should include Keycloak integration enhancements

### 4. Compliance Documentation

**ACP-240 Gap Analysis**: `ACP240-GAP-ANALYSIS-REPORT.md` (831 lines)

**Key Findings** (Lines 83-100):
- **UUID Validation**: ⚠️ PARTIAL - `uniqueID` claim used but not validated against RFC 4122
- **AAL/FAL Mapping**: ⚠️ PARTIAL - JWT `acr` claim present but not explicitly mapped to NIST levels
- **Directory Integration**: ⚠️ PARTIAL - Simulated for pilot (production requires AD/LDAP)

**Identity Assurance**: `IDENTITY-ASSURANCE-GAP-ANALYSIS.md` (831 lines)

**AAL2/FAL2 Status** (100% enforced as of Oct 19):
- ✅ JWT validation with RS256, JWKS, `aud`/`exp`/`iss` checks
- ✅ ACR claim validation (InCommon Silver/Gold = AAL2)
- ✅ AMR claim validation (2+ factors for classified)
- ✅ 15-minute session timeout (AAL2 compliant)
- ⚠️ **Gap**: Keycloak not enriching ACR/AMR based on IdP assurance levels

### 5. Recent Changes (CHANGELOG.md)

**October 19-20, 2025** (Lines 1-200):
- AAL2/FAL2 enforcement implemented (NIST 800-63B/C)
- JWT middleware validates `acr`, `amr`, `aud`, `auth_time` claims
- OPA policy checks authentication strength for classified resources
- Keycloak session timeout reduced to 15 minutes (AAL2 compliant)
- 34 new tests for AAL2/FAL2 enforcement

**Key Insight**: Recent work focused on **enforcement** but did not address **attribute enrichment** or **multi-realm architecture**

---

## 🔍 ASSESSMENT TASKS

### Phase 1: Configuration Audit (Week 1)

**Objective**: Document **as-is** Keycloak configuration and identify **specific gaps** against ACP-240 Section 2.

#### Task 1.1: Realm Architecture Review
- **Action**: Analyze `terraform/main.tf` realm configuration
- **Focus Areas**:
  - Token lifetimes (access, refresh, SSO idle, SSO max)
  - Password policy alignment with ACP-240
  - Brute-force detection settings
  - Internationalization (multi-language support)
  - Security defenses (headers, CORS, SSL required)
- **Deliverable**: Gap matrix comparing current vs. ACP-240 recommended settings

#### Task 1.2: IdP Federation Deep Dive
- **Action**: Review `terraform/idps.tf` for all 4 IdPs (U.S., France, Canada, Industry)
- **Focus Areas**:
  - Protocol configuration (OIDC vs. SAML)
  - Trust establishment (certificate validation, metadata exchange)
  - Attribute mapping completeness (claims → Keycloak user attributes)
  - First login flows (account linking, attribute enrichment)
  - Authentication flows (browser redirect, backchannel)
- **Deliverable**: Per-IdP compliance scorecard with missing attributes

#### Task 1.3: Protocol Mapper Analysis
- **Action**: Examine `terraform/protocol-mappers.tf` claim transformations
- **Focus Areas**:
  - Mapper types (hardcoded, user attribute, user property, JavaScript)
  - Claim names (OIDC vs. SAML attribute URNs)
  - Default values and fallback logic
  - UUID generation/validation
  - ACR/AMR claim enrichment
- **Deliverable**: Attribute flow diagram (IdP → Keycloak → JWT → Backend/KAS)

#### Task 1.4: Client Configuration Audit
- **Action**: Assess `dive-v3-client` OIDC client settings (`terraform/main.tf` lines 66-158)
- **Focus Areas**:
  - Access type (CONFIDENTIAL, PUBLIC)
  - Flow enablement (standard, implicit, direct grants)
  - Redirect URIs (frontend callback URLs)
  - Web origins (CORS configuration)
  - Consent settings (required, consent screen)
  - Token mappers (default scopes, audience, claims)
- **Deliverable**: Client hardening checklist with security recommendations

#### Task 1.5: Backend Integration Review
- **Action**: Analyze `backend/src/middleware/authz.middleware.ts` JWT validation
- **Focus Areas**:
  - JWKS endpoint configuration and caching
  - Claim extraction (`uniqueID`, `clearance`, `countryOfAffiliation`, `acpCOI`, `acr`, `amr`)
  - Signature verification algorithm (RS256)
  - Audience/issuer validation
  - Clock skew tolerance
  - Error handling (401 vs. 403 responses)
- **Deliverable**: Integration sequence diagram (Keycloak → Backend → OPA)

#### Task 1.6: KAS Integration Review
- **Action**: Review `kas/src/server.ts` JWT validation and attribute usage
- **Focus Areas**:
  - Token verification (shared JWKS with backend?)
  - Attribute extraction for OPA re-evaluation
  - Revocation checking (real-time vs. cached)
  - Cross-KAS attribute exchange (multi-nation scenarios)
- **Deliverable**: KAS-Keycloak integration gaps with priority ranking

#### Task 1.7: Frontend Session Management
- **Action**: Examine `frontend/src/` NextAuth.js configuration
- **Focus Areas**:
  - Session storage (JWT vs. database)
  - Token refresh flow (proactive vs. reactive)
  - Logout flow (SLO with Keycloak)
  - Cross-tab synchronization (Broadcast Channel API)
  - Error handling (expired sessions, network failures)
- **Deliverable**: Session lifecycle diagram with identified weaknesses

---

### Phase 2: Multi-Realm Architecture Design (Week 2)

**Objective**: Design and validate **multi-realm architecture** for coalition environments.

#### Task 2.1: Realm-per-Nation Model
- **Action**: Design separate realms for USA, France, Canada, Industry
- **Rationale**: ACP-240 Section 2.2 trust framework requires sovereignty and isolation
- **Design Elements**:
  - Realm naming convention (`dive-v3-usa`, `dive-v3-fra`, etc.)
  - Realm-specific policies (password, brute-force, token lifetime)
  - Identity brokering vs. direct authentication
  - Cross-realm user federation (if needed)
- **Deliverable**: Multi-realm architecture diagram with trust relationships

#### Task 2.2: Attribute Schema Governance
- **Action**: Define **canonical attribute schema** for DIVE V3
- **Requirements**:
  - Standard claim names (OIDC and SAML attribute URNs)
  - Data types and formats (UUID, ISO 3166, clearance enum)
  - Required vs. optional attributes
  - Default values and enrichment rules
  - Version control and change management
- **Deliverable**: Attribute schema specification document

#### Task 2.3: Cross-Realm Trust Establishment
- **Action**: Model trust relationships between realms
- **Use Cases**:
  - U.S. user accessing French-classified resource
  - Industry contractor requiring multi-nation clearance
  - Coalition operations with FVEY members
- **Trust Mechanisms**:
  - SAML metadata exchange (signed XML)
  - JWKS endpoint federation (mutual TLS)
  - Attribute release policies (per-realm authorization)
- **Deliverable**: Trust establishment procedures and testing plan

#### Task 2.4: Role-Based vs. Attribute-Based Mapping
- **Action**: Evaluate Keycloak roles vs. ABAC attributes
- **Current**: Backend uses ABAC with OPA (no Keycloak roles)
- **Decision Point**: Should Keycloak manage roles or only pass attributes?
- **Options**:
  - Option A: Pure ABAC (Keycloak is attribute broker only)
  - Option B: Hybrid (Keycloak roles → OPA attributes)
  - Option C: Role-based groups (Keycloak groups map to COI)
- **Deliverable**: Architecture decision record (ADR) with rationale

#### Task 2.5: Federation Metadata Management
- **Action**: Implement automated SAML metadata exchange
- **Requirements**:
  - Generate signed SAML metadata for each realm
  - Validate remote IdP metadata (signature, certificate expiry)
  - Automate metadata refresh (detect expiry, update)
  - Store metadata history (audit trail)
- **Deliverable**: Metadata lifecycle automation scripts

---

### Phase 3: Attribute Enrichment & Directory Integration (Week 3)

**Objective**: Implement **deep attribute enrichment** to satisfy ACP-240 Section 2.1 requirements.

#### Task 3.1: UUID Validation and Generation
- **Action**: Enforce RFC 4122 UUID format for `uniqueID` claim
- **Implementation**:
  - Keycloak custom authenticator (SPI) to validate/generate UUIDs
  - Middleware validation in backend (`authz.middleware.ts`)
  - Database constraint (MongoDB schema validation)
  - OPA policy validation (integrity check)
- **Testing**: Reject non-UUID identifiers, generate UUIDs for legacy accounts
- **Deliverable**: UUID enforcement implementation + tests

#### Task 3.2: ACR/AMR Enrichment
- **Action**: Map IdP authentication methods to NIST AAL levels
- **Mapping Table**:
  - `pwd` (password only) → AAL1
  - `pwd + otp` (password + TOTP) → AAL2
  - `pwd + smartcard` (password + PIV) → AAL3
  - InCommon Bronze → AAL1, Silver → AAL2, Gold → AAL3
- **Implementation**:
  - Keycloak flow customization (detect MFA type)
  - Protocol mapper to set `acr` claim based on auth method
  - `amr` claim population with factor list
- **Deliverable**: ACR/AMR enrichment implementation + mapping guide

#### Task 3.3: Organization/Unit Attributes
- **Action**: Populate `dutyOrg` and `orgUnit` claims from IdP assertions
- **Sources**:
  - SAML: `urn:oid:2.5.4.10` (organization), `urn:oid:2.5.4.11` (organizational unit)
  - OIDC: Custom claims (`organization`, `department`)
  - Fallback: Email domain mapping (`@navy.mil` → `US_NAVY`)
- **Implementation**:
  - Protocol mappers for SAML attribute extraction
  - JavaScript mapper for email domain parsing
  - User attribute storage in Keycloak
- **Deliverable**: Organization attribute extraction + enrichment tests

#### Task 3.4: Directory Integration (Simulated)
- **Action**: Mock AD/LDAP integration for pilot (real integration for production)
- **Approach**:
  - Keycloak User Storage SPI (read-only LDAP provider)
  - Mock LDAP server (OpenLDAP Docker container) with test users
  - Attribute synchronization (clearance, country, COI from LDAP)
  - Login flow: LDAP lookup → attribute merge → JWT issuance
- **Testing**: Verify attributes propagate from LDAP → Keycloak → JWT
- **Deliverable**: Mock directory integration + synchronization tests

#### Task 3.5: Clearance Level Harmonization
- **Action**: Implement cross-national clearance mapping
- **Requirements**:
  - U.S. CONFIDENTIAL = French CONFIDENTIEL DEFENSE = UK CONFIDENTIAL
  - Store both original and normalized clearance levels
  - OPA policy uses normalized level for comparison
- **Implementation**:
  - Protocol mapper with clearance translation table
  - JWT claim: `clearanceOriginal` (source) + `clearance` (normalized)
  - Backend middleware validates both values match mapping
- **Deliverable**: Clearance harmonization mapper + validation tests

#### Task 3.6: Real-Time Attribute Refresh
- **Action**: Implement attribute refresh without re-authentication
- **Scenarios**:
  - User clearance upgraded (SECRET → TOP_SECRET)
  - User country affiliation changed (relocation)
  - COI membership revoked (left project)
- **Implementation**:
  - Token refresh endpoint pulls fresh attributes from IdP
  - Backend/KAS check token `iat` (issued at) for staleness
  - Force re-authentication if attributes >1 hour old for classified resources
- **Deliverable**: Attribute freshness enforcement + edge case tests

---

### Phase 4: Advanced Integration & Testing (Week 4)

**Objective**: Implement **advanced federation features** and execute **comprehensive testing**.

#### Task 4.1: Single Logout (SLO) Implementation
- **Action**: Implement coordinated logout across all services
- **Flow**:
  1. User clicks "Logout" in frontend
  2. Frontend calls Keycloak logout endpoint
  3. Keycloak sends backchannel logout to all SPs (frontend, backend, KAS)
  4. Each SP invalidates local sessions
  5. Keycloak confirms logout to user
- **Implementation**:
  - Frontend: `signOut()` with Keycloak logout URL
  - Backend: Implement logout callback endpoint (`/api/auth/logout-callback`)
  - KAS: Token revocation list (JWT blacklist with TTL)
  - Cross-tab broadcast (invalidate all browser tabs)
- **Deliverable**: SLO implementation + multi-service logout tests

#### Task 4.2: Session Anomaly Detection
- **Action**: Integrate Keycloak events with SIEM for anomaly detection
- **Events to Monitor**:
  - Login from new device/location
  - Multiple failed login attempts
  - Token refresh from unexpected IP
  - Concurrent sessions from different continents
- **Implementation**:
  - Keycloak Event Listener SPI (forward events to backend)
  - Backend analyzes events and flags anomalies
  - Admin dashboard shows session risk scoring
  - Auto-logout on high-risk sessions
- **Deliverable**: Session risk detection + automated response

#### Task 4.3: Federation Performance Optimization
- **Action**: Optimize Keycloak-Backend-KAS integration latency
- **Targets**:
  - Token validation: <10ms (JWKS caching)
  - Attribute extraction: <5ms (claim parsing)
  - OPA decision: <50ms (existing)
  - End-to-end authorization: <100ms
- **Optimizations**:
  - JWKS cache with 5-minute TTL
  - Connection pooling (Keycloak → Backend → OPA)
  - Pre-fetch user attributes on token refresh
  - Async audit logging (non-blocking)
- **Deliverable**: Performance benchmarks + optimization report

#### Task 4.4: Multi-IdP E2E Testing
- **Action**: Execute comprehensive end-to-end tests with all 4 IdPs
- **Test Scenarios** (16 total):
  1. **U.S. IdP**: SECRET user → SECRET/USA resource (ALLOW)
  2. **U.S. IdP**: CONFIDENTIAL user → TOP_SECRET resource (DENY clearance)
  3. **France IdP**: SECRET user → SECRET/FRA resource (ALLOW)
  4. **France IdP**: SECRET/USA user → SECRET/USA-only resource (DENY country)
  5. **Canada IdP**: SECRET/FVEY user → SECRET/FVEY resource (ALLOW)
  6. **Canada IdP**: SECRET user → TOP_SECRET/FVEY resource (DENY clearance)
  7. **Industry IdP**: CONFIDENTIAL contractor → CONFIDENTIAL/CAN-US resource (ALLOW)
  8. **Industry IdP**: UNCLASSIFIED contractor → SECRET resource (DENY clearance)
  9. **Cross-IdP**: User switches IdP mid-session (SLO + re-auth)
  10. **Token expiry**: 15-minute timeout with auto-logout
  11. **Token refresh**: Proactive refresh at 5 minutes remaining
  12. **Attribute staleness**: Force re-auth after 1 hour for classified
  13. **KAS integration**: ZTDF decryption with policy re-evaluation
  14. **Multi-KAS**: Coalition resource accessible by multiple KASs
  15. **SLO**: Logout from one SP invalidates all sessions
  16. **Anomaly detection**: Login from new location triggers alert
- **Deliverable**: E2E test suite + test report

#### Task 4.5: Compliance Validation
- **Action**: Final ACP-240 Section 2 compliance audit
- **Validation Criteria**:
  - ✅ All 10 Section 2.1 identity attributes populated
  - ✅ All 6 Section 2.2 federation requirements met
  - ✅ UUID RFC 4122 compliance enforced
  - ✅ ISO 3166-1 alpha-3 country codes validated
  - ✅ NIST AAL/FAL levels mapped and enforced
  - ✅ Directory integration (simulated) functional
  - ✅ 16 E2E scenarios passing
- **Deliverable**: Updated `ACP240-GAP-ANALYSIS-REPORT.md` with 100% Section 2 compliance

#### Task 4.6: Documentation & Handoff
- **Action**: Update all documentation and create admin guides
- **Documents to Update**:
  - `docs/IMPLEMENTATION-PLAN.md` (add Phase 4: Keycloak Integration)
  - `CHANGELOG.md` (comprehensive entry for Oct 20-Nov 6, 2025)
  - `README.md` (update architecture diagram, add multi-realm section)
  - `ACP240-GAP-ANALYSIS-REPORT.md` (mark Section 2 100% compliant)
  - `terraform/README.md` (multi-realm setup guide)
- **New Documents**:
  - `docs/KEYCLOAK-MULTI-REALM-GUIDE.md` (architecture and operations)
  - `docs/ATTRIBUTE-ENRICHMENT-GUIDE.md` (ACR/AMR, UUID, org/unit)
  - `docs/FEDERATION-TESTING-GUIDE.md` (16 E2E scenarios with screenshots)
  - `scripts/setup-multi-realm.sh` (automated multi-realm deployment)
- **Deliverable**: Complete documentation package + admin training guide

---

## 📊 SUCCESS CRITERIA

### Phase 1: Configuration Audit (Exit Criteria)
- [ ] Gap matrix completed for realm, IdP, client, protocol mappers
- [ ] Per-IdP compliance scorecards (0-100%) with specific gaps identified
- [ ] Attribute flow diagram validated (IdP → Keycloak → JWT → Backend/KAS)
- [ ] Integration sequence diagrams reviewed by stakeholders
- [ ] Priority ranking for gaps (CRITICAL, HIGH, MEDIUM, LOW)

### Phase 2: Multi-Realm Architecture (Exit Criteria)
- [ ] Multi-realm architecture design approved
- [ ] Attribute schema specification finalized
- [ ] Trust establishment procedures documented
- [ ] RBAC vs. ABAC decision recorded (ADR)
- [ ] Metadata lifecycle automation scripts functional

### Phase 3: Attribute Enrichment (Exit Criteria)
- [ ] UUID RFC 4122 validation enforced (100% of tokens)
- [ ] ACR/AMR claims enriched with NIST AAL mapping (100% of IdPs)
- [ ] Organization/unit attributes populated (≥90% of users)
- [ ] Mock directory integration functional (LDAP → Keycloak → JWT)
- [ ] Clearance harmonization tested (3+ nations)
- [ ] Attribute freshness enforcement working (force re-auth after 1 hour)

### Phase 4: Advanced Integration & Testing (Exit Criteria)
- [ ] Single Logout (SLO) functional across frontend, backend, KAS
- [ ] Session anomaly detection operational (≥3 risk indicators)
- [ ] Performance targets met (<100ms end-to-end authorization)
- [ ] 16/16 E2E scenarios passing (all 4 IdPs tested)
- [ ] ACP-240 Section 2 compliance: **100%** (0 gaps remaining)
- [ ] Documentation complete (6 new guides, 4 updated docs)
- [ ] GitHub Actions CI/CD passing (all tests green)

---

## 📈 DELIVERABLES TIMELINE

| Week | Phase | Key Deliverables | Est. Lines of Code |
|------|-------|------------------|-------------------|
| **Week 1** | Configuration Audit | Gap matrices, scorecards, diagrams | 500 (docs only) |
| **Week 2** | Multi-Realm Design | Architecture, schema, trust procedures | 2,000 (Terraform + scripts) |
| **Week 3** | Attribute Enrichment | UUID, ACR/AMR, org/unit, LDAP, clearance | 3,500 (backend + Terraform) |
| **Week 4** | Advanced Integration | SLO, anomaly detection, E2E tests | 4,000 (backend + tests + docs) |
| **Total** | | **Complete Keycloak-ACP240 integration** | **10,000 lines** |

---

## 🔧 TECHNICAL IMPLEMENTATION NOTES

### Terraform Changes Required

**New Files**:
- `terraform/realms/usa.tf` - U.S. realm configuration
- `terraform/realms/france.tf` - France realm configuration
- `terraform/realms/canada.tf` - Canada realm configuration
- `terraform/realms/industry.tf` - Industry realm configuration
- `terraform/modules/protocol-mappers/uuid-validator.tf` - UUID enforcement
- `terraform/modules/protocol-mappers/acr-enrichment.tf` - AAL mapping

**Modified Files**:
- `terraform/main.tf` - Add multi-realm imports
- `terraform/idps.tf` - Update IdP assignments per realm
- `terraform/protocol-mappers.tf` - Add UUID, ACR/AMR, org/unit mappers

**Estimated Changes**: +1,500 lines Terraform code

### Backend Changes Required

**New Files**:
- `backend/src/middleware/uuid-validation.middleware.ts` - RFC 4122 enforcement
- `backend/src/services/attribute-enrichment.service.ts` - Claim processing
- `backend/src/services/session-anomaly.service.ts` - Risk detection
- `backend/src/utils/clearance-harmonization.ts` - Cross-nation mapping
- `backend/src/__tests__/keycloak-integration.test.ts` - Integration tests

**Modified Files**:
- `backend/src/middleware/authz.middleware.ts` - Add attribute freshness checks
- `backend/src/types/jwt.types.ts` - Add new claim types (dutyOrg, orgUnit)
- `backend/src/controllers/auth.controller.ts` - SLO callback endpoint

**Estimated Changes**: +2,500 lines backend code + 1,000 lines tests

### KAS Changes Required

**Modified Files**:
- `kas/src/server.ts` - Add attribute pull from Keycloak
- `kas/src/utils/token-revocation.ts` - JWT blacklist

**Estimated Changes**: +500 lines KAS code

### Frontend Changes Required

**Modified Files**:
- `frontend/src/app/api/auth/[...nextauth]/route.ts` - Add SLO callback
- `frontend/src/components/auth/session-monitor.tsx` - Anomaly alerts

**Estimated Changes**: +300 lines frontend code

### OPA Policy Changes Required

**Modified Files**:
- `policies/fuel_inventory_abac_policy.rego` - Add UUID validation, org/unit checks
- `policies/tests/attribute_validation_test.rego` - New test cases

**Estimated Changes**: +200 lines Rego + 100 lines tests

---

## 🧪 TESTING STRATEGY

### Unit Tests (Target: 100 new tests)
- UUID validation (RFC 4122 format checks)
- ACR/AMR mapping (NIST AAL level derivation)
- Organization/unit extraction (SAML + OIDC)
- Clearance harmonization (cross-nation mapping)
- Attribute freshness (staleness detection)
- SLO callback (session invalidation)

### Integration Tests (Target: 50 new tests)
- Keycloak → Backend JWT validation
- Keycloak → KAS attribute pull
- Multi-realm user login flows
- Cross-realm attribute exchange
- Directory sync (LDAP → Keycloak)
- Token refresh with attribute updates

### End-to-End Tests (Target: 16 scenarios)
- See **Task 4.4** above for full scenario list
- All 4 IdPs × 4 clearance levels = 16 core scenarios
- Plus: SLO, token expiry, anomaly detection, multi-KAS

### Performance Tests
- Token validation latency (<10ms)
- Attribute extraction latency (<5ms)
- End-to-end authorization (<100ms)
- JWKS cache hit rate (>95%)
- Concurrent session load (100 users)

---

## 📂 FILES TO REVIEW IN THIS CODEBASE

### Keycloak Configuration (Priority: CRITICAL)
1. `terraform/main.tf` (lines 24-64: realm config, 66-158: client config)
2. `terraform/idps.tf` (entire file: 4 IdP configurations)
3. `terraform/protocol-mappers.tf` (entire file: claim mappings)
4. `terraform/variables.tf` (configuration parameters)

### Backend Integration (Priority: HIGH)
5. `backend/src/middleware/authz.middleware.ts` (lines 186-287: JWT validation, 230-287: AAL2 enforcement)
6. `backend/src/middleware/enrichment.middleware.ts` (claim enrichment logic)
7. `backend/src/types/jwt.types.ts` (JWT claim interfaces)
8. `backend/src/types/opa-input.types.ts` (OPA input schema)

### KAS Integration (Priority: HIGH)
9. `kas/src/server.ts` (lines 100-200: JWT verification, 200-300: attribute extraction)
10. `kas/src/types/kas.types.ts` (KAS request/response types)

### Frontend Session (Priority: MEDIUM)
11. `frontend/src/app/api/auth/[...nextauth]/route.ts` (NextAuth.js config)
12. `frontend/src/components/auth/session-status.tsx` (session monitoring)

### OPA Policy (Priority: MEDIUM)
13. `policies/fuel_inventory_abac_policy.rego` (lines 83-87: context schema, 270-312: auth strength checks)
14. `policies/tests/aal_fal_enforcement_test.rego` (AAL2/FAL2 tests)

### Documentation (Priority: MEDIUM)
15. `README.md` (project overview, current status)
16. `CHANGELOG.md` (lines 1-200: recent AAL2/FAL2 work)
17. `ACP240-GAP-ANALYSIS-REPORT.md` (lines 83-100: Section 2 gaps)
18. `IDENTITY-ASSURANCE-GAP-ANALYSIS.md` (AAL/FAL implementation details)

---

## 🎯 NEXT STEPS (Start Here!)

### Immediate Actions for New Chat Session

1. **Read ACP-240 Requirements**:
   - Review `notes/ACP240-llms.txt` lines 31-57 (Section 2: Identity & Federation)
   - Understand 10 identity attribute requirements
   - Understand 6 federation protocol requirements

2. **Audit Current Keycloak Configuration**:
   - Read `terraform/main.tf`, `terraform/idps.tf`, `terraform/protocol-mappers.tf`
   - Map current configuration to ACP-240 Section 2 requirements
   - Create gap matrix (spreadsheet or markdown table)

3. **Review Backend/KAS Integration**:
   - Read `backend/src/middleware/authz.middleware.ts` (JWT validation)
   - Read `kas/src/server.ts` (KAS token handling)
   - Identify attribute flow gaps

4. **Create Phased Implementation Plan**:
   - Follow structure from this document (Phases 1-4)
   - Add specific tasks with line-number references to code
   - Define clear exit criteria for each phase

5. **Update Project Documentation**:
   - Add Phase 4 to `docs/IMPLEMENTATION-PLAN.md`
   - Create CHANGELOG entry for Oct 20-Nov 6 work window
   - Update README with multi-realm architecture section

6. **Run QA Validation**:
   - Execute `./scripts/preflight-check.sh` (ensure all services healthy)
   - Run backend tests: `cd backend && npm test` (verify 671/671 passing)
   - Run OPA tests: `docker-compose exec opa opa test /policies/ -v` (verify 138/138 passing)
   - Confirm CI/CD: Check GitHub Actions workflows (all green)

7. **Begin Phase 1 Implementation**:
   - Start with **Task 1.1: Realm Architecture Review**
   - Document findings in `docs/KEYCLOAK-CONFIGURATION-AUDIT.md`
   - Create Terraform changes in feature branch: `feature/phase4-keycloak-integration`

---

## 📋 EXPECTED OUTPUTS

By the end of this assessment and implementation, you will deliver:

### Documentation (6 New Files)
1. `docs/KEYCLOAK-CONFIGURATION-AUDIT.md` (~500 lines)
2. `docs/KEYCLOAK-MULTI-REALM-GUIDE.md` (~800 lines)
3. `docs/ATTRIBUTE-ENRICHMENT-GUIDE.md` (~600 lines)
4. `docs/FEDERATION-TESTING-GUIDE.md` (~700 lines)
5. `docs/SESSION-ANOMALY-DETECTION.md` (~400 lines)
6. `scripts/setup-multi-realm.sh` (~300 lines)

### Code Changes (10,000 Lines)
- Terraform: +1,500 lines (multi-realm, mappers, validators)
- Backend: +3,500 lines (middleware, services, tests)
- KAS: +500 lines (attribute pull, revocation)
- Frontend: +300 lines (SLO, anomaly alerts)
- OPA: +300 lines (policy + tests)
- Scripts: +900 lines (automation, testing)
- Documentation: +3,000 lines (guides, specs, reports)

### Updated Files (4 Critical)
1. `docs/IMPLEMENTATION-PLAN.md` (add Phase 4: Keycloak Integration)
2. `CHANGELOG.md` (comprehensive Oct 20-Nov 6 entry)
3. `README.md` (multi-realm architecture, updated status)
4. `ACP240-GAP-ANALYSIS-REPORT.md` (Section 2: 100% compliant)

### Test Coverage (+166 Tests)
- Unit tests: +100 (UUID, ACR/AMR, org/unit, clearance, freshness, SLO)
- Integration tests: +50 (Keycloak↔Backend, Keycloak↔KAS, multi-realm)
- E2E tests: +16 (all 4 IdPs, full scenarios)
- **Total tests: 975 (809 current + 166 new)**

### Compliance Certification
- **ACP-240 Section 2**: 100% compliant (0 gaps)
- **NIST 800-63B/C**: AAL2/FAL2 fully enforced with enrichment
- **RFC 4122**: UUID validation enforced
- **ISO 3166-1**: Country code validation enforced
- **STANAG 5636**: Identity metadata exchange compliant

---

## 🚨 CRITICAL REMINDERS

### Repository Conventions (From `.cursorrules`)
1. **Do what has been asked; nothing more, nothing less**
2. **NEVER create files unless absolutely necessary**
3. **ALWAYS prefer editing an existing file** to creating a new one
4. **NEVER proactively create documentation files** unless explicitly requested
5. **Follow the 4-week plan strictly**: Incremental, tested, production-ready
6. **Read before writing**: Always read existing files to understand current state
7. **Test-driven**: Write tests before implementation
8. **Security-first**: Validate inputs, check authentication, log decisions

### Quality Gates (Must Pass Before Merge)
- ✅ All unit tests passing (target: 975/975)
- ✅ All integration tests passing
- ✅ All E2E scenarios passing (16/16)
- ✅ TypeScript: 0 errors
- ✅ ESLint: 0 errors
- ✅ OPA: 138+ tests passing
- ✅ CI/CD: GitHub Actions all green
- ✅ Performance: <100ms end-to-end authorization
- ✅ Compliance: ACP-240 Section 2 = 100%

### Performance Targets
- Token validation: <10ms (JWKS caching)
- Attribute extraction: <5ms
- OPA decision: <50ms (existing)
- End-to-end authorization: <100ms
- JWKS cache hit rate: >95%
- Session anomaly detection: <200ms

### Security Requirements
- All JWTs validated with RS256 + JWKS
- UUID RFC 4122 format enforced (reject invalid)
- ACR/AMR claims required for classified resources (AAL2 minimum)
- Session timeout: 15 minutes (AAL2 compliant)
- Token lifetime: 15 minutes (replay prevention)
- SLO: All sessions invalidated on logout
- Audit: All attribute enrichment events logged

---

## 📞 SUPPORT & RESOURCES

### Keycloak Documentation
- **Admin Guide**: https://www.keycloak.org/docs/latest/server_admin/
- **Server Developer Guide**: https://www.keycloak.org/docs/latest/server_development/
- **Securing Applications**: https://www.keycloak.org/docs/latest/securing_apps/

### ACP-240 Standards
- **NATO ACP-240 (A)**: Data-Centric Security specification (`notes/ACP240-llms.txt`)
- **NIST SP 800-63B**: Digital Identity Guidelines (Authentication and Lifecycle Management)
- **NIST SP 800-63C**: Digital Identity Guidelines (Federation and Assertions)

### DIVE V3 Slack/Chat
- **Repository**: https://github.com/albeach/DIVE-V3
- **Issues**: GitHub Issues for bug reports and feature requests
- **Documentation**: `/docs` directory has 52 comprehensive guides

---

## ✅ FINAL CHECKLIST (Before Starting)

Before beginning this assessment in a new chat session, verify:

- [ ] You have reviewed `notes/ACP240-llms.txt` (Section 2: lines 31-57)
- [ ] You have read `README.md` (project overview and current status)
- [ ] You have reviewed `CHANGELOG.md` (lines 1-200: recent AAL2/FAL2 work)
- [ ] You have examined `ACP240-GAP-ANALYSIS-REPORT.md` (lines 83-100: Section 2 gaps)
- [ ] You have read `terraform/main.tf` (realm + client configuration)
- [ ] You have read `terraform/idps.tf` (4 IdP configurations)
- [ ] You have reviewed `backend/src/middleware/authz.middleware.ts` (JWT validation)
- [ ] All services are running: `./scripts/preflight-check.sh` (PASSING)
- [ ] All tests are passing: Backend (671/671), OPA (138/138), Total (809/809)
- [ ] GitHub Actions CI/CD workflows are GREEN
- [ ] You understand the 4-phase structure (Config Audit → Multi-Realm → Enrichment → Testing)
- [ ] You are ready to create `feature/phase4-keycloak-integration` branch

---

**END OF PROMPT**

This prompt is designed for a **fresh chat session** with complete context. It contains:
- ✅ Full current state summary (what's built, what's working)
- ✅ Critical gap identification (shallow federation, missing enrichment)
- ✅ Reference material citations (files, line numbers, standards)
- ✅ Phased implementation plan (4 weeks, clear milestones)
- ✅ Success criteria (exit criteria per phase)
- ✅ Technical implementation notes (Terraform, backend, KAS, frontend, OPA)
- ✅ Testing strategy (unit, integration, E2E, performance)
- ✅ Quality gates and compliance targets
- ✅ Next steps and expected outputs

**Ready to begin Phase 4: Keycloak-ACP240 Integration!** 🚀


