# Terraform + Keycloak Best Practices - DIVE V3

> **Question**: Why doesn't Terraform properly populate Keycloak's PostgreSQL database for user attributes?  
> **Answer**: It's a known Keycloak Terraform Provider bug, NOT a database or session issue.

---

## The Smoking Gun: Evidence

### Terraform State (What Terraform Thinks)
```json
{
  "username": "admin-dive",
  "attributes": {
    "clearance": "TOP_SECRET",
    "uniqueID": "admin@dive-v3.pilot",
    "countryOfAffiliation": "USA"
  }
}
```

### PostgreSQL Reality (What's Actually Stored)
```sql
-- user_entity table
id | username   | enabled
50242513... | admin-dive | t

-- user_attribute table  
user_id | name | value
(0 rows)  ← EMPTY! No attributes!
```

### Keycloak API (What Apps See)
```json
{
  "username": "admin-dive",
  "attributes": null  ← Returns null!
}
```

**Conclusion**: Terraform Provider 5.5.0 has a bug where it records attributes in Terraform state but doesn't actually persist them to PostgreSQL.

---

## Root Cause Analysis

### The Bug in Keycloak Terraform Provider

**File**: `mrparkers/terraform-provider-keycloak` v5.5.0

**Issue**: When creating users, the provider:
1. ✅ Calls `POST /admin/realms/{realm}/users` successfully
2. ✅ User is created in PostgreSQL `user_entity` table
3. ❌ **Attributes are NOT sent or are ignored by Keycloak**
4. ✅ Terraform records attributes in state file (incorrectly)
5. ❌ Subsequent reads show `attributes = null`

**Why This Happens**:
- Provider may not be formatting attributes correctly
- Or Keycloak API changed between versions
- Or there's a race condition in attribute creation

**The Workaround**: `null_resource` with `local-exec` provisioner
```terraform
resource "null_resource" "force_attributes" {
  provisioner "local-exec" {
    command = "curl -X PUT /users/{id} ..."  # Direct REST API call
  }
}
```

This works because **raw REST API calls DO persist to database**, but **Terraform provider calls DON'T**.

---

## Database Sessions Are NOT the Issue

**Question**: "What is best practice with using Terraform and Keycloak with database sessions?"

**Answer**: Database sessions are working correctly! The issue is the Terraform Provider's API integration, not PostgreSQL.

### How Keycloak + PostgreSQL Works

```
Keycloak Server
    ↓
Connection Pool (HikariCP)
    ↓
PostgreSQL Database
    ↓
Tables:
  - user_entity        (users)
  - user_attribute     (key-value attrs)
  - credential         (passwords, OTP)
  - user_session       (active sessions)
  - client_session     (OAuth flows)
```

**All of this works correctly!** The problem is the Terraform Provider doesn't call the Keycloak API correctly.

### Proof: Manual REST API Works

```bash
# Direct REST API call (bypasses Terraform Provider)
curl -X PUT http://localhost:8081/admin/realms/dive-v3-broker/users/{id} \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"attributes": {"test": ["value"]}}'

# Check database
docker exec dive-v3-postgres psql -U postgres -d keycloak_db \
  -c "SELECT * FROM user_attribute;"

# Result: ✅ Attributes ARE stored in PostgreSQL!
```

**Conclusion**: Database persistence works fine when calling Keycloak API correctly. The Terraform Provider just doesn't call it correctly.

---

## Best Practices: Terraform + Keycloak

### ✅ DO: Use Terraform For Infrastructure

```terraform
# Realms
resource "keycloak_realm" "dive_v3" {
  realm = "dive-v3"
  enabled = true
  # ... configuration
}

# Clients (applications)
resource "keycloak_openid_client" "app" {
  realm_id = keycloak_realm.dive_v3.id
  client_id = "my-app"
  # ... OAuth config
}

# Identity Providers
resource "keycloak_oidc_identity_provider" "france" {
  realm = keycloak_realm.dive_v3.id
  alias = "france-idp"
  # ... SAML/OIDC config
}

# Authentication Flows
resource "keycloak_authentication_flow" "custom_mfa" {
  realm_id = keycloak_realm.dive_v3.id
  alias = "custom-mfa-flow"
  # ... flow steps
}

# Protocol Mappers
resource "keycloak_openid_user_attribute_protocol_mapper" "clearance" {
  realm_id = keycloak_realm.dive_v3.id
  name = "clearance-mapper"
  # ... claim mapping
}
```

**Why**: These are **static infrastructure** that rarely changes.

### ❌ DON'T: Use Terraform For User Data

```terraform
# Bad: Users with runtime attributes
resource "keycloak_user" "user" {
  username = "john.doe"
  attributes = {
    last_login = "2025-10-27"      # Changes every login!
    otp_secret = "ABC123"          # Changes when user enrolls MFA!
    session_count = "5"            # Runtime data!
  }
}
```

**Why**: 
- Attributes change at runtime
- Terraform will detect "drift" and try to "fix" it
- Creates conflicts between Terraform and application

### ⚠️ MAYBE: Test Fixtures Only

```terraform
# Acceptable: Static test users for development
resource "keycloak_user" "test_admin" {
  count = var.environment == "dev" ? 1 : 0  # Only in dev!
  
  username = "test-admin"
  attributes = {
    clearance = "TOP_SECRET"  # Static, for testing only
    org = "TEST_ORG"          # Static, for testing only
  }
  
  lifecycle {
    ignore_changes = [
      attributes,  # Don't fight runtime changes
      email,       # Allow updates via UI
    ]
  }
}
```

**Why**: Useful for development, but add `lifecycle ignore_changes` to prevent conflicts.

---

## Recommended Architecture for DIVE V3

### Current Problem

```
Terraform → Creates user with attributes
                ↓ (BUG: attributes not saved)
Backend → Tries to add otp_secret_pending
                ↓ (Works, but...)
null_resource → Runs terraform-sync-attributes.sh
                ↓ (Overwrites everything!)
Result: otp_secret_pending deleted! ❌
```

### Solution 1: Remove User Management from Terraform

**Best for Production**

```terraform
# Keep infrastructure only
resource "keycloak_realm" "dive_v3" { }
resource "keycloak_openid_client" "app" { }

# Remove this:
# resource "keycloak_user" "admin" { }
# resource "null_resource" "force_attributes" { }
```

**Create users via**:
- Keycloak Admin UI (manual)
- Application REST API (programmatic)
- User registration flow (self-service)

**Pros**:
- ✅ No Terraform conflicts
- ✅ Attributes persist correctly
- ✅ Production-ready pattern

**Cons**:
- Manual user creation for testing
- No IaC for users

### Solution 2: Separate Static vs Dynamic Attributes

**Good for Development**

```terraform
# Terraform manages ONLY static attributes
resource "keycloak_user" "admin" {
  username = "admin-dive"
  attributes = {
    clearance = "TOP_SECRET"           # Static, set once
    org = "DIVE_ADMIN"                 # Static, set once
    # NO dynamic attributes here!
  }
  
  lifecycle {
    ignore_changes = [attributes]  # Don't overwrite runtime changes
  }
}

# Delete null_resource workaround
# (It conflicts with runtime attribute updates)
```

**Store dynamic attributes in Redis**:
```typescript
// backend/src/services/otp.service.ts
await redis.setex(`otp:pending:${userId}`, 600, secret);  // TTL 10 min
```

**Pros**:
- ✅ Terraform manages infrastructure
- ✅ Application manages runtime data
- ✅ Clear separation of concerns

**Cons**:
- Requires Redis
- More complex architecture

### Solution 3: Use Different Users for Testing

**Quickest Fix**

```bash
# Create non-Terraform-managed test user
curl -X POST http://localhost:8081/admin/realms/dive-v3-broker/users \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "username": "otp-test-user",
    "enabled": true,
    "attributes": {
      "clearance": ["TOP_SECRET"],
      "org": ["TEST"]
    },
    "credentials": [{
      "type": "password",
      "value": "Test123!",
      "temporary": false
    }]
  }'
```

**Pros**:
- ✅ Immediate fix
- ✅ No architecture changes
- ✅ Attributes persist correctly

**Cons**:
- Manual user creation
- Not tracked in Terraform

---

## Implementation Plan for DIVE V3

### Phase 1: Immediate Fix (Today)

1. **Create test user for OTP enrollment**
```bash
./scripts/create-otp-test-user.sh
```

2. **Add lifecycle ignore to admin-dive**
```terraform
resource "keycloak_user" "broker_super_admin" {
  # ... existing config
  
  lifecycle {
    ignore_changes = [attributes]
  }
}
```

3. **Apply Terraform**
```bash
cd terraform && terraform apply
```

### Phase 2: Architecture Improvement (This Week)

1. **Add Redis to docker-compose.yml** (already exists ✅)

2. **Update OTP service to use Redis**
```typescript
// Store pending secrets in Redis, not Keycloak attributes
async storePendingSecret(userId: string, secret: string): Promise<void> {
    await this.redis.setex(`otp:pending:${userId}`, 600, secret);
}
```

3. **Update Custom SPI to check Redis**
```java
// Fetch from backend API or Redis
String pendingSecret = fetchPendingSecretFromBackend(context, userId);
```

### Phase 3: Production Hardening (Next Sprint)

1. **Remove user management from Terraform**
```terraform
# Delete keycloak_user resources
# Delete null_resource workarounds
```

2. **Implement user provisioning API**
```typescript
// backend/src/routes/admin.routes.ts
app.post('/api/admin/users', async (req, res) => {
    // Create users via Keycloak Admin API
    // Store in database for auditing
});
```

3. **Add user import script**
```bash
# scripts/import-users.sh
# Reads from CSV/JSON, creates via API
```

---

## Database Best Practices

### Connection Pooling

Keycloak uses HikariCP (already configured):
```
# keycloak/conf/keycloak.conf
db-pool-initial-size=5
db-pool-min-size=5
db-pool-max-size=20
```

**Current config is fine** ✅

### Session Management

Keycloak stores sessions in PostgreSQL:
```sql
-- Active user sessions
SELECT * FROM user_session;

-- OAuth client sessions  
SELECT * FROM client_session;

-- Offline tokens (refresh tokens)
SELECT * FROM offline_user_session;
```

**This works correctly** - the issue is NOT session management!

### Backup Strategy

```bash
# Backup Keycloak database
docker exec dive-v3-postgres pg_dump -U postgres keycloak_db > keycloak_backup.sql

# Restore
docker exec -i dive-v3-postgres psql -U postgres keycloak_db < keycloak_backup.sql
```

---

## Conclusion

**Your Question**: "Why would Terraform not populate the user database in Postgres for Keycloak?"

**Answer**: 
1. ✅ Terraform DOES create users in PostgreSQL
2. ❌ Terraform Provider 5.5.0 bug: Attributes NOT saved
3. ✅ Database sessions work correctly
4. ❌ The `null_resource` workaround creates conflicts
5. ✅ Solution: Separate infrastructure (Terraform) from runtime data (application)

**Not a dumb question at all** - you identified a real architectural issue that needs fixing!

---

## References

- Keycloak Terraform Provider: https://github.com/mrparkers/terraform-provider-keycloak
- Known issues: https://github.com/mrparkers/terraform-provider-keycloak/issues
- Keycloak database schema: https://www.keycloak.org/docs/latest/server_development/#_database
- DIVE V3 workaround: `terraform/broker-realm-attribute-fix.tf`

