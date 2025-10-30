# AAL2 MFA Enforcement Issue for admin-dive User

**Date**: October 23, 2025  
**Status**: ⚠️ **KNOWN ISSUE - WORKAROUND REQUIRED**

## Problem Statement

The `admin-dive` user has `clearance="TOP_SECRET"` which should trigger MFA enforcement according to AAL2 requirements, but MFA is not being prompted during login.

## Root Cause

**Keycloak Terraform Provider Bug (v4.4.0)**

The `mrparkers/keycloak` Terraform provider v4.4.0 has a bug where user `attributes` are not properly persisted to Keycloak when updated or recreated. This affects the conditional authentication flow which relies on the `clearance` attribute to determine if MFA should be enforced.

### Evidence

```bash
# Terraform state shows attributes ARE configured:
$ terraform show -json | jq '.values.root_module.resources[] | select(.address=="keycloak_user.broker_super_admin[0]") | .values.attributes'
{
  "acpCOI": "[\"NATO-COSMIC\",\"FVEY\",\"CAN-US\"]",
  "clearance": "TOP_SECRET",
  "countryOfAffiliation": "USA",
  "dutyOrg": "DIVE_ADMIN",
  "orgUnit": "SYSTEM_ADMINISTRATION",
  "uniqueID": "admin@dive-v3.pilot"
}

# But Keycloak shows NO attributes:
$ docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users/233c2d4c-2543-4bae-9e61-ffb2080998f6 -r dive-v3-broker --fields attributes
{
  "username": "admin-dive",
  "attributes": {}  ← EMPTY!
}
```

### Impact

Without the `clearance` attribute, the conditional authentication flow cannot evaluate:
```
attribute_name: "clearance"
attribute_value: "^(?!UNCLASSIFIED$).*"  ← This check FAILS (no attribute found)
```

Result: User logs in **without MFA** even though they have TOP_SECRET clearance.

---

##  Solution Options

### Option 1: Manual Fix via Keycloak Admin Console (RECOMMENDED)

1. Navigate to: http://localhost:8081/admin/dive-v3-broker/console
2. Login: `admin` / `admin`
3. Go to: Users → admin-dive → Attributes tab
4. Add the following attributes:
   ```
   uniqueID = admin@dive-v3.pilot
   clearance = TOP_SECRET
   countryOfAffiliation = USA
   acpCOI = ["NATO-COSMIC","FVEY","CAN-US"]
   dutyOrg = DIVE_ADMIN
   orgUnit = SYSTEM_ADMINISTRATION
   ```
5. Click "Save"

### Option 2: Use Different Terraform Resource

Instead of `keycloak_user`, use `keycloak_user_groups` and set attributes at the group level (more reliable in v4.4.0).

### Option 3: Upgrade Terraform Provider

Check if newer versions (v4.5.0+, v5.x) have fixed this bug:
```hcl
terraform {
  required_providers {
    keycloak = {
      source  = "mrparkers/keycloak"
      version = ">= 4.5.0"  # Try newer version
    }
  }
}
```

### Option 4: Post-Terraform Script

Run a script after `terraform apply` to set attributes via REST API:
```bash
#!/bin/bash
TOKEN=$(curl -s -X POST "http://localhost:8081/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

USER_ID=$(curl -s -X GET "http://localhost:8081/admin/realms/dive-v3-broker/users?username=admin-dive" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

curl -X PUT "http://localhost:8081/admin/realms/dive-v3-broker/users/$USER_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "attributes": {
      "uniqueID": ["admin@dive-v3.pilot"],
      "clearance": ["TOP_SECRET"],
      "countryOfAffiliation": ["USA"],
      "acpCOI": ["[\"NATO-COSMIC\",\"FVEY\",\"CAN-US\"]"],
      "dutyOrg": ["DIVE_ADMIN"],
      "orgUnit": ["SYSTEM_ADMINISTRATION"]
    }
  }'
```

---

## Verification Steps

After applying the fix, verify MFA is enforced:

### 1. Check Attributes Are Set
```bash
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user admin --password admin

docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users \
  -r dive-v3-broker -q username=admin-dive --fields username,attributes
```

Expected:
```json
{
  "username": "admin-dive",
  "attributes": {
    "uniqueID": ["admin@dive-v3.pilot"],
    "clearance": ["TOP_SECRET"],
    ...
  }
}
```

### 2. Test Login Flow

1. **Logout**: http://localhost:3000/api/auth/signout
2. **Clear Cookies**: Delete all `localhost` cookies in browser
3. **Login**: http://localhost:3000/login/dive-v3-broker
   - Username: `admin-dive`
   - Password: `DiveAdmin2025!`
4. **Expected**: QR code prompt for MFA setup
5. **Scan QR code** with Google Authenticator/Authy
6. **Enter 6-digit code** to complete setup
7. **Future logins** will require MFA code

### 3. Verify JWT Claims

After successful login, check the JWT token:
```javascript
// In browser console after login:
fetch('/api/auth/session').then(r => r.json()).then(console.log)
```

Expected claims:
```json
{
  "acr": "1",  // AAL2 (dynamically set by Keycloak)
  "amr": ["pwd", "otp"],  // Both password and OTP used
  "clearance": "TOP_SECRET",
  ...
}
```

---

## Related Issues

- Terraform Provider Issue: https://github.com/mrparkers/terraform-provider-keycloak/issues/XXX (check if reported)
- AAL2 Implementation: `docs/AAL2-MFA-TESTING-GUIDE.md`
- Conditional Flows: `terraform/keycloak-mfa-flows.tf`
- User Configuration: `terraform/broker-realm.tf` (lines 320-346)

---

## Current Status

- ✅ Conditional authentication flow configured correctly
- ✅ OTP policy configured correctly
- ✅ Browser flow bound to realm correctly
- ❌ User attributes not persisting via Terraform
- ⚠️ **MANUAL FIX REQUIRED** until provider bug is resolved

---

## Recommended Action

**FOR PRODUCTION**: Use Option 1 (Manual Fix) immediately to ensure security.

**FOR DEVELOPMENT**: Document this as a known limitation and include in deployment scripts.

**LONG TERM**: Monitor Terraform provider updates and upgrade when bug is fixed.

---

## Files Modified

- `terraform/broker-realm.tf` - Removed hardcoded `acr`/`amr` attributes (✅ correct)
- Need to manually set other attributes via Admin Console (⚠️ workaround)

---

**Last Updated**: October 23, 2025  
**Severity**: HIGH (Security Impact - MFA not enforced)  
**Workaround**: Manual attribute configuration required

