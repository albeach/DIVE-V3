# DIVE V3 Hub-Spoke Quick Reference Card

**Print this page and keep it handy!**

---

## Architecture Overview

```
       ┌─────────────────────────────────┐
       │           HUB (USA)             │
       │  • Policy Authority (OPAL)      │
       │  • Spoke Registry               │
       │  • Central IdP Broker           │
       └─────────────┬───────────────────┘
                     │ WebSocket (7002)
      ┌──────────────┼──────────────┐
      ▼              ▼              ▼
  ┌───────┐     ┌───────┐     ┌───────┐
  │ SPOKE │     │ SPOKE │     │ SPOKE │
  │  FRA  │     │  GBR  │     │  NZL  │
  └───────┘     └───────┘     └───────┘
```

---

## CLI Cheat Sheet

### Hub Operations

| Command | Description |
|---------|-------------|
| `./dive up` | Start hub |
| `./dive down` | Stop hub |
| `./dive status` | Check status |
| `./dive health` | Health check |
| `./dive logs` | View logs |
| `./dive hub push-policy` | Push to spokes |

### Spoke Deployment

```bash
# 1. Initialize
./dive spoke init NZL "New Zealand"

# 2. Generate certs
./dive --instance nzl spoke generate-certs

# 3. Configure .env
cp instances/nzl/.env.template instances/nzl/.env

# 4. Register
./dive --instance nzl spoke register

# 5. Wait for approval, add token to .env

# 6. Start
./dive --instance nzl spoke up
```

### Spoke Operations

| Command | Description |
|---------|-------------|
| `./dive --instance <code> spoke up` | Start spoke |
| `./dive --instance <code> spoke down` | Stop spoke |
| `./dive --instance <code> spoke status` | Federation status |
| `./dive --instance <code> spoke health` | Service health |
| `./dive --instance <code> spoke logs` | View logs |
| `./dive --instance <code> spoke sync` | Force policy sync |

### Spoke Resilience

| Command | Description |
|---------|-------------|
| `spoke failover status` | Circuit breaker state |
| `spoke failover force-open` | Go offline |
| `spoke failover force-closed` | Go online |
| `spoke maintenance enter "reason"` | Maintenance mode |
| `spoke maintenance exit` | Exit maintenance |
| `spoke audit-status` | Audit queue |

### Policy Management

| Command | Description |
|---------|-------------|
| `./dive policy build --sign` | Build bundle |
| `./dive policy push` | Push to OPAL |
| `./dive policy status` | Check distribution |
| `./dive policy test` | Run OPA tests |

---

## Port Reference

| Service | Port |
|---------|------|
| Frontend | 3000 |
| Backend API | 4000 |
| OPAL Server (Hub) | 7002 |
| OPAL Client (Spoke) | 7000 |
| Keycloak HTTP | 8080 |
| Keycloak HTTPS | 8443 |
| OPA | 8181 |
| MongoDB | 27017 |
| PostgreSQL | 5432 |
| Redis | 6379 |

---

## Health Check URLs

| Service | URL | Expected |
|---------|-----|----------|
| OPA | `localhost:8181/health` | `{}` |
| OPAL Client | `localhost:7000/health` | 200 |
| Backend | `localhost:4000/health` | `{"status":"ok"}` |
| Keycloak | `localhost:8080/health` | 200 |

---

## Key Files

| File | Purpose |
|------|---------|
| `dive` | CLI entry |
| `instances/<code>/config.json` | Spoke config |
| `instances/<code>/.env` | Spoke secrets |
| `instances/<code>/docker-compose.yml` | Services |
| `policies/` | OPA policies |

---

## Environment Variables

```bash
# Set instance
export DIVE_INSTANCE=nzl

# Set environment
export DIVE_ENV=local|gcp|pilot

# Enable pilot mode
export DIVE_PILOT_MODE=true|false

# Hub URL
export DIVE_HUB_URL=https://hub.dive25.com
```

---

## Troubleshooting Quick Checks

```bash
# Check Docker
docker ps | grep dive

# Check OPAL connection
curl localhost:7000/health

# Check OPA policies
curl localhost:8181/v1/policies | jq '.result | length'

# View logs
./dive spoke logs opal-client

# Force reconnect
docker restart dive-v3-opal-client-<code>
```

---

## Circuit Breaker States

| State | Description | Action |
|-------|-------------|--------|
| CLOSED | Normal operation | None |
| OPEN | Offline mode | Using cached policies |
| HALF_OPEN | Testing recovery | Will auto-transition |

---

## Registration Flow

```
1. spoke init → Creates config.json
2. spoke generate-certs → Creates X.509
3. spoke register → Sends to hub
4. Hub admin approves → Issues token
5. Add token to .env
6. spoke up → Connects to OPAL
```

---

## Documentation Links

- Architecture: `docs/HUB_SPOKE_ARCHITECTURE.md`
- 101 Guide: `docs/HUB_SPOKE_101_DEPLOYMENT.md`
- Partner Guide: `docs/PARTNER-ONBOARDING-GUIDE.md`

---

*DIVE V3 | Coalition Federated Identity | hub-spoke v2.0*


