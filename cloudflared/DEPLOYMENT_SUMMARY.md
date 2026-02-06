# Cloudflared Tunnel Configuration Summary

## ✅ Deployment Complete

All three Cloudflare Tunnels have been successfully configured and deployed with **complete endpoint coverage** including OPA and OPAL services.

## 🚀 Active Tunnels

| Instance | Status | PID | Connections | Config File |
|----------|--------|-----|-------------|-------------|
| USA (Hub) | ✅ Running | 72657 | 4 | config.yml |
| FRA | ✅ Running | 72679 | 4 | config-fra.yml |
| GBR | ✅ Running | 72713 | 4 | config-gbr.yml |

## 🌐 Complete Endpoint Matrix

### USA (Hub) - 6 Services
| Service | Domain | Port | Purpose |
|---------|--------|------|---------|
| Frontend | https://usa-app.dive25.com | 3000 | Next.js UI |
| Backend | https://usa-api.dive25.com | 4000 | Express.js API |
| Keycloak | https://usa-idp.dive25.com | 8443 | Identity Provider |
| KAS | https://usa-kas.dive25.com | 8085 | Key Access Service |
| **OPA** | **https://usa-opa.dive25.com** | **8181** | **Policy Decision Point** |
| **OPAL Server** | **https://usa-opal.dive25.com** | **7002** | **Policy Distribution Hub** |

### FRA (France) - 6 Services
| Service | Domain | Port | Purpose |
|---------|--------|------|---------|
| Frontend | https://fra-app.dive25.com | 3001 | Next.js UI |
| Backend | https://fra-api.dive25.com | 4001 | Express.js API |
| Keycloak | https://fra-idp.dive25.com | 8444 | Identity Provider |
| KAS | https://fra-kas.dive25.com | 8086 | Key Access Service |
| **OPA** | **https://fra-opa.dive25.com** | **8490** | **Policy Decision Point** |
| **OPAL Client** | **https://fra-opal.dive25.com** | **9191** | **Policy Sync Client** |

### GBR (United Kingdom) - 6 Services
| Service | Domain | Port | Purpose |
|---------|--------|------|---------|
| Frontend | https://gbr-app.dive25.com | 3003 | Next.js UI |
| Backend | https://gbr-api.dive25.com | 4003 | Express.js API |
| Keycloak | https://gbr-idp.dive25.com | 8446 | Identity Provider |
| KAS | https://gbr-kas.dive25.com | 8093 | Key Access Service |
| **OPA** | **https://gbr-opa.dive25.com** | **8491** | **Policy Decision Point** |
| **OPAL Client** | **https://gbr-opal.dive25.com** | **9212** | **Policy Sync Client** |

## 📋 Policy & Authorization Architecture

### OPA (Open Policy Agent)
**Purpose**: Makes authorization decisions based on policies

**Endpoints**:
- USA: https://usa-opa.dive25.com
- FRA: https://fra-opa.dive25.com
- GBR: https://gbr-opa.dive25.com

**Use Cases**:
- Query policies: `GET /v1/data/dive/authorization/decision`
- Test policy evaluation
- Monitor authorization decisions
- Debug access control logic
- External client authorization

**Example Query**:
```bash
curl -X POST https://usa-opa.dive25.com/v1/data/dive/authorization/decision \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "subject": {"clearance": "SECRET", "country": "USA"},
      "resource": {"classification": "SECRET"}
    }
  }'
```

### OPAL (Open Policy Administration Layer)
**Purpose**: Distributes policy updates from Hub to Spokes in real-time

**Architecture**:
- **Hub OPAL Server** (USA): Detects policy changes and pushes to spokes
- **Spoke OPAL Clients** (FRA, GBR): Receive updates and refresh local OPA

**Endpoints**:
- USA Server: https://usa-opal.dive25.com
- FRA Client: https://fra-opal.dive25.com
- GBR Client: https://gbr-opal.dive25.com

**Use Cases**:
- Monitor policy sync status
- Check OPAL client health: `GET /healthcheck`
- View OPAL statistics: `GET /statistics`
- Debug policy distribution issues
- Trigger manual policy refresh

**Example Health Check**:
```bash
# Check OPAL Server (Hub)
curl https://usa-opal.dive25.com/healthcheck

# Check OPAL Clients (Spokes)
curl https://fra-opal.dive25.com/healthcheck
curl https://gbr-opal.dive25.com/healthcheck
```

## 🔄 Policy Distribution Flow

```
┌─────────────┐
│   Hub USA   │
│             │
│ Policies/   │  Policy Change Detected
│ Directory   │◄─────────────────┐
└─────────────┘                  │
      │                          │
      │ Watches                  │
      ▼                          │
┌─────────────┐                  │
│ OPAL Server │                  │
│  usa-opal   │                  │
│  .dive25    │                  │
│    .com     │                  │
└─────────────┘                  │
      │                          │
      │ Pushes Updates           │
      ├──────────────────────────┤
      │                          │
      ▼                          ▼
┌─────────────┐          ┌─────────────┐
│OPAL Client  │          │OPAL Client  │
│  fra-opal   │          │  gbr-opal   │
│  .dive25    │          │  .dive25    │
│    .com     │          │    .com     │
└─────────────┘          └─────────────┘
      │                          │
      │ Updates                  │ Updates
      ▼                          ▼
┌─────────────┐          ┌─────────────┐
│   OPA FRA   │          │   OPA GBR   │
│  fra-opa    │          │  gbr-opa    │
│  .dive25    │          │  .dive25    │
│    .com     │          │    .com     │
└─────────────┘          └─────────────┘
```

## 🔧 Management Scripts

All scripts located in `scripts/`:

| Script | Purpose |
|--------|---------|
| `start-cloudflared-tunnels.sh` | Start all tunnels |
| `stop-cloudflared-tunnels.sh` | Stop all tunnels |
| `cloudflared-status.sh` | Check tunnel status |
| `test-cloudflared-connectivity.sh` | Test endpoint connectivity |

## 📊 Monitoring

### Tunnel Metrics
Each tunnel exposes Prometheus metrics:
- USA: http://localhost:9126/metrics
- FRA: http://localhost:9127/metrics
- GBR: http://localhost:9128/metrics

### Logs
Tunnel logs written to `logs/`:
```bash
tail -f logs/cloudflared-usa.log
tail -f logs/cloudflared-fra.log
tail -f logs/cloudflared-gbr.log
```

### Connection Health
Each tunnel maintains 4 concurrent connections to Cloudflare for high availability.

Check connection count:
```bash
grep "Registered tunnel connection" logs/cloudflared-*.log | wc -l
# Expected: 12 (4 per tunnel × 3 tunnels)
```

## 🎯 Key Benefits

### 1. **Complete Service Exposure**
All 18 services (6 per instance) are now publicly accessible through secure Cloudflare tunnels.

### 2. **Policy Management**
External tools can now:
- Query OPA for authorization decisions
- Monitor OPAL policy synchronization
- Debug policy distribution issues
- Test policy evaluation directly

### 3. **Federation Transparency**
Remote administrators can:
- Check OPA policy status on any spoke
- Monitor OPAL client health
- Verify policy sync from Hub to Spokes
- Debug cross-instance authorization issues

### 4. **Development & Testing**
Developers can:
- Test policy changes across all instances
- Query OPA directly from external tools
- Monitor real-time policy distribution
- Debug authorization logic without SSH access

## 🚨 Important Notes

### Security Considerations
1. **TLS Verification**: Production should use proper TLS certificates (currently `noTLSVerify: true` for development)
2. **Access Control**: Consider adding Cloudflare Access policies for OPA/OPAL endpoints
3. **Rate Limiting**: Configure rate limiting in Cloudflare dashboard for public endpoints
4. **Monitoring**: Set up alerts for tunnel health and connection drops

### Service Dependencies
Tunnels will show errors in logs until Docker services are running:
```bash
# Start Hub services
docker compose -f docker-compose.hub.yml up -d

# Start Spoke services
cd instances/fra && docker compose up -d
cd instances/gbr && docker compose up -d
```

### Configuration Updates
Tunnel configurations are stored in:
- `cloudflared/config.yml` (USA Hub)
- `cloudflared/config-fra.yml` (FRA)
- `cloudflared/config-gbr.yml` (GBR)

After updating configurations, restart tunnels:
```bash
./scripts/stop-cloudflared-tunnels.sh
./scripts/start-cloudflared-tunnels.sh
```

## 📚 Additional Documentation

- Complete setup guide: `cloudflared/README.md`
- Quick reference: `cloudflared/QUICK_REFERENCE.md`
- OPA documentation: https://www.openpolicyagent.org/docs/latest/
- OPAL documentation: https://docs.opal.ac/

## ✅ Deployment Checklist

- [x] USA tunnel configured with 6 services (including OPA + OPAL Server)
- [x] FRA tunnel configured with 6 services (including OPA + OPAL Client)
- [x] GBR tunnel configured with 6 services (including OPA + OPAL Client)
- [x] All tunnels running with 4 connections each
- [x] Management scripts created and tested
- [x] Documentation updated
- [x] Status monitoring scripts operational

## 🎉 Ready for Use!

All cloudflared tunnels are now operational and exposing **18 total endpoints** across 3 instances, including critical policy and authorization infrastructure (OPA/OPAL).

Developers and administrators can now access all DIVE V3 services through public dive25.com domains.
