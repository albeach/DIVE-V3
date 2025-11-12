# DIVE V3 - Custom Domain JWT Issuer Fix Summary

## Date: November 6, 2025

## Issues Fixed

### 1. Flag Icon CORS Errors
- **Problem**: Flag icons loading from external CDNs caused CORS errors
- **Solution**: Removed external CDN dependencies, using native emoji rendering only
- **Files Changed**: `frontend/src/components/auth/idp-selector.tsx`

### 2. JWT Token Validation - Invalid Issuer
- **Root Cause**: Keycloak issues tokens with `iss: https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-broker` (based on KC_HOSTNAME), but services only accepted issuers like `https://keycloak:8443/realms/...` and `http://localhost:8081/realms/...`
- **Solution**: Added custom domain issuer to valid issuer lists in:
  - Backend API: `backend/src/middleware/authz.middleware.ts` (lines 347-413)
  - KAS Service: `kas/src/utils/jwt-validator.ts` (lines 226-235)
- **Impact**: All JWT tokens issued via the custom domain are now validated correctly

### 3. NextAuth Cookie Domain Configuration  
- **Problem**: Cookies were set without domain attribute, causing issues when accessing via custom subdomain
- **Solution**: Configured cookies with `domain: .divedeeper.internal` to work across all subdomains
- **Files Changed**: `frontend/src/auth.ts` (lines 168-186, 597-660)

### 4. OPA COI Logic Bug
- **Problem**: COI policy required users to have COI tags matching ALL countries in resource COI membership (e.g., EUCOM = 7 countries), which was incorrect
- **Solution**: Changed COI to be OPTIONAL - users without COI tags can access resources based on clearance + country releasability alone
- **Files Changed**: `policies/fuel_inventory_abac_policy.rego` (lines 597-659)
- **Behavior**:
  - Users WITH NO COI tags → Access based on clearance + country (COI ignored)
  - Users WITH COI tags → Must have matching COI tags if resource has COI requirements

## Valid JWT Issuers (After Fix)

All DIVE services now accept JWT tokens with these issuers:

### Broker Realm
- `https://keycloak:8443/realms/dive-v3-broker` (internal Docker)
- `http://localhost:8081/realms/dive-v3-broker` (external HTTP)
- `https://localhost:8443/realms/dive-v3-broker` (external HTTPS)
- `http://localhost:8080/realms/dive-v3-broker` (frontend container)
- **`https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-broker`** ← NEW

### Pilot Realm (Legacy)
- Similar pattern for `dive-v3-pilot`

### Individual IdP Realms
- Similar pattern for `dive-v3-usa`, `dive-v3-fra`, `dive-v3-can`, etc.

## Testing

Verified JWT token validation works end-to-end:
```bash
curl -k "https://kas.js.usa.divedeeper.internal:4000/api/resources/doc-generated-1762418554944-0389" \
  -H "Authorization: Bearer <token>"
```

**Result**: ✅ Access Granted (after clearance + country + COI checks)

## Services Restarted
- ✅ Backend API (dive-v3-backend)
- ✅ Frontend (dive-v3-frontend) 
- ✅ OPA Policy Engine (dive-v3-opa)
- ✅ KAS Service (dive-v3-kas)

## Next Steps

User should now be able to:
1. ✅ Access resources via `https://kas.js.usa.divedeeper.internal:3000/resources/*`
2. ✅ JWT tokens validated successfully
3. ✅ KAS decryption requests authenticated correctly
4. ✅ COI logic working as intended

## Notes

- This fix is required whenever accessing DIVE V3 via a custom domain instead of localhost
- The issue arose because KC_HOSTNAME is set to `kas.js.usa.divedeeper.internal` in Keycloak configuration
- All tokens issued by Keycloak will have this custom domain in their `iss` claim







