# Delete Test User & Re-Test SAML

**What Happened:** First login created a partial user with only username  
**Fix Applied:** Added SAML property mappers for email, firstName, lastName  
**Action Required:** Delete the partial user and test again  

---

## ✅ Step 1: Delete Partial User from dive-v3-pilot

```bash
# Open Keycloak Admin Console
open http://localhost:8081/admin

# Login:
Username: admin
Password: admin

# Navigate to:
1. Select realm: dive-v3-pilot (top-left dropdown)
2. Click: Users (left sidebar)
3. Search for: pierre.dubois
4. Click on the user
5. Click "Delete" button
6. Confirm deletion
```

**OR use this direct link:**
```
http://localhost:8081/admin/dive-v3-pilot/console/#/dive-v3-pilot/users
```

---

## ✅ Step 2: Test France SAML Again

```bash
# 1. Clear browser cookies (or use incognito window)

# 2. Go to:
open http://localhost:3000

# 3. Click: "France (SAML)" 🇫🇷

# 4. Login:
Username: testuser-fra
Password: Password123!

# 5. Expected NOW (with fix applied):
Update Account Information page should show:
  ✅ Username: pierre.dubois@defense.gouv.fr (pre-filled)
  ✅ Email: pierre.dubois@defense.gouv.fr (pre-filled) ← NEW
  ✅ First name: Pierre (pre-filled) ← NEW
  ✅ Last name: Dubois (pre-filled) ← NEW

# 6. Click: "Submit"

# 7. Expected: Dashboard shows FRA, SECRET, [NATO-COSMIC]
```

---

## What Was Fixed

**SAML Client Mappers (france-mock-idp realm):**
Added property mappers to send user profile fields in SAML assertion:
- ✅ `email-property-mapper` - Sends email in SAML assertion
- ✅ `firstName-property-mapper` - Sends first name in SAML assertion
- ✅ `lastName-property-mapper` - Sends last name in SAML assertion

**SAML IdP Broker Mappers (dive-v3-pilot realm):**
Already configured to receive these attributes:
- ✅ `france-email-mapper` - Receives email from SAML
- ✅ `france-firstname-mapper` - Receives firstName from SAML
- ✅ `france-lastname-mapper` - Receives lastName from SAML

**Result:** All fields should now be pre-populated from SAML assertion

---

## Future Logins

**After first successful login:**
- User account exists in dive-v3-pilot
- "Update Account Information" page will be **SKIPPED**
- Direct login to dashboard
- **No need to click Submit again**

---

## If Fields Still Not Pre-Filled

**Option: Just fill them in manually this ONE time:**

```
Email: pierre.dubois@defense.gouv.fr
First name: Pierre
Last name: Dubois

Click Submit
```

**Then check:**
- Dashboard should show correct FRA attributes
- Future logins will be automatic (page skipped)

**This is acceptable for pilot** - first login account setup is common in federated SSO

---

**Action Now:** Delete the user from dive-v3-pilot realm and test France SAML login again! The fields should now be pre-filled. 🚀

