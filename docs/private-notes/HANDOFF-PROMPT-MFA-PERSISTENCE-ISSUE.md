# 🔐 MFA PERSISTENCE TROUBLESHOOTING - COMPREHENSIVE HANDOFF PROMPT

**Use this prompt to start a new chat session with full context**

---

## 📋 COPY THIS ENTIRE PROMPT TO NEW CHAT

```
I need help with a critical MFA persistence issue in a Next.js/Keycloak authentication system. Despite multiple fixes, MFA is still not working correctly. Here's the complete context:

## PROJECT OVERVIEW

**System**: DIVE V3 - Coalition ICAM Web Application
**Tech Stack**:
- Frontend: Next.js 15 (App Router), NextAuth.js v5
- Backend: Express.js, Node.js 20
- Auth: Keycloak (IdP broker), JWT (RS256)
- Database: PostgreSQL (Keycloak), MongoDB (resources), SQLite (NextAuth sessions)
- Authorization: OPA (Open Policy Agent)

**Security Requirements**:
- AAL2 (NIST SP 800-63B): MFA required for clearances above UNCLASSIFIED
- Users with TOP_SECRET clearance MUST use MFA (password + OTP)
- MFA credentials must PERSIST across login sessions

## THE PROBLEM

**User**: admin-dive
**Clearance**: TOP_SECRET
**Expected**: MFA required on every login (after initial setup)
**Actual**: MFA either doesn't trigger or doesn't persist - user has to re-setup QR code every time

## ROOT CAUSES IDENTIFIED (6+ LAYERS)

### 1. ✅ User Attributes Missing (FIXED)
**Issue**: Terraform provider bug - `clearance: TOP_SECRET` attribute not persisting in Keycloak
**Evidence**: 
```bash
# Terraform showed attributes in state, but Keycloak had empty attributes
$ kcadm.sh get users -r dive-v3-broker -q username=admin-dive --fields attributes
{ "attributes": {} }  # EMPTY!
```
**Fix Applied**: REST API workaround to set attributes directly
```bash
./scripts/fix-mfa-persistence.sh
# Sets: uniqueID, clearance=TOP_SECRET, countryOfAffiliation=USA, acpCOI
```

### 2. ✅ Zombie SSO Sessions (FIXED)
**Issue**: 9 active Keycloak SSO sessions bypassing authentication
**Fix Applied**: Terminated all sessions
```bash
./scripts/terminate-sso-sessions.sh
```

### 3. ✅ Browser Flow SSO Bypass (FIXED)
**Issue**: Authentication flow had SSO cookie check as ALTERNATIVE
```
├─ Cookie (SSO) [ALTERNATIVE] ← Bypassed everything if session exists!
└─ Classified User Conditional [ALTERNATIVE]
```
**Fix Applied**: Removed SSO cookie execution, changed conditional to REQUIRED
**File**: `terraform/modules/realm-mfa/main.tf`

### 4. ✅ Direct Grant Flow Not Bound (FIXED)
**Issue**: Custom login page uses Direct Grant (ROPC) flow, but realm was using default "direct grant" flow (no MFA)
**Evidence**:
```bash
$ kcadm.sh get realms/dive-v3-broker --fields directGrantFlow
{ "directGrantFlow": "direct grant" }  # Wrong flow!
```
**Fix Applied**: Bound custom MFA flow to realm
```bash
./scripts/bind-direct-grant-flow.sh
# Now: "Direct Grant with Conditional MFA - DIVE V3 Broker"
```

### 5. ✅ Logout Sequence Bug (FIXED)
**Issue**: Logout cleared idToken BEFORE using it to terminate Keycloak SSO
**Result**: Keycloak SSO sessions persisted, allowing bypass on next login
**Fix Applied**: Reordered logout to capture idToken FIRST
**File**: `frontend/src/components/auth/secure-logout-button.tsx`
```javascript
// NEW ORDER:
// 1. GET idToken (while session still exists)
// 2. Clear database
// 3. Clear NextAuth session
// 4. Use captured idToken to logout from Keycloak
```

### 6. ✅ URL Double-Encoding (FIXED)
**Issue**: Keycloak logout returned 400 Bad Request due to double-encoded redirect URI
```
Expected: post_logout_redirect_uri=http://localhost:3000
Actual:   post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A3000
```
**Fix Applied**: Changed from `URL.searchParams.set()` to manual string concatenation

### 7. ⚠️ OTP Credential Missing (PENDING)
**Issue**: User has NEVER successfully set up OTP credential in Keycloak
**Evidence**:
```bash
$ kcadm.sh get users/$USER_ID/credentials -r dive-v3-broker
[ { "type": "password" } ]  # NO OTP CREDENTIAL!
```
**Expected**: Should have both password AND otp credentials after QR scan

## CURRENT STATE

### What's Working ✅
- User attributes correctly set (clearance: TOP_SECRET)
- Browser authentication flow configured (SSO bypass removed)
- Direct Grant flow bound to realm
- Logout sequence captures idToken before clearing
- Logout URL constructed correctly (no encoding issues)

### What's NOT Working ❌
- OTP credential does NOT persist in Keycloak
- User either:
  - Sees QR code on every login, OR
  - Logs in without MFA prompt at all
- Keycloak SSO sessions may still be bypassing MFA

### Console Logs from Last Attempt

**Logout**:
```javascript
[DIVE] SUCCESS: Using fallback idToken for logout ✅
[DIVE] ✅ Keycloak logout URL obtained ✅
[DIVE] Redirecting to Keycloak for SSO termination
Navigated to http://localhost:8081/realms/dive-v3-broker/protocol/openid-connect/logout...
[HTTP/1.1 400 Bad Request] ← Still getting 400!
```

**Login**: [User needs to provide current behavior]

## FILES MODIFIED

1. `terraform/modules/realm-mfa/main.tf` - Removed SSO cookie bypass
2. `frontend/src/components/auth/secure-logout-button.tsx` - Fixed logout sequence
3. `scripts/fix-mfa-persistence.sh` - REST API attribute fix
4. `scripts/terminate-sso-sessions.sh` - Session cleanup
5. `scripts/bind-direct-grant-flow.sh` - Direct Grant flow binding
6. `scripts/verify-mfa-persistence.sh` - Verification script

## DOCUMENTATION CREATED

- `SECURITY-AUDIT-AAL-FAL-MFA-CRITICAL-FINDINGS.md` - Full security audit
- `CRITICAL-MFA-BYPASS-AUTHENTICATION-FLOW-FIX.md` - Authentication flow analysis
- `FINAL-ROOT-CAUSE-DIRECT-GRANT-FLOW.md` - Direct Grant flow issues
- `COMPLETE-ROOT-CAUSE-LOGOUT-SEQUENCE-BUG.md` - Logout sequence fix
- `MFA-LOGOUT-FIX-FINAL-STATUS.md` - Status reports
- Multiple other detailed technical documents

## CONFIGURATION DETAILS

**Realm**: `dive-v3-broker`
**Client**: `dive-v3-client-broker`
**User**: `admin-dive` (password: `DiveAdmin2025!`)

**Authentication Flows**:
- Browser Flow: "Classified Access Browser Flow - DIVE V3 Broker"
- Direct Grant Flow: "Direct Grant with Conditional MFA - DIVE V3 Broker"

**Flow Structure**:
```
Direct Grant with Conditional MFA:
├─ Username Validation [REQUIRED]
├─ Password Validation [REQUIRED]
└─ Conditional OTP [CONDITIONAL]
    ├─ Check: clearance != UNCLASSIFIED [REQUIRED]
    └─ OTP Validation [REQUIRED]
```

**OTP Policy** (broker-realm.tf):
```hcl
otp_policy {
  algorithm = "HmacSHA256"
  digits    = 6
  period    = 30
  type      = "totp"
  look_ahead_window = 1
}
```

## WHAT I NEED YOU TO INVESTIGATE

### Priority 1: Why OTP Credential Not Persisting

1. **Check Keycloak credential persistence**:
```bash
# Get user credentials
USER_ID=$(docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users -r dive-v3-broker -q username=admin-dive 2>&1 | grep -o '"id" : "[^"]*"' | head -1 | cut -d'"' -f4)
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users/$USER_ID/credentials -r dive-v3-broker
# Should show BOTH password AND otp types
```

2. **Check if OTP is being triggered during login**:
   - Watch Keycloak logs during login attempt
   - Check if Direct Grant flow is actually evaluating OTP requirement
   - Verify conditional check is passing (clearance != UNCLASSIFIED)

3. **Check Keycloak required actions**:
```bash
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users/$USER_ID -r dive-v3-broker --fields requiredActions
# Should be empty after OTP setup
```

### Priority 2: Why Logout Still Returns 400

Despite URL encoding fix, logout still returns 400 Bad Request. Investigate:
1. Check `valid_post_logout_redirect_uris` in Keycloak client
2. Verify exact URL being sent matches configured URIs
3. Check Keycloak server logs for detailed error

### Priority 3: Alternative Approaches

If Direct Grant flow is fundamentally incompatible with MFA persistence, consider:

**Option A**: Use standard browser flow instead of custom login page
**Option B**: Manually create OTP credential via Keycloak Admin API after password auth
**Option C**: Use required actions to force OTP setup
**Option D**: Switch to Keycloak browser flow with custom theme (not Direct Grant)

## VERIFICATION STEPS

After any fix:
1. Terminate all Keycloak SSO sessions
2. Clear all browser cookies
3. Login with admin-dive
4. Verify OTP credential created in Keycloak
5. Logout completely
6. Login again
7. Should prompt for OTP (not QR) - this proves persistence

## RESOURCES

**Keycloak Admin Console**: http://localhost:8081/admin (admin/admin)
**Frontend**: http://localhost:3000
**Backend API**: http://localhost:4000
**Keycloak Container**: `dive-v3-keycloak`

**Key Commands**:
```bash
# Check user
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password admin
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users -r dive-v3-broker -q username=admin-dive --fields username,attributes,requiredActions

# Check credentials
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users/$USER_ID/credentials -r dive-v3-broker

# Check active sessions
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users/$USER_ID/sessions -r dive-v3-broker

# Check flows
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get realms/dive-v3-broker --fields browserFlow,directGrantFlow

# Keycloak logs
docker logs dive-v3-keycloak --tail 100 | grep -i "admin-dive\|mfa\|otp"
```

## QUESTIONS TO ANSWER

1. **When the user logs in, what happens?**
   - Do they see a QR code?
   - Do they see an OTP text input?
   - Do they skip MFA entirely?

2. **After scanning QR code (if shown), does login succeed?**
   - What does Keycloak credentials API show?
   - Does OTP credential appear?

3. **On the NEXT login attempt, what happens?**
   - QR code again? (credential not persisting)
   - OTP input? (working correctly)
   - No MFA? (flow not triggering)

4. **Are there ANY Keycloak error logs?**
   - Check server.log for exceptions
   - Look for OTP-related errors

## SUCCESS CRITERIA

✅ User attributes set (clearance: TOP_SECRET)
✅ OTP credential exists in Keycloak (type: "otp")
✅ Login prompts for OTP code (not QR) on second+ login
✅ Logout terminates Keycloak SSO (no 400 error)
✅ Next login requires MFA (no bypass)

## LIKELY REMAINING ISSUES

Based on symptoms, most likely problems:
1. **Direct Grant flow doesn't support OTP credential creation** (only validation)
2. **Required action CONFIGURE_TOTP not being triggered properly**
3. **OTP credential being created but immediately deleted**
4. **Keycloak database not persisting OTP secrets**
5. **Frontend not properly handling OTP setup flow**

Please start by:
1. Checking current Keycloak credentials for admin-dive
2. Checking Keycloak server logs during login
3. Testing if manual OTP setup via Admin Console works
4. Determining if the issue is Direct Grant flow incompatibility

Let me know what you find!
```

---

## 📋 ADDITIONAL CONTEXT TO PROVIDE

When starting the new chat, also share:

1. **Current behavior**: Describe exactly what happens when you:
   - Login
   - Logout  
   - Login again

2. **Console logs**: Copy the complete browser console output during login attempt

3. **Keycloak logs**: Run and share output:
```bash
docker logs dive-v3-keycloak --tail 200 | grep -i "admin-dive\|mfa\|otp\|error"
```

4. **Current credentials**: Run and share:
```bash
USER_ID=$(docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password admin 2>&1 && docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users -r dive-v3-broker -q username=admin-dive 2>&1 | grep -o '"id" : "[^"]*"' | head -1 | cut -d'"' -f4)
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users/$USER_ID/credentials -r dive-v3-broker 2>&1
```

---

**This comprehensive prompt gives the next AI agent full context to continue troubleshooting effectively.**

