# Disabling Cloudflare Access for Development

## Problem

The Cloudflare tunnel applications (`dev-api.dive25.com`, `dev-auth.dive25.com`) have **Cloudflare Access authentication** enabled, which blocks the frontend from making API calls. This causes errors like:

```
Refused to connect to 'https://dive25.cloudflareaccess.com/...' because it violates the following Content Security Policy directive
```

## Solution: Disable Cloudflare Access

### Step 1: Log into Cloudflare Zero Trust Dashboard

1. Go to: https://one.dash.cloudflare.com/
2. Select your account
3. Navigate to **Access** → **Applications**

### Step 2: Disable or Remove Access Policies

You should see three applications:
- `dev-app.dive25.com` (Frontend - should be public ✅)
- `dev-api.dive25.com` (Backend API - **needs to be public**)
- `dev-auth.dive25.com` (Keycloak - **needs to be public**)

For **dev-api.dive25.com** and **dev-auth.dive25.com**:

**Option A: Disable the Application**
1. Click on the application
2. Click **Edit** or **Configure**
3. Toggle **Application status** to **Disabled**
4. Save

**Option B: Remove Access Policy (Recommended)**
1. Click on the application
2. Go to **Policies** tab
3. Delete all policies OR add a policy that allows everyone:
   - Policy name: `Allow All (Dev)`
   - Action: `Allow`
   - Rules: `Emails ending in` → `@example.com` (or use `Everyone` if available)

**Option C: Add Bypass Rule for Service Tokens**
1. Create a service token for your services
2. Add a bypass rule using the service token
3. Configure the tunnel to send the service token header

### Step 3: Verify Access is Disabled

Test the endpoints:

```bash
# Should return 200 OK (not 302 redirect)
curl -I https://dev-api.dive25.com/health
curl -I https://dev-api.dive25.com/api/idps/public
curl -I https://dev-auth.dive25.com
```

If you see `HTTP/2 200` or `HTTP/2 404`, Access is disabled ✅  
If you see `HTTP/2 302` redirect to `cloudflareaccess.com`, Access is still enabled ❌

## Alternative: Use Localhost for Development

If you cannot disable Cloudflare Access, configure the application to use localhost URLs instead:

### Update `docker-compose.yml`:

```yaml
  nextjs:
    environment:
      # Use localhost instead of Cloudflare tunnel
      NEXT_PUBLIC_BACKEND_URL: https://localhost:4000
      NEXT_PUBLIC_KEYCLOAK_URL: https://localhost:8443
      # Keep Cloudflare for external access only
      NEXTAUTH_URL: https://dev-app.dive25.com
```

This allows:
- ✅ Browser accesses frontend via Cloudflare tunnel
- ✅ Frontend makes API calls to localhost (bypasses Cloudflare Access)
- ✅ Users can access the app from anywhere

### Update Terraform Redirect URIs:

Ensure Keycloak allows both:
```hcl
valid_redirect_uris = [
  "https://dev-app.dive25.com/*",
  "https://localhost:3000/*",
]
```

## Why This Happens

Cloudflare Access is a Zero Trust security layer that requires authentication before accessing applications. While this is great for production, it breaks development workflows where:

1. Frontend needs to make unauthenticated API calls (e.g., `/api/idps/public`)
2. Service-to-service communication should bypass user authentication
3. Keycloak needs to be publicly accessible for OAuth flows

## Security Note

⚠️ **For Development Only**: These applications are exposed on a `dev-*` subdomain with self-signed certificates. Do NOT use this configuration in production.

For production:
- ✅ Enable Cloudflare Access with proper policies
- ✅ Use service tokens for service-to-service communication
- ✅ Implement API key authentication for public endpoints
- ✅ Use valid SSL certificates from a trusted CA

## Next Steps

After disabling Cloudflare Access:

1. Reload the browser: https://dev-app.dive25.com
2. The IdP selector should load successfully
3. You can select an IdP and authenticate via Keycloak
4. Resources page should work without CORS errors

## Troubleshooting

### Still seeing 302 redirects?

```bash
# Check Cloudflare Access logs
# Go to: https://one.dash.cloudflare.com/ → Access → Logs

# Verify DNS records point to tunnel
cloudflared tunnel route dns dive-v3-tunnel dev-api.dive25.com
cloudflared tunnel route dns dive-v3-tunnel dev-auth.dive25.com
```

### CSP errors?

The frontend CSP has been updated to allow `dive25.cloudflareaccess.com`, but the app will still fail if Access is enabled. You must disable Access for development.





