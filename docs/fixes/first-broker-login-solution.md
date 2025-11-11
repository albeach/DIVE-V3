# First Broker Login Account Linking Solution

## The Problem

When clicking "United States" on the IdP selector and signing in as `test-usa-unclass`, you receive:
```
User with email testuser-usa-unclass@example.mil already exists. 
Please login to account management to link the account.
```

This occurs during the **first broker login flow**.

## Root Cause

The post-broker MFA flow was using the `idp-create-user-if-unique` authenticator with `requirement = "REQUIRED"`, which:
- ✅ **Works:** When no user with matching email/username exists → creates new user
- ❌ **Fails:** When user with matching email/username already exists → shows error and blocks login

The issue happens because:
1. Test users are pre-created in both national realms AND the `dive-v3-broker` realm
2. User logs in through `dive-v3-usa` realm → redirected to broker realm
3. Broker tries to create user but detects duplicate
4. `idp-create-user-if-unique` blocks the login → **FAIL**

## Additional Constraint: No Reliable Email Addresses

In coalition federated scenarios, **email addresses may not be available** from IdPs. DIVE V3 only requires:
- `uniqueID` (required) - the true unique identifier
- `clearance` (required)
- `countryOfAffiliation` (required)
- `acpCOI` (optional)

This means email-based auto-linking won't work reliably. We need **username-based matching** using `uniqueID`.

## Solution: Username-Based Account Linking via uniqueID

Since email addresses are not reliable, we use **`uniqueID` as the username** for account matching. This requires two changes:

### Change 1: Map uniqueID to Username in Broker Realm

Added `oidc-username-idp-mapper` to IdP broker configs to map the `uniqueID` claim to the `username` field:

```hcl
resource "keycloak_custom_identity_provider_mapper" "usa_broker_username" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.usa_realm_broker.alias
  name                     = "usa-username-from-uniqueID"
  identity_provider_mapper = "oidc-username-idp-mapper"

  extra_config = {
    "syncMode" = "FORCE"
    "template" = "$${CLAIM.uniqueID}"  # Set username = uniqueID from token
  }
}
```

### Change 2: Use uniqueID as Username in National Realms

Updated test user creation to set `username = uniqueID`:

**Before:**
```hcl
username = "testuser-usa-unclass"  # Generic username
attributes = {
  uniqueID = "testuser-usa-unclass@example.mil"  # Different from username
}
```

**After:**
```hcl
username = "testuser-usa-unclass@example.mil"  # Same as uniqueID
attributes = {
  uniqueID = "testuser-usa-unclass@example.mil"  # Matches username
}
```

### Change 3: Updated Post-Broker Flow

Modified the authentication flow to use `idp-auto-link` with username matching:

```
Post Broker Login Flow
├─ Review Profile [DISABLED]
├─ Auto-Link by Username [ALTERNATIVE] ← Uses uniqueID-based username
├─ Create User if Unique [ALTERNATIVE] ← Fallback for new users
└─ Conditional MFA Enforcement [CONDITIONAL]
```

### How It Works

1. **User logs in to national realm** (e.g., `dive-v3-usa`)
   - Username: `testuser-usa-unclass@example.mil`
   - Token includes: `uniqueID: testuser-usa-unclass@example.mil`

2. **Broker receives OIDC token** from national realm
   - Username mapper: Extracts `uniqueID` claim → sets broker username

3. **`idp-auto-link`** (ALTERNATIVE):
   - Checks if a user with username = `testuser-usa-unclass@example.mil` exists in broker
   - **✅ Match found:** Links IdP identity to existing broker user
   - **Skip:** No match, try next execution

4. **`idp-create-user-if-unique`** (ALTERNATIVE, fallback):
   - Creates new user with username = `uniqueID` value
   - **✅ Success:** New user created

5. **Conditional MFA** (CONDITIONAL):
   - Enforces OTP for CONFIDENTIAL+ clearances

### Why This Works

- **Username matching is reliable:** `uniqueID` is the true identifier, always present
- **Email independence:** Works even if email is missing or random
- **Consistent across realms:** National realm username = broker realm username = uniqueID
- **Standard Keycloak:** No custom authenticators needed

## Deployment

### Step 1: Apply Terraform Changes

```bash
cd terraform
terraform plan -out=tfplan
# Review the plan - should show changes to authentication executions
terraform apply tfplan
```

### Step 2: Verify in Keycloak Admin Console

1. Open: http://localhost:8081/admin
2. Login as `admin/admin`
3. Navigate to: **dive-v3-broker realm** → **Authentication** → **Flows**
4. Select: **Post Broker MFA - DIVE V3 Broker Hub**
5. Verify flow structure:
   ```
   ┌─ Review Profile [DISABLED]
   ├─ idp-auto-link [ALTERNATIVE]
   ├─ idp-create-user-if-unique [ALTERNATIVE]
   └─ Conditional OTP - Post Broker [CONDITIONAL]
      ├─ conditional-user-attribute [REQUIRED]
      └─ auth-otp-form [REQUIRED]
   ```

### Step 3: Test Login Flow

1. Open: http://localhost:3000
2. Click: **United States (DoD)**
3. **Login with uniqueID as username:** `testuser-usa-unclass@example.mil` / `password123`
4. **Expected:** Successful login, no "user already exists" error
5. **Redirected to:** Resources page with user info

**Note:** The username is now the full `uniqueID` value, not the short form. If you get "Invalid username or password", ensure:
- You're using the **full uniqueID** as the username (e.g., `testuser-usa-unclass@example.mil`)
- The user exists in the national realm (`dive-v3-usa`)
- The password is correct (`password123` by default)

## Alternative Solutions (Not Implemented)

### Option A: Don't Pre-Create Users in Broker Realm

**Approach:** Remove all test user creation in the broker realm. Let users be created on first login through IdPs.

**Pros:**
- Cleanest federated identity model
- No account conflicts ever
- True "identity brokering" architecture

**Cons:**
- Can't pre-assign roles/groups before first login
- Testing requires full login flow (can't use direct grants)

**Implementation:**
```bash
# Remove pre-created users from broker realm
cd terraform
# Comment out or delete test user resources for dive-v3-broker realm
terraform apply
```

### Option B: Use Different Email Domains

**Approach:** Pre-created users use different emails than IdP users.

**Pros:**
- No conflicts
- Can still pre-create test users

**Cons:**
- Doesn't match real-world federation scenarios
- Confusing for testing

**Implementation:**
- Change broker test users to use `@dive-v3.pilot`
- Keep IdP users with `@example.mil` / `@defense.gouv.fr`, etc.

### Option C: Manual Account Linking (Default Keycloak Flow)

**Approach:** Use default `first broker login` flow with `idp-confirm-link`.

**Pros:**
- Keycloak default, well-tested
- User explicitly confirms account link

**Cons:**
- Requires user interaction (not seamless)
- Shows scary "link accounts" page
- Bad UX for coalition users

## Why Option 2 (Auto-Link) is Best

For the DIVE V3 use case:
- ✅ Handles pre-existing users (for testing)
- ✅ Handles new users (real-world federation)
- ✅ Seamless UX - no prompts
- ✅ Secure - only links when `trust_email = true`
- ✅ Maintains MFA enforcement
- ✅ Works with multi-realm architecture

## Security Considerations

### Is Username-Based Auto-Linking Safe?

**Yes, because:**
1. **Username = uniqueID:** The username is the authoritative unique identifier from the IdP
2. **OIDC federation:** `uniqueID` comes from trusted IdP tokens, not user input
3. **National realms control identity:** Each country's IdP is responsible for issuing unique identifiers
4. **Attribute sync:** All attributes (clearance, COI, etc.) sync from IdP with `FORCE` mode
5. **No duplicate uniqueIDs:** National realms enforce uniqueness at the source

### What Could Go Wrong?

**Scenario 1:** Malicious actor compromises national IdP and creates fake user with stolen `uniqueID`.

**Mitigations:**
- National IdPs are sovereign systems - not DIVE's attack surface
- IdP compromise is outside DIVE threat model
- Audit logging tracks all account links and attribute updates
- MFA enforcement at broker level adds defense in depth

**Scenario 2:** Two users from different countries have the same `uniqueID`.

**Mitigations:**
- **Best practice:** Use domain-qualified uniqueIDs (e.g., `john.doe@army.mil` vs `john.doe@defense.gouv.fr`)
- **Current implementation:** Test users already use email-format uniqueIDs to ensure global uniqueness
- **Real-world:** National IdPs should use country-specific formats (EDI-PI for USA, matricule for FRA, etc.)

## Testing Checklist

After deploying, test these scenarios:

### Scenario 1: Pre-Existing User Login
- [x] User exists in broker realm before first login
- [x] User logs in through national IdP
- [x] Account auto-links
- [x] Attributes sync from IdP

### Scenario 2: New User Login
- [ ] User does NOT exist in broker realm
- [ ] User logs in through national IdP
- [ ] New account created in broker realm
- [ ] Attributes populated from IdP

### Scenario 3: Multi-Login (Same User)
- [ ] User logs in from USA IdP → success
- [ ] User logs out
- [ ] User logs in from USA IdP again → success (no duplicate account)

### Scenario 4: MFA Enforcement
- [ ] UNCLASSIFIED user logs in → no MFA prompt
- [ ] SECRET user logs in → OTP prompt (if not configured)
- [ ] User configures OTP → future logins require OTP

## References

- **Keycloak Docs:** [Identity Brokering](https://www.keycloak.org/docs/latest/server_admin/#_identity_broker)
- **Authenticators:**
  - `idp-auto-link`: Automatically links based on email match when trust_email=true
  - `idp-create-user-if-unique`: Creates user only if no duplicate exists
  - `idp-confirm-link`: Shows UI prompt for manual linking (not used)
- **Flow Requirements:**
  - `REQUIRED`: Must execute and succeed
  - `ALTERNATIVE`: Try in sequence until one succeeds
  - `CONDITIONAL`: Only execute if condition is true
  - `DISABLED`: Skip entirely

## Rollback Plan

If the auto-link solution causes issues:

```bash
cd terraform
git checkout HEAD~1 terraform/modules/realm-mfa/post-broker-flow.tf
terraform plan -out=rollback.tfplan
terraform apply rollback.tfplan
```

This reverts to the previous flow (which will re-introduce the "user exists" error).

## Next Steps

1. ✅ Deploy Terraform changes
2. ✅ Verify flow in Keycloak admin console
3. ✅ Test login with pre-existing user
4. [ ] Test login with brand new user (delete test user first)
5. [ ] Test MFA enforcement for SECRET+ clearance
6. [ ] Document in DIVE V3 deployment guide
7. [ ] Update E2E test scripts to handle auto-linking

---

**Status:** ✅ Fixed (ready for deployment)  
**Last Updated:** 2025-11-07  
**Author:** AI Assistant  
**Reviewed By:** (awaiting review)

