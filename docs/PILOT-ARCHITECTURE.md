# DIVE V3 Pilot Architecture

**Multi-Instance Federated Identity Management**

---

## Overview

DIVE V3 implements a federated identity architecture where multiple country instances can authenticate users across organizational boundaries while enforcing attribute-based access control.

---

## Instance Topology

```
                           ┌─────────────────────────────────────────────┐
                           │            CLOUDFLARE TUNNELS               │
                           │    (HTTPS termination, public routing)      │
                           └─────────────────────────────────────────────┘
                                    │               │               │
                    ┌───────────────┼───────────────┼───────────────┼───────────────┐
                    │               │               │               │               │
              ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐        │
              │usa-app.   │   │usa-api.   │   │usa-idp.   │   │usa-kas.   │        │
              │dive25.com │   │dive25.com │   │dive25.com │   │dive25.com │        │
              └─────┬─────┘   └─────┬─────┘   └─────┬─────┘   └─────┬─────┘        │
                    │               │               │               │              │
           ┌────────▼───────────────▼───────────────▼───────────────▼────────┐     │
           │                    USA DOCKER NETWORK                            │     │
           │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │     │
           │  │ Frontend │  │ Backend  │  │ Keycloak │  │   KAS    │         │     │
           │  │  :3000   │  │  :4000   │  │  :8443   │  │  :8080   │         │     │
           │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘         │     │
           │       │             │             │             │                │     │
           │  ┌────▼─────────────▼─────────────▼─────────────▼───────┐       │     │
           │  │                    OPA (:8181)                        │       │     │
           │  │              Policy Decision Point                   │       │     │
           │  └───────────────────────────────────────────────────────┘       │     │
           │                                                                  │     │
           │  ┌──────────┐  ┌──────────┐  ┌──────────┐                       │     │
           │  │ MongoDB  │  │ Postgres │  │  Redis   │                       │     │
           │  │  :27017  │  │  :5432   │  │  :6379   │                       │     │
           │  └──────────┘  └──────────┘  └──────────┘                       │     │
           └─────────────────────────────────────────────────────────────────┘     │
                                                                                    │
                                        ════════════════                            │
                                                                                    │
              ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐        │
              │fra-app.   │   │fra-api.   │   │fra-idp.   │   │fra-kas.   │        │
              │dive25.com │   │dive25.com │   │dive25.com │   │dive25.com │        │
              └─────┬─────┘   └─────┬─────┘   └─────┬─────┘   └─────┬─────┘        │
                    │               │               │               │              │
           ┌────────▼───────────────▼───────────────▼───────────────▼────────┐     │
           │                    FRA DOCKER NETWORK                            │     │
           │    (Same structure as USA, ports offset: +1 for each service)   │     │
           └─────────────────────────────────────────────────────────────────┘     │
                                                                                    │
                                            ...                                     │
                                                                                    │
           ┌─────────────────────────────────────────────────────────────────┐     │
           │                    DEU DOCKER NETWORK                            │     │
           │    (Same structure, ports offset: +2 for each service)          │     │
           └─────────────────────────────────────────────────────────────────┘     │
```

---

## Port Allocation

| Service | USA | FRA | DEU | GBR |
|---------|-----|-----|-----|-----|
| Frontend | 3000 | 3001 | 3002 | 3003 |
| Backend | 4000 | 4001 | 4002 | 4003 |
| Keycloak HTTP | 8080 | 8081 | 8082 | 8083 |
| Keycloak HTTPS | 8443 | 8444 | 8445 | 8446 |
| MongoDB | 27017 | 27018 | 27019 | 27020 |
| Redis | 6379 | 6380 | 6381 | 6382 |
| OPA | 8181 | 8182 | 8183 | 8184 |
| KAS | 8080 | 8081 | 8082 | 8083 |

---

## Federation Flow

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                         FEDERATION AUTHENTICATION FLOW                          │
└────────────────────────────────────────────────────────────────────────────────┘

  User at FRA                FRA Keycloak           USA Keycloak            FRA App
     │                           │                       │                     │
     │ 1. Access fra-app         │                       │                     │
     │────────────────────────────────────────────────────────────────────────▶│
     │                           │                       │                     │
     │ 2. Select USA IdP         │                       │                     │
     │◀───────────────────────────────────────────────────────────────────────│
     │                           │                       │                     │
     │ 3. Redirect to FRA KC     │                       │                     │
     │──────────────────────────▶│                       │                     │
     │                           │                       │                     │
     │                           │ 4. Broker to USA KC   │                     │
     │                           │──────────────────────▶│                     │
     │                           │                       │                     │
     │ 5. Redirect to USA login  │                       │                     │
     │◀──────────────────────────────────────────────────│                     │
     │                           │                       │                     │
     │ 6. Authenticate at USA    │                       │                     │
     │──────────────────────────────────────────────────▶│                     │
     │                           │                       │                     │
     │                           │ 7. Return claims      │                     │
     │                           │◀─────────────────────│                      │
     │                           │                       │                     │
     │                           │ 8. Map & normalize    │                     │
     │                           │   attributes          │                     │
     │                           │                       │                     │
     │ 9. Token with FRA format  │                       │                     │
     │◀──────────────────────────│                       │                     │
     │                           │                       │                     │
     │ 10. Access FRA app        │                       │                     │
     │────────────────────────────────────────────────────────────────────────▶│
     │                           │                       │                     │
```

---

## Authorization Flow

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                           AUTHORIZATION FLOW (PEP/PDP)                          │
└────────────────────────────────────────────────────────────────────────────────┘

  User             Frontend           Backend (PEP)          OPA (PDP)         MongoDB
   │                  │                    │                    │                 │
   │ 1. Request       │                    │                    │                 │
   │     resource     │                    │                    │                 │
   │─────────────────▶│                    │                    │                 │
   │                  │                    │                    │                 │
   │                  │ 2. API call +      │                    │                 │
   │                  │    JWT token       │                    │                 │
   │                  │───────────────────▶│                    │                 │
   │                  │                    │                    │                 │
   │                  │                    │ 3. Extract subject │                 │
   │                  │                    │    attributes      │                 │
   │                  │                    │    from JWT        │                 │
   │                  │                    │                    │                 │
   │                  │                    │ 4. Fetch resource  │                 │
   │                  │                    │    metadata        │                 │
   │                  │                    │────────────────────────────────────▶│
   │                  │                    │                    │                 │
   │                  │                    │◀───────────────────────────────────│
   │                  │                    │                    │                 │
   │                  │                    │ 5. Build OPA       │                 │
   │                  │                    │    input           │                 │
   │                  │                    │{subject, resource, │                 │
   │                  │                    │ action, context}   │                 │
   │                  │                    │                    │                 │
   │                  │                    │ 6. Query OPA       │                 │
   │                  │                    │───────────────────▶│                 │
   │                  │                    │                    │                 │
   │                  │                    │                    │ 7. Evaluate     │
   │                  │                    │                    │    policy       │
   │                  │                    │                    │                 │
   │                  │                    │ 8. Decision        │                 │
   │                  │                    │◀───────────────────│                 │
   │                  │                    │                    │                 │
   │                  │ 9. Resource or     │                    │                 │
   │                  │    403 Forbidden   │                    │                 │
   │                  │◀───────────────────│                    │                 │
   │                  │                    │                    │                 │
   │ 10. Display      │                    │                    │                 │
   │◀─────────────────│                    │                    │                 │
   │                  │                    │                    │                 │
```

---

## Component Responsibilities

### Frontend (Next.js)
- IdP selection UI
- Authentication via NextAuth.js
- Resource display with clearance indicators
- Demo mode badges and instance banners

### Backend (Express.js)
- Policy Enforcement Point (PEP)
- JWT validation
- Resource metadata retrieval
- OPA query orchestration
- Audit logging

### Keycloak
- Identity Provider brokering
- Attribute mapping and normalization
- Token issuance (RS256 signed JWTs)
- Federation trust management

### OPA (Open Policy Agent)
- Policy Decision Point (PDP)
- Rego-based access control rules
- Clearance hierarchy evaluation
- Releasability checks
- COI intersection validation

### MongoDB
- Resource metadata storage
- Classification, releasability, COI
- Audit log persistence

### KAS (Key Access Service)
- Encryption key management
- Policy-bound key release
- Double-check authorization

---

## Attribute Mapping

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      ATTRIBUTE NORMALIZATION                              │
└──────────────────────────────────────────────────────────────────────────┘

  USA IdP Claims              Keycloak Mapper              Normalized Token
  ──────────────              ───────────────              ────────────────
  
  sub: "john.doe"      ──►    uniqueID mapper     ──►     uniqueID: "john.doe"
  
  clearance_level:     ──►    clearance mapper    ──►     clearance: "SECRET"
    "TS-SCI"                  (normalize mapping)
  
  citizenship: "US"    ──►    country mapper      ──►     countryOfAffiliation: "USA"
                              (ISO 3166-1 alpha-3)
  
  coi_tags: ["FVEY"]   ──►    acpCOI mapper       ──►     acpCOI: ["FVEY"]

  ──────────────────────────────────────────────────────────────────────────

  FRA IdP Claims              Keycloak Mapper              Normalized Token
  ──────────────              ───────────────              ────────────────
  
  uid: "jean.dupont"   ──►    uniqueID mapper     ──►     uniqueID: "jean.dupont"
  
  habilitation:        ──►    clearance mapper    ──►     clearance: "SECRET"
    "SECRET_DEFENSE"          (FR→NATO mapping)
  
  nationalite: "FR"    ──►    country mapper      ──►     countryOfAffiliation: "FRA"
                              (ISO 3166-1 alpha-3)
```

---

## Clearance Hierarchy

```
        TOP_SECRET (4)
            │
            ▼
         SECRET (3)
            │
            ▼
      CONFIDENTIAL (2)
            │
            ▼
      UNCLASSIFIED (1)

Rule: User clearance level ≥ Resource classification level
```

---

## Network Isolation

Each instance runs in its own Docker network:

```
dive-v3-network (USA)        ──── ISOLATED ────    fra-network (FRA)
       │                                                  │
  ┌────┴────┐                                        ┌────┴────┐
  │ frontend│                                        │frontend │
  │ backend │                                        │backend  │
  │keycloak │                                        │keycloak │
  │  opa    │                                        │  opa    │
  │ mongodb │                                        │ mongodb │
  │  redis  │                                        │  redis  │
  └─────────┘                                        └─────────┘
       │                                                  │
       └──── Cloudflare Tunnel ────┬──── Cloudflare Tunnel ────┘
                                   │
                            ┌──────▼──────┐
                            │  Internet   │
                            │  (HTTPS)    │
                            └─────────────┘
```

---

## Terraform Module Structure

```
terraform/
├── modules/
│   └── federated-instance/
│       ├── main.tf           # Realm & client
│       ├── variables.tf      # Instance config
│       ├── outputs.tf        # Secrets export
│       ├── test-users.tf     # Test users
│       ├── idp-brokers.tf    # Federation
│       └── versions.tf       # Provider
│
└── instances/
    ├── provider.tf           # Keycloak provider
    ├── variables.tf          # Common vars
    ├── instance.tf           # Module call
    ├── usa.tfvars            # USA config
    ├── fra.tfvars            # FRA config
    └── deu.tfvars            # DEU config
```

---

## Key Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | USA instance services |
| `docker-compose.fra.yml` | FRA instance services |
| `docker-compose.deu.yml` | DEU instance services |
| `cloudflared/config.yml` | USA tunnel config |
| `cloudflared/config-fra.yml` | FRA tunnel config |
| `policies/fuel_inventory_abac_policy.rego` | Core OPA policy |
| `scripts/deploy-dive-instance.sh` | Instance deployment |
| `scripts/manage-instances.sh` | Instance lifecycle |

---

## Security Considerations

1. **HTTPS Everywhere** - All traffic via Cloudflare tunnels with TLS
2. **JWT Validation** - RS256 signatures verified against JWKS
3. **Default Deny** - OPA policies start with `default allow := false`
4. **Audit Logging** - All authorization decisions logged
5. **Network Isolation** - Docker networks prevent cross-instance access
6. **Certificate Management** - mkcert for local development certificates


---

## Test Suite Results

**Last Run**: November 25, 2025

### Test Summary

| Category | Passed | Failed | Skipped |
|----------|--------|--------|---------|
| Service Health | 9 | 0 | 0 |
| Keycloak Config | 12 | 0 | 0 |
| Backend API | 9 | 0 | 0 |
| Federation | 6 | 0 | 0 |
| Authentication | 6 | 0 | 2 |
| External Access | 6 | 0 | 0 |
| **TOTAL** | **46** | **0** | **2** |

### Running Tests

```bash
# Run comprehensive test suite
./scripts/tests/test-pilot-comprehensive.sh

# Quick status check
./scripts/dive status
```

### Test User Credentials

| Instance | Username | Password | Clearance |
|----------|----------|----------|-----------|
| USA | testuser-usa-1 | DiveDemo2025! | UNCLASSIFIED |
| USA | testuser-usa-2 | DiveDemo2025! | CONFIDENTIAL |
| USA | testuser-usa-3 | DiveDemo2025! | SECRET |
| USA | testuser-usa-4 | DiveDemo2025! | TOP_SECRET |
| FRA | testuser-fra-1 | DiveDemo2025! | UNCLASSIFIED |
| FRA | testuser-fra-2 | DiveDemo2025! | CONFIDENTIAL |
| FRA | testuser-fra-3 | DiveDemo2025! | SECRET |
| FRA | testuser-fra-4 | DiveDemo2025! | TOP_SECRET |
| DEU | testuser-deu-1 | DiveDemo2025! | UNCLASSIFIED |
| DEU | testuser-deu-2 | DiveDemo2025! | CONFIDENTIAL |
| DEU | testuser-deu-3 | DiveDemo2025! | SECRET |
| DEU | testuser-deu-4 | DiveDemo2025! | TOP_SECRET |

---

*Last Updated: November 25, 2025*




