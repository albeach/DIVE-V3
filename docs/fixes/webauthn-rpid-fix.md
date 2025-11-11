# WebAuthn (Passkey) Fix for Production Domains

## Issue
When authenticating as a TOP_SECRET user (e.g., `testuser-pol-ts`), users were redirected to the WebAuthn registration page but encountered an "internal server error":
```
https://dev-auth.dive25.com/realms/dive-v3-pol/login-actions/required-action?execution=webauthn-register&...
Error: "We are sorry..." An internal server error has occurred
```

## Root Cause
According to the [Keycloak WebAuthn documentation](https://www.keycloak.org/docs/latest/server_admin/#webauthn_server_administration_guide):

> **Relying Party ID**: The ID of a WebAuthn Relying Party that determines the scope of Public Key Credentials. **The ID must be the origin's effective domain**. If this entry is blank, Keycloak adapts the host part of Keycloak's base URL.

The WebAuthn Policy for all realms had an **empty Relying Party ID** (`rpId: ""`), which works for localhost but **fails for production domains** like `dev-auth.dive25.com`.

### Why This Fails
When the rpId is empty on a production domain:
1. The browser's WebAuthn API receives a credential creation request with an invalid/missing rpId
2. The WebAuthn authenticator rejects the request
3. Keycloak's required action page throws an internal server error
4. The user cannot complete authentication

## Solution
Configure the **Relying Party ID** to the **effective domain** of the Keycloak server:
- **Production**: `dive25.com` (the parent domain)
- **Localhost**: `localhost` or empty string (`""`)

### Implementation

#### Method 1: Automated Script (Recommended)
```bash
# From backend directory
cd backend
npm run fix-webauthn-rpid
```

This script:
1. Authenticates with Keycloak Admin API
2. Updates the WebAuthn Policy for all 11 realms
3. Sets `rpId` to `dive25.com`
4. Configures AAL3-compliant settings

#### Method 2: Manual Configuration (Per Realm)
1. Navigate to Keycloak Admin Console: `https://dev-auth.dive25.com/admin`
2. Select realm (e.g., `dive-v3-pol`)
3. Go to **Authentication** → **Policies** → **WebAuthn Policy**
4. Set **Relying Party ID** to `dive25.com`
5. Click **Save**
6. Repeat for each realm

## WebAuthn Policy Configuration (AAL3-Compliant)
```json
{
  "rpEntityName": "DIVE V3 Coalition Platform",
  "rpId": "dive25.com",
  "signatureAlgorithms": ["ES256", "RS256"],
  "attestationConveyancePreference": "none",
  "authenticatorAttachment": "cross-platform",
  "requireResidentKey": "No",
  "userVerificationRequirement": "required",
  "createTimeout": 300,
  "avoidSameAuthenticatorRegister": false,
  "acceptableAaguids": []
}
```

### Key Settings Explained
- **rpId**: `dive25.com` - The effective domain (matches `*.dive25.com`)
- **userVerificationRequirement**: `required` - **CRITICAL for AAL3** (NIST SP 800-63B)
- **authenticatorAttachment**: `cross-platform` - Supports YubiKey, Titan Key, etc.
- **attestationConveyancePreference**: `none` - Privacy-preserving (no attestation required)
- **signatureAlgorithms**: `ES256, RS256` - Standard WebAuthn algorithms

## Testing
1. Navigate to: `https://dev-app.dive25.com`
2. Click **Sign In** → Select **Poland (POL)** realm
3. Login as `testuser-pol-ts` / `DiveDemo2025!`
4. You should see the WebAuthn registration page (no more errors!)
5. Register a passkey:
   - **1Password**: Use "Create Passkey" feature
   - **YubiKey**: Insert and touch the key
   - **Windows Hello**: Use fingerprint/PIN/face recognition
   - **Touch ID**: Use fingerprint on Mac
6. Complete registration
7. You should be redirected back to the application with AAL3 authentication (`acr: "2"`)

## Supported Authenticators
- ✅ YubiKey 5 Series (USB-A, USB-C, NFC)
- ✅ Google Titan Security Key
- ✅ 1Password (built-in passkey manager)
- ✅ Windows Hello (fingerprint, PIN, face)
- ✅ Touch ID (Mac, iPhone)
- ✅ Android Biometric
- ✅ Feitian ePass FIDO2
- ✅ SoloKeys

## Verification
To verify the fix is applied:

### Option 1: Keycloak Admin UI
1. Go to `https://dev-auth.dive25.com/admin`
2. Select realm → **Authentication** → **Policies** → **WebAuthn Policy**
3. Verify **Relying Party ID** shows `dive25.com`

### Option 2: REST API
```bash
# Get admin token
TOKEN=$(curl -sSL -k \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  "https://dev-auth.dive25.com/realms/master/protocol/openid-connect/token" | jq -r '.access_token')

# Get realm configuration
curl -sSL -k \
  -H "Authorization: Bearer $TOKEN" \
  "https://dev-auth.dive25.com/admin/realms/dive-v3-pol" | jq '.webAuthnPolicyRpId'

# Expected output: "dive25.com"
```

## Frontend Considerations
**No frontend changes required**. The WebAuthn registration happens entirely on Keycloak's side during the OAuth/OIDC flow:

1. User authenticates with password
2. Keycloak detects missing WebAuthn credential
3. User is redirected to Keycloak's WebAuthn registration page (required action)
4. User registers passkey
5. Keycloak redirects back to NextAuth callback
6. NextAuth receives the authorization code and completes the flow

The Next.js frontend doesn't need to handle WebAuthn registration directly.

## Files Modified
- ✅ `backend/src/scripts/fix-webauthn-rpid.ts` - New script to configure WebAuthn Policy
- ✅ `backend/package.json` - Added `npm run fix-webauthn-rpid` command
- ✅ `scripts/fix-webauthn-rpid.sh` - Bash version (deprecated, use Node.js version)
- ✅ `docs/fixes/webauthn-rpid-fix.md` - This documentation

## Future Improvements
1. **Terraform Automation**: Add WebAuthn Policy to Terraform realm configuration (currently not supported by the provider)
2. **Environment-Specific rpId**: Automatically detect and set rpId based on deployment environment:
   - `localhost` for local dev
   - `dive25.com` for dev/staging/prod
3. **Health Check**: Add endpoint to verify WebAuthn configuration
4. **Monitoring**: Alert if WebAuthn registration failures exceed threshold

## References
- [Keycloak WebAuthn Documentation](https://www.keycloak.org/docs/latest/server_admin/#webauthn_server_administration_guide)
- [WebAuthn Specification (W3C)](https://www.w3.org/TR/webauthn/)
- [NIST SP 800-63B (AAL3 Requirements)](https://pages.nist.gov/800-63-3/sp800-63b.html#aal3reqs)
- [FIDO2 Authenticator Attestation](https://fidoalliance.org/specs/fido-v2.0-ps-20190130/fido-client-to-authenticator-protocol-v2.0-ps-20190130.html)

## Troubleshooting

### Issue: "NotAllowedError: The operation either timed out or was not allowed"
**Cause**: User didn't interact with the authenticator within the timeout period (300 seconds)
**Solution**: Try again and touch the authenticator when prompted

### Issue: "InvalidStateError: The authenticator was previously registered"
**Cause**: User is trying to register the same authenticator twice
**Solution**: Use a different authenticator or remove the existing credential from the user's account

### Issue: "SecurityError: The operation is insecure"
**Cause**: WebAuthn requires HTTPS (except for localhost)
**Solution**: Ensure the site is accessed via HTTPS (`https://dev-auth.dive25.com`)

### Issue: Still getting "internal server error" after applying fix
**Cause**: Browser cache or old Keycloak session
**Solution**:
1. Clear browser cache and cookies
2. Logout completely from Keycloak
3. Try in an incognito/private window
4. Verify rpId is set correctly (see Verification section)

## AAL3 Token Claims
After successful WebAuthn registration and authentication, the token should include:

```json
{
  "acr": "2",
  "amr": ["pwd", "hwk"],
  "clearance": "TOP_SECRET",
  "auth_time": 1731268800,
  "uniqueID": "testuser-pol-ts@mon.gov.pl",
  "countryOfAffiliation": "POL",
  "acpCOI": ["NATO-COSMIC", "FVEY"]
}
```

- `acr: "2"` = AAL3 authentication level
- `amr: ["pwd", "hwk"]` = Password + Hardware Key (WebAuthn)
- `auth_time` = Unix timestamp of authentication event

---

**Status**: ✅ RESOLVED
**Date Fixed**: November 10, 2025
**Tested By**: DIVE V3 Team
**Affected Realms**: All 11 realms (USA, FRA, CAN, DEU, GBR, ITA, ESP, POL, NLD, Industry, Broker)


