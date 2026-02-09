# Deeper Investigation Needed: ERR_ABORTED Persists

**Date**: 2026-02-08  
**Status**: 🔴 **BLOCKED - Different Root Cause**

---

## 📊 **What We've Tried**

### 1. ✅ Fixed CI Environment Variable
- Changed `process.env.CI` → `process.env.GITHUB_ACTIONS`
- **Result**: Still ERR_ABORTED

### 2. ✅ Used Correct Security Best Practice  
- Kept Docker binding at `127.0.0.1` (secure, per industry standards)
- Updated Playwright config to use `127.0.0.1` (explicit IPv4)
- **Result**: Still ERR_ABORTED

### 3. ✅ Verified curl Works
```bash
$ curl -k -I https://127.0.0.1:3000
HTTP/1.1 200 OK  # ✅ Works perfectly
```

### 4. ❌ Playwright Still Fails
```
Error: page.goto: net::ERR_ABORTED at https://127.0.0.1:3000/dashboard
```

---

## 🔍 **Evidence**

| Test | Result | Notes |
|------|--------|-------|
| `curl -k https://127.0.0.1:3000` | ✅ Works | Frontend is healthy |
| Docker container status | ✅ Healthy | All services running |
| `docker logs dive-hub-frontend` | ✅ Serving requests | GET / 200 OK |
| Playwright `page.goto('/')` | ❌ ERR_ABORTED | Browser can't connect |
| Playwright baseURL | ✅ Correct | `https://127.0.0.1:3000` |
| Playwright ignoreHTTPSErrors | ✅ True | Certs should be ignored |

---

## 💡 **Hypothesis: Chromium/Browser Issue**

### The Problem
- curl (Node.js) works → frontend is accessible
- Playwright's Chromium browser fails → browser-specific issue

### Possible Causes

1. **Chromium Security Policy**
   - Chromium may have stricter TLS/SSL requirements than curl
   - Even with `ignoreHTTPSErrors: true`, browser may block connection

2. **Browser Context Configuration**
   - Something in the browser context prevents navigation
   - May need additional browser args

3. **Certificate Trust Store**
   - Chromium doesn't trust the mkcert CA
   - Need to install mkcert CA in Chromium's trust store

4. **Proxy/Network Settings**
   - Playwright browser may be using different network settings
   - DNS resolution might be failing inside browser

---

## 🎯 **Next Steps to Try**

### Option A: Add Browser Args
```typescript
use: {
  launchOptions: {
    args: [
      '--ignore-certificate-errors',
      '--allow-insecure-localhost',
      '--disable-web-security'
    ]
  }
}
```

### Option B: Install mkcert CA for Chromium
```bash
# Install CA in system trust store
mkcert -install

# May need to restart Playwright browsers
npx playwright install --force
```

### Option C: Use HTTP Instead (Temporary)
```yaml
# docker-compose.yml - remove HTTPS temporarily to isolate issue
# If HTTP works, confirms it's a cert/TLS issue
```

### Option D: Check Playwright Browser Logs
```bash
# Enable verbose logging
DEBUG=pw:browser npx playwright test
```

---

## 📝 **Recommendation**

I recommend we:

1. **Try Option B first** (install mkcert CA)
2. **If that fails, try Option A** (add browser args)  
3. **If still fails, try Option D** (check browser logs for actual error)
4. **Last resort: Option C** (HTTP mode to isolate)

**User input needed**: Which option would you like to try first?

---

**Status**: Awaiting decision on next debugging step  
**Time Invested**: ~6 hours total  
**Confidence**: Medium (multiple unknowns remaining)
