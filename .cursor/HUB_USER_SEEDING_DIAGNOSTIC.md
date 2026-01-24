# DIVE V3 Hub User Seeding Diagnostic

**Date:** 2026-01-24  
**Issue:** Test users not accessible for login after hub deployment  
**Status:** ⚠️ PARTIALLY RESOLVED - Users created but verification unclear

---

## What We Fixed ✅

### 1. MongoDB Replica Set Initialization
- **Fixed:** MongoDB now achieves PRIMARY status (0 seconds)
- **Committed:** `7a7fd461`
- **Result:** Hub deploys in 52 seconds, MongoDB works perfectly

### 2. Automatic Seeding Phase Added
- **Fixed:** Added Phase 7 to `hub_deploy()`  
- **Committed:** `c6f95827`
- **Result:** Seeding runs automatically during deployment

---

## Current Problem ⚠️

### Seeding Completes But Users Not Verifiable

**What Works:**
```bash
✅ Step 1/4: COI Keys initialized (22 COIs)
✅ Step 2/4: Users created - demo-usa-1 through demo-usa-4, admin-usa
❌ Step 3/4: Resource seeding fails (connection error)
```

**What Fails:**
1. Resource seeding tries to connect to `localhost:27017` instead of `mongodb:27017`
2. User verification via Keycloak API returns empty

---

## Root Cause Analysis

### Issue 1: Resource Seeding Connection Problem

**Error:**
```
MongoServerSelectionError: connect ECONNREFUSED ::1:27017, connect ECONNREFUSED 127.0.0.1:27017
```

**Why:**
The `hub_seed()` function runs seeding scripts via `docker exec` but the script output shows:
- Configured URI: `mongodb://mongodb:27017/dive-v3-hub?authSource=admin` ✅
- Actual connection attempt: `localhost:27017` ❌

**Root Cause:** Script may be parsing MONGODB_URL incorrectly or falling back to localhost.

### Issue 2: User Verification Unclear

**Attempted Verification Methods:**
1. Keycloak Admin CLI: Returns empty array
2. Keycloak REST API: Returns empty
3. Direct curl to admin endpoint: Returns empty

**Possible Causes:**
- Users created in wrong realm
- Keycloak admin token not working
- Users created but not committed to database
- Realm name mismatch

---

## Recommended Solution (BEST PRACTICE)

### Verify Users Via Frontend Login

**Action Required:**
1. Open browser: `https://localhost:3000`
2. Attempt login with:
   - Username: `demo-usa-1`
   - Password: `Demo2025!Secure`
3. If login works → Users exist, verification method is the problem
4. If login fails → Users not actually created

### Fix Resource Seeding

**File:** `backend/src/scripts/seed-instance-resources.ts`

**Current Issue:** Script connects to `localhost:27017` instead of `mongodb:27017`

**Investigation Needed:**
```typescript
// Find where connection URL is set
// Likely around line 1866 based on error stack trace
// Should use MONGODB_URL from environment
```

---

## Manual Verification Steps

### 1. Check Keycloak Admin Console

```bash
# Open in browser:
https://localhost:8443/admin
# Login: admin / (check .env.hub for KC_ADMIN_PASSWORD)
# Navigate to: dive-v3-broker-usa realm → Users
# Look for: demo-usa-1, demo-usa-2, demo-usa-3, demo-usa-4, admin-usa
```

### 2. Check MongoDB Directly

```bash
docker exec dive-hub-mongodb mongosh dive-v3-hub -u admin -p *** --eval "
  db.users.find({}, {username: 1, clearance: 1}).pretty()
"
```

### 3. Test Login Via Frontend

```bash
# Open browser
https://localhost:3000

# Try login with:
Username: demo-usa-1
Password: Demo2025!Secure

# Or super admin:
Username: admin-usa  
Password: Admin2025!Secure
```

---

## Test Users Created

### Demo Users (All Instances)
- **UNCLASSIFIED:** demo-usa-1, demo-fra-1, demo-gbr-1, demo-deu-1
- **CONFIDENTIAL:** demo-usa-2, demo-fra-2, demo-gbr-2, demo-deu-2  
- **SECRET:** demo-usa-3, demo-fra-3, demo-gbr-3, demo-deu-3
- **TOP_SECRET:** demo-usa-4, demo-fra-4, demo-gbr-4, demo-deu-4

### Super Admins
- admin-usa, admin-fra, admin-gbr, admin-deu

### Credentials
- **Demo Users:** `Demo2025!Secure`
- **Super Admins:** `Admin2025!Secure`  
- **OTP Code:** `123456` (pre-configured for demo)

---

## Next Steps (Priority Order)

### P0: Verify Users Exist

**Action:** Use frontend login to test
**Command:** Open `https://localhost:3000` in browser
**Expected:** Login succeeds with demo-usa-1 / Demo2025!Secure
**If Fails:** Users not actually in Keycloak, need deeper investigation

### P1: Fix Resource Seeding

**Action:** Fix MongoDB connection URL in seeding script
**File:** `backend/src/scripts/seed-instance-resources.ts`
**Investigation:** Find why it connects to localhost instead of mongodb container
**Expected:** Script uses `mongodb://mongodb:27017` from MONGODB_URL

### P2: Document Working Seeding Process

**Action:** Once confirmed working, document the complete flow
**Include:**
- Automatic seeding during deployment
- Manual seeding via `./dive hub seed`
- User verification methods
- Troubleshooting steps

---

## Files Modified This Session

```
Commit c6f95827: Add automatic seeding
  scripts/dive-modules/deployment/hub.sh

Commit 7a7fd461: Fix MongoDB initialization  
  docker-compose.hub.yml
  templates/spoke/docker-compose.template.yml
  scripts/dive-modules/deployment/hub.sh
  scripts/dive-modules/spoke/pipeline/phase-deployment.sh
```

---

## Current Hub Status

```bash
./dive hub status

Expected:
- 12/12 services healthy
- MongoDB: PRIMARY
- Backend: healthy
- Frontend: healthy
- Keycloak: healthy
```

---

## Quick Diagnostic Commands

```bash
# 1. Check all services
docker ps | grep dive-hub

# 2. Check MongoDB status
docker exec dive-hub-mongodb mongosh admin -u admin -p *** --quiet --eval "rs.status().members[0].stateStr"
# Expected: PRIMARY

# 3. Check backend logs for user creation
docker logs dive-hub-backend | grep -i "user.*created\|setup complete"

# 4. Check Keycloak logs
docker logs dive-hub-keycloak | grep -i "user.*admin-usa\|demo-usa"

# 5. Try frontend login
open https://localhost:3000
```

---

## Session Summary

**Achievements:**
1. ✅ MongoDB initialization fixed (52 second deployment, PRIMARY instant)
2. ✅ Automatic seeding added to deployment
3. ✅ User seeding script runs and reports success
4. ⚠️ Resource seeding fails (connection issue)
5. ❓ User existence unverified (need frontend login test)

**Remaining Work:**
1. Verify users via frontend login
2. Fix resource seeding MongoDB connection
3. Verify hub is fully operational
4. Only then proceed with spoke deployments

---

## User's Next Action Required

**PLEASE TEST:**
1. Open https://localhost:3000 in your browser
2. Try logging in with:
   - Username: `demo-usa-1`
   - Password: `Demo2025!Secure`
3. Report back:
   - ✅ If login works → Users exist, we can proceed
   - ❌ If login fails → Need deeper investigation

**THEN:** Once login confirmed working, we'll fix resource seeding and verify complete hub functionality before touching any spokes.
