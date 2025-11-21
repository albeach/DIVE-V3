# DIVE V3 - Authentication Flow Fix

## Issue Summary

After deploying DIVE V3 using the `deploy-ubuntu.sh` script with a custom hostname, users can log in to a realm and complete MFA, but are then redirected to a "we are sorry - invalid username or password" error page.

## Root Causes

### 1. Authentication Flow Misconfiguration

**Error:**
```
REQUIRED and ALTERNATIVE elements at same level! Those alternative executions will be ignored: [idp-create-user-if-unique]
Cannot find user for obtaining particular user attributes. Authenticator: conditional-user-attribute
```

**Problem:** The first broker login flow has `idp-create-user-if-unique` set to `ALTERNATIVE` instead of `REQUIRED`, causing:
- Mixed REQUIRED/ALTERNATIVE elements at same level (invalid Keycloak flow structure)
- Conditional-user-attribute authenticator tries to check attributes BEFORE user is created
- User creation is skipped, leading to "invalid credentials" error

**Fix:** Change `requirement = "ALTERNATIVE"` to `requirement = "REQUIRED"` in `terraform/modules/realm-mfa/post-broker-flow.tf` (line 35)

### 2. Database Initialization Issue

**Error:**
```
ERROR:  relation "migration_model" does not exist
ERROR:  relation "public.databasechangeloglock" does not exist
```

**Problem:** Keycloak container started before PostgreSQL was fully ready, preventing proper database schema initialization.

**Fix:** Recreate Keycloak database and restart container to trigger proper schema initialization.

## Quick Fix (For Remote Deployment)

If you're working on the deployment machine with the issue:

### Step 1: Pull Latest Code

```bash
cd /path/to/DIVE-V3
git pull origin main
```

### Step 2: Fix Database Initialization

```bash
./scripts/fix-keycloak-db-init.sh
```

This script will:
1. Stop Keycloak
2. Recreate the Keycloak database
3. Restart Keycloak with proper schema initialization
4. Verify database tables exist

### Step 3: Reapply Terraform (with Fixed Flow)

```bash
cd terraform

# Get your custom hostname
read -p "Enter your custom hostname (e.g., divedeeper.internal): " HOSTNAME

# Apply with custom hostname
terraform apply -auto-approve \
  -var="keycloak_admin_username=admin" \
  -var="keycloak_admin_password=admin" \
  -var="keycloak_url=https://${HOSTNAME}:8443" \
  -var="app_url=https://${HOSTNAME}:3000" \
  -var="backend_url=https://${HOSTNAME}:4000"
```

### Step 4: Restart Application Services

```bash
cd ..
docker compose restart backend nextjs
```

### Step 5: Test Authentication

```bash
# Open in browser
https://your-hostname:3000

# Test with user
Username: testuser-usa-unclass
Password: Password123!
```

## Manual Fix (Alternative Method)

If the automated script doesn't work, you can manually fix it:

### 1. Stop and Clean Keycloak

```bash
docker compose stop keycloak
docker compose exec postgres psql -U postgres -c "DROP DATABASE IF EXISTS keycloak;"
docker compose exec postgres psql -U postgres -c "CREATE DATABASE keycloak OWNER postgres;"
```

### 2. Restart Keycloak

```bash
docker compose start keycloak

# Wait for initialization (1-2 minutes)
docker compose logs -f keycloak
# Look for: "Keycloak ... started in ..."
```

### 3. Verify Database Schema

```bash
docker compose exec postgres psql -U postgres -d keycloak -c "\dt migration_model"
docker compose exec postgres psql -U postgres -d keycloak -c "\dt databasechangeloglock"
```

Both tables should exist.

### 4. Reapply Terraform

```bash
cd terraform
terraform apply -auto-approve \
  -var="keycloak_admin_username=admin" \
  -var="keycloak_admin_password=admin" \
  -var="keycloak_url=https://your-hostname:8443" \
  -var="app_url=https://your-hostname:3000" \
  -var="backend_url=https://your-hostname:4000"
```

## Verification

After applying the fixes, verify everything works:

### 1. Check Authentication Flow Configuration

```bash
# Login to Keycloak admin console
https://your-hostname:8443/admin

# Navigate to:
# Realm: dive-v3-broker
# → Authentication
# → Flows
# → "Post Broker MFA - DIVE V3 Broker"

# Verify structure:
# ├─ Review Profile [DISABLED]
# ├─ Create User [REQUIRED] ← Should be REQUIRED, not ALTERNATIVE
# └─ Conditional OTP [CONDITIONAL]
```

### 2. Check Keycloak Logs

```bash
# Should NOT see these errors:
docker compose logs keycloak | grep "REQUIRED and ALTERNATIVE elements at same level"
docker compose logs keycloak | grep "Cannot find user for obtaining particular user attributes"
docker compose logs keycloak | grep "migration_model does not exist"
```

### 3. Test User Login

```bash
# Open frontend
https://your-hostname:3000

# Click "Sign In"
# Select "United States (DoD)"
# Login with:
#   Username: testuser-usa-unclass
#   Password: Password123!
# Complete MFA if prompted
# Should land on dashboard, NOT error page
```

## Technical Details

### Why ALTERNATIVE Doesn't Work

In Keycloak authentication flows:
- **REQUIRED** = Step must execute and succeed
- **ALTERNATIVE** = One of multiple alternatives must succeed
- **CONDITIONAL** = Execute based on condition

Having ALTERNATIVE at the same level as REQUIRED creates ambiguity:
```
Flow
├─ Review Profile [DISABLED]
├─ Create User [ALTERNATIVE]  ← Mixed with REQUIRED below = ERROR
└─ Conditional OTP [REQUIRED]
```

Correct structure:
```
Flow
├─ Review Profile [DISABLED]
├─ Create User [REQUIRED]  ← Must execute
└─ Conditional OTP [CONDITIONAL]
```

### Why Conditional Authenticator Fails

The `conditional-user-attribute` authenticator checks user attributes:
```java
UserModel user = context.getUser();
if (user == null) {
    throw new AuthenticationFlowException("Cannot find user");
}
```

If `idp-create-user-if-unique` is ALTERNATIVE and skipped, user is never created, causing:
1. `context.getUser()` returns `null`
2. Exception thrown
3. Authentication fails with "invalid_user_credentials"

### Database Initialization Race Condition

Keycloak uses Liquibase for database migrations. On first startup:
1. Keycloak connects to PostgreSQL
2. Looks for `migration_model` table
3. If missing, creates schema via Liquibase

If PostgreSQL is not fully ready when Keycloak starts:
- Initial connection succeeds
- But database is not ready to create tables
- Keycloak fails to initialize schema
- Subsequent starts fail because schema is incomplete

Solution: Recreate database after PostgreSQL is fully ready.

## Files Changed

- `terraform/modules/realm-mfa/post-broker-flow.tf` (line 35)
  - Changed: `requirement = "ALTERNATIVE"` → `requirement = "REQUIRED"`
  
- `scripts/fix-keycloak-db-init.sh` (new file)
  - Automated fix for database initialization

## Prevention

To prevent this issue in future deployments:

1. **Database Initialization:** Ensure PostgreSQL is fully ready before starting Keycloak:
   ```bash
   docker compose up -d postgres
   sleep 10  # Wait for PostgreSQL
   docker compose up -d keycloak
   ```

2. **Terraform Validation:** Add validation to prevent ALTERNATIVE/REQUIRED mixing:
   ```terraform
   # In post-broker-flow.tf
   lifecycle {
     postcondition {
       condition     = self.requirement == "REQUIRED"
       error_message = "idp-create-user-if-unique MUST be REQUIRED"
     }
   }
   ```

3. **Automated Testing:** Add authentication flow tests:
   ```bash
   ./scripts/test-keycloak-auth.sh broker
   ```

## References

- [Keycloak Authentication Flows](https://www.keycloak.org/docs/latest/server_admin/#_authentication-flows)
- [Keycloak Identity Brokering](https://www.keycloak.org/docs/latest/server_admin/#_identity_broker)
- [DIVE V3 Deployment Guide](KEYCLOAK-V2-NATIVE-REFACTORING-SSOT.md)
- [Terraform Keycloak Provider](https://registry.terraform.io/providers/mrparkers/keycloak/latest/docs)

## Support

If issues persist:

1. Collect logs:
   ```bash
   docker compose logs keycloak > keycloak-logs.txt
   docker compose logs postgres > postgres-logs.txt
   ```

2. Check Terraform state:
   ```bash
   cd terraform
   terraform state list | grep post_broker
   terraform state show 'module.broker_mfa.keycloak_authentication_execution.post_broker_create_user'
   ```

3. Review authentication flow in Keycloak admin console:
   ```
   https://your-hostname:8443/admin
   → Realm: dive-v3-broker
   → Authentication → Flows
   ```

## Changelog

- **2025-11-05**: Fixed authentication flow ALTERNATIVE/REQUIRED conflict
- **2025-11-05**: Added database initialization fix script
- **2025-11-05**: Documented root causes and solutions





