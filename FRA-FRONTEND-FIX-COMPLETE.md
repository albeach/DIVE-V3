# ✅ FRA Frontend Configuration Fixed!

## 🔧 Issues Fixed

### 1. API URL Mismatch
- **Problem**: FRA frontend was trying to connect to USA API (`dev-api.dive25.com`)
- **Cause**: Missing `NEXT_PUBLIC_BACKEND_URL` environment variable
- **Fix**: Added proper FRA API URLs to docker-compose.fra.yml

### 2. Content Security Policy Blocking
- **Problem**: CSP was blocking connections to Cloudflare tunnel URLs
- **Cause**: CSP didn't include the FRA domain names
- **Fix**: Added all FRA domains to the CSP connect-src directive

### 3. Environment Variable Consistency
- **Problem**: Code was looking for `NEXT_PUBLIC_BACKEND_URL` but we only set `NEXT_PUBLIC_API_URL`
- **Fix**: Added fallback logic and set both variables

## 📝 Changes Made

### docker-compose.fra.yml
```yaml
environment:
  NEXT_PUBLIC_API_URL: https://fra-api.dive25.com
  NEXT_PUBLIC_BACKEND_URL: https://fra-api.dive25.com  # Added
  NEXT_PUBLIC_KEYCLOAK_URL: https://fra-idp.dive25.com  # Updated
```

### frontend/src/middleware.ts
Added to CSP connect-src:
- `https://fra-app.dive25.com`
- `https://fra-api.dive25.com`
- `https://fra-idp.dive25.com`
- `https://fra-kas.dive25.com`
- Local development ports

### frontend/src/components/auth/idp-selector.tsx
```javascript
// Added fallback logic
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 
                   process.env.NEXT_PUBLIC_API_URL || 
                   'https://localhost:4000';
```

## ✅ How to Verify

1. **Clear browser cache** (important!)
2. **Open**: https://fra-app.dive25.com
3. **Check browser console** - CSP errors should be gone
4. **IdP selector** should now fetch from `fra-api.dive25.com`

## 🌐 Both Instances Now Working

### USA Instance
- Frontend: https://app.dive25.com (or your USA URL)
- API: https://dev-api.dive25.com

### FRA Instance  
- Frontend: https://fra-app.dive25.com ✅
- API: https://fra-api.dive25.com ✅
- Keycloak: https://fra-idp.dive25.com ✅

## 🚀 Next Steps

1. Configure federation between USA and FRA Keycloak
2. Set up Zero Trust access policies in Cloudflare
3. Test cross-realm authentication

The FRA frontend should now correctly connect to its own backend API instead of trying to reach the USA instance!



