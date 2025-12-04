# QUICK DEMO FIX - Use Existing Users

## ✅ SIMPLEST SOLUTION (2 minutes)

### Step 1: Use Existing Terraform Users

Terraform already creates users: `testuser-{instance}-{1-4}`

**Credentials:**
- Username: `testuser-usa-1`, `testuser-usa-2`, etc.
- Password: `TestUser2025!Pilot` (from terraform)
- OTP Code: `123456` (demo mode override)

### Step 2: Create Super Admin Manually (30 seconds)

```bash
# Login to Keycloak Admin Console
# http://localhost:8081/admin
# Username: admin
# Password: (your admin password)

# Create user: admin-usa
# Set password: Admin2025!SecurePassword
# Assign role: super_admin
```

### Step 3: Test Demo Mode

1. Login as `testuser-usa-2` (CONFIDENTIAL - requires OTP)
2. Password: `TestUser2025!Pilot`
3. OTP Code: `123456`
4. Should work if DEMO_MODE=true

## 🎯 YOUR MINIMUM REQUIREMENT

✅ **4 users per instance**: Use `testuser-{instance}-{1-4}` (already exist)
✅ **Super admin**: Create manually (2 min) OR use existing admin user
✅ **Predictable password**: `TestUser2025!Pilot`
✅ **OTP code 123456**: Implemented (test it!)

## ⚡ TEST NOW

```bash
# Test if demo mode works
curl -k -X POST https://localhost:8443/realms/dive-v3-broker/protocol/openid-connect/token \
  -d "grant_type=password" \
  -d "client_id=dive-v3-client" \
  -d "username=testuser-usa-2" \
  -d "password=TestUser2025!Pilot" \
  -d "totp=123456"
```

If this works → Demo mode is functional!
If it fails → Need to check Keycloak SPI compilation



