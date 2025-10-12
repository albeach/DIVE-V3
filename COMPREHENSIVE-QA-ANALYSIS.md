# Comprehensive QA Analysis - Session Management Issues

**Date:** October 11, 2025  
**Analyst:** Taking a step back for full analysis  
**Resources Reviewed:**
1. https://authjs.dev/getting-started/database
2. https://www.reddit.com/r/nextjs/comments/1hi6yne/nextjs_authjs_and_postgres_any_way_to_make_this/
3. https://github.com/sundaray/next-auth
4. https://koyukan.medium.com/mastering-keycloak-front-channel-logout-with-next-js-nextauth-js-a-post-mortem-turned-how-to-631d06118d7b

---

## 🔍 CURRENT STATE ASSESSMENT

### Database Inspection Results:

```
NextAuth Database (dive_v3_app):
- Sessions: 5 active sessions
- Accounts: 1 account  
- Users: 1 user

Keycloak Database (keycloak_db):
- Users in dive-v3-pilot: 5 users
- Federated identity links: 2 links

Test Results:
- OPA Tests: 78/78 passing ✅
- Integration Tests: 22/22 passing ✅
- TypeScript: 0 errors ✅
```

**Critical Finding:** 5 sessions remain in database after logout attempts!

---

## 📚 INSIGHTS FROM RESEARCH

### 1. AuthJS Documentation - Database Strategy

**From https://authjs.dev/getting-started/database:**

> "Database Adapters are the bridge we use to connect Auth.js to your database."

**Key Points:**
- Database strategy stores sessions in DB (not cookies)
- Adapter handles session creation
- **Session deletion on signOut() depends on adapter implementation**

**Critical Insight:** Not all adapters automatically delete sessions on signOut!

### 2. NextAuth v5 Database Strategy Behavior

**From research:**
- `signOut()` function clears cookies
- With database strategy: May not delete database records
- DrizzleAdapter specific behavior needs investigation

**Our Situation:**
- Using DrizzleAdapter
- Sessions persist in PostgreSQL after signOut
- **This is the root cause of auto-login**

### 3. Koyukan Article - Three-Layer Session Model

**From https://koyukan.medium.com/mastering-keycloak-front-channel-logout-with-next-js-nextauth-js-a-post-mortem-turned-how-to-631d06118d7b:**

**The Three Layers:**
1. **Keycloak SSO Session** (Keycloak server)
2. **NextAuth.js Cookies** (HttpOnly, browser)
3. **Browser State** (localStorage, sessionStorage)

**Article's Solution:**
- Server action to delete cookies
- Frontchannel logout in iframe
- postMessage to parent window
- Parent completes cleanup

**What Article Doesn't Cover:** Database session deletion with database strategy!

---

## 🎯 ROOT CAUSE ANALYSIS

### Primary Issue: Session Lifecycle with Database Strategy

**Expected Flow:**
```
signOut() → Delete from database → Clear cookies → Session gone
```

**Actual Flow:**
```
signOut() → Clear cookies only → Database records remain → Auto-login
```

**Why This Happens:**
- DrizzleAdapter creates sessions in PostgreSQL
- signOut() may not trigger adapter's deleteSession method
- Sessions have future expiration dates
- Next request finds valid session → auto-authenticates

### Secondary Issue: France "Already Exists"

**Root Cause:**
- Keycloak creates user in dive-v3-pilot on first broker login
- User persists in Keycloak database
- Second login attempts to create duplicate
- Keycloak shows "User with email X already exists" prompt

**Expected Behavior:**
- Should auto-link on second login (if configured)
- Should use existing user seamlessly

**Our Configuration:** First broker login flow not properly configured for auto-link

### Tertiary Issue: Multiple Integration Points

**Data Flows Through:**
```
Mock IdP Realm
   ↓ SAML/OIDC
Keycloak dive-v3-pilot (broker)
   ↓ Create user in dive-v3-pilot
   ↓ Issue JWT to NextAuth
NextAuth (DrizzleAdapter)
   ↓ Create user, account, session in PostgreSQL
   ↓ Set HttpOnly cookie
Browser
   ↓ Send cookie with requests
NextAuth auth() function
   ↓ Look up session in PostgreSQL
   ↓ If valid → Return session
Dashboard
```

**Problem Points:**
- Keycloak user persistence (not cleaned on logout)
- NextAuth session persistence (not cleaned on logout)
- Multiple layers to clean on logout

---

## 💡 PROPER SOLUTION (From Research)

### Component #1: Events Callback (AuthJS Approach)

**From AuthJS documentation:**
```typescript
// In NextAuth config:
events: {
  async signOut({ session, token }) {
    // Called when signOut() is invoked
    // Manually delete session from database here
    if (session) {
      await adapter.deleteSession(session.sessionToken);
    }
  }
}
```

**This is the missing piece!** AuthJS provides events callback for custom logic.

### Component #2: Frontchannel Logout (Koyukan Approach)

**From Medium article:**
```typescript
// /api/auth/frontchannel-logout/route.ts
export async function GET() {
  // Delete cookies
  cookies().delete('session-token');
  
  // Return HTML with postMessage
  return new NextResponse(`
    <script>
      localStorage.clear();
      window.parent.postMessage('logout-complete', '*');
    </script>
  `, { headers: { 'Content-Type': 'text/html' }});
}
```

**We have this!** But need to ensure it's being called.

### Component #3: Parent Listener (Koyukan Approach)

**From Medium article:**
```typescript
// In Providers component
useEffect(() => {
  const onMsg = async (e: MessageEvent) => {
    if (e.data === 'logout-complete') {
      await signOut({ redirect: false });
      location.href = '/';
    }
  };
  window.addEventListener('message', onMsg);
  return () => window.removeEventListener('message', onMsg);
}, []);
```

**We have this!** LogoutListener component.

---

## ✅ WHAT'S MISSING

### The Critical Missing Piece: events.signOut Callback

**We need to add to auth.ts:**
```typescript
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  
  // THIS IS MISSING:
  events: {
    async signOut({ session, token }) {
      console.log('[DIVE] signOut event - cleaning up database');
      
      if (session?.sessionToken) {
        // Manually delete session from database
        await db.delete(sessions).where(eq(sessions.sessionToken, session.sessionToken));
        console.log('[DIVE] Database session deleted');
      }
    }
  },
  
  // ... rest of config
});
```

**This is the AuthJS-recommended way to handle database cleanup on logout!**

---

## 🧪 TESTING PLAN (Before Implementing)

### Test #1: Verify Current Session Behavior

**Hypothesis:** signOut() does not delete database sessions

**Test:**
```
1. Login as Canada user
2. Check database: SELECT COUNT(*) FROM session; → Should show 1
3. Click logout
4. Check database again: SELECT COUNT(*) FROM session; → Probably still shows 1
5. Try to login again → Auto-logs in (proves session still valid)
```

### Test #2: After Adding events.signOut

**Hypothesis:** events.signOut will properly delete sessions

**Test:**
```
1. Login as Canada user
2. Check database: SELECT COUNT(*) FROM session; → Shows 1
3. Click logout (with events.signOut implemented)
4. Console should show: "[DIVE] signOut event - cleaning up database"
5. Check database: SELECT COUNT(*) FROM session; → Should show 0
6. Try to login again → Should show login form (not auto-login)
```

### Test #3: France "Already Exists"

**Current State:** Pierre exists in Keycloak dive-v3-pilot

**Options:**
A. Delete Pierre properly (cascade all FK constraints)
B. Configure auto-link in first broker login flow
C. Accept first-time account linking UX

**Recommendation:** Option C for pilot (accept the UX, document it)

---

## 📋 IMPLEMENTATION PLAN (Best Practice)

### Phase 1: Add events.signOut Callback (30 min)

**File:** `frontend/src/auth.ts`

**Add:**
```typescript
events: {
  async signOut({ session }) {
    if (session?.sessionToken) {
      await db.delete(sessions).where(eq(sessions.sessionToken, session.sessionToken));
    }
  }
}
```

**Test:** Verify session deleted from database after logout

### Phase 2: Verify Frontchannel Logout (15 min)

**Already Implemented:**
- ✅ logout-callback route (returns HTML with postMessage)
- ✅ LogoutListener component (receives postMessage)
- ✅ Integrated into layout

**Test:** Verify postMessage flow works

### Phase 3: Handle Pierre "Already Exists" (15 min)

**Options:**
A. Delete Pierre before each test (manual)
B. Document first-time linking UX (acceptable for pilot)
C. Custom first broker login flow (complex)

**Recommendation:** Option B - Document it as expected behavior

### Phase 4: Comprehensive Testing (60 min)

**Test Matrix:**
- Logout from each IdP (France, Canada, Industry)
- Verify no auto-login
- Verify all sessions cleaned
- Verify resources inaccessible after logout

---

## 🎓 KEY LEARNINGS

### From AuthJS Documentation:

**Quote:**
> "Database Adapters are the bridge we use to connect Auth.js to your database."

**Learning:** Adapter behavior varies. DrizzleAdapter may not auto-delete sessions.

### From Koyukan Article:

**Quote:**
> "The root cause is always the same: three distinct session layers (Keycloak SSO, NextAuth.js cookies, and browser state) falling out of sync."

**Learning:** Must handle ALL three layers. Can't just clear one.

### From Reddit Discussion:

**Common Issue:** Database sessions not deleting on signOut

**Solution:** Use events callback to manually delete

---

## ✅ RECOMMENDED APPROACH

**Do NOT patch or fix quickly. Follow this sequence:**

1. **Add events.signOut callback to auth.ts** (AuthJS recommended approach)
2. **Test logout thoroughly** (verify database session deleted)
3. **Keep frontchannel logout** (Keycloak SSO layer)
4. **Keep LogoutListener** (iframe postMessage pattern)
5. **Document Pierre behavior** (first-time linking is acceptable)
6. **Create automated test** (verify session count before/after logout)

**Estimated Time:** 2 hours for proper implementation + testing

---

## 🚀 NEXT STEPS (Proper Sequence)

1. **Implement events.signOut** in auth.ts
2. **Add session deletion test** to integration tests
3. **Test manually** (check database before/after)
4. **Verify all 3 layers cleaned**
5. **Document expected behaviors**
6. **Final manual testing** (all 3 IdPs)

---

**Status:** ⏸️ PAUSED - Full QA complete  
**Next:** Implement events.signOut callback (proper AuthJS pattern)  
**No shortcuts:** Following documented best practices only

**Ready to implement the proper solution based on this analysis.**

