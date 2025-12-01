Let me gather the relevant configuration files to explain the deployment architecture accurately:

[10 tools called]

# DIVE V3 Deployment Architecture

## Executive Summary

DIVE V3 implements a **multi-tenant federated identity platform** for coalition partners (USA, FRA, GBR, DEU) with both **local** and **remote** deployment capabilities. The architecture follows a **hub-spoke federation model** with bidirectional trust relationships.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           DIVE V3 DEPLOYMENT ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ┌────────────────── LOCAL INSTANCES (Your MacBook) ──────────────────┐                │
│  │                                                                     │                │
│  │   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐              │                │
│  │   │     USA     │   │     FRA     │   │     GBR     │              │                │
│  │   │ (Primary)   │   │             │   │             │              │                │
│  │   │  Port Base  │   │  +1 offset  │   │  +2 offset  │              │                │
│  │   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘              │                │
│  │          │                 │                 │                      │                │
│  │          ▼                 ▼                 ▼                      │                │
│  │   ┌─────────────────────────────────────────────────┐              │                │
│  │   │         Cloudflare Tunnels → dive25.com         │              │                │
│  │   │  usa-app.dive25.com  fra-app.dive25.com  etc.   │              │                │
│  │   └─────────────────────────────────────────────────┘              │                │
│  └─────────────────────────────────────────────────────────────────────┘                │
│                                                                                          │
│  ┌────────────────── REMOTE INSTANCE (192.168.42.120) ────────────────┐                │
│  │                                                                     │                │
│  │   ┌─────────────┐                                                  │                │
│  │   │     DEU     │  ← SSH deployment via deploy-remote.sh           │                │
│  │   │   (Remote)  │                                                  │                │
│  │   │  Base ports │                                                  │                │
│  │   └──────┬──────┘                                                  │                │
│  │          │                                                          │                │
│  │          ▼                                                          │                │
│  │   ┌─────────────────────────────────────────────────┐              │                │
│  │   │      Cloudflare Tunnel → prosecurity.biz        │              │                │
│  │   │         deu-app.prosecurity.biz  etc.           │              │                │
│  │   └─────────────────────────────────────────────────┘              │                │
│  └─────────────────────────────────────────────────────────────────────┘                │
│                                                                                          │
│  ┌────────────────── SHARED INFRASTRUCTURE ───────────────────────────┐                │
│  │                                                                     │                │
│  │   ┌─────────────────┐     ┌─────────────────┐                      │                │
│  │   │  GCP Secret     │     │   Terraform     │                      │                │
│  │   │  Manager        │     │   IaC for       │                      │                │
│  │   │  (dive25)       │     │   Keycloak      │                      │                │
│  │   └────────┬────────┘     └────────┬────────┘                      │                │
│  │            │                       │                                │                │
│  │            ▼                       ▼                                │                │
│  │   ┌─────────────────────────────────────────────────┐              │                │
│  │   │     federation-registry.json (SSOT)             │              │                │
│  │   │     Single Source of Truth for all config       │              │                │
│  │   └─────────────────────────────────────────────────┘              │                │
│  └─────────────────────────────────────────────────────────────────────┘                │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Instance Types

### Local Instances (USA, FRA, GBR)

| Property | USA (Primary) | FRA | GBR |
|----------|--------------|-----|-----|
| **Type** | local | local | local |
| **Host** | localhost | localhost | localhost |
| **Domain** | dive25.com | dive25.com | dive25.com |
| **Compose File** | docker-compose.yml | docker-compose.fra.yml | docker-compose.gbr.yml |
| **Project Name** | usa | fra | gbr |
| **Frontend Port** | 3000 | 3001 | 3002 |
| **Backend Port** | 4000 | 4001 | 4002 |
| **Keycloak Port** | 8443 | 8444 | 8445 |
| **Postgres Port** | 5433 | 5434 | 5435 |
| **MongoDB Port** | 27017 | 27018 | 27019 |

**Local instances run on your MacBook** and are accessed via Cloudflare Tunnels that route `*.dive25.com` subdomains to localhost.

### Remote Instance (DEU)

| Property | DEU (Remote) |
|----------|-------------|
| **Type** | remote |
| **Host** | 192.168.42.120 |
| **SSH User** | mike |
| **Domain** | prosecurity.biz |
| **Compose File** | docker-compose.deu.yml |
| **Project Name** | deu |
| **Remote Path** | /opt/dive-v3 |
| **Frontend Port** | 3000 (base) |
| **Backend Port** | 4000 (base) |
| **Keycloak Port** | 8443 (base) |

**DEU runs on a remote server** and is deployed via SSH scripts. It uses a different domain (`prosecurity.biz`) and its own Cloudflare Tunnel.

---

## Technology Stack Per Instance

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SINGLE INSTANCE STACK                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐        │
│   │   Frontend   │────▶│   Backend    │────▶│     OPA      │        │
│   │  (Next.js)   │     │ (Express.js) │     │    (PDP)     │        │
│   │   :3000      │     │    :4000     │     │    :8181     │        │
│   └──────┬───────┘     └──────┬───────┘     └──────────────┘        │
│          │                    │                                      │
│          ▼                    ▼                                      │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐        │
│   │  Keycloak    │     │   MongoDB    │     │    Redis     │        │
│   │   (IdP)      │     │  (Resources) │     │   (Cache)    │        │
│   │   :8443      │     │   :27017     │     │    :6379     │        │
│   └──────┬───────┘     └──────────────┘     └──────────────┘        │
│          │                                                           │
│          ▼                                                           │
│   ┌──────────────┐     ┌──────────────┐                             │
│   │  PostgreSQL  │     │  Cloudflared │                             │
│   │  (Keycloak)  │     │   (Tunnel)   │                             │
│   │   :5432      │     └──────────────┘                             │
│   └──────────────┘                                                   │
│                                                                      │
│   ┌──────────────┐                                                  │
│   │     KAS      │   (Stretch Goal - Key Access Service)            │
│   │   :8080      │                                                  │
│   └──────────────┘                                                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Federation Matrix

All instances federate bidirectionally with each other:

```
           ┌──────┐     ┌──────┐     ┌──────┐     ┌──────┐
           │ USA  │     │ FRA  │     │ GBR  │     │ DEU  │
           └──┬───┘     └──┬───┘     └──┬───┘     └──┬───┘
              │            │            │            │
              ├───────────▶│◀───────────┤            │
              │◀───────────┤            │◀───────────┤
              ├────────────┼───────────▶│            │
              │            ├───────────▶│◀───────────┤
              ├────────────┼────────────┼───────────▶│
              │◀───────────┼────────────┼────────────┤
              │            │◀───────────┼────────────┤
              │            │            │◀───────────┤
```

Each instance can authenticate users from ANY other instance via OIDC federation.

---

## Secrets Management [[memory:11696880]]

All secrets are stored in **GCP Secret Manager** (project: `dive25`):

```
dive25 (GCP Project)
├── dive-v3-keycloak-usa       # USA Keycloak admin password
├── dive-v3-keycloak-fra       # FRA Keycloak admin password
├── dive-v3-keycloak-gbr       # GBR Keycloak admin password
├── dive-v3-keycloak-deu       # DEU Keycloak admin password
├── dive-v3-postgres-usa       # USA PostgreSQL password
├── dive-v3-postgres-fra       # ...
├── dive-v3-mongodb-usa
├── dive-v3-auth-secret-usa    # NextAuth secrets
├── dive-v3-redis-blacklist    # Shared Redis (token blacklist)
├── dive-v3-grafana            # Monitoring password
└── dive-v3-federation-*       # 12 bidirectional federation secrets
```

**Secret Loading:**
- **Local Instances**: `source ./scripts/sync-gcp-secrets.sh [instance]`
- **Remote DEU**: Uses a **dedicated service account** (`dive-v3-deu-sa`) with access **only** to DEU secrets

---

## Deployment Workflows

### Local Instance Deployment

```bash
# 1. Load secrets from GCP
source ./scripts/sync-gcp-secrets.sh usa

# 2. Start the instance
docker compose -p usa up -d

# 3. Apply Terraform (Keycloak configuration)
cd terraform/instances
terraform workspace select usa
terraform apply -var-file=usa.tfvars
```

### Remote Instance (DEU) Deployment

```bash
# Full deployment with all syncs
./scripts/remote/deploy-remote.sh deu --full

# This script:
# 1. Connects via SSH to 192.168.42.120
# 2. Creates backup of current config
# 3. Regenerates Cloudflare tunnel config from SSOT
# 4. Syncs Keycloak themes
# 5. Syncs OPA policies
# 6. Restarts Docker Compose stack
# 7. Verifies endpoints are healthy
```

**Remote Deployment Flow:**

```
┌─────────────────┐       SSH        ┌──────────────────────┐
│   Local Mac     │─────────────────▶│   Remote Server      │
│                 │                  │   (192.168.42.120)   │
├─────────────────┤                  ├──────────────────────┤
│ federation-     │   rsync          │ /opt/dive-v3/        │
│ registry.json   │──────────────────▶│                      │
│ (SSOT)          │                  │ docker-compose.deu.yml│
│                 │                  │ cloudflared/config.yml│
│ scripts/remote/ │                  │ keycloak/themes/     │
│ *.sh            │                  │ policies/            │
└─────────────────┘                  └──────────────────────┘
```

---

## Infrastructure as Code (Terraform)

Keycloak configuration is **100% managed by Terraform**:

```
terraform/
├── instances/
│   ├── instance.tf       # Main module instantiation
│   ├── provider.tf       # Keycloak provider config
│   ├── usa.tfvars        # USA-specific variables
│   ├── fra.tfvars        # FRA-specific variables
│   ├── gbr.tfvars        # GBR-specific variables
│   ├── deu.tfvars        # DEU-specific variables
│   └── terraform.tfstate.d/
│       ├── usa/terraform.tfstate
│       ├── fra/terraform.tfstate
│       ├── gbr/terraform.tfstate
│       └── deu/terraform.tfstate
│
└── modules/
    ├── federated-instance/   # Realm, clients, users, IdP brokers
    └── realm-mfa/            # Authentication flows (AAL1/AAL2/AAL3)
```

**Terraform manages:**
- Keycloak realms
- OIDC clients
- Federation IdP brokers
- Test users with attributes (clearance, countryOfAffiliation, etc.)
- Authentication flows (browser, MFA)
- WebAuthn/Passkey policies

---

## Single Source of Truth (SSOT)

**`config/federation-registry.json`** is the SSOT for ALL configuration:

```json
{
  "instances": {
    "usa": { "type": "local", "domain": "dive25.com", ... },
    "fra": { "type": "local", "domain": "dive25.com", ... },
    "gbr": { "type": "local", "domain": "dive25.com", ... },
    "deu": { "type": "remote", "domain": "prosecurity.biz", "host": "192.168.42.120", ... }
  },
  "federation": {
    "matrix": { "usa": ["fra","gbr","deu"], ... }
  }
}
```

**Generated from SSOT:**
- Cloudflare tunnel configs (`cloudflared/config-*.yml`)
- Docker Compose environment variables
- Terraform variables

---

## Cloudflare Tunnel Architecture

```
Internet                    Cloudflare Edge                Local/Remote
   │                              │                             │
   │  https://usa-app.dive25.com  │    Tunnel: f8e6c558...     │
   │─────────────────────────────▶│────────────────────────────▶│ frontend:3000
   │                              │                             │
   │  https://deu-app.prosecurity │    Tunnel: 2112e264...     │
   │─────────────────────────────▶│────────────────────────────▶│ frontend-deu:3000
   │                              │    (to 192.168.42.120)      │
```

Each instance has its own tunnel:
- **USA**: `f8e6c558...` → `dive25.com`
- **FRA**: `e07574bd...` → `dive25.com`
- **GBR**: `375d2bed...` → `dive25.com`
- **DEU**: `2112e264...` → `prosecurity.biz`

---

## Key Differences: Local vs Remote

| Aspect | Local (USA/FRA/GBR) | Remote (DEU) |
|--------|---------------------|--------------|
| **Location** | Your MacBook | Remote server (192.168.42.120) |
| **Domain** | dive25.com | prosecurity.biz |
| **Deployment** | `docker compose up` | SSH + deploy-remote.sh |
| **Secrets** | Full GCP access | Limited GCP SA (DEU only) |
| **Port Mapping** | Offset ports (3000, 3001, 3002) | Base ports (3000) |
| **WebAuthn RP ID** | dive25.com | prosecurity.biz |
| **State File** | Local tfstate | Local tfstate (applied remotely) |

---

## Summary

The DIVE V3 architecture demonstrates a **real-world multi-nation coalition identity platform** with:

1. **Local development** - 3 instances on your Mac (USA, FRA, GBR)
2. **Remote deployment** - 1 instance on a separate server (DEU)
3. **Unified IaC** - Terraform for Keycloak configuration across all instances
4. **Secure secrets** - GCP Secret Manager with least-privilege access
5. **Zero-trust networking** - Cloudflare Tunnels for public access
6. **Full federation** - Bidirectional trust between all instances