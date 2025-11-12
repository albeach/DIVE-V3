# Keycloak Native ACR/LOA Support Implementation

## Current Status (Nov 10, 2025)

**Working (Temporary):** Static ACR/AMR user attributes
- Users have `acr="1"` and `amr='["pwd","otp"]'` as attributes
- Protocol mappers read from user attributes
- ❌ **Problem:** Doesn't reflect actual authentication performed

**Goal:** Use Keycloak's built-in ACR/LOA mapping
- ✅ ACR to LOA mapping configured in realm
- ✅ `acr` client scope with `oidc-acr-mapper` exists
- ❌ Authentication flow doesn't set LOA level

## How Keycloak's Native ACR Support Works

### 1. ACR to LOA Mapping (Realm Level)
```json
{
  "acr.loa.map": {
    "0": {"name": "AAL1", "level": 0},  // Password only
    "1": {"name": "AAL2", "level": 1},  // Password + OTP/SMS
    "2": {"name": "AAL3", "level": 2}   // Password + WebAuthn
  }
}
```

### 2. Protocol Mapper (ACR Client Scope)
- Mapper: `oidc-acr-mapper`
- Reads: User's authentication session LOA level
- Outputs: `acr` claim in token (e.g., "1" for AAL2)

### 3. Authentication Flow
Must set the achieved LOA level in the session:
- After password → set LOA 0
- After password + OTP → set LOA 1
- After password + WebAuthn → set LOA 2

## What's Missing

Keycloak's **built-in authenticators** (UsernamePasswordForm, OTP, WebAuthn) **do NOT automatically set LOA levels**.

### Option 1: Step-Up Authentication (Recommended for Production)
Client requests specific ACR value:
```
GET /auth?acr_values=urn:mace:incommon:iap:silver
```

Keycloak enforces the required LOA and sets ACR claim accordingly.

**Pros:**
- Native Keycloak feature
- No custom code
- Client-driven security

**Cons:**
- Requires frontend changes
- Doesn't work for Direct Grant (password flow)

### Option 2: Custom Authenticator SPI
Deploy a custom authenticator that:
1. Tracks which authenticators executed
2. Calculates LOA based on methods used
3. Sets session note: `AUTH_CONTEXT_CLASS_REF` with LOA value

**Pros:**
- Works for all flows (including Direct Grant)
- Automatic LOA calculation
- No frontend changes

**Cons:**
- Requires custom Java code
- Must maintain and deploy SPI

### Option 3: Static Attributes (Current Workaround)
Users have ACR/AMR as attributes, protocol mappers read from attributes.

**Pros:**
- Works immediately
- No custom code

**Cons:**
- ❌ Doesn't reflect actual authentication
- ❌ Security risk (claims AAL2 even with password-only login)
- ❌ Not suitable for production

## Recommended Path Forward

### Short-term (Testing):
Keep static attributes for `john.doe` and test users for immediate testing.

### Medium-term (Week 3-4):
1. Configure step-up authentication in frontend
2. Request specific ACR values for classified resources:
   ```typescript
   const params = classification !== 'UNCLASSIFIED' 
     ? { acr_values: '1' } // Request AAL2
     : {};
   ```

3. Remove static ACR/AMR attributes
4. Let Keycloak enforce and set ACR naturally

### Long-term (Production):
1. Deploy Custom Authenticator SPI for automatic LOA tracking
2. Integrate with actual MFA enrollment status
3. Support conditional MFA (prompt OTP only when needed)

## Implementation Steps

### Step 1: Configure Step-Up Auth (Frontend)
```typescript
// frontend/src/app/api/auth/[...nextauth]/route.ts
export const authOptions: NextAuthOptions = {
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      issuer: process.env.KEYCLOAK_ISSUER!,
      authorization: {
        params: {
          scope: 'openid profile email acr', // Include acr scope
          // Request AAL2 by default for classified resources
          acr_values: '1' // Can be dynamic based on resource
        }
      }
    })
  ]
};
```

### Step 2: Dynamic ACR Requests
```typescript
// Check resource classification before auth
const requiresAAL2 = classification !== 'UNCLASSIFIED';

if (requiresAAL2 && session.acr < 1) {
  // Trigger step-up authentication
  signIn('keycloak', { 
    callbackUrl,
    acrValues: '1' // Request AAL2
  });
}
```

### Step 3: Remove Static Attributes
Once step-up auth is working:
```bash
# Remove acr/amr from user attributes
curl -X PUT "$KEYCLOAK_URL/admin/realms/dive-v3-usa/users/$USER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"attributes": {
    "uniqueID": ["user@example.mil"],
    "clearance": ["SECRET"],
    "countryOfAffiliation": ["USA"]
    // acr and amr removed
  }}'
```

### Step 4: Remove User Attribute Mappers
Replace with reliance on native `oidc-acr-mapper` from `acr` client scope.

## Testing

### Test AAL1 (Password Only)
```bash
# User logs in with password only
# Expected ACR: "0" or null
```

### Test AAL2 (Password + OTP)
```bash
# User logs in, prompted for OTP
# Expected ACR: "1"
```

### Test Step-Up
```bash
# User has AAL1 session, tries to access SECRET resource
# Expected: Redirect to Keycloak for OTP
# After OTP: ACR upgraded to "1"
```

## References

- Keycloak ACR Documentation: https://www.keycloak.org/docs/latest/server_admin/index.html#_step-up-flow
- NIST SP 800-63B (AAL): https://pages.nist.gov/800-63-3/sp800-63b.html
- Current Implementation: `terraform/usa-realm.tf` (ACR to LOA mapping)
- Protocol Mapper: Realm → Client Scopes → `acr` → `acr loa level` mapper

## Decision Log

**Nov 10, 2025:** Configured ACR to LOA mapping, identified that authentication flow doesn't set LOA.

**Decision:** Keep static attributes for testing, plan step-up authentication for Week 3.

**Rationale:** 
- Step-up auth is native Keycloak feature (no custom code)
- More secure than static attributes
- Aligns with NIST AAL requirements
- Allows graceful degradation (AAL1 for UNCLASS, prompt for AAL2 on SECRET)




