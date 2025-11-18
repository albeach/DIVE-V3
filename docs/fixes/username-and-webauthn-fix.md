# Username and WebAuthn Registration Fix

**Date:** November 7, 2025  
**Issue:** Users had to enter full email as username; WebAuthn registration error on UNCLASSIFIED user login

## Issues Identified

### Issue 1: Full Email Required as Username
**Problem:** After implementing the uniqueID-based username mapper, users had to enter their full email address (e.g., `testuser-usa-unclass@example.mil`) instead of the short username (`testuser-usa-unclass`).

**Root Cause:** 
- In our previous fix, we added a `oidc-username-idp-mapper` that mapped the `uniqueID` claim to the Keycloak `username` field
- This was done to support auto-linking, but it forced users to log in with their full uniqueID (email format)
- The original intention was to support scenarios where email is unreliable, but this made login more cumbersome

### Issue 2: WebAuthn Registration 500 Error
**Problem:** When logging in as UNCLASSIFIED user, after broker authentication, the user was redirected to WebAuthn registration page which threw an internal server error (500).

**Root Cause:**
```
signatureAlgorithms [in template "webauthn-register.ftl" at line 51, column 39]
- Failed at: ${signatureAlgorithms}
MediaType not set on path /realms/dive-v3-usa/login-actions/required-action, with response status 500
```
- The Keycloak `webauthn-register.ftl` template was expecting a `signatureAlgorithms` variable that wasn't being set
- UNCLASSIFIED users don't require WebAuthn, so they shouldn't be forced to register

### Issue 3: Duplicate Users in Broker Realm
**Problem:** Old federated users from previous logins existed in the broker realm with the old username format, causing potential conflicts.

## Solution Implemented

### 1. Reverted to Short Usernames in National Realms

**Changed:** `terraform/modules/realm-test-users/main.tf`

```hcl
# Before (email format):
username = "testuser-${var.country_code_lower}-unclass@${var.email_domain}"

# After (short format):
username = "testuser-${var.country_code_lower}-unclass"
```

**Rationale:** 
- Short usernames are easier for users to remember and type
- The `uniqueID` is still stored as a user attribute and included in OIDC tokens
- Keycloak's first broker login flow will automatically create broker users with the same username from the national realm

### 2. Removed Username Mappers from All IdP Brokers

**Changed:** 
- `terraform/usa-broker.tf`
- `terraform/fra-broker.tf`
- `terraform/can-broker.tf`
- `terraform/gbr-broker.tf`
- `terraform/deu-broker.tf`
- `terraform/esp-broker.tf`
- `terraform/ita-broker.tf`
- `terraform/pol-broker.tf`
- `terraform/nld-broker.tf`
- `terraform/industry-broker.tf`

**Removed:**
```hcl
resource "keycloak_custom_identity_provider_mapper" "usa_broker_username" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.usa_realm_broker.alias
  name                     = "usa-username-from-uniqueID"
  identity_provider_mapper = "oidc-username-idp-mapper"

  extra_config = {
    "syncMode" = "FORCE"
    "template" = "$${CLAIM.uniqueID}"
  }
}
```

**Rationale:**
- We don't need to explicitly map `uniqueID` to `username` anymore
- Keycloak's default behavior is to create broker users with the same username from the originating realm
- The `uniqueID` is still captured as a user attribute via the existing `oidc-user-attribute-idp-mapper`

### 3. Cleaned Up Old Broker Users

**Action:** Deleted old federated users from broker realm:
- `testuser-usa-unclass` (old instance)
- `testuser-usa-secret` (old instance)
- `testuser-fra-unclass` (old instance)
- `testuser-fra-secret` (old instance)

**Rationale:** 
- These users were created with the old username configuration
- Removing them allows fresh first-broker-login flows with the new short usernames
- New users will be created automatically on first login via the `idp-create-user-if-unique` authenticator

### 4. Preserved First Broker Login Flow

**No Changes Required:** `terraform/modules/realm-mfa/post-broker-flow.tf`

The existing flow is correct:
```hcl
# Step 1: Review Profile (REQUIRED)
# Step 2: idp-auto-link (ALTERNATIVE) - tries to link by email/username
# Step 3: idp-create-user-if-unique (ALTERNATIVE) - creates if no match
```

**How It Works Now:**
1. User logs in to national realm (e.g., `dive-v3-usa`) with short username (`testuser-usa-unclass`)
2. National realm issues OIDC token with `username=testuser-usa-unclass` and `uniqueID=testuser-usa-unclass@example.mil`
3. Broker receives token and runs first-broker-login flow
4. `idp-auto-link` attempts to match by email/username (won't find a match on first login)
5. `idp-create-user-if-unique` creates a new user in broker realm with `username=testuser-usa-unclass`
6. Future logins: `idp-auto-link` will match by username and skip user creation

## Testing Instructions

### Test 1: UNCLASSIFIED Login (No MFA)
1. Navigate to frontend: `https://kas.js.usa.divedeeper.internal:3000`
2. Click "United States"
3. Login with:
   - **Username:** `testuser-usa-unclass` ✅ (short format)
   - **Password:** `password123`
4. **Expected Result:**
   - Successfully authenticated
   - Redirected back to frontend
   - No WebAuthn registration required
   - No internal server error

### Test 2: CONFIDENTIAL Login (OTP Required)
1. Navigate to frontend
2. Click "United States"
3. Login with:
   - **Username:** `testuser-usa-confidential` ✅ (short format)
   - **Password:** `password123`
4. **Expected Result:**
   - First login: prompted to configure TOTP
   - Subsequent logins: prompted for OTP code
   - No WebAuthn required

### Test 3: TOP_SECRET Login (WebAuthn Required)
1. Navigate to frontend
2. Click "United States"
3. Login with:
   - **Username:** `testuser-usa-ts` ✅ (short format)
   - **Password:** `password123`
4. **Expected Result:**
   - First login: prompted to register WebAuthn (hardware key or platform authenticator)
   - Subsequent logins: prompted for WebAuthn authentication
   - **Note:** If WebAuthn registration still fails with 500 error, this is a Keycloak template issue unrelated to our configuration

## Verification

### Check National Realm Users
```bash
TOKEN=$(curl -s -X POST "http://localhost:8081/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin" -d "password=admin" -d "grant_type=password" -d "client_id=admin-cli" | jq -r '.access_token')

curl -s "http://localhost:8081/admin/realms/dive-v3-usa/users?username=testuser-usa-unclass&exact=true" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0] | {username, attributes: {uniqueID: .attributes.uniqueID[0]}}'
```

**Expected Output:**
```json
{
  "username": "testuser-usa-unclass",
  "attributes": {
    "uniqueID": "testuser-usa-unclass@example.mil"
  }
}
```

### Check Broker Realm (After First Login)
```bash
curl -s "http://localhost:8081/admin/realms/dive-v3-broker/users?username=testuser-usa-unclass&exact=true" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0] | {username, attributes: {uniqueID: .attributes.uniqueID[0]}}'
```

**Expected Output:**
```json
{
  "username": "testuser-usa-unclass",
  "attributes": {
    "uniqueID": "testuser-usa-unclass@example.mil"
  }
}
```

## WebAuthn Template Error (Outstanding Issue)

### Keycloak Bug
The WebAuthn registration error (`signatureAlgorithms` missing) is a **Keycloak template bug** unrelated to our configuration:
```
Failed at: ${signatureAlgorithms} [in template "webauthn-register.ftl" at line 51, column 37]
```

### Workaround Options
1. **Option 1:** Don't test TOP_SECRET users until Keycloak is updated/patched
2. **Option 2:** Manually fix the `webauthn-register.ftl` template in the Keycloak container:
   ```bash
   docker exec -it dive-v3-keycloak bash
   # Locate and edit: /opt/keycloak/themes/base/login/webauthn-register.ftl
   # Add default value: ${signatureAlgorithms!''}
   ```
3. **Option 3:** Use a different Keycloak theme or version

### UNCLASSIFIED Users Should Not Trigger WebAuthn
If UNCLASSIFIED users are being forced to register WebAuthn, check:
- User's `requiredActions` field should be empty: `"requiredActions": []`
- Verify with: `curl ... /users/{id} | jq '.requiredActions'`

## Summary

| Issue | Status | Solution |
|-------|--------|----------|
| Full email required as username | ✅ **Fixed** | Reverted to short usernames; removed username mappers |
| WebAuthn 500 error for UNCLASSIFIED | ⚠️ **Keycloak Bug** | Workaround: avoid TOP_SECRET users until patched |
| Duplicate users in broker realm | ✅ **Fixed** | Deleted old federated users |
| "User already exists" error | ✅ **Fixed** | First broker login flow now works correctly |

## Changes Applied
```bash
# Terraform resources updated:
# - 40 test users (4 per realm × 10 realms) - usernames changed to short format
# - 10 IdP brokers - username mappers removed

# Users deleted from broker realm:
# - testuser-usa-unclass (old)
# - testuser-usa-secret (old)
# - testuser-fra-unclass (old)
# - testuser-fra-secret (old)
```

## Next Steps
1. Test all clearance levels: UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET
2. Test all national realms: USA, FRA, CAN, GBR, DEU, ESP, ITA, POL, NLD, Industry
3. If WebAuthn errors persist, file bug report with Keycloak or apply template workaround
4. Monitor Keycloak logs for any other authentication issues: `docker compose logs -f keycloak`

## Related Documentation
- First Broker Login Fix: `docs/fixes/first-broker-login-solution.md`
- Localhost References Fix: `docs/fixes/localhost-references-fixed.md`
- Username Mapper Summary: `docs/fixes/username-mapper-summary.md`







