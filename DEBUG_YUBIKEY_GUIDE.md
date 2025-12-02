# 🔍 Debug YubiKey "Unknown User" Error

## Step 1: Run Diagnostic Script

```bash
cd backend
KEYCLOAK_URL=https://usa-idp.dive25.com npm run debug-webauthn -- --username admin-dive
```

This will check:
- ✅ WebAuthn credentials registered for admin-dive
- ✅ UserHandle matching (most common cause of "Unknown user")
- ✅ RP ID configuration
- ✅ Realm WebAuthn policy settings

## Common Issues & Fixes

### Issue 1: UserHandle Mismatch ❌
**Symptom**: Credential userHandle doesn't match current user ID

**Fix**:
1. Delete the existing credential:
   ```bash
   npm run check-webauthn-credentials -- --username admin-dive --delete
   ```
2. Re-register passkey:
   - Log in with username/password
   - Go to Security → Register Passkey
   - Register your YubiKey again

### Issue 2: RP ID Mismatch ❌
**Symptom**: RP ID is not set to "dive25.com"

**Fix**:
```bash
# Run the RP ID fix script
KEYCLOAK_URL=https://usa-idp.dive25.com npm run fix-webauthn-rpid
```

Then re-register your passkey.

### Issue 3: Wrong Realm/User ❌
**Symptom**: Credential was registered on different user/realm

**Fix**: Delete and re-register on correct user

## Step 2: After Running Diagnostic

The script will tell you exactly what's wrong. Common outputs:

### ✅ Good Output:
```
✅ Found 1 WebAuthn credential(s)
✅ UserHandle Match: YES
✅ RP ID is correct: "dive25.com"
```

### ❌ Bad Output (UserHandle Mismatch):
```
⚠️  MISMATCH: Credential userHandle doesn't match current user ID!
   This is likely causing "Unknown user" error.
```

**Solution**: Delete and re-register

### ❌ Bad Output (RP ID Wrong):
```
❌ RP ID MISMATCH!
   Expected: "dive25.com"
   Actual: "NOT SET" or wrong value
```

**Solution**: Run `npm run fix-webauthn-rpid` then re-register

## Step 3: Clean Up & Re-register

1. **Delete old credentials**:
   ```bash
   npm run check-webauthn-credentials -- --username admin-dive --delete
   ```

2. **Fix RP ID** (if needed):
   ```bash
   KEYCLOAK_URL=https://usa-idp.dive25.com npm run fix-webauthn-rpid
   ```

3. **Re-register YubiKey**:
   - Log out completely
   - Log back in with username/password
   - When prompted, register your YubiKey
   - Give it a label like "My YubiKey"

4. **Test authentication**:
   - Log out
   - Try logging in with passkey
   - Should work! ✅

## Why This Happens

The "Unknown user" error occurs when:
- **UserHandle mismatch**: The credential was registered with a different user ID (maybe user was deleted/recreated)
- **RP ID changed**: Credential was registered with different RP ID
- **Realm mismatch**: Credential belongs to different realm

WebAuthn credentials are cryptographically tied to:
- User ID (userHandle)
- RP ID (domain)
- Credential ID

If any of these change, the credential won't work.

## Quick Test

After re-registering, test with:
```bash
# Check credentials
npm run check-webauthn-credentials -- --username admin-dive

# Should show your new credential with matching userHandle
```

## Still Not Working?

1. **Check browser console** (F12 → Console):
   - Look for WebAuthn errors
   - Check `[WebAuthn]` log messages

2. **Check Keycloak logs**:
   - Look for WebAuthn authentication errors
   - Check userHandle validation errors

3. **Try different browser**:
   - Chrome, Firefox, Edge
   - Some browsers handle WebAuthn differently

4. **Check YubiKey**:
   - Make sure it's not locked
   - Try touching it when prompted
   - Check YubiKey Manager for registered credentials

