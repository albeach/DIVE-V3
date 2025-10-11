# JWT Token Diagnostic Guide

**Issue:** Backend returns 401 "Invalid or expired JWT token"  
**Possible Causes:** Token not in session, token expired, JWKS mismatch  
**Status:** Diagnostic logging added - ready to debug

---

## Diagnostic Steps

### Step 1: Restart Frontend with New Logging

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/frontend
# Press Ctrl+C
npm run dev
```

**Watch for startup messages - should NOT see errors**

### Step 2: Login in Incognito Window

```
1. Open incognito: Cmd+Shift+N
2. Navigate to: http://localhost:3000
3. Click "Login with Keycloak"
4. Login: testuser-us / Password123!
5. Should land on dashboard
```

### Step 3: Check Frontend Logs

**In your frontend terminal, you should see:**
```
[DIVE] Account found for user: {
  userId: '...',
  provider: 'keycloak',
  hasAccessToken: true,    ← Should be TRUE
  hasIdToken: true,        ← Should be TRUE
  accessTokenLength: 1847  ← Should be ~1500-2000
}

[DIVE] Custom claims extracted: {
  uniqueID: 'john.doe@mil',
  clearance: 'SECRET',
  country: 'USA'
}
```

**If you DON'T see this:**
- Problem: Account not found in database
- Solution: See "Fix 1" below

**If hasAccessToken is false:**
- Problem: Tokens not stored in database during login
- Solution: See "Fix 2" below

### Step 4: Check Database Directly

```bash
# Query account table
docker exec -it dive-v3-postgres psql -U postgres -d dive_v3_app -c "
SELECT provider, 
       LENGTH(access_token) as access_len,
       LENGTH(id_token) as id_len,
       expires_at
FROM account;
"
```

**Expected output:**
```
 provider  | access_len | id_len | expires_at
-----------+------------+--------+------------
 keycloak  |       1847 |   1624 | 1728661234
```

**If no rows:**
- Problem: Account not created during login
- Solution: See "Fix 3" below

**If access_token is NULL:**
- Problem: Keycloak not returning access_token
- Solution: See "Fix 4" below

### Step 5: Try to Access Document

```
1. Click "Browse Documents"
2. Click any document
3. Check backend logs (Terminal 1)
```

**In backend logs, you should see:**
```json
{
  "requestId": "req-...",
  "tokenLength": 1847,
  "tokenPrefix": "eyJhbGciOiJSUzI1NiI...",
  "level": "debug",
  "message": "Received JWT token"
}
```

**If you see:**
```json
{
  "message": "Missing Authorization header",
  "received": "Missing"
}
```
- Problem: access_token not being sent from frontend
- Solution: See "Fix 5" below

---

## Fixes for Common Issues

### Fix 1: Account Not Found in Database

**Diagnosis:**
```
[DIVE] No account found for user: <user-id>
```

**Cause:** Database session created but account record missing

**Solution:**
```bash
# Check if account table exists
docker exec -it dive-v3-postgres psql -U postgres -d dive_v3_app -c "\d account"

# Should show table structure
# If "relation does not exist":

# Recreate tables
docker exec -it dive-v3-postgres psql -U postgres -d dive_v3_app << 'EOF'
CREATE TABLE IF NOT EXISTS account (
    "userId" TEXT NOT NULL,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INTEGER,
    token_type TEXT,
    scope TEXT,
    id_token TEXT,
    session_state TEXT,
    PRIMARY KEY (provider, "providerAccountId")
);
EOF

# Logout and login again
```

### Fix 2: Tokens Not in Account

**Diagnosis:**
```
[DIVE] Account found for user: {
  hasAccessToken: false,  ← Problem!
  hasIdToken: false
}
```

**Cause:** DrizzleAdapter not storing tokens

**Solution - Check Keycloak Client Configuration:**
```bash
# Get client secret
cd terraform
terraform output client_secret

# Verify it matches .env.local
grep KEYCLOAK_CLIENT_SECRET ../.env.local

# If mismatch, update .env.local and restart frontend
```

**Solution - Verify Keycloak Returns Tokens:**
```bash
# Test direct token request
CLIENT_SECRET=$(cd terraform && terraform output -raw client_secret)

curl -X POST "http://localhost:8081/realms/dive-v3-pilot/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=dive-v3-client" \
  -d "client_secret=$CLIENT_SECRET" \
  -d "username=testuser-us" \
  -d "password=Password123!" | jq '{
    has_access_token: (.access_token != null),
    has_id_token: (.id_token != null),
    access_token_length: (.access_token | length),
    id_token_length: (.id_token | length)
  }'
```

**Expected:**
```json
{
  "has_access_token": true,
  "has_id_token": true,
  "access_token_length": 1847,
  "id_token_length": 1624
}
```

### Fix 3: Account Table Empty

**Diagnosis:**
```sql
SELECT * FROM account;
-- Returns 0 rows
```

**Cause:** Login flow not creating account record

**Solution:**
```bash
# Check if DrizzleAdapter is working
# After login, immediately check:
docker exec -it dive-v3-postgres psql -U postgres -d dive_v3_app -c "
SELECT \"userId\", provider, \"providerAccountId\" FROM account;
"

# If still empty, check user table:
docker exec -it dive-v3-postgres psql -U postgres -d dive_v3_app -c "
SELECT id, email FROM \"user\";
"

# If user exists but no account:
# This suggests DrizzleAdapter isn't linking them
# Check DATABASE_URL in frontend .env.local
cd frontend
grep DATABASE_URL ../.env.local
```

### Fix 4: Access Token is NULL

**Diagnosis:**
```sql
SELECT access_token FROM account;
-- Returns NULL
```

**Cause:** Keycloak client misconfigured or token not being stored

**Solution:**
```bash
# 1. Verify Keycloak client settings
# Admin Console → Clients → dive-v3-client
# Settings should have:
# - Access Type: confidential
# - Standard Flow Enabled: ON
# - Valid Redirect URIs: http://localhost:3000/*

# 2. Check Terraform applied correctly
cd terraform
terraform plan
# Should show "No changes"

# 3. Re-run terraform if needed
terraform apply -auto-approve
```

### Fix 5: Access Token Not Sent from Frontend

**Diagnosis:**
Backend logs show:
```json
{
  "message": "Missing Authorization header"
}
```

**Cause:** Frontend not including token in request

**Solution - Add Debug to Frontend:**

Edit `frontend/src/app/resources/[id]/page.tsx`:

```typescript
// Around line 68
const accessToken = (session as any)?.accessToken;

console.log('[DIVE] Fetching resource:', {
  resourceId,
  hasSession: !!session,
  hasAccessToken: !!accessToken,
  accessTokenLength: accessToken?.length || 0,
  accessTokenPrefix: accessToken?.substring(0, 20) || 'none',
});

if (!accessToken) {
  // ... error handling
}
```

**Then check browser console (F12) - should show token details**

---

## Quick Diagnostic Script

Run this complete diagnostic:

```bash
#!/bin/bash
echo "=== DIVE V3 JWT Token Diagnostic ==="

echo ""
echo "1. Check Keycloak is running:"
curl -sf http://localhost:8081/health/ready && echo "✅ Keycloak ready" || echo "❌ Keycloak not ready"

echo ""
echo "2. Check JWKS endpoint:"
curl -s http://localhost:8081/realms/dive-v3-pilot/protocol/openid-connect/certs | jq -r '.keys[] | select(.use=="sig") | {kid, alg}'

echo ""
echo "3. Check PostgreSQL is running:"
docker exec -it dive-v3-postgres psql -U postgres -c "SELECT version();" 2>&1 | grep PostgreSQL && echo "✅ PostgreSQL ready" || echo "❌ PostgreSQL not ready"

echo ""
echo "4. Check database tables exist:"
docker exec -it dive-v3-postgres psql -U postgres -d dive_v3_app -c "\dt" 2>&1 | grep -E "(user|account|session)" && echo "✅ Tables exist" || echo "❌ Tables missing"

echo ""
echo "5. Check account records:"
docker exec -it dive-v3-postgres psql -U postgres -d dive_v3_app -c "SELECT provider, LENGTH(access_token) as token_len FROM account;" 2>&1

echo ""
echo "6. Test Keycloak token directly:"
CLIENT_SECRET=$(cd terraform && terraform output -raw client_secret 2>/dev/null)
if [ -n "$CLIENT_SECRET" ]; then
  curl -s -X POST "http://localhost:8081/realms/dive-v3-pilot/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=password" \
    -d "client_id=dive-v3-client" \
    -d "client_secret=$CLIENT_SECRET" \
    -d "username=testuser-us" \
    -d "password=Password123!" | jq '{
      has_access: (.access_token != null),
      has_id: (.id_token != null),
      access_len: (.access_token | length),
      expires_in
    }'
else
  echo "❌ Could not get client secret from Terraform"
fi

echo ""
echo "=== End Diagnostic ==="
```

**Save as `scripts/diagnose-jwt.sh` and run:**
```bash
chmod +x scripts/diagnose-jwt.sh
./scripts/diagnose-jwt.sh
```

---

## Most Likely Issue: Session Not Finding Access Token

Based on the error, the frontend session callback might not be finding the access_token. Here's how to verify:

**After logging in, check frontend terminal for:**
```
[DIVE] Account found for user: { ... }
```

**If you DON'T see this message:**
1. Session callback not being called
2. Database query failing
3. Account table empty

**Next step:** Run the diagnostic script above to identify which component is failing.

---

**Status:** Diagnostic logging added  
**Action Required:** 
1. Restart frontend
2. Login fresh in incognito
3. Check frontend terminal for `[DIVE]` log messages
4. Attempt to access document
5. Report what you see in frontend logs

**I need to see the `[DIVE]` log messages to diagnose further.**

