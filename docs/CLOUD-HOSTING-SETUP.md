# DIVE V3 - Cloud Hosting Setup Guide

This document describes how to set up independent cloud hosting for the DIVE V3 landing page and status page.

## Why Independent Hosting?

The landing page (`dive25.com`) and status page (`status.dive25.com`) should be hosted independently of the main DIVE V3 infrastructure so they remain accessible even when:
- Local development machines are offline
- DIVE instances are experiencing outages
- Maintenance is being performed

## Landing Page: Cloudflare Pages

### Repository
- **GitHub**: https://github.com/albeach/dive25-landing
- **Files**:
  - `index.html` - Main landing page
  - `404.html` - Custom 404 error page
  - `health.html` - Health check endpoint
  - `_headers` - Security headers
  - `_redirects` - URL redirects

### Deployment Steps

1. **Connect to Cloudflare Pages**:
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages
   - Click "Create a project" → "Connect to Git"
   - Select the `dive25-landing` repository
   - Build settings: Leave empty (static HTML)
   - Deploy

2. **Add Custom Domain**:
   - In the Pages project, go to "Custom domains"
   - Add `dive25.com`
   - Cloudflare will automatically configure DNS

3. **Verify Deployment**:
   ```bash
   curl -I https://dive25.com
   curl https://dive25.com/health
   ```

### Auto-Deploy
Any push to the `main` branch will automatically deploy to Cloudflare Pages.

## Status Page: Better Uptime

### Setup Steps

1. **Sign Up**:
   - Go to [Better Uptime](https://betteruptime.com)
   - Create a free account

2. **Create Monitors**:
   Run the setup script:
   ```bash
   ./scripts/setup-better-uptime.sh
   ```
   
   Or manually create monitors for:
   
   | Instance | URL | Type |
   |----------|-----|------|
   | USA Frontend | https://usa-app.dive25.com | HTTP 200 |
   | USA API | https://usa-api.dive25.com/health | HTTP 200 |
   | USA Keycloak | https://usa-idp.dive25.com/realms/dive-v3-broker/.well-known/openid-configuration | HTTP 200 |
   | FRA Frontend | https://fra-app.dive25.com | HTTP 200 |
   | FRA API | https://fra-api.dive25.com/health | HTTP 200 |
   | FRA Keycloak | https://fra-idp.dive25.com/realms/dive-v3-broker/.well-known/openid-configuration | HTTP 200 |
   | GBR Frontend | https://gbr-app.dive25.com | HTTP 200 |
   | GBR API | https://gbr-api.dive25.com/health | HTTP 200 |
   | GBR Keycloak | https://gbr-idp.dive25.com/realms/dive-v3-broker/.well-known/openid-configuration | HTTP 200 |
   | DEU Frontend | https://deu-app.prosecurity.biz | HTTP 200 |
   | DEU API | https://deu-api.prosecurity.biz/health | HTTP 200 |
   | DEU Keycloak | https://deu-idp.prosecurity.biz/realms/dive-v3-broker/.well-known/openid-configuration | HTTP 200 |
   | Landing Page | https://dive25.com | HTTP 200 |

3. **Create Status Page**:
   - Go to Status Pages → Create
   - Name: "DIVE V3 Status"
   - Subdomain: `dive25` (creates `dive25.betteruptime.com`)
   - Add all monitors

4. **Custom Domain** (Optional):
   - In Status Page settings, add custom domain: `status.dive25.com`
   - Add DNS record (see below)

## DNS Configuration

Add these records in Cloudflare DNS for `dive25.com`:

| Type | Name | Target | Proxy | Notes |
|------|------|--------|-------|-------|
| CNAME | `@` (root) | `dive25-landing.pages.dev` | Yes | Landing page |
| CNAME | `www` | `dive25.com` | Yes | Redirect to apex |
| CNAME | `status` | `statuspage.betteruptime.com` | No | Status page (DNS only) |

**Note**: The `status` CNAME should have Cloudflare proxy **disabled** (grey cloud) for Better Uptime SSL to work.

## Architecture Diagram

```
                    ┌─────────────────────────────┐
                    │     Cloudflare Edge         │
                    │   (Global CDN + Security)   │
                    └──────────────┬──────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│   dive25.com    │   │ status.dive25   │   │ usa-app.dive25  │
│                 │   │     .com        │   │ fra-app.dive25  │
│  Cloudflare     │   │                 │   │ gbr-app.dive25  │
│    Pages        │   │  Better Uptime  │   │ deu-app.prosec  │
│  (Static HTML)  │   │ (Status Page)   │   │                 │
│                 │   │                 │   │ Cloudflare      │
│  ✓ Always Up    │   │  ✓ Always Up    │   │   Tunnels       │
│  ✓ Global CDN   │   │  ✓ Independent  │   │ (Dynamic Apps)  │
│  ✓ Free         │   │  ✓ Monitoring   │   │                 │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

## Monitoring Configuration

The full monitor configuration is stored in:
- `monitoring/better-uptime-config.json`

This includes:
- All 13 monitors (4 instances × 3 services + 1 landing page)
- Monitor groups by country
- Alerting configuration
- Incident templates

## Maintenance

### Landing Page Updates
```bash
cd ~/Documents/GitHub/dive25-landing-cloud
# Edit index.html
git add . && git commit -m "Update landing page"
git push  # Auto-deploys to Cloudflare Pages
```

### Status Page Incidents
1. Go to Better Uptime → Incidents
2. Create new incident with appropriate template
3. Assign affected monitors
4. Update status as you resolve the issue

## Cost

| Service | Cost |
|---------|------|
| Cloudflare Pages | **Free** (unlimited bandwidth) |
| Better Uptime | **Free** tier (10 monitors, 1 status page) |
| **Total** | **$0/month** |

For enterprise features (more monitors, SMS alerts, SLA reports), Better Uptime paid plans start at $20/month.







