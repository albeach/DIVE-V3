# AAL2 MFA Enforcement - Testing Guide

**Date**: October 23, 2025  
**Status**: Ready for Testing

---

## Test Credentials

### USA Realm (dive-v3-usa)
**URL**: http://localhost:8081/realms/dive-v3-usa/account

| Username | Password | Clearance | Expected MFA Behavior |
|----------|----------|-----------|----------------------|
| `john.doe` | `Password123!` | SECRET | ✅ **REQUIRES OTP** (conditional MFA) |

### Broker Realm (dive-v3-broker)
**URL**: http://localhost:8081/realms/dive-v3-broker/account

| Username | Password | Clearance | Expected MFA Behavior |
|----------|----------|-----------|----------------------|
| `john.doe` | `Password123!` | SECRET | ✅ **REQUIRES OTP** (conditional MFA) |
| `admin-dive` | `Password123!` | TOP_SECRET | ✅ **REQUIRES OTP** (conditional MFA) |

---

## Testing Scenarios

### Scenario 1: Test SECRET Clearance User (Requires MFA)

**User**: john.doe  
**Expected**: Password + OTP required

#### Steps:
1. Open browser in **Incognito/Private mode** (to avoid cached sessions)
2. Navigate to: http://localhost:8081/realms/dive-v3-usa/account
3. **Login**:
   - Username: `john.doe`
   - Password: `Password123!`
4. **Expected Result**: Keycloak prompts "Set up Authenticator"
5. **Setup OTP**:
   - Open Google Authenticator (or Authy, Microsoft Authenticator)
   - Scan the QR code
   - Enter the 6-digit code displayed in your app
   - Click "Submit"
6. **Verify JWT Claims**:
   - After successful login, the JWT should contain:
     - `acr="1"` (AAL2)
     - `amr=["pwd","otp"]`

#### Expected Flow:
```
Login Page → Enter Password → Conditional Check (clearance=SECRET) 
→ OTP Prompt → Setup/Enter OTP → Success
```

---

### Scenario 2: Test TOP_SECRET Clearance User (Requires MFA)

**User**: admin-dive  
**Expected**: Password + OTP required

#### Steps:
1. Open browser in **Incognito/Private mode**
2. Navigate to: http://localhost:8081/realms/dive-v3-broker/account
3. **Login**:
   - Username: `admin-dive`
   - Password: `Password123!`
4. **Expected Result**: Keycloak prompts "Set up Authenticator"
5. **Setup OTP** (same as Scenario 1)
6. **Verify JWT Claims**:
   - `acr="1"` (AAL2)
   - `amr=["pwd","otp"]`

---

### Scenario 3: Test UNCLASSIFIED User (No MFA Required)

**Note**: We currently don't have an UNCLASSIFIED user created. Let's create one:

```bash
# Create UNCLASSIFIED test user
TOKEN=$(curl -s 'http://localhost:8081/realms/master/protocol/openid-connect/token' \
  -d 'client_id=admin-cli' -d 'username=admin' -d 'password=admin' \
  -d 'grant_type=password' | jq -r '.access_token')

curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  'http://localhost:8081/admin/realms/dive-v3-usa/users' \
  -d '{
    "username": "bob.contractor",
    "enabled": true,
    "emailVerified": true,
    "email": "bob.contractor@example.com",
    "attributes": {
      "clearance": ["UNCLASSIFIED"],
      "countryOfAffiliation": ["USA"],
      "uniqueID": ["bob.contractor@example.com"]
    },
    "credentials": [{
      "type": "password",
      "value": "Password123!",
      "temporary": false
    }]
  }'
```

#### Test Steps:
1. Open browser in **Incognito/Private mode**
2. Navigate to: http://localhost:8081/realms/dive-v3-usa/account
3. **Login**:
   - Username: `bob.contractor`
   - Password: `Password123!`
4. **Expected Result**: Login successful with **NO OTP PROMPT**
5. **Verify JWT Claims**:
   - `acr="0"` (AAL1)
   - `amr=["pwd"]`

---

## Verification Checklist

### ✅ Authentication Flow Verification
Run the verification script:
```bash
./scripts/check-execution-order.sh
```

**Expected Output** (for all realms):
```
index: 0, displayName: "Condition - user attribute"
index: 1, displayName: "OTP Form"
```

### ✅ OPA Policy Tests
```bash
./bin/opa test policies/*.rego policies/tests/*.rego --verbose
```

**Expected**: 172/172 tests passing (including AAL2/FAL tests)

### ✅ Backend Middleware Tests
```bash
cd backend && npm test -- --testPathPattern="authz.middleware.test"
```

**Expected**: 36 tests passing (including ACR/AMR validation)

---

## Troubleshooting

### Issue: "Invalid username or password"
**Solution**: Reset user password (already done above)

### Issue: "Failed to configure OTP"
**Possible Causes**:
1. OTP policy not configured in realm
2. Browser blocking QR code display
3. Time sync issue on phone

**Solution**:
```bash
# Verify OTP policy exists
TOKEN=$(curl -s 'http://localhost:8081/realms/master/protocol/openid-connect/token' \
  -d 'client_id=admin-cli' -d 'username=admin' -d 'password=admin' \
  -d 'grant_type=password' | jq -r '.access_token')

curl -s -H "Authorization: Bearer $TOKEN" \
  'http://localhost:8081/admin/realms/dive-v3-usa' | jq '.otpPolicy'
```

**Expected Output**:
```json
{
  "type": "totp",
  "algorithm": "HmacSHA256",
  "digits": 6,
  "period": 30,
  "lookAheadWindow": 1
}
```

### Issue: OTP prompt appears for UNCLASSIFIED user
**Root Cause**: Execution order is wrong (OTP form before condition check)

**Solution**: Run verification script and check execution order:
```bash
./scripts/check-execution-order.sh
```

**Expected**: Condition at index 0, OTP Form at index 1

---

## JWT Claim Verification

### Using Keycloak Admin API
```bash
# Get token for john.doe
TOKEN=$(curl -s 'http://localhost:8081/realms/dive-v3-usa/protocol/openid-connect/token' \
  -d 'client_id=dive-v3-client' \
  -d 'client_secret=8AcfbgtdNIZp3tbrcmc2voiUfxNb8d6L' \
  -d 'username=john.doe' \
  -d 'password=Password123!' \
  -d 'grant_type=password' | jq -r '.access_token')

# Decode JWT (using jwt.io or base64)
echo $TOKEN | cut -d '.' -f 2 | base64 -d 2>/dev/null | jq
```

**Expected Claims** (after OTP setup):
```json
{
  "acr": "1",
  "amr": ["pwd", "otp"],
  "clearance": "SECRET",
  "countryOfAffiliation": "USA",
  "uniqueID": "john.doe@army.mil"
}
```

---

## Next Steps After Testing

1. ✅ **Verify all 4 realms**: USA, France, Canada, Broker
2. ✅ **Test UNCLASSIFIED user**: Confirm NO OTP prompt
3. ✅ **Test CLASSIFIED users**: Confirm OTP required
4. ✅ **Verify JWT claims**: Check `acr` and `amr` values
5. ✅ **Backend/OPA validation**: Confirm authorization works with real claims
6. ✅ **E2E testing**: Test complete resource access flow
7. ✅ **Update documentation**: Mark Gap #6 as RESOLVED

---

## Success Criteria

- [ ] UNCLASSIFIED user: Password-only login (no OTP)
- [ ] SECRET user: Password + OTP required
- [ ] TOP_SECRET user: Password + OTP required
- [ ] JWT contains `acr="1"` for MFA logins
- [ ] JWT contains `acr="0"` for password-only logins
- [ ] Backend/OPA validate ACR/AMR claims correctly
- [ ] Execution order: Condition (index 0) → OTP (index 1) for all realms

---

## References

- **OPA Policy**: `policies/fuel_inventory_abac_policy.rego` (lines 694-728)
- **Backend Middleware**: `backend/src/middleware/authz.middleware.ts` (lines 391-461)
- **Terraform Config**: `terraform/keycloak-mfa-flows.tf`
- **Root Cause Doc**: `docs/AAL2-ROOT-CAUSE-AND-FIX.md`

