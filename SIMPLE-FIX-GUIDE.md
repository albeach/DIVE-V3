# Simple Fix Guide - 3 Minutes ⏱️

**Your Issues:** Germany IdP wrong URL, Industry flag wrong, dive-v3-pilot login missing  
**Status:** ✅ All fixed in code, just need to apply

---

## 🚀 Apply Fixes (Copy & Paste These Commands)

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

# 1. Restart frontend (applies flag fix + direct login button)
docker-compose restart nextjs

# Wait for it to rebuild
echo "Waiting for frontend to rebuild..." && sleep 20

# 2. Open browser to test
open http://localhost:3000
```

**What You Should See:**
- ✅ Industry Partner has building emoji 🏢 (not 🇺🇸)
- ✅ "Direct Keycloak Login" button at bottom
- ⚠️ Germany Test IdP still visible (we'll remove it next)

---

## 🗑️ Remove Germany Test IdP (Optional but Recommended)

The "Germany Test IdP" that points to example.com needs to be removed manually:

### Option 1: Via Browser (Easiest - 2 minutes)

```
1. Open: http://localhost:8081/admin
2. Login: admin / admin
3. Select realm: dive-v3-pilot (dropdown top-left)
4. Click: "Identity providers" (left sidebar)
5. Find: "germany-idp" or "Germany Test IdP"
6. Click the trash icon to delete
7. Confirm deletion
8. Refresh browser: http://localhost:3000 (Cmd+Shift+R)
```

### Option 2: Via Cleanup Script (Automated)

The script I created needs your admin token. Here's how:

```bash
# Step 1: Get your admin token
# a) Open http://localhost:3000 in browser
# b) Login as: testuser-us / Password123!
# c) Visit: http://localhost:3000/api/auth/session
# d) Copy the long "accessToken" value

# Step 2: Run cleanup script
./scripts/cleanup-test-idps.sh

# Step 3: When prompted, paste your token

# Step 4: Type "yes" to confirm deletion
```

---

## ✅ Verify All Fixes

After applying fixes, check http://localhost:3000:

**Expected Result:**
```
════════════════════════════════════
DIVE V3 Coalition Pilot

Select Your Identity Provider

┌──────────────┐  ┌──────────────┐
│ 🇨🇦 Canada    │  │ 🇫🇷 France    │
└──────────────┘  └──────────────┘

┌──────────────┐
│ 🏢 Industry   │  ← FIXED (was 🇺🇸)
│ Partner       │
└──────────────┘

────────────────────────────────────

For Testing: Direct login with test users

┌────────────────────────────────────┐
│  🔑 Direct Keycloak Login          │  ← NEW
│     dive-v3-pilot realm            │
└────────────────────────────────────┘

(Germany Test IdP removed after cleanup)
```

---

## 🧪 Test Direct Login

```
1. Click "Direct Keycloak Login" button
2. Keycloak login form appears
3. Login with:
   Username: testuser-us
   Password: Password123!
4. You're redirected to /dashboard
```

---

## ❓ Troubleshooting

**Industry Partner still shows 🇺🇸?**
```bash
# Hard refresh browser
Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
```

**Direct Login button not visible?**
```bash
# Check frontend rebuilt
docker logs dive-v3-frontend --tail 20

# If not, restart again
docker-compose restart nextjs
```

**Germany IdP still appears?**
```bash
# Check if you deleted it
curl http://localhost:4000/api/idps/public | jq '.idps[].alias'

# Should NOT include "germany-idp"
```

---

## 📊 Summary

| **Issue** | **Fixed** | **How to Apply** |
|-----------|-----------|------------------|
| Industry flag wrong | ✅ Code | Restart frontend |
| Direct login missing | ✅ Code | Restart frontend |
| Germany Test IdP | ✅ Script | Delete via browser or run script |

**Time:** 3 minutes total  
**Complexity:** Low (just restart + one deletion)

---

**Ready to test now!** Start with: `docker-compose restart nextjs`

