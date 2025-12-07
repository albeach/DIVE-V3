# DIVE V3 Architecture Audit & Deployment Strategy

**Date**: 2025-11-29  
**Purpose**: Comprehensive audit of the full tech stack for Vault secrets management migration  
**Deployment Model**: USA Pilot (persistent) + Remote Coalition Partners  

---

## Executive Summary

This document provides a complete audit of the DIVE V3 infrastructure, identifying all components, their resource requirements, secrets dependencies, and recommendations for a minimal-cost USA pilot deployment with remote coalition partners.

### Key Findings

| Category | Count | Secrets Involved | Critical for Vault |
|----------|-------|------------------|-------------------|
| Core Services | 9 | 15+ unique secrets | ✅ Yes |
| Databases | 3 | 4 passwords | ✅ Yes |
| External Integrations | 2 | 3 credentials | ✅ Yes |
| Federation Relationships | 12 | 12 client secrets | ✅ **Primary Focus** |

---

## Architecture Overview

### Complete Service Topology

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          DIVE V3 FULL ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         CLOUDFLARE EDGE                                  │   │
│  │                                                                          │   │
│  │   dive25.com (landing)                                                   │   │
│  │   usa-app.dive25.com ───┐                                               │   │
│  │   usa-api.dive25.com ───┼── Cloudflare Tunnel ──► Docker Network        │   │
│  │   usa-idp.dive25.com ───┘                                               │   │
│  │   usa-kas.dive25.com ───┘                                               │   │
│  │                                                                          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                          │                                      │
│                                          ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         FRONTEND TIER                                    │   │
│  │                                                                          │   │
│  │   ┌─────────────────────────────────────────────────────────────────┐   │   │
│  │   │  NEXT.JS 15 + NEXTAUTH v5                                       │   │   │
│  │   │                                                                  │   │   │
│  │   │  Port: 3000 (HTTPS)                                             │   │   │
│  │   │  Features:                                                       │   │   │
│  │   │  - App Router with RSC                                          │   │   │
│  │   │  - IdP selection UI                                             │   │   │
│  │   │  - Resource browser                                             │   │   │
│  │   │  - Admin dashboard                                              │   │   │
│  │   │  - ZTDF upload/download                                         │   │   │
│  │   │  - Policies Lab                                                 │   │   │
│  │   │  - Compliance dashboard                                         │   │   │
│  │   │                                                                  │   │   │
│  │   │  Secrets Required:                                              │   │   │
│  │   │  - AUTH_SECRET (NextAuth)                                       │   │   │
│  │   │  - KEYCLOAK_CLIENT_SECRET                                       │   │   │
│  │   │  - DATABASE_URL (PostgreSQL for sessions)                       │   │   │
│  │   └─────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                          │   │
│  └──────────────────────────────────┬──────────────────────────────────────┘   │
│                                     │                                           │
│                                     ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         API TIER                                         │   │
│  │                                                                          │   │
│  │   ┌─────────────────────────────────────────────────────────────────┐   │   │
│  │   │  EXPRESS.JS + TYPESCRIPT                                         │   │   │
│  │   │                                                                  │   │   │
│  │   │  Port: 4000 (HTTPS)                                             │   │   │
│  │   │  Endpoints:                                                      │   │   │
│  │   │  - /api/resources/* (CRUD + ZTDF)                               │   │   │
│  │   │  - /api/admin/* (IdP management)                                │   │   │
│  │   │  - /api/policies-lab/* (XACML/Rego)                             │   │   │
│  │   │  - /api/upload (file upload)                                    │   │   │
│  │   │  - /health, /metrics                                            │   │   │
│  │   │                                                                  │   │   │
│  │   │  Secrets Required:                                              │   │   │
│  │   │  - KEYCLOAK_CLIENT_SECRET                                       │   │   │
│  │   │  - KEYCLOAK_ADMIN_PASSWORD                                      │   │   │
│  │   │  - MONGODB_URL (with credentials)                               │   │   │
│  │   │  - REDIS_URL                                                    │   │   │
│  │   └─────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                          │   │
│  │   ┌─────────────────────────────────────────────────────────────────┐   │   │
│  │   │  KAS (KEY ACCESS SERVICE) - ACP-240 Compliant                   │   │   │
│  │   │                                                                  │   │   │
│  │   │  Port: 8080 (HTTPS)                                             │   │   │
│  │   │  Endpoints:                                                      │   │   │
│  │   │  - POST /request-key (DEK release)                              │   │   │
│  │   │  - GET /health                                                  │   │   │
│  │   │                                                                  │   │   │
│  │   │  Features:                                                       │   │   │
│  │   │  - JWT verification (RS256 via JWKS)                            │   │   │
│  │   │  - Policy re-evaluation via OPA                                 │   │   │
│  │   │  - DEK caching (in-memory, 1hr TTL)                             │   │   │
│  │   │  - ACP-240 audit logging                                        │   │   │
│  │   │  - Cross-KAS federation support                                 │   │   │
│  │   │                                                                  │   │   │
│  │   │  Secrets Required:                                              │   │   │
│  │   │  - (Uses Backend secrets for validation)                        │   │   │
│  │   └─────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                          │   │
│  └──────────────────────────────────┬──────────────────────────────────────┘   │
│                                     │                                           │
│                                     ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         IDENTITY & AUTHORIZATION TIER                    │   │
│  │                                                                          │   │
│  │   ┌─────────────────────────────────────────────────────────────────┐   │   │
│  │   │  KEYCLOAK 26.4.x                                                 │   │   │
│  │   │                                                                  │   │   │
│  │   │  Ports: 8443 (HTTPS), 8080 (HTTP internal), 9000 (management)   │   │   │
│  │   │  Realm: dive-v3-broker                                          │   │   │
│  │   │                                                                  │   │   │
│  │   │  Features:                                                       │   │   │
│  │   │  - IdP Brokering (OIDC federation)                              │   │   │
│  │   │  - Custom themes per instance                                   │   │   │
│  │   │  - JavaScript protocol mappers                                  │   │   │
│  │   │  - MFA (WebAuthn/TOTP)                                          │   │   │
│  │   │  - Clearance-based authentication flows                         │   │   │
│  │   │                                                                  │   │   │
│  │   │  Federation IdP Brokers (per instance):                         │   │   │
│  │   │  - usa-federation (→ USA instance)                              │   │   │
│  │   │  - fra-federation (→ FRA instance)                              │   │   │
│  │   │  - gbr-federation (→ GBR instance)                              │   │   │
│  │   │  - deu-federation (→ DEU instance)                              │   │   │
│  │   │                                                                  │   │   │
│  │   │  Secrets Required:                                              │   │   │
│  │   │  - KEYCLOAK_ADMIN_PASSWORD                                      │   │   │
│  │   │  - KC_DB_PASSWORD (PostgreSQL)                                  │   │   │
│  │   │  - IdP client secrets (12 total) ← VAULT FOCUS                  │   │   │
│  │   │  - TLS certificates                                             │   │   │
│  │   └─────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                          │   │
│  │   ┌─────────────────────────────────────────────────────────────────┐   │   │
│  │   │  OPA (OPEN POLICY AGENT) - PDP                                   │   │   │
│  │   │                                                                  │   │   │
│  │   │  Port: 8181                                                      │   │   │
│  │   │  Policies:                                                       │   │   │
│  │   │  - fuel_inventory_abac_policy.rego (main)                       │   │   │
│  │   │  - federation_abac_policy.rego                                  │   │   │
│  │   │  - coi_coherence_policy.rego                                    │   │   │
│  │   │  - admin_authorization_policy.rego                              │   │   │
│  │   │                                                                  │   │   │
│  │   │  Authorization Checks:                                           │   │   │
│  │   │  - Clearance ≥ Classification                                   │   │   │
│  │   │  - Country ∈ ReleasabilityTo                                    │   │   │
│  │   │  - User COI ∩ Resource COI ≠ ∅                                  │   │   │
│  │   │  - Embargo date checks                                          │   │   │
│  │   │  - ZTDF integrity validation                                    │   │   │
│  │   │  - AAL2/MFA enforcement                                         │   │   │
│  │   │                                                                  │   │   │
│  │   │  No secrets required (stateless)                                │   │   │
│  │   └─────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                          │   │
│  │   ┌─────────────────────────────────────────────────────────────────┐   │   │
│  │   │  AUTHZFORCE (XACML PDP) - Optional                               │   │   │
│  │   │                                                                  │   │   │
│  │   │  Port: 8282                                                      │   │   │
│  │   │  Purpose: XACML 3.0 policy evaluation for NATO compliance       │   │   │
│  │   │  No secrets required                                             │   │   │
│  │   └─────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                          │   │
│  └──────────────────────────────────┬──────────────────────────────────────┘   │
│                                     │                                           │
│                                     ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         DATA TIER                                        │   │
│  │                                                                          │   │
│  │   ┌────────────────┐  ┌────────────────┐  ┌────────────────┐           │   │
│  │   │ POSTGRESQL 15  │  │  MONGODB 7.0   │  │  REDIS 7       │           │   │
│  │   │                │  │                │  │                │           │   │
│  │   │ Port: 5432     │  │ Port: 27017    │  │ Port: 6379     │           │   │
│  │   │                │  │                │  │                │           │   │
│  │   │ Databases:     │  │ Collections:   │  │ Keys:          │           │   │
│  │   │ - keycloak_db  │  │ - resources    │  │ - session:*    │           │   │
│  │   │ - dive_v3_app  │  │ - audit_logs   │  │ - blacklist:*  │           │   │
│  │   │                │  │ - policies     │  │ - cache:*      │           │   │
│  │   │ Secrets:       │  │                │  │                │           │   │
│  │   │ - POSTGRES_    │  │ Secrets:       │  │ Secrets:       │           │   │
│  │   │   PASSWORD     │  │ - MONGO_INITDB_│  │ - (Optional)   │           │   │
│  │   │                │  │   ROOT_PASSWORD│  │                │           │   │
│  │   └────────────────┘  └────────────────┘  └────────────────┘           │   │
│  │                                                                          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                         MONITORING (OPTIONAL)                                   │
│                                                                                 │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                        │
│   │  Prometheus  │  │   Grafana    │  │ AlertManager │                        │
│   │  Port: 9090  │  │  Port: 3001  │  │  Port: 9093  │                        │
│   └──────────────┘  └──────────────┘  └──────────────┘                        │
│                                                                                 │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                        │
│   │ Mongo Export │  │ PG Exporter  │  │ Redis Export │                        │
│   │  Port: 9216  │  │  Port: 9187  │  │  Port: 9121  │                        │
│   └──────────────┘  └──────────────┘  └──────────────┘                        │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Secrets Inventory

### Complete Secrets Matrix

| Secret Category | Secret Name | Used By | Current Storage | Vault Priority |
|-----------------|-------------|---------|-----------------|----------------|
| **Database** | | | | |
| | `POSTGRES_PASSWORD` | PostgreSQL, Keycloak, Frontend | `.env.secrets` | Medium |
| | `MONGO_INITDB_ROOT_PASSWORD` | MongoDB, Backend, KAS | `.env.secrets` | Medium |
| | `REDIS_PASSWORD` | Redis (optional) | Not used | Low |
| **Keycloak** | | | | |
| | `KEYCLOAK_ADMIN_PASSWORD` | Keycloak, Backend, Terraform | `.env.secrets` | High |
| | `KEYCLOAK_CLIENT_SECRET` | Frontend, Backend | Hardcoded! | High |
| | `AUTH_SECRET` | NextAuth | Hardcoded! | High |
| **Federation** | | | | |
| | `dive-v3-federation-usa-fra` | USA→FRA IdP broker | Script sync | **CRITICAL** |
| | `dive-v3-federation-usa-gbr` | USA→GBR IdP broker | Script sync | **CRITICAL** |
| | `dive-v3-federation-usa-deu` | USA→DEU IdP broker | Script sync | **CRITICAL** |
| | `dive-v3-federation-fra-usa` | FRA→USA IdP broker | Script sync | **CRITICAL** |
| | `dive-v3-federation-fra-gbr` | FRA→GBR IdP broker | Script sync | **CRITICAL** |
| | `dive-v3-federation-fra-deu` | FRA→DEU IdP broker | Script sync | **CRITICAL** |
| | `dive-v3-federation-gbr-usa` | GBR→USA IdP broker | Script sync | **CRITICAL** |
| | `dive-v3-federation-gbr-fra` | GBR→FRA IdP broker | Script sync | **CRITICAL** |
| | `dive-v3-federation-gbr-deu` | GBR→DEU IdP broker | Script sync | **CRITICAL** |
| | `dive-v3-federation-deu-usa` | DEU→USA IdP broker | Script sync | **CRITICAL** |
| | `dive-v3-federation-deu-fra` | DEU→FRA IdP broker | Script sync | **CRITICAL** |
| | `dive-v3-federation-deu-gbr` | DEU→GBR IdP broker | Script sync | **CRITICAL** |
| **External** | | | | |
| | Cloudflare Tunnel Token | cloudflared | `tunnel-credentials.json` | Medium |
| | GCP Service Account Key | Vault sync (new) | `gcp/*.json` | High |
| **TLS** | | | | |
| | `certificate.pem` | All HTTPS services | `keycloak/certs/` | Low (not secret) |
| | `key.pem` | All HTTPS services | `keycloak/certs/` | Medium |

### Current Security Issues

1. **Hardcoded Secrets in Docker Compose**:
   ```yaml
   # docker-compose.yml - SECURITY ISSUE
   KEYCLOAK_CLIENT_SECRET: 8AcfbgtdNIZp3tbrcmc2voiUfxNb8d6L
   AUTH_SECRET: fWBbrGVdA46YMp+7ZB125SXcTp6nA+mxic2KRzKg7sg=
   ```

2. **Different secrets per instance (unmanaged)**:
   - USA: `8AcfbgtdNIZp3tbrcmc2voiUfxNb8d6L`
   - DEU: `LjO1LIj6LUhEMgJtWhGDqeYER6mpCfhB`

3. **Federation secrets use placeholder pattern**:
   ```hcl
   client_secret = optional(string, "placeholder-sync-after-terraform")
   ```

---

## Resource Requirements

### Minimal USA Pilot Deployment

For a **minimal cost persistent pilot**, here are the resource requirements:

#### Option A: Single VPS (Recommended for Pilot)

| Provider | Instance Type | vCPU | RAM | Storage | Est. Cost |
|----------|---------------|------|-----|---------|-----------|
| DigitalOcean | s-4vcpu-8gb | 4 | 8 GB | 160 GB SSD | $48/mo |
| Linode | g6-standard-4 | 4 | 8 GB | 160 GB SSD | $48/mo |
| GCP | e2-standard-4 | 4 | 16 GB | 100 GB SSD | $80/mo |
| AWS | t3.xlarge | 4 | 16 GB | 100 GB EBS | $120/mo |

**Recommended**: DigitalOcean or Linode at ~$48/mo

#### Per-Service Resource Allocation

| Service | Memory | CPU | Disk | Persistence |
|---------|--------|-----|------|-------------|
| Keycloak | 1.5 GB | 1 vCPU | - | PostgreSQL |
| PostgreSQL | 512 MB | 0.5 vCPU | 10 GB | Volume |
| MongoDB | 512 MB | 0.5 vCPU | 10 GB | Volume |
| Redis | 128 MB | 0.1 vCPU | 1 GB | Volume |
| Backend | 512 MB | 0.5 vCPU | - | Stateless |
| Frontend | 1 GB | 0.5 vCPU | - | Stateless |
| KAS | 256 MB | 0.25 vCPU | - | Stateless |
| OPA | 128 MB | 0.1 vCPU | - | Stateless |
| Cloudflared | 64 MB | 0.1 vCPU | - | Stateless |
| **Total** | **4.6 GB** | **3.5 vCPU** | **21 GB** | |

#### Option B: Minimal Services Only

For absolute minimal cost, disable optional services:

| Configuration | Services | Est. Cost |
|---------------|----------|-----------|
| **Full Stack** | All 9 services | $48-80/mo |
| **Essential** | No AuthzForce, No Monitoring | $36/mo |
| **Minimal** | No AuthzForce, No Monitoring, Single DB | $24/mo |

---

## Deployment Model: USA Pilot + Remote Partners

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    USA PILOT + REMOTE PARTNERS MODEL                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │                         USA PILOT (Persistent)                          │  │
│   │                                                                          │  │
│   │   Location: DigitalOcean / Linode / GCP (US-East)                       │  │
│   │   Domain: dive25.com (Cloudflare Account 1)                             │  │
│   │   Services: Full stack (9 services)                                     │  │
│   │   Cost: ~$50/mo                                                          │  │
│   │                                                                          │  │
│   │   ┌─────────────────────────────────────────────────────────────────┐   │  │
│   │   │  GCP SECRET MANAGER (Centralized Secrets)                       │   │  │
│   │   │                                                                  │   │  │
│   │   │  - Federation secrets (12)                                      │   │  │
│   │   │  - Database passwords (3)                                       │   │  │
│   │   │  - Client secrets (4)                                           │   │  │
│   │   │  - Cost: ~$1/mo                                                 │   │  │
│   │   └─────────────────────────────────────────────────────────────────┘   │  │
│   │                                                                          │  │
│   │   IdP Brokers: fra-federation, gbr-federation, deu-federation          │  │
│   │                                                                          │  │
│   └────────────────────────────────┬────────────────────────────────────────┘  │
│                                    │                                            │
│            ┌───────────────────────┼───────────────────────┐                   │
│            │                       │                       │                   │
│            ▼                       ▼                       ▼                   │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────────┐        │
│   │  FRA (Remote)   │   │  GBR (Remote)   │   │  DEU (Remote)       │        │
│   │                 │   │                 │   │                     │        │
│   │  Hosted by:     │   │  Hosted by:     │   │  Hosted by:         │        │
│   │  Partner infra  │   │  Partner infra  │   │  prosecurity.biz    │        │
│   │                 │   │                 │   │                     │        │
│   │  Requirements:  │   │  Requirements:  │   │  Requirements:      │        │
│   │  - Docker       │   │  - Docker       │   │  - Docker           │        │
│   │  - Cloudflare   │   │  - Cloudflare   │   │  - Cloudflare       │        │
│   │    tunnel       │   │    tunnel       │   │    tunnel           │        │
│   │  - GCP SA key   │   │  - GCP SA key   │   │  - GCP SA key       │        │
│   │                 │   │                 │   │                     │        │
│   │  IdP Brokers:   │   │  IdP Brokers:   │   │  IdP Brokers:       │        │
│   │  usa-federation │   │  usa-federation │   │  usa-federation     │        │
│   │  gbr-federation │   │  gbr-federation │   │  fra-federation     │        │
│   │  deu-federation │   │  deu-federation │   │  gbr-federation     │        │
│   └─────────────────┘   └─────────────────┘   └─────────────────────┘        │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Partner Deployment Requirements

Each remote partner needs:

1. **Infrastructure**:
   - VPS with 4+ vCPU, 8+ GB RAM
   - Docker and Docker Compose installed
   - Cloudflare account with tunnel configured

2. **Secrets Access**:
   - GCP Service Account key (for Vault sync)
   - Read access to their federation secrets only

3. **Files from USA Pilot**:
   - `docker-compose.{partner}.yml`
   - `config/federation-registry.json`
   - `policies/` directory (Rego policies)
   - `keycloak/themes/` (shared themes)

4. **Network**:
   - Outbound HTTPS to GCP Secret Manager
   - Outbound HTTPS to other partners (via Cloudflare)

---

## Integration Flows

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         FEDERATED AUTHENTICATION FLOW                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   1. User → usa-app.dive25.com/login                                           │
│                                                                                 │
│   2. Frontend shows IdP selection (USA, FRA, GBR, DEU)                         │
│                                                                                 │
│   3. User selects "Login via Germany (DEU)"                                    │
│      │                                                                          │
│      ▼                                                                          │
│   4. Frontend → usa-idp.dive25.com/broker/deu-federation/endpoint              │
│      │                                                                          │
│      │  [USA Keycloak uses deu-federation IdP broker]                          │
│      │  [Client secret from ${vault.deu-federation-secret}]                    │
│      │                                                                          │
│      ▼                                                                          │
│   5. Redirect → deu-idp.prosecurity.biz/realms/dive-v3-broker/auth             │
│      │                                                                          │
│      │  [DEU Keycloak authenticates user locally]                              │
│      │  [MFA if clearance requires AAL2]                                       │
│      │                                                                          │
│      ▼                                                                          │
│   6. DEU issues token with claims:                                             │
│      - uniqueID: testuser-deu-3                                                │
│      - clearance: SECRET                                                       │
│      - countryOfAffiliation: DEU                                               │
│      - acpCOI: ["NATO", "EU-RESTRICTED"]                                       │
│      │                                                                          │
│      ▼                                                                          │
│   7. Redirect → usa-idp.dive25.com/broker/deu-federation/endpoint              │
│      │                                                                          │
│      │  [USA Keycloak maps claims via IdP mappers]                             │
│      │  [Creates or links federated user]                                      │
│      │                                                                          │
│      ▼                                                                          │
│   8. USA issues final token → usa-app.dive25.com/api/auth/callback             │
│      │                                                                          │
│      │  [NextAuth creates session]                                             │
│      │  [JWT stored in cookie]                                                 │
│      │                                                                          │
│      ▼                                                                          │
│   9. User authenticated on USA instance with DEU identity                       │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Resource Access Flow (with KAS)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         ENCRYPTED RESOURCE ACCESS FLOW                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   1. User browses resources on usa-app.dive25.com/resources                    │
│      │                                                                          │
│      ▼                                                                          │
│   2. Frontend → usa-api.dive25.com/api/resources                               │
│      │                                                                          │
│      │  [Backend validates JWT]                                                │
│      │  [Backend queries OPA for list authorization]                           │
│      │  [OPA filters resources based on user attributes]                       │
│      │                                                                          │
│      ▼                                                                          │
│   3. User clicks "Download" on encrypted ZTDF resource                         │
│      │                                                                          │
│      ▼                                                                          │
│   4. Frontend → usa-api.dive25.com/api/resources/{id}/download                 │
│      │                                                                          │
│      │  [Backend checks resource.encrypted = true]                             │
│      │  [Backend identifies KAS from resource.kasUrl]                          │
│      │                                                                          │
│      ▼                                                                          │
│   5. Backend → usa-kas.dive25.com/request-key                                  │
│      │                                                                          │
│      │  POST /request-key                                                       │
│      │  {                                                                       │
│      │    resourceId: "fuel-report-001",                                       │
│      │    kaoId: "kao-abc123",                                                 │
│      │    bearerToken: "<user JWT>",                                           │
│      │    wrappedKey: "<encrypted DEK>"                                        │
│      │  }                                                                       │
│      │                                                                          │
│      ▼                                                                          │
│   6. KAS validates JWT signature (JWKS from usa-idp.dive25.com)                │
│      │                                                                          │
│      ▼                                                                          │
│   7. KAS queries OPA for policy re-evaluation                                  │
│      │                                                                          │
│      │  POST http://opa:8181/v1/data/dive/authorization                        │
│      │  {                                                                       │
│      │    input: {                                                              │
│      │      subject: { clearance, country, acpCOI },                           │
│      │      resource: { classification, releasabilityTo, COI },                │
│      │      action: { operation: "decrypt" }                                   │
│      │    }                                                                     │
│      │  }                                                                       │
│      │                                                                          │
│      ▼                                                                          │
│   8. OPA returns: { allow: true, reason: "All checks passed" }                 │
│      │                                                                          │
│      ▼                                                                          │
│   9. KAS unwraps DEK and returns to Backend                                    │
│      │                                                                          │
│      ▼                                                                          │
│   10. Backend decrypts ZTDF content using DEK                                   │
│      │                                                                          │
│      ▼                                                                          │
│   11. Backend returns plaintext to Frontend                                     │
│      │                                                                          │
│      ▼                                                                          │
│   12. User sees decrypted document                                              │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Recommendations

### Phase 1: Immediate Actions (Week 1)

1. **Fix Hardcoded Secrets**
   - Move `KEYCLOAK_CLIENT_SECRET` to environment variables
   - Move `AUTH_SECRET` to environment variables
   - Update docker-compose files to use `${VAR}` syntax

2. **Set Up GCP Project**
   ```bash
   gcloud projects create dive-v3-pilot
   gcloud services enable secretmanager.googleapis.com
   ```

3. **Deploy Vault Infrastructure**
   - Apply `terraform/modules/secrets-manager`
   - Create service accounts for each instance
   - Upload initial federation secrets

### Phase 2: USA Pilot Deployment (Week 2)

1. **Provision VPS**
   - DigitalOcean 4vCPU/8GB droplet
   - Install Docker, Docker Compose
   - Configure DNS (if not using Cloudflare)

2. **Deploy USA Instance with Vault**
   ```bash
   # Clone repo
   git clone https://github.com/your-org/DIVE-V3.git
   cd DIVE-V3
   
   # Configure GCP credentials
   cp gcp/service-account.json.example gcp/service-account.json
   # Edit with actual credentials
   
   # Deploy with vault
   INSTANCE=usa ./scripts/vault/deploy-with-vault.sh
   ```

3. **Verify Federation**
   - Test all 3 remote IdP connections
   - Verify secrets are syncing from GCP

### Phase 3: Remote Partner Onboarding (Week 3-4)

1. **Create Partner Package**
   ```bash
   ./scripts/create-partner-package.sh deu
   # Creates: dive-v3-deu-package.tar.gz
   # Contains: docker-compose, configs, scripts
   ```

2. **Partner Deploys Locally**
   - Partner provisions their own VPS
   - Partner configures Cloudflare tunnel
   - Partner deploys using provided package

3. **Establish Federation**
   - Run `./scripts/vault/upload-federation-secrets.sh`
   - Verify bidirectional trust

---

## Cost Summary

### USA Pilot (Minimal)

| Component | Monthly Cost |
|-----------|--------------|
| VPS (4vCPU/8GB) | $48 |
| GCP Secret Manager | $1 |
| Cloudflare (Free tier) | $0 |
| Domain (annual/12) | $1 |
| **Total** | **~$50/mo** |

### With Monitoring

| Component | Monthly Cost |
|-----------|--------------|
| VPS (6vCPU/16GB) | $96 |
| GCP Secret Manager | $1 |
| Cloudflare (Free tier) | $0 |
| Domain (annual/12) | $1 |
| **Total** | **~$100/mo** |

### Partner Costs (Each)

| Component | Monthly Cost |
|-----------|--------------|
| VPS (4vCPU/8GB) | $48 |
| GCP Secret Access | $0.03 |
| Cloudflare (Free tier) | $0 |
| **Total per Partner** | **~$50/mo** |

---

## Security Considerations

### Defense in Depth Layers

1. **Network**: Cloudflare tunnels (no public ports exposed)
2. **Transport**: HTTPS everywhere (mkcert for internal)
3. **Authentication**: Keycloak with MFA, JWT validation
4. **Authorization**: OPA policies (fail-closed)
5. **Data**: ZTDF encryption with KAS re-evaluation
6. **Secrets**: GCP Secret Manager with IAM

### Audit Trail

| Component | Audit Capability |
|-----------|------------------|
| GCP Secret Manager | Cloud Audit Logs |
| Keycloak | Event logging |
| OPA | Decision logs |
| KAS | ACP-240 audit events |
| Backend | Winston structured logs |
| MongoDB | Change streams (optional) |

---

## Next Steps

1. **Review this document** and confirm deployment model
2. **Approve GCP project creation**
3. **Proceed with ADR-001 implementation** (Vault secrets)
4. **Deploy USA pilot** on VPS
5. **Create partner onboarding package**
6. **Document runbooks** for operations

---

## References

- [ADR-001: Vault Secrets Management](./ADR-001-VAULT-SECRETS-MANAGEMENT.md)
- [Partner Onboarding Guide](./PARTNER-ONBOARDING-GUIDE.md)
- [Federation Registry](../config/federation-registry.json)
- [KAS Registry](../config/kas-registry.json)









