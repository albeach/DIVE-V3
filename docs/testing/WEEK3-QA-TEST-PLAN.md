# Week 3 QA Test Plan - Multi-IdP Federation & Claim Enrichment

**Test Date:** October 11, 2025  
**Test Engineer:** QA Analyst  
**Version:** Week 3 Complete  
**Terraform Applied:** ✅ 27 resources created, 5 modified

---

## 1. Automated Test Results

### 1.1 OPA Policy Tests
**Status:** ✅ **PASS**

```bash
$ docker-compose exec opa opa test /policies/ -v
```

**Results:**
- Total Tests: 78/78
- Pass: 78
- Fail: 0
- Error: 0
- Pass Rate: 100%

**Test Coverage:**
- Comprehensive Suite (Week 2): 53 tests
- Negative Test Suite (Week 3): 22 tests
- Validation Tests (Week 3): 3 tests

**Categories Verified:**
- ✅ Clearance levels (16 tests)
- ✅ Releasability (10 tests)
- ✅ COI intersection (9 tests)
- ✅ Embargo dates (6 tests)
- ✅ Missing attributes (9 tests)
- ✅ Authentication (4 tests)
- ✅ Obligations (2 tests)
- ✅ Decision reasons (3 tests)
- ✅ Invalid inputs (22 tests)

### 1.2 TypeScript Compilation
**Status:** ✅ **PASS**

**Backend:**
```bash
$ cd backend && npx tsc --noEmit
✅ Exit code: 0 (no errors)
```

**Frontend:**
```bash
$ cd frontend && npx tsc --noEmit
✅ Exit code: 0 (no errors)
```

### 1.3 Infrastructure Health Check
**Status:** ✅ **PASS**

**Services Verified:**
- ✅ Docker daemon running
- ✅ Keycloak (port 8081) - HEALTHY
- ✅ PostgreSQL (via Keycloak) - HEALTHY
- ✅ MongoDB (port 27017) - HEALTHY
- ✅ OPA (port 8181) - HEALTHY
- ✅ Backend API (port 4000) - HEALTHY
- ✅ Frontend (port 3000) - HEALTHY

### 1.4 Terraform Configuration
**Status:** ✅ **PASS**

**Resources Created:**
- ✅ france-mock-idp realm
- ✅ canada-mock-idp realm
- ✅ industry-mock-idp realm
- ✅ France SAML IdP broker (france-idp)
- ✅ Canada OIDC IdP broker (canada-idp)
- ✅ Industry OIDC IdP broker (industry-idp)
- ✅ Test users in all 3 new realms
- ✅ SAML attribute mappers (4 for France)
- ✅ OIDC protocol mappers (4 for Canada, 2 for Industry)
- ✅ IdP broker mappers in dive-v3-pilot realm

---

## 2. Manual Test Scenarios

### 2.1 France SAML IdP Tests

#### Test Case FR-01: French User Login
**Objective:** Verify France SAML IdP authentication flow

**Preconditions:**
- Keycloak running with france-mock-idp realm
- Test user: testuser-fra exists

**Steps:**
1. Navigate to `http://localhost:3000`
2. Click "France (SAML)" IdP button
3. Log in with credentials:
   - Username: `testuser-fra`
   - Password: `Password123!`
4. Verify redirect to dashboard

**Expected Results:**
- ✅ User redirected to Keycloak france-mock-idp realm
- ✅ Successful authentication
- ✅ Redirect to dashboard with session established
- ✅ Dashboard displays:
  - Name: Pierre Dubois
  - Email: pierre.dubois@defense.gouv.fr
  - uniqueID: pierre.dubois@defense.gouv.fr
  - clearance: SECRET
  - countryOfAffiliation: FRA
  - acpCOI: ["NATO-COSMIC"]

**Status:** ⏳ PENDING MANUAL TEST

---

#### Test Case FR-02: French User Resource Access - ALLOW
**Objective:** Verify French user can access France-releasable resource

**Preconditions:**
- FR-01 passed (user logged in)
- Resource exists: doc-fra-defense

**Steps:**
1. Navigate to `http://localhost:3000/resources`
2. Click on resource "doc-fra-defense"
3. Verify access decision

**Expected Results:**
- ✅ Resource detail page displays
- ✅ Green "Access Granted" banner shown
- ✅ Document content visible
- ✅ Classification badge: SECRET (yellow)
- ✅ Releasability: [FRA]
- ✅ Evaluation details show:
  - clearance_check: PASS (SECRET >= SECRET)
  - releasability_check: PASS (FRA in [FRA])
  - coi_check: PASS (no COI required)

**Status:** ⏳ PENDING MANUAL TEST

---

#### Test Case FR-03: French User Resource Access - DENY
**Objective:** Verify French user cannot access USA-only resource

**Preconditions:**
- FR-01 passed (user logged in)
- Resource exists: doc-us-only-tactical

**Steps:**
1. Navigate to `http://localhost:3000/resources`
2. Click on resource "doc-us-only-tactical"
3. Verify access decision

**Expected Results:**
- ✅ Resource detail page displays
- ✅ Red "Access Denied" banner shown
- ✅ No document content visible
- ✅ Failure reason displayed: "Country FRA not in releasabilityTo: [USA]"
- ✅ Evaluation details show:
  - clearance_check: PASS (SECRET >= SECRET)
  - releasability_check: FAIL (FRA not in [USA])
  - coi_check: FAIL (NATO-COSMIC not in [US-ONLY])

**Status:** ⏳ PENDING MANUAL TEST

---

#### Test Case FR-04: SAML Attribute Mapping
**Objective:** Verify French URN attributes correctly mapped to standard claims

**Preconditions:**
- FR-01 passed (user logged in)

**Steps:**
1. Open browser developer tools (F12)
2. Navigate to Network tab
3. Make authenticated API call to `/api/resources`
4. Inspect JWT token in Authorization header
5. Decode JWT at jwt.io

**Expected Results:**
- ✅ Token contains claims:
  - `uniqueID`: "pierre.dubois@defense.gouv.fr"
  - `clearance`: "SECRET" (not "SECRET_DEFENSE")
  - `countryOfAffiliation`: "FRA"
  - `acpCOI`: contains "NATO-COSMIC"
- ✅ No URN-style attributes in token
- ✅ All claim names match DIVE standard

**Status:** ⏳ PENDING MANUAL TEST

---

### 2.2 Canada OIDC IdP Tests

#### Test Case CA-01: Canadian User Login
**Objective:** Verify Canada OIDC IdP authentication flow

**Preconditions:**
- Keycloak running with canada-mock-idp realm
- Test user: testuser-can exists

**Steps:**
1. Navigate to `http://localhost:3000`
2. Click "Canada (OIDC)" IdP button
3. Log in with credentials:
   - Username: `testuser-can`
   - Password: `Password123!`
4. Verify redirect to dashboard

**Expected Results:**
- ✅ User redirected to Keycloak canada-mock-idp realm
- ✅ Successful authentication
- ✅ Redirect to dashboard with session established
- ✅ Dashboard displays:
  - Name: John MacDonald
  - Email: john.macdonald@forces.gc.ca
  - uniqueID: john.macdonald@forces.gc.ca
  - clearance: CONFIDENTIAL
  - countryOfAffiliation: CAN
  - acpCOI: ["CAN-US"]

**Status:** ⏳ PENDING MANUAL TEST

---

#### Test Case CA-02: Canadian User Resource Access - ALLOW
**Objective:** Verify Canadian user can access Canada-releasable resource

**Preconditions:**
- CA-01 passed (user logged in)
- Resource exists: doc-can-logistics

**Steps:**
1. Navigate to `http://localhost:3000/resources`
2. Click on resource "doc-can-logistics"
3. Verify access decision

**Expected Results:**
- ✅ Resource detail page displays
- ✅ Green "Access Granted" banner shown
- ✅ Document content visible
- ✅ Classification badge: CONFIDENTIAL (blue)
- ✅ Releasability: [CAN, USA]
- ✅ Evaluation details show:
  - clearance_check: PASS (CONFIDENTIAL >= CONFIDENTIAL)
  - releasability_check: PASS (CAN in [CAN, USA])
  - coi_check: PASS (CAN-US intersection)

**Status:** ⏳ PENDING MANUAL TEST

---

#### Test Case CA-03: Canadian User Resource Access - DENY (Clearance)
**Objective:** Verify Canadian user cannot access SECRET resource with CONFIDENTIAL clearance

**Preconditions:**
- CA-01 passed (user logged in)
- Resource exists: doc-fvey-intel

**Steps:**
1. Navigate to `http://localhost:3000/resources`
2. Click on resource "doc-fvey-intel"
3. Verify access decision

**Expected Results:**
- ✅ Resource detail page displays
- ✅ Red "Access Denied" banner shown
- ✅ No document content visible
- ✅ Failure reason displayed: "Insufficient clearance: CONFIDENTIAL < TOP_SECRET"
- ✅ Evaluation details show:
  - clearance_check: FAIL (CONFIDENTIAL < TOP_SECRET)

**Status:** ⏳ PENDING MANUAL TEST

---

### 2.3 Industry OIDC IdP Tests (Enrichment)

#### Test Case IND-01: Industry User Login with Enrichment
**Objective:** Verify Industry IdP authentication and claim enrichment

**Preconditions:**
- Keycloak running with industry-mock-idp realm
- Test user: bob.contractor exists

**Steps:**
1. Navigate to `http://localhost:3000`
2. Click "Industry Partner (OIDC)" IdP button
3. Log in with credentials:
   - Username: `bob.contractor`
   - Password: `Password123!`
4. Verify redirect to dashboard
5. Check backend logs for enrichment entries

**Expected Results:**
- ✅ User redirected to Keycloak industry-mock-idp realm
- ✅ Successful authentication
- ✅ Redirect to dashboard with session established
- ✅ Dashboard displays:
  - Name: Bob Contractor
  - Email: bob.contractor@lockheed.com
  - uniqueID: bob.contractor@lockheed.com
  - clearance: UNCLASSIFIED (enriched, marked with indicator)
  - countryOfAffiliation: USA (enriched from email domain)
  - acpCOI: [] (enriched, empty)
- ✅ Backend logs show enrichment:
  ```json
  {
    "service": "enrichment",
    "message": "Attributes enriched",
    "enrichments": [
      "countryOfAffiliation=USA (inferred from email, confidence=high)",
      "clearance=UNCLASSIFIED (default)",
      "acpCOI=[] (default)"
    ]
  }
  ```

**Status:** ⏳ PENDING MANUAL TEST

---

#### Test Case IND-02: Industry User Resource Access - ALLOW
**Objective:** Verify enriched attributes work correctly for authorization

**Preconditions:**
- IND-01 passed (user logged in with enrichment)
- Resource exists: doc-industry-partner

**Steps:**
1. Navigate to `http://localhost:3000/resources`
2. Click on resource "doc-industry-partner"
3. Verify access decision

**Expected Results:**
- ✅ Resource detail page displays
- ✅ Green "Access Granted" banner shown
- ✅ Document content visible
- ✅ Classification badge: UNCLASSIFIED (green)
- ✅ Releasability: [USA]
- ✅ Evaluation details show:
  - clearance_check: PASS (UNCLASSIFIED >= UNCLASSIFIED)
  - releasability_check: PASS (USA in [USA])
  - coi_check: PASS (no COI required)

**Status:** ⏳ PENDING MANUAL TEST

---

#### Test Case IND-03: Industry User Resource Access - DENY (Clearance)
**Objective:** Verify enriched UNCLASSIFIED clearance properly restricts access

**Preconditions:**
- IND-01 passed (user logged in with enrichment)
- Resource exists: doc-fvey-intel

**Steps:**
1. Navigate to `http://localhost:3000/resources`
2. Click on resource "doc-fvey-intel"
3. Verify access decision

**Expected Results:**
- ✅ Resource detail page displays
- ✅ Red "Access Denied" banner shown
- ✅ No document content visible
- ✅ Failure reason displayed: "Insufficient clearance: UNCLASSIFIED < TOP_SECRET"
- ✅ Evaluation details show:
  - clearance_check: FAIL (UNCLASSIFIED < TOP_SECRET)

**Status:** ⏳ PENDING MANUAL TEST

---

#### Test Case IND-04: Enrichment Audit Trail
**Objective:** Verify all enrichments are logged for compliance

**Preconditions:**
- IND-01 passed (user logged in with enrichment)

**Steps:**
1. SSH into backend container or view logs:
   ```bash
   docker-compose logs backend | grep enrichment
   ```
2. Find enrichment log entry for bob.contractor
3. Verify log structure

**Expected Results:**
- ✅ Log entry exists with structure:
  ```json
  {
    "timestamp": "2025-10-11T...",
    "level": "info",
    "service": "enrichment",
    "message": "Attributes enriched",
    "requestId": "req-...",
    "uniqueID": "bob.contractor@lockheed.com",
    "enrichments": [
      "countryOfAffiliation=USA (inferred from email, confidence=high)",
      "clearance=UNCLASSIFIED (default)",
      "acpCOI=[] (default)"
    ],
    "originalClaims": {
      "clearance": null,
      "countryOfAffiliation": null,
      "acpCOI": null
    },
    "enrichedClaims": {
      "clearance": "UNCLASSIFIED",
      "countryOfAffiliation": "USA",
      "acpCOI": "[]"
    }
  }
  ```
- ✅ No PII logged (no full name, only uniqueID)
- ✅ Email domain logged (for inference audit)

**Status:** ⏳ PENDING MANUAL TEST

---

### 2.4 Cross-IdP Resource Access Matrix

#### Test Case CROSS-01: Resource Access Matrix
**Objective:** Verify authorization decisions work correctly across all IdPs

**Test Matrix:**

| User | Resource | Expected Result | Reason |
|------|----------|----------------|--------|
| testuser-fra (SECRET, FRA) | doc-fra-defense | ALLOW | Clearance + Country match |
| testuser-fra (SECRET, FRA) | doc-us-only-tactical | DENY | Country mismatch (FRA not in [USA]) |
| testuser-fra (SECRET, FRA, NATO-COSMIC) | doc-nato-ops-001 | ALLOW | All checks pass |
| testuser-can (CONFIDENTIAL, CAN) | doc-can-logistics | ALLOW | Clearance + Country match |
| testuser-can (CONFIDENTIAL, CAN) | doc-fvey-intel | DENY | Insufficient clearance |
| testuser-can (CONFIDENTIAL, CAN) | doc-us-only-tactical | DENY | Country mismatch + COI |
| bob.contractor (UNCLASSIFIED, USA) | doc-industry-partner | ALLOW | UNCLASSIFIED resource |
| bob.contractor (UNCLASSIFIED, USA) | doc-fvey-intel | DENY | Insufficient clearance |
| bob.contractor (UNCLASSIFIED, USA) | doc-fra-defense | DENY | Country mismatch + Clearance |

**Steps:**
1. Test each user/resource combination
2. Record actual result
3. Compare to expected result
4. Investigate any mismatches

**Expected Results:**
- ✅ All 9 test cases match expected results
- ✅ Denial reasons are clear and accurate
- ✅ Evaluation details explain each decision

**Status:** ⏳ PENDING MANUAL TEST

---

### 2.5 Session Management & Logout

#### Test Case SESSION-01: Multi-IdP Session Isolation
**Objective:** Verify separate sessions for different IdPs

**Steps:**
1. Log in as testuser-fra (France IdP)
2. Note session cookie
3. Log out
4. Log in as testuser-can (Canada IdP)
5. Note session cookie
6. Verify cookies are different

**Expected Results:**
- ✅ Different session IDs for different IdPs
- ✅ Logout from one IdP doesn't affect ability to log in via another
- ✅ Session data correctly tied to IdP source

**Status:** ⏳ PENDING MANUAL TEST

---

#### Test Case SESSION-02: Federated Logout
**Objective:** Verify logout works across all IdPs

**Test for Each IdP:**
1. Log in via IdP (France/Canada/Industry)
2. Click logout button
3. Verify redirect to home page
4. Verify session cleared
5. Attempt to access protected resource
6. Verify redirected to login

**Expected Results:**
- ✅ France SAML: Federated logout works
- ✅ Canada OIDC: Federated logout works
- ✅ Industry OIDC: Federated logout works
- ✅ Session cookie cleared
- ✅ Backend API returns 401 for protected resources

**Status:** ⏳ PENDING MANUAL TEST

---

### 2.6 Edge Cases & Error Handling

#### Test Case EDGE-01: Invalid Country Code Rejection
**Objective:** Verify OPA policy rejects invalid country codes

**Preconditions:**
- Modify test user in Keycloak to have invalid country code

**Steps:**
1. In Keycloak Admin Console, edit testuser-fra
2. Change countryOfAffiliation attribute to "FR" (should be "FRA")
3. Log in as testuser-fra
4. Attempt to access any resource

**Expected Results:**
- ✅ Authorization denied
- ✅ OPA logs show: "Invalid country code: FR (must be ISO 3166-1 alpha-3)"
- ✅ Frontend displays clear error message

**Status:** ⏳ PENDING MANUAL TEST

---

#### Test Case EDGE-02: Missing Email for Enrichment
**Objective:** Verify enrichment fails securely when email is missing

**Preconditions:**
- Modify bob.contractor in Keycloak to remove email

**Steps:**
1. Remove email attribute from bob.contractor
2. Attempt to log in as bob.contractor
3. Attempt to access resource

**Expected Results:**
- ✅ Enrichment middleware returns 403 Forbidden
- ✅ Backend logs show: "Cannot infer country: no email provided"
- ✅ User cannot access resources
- ✅ Clear error message displayed

**Status:** ⏳ PENDING MANUAL TEST

---

#### Test Case EDGE-03: Unknown Email Domain Enrichment
**Objective:** Verify enrichment defaults to USA with low confidence for unknown domains

**Preconditions:**
- Create new Industry user with unknown email domain

**Steps:**
1. Create user test.user@unknown-company.com in industry-mock-idp
2. Log in as test.user
3. Check backend enrichment logs
4. Verify countryOfAffiliation set to USA

**Expected Results:**
- ✅ countryOfAffiliation enriched to USA
- ✅ Backend logs show:
  ```json
  {
    "message": "Unknown email domain, defaulting to USA",
    "domain": "unknown-company.com",
    "confidence": "low"
  }
  ```
- ✅ Enrichment logged with low confidence flag

**Status:** ⏳ PENDING MANUAL TEST

---

## 3. Performance & Load Testing

### Test Case PERF-01: OPA Decision Latency
**Objective:** Measure authorization decision latency

**Method:**
```bash
# Make 100 requests and measure response time
for i in {1..100}; do
  curl -w "%{time_total}\n" -o /dev/null -s \
    -H "Authorization: Bearer $TOKEN" \
    http://localhost:4000/api/resources/doc-nato-ops-001
done | awk '{sum+=$1; count++} END {print "Average:", sum/count*1000, "ms"}'
```

**Expected Results:**
- ✅ Average latency < 200ms (p95)
- ✅ Enrichment overhead < 10ms
- ✅ OPA decision < 50ms
- ✅ No performance degradation after 100 requests

**Status:** ⏳ PENDING PERFORMANCE TEST

---

### Test Case PERF-02: Concurrent Multi-IdP Requests
**Objective:** Verify system handles concurrent requests from multiple IdPs

**Method:**
```bash
# Concurrent requests from different IdPs
ab -n 1000 -c 10 -H "Authorization: Bearer $TOKEN_US" http://localhost:4000/api/resources/doc-nato-ops-001 &
ab -n 1000 -c 10 -H "Authorization: Bearer $TOKEN_FRA" http://localhost:4000/api/resources/doc-fra-defense &
ab -n 1000 -c 10 -H "Authorization: Bearer $TOKEN_CAN" http://localhost:4000/api/resources/doc-can-logistics &
wait
```

**Expected Results:**
- ✅ All requests processed successfully
- ✅ No session interference between IdPs
- ✅ No cache collision issues
- ✅ Consistent authorization decisions

**Status:** ⏳ PENDING PERFORMANCE TEST

---

## 4. Security Testing

### Test Case SEC-01: JWT Signature Validation
**Objective:** Verify backend rejects tampered JWT tokens

**Steps:**
1. Obtain valid JWT token
2. Modify payload (change clearance to TOP_SECRET)
3. Submit request with modified token

**Expected Results:**
- ✅ Backend returns 401 Unauthorized
- ✅ Backend logs show "JWT verification failed"
- ✅ No authorization decision made

**Status:** ⏳ PENDING SECURITY TEST

---

### Test Case SEC-02: PII Minimization in Logs
**Objective:** Verify no PII leaked in logs

**Steps:**
1. Perform several authenticated requests
2. Check all log files:
   - backend/logs/app.log
   - backend/logs/authz.log
   - docker-compose logs backend

**Expected Results:**
- ✅ No full names logged
- ✅ No email addresses logged (except domain for enrichment)
- ✅ Only uniqueID logged for user identification
- ✅ No passwords in logs
- ✅ No JWT tokens in logs (only "Bearer ..." prefix)

**Status:** ⏳ PENDING SECURITY TEST

---

### Test Case SEC-03: Enrichment Cannot Override Valid Claims
**Objective:** Verify enrichment only fills missing attributes, doesn't override

**Steps:**
1. Create test user with valid clearance: SECRET
2. Log in and intercept enrichment logic
3. Verify clearance remains SECRET (not changed to UNCLASSIFIED)

**Expected Results:**
- ✅ Existing clearance not overridden
- ✅ Enrichment logs show "No enrichment needed"
- ✅ wasEnriched flag = false

**Status:** ⏳ PENDING SECURITY TEST

---

## 5. Compliance & Audit

### Test Case AUDIT-01: Authorization Decision Audit Trail
**Objective:** Verify all authorization decisions logged for 90-day retention

**Steps:**
1. Perform various authorization requests (allow and deny)
2. Check authz.log file
3. Verify log structure and completeness

**Expected Results:**
- ✅ Every authorization decision logged
- ✅ Log contains required fields:
  - timestamp
  - requestId
  - subject (uniqueID)
  - resource (resourceId)
  - decision (ALLOW/DENY)
  - reason
  - latency_ms
- ✅ Both ALLOW and DENY logged equally
- ✅ Logs structured as JSON for parsing

**Status:** ⏳ PENDING AUDIT TEST

---

### Test Case AUDIT-02: Enrichment Audit Trail
**Objective:** Verify all enrichments logged for compliance review

**Steps:**
1. Log in as Industry user (triggers enrichment)
2. Check backend logs for enrichment entries
3. Verify completeness

**Expected Results:**
- ✅ Every enrichment logged with:
  - Original claim values (null/missing)
  - Enriched claim values
  - Inference method (email domain/default)
  - Confidence level (high/low)
- ✅ Timestamp and requestId included
- ✅ Logs retained for audit review

**Status:** ⏳ PENDING AUDIT TEST

---

## 6. Integration Testing

### Test Case INT-01: End-to-End Flow (France)
**Objective:** Complete end-to-end flow from login to resource access

**Steps:**
1. Start at home page
2. Select France IdP
3. Authenticate as testuser-fra
4. View dashboard (verify attributes)
5. Navigate to resources list
6. Select doc-fra-defense
7. Verify access granted
8. View document content
9. Navigate back to resources
10. Select doc-us-only-tactical
11. Verify access denied
12. Logout
13. Verify redirected to home

**Expected Results:**
- ✅ Entire flow completes without errors
- ✅ All page transitions smooth
- ✅ Authorization decisions correct at each step
- ✅ Session maintained throughout
- ✅ Logout cleans up session

**Status:** ⏳ PENDING INTEGRATION TEST

---

### Test Case INT-02: End-to-End Flow (Canada)
**Objective:** Complete end-to-end flow from login to resource access

**Steps:** (Same as INT-01, but with testuser-can and doc-can-logistics)

**Expected Results:** (Same as INT-01, with Canadian-specific resources)

**Status:** ⏳ PENDING INTEGRATION TEST

---

### Test Case INT-03: End-to-End Flow (Industry + Enrichment)
**Objective:** Complete end-to-end flow with enrichment

**Steps:**
1. Start at home page
2. Select Industry IdP
3. Authenticate as bob.contractor
4. View dashboard (verify enriched attributes marked)
5. Check backend logs for enrichment
6. Navigate to resources list
7. Select doc-industry-partner
8. Verify access granted
9. Select doc-fvey-intel
10. Verify access denied (clearance)
11. Logout

**Expected Results:**
- ✅ Enrichment occurs transparently
- ✅ Dashboard indicates enriched attributes
- ✅ Authorization decisions based on enriched values
- ✅ Audit trail complete

**Status:** ⏳ PENDING INTEGRATION TEST

---

## 7. Regression Testing (Week 2 Functionality)

### Test Case REG-01: U.S. IdP Still Works
**Objective:** Verify Week 1/2 functionality not broken by Week 3 changes

**Steps:**
1. Log in as testuser-us (existing U.S. user)
2. Run all 8 Week 2 manual test scenarios
3. Verify results match Week 2 baseline

**Expected Results:**
- ✅ All 8 Week 2 scenarios still pass
- ✅ No regression in U.S. IdP functionality
- ✅ Authorization decisions unchanged

**Status:** ⏳ PENDING REGRESSION TEST

---

## 8. Documentation Review

### Test Case DOC-01: Test User Credentials
**Objective:** Verify all test users documented and accessible

**Checklist:**
- ✅ testuser-us credentials documented
- ✅ testuser-fra credentials documented
- ✅ testuser-can credentials documented
- ✅ bob.contractor credentials documented
- ✅ All passwords consistent (Password123!)
- ✅ Realm assignments clear

**Status:** ✅ **PASS** (documented in WEEK3-STATUS.md)

---

### Test Case DOC-02: API Endpoints Updated
**Objective:** Verify all API documentation reflects enrichment middleware

**Checklist:**
- ✅ Enrichment middleware documented
- ✅ Route order documented (enrichment → authz)
- ✅ Enrichment log format documented
- ✅ Error responses documented

**Status:** ✅ **PASS** (documented in WEEK3-STATUS.md)

---

## 9. Test Summary Dashboard

### Automated Tests
| Category | Total | Pass | Fail | Status |
|----------|-------|------|------|--------|
| OPA Tests | 78 | 78 | 0 | ✅ PASS |
| TypeScript (Backend) | 1 | 1 | 0 | ✅ PASS |
| TypeScript (Frontend) | 1 | 1 | 0 | ✅ PASS |
| Infrastructure Health | 7 | 7 | 0 | ✅ PASS |
| Terraform Apply | 32 | 32 | 0 | ✅ PASS |

### Manual Tests (To Be Executed)
| Category | Test Cases | Status |
|----------|-----------|--------|
| France SAML IdP | 4 | ⏳ PENDING |
| Canada OIDC IdP | 3 | ⏳ PENDING |
| Industry IdP + Enrichment | 4 | ⏳ PENDING |
| Cross-IdP Matrix | 1 | ⏳ PENDING |
| Session Management | 2 | ⏳ PENDING |
| Edge Cases | 3 | ⏳ PENDING |
| Performance | 2 | ⏳ PENDING |
| Security | 3 | ⏳ PENDING |
| Audit | 2 | ⏳ PENDING |
| Integration | 3 | ⏳ PENDING |
| Regression | 1 | ⏳ PENDING |
| Documentation | 2 | ✅ PASS |

**Total Manual Test Cases:** 30  
**Completed:** 2  
**Pending:** 28

---

## 10. Test Execution Instructions

### Quick Start Manual Testing
```bash
# 1. Ensure all services running
docker-compose ps

# 2. Verify Keycloak has all 4 IdPs
open http://localhost:8081/admin/dive-v3-pilot/console/#/dive-v3-pilot/identity-providers

# 3. Start frontend
cd frontend && npm run dev

# 4. Open browser to test
open http://localhost:3000

# 5. Monitor backend logs for enrichment
docker-compose logs -f backend | grep enrichment
```

### Test User Reference
```
U.S. IdP (dive-v3-pilot realm):
  - testuser-us / Password123! (SECRET, USA, [NATO-COSMIC, FVEY])
  - testuser-us-confid / Password123! (CONFIDENTIAL, USA, [FVEY])
  - testuser-us-unclass / Password123! (UNCLASSIFIED, USA, [])

France IdP (france-mock-idp realm):
  - testuser-fra / Password123! (SECRET, FRA, [NATO-COSMIC])

Canada IdP (canada-mock-idp realm):
  - testuser-can / Password123! (CONFIDENTIAL, CAN, [CAN-US])

Industry IdP (industry-mock-idp realm):
  - bob.contractor / Password123! (UNCLASSIFIED enriched, USA enriched, [])
```

### Resource Reference (MongoDB)
```
doc-nato-ops-001: SECRET, [USA, FRA, GBR, CAN, DEU], [NATO-COSMIC]
doc-fra-defense: SECRET, [FRA], []
doc-can-logistics: CONFIDENTIAL, [CAN, USA], [CAN-US]
doc-us-only-tactical: SECRET, [USA], [US-ONLY]
doc-fvey-intel: TOP_SECRET, [USA, GBR, CAN, AUS, NZL], [FVEY]
doc-industry-partner: UNCLASSIFIED, [USA], []
doc-unclass-public: UNCLASSIFIED, [USA, FRA, GBR, CAN], []
doc-future-embargo: SECRET, [USA], [], creationDate: 2025-11-01
```

---

## 11. Test Sign-Off

### QA Analyst Review
**Name:** _______________________  
**Date:** _______________________  
**Signature:** __________________

### Automated Test Results
- ✅ OPA Tests: 78/78 PASS
- ✅ TypeScript: No errors
- ✅ Infrastructure: All services healthy
- ✅ Terraform: Applied successfully

### Manual Test Execution Required
**Estimated Time:** 4-6 hours for complete manual test suite

**Priority Test Cases (Minimum Required):**
1. FR-01: French User Login ⏳
2. CA-01: Canadian User Login ⏳
3. IND-01: Industry User Login with Enrichment ⏳
4. CROSS-01: Resource Access Matrix ⏳
5. REG-01: U.S. IdP Regression Test ⏳

**Sign-off Criteria:**
- [ ] All priority test cases pass
- [ ] No critical defects found
- [ ] Enrichment audit trail verified
- [ ] Multi-IdP session isolation confirmed
- [ ] All documentation updated

---

**Test Plan Status:** ✅ **READY FOR MANUAL EXECUTION**  
**Automated Tests:** ✅ **100% PASS**  
**Manual Tests:** ⏳ **PENDING USER EXECUTION**

