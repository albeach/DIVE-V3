# 🔧 Session Handling Fix - Root Cause Analysis

**Date**: October 21, 2025  
**Status**: ✅ FIXED - Database tables created, sessions cleared

---

## 🐛 Root Causes Identified

### Issue #1: **Database Tables Missing**
```
ERROR:  relation "users" does not exist
ERROR:  relation "sessions" does not exist
```

**Cause**: NextAuth DrizzleAdapter expected PostgreSQL tables but they were never created  
**Impact**: Sessions couldn't be stored, causing constant re-authentication  
**Fix**: Created tables via SQL:
- `user` - User accounts
- `account` - OAuth provider accounts  
- `session` - Active sessions
- `verificationToken` - Email verification

### Issue #2: **Invalid Refresh Token Loop**
```
REFRESH_TOKEN_ERROR ... error="invalid_token"
refresh_token_id="7a65db6d-1b06-4d47-8cad-9d622f243803"
```

**Cause**: Old Keycloak session from before migration was stored in database  
**Impact**: NextAuth kept trying to refresh an expired/invalid token  
**Fix**: Cleared all sessions from database

### Issue #3: **Webpack Cache Corruption**
```
Error: ENOENT: no such file or directory, stat '.next/cache/webpack/...'
```

**Cause**: `.next` build cache had missing pack files  
**Impact**: Frontend rebuild errors  
**Fix**: Deleted `.next` directory

---

## ✅ Actions Taken

### 1. Created Database Tables
```sql
CREATE TABLE "user" (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT,
    email TEXT NOT NULL,
    "emailVerified" TIMESTAMP,
    image TEXT
);

CREATE TABLE "account" (
    "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
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

CREATE TABLE "session" (
    "sessionToken" TEXT PRIMARY KEY NOT NULL,
    "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    expires TIMESTAMP NOT NULL
);

CREATE TABLE "verificationToken" (
    identifier TEXT NOT NULL,
    token TEXT NOT NULL,
    expires TIMESTAMP NOT NULL,
    PRIMARY KEY (identifier, token)
);
```

### 2. Cleared All Sessions
```sql
DELETE FROM session;
DELETE FROM account;
DELETE FROM "user";
```

### 3. Cleared Frontend Cache
```bash
rm -rf frontend/.next
```

---

## 🧪 Testing Required

### Test 1: Fresh Login
1. Open http://localhost:3000
2. Should show login page (NOT auto-logged-in)
3. Click "Login"
4. Select any IdP (USA, France, Canada, Industry)
5. Authenticate
6. Should redirect to dashboard

**Expected**: Clean login, session stored in database

### Test 2: Session Persistence
1. After logging in, refresh page
2. Should stay logged in (database session working)
3. Check database:
```sql
SELECT session_token, user_id, expires FROM session;
```
Should show 1 active session

### Test 3: Token Refresh
1. Wait 3-5 minutes (token should be proactively refreshed)
2. Check frontend logs for:
```
[DIVE] Proactive token refresh { timeUntilExpiry: ... }
[DIVE] Token refreshed successfully
```

### Test 4: Logout
1. Click "Sign Out"
2. Should redirect to Keycloak logout
3. Then redirect to home page
4. Check database - session should be deleted

### Test 5: Document Access
1. Login fresh
2. Go to "Browse Documents"
3. Click on any document
4. Should load without "Invalid JWT" errors

---

## 📊 Verification Commands

**Check database tables exist**:
```bash
docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -c "\dt"
```

**Check active sessions**:
```bash
docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -c "SELECT session_token, user_id, expires FROM session;"
```

**Check accounts**:
```bash
docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -c "SELECT user_id, provider, expires_at FROM account;"
```

**Check Keycloak logs for refresh errors**:
```bash
docker logs dive-v3-keycloak 2>&1 | grep "REFRESH_TOKEN_ERROR" | tail -10
```

Should be **empty** after fix (no more invalid token errors)

---

## 🎯 Next Steps

1. ✅ Database tables created
2. ✅ Old sessions cleared  
3. ✅ Frontend cache cleared
4. ⏳ **Restart frontend** (in your Terminal 2):
   ```bash
   cd frontend
   npm run dev
   ```

5. ⏳ **Test login flow** (see Test 1 above)

6. ⏳ **Verify no Keycloak errors** after login

7. ⏳ **Create unit tests** for session handling

---

## 🔬 Unit Tests Needed

### Test: Database Schema
```typescript
// frontend/src/lib/db/__tests__/schema.test.ts
describe('NextAuth Database Schema', () => {
  it('should have all required tables', async () => {
    // Query database for tables
    // Verify user, account, session, verificationToken exist
  });
  
  it('should have correct foreign key constraints', async () => {
    // Verify account.userId -> user.id
    // Verify session.userId -> user.id
  });
});
```

### Test: Session Lifecycle
```typescript
// frontend/src/__tests__/session-lifecycle.test.ts
describe('Session Lifecycle', () => {
  it('should create session on login', async () => {
    // Mock NextAuth login
    // Verify session created in database
  });
  
  it('should delete session on logout', async () => {
    // Mock NextAuth logout
    // Verify session deleted from database
  });
  
  it('should refresh token when expiring', async () => {
    // Mock token near expiry
    // Verify refresh called
    // Verify new tokens stored
  });
});
```

### Test: Token Refresh
```typescript
// frontend/src/__tests__/token-refresh.test.ts
describe('Token Refresh', () => {
  it('should proactively refresh when 3 minutes remaining', async () => {
    // Set token with 3 min expiry
    // Call session callback
    // Verify refresh triggered
  });
  
  it('should handle invalid refresh token gracefully', async () => {
    // Mock Keycloak error
    // Verify session cleared
    // Verify user prompted to re-login
  });
});
```

---

## ✅ Success Criteria

- [ ] Database tables exist and have correct schema
- [ ] No "relation does not exist" errors
- [ ] No "REFRESH_TOKEN_ERROR" in Keycloak logs
- [ ] Login creates session in database
- [ ] Logout deletes session from database
- [ ] Token refresh works without errors
- [ ] Documents accessible without JWT errors
- [ ] Unit tests pass

---

**END OF ANALYSIS**

**Status**: Database fixed, ready for testing
**Next**: Restart frontend, test login, create unit tests

