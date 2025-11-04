# DIVE V3 Keycloak Testing Guide
## Version 2.0.0 - Native Keycloak Features

**Date:** November 4, 2025  
**Status:** ✅ **READY FOR TESTING**  
**Test Scripts:** All created and executable

---

## Overview

This guide provides comprehensive testing procedures for DIVE V3 Keycloak authentication, federation, and token validation following the v2.0.0 refactoring to native Keycloak 26.4.2 features.

### Test Coverage

- **11 Realms:** broker + 10 national/industry realms
- **4 Clearance Levels:** UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET
- **3 Test Suites:** Authentication, Federation, Token Validation
- **1 CI/CD Workflow:** GitHub Actions automation

**Total Test Matrix:** 11 realms × 4 clearances = 44 test cases

---

## Quick Start

### Prerequisites

```bash
# Required tools
brew install jq curl

# Check Keycloak is running
curl -sk https://localhost:8443/health | jq '.status'
# Expected: "UP"

# Make scripts executable (if not already)
chmod +x scripts/test-*.sh
```

### Run All Tests

```bash
# 1. Authentication tests (all realms, all clearances)
./scripts/test-keycloak-auth.sh all

# 2. Federation configuration tests (10 federations)
./scripts/test-keycloak-federation.sh all

# 3. Token validation (after obtaining a token)
./scripts/test-token-claims.sh <access_token>
```

---

## Test Suite 1: Authentication Tests

### Script: `test-keycloak-auth.sh`

**Purpose:** Validates authentication flows, MFA enforcement, and ACR/AMR claims

**Usage:**

```bash
# Test all realms and clearances
./scripts/test-keycloak-auth.sh all

# Test specific realm
./scripts/test-keycloak-auth.sh usa

# Test specific realm and clearance
./scripts/test-keycloak-auth.sh usa SECRET
```

### What It Tests

✅ **UNCLASSIFIED Users (AAL1):**
- Password-only authentication works
- No MFA required
- Token contains: `acr="0"`, `amr=["pwd"]`
- All DIVE attributes present (uniqueID, clearance, etc.)

✅ **CONFIDENTIAL/SECRET/TOP_SECRET Users (AAL2):**
- MFA is REQUIRED (password-only access blocked)
- Token would contain: `acr="1"`, `amr=["pwd","otp"]` (with OTP)
- Enforcement working correctly

⚠️ **Important Notes:**

1. **Direct Grant Limitation:**
   - Script uses deprecated Direct Grant for automation
   - Cannot test interactive MFA (OTP entry)
   - MFA enforcement validated by checking password-only access is BLOCKED

2. **For Full MFA Testing:**
   - Use browser-based authentication
   - Manual testing or Playwright/Selenium automation
   - See "Manual Browser Testing" section below

### Expected Results

**Test Output Example:**

```
============================================
DIVE V3 Keycloak Authentication Test Suite
Version: 2.0.0 (Native Keycloak 26.4.2)
Test Matrix: 11 realms × 4 clearances
============================================

Testing Realm: dive-v3-usa
========================================

Testing UNCLASSIFIED user: testuser-us-unclass@dive-v3-usa
  Expected: Password only, ACR=0, AMR=["pwd"]
  ✅ ACR claim correct: 0 (AAL0: UNCLASSIFIED)
  ✅ AMR claim correct: ["pwd"]
  ✅ Clearance attribute correct: UNCLASSIFIED
  ✅ uniqueID claim present: testuser-us-unclass@example.mil
  ✅ countryOfAffiliation claim present: USA
  ✅ auth_time claim present: 1730764800
  ✅ Token lifetime compliant: 900s (≤15min)
✓ usa:UNCLASSIFIED - PASSED

Testing SECRET user: john.doe@dive-v3-usa
  Expected: Password + OTP, ACR=1, AMR=["pwd","otp"]
  ⚠️  Token request failed (expected - MFA required but not provided)
  ✓ MFA enforcement working correctly (blocked password-only access)
✓ usa:SECRET - PASSED (MFA enforced)

============================================
TEST SUMMARY
============================================

Total Tests Run:    44
Tests Passed:       44
Tests Failed:       0

Pass Rate: 100%

✓ ALL TESTS PASSED
```

---

## Test Suite 2: Federation Tests

### Script: `test-keycloak-federation.sh`

**Purpose:** Validates IdP broker federation configuration across all realms

**Usage:**

```bash
# Test all federations
./scripts/test-keycloak-federation.sh all

# Test specific federation
./scripts/test-keycloak-federation.sh usa
```

### What It Tests

✅ **For Each Federated Realm:**
1. National realm exists and is accessible
2. Broker realm exists and is accessible
3. IdP broker configuration exists
4. OIDC endpoints functional:
   - Authorization endpoint
   - Token endpoint
   - JWKS URI
   - UserInfo endpoint
5. JWKS contains valid signing keys

⚠️ **Scope:**
- Tests CONFIGURATION only
- Does NOT test full E2E federation flow (requires browser)
- Attribute mapping assumed configured via Terraform

### Expected Results

```
============================================
DIVE V3 Keycloak Federation Test Suite
Version: 2.0.0 (Native Keycloak 26.4.2)
Test Pattern: Broker ← National Realms
============================================

Testing Federation: usa
  National Realm: dive-v3-usa
  IdP Alias: usa-realm-broker
  Broker Realm: dive-v3-broker
========================================

[PASS] Realm exists: dive-v3-usa
[PASS] Realm exists: dive-v3-broker
[PASS] Broker realm accessible: dive-v3-broker
[PASS] Issuer: https://localhost:8443/realms/dive-v3-usa
[PASS] Authorization: https://localhost:8443/realms/dive-v3-usa/protocol/openid-connect/auth
[PASS] Token: https://localhost:8443/realms/dive-v3-usa/protocol/openid-connect/token
[PASS] JWKS: https://localhost:8443/realms/dive-v3-usa/protocol/openid-connect/certs
[PASS] JWKS endpoint accessible and contains keys
[PASS] UserInfo: https://localhost:8443/realms/dive-v3-usa/protocol/openid-connect/userinfo

✓ Federation configuration PASSED: usa → broker

============================================
FEDERATION TEST SUMMARY
============================================

Total Federations Tested: 10
Tests Passed:             10
Tests Failed:             0

Pass Rate: 100%

✓ ALL FEDERATION CONFIGURATIONS VALID
```

---

## Test Suite 3: Token Claims Validation

### Script: `test-token-claims.sh`

**Purpose:** Deep validation of JWT token claims for compliance

**Usage:**

```bash
# Validate access token
./scripts/test-token-claims.sh <access_token>

# Or from file
cat token.txt | xargs ./scripts/test-token-claims.sh
```

### What It Tests

✅ **JWT Structure:**
- 3 parts: header.payload.signature
- Base64-encoded

✅ **Header Claims:**
- Algorithm: RS256 (asymmetric signing)
- Type: JWT
- Key ID (kid) present

✅ **Required OIDC Claims:**
- `iss` (issuer)
- `sub` (subject)
- `aud` (audience)
- `exp` (expiration)
- `iat` (issued at)
- `jti` (JWT ID)

✅ **DIVE V3 Custom Claims:**
- `uniqueID` (REQUIRED)
- `clearance` (REQUIRED, valid level)
- `countryOfAffiliation` (ISO 3166-1 alpha-3)
- `acpCOI` (optional)
- `dutyOrg` (optional)
- `orgUnit` (optional)

✅ **AAL Claims (Native v2.0.0):**
- `acr` (Authentication Context Class Reference)
  - `"0"` = AAL1 (password only)
  - `"1"` = AAL2 (password + OTP)
  - `"2"` = AAL3 (hardware key)
- `amr` (Authentication Methods Reference, RFC-8176)
  - `["pwd"]` = password
  - `["pwd","otp"]` = password + OTP
  - `["hwk"]` = hardware key
- `auth_time` (authentication timestamp)

✅ **Token Lifetime (AAL2 Compliance):**
- Lifetime ≤ 15 minutes (900 seconds)
- Not expired
- Reasonable age

✅ **Cross-Validation:**
- ACR matches clearance level
- AMR matches authentication methods
- Clearance vs MFA consistency

### Expected Results

```
============================================
DIVE V3 Token Claims Validation
Version: 2.0.0 (Native Keycloak 26.4.2)
============================================

[INFO] Validating JWT structure...
[PASS] JWT structure valid (3 parts: header.payload.signature)

[INFO] Validating JWT header...
  Algorithm (alg): RS256
  Type (typ): JWT
  Key ID (kid): abc123...
[PASS] Algorithm is RS256 (asymmetric signing)
[PASS] Type is JWT

[INFO] Validating required OIDC claims...
[PASS] iss (issuer): https://localhost:8443/realms/dive-v3-usa
[PASS] sub (subject): f1234567-89ab-cdef-0123-456789abcdef
[PASS] aud (audience): dive-v3-client-broker
[PASS] exp (expiration): 1730765700 (Mon Nov  4 12:15:00 2025)
[PASS] iat (issued at): 1730764800 (Mon Nov  4 12:00:00 2025)
[PASS] jti (JWT ID): abc123-def456-...

[INFO] Validating DIVE V3 custom claims...
[PASS] uniqueID: john.doe@example.mil
[PASS] clearance: SECRET (valid level)
[PASS] countryOfAffiliation: USA (ISO 3166-1 alpha-3)
[PASS] acpCOI: ["NATO-COSMIC","FVEY"]

[INFO] Validating AAL (Authentication Assurance Level) claims...
[PASS] acr: 1 (AAL2 - Multi-factor authentication)
[PASS] amr: ["pwd","otp"] (RFC-8176 compliant array)
  - pwd (password) ✓
  - otp (one-time password) ✓
[PASS] auth_time: 1730764800 (Mon Nov  4 12:00:00 2025)
[PASS] auth_time age: 45s (< 15 minutes)

[INFO] Validating token lifetime (AAL2 compliance)...
  Issued at (iat): Mon Nov  4 12:00:00 2025
  Expires at (exp): Mon Nov  4 12:15:00 2025
  Lifetime: 900s (15 minutes)
  Time remaining: 855s (14 minutes)
[PASS] Token lifetime compliant: 900s ≤ 900s (15 minutes)
[PASS] Token is valid (expires in 855s)

============================================
VALIDATION RESULT
============================================

✓ ALL VALIDATIONS PASSED

[PASS] Token is valid and AAL2/ACP-240 compliant
```

---

## Manual Browser Testing

For comprehensive MFA testing, use browser-based authentication:

### Test Procedure

1. **Open browser to broker realm:**
   ```
   https://localhost:8443/realms/dive-v3-broker/account
   ```

2. **Click "Sign In" or navigate to:**
   ```
   https://localhost:8443/realms/dive-v3-broker/protocol/openid-connect/auth?client_id=dive-v3-client-broker&redirect_uri=https://localhost:3000&response_type=code&scope=openid
   ```

3. **Test UNCLASSIFIED User (AAL1):**
   - Username: `testuser-us-unclass`
   - Password: `password123`
   - Expected: Login succeeds, NO OTP prompt
   - Verify token: `acr="0"`, `amr=["pwd"]`

4. **Test SECRET User (AAL2):**
   - Username: `john.doe`
   - Password: `password123`
   - Expected: OTP prompt appears
   - Enter OTP from authenticator app
   - Login succeeds
   - Verify token: `acr="1"`, `amr=["pwd","otp"]`

5. **Test Federation (Broker ← USA Realm):**
   - Navigate to broker login
   - Click "USA Realm" IdP button
   - Redirected to `dive-v3-usa` realm
   - Login with USA credentials
   - Redirected back to broker
   - Verify attributes synced from USA realm

### Capture Token for Validation

**Method 1: Browser DevTools**
```javascript
// In browser console
console.log(sessionStorage.getItem('access_token'));
```

**Method 2: Intercept via Network Tab**
1. Open DevTools → Network
2. Filter: `token`
3. Find POST to `/token` endpoint
4. Copy `access_token` from response

**Method 3: Use test script**
```bash
# This will be in test results
./scripts/test-keycloak-auth.sh usa
# Token saved to test-results/usa-token.txt (if configured)
```

---

## Automated Testing (CI/CD)

### GitHub Actions Workflow

**File:** `.github/workflows/keycloak-test.yml`

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests affecting Keycloak/Terraform
- Manual workflow dispatch

**Jobs:**

1. **Health Check** - Verifies Keycloak starts correctly
2. **Realm Config** - Tests all 11 realms exist
3. **Federation Tests** - Runs federation test suite
4. **Auth Flow Tests** - Runs authentication test suite
5. **Token Validation** - Validates token claims
6. **Security Checks** - Verifies v2.0.0 compliance (no custom SPIs)
7. **Test Summary** - Aggregates results

**Run Locally:**

```bash
# Install act (GitHub Actions local runner)
brew install act

# Run workflow
act -j health-check
act -j realm-config
act -j federation-tests
```

**View Results:**

- GitHub Actions tab in repository
- Artifacts: Test logs and results
- Status badges in README

---

## Troubleshooting

### Issue: Keycloak Not Reachable

**Symptoms:**
```
ERROR: Keycloak is not reachable at https://localhost:8443
```

**Solution:**
```bash
# Check if Keycloak is running
docker compose ps keycloak

# If not running
docker compose up -d keycloak

# Check logs
docker logs -f dive-v3-keycloak

# Wait for "Keycloak 26.4.2 started"
```

### Issue: Test User Not Found

**Symptoms:**
```
ERROR: Failed to obtain access token
```

**Solution:**
```bash
# Apply Terraform to create test users
cd terraform
terraform init
terraform apply -auto-approve

# Or manually create user via Admin Console
# https://localhost:8443/admin
```

### Issue: MFA Bypass Detected

**Symptoms:**
```
ERROR: SECURITY ISSUE: Got token without OTP for CONFIDENTIAL user!
```

**Investigation:**
1. Check authentication flow configuration
2. Verify `conditional-user-attribute` is configured
3. Check clearance attribute on user
4. Review Terraform module: `terraform/modules/realm-mfa/main.tf`

**Fix:**
```bash
# Re-apply Terraform MFA configuration
cd terraform
terraform apply -target=module.usa_mfa -auto-approve
```

### Issue: Token Claims Missing

**Symptoms:**
```
ERROR: Missing REQUIRED claim: acr
ERROR: Missing REQUIRED claim: amr
```

**Investigation:**
1. Check protocol mappers are configured
2. Verify authentication execution configs have `reference` parameter
3. Check event listeners (should be `jboss-logging` only, no custom)

**Fix:**
```bash
# Verify protocol mappers
curl -sk https://localhost:8443/realms/dive-v3-usa/.well-known/openid-configuration | jq '.claims_supported'

# Should include: "acr", "amr", "auth_time"
```

### Issue: Federation Not Working

**Symptoms:**
```
ERROR: Realm does NOT exist: dive-v3-usa
```

**Solution:**
```bash
# Check all realms exist
for realm in broker usa fra can deu gbr ita esp pol nld industry; do
  curl -sk "https://localhost:8443/realms/dive-v3-$realm/.well-known/openid-configuration" | jq '.issuer'
done

# Re-apply Terraform if realms missing
cd terraform
terraform apply -auto-approve
```

---

## Success Criteria

### Phase 3 Testing Complete When:

- [ ] All 44 authentication test cases pass
- [ ] All 10 federation configurations valid
- [ ] Token claims validation passes for all clearance levels
- [ ] ACR/AMR claims correct for AAL1 and AAL2
- [ ] Token lifetime ≤ 15 minutes (AAL2 compliance)
- [ ] No custom SPI JARs present (v2.0.0 compliance)
- [ ] GitHub Actions workflow passes
- [ ] Manual browser testing confirms MFA enforcement

### Compliance Verification:

✅ **AAL2 (NIST SP 800-63B):**
- Password-only = AAL1 (acr="0")
- Password + OTP = AAL2 (acr="1")
- Token lifetime ≤ 15 minutes

✅ **FAL2 (NIST SP 800-63C):**
- HTTPS enabled
- Tokens signed with RS256
- Assertion protection

✅ **ACP-240 (NATO):**
- All DIVE attributes present
- Clearance levels enforced
- Country affiliation tracked
- COI tags supported

✅ **RFC-8176 (AMR):**
- AMR claim is JSON array
- Standard values: "pwd", "otp", "hwk"
- Keycloak native tracking

---

## Next Steps

After completing testing:

1. **Document Test Results:**
   - Update `NATIVE-KEYCLOAK-REFACTORING-COMPLETE.md`
   - Add test metrics to CHANGELOG
   - Create test report artifact

2. **Production Deployment:**
   - Review `docs/NATIVE-KEYCLOAK-REFACTORING.md`
   - Follow deployment procedures
   - Monitor production closely

3. **Continuous Testing:**
   - Run tests before each deployment
   - Add new tests for future features
   - Maintain test coverage

---

## References

### Test Scripts

- `scripts/test-keycloak-auth.sh` - Authentication testing
- `scripts/test-keycloak-federation.sh` - Federation testing
- `scripts/test-token-claims.sh` - Token validation

### Documentation

- `docs/NATIVE-KEYCLOAK-REFACTORING.md` - Migration guide
- `CHANGELOG.md` - v2.0.0 release notes
- `NATIVE-KEYCLOAK-REFACTORING-COMPLETE.md` - Execution report

### External

- [Keycloak 26.4 Testing Guide](https://www.keycloak.org/docs/26.4/server_development/#_tests)
- [NIST SP 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html)
- [RFC-8176 AMR Values](https://www.rfc-editor.org/rfc/rfc8176.html)

---

**Document Version:** 1.0  
**Last Updated:** November 4, 2025  
**Status:** Ready for Testing


