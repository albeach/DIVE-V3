# DIVE V3 Pilot Quick-Start Guide

**Get a multi-instance federation demo running in under 10 minutes.**

---

## Prerequisites

Ensure you have installed:
- Docker & Docker Compose
- Node.js 20+
- `mkcert` (for local SSL)
- Cloudflare CLI (`cloudflared`)
- Terraform

```bash
# Verify prerequisites
docker --version && docker-compose --version
node --version
mkcert -version
cloudflared --version
terraform --version
```

---

## Step 1: Deploy USA Instance (Primary)

```bash
# From project root
./scripts/deploy-dive-instance.sh USA

# Wait for health checks (~2 min)
./scripts/dive-status.sh
```

**Access URLs:**
| Service | URL |
|---------|-----|
| Frontend | https://usa-app.dive25.com |
| API | https://usa-api.dive25.com |
| Keycloak | https://usa-idp.dive25.com |

---

## Step 2: Deploy FRA Instance (Secondary)

```bash
# Deploy with automatic federation to USA
./scripts/deploy-dive-instance.sh FRA --federate

# Verify both instances
./scripts/dive-status.sh
```

**Access URLs:**
| Service | URL |
|---------|-----|
| Frontend | https://fra-app.dive25.com |
| API | https://fra-api.dive25.com |
| Keycloak | https://fra-idp.dive25.com |

---

## Step 3: Verify Federation

```bash
# Check federation status
./scripts/show-federation-status.sh
```

---

## Test User Credentials

All instances use standardized test users:

| Username | Password | Clearance | Notes |
|----------|----------|-----------|-------|
| `testuser-usa-1` | `DiveDemo2025!` | UNCLASSIFIED | Public Affairs |
| `testuser-usa-2` | `DiveDemo2025!` | CONFIDENTIAL | Ministry of Defense |
| `testuser-usa-3` | `DiveDemo2025!` | SECRET | Intelligence (NATO-COSMIC) |
| `testuser-usa-4` | `DiveDemo2025!` | TOP_SECRET | Defense Ministry (FVEY) |

**Pattern**: `testuser-{country}-{level}` where level 1-4 = clearance

For FRA: `testuser-fra-1`, `testuser-fra-2`, etc.  
For DEU: `testuser-deu-1`, `testuser-deu-2`, etc.

---

## Quick Demo Flow

### Demo 1: Basic Authentication
1. Navigate to https://usa-app.dive25.com
2. Select "United States" IdP
3. Login as `testuser-usa-2` / `DiveDemo2025!`
4. View accessible resources based on CONFIDENTIAL clearance

### Demo 2: Cross-Country Federation
1. Navigate to https://fra-app.dive25.com
2. Select "United States" IdP (federated partner)
3. Login as `testuser-usa-3` / `DiveDemo2025!`
4. Observe attribute normalization and resource access

### Demo 3: Clearance Denial
1. Login as `testuser-usa-1` (UNCLASSIFIED)
2. Attempt to access SECRET resource
3. Observe denial with reason displayed

---

## Troubleshooting

### Services not starting?
```bash
# Check logs
./scripts/manage-instances.sh USA logs

# Restart services
./scripts/manage-instances.sh USA restart
```

### Tunnel not working?
```bash
# Start tunnel manually
./scripts/manage-instances.sh USA tunnel
```

### Database issues?
```bash
# Full reset (WARNING: deletes data)
docker-compose down -v
./scripts/deploy-dive-instance.sh USA
```

---

## Next Steps

- Read the [Demo Script](./PILOT-DEMO-SCRIPT.md) for detailed scenarios
- Review [Architecture](./PILOT-ARCHITECTURE.md) for technical details
- See [Federation Guide](./federation/PILOT-ONBOARDING-GUIDE.md) for adding partners

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `./scripts/deploy-dive-instance.sh {CODE}` | Deploy new instance |
| `./scripts/dive-status.sh` | Health dashboard |
| `./scripts/manage-instances.sh {CODE} {cmd}` | start/stop/restart/logs |
| `./scripts/add-federation-partner.sh {src} {dst}` | Add federation |
| `./scripts/show-federation-status.sh` | View federation status |
| `./scripts/tests/run-all-tests.sh` | Run all tests |

---

**Total Setup Time: ~8 minutes**









