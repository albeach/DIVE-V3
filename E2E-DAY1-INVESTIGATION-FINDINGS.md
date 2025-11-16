# E2E Tests - Day 1 Investigation Findings

**Date:** November 16, 2025  
**Project:** DIVE V3 Coalition ICAM Pilot  
**Status:** ✅ INVESTIGATION COMPLETE

---

## 🎯 Executive Summary

**Outcome:** All critical infrastructure verified. Ready to proceed with Phase 1 (Infrastructure Setup).

**Key Findings:**
- ✅ All expected routes exist (28 pages)
- ✅ All expected API endpoints exist (50+ endpoints)
- ✅ Test users configured (44 users across 11 realms)
- ✅ Test resources seeded automatically
- ✅ **CRITICAL:** `/policies/lab` route EXISTS → Refactor test, don't delete

---

## 1️⃣ Next.js App Routes Audit

**Total Routes Found:** 28 page.tsx files

### ✅ Core Routes (Referenced by E2E Tests)
| Route | E2E Test File | Status |
|-------|---------------|--------|
| `/` (Home) | Multiple tests | ✅ EXISTS |
| `/login` | Multiple tests | ✅ EXISTS |
| `/login/[idpAlias]` | mfa-*.spec.ts, nato-expansion.spec.ts | ✅ EXISTS |
| `/dashboard` | Multiple tests | ✅ EXISTS |
| `/resources` | external-idp-federation-flow.spec.ts | ✅ EXISTS |
| `/resources/[id]` | classification-equivalency.spec.ts | ✅ EXISTS |
| `/resources/[id]/ztdf` | (Not tested yet) | ✅ EXISTS |
| `/policies/lab` | policies-lab.spec.ts | ✅ **EXISTS** |
| `/policies` | policies-lab.spec.ts | ✅ EXISTS |
| `/policies/[id]` | (Not tested yet) | ✅ EXISTS |
| `/integration/federation-vs-object` | integration-federation-vs-object.spec.ts | ✅ EXISTS |

### ✅ Admin Routes (Referenced by E2E Tests)
| Route | E2E Test File | Status |
|-------|---------------|--------|
| `/admin/idp` | idp-management-revamp.spec.ts | ✅ EXISTS |
| `/admin/idp/new` | idp-management-revamp.spec.ts | ✅ EXISTS |
| `/admin/analytics` | idp-management-revamp.spec.ts | ✅ EXISTS |
| `/admin/dashboard` | (Not tested yet) | ✅ EXISTS |
| `/admin/logs` | idp-management-revamp.spec.ts | ✅ EXISTS |
| `/admin/approvals` | (Not tested yet) | ✅ EXISTS |
| `/admin/sp-registry` | (Not tested yet) | ✅ EXISTS |
| `/admin/sp-registry/new` | (Not tested yet) | ✅ EXISTS |
| `/admin/sp-registry/[spId]` | (Not tested yet) | ✅ EXISTS |
| `/admin/debug` | (Not tested yet) | ✅ EXISTS |
| `/admin/certificates` | (Not tested yet) | ✅ EXISTS |

### ✅ Compliance Routes (Not Yet Tested)
| Route | Status |
|-------|--------|
| `/compliance` | ✅ EXISTS |
| `/compliance/certificates` | ✅ EXISTS |
| `/compliance/classifications` | ✅ EXISTS |
| `/compliance/coi-keys` | ✅ EXISTS |
| `/compliance/identity-assurance` | ✅ EXISTS |
| `/compliance/multi-kas` | ✅ EXISTS |

### ✅ Other Routes
| Route | Status |
|-------|--------|
| `/upload` | ✅ EXISTS (classification-equivalency.spec.ts may use) |

---

## 2️⃣ Backend API Endpoints Audit

**Total Endpoints Found:** 50+ REST endpoints

### ✅ Resource API (Primary E2E Test Target)
```typescript
GET    /api/resources              // List resources (authenticated)
GET    /api/resources/:id          // Get resource with authz check
GET    /api/resources/:id/ztdf     // ZTDF details
GET    /api/resources/:id/kas-flow // KAS flow details
POST   /api/resources/request-key  // Request KAS key
```

### ✅ Policy API
```typescript
GET    /api/policies              // List policies
GET    /api/policies/:id          // Get policy by ID
```

### ✅ Policies Lab API (CRITICAL - TEST EXISTS!)
```typescript
POST   /api/policies-lab          // Upload policy (Rego/XACML)
GET    /api/policies-lab          // List lab policies
POST   /api/policies-lab/evaluate // Evaluate policy
GET    /api/policies-lab/:id      // Get lab policy
DELETE /api/policies-lab/:id      // Delete lab policy
```

**Decision:** `policies-lab.spec.ts` should be **REFACTORED**, not deleted.

### ✅ Upload API
```typescript
POST   /api/upload                // Upload resource
```

### ✅ Compliance API
```typescript
GET    /api/compliance/status
GET    /api/compliance/multi-kas
GET    /api/compliance/coi-keys
GET    /api/compliance/classifications
GET    /api/compliance/certificates
GET    /api/compliance/nist-assurance
```

### ✅ Admin API (IdP Management)
```typescript
GET    /api/admin/idps                          // List IdPs
GET    /api/admin/idps/:alias                   // Get IdP
POST   /api/admin/idps                          // Create IdP
PUT    /api/admin/idps/:alias                   // Update IdP
DELETE /api/admin/idps/:alias                   // Delete IdP
POST   /api/admin/idps/validate/oidc-discovery
POST   /api/admin/idps/validate/saml-metadata
POST   /api/admin/idps/parse/oidc-metadata
POST   /api/admin/idps/parse/saml-metadata

GET    /api/admin/idps/:alias/mfa-config        // Get MFA config
PUT    /api/admin/idps/:alias/mfa-config        // Update MFA config
GET    /api/admin/idps/:alias/sessions          // Get sessions
DELETE /api/admin/idps/:alias/sessions/:sessionId
```

### ✅ Admin API (Logs & Analytics)
```typescript
GET    /api/admin/logs
GET    /api/admin/logs/violations
GET    /api/admin/logs/stats
GET    /api/admin/logs/export
```

### ✅ Admin API (Approvals)
```typescript
GET    /api/admin/approvals/pending
POST   /api/admin/approvals/:alias/approve
POST   /api/admin/approvals/:alias/reject
```

### ✅ Health & Public APIs
```typescript
GET    /api/health
GET    /api/health/detailed
GET    /api/health/ready
GET    /api/health/live
GET    /api/health/brute-force-config
GET    /api/public/idps/public                  // Public IdP list
```

### ✅ IdP Validation API
```typescript
POST   /api/idp-validation/validate/oidc-discovery
POST   /api/idp-validation/validate/saml-metadata
POST   /api/idp-validation/parse/oidc-metadata
POST   /api/idp-validation/parse/saml-metadata
```

---

## 3️⃣ Test Users Audit

**Total Test Users:** 44 users (4 per realm × 11 realms)

### User Naming Pattern
```
testuser-{country}-{clearance}
```

**Example Usernames:**
- `testuser-usa-unclass`
- `testuser-usa-confidential`
- `testuser-usa-secret`
- `testuser-usa-ts` (Top Secret)
- `testuser-fra-secret`
- `testuser-deu-secret`
- `testuser-gbr-secret`
- `testuser-can-secret`
- `testuser-esp-secret`
- `testuser-ita-secret`
- `testuser-pol-secret`
- `testuser-nld-secret`
- `testuser-industry-secret`
- `testuser-broker-secret`

### Clearance Levels per Realm
Each realm has **4 test users** with different clearances:
1. **UNCLASSIFIED** - AAL1 (password only, no MFA)
2. **CONFIDENTIAL** - AAL2 (password + OTP)
3. **SECRET** - AAL2 (password + OTP)
4. **TOP_SECRET** - AAL3 (password + WebAuthn)

### Country Codes & Email Domains
| Realm | Country Code | Email Domain | Duty Org |
|-------|--------------|--------------|----------|
| USA | USA | example.mil | US_ARMY |
| France | FRA | example.fr | FRENCH_AIR_FORCE |
| Canada | CAN | example.ca | CANADIAN_ARMED_FORCES |
| Germany | DEU | example.de | BUNDESWEHR |
| UK | GBR | example.uk | UK_MOD |
| Italy | ITA | example.it | ITALIAN_ARMED_FORCES |
| Spain | ESP | example.es | SPANISH_ARMED_FORCES |
| Poland | POL | example.pl | POLISH_ARMED_FORCES |
| Netherlands | NLD | example.nl | DUTCH_ARMED_FORCES |
| Industry | USA | contractor.com | DEFENSE_CONTRACTOR |
| Broker | USA | dive-coalition.mil | COALITION_COMMAND |

### COI Assignments
**USA SECRET/TS:**
- SECRET: `["NATO-COSMIC"]`
- TOP_SECRET: `["NATO-COSMIC", "FVEY", "CAN-US"]`

**France SECRET/TS:**
- SECRET: `["NATO-COSMIC"]`
- TOP_SECRET: `["NATO-COSMIC"]` (NOT in FVEY)

**Canada SECRET/TS:**
- SECRET: `["NATO-COSMIC"]`
- TOP_SECRET: `["NATO-COSMIC", "FVEY", "CAN-US"]`

**UK SECRET/TS:**
- SECRET: `["NATO-COSMIC"]`
- TOP_SECRET: `["NATO-COSMIC", "FVEY"]`

**Germany/Italy/Spain/Poland/Netherlands SECRET/TS:**
- SECRET: `["NATO-COSMIC"]`
- TOP_SECRET: `["NATO-COSMIC"]`

**Industry SECRET/TS:**
- SECRET: `[]` (minimal COI)
- TOP_SECRET: `["FVEY"]` (limited contractor access)

### Default Password
All users share the same password for testing (defined in `terraform/variables.tf`):
```bash
# Check .env or terraform.tfvars for actual password
# Default: Password123! (or similar)
```

### MFA Configuration
- **UNCLASSIFIED:** No MFA required
- **CONFIDENTIAL/SECRET:** OTP (TOTP) required on first login
- **TOP_SECRET:** WebAuthn (Passkey) required on first login

**Critical Note:** E2E tests that involve CONFIDENTIAL+ users must handle OTP/WebAuthn flows.

---

## 4️⃣ Test Resources Audit

**Location:** `backend/src/__tests__/helpers/seed-test-data.ts`

**Seeding:** Automatic via `globalSetup.ts` for E2E tests

### Test Resources Available
| Resource ID | Classification | Releasability | COI |
|-------------|----------------|---------------|-----|
| `test-unclassified-doc` | UNCLASSIFIED | USA, GBR, CAN, FRA, DEU | - |
| `test-secret-doc` | SECRET | USA, GBR, CAN | FVEY |
| `test-secret-usa` | SECRET | USA | US-ONLY |
| `test-top-secret-restricted` | TOP_SECRET | USA | US-ONLY |
| `test-secret-nato` | SECRET | All NATO (9 countries) | NATO |
| `test-secret-fvey` | SECRET | USA, GBR, CAN, AUS, NZL | FVEY |
| `test-secret-fvey-only` | SECRET | USA, GBR, CAN, AUS, NZL | FVEY |
| `test-secret-usa-gbr-only` | SECRET | USA, GBR | GBR-US |

### COI Keys Seeded
| COI ID | Member Countries | Status |
|--------|------------------|--------|
| US-ONLY | USA | Active |
| CAN-US | CAN, USA | Active |
| GBR-US | GBR, USA | Active |
| FVEY | USA, GBR, CAN, AUS, NZL | Active |
| NATO | 32 NATO members | Active |
| NATO-COSMIC | 32 NATO members | Active |
| AUKUS | AUS, GBR, USA | Active |

---

## 5️⃣ Critical Decisions

### ✅ Decision 1: `/policies/lab` Route
**Question:** Does the Policies Lab feature exist?  
**Answer:** ✅ **YES** - Route and API endpoints exist  
**Impact:** 10 tests in `policies-lab.spec.ts`  
**Action:** **REFACTOR** (not delete) - estimated 8-12 hours

---

### ⚠️ Decision 2: MFA Architecture
**Question:** Is MFA handled by Keycloak or app?  
**Preliminary Finding:** **MIXED**
- Keycloak manages OTP/WebAuthn credentials
- Users have `required_actions = ["CONFIGURE_TOTP"]` or `["webauthn-register"]`
- E2E tests likely need to interact with **Keycloak's MFA UI**, not custom app UI

**Impact:** 17 tests in `mfa-conditional.spec.ts` + `mfa-complete-flow.spec.ts`  
**Action:** 
- HIGH priority: Verify Keycloak MFA flow in dev environment
- Update tests to use Keycloak MFA selectors (not custom login page selectors)
- Estimated: 16-20 hours (combined)

**Next Steps:**
1. Manually test MFA flow for `testuser-usa-confidential` in browser
2. Document Keycloak MFA UI selectors
3. Update auth helper to handle OTP/WebAuthn

---

### ✅ Decision 3: Test User Credentials
**Question:** Are test users seeded automatically?  
**Answer:** ✅ **YES** - Terraform creates 44 users across 11 realms  
**Impact:** All tests  
**Action:** Create centralized `test-users.ts` fixture mapping usernames to credentials

---

### ✅ Decision 4: API Endpoints
**Question:** Which backend APIs are implemented?  
**Answer:** ✅ **ALL EXPECTED ENDPOINTS EXIST**
- Resources API: ✅
- Policies API: ✅
- Policies Lab API: ✅
- Upload API: ✅
- Admin API: ✅
- Compliance API: ✅

**Impact:** ~30 tests that call APIs  
**Action:** No blockers - proceed with refactoring

---

## 6️⃣ Test File Decision Matrix

| # | Test File | Tests | Routes Exist? | APIs Exist? | Users Exist? | Decision | Effort | Priority |
|---|-----------|-------|---------------|-------------|--------------|----------|--------|----------|
| 1 | `identity-drawer.spec.ts` | 1 | ✅ | N/A | ✅ | ✅ **Working** | 1h | LOW |
| 2 | `integration-federation-vs-object.spec.ts` | 10 | ✅ | ✅ | ✅ | ✅ **Working** | 2h | LOW |
| 3 | `mfa-conditional.spec.ts` | 6 | ✅ | ✅ | ✅ | 🔧 **REWRITE** | 8-12h | HIGH |
| 4 | `nato-expansion.spec.ts` | 10+ | ✅ | ✅ | ✅ | 🔧 **REFACTOR** | 6-10h | MEDIUM |
| 5 | `policies-lab.spec.ts` | 10 | ✅ | ✅ | ✅ | 🔧 **REFACTOR** | 8-12h | MEDIUM |
| 6 | `external-idp-federation-flow.spec.ts` | 8+ | ✅ | ✅ | ✅ | 🔧 **REFACTOR** | 6-10h | MEDIUM |
| 7 | `idp-management-revamp.spec.ts` | 10 | ✅ | ✅ | ✅ | 🔧 **REFACTOR** | 4-8h | MEDIUM |
| 8 | `classification-equivalency.spec.ts` | 4+ | ✅ | ✅ | ✅ | 🔧 **REWRITE** | 8-12h | MEDIUM |
| 9 | `mfa-complete-flow.spec.ts` | 11 | ✅ | ✅ | ✅ | 🔧 **REFACTOR** | 8-12h | HIGH |

**Legend:**
- ✅ Working - Minor updates only
- 🔧 REFACTOR - Update patterns, keep test logic
- 🔧 REWRITE - Start fresh with new architecture

**Total Estimated Effort:** 49-78 hours (refactoring) + 24-32 hours (infrastructure) = **73-110 hours**

---

## 7️⃣ Common Issues Confirmed

### 1. Hardcoded BASE_URL ✅ Confirmed
**Finding:** All 9 test files use hardcoded URLs  
**Fix:** Global find-replace to use relative paths  
**Effort:** 1 hour

### 2. Auth Architecture Mismatch ✅ Confirmed
**Finding:** Tests assume custom login pages, app uses NextAuth  
**Fix:** Create `helpers/auth.ts` with NextAuth-aware login  
**Effort:** 4-6 hours

### 3. Fragile Selectors ✅ Confirmed
**Finding:** Tests use text selectors and CSS classes  
**Fix:** Modernize to `getByRole()`, add data-testids to components  
**Effort:** 8-12 hours (ongoing)

### 4. No Page Object Model ✅ Confirmed
**Finding:** Tests directly manipulate page objects  
**Fix:** Create LoginPage, ResourcesPage, DashboardPage, AdminPage  
**Effort:** 12-16 hours

### 5. No Test Data Management ✅ Confirmed
**Finding:** Hardcoded user credentials in each file  
**Fix:** Create `fixtures/test-users.ts` and `fixtures/test-resources.ts`  
**Effort:** 4 hours

### 6. Insufficient Error Handling ✅ Confirmed
**Finding:** Tests fail without clear messages  
**Fix:** Add waits, error context, automatic screenshots  
**Effort:** Ongoing (2-4 hours)

---

## 8️⃣ Next Steps: Day 2 - Infrastructure Setup

### ✅ Ready to Proceed
All critical infrastructure verified. No blockers found.

### Day 2 Tasks (from E2E-TESTS-GAP-ANALYSIS.md)
1. ✅ Create `fixtures/test-users.ts` (centralized user data)
2. ✅ Create `fixtures/test-resources.ts` (sample documents)
3. ✅ Create `fixtures/test-config.ts` (environment config)
4. ✅ Create `helpers/auth.ts` (loginAs, logout)
5. ✅ Create `pages/LoginPage.ts` (Page Object Model)

**Estimated Time:** 8-12 hours

---

## 9️⃣ Outstanding Questions (for Manual Verification)

### MFA Flow Verification (HIGH PRIORITY)
**Action Required:**
1. Manually login as `testuser-usa-confidential` in browser
2. Document Keycloak OTP setup screen selectors
3. Document OTP input field selectors
4. Test if app redirects to Keycloak or uses custom UI
5. Update auth helper with findings

**Time:** 30-60 minutes manual testing + 2-4 hours implementation

---

## 🎯 Summary & Recommendations

### ✅ Green Lights
1. All routes exist - no missing pages
2. All API endpoints exist - no missing backend features
3. Test users configured - 44 users ready to use
4. Test resources seeded - E2E data available
5. `/policies/lab` exists - refactor test, don't delete

### ⚠️ Yellow Lights
1. MFA architecture needs manual verification
2. Keycloak UI selectors need documentation
3. Test user passwords need to be documented in fixtures

### 🚀 Recommendation
**PROCEED TO DAY 2: Infrastructure Setup**

Create the foundation (fixtures, helpers, page objects) while manually verifying the MFA flow. This can be done in parallel.

---

**Investigation Complete:** November 16, 2025  
**Next Phase:** Day 2 - Infrastructure Setup  
**Estimated Timeline:** 2-3 weeks for complete modernization

