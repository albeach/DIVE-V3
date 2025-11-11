# WebAuthn Fix - Complete Resolution Steps

## ✅ Configuration Verified
The WebAuthn Policy is **correctly configured** for all realms:
- ✅ rpId: `dive25.com`
- ✅ userVerificationRequirement: `required` (AAL3)
- ✅ All 11 realms configured

## 🔄 Required Steps to Clear Cache and Apply Fix

### Step 1: Clear Keycloak Sessions
You need to **invalidate existing Keycloak sessions** because the old WebAuthn configuration might be cached in active sessions.

**Option A: Clear Sessions via Admin Console**
1. Go to: https://dev-auth.dive25.com/admin
2. Login as admin
3. Select realm: **dive-v3-pol**
4. Navigate to: **Sessions** → **Revoke all sessions**
5. Click **"Revoke"** button

**Option B: Clear Sessions via REST API (Faster)**
```bash
cd /home/mike/Desktop/DIVE-V3/DIVE-V3/backend
npm run clear-keycloak-sessions
```

### Step 2: Clear Browser Cache & Cookies
**Complete browser reset:**

1. **Chrome/Edge:**
   - Press `Ctrl+Shift+Delete` (Windows/Linux) or `Cmd+Shift+Delete` (Mac)
   - Select **"All time"**
   - Check: ✅ Cookies and other site data
   - Check: ✅ Cached images and files
   - Click **"Clear data"**

2. **Firefox:**
   - Press `Ctrl+Shift+Delete`
   - Select **"Everything"**
   - Check all boxes
   - Click **"Clear Now"**

3. **Safari:**
   - Safari menu → **Preferences** → **Privacy** → **Manage Website Data** → **Remove All**

### Step 3: Test in Incognito/Private Window (CRITICAL)
This bypasses all cache issues:

1. **Open a NEW incognito/private window**
2. Navigate to: https://dev-app.dive25.com
3. Click **Sign In**
4. Select **Poland (POL)** realm
5. Enter credentials:
   - Username: `testuser-pol-ts`
   - Password: `DiveDemo2025!`
6. You should see the WebAuthn registration page **without errors**

### Step 4: Check Browser Console for Errors
If you still see errors, open the browser's developer console:

1. Press `F12` (or `Cmd+Option+I` on Mac)
2. Go to **Console** tab
3. Look for errors (red text)
4. Common issues:
   - **SecurityError**: Not using HTTPS (make sure URL starts with `https://`)
   - **NotAllowedError**: User closed the browser prompt
   - **NotSupportedError**: Browser doesn't support WebAuthn

## 🔧 Alternative: Restart Keycloak (If Above Steps Don't Work)

Sometimes Keycloak needs a full restart to reload configuration:

```bash
# Find Keycloak container
docker ps | grep keycloak

# Restart Keycloak
docker restart <keycloak-container-id>

# Or use docker-compose
cd /home/mike/Desktop/DIVE-V3/DIVE-V3
docker-compose restart keycloak

# Wait 30 seconds for Keycloak to fully restart
sleep 30

# Verify it's running
curl -k https://dev-auth.dive25.com/health
```

## 🧪 Testing Checklist

- [ ] Configuration verified (`npm run verify-webauthn`) ✅ DONE
- [ ] Keycloak sessions cleared
- [ ] Browser cache/cookies cleared
- [ ] Tested in incognito/private window
- [ ] Checked browser console for errors
- [ ] Using HTTPS (not HTTP)
- [ ] WebAuthn registration page loads without "internal server error"
- [ ] Successfully registered a passkey
- [ ] Received AAL3 token (`acr: "2"`, `amr: ["pwd", "hwk"]`)

## 🐛 Debugging: If Still Not Working

### Check Keycloak Logs
```bash
# View Keycloak logs in real-time
docker logs -f keycloak --tail=100

# Or if using docker-compose
docker-compose logs -f keycloak --tail=100

# Look for WebAuthn-related errors
```

### Check Required Action Configuration
```bash
cd /home/mike/Desktop/DIVE-V3/DIVE-V3/backend
npm run check-required-actions
```

### Check User's Required Actions
The user might need the required action re-added:
1. Go to: https://dev-auth.dive25.com/admin
2. Select realm: **dive-v3-pol**
3. Navigate to: **Users** → Search for `testuser-pol-ts`
4. Click on the user
5. Go to **Credentials** tab
6. Verify WebAuthn credentials section
7. Go to **Required Actions** tab
8. If not present, add: **"Webauthn Register"**

## 📊 Expected Result After Fix

When you login as `testuser-pol-ts`, you should see:

1. **Username/Password screen** → Enter credentials
2. **WebAuthn Registration Page** (Keycloak-hosted):
   - Title: "WebAuthn Register"
   - Instructions for registering passkey
   - Button: "Register Security Key"
   - **NO "internal server error"**
3. **Browser Prompt**: "Create a passkey for dev-auth.dive25.com"
4. **Authenticate** with your chosen method (1Password, YubiKey, Windows Hello, etc.)
5. **Success**: Redirected back to application
6. **Verify AAL3**: Token should have `acr: "2"` and `amr: ["pwd", "hwk"]`

## 🆘 Still Not Working?

If after all these steps it's still failing, we need to investigate further:

1. **Capture the exact error**:
   - Take a screenshot of the error page
   - Copy the full URL when the error occurs
   - Check browser console for JavaScript errors
   - Check Keycloak logs for server-side errors

2. **Verify the WebAuthn JavaScript is loading**:
   ```bash
   curl -k https://dev-auth.dive25.com/realms/dive-v3-pol/login-actions/required-action?execution=webauthn-register
   # Check if the response contains the WebAuthn JavaScript
   ```

3. **Test with a different browser**:
   - Try Firefox if using Chrome
   - Try Edge if using Firefox
   - Ensure browser supports WebAuthn (all modern browsers do)

---

**Next Step**: Please follow the steps above, starting with clearing Keycloak sessions and testing in an incognito window. Let me know the exact error you see and any console errors.


