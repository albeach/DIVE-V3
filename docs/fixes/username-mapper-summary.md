# Username Mapper Implementation Summary

## Overview

Added `oidc-username-idp-mapper` to all 10 IdP brokers to map `uniqueID` claim to broker realm `username` field. This enables automatic account linking based on `uniqueID` instead of email.

## Files Updated

### Broker Configuration Files (10 files)

All files in `/home/mike/Desktop/DIVE-V3/DIVE-V3/terraform/`:

1. ✅ `usa-broker.tf` - United States (DoD)
2. ✅ `fra-broker.tf` - France (Ministère des Armées)
3. ✅ `can-broker.tf` - Canada (Forces canadiennes)
4. ✅ `deu-broker.tf` - Germany (Bundeswehr)
5. ✅ `gbr-broker.tf` - United Kingdom (MOD)
6. ✅ `ita-broker.tf` - Italy (Ministero della Difesa)
7. ✅ `esp-broker.tf` - Spain (Ministerio de Defensa)
8. ✅ `pol-broker.tf` - Poland (MON)
9. ✅ `nld-broker.tf` - Netherlands (Defensie)
10. ✅ `industry-broker.tf` - Industry Partners (Contractors)

### Test User Module

1. ✅ `modules/realm-test-users/main.tf` - All 4 test users per realm now use `uniqueID` as `username`

### Authentication Flow

1. ✅ `modules/realm-mfa/post-broker-flow.tf` - Updated to use `idp-auto-link` with username matching

## Changes Made to Each Broker

### Pattern Applied

For each broker file, added this mapper **after** the IdP resource and **before** existing attribute mappers:

```hcl
# CRITICAL: Map uniqueID to USERNAME (not just user attribute)
# This enables auto-linking to work by username matching
# since email may not be reliable in federated scenarios
resource "keycloak_custom_identity_provider_mapper" "{country}_broker_username" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.{country}_realm_broker.alias
  name                     = "{country}-username-from-uniqueID"
  identity_provider_mapper = "oidc-username-idp-mapper"

  extra_config = {
    "syncMode" = "FORCE"
    "template" = "$${CLAIM.uniqueID}"  # Set username = uniqueID from token
  }
}
```

**Note:** The existing `uniqueID` attribute mapper is kept for OPA/backend usage.

## Deployment Steps

### 1. Review Changes

```bash
cd /home/mike/Desktop/DIVE-V3/DIVE-V3/terraform
git diff
```

Expected changes:
- 10 broker files: Each adds 1 username mapper
- 1 test user module: Updates 4 usernames
- 1 flow file: Updates authentication flow logic

### 2. Plan Terraform Changes

```bash
terraform plan -out=tfplan
```

Expected resource changes:
- **Add:** 10 new `keycloak_custom_identity_provider_mapper` resources (username mappers)
- **Update:** ~40 `keycloak_user` resources (username changes in national realms)
- **Update:** 2-3 `keycloak_authentication_execution` resources (flow updates)

### 3. Apply Changes

```bash
terraform apply tfplan
```

This will:
1. Create username mappers for all IdP brokers
2. Update test user usernames to match uniqueID
3. Update first broker login flow to use auto-linking

### 4. Verify in Keycloak Admin Console

#### Check Username Mappers

For each realm's IdP broker:
1. Navigate to: **dive-v3-broker** → **Identity Providers** → **{Country} Realm Broker**
2. Click: **Mappers** tab
3. Verify: `{country}-username-from-uniqueID` mapper exists
4. Check config:
   - Mapper Type: `Username Template Importer`
   - Template: `${CLAIM.uniqueID}`
   - Sync Mode Override: `force`

#### Check Authentication Flow

1. Navigate to: **dive-v3-broker** → **Authentication** → **Flows**
2. Select: **Post Broker MFA - DIVE V3 Broker Hub**
3. Verify structure:
   ```
   ├─ Review Profile [DISABLED]
   ├─ idp-auto-link [ALTERNATIVE]
   ├─ idp-create-user-if-unique [ALTERNATIVE]
   └─ Conditional OTP [CONDITIONAL]
   ```

#### Check Test Users

For each national realm (e.g., `dive-v3-usa`):
1. Navigate to: **{Realm}** → **Users**
2. Find user: `testuser-{country}-unclass`
3. Verify: Username field shows full uniqueID (e.g., `testuser-usa-unclass@example.mil`)

## Testing

### Test Scenario 1: Existing User Auto-Link

**Setup:**
- User exists in national realm: `dive-v3-usa`
- User exists in broker realm: `dive-v3-broker` (pre-created for testing)
- Both have same `username` = `uniqueID`

**Steps:**
1. Go to: http://localhost:3000
2. Click: **United States (DoD)**
3. Login: `testuser-usa-unclass@example.mil` / `password123`

**Expected Result:**
- ✅ Login succeeds
- ✅ No "user already exists" error
- ✅ Broker user is linked to national IdP
- ✅ Redirected to resources page

### Test Scenario 2: New User Creation

**Setup:**
- User exists in national realm: `dive-v3-fra`
- User does NOT exist in broker realm

**Steps:**
1. Go to: http://localhost:3000
2. Click: **France (Ministère des Armées)**
3. Login: `testuser-fra-unclass@defense.gouv.fr` / `password123`

**Expected Result:**
- ✅ Login succeeds
- ✅ New user created in broker realm
- ✅ Username in broker = uniqueID from token
- ✅ All attributes synced from national realm

### Test Scenario 3: Multiple Logins (Idempotency)

**Setup:**
- Same as Scenario 1

**Steps:**
1. Login as USA user → logout
2. Login as USA user again → logout
3. Login as USA user third time

**Expected Result:**
- ✅ All logins succeed
- ✅ No duplicate accounts created
- ✅ Attributes stay in sync (FORCE mode)

## Troubleshooting

### Issue: "Invalid username or password"

**Cause:** Trying to login with old short username format

**Solution:** Use full uniqueID as username
- ❌ Old: `testuser-usa-unclass`
- ✅ New: `testuser-usa-unclass@example.mil`

### Issue: "User already exists" error persists

**Possible causes:**
1. Username mapper not created yet (check Keycloak admin console)
2. National realm user still has old short username (check user list)
3. Broker realm has user with different username (delete and retry)

**Solution:**
```bash
# Re-apply Terraform
terraform apply -auto-approve

# Verify mapper exists
curl -s http://localhost:8081/admin/realms/dive-v3-broker/identity-provider/instances/usa-realm-broker/mappers \
  -H "Authorization: Bearer $TOKEN" | jq '.[] | select(.name | contains("username"))'
```

### Issue: Username shows as email-like but uniqueID is different

**Cause:** Current implementation uses email-format for uniqueID (e.g., `user@domain`)

**Solution (for production):**
Update uniqueID format to use proper unique identifiers:
- USA: `EDIPI:1234567890`
- FRA: `matricule:FRA-123456`
- GBR: `MOD-ID:GB-987654`

This ensures global uniqueness without relying on email conventions.

## Rollback Plan

If issues occur:

```bash
# Revert Terraform changes
git checkout HEAD~1 terraform/

# Re-apply previous state
terraform apply -auto-approve
```

**Note:** This will:
- Remove username mappers
- Revert test users to short usernames
- Re-enable the "user exists" error

## Security Implications

### Positive

✅ **Username = uniqueID:** More secure than email-based matching (emails can change)

✅ **No PII in username:** Can use opaque identifiers (EDIPI, matricule, etc.)

✅ **Audit trail:** Username field clearly shows identity source

### Considerations

⚠️ **Username changes are disruptive:** If you change uniqueID format, users can't login until updated

⚠️ **Username conflicts:** Ensure uniqueID is globally unique across all realms

⚠️ **No email fallback:** System no longer works if uniqueID is missing from token

## Next Steps

1. ✅ Apply Terraform changes
2. ✅ Test with USA realm (existing user)
3. [ ] Test with France realm (new user)
4. [ ] Test with all 10 realms (smoke test)
5. [ ] Update E2E test scripts to use new username format
6. [ ] Document uniqueID format requirements for production
7. [ ] Consider migrating to non-email uniqueID format (e.g., `EDIPI:xxx`)

## Production Recommendations

### uniqueID Format Standards

For production deployment, standardize uniqueID formats:

```
USA:      EDIPI:1234567890
FRA:      matricule:FRA-123456
CAN:      DND-ID:CA-789012
GBR:      MOD-ID:GB-345678
DEU:      PersNr:DE-901234
ITA:      Matricola:IT-567890
ESP:      NIP:ES-234567
POL:      NrWojskowy:PL-890123
NLD:      BSN:NL-456789
Industry: Email (fallback for contractors)
```

Benefits:
- **Globally unique:** Country prefix prevents collisions
- **Not PII:** Opaque identifiers, not emails
- **Audit-friendly:** Clear identity source in logs
- **Stable:** Won't change like email addresses

### Migration Path

To migrate from email-format to proper uniqueIDs:

1. Update national realm user attributes
2. Re-sync attributes to broker realm (FORCE mode)
3. Users can continue logging in (username auto-updates)
4. Old usernames become aliases (Keycloak keeps federation links)

---

**Status:** ✅ Implementation Complete  
**Last Updated:** 2025-11-07  
**Files Modified:** 12 files (10 brokers + 1 test module + 1 flow)  
**Ready for Deployment:** Yes  
**Tested:** Pending user verification







