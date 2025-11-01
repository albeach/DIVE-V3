# DIVE V3 - Authentication Workflow Professional Audit

**Date**: November 1, 2025, 01:45 AM  
**Auditor**: Professional QA Analysis  
**Scope**: Complete authentication architecture review  
**Status**: 🔴 **CRITICAL FINDINGS** - Custom SPI not properly integrated

---

## Executive Summary

**Current State**: E2E authentication works with database sessions, MFA enrollment successful, BUT Custom SPI is NOT being used. The system is using Keycloak's built-in authenticators instead of our custom conditional MFA logic.

**Critical Finding**: We have **TWO authentication flows** configured, but Custom SPI is only designed for one of them and isn't actually configured in either flow.

---

## Authentication Flows - Architecture Analysis

### Flow 1: Browser Flow (Standard Flow / Authorization Code Flow)

**What It Is**:
- OAuth 2.0 Authorization Code Flow with PKCE
- Used by web applications (our Next.js frontend via NextAuth)
- User sees Keycloak login UI in browser
- Redirects with authorization code → exchange for tokens

**Current Configuration** (dive-v3-usa realm):
```
1. Cookie (ALTERNATIVE) - Check for existing Keycloak SSO session
2. Kerberos (DISABLED) - Enterprise SSO
3. Identity Provider Redirector (ALTERNATIVE) - Broker to other IdPs
4. Organization (ALTERNATIVE) - Organization-based routing
5. forms (ALTERNATIVE):
   ├─ Username Password Form (REQUIRED)
   └─ Browser - Conditional OTP (CONDITIONAL):
      ├─ Condition - user configured (REQUIRED)
      └─ OTP Form (REQUIRED) - providerId: "auth-otp-form"
```

**OTP Authenticator Used**: `auth-otp-form` (**Keycloak built-in**)
- Standard TOTP verification
- NOT our Custom SPI
- Prompts for 6-digit code
- Works with CONFIGURE_TOTP required action

**Custom SPI Status**: ❌ **NOT USED** in browser flow

### Flow 2: Direct Grant Flow (Resource Owner Password Credentials)

**What It Is**:
- OAuth 2.0 Direct Grant / ROPC flow
- Used by API clients and backend services
- No browser redirect - direct POST with username/password/otp
- Returns tokens immediately

**Current Configuration** (dive-v3-usa realm):
```
1. Username Validation (REQUIRED) - providerId: "direct-grant-validate-username"
2. Password (REQUIRED) - providerId: "direct-grant-validate-password"  
3. Direct Grant - Conditional OTP (CONDITIONAL):
   ├─ Condition - user configured (REQUIRED)
   └─ OTP (REQUIRED) - providerId: "direct-grant-validate-otp"
```

**OTP Authenticator Used**: `direct-grant-validate-otp` (**Keycloak built-in**)
- Standard TOTP validation
- NOT our Custom SPI
- Does NOT handle enrollment
- Fails if user doesn't have OTP

**Custom SPI Status**: ❌ **NOT CONFIGURED** in direct grant flow

**Custom SPI Capability**: `direct-grant-otp-setup` (providerId)
- ✅ Can validate existing OTP
- ✅ Can enroll new users (generate secret, return QR code)
- ✅ Supports conditional MFA based on clearance level
- ❌ Currently not used anywhere

---

## Current Authentication Flow (What's Actually Happening)

### User Journey - alice.general Login

**Step 1**: User clicks "United States (DoD)" on frontend
- NextAuth `signIn('keycloak', {}, { kc_idp_hint: 'usa-realm-broker' })`
- Sets state cookie, redirects to Keycloak broker realm

**Step 2**: Keycloak Broker delegates to USA realm
- `kc_idp_hint=usa-realm-broker` triggers federation
- Broker realm (dive-v3-broker) redirects to USA realm (dive-v3-usa)
- **Flow Used**: Browser Flow (Authorization Code)

**Step 3**: USA Realm authenticates user
- **Execution 1**: Cookie check (no existing session)
- **Execution 2**: Username Password Form
  - User enters: alice.general / Password123!
  - Validates against Keycloak user database

**Step 4**: Check for Required Actions
- alice.general has `requiredActions: ["CONFIGURE_TOTP"]`
- Keycloak shows TOTP enrollment screen
- User scans QR code, enters 6-digit code
- OTP credential created in `keycloak_db.credential` table:
  ```sql
  type: "otp"
  user_label: "DIVE Test Device"  
  credential_data: {"subType":"totp","digits":6,"period":30,"algorithm":"HmacSHA1"}
  ```
- Required action cleared

**Step 5**: Return to Browser Flow
- **Execution 3**: Browser - Conditional OTP
  - **Condition**: User has OTP configured? YES (totp: true)
  - **OTP Form**: Keycloak built-in `auth-otp-form`
  - ❌ **BUG**: This step should run but isn't showing!

**Step 6**: USA Realm returns authorization code to Broker
- Broker realm receives code
- Broker exchanges code for tokens with USA realm

**Step 7**: Broker returns code to NextAuth callback
- NextAuth exchanges code for tokens with Broker realm
- DrizzleAdapter creates database records:
  - `dive_v3_app.user`: alice.general@army.mil
  - `dive_v3_app.account`: keycloak provider link
  - `dive_v3_app.session`: session token
- User redirected to `/dashboard`

---

## OTP Credential Storage - CONFIRMED

**✅ OTP Stored in Keycloak PostgreSQL** (`keycloak_db` database):

```sql
Database: keycloak_db
Table: credential

   username    |   type   |    user_label    | created_date  
---------------+----------+------------------+---------------
 alice.general | password |                  | 1761971065988 
 alice.general | otp      | DIVE Test Device | 1761975918342 

Credential Data (JSON):
{
  "subType": "totp",
  "digits": 6,
  "counter": 0,
  "period": 30,
  "algorithm": "HmacSHA1"
}
```

**Secret Key Storage**: Encrypted in `secret_data` column (not shown for security)

**✅ User Attribute Updated**:
```json
{
  "username": "alice.general",
  "totp": true,
  "attributes": {
    "requireOTP": ["true"]
  }
}
```

---

## Custom SPI Analysis - Where It Should Be Used

### Our Custom SPI: `DirectGrantOTPAuthenticator`

**File**: `keycloak/extensions/src/main/java/com/dive/keycloak/authenticator/DirectGrantOTPAuthenticator.java`

**Provider ID**: `direct-grant-otp-setup`

**Capabilities**:
1. ✅ **OTP Validation** - Validate TOTP code for authenticated users
2. ✅ **OTP Enrollment** - Generate secret and QR code for new users
3. ✅ **Conditional Logic** - Require OTP based on user attributes (clearance, requireOTP)
4. ✅ **AAL2 Compliance** - Enforce MFA for TOP_SECRET users

**Designed For**: **Direct Grant Flow** (API authentication)

**Why Direct Grant?**:
- API clients can't scan QR codes or interact with browser forms
- Need programmatic way to enroll and verify OTP
- Custom SPI returns QR code data in response JSON
- Client app can display QR code or manual entry key

**Current Status**: ❌ **NOT CONFIGURED**
- Direct Grant flow uses built-in `direct-grant-validate-otp`
- Our Custom SPI `direct-grant-otp-setup` is NOT in the flow
- Custom SPI JAR is deployed but not bound to any flow

---

## The Missing Piece - Browser Flow OTP Enforcement

**Problem**: After MFA enrollment, Keycloak should prompt for OTP on subsequent logins, but it doesn't.

**Root Cause Analysis**:

1. **Browser Flow Has OTP Step** ✅
   - "Browser - Conditional OTP" execution exists
   - "OTP Form" (auth-otp-form) is REQUIRED
   - Condition: User has OTP configured

2. **alice.general Has OTP Configured** ✅
   - `totp: true`
   - OTP credential exists in database
   - `requiredActions: []` (CONFIGURE_TOTP cleared)

3. **Why OTP Form Doesn't Show?** 🔍
   - Need to investigate Keycloak session state
   - Possible SSO bypass (cookie authenticator succeeds before OTP check)
   - Need to check Browser Flow execution order

**Hypothesis**: Cookie authenticator (Step 1) is ALTERNATIVE with forms (Step 8). If cookie exists from previous session, OTP form is skipped because ALTERNATIVE means "success on first match".

**Fix**: Change Browser Flow to REQUIRED sequence:
```
1. Cookie (ALTERNATIVE) - initial SSO check
2. forms (ALTERNATIVE) - if no cookie:
   ├─ Username Password Form (REQUIRED)
   └─ OTP Form (REQUIRED if user.totp == true)
```

BUT for re-authentication with existing SSO, need separate flow or force re-auth.

---

## Architecture Decision Required

### Option A: Use Browser Flow ONLY (Current Approach)

**Pros**:
- Standard OAuth 2.0 Authorization Code Flow
- Browser-based UI (users can see forms)
- Secure (PKCE, state verification)
- NextAuth.js handles complexity

**Cons**:
- ❌ Custom SPI not used (Keycloak built-in authenticators instead)
- ❌ Can't customize onboarding/login process extensively
- ❌ Limited control over MFA enforcement logic
- ❌ SSO sessions can bypass OTP verification

**Current Implementation**:
- ✅ Working for initial authentication
- ✅ MFA enrollment via CONFIGURE_TOTP required action
- ❌ MFA verification not enforced on re-login (SSO bypass)
- ❌ Custom conditional logic (clearance-based MFA) not active

### Option B: Use Direct Grant Flow with Custom SPI

**Pros**:
- ✅ Custom SPI fully utilized
- ✅ Conditional MFA logic (TOP_SECRET requires MFA)
- ✅ Programmatic enrollment (API returns QR data)
- ✅ Complete control over authentication flow

**Cons**:
- ⚠️ Less secure than Authorization Code Flow (password exposed to client)
- ⚠️ No browser redirect (client must build own UI)
- ⚠️ Not recommended for public clients
- ⚠️ NextAuth doesn't natively support Direct Grant

**Implementation Required**:
- Replace built-in `direct-grant-validate-otp` with our `direct-grant-otp-setup`
- Build custom API endpoint for Direct Grant authentication
- Frontend must handle OTP enrollment UI (show QR code from API response)
- Bypass NextAuth for authentication (use custom implementation)

### Option C: Hybrid Approach (Recommended for DIVE V3)

**Architecture**:
1. **Browser Flow** - For federated SSO authentication
   - Use for initial coalition partner authentication
   - Standard Keycloak OTP form for verification
   - NextAuth handles token exchange

2. **Direct Grant Flow** - For API clients and custom scenarios
   - Configure Custom SPI `direct-grant-otp-setup`
   - Use for backend services, mobile apps, testing
   - Supports conditional MFA and programmatic enrollment

**Benefits**:
- ✅ Best of both worlds
- ✅ Federated partners use standard browser flow
- ✅ API clients use Direct Grant with Custom SPI
- ✅ Custom conditional logic available for programmatic access
- ✅ NextAuth continues to work for browser users

**Implementation**:
- Keep browser flow as-is (standard Keycloak authenticators)
- Replace `direct-grant-validate-otp` with `direct-grant-otp-setup` in Direct Grant flow
- Add custom API endpoint: `POST /api/auth/custom-login` (uses Direct Grant)
- Document when to use each flow

---

## Current Custom SPI Deployment Status

**Keycloak Container**:
```bash
$ docker exec dive-v3-keycloak ls -lah /opt/keycloak/providers/
-rw-r--r-- 1 keycloak 1000  94K Oct 27 22:06 dive-keycloak-extensions.jar ✅
-rw-r--r-- 1 keycloak 1000  11K Oct 27 14:38 dive-keycloak-spi.jar ✅
```

**Keycloak Logs**:
```
WARN  [org.key.services] KC-SERVICES0047: direct-grant-otp-setup 
  (com.dive.keycloak.authenticator.DirectGrantOTPAuthenticatorFactory) 
  is implementing the internal SPI authenticator. ✅

WARN  [org.key.services] KC-SERVICES0047: dive-configure-totp 
  (com.dive.keycloak.action.ConfigureOTPRequiredActionFactory) 
  is implementing the internal SPI required-action. ✅
```

**Status**: ✅ **Deployed and recognized by Keycloak**

**Configuration Status**: ❌ **NOT configured in any authentication flow**

---

## Answers to Your Questions

### Q1: Was the OTP actually stored?

**✅ YES** - Stored in **Keycloak's PostgreSQL database** (`keycloak_db`):

**Table**: `credential`
- `user_id`: a59fe9f2-b66d-4bba-b27e-dbdd84d2bbfe (alice.general)
- `type`: "otp"
- `user_label`: "DIVE Test Device"
- `created_date`: 1761975918342 (Nov 1, 2025, 01:18:38 AM)
- `credential_data`: `{"subType":"totp","digits":6,"period":30,"algorithm":"HmacSHA1"}`
- `secret_data`: (encrypted TOTP secret - not visible)

**Verification**:
- Keycloak Admin API: `totp: true` ✅
- User attribute: `requireOTP: ["true"]` ✅
- Required actions: `[]` (CONFIGURE_TOTP cleared) ✅

### Q2: Are we supposed to use both Direct Grant and Browser flows?

**Short Answer**: **It depends on your use case**.

**Long Answer**:

**Browser Flow** (Authorization Code):
- **Use For**: Human users authenticating via web browser
- **Used By**: NextAuth.js, federated IdP logins, SSO
- **Security**: Most secure (password never exposed to client app)
- **MFA**: Keycloak built-in OTP form authenticator
- **Custom SPI**: NOT applicable (browser flow needs UI components)

**Direct Grant Flow** (ROPC):
- **Use For**: Trusted API clients, backend services, testing, mobile apps
- **Used By**: Custom backend APIs, integration tests, CI/CD pipelines
- **Security**: Less secure (client sees password), only for trusted clients
- **MFA**: Can use Custom SPI for conditional logic
- **Custom SPI**: ✅ **DESIGNED FOR THIS**

**NATO Coalition Context**:
- Federated partners → **Browser Flow** (standard OIDC/SAML)
- Backend integrations → **Direct Grant** with Custom SPI
- Mobile apps → **Direct Grant** or Device Authorization Grant

### Q3: Was the Custom SPI supposed to customize the login/onboarding?

**Partial Misunderstanding** - Let me clarify:

**Custom SPI Purpose** (`DirectGrantOTPAuthenticator`):
- ✅ Customize **Direct Grant** flow (API authentication)
- ✅ Programmatic MFA enrollment (return QR code via API)
- ✅ Conditional MFA based on attributes (clearance, requireOTP)
- ❌ NOT for customizing browser login UI (that's what themes are for)

**What Custom SPI Can Do**:
```java
// Example Direct Grant API call with Custom SPI
POST https://localhost:8443/realms/dive-v3-usa/protocol/openid-connect/token
{
  "grant_type": "password",
  "username": "alice.general",
  "password": "Password123!",
  "totp_setup": "true",  // Custom parameter for enrollment
  "client_id": "dive-v3-broker-client",
  "client_secret": "..."
}

// If user needs MFA enrollment, Custom SPI returns:
{
  "error": "otp_setup_required",
  "error_description": "OTP enrollment needed",
  "qrCode": "otpauth://totp/...",
  "secret": "KI3GQ3KVGVXVK5KWMJAVOQTDJRRVMQSI"
}

// Client app shows QR code, user scans, then:
POST https://localhost:8443/realms/dive-v3-usa/protocol/openid-connect/token
{
  "grant_type": "password",
  "username": "alice.general",
  "password": "Password123!",
  "totp": "186349",  // OTP code from authenticator
  "client_id": "dive-v3-broker-client"
}

// Returns access/refresh/id tokens
```

**What Themes Customize**:
- Browser login UI appearance (colors, layout, branding)
- Custom login.ftl template (HTML structure)
- Localization (messages_en.properties)
- We already have 11 custom themes deployed ✅

---

## Recommendation: Hybrid Architecture

### Implement Both Flows with Clear Use Cases

**For Browser Users** (Current - Keep As-Is):
- ✅ Use Browser Flow with Keycloak built-in authenticators
- ✅ MFA enrollment via CONFIGURE_TOTP required action (already working)
- ✅ Custom themes for branding (already deployed)
- ✅ NextAuth.js for token management
- 🔧 **FIX NEEDED**: Configure browser flow to enforce OTP verification on re-authentication

**For API Clients** (Add Custom SPI Configuration):
- ✅ Configure Direct Grant flow to use `direct-grant-otp-setup` (our Custom SPI)
- ✅ Build custom API endpoint: `POST /api/auth/custom-login`
- ✅ Support programmatic MFA enrollment
- ✅ Use for backend integrations, testing, mobile apps

### Implementation Steps

**Step 1**: Fix Browser Flow OTP Enforcement
```bash
# Option A: Change Browser Flow Cookie to REQUIRED (force re-auth)
# Option B: Add max_age=0 parameter to force fresh authentication
# Option C: Configure OTP form to always prompt (remove conditional)
```

**Step 2**: Configure Custom SPI in Direct Grant Flow
```bash
# Replace built-in direct-grant-validate-otp with direct-grant-otp-setup
# Via Terraform or Admin API
```

**Step 3**: Document Flow Usage
```markdown
| Use Case | Flow | Authenticator | MFA Enrollment | MFA Verification |
|----------|------|---------------|----------------|------------------|
| Web Browser Users | Browser (Authorization Code) | Built-in | CONFIGURE_TOTP required action | auth-otp-form |
| API Clients | Direct Grant (ROPC) | Custom SPI | Programmatic (QR code in response) | direct-grant-otp-setup |
| Backend Services | Direct Grant | Custom SPI | Pre-configured or programmatic | direct-grant-otp-setup |
```

---

## Critical Findings Summary

### ✅ What's Working

1. **Database Adapter** - Production-ready:
   - Schema fixed (no duplicate primary keys)
   - User, account, session tables created correctly
   - Sessions persisted to PostgreSQL
   - Sign-out deletes database session

2. **Custom SPI Deployment**:
   - JARs copied to `/opt/keycloak/providers/`
   - Keycloak recognizes both SPIs
   - DirectGrantOTPAuthenticatorFactory loaded
   - ConfigureOTPRequiredActionFactory loaded

3. **MFA Enrollment** (Browser Flow):
   - CONFIGURE_TOTP required action works
   - OTP credential created in Keycloak database
   - QR code displayed, manual entry supported
   - Credential persisted with user label

4. **E2E Authentication**:
   - IdP selection → Keycloak broker → USA realm → authentication → callback → dashboard
   - Custom USA theme displays
   - User attributes normalized
   - Database sessions created

### ❌ What's NOT Working

1. **Custom SPI Not Configured**:
   - Direct Grant flow uses built-in `direct-grant-validate-otp`
   - Our Custom SPI `direct-grant-otp-setup` not in any flow
   - Conditional MFA logic (clearance-based) not active
   - Programmatic enrollment not available

2. **Browser Flow OTP Verification Skipped**:
   - OTP Form configured but not prompting on re-login
   - SSO cookie authenticator bypasses OTP check
   - Security gap: User enrolled in MFA but not required to use it

3. **Middleware Edge Runtime Issue**:
   - Edge Runtime can't use database adapter (postgres-js requires Node.js `net` module)
   - Middleware can't call `auth()` with database sessions
   - Authorization currently relies on page-level `auth()` checks (not middleware)

### ⚠️ Architecture Confusion

**Problem**: We have Custom SPI for Direct Grant but are using Browser Flow exclusively.

**Why This Happened**:
- NextAuth.js uses OAuth 2.0 Authorization Code Flow (browser flow)
- Custom SPI was built for Direct Grant Flow (API authentication)
- These are **different OAuth flows** for **different use cases**
- We need BOTH, not one or the other

---

## Recommended Action Plan

### Immediate (Fix Browser Flow MFA Verification)

1. **Configure Browser Flow to Enforce OTP**:
   - Modify `max_age` parameter to force re-authentication
   - OR change Browser Flow to always prompt for OTP (not conditional)
   - OR disable Cookie authenticator (force credentials every time)

2. **Test MFA Verification**:
   - Logout alice.general
   - Clear Keycloak SSO sessions
   - Login again - should prompt for username, password, AND OTP code

### Short-Term (Configure Custom SPI for Direct Grant)

3. **Replace Direct Grant OTP Authenticator**:
   - Via Terraform or Admin API, update dive-v3-usa Direct Grant flow
   - Remove: `direct-grant-validate-otp`
   - Add: `direct-grant-otp-setup` (our Custom SPI)

4. **Build Custom Login API Endpoint**:
   - `POST /api/auth/custom-login` (uses Direct Grant)
   - Supports programmatic MFA enrollment
   - Returns QR code data for client-side display

5. **Test Direct Grant with Custom SPI**:
   ```bash
   curl -X POST https://localhost:8443/realms/dive-v3-usa/protocol/openid-connect/token \
     -d "grant_type=password" \
     -d "username=bob.contractor" \
     -d "password=..." \
     -d "totp_setup=true" \
     -d "client_id=dive-v3-broker-client"
   ```

### Long-Term (Production Architecture)

6. **Document Flow Usage Matrix**
7. **Add AAL enforcement** (acr claim = 2 for MFA sessions)
8. **Configure session policies** (max SSO age, re-auth intervals)
9. **Add MFA management UI** (view/revoke OTP devices)

---

## Technical Deep Dive - Why Two Flows Exist

### OAuth 2.0 Flow Comparison

| Aspect | Authorization Code (Browser) | Direct Grant (ROPC) |
|--------|------------------------------|---------------------|
| **Use Case** | Human users in web browsers | API clients, backend services |
| **Security** | Most secure (password never to client) | Less secure (client sees password) |
| **User Experience** | Browser redirects, Keycloak UI | API calls, custom UI |
| **PKCE** | Required | N/A |
| **Client Type** | Public or confidential | Confidential only |
| **MFA** | Browser forms (built-in) | API parameters (custom) |
| **Custom SPI** | Not applicable | ✅ Designed for this |
| **NextAuth Support** | ✅ Native | ❌ Not supported |

### Why We Need Both

**Browser Flow** (Federation):
- Coalition partners authenticate via OIDC/SAML
- Federated SSO (USA → France → Canada)
- Human users need visual UI
- NextAuth manages sessions

**Direct Grant** (Integration):
- Backend APIs need machine-to-machine auth
- CI/CD pipelines, automated tests
- Mobile apps (if applicable)
- Custom onboarding flows

---

## Next Steps - Professional Recommendation

### Path Forward

1. **Accept Current Architecture** (Browser Flow for humans):
   - Custom themes provide branding ✅
   - Built-in authenticators are production-tested ✅
   - NextAuth simplifies integration ✅
   - Custom SPI for API use cases (future)

2. **Fix Browser Flow MFA Enforcement**:
   - Force OTP prompt on every login (not just enrollment)
   - Test with fresh Keycloak session

3. **Configure Custom SPI for API Clients**:
   - Update Direct Grant flow via Terraform
   - Build custom login endpoint
   - Document API authentication

4. **Update Documentation**:
   - Clarify Browser vs Direct Grant use cases
   - Document when Custom SPI is used
   - Explain OTP storage (Keycloak DB)

---

**Bottom Line**: 

- ✅ OTP **IS** stored (Keycloak `keycloak_db.credential` table)
- ✅ Database adapter **IS** working (NextAuth sessions in `dive_v3_app`)
- ⚠️ Custom SPI **IS** deployed but **NOT configured** in flows
- ⚠️ We're using **Browser Flow** (where Custom SPI doesn't apply)
- ✅ **Both flows are valid** - use Browser for humans, Direct Grant for APIs

**Status**: Authentication works, but architecture needs clarification and Custom SPI needs flow configuration to be utilized.

