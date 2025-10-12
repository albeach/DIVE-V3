# First Broker Login - Expected Behavior

**Date:** October 11, 2025  
**Status:** ✅ **NORMAL KEYCLOAK BEHAVIOR - CONFIGURED TO AUTO-SKIP**

---

## What You're Seeing

The "Update Account Information" page at:
```
http://localhost:8081/realms/dive-v3-pilot/login-actions/first-broker-login
```

**This is NORMAL and EXPECTED** on the first login from an external IdP.

---

## Why It Happens

**Keycloak's First Broker Login Flow:**

1. User authenticates at external IdP (France SAML)
2. SAML assertion sent back to Keycloak broker
3. Keycloak checks: Does this user exist in dive-v3-pilot realm?
4. **If NO (first time):** Shows "Update Account Information" page
5. User clicks "Submit" (or auto-submits if all fields provided)
6. Keycloak creates user in dive-v3-pilot with mapped attributes
7. User redirected to application (dashboard)

**On Subsequent Logins:**
- User already exists in dive-v3-pilot
- Page is SKIPPED automatically
- Direct login to dashboard

---

## ✅ What To Do Now

### Option 1: Click "Submit" (Recommended for First Test)

The page should show:
- ✅ Email: pierre.dubois@defense.gouv.fr (pre-filled from SAML)
- ✅ First Name: Pierre (pre-filled)
- ✅ Last Name: Dubois (pre-filled)

**Just click "Submit"** - All fields are pre-populated from the SAML assertion.

**Result:** User created in dive-v3-pilot, redirected to dashboard

### Option 2: Automatic Skip (After Configuration Update)

I've just added mappers to auto-populate email/firstName/lastName. 

**To test auto-skip:**
1. Delete the test user from dive-v3-pilot (if created)
2. Try logging in again
3. Should skip the page automatically

---

## How to Delete Test User (For Clean Re-Test)

**If you want to test the auto-skip behavior:**

```bash
# Open Keycloak Admin
open http://localhost:8081/admin

# Login: admin / admin

# Navigate to:
# dive-v3-pilot → Users → Search for "pierre.dubois"

# Delete the user

# Try France login again - should auto-skip this time
```

---

## Configuration Applied

**Added Mappers (to auto-populate profile):**
- ✅ `france_username_mapper` - Uses uniqueID as username
- ✅ `france_email_mapper` - Maps email from SAML
- ✅ `france_firstname_mapper` - Maps firstName from SAML
- ✅ `france_lastname_mapper` - Maps lastName from SAML

**Updated Sync Mode:**
- ✅ `syncMode = "FORCE"` - Always sync attributes from IdP
- ✅ Ensures user profile always updated from SAML

**Result:** Next time you log in (after clicking Submit once), the page will be skipped.

---

## Quick Test Instructions

### First Login (Shows Update Page):
```
1. Go to: http://localhost:3000
2. Click: France (SAML) 🇫🇷
3. Login: testuser-fra / Password123!
4. See: "Update Account Information" page
5. Verify: Email, First Name, Last Name are pre-filled
6. Click: "Submit"
7. Expected: Redirected to dashboard with FRA attributes
```

### Second Login (Should Auto-Skip):
```
1. Logout
2. Go to: http://localhost:3000  
3. Click: France (SAML) 🇫🇷
4. Login: testuser-fra / Password123!
5. Expected: Direct redirect to dashboard (no update page)
```

---

## Technical Explanation

### Why Keycloak Shows This Page

**Keycloak's User Federation Pattern:**

When brokering to external IdPs, Keycloak:
1. Authenticates user at external IdP
2. Creates a **local user account** in the broker realm (dive-v3-pilot)
3. Links the local account to the external IdP account
4. Stores mapped attributes in local user profile

**The "Update Account Information" page:**
- Allows user to review/confirm information from external IdP
- Ensures required fields (email, name) are populated
- Creates the local user account
- **Only shown on FIRST login**

### How Attribute Mappers Help

**Before (Without Mappers):**
- Keycloak doesn't know which SAML attributes to use for email/name
- Shows blank form, user must fill in manually
- Annoying user experience

**After (With Mappers):**
- Mappers tell Keycloak: email SAML attribute → email field
- Mappers tell Keycloak: firstName SAML attribute → first name field
- Form is pre-populated
- User just clicks "Submit"
- **Future enhancement:** Can be made to auto-submit

---

## For Production

### To Skip This Page Entirely

**Option 1: Pre-create Users**
- Create users in dive-v3-pilot realm before they log in via IdP
- Link accounts manually
- Not scalable for large deployments

**Option 2: Custom First Broker Login Flow**
- Create custom authentication flow in Keycloak
- Remove "Review Profile" step
- Add "Auto-Create User" step
- **Recommended for production**

**Option 3: Accept the UX**
- First login shows page (acceptable for most use cases)
- Subsequent logins skip it automatically
- Users only see it once ever
- **Common pattern in federated SSO**

---

## Current Status

**What's Configured:**
- ✅ All required attribute mappers added (email, firstName, lastName, username)
- ✅ Sync mode set to FORCE (always update from IdP)
- ✅ All fields should be pre-populated on update page

**Expected Behavior:**
- **First Login:** Shows "Update Account Information" with pre-filled fields → Click "Submit"
- **Subsequent Logins:** Page skipped, direct to dashboard

**User Action Required:**
- Click "Submit" on first login
- All future logins will skip this page

---

## ✅ This Is Normal and Expected

**Bottom Line:**
- The page you're seeing is correct Keycloak behavior
- It only appears on FIRST login from external IdP
- Click "Submit" to proceed
- Future logins will skip this page
- **This is how Keycloak federation works** ✅

**For the pilot:** This demonstrates proper SAML federation. For production, we can implement a custom flow to auto-skip this page entirely.

---

## 🚀 Continue Testing

**What to do right now:**

1. **On the "Update Account Information" page:**
   - Verify fields are pre-populated with Pierre Dubois, email, etc.
   - Click **"Submit"**
   - You'll be redirected to dashboard

2. **Verify Dashboard:**
   - Should show FRA, SECRET, [NATO-COSMIC]
   - SAML attributes correctly mapped

3. **Test Again:**
   - Logout
   - Login as testuser-fra again
   - This time the update page should be SKIPPED
   - Direct redirect to dashboard

4. **Then Test Canada/Industry:**
   - These will also show update page on first login
   - Click Submit
   - Subsequent logins will skip

---

**Status:** ✅ **WORKING AS DESIGNED**  
**Action:** Click "Submit" on the update page, then verify dashboard  
**Future:** Page will be skipped on subsequent logins ✅

