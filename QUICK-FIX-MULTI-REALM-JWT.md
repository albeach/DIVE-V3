# 🔧 Quick Fix: Multi-Realm JWT Validation Issue

**Problem**: "Invalid or expired JWT token" errors after multi-realm migration  
**Cause**: Backend service needs restart to load new dual-issuer code  
**Solution**: Restart backend + re-authenticate

---

## Step 1: Restart Backend Service

```bash
# Stop backend (Ctrl+C in the terminal running backend)
# Or find and kill the process:
pkill -f "node.*backend"

# Restart backend
cd backend
npm run dev
```

**Expected Output**:
```
[DIVE] Backend API starting...
[DIVE] Keycloak Configuration: {
  realm: 'dive-v3-broker',
  clientId: 'dive-v3-client-broker',
  ...
}
```

---

## Step 2: Clear Browser Session

The old token in your browser session is from before the migration. You need to re-authenticate:

```bash
# Open browser
open http://localhost:3000

# Logout (if logged in)
# Click "Logout" button

# Close all browser tabs for localhost:3000

# Re-open and login fresh
open http://localhost:3000
```

---

## Step 3: Verify Keycloak Realms

Make sure the multi-realm Terraform was actually applied:

```bash
# Check if broker realm exists
curl -s http://localhost:8081/realms/dive-v3-broker/.well-known/openid-configuration | jq .issuer

# Expected: "http://localhost:8081/realms/dive-v3-broker"

# Check if pilot realm still exists (backward compatibility)
curl -s http://localhost:8081/realms/dive-v3-pilot/.well-known/openid-configuration | jq .issuer

# Expected: "http://localhost:8081/realms/dive-v3-pilot"
```

**If realms don't exist**, run Terraform:

```bash
cd terraform
terraform apply -var="enable_multi_realm=true" -auto-approve
```

---

## Step 4: Test JWT Validation

After restarting backend and logging in fresh:

1. Login at http://localhost:3000
2. Go to Dashboard
3. Try to access a document
4. Check backend logs for JWT validation

**Expected Backend Logs**:
```
[DIVE] Getting signing key for token { kid: '...', alg: 'RS256', realm: 'dive-v3-broker' }
[DIVE] JWT verification successful { sub: '...', iss: 'http://localhost:8081/realms/dive-v3-broker' }
```

**If you see errors**, check:
- Is KEYCLOAK_REALM set to dive-v3-broker in .env.local?
- Is backend reading the updated .env.local?
- Are you using a fresh token (not cached from before)?

---

## Step 5: Debug JWT Validation (if still failing)

Add debug logging to see what's happening:

```bash
# In backend terminal, set log level to debug
cd backend
LOG_LEVEL=debug npm run dev
```

Then try accessing a document and look for:
```
[DIVE] Extracted identity attributes { uniqueID: '...', clearance: '...', realm: '...' }
[DIVE] JWT verification failed { error: '...' }
```

**Common Errors**:

### Error: "invalid issuer"
**Cause**: Token issuer doesn't match validIssuers array  
**Fix**: Check token issuer vs. backend validIssuers

### Error: "invalid audience"  
**Cause**: Token audience doesn't match validAudiences array  
**Fix**: Verify token has aud='dive-v3-client-broker'

### Error: "No signing key found"
**Cause**: JWKS fetch failed or kid mismatch  
**Fix**: Verify Keycloak is running and realm exists

---

## Rollback Procedure (if needed)

If multi-realm is causing issues, rollback to single-realm:

```bash
# 1. Stop backend
pkill -f "node.*backend"

# 2. Edit .env.local
# Change: KEYCLOAK_REALM=dive-v3-broker
# To: KEYCLOAK_REALM=dive-v3-pilot

# Also change:
# KEYCLOAK_CLIENT_ID=dive-v3-client-broker
# To: KEYCLOAK_CLIENT_ID=dive-v3-client

# 3. Edit frontend/.env.local (same changes)

# 4. Restart backend
cd backend && npm run dev

# 5. Restart frontend (Ctrl+C and npm run dev)

# 6. Clear browser session and re-login
```

---

## Verification Checklist

- [ ] Backend restarted with new code
- [ ] Frontend restarted (if needed)
- [ ] Browser session cleared (logged out and back in)
- [ ] New JWT token obtained (post-migration)
- [ ] Token has correct issuer (dive-v3-broker or dive-v3-pilot)
- [ ] Backend logs show successful JWT verification
- [ ] Documents accessible without errors

---

## If Still Not Working

**Check environment variables**:
```bash
# Root .env.local
grep KEYCLOAK_REALM .env.local
# Should show: KEYCLOAK_REALM=dive-v3-broker

# Frontend .env.local
grep KEYCLOAK_REALM frontend/.env.local
# Should show: KEYCLOAK_REALM=dive-v3-broker
```

**Verify Keycloak client exists**:
```bash
# Check broker client
curl -s http://localhost:8081/realms/dive-v3-broker/.well-known/openid-configuration | jq .

# Should return valid configuration
```

**Check backend code loaded**:
```bash
# Look for dual-issuer code in backend logs at startup
cd backend
npm run dev 2>&1 | grep -i "multi-realm"
```

If you see my new `getRealmFromToken()` function being called in logs, the code is loaded.

---

## Quick Test Command

```bash
# Get a token and test backend validation
# (After logging in via browser)

# 1. Extract token from browser DevTools:
# - Open DevTools (F12)
# - Go to Application > Storage > Cookies > localhost:3000
# - Copy "authjs.session-token" value
# - Decode at jwt.io to see token details

# 2. Test backend with token:
curl http://localhost:4000/api/resources/doc-001 \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Expected: 200 OK or 403 Forbidden (authorization-dependent)
# Not expected: 401 Unauthorized with "Invalid or expired JWT token"
```

---

## Contact

If issue persists after all steps:
1. Share backend error logs
2. Share token issuer (from jwt.io)
3. Share backend environment variables (KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID)

The dual-issuer code is designed to accept both old and new tokens, so this should work.


