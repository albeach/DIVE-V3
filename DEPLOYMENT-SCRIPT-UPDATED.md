# Deploy Ubuntu Script Updated for v2.0.0

**Date:** November 4, 2025  
**File:** `scripts/deploy-ubuntu.sh`  
**Status:** ✅ **UPDATED FOR v2.0.0**

---

## Changes Made

### 1. Terraform Apply Command Updated ✅

**Old (v1.x):**
```bash
terraform apply -auto-approve
```

**New (v2.0.0):**
```bash
terraform apply -auto-approve \
  -var="keycloak_admin_username=admin" \
  -var="keycloak_admin_password=admin" \
  -var="keycloak_url=https://localhost:8443"
```

**Why:** v2.0.0 requires explicit variables due to centralized provider configuration

---

### 2. Deployment Description Updated ✅

**Added deployment summary showing:**
- 11 Keycloak realms with fixed authentication flows
- AAL1/AAL2/AAL3 conditional logic
- WebAuthn policies (AAL3 hardware-backed auth) - AUTOMATED!
- 44 test users (4 per realm with varied clearances)
- Native ACR/AMR tracking (no custom SPIs!)
- All protocol mappers and security policies

---

### 3. Phase 13 Added: v2.0.0 Verification ✅

**New verification checks:**

1. **All 11 Realms Accessible:**
   - Tests: broker, usa, fra, can, deu, gbr, ita, esp, pol, nld, industry
   - Expected: 11/11 (100%)

2. **Authentication Flow Errors:**
   - Checks for "user not set yet" errors
   - Expected: 0 (Forms Subflow fix working)

3. **Custom SPIs Removed:**
   - Checks for JAR files in keycloak/providers/
   - Expected: None (100% native)

4. **Test Users Created:**
   - Counts users in Terraform state
   - Expected: 44 (4 per realm × 11 realms)

---

### 4. Final Summary Enhanced ✅

**Added:**
- Test user credentials with password
- AAL level examples (AAL1/AAL2/AAL3)
- v2.0.0 features list
- Documentation references
- Testing commands

**Test Users Displayed:**
```
AAL1 (UNCLASSIFIED):  testuser-usa-unclass      (no MFA)
AAL2 (SECRET):        testuser-usa-secret        (OTP setup required)
AAL3 (TOP_SECRET):    testuser-usa-ts            (WebAuthn/YubiKey setup required)
```

**Password:** `Password123!` (all users)

---

## Script Usage

### Run Complete Deployment

```bash
./scripts/deploy-ubuntu.sh
```

**Duration:** ~15-20 minutes (including Terraform apply)

**What It Does:**
1. ✅ Pre-deployment checks (Docker, dependencies)
2. ✅ Generate SSL certificates (mkcert)
3. ✅ Set up DIVE Root CA
4. ✅ Start all Docker services
5. ✅ Wait for services to be ready
6. ✅ **Apply Terraform (v2.0.0 with all fixes)**
7. ✅ Seed MongoDB database
8. ✅ Restart application services
9. ✅ Verify all services healthy
10. ✅ **Verify v2.0.0 specific features**

---

## Expected Output

**Phase 9: Terraform Apply**
```
Applying Terraform configuration (v2.0.0)...
This will deploy:
  • 11 Keycloak realms with fixed authentication flows
  • AAL1/AAL2/AAL3 conditional logic
  • WebAuthn policies (AAL3 hardware-backed auth) - AUTOMATED!
  • 44 test users (4 per realm with varied clearances)
  • Native ACR/AMR tracking (no custom SPIs!)
  • All protocol mappers and security policies

Apply complete! Resources: X added, Y changed, Z destroyed.

✓ Terraform configuration applied successfully

v2.0.0 Deployment Summary:
  ✓ 11 realms configured with native Keycloak features
  ✓ Authentication flows fixed (Forms Subflow pattern)
  ✓ WebAuthn policies deployed (AAL3 for TOP_SECRET)
  ✓ 44 test users created (4 per realm)
  ✓ Zero custom SPIs (100% native Keycloak 26.4.2)
  ✓ Zero manual configuration steps
```

**Phase 13: v2.0.0 Verification**
```
Verifying all 11 realms:
  ✓ dive-v3-broker
  ✓ dive-v3-usa
  ✓ dive-v3-fra
  ... (all 11 realms)
✓ All 11 realms operational (100%)

Checking for authentication flow errors:
  ✓ No 'user not set yet' errors (v2.0.0 Forms Subflow fix working!)

Verifying custom SPIs removed:
  ✓ No custom SPI JARs (100% native Keycloak 26.4.2)

Verifying test users:
  ✓ All 44 test users created (4 per realm × 11 realms)
```

---

## Testing After Deployment

### Quick Smoke Test

```bash
# Test UNCLASSIFIED user (AAL1 - password only)
Open: https://localhost:8443/realms/dive-v3-usa/account
Login: testuser-usa-unclass / Password123!
Expected: Login immediately, no MFA

# Test SECRET user (AAL2 - OTP)
Login: testuser-usa-secret / Password123!
Expected: OTP setup prompt → scan QR code → enter OTP

# Test TOP_SECRET user (AAL3 - WebAuthn)
Login: testuser-usa-ts / Password123!
Expected: WebAuthn registration → touch YubiKey or use TouchID
```

### Run Automated Tests

```bash
# Test all authentication flows
./scripts/test-keycloak-auth.sh all

# Test federation
./scripts/test-keycloak-federation.sh all

# Validate token claims
./scripts/test-token-claims.sh <access_token>
```

---

## Rollback Procedure

If deployment fails or issues are discovered:

```bash
# Stop all services
docker compose down -v

# Restore from backup (if you made one)
docker exec dive-v3-postgres psql -U postgres < backups/keycloak-backup.sql

# Or start fresh
rm -rf terraform/terraform.tfstate*
./scripts/deploy-ubuntu.sh
```

---

## What's Different in v2.0.0

**Key Changes:**
1. ✅ Terraform requires explicit variables (keycloak_admin_username, etc.)
2. ✅ Forms Subflow authentication pattern (fixes "user not set" error)
3. ✅ WebAuthn policies automatically deployed (AAL3)
4. ✅ 44 test users created automatically
5. ✅ No custom SPIs (all removed)
6. ✅ Native ACR/AMR tracking

**Verification:**
- Phase 13 added to verify v2.0.0 features
- Checks for authentication errors, custom SPIs, test users
- Confirms all 11 realms operational

---

## Reference

**Primary Documentation:**
- `KEYCLOAK-V2-NATIVE-REFACTORING-SSOT.md` - Complete deployment guide
- `DEPLOYMENT-COMPLETE-FINAL.txt` - Quick reference
- `docs/TESTING-GUIDE.md` - Testing procedures

**Script:** `scripts/deploy-ubuntu.sh` (this file)

---

**Status:** ✅ Updated for v2.0.0 deployment


