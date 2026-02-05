# Cloudflared Tunnel Management for DIVE V3

## Overview

This directory contains the configuration and credentials for Cloudflare Tunnels that expose DIVE V3 instances through public `dive25.com` domains.

## Architecture

Each DIVE V3 instance (USA Hub, FRA, GBR) has its own Cloudflare Tunnel that exposes four services:

- **Frontend** (Next.js) - `{instance}-app.dive25.com`
- **Backend** (Express.js API) - `{instance}-api.dive25.com`
- **Keycloak** (IdP) - `{instance}-idp.dive25.com`
- **KAS** (Key Access Service) - `{instance}-kas.dive25.com`

## Files

```
cloudflared/
├── config.yml                    # USA (Hub) tunnel configuration
├── config-fra.yml                # France tunnel configuration
├── config-gbr.yml                # United Kingdom tunnel configuration
├── tunnel-credentials.json       # USA tunnel credentials (SENSITIVE)
├── fra-tunnel-credentials.json   # FRA tunnel credentials (SENSITIVE)
├── gbr-tunnel-credentials.json   # GBR tunnel credentials (SENSITIVE)
└── README.md                     # This file
```

## Tunnel Details

### USA (Hub)
- **Tunnel ID**: `f8e6c558-847b-4952-b8b2-27f98a85e36c`
- **Metrics Port**: 9126
- **Domains**:
  - https://usa-app.dive25.com → localhost:3000 (Frontend)
  - https://usa-api.dive25.com → localhost:4000 (Backend)
  - https://usa-idp.dive25.com → localhost:8443 (Keycloak)
  - https://usa-kas.dive25.com → localhost:8085 (KAS)
  - https://usa-opa.dive25.com → localhost:8181 (OPA)
  - https://usa-opal.dive25.com → localhost:7002 (OPAL Server)

### FRA (France)
- **Tunnel ID**: `e07574bd-6f32-478b-8f71-42fc3d4073f7`
- **Metrics Port**: 9127
- **Domains**:
  - https://fra-app.dive25.com → localhost:3001 (Frontend)
  - https://fra-api.dive25.com → localhost:4001 (Backend)
  - https://fra-idp.dive25.com → localhost:8444 (Keycloak)
  - https://fra-kas.dive25.com → localhost:8086 (KAS)
  - https://fra-opa.dive25.com → localhost:8490 (OPA)
  - https://fra-opal.dive25.com → localhost:9191 (OPAL Client)

### GBR (United Kingdom)
- **Tunnel ID**: `375d2bed-2002-4604-9fa6-22ca251ac957`
- **Metrics Port**: 9128
- **Domains**:
  - https://gbr-app.dive25.com → localhost:3003 (Frontend)
  - https://gbr-api.dive25.com → localhost:4003 (Backend)
  - https://gbr-idp.dive25.com → localhost:8446 (Keycloak)
  - https://gbr-kas.dive25.com → localhost:8093 (KAS)
  - https://gbr-opa.dive25.com → localhost:8491 (OPA)
  - https://gbr-opal.dive25.com → localhost:9212 (OPAL Client)

## Management Scripts

### Start All Tunnels
```bash
./scripts/start-cloudflared-tunnels.sh
```

Starts all three tunnels (USA, FRA, GBR) in the background. Each tunnel runs as a separate process and logs to its own file.

### Stop All Tunnels
```bash
./scripts/stop-cloudflared-tunnels.sh
```

Gracefully stops all running cloudflared tunnels.

### Check Tunnel Status
```bash
./scripts/cloudflared-status.sh
```

Shows the current status of all tunnels including:
- Running status
- Process ID (PID)
- Number of Cloudflare connections
- Last activity timestamp
- Domain endpoints

## Prerequisites

### Install cloudflared
```bash
# macOS
brew install cloudflare/cloudflare/cloudflared

# Linux
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Windows
# Download from: https://github.com/cloudflare/cloudflared/releases
```

### Verify Installation
```bash
cloudflared --version
```

## Configuration

### Tunnel Configuration Files
Each instance has a configuration file (`config.yml`, `config-fra.yml`, `config-gbr.yml`) that defines:
- Tunnel ID and credentials file path
- Protocol (HTTP/2)
- Metrics endpoint
- Ingress rules (domain → service mapping)

Example ingress rule:
```yaml
- hostname: usa-app.dive25.com
  service: https://hub-frontend:3000
  originRequest:
    noTLSVerify: true
    connectTimeout: 60s
    httpHostHeader: usa-app.dive25.com
```

### Credentials Files
Tunnel credentials (`*-tunnel-credentials.json`) contain:
- Account Tag
- Tunnel Secret (encrypted)
- Tunnel ID

**⚠️ SECURITY**: Credentials files are sensitive and should NOT be committed to public repositories.

## Monitoring

### Metrics Endpoints
Each tunnel exposes Prometheus metrics:
- USA: http://localhost:9126/metrics
- FRA: http://localhost:9127/metrics
- GBR: http://localhost:9128/metrics

### Log Files
Tunnel logs are written to:
```
logs/
├── cloudflared-usa.log
├── cloudflared-fra.log
└── cloudflared-gbr.log
```

View live logs:
```bash
tail -f logs/cloudflared-usa.log
tail -f logs/cloudflared-fra.log
tail -f logs/cloudflared-gbr.log
```

### Health Check
Each tunnel maintains 4 connections to Cloudflare for high availability. Check connection status in logs:
```bash
grep "Registered tunnel connection" logs/cloudflared-*.log
```

## Troubleshooting

### Tunnel Won't Start
1. Check if cloudflared is installed: `cloudflared --version`
2. Verify credentials file exists and is readable
3. Check if port is already in use: `lsof -i :9126` (or 9127, 9128)
4. Review log file for errors: `cat logs/cloudflared-{instance}.log`

### Domain Not Resolving
1. Verify tunnel is running: `./scripts/cloudflared-status.sh`
2. Check DNS records in Cloudflare dashboard
3. Verify ingress rules in configuration file
4. Check Cloudflare tunnel dashboard: https://one.dash.cloudflare.com/

### Connection Dropped
Cloudflared automatically reconnects. If persistent:
1. Restart tunnel: `./scripts/stop-cloudflared-tunnels.sh && ./scripts/start-cloudflared-tunnels.sh`
2. Check network connectivity
3. Review Cloudflare status page: https://www.cloudflarestatus.com/

### Service Behind Tunnel Unreachable
1. Verify backend service is running: `docker ps | grep {service}`
2. Check service health: `curl -k https://localhost:{port}/health`
3. Verify firewall rules allow local connections
4. Check Docker network connectivity

## Production Deployment

### Using systemd (Linux)
Create systemd service files:

```ini
# /etc/systemd/system/cloudflared-usa.service
[Unit]
Description=Cloudflare Tunnel - USA
After=network.target

[Service]
Type=simple
User=dive
WorkingDirectory=/opt/dive-v3
ExecStart=/usr/local/bin/cloudflared tunnel --config /opt/dive-v3/cloudflared/config.yml run
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable cloudflared-usa
sudo systemctl start cloudflared-usa
sudo systemctl status cloudflared-usa
```

### Using Docker Compose
Add cloudflared service to docker-compose.yml:

```yaml
cloudflared-usa:
  image: cloudflare/cloudflared:latest
  command: tunnel --config /etc/cloudflared/config.yml run
  environment:
    TUNNEL_TOKEN: ${TUNNEL_TOKEN}
  volumes:
    - ./cloudflared/config.yml:/etc/cloudflared/config.yml:ro
    - ./cloudflared/tunnel-credentials.json:/etc/cloudflared/credentials.json:ro
  restart: unless-stopped
  networks:
    - dive-shared
```

### Kubernetes
Use Cloudflare's official Helm chart or create a Deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cloudflared-usa
spec:
  replicas: 2
  selector:
    matchLabels:
      app: cloudflared-usa
  template:
    metadata:
      labels:
        app: cloudflared-usa
    spec:
      containers:
      - name: cloudflared
        image: cloudflare/cloudflared:latest
        args:
        - tunnel
        - --config
        - /etc/cloudflared/config.yml
        - run
        volumeMounts:
        - name: config
          mountPath: /etc/cloudflared
          readOnly: true
      volumes:
      - name: config
        secret:
          secretName: cloudflared-usa-config
```

## Security Considerations

1. **Credentials Protection**: Never commit credentials files to version control
2. **TLS Verification**: Production tunnels should use proper TLS certificates (not `noTLSVerify: true`)
3. **Access Control**: Use Cloudflare Access to add authentication layers
4. **Rate Limiting**: Configure rate limiting in Cloudflare dashboard
5. **DDoS Protection**: Enable Cloudflare DDoS protection
6. **Secrets Management**: Store credentials in GCP Secret Manager for production

## References

- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [cloudflared CLI Reference](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/)
- [Cloudflare Tunnel Metrics](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/monitor-tunnels/)
- [DIVE V3 Architecture Docs](../docs/)

## Support

For tunnel management issues:
1. Check this README
2. Review tunnel logs
3. Check Cloudflare dashboard
4. Contact DIVE V3 DevOps team

For Cloudflare-specific issues:
- Cloudflare Support: https://support.cloudflare.com/
- Community Forum: https://community.cloudflare.com/
