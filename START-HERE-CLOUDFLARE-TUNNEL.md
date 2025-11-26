# 🚀 START HERE: Set Up Cloudflare Tunnel for FRA Instance

## Current Status

✅ **Local Deployment**: Both USA and FRA instances are running locally
✅ **cloudflared**: Installed and working
✅ **USA Tunnel**: Already exists (`dive-v3-tunnel`)
❌ **FRA Tunnel**: Not yet created

---

## 🎯 Quick Setup in 3 Steps

### Step 1: Run the Setup Script

I've created a simple script that will guide you through the entire process:

```bash
./scripts/quick-fra-tunnel.sh
```

This script will:
1. ✅ Check if cloudflared is installed
2. ✅ Verify FRA services are running
3. ✅ Authenticate with Cloudflare (if needed)
4. ✅ Create the tunnel
5. ✅ Generate the configuration
6. ❓ Guide you through DNS setup
7. ✅ Offer to start the tunnel

### Step 2: Add DNS Records

When the script pauses for DNS configuration, you need to:

1. **Go to**: https://dash.cloudflare.com
2. **Select**: Your domain (dive25.com)
3. **Navigate to**: DNS → Records
4. **Add 4 CNAME records**:

| Name | Type | Target |
|------|------|--------|
| fra-app | CNAME | `[TUNNEL-ID].cfargotunnel.com` |
| fra-api | CNAME | `[TUNNEL-ID].cfargotunnel.com` |
| fra-idp | CNAME | `[TUNNEL-ID].cfargotunnel.com` |
| fra-kas | CNAME | `[TUNNEL-ID].cfargotunnel.com` |

*The script will show you the exact TUNNEL-ID to use*

### Step 3: Start the Tunnel

Once DNS is configured, the script will ask if you want to start the tunnel. Choose **Yes** to see it running immediately.

---

## 🌐 After Setup: Your FRA URLs

Once the tunnel is running, your FRA instance will be accessible at:

- **Frontend**: https://fra-app.dive25.com
- **Backend API**: https://fra-api.dive25.com  
- **Keycloak**: https://fra-idp.dive25.com
- **KAS**: https://fra-kas.dive25.com

---

## 📊 Testing the Tunnel

### Quick Test Commands
```bash
# Test if DNS is working
nslookup fra-app.dive25.com

# Test if frontend is accessible
curl -I https://fra-app.dive25.com

# Test API health
curl https://fra-api.dive25.com/health
```

### Visual Test
Open in your browser:
- https://fra-app.dive25.com (FRA Frontend)
- https://fra-idp.dive25.com (FRA Keycloak)

---

## 🔄 Federation with USA Instance

Once both tunnels are running:

### USA Instance URLs (existing)
- Probably at: https://app.dive25.com or similar
- Check your existing `dive-v3-tunnel` configuration

### Configure Federation
1. In USA Keycloak → Add FRA as Identity Provider
2. In FRA Keycloak → Add USA as Identity Provider
3. Exchange metadata between instances
4. Test cross-realm authentication

---

## ⚡ Quick Commands

```bash
# Start the tunnel setup
./scripts/quick-fra-tunnel.sh

# View tunnel status
cloudflared tunnel list

# Run tunnel manually
cloudflared tunnel run dive-v3-fra

# Stop tunnel
# Press Ctrl+C if running in foreground
# OR
cloudflared service stop  # if installed as service

# View tunnel logs
cloudflared tail dive-v3-fra
```

---

## 🆘 Troubleshooting

### "Not authenticated" error
```bash
cloudflared tunnel login
```

### "Port already in use" error
Make sure FRA services are running on the correct ports:
- Frontend: 3001
- Backend: 4001  
- Keycloak: 8444
- KAS: 8083

### DNS not resolving
- Wait 1-2 minutes for DNS propagation
- Verify CNAME records in Cloudflare dashboard
- Check with: `dig fra-app.dive25.com`

---

## ✅ Success Checklist

After running the setup:

- [ ] Tunnel created (`cloudflared tunnel list` shows `dive-v3-fra`)
- [ ] DNS records added (4 CNAME records)
- [ ] Tunnel running (no errors in console)
- [ ] Frontend accessible (https://fra-app.dive25.com loads)
- [ ] API responding (https://fra-api.dive25.com/health returns data)
- [ ] Keycloak accessible (https://fra-idp.dive25.com shows login)

---

## 📝 Ready to Start?

Run this command now:

```bash
./scripts/quick-fra-tunnel.sh
```

The script will guide you through everything! 🚀




