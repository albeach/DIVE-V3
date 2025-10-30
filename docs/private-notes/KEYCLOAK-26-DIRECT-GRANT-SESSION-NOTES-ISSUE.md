# Keycloak 26 Migration - Claims Missing Root Cause

## Problem Summary

**Symptom**: ACR, AMR, and auth_time claims are MISSING from JWT tokens for `admin-dive` user

**Root Cause**: Session notes not set during Direct Grant (password) flow

## Technical Analysis

### What Changed in Keycloak 26

Keycloak 26 changed how ACR/AMR claims are populated:
- **Before (v23)**: Could be set as user attributes
- **After (v26)**: MUST come from session notes:
  - `AUTH_CONTEXT_CLASS_REF` → `acr` claim
  - `AUTH_METHODS_REF` → `amr` claim

### Why Session Notes Aren't Being Set

1. **Browser Flow**: Keycloak automatically sets session notes during browser authentication
2. **Direct Grant Flow**: Bypasses browser flow, session notes NOT automatically set
3. **Our Custom SPI**: Only sets session notes during OTP validation
4. **Password-Only Auth**: Doesn't trigger OTP authenticator, so notes never set

### Current Behavior

```
User: admin-dive (no OTP configured)
Flow: Direct Grant (password only)

1. Backend calls: /realms/dive-v3-broker/protocol/openid-connect/token
2. Keycloak validates password ✅
3. Custom OTP SPI: NOT triggered (user has no OTP credential)
4. Session notes: NOT set ❌
5. Protocol mappers: Try to read session notes → find nothing
6. Result: acr, amr, auth_time = MISSING
```

## Solution Options

### Option 1: Add Password Authenticator to Set Session Notes (RECOMMENDED)

Create a new authenticator that runs BEFORE OTP check in Direct Grant flow:

```java
public class DirectGrantPasswordWithACR implements Authenticator {
    @Override
    public void authenticate(AuthenticationFlowContext context) {
        // Validate password (existing logic)
        // ...

        // CRITICAL: Set session notes for Keycloak 26
        context.getAuthenticationSession().setAuthNote("AUTH_CONTEXT_CLASS_REF", "0"); // AAL1 for password-only
        context.getAuthenticationSession().setAuthNote("AUTH_METHODS_REF", "[\"pwd\"]");

        context.success();
    }
}
```

Then configure Direct Grant flow:
1. Password authenticator (sets ACR=0, AMR=["pwd"])
2. OTP authenticator (upgrades to ACR=1, AMR=["pwd","otp"])

### Option 2: Update Custom SPI to Always Set Session Notes

Modify `DirectGrantOTPAuthenticator.authenticate()` to set minimum session notes:

```java
@Override
public void authenticate(AuthenticationFlowContext context) {
    UserModel user = context.getUser();

    // ALWAYS set minimum ACR/AMR for password authentication
    context.getAuthenticationSession().setAuthNote("AUTH_CONTEXT_CLASS_REF", "0");
    context.getAuthenticationSession().setAuthNote("AUTH_METHODS_REF", "[\"pwd\"]");

    // Check if OTP is required...
    // (existing logic)
}
```

**Issue**: This SPI might not run for password-only users

### Option 3: Use Client Scope with Hardcoded Claims (WORKAROUND)

Add hardcoded protocol mappers for Direct Grant client:

```hcl
resource "keycloak_generic_protocol_mapper" "broker_direct_grant_acr_fallback" {
  protocol_mapper = "oidc-hardcoded-claim-mapper"
  config = {
    "claim.name"  = "acr"
    "claim.value" = "0"  # AAL1
  }
}
```

**Issue**: Not dynamic, doesn't reflect actual authentication strength

### Option 4: Enable Browser Flow for Admin Login

Change frontend to use Authorization Code Flow instead of Direct Grant:

**Pros**: Session notes automatically set by Keycloak
**Cons**: Requires UI changes, loses custom login page

## Recommended Fix

### Step 1: Create DirectGrantPasswordAuthenticator

```bash
cd keycloak/extensions/src/main/java/com/dive/keycloak/authenticator/
# Create DirectGrantPasswordAuthenticator.java
```

### Step 2: Register in META-INF

```
org.keycloak.authentication.AuthenticatorFactory
com.dive.keycloak.authenticator.DirectGrantPasswordAuthenticatorFactory
com.dive.keycloak.authenticator.DirectGrantOTPAuthenticatorFactory
```

### Step 3: Configure Direct Grant Flow in Keycloak

1. Open Keycloak Admin Console
2. Navigate to: dive-v3-broker → Authentication → Flows
3. Duplicate "direct grant" flow → "direct grant with acr"
4. Add executions:
   - Username/Password (with ACR) - REQUIRED
   - OTP Setup/Validation - CONDITIONAL
5. Bind to client

### Step 4: Rebuild and Deploy

```bash
cd keycloak/extensions
mvn clean package
docker cp target/dive-keycloak-extensions.jar dive-v3-keycloak:/opt/keycloak/providers/
docker-compose restart keycloak
```

## Quick Workaround (Temporary)

Until we implement the full fix, users can:

1. **Use Browser Flow**: Login via http://localhost:3000 (Authorization Code Flow)
   - Session notes ARE set automatically
   - ACR/AMR claims will be present

2. **Test with MFA-Enabled User**: If admin-dive has OTP configured:
   - Custom SPI will run
   - Session notes will be set
   - Claims will be present

3. **Use National Realm**: Test with usa/fra/can realm users
   - Federation flow sets session notes
   - Claims should work

## Verification

After fix, test:

```bash
./scripts/test-admin-dive-claims.sh
```

Expected output:
```
✅ ACR claim present: 0 (or 1 if MFA)
✅ AMR claim present: ["pwd"] (or ["pwd","otp"] if MFA)
✅ auth_time claim present: 1730123456
```

## Timeline

**Immediate**: Document issue and workaround  
**Short-term**: Create DirectGrantPasswordAuthenticator (2-3 hours)  
**Long-term**: Migrate admin login to Authorization Code Flow

## References

- Keycloak 26 Changelog: Session note mappers
- NIST SP 800-63B: AAL levels (0=password, 1=MFA, 2=hardware)
- `KEYCLOAK-26-MIGRATION-CRITICAL-ISSUES.md`
- `DirectGrantOTPAuthenticator.java` lines 229-234, 269-274

