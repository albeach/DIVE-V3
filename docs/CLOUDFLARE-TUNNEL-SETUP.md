# Cloudflare Zero Trust Tunnel Setup for DIVE V3

## Domain Structure

Your DIVE V3 application will be accessible at:

- **Frontend**: https://dev-app.dive25.com (Next.js UI)
- **Backend API**: https://dev-api.dive25.com (Express.js API)
- **Keycloak**: https://dev-auth.dive25.com (Authentication)

## Services to Expose

| Service | Local URL | Public URL | Port |
|---------|-----------|------------|------|
| Frontend | https://localhost:3000 | https://dev-app.dive25.com | 3000 |
| Backend | https://localhost:4000 | https://dev-api.dive25.com | 4000 |
| Keycloak | https://localhost:8443 | https://dev-auth.dive25.com | 8443 |

## Installation

### Prerequisites

1. Cloudflare account with Zero Trust access
2. Domain `dive25.com` configured in Cloudflare
3. Root/sudo access on `kas.js.usa.divedeeper.internal`

### Quick Setup

Run the automated setup script:

```bash
cd /home/mike/Desktop/DIVE-V3/DIVE-V3
sudo chmod +x scripts/setup-cloudflare-tunnel.sh
sudo ./scripts/setup-cloudflare-tunnel.sh
```

The script will:
1. Install `cloudflared`
2. Authenticate with your Cloudflare account
3. Create a tunnel named `dive-v3-tunnel`
4. Configure DNS records for `dev-*.dive25.com`
5. Install as a systemd service
6. Start the tunnel

### Manual Setup (Alternative)

If you prefer manual setup:

```bash
# 1. Install cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# 2. Authenticate
cloudflared tunnel login

# 3. Create tunnel
cloudflared tunnel create dive-v3-tunnel

# 4. Get tunnel ID
TUNNEL_ID=$(cloudflared tunnel list | grep dive-v3-tunnel | awk '{print $1}')

# 5. Create config
sudo mkdir -p ~/.cloudflared
sudo nano ~/.cloudflared/config.yml
```

Paste this configuration:

```yaml
tunnel: <YOUR_TUNNEL_ID>
credentials-file: /root/.cloudflared/<YOUR_TUNNEL_ID>.json

ingress:
  # Frontend (Next.js)
  - hostname: dev-app.dive25.com
    service: https://localhost:3000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  
  # Backend API
  - hostname: dev-api.dive25.com
    service: https://localhost:4000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  
  # Keycloak (Authentication)
  - hostname: dev-auth.dive25.com
    service: https://localhost:8443
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  
  # Catch-all rule (required)
  - service: http_status:404
```

```bash
# 6. Create DNS records
cloudflared tunnel route dns dive-v3-tunnel dev-app.dive25.com
cloudflared tunnel route dns dive-v3-tunnel dev-api.dive25.com
cloudflared tunnel route dns dive-v3-tunnel dev-auth.dive25.com

# 7. Install and start service
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

## Post-Installation Configuration

After the tunnel is running, update your DIVE V3 configuration:

### 1. Update Environment Variables

**Frontend** (`frontend/.env.local`):
```bash
# Update backend URL
NEXT_PUBLIC_BACKEND_URL=https://dev-api.dive25.com

# Update Keycloak URLs
KEYCLOAK_ISSUER=https://dev-auth.dive25.com/realms/dive-v3-broker
KEYCLOAK_CLIENT_ID=dive-v3-client-broker
KEYCLOAK_CLIENT_SECRET=<your-secret>
NEXTAUTH_URL=https://dev-app.dive25.com
```

**Backend** (`backend/.env`):
```bash
# Update Keycloak URL
KEYCLOAK_URL=https://dev-auth.dive25.com

# Update CORS to allow new domains
CORS_ALLOWED_ORIGINS=https://dev-app.dive25.com,https://dev-api.dive25.com
NEXT_PUBLIC_BASE_URL=https://dev-app.dive25.com
```

### 2. Update Keycloak Configuration

Update Keycloak redirect URIs via Terraform:

```bash
cd /home/mike/Desktop/DIVE-V3/DIVE-V3/terraform

# Edit broker-realm.tf
# Update valid_redirect_uris for dive-v3-client-broker:
valid_redirect_uris = [
  "https://dev-app.dive25.com/*",
  "https://dev-app.dive25.com/api/auth/callback/keycloak",
  "http://localhost:3000/*" # Keep for local dev
]

web_origins = [
  "https://dev-app.dive25.com",
  "http://localhost:3000"
]

# Apply changes
terraform apply -target=keycloak_openid_client.dive_v3_client
```

### 3. Restart Services

```bash
cd /home/mike/Desktop/DIVE-V3/DIVE-V3
docker compose restart backend
# If frontend is in Docker:
docker compose restart frontend
```

## Verification

### Check Tunnel Status

```bash
# View tunnel info
cloudflared tunnel info dive-v3-tunnel

# Check service status
sudo systemctl status cloudflared

# View live logs
sudo journalctl -u cloudflared -f
```

### Test Endpoints

```bash
# Test frontend
curl -I https://dev-app.dive25.com

# Test backend API
curl -I https://dev-api.dive25.com/health

# Test Keycloak
curl -I https://dev-auth.dive25.com/realms/dive-v3-broker
```

### Access Application

1. Open browser to: https://dev-app.dive25.com
2. Click "Login"
3. Should redirect to: https://dev-auth.dive25.com
4. After login, should return to: https://dev-app.dive25.com

## Troubleshooting

### Tunnel won't start

```bash
# Check logs
sudo journalctl -u cloudflared -f

# Verify config
cat ~/.cloudflared/config.yml

# Test manually
sudo cloudflared tunnel run dive-v3-tunnel
```

### DNS not resolving

```bash
# Check DNS records
cloudflared tunnel route list

# Verify in Cloudflare Dashboard
# Go to: Zero Trust → Access → Tunnels → dive-v3-tunnel
```

### SSL/TLS errors

The tunnel configuration uses `noTLSVerify: true` because your local services use self-signed certificates. Cloudflare provides proper SSL for the public endpoints.

### 502 Bad Gateway

- Check if local services are running: `docker compose ps`
- Verify ports are correct in `config.yml`
- Check firewall isn't blocking localhost connections

## Security Considerations

### Cloudflare Access (Optional)

Add authentication layer before tunnel:

```bash
# Require Cloudflare Access login
- hostname: dev-app.dive25.com
  service: https://localhost:3000
  originRequest:
    noTLSVerify: true
    access:
      required: true
      teamName: your-team-name
```

### Rate Limiting

Configure in Cloudflare Dashboard:
- Security → WAF → Rate Limiting Rules
- Recommended: 100 req/min per IP

### DDoS Protection

Enabled by default with Cloudflare Zero Trust.

## Useful Commands

```bash
# View all tunnels
cloudflared tunnel list

# View tunnel routes
cloudflared tunnel route list

# Delete tunnel (if needed)
cloudflared tunnel delete dive-v3-tunnel

# Restart service
sudo systemctl restart cloudflared

# Stop service
sudo systemctl stop cloudflared

# View config
cat ~/.cloudflared/config.yml
```

## Migration Path

**Current**: `kas.js.usa.divedeeper.internal` (local only)
**New**: `dev-*.dive25.com` (public via Cloudflare)

Both can run simultaneously during testing. The tunnel only exposes specified services.

## Cost

Cloudflare Zero Trust tunnel is **free** for up to 50 users.

## Support

- Cloudflare Docs: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- DIVE V3 Issues: Contact your team lead
- Tunnel logs: `sudo journalctl -u cloudflared -f`



