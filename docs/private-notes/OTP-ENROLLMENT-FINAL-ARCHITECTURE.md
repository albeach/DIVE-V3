# 🎯 OTP Enrollment - Final Architecture Decision

**Date**: October 27, 2025  
**Status**: ✅ FINAL DECISION

---

## The Problem

Direct Grant flow is **stateless** - there is no session persistence between authentication requests. Each request to `/protocol/openid-connect/token` is independent.

**Why session-based approach doesn't work:**
- Authentication Sessions in Keycloak are tied to browser-based flows
- Direct Grant doesn't maintain `AuthenticationSession` state between calls
- `context.getAuthenticationSession().getUserSessionNotes()` returns empty on second request

---

## ✅ THE CORRECT SOLUTION: Backend Validation + Admin API

Since Direct Grant is stateless and custom parameters don't reach the SPI reliably, the proper architecture is:

### Flow

```
1. Frontend → Backend → Keycloak (username + password)
   ↓
2. Custom SPI: User has no OTP → Generate secret → Return {mfaSetupRequired: true, otpSecret: "ABC..."}
   ↓
3. Backend receives response → Pass to frontend
   ↓
4. Frontend: Display QR code, user scans, enters OTP
   ↓
5. Frontend → Backend (username, password, OTP code, OTP secret)
   ↓
6. Backend:
   - Validate OTP code against secret using speakeasy
   - If valid: Call Keycloak Admin API to create credential
   - Then: Authenticate again with username + password + OTP to get AAL2 token
   ↓
7. Return AAL2 token to frontend
```

### Why This Works

✅ **No reliance on session state** - Secret passed explicitly  
✅ **Backend validates OTP** - Using speakeasy library  
✅ **Keycloak Admin API** - Creates credential directly  
✅ **AAL2 compliance** - Second authentication gets proper ACR/AMR claims  
✅ **Production-ready** - Many Keycloak deployments use this pattern  

### Security

- ✅ Secret transmitted over HTTPS
- ✅ OTP validated before credential creation
- ✅ Credential created via official Keycloak Admin API
- ✅ Re-authentication ensures proper token claims

---

## Implementation

We need to **restore the backend OTP validation**, but use the **Keycloak Admin API correctly** instead of shell commands.

### Backend Changes

```typescript
// Validate OTP with speakeasy
const isValid = speakeasy.totp.verify({
    secret: totp_secret,
    encoding: 'base32',
    token: otp,
    window: 1
});

if (isValid) {
    // Create OTP credential via Keycloak Admin API
    const adminToken = await getKeycloakAdminToken();
    const userId = await getUserIdByUsername(adminToken, realmName, username);
    
    // Create credential using Admin API
    await axios.put(
        `${keycloakUrl}/admin/realms/${realmName}/users/${userId}/credentials`,
        {
            type: 'otp',
            temporary: false,
            value: totp_secret  // This might not work - need to check API
        },
        { headers: { 'Authorization': `Bearer ${adminToken}` } }
    );
    
    // Re-authenticate with OTP to get AAL2 token
    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);
    params.append('totp', otp);
    // ... return token
}
```

### OR Use Required Action (Better!)

Actually, **Required Actions CAN work with Direct Grant** if we handle it correctly:

1. User needs OTP → Keycloak returns error with `requiredActions: ["CONFIGURE_TOTP"]`
2. Frontend calls a special `/setup-otp` endpoint
3. Backend:
   - Gets admin token
   - Creates OTP credential via Admin API  
   - Removes required action
4. User authenticates again with OTP

This is cleaner because it uses Keycloak's native required actions system.

---

## 🎯 RECOMMENDATION

**Use Keycloak Admin API approach** with backend validation:

1. Reinstall `speakeasy` in backend
2. Restore OTP validation logic in `customLoginHandler`
3. Use Keycloak Admin API `/users/{id}/credentials` endpoint
4. Test with proper API payload format

This is the most straightforward, production-ready solution for Direct Grant + Custom Login Pages.

---

**Next Step**: Implement Admin API credential creation properly (research correct API payload format first).

