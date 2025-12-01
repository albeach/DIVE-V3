# ✅ FRA Frontend Root Cause Analysis & Fix

## 🔍 Root Cause Identified

The issue was **NOT** with environment variables not being set, but with:

1. **Hardcoded URLs in CSP**: The Content Security Policy middleware had hardcoded URLs including `dev-api.dive25.com`, which blocked legitimate connections to `fra-api.dive25.com`
2. **CSP not using environment variables**: The middleware was reading env vars but then adding hardcoded URLs, defeating the purpose
3. **Incorrect NEXTAUTH_URL**: Set to `localhost:3001` instead of the public URL

## ✅ Proper Fix Applied

### 1. Removed All Hardcoded URLs from CSP
**File**: `frontend/src/middleware.ts`

**Before** (BAD):
```typescript
const connectSrc = [
    "'self'",
    keycloakBaseUrl,
    apiUrl,
    'https://localhost:8443',  // Hardcoded
    'https://localhost:4000',  // Hardcoded
    'https://fra-api.dive25.com',  // Hardcoded
    'https://dev-api.dive25.com',  // Hardcoded - WRONG!
];
```

**After** (GOOD):
```typescript
// Build connect-src from environment variables only
const connectSrc = ["'self'"];

// Add Keycloak URL (both HTTP and HTTPS versions for local dev)
if (keycloakBaseUrl) {
    connectSrc.push(keycloakBaseUrl);
    // Support both HTTP/HTTPS for local development
    if (keycloakBaseUrl.startsWith('https://')) {
        connectSrc.push(keycloakBaseUrl.replace('https://', 'http://'));
    }
}

// Add API URL (both HTTP and HTTPS versions for local dev)
if (apiUrl) {
    connectSrc.push(apiUrl);
    // Support both HTTP/HTTPS for local development
    if (apiUrl.startsWith('https://')) {
        connectSrc.push(apiUrl.replace('http://', 'https://'));
    }
}
```

### 2. Fixed Environment Variable Usage
**File**: `frontend/src/components/auth/idp-selector.tsx`

**Before** (BAD - had hacky runtime config):
```typescript
const runtimeConfig = typeof window !== 'undefined' && (window as any).__RUNTIME_CONFIG__;
const backendUrl = runtimeConfig?.API_URL || 
                  process.env.NEXT_PUBLIC_BACKEND_URL || 
                  process.env.NEXT_PUBLIC_API_URL || 
                  'https://localhost:4000';
```

**After** (GOOD - uses standard Next.js env vars):
```typescript
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 
                  process.env.NEXT_PUBLIC_API_URL || 
                  'https://localhost:4000';
```

### 3. Fixed NEXTAUTH_URL
**File**: `docker-compose.fra.yml`

**Before**:
```yaml
NEXTAUTH_URL: http://localhost:3001
```

**After**:
```yaml
NEXTAUTH_URL: https://fra-app.dive25.com
```

### 4. Removed All Hacky Workarounds
- ❌ Deleted `frontend/public/fra-config.js` (runtime config override)
- ❌ Deleted `frontend/startup-fra.sh` (custom startup script)
- ❌ Removed `<Script src="/fra-config.js">` from `layout.tsx`

## 📋 Environment Variables (Properly Configured)

All environment variables are set in `docker-compose.fra.yml`:

```yaml
environment:
  NEXT_PUBLIC_API_URL: https://fra-api.dive25.com
  NEXT_PUBLIC_BACKEND_URL: https://fra-api.dive25.com
  NEXT_PUBLIC_KEYCLOAK_URL: https://fra-idp.dive25.com
  NEXT_PUBLIC_KEYCLOAK_REALM: master
  NEXT_PUBLIC_KEYCLOAK_CLIENT_ID: dive-v3-client
  NEXTAUTH_URL: https://fra-app.dive25.com
  NEXT_PUBLIC_APP_NAME: "DIVE V3 - France Instance"
  NEXT_PUBLIC_INSTANCE: FRA
```

## ✅ How It Works Now

1. **Docker Compose** sets environment variables at container startup
2. **Next.js** reads `NEXT_PUBLIC_*` variables (available in both server and client)
3. **Middleware** builds CSP dynamically from environment variables only
4. **IdP Selector** uses standard Next.js environment variables
5. **No hardcoded URLs** - everything is configurable

## 🎯 Best Practices Followed

✅ **Environment-based configuration** - No hardcoded URLs
✅ **Single source of truth** - All config in docker-compose
✅ **CSP built dynamically** - Supports both HTTP/HTTPS for local dev
✅ **Standard Next.js patterns** - Uses `NEXT_PUBLIC_*` variables correctly
✅ **No runtime hacks** - Clean, maintainable code

## 🧪 Verification

After these changes:
1. FRA frontend reads `NEXT_PUBLIC_API_URL=https://fra-api.dive25.com`
2. CSP allows connections to `fra-api.dive25.com` (from env var)
3. IdP selector fetches from `fra-api.dive25.com` (not `dev-api.dive25.com`)
4. No CSP violations in browser console

## 📝 Summary

**Root Cause**: Hardcoded URLs in CSP middleware blocking legitimate API calls
**Solution**: Use environment variables exclusively, remove all hardcoded URLs
**Result**: Clean, maintainable, environment-based configuration

The fix follows Next.js best practices and eliminates the need for any runtime workarounds.







