# Complete Data Flow Analysis

## STEP 1: AUTHENTICATION FLOW

### User clicks IdP button (e.g., Canada)
→ IdpSelector component calls signIn("keycloak", {...}, {kc_idp_hint: "canada-idp"})

### NextAuth constructs authorization URL:
→ http://localhost:8081/realms/dive-v3-pilot/protocol/openid-connect/auth
  ?client_id=dive-v3-client
  &redirect_uri=http://localhost:3000/api/auth/callback/keycloak
  &response_type=code
  &scope=openid%20profile%20email
  &kc_idp_hint=canada-idp

### Browser redirects to Keycloak (dive-v3-pilot)
→ Keycloak sees kc_idp_hint=canada-idp
→ Keycloak redirects to canada-mock-idp
→ User logs in at canada-mock-idp
→ canada-mock-idp sends OIDC token back to dive-v3-pilot broker
→ dive-v3-pilot broker maps attributes
→ dive-v3-pilot creates/updates user in dive-v3-pilot realm

**KEYCLOAK SETS THESE COOKIES ON LOCALHOST:8081:**
- AUTH_SESSION_ID (authentication session)
- KEYCLOAK_SESSION (SSO session)
- KEYCLOAK_IDENTITY (user identity)
- *_LEGACY variants (backward compatibility)

### Keycloak redirects back to application:
→ http://localhost:3000/api/auth/callback/keycloak?code=...

### NextAuth callback handler processes code:
→ Exchanges code for tokens from dive-v3-pilot
→ Receives: access_token, id_token, refresh_token
→ DrizzleAdapter creates/updates records in PostgreSQL:
  - user table (from id_token claims)
  - account table (links user to keycloak provider, stores tokens)
  - session table (creates session with sessionToken)

**NEXTAUTH SETS THESE COOKIES ON LOCALHOST:3000:**
- next-auth.session-token (points to session in database)
- authjs.callback-url (callback URL during OAuth flow)
- authjs.csrf-token (CSRF protection)
- authjs.pkce.code_verifier (PKCE flow)
- authjs.state (OAuth state parameter)
- authjs.nonce (OIDC nonce)

### Session callback runs:
→ Decodes id_token to extract DIVE attributes
→ Applies enrichment if needed
→ Returns session object with user attributes

### Browser redirects to dashboard:
→ Dashboard renders with session.user attributes
→ User is logged in

## STEP 2: LOGOUT FLOW (What SHOULD happen)

### User clicks "Sign Out"
→ secure-logout-button.tsx handleLogout() runs

### getKeycloakLogoutUrl() constructs URL:
→ Need: session.idToken (should be in session from session callback)
→ Build: http://localhost:8081/realms/dive-v3-pilot/protocol/openid-connect/logout
  ?id_token_hint={session.idToken}
  &post_logout_redirect_uri=http://localhost:3000

### Browser navigates to Keycloak logout:
→ Keycloak validates id_token_hint
→ Keycloak DELETES its own cookies:
  - AUTH_SESSION_ID
  - KEYCLOAK_SESSION
  - KEYCLOAK_IDENTITY
→ Keycloak calls frontchannel_logout_url in iframe:
  http://localhost:3000/api/auth/logout-callback
→ Keycloak redirects to post_logout_redirect_uri

### Frontchannel logout callback (in iframe):
→ Server-side deletes NextAuth cookies
→ Returns HTML with JavaScript
→ JavaScript clears localStorage, sessionStorage
→ JavaScript sends postMessage('logout-complete')

### Parent window LogoutListener receives message:
→ Calls signOut({redirect: false})
→ signOut() triggers events.signOut callback
→ events.signOut deletes session from database
→ Redirects to home page

### Final state:
→ Keycloak cookies: GONE
→ NextAuth cookies: GONE
→ Database session: GONE
→ User must login again

## STEP 3: WHY IT'S NOT WORKING - INVESTIGATION NEEDED

Questions to answer:
1. Is session.idToken available in secure-logout-button? (Check console logs)
2. Is Keycloak logout URL being constructed? (Check console logs)
3. Is browser actually navigating to Keycloak? (Check network tab)
4. Is Keycloak deleting its cookies? (Check Application tab)
5. Is frontchannel logout being called? (Check console for iframe logs)
6. Is postMessage being sent/received? (Check console)
7. Is events.signOut being triggered? (Check console)
8. Is database session being deleted? (Check database)

