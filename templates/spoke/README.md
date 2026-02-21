# DIVE V3 Spoke Templates

This directory contains parameterized templates for deploying DIVE V3 spoke instances.

## Overview

A **spoke** is a federated DIVE V3 instance that connects to a central **hub** for policy synchronization and coordination. Each spoke runs its own:

- **Keycloak** - Identity provider
- **OPA** - Policy decision point
- **OPAL Client** - Policy synchronization (connects to hub)
- **Backend** - API server with PEP
- **Frontend** - Next.js application
- **MongoDB** - Resource metadata
- **Redis** - Session cache
- **PostgreSQL** - Keycloak database

## Quick Start (Recommended)

Use the DIVE CLI to automatically generate and deploy a spoke:

```bash
# One-command deployment (Phase 2)
./dive spoke deploy NZL "New Zealand Defence"

# Or step-by-step
./dive spoke init NZL "New Zealand Defence"
./dive --instance nzl spoke up
./dive --instance nzl spoke register
```

## Manual Template Usage

If you need to customize templates before deployment:

### 1. Copy Templates

```bash
mkdir -p instances/nzl
cp templates/spoke/.env.template instances/nzl/.env
cp templates/spoke/config.template.json instances/nzl/config.json
cp templates/spoke/docker-compose.template.yml instances/nzl/docker-compose.yml
```

### 2. Replace Placeholders

Replace all `{{PLACEHOLDER}}` values in the copied files:

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{INSTANCE_CODE_UPPER}}` | 3-letter uppercase code | `NZL` |
| `{{INSTANCE_CODE_LOWER}}` | 3-letter lowercase code | `nzl` |
| `{{INSTANCE_NAME}}` | Human-readable name | `New Zealand Defence` |
| `{{SPOKE_ID}}` | Unique identifier | `spoke-nzl-abc123` |
| `{{HUB_URL}}` | Hub API URL | `https://usa-api.dive25.com` |
| `{{HUB_OPAL_URL}}` | Hub OPAL URL | `https://usa-api.dive25.com:7002` |
| `{{BASE_URL}}` | Frontend URL | `https://nzl-app.dive25.com` |
| `{{API_URL}}` | Backend URL | `https://nzl-api.dive25.com` |
| `{{IDP_URL}}` | Keycloak URL | `https://nzl-idp.dive25.com` |
| `{{IDP_HOSTNAME}}` | Keycloak hostname | `nzl-idp.dive25.com` |
| `{{KEYCLOAK_HOST_PORT}}` | Keycloak port | `8443` |
| `{{BACKEND_HOST_PORT}}` | Backend port | `4000` |
| `{{FRONTEND_HOST_PORT}}` | Frontend port | `3000` |
| `{{TIMESTAMP}}` | ISO timestamp | `2024-01-15T10:30:00Z` |
| `{{CONTACT_EMAIL}}` | Admin email | `admin@nzl.mil` |

### 3. Generate Secrets

```bash
# In your .env file, generate secure passwords:
POSTGRES_PASSWORD=$(openssl rand -base64 16 | tr -d '/+=')
MONGO_PASSWORD=$(openssl rand -base64 16 | tr -d '/+=')
KEYCLOAK_ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -d '/+=')
AUTH_SECRET=$(openssl rand -base64 32)
KEYCLOAK_CLIENT_SECRET=$(openssl rand -base64 24 | tr -d '/+=')
```

### 4. Generate Certificates

```bash
./dive --instance nzl spoke generate-certs
```

### 5. Start Services

```bash
cd instances/nzl
docker compose up -d
```

### 6. Register with Hub

```bash
./dive --instance nzl spoke register
```

## Template Files

| File | Description |
|------|-------------|
| `docker-compose.template.yml` | Full Docker Compose configuration with all services |
| `config.template.json` | Spoke identity and federation configuration |
| `.env.template` | Environment variables (secrets, endpoints) |
| `README.md` | This documentation file |

## Cloudflare Tunnel Setup

For public access via `<code>-*.dive25.com`:

1. Create a tunnel at [Cloudflare Zero Trust](https://one.dash.cloudflare.com)
2. Name it `dive-spoke-<code>` (e.g., `dive-spoke-nzl`)
3. Add public hostnames:
   - `nzl-app.dive25.com` → `http://frontend-nzl:3000`
   - `nzl-api.dive25.com` → `https://backend-nzl:4000`
   - `nzl-idp.dive25.com` → `http://keycloak-nzl:8080`
4. Copy the tunnel token to `.env` as `TUNNEL_TOKEN`
5. Uncomment the cloudflared service in docker-compose.yml

Or use the CLI's auto-setup:

```bash
./dive spoke init  # Interactive wizard with tunnel auto-creation
```

## Verification

After deployment, verify connectivity:

```bash
# 8-point connectivity test
./dive --instance nzl spoke verify

# Service health check
./dive --instance nzl spoke health

# View logs
./dive --instance nzl spoke logs
```

## Cleanup

```bash
# Reset (preserve config, clear data)
./dive --instance nzl spoke reset

# Full teardown (delete everything)
./dive --instance nzl spoke teardown
```

## Troubleshooting

### Services not starting
```bash
docker compose logs keycloak-nzl
docker compose logs backend-nzl
```

### Keycloak not healthy
Wait 60+ seconds for Keycloak to fully initialize. It may show unhealthy during startup.

### OPAL not connecting
1. Ensure `SPOKE_OPAL_TOKEN` is set in `.env`
2. Check hub reachability: `curl -k https://usa-api.dive25.com/health`
3. OPAL uses the `federation` profile - it won't start until token is configured

### Hub registration failed
1. Check hub URL is correct
2. Ensure certificates are generated
3. Check network connectivity to hub

## Related Documentation

- [Hub-Spoke Architecture](../../docs/HUB_SPOKE_ARCHITECTURE.md)
- [Quick Reference](../../docs/HUB_SPOKE_QUICK_REFERENCE.md)
- [Deployment Guide](../../docs/HUB_SPOKE_101_DEPLOYMENT.md)
