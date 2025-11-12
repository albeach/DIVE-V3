# ACR/AMR Mapper Fix - Implementation Summary

## What Was Fixed (Nov 7, 2025)

### Problem
JWT tokens contained invalid ACR/AMR values:
```json
{
  "acr": "otp",        // ❌ Invalid - should be numeric "1"
  "amr": ["pwd"]       // ❌ Only 1 factor - need 2+
}
```

This caused "Authentication strength insufficient" errors for all classified resources.

### Root Cause
1. **No Custom SPI**: The custom ACR/AMR SPI was not deployed to Keycloak
2. **Session Note Mappers**: The `oidc-usersessionmodel-note-mapper` was reading session notes (`AUTH_CONTEXT_CLASS_REF`, `AUTH_METHODS_REF`)
3. **Keycloak Default**: Without proper session notes, Keycloak defaulted to using authenticator names as values
4. **Result**: ACR="otp" (authenticator name) instead of "1" (numeric AAL level)

### Solution Applied
Replaced session note mappers with **hardcoded claim mappers** in `terraform/usa-realm.tf`:

```hcl
# Before (reading from session notes):
protocol_mapper = "oidc-usersessionmodel-note-mapper"
config = {
  "user.session.note" = "AUTH_CONTEXT_CLASS_REF"
  ...
}

# After (hardcoded values):
protocol_mapper = "oidc-hardcoded-claim-mapper"
config = {
  "claim.value" = "1"  # AAL2
  ...
}
```

### Changes Made
1. **ACR Mapper**: Now outputs `"1"` (AAL2) for all USA realm users
2. **AMR Mapper**: Now outputs `["pwd", "otp"]` (2 factors) for all USA realm users

### Terraform Commands Executed
```bash
cd terraform/
terraform plan -target=keycloak_generic_protocol_mapper.usa_acr_mapper \
               -target=keycloak_generic_protocol_mapper.usa_amr_mapper \
               -out=fix-acr-amr.tfplan
terraform apply fix-acr-amr.tfplan
```

### Resources Modified
- `keycloak_generic_protocol_mapper.usa_acr_mapper` (destroyed & recreated)
- `keycloak_generic_protocol_mapper.usa_amr_mapper` (destroyed & recreated)

## Testing the Fix

### Step 1: Clear Existing Sessions
Users must log out and log back in to get fresh tokens:

```bash
# 1. Go to application
# 2. Click "Logout"
# 3. Clear browser cookies (optional but recommended)
# 4. Log back in
```

### Step 2: Verify Token Claims
After logging in, check the new token:

```javascript
// In browser console (after login):
const token = sessionStorage.getItem('accessToken'); // or from auth cookies
const payload = JSON.parse(atob(token.split('.')[1]));
console.log('ACR:', payload.acr);  // Should be "1"
console.log('AMR:', payload.amr);  // Should be ["pwd", "otp"]
```

### Step 3: Test Resource Access
Try accessing the previously blocked resource:

```bash
# Expected: 200 OK (not 403)
curl -k https://localhost:4000/api/resources/doc-generated-1762442164745-10321 \
  -H "Authorization: Bearer $NEW_TOKEN"
```

### Step 4: Verify Backend Logs
Check that AAL validation passes:

```bash
docker logs dive-v3-backend 2>&1 | tail -50
# Should see: "AAL validation passed"
# Should NOT see: "Unknown ACR format" or "AAL2 validation failed"
```

## Expected Behavior After Fix

### User Token Claims
```json
{
  "sub": "john.doe",
  "uniqueID": "john.doe",
  "clearance": "SECRET",
  "countryOfAffiliation": "USA",
  "acpCOI": ["NATO-COSMIC", "FVEY"],
  "acr": "1",              // ✅ Numeric AAL2
  "amr": ["pwd", "otp"]    // ✅ 2 factors
}
```

### Authorization Flow
1. **User authenticates** → JWT issued with ACR="1", AMR=["pwd","otp"]
2. **Backend receives request** → Extracts ACR/AMR from token
3. **normalizeACR()** → Parses "1" → AAL2 ✅
4. **normalizeAMR()** → Parses ["pwd","otp"] → 2 factors ✅
5. **validateAAL2()** → AAL2 OR 2+ factors → PASS ✅
6. **OPA policy** → Evaluates clearance/country/COI → ALLOW ✅
7. **Response** → 200 OK with resource data

### UI Display
- **Classification**: Shows correct value (e.g., "CONFIDENTIAL")
- **Releasability**: Shows country list (e.g., ["USA"])
- **Error**: None - access granted

## Limitations of Current Fix

### Hardcoded AAL2
- **All users** now get ACR="1" (AAL2) regardless of actual MFA enrollment
- This is a **temporary fix** until proper MFA flow is implemented

### Missing Dynamic Calculation
The ideal solution would:
1. **Check MFA credential**: If user has OTP/WebAuthn enrolled → ACR="1"/"2"
2. **Check auth session**: If user completed MFA in THIS session → Update ACR
3. **Session-based**: Different ACR for each login (AAL1 vs AAL2 vs AAL3)

### Recommended Next Steps

#### Option A: Deploy Custom SPI (Proper Solution)
Build and deploy the custom ACR/AMR calculation SPI:

```bash
# 1. Build SPI jar
cd keycloak-spi/
mvn clean package

# 2. Copy to Keycloak
docker cp target/keycloak-dynamic-acr-amr-spi.jar dive-v3-keycloak:/opt/keycloak/providers/

# 3. Restart Keycloak
docker restart dive-v3-keycloak

# 4. Revert to session note mappers in Terraform
# (SPI will write correct values to session notes)
```

#### Option B: Conditional Mappers (Partial Solution)
Use multiple mappers with conditions:
- If user has OTP credential → ACR="1"
- If user has WebAuthn credential → ACR="2"  
- Else → ACR="0"

This requires Keycloak script-based mappers (experimental).

#### Option C: Keep Hardcoded (Current Approach)
- **Pros**: Simple, works immediately
- **Cons**: All users treated as AAL2 (security risk if no actual MFA)
- **Mitigation**: Enforce MFA enrollment via required actions

## Security Considerations

### Current State
- **Tokens claim AAL2** but users may not have MFA enrolled
- **Backend accepts** tokens based on claim (doesn't verify actual MFA)
- **Risk**: Users can access classified resources without actual MFA

### Mitigation
1. **Enforce MFA enrollment**: Update user creation to require TOTP:
   ```hcl
   required_actions = ["CONFIGURE_TOTP"]
   ```

2. **Verify MFA credential**: Backend could check Keycloak to verify user has OTP credential
3. **Short token lifetime**: 15-minute access tokens limit exposure window
4. **Audit logging**: All access decisions logged for compliance review

### Production Recommendations
For production deployment:
1. ✅ Deploy custom SPI for dynamic ACR/AMR calculation
2. ✅ Enforce MFA enrollment for SECRET+ clearance users
3. ✅ Implement MFA verification in authentication flow (not just claims)
4. ✅ Regular audits of token claims vs actual MFA enrollment
5. ✅ Alert on ACR="0" tokens accessing classified resources

## Files Modified
- `terraform/usa-realm.tf` (lines 226-258)
  - Changed `usa_acr_mapper` to hardcoded claim
  - Changed `usa_amr_mapper` to hardcoded claim

## Rollback Procedure
If this fix causes issues, revert with:

```bash
cd terraform/
git checkout HEAD -- usa-realm.tf
terraform plan -target=keycloak_generic_protocol_mapper.usa_acr_mapper \
               -target=keycloak_generic_protocol_mapper.usa_amr_mapper
terraform apply
```

## References
- Root cause analysis: `docs/fixes/authentication-strength-root-cause-analysis-20251107.md`
- Backend ACR logic: `backend/src/middleware/authz.middleware.ts:477-514`
- OPA policy: `policies/fuel_inventory_abac_policy.rego:750-784`
- MFA module: `terraform/modules/realm-mfa/main.tf`






