# Phase 6: Final Integration, Testing & Deployment - Implementation Prompt

You are a senior Full Stack Developer and QA Engineer tasked with implementing **Phase 6: Final Integration, Testing & Deployment** for the DIVE-V3 Coalition ICAM system.

## Project Context

DIVE-V3 is a **production-ready, coalition-friendly ICAM web application** supporting 10 NATO nations (USA, Spain, France, UK, Germany, Italy, Netherlands, Poland, Canada, Industry) with federated identity management, policy-driven ABAC authorization, and data-centric security.

**Current Status**: 
- **Phase 1 (Federation & MFA Hardening)**: ✅ COMPLETE - 5/5 tasks, session redirect bug fixed, conditional MFA working
- **Phase 2 (Attribute Normalization & Mapper Consolidation)**: ✅ COMPLETE - 4/4 tasks, user attributes fix, OTP enrollment fix
- **Phase 3 (Policy-Based Authorization)**: ✅ COMPLETE - 5/5 tasks, 175 OPA tests (100%), decision logging, CI/CD workflows
- **Phase 4 (Data-Centric Security)**: ✅ COMPLETE - 4/4 core tasks, 29 crypto tests (100%), ZTDF cryptographic binding, KAS logging
- **Phase 5 (Production Hardening)**: ⚠️ **95% COMPLETE** - 7 MFA bugs fixed, admin-dive login working, **MFA enforcement not working**

---

## Critical Findings from Phase 5

### ✅ **BUGS FIXED (7 Total)**

**Bug #1: Redis Session Management** ✅
- **Problem**: `/api/auth/otp/setup` didn't store secret in Redis
- **Fix**: Added `storePendingOTPSecret()` call with 10-minute TTL
- **File**: `backend/src/controllers/otp.controller.ts` (line 120)
- **Status**: FIXED, verified working

**Bug #2: Circular Dependency** ✅
- **Problem**: OTP setup tried Direct Grant password check (failed for users needing MFA)
- **Fix**: Skip Direct Grant, verify user exists via Admin API
- **File**: `backend/src/controllers/otp.controller.ts` (lines 53-123)
- **Status**: FIXED

**Bug #3: HTTP Status Code Detection** ✅
- **Problem**: Backend only checked 401, Keycloak returns 400 for "Account not set up"
- **Fix**: Check both 400 AND 401
- **File**: `backend/src/controllers/custom-login.controller.ts` (line 333)
- **Status**: FIXED

**Bug #4: Error Message Detection** ✅
- **Problem**: "Account is not fully set up" not recognized as MFA trigger
- **Fix**: Added explicit detection
- **File**: `backend/src/controllers/custom-login.controller.ts` (lines 385-403)
- **Status**: FIXED

**Bug #5: Performance Headers** ✅
- **Problem**: Headers set after response sent (`ERR_HTTP_HEADERS_SENT`)
- **Fix**: Override `res.end()` to set headers before response
- **File**: `backend/src/config/performance-config.ts` (lines 169-193)
- **Status**: FIXED

**Bug #6: Realm Name vs IdP Alias** ✅
- **Problem**: Finalize-enrollment passed `idpAlias` instead of `realmName`
- **Fix**: Pass `realmName` to `createOTPCredential()`
- **File**: `backend/src/controllers/otp-enrollment.controller.ts` (line 181)
- **Status**: FIXED

**Bug #7: Keycloak 26 First/Last Name Requirement** ✅  
- **Problem**: Keycloak 26 requires `first_name` and `last_name` or returns "Account is not fully set up"
- **Reference**: https://github.com/keycloak/keycloak/issues/36108
- **Fix**: Auto-populated names for all 47 users from usernames
- **Script**: `scripts/fix-keycloak-26-user-names.sh`
- **Status**: FIXED, all users have names

### ⚠️ **KNOWN LIMITATION**

**MFA Enforcement Not Working**:
- **Problem**: Custom SPI (`direct-grant-otp-setup`) is not being invoked during Direct Grant flow
- **Impact**: TOP_SECRET users can login without MFA (security issue)
- **Current Behavior**: admin-dive logs in successfully without OTP prompt
- **Expected Behavior**: TOP_SECRET users should be BLOCKED and required to setup OTP first
- **Root Cause**: Custom SPI not executing despite flow being bound correctly
- **Evidence**: No "[DIVE SPI]" logs appear in Keycloak when admin-dive authenticates
- **Custom SPI File**: `keycloak/extensions/src/main/java/com/dive/keycloak/authenticator/DirectGrantOTPAuthenticator.java`
- **Fix Applied**: Modified SPI to check clearance and block classified users without OTP (lines 97-130)
- **JAR Status**: Rebuilt with fix, but SPI still not invoked
- **Terraform Config**: Conditional flow exists with proper config (attribute_name: "clearance", regex: "^(CONFIDENTIAL|SECRET|TOP_SECRET)$")

**Why This Matters**:
- ACP-240 requires AAL2 (MFA) for classified clearances
- Current state allows AAL1 (password-only) for TOP_SECRET → **Compliance violation**
- Must be fixed before production deployment

---

## Tech Stack (Verified Current Versions)

- **Keycloak**: 26.4.2
- **PostgreSQL**: 15.14 (Databases: `keycloak_db`, `dive_v3_app`)
- **MongoDB**: 7.0.25 (Collections: `resources`, `decisions`, `key_releases`)
- **OPA**: 1.9.0
- **Node.js**: 20.19.5
- **Next.js**: 15.5.6 (App Router)
- **Backend**: Express.js 4.18.2 + TypeScript 5.3.3
- **Terraform**: 1.13.4
- **Terraform Keycloak Provider**: 5.5.0
- **Docker Compose**: 3.8
- **Redis**: 7.4.6

---

## Current System State (Phase 5 Complete)

### Services Running (Docker)

| Service | Container | Port | Status | Notes |
|---------|-----------|------|--------|-------|
| Keycloak | dive-v3-keycloak | 8081 | ✅ Healthy | v26.4.2, 15 realms, 47 users with names |
| PostgreSQL | dive-v3-postgres | 5433 | ✅ Healthy | 2 DBs: keycloak_db, dive_v3_app |
| MongoDB | dive-v3-mongo | 27017 | ✅ Healthy | 3 collections, 7,002 resources |
| OPA | dive-v3-opa | 8181 | ⚠️ Unhealthy | Functional, 175/175 tests passing |
| Backend | dive-v3-backend | 4000 | ✅ Healthy | Phase 5 fixes applied |
| Frontend | dive-v3-frontend | 3000 | ✅ Running | Cache permission issue resolved |
| KAS | dive-v3-kas | 8080 | ✅ Running | Policy re-evaluation working |
| Redis | dive-v3-redis | 6379 | ✅ Healthy | OTP secrets persisting correctly |

**Critical Services**: 8/9 healthy ✅

### Test Results Summary (All Phases)

```
Phase 1 (Federation & MFA):
  - 6/6 E2E MFA tests passing
  - Session redirect fix preserved

Phase 2 (Attribute Normalization):
  - Clearance mapper: 81/81 tests (100%)
  - User attributes: All 47 users verified
  - Mapper consolidation: 10/10 IdPs using shared module

Phase 3 (Policy-Based Authorization):
  - OPA comprehensive tests: 175/175 (100%)
  - Decision logging: 15/15 tests (100%)
  - PEP/PDP integration: 30 scenarios
  - CI/CD workflows: 5 workflows operational

Phase 4 (Data-Centric Security):
  - Crypto service: 29/29 tests (100%)
  - ZTDF cryptographic binding: RSA-SHA256 signing
  - KMS service: KEK/DEK management
  - KAS logging: MongoDB key_releases collection

Phase 5 (Production Hardening):
  - MFA enrollment bugs: 7/7 fixed
  - MFA integration tests: 19/19 (100%)
  - E2E test scenarios: 50+ documented
  - Monitoring config: Prometheus + Grafana ready
  - Security scanning: CI/CD workflow created
  - Production docs: 1,200+ lines written

Overall Test Status:
  ✅ OPA: 175/175 (100%)
  ✅ Backend: 1,240/1,286 (96.4%)
  ✅ Frontend: 152/183 (83.1%)
  ✅ Crypto: 29/29 (100%)
  ✅ MFA Enrollment: 19/19 (100%)
  ✅ E2E Scenarios: 50+ created
  ✅ Total: 1,615+ tests passing
```

### Verified Working (Browser Tested)

**✅ admin-dive Login** (Phase 5 verified):
- User: `admin-dive`
- Password: `Password123!`
- Result: Logs into dashboard successfully
- Clearance: **TOP_SECRET** displayed correctly
- Pseudonym: "Azure Lagoon"
- COI: "NATO-COSMIC +1"
- Screenshot: `admin-dive-top-secret-login-success.png`
- **Issue**: Logged in WITHOUT MFA (should have required OTP)

**✅ bob.contractor Login** (Phase 4 verified):
- User: `bob.contractor`
- Password: `Password123!`
- Result: Logs into dashboard
- Clearance: **UNCLASSIFIED**
- No MFA required (correct for UNCLASSIFIED)

**✅ MFA Setup Modal** (Phase 5 verified):
- alice.general triggers MFA setup modal
- QR code displays correctly
- Can click "Can't scan? Enter manually" to see secret
- TOTP code verification works
- Enrollment completes (backend returns success)
- **Issue**: Next login still prompts for setup (credential not created in Keycloak)

### Known Issues Entering Phase 6

**Issue #1: MFA Enforcement Not Working** (CRITICAL - Security Issue)

**Status**: ❌ **BLOCKING FOR PRODUCTION**

**Problem**: Custom SPI authenticator (`direct-grant-otp-setup`) is NOT being invoked during Direct Grant authentication

**Evidence**:
- No "[DIVE SPI]" logs appear when admin-dive authenticates
- admin-dive (TOP_SECRET) logs in without OTP prompt
- Flow is bound correctly in database
- JAR is loaded (warning shows at Keycloak startup)
- Authenticator appears in `/admin/realms/dive-v3-broker/authentication/authenticator-providers`

**Root Cause**: Unknown - requires debugging

**Possible Causes**:
1. Flow execution order/priority issue
2. Conditional subflow not being entered
3. `conditional-user-attribute` check failing silently
4. Custom SPI authenticator ID mismatch
5. Keycloak 26 breaking change in SPI invocation

**Files Involved**:
- `keycloak/extensions/src/main/java/com/dive/keycloak/authenticator/DirectGrantOTPAuthenticator.java` (Modified Phase 5, lines 97-130)
- `terraform/modules/realm-mfa/direct-grant.tf` (Flow definition)
- `terraform/keycloak-mfa-flows.tf` (Module invocation, line 22: `enable_direct_grant_mfa = true`)

**Impact**: 
- ACP-240 compliance violation (AAL2 required for classified clearances)
- Security risk (TOP_SECRET users bypass MFA)
- Cannot deploy to production until fixed

**Workaround**: Use browser-based flow for MFA enrollment (Keycloak Account page)

**Fix Required**: Debug why Custom SPI authenticator is not being invoked

---

## Project Directory Structure (Phase 5 Complete)

```
/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/
├── backend/
│   ├── src/
│   │   ├── services/
│   │   │   ├── ztdf-crypto.service.ts (Phase 4 - 398 lines, 29/29 tests)
│   │   │   ├── kms.service.ts (Phase 4 - 205 lines)
│   │   │   ├── decision-log.service.ts (Phase 3+4 - extended with KAS logging)
│   │   │   ├── clearance-mapper.service.ts (Phase 2 - 81/81 tests)
│   │   │   ├── otp.service.ts (Phase 5 - 413 lines)
│   │   │   ├── otp-redis.service.ts (Phase 5 - 290 lines, Redis session management)
│   │   │   └── ... (30+ services)
│   │   ├── controllers/
│   │   │   ├── custom-login.controller.ts (Phase 5 - Bugs #3, #4 fixed)
│   │   │   ├── otp.controller.ts (Phase 5 - 560 lines, Bugs #1, #2 fixed)
│   │   │   ├── otp-enrollment.controller.ts (Phase 5 - Bug #6 fixed)
│   │   │   └── ... (20+ controllers)
│   │   ├── config/
│   │   │   ├── performance-config.ts (Phase 5 - NEW, 200+ lines, Bug #5 fix)
│   │   ├── middleware/
│   │   │   ├── authz.middleware.ts (Phase 3 - PEP with decision logging)
│   │   │   └── jwt-validation.middleware.ts
│   │   ├── __tests__/
│   │   │   ├── ztdf-crypto.service.test.ts (Phase 4 - 389 lines, 29 tests)
│   │   │   ├── decision-log.service.test.ts (Phase 3 - 290 lines, 15 tests)
│   │   │   ├── mfa-enrollment-flow.integration.test.ts (Phase 5 - NEW, 530 lines, 19 tests)
│   │   │   ├── e2e/
│   │   │   │   ├── authorization-10-countries.e2e.test.ts (Phase 5 - NEW, 400+ lines)
│   │   │   │   └── resource-access.e2e.test.ts (Phase 5 - NEW, 200+ lines)
│   │   │   └── integration/pep-pdp-authorization.integration.test.ts (Phase 3)
│   │   └── server.ts (Phase 5 - performance middleware applied)
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── login/[idpAlias]/page.tsx (Phase 1+5 - window.location.href fix preserved, MFA modal working)
│   │   │   ├── dashboard/page.tsx
│   │   │   └── resources/[id]/page.tsx (Phase 3 - AccessDenied component)
│   │   └── components/
│   │       └── authz/access-denied.tsx (Phase 3 - production-ready)
├── keycloak/
│   ├── extensions/
│   │   ├── src/main/java/com/dive/keycloak/authenticator/
│   │   │   ├── DirectGrantOTPAuthenticator.java (Phase 5 - MODIFIED, lines 97-130, clearance checking added)
│   │   │   └── DirectGrantOTPAuthenticatorFactory.java
│   │   └── target/
│   │       └── dive-keycloak-extensions.jar (Phase 5 - REBUILT, MD5: 12a480b9b2e1c4f679e5aa394f3dae61)
│   └── certs/ (Self-signed TLS certs)
├── policies/
│   ├── fuel_inventory_abac_policy.rego (Main authorization policy)
│   ├── federation_abac_policy.rego
│   ├── comprehensive_authorization_test.rego (Phase 3 - 1,188 lines, 161 tests)
│   └── ... (175 total tests)
├── terraform/
│   ├── main.tf, broker-realm.tf
│   ├── keycloak-mfa-flows.tf (Phase 1-5 - MFA flow configuration)
│   ├── usa-realm.tf, esp-realm.tf, fra-realm.tf, etc. (10 nation realms)
│   ├── modules/
│   │   ├── realm-mfa/ (Post-Broker MFA flow, Direct Grant with Conditional MFA)
│   │   │   ├── direct-grant.tf (Conditional MFA flow definition)
│   │   │   ├── browser-flow.tf (Classified Access Browser Flow)
│   │   │   └── variables.tf
│   │   └── shared-mappers/ (Phase 2 - DRY mapper consolidation)
│   └── terraform.tfstate
├── monitoring/ (Phase 5 - NEW)
│   ├── prometheus.yml (75 lines, 7 scrape jobs)
│   ├── alerts/
│   │   └── dive-v3-alerts.yml (210 lines, 20+ alerting rules)
│   ├── alertmanager.yml (65 lines)
├── .github/workflows/ (Phase 3+5)
│   ├── terraform-ci.yml
│   ├── backend-tests.yml
│   ├── frontend-tests.yml
│   ├── opa-tests.yml
│   ├── e2e-tests.yml
│   └── security-scan.yml (Phase 5 - NEW, npm audit, Trivy, tfsec, secrets)
├── scripts/
│   ├── fix-keycloak-26-user-names.sh (Phase 5 - NEW, fixes NULL names)
│   ├── clear-frontend-cache.sh (Phase 5 - NEW)
│   └── ... (utility scripts)
├── backups/
│   ├── 20251029-phase4/ (Phase 4 backups)
│   └── 20251029-phase5/ (Phase 5 backups - 4 files)
├── docker-compose.yml (Phase 5 - MODIFIED, removed /app/.next volume)
├── docker-compose.monitoring.yml (Phase 5 - NEW, 138 lines, Prometheus + Grafana stack)
├── PRODUCTION-DEPLOYMENT-GUIDE.md (Phase 5 - NEW, 650+ lines)
├── RUNBOOK.md (Phase 5 - NEW, 550+ lines)
├── AUTHENTICATION-SINGLE-SOURCE-OF-TRUTH.md (Phase 5 - NEW, 285 lines)
├── ARCHITECTURE-AUDIT-AUTHENTICATION-DUPLICATION.md (Phase 5 - NEW, 200+ lines)
├── PHASE-5-DIAGNOSTIC-REPORT.md (Phase 5 - NEW)
├── PHASE-5-HONEST-FINAL-STATUS.md (Phase 5 - NEW, 292 lines)
├── START-HERE-PHASE5-COMPLETE.md (Phase 5 - NEW)
├── PHASE-1-COMPLETION-REPORT.md (537 lines)
├── PHASE-2-COMPLETION-REPORT.md (735 lines)
├── PHASE-3-COMPLETION-REPORT.md (640 lines)
├── PHASE-4-COMPLETION-REPORT.md (650+ lines)
├── PHASE-5-COMPLETION-REPORT.md (Phase 5 - NEW, needs update)
├── CHANGELOG.md (Phase 5 entry added, needs verification)
└── README.md (Needs Phase 5 updates)
```

---

## Authoritative Documentation (Read First)

**CRITICAL - Read these files before starting Phase 6**:

1. **`PHASE-5-HONEST-FINAL-STATUS.md`** - Complete Phase 5 status including MFA enforcement issue
2. **`AUTHENTICATION-SINGLE-SOURCE-OF-TRUTH.md`** - Consolidated authentication architecture
3. **`ARCHITECTURE-AUDIT-AUTHENTICATION-DUPLICATION.md`** - Duplication analysis and cleanup
4. **`PRODUCTION-DEPLOYMENT-GUIDE.md`** - Infrastructure, deployment procedures
5. **`RUNBOOK.md`** - Operations, troubleshooting, incident response
6. **`PHASE-4-COMPLETION-REPORT.md`** - Phase 4 deliverables
7. **`PHASE-3-COMPLETION-REPORT.md`** - Phase 3 decision logging
8. **`PHASE-2-COMPLETE-WITH-CRITICAL-FIXES.md`** - User attributes fix
9. **`OTP-ENROLLMENT-KEYCLOAK-26-FIX-SUMMARY.md`** - Keycloak 26 architecture
10. **`backend/src/controllers/otp.controller.ts`** - MFA enrollment implementation
11. **`keycloak/extensions/src/main/java/com/dive/keycloak/authenticator/DirectGrantOTPAuthenticator.java`** - Custom SPI (needs debugging)

---

## Phase 6: Final Integration, Testing & Deployment

**Duration**: 5-7 days  
**Owner**: Full Stack Developer + QA Engineer  
**Risk Level**: MEDIUM-HIGH

### Goal

Fix MFA enforcement (Custom SPI invocation), complete full E2E testing across all 10 NATO nations, update all documentation (Implementation Plan, CHANGELOG.md, README.md), run comprehensive QA, ensure all CI/CD workflows pass, and prepare production deployment package.

---

## Step-by-Step Tasks (Phase 6)

### Task 6.1: Fix MFA Enforcement (Custom SPI Invocation) - CRITICAL

**Objective**: Debug and fix why Custom SPI authenticator is not being invoked during Direct Grant flow

**Current State**:
- Custom SPI code modified to check clearance (lines 97-130)
- JAR rebuilt and synced to container
- Flow bound to realm (`dive-v3-broker`)
- **But**: No "[DIVE SPI]" logs appear when admin-dive authenticates

**Investigation Required**:

1. **Verify Flow Execution Order**:
   ```sql
   -- Check if conditional subflow is being entered
   SELECT af.alias, ae.authenticator, ae.requirement, ae.priority
   FROM authentication_flow af
   JOIN authentication_execution ae ON af.id = ae.flow_id
   WHERE af.alias = 'Direct Grant with Conditional MFA - DIVE V3 Broker'
   ORDER BY ae.priority;
   ```

2. **Check Conditional Logic**:
   - File: `terraform/modules/realm-mfa/direct-grant.tf` lines 56-75
   - Conditional check: `conditional-user-attribute`
   - Config: `attribute_name = "clearance"`, `attribute_value = "^(CONFIDENTIAL|SECRET|TOP_SECRET)$"`
   - **Verify**: Is the condition evaluating correctly for admin-dive?

3. **Enable Debug Logging**:
   ```bash
   # In docker-compose.yml, add to Keycloak environment:
   KC_LOG_LEVEL: "debug,org.keycloak.authentication:trace"
   
   # Restart Keycloak
   docker-compose restart keycloak
   
   # Test admin-dive login
   # Watch logs: docker logs -f dive-v3-keycloak
   # Should see: Flow execution, condition evaluation, SPI invocation
   ```

4. **Check Authenticator Registration**:
   ```bash
   # Verify Custom SPI is registered
   docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh \
     get authentication/authenticator-providers -r dive-v3-broker \
     | jq '.[] | select(.id == "direct-grant-otp-setup")'
   
   # Should return: displayName, description, id
   ```

5. **Verify Execution Configuration**:
   ```bash
   # Check if authenticator config exists
   docker exec dive-v3-postgres psql -U postgres -d keycloak_db -c "
   SELECT ac.alias, ac.id
   FROM authenticator_config ac
   WHERE ac.alias LIKE '%Clearance%Broker%';
   "
   ```

6. **Test with OPA-like Logic**:
   - Check if `conditional-user-attribute` is even checking admin-dive's clearance
   - Verify attribute name matches exactly (`clearance` not `Clearance` or `CLEARANCE`)
   - Verify regex pattern works: `^(CONFIDENTIAL|SECRET|TOP_SECRET)$`
   - admin-dive has clearance = "TOP_SECRET" (verified in database)

**Expected Fix**:
- Identify why Custom SPI is not invoked
- Fix flow configuration or SPI registration
- Verify admin-dive is BLOCKED without OTP
- Verify admin-dive can setup OTP and login with MFA
- Create tests to prevent regression

**DoD**:
- Custom SPI logs appear: "[DIVE SPI] ====== OTP Authentication Request ======"
- admin-dive (TOP_SECRET) is BLOCKED without OTP
- Error returned: `"otp_not_configured"` with setup instructions
- Frontend triggers MFA setup modal correctly
- After OTP enrollment, admin-dive can login with username + password + OTP
- bob.contractor (UNCLASSIFIED) still works without MFA
- All regression tests still passing

**Reference**: 
- `OTP-ENROLLMENT-KEYCLOAK-26-FIX-SUMMARY.md` - Keycloak 26 architecture
- `terraform/modules/realm-mfa/direct-grant.tf` - Flow definition
- Keycloak docs: https://www.keycloak.org/docs/latest/server_development/#_authentication_spi

---

### Task 6.2: Complete E2E Testing (All 10 Nations)

**Objective**: Run comprehensive E2E tests across all 10 NATO nations with real authentication

**Test Matrix** (From Phase 5 scenarios):

**Authentication Tests** (10 scenarios):
- ✅ bob.contractor (USA, UNCLASSIFIED) - Already verified
- ✅ admin-dive (dive-v3-broker, TOP_SECRET) - Already verified (without MFA)
- ⏭️ alice.general (USA, TOP_SECRET) - Test with MFA after Task 6.1 fix
- ⏭️ carlos.garcia (ESP, SECRETO) - Classification equivalency
- ⏭️ jean.dupont (FRA, SECRET_DEFENSE) - French clearance mapping
- ⏭️ james.smith (GBR, SECRET) - FVEY COI testing
- ⏭️ hans.mueller (DEU, GEHEIM) - German clearance
- ⏭️ marco.rossi (ITA, SEGRETO) - Italian clearance
- ⏭️ jan.devries (NLD, GEHEIM) - Netherlands
- ⏭️ piotr.kowalski (POL, TAJNE) - Polish clearance
- ⏭️ john.macdonald (CAN, SECRET) - Canadian user

**Authorization Tests** (10 scenarios):
- Test clearance-based access (UNCLASSIFIED → SECRET resource: DENY)
- Test classification equivalency (ESP SECRETO = SECRET: ALLOW)
- Test releasability (FRA user → USA-only resource: DENY)
- Test COI membership (FVEY, NATO-COSMIC, bilateral)
- Test embargo dates
- Test all 10 countries with various resources

**MFA Enrollment Tests** (After Task 6.1):
- admin-dive: Complete MFA enrollment, login with OTP
- alice.general: Complete MFA enrollment, login with OTP
- Verify MFA required for CONFIDENTIAL/SECRET/TOP_SECRET
- Verify MFA NOT required for UNCLASSIFIED

**Resource Access Tests**:
- Download UNCLASSIFIED resource (all users)
- Download SECRET resource (authorized users only)
- Upload encrypted resource (ZTDF metadata signing)
- Verify signature validation (Phase 4)
- Test KAS key release (Phase 4)

**DoD**:
- All 10 nations tested with real logins
- MFA enrollment works end-to-end (after Task 6.1)
- Authorization decisions correct for all scenarios
- Decision logging verified (MongoDB)
- KAS key release logging verified
- Screenshots captured for each nation
- Test report created

---

### Task 6.3: Update Implementation Plan & Documentation

**Objective**: Update all documentation to reflect Phases 1-5 completion and Phase 6 status

**Files to Update**:

1. **`DIVE-V3-IMPLEMENTATION-PLAYBOOK-PART-2.md`** (Mark Phases 4-5 complete):
   - Phase 4: ✅ COMPLETE (4/4 tasks, 29 crypto tests)
   - Phase 5: ⚠️ 95% COMPLETE (7 bugs fixed, MFA enforcement pending)
   - Phase 6: 🔄 IN PROGRESS

2. **`CHANGELOG.md`** (Verify Phase 5 entry, add Phase 6):
   - Verify Phase 5 entry complete (currently at line 1-140)
   - Add Phase 6 entry when complete
   - Document MFA enforcement fix (Task 6.1)
   - Document E2E testing results (Task 6.2)

3. **`README.md`** (Update architecture, features, test results):
   - Add Phase 4 features (ZTDF crypto, KMS, KAS logging)
   - Add Phase 5 features (MFA bugs fixed, monitoring, E2E tests)
   - Update architecture diagram with crypto services
   - Update test results (175 OPA + 29 crypto + 19 MFA + 50+ E2E = 273+ tests)
   - Add production deployment overview
   - Add MFA enforcement status (Task 6.1 result)

4. **`PHASE-5-COMPLETION-REPORT.md`** (Update with final status):
   - Update bugs fixed section (7 bugs documented)
   - Add browser verification evidence
   - Add screenshot references
   - Document MFA enforcement limitation
   - Mark Phase 5 as 95% complete (pending MFA enforcement)

5. **Create `PHASE-6-COMPLETION-REPORT.md`**:
   - Document Task 6.1 fix (MFA enforcement)
   - Document E2E test results (all 10 nations)
   - Document final QA results
   - Document CI/CD status
   - Include screenshots from all nations
   - Honest assessment of production readiness

**DoD**:
- Implementation plan current (all phases marked)
- CHANGELOG.md has Phase 6 entry
- README.md fully updated with Phases 1-6
- All completion reports accurate
- No outdated information

---

### Task 6.4: Full QA Testing & CI/CD Verification

**Objective**: Run comprehensive QA and ensure all CI/CD workflows pass

**QA Checklist**:

1. **Regression Tests** (Must all pass):
   ```bash
   # OPA (expect 175/175)
   docker exec dive-v3-opa opa test /policies -v
   
   # Crypto (expect 29/29)
   cd backend && npm test -- ztdf-crypto.service.test.ts
   
   # Decision Logging (expect 15/15)
   cd backend && npm test -- decision-log.service.test.ts
   
   # MFA Enrollment (expect 19/19)
   cd backend && npm test -- mfa-enrollment-flow.integration.test.ts
   
   # Backend (expect ≥1240/1286)
   cd backend && npm test
   
   # Frontend (expect ≥152/183)
   cd frontend && npm test
   ```

2. **Service Health**:
   ```bash
   # All services healthy
   docker ps --format "table {{.Names}}\t{{.Status}}"
   
   # Backend health
   curl http://localhost:4000/health
   
   # OPA health
   curl http://localhost:8181/health
   ```

3. **Authentication Flow**:
   - ✅ bob.contractor (UNCLASSIFIED) - no MFA
   - ⏭️ admin-dive (TOP_SECRET) - with MFA (after Task 6.1)
   - ⏭️ alice.general (TOP_SECRET) - with MFA (after Task 6.1)
   - Test all 10 nations

4. **Authorization Decisions**:
   - Query decision logs
   - Verify ALLOW/DENY reasons correct
   - Check MongoDB TTL working

5. **Crypto Services** (Phase 4):
   - Metadata signing working
   - Signature verification working
   - Key wrapping/unwrapping working
   - KAS key release logging working

6. **CI/CD Workflows**:
   ```bash
   # Trigger workflows manually or via commit
   # Verify all pass:
   # - terraform-ci.yml ✅
   # - backend-tests.yml ✅
   # - frontend-tests.yml ✅
   # - opa-tests.yml ✅
   # - e2e-tests.yml ✅
   # - security-scan.yml ✅ (Phase 5)
   ```

**DoD**:
- All regression tests passing
- All services healthy
- All 10 nations tested
- All CI/CD workflows passing (green checkmarks on GitHub)
- QA report created with evidence
- Screenshots from each test scenario

---

### Task 6.5: Production Deployment Package

**Objective**: Create complete production deployment package

**Deliverables**:

1. **Final docker-compose.prod.yml**:
   - Production-ready configuration
   - No dev mounts
   - Secrets from environment variables
   - Health checks configured
   - Resource limits set

2. **Deployment Scripts**:
   ```bash
   scripts/deploy-production.sh      # Full deployment automation
   scripts/rollback.sh               # Rollback procedure
   scripts/health-check.sh           # Comprehensive health checks
   scripts/backup-all.sh             # Backup all databases
   ```

3. **Configuration Templates**:
   ```
   config/production.env.template    # Production environment variables
   config/nginx.conf                 # Reverse proxy configuration
   config/secrets.vault.yml          # Vault secrets template
   ```

4. **Verification Checklist**:
   ```
   docs/PRODUCTION-DEPLOYMENT-CHECKLIST.md
   - Pre-deployment verification
   - Post-deployment verification
   - Rollback verification
   - Security audit checklist
   ```

**DoD**:
- Production deployment package complete
- All scripts tested
- Configuration templates provided
- Deployment checklist comprehensive

---

## Critical Bugs/Issues to Address in Phase 6

### Issue #1: MFA Enforcement Not Working (CRITICAL - Task 6.1)

**Severity**: CRITICAL (Security/Compliance)  
**Impact**: TOP_SECRET users can bypass MFA  
**Status**: Custom SPI not being invoked  
**Files**: `DirectGrantOTPAuthenticator.java`, flow configuration  
**Fix Required**: Debug SPI invocation, ensure clearance-based MFA enforced  

### Issue #2: Frontend .next Cache Permissions

**Severity**: LOW (Development inconvenience)  
**Impact**: Cannot clear cache without sudo  
**Status**: ⚠️ Workaround: Browser hard refresh (Cmd+Shift+R)  
**Fix Applied**: Removed anonymous `/app/.next` volume from docker-compose.yml  
**Result**: Partially fixed (still owned by Docker root on host)  
**Workaround**: Use browser cache clearing

### Issue #3: OPA Container Unhealthy

**Severity**: LOW (Cosmetic)  
**Impact**: None (175/175 tests passing)  
**Status**: Health check configuration issue  
**Fix**: Update docker-compose.yml health check for OPA

---

## Phase 5 Deliverables (Verification Needed)

### Code Changes (Phase 5)

| File | Change | Lines | Purpose |
|------|--------|-------|---------|
| `backend/src/controllers/otp.controller.ts` | MODIFIED | +100 | Bugs #1, #2 fixed |
| `backend/src/controllers/custom-login.controller.ts` | MODIFIED | +30 | Bugs #3, #4 fixed |
| `backend/src/controllers/otp-enrollment.controller.ts` | MODIFIED | +50 | Bug #6 fixed |
| `backend/src/config/performance-config.ts` | NEW | +200 | Bug #5 + optimizations |
| `backend/src/server.ts` | MODIFIED | +3 | Apply performance middleware |
| `backend/src/controllers/otp-setup.controller.ts` | **DELETED** | -341 | Duplicate removed |
| `keycloak/extensions/.../DirectGrantOTPAuthenticator.java` | MODIFIED | +40 | Clearance checking added |
| `docker-compose.yml` | MODIFIED | -1 line | Removed .next volume |

### Tests Created (Phase 5)

| File | Tests | Status |
|------|-------|--------|
| `backend/src/__tests__/mfa-enrollment-flow.integration.test.ts` | 19 | ✅ 100% passing |
| `backend/src/__tests__/e2e/authorization-10-countries.e2e.test.ts` | 25+ | ✅ Created |
| `backend/src/__tests__/e2e/resource-access.e2e.test.ts` | 10+ | ✅ Created |

### Configuration (Phase 5)

| File | Lines | Purpose |
|------|-------|---------|
| `monitoring/prometheus.yml` | 75 | Metrics collection |
| `monitoring/alerts/dive-v3-alerts.yml` | 210 | 20+ alerting rules |
| `monitoring/alertmanager.yml` | 65 | Alert routing |
| `docker-compose.monitoring.yml` | 138 | Monitoring stack |
| `.github/workflows/security-scan.yml` | 100+ | Security scanning |

### Documentation (Phase 5)

| File | Lines | Audience |
|------|-------|----------|
| `PRODUCTION-DEPLOYMENT-GUIDE.md` | 650+ | DevOps |
| `RUNBOOK.md` | 550+ | On-call engineers |
| `AUTHENTICATION-SINGLE-SOURCE-OF-TRUTH.md` | 285 | Developers |
| `ARCHITECTURE-AUDIT-AUTHENTICATION-DUPLICATION.md` | 200+ | Technical team |
| `MONITORING-DEPLOYMENT.md` | 200+ | DevOps |
| Various task summaries | 1,850+ | Technical docs |

**Total Phase 5 Output**: ~6,000 lines of code, tests, config, documentation

---

## Verified Working State (Must Preserve)

1. **User Attributes**: All 47 users have clearances and first/last names ✅
2. **User Names**: Keycloak 26 requirement met (Bug #7 fixed) ✅
3. **OTP Setup**: Generates secrets, stores in Redis correctly ✅
4. **Session Redirect**: window.location.href fix preserved (Phase 1) ✅
5. **Mapper Consolidation**: 10/10 IdPs using shared module (Phase 2) ✅
6. **Decision Logging**: MongoDB decisions collection (Phase 3) ✅
7. **Crypto Services**: 29/29 tests passing (Phase 4) ✅
8. **KAS Logging**: MongoDB key_releases collection (Phase 4) ✅
9. **MFA Setup Modal**: Displays correctly in browser (Phase 5) ✅
10. **Direct Grant Flow**: Bound to dive-v3-broker realm ✅

---

## Performance Baselines (Phase 3-5)

```
Authorization latency (p95): ~45ms (target <150ms) ✅ 3.3x better
OPA evaluation (p95): ~50ms (target <100ms) ✅ 2x better
Metadata signing (Phase 4): ~40ms (target <50ms) ✅
Key wrapping (Phase 4): ~8ms (target <10ms) ✅
Decision logging: Non-blocking (async) ✅
```

**All performance targets exceeded** ✅

---

## Critical Context for Phase 6

### Keycloak 26 Breaking Changes (Encountered in Phases 2-5)

1. **User Attributes**: Terraform provider bug, use workaround script
   - `scripts/populate-all-user-attributes.py` (Phase 2)
   - `scripts/fix-keycloak-26-user-names.sh` (Phase 5)

2. **First/Last Name Requirement** (Phase 5 discovery):
   - Keycloak 26 requires `first_name` and `last_name`
   - Reference: https://github.com/keycloak/keycloak/issues/36108
   - Returns "Account is not fully set up" if NULL
   - **Fixed**: All users now have names

3. **OTP Credential Creation** (Phase 2-5):
   - `POST /admin/realms/{realm}/users/{userId}/credentials` removed in Keycloak 26
   - Cannot create OTP credentials via Admin API
   - **Workaround**: Store secret in Redis, Custom SPI creates credential on next login
   - **Issue**: Custom SPI not being invoked (Phase 6 Task 6.1)

4. **Direct Grant Flow Binding**:
   - Must be bound manually or via database update
   - Terraform doesn't always bind correctly
   - **Fixed Phase 5**: Manual database update applied

### Authentication Architecture (Phase 5 Consolidated)

**Two Authentication Flows** (Both Needed):

1. **Direct Grant with Conditional MFA** (dive-v3-broker):
   - Used by: admin-dive
   - Type: Resource Owner Password Credentials (API-based)
   - MFA: Custom SPI checks clearance, requires OTP for classified
   - **Status**: Flow bound, SPI not invoking

2. **Classified Access Browser Flow** (All nation realms):
   - Used by: alice.general, carlos.garcia, etc.
   - Type: Browser-based (standard Keycloak)
   - MFA: AAL2 enforcement via browser flow
   - **Status**: Working (Phase 1-2 tested)

**OTP Enrollment Implementation** (Single Source of Truth):

**Files** (After Phase 5 cleanup):
- ✅ `backend/src/controllers/otp.controller.ts` (560 lines) - Setup + verify
- ✅ `backend/src/controllers/otp-enrollment.controller.ts` (211 lines) - Finalize via Admin API
- ✅ `backend/src/routes/otp.routes.ts` (45 lines) - Route definitions
- ✅ `backend/src/services/otp.service.ts` (413 lines) - Secret generation
- ✅ `backend/src/services/otp-redis.service.ts` (290 lines) - Redis session management
- ❌ `backend/src/controllers/otp-setup.controller.ts` - DELETED (duplicate, 341 lines removed)

**Endpoints**:
- `POST /api/auth/otp/setup` → `otp.controller.ts:otpSetupHandler`
- `POST /api/auth/otp/finalize-enrollment` → `otp-enrollment.controller.ts:finalizeEnrollment`
- `POST /api/auth/otp/verify` → `otp.controller.ts:otpVerifyHandler`

---

## Database State (Current)

### PostgreSQL (keycloak_db)

**Users**: 47 total
- All have `first_name` and `last_name` (Phase 5 fix)
- All have `clearance`, `countryOfAffiliation`, `uniqueID` attributes
- admin-dive: `first_name="Administrator"`, `last_name="DIVE"`, `clearance="TOP_SECRET"`
- alice.general: `first_name="Alice"`, `last_name="General"`, `clearance="TOP_SECRET"`
- bob.contractor: `first_name="Bob"`, `last_name="Contractor"`, `clearance="UNCLASSIFIED"`

**Realms**: 15 total
- Broker: `dive-v3-broker` (admin-dive)
- Nations: `dive-v3-usa`, `dive-v3-esp`, `dive-v3-fra`, `dive-v3-gbr`, `dive-v3-deu`, `dive-v3-ita`, `dive-v3-nld`, `dive-v3-pol`, `dive-v3-can`, `dive-v3-industry`
- Test: 4 mock realms

**Authentication Flows**:
- dive-v3-broker: **Direct Grant Flow** = "Direct Grant with Conditional MFA - DIVE V3 Broker" (Phase 5 bound)
- dive-v3-broker: **Browser Flow** = "Classified Access Browser Flow - DIVE V3 Broker"

### MongoDB (dive_v3_resources)

**Collections**:
- `resources`: 7,002 documents (test data seeded)
- `decisions`: Authorization decisions (90-day TTL)
- `key_releases`: KAS key releases (Phase 4, 90-day TTL)

### Redis

**Keys**:
- `otp:pending:{userId}`: OTP secrets (10-minute TTL)
- Format: `{"secret":"BASE32","createdAt":"ISO8601","expiresAt":"ISO8601"}`

---

## Environment Configuration

**Backend** (dive-v3-backend):
```env
KEYCLOAK_URL=http://keycloak:8080
OPA_URL=http://opa:8181
MONGODB_URL=mongodb://admin:password@mongo:27017
REDIS_URL=redis://redis:6379
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=dive_v3_app
```

**Frontend** (dive-v3-frontend):
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
KEYCLOAK_BASE_URL=http://keycloak:8080
KEYCLOAK_REALM=dive-v3-broker
KEYCLOAK_CLIENT_ID=dive-v3-client-broker
```

**Keycloak** (dive-v3-keycloak):
```env
KC_DB=postgres
KC_DB_URL=jdbc:postgresql://postgres:5432/keycloak_db
KC_HTTP_ENABLED=true
KC_HTTPS_PORT=8443
KC_FEATURES=scripts
KC_LOG_LEVEL=info,org.keycloak.credential:debug,org.keycloak.authentication:debug
```

---

## Commands Reference

### Service Management
```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

# Start all
docker-compose up -d

# Restart specific service
docker-compose restart backend

# View logs
docker logs dive-v3-backend --tail 50 -f

# Stop all
docker-compose down
```

### Testing
```bash
# OPA tests
docker exec dive-v3-opa opa test /policies -v

# Backend tests
cd backend && npm test

# Crypto tests
cd backend && npm test -- ztdf-crypto.service.test.ts

# MFA tests
cd backend && npm test -- mfa-enrollment-flow.integration.test.ts
```

### Database Queries
```bash
# Check user attributes
docker exec dive-v3-postgres psql -U postgres -d keycloak_db -c "
SELECT ua.name, ua.value 
FROM user_attribute ua 
JOIN user_entity ue ON ua.user_id = ue.id 
WHERE ue.username='admin-dive' AND ue.realm_id='dive-v3-broker';"

# Check credentials
docker exec dive-v3-postgres psql -U postgres -d keycloak_db -c "
SELECT c.type, ue.username 
FROM credential c 
JOIN user_entity ue ON c.user_id = ue.id 
WHERE ue.username='admin-dive';"

# Check decision logs
docker exec dive-v3-mongo mongosh -u admin -p password dive_v3_resources --eval "
db.decisions.find().sort({timestamp:-1}).limit(5).pretty()"

# Check Redis keys
docker exec dive-v3-redis redis-cli KEYS "otp:pending:*"
```

### Keycloak Management
```bash
# Login to kcadm
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user admin --password admin

# Get authentication flows
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get authentication/flows -r dive-v3-broker

# Get authenticator providers
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get authentication/authenticator-providers -r dive-v3-broker
```

---

## Test User Credentials

**Format**: `username` / `Password123!`

**dive-v3-broker**:
- admin-dive (TOP_SECRET) ✅ **Verified working** - logs into dashboard, clearance displayed
  - **Issue**: Logs in WITHOUT MFA (Custom SPI not enforcing)
  - First: Administrator, Last: DIVE
  - Email: admin-dive@dive.mil (verified)

**dive-v3-usa**:
- bob.contractor (UNCLASSIFIED) ✅ **Verified working** - logs in, no MFA required
  - First: Bob, Last: Contractor
- alice.general (TOP_SECRET) ⏭️ **Needs E2E testing with MFA**
  - First: Alice, Last: General
  - Email: alice.general@af.mil (not verified)

**dive-v3-esp**:
- carlos.garcia (SECRETO) ⏭️ **Test classification equivalency**
  - Should map SECRETO → SECRET

**All 47 users**: Have `first_name` and `last_name` (Phase 5 fix)

---

## Phase 6 Success Criteria (Definition of Done)

- [ ] **Task 6.1**: MFA enforcement working (Custom SPI invoked, TOP_SECRET users blocked without OTP)
- [ ] **Task 6.2**: E2E testing complete (all 10 nations tested, screenshots captured)
- [ ] **Task 6.3**: Documentation updated (Implementation Plan, CHANGELOG.md, README.md current)
- [ ] **Task 6.4**: Full QA passing (all regression tests, all CI/CD workflows green)
- [ ] **Task 6.5**: Production deployment package complete (scripts, configs, checklist)
- [ ] **Verification**: admin-dive can complete MFA enrollment end-to-end
- [ ] **Verification**: admin-dive login requires OTP after enrollment
- [ ] **Verification**: bob.contractor still works without MFA (UNCLASSIFIED)
- [ ] **Verification**: All 10 nations tested with real authentication
- [ ] **Verification**: All Phase 1-5 regression tests still passing
- [ ] **Deliverable**: PHASE-6-COMPLETION-REPORT.md with honest assessment
- [ ] **Deliverable**: Production deployment package with all scripts
- [ ] **Deliverable**: GitHub CI/CD all workflows passing (green badges)
- [ ] **Deliverable**: Updated README.md with complete architecture
- [ ] **Deliverable**: Updated CHANGELOG.md with Phase 6 entry
- [ ] **Deliverable**: Git commit with all Phase 6 changes

---

## Known Working State (Must Preserve)

**✅ Verified Working (DO NOT BREAK)**:
1. bob.contractor login (UNCLASSIFIED, no MFA) - Phase 4 verified
2. admin-dive login (TOP_SECRET clearance displays) - Phase 5 verified
3. MFA setup modal displays (QR code, secret, input field) - Phase 5 verified
4. OPA tests: 175/175 passing
5. Crypto tests: 29/29 passing
6. Decision logging: MongoDB with TTL
7. KAS logging: MongoDB key_releases
8. All 47 users have first/last names
9. Phase 1 session redirect fix (window.location.href)
10. Phase 2 user attributes (all preserved)
11. Phase 3 decision logging (authz.middleware.ts)
12. Phase 4 crypto services (ZTDF signing, KEK wrapping)
13. Phase 5 Redis OTP storage (secrets persist)

**⚠️ Known Limitation**:
- MFA enforcement: Custom SPI not invoked (Phase 6 Task 6.1 to fix)

---

## Phase 6 Backups (Create Before Starting)

```bash
mkdir -p /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/backups/20251030-phase6

# Terraform state
cp terraform/terraform.tfstate backups/20251030-phase6/terraform.tfstate.backup-phase6-pre

# Keycloak DB
docker exec dive-v3-postgres pg_dump -U postgres keycloak_db > backups/20251030-phase6/keycloak-backup-phase6-pre.sql

# Frontend DB
docker exec dive-v3-postgres pg_dump -U postgres dive_v3_app > backups/20251030-phase6/frontend-db-backup-phase6-pre.sql

# MongoDB
docker exec dive-v3-mongo mongodump --username admin --password password \
  --authenticationDatabase admin --db dive_v3_resources \
  --archive=/tmp/mongodb-backup-phase6-pre.archive
docker cp dive-v3-mongo:/tmp/mongodb-backup-phase6-pre.archive \
  backups/20251030-phase6/mongodb-backup-phase6-pre.archive

# Git commit hash
git rev-parse HEAD > backups/20251030-phase6/git-commit-phase6-pre.txt
```

---

## Starting Point for Phase 6

```bash
# 1. Navigate to project
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

# 2. Verify all services running
docker ps --format "table {{.Names}}\t{{.Status}}"

# 3. Read Phase 5 status
cat PHASE-5-HONEST-FINAL-STATUS.md

# 4. Read authentication architecture
cat AUTHENTICATION-SINGLE-SOURCE-OF-TRUTH.md

# 5. Check current test results
docker exec dive-v3-opa opa test /policies -v | grep "PASS:"  # Expect: 175/175
cd backend && npm test -- ztdf-crypto.service.test.ts | grep "Tests:"  # Expect: 29/29
cd backend && npm test -- mfa-enrollment-flow.integration.test.ts | grep "Tests:"  # Expect: 19/19

# 6. Verify admin-dive login
# Browser: http://localhost:3000/login/dive-v3-broker
# Username: admin-dive, Password: Password123!
# Expected: Logs in successfully, shows TOP_SECRET (but no MFA required - Issue #1)

# 7. Create Phase 6 backups (commands above)

# 8. Begin Phase 6 implementation
```

---

## Critical Files for Phase 6 (Must Review)

**Authentication & MFA**:
1. `keycloak/extensions/src/main/java/com/dive/keycloak/authenticator/DirectGrantOTPAuthenticator.java` - Custom SPI (Phase 5 modified, needs debugging)
2. `terraform/modules/realm-mfa/direct-grant.tf` - Flow definition
3. `backend/src/controllers/otp.controller.ts` - OTP setup (Phase 5 fixed)
4. `backend/src/controllers/custom-login.controller.ts` - Login handler (Phase 5 fixed)

**Testing**:
5. `backend/src/__tests__/mfa-enrollment-flow.integration.test.ts` - 19 tests
6. `backend/src/__tests__/e2e/authorization-10-countries.e2e.test.ts` - 25+ scenarios
7. `policies/comprehensive_authorization_test.rego` - 175 OPA tests

**Documentation**:
8. `PRODUCTION-DEPLOYMENT-GUIDE.md` - Infrastructure, deployment
9. `RUNBOOK.md` - Operations, troubleshooting
10. `CHANGELOG.md` - Phase 5 entry added, verify accuracy
11. `README.md` - Needs Phase 4-5 updates

---

## Phase 6 Expected Outputs

**Code Fixes**:
1. Custom SPI invocation fix (Task 6.1)
2. Any additional bug fixes discovered during E2E testing

**Testing**:
1. E2E test results for all 10 nations
2. MFA enrollment E2E verification
3. Full QA report with evidence
4. Screenshots from each nation login

**Documentation**:
1. Updated `DIVE-V3-IMPLEMENTATION-PLAYBOOK-PART-2.md` (mark Phases 4-6 complete)
2. Updated `CHANGELOG.md` (Phase 6 entry)
3. Updated `README.md` (complete Phases 1-6 features, architecture)
4. `PHASE-6-COMPLETION-REPORT.md` (comprehensive)
5. Production deployment package (docker-compose.prod.yml, scripts, configs)

**Git**:
1. Commit message for Phase 6 changes
2. Tag: `v1.6.0-phase6-complete`
3. All CI/CD workflows passing (green checkmarks)

---

## Critical Commands for Debugging MFA Enforcement (Task 6.1)

### Enable Keycloak Debug Logging

**Modify docker-compose.yml**:
```yaml
keycloak:
  environment:
    KC_LOG_LEVEL: "debug,org.keycloak.authentication:trace,org.keycloak.authenticator:trace"
```

**Restart**:
```bash
docker-compose restart keycloak
sleep 40
```

**Test and Watch Logs**:
```bash
# Terminal 1: Watch logs
docker logs -f dive-v3-keycloak | grep -i "DIVE SPI\|conditional\|direct-grant-otp\|clearance"

# Terminal 2: Test login
curl -X POST "http://localhost:8081/realms/dive-v3-broker/protocol/openid-connect/token" \
  -d "grant_type=password&client_id=dive-v3-client-broker&username=admin-dive&password=Password123!"
```

### Check Flow Execution

```sql
-- Verify flow binding
SELECT r.name, af.alias 
FROM realm r
JOIN authentication_flow af ON r.direct_grant_flow = af.id
WHERE r.id = 'dive-v3-broker';
-- Should return: "Direct Grant with Conditional MFA - DIVE V3 Broker"

-- Check executions in flow
SELECT ae.priority, ae.authenticator, ae.requirement
FROM authentication_execution ae
JOIN authentication_flow af ON ae.flow_id = af.id
WHERE af.alias = 'Direct Grant with Conditional MFA - DIVE V3 Broker'
ORDER BY ae.priority;
-- Should show: validate-username, validate-password, conditional subflow

-- Check conditional subflow
SELECT ae.authenticator, ae.requirement
FROM authentication_execution ae
JOIN authentication_flow af ON ae.flow_id = af.id
WHERE af.alias = 'Conditional OTP - Direct Grant - DIVE V3 Broker'
ORDER BY ae.priority;
-- Should show: conditional-user-attribute, direct-grant-otp-setup
```

### Verify Custom SPI Loaded

```bash
# Check providers
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user admin --password admin

docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh \
  get authentication/authenticator-providers -r dive-v3-broker \
  | jq '.[] | select(.id == "direct-grant-otp-setup")'

# Should return: displayName, description, id
```

### Test Conditional Logic

```bash
# Verify admin-dive has clearance attribute
docker exec dive-v3-postgres psql -U postgres -d keycloak_db -c "
SELECT ua.name, ua.value
FROM user_attribute ua
JOIN user_entity ue ON ua.user_id = ue.id
WHERE ue.username='admin-dive' AND ua.name='clearance';"
# Should return: clearance | TOP_SECRET

# Check if conditional config exists
docker exec dive-v3-postgres psql -U postgres -d keycloak_db -c "
SELECT ac.alias, ac.id
FROM authenticator_config ac
WHERE ac.alias LIKE '%Clearance%Broker%';"
# Should return config for conditional-user-attribute
```

---

## Constraints for Phase 6

### Do NOT Break (CRITICAL - All Phases 1-5 Fixes)
- ❌ Phase 1 session redirect fix (`window.location.href`)
- ❌ Phase 2 user attributes (all 47 users)
- ❌ Phase 2 OTP client fix (`dive-v3-broker-client`)
- ❌ Phase 3 decision logging (authz.middleware.ts)
- ❌ Phase 3 OPA tests (175/175)
- ❌ Phase 4 crypto services (29/29 tests)
- ❌ Phase 5 MFA bug fixes (7 bugs - Redis, circular dependency, HTTP codes, etc.)
- ❌ Phase 5 first/last name fix (Bug #7 - all 47 users)
- ❌ Direct Grant flow binding (dive-v3-broker)

### Must Maintain
- ✅ OPA: 175/175 (100%)
- ✅ Crypto: 29/29 (100%)
- ✅ Backend: ≥1,240/1,286 (≥96%)
- ✅ Frontend: ≥152/183 (≥83%)
- ✅ MFA Enrollment: 19/19 (100%)
- ✅ User attributes: All 47 users with clearances and names
- ✅ Decision logging: MongoDB working
- ✅ KAS logging: key_releases collection
- ✅ All 5 CI/CD workflows functional

---

## Expected Timeline (Phase 6)

| Task | Estimated | Priority |
|------|-----------|----------|
| 6.1: Fix MFA Enforcement (Custom SPI) | 2-3 days | ⭐ CRITICAL |
| 6.2: E2E Testing (10 Nations) | 2-3 days | HIGH |
| 6.3: Documentation Updates | 1-2 days | MEDIUM |
| 6.4: Full QA & CI/CD Verification | 1-2 days | HIGH |
| 6.5: Production Deployment Package | 1-2 days | MEDIUM |
| **Total** | **7-12 days** | |

---

## Success Metrics (Phase 6)

**Critical**:
- [ ] MFA enforcement working (TOP_SECRET users BLOCKED without OTP)
- [ ] admin-dive completes MFA enrollment end-to-end
- [ ] admin-dive logs in with username + password + OTP
- [ ] All 10 nations tested with real authentication
- [ ] All regression tests passing (1,615+ tests)
- [ ] All CI/CD workflows passing (6 workflows)

**Documentation**:
- [ ] Implementation plan current (all phases marked)
- [ ] CHANGELOG.md Phase 6 entry
- [ ] README.md fully updated
- [ ] Phase 6 completion report created

**Production Readiness**:
- [ ] Production deployment package complete
- [ ] Security compliance verified (ACP-240, STANAG 4778)
- [ ] Performance targets met (p95 < 150ms)
- [ ] Monitoring ready to deploy
- [ ] Deployment checklist comprehensive

---

## Reference Documentation

**Phase Completion Reports**:
- `PHASE-1-COMPLETION-REPORT.md` - Federation & MFA foundation
- `PHASE-2-COMPLETION-REPORT.md` - Attribute normalization
- `PHASE-3-COMPLETION-REPORT.md` - Policy-based authorization
- `PHASE-4-COMPLETION-REPORT.md` - Data-centric security
- `PHASE-5-HONEST-FINAL-STATUS.md` - Production hardening (current state)

**Technical Guides**:
- `AUTHENTICATION-SINGLE-SOURCE-OF-TRUTH.md` - Consolidated auth architecture
- `PRODUCTION-DEPLOYMENT-GUIDE.md` - Infrastructure, deployment
- `RUNBOOK.md` - Operations, troubleshooting
- `OTP-ENROLLMENT-KEYCLOAK-26-FIX-SUMMARY.md` - Keycloak 26 patterns
- `kas/MTLS-PRODUCTION-REQUIREMENT.md` - mTLS for production
- `docs/OPENTDF-FUTURE-ENHANCEMENT.md` - OpenTDF integration path

**Troubleshooting**:
- `TROUBLESHOOTING-USER-ATTRIBUTES.md` - User attribute issues
- `PHASE-5-DIAGNOSTIC-REPORT.md` - Phase 5 debugging process

---

## Important Notes for Phase 6

1. **MFA Enforcement is THE Critical Blocker**: Cannot deploy to production without fixing Task 6.1
2. **Custom SPI Debugging**: May require deep Keycloak knowledge, check Keycloak server logs carefully
3. **Preserve All Phase 1-5 Fixes**: Zero regressions tolerance
4. **Browser Testing Essential**: Manual verification needed for MFA flows
5. **Documentation Must Be Accurate**: Implementation plan, changelog, readme must reflect reality
6. **Git Commit Required**: Phase 6 changes must be committed with proper message
7. **CI/CD Must Pass**: All 6 workflows must show green checkmarks
8. **Honest Assessment**: Phase 6 completion report must be truthful about what works and what doesn't

---

**BEGIN Phase 6 implementation now. Create pre-Phase 6 backups, fix MFA enforcement (Task 6.1 - debug Custom SPI invocation), run comprehensive E2E testing across all 10 NATO nations, update all documentation (Implementation Plan mark Phases 1-6 complete, CHANGELOG.md Phase 6 entry, README.md with complete architecture and features), run full QA regression tests, verify all CI/CD workflows pass, create production deployment package with scripts and configs, commit all changes to Git with proper commit message, and provide honest Phase 6 completion report with screenshots and evidence.**

**CRITICAL**: Task 6.1 (MFA enforcement) is BLOCKING. The Custom SPI authenticator (`direct-grant-otp-setup`) exists and is loaded but is NOT being invoked. Enable trace logging on Keycloak authentication (`KC_LOG_LEVEL: debug,org.keycloak.authentication:trace`), test admin-dive login, watch logs for flow execution, identify why Custom SPI is skipped, fix the issue, verify TOP_SECRET users are BLOCKED without OTP, then proceed with remaining Phase 6 tasks.

**FOR NEW CHAT**: This is a continuation of an existing project with 5 completed phases. DO NOT restart from scratch. DO NOT recreate services. ONLY implement Phase 6 enhancements and fixes. All Phase 1-5 code is production-ready except MFA enforcement (Custom SPI not invoking).

