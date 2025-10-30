# 🎯 Proper OTP Enrollment Solution - Keycloak Best Practices

**Date**: October 27, 2025  
**Status**: Architecture Review & Recommendation

---

## ❌ Current Approach Issues

### Hybrid Approach (Current)
- ✅ Validates OTP with speakeasy (good)
- ❌ Creates credentials from backend via shell command (insecure)
- ❌ Bypasses Keycloak's credential management (not best practice)
- ❌ Doesn't use Keycloak's built-in security features

### Custom SPI Approach (Attempted)
- ✅ Uses proper `OTPCredentialProvider` (correct!)
- ✅ Uses `user.credentialManager().createStoredCredential()` (correct!)
- ❌ Direct Grant flow consumes parameters before SPI sees them
- ❌ Can't pass enrollment data through authentication chain

---

## ✅ Proper Solution: Use Keycloak's Required Action SPI

According to the [Keycloak Server Developer Guide - Authentication SPI](https://www.keycloak.org/docs/latest/server_development/index.html#_auth_spi), the **correct pattern** for OTP enrollment is:

### Architecture

```
1. User logs in with password
   ↓
2. Keycloak checks: Does user have OTP?
   ↓ NO
3. Keycloak triggers Required Action: CONFIGURE_TOTP
   ↓
4. Custom Required Action Provider:
   - Generates OTP secret
   - Returns secret + QR to frontend
   - Frontend displays in custom UI
   - User scans QR, submits code
   - Provider validates code
   - Provider creates credential via CredentialProvider SPI
   ↓
5. Required Action complete
   ↓
6. User re-authenticates with OTP
   ↓
7. Keycloak returns AAL2 token with ACR/AMR claims
```

---

## 📋 Implementation Plan

### Step 1: Create Custom Required Action Provider

**File**: `keycloak/extensions/src/main/java/com/dive/keycloak/action/ConfigureOTPRequiredAction.java`

```java
package com.dive.keycloak.action;

import org.keycloak.authentication.RequiredActionContext;
import org.keycloak.authentication.RequiredActionProvider;
import org.keycloak.credential.CredentialProvider;
import org.keycloak.credential.OTPCredentialProvider;
import org.keycloak.models.OTPPolicy;
import org.keycloak.models.credential.OTPCredentialModel;
import org.keycloak.models.utils.Base32;
import org.keycloak.utils.TotpUtils;

import javax.ws.rs.core.Response;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

public class ConfigureOTPRequiredAction implements RequiredActionProvider {

    @Override
    public void requiredActionChallenge(RequiredActionContext context) {
        // Generate OTP secret
        String secret = Base32.random(20);
        
        // Build OTP URL for QR code
        String otpUrl = String.format(
            "otpauth://totp/%s:%s?secret=%s&issuer=%s",
            URLEncoder.encode("DIVE V3", StandardCharsets.UTF_8),
            URLEncoder.encode(context.getUser().getUsername(), StandardCharsets.UTF_8),
            secret,
            URLEncoder.encode("DIVE", StandardCharsets.UTF_8)
        );
        
        // Return JSON response for custom UI
        String responseJson = String.format(
            "{" +
            "\"mfaSetupRequired\": true," +
            "\"otpSecret\": \"%s\"," +
            "\"otpUrl\": \"%s\"" +
            "}",
            secret,
            otpUrl
        );
        
        // Store secret in auth session for later validation
        context.getAuthenticationSession().setAuthNote("otp_secret", secret);
        
        context.challenge(
            Response.ok(responseJson).type("application/json").build()
        );
    }

    @Override
    public void processAction(RequiredActionContext context) {
        // Get submitted OTP code
        String otpCode = context.getHttpRequest().getDecodedFormParameters().getFirst("totp");
        String secret = context.getAuthenticationSession().getAuthNote("otp_secret");
        
        if (secret == null || otpCode == null) {
            context.failure();
            return;
        }
        
        // Validate OTP code
        OTPPolicy policy = context.getRealm().getOTPPolicy();
        boolean valid = TotpUtils.validateTOTP(otpCode, secret.getBytes(), policy);
        
        if (!valid) {
            context.challenge(
                Response.status(401)
                    .entity("{\"error\": \"Invalid OTP code\"}")
                    .type("application/json")
                    .build()
            );
            return;
        }
        
        // Create OTP credential using proper CredentialProvider SPI
        OTPCredentialProvider otpProvider = (OTPCredentialProvider) context.getSession()
            .getProvider(CredentialProvider.class, "keycloak-otp");
        
        OTPCredentialModel credentialModel = OTPCredentialModel.createFromPolicy(
            context.getRealm(),
            secret
        );
        
        context.getUser().credentialManager().createStoredCredential(credentialModel);
        
        // Success - remove required action
        context.success();
    }

    @Override
    public void close() {
        // No cleanup needed
    }
}
```

### Step 2: Create Required Action Factory

**File**: `keycloak/extensions/src/main/java/com/dive/keycloak/action/ConfigureOTPRequiredActionFactory.java`

```java
package com.dive.keycloak.action;

import org.keycloak.Config;
import org.keycloak.authentication.RequiredActionFactory;
import org.keycloak.authentication.RequiredActionProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;

public class ConfigureOTPRequiredActionFactory implements RequiredActionFactory {

    public static final String PROVIDER_ID = "dive-configure-totp";

    @Override
    public RequiredActionProvider create(KeycloakSession session) {
        return new ConfigureOTPRequiredAction();
    }

    @Override
    public String getId() {
        return PROVIDER_ID;
    }

    @Override
    public String getDisplayText() {
        return "DIVE Configure OTP";
    }

    @Override
    public void init(Config.Scope config) {
        // No initialization needed
    }

    @Override
    public void postInit(KeycloakSessionFactory factory) {
        // No post-initialization needed
    }

    @Override
    public void close() {
        // No cleanup needed
    }
}
```

### Step 3: Register Required Action in META-INF

**File**: `keycloak/extensions/src/main/resources/META-INF/services/org.keycloak.authentication.RequiredActionFactory`

```
com.dive.keycloak.action.ConfigureOTPRequiredActionFactory
```

### Step 4: Update Backend to Detect Required Action

**File**: `backend/src/controllers/custom-login.controller.ts`

```typescript
// After authentication attempt
if (response.status === 401 && errorDescription) {
    // Check if required action needed
    const requiredActions = response.data?.requiredActions;
    if (requiredActions && requiredActions.includes('dive-configure-totp')) {
        // Parse OTP setup data from response
        const setupData = JSON.parse(errorDescription);
        
        res.status(200).json({
            success: false,
            mfaSetupRequired: true,
            otpSecret: setupData.otpSecret,
            otpUrl: setupData.otpUrl
        });
        return;
    }
}
```

### Step 5: Update Frontend to Submit to Required Action Endpoint

**File**: `frontend/src/app/login/[idpAlias]/page.tsx`

```typescript
// When submitting OTP enrollment
const response = await fetch(`${backendUrl}/api/auth/required-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        action: 'dive-configure-totp',
        username: formData.username,
        password: formData.password,
        totp: formData.otp,
        sessionId: setupToken // From initial auth response
    })
});
```

---

## 🔒 Security Benefits

### Using Required Action SPI:
✅ **Keycloak-native**: Uses Keycloak's built-in security mechanisms  
✅ **Session-based**: OTP secret stored in authentication session (encrypted)  
✅ **Credential Provider**: Uses proper `CredentialProvider` SPI  
✅ **Audit trail**: All actions logged through Keycloak's event system  
✅ **Transaction safe**: Credential creation is transactional  
✅ **No shell commands**: Pure Java, no external process execution  
✅ **Realm-isolated**: Can't create credentials in wrong realm  

---

## 📚 References

1. [Keycloak Authentication SPI](https://www.keycloak.org/docs/latest/server_development/index.html#_auth_spi)
2. [Required Action Walkthrough](https://www.keycloak.org/docs/latest/server_development/index.html#required-action-walkthrough)
3. [Credential Management](https://www.keycloak.org/docs/latest/server_development/index.html#_credential_spi)

---

## 🎯 Recommendation

**Remove the hybrid approach** and implement the proper Required Action SPI solution. This is:

1. ✅ **Secure** - No shell commands, uses Keycloak's internal APIs
2. ✅ **Best Practice** - Follows official Keycloak patterns
3. ✅ **Maintainable** - Standard Keycloak extension
4. ✅ **Auditable** - All actions logged properly
5. ✅ **Production-ready** - Used by major enterprises

**Estimated Implementation Time**: 2-3 hours

---

## 🚀 Next Steps

1. Remove hybrid OTP enrollment code from backend
2. Implement `ConfigureOTPRequiredAction` and factory
3. Register required action in META-INF
4. Rebuild and redeploy Keycloak extension
5. Update backend to detect and handle required actions
6. Update frontend to submit to required action endpoint
7. Test end-to-end flow
8. Remove kcadm.sh approach

This is the **proper, secure, production-ready** solution.

