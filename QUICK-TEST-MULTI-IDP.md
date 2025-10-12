# Quick Test Guide - Multi-IdP Authentication (FIXED)

**Status:** ✅ **Ready to Test**  
**Date:** October 11, 2025

---

## ✅ What Was Fixed

1. **Frontend URLs** - All IdP buttons now link directly to NextAuth with `kc_idp_hint`
2. **Terraform URLs** - Changed from `keycloak:8080` to `localhost:8081`  
3. **Single Source of Truth** - Consistent authentication URL pattern everywhere
4. **TypeScript** - 0 compilation errors

---

## 🚀 Quick Test (5 Minutes Each IdP)

### Test 1: France SAML IdP

```bash
# 1. Open home page
open http://localhost:3000

# 2. Click the "France (SAML)" button (🇫🇷)

# 3. You should see the france-mock-idp login page
#    URL should be: http://localhost:8081/realms/france-mock-idp/...

# 4. Log in:
Username: testuser-fra
Password: Password123!

# 5. Expected: Dashboard with these attributes:
✅ Name: Pierre Dubois
✅ Email: pierre.dubois@defense.gouv.fr  
✅ clearance: SECRET
✅ countryOfAffiliation: FRA
✅ acpCOI: ["NATO-COSMIC"]
```

### Test 2: Canada OIDC IdP

```bash
# 1. Logout (top-right corner)
# 2. Go to: http://localhost:3000
# 3. Click "Canada (OIDC)" button (🇨🇦)

Username: testuser-can
Password: Password123!

Expected Dashboard:
✅ Name: John MacDonald
✅ Email: john.macdonald@forces.gc.ca
✅ clearance: CONFIDENTIAL
✅ countryOfAffiliation: CAN
✅ acpCOI: ["CAN-US"]
```

### Test 3: Industry OIDC IdP (with Enrichment)

```bash
# 1. Logout
# 2. Go to: http://localhost:3000  
# 3. Click "Industry Partner (OIDC)" button (🏢)

Username: bob.contractor
Password: Password123!

Expected Dashboard:
✅ Name: Bob Contractor
✅ Email: bob.contractor@lockheed.com
✅ clearance: UNCLASSIFIED (enriched - should show indicator)
✅ countryOfAffiliation: USA (enriched from email domain)
✅ acpCOI: [] (empty)

# 4. Check enrichment logs (separate terminal):
docker-compose logs backend | grep enrichment

Expected:
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

### Test 4: U.S. IdP (Regression)

```bash
# Verify Week 1/2 functionality still works

# 1. Logout
# 2. Go to: http://localhost:3000
# 3. Click "U.S. DoD" button (🇺🇸)

Username: testuser-us
Password: Password123!

Expected:
✅ Dashboard with USA, SECRET, [NATO-COSMIC, FVEY]
```

---

## 🔍 What to Look For

### ✅ SUCCESS Indicators:

1. **Correct Realm Login Page**
   - France button → france-mock-idp login
   - Canada button → canada-mock-idp login
   - Industry button → industry-mock-idp login
   - U.S. button → dive-v3-pilot login (no mock realm)

2. **URL Pattern Check**
   - Should see `localhost:8081` in URL (not `keycloak:8080`)
   - Should see correct realm name in URL

3. **Credentials Work**
   - No "Invalid requester" errors
   - No "Unexpected error when authenticating" errors
   - Login succeeds

4. **Dashboard Shows Correct Attributes**
   - clearance matches expectation
   - countryOfAffiliation matches IdP
   - COI array populated correctly

### ❌ FAILURE Indicators (Report If You See These):

1. **Wrong Realm**
   - Clicking France but seeing dive-v3-pilot login
   - Should see france-mock-idp login

2. **URL Issues**
   - Seeing `keycloak:8080` in URL
   - Connection refused errors
   - Invalid requester errors

3. **Credentials Fail**
   - testuser-fra / Password123! doesn't work
   - Authentication errors

4. **Wrong Attributes**
   - French user showing USA instead of FRA
   - Wrong clearance level

---

## 🐛 If Something Doesn't Work

### Issue: Still seeing wrong realm

**Try:**
```bash
# Clear browser cache
# OR use incognito/private window

# Restart frontend
cd frontend
rm -rf .next
npm run dev
```

### Issue: "Invalid requester" errors

**Try:**
```bash
# Restart Keycloak
docker-compose restart keycloak

# Wait 30 seconds, then try again
```

### Issue: Credentials don't work

**Verify users exist:**
```bash
# Check Keycloak Admin Console
open http://localhost:8081/admin

# Login: admin / admin
# Navigate to each mock realm:
# - france-mock-idp → Users
# - canada-mock-idp → Users
# - industry-mock-idp → Users
```

---

## 📊 Test Results Template

Copy and fill out:

```
=== Multi-IdP Authentication Test Results ===
Date: _______________
Tester: _______________

France SAML IdP:
[ ] Login page correct (france-mock-idp)
[ ] Credentials work (testuser-fra)
[ ] Dashboard shows FRA attributes
[ ] No errors encountered

Canada OIDC IdP:
[ ] Login page correct (canada-mock-idp)
[ ] Credentials work (testuser-can)
[ ] Dashboard shows CAN attributes
[ ] No errors encountered

Industry OIDC IdP:
[ ] Login page correct (industry-mock-idp)
[ ] Credentials work (bob.contractor)
[ ] Dashboard shows enriched attributes (USA, UNCLASSIFIED)
[ ] Enrichment logs captured
[ ] No errors encountered

U.S. IdP (Regression):
[ ] Login works (testuser-us)
[ ] Dashboard shows USA attributes
[ ] No regression from Week 2

Overall Status:
[ ] All tests passed
[ ] Some tests failed (details below)

Issues Encountered:
[Write any problems here]

```

---

## 🎯 Expected Results Summary

| IdP | Login Realm | Test User | Expected Country | Expected Clearance |
|-----|-------------|-----------|------------------|-------------------|
| France | france-mock-idp | testuser-fra | FRA | SECRET |
| Canada | canada-mock-idp | testuser-can | CAN | CONFIDENTIAL |
| Industry | industry-mock-idp | bob.contractor | USA (enriched) | UNCLASSIFIED (enriched) |
| U.S. | dive-v3-pilot | testuser-us | USA | SECRET |

---

## 🔗 Reference Documents

**Complete Fix Documentation:**
- `docs/troubleshooting/MULTI-IDP-AUTHENTICATION-FIX.md` - Full technical details

**Original Test Plans:**
- `docs/testing/WEEK3-QA-TEST-PLAN.md` - Comprehensive test suite
- `docs/testing/WEEK3-TEST-CHECKLIST.md` - Quick checklist

**Troubleshooting:**
- `docs/troubleshooting/MULTI-IDP-URL-FIX.md` - URL fix details

---

**Status:** ✅ **ALL FIXES APPLIED - READY FOR TESTING**  
**Estimated Test Time:** 20-30 minutes for all 4 IdPs  
**Priority:** Test France first (most complex SAML configuration)

