# Complete Cookie and Session Flow Audit

**Purpose:** Understand EXACTLY what's happening with cookies, sessions, and logout

---

## 🔍 WHAT COOKIES SHOULD EXIST

### During OAuth Flow (Temporary):
```
authjs.callback-url      - Stores callback URL during OAuth
authjs.csrf-token        - CSRF protection token
authjs.pkce.code_verifier - PKCE flow code verifier
authjs.state             - OAuth state parameter
authjs.nonce             - OIDC nonce for replay protection
```

**These should be DELETED after OAuth completes!**

### After Successful Login (Persistent):
```
next-auth.session-token  - Session identifier (points to DB record)
OR
__Secure-next-auth.session-token (on HTTPS)
```

**This is the ONLY persistent cookie NextAuth needs!**

### Keycloak Cookies (on localhost:8081):
```
AUTH_SESSION_ID          - Keycloak authentication session
KEYCLOAK_SESSION         - Keycloak SSO session  
KEYCLOAK_IDENTITY        - User identity in Keycloak
*_LEGACY variants        - Backward compatibility
```

**These persist as long as Keycloak SSO session is active**

---

## 🚨 PROBLEM IDENTIFIED

**You're seeing 10 cookies on localhost:3000!**

**Expected after login:** 1 cookie (session-token)
**Actual:** 10 cookies

**This means:**
- OAuth flow cookies NOT being cleaned up
- OR cookies being recreated on every page load
- OR multiple auth attempts creating duplicate cookies

---

## 🔬 DIAGNOSTIC INSTRUCTIONS FOR YOU

### Step 1: Identify Exact Cookies

```
1. Login as Canada user
2. After dashboard appears, open DevTools (F12)
3. Application tab → Cookies → http://localhost:3000
4. List ALL cookies you see with their names

Please provide the EXACT list of 10 cookies.
This will tell me what's wrong.
```

### Step 2: Check Cookie Expiration

```
In the same cookies view:
- Click on each cookie
- Note the "Expires / Max-Age" value
- OAuth flow cookies should expire quickly (minutes)
- Session cookie should expire in days/weeks
```

### Step 3: Check What's in Session

```
On dashboard page, scroll to bottom
"Session Details (Dev Only)" section shows session JSON

Check:
- Does it have idToken?
- Does it have accessToken?
- Does it have user.clearance, user.countryOfAffiliation?

Copy the session JSON and send it to me.
```

### Step 4: Check Console During Logout

```
1. Console open (F12)
2. Click "Sign Out"
3. Copy ALL console logs

Look specifically for:
- [DIVE] Building Keycloak logout URL...
- [DIVE] Keycloak logout config: {...}
- Does it show id_token_hint?
- Does browser navigate to Keycloak?
```

---

## 💡 POSSIBLE ROOT CAUSES

### Possibility #1: OAuth Cookies Not Cleaned Up

**Symptom:** authjs.callback-url, authjs.state, authjs.pkce, etc. persist

**Cause:** NextAuth might not be clearing these after OAuth completes

**Check:** Are these cookies from CURRENT session or old session?

### Possibility #2: No idToken in Session

**Symptom:** Keycloak logout not working

**Cause:** Session callback might not be storing idToken properly

**Check:** Session JSON at bottom of dashboard - does it have idToken field?

### Possibility #3: Multiple Sessions/Logins

**Symptom:** Duplicate cookies, multiple sessions

**Cause:** Each login attempt creating new cookies without cleanup

**Check:** Database shows 5 sessions - are they all for same user or different?

---

## 📊 WHAT I NEED FROM YOU

To properly debug, I need this information:

**1. Exact Cookie List:**
```
Name                     | Value (first 20 chars) | Expires
-------------------------|------------------------|----------
next-auth.session-token  | abc123...              | 30 days
authjs.callback-url      | ...                    | ?
(please list all 10)
```

**2. Session JSON from Dashboard:**
```json
{
  "user": {
    "clearance": "...",
    "countryOfAffiliation": "...",
    ...
  },
  "idToken": "...",  ← Does this exist?
  "accessToken": "...",
  ...
}
```

**3. Console Logs During Logout:**
```
All [DIVE] prefixed logs
Any errors
Network activity showing Keycloak navigation
```

**4. Database Session Count:**
```bash
docker-compose exec -T postgres psql -U postgres -d dive_v3_app -c "
SELECT \"sessionToken\", \"userId\", expires 
FROM session 
ORDER BY expires DESC;
"
```

---

## 🎯 NEXT STEPS

**I will NOT make any more code changes until:**
1. You provide the diagnostic data above
2. I analyze the ACTUAL data flow
3. I identify the REAL root cause
4. I design a proper fix based on evidence

**No more guessing. No more incremental fixes. Proper debugging first.**

---

Please restart frontend, login as Canada, and provide:
1. List of all 10 cookies on localhost:3000
2. Session JSON from dashboard bottom
3. Console logs when you click logout
4. Whether browser navigates to Keycloak logout page

Then I can properly diagnose and fix this once and for all.

