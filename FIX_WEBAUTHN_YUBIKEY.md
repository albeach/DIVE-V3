# Fix YubiKey WebAuthn "No Credentials Found" Error

## Problem
When trying to authenticate with a YubiKey security key, you see:
> "No credentials were found for dive25.com on this security key. Try again with a different security key."

This happens because your YubiKey was registered with a different **Relying Party ID (RP ID)** than what's currently configured in Keycloak.

## Root Cause
WebAuthn credentials are tied to the RP ID used during registration. If the RP ID changed or was misconfigured, existing credentials won't work.

## Solution: Fix RP ID Configuration

### Step 1: Access Keycloak Admin Console

1. Go to your Keycloak instance:
   - **USA**: https://usa-idp.dive25.com/admin
   - **FRA**: https://fra-idp.dive25.com/admin
   - **GBR**: https://gbr-idp.dive25.com/admin
   - **DEU**: https://deu-idp.prosecurity.biz/admin

2. Login with admin credentials (from GCP Secret Manager or your .env file)

### Step 2: Configure WebAuthn Policy

1. Select your realm (e.g., `dive-v3-broker`)
2. Go to **Authentication** → **Policies** → **WebAuthn Policy**
3. Check/Set the following:
   - **Relying Party Entity Name**: `DIVE V3 Coalition Platform`
   - **Relying Party ID**: `dive25.com` ⚠️ **CRITICAL: Must be exactly "dive25.com"**
   - **Signature Algorithms**: `ES256, RS256`
   - **User Verification Requirement**: `preferred` (or `required` for AAL3)
   - **Require Resident Key**: `Yes`
   - **Authenticator Attachment**: (leave empty to allow all types)

4. Click **Save**

### Step 3: Configure WebAuthn Passwordless Policy

1. Still in **Authentication** → **Policies**
2. Click **WebAuthn Passwordless Policy**
3. Set the **SAME** values as above:
   - **Relying Party ID**: `dive25.com` ⚠️ **CRITICAL**
   - All other settings should match the WebAuthn Policy

4. Click **Save**

### Step 4: Re-register Your YubiKey

⚠️ **IMPORTANT**: After fixing the RP ID, you **MUST** re-register your YubiKey because credentials are tied to the RP ID.

1. Logout completely from Keycloak
2. Login again as your TOP_SECRET user (e.g., `testuser-usa-4`)
3. When prompted for WebAuthn registration:
   - Click **Register Security Key**
   - Insert your YubiKey
   - Touch the YubiKey when prompted
   - Give it a label (e.g., "My YubiKey")
4. Complete the registration

### Step 5: Verify Configuration

After re-registering, try logging in again. The YubiKey should now work.

## Alternative: Automated Fix (Requires Admin Credentials)

If you have admin credentials set up, you can run:

```bash
cd backend

# Set your Keycloak URL (replace with your instance)
export KEYCLOAK_URL="https://usa-idp.dive25.com"
export KEYCLOAK_ADMIN_USERNAME="admin"
export KEYCLOAK_ADMIN_PASSWORD="your-admin-password-from-gcp"

# Run the fix script
npm run fix-webauthn-rpid
```

## Troubleshooting

### Still seeing "No credentials found"?

1. **Clear browser cache and cookies** completely
2. **Use incognito/private window** to test
3. **Check browser console** for JavaScript errors (F12 → Console)
4. **Verify HTTPS** is being used (WebAuthn requires HTTPS)
5. **Check RP ID** in browser console:
   - Open browser DevTools (F12)
   - Go to Console tab
   - Look for `[WebAuthn] rpId:` log messages
   - Should show `dive25.com`

### YubiKey still not working after re-registration?

1. **Try a different browser** (Chrome, Firefox, Edge)
2. **Check YubiKey Manager** to see registered credentials
3. **Reset YubiKey** (if needed, this will delete ALL credentials):
   ```bash
   # Install YubiKey Manager: https://www.yubico.com/support/download/yubikey-manager/
   ykman fido reset
   ```
   ⚠️ **WARNING**: This deletes ALL FIDO2 credentials on the YubiKey!

### RP ID Mismatch Error

If you see errors about RP ID mismatch:
- The RP ID in Keycloak must match the domain you're accessing from
- For `*.dive25.com` subdomains, use `dive25.com` as RP ID
- For `*.prosecurity.biz` subdomains, use `prosecurity.biz` as RP ID

## Expected Configuration

✅ **Correct**:
- RP ID: `dive25.com` (works for usa-idp.dive25.com, fra-idp.dive25.com, etc.)
- User Verification: `preferred` or `required`
- Require Resident Key: `Yes`

❌ **Wrong**:
- RP ID: `usa-idp.dive25.com` (too specific, won't work across subdomains)
- RP ID: `` (empty string - only works for localhost)
- RP ID: `localhost` (only works for localhost)

## References

- Keycloak WebAuthn Docs: https://www.keycloak.org/docs/latest/server_admin/#webauthn_server_administration_guide
- WebAuthn Spec: https://www.w3.org/TR/webauthn-2/#relying-party-identifier

