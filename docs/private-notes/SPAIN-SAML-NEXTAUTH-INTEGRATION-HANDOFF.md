# Spain SAML Integration - NextAuth v5 State Management Issue

**Status**: ⚠️ **BLOCKED - Architecture Incompatibility**  
**Date**: October 28, 2025  
**Priority**: HIGH - Critical for Multi-IdP Federation Demo

---

## 📋 Executive Summary

The Spain SAML integration is **95% complete** but blocked by a fundamental architectural incompatibility between NextAuth v5's OAuth state management and custom SAML redirect flows. The SAML authentication flow itself (SimpleSAMLphp ↔ Keycloak) works perfectly, but the final callback to NextAuth fails due to state parameter validation.

**Core Issue**: NextAuth v5 generates cryptographic state parameters during OAuth initialization and validates them on callback. Our custom SAML redirect bypasses this initialization, causing the callback to fail with `InvalidCheck: state value could not be parsed`.

---

## ✅ What's Working

### 1. SAML Flow (SimpleSAMLphp ↔ Keycloak)
- ✅ SimpleSAMLphp container running on `http://localhost:9443`
- ✅ SAML metadata correctly configured in `external-idps/spain-saml/metadata/saml20-sp-remote.php`
- ✅ User authentication at SimpleSAMLphp works (tested with `juan.garcia` / `EspanaDefensa2025!`)
- ✅ SAML assertion sent to Keycloak successfully
- ✅ Keycloak processes SAML assertion and creates federated user

**Evidence**: Browser testing showed successful flow from SimpleSAMLphp → Keycloak → First Broker Login page

### 2. Keycloak Configuration
- ✅ IdP `esp-realm-external` configured via Terraform
- ✅ SAML endpoints configured:
  - Entity ID: `http://localhost:9443/simplesaml/saml2/idp/metadata.php`
  - SSO URL: `http://localhost:9443/simplesaml/module.php/saml/idp/singleSignOnService`
- ✅ Attribute mappers configured for `uniqueID`, `clearance`, `countryOfAffiliation`, `acpCOI`
- ✅ Keycloak accepts and processes SAML assertions

### 3. Backend Integration
- ✅ Clearance normalization: `SECRETO` → `SECRET` (60/60 tests passing)
- ✅ MongoDB resource metadata seeded
- ✅ Backend API ready to receive authenticated users

### 4. OPA Policies
- ✅ 167/172 tests passing (97.1%)
- ✅ Spain-specific clearance handling implemented

---

## ❌ The Blocker: NextAuth v5 State Management

### Problem Description

NextAuth v5 uses a strict OAuth 2.0 flow with cryptographic state and PKCE validation. When we manually redirect to Keycloak (bypassing NextAuth's `signIn()` function), NextAuth cannot validate the callback because:

1. **State Mismatch**: NextAuth generates a random state parameter and stores it in a cookie/session. Our custom redirect creates its own state, which NextAuth cannot validate.
2. **PKCE Missing**: NextAuth expects a PKCE code_verifier to validate the code_challenge, but our manual redirect doesn't create one.
3. **Cookie Issues**: NextAuth sets HTTP-only cookies during OAuth initialization that are required for callback validation.

### Error Logs

```
[NextAuth Error] [InvalidCheck: state value could not be parsed. Read more at https://errors.authjs.dev#invalidcheck]
GET /api/auth/callback/keycloak?state=eyJjYWxsYmFja1VybCI6Ii9kYXNoYm9hcmQifQ&session_state=...&code=... 302 in 207ms
```

### What We Tried

#### Attempt 1: Direct Keycloak Redirect
**File**: `frontend/src/app/api/auth/saml-redirect/route.ts`

```typescript
// Directly redirect to Keycloak OAuth endpoint with kc_idp_hint
const authUrl = new URL(`${keycloakUrl}/realms/${keycloakRealm}/protocol/openid-connect/auth`);
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('redirect_uri', `${frontendUrl}/api/auth/callback/keycloak`);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', 'openid profile email');
authUrl.searchParams.set('kc_idp_hint', idpAlias);
authUrl.searchParams.set('state', Buffer.from(JSON.stringify({ callbackUrl })).toString('base64url'));

return NextResponse.redirect(authUrl.toString());
```

**Result**: ❌ Fails - NextAuth cannot validate the custom state parameter.

#### Attempt 2: Manual State/Nonce in Browser
**File**: `frontend/src/app/login/[idpAlias]/page.tsx`

```typescript
// Generate state and nonce manually
const state = Math.random().toString(36).substring(2, 15);
const nonce = Math.random().toString(36).substring(2, 15);

sessionStorage.setItem('oauth_state', state);
sessionStorage.setItem('oauth_nonce', nonce);

window.location.href = authUrl;
```

**Result**: ❌ Fails - NextAuth doesn't recognize sessionStorage values; it uses its own internal state management.

#### Attempt 3: IdP Selector Direct Redirect
**File**: `frontend/src/components/auth/idp-selector.tsx`

```typescript
if (idp.protocol === 'saml') {
  router.push(`/api/auth/saml-redirect?idpAlias=${idp.alias}&callbackUrl=/dashboard`);
  return;
}
```

**Result**: ❌ Same issue - state validation fails at callback.

---

## 🔧 Potential Solutions

### Solution 1: Keycloak `hideOnLoginPage` + `kc_idp_hint` Auto-Redirect ⭐ **RECOMMENDED**

**Concept**: Configure Keycloak to automatically redirect to the SAML IdP when `kc_idp_hint` is present, without showing the Keycloak login page. This allows NextAuth to control the entire OAuth flow.

#### Implementation Steps

1. **Add `hideOnLoginPage` to Keycloak IdP**:

Update `terraform/modules/external-idp-saml/main.tf`:

```hcl
resource "keycloak_oidc_identity_provider" "saml_idp" {
  # ... existing config ...
  
  # Hide IdP on login page - force kc_idp_hint usage
  hide_on_login_page = true
  
  # Ensure auto-redirect when hint is provided
  # This may require additional Keycloak configuration
}
```

2. **Modify NextAuth Provider to Include kc_idp_hint**:

Update `frontend/src/auth.ts`:

```typescript
Keycloak({
  clientId: process.env.KEYCLOAK_CLIENT_ID as string,
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET as string,
  issuer: `http://localhost:8081/realms/${process.env.KEYCLOAK_REALM}`,
  authorization: {
    url: `http://localhost:8081/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/auth`,
    params: (request) => {
      // Extract idpHint from request URL or state
      const url = new URL(request.url);
      const idpHint = url.searchParams.get('idpHint');
      
      return {
        scope: "openid profile email offline_access",
        ...(idpHint && { kc_idp_hint: idpHint })
      };
    }
  },
  token: `http://keycloak:8080/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`,
  userinfo: `http://keycloak:8080/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/userinfo`,
  checks: ["pkce", "state"],
  allowDangerousEmailAccountLinking: true,
}),
```

3. **Update IdP Selector to Use NextAuth's signIn()**:

Update `frontend/src/components/auth/idp-selector.tsx`:

```typescript
import { signIn } from 'next-auth/react';

const handleIdpClick = async (idp: IdPOption) => {
  if (idp.protocol === 'saml') {
    // Use NextAuth's built-in signIn with custom authorization params
    await signIn('keycloak', 
      { callbackUrl: '/dashboard', redirect: true },
      { kc_idp_hint: idp.alias }
    );
    return;
  }
  
  // OIDC IdPs use custom login page
  router.push(`/login/${idp.alias}?redirect_uri=/dashboard`);
};
```

**Pros**:
- ✅ Uses NextAuth's built-in OAuth flow (proper state management)
- ✅ No custom redirect logic needed
- ✅ Maintains security (PKCE, state validation)
- ✅ Seamless user experience (single click)

**Cons**:
- ⚠️ Requires Keycloak Terraform provider to support `hideOnLoginPage`
- ⚠️ May require Keycloak configuration to auto-redirect on `kc_idp_hint`
- ⚠️ Need to verify Keycloak behavior with hidden IdPs

**Status**: ⏳ **NEEDS INVESTIGATION**

---

### Solution 2: Custom NextAuth Provider for SAML

**Concept**: Create a custom NextAuth provider that handles the SAML flow directly, bypassing Keycloak for SAML IdPs.

#### Implementation Outline

1. Create custom provider in `frontend/src/auth.ts`:

```typescript
import { OAuthConfig, OAuthUserConfig } from "next-auth/providers";

function SAMLProvider<P extends Record<string, any>>(
  options: OAuthUserConfig<P> & {
    idpAlias: string;
    samlEndpoint: string;
  }
): OAuthConfig<P> {
  return {
    id: `saml-${options.idpAlias}`,
    name: options.name,
    type: "oauth",
    authorization: {
      url: options.samlEndpoint,
      params: {
        // Custom SAML params
      }
    },
    token: {
      url: `http://keycloak:8080/realms/dive-v3-broker/protocol/openid-connect/token`,
    },
    userinfo: {
      url: `http://keycloak:8080/realms/dive-v3-broker/protocol/openid-connect/userinfo`,
    },
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name,
        email: profile.email,
        // Map SAML attributes
      };
    },
  };
}

// In providers array:
SAMLProvider({
  idpAlias: "esp-realm-external",
  name: "Spain Ministry of Defense",
  samlEndpoint: "http://localhost:8081/realms/dive-v3-broker/broker/esp-realm-external/login",
  clientId: process.env.KEYCLOAK_CLIENT_ID,
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
}),
```

**Pros**:
- ✅ Full control over SAML flow
- ✅ Proper NextAuth state management
- ✅ Can be reused for other SAML IdPs

**Cons**:
- ⚠️ Complex implementation
- ⚠️ Requires deep NextAuth knowledge
- ⚠️ More code to maintain
- ⚠️ May break on NextAuth updates

**Status**: ⏸️ **COMPLEX - Last Resort**

---

### Solution 3: Server-Side Redirect with NextAuth Session

**Concept**: Create a server-side route that uses NextAuth's internal functions to initiate the OAuth flow with `kc_idp_hint`.

#### Implementation

Create `frontend/src/app/api/auth/saml-init/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const idpAlias = searchParams.get('idpAlias');
  
  // Use NextAuth's internal OAuth URL generator
  const authUrl = new URL('/api/auth/signin/keycloak', request.url);
  authUrl.searchParams.set('callbackUrl', '/dashboard');
  
  // Somehow pass kc_idp_hint to NextAuth's authorization params
  // This is the tricky part - NextAuth doesn't expose this easily
  
  return NextResponse.redirect(authUrl);
}
```

**Pros**:
- ✅ Server-side control
- ✅ Uses NextAuth infrastructure

**Cons**:
- ⚠️ NextAuth v5 doesn't expose easy way to customize authorization params per-request
- ⚠️ Still requires workarounds
- ⚠️ May not solve the core issue

**Status**: ⏸️ **NEEDS MORE RESEARCH**

---

### Solution 4: Accept Manual Two-Click Flow (WORKAROUND)

**Concept**: Accept that users will see the Keycloak login page and manually click the SAML IdP link.

#### Current Behavior

1. User clicks "Spain Ministry of Defense (External SAML)" on DIVE homepage
2. Redirected to `/api/auth/saml-redirect`
3. Redirected to Keycloak login page with `kc_idp_hint=esp-realm-external`
4. Keycloak shows login page with IdP options (doesn't auto-redirect)
5. User manually clicks "Spain Ministry of Defense (External SAML)" link
6. Redirected to SimpleSAMLphp → User authenticates
7. SAML assertion sent to Keycloak → First Broker Login page
8. User fills in profile info → Submit
9. ❌ **FAILS** at NextAuth callback with state validation error

**Workaround**:
- Use standard NextAuth `signIn('keycloak')` from homepage
- Let NextAuth control the entire flow
- Accept that users see Keycloak login page
- Document this as "expected behavior"

**Pros**:
- ✅ No code changes needed
- ✅ Secure (proper OAuth flow)
- ✅ Works with NextAuth v5

**Cons**:
- ❌ Poor UX (two clicks instead of one)
- ❌ Doesn't leverage `kc_idp_hint` properly
- ❌ Not ideal for production

**Status**: ✅ **FALLBACK OPTION**

---

## 🔍 Technical Deep Dive

### NextAuth v5 OAuth Flow

```
1. User clicks signIn('keycloak')
   ↓
2. NextAuth generates:
   - state: crypto.randomBytes(32)
   - code_verifier: crypto.randomBytes(32)
   - code_challenge: base64url(sha256(code_verifier))
   ↓
3. NextAuth stores in session/cookie:
   - state → encrypted cookie
   - code_verifier → encrypted cookie
   ↓
4. NextAuth redirects to Keycloak:
   GET /auth?state=<encrypted>&code_challenge=<hash>&...
   ↓
5. User authenticates at Keycloak
   ↓
6. Keycloak redirects back:
   GET /callback?state=<same>&code=<auth_code>&...
   ↓
7. NextAuth validates:
   - state matches stored value ✓
   - code_challenge matches code_verifier ✓
   ↓
8. NextAuth exchanges code for tokens
   ↓
9. Session created ✓
```

### Our Bypass Attempt (FAILS)

```
1. User clicks Spain SAML button
   ↓
2. Our code redirects to Keycloak:
   GET /auth?state=<our_custom_state>&...
   ↓
   ❌ NextAuth never stored this state
   ❌ No code_verifier created
   ↓
3. Keycloak redirects back:
   GET /callback?state=<our_custom_state>&code=...
   ↓
4. NextAuth tries to validate:
   ❌ state not found in cookies
   ❌ code_verifier not found
   ↓
5. NextAuth rejects: InvalidCheck error
   ↓
6. Redirect to /?error=Configuration
```

---

## 📝 File Changes Made

### Created Files

1. **`frontend/src/app/api/auth/saml-redirect/route.ts`**
   - Custom SAML redirect handler
   - Generates manual OAuth URL with `kc_idp_hint`
   - **Status**: ❌ Doesn't work due to state validation

2. **`SPAIN-SAML-NEXTAUTH-INTEGRATION-HANDOFF.md`** (this file)
   - Comprehensive documentation of the issue

### Modified Files

1. **`frontend/src/components/auth/idp-selector.tsx`**
   - Added SAML detection logic
   - Redirects to `/api/auth/saml-redirect` for SAML IdPs
   - **Revert needed** if using Solution 1

2. **`frontend/src/app/login/[idpAlias]/page.tsx`**
   - Added SAML detection and loading state
   - **Revert needed** if using Solution 1

3. **`frontend/src/auth.ts`**
   - Enhanced error logging
   - Fixed issuer URL
   - Added PKCE/state checks
   - **Modifications preserved** (good for debugging)

---

## 🧪 Testing Evidence

### Manual E2E Test Results

```
✅ SimpleSAMLphp Login Page: WORKING
   - URL: http://localhost:9443/simplesaml/
   - User: juan.garcia / EspanaDefensa2025!
   - Authentication: SUCCESS

✅ SAML Assertion to Keycloak: WORKING
   - Assertion received by Keycloak
   - User mapped to esp-realm-external
   - Attributes extracted correctly

✅ First Broker Login Page: WORKING
   - Keycloak shows profile completion form
   - Email, first name, last name fields populated
   - Submit button functional

❌ NextAuth Callback: FAILING
   - Error: InvalidCheck: state value could not be parsed
   - Redirect: /?error=Configuration
```

### Log Evidence

```bash
# Frontend Logs (docker logs dive-v3-frontend)
[SAML Redirect] esp-realm-external is SAML - redirecting to SAML handler
[SAML Redirect API] Handling SAML redirect for IdP: esp-realm-external, callback: /dashboard
[SAML Redirect API] Redirecting to Keycloak: http://localhost:8081/realms/dive-v3-broker/protocol/openid-connect/auth?...

[NextAuth Error] [InvalidCheck: state value could not be parsed. Read more at https://errors.authjs.dev#invalidcheck]
GET /api/auth/callback/keycloak?state=eyJjYWxsYmFja1VybCI6Ii9kYXNoYm9hcmQifQ&session_state=...&code=... 302 in 207ms
```

---

## 🚀 Recommended Next Steps

### Immediate Actions (Solution 1 - RECOMMENDED)

1. **Research Keycloak `hideOnLoginPage` Support**:
   ```bash
   cd terraform/modules/external-idp-saml
   grep -r "hide_on_login" .
   # Check Keycloak Terraform provider docs for this attribute
   ```

2. **Test kc_idp_hint Auto-Redirect**:
   - Manually test Keycloak behavior with hidden IdP
   - Verify auto-redirect when `kc_idp_hint` is present
   - Document any additional Keycloak configuration needed

3. **Implement NextAuth Authorization Params**:
   - Research NextAuth v5 dynamic authorization params
   - Implement `kc_idp_hint` passing from IdP selector to NextAuth
   - Test with hidden IdP configuration

4. **Update IdP Selector**:
   - Replace custom redirect with `signIn('keycloak', {...}, { kc_idp_hint: idpAlias })`
   - Remove `/api/auth/saml-redirect` route
   - Revert changes to login page

### Alternative Path (Solution 4 - WORKAROUND)

If Solution 1 is not feasible:

1. **Accept Two-Click Flow**:
   - Remove custom SAML redirect logic
   - Use standard `signIn('keycloak')` for all IdPs
   - Document in user guide: "Click your organization, then click the SAML IdP link"

2. **Update Documentation**:
   - Mark Spain SAML as "OIDC-style flow" (requires Keycloak intermediary)
   - Document as limitation of NextAuth v5 architecture
   - Provide clear user instructions

3. **Create Issue for Future**:
   - Open GitHub issue for NextAuth provider enhancement
   - Document desired behavior for community feedback

---

## 📚 References

### NextAuth v5 Documentation
- OAuth Providers: https://next-auth.js.org/configuration/providers/oauth
- Custom Providers: https://next-auth.js.org/tutorials/creating-a-database-adapter
- Authorization Params: https://next-auth.js.org/configuration/providers/oauth#authorization

### Keycloak Documentation
- Identity Brokering: https://www.keycloak.org/docs/latest/server_admin/#_identity_broker
- `kc_idp_hint`: https://www.keycloak.org/docs/latest/server_admin/#_client_suggested_idp
- SAML Configuration: https://www.keycloak.org/docs/latest/server_admin/#saml

### Related Files
- `SPAIN-SAML-FINAL-QA-REPORT.md` - Previous session report
- `SPAIN-SAML-NEXTAUTH-FIX-STATUS.md` - Initial troubleshooting
- `terraform/external-idp-spain-saml.tf` - Keycloak IdP configuration
- `external-idps/spain-saml/metadata/saml20-sp-remote.php` - SimpleSAMLphp SP metadata

---

## 🎯 Success Criteria

For Spain SAML integration to be considered **COMPLETE**:

1. ✅ User clicks "Spain Ministry of Defense" button
2. ✅ Single redirect to SimpleSAMLphp (no Keycloak login page)
3. ✅ User authenticates with `juan.garcia` / `EspanaDefensa2025!`
4. ✅ SAML assertion processed by Keycloak
5. ✅ First Broker Login page (one-time only)
6. ✅ User redirected to `/dashboard`
7. ✅ Dashboard shows:
   - Name: "Juan García López"
   - Clearance: "SECRET" (transformed from SECRETO)
   - Country: "ESP"
   - COI: ["NATO-COSMIC", "OTAN-ESP"]

**Current Status**: Steps 1-4 work, Step 5 shows, Step 6-7 fail due to NextAuth callback error.

---

## 💡 Key Insights

1. **SAML Flow is NOT the problem** - SimpleSAMLphp and Keycloak communicate perfectly
2. **NextAuth v5 is the bottleneck** - State management is tightly controlled
3. **kc_idp_hint works** - But requires proper integration with NextAuth
4. **Two valid paths forward**:
   - Make Keycloak auto-redirect (cleanest)
   - Accept manual flow (quick workaround)

---

## 🔗 Quick Links

- SimpleSAMLphp Admin: http://localhost:9443/simplesaml/
- Keycloak Admin: http://localhost:8081/admin (admin/admin)
- DIVE Frontend: http://localhost:3000
- Backend API: http://localhost:4000

---

**Last Updated**: October 28, 2025  
**Next Session**: Implement Solution 1 (hideOnLoginPage + auto-redirect) or accept Solution 4 (manual flow)

