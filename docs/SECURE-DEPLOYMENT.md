# DIVE V3 - Secure/Air-Gapped Deployment Guide

## Overview

This guide documents the security improvements made to eliminate third-party dependencies and enable deployment in secure, classified, or air-gapped environments.

## ✅ Security Improvements Implemented

### 1. **Self-Contained Flag Icons**
- **Before**: Emoji-based flags relying on system emoji fonts and potential CDN fallbacks
- **After**: Inline SVG flag components with no external dependencies
- **Location**: `frontend/src/components/ui/flags.tsx`
- **Benefits**: 
  - No CORS issues
  - Consistent rendering across all platforms
  - Works in air-gapped networks
  - No external font dependencies

### 2. **System Fonts (No Google Fonts)**
- **Before**: Google Fonts CDN for Inter and Roboto Mono
- **After**: Optimized system font stacks
- **Location**: 
  - `frontend/src/app/layout.tsx` (removed Google Fonts imports)
  - `frontend/src/app/globals.css` (added system font CSS variables)
- **Font Stacks**:
  ```css
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, 
               "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, 
               Consolas, "Liberation Mono", "Courier New", monospace;
  ```
- **Benefits**:
  - No external requests on page load
  - Faster load times
  - Native font rendering
  - Works offline/air-gapped

### 3. **Configurable Content Security Policy (CSP)**
- **Before**: Hard-coded Cloudflare analytics domains
- **After**: Opt-in external resources via environment variables
- **Location**: `frontend/src/middleware.ts`
- **New Environment Variables**:
  - `NEXT_PUBLIC_ALLOW_EXTERNAL_ANALYTICS=false` (default: disabled)
  - `NEXT_PUBLIC_EXTERNAL_DOMAINS=""` (default: empty)
- **Benefits**:
  - Secure by default
  - No third-party connections unless explicitly configured
  - Meets DoD/NATO security requirements

### 4. **Enhanced Security Headers**
Added additional security headers in middleware:
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `Referrer-Policy: strict-origin-when-cross-origin` - Limits referrer info
- `Permissions-Policy` - Disables geolocation, microphone, camera

### 5. **Self-Hosted Assets**
All application assets are bundled:
- Logo: `frontend/public/DIVE-Logo.png`
- Favicons: `frontend/public/favicon.ico`, `favicon.svg`
- Animations: `frontend/public/animations/*.json` (Lottie files)
- No external CDNs or third-party resources

## 🔒 Secure Environment Configuration

### Environment Variables for Air-Gapped Deployment

Create a `.env.local` file with the following configuration:

```bash
# ============================================
# DIVE V3 - Secure Environment Configuration
# ============================================

# Authentication & Session
NEXTAUTH_URL=https://your-secure-domain.mil
NEXTAUTH_SECRET=your-generated-secret-minimum-32-chars

# Keycloak Identity Provider
NEXT_PUBLIC_KEYCLOAK_URL=https://keycloak.your-domain.mil
KEYCLOAK_CLIENT_ID=dive-v3-client
KEYCLOAK_CLIENT_SECRET=your-keycloak-client-secret
KEYCLOAK_ISSUER=https://keycloak.your-domain.mil/realms/dive-v3-broker

# Backend API
NEXT_PUBLIC_BACKEND_URL=https://api.your-domain.mil
NEXT_PUBLIC_API_URL=https://api.your-domain.mil

# Database
DATABASE_URL=postgresql://user:password@db.your-domain.mil:5432/dive_v3

# Security Settings - Air-Gapped Mode
NEXT_PUBLIC_ALLOW_EXTERNAL_ANALYTICS=false
NEXT_PUBLIC_EXTERNAL_DOMAINS=

# OPA Policy Engine
NEXT_PUBLIC_OPA_URL=https://opa.your-domain.mil
OPA_URL=https://opa.your-domain.mil

# MongoDB
MONGODB_URI=mongodb://mongo.your-domain.mil:27017/dive_v3

# KAS (Optional)
NEXT_PUBLIC_KAS_URL=https://kas.your-domain.mil
KAS_URL=https://kas.your-domain.mil

# Logging
LOG_LEVEL=info
NEXTAUTH_DEBUG=false
```

## 📋 Pre-Deployment Checklist

Before deploying to a secure/classified environment:

- [ ] **Remove all external dependencies**
  - [x] No Google Fonts
  - [x] No emoji CDNs
  - [x] No analytics scripts (unless explicitly enabled)
  - [x] No third-party libraries loading from CDNs

- [ ] **Verify CSP Settings**
  - [x] `NEXT_PUBLIC_ALLOW_EXTERNAL_ANALYTICS=false`
  - [x] `NEXT_PUBLIC_EXTERNAL_DOMAINS=""` (empty)
  - [x] Test that no external requests are made

- [ ] **SSL/TLS Configuration**
  - [ ] Use organization's CA certificates
  - [ ] Set `NODE_TLS_REJECT_UNAUTHORIZED=1` (always validate)
  - [ ] Configure proper certificate chain

- [ ] **Network Isolation**
  - [ ] Deploy all services on internal network
  - [ ] No outbound internet access required
  - [ ] All DNS resolves to internal IPs

- [ ] **Asset Verification**
  - [x] All fonts are system fonts
  - [x] All icons are inline SVG
  - [x] All images are in `public/` directory
  - [x] No external asset references

## 🧪 Testing Air-Gapped Deployment

### 1. **Network Isolation Test**
```bash
# Block all external network access
sudo iptables -A OUTPUT -j DROP

# Start the application
npm run build
npm start

# Verify the application works without external access
curl http://localhost:3000
```

### 2. **CSP Compliance Test**
```bash
# Check for CSP violations in browser console
# Should see NO errors about blocked external resources
```

### 3. **Asset Loading Test**
```bash
# Verify all assets load from self-hosted sources
# Check Network tab in browser DevTools
# Filter for external domains - should be 0 requests
```

## 🛡️ Security Compliance

### DoD/NATO Requirements Met

1. **No External Dependencies** ✅
   - All resources self-hosted
   - No third-party services required
   - Works in air-gapped environments

2. **Content Security Policy** ✅
   - Strict CSP with no external scripts
   - Configurable for different security levels
   - Default deny policy

3. **Cryptographic Standards** ✅
   - JWT RS256 for token signing
   - TLS 1.2+ for all connections
   - No weak ciphers

4. **Access Control** ✅
   - ABAC with OPA
   - Clearance-based authorization
   - Releasability controls

5. **Audit Logging** ✅
   - All authentication attempts logged
   - All authorization decisions logged
   - PII minimization (log uniqueID only)

## 🚀 Build & Deployment

### Production Build

```bash
cd frontend
npm run build
npm start
```

### Docker Deployment

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production
EXPOSE 3000
CMD ["npm", "start"]
```

### Verification Steps

1. **No External Requests**
   ```bash
   # Monitor network traffic during startup
   tcpdump -i any -n 'not host localhost'
   # Should see ONLY internal IPs (Keycloak, API, DB)
   ```

2. **Font Rendering**
   - Open IdP selector page
   - Verify country flags render correctly
   - No console errors about missing fonts

3. **CSP Enforcement**
   - Check browser console for CSP violations
   - Should be zero violations

4. **Functionality Test**
   - Complete authentication flow
   - Access resources
   - Verify all features work without external access

## 📝 Migration Notes

### From Development to Secure Environment

1. **Update Environment Variables**
   - Replace `localhost` URLs with internal domain names
   - Set `NEXT_PUBLIC_ALLOW_EXTERNAL_ANALYTICS=false`
   - Clear `NEXT_PUBLIC_EXTERNAL_DOMAINS`

2. **SSL Certificates**
   - Install organization's CA certificates
   - Configure proper certificate validation
   - Update Keycloak to use internal CA

3. **DNS Configuration**
   - All domains should resolve internally
   - No external DNS queries required

4. **Firewall Rules**
   - Block outbound internet access
   - Allow only internal service communication

## 🔍 Troubleshooting

### Issue: Flags not rendering
**Solution**: Flags are now SVG components, not emojis. Clear browser cache and verify `frontend/src/components/ui/flags.tsx` is deployed.

### Issue: Fonts look different
**Solution**: System fonts are now used instead of Google Fonts. This is expected and provides better security. Fonts will vary slightly by OS.

### Issue: CSP violations in console
**Solution**: Check that all external domains are added to `NEXT_PUBLIC_EXTERNAL_DOMAINS` or disable external analytics with `NEXT_PUBLIC_ALLOW_EXTERNAL_ANALYTICS=false`.

### Issue: Authentication fails
**Solution**: Verify Keycloak URL is accessible from the frontend container and certificate validation is configured correctly.

## 📞 Support

For issues with secure deployment:
1. Check this documentation
2. Review `frontend/src/middleware.ts` for CSP configuration
3. Verify all environment variables are set correctly
4. Check application logs for detailed error messages

## 📚 Related Documentation

- [Security Specifications](./dive-v3-security.md)
- [Backend API Docs](./dive-v3-backend.md)
- [Keycloak Configuration](./keycloak-setup.md)
- [OPA Policy Guide](./opa-policy-development.md)

---

**Last Updated**: November 2025  
**Classification**: UNCLASSIFIED  
**Releasability**: PUBLIC RELEASE


