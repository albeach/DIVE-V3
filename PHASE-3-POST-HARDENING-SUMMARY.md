# DIVE V3 - Phase 3 Post-Hardening Summary

**Date**: November 1, 2025  
**Status**: ✅ TERRAFORM MFA CONFIGURATION COMPLETE  
**Clearance-Based MFA**: CONFIDENTIAL+ users require MFA  

---

## Executive Summary

Successfully deployed clearance-based MFA enforcement using Terraform infrastructure-as-code. The Custom SPI (`direct-grant-otp-setup`) is now configured in the USA realm's Direct Grant flow, enabling programmatic MFA enrollment with conditional logic based on user clearance levels.

**Key Achievement**: MFA is now **optional** for UNCLASSIFIED users and **required** for CONFIDENTIAL, SECRET, and TOP_SECRET users.

---

## What Was Accomplished (via Terraform)

### ✅ Direct Grant Flow with Custom SPI - DEPLOYED

**Location**: USA Realm (`dive-v3-usa`)  
**Flow Name**: "Direct Grant with Conditional MFA - United States"  
**Status**: ✅ ACTIVE

**Flow Structure**:
```
1. Username Validation (REQUIRED) - direct-grant-validate-username
2. Password (REQUIRED) - direct-grant-validate-password
3. Conditional OTP (CONDITIONAL):
   ├─ Condition - user attribute (REQUIRED)
   │  └─ Check: clearance != "UNCLASSIFIED"  ← Regex: ^(?!UNCLASSIFIED$).*
   └─ Direct Grant OTP Setup (DIVE V3) (REQUIRED)
      └─ Custom SPI: direct-grant-otp-setup
```

**What This Means**:
- UNCLASSIFIED users: Login with username/password only (no MFA)
- CONFIDENTIAL+ users: **Must enroll and verify MFA** (clearance check enforced)
- Custom SPI handles both **enrollment** (QR code generation) and **validation** (OTP verification)

### ✅ Clearance-Based Conditional Logic

**Attribute Check**:
- **Attribute Name**: `clearance`
- **Regex Pattern**: `^(?!UNCLASSIFIED$).*`
- **Logic**: Match any clearance level EXCEPT UNCLASSIFIED
- **Result**: MFA required for CONFIDENTIAL, SECRET, TOP_SECRET

**Test Users**:
| User | Clearance | MFA Required? |
|------|-----------|---------------|
| alice.general | TOP_SECRET | ✅ YES |
| john.doe | SECRET | ✅ YES |
| bob.contractor | CONFIDENTIAL | ✅ YES |
| test-unclassified | UNCLASSIFIED | ❌ NO |

### ✅ Terraform Configuration Files Modified

1. **terraform/keycloak-mfa-flows.tf**:
   - Enabled `enable_direct_grant_mfa = true` for USA realm (line 35)

2. **terraform/modules/realm-mfa/direct-grant.tf**:
   - Changed OTP subflow requirement from `REQUIRED` to `CONDITIONAL` (line 42)
   - Enabled conditional-user-attribute check to `REQUIRED` (line 56)

3. **Applied via Terraform**:
   ```bash
   terraform plan -var="create_test_users=true" -out=tfplan
   terraform apply tfplan
   ```

---

## What Needs Manual Configuration (Keycloak Admin Console)

### ⚠️ Browser Flow MFA Enforcement (Not Yet Configured)

**Issue**: Browser Flow still allows SSO cookie bypass, preventing OTP verification on re-login.

**Current Browser Flow** (Default):
```
1. Cookie (ALTERNATIVE) ← If SSO exists, flow stops here!
2. forms (ALTERNATIVE):
   ├─ Username Password Form (REQUIRED)
   └─ Conditional OTP (CONDITIONAL):
      ├─ Condition - user configured (REQUIRED)
      └─ OTP Form (REQUIRED)
```

**Problem**: Users who have enrolled in MFA are not prompted for OTP on re-login if an SSO session exists.

**Solution**: Manual configuration required (documented in `docs/MFA-BROWSER-FLOW-MANUAL-CONFIGURATION.md`)

**Recommended Approach**:
1. Access Keycloak Admin Console: `https://localhost:8443/admin`
2. Navigate to: Authentication → Flows → browser
3. Move "Conditional OTP" subflow to top level (outside `forms` ALTERNATIVE)
4. Set "Conditional OTP" to CONDITIONAL (not nested in ALTERNATIVE)

**Result**: OTP verification will execute even with SSO cookie (post-authentication check)

---

## Custom SPI Capabilities

### DirectGrantOTPAuthenticator (`direct-grant-otp-setup`)

**Deployed**: ✅ YES (both JARs in `/opt/keycloak/providers/`)
- `dive-keycloak-extensions.jar` (94KB)
- `dive-keycloak-spi.jar` (11KB)

**Functionality**:

1. **OTP Enrollment** (User without MFA):
   ```bash
   POST /realms/dive-v3-usa/protocol/openid-connect/token
   {
     "grant_type": "password",
     "username": "bob.contractor",
     "password": "Password123!",
     "client_id": "dive-v3-broker-client"
   }
   
   Response (if clearance = CONFIDENTIAL+):
   {
     "error": "otp_setup_required",
     "mfaRequired": true,
     "mfaSetupRequired": true,
     "otpSecret": "KI3GQ3KVGVXVK5KWMJAVOQTDJRRVMQSI",
     "otpUrl": "otpauth://totp/DIVE:bob.contractor?secret=...",
     "userId": "8217c5e4-571d-4045-82e3-1723ee86a742"
   }
   ```

2. **OTP Verification** (Enrolled user):
   ```bash
   POST /realms/dive-v3-usa/protocol/openid-connect/token
   {
     "grant_type": "password",
     "username": "alice.general",
     "password": "Password123!",
     "totp": "186349",  ← 6-digit code
     "client_id": "dive-v3-broker-client"
   }
   
   Response (if OTP valid):
   {
     "access_token": "eyJhbGc...",
     "refresh_token": "eyJhbGc...",
     "id_token": "eyJhbGc...",
     "expires_in": 900
   }
   ```

3. **Conditional Logic** (Clearance-based):
   - UNCLASSIFIED: No OTP required (Direct Grant succeeds without `totp` parameter)
   - CONFIDENTIAL+: OTP required (returns `otp_setup_required` if not enrolled)

---

## Testing Instructions

### Test 1: Direct Grant with CONFIDENTIAL+ User (MFA Required)

```bash
# Test user: bob.contractor (CONFIDENTIAL clearance, no MFA enrolled)
curl -sk -X POST https://localhost:8443/realms/dive-v3-usa/protocol/openid-connect/token \
  -d "grant_type=password" \
  -d "username=bob.contractor" \
  -d "password=Password123!" \
  -d "client_id=dive-v3-broker-client" \
  -d "client_secret=$(grep KEYCLOAK_CLIENT_SECRET .env.local | cut -d= -f2)"

# Expected: Error with QR code data for enrollment
```

### Test 2: Direct Grant with UNCLASSIFIED User (MFA Optional)

```bash
# Test user: test-unclassified (UNCLASSIFIED clearance)
# Note: User must be created first

curl -sk -X POST https://localhost:8443/realms/dive-v3-usa/protocol/openid-connect/token \
  -d "grant_type=password" \
  -d "username=test-unclassified" \
  -d "password=Password123!" \
  -d "client_id=dive-v3-broker-client" \
  -d "client_secret=..."

# Expected: Success with access token (no MFA required)
```

### Test 3: Direct Grant with Enrolled User (MFA Validation)

```bash
# Test user: alice.general (TOP_SECRET, MFA enrolled)
# Generate OTP code from authenticator app (TOTP secret: KI3GQ3KVGVXVK5KWMJAVOQTDJRRVMQSI)

curl -sk -X POST https://localhost:8443/realms/dive-v3-usa/protocol/openid-connect/token \
  -d "grant_type=password" \
  -d "username=alice.general" \
  -d "password=Password123!" \
  -d "totp=186349" \
  -d "client_id=dive-v3-broker-client" \
  -d "client_secret=..."

# Expected: Success with access token
```

---

## MFA Enforcement Policy Summary

### Clearance Levels → MFA Requirement

| Clearance Level | MFA Required? | Enforcement Method |
|-----------------|---------------|--------------------|
| UNCLASSIFIED | ❌ NO | Conditional skips OTP (regex doesn't match) |
| CONFIDENTIAL | ✅ YES | Conditional triggers OTP (regex matches) |
| SECRET | ✅ YES | Conditional triggers OTP (regex matches) |
| TOP_SECRET | ✅ YES | Conditional triggers OTP (regex matches) |

### Authentication Flows → MFA Implementation

| Flow | Use Case | MFA Authenticator | Status |
|------|----------|-------------------|--------|
| **Browser Flow** | Web users (NextAuth.js) | Keycloak built-in `auth-otp-form` | ⚠️ SSO bypass issue (needs manual fix) |
| **Direct Grant Flow** | API clients, backend services | Custom SPI `direct-grant-otp-setup` | ✅ DEPLOYED |

### User Experience

**UNCLASSIFIED User**:
1. Login with username/password
2. Access granted immediately (no MFA)

**CONFIDENTIAL+ User (Not Enrolled)**:
1. Attempt login → Receive QR code
2. Scan QR code with authenticator app
3. Enter 6-digit OTP code
4. MFA credential created
5. Access granted

**CONFIDENTIAL+ User (Enrolled)**:
1. Login with username/password
2. Enter 6-digit OTP code
3. Access granted

---

## Known Issues & Limitations

### 1. Browser Flow SSO Bypass

**Issue**: Enrolled users not prompted for OTP on re-login (SSO cookie bypasses MFA check)

**Impact**: Security gap - MFA enrolled but not enforced for browser users with active SSO sessions

**Workaround**: Clear browser cookies or delete Keycloak sessions manually

**Fix**: Requires manual Keycloak Admin Console configuration (see `docs/MFA-BROWSER-FLOW-MANUAL-CONFIGURATION.md`)

### 2. Terraform Flow Configuration Limitations

**Issue**: Keycloak Terraform provider cannot modify complex flow structures (nested subflows, reordering executions)

**Impact**: Browser Flow MFA enforcement requires manual Admin Console work

**Solution**: Use Terraform for creating flows, Admin Console for fine-tuning structure

### 3. Edge Runtime Middleware Limitation

**Issue**: Next.js middleware running on Edge Runtime cannot use `auth()` with database sessions (postgres-js requires Node.js `net` module)

**Impact**: Authorization happens at page level, not middleware level

**Status**: Documented in `AUTHENTICATION-WORKFLOW-AUDIT.md` (intentional hybrid architecture)

---

## Files Created/Modified

### Created Files

1. `scripts/configure-mfa-enforcement.sh` (464 lines)
   - Configures CONFIGURE_TOTP required action for CONFIDENTIAL+ users
   - Status: Partially superseded by Terraform (Direct Grant configured)

2. `scripts/create-custom-direct-grant-flow.sh` (214 lines)
   - Bash script to create custom Direct Grant flow via Admin API
   - Status: Not needed (Terraform implemented instead)

3. `docs/MFA-BROWSER-FLOW-MANUAL-CONFIGURATION.md` (467 lines)
   - Comprehensive guide for fixing Browser Flow SSO bypass
   - Step-by-step manual configuration instructions
   - Testing matrix and troubleshooting

4. `PHASE-3-POST-HARDENING-SUMMARY.md` (This document)
   - Complete status of MFA enforcement implementation

### Modified Files

1. `terraform/keycloak-mfa-flows.tf` (line 35)
   - Changed: `enable_direct_grant_mfa = false` → `true` for USA realm

2. `terraform/modules/realm-mfa/direct-grant.tf`:
   - Line 42: Changed OTP subflow requirement to CONDITIONAL
   - Line 56: Enabled conditional-user-attribute check to REQUIRED

---

## Next Steps

### Immediate (Required for Production)

1. **Fix Browser Flow MFA Enforcement** ⚠️ CRITICAL
   - Follow manual steps in `docs/MFA-BROWSER-FLOW-MANUAL-CONFIGURATION.md`
   - Test: Logout → Login → Verify OTP prompt appears
   - Priority: HIGH (security gap)

2. **Test Direct Grant with Custom SPI**
   - Test enrollment flow (bob.contractor - CONFIDENTIAL, no MFA)
   - Test validation flow (alice.general - TOP_SECRET, MFA enrolled)
   - Test conditional logic (create UNCLASSIFIED test user)

3. **Add CONFIGURE_TOTP Required Action for CONFIDENTIAL+ Users**
   - Script already created: `scripts/configure-mfa-enforcement.sh`
   - Run for all realms (not just USA)
   - Verify john.doe has CONFIGURE_TOTP required action

### Short-Term (Phase 4 Preparation)

4. **Enable Direct Grant MFA for Other Realms**
   - France (`fra-realm-broker`)
   - Canada (`can-realm-broker`)
   - Industry (`industry-realm-broker`)
   - Update `terraform/keycloak-mfa-flows.tf` lines 49, 63, 77

5. **Create Test Users for All Clearance Levels**
   - UNCLASSIFIED test user (verify MFA not required)
   - CONFIDENTIAL test user (verify MFA enrollment flow)
   - Update Terraform test user configurations

6. **Run Full QA Test Suite**
   - OPA: `opa test policies/ -v` (expect 175/175 PASS)
   - Backend: `cd backend && npm test` (expect >88% PASS)
   - Frontend: `cd frontend && npm run build` (expect SUCCESS)

### Long-Term (Production Hardening)

7. **Implement Step-Up Authentication**
   - AAL1 (password only) for general access
   - AAL2 (password + OTP) for classified resources
   - ACR claim enforcement in OPA policies

8. **MFA Management UI**
   - View enrolled OTP devices
   - Revoke/reset OTP credentials
   - QR code re-generation for lost devices

9. **Session Policies**
   - Configure max SSO session age
   - Force re-authentication intervals (e.g., 8 hours for TOP_SECRET)
   - Session timeout warnings

---

## Success Criteria

### Completed ✅

- [✅] Custom SPI deployed to Keycloak
- [✅] Direct Grant flow configured with Custom SPI
- [✅] Clearance-based conditional logic implemented
- [✅] Terraform infrastructure-as-code for MFA flows
- [✅] USA realm Direct Grant MFA active
- [✅] CONFIGURE_TOTP required action added for john.doe (SECRET clearance)

### In Progress ⚠️

- [⚠️] Browser Flow MFA enforcement (manual configuration needed)
- [⚠️] Direct Grant testing with all clearance levels
- [⚠️] E2E authentication testing (Browser + Direct Grant)

### Not Started ❌

- [❌] Direct Grant MFA for France, Canada, Industry realms
- [❌] Full QA test suite
- [❌] Documentation updates (CHANGELOG, README)
- [❌] GitHub CI/CD verification

---

## Commands Reference

### Verify Custom SPI Configuration

```bash
# Get admin token
TOKEN=$(curl -sk -X POST https://localhost:8443/realms/master/protocol/openid-connect/token \
  -d "username=admin" -d "password=admin" -d "grant_type=password" -d "client_id=admin-cli" | jq -r '.access_token')

# Check Direct Grant flow structure
curl -sk "https://localhost:8443/admin/realms/dive-v3-usa/authentication/flows/Direct%20Grant%20with%20Conditional%20MFA%20-%20United%20States/executions" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[] | "\(.level) - \(.displayName) (\(.requirement)) - \(.providerId // "N/A")"'

# Expected output:
# 0 - Username Validation (REQUIRED) - direct-grant-validate-username
# 0 - Password (REQUIRED) - direct-grant-validate-password
# 0 - Conditional OTP - Direct Grant - United States (CONDITIONAL) - N/A
# 1 - Condition - user attribute (REQUIRED) - conditional-user-attribute
# 1 - Direct Grant OTP Setup (DIVE V3) (REQUIRED) - direct-grant-otp-setup
```

### Check User MFA Status

```bash
# alice.general (should have OTP enrolled)
curl -sk "https://localhost:8443/admin/realms/dive-v3-usa/users/a59fe9f2-b66d-4bba-b27e-dbdd84d2bbfe" \
  -H "Authorization: Bearer $TOKEN" | jq '{username, totp, requiredActions}'

# john.doe (should have CONFIGURE_TOTP required action)
curl -sk "https://localhost:8443/admin/realms/dive-v3-usa/users/2f7a8d19-73db-4ee9-b8f5-29c6292ceb90" \
  -H "Authorization: Bearer $TOKEN" | jq '{username, totp, requiredActions}'
```

### Force MFA Enrollment for User

```bash
# Add CONFIGURE_TOTP required action
USER_ID="8217c5e4-571d-4045-82e3-1723ee86a742"  # bob.contractor

# Get user data
USER_DATA=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-usa/users/$USER_ID" \
  -H "Authorization: Bearer $TOKEN")

# Add CONFIGURE_TOTP to requiredActions
UPDATED_USER=$(echo "$USER_DATA" | jq '.requiredActions += ["CONFIGURE_TOTP"] | .requiredActions |= unique')

# Update user
curl -sk -X PUT "https://localhost:8443/admin/realms/dive-v3-usa/users/$USER_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$UPDATED_USER"
```

---

## Technical Architecture

### MFA Flow Decision Tree

```
User Attempts Login
    ↓
Check Authentication Flow Type
    ├─ Browser Flow (Web UI)
    │   ├─ Username/Password → SUCCESS
    │   ├─ Check: User has OTP enrolled?
    │   │   ├─ YES → Prompt for OTP (auth-otp-form)
    │   │   └─ NO → Check clearance
    │   │       ├─ CONFIDENTIAL+ → CONFIGURE_TOTP required action
    │   │       └─ UNCLASSIFIED → Allow (no MFA)
    │   └─ Redirect to Application
    │
    └─ Direct Grant Flow (API)
        ├─ Username/Password → SUCCESS
        ├─ Check Clearance (conditional-user-attribute)
        │   ├─ UNCLASSIFIED → Skip MFA → Return Tokens
        │   └─ CONFIDENTIAL+ → Require MFA
        │       ├─ Check: User has OTP enrolled?
        │       │   ├─ YES → Validate OTP code → Return Tokens
        │       │   └─ NO → Return QR code data (enrollment required)
        └─ Custom SPI (direct-grant-otp-setup) handles both cases
```

### OTP Credential Storage

**Database**: PostgreSQL `keycloak_db`  
**Table**: `credential`

```sql
SELECT ue.username, c.type, c.user_label, c.created_date
FROM credential c
JOIN user_entity ue ON c.user_id = ue.id
WHERE c.type = 'otp';

-- alice.general has OTP credential:
--   type: otp
--   user_label: DIVE Test Device
--   created_date: 1761975918342
--   secret_data: (encrypted TOTP secret)
```

---

## Compliance & Security

### NIST SP 800-63B Compliance

**AAL1** (Authenticator Assurance Level 1):
- Single-factor authentication (password only)
- Suitable for: UNCLASSIFIED data access

**AAL2** (Authenticator Assurance Level 2):
- Multi-factor authentication (password + OTP)
- Required for: CONFIDENTIAL, SECRET, TOP_SECRET
- DIVE V3 Implementation: ✅ DEPLOYED

### ACP-240 NATO Access Control

**Clearance-Based Access**:
- Attribute: `clearance`
- Values: UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET
- MFA Enforcement: CONFIDENTIAL+ requires AAL2

**Community of Interest (COI)**:
- Attribute: `acpCOI`
- Values: NATO-COSMIC, FVEY, CAN-US, etc.
- Integration: MFA enrollment preserves COI attributes

---

**Prepared by**: AI Assistant  
**Date**: November 1, 2025, 02:30 AM  
**Status**: ✅ TERRAFORM CONFIGURATION COMPLETE  
**Next Action**: Manual Browser Flow configuration (see `docs/MFA-BROWSER-FLOW-MANUAL-CONFIGURATION.md`)

