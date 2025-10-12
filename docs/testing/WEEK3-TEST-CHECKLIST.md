# Week 3 Manual Test Execution Checklist

**Quick Reference for Manual Testing**

---

## ✅ PRE-TEST VERIFICATION (All Passing)

- [x] OPA Tests: 78/78 PASS
- [x] TypeScript Compilation: 0 errors
- [x] Terraform Applied: 27 resources created
- [x] All Services Running (7/7 healthy)

---

## 🧪 PRIORITY TEST SCENARIOS (Execute These First)

### 1. France SAML IdP Login ⏳
```
URL: http://localhost:3000
Click: France (SAML) button
Login: testuser-fra / Password123!
Verify: Dashboard shows FRA attributes
Time: ~5 minutes
```

**Verification Points:**
- [ ] Login successful
- [ ] Dashboard displays Pierre Dubois
- [ ] Email: pierre.dubois@defense.gouv.fr
- [ ] clearance: SECRET
- [ ] countryOfAffiliation: FRA
- [ ] acpCOI: ["NATO-COSMIC"]

---

### 2. Canada OIDC IdP Login ⏳
```
URL: http://localhost:3000
Click: Canada (OIDC) button
Login: testuser-can / Password123!
Verify: Dashboard shows CAN attributes
Time: ~5 minutes
```

**Verification Points:**
- [ ] Login successful
- [ ] Dashboard displays John MacDonald
- [ ] Email: john.macdonald@forces.gc.ca
- [ ] clearance: CONFIDENTIAL
- [ ] countryOfAffiliation: CAN
- [ ] acpCOI: ["CAN-US"]

---

### 3. Industry OIDC IdP Login + Enrichment ⏳
```
URL: http://localhost:3000
Click: Industry Partner (OIDC) button
Login: bob.contractor / Password123!
Verify: Dashboard shows enriched attributes
Check: Backend logs for enrichment entry
Time: ~10 minutes
```

**Verification Points:**
- [ ] Login successful
- [ ] Dashboard displays Bob Contractor
- [ ] Email: bob.contractor@lockheed.com
- [ ] clearance: UNCLASSIFIED (with enrichment indicator)
- [ ] countryOfAffiliation: USA (enriched from email)
- [ ] acpCOI: [] (empty, enriched)

**Backend Log Check:**
```bash
docker-compose logs backend | grep enrichment | tail -20
```
- [ ] Log shows enrichment entry
- [ ] countryOfAffiliation=USA (inferred from email, confidence=high)
- [ ] clearance=UNCLASSIFIED (default)
- [ ] acpCOI=[] (default)

---

### 4. Cross-IdP Resource Access Matrix ⏳

**France User (testuser-fra):**
```
Resource: doc-fra-defense (SECRET, [FRA])
Expected: ✅ ALLOW
Time: ~3 minutes
```
- [ ] Access granted with green banner
- [ ] Document content visible
- [ ] Evaluation shows all checks pass

```
Resource: doc-us-only-tactical (SECRET, [USA])
Expected: ❌ DENY
Time: ~3 minutes
```
- [ ] Access denied with red banner
- [ ] Failure reason: "Country FRA not in releasabilityTo: [USA]"
- [ ] No document content shown

**Canada User (testuser-can):**
```
Resource: doc-can-logistics (CONFIDENTIAL, [CAN, USA])
Expected: ✅ ALLOW
Time: ~3 minutes
```
- [ ] Access granted with green banner
- [ ] Document content visible

```
Resource: doc-fvey-intel (TOP_SECRET, [FVEY])
Expected: ❌ DENY
Time: ~3 minutes
```
- [ ] Access denied with red banner
- [ ] Failure reason: "Insufficient clearance: CONFIDENTIAL < TOP_SECRET"

**Industry User (bob.contractor):**
```
Resource: doc-industry-partner (UNCLASSIFIED, [USA])
Expected: ✅ ALLOW
Time: ~3 minutes
```
- [ ] Access granted with green banner
- [ ] Document content visible

```
Resource: doc-fvey-intel (TOP_SECRET, [FVEY])
Expected: ❌ DENY
Time: ~3 minutes
```
- [ ] Access denied with red banner
- [ ] Failure reason: "Insufficient clearance: UNCLASSIFIED < TOP_SECRET"

---

### 5. U.S. IdP Regression Test ⏳
```
URL: http://localhost:3000
Click: U.S. DoD button (or login without IdP selection)
Login: testuser-us / Password123!
Test: All 8 Week 2 scenarios
Time: ~30 minutes
```

**Week 2 Scenarios (Quick Check):**
- [ ] testuser-us → doc-nato-ops-001: ✅ ALLOW
- [ ] testuser-us-unclass → doc-unclass-public: ✅ ALLOW
- [ ] testuser-us → doc-industry-partner: ✅ ALLOW
- [ ] testuser-us-confid → doc-fvey-intel: ❌ DENY (clearance)
- [ ] testuser-us → doc-fra-defense: ❌ DENY (country)
- [ ] testuser-us-confid → doc-us-only-tactical: ❌ DENY (clearance+COI)
- [ ] testuser-us → doc-future-embargo: ❌ DENY (embargo)
- [ ] testuser-us-unclass → doc-nato-ops-001: ❌ DENY (clearance+COI)

---

## 📋 ADDITIONAL TEST SCENARIOS (If Time Permits)

### Session Management
- [ ] Test SESSION-01: Multi-IdP session isolation
- [ ] Test SESSION-02: Federated logout (all 4 IdPs)

### Edge Cases
- [ ] Test EDGE-01: Invalid country code rejection
- [ ] Test EDGE-02: Missing email for enrichment
- [ ] Test EDGE-03: Unknown email domain enrichment

### Security
- [ ] Test SEC-01: JWT signature validation (tampered token)
- [ ] Test SEC-02: PII minimization in logs
- [ ] Test SEC-03: Enrichment doesn't override valid claims

### Audit
- [ ] Test AUDIT-01: Authorization decision audit trail
- [ ] Test AUDIT-02: Enrichment audit trail

---

## 🔍 VERIFICATION COMMANDS

### Check All Services Running
```bash
docker-compose ps
# Should show 7 services running
```

### Check OPA Tests
```bash
docker-compose exec opa opa test /policies/ -v
# Should show: PASS: 78/78
```

### Check Backend Logs (Enrichment)
```bash
docker-compose logs backend | grep enrichment
# Should show enrichment entries when Industry user logs in
```

### Check Backend Logs (Authorization)
```bash
docker-compose logs backend | grep "Authorization decision"
# Should show ALLOW/DENY decisions
```

### Verify IdPs in Keycloak
```bash
open http://localhost:8081/admin/dive-v3-pilot/console/#/dive-v3-pilot/identity-providers
# Should show: us-idp, france-idp, canada-idp, industry-idp
```

### Check Test Users
```bash
# France realm
open http://localhost:8081/admin/france-mock-idp/console/#/france-mock-idp/users

# Canada realm
open http://localhost:8081/admin/canada-mock-idp/console/#/canada-mock-idp/users

# Industry realm
open http://localhost:8081/admin/industry-mock-idp/console/#/industry-mock-idp/users
```

---

## 📊 TEST RESULTS TRACKING

### Priority Tests (5)
- [ ] FR-01: France Login
- [ ] CA-01: Canada Login
- [ ] IND-01: Industry Login + Enrichment
- [ ] CROSS-01: Resource Access Matrix (9 test cases)
- [ ] REG-01: U.S. IdP Regression (8 test cases)

**Total Critical Test Cases:** 22  
**Estimated Time:** 60-90 minutes

### Pass/Fail Summary
- Passed: _____ / 22
- Failed: _____ / 22
- Blocked: _____ / 22

### Critical Defects Found
```
[Record any critical issues here]

Example:
- Defect #1: [Description]
  Severity: Critical/High/Medium/Low
  Steps to Reproduce: [...]
  Expected: [...]
  Actual: [...]
```

---

## ✅ SIGN-OFF CRITERIA

Week 3 is **100% COMPLETE** when:

1. **Automated Tests:**
   - [x] 78/78 OPA tests passing
   - [x] TypeScript compilation clean
   - [x] All services healthy

2. **Manual Tests (Minimum):**
   - [ ] All 5 priority tests pass
   - [ ] Resource access matrix: 9/9 correct decisions
   - [ ] U.S. IdP regression: 8/8 scenarios pass

3. **Documentation:**
   - [x] WEEK3-STATUS.md complete
   - [x] CHANGELOG.md updated
   - [x] README.md updated
   - [x] Test plan created

4. **Deployment:**
   - [x] Terraform applied successfully
   - [x] All 4 IdPs configured
   - [x] Test users created

---

## 🎯 FINAL CHECKLIST

Before claiming Week 3 complete:

- [ ] All priority manual tests executed and passed
- [ ] No critical defects found
- [ ] Enrichment verified with logs
- [ ] Cross-IdP authorization working correctly
- [ ] U.S. IdP (Week 2) still works (no regression)
- [ ] Screenshots captured for demo (optional)
- [ ] Test results documented

**Manual Test Completion:** _____ %  
**Overall Week 3 Status:** ⏳ **READY FOR MANUAL TEST EXECUTION**

---

## 📞 Support

**If Issues Encountered:**
1. Check service health: `docker-compose ps`
2. Check backend logs: `docker-compose logs backend`
3. Check OPA logs: `docker-compose logs opa`
4. Restart services: `docker-compose restart`
5. Re-run preflight: `./scripts/preflight-check.sh`

**Reference Documentation:**
- Full Test Plan: `docs/testing/WEEK3-QA-TEST-PLAN.md`
- Implementation Status: `docs/WEEK3-STATUS.md`
- Week 2 Baseline: `WEEK2-COMPLETE.md`

