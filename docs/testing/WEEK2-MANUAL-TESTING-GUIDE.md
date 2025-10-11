# DIVE V3 - Week 2 Manual Testing Guide

**Purpose:** Verify all 8 authorization scenarios work correctly with the PEP/PDP integration  
**Date:** October 11, 2025  
**Prerequisites:** All infrastructure services running, frontend and backend started

---

## Quick Start

### 1. Ensure Infrastructure is Running

```bash
# Check Docker services
docker-compose ps

# Should show:
# - dive-v3-keycloak (port 8081) - Keycloak
# - dive-v3-mongo (port 27017) - MongoDB
# - dive-v3-opa (port 8181) - OPA
# - dive-v3-postgres (port 5433) - PostgreSQL
```

### 2. Start Frontend and Backend

**Terminal 1 - Backend:**
```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/backend
npm install  # if not already done
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/frontend
npm install --legacy-peer-deps  # if not already done
npm run dev
```

### 3. Verify Services

- Frontend: http://localhost:3000 (should show home page)
- Backend: http://localhost:4000/health (should return `{"status":"ok"}`)
- Keycloak: http://localhost:8081/admin (admin/admin)
- OPA: http://localhost:8181/health (should return `{"status":"ok"}`)

---

## Test Users

All test users are pre-configured in Keycloak:

| Username | Password | uniqueID | Clearance | Country | COI |
|----------|----------|----------|-----------|---------|-----|
| `testuser-us` | `Password123!` | john.doe@mil | SECRET | USA | [NATO-COSMIC, FVEY] |
| `testuser-us-confid` | `Password123!` | jane.smith@mil | CONFIDENTIAL | USA | [FVEY] |
| `testuser-us-unclass` | `Password123!` | bob.jones@mil | UNCLASSIFIED | USA | [] |

---

## Test Resources

8 sample resources are pre-seeded in MongoDB:

| Resource ID | Classification | Releasable To | COI | Embargo | Encrypted |
|-------------|----------------|---------------|-----|---------|-----------|
| `doc-nato-ops-001` | SECRET | [USA,GBR,FRA,DEU,CAN] | NATO-COSMIC | No | No |
| `doc-us-only-tactical` | SECRET | [USA] | US-ONLY | No | No |
| `doc-fvey-intel` | TOP_SECRET | [USA,GBR,CAN,AUS,NZL] | FVEY | No | Yes |
| `doc-fra-defense` | CONFIDENTIAL | [FRA] | [] | No | No |
| `doc-can-logistics` | CONFIDENTIAL | [CAN,USA] | CAN-US | No | No |
| `doc-unclass-public` | UNCLASSIFIED | [all] | [] | No | No |
| `doc-future-embargo` | SECRET | [USA] | [] | 2025-11-01 | No |
| `doc-industry-partner` | CONFIDENTIAL | [USA] | [] | No | No |

---

## Test Scenarios

### ✅ Allow Scenarios (Expected: Access Granted)

#### Scenario 1: SECRET user accessing SECRET NATO document
**User:** `testuser-us` (SECRET, USA, [NATO-COSMIC, FVEY])  
**Resource:** `doc-nato-ops-001` (SECRET, [USA+], NATO-COSMIC)

**Steps:**
1. Login as `testuser-us` / `Password123!`
2. Click "Browse Documents"
3. Click on "NATO Operations Plan 2025"
4. **Expected:** ✅ Green "Access Granted" banner
5. **Expected:** Full document content displayed
6. **Reason:** 
   - Clearance: SECRET ≥ SECRET ✓
   - Country: USA ∈ [USA,GBR,FRA,DEU,CAN] ✓
   - COI: Has NATO-COSMIC or FVEY, resource has NATO-COSMIC ✓

**What to Check:**
- [ ] Green "Access Granted" banner visible
- [ ] Document content is displayed
- [ ] Classification badge shows "SECRET" in orange
- [ ] Metadata shows releasability and COI

---

#### Scenario 2: UNCLASSIFIED user accessing UNCLASSIFIED document
**User:** `testuser-us-unclass` (UNCLASSIFIED, USA, [])  
**Resource:** `doc-unclass-public` (UNCLASSIFIED, [all], [])

**Steps:**
1. Logout if logged in
2. Login as `testuser-us-unclass` / `Password123!`
3. Click "Browse Documents"
4. Click on "Public Coalition Guidance"
5. **Expected:** ✅ Green "Access Granted" banner
6. **Reason:**
   - Clearance: UNCLASSIFIED ≥ UNCLASSIFIED ✓
   - Country: USA in releasabilityTo ✓
   - COI: No COI required ✓

**What to Check:**
- [ ] Green "Access Granted" banner
- [ ] Document content visible
- [ ] Classification badge shows "UNCLASSIFIED" in green

---

#### Scenario 3: SECRET user accessing CONFIDENTIAL document
**User:** `testuser-us` (SECRET, USA, [NATO-COSMIC, FVEY])  
**Resource:** `doc-industry-partner` (CONFIDENTIAL, [USA], [])

**Steps:**
1. Login as `testuser-us` / `Password123!`
2. Click "Browse Documents"
3. Click on "Industry Partner Agreement"
4. **Expected:** ✅ Green "Access Granted" banner
5. **Reason:**
   - Clearance: SECRET ≥ CONFIDENTIAL ✓
   - Country: USA ∈ [USA] ✓
   - COI: No COI required ✓

**What to Check:**
- [ ] Access granted
- [ ] Content displayed
- [ ] Classification shows CONFIDENTIAL

---

### ❌ Deny Scenarios (Expected: Access Denied)

#### Scenario 4: CONFIDENTIAL user accessing TOP_SECRET document
**User:** `testuser-us-confid` (CONFIDENTIAL, USA, [FVEY])  
**Resource:** `doc-fvey-intel` (TOP_SECRET, FVEY, encrypted)

**Steps:**
1. Login as `testuser-us-confid` / `Password123!`
2. Click "Browse Documents"
3. Click on "Five Eyes Intelligence Report"
4. **Expected:** ❌ Red "Access Denied" banner
5. **Expected Reason:** "Insufficient clearance: CONFIDENTIAL < TOP_SECRET"

**What to Check:**
- [ ] Red "Access Denied" banner visible
- [ ] Reason clearly states clearance insufficient
- [ ] Policy evaluation shows:
  - Authenticated: ✓ PASS
  - Required attributes: ✓ PASS
  - Clearance sufficient: ✗ FAIL
  - Country releasable: ✓ PASS
  - COI satisfied: ✓ PASS
- [ ] User attributes shown (CONFIDENTIAL clearance)
- [ ] Resource requirements shown (TOP_SECRET required)
- [ ] NO document content displayed

---

#### Scenario 5: USA user accessing FRA-only document
**User:** `testuser-us` (SECRET, USA, [NATO-COSMIC, FVEY])  
**Resource:** `doc-fra-defense` (CONFIDENTIAL, [FRA], [])

**Steps:**
1. Login as `testuser-us` / `Password123!`
2. Click "Browse Documents"
3. Click on "French Defense Strategy"
4. **Expected:** ❌ Red "Access Denied" banner
5. **Expected Reason:** "Country USA not in releasabilityTo: [FRA]"

**What to Check:**
- [ ] Access denied banner
- [ ] Reason mentions country mismatch
- [ ] Policy evaluation shows:
  - Country releasable: ✗ FAIL
- [ ] Clear indication USA is not in [FRA]

---

#### Scenario 6: User with FVEY accessing US-ONLY document
**User:** `testuser-us-confid` (CONFIDENTIAL, USA, [FVEY])  
**Resource:** `doc-us-only-tactical` (SECRET, [USA], US-ONLY)

**Steps:**
1. Login as `testuser-us-confid` / `Password123!`
2. Click "Browse Documents"
3. Click on "U.S. Only Tactical Plan"
4. **Expected:** ❌ Red "Access Denied" banner
5. **Expected Reason:** Either:
   - "Insufficient clearance: CONFIDENTIAL < SECRET" OR
   - "No COI intersection: user COI [FVEY] does not intersect resource COI [US-ONLY]"
   
   (The first violation found will be reported)

**What to Check:**
- [ ] Access denied
- [ ] Reason shows either clearance OR COI failure
- [ ] If clearance fails first (expected), that's the reason shown
- [ ] Multiple checks may fail, but only first is reported

---

#### Scenario 7: Any user accessing future-embargoed document
**User:** Any user (try `testuser-us`)  
**Resource:** `doc-future-embargo` (SECRET, [USA], embargo: 2025-11-01)

**Steps:**
1. Login as `testuser-us` / `Password123!`
2. Click "Browse Documents"
3. Click on "Future Operations Plan (Embargoed)"
4. **Expected:** ❌ Red "Access Denied" banner
5. **Expected Reason:** "Resource under embargo until 2025-11-01T00:00:00Z"

**What to Check:**
- [ ] Access denied
- [ ] Reason mentions embargo date
- [ ] Shows current time vs embargo time
- [ ] Policy evaluation shows:
  - Embargo passed: ✗ FAIL

---

#### Scenario 8: User without required COI
**User:** `testuser-us-unclass` (UNCLASSIFIED, USA, [])  
**Resource:** `doc-nato-ops-001` (SECRET, [USA+], NATO-COSMIC)

**Steps:**
1. Login as `testuser-us-unclass` / `Password123!`
2. Click "Browse Documents"
3. Click on "NATO Operations Plan 2025"
4. **Expected:** ❌ Red "Access Denied" banner
5. **Expected Reason:** Either:
   - "Insufficient clearance: UNCLASSIFIED < SECRET" OR
   - "No COI intersection" (if clearance passed)

**What to Check:**
- [ ] Access denied
- [ ] First failing check is shown
- [ ] Multiple checks fail (clearance AND COI)

---

## Verification Checklist

After running all 8 scenarios:

### UI Behavior
- [ ] All 3-4 allow scenarios show green success banner
- [ ] All 4-5 deny scenarios show red denial banner
- [ ] Reasons are clear and specific
- [ ] No scenarios show errors (401, 500, etc.)
- [ ] Classification badges are color-coded correctly
- [ ] Policy evaluation details are shown for denials

### Authorization Logs
Check backend logs in `backend/logs/authz.log`:

```bash
tail -f backend/logs/authz.log
```

Expected log entries:
```json
{
  "timestamp": "2025-10-11T...",
  "level": "info",
  "service": "authz",
  "requestId": "req-...",
  "subject": "john.doe@mil",
  "resource": "doc-nato-ops-001",
  "decision": "ALLOW",
  "reason": "Access granted - all conditions satisfied",
  "latency_ms": 45
}
```

- [ ] All authorization decisions are logged
- [ ] ALLOW decisions have "ALLOW" status
- [ ] DENY decisions have "DENY" status and clear reason
- [ ] Latency is reasonable (<200ms for most requests)
- [ ] No PII leakage (only uniqueID, not full names)

### OPA Integration
Test OPA directly:

```bash
# Test OPA decision endpoint
curl -X POST http://localhost:8181/v1/data/dive/authorization/decision \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "subject": {
        "authenticated": true,
        "uniqueID": "john.doe@mil",
        "clearance": "SECRET",
        "countryOfAffiliation": "USA",
        "acpCOI": ["FVEY"]
      },
      "action": {"operation": "view"},
      "resource": {
        "resourceId": "doc-nato-ops-001",
        "classification": "SECRET",
        "releasabilityTo": ["USA", "GBR"],
        "COI": ["NATO-COSMIC"],
        "creationDate": "2025-01-01T00:00:00Z",
        "encrypted": false
      },
      "context": {
        "currentTime": "2025-10-15T14:30:00Z",
        "sourceIP": "10.0.1.50",
        "deviceCompliant": true,
        "requestId": "manual-test"
      }
    }
  }' | jq
```

Expected output:
```json
{
  "result": {
    "allow": true,
    "reason": "Access granted - all conditions satisfied",
    "obligations": [],
    "evaluation_details": {
      "checks": {
        "authenticated": true,
        "required_attributes": true,
        "clearance_sufficient": true,
        "country_releasable": true,
        "coi_satisfied": true,
        "embargo_passed": true
      },
      "subject": {...},
      "resource": {...}
    }
  }
}
```

- [ ] OPA returns proper decision structure
- [ ] `allow` field is boolean
- [ ] `reason` field is descriptive
- [ ] `evaluation_details` shows all checks

---

## Common Issues & Troubleshooting

### Issue 1: "401 Unauthorized" Error
**Symptom:** Cannot access any resources, even with valid login  
**Cause:** JWT token not being sent or invalid  
**Solution:**
```bash
# Check browser console for errors
# Verify session exists in browser DevTools > Application > Cookies
# Re-login to get fresh token
```

### Issue 2: "503 Service Unavailable"
**Symptom:** All resource access shows 503 error  
**Cause:** OPA service is down  
**Solution:**
```bash
docker-compose ps  # Check OPA status
docker-compose restart opa
curl http://localhost:8181/health  # Verify OPA is up
```

### Issue 3: All Requests Denied
**Symptom:** Even valid scenarios show "Access Denied"  
**Cause:** Policy error or missing attributes  
**Solution:**
```bash
# Check OPA policy syntax
docker-compose exec opa opa check /policies/fuel_inventory_abac_policy.rego

# Run OPA tests
docker-compose exec opa opa test /policies/ -v

# Check backend logs for attribute extraction
tail -f backend/logs/app.log | grep "Extracted identity"
```

### Issue 4: Keycloak Login Fails
**Symptom:** Redirect to Keycloak fails or returns error  
**Cause:** Keycloak not ready or realm misconfigured  
**Solution:**
```bash
# Check Keycloak status
curl http://localhost:8081/health/ready

# Check realm exists
curl http://localhost:8081/realms/dive-v3-pilot | jq .realm

# Verify test users in Keycloak Admin Console
open http://localhost:8081/admin
```

### Issue 5: Frontend Build Errors with React 19
**Symptom:** `npm install` fails with peer dependency conflicts  
**Solution:**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

---

## Test Results Template

Copy this template and fill in results:

```markdown
## Week 2 Manual Testing Results

**Date:** ___________  
**Tester:** ___________

### Allow Scenarios
- [ ] Scenario 1: SECRET→NATO (Expected: ALLOW) - Result: ______
- [ ] Scenario 2: UNCLASS→UNCLASS (Expected: ALLOW) - Result: ______
- [ ] Scenario 3: SECRET→CONFIDENTIAL (Expected: ALLOW) - Result: ______

### Deny Scenarios
- [ ] Scenario 4: CONFIDENTIAL→TOP_SECRET (Expected: DENY) - Result: ______
- [ ] Scenario 5: USA→FRA-only (Expected: DENY) - Result: ______
- [ ] Scenario 6: FVEY→US-ONLY (Expected: DENY) - Result: ______
- [ ] Scenario 7: Future embargo (Expected: DENY) - Result: ______
- [ ] Scenario 8: No COI (Expected: DENY) - Result: ______

### Issues Found
1. _____________
2. _____________

### Overall Result
- [ ] All scenarios passed as expected
- [ ] Some scenarios failed (describe below)
- [ ] Authorization logs captured correctly
- [ ] OPA integration working
```

---

## Success Criteria

Week 2 manual testing is COMPLETE when:

- ✅ All 3-4 allow scenarios show green "Access Granted"
- ✅ All 4-5 deny scenarios show red "Access Denied" with clear reasons
- ✅ Authorization audit logs captured for all requests
- ✅ No errors (401, 500, 503) during normal operation
- ✅ Policy evaluation details displayed correctly
- ✅ OPA integration verified with direct API test

---

**Next Steps After Testing:**
1. Document any issues found in GitHub Issues
2. Update CHANGELOG.md with manual testing status
3. Mark Week 2 TODO as complete
4. Proceed to Week 3: Multi-IdP Federation

**Questions?**
- Check OPA tests: `docker-compose exec opa opa test /policies/ -v`
- Check backend logs: `tail -f backend/logs/authz.log`
- Review policy: `policies/fuel_inventory_abac_policy.rego`
- Review middleware: `backend/src/middleware/authz.middleware.ts`

