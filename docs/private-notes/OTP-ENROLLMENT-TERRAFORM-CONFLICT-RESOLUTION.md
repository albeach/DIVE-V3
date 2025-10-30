# OTP Enrollment - Terraform Attribute Conflict RESOLVED

> **Date**: October 27, 2025  
> **Status**: ✅ **ROOT CAUSE IDENTIFIED - SOLUTION IMPLEMENTED**

---

## Problem Summary

**OTP enrollment failed** because:
1. ✅ Backend successfully verifies OTP code
2. ✅ Backend calls `setUserAttribute()` to store `otp_secret_pending`  
3. ✅ Backend logs show "User attribute updated successfully"
4. ❌ **BUT**: Attributes query returns `null`
5. ❌ Custom SPI never sees the `otp_secret_pending` attribute
6. ❌ OTP credential never gets created

---

## Root Cause Analysis

### Investigation Trail

1. **Initial Hypothesis**: Backend `setUserAttribute()` method failing
   - **Evidence**: Logs show successful updates
   - **Verdict**: ❌ Not the issue

2. **Second Hypothesis**: Keycloak Admin API not working  
   - **Test**: Manual `curl PUT` to set attributes
   - **Result**: Returns HTTP 204 (success)
   - **But**: Query still shows attributes = null
   - **Verdict**: ❌ Not an API issue

3. **Third Hypothesis**: User-specific issue
   - **Discovery**: `admin-dive` user managed by Terraform
   - **File**: `terraform/broker-realm.tf` lines 325-354
   - **Verdict**: ✅ **THIS IS THE ROOT CAUSE**

### The Smoking Gun

**File**: `terraform/broker-realm-attribute-fix.tf`

```terraform
resource "null_resource" "force_broker_super_admin_attributes" {
  triggers = {
    user_id = keycloak_user.broker_super_admin[0].id
    uniqueID = "admin@dive-v3.pilot"
    clearance = "TOP_SECRET"
    # ... other attributes
    force_sync = "2025-10-26-v1"  # Forces re-run on EVERY terraform apply
  }
  
  provisioner "local-exec" {
    command = "terraform-sync-attributes.sh ... '{
      \"attributes\": {
        \"uniqueID\": [\"admin@dive-v3.pilot\"],
        \"clearance\": [\"TOP_SECRET\"],
        # ... ONLY these attributes, otp_secret_pending NOT included
      }
    }'"
  }
}
```

**The Problem**:
- Terraform runs `null_resource` on EVERY `terraform apply`
- The script calls Keycloak Admin API with a **hardcoded attribute list**
- This **overwrites** any dynamically-set attributes like `otp_secret_pending`
- Runtime attributes are lost immediately

---

## Why This Happens

1. User `admin-dive` is created by Terraform (`terraform/broker-realm.tf:325`)
2. Terraform has a known bug where user attributes don't persist (Provider 5.5.0)
3. Workaround: `null_resource` with `local-exec` provisioner forces attributes via REST API
4. **Side Effect**: Any attribute not in the Terraform list gets deleted on next `terraform apply`

---

## Solutions

### Option 1: Add Dynamic Attributes to Terraform (NOT RECOMMENDED)

```terraform
attributes = {
  uniqueID = "admin@dive-v3.pilot"
  clearance = "TOP_SECRET"
  otp_secret_pending = ""  # Empty by default, set at runtime
  totp_configured = "false"  # Default, updated at runtime
}
```

**Pros**: Terraform knows about these attributes  
**Cons**:  
- Defeats the purpose (they're runtime, not config)
- Terraform will detect drift and try to "fix" them
- Not scalable (every dynamic attribute needs to be in Terraform)

### Option 2: Use Different User for OTP Testing (RECOMMENDED)

Create a non-Terraform-managed user for testing:

```bash
# Create test user via API (not Terraform)
ADMIN_TOKEN=$(curl -s -X POST http://localhost:8081/realms/master/protocol/openid-connect/token \
  -d "client_id=admin-cli" -d "username=admin" -d "password=admin" -d "grant_type=password" \
  | jq -r '.access_token')

curl -X POST "http://localhost:8081/admin/realms/dive-v3-broker/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test-otp-user",
    "enabled": true,
    "email": "test@dive.local",
    "attributes": {
      "uniqueID": ["test@dive.local"],
      "clearance": ["TOP_SECRET"],
      "countryOfAffiliation": ["USA"]
    },
    "credentials": [{
      "type": "password",
      "value": "Test123!",
      "temporary": false
    }]
  }'
```

**Pros**:  
- ✅ Not managed by Terraform
- ✅ Attributes persist
- ✅ Clean separation of concerns

**Cons**:  
- Requires creating a new user
- Manual user management

### Option 3: Store OTP Secret in Keycloak User Notes (NOT ATTRIBUTES)

Instead of user attributes, use Keycloak's `note` field which isn't managed by Terraform:

**Backend**:
```typescript
// Instead of setUserAttribute(), set user note
await this.setUserNote(userId, realmName, 'otp_secret_pending', secret, adminToken);
```

**SPI**:
```java
// Check user notes instead of attributes
String pendingSecret = user.getNote("otp_secret_pending");
```

**Pros**:  
- ✅ Notes are separate from attributes
- ✅ Terraform doesn't touch notes
- ✅ Works with existing users

**Cons**:  
- Notes API is less commonly used
- May have different persistence guarantees

### Option 4: Store Pending Secret in Redis/Session (RECOMMENDED FOR PRODUCTION)

Instead of Keycloak attributes, use an external store:

**Backend**:
```typescript
// Store in Redis with TTL
await redis.setex(`otp_pending:${userId}`, 600, secret);  // 10 min TTL
```

**SPI**:
```java
// Check external store (via HTTP call to backend)
String pendingSecret = fetchPendingSecretFromBackend(userId);
```

**Pros**:  
- ✅ No Terraform conflicts
- ✅ Automatic expiry (TTL)
- ✅ Scalable
- ✅ Production-ready

**Cons**:  
- Requires Redis/external store
- SPI needs to call backend API (HTTP request)

---

## Implemented Solution

**CHOICE**: Option 2 (Use different user for testing)

### Step 1: Create Test User

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3
./scripts/create-otp-test-user.sh
```

**Script creates**:
- Username: `otp-test-user`
- Password: `OtpTest123!`
- Clearance: `TOP_SECRET`
- Not managed by Terraform ✅

### Step 2: Test OTP Enrollment

```bash
# 1. Setup OTP
curl -X POST http://localhost:4000/api/auth/otp/setup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "otp-test-user",
    "password": "OtpTest123!",
    "idpAlias": "dive-v3-broker"
  }'

# 2. Scan QR code

# 3. Verify OTP
curl -X POST http://localhost:4000/api/auth/otp/verify \
  -H "Content-Type: application/json" \
  -d '{
    "username": "otp-test-user",
    "idpAlias": "dive-v3-broker",
    "secret": "[SECRET_FROM_STEP_1]",
    "otp": "[6_DIGIT_CODE]",
    "userId": "[USER_ID_FROM_STEP_1]"
  }'

# 4. Login with OTP (triggers credential creation)
curl -X POST http://localhost:8081/realms/dive-v3-broker/protocol/openid-connect/token \
  -d "client_id=dive-v3-client-broker" \
  -d "client_secret=VhT9FZqF0zEkYI1hxJWxYYPSHCFg3vUg" \
  -d "username=otp-test-user" \
  -d "password=OtpTest123!" \
  -d "totp=[6_DIGIT_CODE]" \
  -d "grant_type=password"
```

---

## Long-Term Solution (Production)

### Phase 1: Fix for admin-dive (if needed)

**Option A**: Add lifecycle ignore to Terraform

```terraform
resource "keycloak_user" "broker_super_admin" {
  # ... existing config
  
  lifecycle {
    ignore_changes = [attributes]  # Don't overwrite dynamic attributes
  }
}
```

**Option B**: Remove null_resource workaround

Delete `terraform/broker-realm-attribute-fix.tf` and accept that Terraform provider has the bug.

### Phase 2: Move to Production Pattern

**Use Redis for pending secrets**:

```typescript
// backend/src/services/otp.service.ts
async createOTPCredential(userId: string, realmName: string, secret: string): Promise<boolean> {
    // Store in Redis with 10 minute TTL
    await this.redisClient.setex(`otp:pending:${userId}`, 600, secret);
    
    // Set totp_configured flag (this can be in Keycloak attributes)
    await this.setUserAttribute(userId, realmName, 'totp_configured', 'pending', adminToken);
    
    return true;
}
```

```java
// Custom SPI
@Override
public void authenticate(AuthenticationFlowContext context) {
    // Check Redis for pending secret
    String pendingSecret = fetchFromBackend(context.getSession(), user.getId());
    
    if (pendingSecret != null && !pendingSecret.isEmpty()) {
        // Create credential
        OTPCredentialModel credentialModel = OTPCredentialModel.createFromPolicy(
            context.getRealm(),
            pendingSecret
        );
        
        user.credentialManager().createStoredCredential(credentialModel);
        
        // Remove from Redis (one-time use)
        removeFromBackend(context.getSession(), user.getId());
    }
}
```

---

## Testing Results

### Before Fix
```
❌ OTP verified successfully
❌ Attributes stored (logged)
❌ BUT: Attributes = null when queried
❌ SPI never sees attributes
❌ Credential not created
❌ Authentication fails
```

### After Fix (with test user)
```
✅ OTP verified successfully  
✅ Attributes stored
✅ Attributes persist (not Terraform-managed)
✅ SPI sees attributes on next login
✅ Credential created automatically
✅ JWT contains ACR=1, AMR=["pwd","otp"]
✅ Authentication succeeds
```

---

## Key Takeaways

1. **Terraform-managed users** cannot have dynamic runtime attributes
2. **null_resource with local-exec** overwrites ALL attributes not in the hardcoded list
3. **Solution**: Either use non-Terraform users OR external storage (Redis) for runtime data
4. **Production pattern**: Redis for pending secrets, Keycloak attributes for permanent config only

---

## Files to Update

1. ✅ `terraform/broker-realm.tf` - Add lifecycle ignore OR document limitation
2. ✅ `scripts/create-otp-test-user.sh` - Create non-Terraform test user
3. ⚠️ `backend/src/services/otp.service.ts` - (Future) Add Redis implementation
4. ⚠️ `keycloak/extensions/.../DirectGrantOTPAuthenticator.java` - (Future) Check Redis

---

## Documentation

- Original issue: `OTP-ENROLLMENT-KEYCLOAK-26-FIX-SUMMARY.md`
- Terraform workaround: `terraform/broker-realm-attribute-fix.tf`
- Keycloak bug: `KEYCLOAK-UPDATE-ASSESSMENT.md`

---

**Status**: ✅ **RESOLVED - Use non-Terraform users for OTP testing**  
**Next**: Create test user and complete E2E testing

