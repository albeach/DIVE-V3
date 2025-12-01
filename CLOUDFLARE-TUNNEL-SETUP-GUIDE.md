# 🌐 Cloudflare Zero Trust Tunnel Setup for FRA Instance

## Overview

This guide will help you set up Cloudflare Zero Trust tunnels to expose your FRA instance to the internet with secure access. You'll create dedicated hostnames for the French instance that can federate with your existing USA instance.

---

## ✅ Prerequisites Check

### What You Have
- ✅ **cloudflared installed**: `/usr/local/bin/cloudflared`
- ✅ **Existing tunnels**: You have `dive-v3-tunnel` running for USA
- ✅ **FRA instance running locally**: Ports 3001, 4001, 8444, 8083
- ✅ **Setup script ready**: `scripts/setup-fra-tunnel.sh`

### What You Need
- Cloudflare account credentials
- Domain control (dive25.com or your domain)
- API token with Zone:Edit permissions

---

## 🚀 Quick Setup (Option 1: Automated)

### Step 1: Set Environment Variables
```bash
# Set your Cloudflare credentials
export CF_API_TOKEN="your-cloudflare-api-token"
export CF_ACCOUNT_ID="your-account-id"
export CF_ZONE_ID="your-zone-id-for-dive25.com"

# To get these values:
# 1. Go to https://dash.cloudflare.com
# 2. Select your domain (dive25.com)
# 3. On the right sidebar, find Account ID and Zone ID
# 4. For API token: Go to My Profile → API Tokens → Create Token
```

### Step 2: Run Setup in Dry-Run Mode First
```bash
# Preview what will be created
DRY_RUN=true ./scripts/setup-fra-tunnel.sh
```

### Step 3: Execute Tunnel Creation
```bash
# Create the actual tunnels
./scripts/setup-fra-tunnel.sh
```

---

## 🔧 Manual Setup (Option 2: Step by Step)

### Step 1: Create FRA Tunnel
```bash
# Login to Cloudflare
cloudflared tunnel login

# Create the FRA primary tunnel
cloudflared tunnel create dive-v3-fra

# Note the Tunnel ID that's returned
# Example: a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### Step 2: Configure Tunnel Routes
```bash
# Add DNS records for FRA hostnames
cloudflared tunnel route dns dive-v3-fra fra-app.dive25.com
cloudflared tunnel route dns dive-v3-fra fra-api.dive25.com
cloudflared tunnel route dns dive-v3-fra fra-idp.dive25.com
cloudflared tunnel route dns dive-v3-fra fra-kas.dive25.com
```

### Step 3: Create Tunnel Configuration
```bash
# Create config directory
mkdir -p ~/.cloudflared/fra

# Create the tunnel configuration file
cat > ~/.cloudflared/fra/config.yml << 'EOF'
tunnel: dive-v3-fra
credentials-file: /Users/$(whoami)/.cloudflared/TUNNEL_ID.json

ingress:
  # Frontend (Next.js) - fra-app.dive25.com
  - hostname: fra-app.dive25.com
    service: https://localhost:3001
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      httpHostHeader: fra-app.dive25.com
  
  # Backend API - fra-api.dive25.com
  - hostname: fra-api.dive25.com
    service: https://localhost:4001
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      httpHostHeader: fra-api.dive25.com
  
  # Keycloak IdP - fra-idp.dive25.com
  - hostname: fra-idp.dive25.com
    service: http://localhost:8444
    originRequest:
      noTLSVerify: false
      connectTimeout: 30s
      httpHostHeader: fra-idp.dive25.com
  
  # KAS - fra-kas.dive25.com
  - hostname: fra-kas.dive25.com
    service: http://localhost:8083
    originRequest:
      noTLSVerify: false
      connectTimeout: 30s
      httpHostHeader: fra-kas.dive25.com
  
  # Catch-all
  - service: http_status:404
EOF
```

### Step 4: Run the Tunnel
```bash
# Run in the foreground to test
cloudflared tunnel --config ~/.cloudflared/fra/config.yml run dive-v3-fra

# Or run as a service (background)
cloudflared service install --config ~/.cloudflared/fra/config.yml
```

---

## 🛡️ Zero Trust Access Policies

### Configure Access Policies in Cloudflare Dashboard

1. **Go to**: https://one.dash.cloudflare.com
2. **Navigate to**: Access → Applications
3. **Create Application** for each FRA service:

#### FRA Frontend (fra-app.dive25.com)
- **Type**: Self-hosted
- **Application domain**: fra-app.dive25.com
- **Policy name**: FRA Frontend Access
- **Include rule**: Emails ending in `@fra.mil` OR `@defense.gouv.fr`
- **Require**: Valid certificate

#### FRA API (fra-api.dive25.com)
- **Type**: Self-hosted
- **Application domain**: fra-api.dive25.com
- **Policy name**: FRA API Access
- **Include rule**: Service Token OR Authenticated users
- **Require**: Valid JWT from FRA Keycloak

#### FRA Keycloak (fra-idp.dive25.com)
- **Type**: Self-hosted
- **Application domain**: fra-idp.dive25.com
- **Policy name**: FRA IdP Access
- **Include rule**: Everyone (public access for federation)

---

## 🔍 Testing Your Tunnel

### Step 1: Verify Tunnel is Running
```bash
# Check tunnel status
cloudflared tunnel info dive-v3-fra

# Check active connections
cloudflared tunnel list | grep fra
```

### Step 2: Test DNS Resolution
```bash
# Test each hostname
nslookup fra-app.dive25.com
nslookup fra-api.dive25.com
nslookup fra-idp.dive25.com
nslookup fra-kas.dive25.com
```

### Step 3: Test HTTPS Access
```bash
# Test frontend
curl -I https://fra-app.dive25.com

# Test API health
curl https://fra-api.dive25.com/health

# Test Keycloak
curl -I https://fra-idp.dive25.com
```

---

## 📊 Federation Setup

### Connect USA and FRA Instances

1. **In USA Keycloak** (http://localhost:8081):
   - Add FRA as identity provider
   - URL: https://fra-idp.dive25.com
   - Import FRA's SAML metadata or OIDC config

2. **In FRA Keycloak** (http://localhost:8444):
   - Add USA as identity provider  
   - URL: https://usa-idp.dive25.com (or your USA tunnel URL)
   - Import USA's metadata

3. **Configure Backend Federation**:
   ```javascript
   // In backend environment
   FEDERATION_ENDPOINTS={
     "USA": "https://usa-api.dive25.com/api/federation",
     "FRA": "https://fra-api.dive25.com/api/federation"
   }
   ```

---

## 🚨 Troubleshooting

### Tunnel Won't Start
```bash
# Check for port conflicts
lsof -i:3001
lsof -i:4001

# Check Docker containers are running
docker ps | grep fra

# Check tunnel logs
cloudflared tail dive-v3-fra
```

### DNS Not Resolving
```bash
# Verify DNS records in Cloudflare
cloudflared tunnel route dns list

# Force DNS propagation check
dig fra-app.dive25.com @1.1.1.1
```

### Access Denied Errors
- Check Zero Trust policies in Cloudflare dashboard
- Verify certificates are valid
- Check Keycloak is accessible

---

## 🎯 Success Checklist

- [ ] Tunnel created and running
- [ ] DNS records configured
- [ ] All 4 FRA hostnames accessible
- [ ] Zero Trust policies configured
- [ ] Federation link established
- [ ] Cross-realm authentication working

---

## 🔐 Security Notes

1. **Use Zero Trust**: Always require authentication for sensitive endpoints
2. **Rotate credentials**: Change tunnel credentials periodically
3. **Monitor access logs**: Check Cloudflare Analytics for suspicious activity
4. **Use service tokens**: For API-to-API communication
5. **Enable rate limiting**: Protect against DoS attacks

---

## 📝 Quick Commands Reference

```bash
# Start tunnel
cloudflared tunnel run dive-v3-fra

# Stop tunnel
cloudflared tunnel delete dive-v3-fra

# View logs
cloudflared tail dive-v3-fra

# List all tunnels
cloudflared tunnel list

# Get tunnel info
cloudflared tunnel info dive-v3-fra
```







