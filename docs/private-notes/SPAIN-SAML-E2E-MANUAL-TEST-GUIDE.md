# Spain SAML E2E Manual Test Guide

**Date**: October 28, 2025  
**Status**: ✅ **READY FOR TESTING** - Clearance transformation implemented

---

## Changes Applied

### 1. ✅ Protocol Mapper Added
- Added `clearanceOriginal` protocol mapper to `dive-v3-client-broker`
- Maps the Spanish clearance attribute to JWT token
- Applied via Terraform

### 2. ✅ Frontend Transformation Logic
- Updated `frontend/src/auth.ts` session callback
- Transforms Spanish clearances to NATO standard:
  - `SECRETO` → `SECRET`
  - `ALTO SECRETO` → `TOP_SECRET`
  - `CONFIDENCIAL` → `CONFIDENTIAL`
  - `NO CLASIFICADO` → `UNCLASSIFIED`
- Also handles German and French clearances

### 3. ✅ Environment Prepared
- Frontend restarted with new auth.ts
- Previous test user (`juan.garcia`) deleted
- Fresh test ready

---

## Manual Test Procedure

### Step 1: Open DIVE V3 in Browser
```bash
open http://localhost:3000
```

**Expected**: DIVE V3 home page loads

### Step 2: Click "Login" or "Get Started"

**Expected**: Redirected to IdP selection page

### Step 3: Select "Spain Ministry of Defense (External SAML)"

**Expected**: 
- Redirected to Keycloak
- Then to SimpleSAMLphp login

**Observed URL**: `http://localhost:9443/simplesaml/...`

### Step 4: SimpleSAMLphp Login
SimpleSAMLphp may auto-authenticate or show a form. If a form appears:
- Select user: **Juan García López** (`juan.garcia`)
- Password is not required (test IdP)
- Click "Login"

**Expected**: SAML Response sent back to Keycloak

### Step 5: Keycloak First Broker Login
Keycloak will show "Update Account Information" form:
- **Email**: `juan.garcia@defensa.gob.es` (pre-filled)
- **First Name**: `Juan` (pre-filled)
- **Last Name**: `García López` (pre-filled)
- Click "Submit"

**Expected**: User created in Keycloak broker realm

### Step 6: NextAuth Callback
- NextAuth receives OIDC callback from Keycloak
- Session callback runs:
  - Extracts `clearanceOriginal: "SECRETO"` from JWT
  - Transforms to `clearance: "SECRET"`
  - Extracts `countryOfAffiliation: "ESP"`
  - Extracts `acpCOI: ["NATO-COSMIC", "OTAN-ESP"]`

**Expected**: Redirected to Dashboard

### Step 7: Verify Dashboard

**Check User Profile Section**:
- **Name**: Juan García López
- **Email**: juan.garcia@defensa.gob.es
- **Clearance**: SECRET (transformed from SECRETO)
- **Country**: ESP
- **COI**: NATO-COSMIC, OTAN-ESP
- **Organization**: Ministerio de Defensa de España

**Expected**: All Spanish attributes displayed correctly

---

## Verification Checklist

| Check | Expected Result | Status |
|-------|----------------|--------|
| IdP selection shows Spain option | ✅ "Spain Ministry of Defense (External SAML)" | |
| SAML authentication succeeds | ✅ No signature errors | |
| Keycloak creates user | ✅ User `juan.garcia` in broker realm | |
| Clearance transformation | ✅ SECRETO → SECRET | |
| Country attribute | ✅ ESP | |
| COI attributes | ✅ NATO-COSMIC, OTAN-ESP | |
| Dashboard loads | ✅ No NextAuth errors | |
| Resources page access | ✅ Can view resources | |

---

## Troubleshooting

### Check Frontend Logs
```bash
docker logs dive-v3-frontend --tail 50 | grep -E "(DIVE|clearance|juan)"
```

**Look for**:
```
[DIVE] Transformed clearanceOriginal to clearance {
  clearanceOriginal: 'SECRETO',
  clearance: 'SECRET'
}
```

### Check Keycloak User Attributes
```bash
TOKEN=$(curl -s -X POST http://localhost:8081/realms/master/protocol/openid-connect/token \
  -d "client_id=admin-cli" -d "username=admin" -d "password=admin" -d "grant_type=password" | jq -r '.access_token')

curl -s "http://localhost:8081/admin/realms/dive-v3-broker/users?username=juan.garcia" \
  -H "Authorization: Bearer $TOKEN" | jq '.[0].attributes'
```

**Expected Attributes**:
```json
{
  "uniqueID": ["juan.garcia"],
  "clearanceOriginal": ["SECRETO"],
  "countryOfAffiliation": ["ESP"],
  "acpCOI": ["NATO-COSMIC", "OTAN-ESP"],
  "dutyOrg": ["Ministerio de Defensa de España"]
}
```

### Check NextAuth Session
After logging in, check browser console:
```javascript
// Run in browser DevTools console
fetch('/api/auth/session').then(r => r.json()).then(console.log)
```

**Expected Session**:
```json
{
  "user": {
    "uniqueID": "juan.garcia",
    "clearance": "SECRET",
    "countryOfAffiliation": "ESP",
    "acpCOI": ["NATO-COSMIC", "OTAN-ESP"]
  }
}
```

---

## Test Users Available

SimpleSAMLphp has 4 Spanish test users configured:

### 1. Juan García López (SECRET)
- **Username**: `juan.garcia`
- **Clearance**: SECRETO → SECRET
- **COI**: NATO-COSMIC, OTAN-ESP

### 2. María Rodríguez (CONFIDENTIAL)
- **Username**: `maria.rodriguez`
- **Clearance**: CONFIDENCIAL → CONFIDENTIAL
- **COI**: OTAN-ESP

### 3. Carlos Fernández (TOP SECRET)
- **Username**: `carlos.fernandez`
- **Clearance**: ALTO SECRETO → TOP_SECRET
- **COI**: NATO-COSMIC

### 4. Isabel Martín (UNCLASSIFIED)
- **Username**: `isabel.martin`
- **Clearance**: NO CLASIFICADO → UNCLASSIFIED
- **COI**: None

---

## Expected Flow Sequence

```
1. User clicks "Spain Ministry of Defense (External SAML)"
   └─> Frontend: http://localhost:3000/login?idp=esp-realm-external

2. Frontend redirects to Keycloak with kc_idp_hint
   └─> Keycloak: http://localhost:8081/realms/dive-v3-broker/protocol/openid-connect/auth?kc_idp_hint=esp-realm-external

3. Keycloak redirects to SimpleSAMLphp (SAML AuthnRequest)
   └─> SimpleSAMLphp: http://localhost:9443/simplesaml/module.php/saml/idp/singleSignOnService

4. SimpleSAMLphp authenticates user (or shows login form)
   └─> User selects: Juan García López

5. SimpleSAMLphp sends SAML Response to Keycloak
   └─> Keycloak: http://localhost:8081/realms/dive-v3-broker/broker/esp-realm-external/endpoint
   └─> SAML Attributes:
       - uid: juan.garcia
       - nivelSeguridad: SECRETO
       - paisAfiliacion: ESP
       - acpCOI: ["NATO-COSMIC", "OTAN-ESP"]

6. Keycloak First Broker Login (if new user)
   └─> Form: Update Account Information
   └─> Creates user with attributes:
       - uniqueID: juan.garcia
       - clearanceOriginal: SECRETO
       - countryOfAffiliation: ESP
       - acpCOI: ["NATO-COSMIC", "OTAN-ESP"]

7. Keycloak issues OIDC tokens to Frontend
   └─> ID Token includes all mapped attributes

8. NextAuth session callback
   └─> Extracts clearanceOriginal: "SECRETO"
   └─> Transforms to clearance: "SECRET"
   └─> Stores in session

9. User lands on Dashboard
   └─> Dashboard displays transformed clearance: SECRET
```

---

## Success Criteria

✅ **All of these must be true**:
1. No "Invalid signature" errors in Keycloak logs
2. No NextAuth "Configuration" errors in frontend logs
3. User successfully reaches Dashboard
4. Dashboard shows `clearance: SECRET` (not SECRETO)
5. Dashboard shows `countryOfAffiliation: ESP`
6. Dashboard shows COI tags
7. User can view resources page

---

## Commands to Run Test

```bash
# 1. Verify all services running
docker ps | grep -E "(keycloak|spain|frontend|backend)"

# 2. Check SimpleSAMLphp is healthy
curl -s http://localhost:9443/simplesaml/saml2/idp/metadata.php | grep -q "EntityDescriptor" && echo "✅ SimpleSAMLphp OK"

# 3. Check Keycloak IdP exists
TOKEN=$(curl -s -X POST http://localhost:8081/realms/master/protocol/openid-connect/token \
  -d "client_id=admin-cli" -d "username=admin" -d "password=admin" -d "grant_type=password" | jq -r '.access_token')
curl -s "http://localhost:8081/admin/realms/dive-v3-broker/identity-provider/instances/esp-realm-external" \
  -H "Authorization: Bearer $TOKEN" | jq '.alias' && echo "✅ Spain IdP configured"

# 4. Open browser and test
open http://localhost:3000
```

---

## After Testing

### Verify User in Keycloak
```bash
TOKEN=$(curl -s -X POST http://localhost:8081/realms/master/protocol/openid-connect/token \
  -d "client_id=admin-cli" -d "username=admin" -d "password=admin" -d "grant_type=password" | jq -r '.access_token')

curl -s "http://localhost:8081/admin/realms/dive-v3-broker/users?username=juan.garcia" \
  -H "Authorization: Bearer $TOKEN" | jq '.[0] | {username, email, attributes}'
```

### Check Frontend Transformation Logs
```bash
docker logs dive-v3-frontend --tail 100 | grep -A3 "Transformed clearanceOriginal"
```

**Expected Output**:
```
[DIVE] Transformed clearanceOriginal to clearance {
  clearanceOriginal: 'SECRETO',
  clearance: 'SECRET'
}
```

---

## Next Steps After Successful Test

1. ✅ Verify dashboard displays all Spanish attributes
2. ✅ Test resources page with Spanish user
3. ✅ Test OPA authorization with Spanish clearances
4. ✅ Update final debug report
5. ✅ Document in completion report

---

**END OF MANUAL TEST GUIDE**

**Ready to test**: Yes ✅  
**Estimated test time**: 3-5 minutes  
**Prerequisite**: All Docker services running
