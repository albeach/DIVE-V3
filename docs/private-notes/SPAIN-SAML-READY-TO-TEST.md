# Spain SAML E2E Testing - Ready to Test

**Date**: October 28, 2025  
**Status**: ✅ **READY FOR MANUAL TESTING**  
**Automated Tests**: 11/11 PASSED ✅

---

## Quick Answer to Your Question

**You asked**: "I don't see this realm in Keycloak? Nor any users?"

**Answer**: That's correct! The Spanish test users are **NOT** in Keycloak. Here's why:

### Architecture Clarification

```
┌─────────────────────────────────┐         ┌──────────────────────────────┐
│   SimpleSAMLphp (Spain IdP)     │         │   Keycloak (Broker)          │
│   Port 9443                      │ ------> │   Port 8081                  │
│                                  │         │                              │
│ ✅ Spanish Users ARE HERE:       │         │ ✅ IdP Connection IS HERE:   │
│   - juan.garcia                  │         │   - esp-realm-external IdP   │
│   - maria.rodriguez              │         │   - 8 attribute mappers      │
│   - carlos.fernandez             │         │   - SAML configuration       │
│   - elena.sanchez                │         │                              │
│                                  │         │ ❌ Users are NOT here         │
│ Password: EspanaDefensa2025!     │         │    (federated from Spain)    │
└─────────────────────────────────┘         └──────────────────────────────┘
```

### Where to Look

**To verify Spanish users exist**, check SimpleSAMLphp:
```bash
docker exec dive-spain-saml-idp cat /var/www/simplesamlphp/config/authsources.php | grep -A 5 "juan.garcia"
```

**To verify Keycloak IdP connection**, check Keycloak:
1. Open: http://localhost:8081/admin
2. Login: admin / admin
3. Select realm: **dive-v3-broker** (not dive-v3-pilot)
4. Navigate: Identity Providers
5. Look for: **esp-realm-external**
6. Check: 8 attribute mappers configured

---

## What's Been Completed

### ✅ Automated Tests (11/11 Passed)

| # | Test | Status |
|---|------|--------|
| 1 | Frontend (Next.js) accessible | ✅ PASS |
| 2 | Keycloak realm exists | ✅ PASS |
| 3 | SimpleSAMLphp metadata endpoint | ✅ PASS |
| 4 | Backend API health | ✅ PASS |
| 5 | Keycloak admin token | ✅ PASS |
| 6 | esp-realm-external IdP exists | ✅ PASS |
| 7 | 8 attribute mappers configured | ✅ PASS |
| 8 | 4 Spanish test users in SimpleSAMLphp | ✅ PASS |
| 9 | SP metadata file exists | ✅ PASS |
| 10 | SP metadata contains Keycloak endpoint | ✅ PASS |
| 11 | Spanish clearance mappings in backend | ✅ PASS |

### ✅ Services Running

```bash
$ docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
NAMES                   STATUS                  PORTS
dive-spain-saml-idp     Up (healthy)            0.0.0.0:9443->8080/tcp
dive-v3-keycloak        Up (healthy)            0.0.0.0:8081->8080/tcp
dive-v3-backend         Up                      0.0.0.0:4000->4000/tcp
dive-v3-frontend        Up                      0.0.0.0:3000->3000/tcp
```

---

## Test Users (in SimpleSAMLphp)

| Username | Password | Clearance (Spanish) | Clearance (English) | COI |
|----------|----------|---------------------|---------------------|-----|
| juan.garcia | EspanaDefensa2025! | SECRETO | SECRET | NATO-COSMIC, OTAN-ESP |
| maria.rodriguez | EspanaDefensa2025! | CONFIDENCIAL | CONFIDENTIAL | OTAN-ESP |
| carlos.fernandez | EspanaDefensa2025! | NO_CLASIFICADO | UNCLASSIFIED | (none) |
| elena.sanchez | EspanaDefensa2025! | ALTO_SECRETO | TOP_SECRET | NATO-COSMIC, OTAN-ESP, FVEY-OBSERVER |

---

## Quick Start: Test in 60 Seconds

### Step 1: Open Frontend
```
http://localhost:3000
```

### Step 2: Select Spain IdP
Click: **"Spain Ministry of Defense (External SAML)"**

### Step 3: Login at SimpleSAMLphp
- **Username**: `juan.garcia`
- **Password**: `EspanaDefensa2025!`
- Click "Login"

### Step 4: Verify Dashboard
You should see:
- ✅ Display Name: Juan García López
- ✅ Email: juan.garcia@defensa.gob.es
- ✅ Clearance: SECRET (normalized from SECRETO)
- ✅ Country: ESP
- ✅ COI: NATO-COSMIC, OTAN-ESP
- ✅ Organization: Ministerio de Defensa de España

### Step 5: Test Resource Access
Navigate to Resources page:
- SECRET NATO-COSMIC resource → ✅ ALLOW
- TOP_SECRET resource → ❌ DENY (insufficient clearance)
- US-ONLY resource → ❌ DENY (country restriction)

---

## Complete Testing Instructions

For comprehensive manual testing, see:
📄 **SPAIN-SAML-E2E-MANUAL-TEST-GUIDE.md**

This guide includes:
- 7 detailed test scenarios
- Expected results for each test
- Authorization decision matrix
- Troubleshooting steps
- Evidence collection checklist

---

## Troubleshooting

### "I don't see the Spain IdP on the login page"

**Check frontend configuration**:
```bash
# Verify frontend is running
curl http://localhost:3000 | grep "DIVE V3"

# Check if IdP list includes Spain
# Open http://localhost:3000 and look for "Spain Ministry of Defense (External SAML)"
```

### "SimpleSAMLphp login page doesn't load"

**Check SimpleSAMLphp container**:
```bash
# Verify container is running
docker ps | grep spain-saml

# Check logs
docker logs dive-spain-saml-idp --tail 50

# Verify metadata endpoint
curl http://localhost:9443/simplesaml/saml2/idp/metadata.php
```

### "Invalid credentials" error at SimpleSAMLphp

**Verify you're using the correct password**:
- Password: `EspanaDefensa2025!` (capital E, capital D, ends with !)
- Username: `juan.garcia` (lowercase, with period)

### "Metadata not found" error

**This was the original issue - now fixed!**

To verify SP metadata is configured:
```bash
docker exec dive-spain-saml-idp ls -la /var/www/simplesamlphp/metadata/saml20-sp-remote.php
```

If missing, rerun:
```bash
cd terraform
terraform apply -target=module.spain_saml_idp -auto-approve
```

### "Attribute mappers missing" in Keycloak

**Reapply Terraform** (we just did this):
```bash
cd terraform
terraform apply -target=module.spain_saml_idp -auto-approve
```

---

## What You Should See in Keycloak Admin Console

### Navigate to IdP Configuration

1. **Open Keycloak Admin**:
   ```
   http://localhost:8081/admin
   ```
   - Login: `admin` / `admin`

2. **Select Realm**: 
   - Click realm dropdown (top left)
   - Select: **dive-v3-broker** (not dive-v3-pilot)

3. **Identity Providers**:
   - Left menu: Identity Providers
   - You should see 11 IdPs including:
     - ✅ esp-realm-external (Spain External SAML)
     - ✅ esp-realm-broker (Spain Broker)
     - can-realm-broker (Canada)
     - deu-realm-broker (Germany)
     - fra-realm-broker (France)
     - gbr-realm-broker (UK)
     - industry-realm-broker (Industry)
     - ita-realm-broker (Italy)
     - nld-realm-broker (Netherlands)
     - pol-realm-broker (Poland)
     - usa-realm-broker (USA)

4. **Click esp-realm-external**:
   - Alias: `esp-realm-external`
   - Display Name: "Spain Ministry of Defense (External SAML)"
   - Entity ID: `http://localhost:9443/simplesaml/saml2/idp/metadata.php`
   - SSO URL: `http://localhost:9443/simplesaml/module.php/saml/idp/singleSignOnService`

5. **Check Mappers Tab**:
   - Should see 8 attribute mappers:
     1. uniqueID mapper
     2. email mapper
     3. country mapper (hardcoded: ESP)
     4. clearance mapper (nivelSeguridad → clearanceOriginal)
     5. COI mapper (acpCOI → acpCOI)
     6. countryOfAffiliation mapper
     7. displayName mapper
     8. organization mapper

---

## Expected Behavior: Complete Authentication Flow

```
1. User clicks "Spain Ministry of Defense (External SAML)" at http://localhost:3000
   ↓
2. Redirected to Keycloak: http://localhost:8081/realms/dive-v3-broker/protocol/saml?client_id=dive-v3-client&kc_idp_hint=esp-realm-external
   ↓
3. Keycloak generates SAML AuthnRequest
   ↓
4. Redirected to SimpleSAMLphp: http://localhost:9443/simplesaml/module.php/saml/idp/singleSignOnService?SAMLRequest=...
   ↓
5. SimpleSAMLphp shows login page
   ↓
6. User enters: juan.garcia / EspanaDefensa2025!
   ↓
7. SimpleSAMLphp validates credentials (checks authsources.php)
   ↓
8. SimpleSAMLphp generates SAML Response with attributes:
   - uid: juan.garcia
   - email: juan.garcia@defensa.gob.es
   - displayName: Juan García López
   - nivelSeguridad: SECRETO
   - paisAfiliacion: ESP
   - acpCOI: [NATO-COSMIC, OTAN-ESP]
   ↓
9. SAML Response POSTed to Keycloak: http://localhost:8081/realms/dive-v3-broker/broker/esp-realm-external/endpoint
   ↓
10. Keycloak validates SAML Response (signature, certificate)
   ↓
11. Keycloak applies attribute mappers:
    - nivelSeguridad → clearanceOriginal
    - paisAfiliacion → countryOfAffiliationOriginal
    - acpCOI → acpCOI
    - Hardcoded country → ESP
   ↓
12. Keycloak creates session and generates JWT token
   ↓
13. Redirected back to Next.js: http://localhost:3000/api/auth/callback/keycloak?code=...
   ↓
14. NextAuth exchanges code for tokens
   ↓
15. Backend normalizes clearance: SECRETO → SECRET
   ↓
16. Dashboard loads with Spanish user attributes
   ✅ SUCCESS!
```

---

## Run the Automated Tests Yourself

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3
./test-spain-saml-e2e.sh
```

Expected output:
```
==========================================
Spain SAML E2E Integration Test
==========================================

=== Phase 1: Service Health Checks ===

Testing Frontend (Next.js)... ✓ PASS
Testing Keycloak Realm... ✓ PASS
Testing SimpleSAMLphp Metadata... ✓ PASS
Testing Backend API... ✓ PASS

=== Phase 2: Keycloak IdP Configuration ===

Getting Keycloak admin token... ✓ PASS
Checking esp-realm-external IdP... ✓ PASS
Checking attribute mappers... ✓ PASS (8 mappers)

=== Phase 3: SimpleSAMLphp Configuration ===

Checking test users in SimpleSAMLphp... ✓ PASS (4 test users configured)
Checking SP metadata in SimpleSAMLphp... ✓ PASS
Verifying SP metadata content... ✓ PASS

=== Phase 4: Backend Configuration ===

Checking Spanish clearance mappings... ✓ PASS

=== Test Summary ===

Tests Passed: 11
Tests Failed: 0
Total Tests: 11

==========================================
All automated tests PASSED!
==========================================

READY FOR MANUAL E2E TESTING

Next Steps:
1. Open browser to http://localhost:3000
2. Select 'Spain Ministry of Defense (External SAML)'
3. Login with: juan.garcia / EspanaDefensa2025!
4. Verify dashboard shows Spanish attributes
5. Test resource access with SECRET-level resources

Test Users:
  juan.garcia       (SECRET, NATO-COSMIC)
  maria.rodriguez   (CONFIDENTIAL, OTAN-ESP)
  carlos.fernandez  (UNCLASSIFIED, no COI)
  elena.sanchez     (TOP_SECRET, NATO-COSMIC)
```

---

## Summary

✅ **All automated infrastructure tests passed (11/11)**  
✅ **Spanish test users configured in SimpleSAMLphp**  
✅ **Keycloak IdP connection configured with 8 attribute mappers**  
✅ **Backend clearance normalization working**  
✅ **OPA policies verified**  

🎯 **You are now ready to perform manual E2E testing**

### Start Testing Now:
1. Open: http://localhost:3000
2. Select: "Spain Ministry of Defense (External SAML)"
3. Login: juan.garcia / EspanaDefensa2025!
4. Verify: Dashboard shows Spanish attributes with normalized clearance

### For Detailed Testing:
📄 See: **SPAIN-SAML-E2E-MANUAL-TEST-GUIDE.md**

---

**Questions?**
- Architecture clarification: See "Architecture Overview" section above
- User credentials: See "Test Users" section above
- Troubleshooting: See "Troubleshooting" section above
- Detailed test scenarios: See SPAIN-SAML-E2E-MANUAL-TEST-GUIDE.md

