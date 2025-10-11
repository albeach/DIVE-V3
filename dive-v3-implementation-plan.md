# DIVE V3 Implementation Plan: USA/NATO Coalition ICAM Pilot
**4-Week Phased Delivery • Start Date: October 10, 2025**

---

## 1. Four-Week Implementation Plan

### Week 1: Foundation & Federation (Oct 10-16, 2025)
**Objective:** Establish Keycloak federation with U.S. IdP, basic Next.js UI, and MongoDB resource store.

| Task | Owner | Inputs | Output | Acceptance Criteria | Risk | Mitigation | Dependency |
|------|-------|--------|--------|-------------------|------|------------|------------|
| Deploy Keycloak realm `dive-v3-pilot` | DevOps | Terraform scripts | Running Keycloak instance | Keycloak admin console accessible, realm created | Container orchestration issues | Use docker-compose from keycloak-react-main as baseline | None |
| Configure U.S. IdP (OIDC) | ICAM Lead | IdP metadata, client credentials | Keycloak IdP connector | Successful test login with U.S. credentials | IdP connectivity in dev environment | Mock IdP with Keycloak test realm | None |
| Create protocol mappers for U.S. IdP | ICAM Lead | Claim mapping spec | Normalized token claims | Token contains uniqueID, clearance, countryOfAffiliation, acpCOI | Claim name mismatches | Document actual vs expected claims early | U.S. IdP config |
| Deploy Next.js app with NextAuth | Frontend Dev | keycloak-react-main template | Running web app | Login redirects to Keycloak | Port conflicts | Use 3000 for app, 8081 for Keycloak | Keycloak running |
| Create IdP selection page | Frontend Dev | Design mockup | IdP picker UI | User can select U.S./FRA/CAN/Industry | N/A | N/A | Next.js deployed |
| Deploy MongoDB | Backend Dev | Docker image | Running MongoDB instance | Connection string works from backend | Data persistence | Use named volume | None |
| Seed resource metadata | Backend Dev | Sample JSON | 20+ test resources | Query returns resources with classification, releasabilityTo, COI | N/A | N/A | MongoDB running |
| Create backend API skeleton | Backend Dev | OpenAPI spec from dive-v3-backend.md | Express.js API with /resources/:id | GET returns resource metadata | N/A | N/A | MongoDB seeded |
| Setup local dev environment | All | README instructions | Working local stack | `docker-compose up` starts all services | M1 Mac compatibility | Use multi-arch images | None |

**Week 1 Deliverables:**
- ✅ Keycloak with U.S. IdP working
- ✅ IdP selection UI functional
- ✅ User can authenticate and see normalized claims
- ✅ MongoDB with 20+ sample resources
- ✅ Basic API returns resource metadata

---

### Week 2: Authorization Engine & PEP/PDP Pattern (Oct 17-23, 2025)
**Objective:** Integrate OPA as PDP, implement PEP in API layer, create initial Rego policies.

| Task | Owner | Inputs | Output | Acceptance Criteria | Risk | Mitigation | Dependency |
|------|-------|--------|--------|-------------------|------|------------|------------|
| Deploy OPA container | Backend Dev | OPA v0.68.0+ image | Running OPA server | OPA health endpoint responds | Version conflicts | Pin to tested version | None |
| Implement PEP in Express middleware | Backend Dev | PEP pattern from mpe-experiment | Authorization middleware | All /resources/* requests call OPA before response | Performance overhead | Cache decisions for 60s | Backend API + OPA running |
| Create OPA input constructor | Backend Dev | Attribute mapping table | Middleware function | OPA input JSON matches spec | Missing attributes | Set safe defaults, log warnings | PEP middleware |
| Write core Rego policy | Policy Dev | ACP-240 rules, mpe-experiment patterns | fuel_inventory_abac_policy.rego | Policy loads in OPA without errors | Syntax errors | Use `opa check` in CI | OPA deployed |
| Implement clearance ≥ classification rule | Policy Dev | Clearance enum mappings | Rego rule | UNCLASSIFIED user denied SECRET resource | Logic errors | Extensive unit tests | Core policy exists |
| Implement releasability rule | Policy Dev | Country code spec (ISO-3166-1 alpha-3) | Rego rule | USA user allowed USA-releasable, denied FRA-only | Empty releasabilityTo edge case | Deny if empty or missing | Core policy exists |
| Implement COI intersection rule | Policy Dev | COI examples | Rego rule | User with COI=["NATO-COSMIC"] accesses resource with COI=["NATO-COSMIC", "FVEY"] | Multiple COI semantics | Require at least one intersection | Core policy exists |
| Create OPA unit tests | Policy Dev | Test matrix | 15+ `opa test` cases | All tests pass | Incomplete coverage | TDD: write tests first | Rego policies written |
| Add decision logging | Backend Dev | Log format spec | Structured JSON logs | Each decision logged with timestamp, subject, resource, decision, reason | Log volume | Sample at 100% in pilot | PEP middleware |
| Create authorization result UI | Frontend Dev | Design spec | Dashboard page showing allow/deny | User sees "Access Granted" or "Access Denied: Insufficient Clearance" | Complex policy reasons | Show primary violation only | Next.js app |

**Week 2 Deliverables:**
- ✅ OPA integrated with API
- ✅ 3 core Rego rules (clearance, releasability, COI)
- ✅ 15+ passing `opa test` cases
- ✅ UI displays authorization decisions with rationale
- ✅ Decision audit logs captured

---

### Week 3: Multi-IdP Federation & Attribute Enrichment (Oct 24-30, 2025)
**Objective:** Onboard FRA/CAN/Industry IdPs, handle SAML, implement claim enrichment.

| Task | Owner | Inputs | Output | Acceptance Criteria | Risk | Mitigation | Dependency |
|------|-------|--------|--------|-------------------|------|------------|------------|
| Configure France IdP (SAML) | ICAM Lead | SAML metadata XML | Keycloak IdP connector | French user can log in | SAML signature validation | Use test IdP with known cert | Week 1 Keycloak |
| Create SAML→OIDC mappers for FRA | ICAM Lead | SAML attribute names | Protocol mappers | French token has normalized claims | Attribute name differences | Document mapping in code comments | FRA IdP configured |
| Configure Canada IdP (OIDC) | ICAM Lead | CAN IdP discovery URL | Keycloak IdP connector | Canadian user can log in | Network access to CAN IdP | Use mock if unavailable | Week 1 Keycloak |
| Configure Industry IdP (OIDC) | ICAM Lead | Client credentials | Keycloak IdP connector | Industry user can log in | Non-standard claims | Enrichment layer in backend | Week 1 Keycloak |
| Implement claim enrichment service | Backend Dev | Enrichment rules doc | Enrichment middleware | Missing countryOfAffiliation inferred from email domain | Accuracy of inference | Log all enrichments for audit | PEP middleware |
| Add creationDate embargo rule | Policy Dev | Time comparison logic | Rego policy | Resource with creationDate > current time denied | Clock skew | Allow ±5min tolerance, log skew | Week 2 policy |
| Create negative test suite | QA | Edge case matrix | 20+ failing test cases | All expected denials work correctly | False positives | Review each denial reason | Week 2 tests |
| Test missing attribute scenarios | QA | Token permutations | Test results | Missing clearance → deny with reason | Partial test coverage | Automate with pytest | Week 3 IdPs |
| Update IdP picker with all 4 options | Frontend Dev | IdP metadata | Enhanced UI | All 4 IdPs selectable with flags/names | Icon asset availability | Use emoji flags | Week 1 UI |
| Multi-IdP integration testing | QA | All IdPs configured | Test report | 1 successful auth per IdP in test log | IdP availability | Schedule tests when stable | All IdPs configured |

**Week 3 Deliverables:**
- ✅ 4 IdPs operational (US, FRA, CAN, Industry)
- ✅ SAML and OIDC both supported
- ✅ Claim enrichment handles missing attributes
- ✅ creationDate embargo enforced
- ✅ 20+ negative test cases passing

---

### Week 4: KAS Integration, End-to-End Demo & Pilot Report (Oct 31-Nov 6, 2025)
**Objective:** Implement KAS stub, conduct cross-IdP demos, harden system, deliver pilot report.

| Task | Owner | Inputs | Output | Acceptance Criteria | Risk | Mitigation | Dependency |
|------|-------|--------|--------|-------------------|------|------------|------------|
| Create KAS stub service | Backend Dev | KAS API spec | Node.js service on :8080 | KAS /request-key endpoint responds | Service discovery | Hardcode endpoint in env vars | None |
| Implement KAS ABAC check | Backend Dev | OPA input format | KAS calls OPA before key release | KAS denies key even if API allowed download | Duplicate logic | Reuse PEP code | KAS service + OPA |
| Add encrypted resource support | Backend Dev | Crypto library | Encrypt/decrypt helpers | Test resource encrypted with KAS-managed key | Key management complexity | Use symmetric AES-256, single test key | None |
| Update API for encrypted resources | Backend Dev | Resource schema | /resources/:id checks `encrypted` flag | Encrypted resource response includes KAS key request | N/A | N/A | KAS stub |
| Create KAS obligation in Rego | Policy Dev | Obligation syntax | Policy emits `{"must_call_kas": true}` | OPA decision includes obligation when resource encrypted | Parsing obligations | Document JSON schema | Week 3 policy |
| E2E test: US user, SECRET resource | QA | Test scenario | Demo script | US user with SECRET clearance accesses SECRET/USA resource | Environment state | Reset DB between runs | All components |
| E2E test: FRA user, FRA-only resource | QA | Test scenario | Demo script | French user accesses FRA-releasable resource | SAML IdP stability | Retry logic | All components |
| E2E test: Clearance denial | QA | Test scenario | Demo script | CONFIDENTIAL user denied SECRET resource with clear message | N/A | N/A | All components |
| E2E test: Releasability denial | QA | Test scenario | Demo script | USA user denied GBR-only resource | N/A | N/A | All components |
| E2E test: KAS key gating | QA | Test scenario | Demo script | User gets key from KAS for encrypted resource | KAS decision mismatch | Log KAS input/output | KAS integrated |
| E2E test: KAS denial | QA | Test scenario | Demo script | User with insufficient COI denied key by KAS | N/A | N/A | KAS integrated |
| Performance testing | DevOps | Load test script | Metrics report | 100 req/s, <200ms p95 latency | OPA bottleneck | Enable OPA decision cache | All components |
| Security hardening | Security | Checklist from dive-v3-security.md | Hardened config | HTTPS enforced, CSP headers set, secrets in vault | Time constraints | Focus on critical items | All components |
| Create demo video | PM | E2E scenarios | 10-minute recording | Narrated walkthrough showing all 4 IdPs, allow/deny cases, KAS | Screen recording issues | Use Loom or QuickTime | E2E tests passing |
| Write pilot report | PM + ICAM Lead | All deliverables | 15-page report | Executive summary, architecture, test results, lessons learned, next steps | Incomplete results | Start outline in Week 3 | All tests complete |

**Week 4 Deliverables:**
- ✅ KAS integrated with key-gated access
- ✅ 6+ E2E demo scenarios passing
- ✅ Performance validated
- ✅ Demo video recorded
- ✅ Pilot report published

---

### Critical Path
```
Week 1: Keycloak + U.S. IdP → Next.js UI → MongoDB
    ↓
Week 2: OPA → PEP/PDP integration → Core policies → Decision UI
    ↓
Week 3: FRA/CAN/Industry IdPs → Claim enrichment → Negative tests
    ↓
Week 4: KAS (stretch) → E2E testing → Demo → Report
```

**Nice-to-Have Track (if ahead):**
- KAS productionization (Week 4)
- Additional IdPs beyond 4
- Audit dashboard for decision logs
- Policy versioning/rollback

---

## 2. Target Architecture

### Component Overview
```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Zero Trust                        │
│                   (Security Front Door)                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  IdP Ecosystem               │  IdP Federation via Keycloak     │
├──────────────────────────────┼──────────────────────────────────┤
│  ┌────────────────────────┐ │  ┌────────────────────────────┐  │
│  │  U.S. IdP (OIDC)       │─┼─▶│  Keycloak Broker           │  │
│  │  - DoD PKI / CAC       │ │  │  Realm: dive-v3-pilot      │  │
│  └────────────────────────┘ │  │                            │  │
│  ┌────────────────────────┐ │  │  Protocol Mappers:         │  │
│  │  France IdP (SAML)     │─┼─▶│  - uniqueID                │  │
│  │  - FranceConnect       │ │  │  - clearance               │  │
│  └────────────────────────┘ │  │  - countryOfAffiliation    │  │
│  ┌────────────────────────┐ │  │  - acpCOI                  │  │
│  │  Canada IdP (OIDC)     │─┼─▶│                            │  │
│  │  - GCKey / SecureKey   │ │  │  Outputs: Normalized       │  │
│  └────────────────────────┘ │  │  ID Token + Access Token   │  │
│  ┌────────────────────────┐ │  └────────────┬───────────────┘  │
│  │  Industry IdP (OIDC)   │─┼──────────────▶│                  │
│  │  - Azure AD / Okta     │ │               │                  │
│  └────────────────────────┘ │               │                  │
└──────────────────────────────┴───────────────┼──────────────────┘
                                               │ ID Token
                                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Frontend: Next.js 15 + NextAuth.js v5                          │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  Pages:                                                │     │
│  │  - /           Home with IdP selection                 │     │
│  │  - /login      Redirects to Keycloak                   │     │
│  │  - /dashboard  Protected: shows user claims            │     │
│  │  - /resources  Document browser with access decisions  │     │
│  └────────────────────────────────────────────────────────┘     │
│  NextAuth Session: { user, idToken, refreshToken }              │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP + Bearer Token
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend API: Node.js + Express.js                              │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  PEP (Policy Enforcement Point)                        │     │
│  │  Middleware: extractAuthz()                            │     │
│  │  1. Validate JWT (verify signature, check expiry)     │     │
│  │  2. Extract identity: uniqueID, clearance,            │     │
│  │     countryOfAffiliation, acpCOI                       │     │
│  │  3. Fetch resource metadata from MongoDB              │     │
│  │  4. Construct OPA input JSON                          │     │
│  │  5. POST to OPA decision endpoint                     │     │
│  │  6. Enforce: allow/deny response                      │     │
│  │  7. Handle obligations (e.g., call KAS)               │     │
│  └───────────────────────┬────────────────────────────────┘     │
│                          │                                       │
│  Endpoints:              │                                       │
│  - GET  /resources       │  List accessible resources            │
│  - GET  /resources/:id   │  Get resource (after authz)          │
│  - POST /resources/      │  (Admin: seed data)                  │
│    request-key           │  Proxy to KAS if encrypted           │
└──────────────────────────┼───────────────────────────────────────┘
                           │                     │
                           │                     │ Fetch metadata
                           │                     ▼
                           │            ┌────────────────────────┐
                           │            │  MongoDB               │
                           │            │  Collection: resources │
                           │            │  Schema:               │
                           │            │  {                     │
                           │            │    resourceId,         │
                           │            │    classification,     │
                           │            │    releasabilityTo[],  │
                           │            │    COI[],              │
                           │            │    creationDate,       │
                           │            │    encrypted: bool     │
                           │            │  }                     │
                           │            └────────────────────────┘
                           │ OPA decision request
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  PDP (Policy Decision Point): Open Policy Agent (OPA)           │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  Input Schema:                                         │     │
│  │  {                                                     │     │
│  │    "input": {                                          │     │
│  │      "subject": {                                      │     │
│  │        "authenticated": true,                          │     │
│  │        "uniqueID": "user-123",                         │     │
│  │        "clearance": "SECRET",                          │     │
│  │        "countryOfAffiliation": "USA",                  │     │
│  │        "acpCOI": ["NATO-COSMIC", "FVEY"]              │     │
│  │      },                                                │     │
│  │      "action": { "operation": "view" },                │     │
│  │      "resource": {                                     │     │
│  │        "resourceId": "doc-456",                        │     │
│  │        "classification": "CONFIDENTIAL",               │     │
│  │        "releasabilityTo": ["USA", "GBR"],             │     │
│  │        "COI": ["FVEY"],                                │     │
│  │        "creationDate": "2025-10-01T00:00:00Z",        │     │
│  │        "encrypted": false                              │     │
│  │      },                                                │     │
│  │      "context": {                                      │     │
│  │        "currentTime": "2025-10-15T14:30:00Z",         │     │
│  │        "sourceIP": "10.0.1.50",                        │     │
│  │        "deviceCompliant": true                         │     │
│  │      }                                                 │     │
│  │    }                                                   │     │
│  │  }                                                     │     │
│  └────────────────────────────────────────────────────────┘     │
│  Policy: fuel_inventory_abac_policy.rego                        │
│  Rules: clearance_check, releasability_check, coi_check,       │
│         embargo_check, deny_on_missing_attributes               │
│  Decision: { "allow": true/false, "reason": "...",             │
│              "obligations": [...] }                             │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ (Stretch: if encrypted)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  KAS (Key Access Service) - Stretch Goal                        │
│  POST /request-key                                              │
│  Input: { resourceId, subjectAttributes, action }               │
│  1. Fetch resource encryption key from secure store             │
│  2. Re-evaluate ABAC policy (call OPA with same context)        │
│  3. If OPA allows: return wrapped key                           │
│  4. If OPA denies: return 403 with reason                       │
│  Response: { "key": "base64...", "algorithm": "AES-256-GCM" }   │
└─────────────────────────────────────────────────────────────────┘
```

### Token & Claim Flow
```
1. User → IdP: Authentication (username/password, PKI, SAML SSO)
2. IdP → Keycloak: OIDC/SAML response with native claims
3. Keycloak Protocol Mappers: Transform claims to normalized format
   Examples:
   - U.S. IdP: "sub" → "uniqueID", "securityClearance" → "clearance"
   - France IdP (SAML): "<Clearance>" → "clearance", "<Nationality>" → "countryOfAffiliation"
4. Keycloak → Next.js: ID Token + Access Token (JWT)
5. NextAuth: Store session with tokens
6. Next.js → Backend API: HTTP requests with Bearer token
7. PEP Middleware: Extract claims from JWT, fetch resource, build OPA input
8. Backend → OPA: POST /v1/data/dive/authorization/allow
9. OPA: Evaluate Rego policy, return decision
10. Backend → Client: Authorized response or 403 with reason
```

---

## 3. Primary User Flow (Sequence Diagram)

```
┌─────┐        ┌──────────┐      ┌──────────┐      ┌─────────┐      ┌─────────┐      ┌─────┐      ┌─────┐
│User │        │Next.js UI│      │ Keycloak │      │   IdP   │      │Backend  │      │ OPA │      │ KAS │
│     │        │+NextAuth │      │  Broker  │      │(US/FR/..)│     │   PEP   │      │ PDP │      │     │
└──┬──┘        └────┬─────┘      └────┬─────┘      └────┬────┘      └────┬────┘      └──┬──┘      └──┬──┘
   │                │                  │                  │                │               │            │
   │ 1. GET /       │                  │                  │                │               │            │
   ├───────────────>│                  │                  │                │               │            │
   │                │                  │                  │                │               │            │
   │ 2. IdP Picker  │                  │                  │                │               │            │
   │   (US/FRA/CAN) │                  │                  │                │               │            │
   │<───────────────┤                  │                  │                │               │            │
   │                │                  │                  │                │               │            │
   │ 3. Select "USA"│                  │                  │                │               │            │
   ├───────────────>│                  │                  │                │               │            │
   │                │                  │                  │                │               │            │
   │                │ 4. Redirect to   │                  │                │               │            │
   │                │ /api/auth/signin │                  │                │               │            │
   │<───────────────┤                  │                  │                │               │            │
   │                │                  │                  │                │               │            │
   │ 5. Redirect to Keycloak           │                  │                │               │            │
   ├──────────────────────────────────>│                  │                │               │            │
   │                │                  │                  │                │               │            │
   │                │                  │ 6. Redirect to   │                │               │            │
   │                │                  │    U.S. IdP      │                │               │            │
   │<───────────────────────────────────┤                 │                │               │            │
   │                │                  │                  │                │               │            │
   │ 7. Login (CAC/PKI)                │                  │                │               │            │
   ├───────────────────────────────────────────────────────>               │               │            │
   │                │                  │                  │                │               │            │
   │                │                  │ 8. OIDC response │                │               │            │
   │                │                  │ {sub, clearance, │                │               │            │
   │                │                  │  nationality}    │                │               │            │
   │<───────────────────────────────────┼──────────────────┤               │               │            │
   │                │                  │                  │                │               │            │
   │                │                  │ 9. Map claims:   │                │               │            │
   │                │                  │ uniqueID ← sub   │                │               │            │
   │                │                  │ countryOfAffil ← │                │               │            │
   │                │                  │   nationality    │                │               │            │
   │                │                  │ Issue ID Token   │                │               │            │
   │                │                  │                  │                │               │            │
   │                │ 10. Redirect with│                  │                │               │            │
   │                │     code         │                  │                │               │            │
   │<───────────────────────────────────┤                 │                │               │            │
   │                │                  │                  │                │               │            │
   │                │ 11. Exchange code│                  │                │               │            │
   │                │     for tokens   │                  │                │               │            │
   │                ├─────────────────>│                  │                │               │            │
   │                │                  │                  │                │               │            │
   │                │ 12. ID Token +   │                  │                │               │            │
   │                │     Access Token │                  │                │               │            │
   │                │<─────────────────┤                  │                │               │            │
   │                │                  │                  │                │               │            │
   │                │ 13. Set session  │                  │                │               │            │
   │                │ (NextAuth)       │                  │                │               │            │
   │                │                  │                  │                │               │            │
   │ 14. Dashboard  │                  │                  │                │               │            │
   │   (shows claims)│                 │                  │                │               │            │
   │<───────────────┤                  │                  │                │               │            │
   │                │                  │                  │                │               │            │
   │ 15. Browse docs│                  │                  │                │               │            │
   │ GET /resources │                  │                  │                │               │            │
   ├───────────────>│                  │                  │                │               │            │
   │                │                  │                  │                │               │            │
   │                │ 16. GET /api/resources             │                │               │            │
   │                │    Authorization: Bearer <token>   │                │               │            │
   │                ├────────────────────────────────────>│                │               │            │
   │                │                  │                  │                │               │            │
   │                │                  │                  │ 17. List       │               │            │
   │                │                  │                  │ accessible     │               │            │
   │                │                  │                  │ (no authz yet) │               │            │
   │                │                  │                  │                │               │            │
   │                │                  │                  │ 18. [{...}]    │               │            │
   │                │<────────────────────────────────────┤                │               │            │
   │                │                  │                  │                │               │            │
   │ 19. Resource   │                  │                  │                │               │            │
   │     list       │                  │                  │                │               │            │
   │<───────────────┤                  │                  │                │               │            │
   │                │                  │                  │                │               │            │
   │ 20. Click      │                  │                  │                │               │            │
   │ "View Doc-456" │                  │                  │                │               │            │
   ├───────────────>│                  │                  │                │               │            │
   │                │                  │                  │                │               │            │
   │                │ 21. GET /api/resources/doc-456     │                │               │            │
   │                │    Authorization: Bearer <token>   │                │               │            │
   │                ├────────────────────────────────────>│                │               │            │
   │                │                  │                  │                │               │            │
   │                │                  │                  │ 22. PEP        │               │            │
   │                │                  │                  │ Middleware:    │               │            │
   │                │                  │                  │ - Verify JWT   │               │            │
   │                │                  │                  │ - Extract      │               │            │
   │                │                  │                  │   uniqueID:    │               │            │
   │                │                  │                  │   user-123     │               │            │
   │                │                  │                  │   clearance:   │               │            │
   │                │                  │                  │   SECRET       │               │            │
   │                │                  │                  │   country: USA │               │            │
   │                │                  │                  │   acpCOI: [..] │               │            │
   │                │                  │                  │                │               │            │
   │                │                  │                  │ 23. Fetch      │               │            │
   │                │                  │                  │ resource       │               │            │
   │                │                  │                  │ metadata       │               │            │
   │                │                  │                  │ (MongoDB)      │               │            │
   │                │                  │                  │ {              │               │            │
   │                │                  │                  │  classification│               │            │
   │                │                  │                  │  :CONFIDENTIAL │               │            │
   │                │                  │                  │  releasability │               │            │
   │                │                  │                  │  To:[USA,GBR]  │               │            │
   │                │                  │                  │  COI:[FVEY]    │               │            │
   │                │                  │                  │ }              │               │            │
   │                │                  │                  │                │               │            │
   │                │                  │                  │ 24. Build OPA  │               │            │
   │                │                  │                  │ input JSON     │               │            │
   │                │                  │                  │                │               │            │
   │                │                  │                  │ 25. POST       │               │            │
   │                │                  │                  │ /v1/data/dive/ │               │            │
   │                │                  │                  │ authorization/ │               │            │
   │                │                  │                  │ allow          │               │            │
   │                │                  │                  ├───────────────>│               │            │
   │                │                  │                  │                │               │            │
   │                │                  │                  │                │ 26. Evaluate │            │
   │                │                  │                  │                │ Rego policy: │            │
   │                │                  │                  │                │ - clearance  │            │
   │                │                  │                  │                │   ≥ classif  │            │
   │                │                  │                  │                │   ✓ (SECRET  │            │
   │                │                  │                  │                │    ≥ CONFID) │            │
   │                │                  │                  │                │ - country ∈  │            │
   │                │                  │                  │                │   releaseTo  │            │
   │                │                  │                  │                │   ✓ (USA in  │            │
   │                │                  │                  │                │    [USA,GBR])│            │
   │                │                  │                  │                │ - COI ∩      │            │
   │                │                  │                  │                │   resource   │            │
   │                │                  │                  │                │   ✓ (FVEY)   │            │
   │                │                  │                  │                │ - embargo    │            │
   │                │                  │                  │                │   date passed│            │
   │                │                  │                  │                │   ✓          │            │
   │                │                  │                  │                │              │            │
   │                │                  │                  │                │ 27. Decision │            │
   │                │                  │                  │                │ {            │            │
   │                │                  │                  │                │  allow: true │            │
   │                │                  │                  │                │  reason: "OK"│            │
   │                │                  │                  │                │  obligations:│            │
   │                │                  │                  │                │   []         │            │
   │                │                  │                  │                │ }            │            │
   │                │                  │                  │<───────────────┤              │            │
   │                │                  │                  │                │              │            │
   │                │                  │                  │ 28. Log        │              │            │
   │                │                  │                  │ decision       │              │            │
   │                │                  │                  │                │              │            │
   │                │                  │                  │ 29. Return     │              │            │
   │                │                  │                  │ resource data  │              │            │
   │                │<────────────────────────────────────┤                │              │            │
   │                │                  │                  │                │              │            │
   │ 30. Display    │                  │                  │                │              │            │
   │ resource with  │                  │                  │                │              │            │
   │ "Access Granted"│                 │                  │                │              │            │
   │<───────────────┤                  │                  │                │              │            │
   │                │                  │                  │                │              │            │
   │ ═══════════════════════════════════════════════════════════════════════════════════════════════  │
   │ STRETCH: Encrypted Resource Flow                                                                 │
   │ ═══════════════════════════════════════════════════════════════════════════════════════════════  │
   │                │                  │                  │                │              │            │
   │ 31. Click      │                  │                  │                │              │            │
   │ "View Encrypted│                  │                  │                │              │            │
   │  Doc-789"      │                  │                  │                │              │            │
   ├───────────────>│                  │                  │                │              │            │
   │                │                  │                  │                │              │            │
   │                │ 32. GET /api/resources/doc-789     │                │              │            │
   │                ├────────────────────────────────────>│                │              │            │
   │                │                  │                  │                │              │            │
   │                │                  │                  │ [Steps 22-27   │              │            │
   │                │                  │                  │  repeated...]  │              │            │
   │                │                  │                  │                │              │            │
   │                │                  │                  │                │ 33. Decision │            │
   │                │                  │                  │                │ {            │            │
   │                │                  │                  │                │  allow: true │            │
   │                │                  │                  │                │  obligations:│            │
   │                │                  │                  │                │   [{         │            │
   │                │                  │                  │                │    type:     │            │
   │                │                  │                  │                │    "kas_key" │            │
   │                │                  │                  │                │   }]         │            │
   │                │                  │                  │                │ }            │            │
   │                │                  │                  │<───────────────┤              │            │
   │                │                  │                  │                │              │            │
   │                │                  │                  │ 34. POST       │              │            │
   │                │                  │                  │ /kas/request-  │              │            │
   │                │                  │                  │ key            │              │            │
   │                │                  │                  │ {resourceId,   │              │            │
   │                │                  │                  │  subject: {...}│              │            │
   │                │                  │                  │  action: view} │              │            │
   │                │                  │                  ├────────────────┼──────────────┼───────────>│
   │                │                  │                  │                │              │            │
   │                │                  │                  │                │              │ 35. KAS    │
   │                │                  │                  │                │              │ re-checks  │
   │                │                  │                  │                │              │ policy     │
   │                │                  │                  │                │              │ (calls OPA)│
   │                │                  │                  │                │              │<───────────┤
   │                │                  │                  │                │              │            │
   │                │                  │                  │                │              │ 36. If     │
   │                │                  │                  │                │              │ allow:     │
   │                │                  │                  │                │              │ Return key │
   │                │                  │                  │                │              │            │
   │                │                  │                  │                │              │ 37. {      │
   │                │                  │                  │                │              │  key:      │
   │                │                  │                  │                │              │  "base64.."│
   │                │                  │                  │                │              │  algorithm:│
   │                │                  │                  │                │              │  "AES-256" │
   │                │                  │                  │                │              │ }          │
   │                │                  │                  │<───────────────┼──────────────┼────────────┤
   │                │                  │                  │                │              │            │
   │                │                  │                  │ 38. Decrypt    │              │            │
   │                │                  │                  │ resource with  │              │            │
   │                │                  │                  │ key            │              │            │
   │                │                  │                  │                │              │            │
   │                │                  │                  │ 39. Return     │              │            │
   │                │                  │                  │ plaintext      │              │            │
   │                │<────────────────────────────────────┤                │              │            │
   │                │                  │                  │                │              │            │
   │ 40. Display    │                  │                  │                │              │            │
   │ decrypted      │                  │                  │                │              │            │
   │ content        │                  │                  │                │              │            │
   │<───────────────┤                  │                  │                │              │            │
   │                │                  │                  │                │              │            │
```

---

## 4. Attribute Mapping Tables

[Full content of all 6 attribute mapping tables from the original response, including Tables 4.1-4.6]

## 5. Example Artifacts

[Full content of sample tokens and OPA inputs from original response]

## 6. Rego Policy Sketches (ACP-240 Style)

[Full Rego policy code and tests from original response]

## 7. Keycloak Configuration Steps

[Full Keycloak config with bash commands and Terraform from original response]

## 8. PEP Integration Plan

[Full PEP middleware implementation from original response]

## 9. KAS Touchpoints (Stretch Goal)

[Full KAS implementation from original response]

## 10. Test Plan & Data Matrix

[Full test matrices and scripts from original response]

## 11. Security & Compliance Notes

[Full security section from original response]

## 12. Cutover & Next Steps

[Full cutover section from original response]

---

## Quick Start Commands

```bash
# 1. Clone and setup
git clone <repo-url> dive-v3
cd dive-v3

# 2. Start entire stack
./scripts/dev-start.sh

# 3. Run policy tests
opa test policies/fuel_inventory_abac_policy.rego policies/tests/comprehensive_test_suite.rego

# 4. Access application
open http://localhost:3000

# 5. View logs
docker-compose logs -f backend
docker-compose logs -f opa

# 6. Run E2E tests
./tests/federation/idp-smoke-tests.sh

# 7. Load test
cd tests/performance
artillery run artillery-config.yml
```

---

**END OF IMPLEMENTATION PLAN**

**Document Version:** 1.0  
**Date:** October 10, 2025  
**Status:** Ready for Week 1 Kickoff  
**Next Review:** October 16, 2025 (Week 1 Retrospective)

