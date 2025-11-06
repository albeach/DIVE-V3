# AMR Claims Fix - Implementation Summary

## Status: ✅ COMPLETE - Committed (5e593b8)
## Date: November 6, 2025

## Problem
AMR (Authentication Methods Reference) claims were not appearing in tokens when users authenticate through IdP federation, causing:
- Frontend showing `amr = N/A`
- Backend rejecting tokens: "Invalid or expired JWT token, classification unknown"
- Users unable to access classified resources

## Root Cause
Session notes (`AUTH_METHODS_REF`, `AUTH_CONTEXT_CLASS_REF`) are realm-specific and don't transfer through OIDC federation. When users authenticate through national realms and federate to the broker realm:
1. National realm sets session notes → includes them in ID token as claims
2. Broker realm receives claims → IdP mapper stores them as user attributes
3. Broker realm's protocol mapper tried to read from session notes (which don't exist)
4. Result: Missing AMR/ACR in final tokens

## Solution Implemented
**Dual Protocol Mappers** in the broker realm - reads from BOTH sources:

### For ACR (Authentication Context Class Reference):
1. `broker_acr_attribute` - reads from user.attribute (for federated logins)
2. `broker_acr_session` - reads from session note (for direct logins)

### For AMR (Authentication Methods Reference):
1. `broker_amr_attribute` - reads from user.attribute (for federated logins)  
2. `broker_amr_session` - reads from session note (for direct logins)

## Changes Made

### 1. Terraform Configuration (`terraform/broker-realm.tf`)
- **Removed**: Single mappers `broker_acr` and `broker_amr`
- **Added**: Four new dual mappers with proper dependency ordering

### 2. Terraform State
- Applied new mappers successfully ✓
- Removed old mappers from state ✓

### 3. Documentation
- Created `docs/AMR-BROKER-FEDERATION-ISSUE.md` - Technical deep dive
- Created `scripts/test-amr-claims.sh` - Testing script
- Created `scripts/clear-keycloak-sessions.sh` - Session clearing utility

## Next Steps (Manual)

### 1. Restart Keycloak (if needed)
```bash
docker-compose restart keycloak
```

### 2. Clear User Sessions
Login to Keycloak Admin Console:
- URL: https://keycloak.dive-v3.mil/admin
- Realm: dive-v3-broker
- Navigate to: Sessions
- Click "Sign out all active sessions"

Or use script (when Keycloak is accessible):
```bash
./scripts/clear-keycloak-sessions.sh
```

### 3. Delete Old Mappers (Manual Cleanup)
Login to Keycloak Admin Console:
- Realm: dive-v3-broker
- Client: dive-v3-app
- Client Scopes tab → dive-v3-app-dedicated
- Mappers tab
- Delete if they exist:
  - `acr-mapper` (old single mapper)
  - `amr-mapper` (old single mapper)

### 4. Test the Fix

#### Test 1: Direct Login
```bash
# Login as super_admin directly to broker realm
curl -X POST https://keycloak.dive-v3.mil/realms/dive-v3-broker/protocol/openid-connect/token \
  -d "client_id=dive-v3-app" \
  -d "grant_type=password" \
  -d "username=super_admin" \
  -d "password=..." | jq -r '.id_token' | cut -d'.' -f2 | base64 -d | jq '.amr, .acr'
```
**Expected**: AMR and ACR claims present (from session notes)

#### Test 2: Federated Login
```bash
# Login through fra-realm-broker as testuser-fr
# 1. Open browser to https://dive-v3.mil
# 2. Click "France (Ministère des Armées)"
# 3. Login with testuser-fr / Password123!
# 4. Check token in DevTools or captured via API
```
**Expected**: AMR and ACR claims present (from user attributes)

#### Test 3: Backend API
```bash
# With token from either test above
curl -H "Authorization: Bearer $TOKEN" \
  https://api.dive-v3.mil/api/resources
```
**Expected**: No "classification unknown" error

### 5. Verify in Keycloak Admin UI

Check mapper configuration:
1. Login to Admin Console
2. Realm: dive-v3-broker
3. Clients → dive-v3-app
4. Client scopes → dive-v3-app-dedicated  
5. Mappers tab
6. Should see 4 mappers:
   - `acr-from-attribute` (oidc-usermodel-attribute-mapper)
   - `acr-from-session` (oidc-usersessionmodel-note-mapper)
   - `amr-from-attribute` (oidc-usermodel-attribute-mapper)
   - `amr-from-session` (oidc-usersessionmodel-note-mapper)

## Technical Details

### Mapper Application Order
Keycloak applies mappers sequentially. Our configuration:
1. Attribute mapper runs first
2. Session note mapper runs second (with `depends_on`)
3. If both set the same claim, session note overwrites

This ensures:
- Federated logins: Attribute mapper provides the value ✓
- Direct logins: Session note overwrites with fresh value ✓

### Why This Works
**Federated logins**:
- User authenticates in national realm
- National realm's authentication flow sets session notes
- National realm's protocol mapper reads session notes → adds to ID token as claims
- Broker realm receives ID token
- IdP broker mapper maps claims → user attributes
- Broker realm's attribute mapper reads user attributes → adds to final token ✓

**Direct logins**:
- User authenticates directly in broker realm
- Broker realm's authentication flow sets session notes
- Attribute mapper tries user.attribute (empty) → no claim added
- Session note mapper reads session notes → adds to final token ✓

## Files Changed
- `terraform/broker-realm.tf` - Added dual protocol mappers
- `docs/AMR-BROKER-FEDERATION-ISSUE.md` - Technical documentation
- `scripts/test-amr-claims.sh` - Testing utility
- `scripts/clear-keycloak-sessions.sh` - Session clearing utility
- `scripts/fix-amr-claims.sh` - Diagnostic utility

## Status
✅ Terraform changes applied  
## Testing Results

✅ **Terraform applied successfully** - All 4 new mappers created  
✅ **Frontend fix applied** - IdentityDrawer.tsx updated  
✅ **Browser testing completed** - France realm federated login  
✅ **AMR display verified** - Shows "pwd" instead of "N/A"  
✅ **Backend validation working** - AAL2 enforcement correctly denies SECRET docs with 1 factor  
✅ **Session token verified** - AMR claim present: `["pwd"]`

## Deployment

✅ **Changes committed** (git commit 5e593b8)  
✅ **Ubuntu deployment script verified** - Already handles Terraform apply  
✅ **No additional deployment logic needed** - Standard `terraform apply` will apply changes

## References
- Keycloak Docs: [Available User Session Data](https://www.keycloak.org/docs/latest/server_admin/index.html#available-user-session-data)
- Keycloak Docs: [Authentication Flows - AMR](https://www.keycloak.org/docs/latest/server_admin/index.html#_authentication-flows)
- RFC 8176: [Authentication Method Reference Values](https://www.rfc-editor.org/rfc/rfc8176.html)
- Git Commit: 5e593b8b8a7cbc9daa509742dfc475fedf8a33cb

