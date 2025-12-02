# 🚀 QUICK FIX FOR DEMO - Set ACR=2 (AAL3) Without Rebuilding Keycloak

## The Problem
- Your current JWT token has ACR="1" (AAL2) because it was issued before passkey registration
- You need ACR="2" (AAL3) for your demo

## ✅ GOOD NEWS: No Rebuild Needed!

The `AMRProtocolMapper` already exists and checks for WebAuthn credentials. It will automatically set ACR="2" when you log in again.

## 🎯 QUICKEST FIX (30 seconds):

### Option 1: Log Out and Log Back In (RECOMMENDED)
1. **Log out** from the application
2. **Log back in** with your admin-dive account
3. The `AMRProtocolMapper` will detect your WebAuthn credential and set ACR="2" automatically
4. ✅ Done! You'll see AAL3 in the UI

### Option 2: Check if WebAuthn is Registered
Run this to verify your YubiKey is registered:
```bash
cd backend
KEYCLOAK_URL=https://usa-idp.dive25.com npm run check-webauthn-credentials -- --username admin-dive
```

### Option 3: Manual Session Update (If Option 1 doesn't work)
If logging out/in doesn't work, the `AMREnrichmentEventListener` needs to be updated (requires rebuild).
But you can manually verify WebAuthn is registered and the protocol mapper should pick it up.

## 🔍 How to Verify It Worked:

1. After logging back in, check your JWT token:
   - Open browser DevTools → Application → Cookies
   - Find the session cookie
   - Decode the JWT at jwt.io
   - Look for `"acr": "2"` in the payload

2. Check the UI:
   - User menu → Profile tab
   - Should show: **AAL: AAL3** (not AAL2)
   - Should show: **MFA: ✅ Configured**

## 📋 Why This Works:

The `AMRProtocolMapper` (Java code) runs during token generation and:
1. Checks if user has WebAuthn credentials: `user.credentialManager().getStoredCredentialsByTypeStream("webauthn")`
2. If yes → Sets `acr = "2"` (AAL3)
3. If OTP only → Sets `acr = "1"` (AAL2)
4. If password only → Sets `acr = "0"` (AAL1)

**The mapper is already deployed** - you just need a fresh token!

## ⚠️ If It Still Shows AAL2:

1. Verify WebAuthn credential exists:
   ```bash
   cd backend
   KEYCLOAK_URL=https://usa-idp.dive25.com npm run check-webauthn-credentials -- --username admin-dive
   ```

2. Check Keycloak Admin Console:
   - Go to: https://usa-idp.dive25.com/admin
   - Realm: `dive-v3-broker`
   - Users → admin-dive → Credentials tab
   - Should see a WebAuthn credential

3. If no credential found, register it:
   - Log in → User menu → Security → Register Passkey

## 🎬 For Your Demo:

**Recommended flow:**
1. Log out now
2. Log back in
3. Verify AAL3 shows in UI
4. Access your resource: https://usa-app.dive25.com/resources/doc-USA-seed-1764680140291-01300
5. OPA will see ACR="2" and allow access ✅

**Backup plan if still AAL2:**
- Show that WebAuthn is registered (Admin Console)
- Explain that token refresh is needed
- The fix is deployed, just needs a new session

---

**Time needed:** 30 seconds (just log out/in)
**Risk:** Zero - no code changes needed
**Works because:** AMRProtocolMapper already checks WebAuthn!

