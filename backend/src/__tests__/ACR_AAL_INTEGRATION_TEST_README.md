# ACR/AAL Integration Verification Test

## Overview

This integration test suite verifies that real users across different Keycloak instances receive the correct ACR (Authentication Context Class Reference) / AAL (Authenticator Assurance Level) based on their clearance level by actually authenticating with Keycloak.

## Test Users

The test uses the standard test user format: `testuser-[COUNTRYCODE]-[1-4]`

### Test Matrix

| Username | Instance | Clearance | Expected AAL | Expected ACR | Expected AMR |
|----------|----------|-----------|--------------|--------------|--------------|
| testuser-usa-3 | USA | SECRET | AAL2 | "1" | ["pwd", "otp"] |
| testuser-fra-2 | FRA | CONFIDENTIAL | AAL2 | "1" | ["pwd", "otp"] |
| testuser-deu-4 | DEU | TOP_SECRET | AAL3 | "2" | ["pwd", "hwk"] |

### Clearance → AAL Mapping

- **UNCLASSIFIED** (level 1) → AAL1 (password only) → ACR="0"
- **CONFIDENTIAL** (level 2) → AAL2 (password + OTP) → ACR="1"
- **SECRET** (level 3) → AAL2 (password + OTP) → ACR="1"
- **TOP_SECRET** (level 4) → AAL3 (password + WebAuthn) → ACR="2"

## Running the Tests

### Option 1: Using the Script (Recommended)

```bash
cd backend
./scripts/test-acr-aal-integration.sh
```

### Option 2: Using npm directly

```bash
cd backend
RUN_INTEGRATION_TESTS=true npm test -- acr-aal-integration-verification.test.ts
```

### Option 3: With Custom Configuration

```bash
cd backend
KEYCLOAK_URL_USA=https://usa-idp.dive25.com \
KEYCLOAK_URL_FRA=https://fra-idp.dive25.com \
KEYCLOAK_URL_DEU=https://deu-idp.dive25.com \
TEST_USER_PASSWORD=TestUser2025!Pilot \
RUN_INTEGRATION_TESTS=true \
npm test -- acr-aal-integration-verification.test.ts
```

## Prerequisites

1. **Keycloak Instances Running**
   - USA instance: `https://usa-idp.dive25.com` (or set `KEYCLOAK_URL_USA`)
   - FRA instance: `https://fra-idp.dive25.com` (or set `KEYCLOAK_URL_FRA`)
   - DEU instance: `https://deu-idp.dive25.com` (or set `KEYCLOAK_URL_DEU`)

2. **Test Users Created**
   - Users must be created via Terraform (`terraform/modules/federated-instance/test-users.tf`)
   - Password: `TestUser2025!Pilot` (or set `TEST_USER_PASSWORD`)

3. **MFA Configured**
   - Users requiring AAL2 (CONFIDENTIAL, SECRET) must have OTP configured
   - Users requiring AAL3 (TOP_SECRET) must have WebAuthn/passkey configured

## Test Coverage

### 1. USA Instance - SECRET User (testuser-usa-3)
- ✅ Authentication successful
- ✅ Correct user attributes (username, clearance, country)
- ✅ ACR claim present and indicates AAL2
- ✅ AMR claim present with 2+ factors (pwd + otp)
- ✅ auth_time claim present
- ✅ Matches AAL2 requirements for SECRET clearance

### 2. FRA Instance - CONFIDENTIAL User (testuser-fra-2)
- ✅ Authentication successful
- ✅ Correct user attributes
- ✅ ACR claim indicates AAL2
- ✅ AMR claim with 2+ factors (pwd + otp)
- ✅ Matches AAL2 requirements for CONFIDENTIAL clearance

### 3. DEU Instance - TOP_SECRET User (testuser-deu-4)
- ✅ Authentication successful
- ✅ Correct user attributes
- ✅ ACR claim indicates AAL3
- ✅ AMR claim with hardware key (pwd + hwk)
- ✅ Matches AAL3 requirements for TOP_SECRET clearance

### 4. Cross-Instance Consistency
- ✅ All SECRET users across instances get AAL2
- ✅ Consistent ACR/AAL assignment for same clearance

### 5. Clearance → AAL Mapping
- ✅ All clearance levels tested (UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET)
- ✅ Correct AAL assignment for each clearance level

## What Gets Tested

1. **Real Authentication Flow**
   - Actual Keycloak password grant authentication
   - Real JWT token issuance
   - Token claim extraction

2. **ACR/AAL Assignment**
   - Verification that ACR matches expected AAL level
   - Normalization of ACR (numeric, string, URN formats)
   - Backend normalization logic validation

3. **AMR Verification**
   - Authentication methods present in token
   - Factor count verification (2+ for AAL2, hardware key for AAL3)
   - AMR format normalization

4. **Cross-Instance Consistency**
   - Same clearance gets same AAL across instances
   - Consistent behavior across USA, FRA, DEU

## Troubleshooting

### Test Skipped
If tests are skipped, ensure `RUN_INTEGRATION_TESTS=true` is set:
```bash
RUN_INTEGRATION_TESTS=true npm test -- acr-aal-integration-verification.test.ts
```

### Authentication Failures
- Verify Keycloak instances are running and accessible
- Check that test users exist and passwords are correct
- Ensure MFA is configured for users requiring AAL2/AAL3

### Wrong ACR/AAL Values
- Check Keycloak authentication flow configuration
- Verify AMREnrichmentEventListener is working correctly
- Check protocol mappers for ACR/AMR claims
- Verify MFA credentials are properly configured

### Network Issues
- Tests use `rejectUnauthorized: false` for self-signed certificates
- Check firewall rules if tests fail to connect
- Verify DNS resolution for Keycloak URLs

## Related Files

- **Test File**: `backend/src/__tests__/acr-aal-integration-verification.test.ts`
- **Unit Test File**: `backend/src/__tests__/acr-aal-clearance-verification.test.ts`
- **Test Script**: `backend/scripts/test-acr-aal-integration.sh`
- **User Creation**: `terraform/modules/federated-instance/test-users.tf`
- **Backend Normalization**: `backend/src/middleware/authz.middleware.ts` (normalizeACR, normalizeAMR)
- **Keycloak Event Listener**: `keycloak/extensions/src/main/java/com/dive/keycloak/event/AMREnrichmentEventListener.java`

## Expected Output

```
PASS  src/__tests__/acr-aal-integration-verification.test.ts
  ACR/AAL Integration Verification - Real Keycloak Authentication
    USA Instance - SECRET User (testuser-usa-3)
      ✓ should authenticate successfully
      ✓ should have correct user attributes
      ✓ should have ACR claim present
      ✓ should have ACR indicating AAL2 (numeric "1" or equivalent)
      ✓ should have AMR claim present
      ✓ should have AMR with 2+ factors (password + OTP)
      ✓ should have auth_time claim
      ✓ should match expected AAL2 requirements for SECRET clearance
    FRA Instance - CONFIDENTIAL User (testuser-fra-2)
      ✓ should authenticate successfully
      ...
    DEU Instance - TOP_SECRET User (testuser-deu-4)
      ✓ should authenticate successfully
      ...
    Cross-Instance ACR/AAL Consistency
      ✓ should assign consistent AAL levels for same clearance across instances
    Clearance → AAL Mapping Verification
      ✓ should assign AAL0 to testuser-usa-1 (UNCLASSIFIED)
      ✓ should assign AAL1 to testuser-usa-2 (CONFIDENTIAL)
      ✓ should assign AAL1 to testuser-usa-3 (SECRET)
      ✓ should assign AAL2 to testuser-usa-4 (TOP_SECRET)

Test Suites: 1 passed, 1 total
Tests:       20+ passed, 20+ total
```





