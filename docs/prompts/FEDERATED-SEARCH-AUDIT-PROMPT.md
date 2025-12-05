# DIVE V3 Federated Search - Comprehensive Audit & Implementation Prompt

> **Purpose**: Full audit/assessment of federated search capability with phased implementation plan
> **Date Generated**: November 29, 2025
> **Project**: DIVE V3 - Coalition-Friendly ICAM Web Application

---

## 🎯 Primary Objective

Conduct a **full audit and assessment** of the DIVE V3 federated search capability across all instances (USA, FRA, GBR, DEU) with the goal of delivering a **100% persistent, resilient, and scalable solution** following **best practice approach with NO workarounds or shortcuts**.

---

## 📋 Background Context

### What is DIVE V3?

DIVE V3 is a coalition-friendly ICAM (Identity, Credential, and Access Management) web application demonstrating federated identity management across USA/NATO partners with policy-driven ABAC authorization. The system enables secure cross-border document sharing with encryption (ZTDF), COI-based access control, and multi-KAS key management.

### Current Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  USA IdP    │    │  FRA IdP    │    │  GBR IdP    │    │  DEU IdP    │
│ (Keycloak)  │    │ (Keycloak)  │    │ (Keycloak)  │    │ (Keycloak)  │
└─────┬───────┘    └─────┬───────┘    └─────┬───────┘    └─────┬───────┘
      │                  │                  │                  │
      └──────────┬───────┴──────────┬───────┴──────────┬───────┘
                 │                  │                  │
         ┌───────▼───────┐  ┌───────▼───────┐  ┌───────▼───────┐
         │  USA Backend  │  │  FRA Backend  │  │  GBR Backend  │
         │  + MongoDB    │  │  + MongoDB    │  │  + MongoDB    │
         │  + OPA        │  │  + OPA        │  │  + OPA        │
         │  + KAS        │  │  + KAS        │  │  + KAS        │
         └───────────────┘  └───────────────┘  └───────────────┘
                 │                  │                  │
                 └──────────┬───────┴──────────┬───────┘
                            │                  │
                    ┌───────▼──────────────────▼───────┐
                    │     FEDERATED SEARCH LAYER       │
                    │  (Cross-Instance Resource Query) │
                    └──────────────────────────────────┘
```

### Recent Accomplishments (This Session)

1. **GCP Secret Manager Integration**: Federation secrets synced from GCP to Keycloak vault
2. **Keycloak IdP Broker Fix**: USA instance vault directory restored, federation credentials synced
3. **Federated Search Test Suite**: 54 unit/integration tests created
4. **E2E Test Framework**: Real MongoDB data testing with 21,000 documents
5. **KAS-to-Backend Authentication Fix**: Resolved 401/404 routing issues
6. **Rego Policy Updates**: `federation_abac_policy.rego` enhanced with federated search rules

---

## 📁 Project Directory Structure

```
DIVE-V3/
├── backend/                          # Express.js API (PEP)
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── federated-search.controller.ts  # Cross-instance search
│   │   │   ├── federation.controller.ts        # Federation endpoints
│   │   │   └── resource.controller.ts          # Resource CRUD + KAS
│   │   ├── services/
│   │   │   ├── coi-validation.service.ts       # COI coherence
│   │   │   ├── kas-registry.service.ts         # Multi-KAS management
│   │   │   └── resource.service.ts             # MongoDB queries
│   │   ├── middleware/
│   │   │   ├── authz.middleware.ts             # JWT validation + OPA
│   │   │   └── federation.middleware.ts        # Federation agreement
│   │   ├── routes/
│   │   │   ├── federation.routes.ts            # /federation/*
│   │   │   └── kas.routes.ts                   # /api/kas/*
│   │   ├── utils/
│   │   │   └── gcp-secrets.ts                  # GCP Secret Manager
│   │   ├── scripts/
│   │   │   └── seed-instance-resources.ts      # 7,000 docs/instance
│   │   └── __tests__/
│   │       ├── federated-search.test.ts        # 54 unit tests (NEW)
│   │       └── e2e/
│   │           └── federated-search.e2e.test.ts # E2E tests (NEW)
│   └── package.json
│
├── frontend/                         # Next.js 15 + NextAuth.js v5
│   └── src/
│       ├── app/                      # App Router pages
│       └── components/               # React components
│
├── kas/                              # Key Access Service
│   └── src/
│       ├── server.ts                 # KAS main service
│       └── utils/
│           └── jwt-validator.ts      # Token validation
│
├── policies/                         # OPA Rego Policies
│   ├── fuel_inventory_abac_policy.rego    # Main ABAC policy
│   ├── federation_abac_policy.rego        # Federation-specific (UPDATED)
│   ├── coi_coherence_policy.rego          # COI validation
│   └── tests/
│       └── federation_abac_test.rego      # 163 policy tests
│
├── terraform/                        # Keycloak IaC
│   ├── modules/
│   │   └── federated-instance/       # Per-instance Keycloak config
│   └── instances/                    # Terraform workspaces
│
├── config/                           # Configuration Files
│   ├── federation-registry.json      # Instance configurations
│   └── kas-registry.json             # KAS server configurations
│
├── scripts/                          # Shell Scripts
│   ├── deploy-dive-instance.sh       # Instance deployment (UPDATED)
│   ├── deploy-federation.sh          # Full federation deploy
│   ├── seed-instance-resources.sh    # Seeding wrapper
│   ├── test-federated-search.sh      # Test runner (NEW)
│   └── federation/
│       └── sync-gcp-secrets-to-keycloak.sh  # GCP→Keycloak sync (NEW)
│
├── docker/                           # Docker configurations
│   └── instances/
│       ├── usa/
│       ├── fra/
│       └── gbr/
│
└── docs/                             # Documentation
    ├── dive-v3-requirements.md
    ├── dive-v3-backend.md
    ├── dive-v3-frontend.md
    └── FEDERATION-IMPLEMENTATION-RUNBOOK.md
```

---

## 🔍 Current Federation State

### Instances Deployed

| Instance | Type | MongoDB Docs | Keycloak | Backend | KAS | OPA |
|----------|------|--------------|----------|---------|-----|-----|
| USA | Local | 7,000 | ✅ Healthy | ⚠️ Unhealthy | ⚠️ Unhealthy | ✅ |
| FRA | Local | 7,000 | ✅ Healthy | ⚠️ Unhealthy | N/A | ✅ |
| GBR | Local | 7,000 | ✅ Healthy | ✅ Healthy | ✅ Healthy | ✅ |
| DEU | Remote | TBD | TBD | TBD | TBD | TBD |

### GCP Secrets Created

```
dive-v3-federation-{src}-{tgt}  # 12 federation secrets (bidirectional)
dive-v3-mongodb-{instance}      # 4 MongoDB passwords
```

### Test Coverage

| Test Type | File | Tests | Status |
|-----------|------|-------|--------|
| Unit Tests | `federated-search.test.ts` | 54 | ✅ Passing |
| E2E Tests | `federated-search.e2e.test.ts` | 10+ | 🔶 Requires running instances |
| OPA Tests | `federation_abac_test.rego` | 163 | ✅ Passing |

---

## 🚨 Known Issues / Gap Analysis

### Critical Gaps

1. **Federated Search Not Fully Operational**
   - Cross-instance queries timeout or fail
   - `/federation/resources/search` endpoint authentication issues
   - Origin realm tracking inconsistent

2. **Backend Health Issues**
   - USA and FRA backends showing "unhealthy" status
   - KAS health check failures
   - MongoDB connection intermittent

3. **DEU Instance Not Deployed**
   - Remote instance (prosecurity.biz) not yet configured
   - Cloudflare tunnel not established

4. **GCP Project Structure**
   - All secrets in single `dive25` project
   - Need proper IAM for service accounts
   - No automated secret rotation

5. **Keycloak Federation Credentials**
   - Vault directory was missing on USA instance (fixed)
   - Need persistent solution in Docker volumes
   - Terraform doesn't manage vault files

6. **OPA Policy Gaps**
   - `federatedSearchAllowed` and `federatedResourceAllowed` rules added but not fully tested
   - Cross-instance COI validation needs verification
   - Clearance equivalency across nations not implemented

7. **KAS Integration**
   - Cross-instance KAS key requests failing
   - Need unified KAS registry with health monitoring
   - Multi-KAS document decryption not tested E2E

8. **Observability**
   - No centralized logging for federated requests
   - No distributed tracing across instances
   - No federation-specific metrics

---

## 📊 Critical Deliverables

### 1. Phased Implementation Plan

Generate a detailed phased implementation plan with:

- **Phase 1**: Infrastructure Stabilization (Fix health issues, DEU deployment)
- **Phase 2**: Federated Search Core (Cross-instance queries, auth propagation)
- **Phase 3**: Policy Integration (OPA federation rules, COI validation)
- **Phase 4**: KAS Federation (Cross-instance key release, multi-KAS)
- **Phase 5**: Observability & Hardening (Logging, monitoring, security)

### 2. SMART Objectives per Phase

Each phase must have:
- **S**pecific: Exact deliverables and outcomes
- **M**easurable: Quantifiable success criteria (e.g., "100% of federated searches return within 3s")
- **A**chievable: Realistic scope with defined resources
- **R**elevant: Aligned with ACP-240/NATO compliance requirements
- **T**ime-bound: Clear deadlines and milestones

### 3. Success Criteria

| Category | Metric | Target |
|----------|--------|--------|
| Availability | Federation uptime | 99.9% |
| Performance | Federated search p95 latency | < 3000ms |
| Security | Policy test coverage | 100% |
| Compliance | ACP-240 audit pass rate | 100% |
| Scalability | Concurrent federated requests | 100 req/s |

### 4. Extensive Test Suites

- Unit tests for all federation components
- Integration tests for cross-instance communication
- E2E tests with real seeded data (21,000+ documents)
- Performance/load tests for scalability validation
- Security tests for auth bypass attempts

---

## 🔧 Available Tools & Permissions

### CLI Access

| Tool | Permission | Usage |
|------|------------|-------|
| **GitHub CLI** | Full | `gh repo`, `gh pr`, `gh issue` |
| **GCP CLI** | Full | `gcloud`, need to create new project |
| **Cloudflare CLI** | Full | `cloudflared tunnel`, DNS management |
| **Docker** | Full | Container management |
| **Terraform** | Full | Keycloak IaC |

### MCP Tools Available

| MCP Server | Capability |
|------------|------------|
| **Keycloak Docs** | `docs_search`, `docs_get` for Keycloak Admin API |
| **Stripe** | N/A for this task |
| **Browser** | `browser_navigate`, `browser_snapshot`, `browser_click` for testing |

---

## ⚠️ Critical Constraints

### MUST Follow

1. **NO workarounds or shortcuts** - Only production-grade solutions
2. **100% persistent** - Survives container restarts, host reboots
3. **100% resilient** - Handles partial failures gracefully
4. **100% scalable** - New partners add with config only, no code changes
5. **Best practice approach** - Follow NATO ACP-240, STANAG 4774/5636

### Technical Requirements

- **Country Codes**: ISO 3166-1 alpha-3 only (USA, FRA, GBR, DEU, CAN)
- **Clearances**: UNCLASSIFIED, RESTRICTED, CONFIDENTIAL, SECRET, TOP_SECRET
- **COIs**: US-ONLY, CAN-US, FVEY, NATO, NATO-COSMIC, EU-RESTRICTED, AUKUS, QUAD
- **Token Lifetime**: 15 minutes access, 8 hours refresh
- **Default Deny**: All OPA policies start with `default allow := false`

---

## 🚀 First Steps

1. **Audit Current State**
   - Check all container health statuses
   - Verify GCP secrets are accessible
   - Validate Keycloak IdP broker configurations
   - Test federated search endpoint manually

2. **Identify Root Causes**
   - Why are USA/FRA backends unhealthy?
   - What's causing federation search timeouts?
   - Are federation secrets properly loaded in Keycloak vault?

3. **Create New GCP Project** (if needed)
   - `dive25-federation` for production isolation
   - Configure IAM service accounts
   - Set up automated secret rotation

4. **Stabilize Infrastructure**
   - Fix backend health issues
   - Deploy DEU instance
   - Establish Cloudflare tunnels for all instances

5. **Generate Implementation Plan**
   - Create detailed phases with SMART objectives
   - Define success criteria for each phase
   - Estimate timelines and dependencies

---

## 📚 Key Documentation References

- `docs/dive-v3-requirements.md` - Full project requirements
- `docs/dive-v3-backend.md` - Backend specification
- `docs/dive-v3-frontend.md` - Frontend specification
- `docs/FEDERATION-IMPLEMENTATION-RUNBOOK.md` - Federation setup guide
- `docs/SECRETS-MANAGEMENT.md` - GCP secrets documentation
- `config/federation-registry.json` - Instance configurations
- `config/kas-registry.json` - KAS server configurations

---

## 📝 Expected Output Format

Please provide:

1. **Executive Summary** (1 page)
2. **Current State Assessment** (detailed findings)
3. **Gap Analysis Matrix** (component × issue × severity × fix)
4. **Phased Implementation Plan** (5 phases with SMART objectives)
5. **Test Strategy** (unit, integration, E2E, performance)
6. **Risk Assessment** (risk × likelihood × impact × mitigation)
7. **Timeline & Milestones** (Gantt-style breakdown)

---

*This prompt was auto-generated from the DIVE V3 codebase analysis on November 29, 2025.*








