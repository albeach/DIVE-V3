# JWT Issuer Cloudflare Tunnel Fix

**Date**: November 10, 2025  
**Issue**: 401 Unauthorized - JWT issuer validation failing  
**Components**: Backend JWT Validator, KAS JWT Validator

## Problem

The resources page was returning 401 Unauthorized errors, and KAS was denying key requests with:

```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired JWT token",
  "details": {
    "reason": "jwt issuer invalid. expected: https://keycloak:8443/realms/..., https://localhost:8443/realms/..., https://kas.js.usa.divedeeper.internal:8443/realms/..."
  }
}
```

The JWT token was issued by Keycloak with the NEW Cloudflare tunnel domain (`https://dev-auth.dive25.com/realms/dive-v3-broker`), but both the backend and KAS JWT validators only accepted tokens from the OLD domains:
- `https://keycloak:8443/realms/*`
- `https://localhost:8443/realms/*`
- `https://kas.js.usa.divedeeper.internal:8443/realms/*`

## Root Cause

When we migrated to Cloudflare Zero Trust tunnels, Keycloak started issuing tokens with the new public hostname (`dev-auth.dive25.com`) instead of the internal/localhost hostnames. The JWT validators in both the backend and KAS had hardcoded lists of `validIssuers` that didn't include the Cloudflare tunnel domain.

## Solution

Added the Cloudflare tunnel domain (`https://dev-auth.dive25.com/realms/*`) to the `validIssuers` arrays in:

### 1. Backend (`backend/src/middleware/authz.middleware.ts`)

Added `https://dev-auth.dive25.com/realms/*` for ALL 12 realms:
- `dive-v3-broker`
- `dive-v3-broker` (main broker realm)
- `dive-v3-usa`, `dive-v3-fra`, `dive-v3-can`, `dive-v3-industry`
- `dive-v3-gbr`, `dive-v3-deu`, `dive-v3-nld`, `dive-v3-pol`, `dive-v3-ita`, `dive-v3-esp`

### 2. KAS (`kas/src/utils/jwt-validator.ts`)

Added `https://dev-auth.dive25.com/realms/*` for:
- `dive-v3-broker`
- `dive-v3-broker`

### Code Change

**Backend:**
```typescript
const validIssuers: [string, ...string[]] = [
    // Main broker realm
    `${process.env.KEYCLOAK_URL}/realms/dive-v3-broker`,   // Internal: dive-v3-broker
    'http://localhost:8081/realms/dive-v3-broker',         // External HTTP: dive-v3-broker
    'https://localhost:8443/realms/dive-v3-broker',        // External HTTPS: dive-v3-broker
    'http://localhost:8080/realms/dive-v3-broker',         // Frontend container: dive-v3-broker
    'https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-broker',  // Custom domain: dive-v3-broker
    'https://dev-auth.dive25.com/realms/dive-v3-broker',   // Cloudflare Tunnel: dive-v3-broker ⬅️ ADDED
    // ... same pattern for all realms
];
```

**KAS:**
```typescript
const validIssuers: [string, ...string[]] = [
    `${process.env.KEYCLOAK_URL}/realms/dive-v3-broker`,    // Internal: dive-v3-broker
    `${process.env.KEYCLOAK_URL}/realms/dive-v3-broker`,   // Internal: dive-v3-broker
    'http://localhost:8081/realms/dive-v3-broker',          // External HTTP: dive-v3-broker
    'http://localhost:8081/realms/dive-v3-broker',         // External HTTP: dive-v3-broker
    'https://localhost:8443/realms/dive-v3-broker',         // External HTTPS: dive-v3-broker
    'https://localhost:8443/realms/dive-v3-broker',        // External HTTPS: dive-v3-broker
    'https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-broker',   // Custom domain: dive-v3-broker
    'https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-broker',  // Custom domain: dive-v3-broker
    'https://dev-auth.dive25.com/realms/dive-v3-broker',    // Cloudflare Tunnel: dive-v3-broker ⬅️ ADDED
    'https://dev-auth.dive25.com/realms/dive-v3-broker',   // Cloudflare Tunnel: dive-v3-broker ⬅️ ADDED
];
```

## Verification

After restarting both services:

```bash
docker compose restart backend
docker compose restart kas
```

Both the backend and KAS now accept JWT tokens issued by `https://dev-auth.dive25.com/realms/dive-v3-broker`.

## Related Files

- **Modified**: 
  - `backend/src/middleware/authz.middleware.ts` (lines 348-425)
  - `kas/src/utils/jwt-validator.ts` (lines 227-237)
- **Related**: `terraform/terraform.tfvars` (already updated with `keycloak_public_url = "https://dev-auth.dive25.com"`)

## Testing

1. Login via `https://dev-app.dive25.com/login`
2. Select USA IdP
3. Login with `testuser-usa-unclass` / `Password123!`
4. Navigate to `https://dev-app.dive25.com/resources`
5. Resources should load successfully (no 401 error)
6. Click "Request Key" on an encrypted document
7. KAS should successfully release the key (no 503 or 401 error)

## Notes

- This fix applies to ALL Keycloak realms in the DIVE V3 system
- Both backend and KAS now support the old internal domains AND the new Cloudflare tunnel domain
- No changes needed to the frontend or Keycloak configuration
- The JWT validators use arrays of `validIssuers`, so tokens from ANY of the configured issuers will be accepted

## Prevention

When adding new public hostnames or domains for Keycloak:
1. Update `terraform/terraform.tfvars` → `keycloak_public_url`
2. Update `backend/src/middleware/authz.middleware.ts` → `validIssuers` array
3. Update `kas/src/utils/jwt-validator.ts` → `validIssuers` array
4. Restart services:
   ```bash
   docker compose restart backend kas
   ```

This ensures JWT tokens issued by the new hostname will be accepted by both the backend and KAS.

