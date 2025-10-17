# QUICK FIX - IdP Submission Not Working

**ROOT CAUSE FOUND:**

You're logged in, but either:
1. Your access token expired (session timeout)
2. Your user doesn't have the `super_admin` role

---

## IMMEDIATE FIX

### Option 1: Refresh Your Session

1. **Logout and login again:**
   ```
   Click Logout → Login again → Try submitting IdP
   ```

2. **Or refresh the page** (if token auto-refreshes)

### Option 2: Check Your User Role

**In browser console, run:**
```javascript
fetch('/api/auth/session')
  .then(r => r.json())
  .then(d => {
    console.log('Email:', d.user?.email);
    console.log('Roles:', d.user?.roles);
    console.log('Has super_admin?', d.user?.roles?.includes('super_admin'));
    console.log('Access Token exists?', !!d.accessToken);
  })
```

**If `Has super_admin? false`:**
- You need to add super_admin role in Keycloak
- Go to: http://localhost:8081/admin
- Login: admin / admin
- Users → Your user → Role mapping → Assign `super_admin`

**If `Access Token exists? false`:**
- Your session expired
- Logout and login again

---

## BETTER FIX (What I'm Building)

I'm adding:
1. **Up-front validation** in the form (validate URLs as you type)
2. **Session check** before submission (tell you if token expired)
3. **Detailed error messages** (show exact validation failures)
4. **Test Connection** button (validate config before submitting)

But first - **try the Immediate Fix above** and tell me if it works!

