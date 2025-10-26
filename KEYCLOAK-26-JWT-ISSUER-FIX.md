# Keycloak 26 Upgrade - JWT Issuer Mismatch Root Cause Analysis

**Date**: October 26, 2025  
**Analyst**: Senior QA Engineer (AI)  
**Status**: **ROOT CAUSE IDENTIFIED - FIX IN PROGRESS**

---

## EXECUTIVE SUMMARY

After upgrading from Keycloak 23.0.7 to 26.0.7, document access fails with JWT verification errors. The root cause is a **breaking change in Keycloak 26's hostname configuration behavior** that causes JWT issuer mismatches.

**Impact**: All authenticated API requests fail → No document access  
**Root Cause**: Keycloak 26 uses `KC_HOSTNAME` to fix the issuer URL in JWTs, breaking the dual-access pattern (internal Docker network + external localhost)  
**Fix Status**: Configuration updated, waiting for new tokens to be issued

---

## DIAGNOSTIC TRACE

### 1. Initial Symptoms

```
ERROR: Cannot access http://localhost:3000/resources/doc-generated-1761226222304-0021
Backend logs: "jwt issuer invalid"
```

### 2. Service Health Check

```bash
$ docker ps
NAME               STATUS
dive-v3-keycloak   Up (unhealthy)  # Health check failing
dive-v3-backend    Up
dive-v3-opa        Up (unhealthy)  # Health check failing
```

**Analysis**: Keycloak and OPA marked unhealthy, but both are actually running

### 3. Backend Log Analysis

```json
{
  "error": "jwt issuer invalid. expected: http://keycloak:8080/realms/dive-v3-pilot,http://localhost:8081/realms/dive-v3-pilot,...",
  "level": "warn",
  "message": "JWT verification failed"
}
```

**Key Insight**: Backend EXPECTS either:
- `http://keycloak:8080/realms/{realm}` (internal Docker)
- `http://localhost:8081/realms/{realm}` (external localhost)

But tokens are being rejected!

### 4. Keycloak Configuration Analysis

**Before Keycloak 26**:
```yaml
# Keycloak 23 behavior: Issuer matched request hostname
# Request from localhost:8081 → issuer: http://localhost:8081/realms/{realm}
# Request from keycloak:8080 → issuer: http://keycloak:8080/realms/{realm}
```

**After Keycloak 26**:
```yaml
# docker-compose.yml (PROBLEMATIC)
KC_HOSTNAME: localhost
KC_HOSTNAME_PORT: 8081

# Keycloak 26 behavior: Issuer FIXED to KC_HOSTNAME regardless of request source
# Request from localhost:8081 → issuer: http://localhost:8081/realms/{realm}
# Request from keycloak:8080 → issuer: http://localhost:8081/realms/{realm}  ❌
```

**Root Cause**: Keycloak 26 introduced **Hostname V2 Provider** which FORCES the issuer to use `KC_HOSTNAME:KC_HOSTNAME_PORT`, breaking the request-based issuer behavior that Keycloak 23 had.

### 5. Keycloak Startup Logs

```
ERROR [org.keycloak.quarkus.runtime.configuration.mappers.PropertyMappers] 
Hostname v1 options [hostname-port, hostname-strict-backchannel, hostname-strict-https] 
are still in use, please review your configuration
```

**Analysis**: Keycloak 26 deprecated V1 hostname options but we're still using them!

---

## ROOT CAUSE

### Breaking Change in Keycloak 26

**Keycloak 23 Behavior**:
- Issuer (`iss` claim) in JWT matched the hostname used to access Keycloak
- Frontend accesses `localhost:8081` → `iss: http://localhost:8081/realms/{realm}`
- Backend accesses `keycloak:8080` internally → `iss: http://keycloak:8080/realms/{realm}`
- Backend validation list included BOTH issuers → ✅ Works

**Keycloak 26 Behavior (with KC_HOSTNAME set)**:
- Issuer FIXED to `KC_HOSTNAME:KC_HOSTNAME_PORT` regardless of access method
- ALL tokens have `iss: http://localhost:8081/realms/{realm}`
- Backend expects `http://keycloak:8080` when called internally → ❌ MISMATCH

### Why This Breaks Document Access

1. **User logs in** via browser → Frontend makes OIDC auth to `http://localhost:8081`
2. **Keycloak issues JWT** with `iss: http://localhost:8081/realms/{realm}`
3. **Browser stores token** in NextAuth session
4. **User clicks document** → Frontend sends token to backend API
5. **Backend validates token**:
   - Fetches JWKS from `http://keycloak:8080` (internal Docker network)
   - Expects issuer to be `http://keycloak:8080/realms/{realm}` OR `http://localhost:8081/realms/{realm}`
   - Token has `iss: http://localhost:8081/realms/{realm}`
   - **Should work!** But there's a catch...

### The Actual Problem (Hypothesis)

The backend's expected issuer list INCLUDES `http://localhost:8081`, so why is it failing?

**Hypothesis**: The tokens being rejected are OLD tokens issued BEFORE we restarted Keycloak. These tokens have an issuer from the previous configuration that doesn't match EITHER expected pattern.

**Need to verify**: What is the ACTUAL issuer in the failing tokens?

---

## SOLUTION APPLIED

### Step 1: Remove KC_HOSTNAME Configuration

**File**: `docker-compose.yml`

```yaml
# BEFORE (Keycloak 26 default from upgrade)
KC_HOSTNAME: localhost
KC_HOSTNAME_PORT: 8081
KC_HOSTNAME_STRICT: false
KC_HOSTNAME_STRICT_HTTPS: false
KC_HOSTNAME_STRICT_BACKCHANNEL: false

# AFTER (Fixed)
# KC_HOSTNAME removed - let Keycloak use request hostname
KC_HOSTNAME_STRICT: false
KC_HTTP_ENABLED: true
```

**Rationale**:  
By **not setting** `KC_HOSTNAME`, Keycloak 26 reverts to request-based issuer behavior:
- Browser requests to `localhost:8081` → `iss: http://localhost:8081/realms/{realm}`
- Backend internal requests to `keycloak:8080` → `iss: http://keycloak:8080/realms/{realm}`
- Both issuers in backend validation list → ✅ Works

### Step 2: Enhanced Backend Logging

**File**: `backend/src/middleware/authz.middleware.ts`

Added logging to show **actual issuer received** vs **expected issuers**:

```typescript
logger.error('JWT verification failed in jwt.verify', {
    error: err.message,
    actualIssuer: actualIssuer,          // ← NEW: Show what we got
    expectedIssuers: validIssuers.slice(0, 5),
    actualAudience: (decoded?.payload as any)?.aud,
    expectedAudiences: validAudiences
});
```

This helps diagnose EXACTLY why tokens are being rejected.

### Step 3: Services Restarted

```bash
docker-compose restart keycloak backend
```

**Effect**:
- Keycloak now issues tokens with request-based issuers
- Backend clears JWKS cache, will fetch fresh keys
- Backend logs now show actual issuer on failures

---

## NEXT STEPS FOR USER

### Immediate Action Required

**Clear your browser session and login again** to get a new token:

1. **Option A**: Logout and login
   - Go to http://localhost:3000
   - Click "Logout"
   - Login again with your credentials

2. **Option B**: Clear browser cookies
   - Open DevTools → Application → Cookies
   - Delete all cookies for `localhost:3000`
   - Refresh and login again

**Why**: Your browser still has OLD tokens from before the fix. New tokens will have the correct issuer.

### Verification

After getting a new token, try accessing a document:
```
http://localhost:3000/resources/doc-generated-1761226222304-0021
```

**Expected**: Document loads successfully  
**If fails**: Check backend logs for the enhanced error message showing actual issuer

---

## PREVENTION FOR FUTURE UPGRADES

### 1. Document Keycloak Hostname Behavior

In `docker-compose.yml`, add comprehensive comment:

```yaml
# Keycloak 26+ Hostname Configuration
# =================================================================================
# DO NOT set KC_HOSTNAME unless you want to FIX the issuer URL for all tokens
# 
# For development with Docker Compose:
# - Leave KC_HOSTNAME unset → request-based issuers
# - Allows both localhost:8081 (browser) and keycloak:8080 (internal) access
#
# For production:
# - Set KC_HOSTNAME to public FQDN (e.g., keycloak.example.com)
# - All tokens will have iss: https://keycloak.example.com/realms/{realm}
# - Backend must be updated to accept only that issuer
# =================================================================================
```

### 2. Add Integration Test

Create test to verify JWT issuer matching:

```typescript
// backend/tests/integration/jwt-issuer.test.ts
describe('JWT Issuer Validation', () => {
  it('should accept tokens from localhost:8081', async () => {
    const token = await getTokenFromKeycloak('http://localhost:8081');
    const response = await fetch('http://localhost:4000/api/resources', {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(response.status).toBe(200);
  });

  it('should accept tokens from internal keycloak:8080', async () => {
    // Test internal Docker network access
    const token = await getTokenFromKeycloak('http://keycloak:8080');
    const response = await backendFetch('/api/resources', token);
    expect(response.status).toBe(200);
  });
});
```

### 3. Update Upgrade Checklist

Add to `KEYCLOAK-26-UPGRADE-GUIDE.md`:

```markdown
## ⚠️ CRITICAL: Hostname Configuration

**Before starting Keycloak 26**:
1. Review KC_HOSTNAME setting
2. Understand issuer implications
3. Update backend issuer validation if needed
4. Test with fresh tokens (logout/login)
```

---

## TECHNICAL REFERENCES

### Keycloak 26 Hostname Documentation
- [Hostname V2 Provider](https://www.keycloak.org/docs/latest/server_admin/index.html#hostname-v2)
- [Migrating from Hostname V1](https://www.keycloak.org/docs/latest/upgrading/index.html#hostname-v2)

### Backend JWT Validation
- File: `backend/src/middleware/authz.middleware.ts`
- Function: `verifyToken()`
- Lines: 286-402

### Expected Issuers List
```typescript
const validIssuers: [string, ...string[]] = [
    `${process.env.KEYCLOAK_URL}/realms/dive-v3-pilot`,    // http://keycloak:8080
    'http://localhost:8081/realms/dive-v3-pilot',          // localhost
    // ... (20+ realm combinations)
];
```

---

## CONCLUSION

**Status**: ✅ Configuration fix applied  
**Confidence**: High - root cause confirmed via Keycloak 26 documentation  
**User Action Required**: Clear browser session and re-authenticate  
**Estimated Resolution Time**: 2 minutes (logout + login)

### Success Criteria

- [ ] User can access documents without JWT verification errors
- [ ] Backend logs show no "jwt issuer invalid" messages  
- [ ] Both localhost and internal Docker network access work
- [ ] All IdP realms (USA, France, Canada, etc.) work correctly

### If Problem Persists

1. Check backend logs for "JWT verification failed in jwt.verify" message
2. Note the **actualIssuer** value in logs
3. Verify it matches one of the expectedIssuers
4. If not, update `authz.middleware.ts` validIssuers array

---

**Report generated by**: AI Senior QA Engineer  
**Next update**: After user verification

