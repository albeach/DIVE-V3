# NATO Expansion: Manual QA Testing Checklist

**Date**: October 24, 2025  
**Phase**: Phase 4 - Task 4.4  
**Status**: Manual QA Checklist for 6 New Realms  
**Nations**: DEU, GBR, ITA, ESP, POL, NLD  

---

## 📋 Overview

This checklist covers **138 manual tests** across 6 new NATO partner nation realms. Each realm requires comprehensive testing of authentication, authorization, UI/UX, and localization.

**Test Breakdown**:
- Authentication: 10 tests per realm × 6 realms = 60 tests
- Authorization: 8 tests per realm × 6 realms = 48 tests
- UI/UX: 5 tests per realm × 6 realms = 30 tests
- **Total**: 138 tests

---

## 🚀 Prerequisites

### Start the Full Stack

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

# Start all services
docker-compose up -d

# Wait for services to be ready (60-90 seconds)
sleep 60

# Verify services are running
docker-compose ps

# Expected services:
# - keycloak (port 8081)
# - mongodb (port 27017)
# - opa (port 8181)
# - backend (port 4000)
# - frontend (port 3000)
# - kas (port 8080)
```

### Test User Credentials

All 6 realms have test users created via Terraform with the following pattern:

| Nation | Username | Password | Clearance | Email Domain |
|--------|----------|----------|-----------|--------------|
| DEU | testuser-deu | Test123! | GEHEIM (SECRET) | @bundeswehr.org |
| GBR | testuser-gbr | Test123! | SECRET | @mod.uk |
| ITA | testuser-ita | Test123! | SEGRETO (SECRET) | @difesa.it |
| ESP | testuser-esp | Test123! | SECRETO (SECRET) | @mde.es |
| POL | testuser-pol | Test123! | TAJNE (SECRET) | @mon.gov.pl |
| NLD | testuser-nld | Test123! | GEHEIM (SECRET) | @mindef.nl |

---

## 🇩🇪 Germany (DEU) - 23 Tests

### Login Page URL
```
http://localhost:3000/login/deu-realm-broker
```

### Authentication Tests (10 tests)

- [ ] **AUTH-DEU-01**: Login page loads successfully
  - Navigate to `http://localhost:3000/login/deu-realm-broker`
  - Verify page loads without errors
  - Expected: Login form displayed with German theme colors

- [ ] **AUTH-DEU-02**: Login with valid credentials succeeds
  - Enter username: `testuser-deu`
  - Enter password: `Test123!`
  - Click "Sign In"
  - Expected: Redirected to MFA setup or dashboard

- [ ] **AUTH-DEU-03**: MFA setup flow works correctly
  - After login, verify MFA setup page appears
  - Scan QR code or copy secret
  - Enter valid OTP code
  - Expected: MFA configured successfully, redirected to dashboard

- [ ] **AUTH-DEU-04**: MFA verification accepts valid OTP
  - On subsequent login, enter valid OTP
  - Expected: Successfully authenticated

- [ ] **AUTH-DEU-05**: MFA not required for UNCLASSIFIED user
  - Create unclassified test user (if available)
  - Login without MFA prompt
  - Expected: Direct access to dashboard

- [ ] **AUTH-DEU-06**: Logout works correctly
  - Click logout button
  - Expected: Redirected to login page, session cleared

- [ ] **AUTH-DEU-07**: Session timeout works (30 minutes)
  - Login and wait 30+ minutes
  - Try to access protected resource
  - Expected: Session expired, redirected to login

- [ ] **AUTH-DEU-08**: Token refresh works (15-minute tokens)
  - Login and use application for 20+ minutes
  - Verify access still works (token should auto-refresh)
  - Expected: No interruption in service

- [ ] **AUTH-DEU-09**: Ocean pseudonym displays correctly
  - After login, check user profile or header
  - Expected: Pseudonym contains "Baltic" prefix (e.g., "Baltic_Storm_42")

- [ ] **AUTH-DEU-10**: Nation-specific colors/branding display
  - Verify login page uses German flag colors (Black/Red/Gold)
  - Check for German-themed background or imagery
  - Expected: Nation-specific visual theme

### Authorization Tests (8 tests)

- [ ] **AUTHZ-DEU-01**: User can access documents matching clearance
  - Navigate to `/resources`
  - Find a SECRET document released to DEU
  - Click to view
  - Expected: Document accessible

- [ ] **AUTHZ-DEU-02**: User denied for documents above clearance
  - Try to access a TOP SECRET document
  - Expected: "Insufficient clearance" error

- [ ] **AUTHZ-DEU-03**: User can access documents with matching country
  - Access document with `releasabilityTo: ["DEU"]`
  - Expected: Access granted

- [ ] **AUTHZ-DEU-04**: User denied for documents without releasability
  - Try to access document with `releasabilityTo: ["USA"]` (no DEU)
  - Expected: "Country DEU not in releasabilityTo" error

- [ ] **AUTHZ-DEU-05**: Classification equivalency shows correctly in UI
  - View a German document
  - Expected: Displays "GEHEIM (NATO SECRET)" or dual-format

- [ ] **AUTHZ-DEU-06**: Cross-nation document sharing works
  - Access a French document released to DEU
  - Expected: Access granted due to releasability

- [ ] **AUTHZ-DEU-07**: OPA policy logs show correct evaluation
  - Check backend logs: `docker-compose logs backend | grep authorization`
  - Expected: Logs show decision with DEU country, GEHEIM clearance

- [ ] **AUTHZ-DEU-08**: Rate limiting enforced correctly
  - Make 60+ requests in 1 minute
  - Expected: 429 rate limit error after threshold

### UI/UX Tests (5 tests)

- [ ] **UI-DEU-01**: Login page theme colors correct
  - Verify German flag colors (Black #000000, Red #DD0000, Gold #FFCE00)
  - Check background gradient or images
  - Expected: Nation-specific theme applied

- [ ] **UI-DEU-02**: Language switching works (EN ↔ German)
  - Click language switcher
  - Select "Deutsch"
  - Expected: UI switches to German, including buttons and labels

- [ ] **UI-DEU-03**: MFA messages localized correctly
  - During MFA setup, verify messages in German
  - Example: "Scannen Sie den QR-Code" instead of "Scan the QR code"
  - Expected: All MFA text localized

- [ ] **UI-DEU-04**: Error messages localized correctly
  - Trigger an error (e.g., wrong password)
  - Verify error shown in German (if DE locale selected)
  - Expected: Error messages in selected language

- [ ] **UI-DEU-05**: Mobile responsive design works
  - Open login page on mobile device or resize browser to 375px width
  - Verify layout adapts correctly
  - Expected: All elements visible and usable on mobile

---

## 🇬🇧 United Kingdom (GBR) - 23 Tests

### Login Page URL
```
http://localhost:3000/login/gbr-realm-broker
```

### Authentication Tests (10 tests)

- [ ] **AUTH-GBR-01**: Login page loads successfully
- [ ] **AUTH-GBR-02**: Login with valid credentials succeeds (testuser-gbr / Test123!)
- [ ] **AUTH-GBR-03**: MFA setup flow works correctly
- [ ] **AUTH-GBR-04**: MFA verification accepts valid OTP
- [ ] **AUTH-GBR-05**: MFA not required for UNCLASSIFIED user
- [ ] **AUTH-GBR-06**: Logout works correctly
- [ ] **AUTH-GBR-07**: Session timeout works (30 minutes)
- [ ] **AUTH-GBR-08**: Token refresh works (15-minute tokens)
- [ ] **AUTH-GBR-09**: Ocean pseudonym contains "North" prefix
- [ ] **AUTH-GBR-10**: UK flag colors (Red/White/Blue) displayed

### Authorization Tests (8 tests)

- [ ] **AUTHZ-GBR-01**: User can access documents matching clearance
- [ ] **AUTHZ-GBR-02**: User denied for documents above clearance
- [ ] **AUTHZ-GBR-03**: User can access documents with matching country
- [ ] **AUTHZ-GBR-04**: User denied for documents without releasability
- [ ] **AUTHZ-GBR-05**: Classification equivalency shows "SECRET (NATO SECRET)"
- [ ] **AUTHZ-GBR-06**: Cross-nation document sharing works
- [ ] **AUTHZ-GBR-07**: OPA policy logs show GBR country and SECRET clearance
- [ ] **AUTHZ-GBR-08**: Rate limiting enforced correctly

### UI/UX Tests (5 tests)

- [ ] **UI-GBR-01**: Login page theme uses UK colors (#C8102E red, #012169 blue)
- [ ] **UI-GBR-02**: Language switching works (EN only, no localization needed)
- [ ] **UI-GBR-03**: MFA messages in English (default)
- [ ] **UI-GBR-04**: Error messages in English
- [ ] **UI-GBR-05**: Mobile responsive design works

---

## 🇮🇹 Italy (ITA) - 23 Tests

### Login Page URL
```
http://localhost:3000/login/ita-realm-broker
```

### Authentication Tests (10 tests)

- [ ] **AUTH-ITA-01**: Login page loads successfully
- [ ] **AUTH-ITA-02**: Login with valid credentials succeeds (testuser-ita / Test123!)
- [ ] **AUTH-ITA-03**: MFA setup flow works correctly
- [ ] **AUTH-ITA-04**: MFA verification accepts valid OTP
- [ ] **AUTH-ITA-05**: MFA not required for UNCLASSIFIED user
- [ ] **AUTH-ITA-06**: Logout works correctly
- [ ] **AUTH-ITA-07**: Session timeout works (30 minutes)
- [ ] **AUTH-ITA-08**: Token refresh works (15-minute tokens)
- [ ] **AUTH-ITA-09**: Ocean pseudonym contains "Adriatic" prefix
- [ ] **AUTH-ITA-10**: Italian flag colors (Green/White/Red) displayed

### Authorization Tests (8 tests)

- [ ] **AUTHZ-ITA-01**: User can access documents matching clearance
- [ ] **AUTHZ-ITA-02**: User denied for documents above clearance
- [ ] **AUTHZ-ITA-03**: User can access documents with matching country
- [ ] **AUTHZ-ITA-04**: User denied for documents without releasability
- [ ] **AUTHZ-ITA-05**: Classification equivalency shows "SEGRETO (NATO SECRET)"
- [ ] **AUTHZ-ITA-06**: Cross-nation document sharing works
- [ ] **AUTHZ-ITA-07**: OPA policy logs show ITA country and SEGRETO clearance
- [ ] **AUTHZ-ITA-08**: Rate limiting enforced correctly

### UI/UX Tests (5 tests)

- [ ] **UI-ITA-01**: Login page theme uses Italian colors (#009246 green, #CE2B37 red)
- [ ] **UI-ITA-02**: Language switching works (EN ↔ Italian)
- [ ] **UI-ITA-03**: MFA messages localized in Italian
- [ ] **UI-ITA-04**: Error messages localized in Italian
- [ ] **UI-ITA-05**: Mobile responsive design works

---

## 🇪🇸 Spain (ESP) - 23 Tests

### Login Page URL
```
http://localhost:3000/login/esp-realm-broker
```

### Authentication Tests (10 tests)

- [ ] **AUTH-ESP-01**: Login page loads successfully
- [ ] **AUTH-ESP-02**: Login with valid credentials succeeds (testuser-esp / Test123!)
- [ ] **AUTH-ESP-03**: MFA setup flow works correctly
- [ ] **AUTH-ESP-04**: MFA verification accepts valid OTP
- [ ] **AUTH-ESP-05**: MFA not required for UNCLASSIFIED user
- [ ] **AUTH-ESP-06**: Logout works correctly
- [ ] **AUTH-ESP-07**: Session timeout works (30 minutes)
- [ ] **AUTH-ESP-08**: Token refresh works (15-minute tokens)
- [ ] **AUTH-ESP-09**: Ocean pseudonym contains "Iberian" prefix
- [ ] **AUTH-ESP-10**: Spanish flag colors (Red/Gold) displayed

### Authorization Tests (8 tests)

- [ ] **AUTHZ-ESP-01**: User can access documents matching clearance
- [ ] **AUTHZ-ESP-02**: User denied for documents above clearance
- [ ] **AUTHZ-ESP-03**: User can access documents with matching country
- [ ] **AUTHZ-ESP-04**: User denied for documents without releasability
- [ ] **AUTHZ-ESP-05**: Classification equivalency shows "SECRETO (NATO SECRET)"
- [ ] **AUTHZ-ESP-06**: Cross-nation document sharing works
- [ ] **AUTHZ-ESP-07**: OPA policy logs show ESP country and SECRETO clearance
- [ ] **AUTHZ-ESP-08**: Rate limiting enforced correctly

### UI/UX Tests (5 tests)

- [ ] **UI-ESP-01**: Login page theme uses Spanish colors (#AA151B red, #F1BF00 gold)
- [ ] **UI-ESP-02**: Language switching works (EN ↔ Spanish)
- [ ] **UI-ESP-03**: MFA messages localized in Spanish
- [ ] **UI-ESP-04**: Error messages localized in Spanish
- [ ] **UI-ESP-05**: Mobile responsive design works

---

## 🇵🇱 Poland (POL) - 23 Tests

### Login Page URL
```
http://localhost:3000/login/pol-realm-broker
```

### Authentication Tests (10 tests)

- [ ] **AUTH-POL-01**: Login page loads successfully
- [ ] **AUTH-POL-02**: Login with valid credentials succeeds (testuser-pol / Test123!)
- [ ] **AUTH-POL-03**: MFA setup flow works correctly
- [ ] **AUTH-POL-04**: MFA verification accepts valid OTP
- [ ] **AUTH-POL-05**: MFA not required for UNCLASSIFIED user
- [ ] **AUTH-POL-06**: Logout works correctly
- [ ] **AUTH-POL-07**: Session timeout works (30 minutes)
- [ ] **AUTH-POL-08**: Token refresh works (15-minute tokens)
- [ ] **AUTH-POL-09**: Ocean pseudonym contains "Vistula" prefix
- [ ] **AUTH-POL-10**: Polish flag colors (White/Red) displayed

### Authorization Tests (8 tests)

- [ ] **AUTHZ-POL-01**: User can access documents matching clearance
- [ ] **AUTHZ-POL-02**: User denied for documents above clearance
- [ ] **AUTHZ-POL-03**: User can access documents with matching country
- [ ] **AUTHZ-POL-04**: User denied for documents without releasability
- [ ] **AUTHZ-POL-05**: Classification equivalency shows "TAJNE (NATO SECRET)"
- [ ] **AUTHZ-POL-06**: Cross-nation document sharing works
- [ ] **AUTHZ-POL-07**: OPA policy logs show POL country and TAJNE clearance
- [ ] **AUTHZ-POL-08**: Rate limiting enforced correctly

### UI/UX Tests (5 tests)

- [ ] **UI-POL-01**: Login page theme uses Polish colors (White #FFFFFF, Red #DC143C)
- [ ] **UI-POL-02**: Language switching works (EN ↔ Polish)
- [ ] **UI-POL-03**: MFA messages localized in Polish
- [ ] **UI-POL-04**: Error messages localized in Polish
- [ ] **UI-POL-05**: Mobile responsive design works

---

## 🇳🇱 Netherlands (NLD) - 23 Tests

### Login Page URL
```
http://localhost:3000/login/nld-realm-broker
```

### Authentication Tests (10 tests)

- [ ] **AUTH-NLD-01**: Login page loads successfully
- [ ] **AUTH-NLD-02**: Login with valid credentials succeeds (testuser-nld / Test123!)
- [ ] **AUTH-NLD-03**: MFA setup flow works correctly
- [ ] **AUTH-NLD-04**: MFA verification accepts valid OTP
- [ ] **AUTH-NLD-05**: MFA not required for UNCLASSIFIED user
- [ ] **AUTH-NLD-06**: Logout works correctly
- [ ] **AUTH-NLD-07**: Session timeout works (30 minutes)
- [ ] **AUTH-NLD-08**: Token refresh works (15-minute tokens)
- [ ] **AUTH-NLD-09**: Ocean pseudonym contains "Nordic" prefix
- [ ] **AUTH-NLD-10**: Dutch flag colors (Red/White/Blue) displayed

### Authorization Tests (8 tests)

- [ ] **AUTHZ-NLD-01**: User can access documents matching clearance
- [ ] **AUTHZ-NLD-02**: User denied for documents above clearance
- [ ] **AUTHZ-NLD-03**: User can access documents with matching country
- [ ] **AUTHZ-NLD-04**: User denied for documents without releasability
- [ ] **AUTHZ-NLD-05**: Classification equivalency shows "GEHEIM (NATO SECRET)"
- [ ] **AUTHZ-NLD-06**: Cross-nation document sharing works
- [ ] **AUTHZ-NLD-07**: OPA policy logs show NLD country and GEHEIM clearance
- [ ] **AUTHZ-NLD-08**: Rate limiting enforced correctly

### UI/UX Tests (5 tests)

- [ ] **UI-NLD-01**: Login page theme uses Dutch colors (#21468B blue, #AE1C28 red)
- [ ] **UI-NLD-02**: Language switching works (EN ↔ Dutch)
- [ ] **UI-NLD-03**: MFA messages localized in Dutch
- [ ] **UI-NLD-04**: Error messages localized in Dutch
- [ ] **UI-NLD-05**: Mobile responsive design works

---

## 🔍 Cross-Realm Integration Tests (Additional)

### Global Tests (applies to all realms)

- [ ] **GLOBAL-01**: All 11 realms accessible via IdP selector
  - Navigate to `http://localhost:3000/`
  - Verify all 11 realms listed (10 operational + 1 broker)
  - Expected: DEU, GBR, ITA, ESP, POL, NLD visible with flags

- [ ] **GLOBAL-02**: Keycloak admin console shows all realms
  - Navigate to `http://localhost:8081/admin`
  - Login with admin/admin
  - Expected: All 11 realms listed in dropdown

- [ ] **GLOBAL-03**: Backend health check shows all services
  - GET `http://localhost:4000/api/health`
  - Expected: All services (Keycloak, MongoDB, OPA, KAS) healthy

- [ ] **GLOBAL-04**: OPA policy test suite passes
  ```bash
  cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3
  ./bin/opa test policies/
  ```
  - Expected: 172+ tests passing

- [ ] **GLOBAL-05**: Backend unit tests pass
  ```bash
  cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/backend
  npm test
  ```
  - Expected: 1,083+ tests passing (including 81 clearance mapper tests)

---

## 📊 Test Execution Summary

### Test Progress Tracker

| Nation | Auth (10) | Authz (8) | UI/UX (5) | Total | Status |
|--------|-----------|-----------|-----------|-------|--------|
| DEU 🇩🇪 | __ / 10 | __ / 8 | __ / 5 | __ / 23 | ⏳ Pending |
| GBR 🇬🇧 | __ / 10 | __ / 8 | __ / 5 | __ / 23 | ⏳ Pending |
| ITA 🇮🇹 | __ / 10 | __ / 8 | __ / 5 | __ / 23 | ⏳ Pending |
| ESP 🇪🇸 | __ / 10 | __ / 8 | __ / 5 | __ / 23 | ⏳ Pending |
| POL 🇵🇱 | __ / 10 | __ / 8 | __ / 5 | __ / 23 | ⏳ Pending |
| NLD 🇳🇱 | __ / 10 | __ / 8 | __ / 5 | __ / 23 | ⏳ Pending |
| **Global** | __ / 5 | - | - | __ / 5 | ⏳ Pending |
| **Total** | **__ / 65** | **__ / 48** | **__ / 30** | **__ / 143** | **⏳ Pending** |

### Issue Tracker

Use this section to log any issues found during testing:

| Test ID | Issue Description | Severity | Status | Notes |
|---------|-------------------|----------|--------|-------|
| | | | | |
| | | | | |
| | | | | |

**Severity Levels**:
- 🔴 **Critical**: Blocks release
- 🟠 **High**: Major functionality broken
- 🟡 **Medium**: Minor functionality issue
- 🟢 **Low**: Cosmetic or enhancement

---

## ✅ Sign-Off

**Testing Completed By**: _____________________  
**Date**: _____________________  
**Tests Passed**: ____ / 143  
**Tests Failed**: ____ / 143  
**Critical Issues**: ____ 

**Recommendation**:
- [ ] ✅ **APPROVE** - All tests passing, ready for production
- [ ] ⚠️ **APPROVE WITH CONDITIONS** - Minor issues, deploy with caveats
- [ ] ❌ **REJECT** - Critical issues found, requires fixes before deployment

**Notes**:
_____________________________________________________________________
_____________________________________________________________________
_____________________________________________________________________

---

## 📁 Related Documentation

- `NATO-EXPANSION-PHASE1-COMPLETE.md` - Terraform infrastructure
- `NATO-EXPANSION-PHASE2-COMPLETE.md` - Backend services
- `NATO-EXPANSION-PHASE3-COMPLETE.md` - Frontend configuration
- `PHASE-3-DEPLOYMENT-COMPLETE.md` - Deployment status
- `frontend/src/__tests__/e2e/nato-expansion.spec.ts` - Automated E2E tests

---

## 🎯 Phase 4 Task 4.4: ✅ COMPLETE

Manual QA checklist created with 143 comprehensive tests covering:
- 6 new NATO partner nations
- Authentication, authorization, UI/UX scenarios
- Cross-realm integration tests
- Test progress tracker and issue logging

**Next Phase**: Phase 5 - Documentation Updates

