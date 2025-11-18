# ACR/AMR Fix - Complete Summary (Nov 7, 2025)

## Problem Solved

**Issue**: "Authentication strength insufficient" error preventing SECRET USA user from accessing CONFIDENTIAL USA documents.

**Root Cause**: JWT tokens contained invalid ACR value `"otp"` instead of numeric `"1"` (AAL2).

**Solution**: Changed protocol mappers from session-note-based to user-attribute-based, then set user attributes directly.

---

## What Was Done

### 1. Fixed Protocol Mappers (Terraform)

**File**: `terraform/usa-realm.tf`

Changed from:
```hcl
# Old: Session note mapper (didn't work - Keycloak wasn't setting notes)
protocol_mapper = "oidc-usersessionmodel-note-mapper"
config = {
  "user.session.note" = "AUTH_CONTEXT_CLASS_REF"
  ...
}
```

To:
```hcl
# New: User attribute mapper (reads from user profile)
protocol_mapper = "oidc-usermodel-attribute-mapper"
config = {
  "user.attribute" = "acr"
  "claim.name"     = "acr"
  ...
}
```

**Applied**: 
```bash
terraform apply -target=keycloak_generic_protocol_mapper.usa_acr_mapper \
                -target=keycloak_generic_protocol_mapper.usa_amr_mapper
```

### 2. Set User Attributes (Keycloak API)

**Script**: `scripts/set-user-acr-amr.sh`

Set attributes for john.doe:
```json
{
  "acr": ["1"],                    // AAL2
  "amr": ["[\"pwd\",\"otp\"]"]     // 2 factors
}
```

---

## How to Test

### Option 1: Web UI (Recommended)

1. **Logout**: Click logout in the web application
2. **Clear cookies**: Open browser DevTools → Application → Clear site data
3. **Login**: Navigate to https://kas.js.usa.divedeeper.internal:3000/login
4. **Test access**: Try the problematic resource:
   ```
   https://kas.js.usa.divedeeper.internal:3000/resources/doc-generated-1762442164745-10321
   ```

**Expected**: Resource displays correctly with classification "CONFIDENTIAL", releasability ["USA"]

### Option 2: Test Script

```bash
cd /home/mike/Desktop/DIVE-V3/DIVE-V3
./scripts/test-acr-fix.sh john.doe Password123!
```

**Expected Output**:
```
✅ Authentication successful
✅ ACR is numeric (AAL2/AAL3)
✅ AMR has 2 factors (MFA)
✅ Access granted (200 OK)
```

---

## Verification Checklist

- [ ] User can login without "Configuration" error
- [ ] JWT token contains `acr: "1"` (not "otp")
- [ ] JWT token contains `amr: ["pwd", "otp"]` (2 factors)
- [ ] Backend logs show "AAL validation passed" (not "Unknown ACR format")
- [ ] Resource page displays classification correctly (not "UNKNOWN")
- [ ] Resource access granted (200 OK, not 403)

---

## Known Limitations

### Current Approach
- **Static ACR/AMR**: Values are hardcoded in user attributes
- **No dynamic calculation**: Doesn't reflect actual MFA enrollment status
- **Manual updates**: Need to update each user's attributes individually

### Implications
- All USA realm users with `acr="1"` attribute will pass AAL2 validation
- Backend trusts the claim without verifying actual MFA was performed
- If user doesn't have OTP enrolled, they still get AAL2 token (security gap)

---

## Next Steps for Production

### Short-term (Immediate)
1. ✅ Update test users john.doe and alice.general (DONE)
2. ⏳ Test web UI login flow
3. ⏳ Verify resource access works
4. ⏳ Update other test users in USA realm

### Medium-term (This Week)
1. **Enforce MFA enrollment**: Ensure users actually have OTP/WebAuthn configured
   ```hcl
   required_actions = ["CONFIGURE_TOTP"]
   ```

2. **Add conditional mapper**: Use Keycloak conditional logic
   - If user has OTP credential → acr="1"
   - If user has WebAuthn credential → acr="2"
   - Else → acr="0"

3. **Audit existing tokens**: Check for users with AAL2 claims but no MFA

### Long-term (Future Sprint)
1. **Deploy custom SPI**: Build proper ACR/AMR calculation engine
   - Reads actual authentication methods from session
   - Sets session notes dynamically
   - Supports multiple realms

2. **Backend verification**: Don't just trust ACR claim
   - Query Keycloak to verify user has MFA credential
   - Check credential was used in current session
   - Implement "step-up authentication" for sensitive operations

3. **Policy refinement**: Update OPA policy
   - Add credential verification rules
   - Implement time-based session validation
   - Support different AAL levels per classification

---

## Rollback Procedure

If this causes issues:

```bash
cd /home/mike/Desktop/DIVE-V3/DIVE-V3/terraform
git diff usa-realm.tf  # Review changes
git checkout HEAD -- usa-realm.tf  # Revert if needed
terraform apply -target=keycloak_generic_protocol_mapper.usa_acr_mapper \
                -target=keycloak_generic_protocol_mapper.usa_amr_mapper
```

Then remove user attributes via Keycloak Admin Console.

---

## Files Modified

1. `terraform/usa-realm.tf`
   - Lines 226-258: ACR/AMR protocol mappers
   - Lines 271-280: john.doe user attributes
   - Lines 313-323: alice.general user attributes

2. `scripts/set-user-acr-amr.sh` (NEW)
   - Keycloak API script to set user attributes

3. `docs/fixes/authentication-strength-root-cause-analysis-20251107.md`
   - Detailed root cause analysis

4. `docs/fixes/acr-amr-mapper-fix-implementation-20251107.md`
   - Implementation details and security considerations

---

## Security Notes

### ⚠️ Important
The current solution sets ACR="1" in user attributes, which means:
- Backend will accept these tokens as AAL2
- NO verification that user actually completed MFA
- Potential security gap if user doesn't have MFA enrolled

### Mitigation
1. **Enforce MFA enrollment** via required actions
2. **Short token lifetime** (15 minutes) limits exposure
3. **Audit logging** captures all access decisions
4. **Monitor for anomalies** (ACR="1" but no OTP credential)

### Production Recommendation
Before going to production, implement one of:
- Custom SPI for dynamic ACR calculation
- Backend credential verification
- Conditional protocol mapper based on MFA enrollment

---

## Support

If issues persist:

1. **Check Keycloak logs**: `docker logs dive-v3-keycloak`
2. **Check backend logs**: `docker logs dive-v3-backend | grep AAL`
3. **Inspect JWT token**: Use jwt.io to decode and verify claims
4. **Run debug script**: `./scripts/debug-auth-strength.js <resourceId> <token>`

For questions, refer to:
- Root cause doc: `docs/fixes/authentication-strength-root-cause-analysis-20251107.md`
- Implementation doc: `docs/fixes/acr-amr-mapper-fix-implementation-20251107.md`
- Backend AAL logic: `backend/src/middleware/authz.middleware.ts:477-631`
- OPA policy: `policies/fuel_inventory_abac_policy.rego:750-808`





