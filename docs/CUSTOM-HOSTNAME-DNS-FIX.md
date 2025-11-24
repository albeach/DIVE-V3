# Custom Hostname DNS Configuration Fix

## Problem Summary

After deploying DIVE V3 with a custom hostname (e.g., `kas.js.usa.divedeeper.internal`):

### Symptoms
1. ❌ Browser cannot reach `https://kas.js.usa.divedeeper.internal:3000` at all
2. ❌ `https://localhost:3000` works but shows 400 errors like:
   ```
   GET https://kas.js.usa.divedeeper.internal:4000/api/idps/public
   ERR_NAME_NOT_RESOLVED
   ```

### Root Cause

**The CLIENT machine (where your browser runs) cannot resolve the custom hostname.**

While the deployment correctly configured:
- ✅ Server-side DNS/hostname
- ✅ SSL certificates for the custom hostname
- ✅ Docker environment variables
- ✅ Keycloak redirect URIs

The **client browser machine** lacks DNS configuration to translate the custom hostname to the server's IP address.

## Architecture Understanding

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT MACHINE                               │
│  ┌───────────────────────────────────────────────────┐          │
│  │  Browser                                           │          │
│  │  1. User types: kas.js.usa.divedeeper.internal:3000│          │
│  │  2. Browser asks OS: "What IP is this?"            │          │
│  │  3. OS checks /etc/hosts (or DNS)                  │          │
│  │  4. ❌ NOT FOUND → ERR_NAME_NOT_RESOLVED           │          │
│  └───────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                             ↕ CANNOT CONNECT
┌─────────────────────────────────────────────────────────────────┐
│                     SERVER MACHINE (10.x.x.x)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Next.js     │  │  Backend     │  │  Keycloak    │          │
│  │  :3000       │  │  :4000       │  │  :8443       │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  All services listening on kas.js.usa.divedeeper.internal       │
└─────────────────────────────────────────────────────────────────┘
```

## Solution

### On the SERVER (Ubuntu machine running DIVE V3)

1. **Run diagnostics** (already deployed):
   ```bash
   ./scripts/diagnose-custom-hostname.sh
   ```

2. **Get the server IP**:
   ```bash
   ip route get 1 | awk '{print $7}' | head -1
   # Example output: 10.100.50.25
   ```

### On YOUR CLIENT MACHINE (where you run the browser)

#### Linux/Mac
```bash
# Get server IP from deployment output
SERVER_IP="10.100.50.25"  # Replace with your actual server IP
HOSTNAME="kas.js.usa.divedeeper.internal"  # Your custom hostname

# Add to /etc/hosts
echo "$SERVER_IP $HOSTNAME" | sudo tee -a /etc/hosts

# Verify
ping $HOSTNAME
nslookup $HOSTNAME
```

#### Windows (Run as Administrator)
```cmd
REM Replace with your actual server IP
set SERVER_IP=10.100.50.25
set HOSTNAME=kas.js.usa.divedeeper.internal

REM Add to hosts file
echo %SERVER_IP% %HOSTNAME% >> C:\Windows\System32\drivers\etc\hosts

REM Verify (use ping)
ping %HOSTNAME%
```

#### Corporate DNS (Recommended for Production)
Contact your network administrator to add a DNS A record:
```
kas.js.usa.divedeeper.internal → 10.100.50.25
```

## Verification Steps

After configuring DNS on your client machine:

1. **Test DNS resolution**:
   ```bash
   ping kas.js.usa.divedeeper.internal
   # Should show: 64 bytes from 10.100.50.25...
   ```

2. **Test HTTPS connectivity**:
   ```bash
   curl -k https://kas.js.usa.divedeeper.internal:3000
   curl -k https://kas.js.usa.divedeeper.internal:4000/api/health
   curl -k https://kas.js.usa.divedeeper.internal:8443/health
   ```

3. **Open in browser**:
   ```
   https://kas.js.usa.divedeeper.internal:3000
   ```
   
   You may see SSL warnings (see below) but the page should load.

## Optional: SSL Certificate Trust (Avoid Browser Warnings)

The server uses self-signed mkcert certificates. To avoid browser warnings:

### 1. Copy Root CA from Server
```bash
# On your client machine
scp user@10.100.50.25:~/DIVE-V3/DIVE-V3/certs/mkcert/rootCA.pem .
```

### 2. Install Root CA on Client

#### macOS
```bash
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain rootCA.pem
```

#### Linux (Ubuntu/Debian)
```bash
sudo cp rootCA.pem /usr/local/share/ca-certificates/dive-v3-ca.crt
sudo update-ca-certificates
```

#### Windows
1. Double-click `rootCA.pem`
2. Click "Install Certificate"
3. Select "Local Machine"
4. Choose "Trusted Root Certification Authorities"
5. Click "Finish"

#### Browser-Only (Chrome/Edge)
1. Settings → Privacy and Security → Security
2. Manage Certificates → Trusted Root Certification Authorities
3. Import → Select `rootCA.pem`

## Why This Happens

### The Deployment Is Correct

The `deploy-ubuntu.sh` script correctly:
1. ✅ Generates SSL certificates for the custom hostname
2. ✅ Creates `docker-compose.hostname.yml` with proper environment variables:
   - `NEXT_PUBLIC_API_URL=https://kas.js.usa.divedeeper.internal:4000`
   - `NEXT_PUBLIC_KEYCLOAK_URL=https://kas.js.usa.divedeeper.internal:8443`
3. ✅ Configures Keycloak redirect URIs
4. ✅ Sets CORS allowed origins

### The Client Machine Is Not

When you access `localhost:3000` from the server itself:
- ✅ Works because `localhost` always resolves to `127.0.0.1`

When you access `kas.js.usa.divedeeper.internal:3000` from a remote client:
- ❌ Fails because the client OS doesn't know what IP address that is

When the frontend loads and tries to call:
```javascript
fetch('https://kas.js.usa.divedeeper.internal:4000/api/idps/public')
```
- ❌ Browser cannot resolve the hostname → `ERR_NAME_NOT_RESOLVED`

## Common Mistakes

### ❌ WRONG: Only configuring DNS on the server
The server already knows about the hostname through Docker networking. **The client needs DNS configuration.**

### ❌ WRONG: Expecting it to work without DNS
Custom hostnames require either:
- Corporate DNS records, or
- `/etc/hosts` entries on **every** client machine

### ❌ WRONG: Using IP address in browser
`https://10.100.50.25:3000` may work but:
- SSL certificate won't match (browser warnings)
- Keycloak redirects will use hostname (breaks auth flow)
- Frontend hardcoded URLs use hostname (API calls fail)

### ✅ CORRECT: Configure client DNS first
Before accessing DIVE V3, ensure the custom hostname resolves on the client machine.

## Quick Reference

| Scenario | Solution |
|----------|----------|
| Deploying for yourself only | Use `localhost` (option 1 during deployment) |
| Deploying for team access | Use custom hostname + client DNS configuration |
| Testing remotely | Add `/etc/hosts` entry on your laptop |
| Production deployment | Use corporate DNS A record |
| Demo to partners | Share `/etc/hosts` instruction + mkcert CA |

## Troubleshooting

### Issue: `ERR_NAME_NOT_RESOLVED`
**Cause**: Client DNS not configured  
**Fix**: Add hostname to client's `/etc/hosts` (see above)

### Issue: SSL Certificate Warnings
**Cause**: Browser doesn't trust mkcert CA  
**Fix**: Install `rootCA.pem` on client (optional, see above)

### Issue: 404 Not Found from Backend
**Cause**: Docker services need restart after hostname change  
**Fix**: `docker compose restart`

### Issue: Keycloak Redirect Errors
**Cause**: Terraform redirect URIs not updated  
**Fix**: `cd terraform && terraform apply`

### Issue: Works on Server but Not Remotely
**Cause**: **This is THE problem - client DNS not configured**  
**Fix**: Follow client DNS configuration steps above

## For Network Administrators

### Firewall Rules Required
```
Allow TCP 3000  (Frontend - Next.js)
Allow TCP 4000  (Backend API - Express)
Allow TCP 8443  (Keycloak Admin/Auth)
Allow TCP 9443  (External IdPs - Spain SAML)
Allow TCP 9082  (External IdPs - USA OIDC)
```

### DNS A Record
```
kas.js.usa.divedeeper.internal.  IN  A  10.100.50.25
```

### Internal vs External Access
- **Internal**: Clients on same network use private IP
- **External**: Configure reverse proxy + public DNS
- **VPN**: Clients connect to VPN, then use internal DNS

## Summary

1. **Root Cause**: Client machines cannot resolve custom hostname
2. **Fix**: Add DNS entry (corporate DNS or `/etc/hosts`) on **CLIENT** machines
3. **Verification**: `ping kas.js.usa.divedeeper.internal` should work from client
4. **Optional**: Install mkcert Root CA to avoid SSL warnings

The deployment is correct - the issue is purely DNS resolution on client machines.

---

**Related Files**:
- `scripts/diagnose-custom-hostname.sh` - Comprehensive diagnostics
- `scripts/deploy-ubuntu.sh` - Shows DNS instructions at end
- `docker-compose.hostname.yml` - Generated hostname configuration


