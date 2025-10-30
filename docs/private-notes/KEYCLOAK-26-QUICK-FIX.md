# Keycloak 26 Migration - Quick Fix Guide

## ⚡ IMMEDIATE ACTION REQUIRED

Your AAL2/FAL2 implementation is **broken** after upgrading to Keycloak 26. Follow these steps to fix it.

---

## 🚨 What's Broken?

| Claim | Expected | Current | Impact |
|-------|----------|---------|---------|
| `acr` | "1" (AAL2) | ❌ null | Users cannot access classified resources |
| `amr` | ["pwd","otp"] | ❌ null | AAL2 validation fails |
| `auth_time` | Unix timestamp | ❌ null | Missing NIST SP 800-63B requirement |

---

## ✅ Fix Steps (15 minutes)

### Step 1: Backup

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

# Backup Keycloak database (if using Docker)
docker exec dive-v3-postgres pg_dump -U keycloak keycloak > backup-keycloak-$(date +%Y%m%d-%H%M%S).sql

# Or export realm configuration
docker exec dive-v3-keycloak /opt/keycloak/bin/kc.sh export \
  --dir /tmp/export --realm dive-v3-broker
```

---

### Step 2: Apply Terraform Fixes

The fixes have **already been applied** to `terraform/realms/broker-realm.tf`:

✅ Added `"basic"` client scope (includes `auth_time`)  
✅ Changed ACR mapper to use session notes  
✅ Changed AMR mapper to use session notes  

Now apply the changes:

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/terraform

# Initialize if needed
terraform init

# Plan the changes (review before applying)
terraform plan

# Apply the fixes
terraform apply
```

**Expected output**:
```
Plan: 0 to add, 3 to change, 0 to destroy.

Changes to:
  ~ keycloak_openid_client_default_scopes.broker_client_scopes
  ~ keycloak_generic_protocol_mapper.broker_acr
  ~ keycloak_generic_protocol_mapper.broker_amr
```

Type `yes` to apply.

---

### Step 3: Verify the Fix

Run the verification script:

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

# Make sure services are running
docker-compose up -d

# Wait for Keycloak to be ready
sleep 10

# Run verification
./scripts/verify-keycloak-26-claims.sh
```

**If prompted**, enter:
- **Client Secret**: (get from Keycloak admin console or `docker exec`)
- **Password**: `DiveAdmin2025!` (or your admin password)

**Expected output**:
```
✅ ALL CHECKS PASSED - Keycloak 26 migration successful!

Your AAL2/FAL2 implementation is working correctly.
```

---

### Step 4: Test Backend Authorization

```bash
# Get a fresh token
TOKEN=$(curl -s -X POST http://localhost:8081/realms/dive-v3-broker/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=dive-v3-client-broker" \
  -d "client_secret=YOUR_SECRET" \
  -d "username=admin-dive" \
  -d "password=DiveAdmin2025!" \
  -d "grant_type=password" \
  -d "scope=openid profile email" | jq -r '.access_token')

# Try accessing a classified resource
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4000/api/resources/doc-generated-1761226224287-1305 \
  | jq
```

**Expected**: 200 OK with resource data (not 403 Forbidden)

---

## 🔄 Apply to Other Realms

You need to apply the same fixes to **all other realms**:

| Realm | File | Status |
|-------|------|--------|
| ✅ `dive-v3-broker` | `terraform/realms/broker-realm.tf` | Fixed |
| ⚠️ `dive-v3-usa` | `terraform/realms/usa-realm.tf` | Needs fix |
| ⚠️ `dive-v3-fra` | `terraform/realms/fra-realm.tf` | Needs fix |
| ⚠️ `dive-v3-can` | `terraform/realms/can-realm.tf` | Needs fix |
| ⚠️ `dive-v3-industry` | `terraform/realms/industry-realm.tf` | Needs fix |

**Quick command to apply the same pattern**:

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/terraform/realms

# For each realm file (usa, fra, can, industry):
# 1. Add "basic" to default_scopes
# 2. Change acr mapper to use "oidc-usersessionmodel-note-mapper"
# 3. Change amr mapper to use "oidc-usersessionmodel-note-mapper"

# Then apply
cd ..
terraform apply
```

---

## 📋 Checklist

- [ ] Backup Keycloak database
- [ ] Apply Terraform fixes to `broker-realm.tf`
- [ ] Run `terraform apply`
- [ ] Run `./scripts/verify-keycloak-26-claims.sh`
- [ ] Verify `acr`, `amr`, and `auth_time` claims are present
- [ ] Test backend AAL2 validation with classified resource
- [ ] Apply fixes to other realms (usa, fra, can, industry)
- [ ] Test authentication for each realm
- [ ] Update E2E tests to verify claims

---

## 🚨 If It's Still Broken

### Issue: Claims still missing after Terraform apply

**Cause**: Keycloak may need a restart to pick up session note mappers.

**Fix**:
```bash
docker-compose restart keycloak
sleep 30  # Wait for Keycloak to be ready
```

---

### Issue: `AUTH_CONTEXT_CLASS_REF` session note is empty

**Cause**: Your custom Direct Grant OTP flow doesn't set session notes.

**Fix**: Update your custom SPI authenticator:

```java
// keycloak/extensions/src/main/java/com/dive/keycloak/authenticator/DirectGrantOTPAuthenticator.java

@Override
public void authenticate(AuthenticationFlowContext context) {
    // ... existing OTP validation logic ...
    
    if (otpValid) {
        // ✅ Set ACR in session notes (Keycloak's native storage)
        context.getAuthenticationSession().setAuthNote("AUTH_CONTEXT_CLASS_REF", "1");  // AAL2
        
        // ✅ Set AMR in session notes
        context.getAuthenticationSession().setAuthNote("AUTH_METHODS_REF", "[\"pwd\",\"otp\"]");
        
        context.success();
    }
}
```

Rebuild and redeploy:
```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/keycloak/extensions
./gradlew clean jar
docker cp build/libs/dive-keycloak-spi.jar dive-v3-keycloak:/opt/keycloak/providers/
docker-compose restart keycloak
```

---

## 📚 References

- **Full Analysis**: `KEYCLOAK-26-MIGRATION-CRITICAL-ISSUES.md`
- **Keycloak 26 Changelog**: `Keycloak-LLMS.txt`
- **Original AAL2 Fix**: `AAL2-AUTHENTICATION-STRENGTH-FIX.md`
- **Verification Script**: `scripts/verify-keycloak-26-claims.sh`

---

## ✅ Success Criteria

After applying the fixes:

```bash
# Token should include:
{
  "acr": "1",                    # ✅ AAL2
  "amr": ["pwd", "otp"],         # ✅ Multi-factor
  "auth_time": 1730068923,       # ✅ NIST requirement
  "sub": "...",                  # ✅ Subject
  "clearance": "TOP_SECRET",     # ✅ DIVE attribute
  "countryOfAffiliation": "USA"  # ✅ DIVE attribute
}
```

Backend logs should show:
```
[INFO] AAL2 validation passed via ACR
[INFO] Authorization decision: ALLOW
```

---

**Status**: 🚨 **ACTION REQUIRED**  
**Next**: Run `terraform apply` and `./scripts/verify-keycloak-26-claims.sh`  
**ETA**: 15 minutes to fix, 30 minutes to test all realms

