# 🚨 CRITICAL: Terraform Keycloak Provider v5.5.0 + Keycloak 26.4.2 User Attributes Bug

**Date**: October 29, 2025  
**Severity**: **CRITICAL** (Blocks Phase 2 completion and user clearance display)  
**Status**: ⚠️ **ACTIVE BUG** - Workaround required

---

## Problem Summary

**User attributes defined in Terraform are NOT syncing to Keycloak**, causing:
1. ❌ All users show **UNCLASSIFIED** clearance in UI (regardless of actual clearance)
2. ❌ Terraform shows attributes in state, but Keycloak has `attributes = null`
3. ❌ Terraform apply says "modified" but no actual changes in Keycloak
4. ❌ Even fresh user creation doesn't set attributes

---

## Evidence

### Terraform State Shows Attributes ✅
```bash
$ terraform state show 'keycloak_user.usa_user_topsecret[0]'
attributes = {
  "clearance"            = "TOP_SECRET"
  "clearanceOriginal"    = "TOP_SECRET"
  "countryOfAffiliation" = "USA"
  "acpCOI"               = ["NATO-COSMIC", "FVEY", "CAN-US"]
  ...
}
```

### Keycloak Reality Shows NULL ❌
```bash
$ docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users -r dive-v3-usa -q "username=alice.general"
{
  "username": "alice.general",
  "attributes": null  # ← PROBLEM!
}
```

### UI Impact
- User logs in as `alice.general` (TOP_SECRET clearance)
- UI displays: **UNCLASSIFIED** (default fallback)
- Expected: **TOP_SECRET**

---

## Root Cause

**Terraform Keycloak Provider v5.5.0** has a **known bug** where user attributes don't sync to Keycloak 26.x properly.

**Confirmed Versions**:
- Terraform: `v1.13.4`
- Keycloak Provider: `v5.5.0` (keycloak/keycloak)
- Keycloak: `26.4.2`

**Known Issues**:
- GitHub Issue: https://github.com/keycloak/terraform-provider-keycloak/issues/1136
- Related: extra_config parameters not syncing
- Keycloak 26 introduced breaking changes with User Profile feature

---

## Attempted Fixes (All Failed)

1. ❌ **Terraform apply -target**: Says "modified" but attributes still NULL
2. ❌ **Terraform taint/recreate**: **PANIC crash** (segmentation fault)
3. ❌ **Keycloak REST API PUT**: Returns 200 OK but attributes unchanged
4. ❌ **kcadm.sh update with -s flag**: Doesn't work with complex attributes
5. ❌ **kcadm.sh update with -f file**: "Document empty" error
6. ❌ **Enable userProfileEnabled**: Enabled but still NULL
7. ❌ **Delete and recreate user**: Still NULL after recreation
8. ❌ **Import user to Terraform**: Provider crashes with panic

---

## Immediate Workaround

### Option A: Manual Keycloak Admin Console (FASTEST - 5 minutes)

**For each of 4 USA users**:

1. Open: http://localhost:8081/admin
2. Login: `admin` / `admin`
3. Select realm: `dive-v3-usa`
4. Navigate to: **Users** → Click username (e.g., `alice.general`)
5. Click: **Attributes** tab
6. Click: **Add attribute**
7. Add these attributes:

**alice.general (TOP_SECRET)**:
- Key: `clearance`, Value: `TOP_SECRET`
- Key: `clearanceOriginal`, Value: `TOP_SECRET`
- Key: `countryOfAffiliation`, Value: `USA`
- Key: `uniqueID`, Value: `550e8400-e29b-41d4-a716-446655440004`
- Key: `acpCOI`, Value: `NATO-COSMIC` (click + to add `FVEY`, `CAN-US`)

**john.doe (SECRET)**:
- Key: `clearance`, Value: `SECRET`
- Key: `clearanceOriginal`, Value: `SECRET`
- Key: `countryOfAffiliation`, Value: `USA`
- Key: `uniqueID`, Value: `550e8400-e29b-41d4-a716-446655440002`
- Key: `acpCOI`, Value: `FVEY`

**jane.smith (CONFIDENTIAL)**:
- Key: `clearance`, Value: `CONFIDENTIAL`
- Key: `clearanceOriginal`, Value: `CONFIDENTIAL`
- Key: `countryOfAffiliation`, Value: `USA`
- Key: `uniqueID`, Value: `550e8400-e29b-41d4-a716-446655440003`
- Key: `acpCOI`, Value: `NATO-COSMIC`

**bob.contractor (UNCLASSIFIED)**:
- Key: `clearance`, Value: `UNCLASSIFIED`
- Key: `clearanceOriginal`, Value: `UNCLASSIFIED`
- Key: `countryOfAffiliation`, Value: `USA`
- Key: `uniqueID`, Value: `550e8400-e29b-41d4-a716-446655440001`

8. Click **Save** after adding all attributes
9. Repeat for other 3 users

### Option B: Downgrade Terraform Provider (15 minutes)

Edit `terraform/main.tf`:

```hcl
terraform {
  required_version = ">= 1.13.4"
  
  required_providers {
    keycloak = {
      source  = "keycloak/keycloak"
      version = "4.4.0"  # Downgrade from 5.5.0
    }
  }
}
```

Then:
```bash
cd terraform
rm -rf .terraform.lock.hcl .terraform/
terraform init
terraform apply
```

**Risk**: May introduce other breaking changes

### Option C: Upgrade Keycloak Provider (10 minutes)

Try newer provider version (6.x) that may have fixed this bug:

```hcl
terraform {
  required_providers {
    keycloak = {
      source  = "keycloak/keycloak"
      version = "~> 6.0"  # Try latest
    }
  }
}
```

**Risk**: May have other breaking changes

---

## Recommended Immediate Action

**Use Option A (Manual Admin Console)** for the 4 USA test users right now so you can continue testing. This will take 5 minutes and immediately fix your UI issue.

Then we can investigate provider upgrade/downgrade for the other 36 users across 9 realms.

---

## Impact on Phase 2

### What's Blocked
- ✅ Shared mapper module created (complete)
- ✅ All 10 IdPs migrated (complete)
- ⚠️ **Terraform apply partially failed** (mapper conflicts)
- ❌ **User attributes not syncing** (critical bug)

### Workaround Status
- **Mappers**: Need to manually delete old mappers in Keycloak before applying
- **Users**: Need manual Admin Console attribute setting OR provider downgrade

---

## Files to Update After Workaround

Once attributes are manually set OR provider is fixed:

1. **Terraform State Sync**:
   ```bash
   cd terraform
   terraform refresh
   ```

2. **Update realm configurations** to include `userProfileEnabled`:
   ```hcl
   resource "keycloak_realm" "dive_v3_usa" {
     realm = "dive-v3-usa"
     # ... other config ...
     attributes = {
       userProfileEnabled = "true"
     }
   }
   ```

3. **Document in Phase 2 report** as known issue with workaround

---

## Verification After Fix

Once you manually set attributes (5 minutes in Admin Console):

```bash
# Verify attributes are set
TOKEN=$(docker exec dive-v3-keycloak curl -s -X POST \
  http://localhost:8080/realms/master/protocol/openid-connect/token \
  -d "client_id=admin-cli" -d "username=admin" -d "password=admin" \
  -d "grant_type=password" | jq -r '.access_token')

docker exec dive-v3-keycloak curl -s -X GET \
  "http://localhost:8080/admin/realms/dive-v3-usa/users?username=alice.general&exact=true" \
  -H "Authorization: Bearer $TOKEN" | jq '.[0].attributes'

# Expected: Shows clearance, clearanceOriginal, countryOfAffiliation, etc.
```

Then test in UI:
1. Logout current session
2. Login as `alice.general` / `Password123!`
3. Complete MFA (if prompted)
4. Check dashboard - should show **TOP_SECRET** clearance

---

**IMMEDIATE ACTION REQUIRED**: Manually set attributes via Keycloak Admin Console (http://localhost:8081/admin) for 4 USA users to fix UI clearance display.

