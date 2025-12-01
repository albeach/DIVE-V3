# DIVE V3 Deployment & Sync Guide

## Overview

This document outlines the deployment architecture for DIVE V3 across local and remote instances, ensuring all configurations remain persistent and synchronized.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           DIVE V3 DEPLOYMENT ARCHITECTURE                        │
└─────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
│        LOCAL MACHINE (MacOS)          │     │      REMOTE SERVER (ProSecurity)     │
│        ────────────────────           │     │      ───────────────────────         │
│                                       │     │                                       │
│  ┌─────────────────────────────────┐ │     │  ┌─────────────────────────────────┐ │
│  │     DOCKER COMPOSE STACKS       │ │     │  │     DOCKER COMPOSE STACK        │ │
│  │  ┌────────┐ ┌────────┐ ┌──────┐│ │     │  │  ┌────────────────────────────┐ │ │
│  │  │  USA   │ │  FRA   │ │ GBR  ││ │     │  │  │           DEU              │ │ │
│  │  │        │ │        │ │      ││ │     │  │  │                            │ │ │
│  │  │ :8443  │ │ :8444  │ │:8445 ││ │     │  │  │ deu-idp.prosecurity.biz    │ │ │
│  │  │ :3000  │ │ :3001  │ │:3002 ││ │     │  │  │ deu-app.prosecurity.biz    │ │ │
│  │  │ :4000  │ │ :4001  │ │:4002 ││ │     │  │  │ deu-api.prosecurity.biz    │ │ │
│  │  └────────┘ └────────┘ └──────┘│ │     │  │  └────────────────────────────┘ │ │
│  │                                 │ │     │  │                                 │ │
│  │  ┌─────────────────────────────┐│ │     │  └─────────────────────────────────┘ │
│  │  │      SHARED SERVICES        ││ │     │                                       │
│  │  │ • Redis (blacklist)         ││ │     │                                       │
│  │  │ • Landing Page              ││ │     │                                       │
│  │  └─────────────────────────────┘│ │     │                                       │
│  └─────────────────────────────────┘ │     └──────────────────────────────────────┘
│                                       │                      │
│  ┌─────────────────────────────────┐ │                      │
│  │     CLOUDFLARE TUNNELS          │ │                      │
│  │  • usa-idp.dive25.com           │ │                      │
│  │  • usa-app.dive25.com           │ │                      │
│  │  • usa-api.dive25.com           │ │                      │
│  │  • fra-idp.dive25.com           │ │                      │
│  │  • fra-app.dive25.com           │ │                      │
│  │  • gbr-idp.dive25.com           │ │                      │
│  │  • gbr-app.dive25.com           │ │                      │
│  │  • dive25.com (landing)         │ │                      │
│  └─────────────────────────────────┘ │                      │
│                                       │                      │
└───────────────────────────────────────┘                      │
                    │                                          │
                    │         ┌─────────────────┐              │
                    │         │   GITHUB REPO   │              │
                    └────────►│  (Source Truth) │◄─────────────┘
                              │                 │
                              │ • Frontend Code │
                              │ • Backend Code  │
                              │ • Terraform     │
                              │ • Docker Configs│
                              └─────────────────┘
```

---

## Federation Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│                    FEDERATION TRUST MATRIX                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│           USA ◄──────────────────────────► FRA                   │
│            │                                 │                   │
│            │                                 │                   │
│            ▼                                 ▼                   │
│           GBR ◄──────────────────────────► DEU                   │
│            │                                 │                   │
│            │                                 │                   │
│            └────────────────┬────────────────┘                   │
│                             │                                    │
│                     FULL MESH FEDERATION                         │
│                  (Bidirectional OIDC Trust)                      │
│                                                                  │
│   USA ↔ FRA    USA ↔ GBR    USA ↔ DEU                           │
│   FRA ↔ GBR    FRA ↔ DEU    GBR ↔ DEU                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Changes Made (This Session)

### 1. Code Changes (✅ Persistent - In Git)

| File | Change | Purpose |
|------|--------|---------|
| `frontend/src/components/navigation.tsx` | Added `SignOutIconButton` component | Visible sign-out icon in nav bar |
| `frontend/src/middleware.ts` | Updated CSP `form-action` directive | Allow auth forms to submit to Keycloak |
| `frontend/src/middleware.ts` | Updated CSP `img-src` directive | Allow AuthJS provider icons |
| `frontend/next.config.ts` | Disabled `devIndicators` | Hide Next.js "N" debug icon |

### 2. Runtime Configurations (⚠️ Stored in Keycloak DB)

| Configuration | Location | Persistence |
|---------------|----------|-------------|
| Federation IdP Brokers | Keycloak PostgreSQL | ✅ Persistent (in Docker volume) |
| Client Redirect URIs | Keycloak PostgreSQL | ✅ Persistent (in Docker volume) |
| Test Users | Keycloak PostgreSQL | ✅ Persistent (in Docker volume) |
| Realm Settings | Keycloak PostgreSQL | ✅ Persistent (in Docker volume) |

**WARNING**: These persist across container restarts but are LOST if Docker volumes are deleted.

### 3. Environment Variables (✅ Persistent - In Files)

| File | Variables |
|------|-----------|
| `.env` | `KEYCLOAK_ADMIN_PASSWORD=DivePilot2025!SecureAdmin` |
| `.env.fra` | `KEYCLOAK_ADMIN_PASSWORD=DivePilot2025!SecureAdmin` |
| `docker-compose.*.yml` | All service configurations |

---

## Sync Strategy

### Local → GitHub → Remote

```
┌─────────────┐      git push      ┌─────────────┐      git pull      ┌─────────────┐
│   LOCAL     │ ─────────────────► │   GITHUB    │ ─────────────────► │   REMOTE    │
│   DEV       │                    │   REPO      │                    │   (DEU)     │
└─────────────┘                    └─────────────┘                    └─────────────┘
      │                                                                      │
      │                                                                      │
      ▼                                                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SYNC PROCEDURE                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   1. LOCAL: Make code changes                                                   │
│   2. LOCAL: Test with USA/FRA/GBR instances                                     │
│   3. LOCAL: git add, commit, push                                               │
│   4. REMOTE: git pull                                                           │
│   5. REMOTE: docker-compose down && docker-compose up -d --build                │
│   6. REMOTE: Verify federation with terraform apply (if needed)                 │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Deployment Commands

### Local Instances (USA, FRA, GBR)

```bash
# Start all local instances
cd /path/to/DIVE-V3

# Shared services first
docker-compose -f docker-compose.shared.yml -p dive-shared up -d

# Individual instances
docker-compose -f docker-compose.yml -p dive-v3 up -d           # USA
docker-compose -f docker-compose.fra.yml -p dive-v3-fra up -d   # FRA  
docker-compose -f docker-compose.gbr.yml -p dive-v3-gbr up -d   # GBR

# Landing page
docker-compose -f dive25-landing/docker-compose.yml -p dive-landing up -d
```

### Remote Instance (DEU)

```bash
# SSH to remote server
ssh user@prosecurity.biz

# Pull latest changes
cd /path/to/DIVE-V3
git pull origin main

# Rebuild and restart
docker-compose -f docker-compose.deu.yml down
docker-compose -f docker-compose.deu.yml up -d --build
```

---

## Keycloak Configuration Backup

To ensure Keycloak configurations are not lost, export realms periodically:

```bash
# Export USA realm
docker exec dive-v3-keycloak /opt/keycloak/bin/kc.sh export \
  --dir /opt/keycloak/data/import \
  --realm dive-v3-broker

# Copy export to host
docker cp dive-v3-keycloak:/opt/keycloak/data/import ./keycloak-exports/usa/
```

---

## Terraform for Infrastructure as Code

Federation and users CAN be managed via Terraform for true persistence:

```bash
cd terraform/instances

# USA
terraform workspace select usa
terraform apply -var-file=usa.tfvars

# FRA  
terraform workspace select fra
terraform apply -var-file=fra.tfvars

# GBR
terraform workspace select gbr
terraform apply -var-file=gbr.tfvars

# DEU (remote)
terraform workspace select deu
terraform apply -var-file=deu.tfvars
```

---

## Port Allocations

| Instance | Keycloak | Frontend | Backend | KAS |
|----------|----------|----------|---------|-----|
| USA | 8443 | 3000 | 4000 | 8080 |
| FRA | 8444 | 3001 | 4001 | 8081 |
| GBR | 8445 | 3002 | 4002 | 8082 |
| DEU | 8446 (remote) | 3003 (remote) | 4003 (remote) | 8083 (remote) |

---

## Credentials Reference

| Component | Username | Password |
|-----------|----------|----------|
| Keycloak Admin (USA/FRA/GBR) | admin | `DivePilot2025!SecureAdmin` |
| Keycloak Admin (DEU) | admin | `DivePilot2025!` |
| Test Users | testuser-{country}-{level} | `TestUser2025!Pilot` |
| MongoDB | admin | See docker-compose files |
| PostgreSQL | keycloak | keycloak |

---

## Troubleshooting

### CSP Blocking Authentication
- **Symptom**: "Refused to send form data" in console
- **Fix**: Ensure `form-action` includes Keycloak URLs in `middleware.ts`

### Federation "Unable to Complete Request"
- **Symptom**: Error page during cross-instance login
- **Causes**:
  1. Missing redirect URIs in client
  2. Wrong client secret in IdP broker config
  3. CSP blocking form submission
- **Fix**: Check client redirect URIs and IdP broker client secrets

### Next.js Dev Indicator
- **Symptom**: "N" circle in bottom-left corner
- **Fix**: Disable `devIndicators` in `next.config.ts`

---

## Version History

| Date | Change | Author |
|------|--------|--------|
| 2025-11-28 | Added sign-out icon, fixed CSP, disabled dev indicator | AI Assistant |
| 2025-11-28 | Created deployment sync guide | AI Assistant |




