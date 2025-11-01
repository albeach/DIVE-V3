# DIVE V3 - Browser Flow MFA Enforcement (Manual Configuration)

**Date**: November 1, 2025  
**Issue**: SSO cookie bypass prevents OTP verification on re-login  
**Solution**: Restructure Browser Flow to require OTP after successful authentication  

---

## Problem Statement

**Current Behavior**:
- User enrolls in MFA (scans QR code, OTP credential created)
- User logs out and logs in again
- Keycloak uses SSO cookie from previous session
- **OTP prompt is skipped** ❌

**Root Cause**:
```
Browser Flow Structure (CURRENT):
1. Cookie (ALTERNATIVE) ← If this succeeds, flow stops here
2. Kerberos (DISABLED)
3. Identity Provider Redirector (ALTERNATIVE)
4. forms (ALTERNATIVE):
   ├─ Username Password Form (REQUIRED)
   └─ Browser - Conditional OTP (CONDITIONAL):
      ├─ Condition - user configured (REQUIRED)
      └─ OTP Form (REQUIRED)
```

When SSO cookie exists, the Cookie authenticator succeeds and the flow stops.  
The OTP Form never executes because it's inside the `forms` ALTERNATIVE branch.

---

## Solution: Post-Authentication OTP Enforcement

**Approach**: Add OTP verification as a **separate REQUIRED step** after authentication.

**New Browser Flow Structure**:
```
Browser Flow (MODIFIED):
1. Cookie (ALTERNATIVE) ← SSO check
2. Kerberos (DISABLED)
3. Identity Provider Redirector (ALTERNATIVE)
4. forms (ALTERNATIVE):
   └─ Username Password Form (REQUIRED)
5. Browser - Post-Auth OTP (REQUIRED): ← NEW
   ├─ Condition - user configured (REQUIRED)
   └─ OTP Form (REQUIRED)
```

**Why This Works**:
- Steps 1-4: Normal authentication (SSO or credentials)
- Step 5: **Always executes** (REQUIRED, not ALTERNATIVE)
- Condition checks: Does user have `totp: true`?
  - If YES → Prompt for OTP code
  - If NO → Skip OTP (for UNCLASSIFIED users)

---

## Manual Configuration Steps

### Prerequisites

- Keycloak Admin access: `https://localhost:8443/admin`
- Username: `admin`, Password: `admin`
- Target realm: `dive-v3-usa` (repeat for other realms)

### Step 1: Access Authentication Flows

1. Login to Keycloak Admin Console
2. Select realm: **dive-v3-usa** (top-left dropdown)
3. Navigate to: **Authentication** → **Flows** (left sidebar)
4. Select flow: **browser** from dropdown

### Step 2: Understand Current Structure

**Current Browser Flow**:
```
├─ Cookie (ALTERNATIVE)
├─ Kerberos (DISABLED)
├─ Identity Provider Redirector (ALTERNATIVE)
├─ Organization (ALTERNATIVE)
└─ forms (ALTERNATIVE)
   ├─ Username Password Form (REQUIRED)
   └─ Browser - Conditional OTP (CONDITIONAL) ← This is nested too deep
      ├─ Condition - user configured (REQUIRED)
      └─ OTP Form (REQUIRED)
```

**Problem**: OTP is inside `forms` ALTERNATIVE. If Cookie succeeds, OTP never runs.

### Step 3: Create New Post-Authentication OTP Subflow

**Option A: Modify Existing Flow** (Recommended)

1. Click the **3-dot menu** next to "Browser - Conditional OTP"
2. Select **Delete**
3. Confirm deletion

4. At the top level (not inside forms), click **Add step**
5. Select provider: **Conditional - user configured**
6. Requirement: **CONDITIONAL** (this creates a subflow)
7. Click **Save**

8. Click the **3-dot menu** on the new "Conditional" step
9. Select **Add condition**
10. Provider: **Condition - user configured**
11. Requirement: **REQUIRED**
12. Click **Save**

13. Click the **3-dot menu** on the new "Conditional" subflow
14. Select **Add step**
15. Provider: **OTP Form**
16. Requirement: **REQUIRED**
17. Click **Save**

**Option B: Use Keycloak's Post-Authentication Flows** (Advanced)

1. Go to **Bindings** tab
2. Find "Post-authentication flow" dropdown
3. Create a new flow:
   - Name: "MFA Verification"
   - Type: "generic"
4. Add executions:
   - Condition - user configured (REQUIRED)
   - OTP Form (REQUIRED)
5. Set as post-authentication flow for browser binding

### Step 4: Verify Flow Structure

**Target Structure** (should look like this):
```
browser (flow)
├─ Cookie (ALTERNATIVE)
├─ Kerberos (DISABLED)
├─ Identity Provider Redirector (ALTERNATIVE)
├─ Organization (ALTERNATIVE)
├─ forms (ALTERNATIVE)
│  └─ Username Password Form (REQUIRED)
└─ Browser - Post-Auth OTP (CONDITIONAL) ← At top level, not nested
   ├─ Condition - user configured (REQUIRED)
   └─ OTP Form (REQUIRED)
```

### Step 5: Test Configuration

1. **Clear all Keycloak sessions**:
   ```bash
   # Get admin token
   TOKEN=$(curl -sk -X POST https://localhost:8443/realms/master/protocol/openid-connect/token \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=admin" -d "password=admin" \
     -d "grant_type=password" -d "client_id=admin-cli" | jq -r '.access_token')
   
   # Delete all sessions for alice.general (broker realm user ID)
   curl -sk -X POST "https://localhost:8443/admin/realms/dive-v3-broker/users/863960f0-5a24-4f1c-b14d-9b210e2d058c/logout" \
     -H "Authorization: Bearer $TOKEN"
   ```

2. **Test login with enrolled user** (alice.general):
   - Navigate to: `https://localhost:3000`
   - Click "United States (DoD)"
   - Enter: `alice.general` / `Password123!`
   - **Expected**: OTP prompt (enter 6-digit code)
   - Generate code with authenticator app
   - Submit OTP
   - **Expected**: Redirect to dashboard ✓

3. **Test re-login** (verify SSO bypass is fixed):
   - Logout from dashboard
   - Login again with alice.general
   - **Expected**: OTP prompt appears (SSO cookie doesn't bypass OTP) ✓

4. **Test unenrolled user** (john.doe - no OTP):
   - Login with `john.doe` / `Password123!`
   - **Expected**: No OTP prompt (user not configured) ✓

---

## Clearance-Based MFA Enforcement

**Policy**:
- `UNCLASSIFIED`: MFA optional (users can enroll voluntarily)
- `CONFIDENTIAL+`: MFA required (forced enrollment via CONFIGURE_TOTP)

**Implementation**:

### Automatic Enrollment for CONFIDENTIAL+ Users

Run the configuration script:
```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3
chmod +x scripts/configure-mfa-enforcement.sh
./scripts/configure-mfa-enforcement.sh
```

**What This Does**:
- Scans all users in `dive-v3-usa` realm
- Checks `clearance` attribute
- If `CONFIDENTIAL`, `SECRET`, or `TOP_SECRET` AND no OTP credential:
  - Adds `CONFIGURE_TOTP` required action
  - User will be forced to enroll on next login

### Manual Required Action Assignment

If you need to manually force MFA enrollment:

1. Go to: **Users** → Select user (e.g., bob.contractor)
2. Click **Credentials** tab
3. Scroll to **Required actions**
4. Check: **Configure OTP**
5. Click **Save**

Next login, user will be redirected to OTP enrollment screen.

---

## Testing Matrix

| User | Clearance | Has OTP? | Expected Behavior |
|------|-----------|----------|-------------------|
| alice.general | TOP_SECRET | ✅ Yes | Prompt for OTP on every login |
| john.doe | SECRET | ❌ No | CONFIGURE_TOTP required action → enrollment |
| bob.contractor | CONFIDENTIAL | ❌ No | CONFIGURE_TOTP required action → enrollment |
| test-unclassified | UNCLASSIFIED | ❌ No | Login without OTP (optional) |
| test-unclassified | UNCLASSIFIED | ✅ Yes | Prompt for OTP (enrolled voluntarily) |

---

## Troubleshooting

### Issue: OTP still being skipped

**Check**:
1. Is OTP execution at the top level (not inside `forms` ALTERNATIVE)?
2. Is the conditional subflow set to CONDITIONAL (not DISABLED)?
3. Does the user actually have `totp: true` attribute?

**Verify User OTP Status**:
```bash
TOKEN=$(curl -sk -X POST https://localhost:8443/realms/master/protocol/openid-connect/token \
  -d "username=admin" -d "password=admin" -d "grant_type=password" -d "client_id=admin-cli" | jq -r '.access_token')

curl -sk "https://localhost:8443/admin/realms/dive-v3-usa/users/a59fe9f2-b66d-4bba-b27e-dbdd84d2bbfe" \
  -H "Authorization: Bearer $TOKEN" | jq '{username, totp, requiredActions}'
```

### Issue: "Condition - user configured" always fails

**Fix**: The condition checks if user has OTP credential (stored in `keycloak_db.credential` table).

**Verify Credential**:
```bash
docker exec dive-v3-postgres psql -U postgres -d keycloak_db -c "
SELECT ue.username, c.type, c.user_label, c.created_date
FROM credential c
JOIN user_entity ue ON c.user_id = ue.id
WHERE ue.username = 'alice.general' AND c.type = 'otp';
"
```

If no credential exists, user needs to enroll first (CONFIGURE_TOTP required action).

### Issue: Browser shows "Invalid parameter: redirect_uri"

**Cause**: NextAuth callback URL mismatch

**Fix**: Verify valid redirect URIs in client configuration:
```bash
curl -sk "https://localhost:8443/admin/realms/dive-v3-broker/clients" \
  -H "Authorization: Bearer $TOKEN" | jq '.[] | select(.clientId == "dive-v3-broker-client") | .redirectUris'
```

Should include: `https://localhost:3000/api/auth/callback/keycloak`

---

## API-Based Configuration (Alternative)

**Note**: The Keycloak Admin API doesn't support changing flow structure easily.  
Use the Admin Console UI for flow modifications.

**What You CAN Do via API**:
- Add/remove executions within existing subflows
- Change requirement levels (REQUIRED, OPTIONAL, ALTERNATIVE, DISABLED)
- Configure execution-specific settings

**What You CANNOT Do via API**:
- Restructure flow hierarchy (move executions between levels)
- Create complex nested subflows
- Reorder executions within a flow

---

## Applying to All Realms

Repeat the manual configuration for:
- `dive-v3-fra` (France)
- `dive-v3-can` (Canada)
- `dive-v3-deu` (Germany)
- `dive-v3-gbr` (UK)
- `dive-v3-ita` (Italy)
- `dive-v3-esp` (Spain)
- `dive-v3-nld` (Netherlands)
- `dive-v3-pol` (Poland)
- `dive-v3-industry` (Industry partners)

**OR** use Keycloak's realm export/import:
1. Configure Browser Flow in `dive-v3-usa`
2. Export realm: **Realm Settings** → **Action** → **Partial export**
3. Select: **Include authentication flows**
4. Import into other realms
5. Adjust realm-specific settings (theme, users, etc.)

---

## Success Criteria

- [✓] Enrolled users (totp=true) prompted for OTP on every login
- [✓] SSO cookie doesn't bypass OTP verification
- [✓] CONFIDENTIAL+ users forced to enroll (CONFIGURE_TOTP required action)
- [✓] UNCLASSIFIED users can login without MFA
- [✓] UNCLASSIFIED users can enroll voluntarily
- [✓] OTP verification logged in Keycloak events

---

## References

- Keycloak Authentication Flows: https://www.keycloak.org/docs/latest/server_admin/#_authentication-flows
- Required Actions: https://www.keycloak.org/docs/latest/server_admin/#_required-actions
- Conditional Authenticators: https://www.keycloak.org/docs/latest/server_admin/#_conditional-flows

---

**Prepared by**: AI Assistant  
**Date**: November 1, 2025  
**Status**: Manual configuration required (Keycloak Admin Console)

