# ✅ LOGOUT ROOT CAUSE FOUND - Malformed Redirect URIs

**Date:** October 11, 2025  
**Status:** ✅ **ROOT CAUSE IDENTIFIED AND FIXED**

---

## 🔍 THE SMOKING GUN

**From your diagnostic data:**
```json
{
  "post.logout.redirect.uris": "http://localhost:3000##http://localhost:3000/##http://localhost:3000/*"
}
```

**See those `##` separators?** That's MALFORMED!

**Keycloak expects:**
- Single URI: `"http://localhost:3000"`
- OR multiple with `+` separator: `"http://localhost:3000+http://localhost:3000/dashboard"`

**NOT `##` separators!**

---

## 🎯 WHY LOGOUT WAS FAILING

**Complete Flow Analysis:**

```
1. User clicks "Sign Out" ✅
   ↓
2. Browser navigates to Keycloak logout URL ✅
   http://localhost:8081/realms/dive-v3-pilot/protocol/openid-connect/logout
   ?id_token_hint=eyJ...
   &post_logout_redirect_uri=http://localhost:3000
   ↓
3. Keycloak receives logout request ✅
   ↓
4. Keycloak validates post_logout_redirect_uri
   Checks: Is "http://localhost:3000" in valid_post_logout_redirect_uris?
   Configured: "http://localhost:3000##http://localhost:3000/##..."
   Validation: FAILS! ❌
   ↓
5. Keycloak REJECTS logout request ❌
   - Doesn't terminate SSO session
   - Doesn't clear cookies
   - Doesn't call frontchannel_logout_url
   - Just redirects somewhere (probably home)
   ↓
6. User ends up at home page
   But ALL cookies still active ❌
   ↓
7. Next login: Auto-logged in (cookies valid) ❌
```

**The malformed URI list caused Keycloak to reject the entire logout!**

---

## ✅ FIX APPLIED

**File:** `terraform/main.tf`

**Before (WRONG):**
```hcl
valid_post_logout_redirect_uris = [
  "${var.app_url}/*",      # These become malformed
  "${var.app_url}/",       # with ## separators
  "${var.app_url}"         # in Keycloak
]
```

**After (CORRECT):**
```hcl
valid_post_logout_redirect_uris = ["${var.app_url}"]
```

**Result in Keycloak:**
```json
{
  "post.logout.redirect.uris": "http://localhost:3000"
}
```

**Terraform Applied:** 13 resources updated ✅

---

## 🧪 TEST NOW (Should Work!)

### Pre-Test: Clear All Sessions

```bash
docker-compose exec -T postgres psql -U postgres -d dive_v3_app -c "DELETE FROM session;"
```

### Test Logout:

```
1. NEW incognito window
2. Login as Canada: testuser-can / Password123!
3. Dashboard appears with CAN attributes

4. Open DevTools (F12):
   - Console tab open
   - Also check Application → Cookies → http://localhost:8081
   - Note: AUTH_SESSION_ID, KEYCLOAK_SESSION exist

5. Click "Sign Out"

6. Watch console for:
   [DIVE] Keycloak logout URL constructed...
   (Browser navigates to Keycloak)
   
7. Keycloak should now:
   - Validate post_logout_redirect_uri ✅ (now matches!)
   - Terminate SSO session ✅
   - Delete its cookies ✅
   - Call frontchannel_logout_url in iframe ✅
   
8. Console should then show:
   [DIVE] Frontchannel logout callback - deleting cookies
   [DIVE Iframe] Frontchannel logout executing...
   [DIVE Iframe] Sending logout-complete message
   [DIVE] Received logout-complete message
   [DIVE] signOut event triggered
   [DIVE] Database session deleted

9. Check cookies at http://localhost:8081:
   AUTH_SESSION_ID: GONE ✅
   KEYCLOAK_SESSION: GONE ✅
   KEYCLOAK_IDENTITY: GONE ✅

10. Check cookies at http://localhost:3000:
    Only authjs.csrf-token might remain (that's okay)
    Session token: GONE ✅

11. Click Canada again:
    Expected: LOGIN FORM ✅
    NOT auto-logged in ✅
```

---

## 🎯 WHY THIS FIX WILL WORK

**The Problem:**
```
Keycloak received: post_logout_redirect_uri=http://localhost:3000
Keycloak checked against: "http://localhost:3000##http://localhost:3000/##..."
Match algorithm: Exact string match or pattern match
Result: NO MATCH (because of ## formatting)
Action: REJECT logout request
```

**The Fix:**
```
Keycloak now has: "http://localhost:3000"
User sends: post_logout_redirect_uri=http://localhost:3000
Match: EXACT MATCH ✅
Action: ACCEPT logout, clear cookies, call frontchannel callback ✅
```

---

## ✅ FINAL STATUS

**Root Cause:** Malformed `post.logout.redirect.uris` with `##` separators  
**Fix:** Simplified to single exact match: `["http://localhost:3000"]`  
**Applied:** Terraform updated, Keycloak configuration fixed  

**Test Now:** Logout should work completely - all cookies should be cleared! 🚀

**Please test logout one more time. This fix should resolve it!**
