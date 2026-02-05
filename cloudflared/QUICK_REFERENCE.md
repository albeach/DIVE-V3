# Cloudflared Tunnel Quick Reference

## 🚀 Quick Start
```bash
# Start all tunnels
./scripts/start-cloudflared-tunnels.sh

# Check status
./scripts/cloudflared-status.sh

# Stop all tunnels
./scripts/stop-cloudflared-tunnels.sh
```

## 🌐 Access URLs

### USA (Hub)
- Frontend: https://usa-app.dive25.com
- Backend: https://usa-api.dive25.com
- Keycloak: https://usa-idp.dive25.com
- KAS: https://usa-kas.dive25.com
- OPA: https://usa-opa.dive25.com
- OPAL Server: https://usa-opal.dive25.com

### FRA (France)
- Frontend: https://fra-app.dive25.com
- Backend: https://fra-api.dive25.com
- Keycloak: https://fra-idp.dive25.com
- KAS: https://fra-kas.dive25.com
- OPA: https://fra-opa.dive25.com
- OPAL Client: https://fra-opal.dive25.com

### GBR (United Kingdom)
- Frontend: https://gbr-app.dive25.com
- Backend: https://gbr-api.dive25.com
- Keycloak: https://gbr-idp.dive25.com
- KAS: https://gbr-kas.dive25.com
- OPA: https://gbr-opa.dive25.com
- OPAL Client: https://gbr-opal.dive25.com

## 📊 Monitoring

### Metrics
- USA: http://localhost:9126/metrics
- FRA: http://localhost:9127/metrics
- GBR: http://localhost:9128/metrics

### Logs
```bash
tail -f logs/cloudflared-usa.log
tail -f logs/cloudflared-fra.log
tail -f logs/cloudflared-gbr.log
```

## 🔧 Troubleshooting

### Restart a single tunnel
```bash
# Find and kill the process
pkill -f "cloudflared.*config.yml"  # USA
pkill -f "cloudflared.*config-fra.yml"  # FRA
pkill -f "cloudflared.*config-gbr.yml"  # GBR

# Restart all
./scripts/start-cloudflared-tunnels.sh
```

### Check tunnel connectivity
```bash
# Should show 4 connections per tunnel
grep "Registered tunnel connection" logs/cloudflared-*.log | tail -12
```

### Verify backend services are running
```bash
# Check Docker containers
docker ps | grep -E "(frontend|backend|keycloak|kas)"

# Check service health
curl -k https://localhost:3000/  # USA Frontend
curl -k https://localhost:4000/api/health  # USA Backend
```

## 📝 Notes
- Each tunnel maintains 4 connections for high availability
- Tunnels run in background and persist until manually stopped
- PID files stored in `logs/cloudflared-{instance}.pid`
- Auto-reconnects on connection drops
