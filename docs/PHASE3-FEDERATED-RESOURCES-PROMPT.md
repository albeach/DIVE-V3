# DIVE V3 Phase 3: Federated Resource Access - Implementation Prompt

## Role & Objective

You are an expert DevOps/Platform Engineer implementing **Phase 3: Federated Resource Access** for the DIVE V3 coalition identity platform. Your mission is to implement **Option B: Distributed Query Federation** - enabling users from any trusted instance to query and access resources across all federated instances based on ABAC policies.

**SMART Objective**: Implement distributed cross-instance resource querying with proper ABAC enforcement, achieving <500ms p95 latency for federated queries across 4 instances, with 100% policy compliance and zero unauthorized access within 5 business days.

---

## Background Context (From Previous Session)

### What Was Accomplished

1. **MongoDB Seeding Complete** - All 4 instances seeded with ZTDF-encrypted resources:
   - USA: 8,000 documents
   - FRA: 7,000 documents
   - GBR: 7,000 documents
   - DEU: 7,100 documents
   - **Total: 29,100 resources** with proper classification, releasability, and COI attributes

2. **GCP Secrets Integration Fixed** - `backend/src/utils/gcp-secrets.ts` now auto-detects GCP when gcloud CLI is authenticated (no manual `USE_GCP_SECRETS=true` required)

3. **Docker Network Issues Resolved** - Created `scripts/fix-docker-networks.sh` to ensure all backends can reach MongoDB when started from different compose projects

4. **SSH Key Authentication for DEU** - Persistent SSH key (`~/.ssh/id_rsa_deu`) configured for remote instance access

5. **Seed Script Updated** - `backend/src/scripts/seed-instance-resources.ts` fixed to use correct federation-registry.json structure (`config.services.mongodb.externalPort`)

### Current Problem Identified

**Resources are SILOED** - Each instance only queries its own MongoDB:
- USA frontend → USA MongoDB (8,000 docs)
- FRA frontend → FRA MongoDB (7,000 docs)
- etc.

**User Expectation**: A USA user with appropriate clearance should see ALL federated resources they're authorized to access (from USA, FRA, GBR, DEU) based on:
- Classification level (clearance check)
- Releasability (country in `releasabilityTo` array)
- COI membership (Community of Interest requirements)

---

## Files Generated/Modified in Previous Session

### New Scripts Created
```
scripts/seed-all-instances.sh          # Master seeding script for all instances
scripts/seed-deu-remote.sh             # Remote DEU seeding via SSH
scripts/check-mongodb-conflicts.sh     # Detects local MongoDB port conflicts
scripts/fix-docker-networks.sh         # Fixes Docker network connectivity
```

### Modified Files
```
backend/src/utils/gcp-secrets.ts       # Auto-detect GCP mode (not just USE_GCP_SECRETS=true)
backend/src/scripts/seed-instance-resources.ts  # Fixed config.services.mongodb reference
scripts/start.sh                       # Added network fix step after service startup
~/.ssh/config                          # Added DEU SSH configuration
~/.ssh/id_rsa_deu                      # SSH key for DEU remote access
```

---

## Project Directory Structure

```
dive-v3/
├── config/
│   ├── federation-registry.json      # SSOT: All instance configs, federation matrix
│   ├── federation-registry.schema.json
│   ├── kas-registry.json             # KAS server registry with trust matrix
│   └── production.env.template
├── backend/
│   └── src/
│       ├── controllers/              # API route handlers
│       ├── middleware/               # Auth, ABAC, validation middleware
│       ├── services/                 # Business logic (40+ services)
│       │   ├── authorization-code.service.ts
│       │   ├── authz-cache.service.ts
│       │   ├── fra-federation.service.ts  # Example federation service
│       │   ├── resource.service.ts   # Resource CRUD operations
│       │   └── ...
│       ├── utils/
│       │   ├── gcp-secrets.ts        # GCP Secret Manager integration
│       │   └── ...
│       └── scripts/
│           └── seed-instance-resources.ts  # Instance-aware seeding
├── frontend/
│   └── src/
│       ├── app/                      # Next.js App Router pages
│       ├── components/               # React components
│       └── lib/                      # Utilities
├── policies/                         # OPA Rego policies
│   ├── federation_abac_policy.rego   # Federation-aware ABAC
│   ├── fuel_inventory_abac_policy.rego
│   ├── object_abac_policy.rego
│   └── coi_coherence_policy.rego
├── terraform/
│   └── instances/                    # Keycloak IaC per instance
│       ├── instance.tf
│       ├── variables.tf
│       ├── usa.tfvars, fra.tfvars, gbr.tfvars, deu.tfvars
│       └── backend.tf                # GCS remote state
├── docker-compose.yml                # USA instance
├── docker-compose.fra.yml            # FRA instance
├── docker-compose.gbr.yml            # GBR instance
├── docker-compose.deu.yml            # DEU instance (remote)
└── scripts/
    ├── start.sh                      # Safe start with validation
    ├── sync-gcp-secrets.sh           # Load secrets from GCP
    ├── fix-docker-networks.sh        # Network connectivity fix
    └── remote/
        └── deploy-remote.sh          # Remote deployment script
```

---

## Gap Analysis: Existing Integration Points

### ✅ Already Implemented

| Component | Status | Notes |
|-----------|--------|-------|
| Keycloak Federation | ✅ Complete | FRA/GBR/DEU users can authenticate to USA |
| OPA Policies | ✅ Complete | `federation_abac_policy.rego` exists |
| Resource Metadata | ✅ Complete | `releasabilityTo`, `COI`, `classification` in all docs |
| KAS Registry | ✅ Complete | Trust matrix defined in `kas-registry.json` |
| Federation Registry | ✅ Complete | `federation.matrix` defines trusted pairs |
| GCP Secrets | ✅ Complete | Auto-detect mode working |

### ❌ Gaps to Address (Phase 3 Scope)

| Gap | Description | Priority |
|-----|-------------|----------|
| **Cross-Instance Query** | Backend only queries local MongoDB | P0 - Critical |
| **Federation Service** | No service to aggregate multi-instance results | P0 - Critical |
| **Resource Discovery** | No endpoint to discover federated resources | P0 - Critical |
| **Distributed Caching** | No shared cache for federated query results | P1 - High |
| **Query Routing** | No logic to determine which instances to query | P1 - High |
| **Latency Optimization** | Parallel queries, result streaming | P2 - Medium |
| **Circuit Breaker** | No fallback when federated instance unavailable | P2 - Medium |
| **Audit Trail** | Cross-instance access logging | P1 - High |
| **E2E Tests** | No federated resource access tests | P1 - High |

### Existing Services to Extend

```typescript
// backend/src/services/resource.service.ts - Currently queries local MongoDB only
// backend/src/services/fra-federation.service.ts - Example pattern for federation
// backend/src/services/authz-cache.service.ts - Cache infrastructure exists
```

### Existing OPA Policy (federation_abac_policy.rego)

```rego
# Already has structure for cross-instance authorization
# Needs extension for distributed query decisions
```

---

## Critical Deliverables

### 1. Phased Implementation Plan

**Phase 3A (Days 1-2): Federation Query Infrastructure**
- Create `FederatedResourceService` 
- Implement `FederationQueryRouter`
- Add cross-instance MongoDB connection pool
- Define federation query protocol

**Phase 3B (Days 2-3): ABAC Integration**
- Extend OPA policy for federated queries
- Implement pre-flight authorization check
- Add result filtering based on user attributes
- Create federated authorization cache

**Phase 3C (Days 3-4): API & Frontend**
- New endpoint: `GET /api/resources/federated`
- Query parameters: `instances[]`, `classification`, `coi`
- Frontend federated resource browser
- Real-time result aggregation

**Phase 3D (Day 4-5): Resilience & Testing**
- Circuit breaker for unavailable instances
- Timeout handling and partial results
- Comprehensive test suite
- Performance benchmarking

### 2. SMART Objectives per Phase

| Phase | Objective | Success Criteria | Measurement |
|-------|-----------|------------------|-------------|
| 3A | Query infrastructure | Connect to all 4 instance MongoDBs | Connection test passes |
| 3B | ABAC enforcement | Zero unauthorized access | OPA test suite 100% |
| 3C | API integration | Federated endpoint returns results | Integration tests pass |
| 3D | Resilience | <500ms p95, graceful degradation | Load test results |

### 3. Test Suites Required

```
tests/
├── unit/
│   ├── federated-resource.service.test.ts
│   ├── federation-query-router.test.ts
│   └── federation-cache.test.ts
├── integration/
│   ├── cross-instance-query.test.ts
│   ├── federated-abac.test.ts
│   └── circuit-breaker.test.ts
├── e2e/
│   ├── federated-resource-access.spec.ts
│   ├── cross-instance-authorization.spec.ts
│   └── performance-benchmark.spec.ts
└── opa/
    └── federation_abac_policy_test.rego
```

---

## Available Tools & Permissions

### CLI Access (Full Permissions)
- **GitHub CLI** (`gh`) - Repository management, Actions, PRs
- **GCP CLI** (`gcloud`) - Need to create NEW project for federated resources
- **Cloudflare CLI** (`wrangler`) - Tunnel management, DNS
- **Terraform** - Infrastructure as Code

### MCP Servers Available
- **Keycloak Docs MCP** - Search Keycloak documentation
- **Stripe MCP** - (Not needed for this phase)
- **Browser MCP** - E2E testing

### GCP Resources Needed
```bash
# New GCP project for federated query service
gcloud projects create dive25-federation --name="DIVE V3 Federation"

# Required services:
# - Cloud Run (federation query aggregator)
# - Cloud Memorystore (Redis for distributed cache)
# - Cloud Monitoring (cross-instance metrics)
# - Secret Manager (federation secrets)
```

---

## Architecture Target: Distributed Query Federation

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         User Request Flow                                │
│                                                                          │
│   User (testuser-usa-2)                                                 │
│     │                                                                    │
│     ▼                                                                    │
│   ┌─────────────────────┐                                               │
│   │   USA Frontend      │                                               │
│   └──────────┬──────────┘                                               │
│              │ GET /api/resources/federated?instances=usa,fra,gbr       │
│              ▼                                                          │
│   ┌─────────────────────┐                                               │
│   │   USA Backend       │                                               │
│   │  (PEP + Federation) │                                               │
│   └──────────┬──────────┘                                               │
│              │                                                          │
│              ▼                                                          │
│   ┌─────────────────────┐     ┌─────────────────────┐                   │
│   │  OPA Policy Check   │────▶│  Federation Matrix  │                   │
│   │  (Pre-flight ABAC)  │     │  (Trusted Pairs)    │                   │
│   └──────────┬──────────┘     └─────────────────────┘                   │
│              │                                                          │
│              ▼                                                          │
│   ┌─────────────────────────────────────────────────────────┐          │
│   │              Federation Query Router                     │          │
│   │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │          │
│   │  │USA Mongo│  │FRA Mongo│  │GBR Mongo│  │DEU Mongo│    │          │
│   │  │ :27017  │  │ :27018  │  │ :27019  │  │ remote  │    │          │
│   │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘    │          │
│   │       │            │            │            │          │          │
│   │       ▼            ▼            ▼            ▼          │          │
│   │  ┌─────────────────────────────────────────────────┐   │          │
│   │  │         Parallel Query Execution                 │   │          │
│   │  │   (with timeout, circuit breaker, caching)      │   │          │
│   │  └─────────────────────────────────────────────────┘   │          │
│   └─────────────────────────────────────────────────────────┘          │
│              │                                                          │
│              ▼                                                          │
│   ┌─────────────────────┐                                               │
│   │  Result Aggregator  │                                               │
│   │  + ABAC Filter      │◀── User attributes (clearance, country, COI) │
│   └──────────┬──────────┘                                               │
│              │                                                          │
│              ▼                                                          │
│   ┌─────────────────────┐                                               │
│   │  Filtered Results   │                                               │
│   │  (User authorized   │                                               │
│   │   resources only)   │                                               │
│   └─────────────────────┘                                               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Non-Negotiable Requirements

1. **100% Persistent** - All changes via Terraform/IaC, no manual config
2. **100% Resilient** - Circuit breakers, graceful degradation, retry logic
3. **Zero Workarounds** - Proper distributed systems patterns only
4. **Full Test Coverage** - Unit, integration, E2E, OPA policy tests
5. **Audit Compliance** - All cross-instance access logged with decision reasons
6. **Performance SLA** - <500ms p95 for federated queries

---

## Starting Point

1. Read `config/federation-registry.json` to understand instance topology
2. Read `config/kas-registry.json` to understand KAS trust matrix
3. Read `policies/federation_abac_policy.rego` for existing ABAC patterns
4. Read `backend/src/services/resource.service.ts` for current resource query logic
5. Propose detailed Phase 3 implementation plan with SMART objectives

**Begin by confirming understanding and proposing the detailed implementation plan.**







