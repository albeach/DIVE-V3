# WebAuthn Server-Side Credential Lookup Fix

## Problem

After registering a YubiKey, when you log out and try to log back in, you see:
- "No credentials found"
- Prompt to register a new key
- WebAuthn authentication fails

## Root Cause

**With `requireResidentKey: No` (server-side credentials):**
- Credentials are stored server-side in Keycloak
- Keycloak **MUST know the user ID** before it can look up credentials
- Password authentication establishes user context
- WebAuthn authenticator THEN looks up credentials for that user

**The Issue:**
- If WebAuthn runs BEFORE password, Keycloak doesn't know which user to look up
- This causes "no credentials found" errors
- Keycloak thinks you're trying to do passwordless authentication (which requires `requireResidentKey: Yes`)

## Solution

### Option 1: Use WebAuthn as Second Factor (Recommended)

**Ensure the authentication flow is:**
1. Username/Password Form (REQUIRED) ← Establishes user context
2. Conditional WebAuthn (CONDITIONAL) ← Looks up credentials for that user

**Steps:**
1. Log in with **username and password FIRST**
2. After password authentication, WebAuthn will be prompted
3. Touch your YubiKey when prompted
4. Authentication completes

**This is the correct flow for server-side credentials (`requireResidentKey: No`).**

### Option 2: Switch to Discoverable Credentials (Not Recommended for YubiKey)

If you want passwordless authentication:
1. Set `requireResidentKey: Yes` in WebAuthn Policy
2. Delete existing credentials
3. Re-register with discoverable credentials
4. **Note:** YubiKeys may not fully support discoverable credentials

## Verification

Run the diagnostic script:
```bash
cd backend
KEYCLOAK_URL=https://usa-idp.dive25.com npm run fix-webauthn-lookup -- --username admin-dive
```

Check:
- ✅ Require Resident Key = "No" (server-side)
- ✅ Credential exists
- ✅ WebAuthn comes AFTER password in flow

## Current Configuration

Your current setup:
- **Require Resident Key:** No (server-side credentials)
- **RP ID:** dive25.com
- **Credential Type:** webauthn (not passwordless)
- **Authentication Flow:** Password → Conditional WebAuthn

## Expected Behavior

1. **Login Page:** Enter username and password
2. **After Password:** If clearance = TOP_SECRET, WebAuthn prompt appears
3. **WebAuthn Prompt:** Touch YubiKey
4. **Success:** ACR=2 (AAL3) in token

## Troubleshooting

### If you see "No credentials found":

1. **Check:** Are you entering username/password FIRST?
   - ❌ Wrong: Clicking "Use Passkey" or "Sign in with Security Key" before password
   - ✅ Correct: Enter username → password → THEN WebAuthn prompt appears

2. **Check:** Is the authentication flow correct?
   - Path: Authentication → Flows → Browser Flow
   - Ensure: WebAuthn authenticator comes AFTER password form

3. **Check:** Are credentials registered?
   ```bash
   KEYCLOAK_URL=https://usa-idp.dive25.com npm run debug-webauthn -- --username admin-dive
   ```

### If WebAuthn doesn't prompt after password:

1. Check user's clearance attribute
2. Verify conditional flow is configured correctly
3. Check browser console for errors

## Key Insight

**Server-side credentials (`requireResidentKey: No`) = Two-factor authentication**
- First factor: Password
- Second factor: WebAuthn

**Discoverable credentials (`requireResidentKey: Yes`) = Passwordless authentication**
- Single factor: WebAuthn only (no password)

Your current setup uses **two-factor authentication**, which is correct for AAL3 compliance.

