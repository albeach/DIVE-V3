# Custom Hostname Redirect URI Fix - Testing Guide

## Changes Implemented

The custom hostname redirect URI issue has been **completely fixed** by splitting Terraform's `keycloak_url` variable into two distinct variables:

### 1. `keycloak_url` (Admin API Connection)
- **Purpose**: Terraform provider connection to Keycloak Admin API
- **Value**: Always `https://localhost:8443`
- **Reason**: Terraform runs on host machine with Docker port-forwarding

### 2. `keycloak_public_url` (Client-Facing URLs) ✨ NEW
- **Purpose**: Browser and client access to Keycloak
- **Value**: `https://${CUSTOM_HOSTNAME}:8443` when custom hostname configured
- **Used For**: 
  - IdP broker authorization/token/logout URLs
  - National realm client redirect URIs
  - All browser-facing endpoints

## Files Changed

### Terraform Configuration (14 files)
- ✅ `terraform/variables.tf` - Added `keycloak_public_url` variable
- ✅ `terraform/main.tf` - Split locals into admin vs public URLs
- ✅ `terraform/*-realm.tf` - Updated 11 realm redirect URIs to use public URL
- ✅ `terraform/modules/realm-direct-grant-client/main.tf` - Updated module

### Deployment Script
- ✅ `scripts/deploy-ubuntu.sh` - Pass `keycloak_public_url` to Terraform

## What Was Fixed

### Before (Broken)
```
User clicks IdP → Redirected to localhost:8443 → DNS fails
Keycloak DB: redirect_uri = https://localhost:8443/realms/...
IdP broker:   authorization_url = https://localhost:8443/realms/...
Result: ❌ "Invalid redirect URI" or ERR_NAME_NOT_RESOLVED
```

### After (Fixed)
```
User clicks IdP → Redirected to custom hostname → DNS resolves ✅
Keycloak DB: redirect_uri = https://kas.js.usa.divedeeper.internal:8443/realms/...
IdP broker:   authorization_url = https://kas.js.usa.divedeeper.internal:8443/realms/...
Result: ✅ Authentication flow completes successfully
```

## Testing Instructions

### On Your Remote Server

1. **Pull the Latest Changes**:
   ```bash
   cd /path/to/DIVE-V3/DIVE-V3
   ./scripts/safe-git-pull.sh
   ```

2. **Stop Current Deployment** (if running):
   ```bash
   docker compose down
   ```

3. **Re-run Deployment with Custom Hostname**:
   ```bash
   ./scripts/deploy-ubuntu.sh
   ```

4. **When Prompted**:
   - Choose option `2` for custom hostname
   - Enter your hostname (e.g., `kas.js.usa.divedeeper.internal`)
   - Choose seed quantity
   - **IMPORTANT**: Configure CLIENT DNS when prompted

5. **Wait for Completion**:
   - Phase 9 (Terraform) will now pass `keycloak_public_url` with your custom hostname
   - All redirect URIs will be stored with custom hostname
   - Services will restart with new configuration

### On Your Client Machine (Laptop/Desktop)

**Critical**: Add DNS entry as shown during deployment:

```bash
# Linux/Mac:
echo "SERVER_IP kas.js.usa.divedeeper.internal" | sudo tee -a /etc/hosts

# Windows (as Administrator):
echo SERVER_IP kas.js.usa.divedeeper.internal >> C:\Windows\System32\drivers\etc\hosts
```

Replace `SERVER_IP` with your actual server IP (shown during deployment).

### Verification Steps

#### 1. Check Terraform Applied Correctly

```bash
cd terraform
terraform show | grep -A 5 "authorization_url"
```

**Expected Output**:
```
authorization_url = "https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-usa/protocol/openid-connect/auth"
```

**Not**:
```
authorization_url = "https://localhost:8443/realms/..."  # ❌ Old broken state
```

#### 2. Check Keycloak Database

```bash
docker compose exec -T postgres psql -U postgres keycloak_db -c \
  "SELECT alias, authorization_url FROM identity_provider WHERE alias = 'usa-realm-broker';"
```

**Expected**:
```
       alias        |                            authorization_url                            
--------------------+------------------------------------------------------------------------
 usa-realm-broker   | https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-usa/protocol/openid-connect/auth
```

#### 3. Check National Realm Redirect URIs

```bash
docker compose exec -T postgres psql -U postgres keycloak_db -c \
  "SELECT c.client_id, ru.value FROM client c 
   JOIN redirect_uris ru ON c.id = ru.client_id 
   WHERE c.client_id = 'dive-v3-client' 
   AND c.realm_id = (SELECT id FROM realm WHERE name = 'dive-v3-usa');"
```

**Expected**:
```
   client_id    |                                   value                                    
----------------+---------------------------------------------------------------------------
 dive-v3-client | https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-broker/broker/usa-realm-broker/endpoint
```

#### 4. Test IdP Login Flow

1. Open browser: `https://kas.js.usa.divedeeper.internal:3000`
2. Click "United States (DoD)" IdP
3. **Watch the URL bar** - should redirect to:
   ```
   https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-broker/protocol/openid-connect/auth?...&kc_idp_hint=usa-realm-broker
   ```
   Then automatically to:
   ```
   https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-usa/protocol/openid-connect/auth?...
   ```

4. Login credentials:
   - Username: `testuser-usa-secret`
   - Password: `Password123!`
   - OTP: Set up with authenticator app (first login)

5. Complete authentication
6. Should redirect back to: `https://kas.js.usa.divedeeper.internal:3000/dashboard`

#### 5. Verify No Localhost References

```bash
# Check Keycloak Admin Console
docker compose logs keycloak | grep -i "localhost:8443" | grep -v "provider\|admin"
```

Should show **no localhost references** in redirect/authorization URLs.

## Troubleshooting

### Issue: Still seeing localhost in Keycloak

**Cause**: Old Keycloak database from previous deployment  
**Fix**: 
```bash
docker compose down -v  # Clear volumes
./scripts/deploy-ubuntu.sh  # Re-deploy
```

### Issue: Terraform fails with "keycloak_public_url not found"

**Cause**: Terraform state out of sync  
**Fix**:
```bash
cd terraform
rm -rf .terraform.lock.hcl terraform.tfstate*
terraform init
cd ..
./scripts/deploy-ubuntu.sh
```

### Issue: IdP redirect still goes to localhost

**Cause**: Browser cached old Keycloak URLs  
**Fix**:
1. Clear browser cache (Ctrl+Shift+Del)
2. Close all browser tabs
3. Re-open browser
4. Try login again

### Issue: "Invalid redirect URI" still appearing

**Cause**: Mismatch between Terraform state and Keycloak database  
**Fix**:
```bash
# Re-apply Terraform only
cd terraform
terraform apply -auto-approve \
  -var="keycloak_url=https://localhost:8443" \
  -var="keycloak_public_url=https://YOUR_HOSTNAME:8443" \
  -var="app_url=https://YOUR_HOSTNAME:3000" \
  -var="backend_url=https://YOUR_HOSTNAME:4000"
cd ..
docker compose restart
```

## Expected Results

After successful fix:

✅ **Landing Page**: Loads at custom hostname  
✅ **IdP Selection**: All IdPs visible and clickable  
✅ **IdP Redirect**: Goes to custom hostname, not localhost  
✅ **Authentication**: Completes successfully  
✅ **Dashboard**: Loads at custom hostname  
✅ **Logout**: Works correctly  
✅ **Re-login**: No auto-login issues  

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Terraform Variables (Separated)                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  keycloak_url = "https://localhost:8443"                         │
│  └─> Used ONLY for: provider "keycloak" (admin API)              │
│      Terraform (host) → Docker port forward → Keycloak           │
│                                                                   │
│  keycloak_public_url = "https://kas.js.usa.divedeeper.int:8443" │
│  └─> Used for:                                                   │
│      - IdP broker authorization_url                              │
│      - IdP broker token_url                                      │
│      - IdP broker logout_url                                     │
│      - National realm redirect_uris                              │
│      - All browser-facing URLs                                   │
│      Browser → DNS → Server IP → Keycloak                        │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Success Criteria

- [ ] Terraform applies without errors
- [ ] Keycloak database shows custom hostname in redirect URIs
- [ ] IdP broker URLs use custom hostname
- [ ] Browser redirects to custom hostname during auth
- [ ] Authentication flow completes successfully
- [ ] Dashboard loads after login
- [ ] No "Invalid redirect URI" errors
- [ ] No "ERR_NAME_NOT_RESOLVED" errors

## Support

If issues persist after following this guide:

1. Check `docs/CUSTOM-HOSTNAME-REDIRECT-URI-DEBUG.md` for comprehensive analysis
2. Run diagnostics: `./scripts/diagnose-custom-hostname.sh`
3. Check Keycloak logs: `docker compose logs keycloak | tail -100`
4. Verify DNS: `ping kas.js.usa.divedeeper.internal`

## Related Documentation

- `docs/CUSTOM-HOSTNAME-DNS-FIX.md` - DNS configuration guide
- `docs/CUSTOM-HOSTNAME-REDIRECT-URI-DEBUG.md` - Root cause analysis
- `scripts/diagnose-custom-hostname.sh` - Diagnostic tool

---

**Last Updated**: November 6, 2025  
**Fix Version**: DIVE V3 v2.0.0 (Post-custom-hostname-fix)

