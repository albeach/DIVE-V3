# DIVE V3 Hub-Spoke Federation Implementation
## New Chat Session Prompt

**Date Generated:** 2025-12-05
**Purpose:** Complete gap analysis and phased implementation plan for hub-spoke distributed federation architecture

---

## 1. PROJECT OVERVIEW

### What is DIVE V3?
DIVE V3 is a **coalition-friendly ICAM (Identity, Credential, and Access Management) web application** demonstrating federated identity management across USA/NATO partners with policy-driven ABAC authorization. It implements:

- **Keycloak** as IdP broker (federates multiple identity providers)
- **OPA/OPAL** for policy-based authorization (PDP)
- **Next.js** frontend with Auth.js
- **Express.js** backend with PEP (Policy Enforcement Point)
- **MongoDB** for resource metadata
- **KAS** (Key Access Server) for encrypted content (stretch goal)

### The Vision: Hub-Spoke Federation
Transform DIVE V3 from a single-instance application into a **distributed federation network** where:

1. **One Central Hub** (managed by DIVE team) handles:
   - Policy definition and distribution (OPAL Server)
   - IdP/SP metadata registry
   - Partner registration and approval
   - Audit log aggregation
   - Certificate authority for policy signing

2. **Multiple Spokes** (deployed by partners OR as SP clients):
   - **Full Spoke**: Complete DIVE V3 stack (for partners wanting reciprocal federation)
   - **Lightweight SP Client**: Partners register their existing apps as OAuth/OIDC clients

3. **Pilot Phase Strategy**: During proof-of-concept, partners integrate via **SP Client mode only** (centralized hub, no distributed spokes) to ensure manageable debugging with a single developer.

---

## 2. CURRENT STATE (What Has Been Built)

### 2.1 Hub-Spoke Registry Service
**File:** `backend/src/services/hub-spoke-registry.service.ts`

Provides:
- Spoke registration with certificate-based identity
- X.509 certificate validation and fingerprint tracking
- Spoke approval/suspension/revocation lifecycle
- Token generation for spoke authentication
- Heartbeat processing for health monitoring
- OPAL integration for policy scope distribution

Key interfaces:
```typescript
interface ISpokeRegistration {
  spokeId: string;
  instanceCode: string;  // USA, FRA, GBR, DEU, etc.
  status: 'pending' | 'approved' | 'suspended' | 'revoked';
  allowedPolicyScopes: string[];
  trustLevel: 'development' | 'partner' | 'bilateral' | 'national';
  maxClassificationAllowed: string;
  certificateFingerprint?: string;
  rateLimit: { requestsPerMinute: number; burstSize: number };
  // ... more fields
}
```

### 2.2 Policy Sync Service
**File:** `backend/src/services/policy-sync.service.ts`

Provides:
- Version tracking across all spokes (per-layer: base, org, tenant)
- Sync status detection (current → behind → stale → critical_stale → offline)
- **Guardrail validation** for tenant policies:
  - `max_session_hours` cannot exceed hub's 10h limit
  - `max_token_lifetime_minutes` cannot exceed hub's 60m limit
  - `mfa_required_above` cannot be weakened (must be same or stricter)
  - `audit_retention_days` cannot be less than hub's 90 days
- Delta sync for efficient updates
- Critical update propagation with ACK tracking

### 2.3 Federation API Routes
**File:** `backend/src/routes/federation.routes.ts`

Endpoints:
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/federation/register` | POST | New spoke registration |
| `/api/federation/heartbeat` | POST | Spoke health + version reporting |
| `/api/federation/policy/version` | GET | Current policy version |
| `/api/federation/policy/bundle` | GET | Scope-filtered policy download |
| `/api/federation/spokes` | GET | List all spokes (admin) |
| `/api/federation/spokes/:id/approve` | POST | Approve spoke (admin) |
| `/api/federation/spokes/:id/suspend` | POST | Suspend spoke (admin) |
| `/api/federation/spokes/:id/revoke` | POST | Revoke spoke (admin) |
| `/api/federation/policy/push` | POST | Push policy update (admin) |

### 2.4 Base Guardrails Policy (Rego)
**File:** `policies/base/guardrails/guardrails.rego`

Immutable hub-enforced rules that spokes cannot override:
```rego
package dive.base.guardrails

clearance_levels := ["UNCLASSIFIED", "CONFIDENTIAL", "SECRET", "TOP_SECRET"]
max_session_hours := 10
max_token_lifetime_minutes := 60
default_mfa_required_above := "UNCLASSIFIED"
min_audit_retention_days := 90

# Guardrail violations produce deny decisions
guardrail_violations contains violation if {
  input.context.session_hours > max_session_hours
  violation := { "code": "SESSION_TOO_LONG", ... }
}
```

### 2.5 CLI Commands
**File:** `dive` (bash script at project root)

```bash
# Hub commands (run from central hub)
./dive hub start              # Start hub services
./dive hub status             # Show hub service status
./dive hub push-policy        # Push policy update to all spokes

# Spoke commands (for distributed instances)
./dive spoke init <code>      # Initialize new spoke instance
./dive spoke register         # Register spoke with hub
./dive spoke status           # Show spoke federation status
./dive spoke sync             # Force policy sync from hub

# Federation commands
./dive federation status      # Show overall federation status
```

### 2.6 Test Suite
**Files:**
- `backend/src/__tests__/hub-spoke-registry.test.ts` (51 tests)
- `backend/src/__tests__/policy-sync.test.ts`

Tests cover:
- Registration, approval, suspension, revocation
- Token generation and validation
- Heartbeat processing
- Guardrail validation (session, token, MFA, audit limits)
- Policy versioning and delta sync

### 2.7 Existing SP Management Infrastructure
**Files:**
- `backend/src/services/sp-management.service.ts` - Full SP registration, Keycloak client creation
- `backend/src/services/idp-validation.service.ts` - TLS, algorithm, endpoint validation
- `backend/src/scripts/generate-three-tier-ca.ts` - X.509 PKI infrastructure
- `frontend/src/components/federation/pilot-onboarding-wizard.tsx` - Partner onboarding UI

### 2.8 OPAL Infrastructure (Existing)
**Files:**
- `docker/opal-server-tls.yml` - OPAL Server with TLS, JWT auth, mTLS
- `backend/src/services/opal-client.ts` - TypeScript wrapper for OPAL API
- `backend/src/services/opal-data.service.ts` - Dynamic data publishing
- `policies/data/federation_matrix.json` - Bilateral trust relationships
- `policies/tenant/base.rego` - Tenant configuration, trusted issuers registry

---

## 3. PROJECT DIRECTORY STRUCTURE

```
DIVE-V3/
├── backend/
│   ├── src/
│   │   ├── controllers/           # Route controllers
│   │   ├── middleware/            # PEP authz, logging, validation
│   │   ├── routes/
│   │   │   ├── federation.routes.ts    # ✅ Hub-spoke API
│   │   │   ├── sp-management.routes.ts # ✅ SP registration
│   │   │   └── ...
│   │   ├── services/
│   │   │   ├── hub-spoke-registry.service.ts  # ✅ Spoke management
│   │   │   ├── policy-sync.service.ts         # ✅ Version tracking
│   │   │   ├── sp-management.service.ts       # ✅ SP OAuth clients
│   │   │   ├── idp-validation.service.ts      # ✅ TLS/cert validation
│   │   │   ├── opal-client.ts                 # ✅ OPAL API wrapper
│   │   │   ├── opal-data.service.ts           # ✅ Data publishing
│   │   │   ├── keycloak-admin.service.ts      # Keycloak management
│   │   │   ├── kas-registry.service.ts        # KAS federation
│   │   │   └── ...
│   │   ├── scripts/
│   │   │   ├── generate-three-tier-ca.ts      # ✅ X.509 PKI
│   │   │   ├── opal-publisher.ts              # Policy data publisher
│   │   │   └── ...
│   │   ├── __tests__/
│   │   │   ├── hub-spoke-registry.test.ts     # ✅ 51 tests
│   │   │   ├── policy-sync.test.ts            # ✅ Sync tests
│   │   │   └── ...
│   │   └── types/
│   └── certs/                     # X.509 certificates
│       ├── ca/                    # Root + Intermediate CA
│       └── signing/               # Policy signing certs
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── admin/
│   │   │   │   ├── sp-registry/   # SP management UI
│   │   │   │   └── idp/           # IdP management UI
│   │   │   └── register/
│   │   │       └── sp/            # SP self-registration
│   │   └── components/
│   │       └── federation/
│   │           └── pilot-onboarding-wizard.tsx  # ✅ Partner onboarding
│
├── policies/
│   ├── base/
│   │   └── guardrails/
│   │       └── guardrails.rego    # ✅ Hub-enforced limits
│   ├── tenant/
│   │   └── base.rego              # ✅ Tenant config, trusted issuers
│   ├── data/
│   │   ├── federation_matrix.json # ✅ Bilateral trust
│   │   ├── trusted_issuers.json
│   │   └── coi_membership.json
│   └── tests/                     # OPA unit tests
│
├── docker/
│   ├── opal-server-tls.yml        # ✅ OPAL with TLS
│   └── ...
│
├── terraform/
│   ├── modules/
│   │   ├── federated-instance/    # Per-instance deployment
│   │   └── policy-engine/         # OPA/OPAL module
│   ├── pilot/                     # Pilot VM deployment
│   └── instances/                 # Multi-instance configs
│
├── scripts/
│   └── policy/
│       └── build-tenant-bundle.ts # ✅ Per-tenant OPA bundles
│
├── dive                           # ✅ CLI with spoke commands
├── docker-compose.yml             # Full stack
├── docker-compose.pilot.yml       # Pilot VM config
│
└── docs/
    ├── DISTRIBUTED-ARCHITECTURE.md    # ✅ Hub-spoke design doc
    └── KUBERNETES_DEPLOYMENT_GUIDE.md # K8s deployment
```

---

## 4. GAP ANALYSIS

### 4.1 Hub Infrastructure Gaps

| Component | Current State | Gap | Priority |
|-----------|--------------|-----|----------|
| **OPAL Server** | Docker config exists (`opal-server-tls.yml`) | Not deployed in pilot | P0 |
| **Spoke Registry Persistence** | In-memory store | Need MongoDB collection | P0 |
| **Token Management** | Simple random tokens | Need JWT with scopes, signatures | P1 |
| **Audit Aggregation** | Not implemented | Need centralized log collection | P1 |
| **Admin Dashboard** | Basic UI exists | Need spoke management UI | P2 |
| **Rate Limiting** | Config exists, not enforced | Need API gateway integration | P2 |

### 4.2 Policy Distribution Gaps

| Component | Current State | Gap | Priority |
|-----------|--------------|-----|----------|
| **Policy Bundles** | Build script exists | Not integrated with OPAL | P0 |
| **Bundle Signing** | X.509 CA exists | Not signing bundles | P1 |
| **Scope Filtering** | Logic in service | Need OPAL scope configuration | P1 |
| **Critical Updates** | ACK logic exists | No actual push mechanism | P2 |
| **Version Tracking** | In-memory | Need persistent storage | P1 |

### 4.3 Keycloak Integration Gaps

| Component | Current State | Gap | Priority |
|-----------|--------------|-----|----------|
| **SP Client Creation** | `SPManagementService` works | Not exposed via federation API | P0 |
| **IdP Metadata Exchange** | Manual configuration | Need automated discovery | P2 |
| **SAML SP Support** | Onboarding wizard has UI | Backend incomplete | P2 |
| **Token Introspection** | Not implemented | Need for SP token validation | P1 |

### 4.4 KAS Integration Gaps

| Component | Current State | Gap | Priority |
|-----------|--------------|-----|----------|
| **KAS Registry** | `kas-registry.service.ts` exists | Not integrated with hub-spoke | P2 |
| **Cross-Instance Keys** | Design exists | Not implemented | P3 |
| **Encrypted Policy Bundles** | Not implemented | Stretch goal | P3 |

### 4.5 Testing Gaps

| Component | Current State | Gap | Priority |
|-----------|--------------|-----|----------|
| **Hub-Spoke Unit Tests** | 51 tests passing | Need integration tests | P1 |
| **E2E Federation Flow** | Not implemented | Need Playwright tests | P1 |
| **OPA Policy Tests** | Some exist | Need guardrail tests | P0 |
| **Load Testing** | Not implemented | Need for rate limit validation | P2 |

### 4.6 Operational Gaps

| Component | Current State | Gap | Priority |
|-----------|--------------|-----|----------|
| **Pilot Mode Flag** | Not implemented | Need to disable spoke deployment | P0 |
| **`./dive sp register`** | Not implemented | Need SP-only registration path | P0 |
| **Health Dashboard** | Basic endpoints | Need Grafana dashboard | P2 |
| **Alerting** | Prometheus alerts exist | Need federation-specific alerts | P2 |

---

## 5. PHASED IMPLEMENTATION PLAN REQUIREMENTS

### Required Deliverables for Each Phase:

1. **SMART Objectives**
   - **S**pecific: Exact features/endpoints to implement
   - **M**easurable: Test count, code coverage %, latency targets
   - **A**chievable: Scoped for single developer
   - **R**elevant: Directly supports pilot partners
   - **T**ime-bound: Week-by-week milestones

2. **Success Criteria**
   - All tests passing (unit, integration, E2E)
   - Documentation updated
   - CLI commands working
   - Demo-able to stakeholders

3. **Test Suites**
   - Unit tests for all new services
   - Integration tests for API flows
   - E2E tests for critical paths
   - OPA policy tests for guardrails

4. **No Workarounds**
   - Persistent storage (not in-memory)
   - Proper JWT tokens (not random strings)
   - Signed policy bundles (not unsigned)
   - mTLS for hub-spoke communication

---

## 6. AVAILABLE TOOLS & PERMISSIONS

### CLI Access
- **GitHub CLI** (`gh`): Full repo access, can create issues, PRs, releases
- **GCP CLI** (`gcloud`): Need to create NEW project for hub infrastructure
- **Cloudflare CLI** (`cloudflared`): Tunnel management, DNS
- **Keycloak Docs MCP**: `mcp_keycloak-docs_docs_search` and `mcp_keycloak-docs_docs_get` for Keycloak documentation

### Infrastructure
- **Current GCP Project**: `dive25` (pilot VM running)
- **Cloudflare Tunnels**: `dive-v3-tunnel` configured
- **Domain**: `dive25.com` with subdomains configured

### Existing Secrets (GCP Secret Manager)
All secrets in `dive25` project with naming convention `dive-v3-<type>-<instance>`:
- MongoDB, PostgreSQL, Keycloak passwords (4 instances each)
- Auth secrets, federation secrets, KAS signing key

---

## 7. CONSTRAINTS & REQUIREMENTS

### Technical Constraints
1. **Single Developer**: Solutions must be maintainable by one person
2. **Pilot Phase**: SP Client mode only, no distributed spoke deployments
3. **Budget Conscious**: Minimize GCP costs, use pilot VM where possible
4. **Open Source**: All code must be auditable, no proprietary dependencies

### Compliance Requirements
1. **ACP-240**: NATO access control policy compliance
2. **STANAG 4774/5636**: NATO labeling standards
3. **ISO 3166-1 alpha-3**: Country codes (USA, FRA, GBR, DEU)
4. **Default Deny**: All OPA policies start with `default allow := false`
5. **Audit Trail**: All authorization decisions logged for 90 days minimum

### Quality Requirements
1. **100% Persistent**: No in-memory stores for production data
2. **No Workarounds**: Proper implementations, not shortcuts
3. **Resilient**: Spokes continue operating if hub is unreachable (cached policies)
4. **Testable**: Every feature has automated tests

---

## 8. SPECIFIC TASKS FOR THIS SESSION

### Primary Objective
Generate a **complete gap analysis** and **phased implementation plan** for the hub-spoke federation model, covering:

1. **Gap Analysis Deep Dive**
   - Review all existing code referenced above
   - Identify missing integrations between components
   - Prioritize gaps by pilot impact

2. **Phase 1: Pilot Foundation (Weeks 1-2)**
   - Enable SP Client registration flow
   - Add pilot mode flag to CLI
   - Deploy OPAL Server to pilot VM
   - Persist spoke registry to MongoDB

3. **Phase 2: Policy Distribution (Weeks 3-4)**
   - Integrate policy bundles with OPAL
   - Implement bundle signing with X.509
   - Add scope filtering for SP clients
   - Deploy guardrail policy tests

4. **Phase 3: Production Hardening (Weeks 5-6)**
   - JWT tokens with proper signing
   - mTLS for hub communications
   - Rate limiting enforcement
   - Centralized audit logging

5. **Phase 4: Partner Onboarding (Weeks 7-8)**
   - Self-service SP registration portal
   - Automated IdP metadata exchange
   - Partner dashboard with usage metrics
   - Documentation and runbooks

### Deliverables Expected
1. **Gap Analysis Document** with prioritized issues
2. **Phased Implementation Plan** with SMART objectives
3. **Test Plan** for each phase
4. **Architecture Decision Records** for key decisions
5. **Updated CLI** with pilot mode and SP registration

---

## 9. CONTEXT FROM PREVIOUS SESSION

### Key Decisions Made
1. **Centralized Pilot**: Partners use SP Client mode only during proof-of-concept
2. **Phased Rollout**: POC → Controlled Pilot → Limited Availability → GA
3. **Guardrails Model**: Hub defines immutable limits, spokes can only be stricter
4. **Trust Transparency**: Open source, partners can audit, clear communication

### Files Created/Modified
- `backend/src/services/hub-spoke-registry.service.ts` - Extended with X.509 validation
- `backend/src/services/policy-sync.service.ts` - New file
- `backend/src/routes/federation.routes.ts` - New endpoints
- `policies/base/guardrails/guardrails.rego` - New file
- `backend/src/__tests__/hub-spoke-registry.test.ts` - 51 tests
- `backend/src/__tests__/policy-sync.test.ts` - Sync tests
- `dive` CLI - Added spoke commands
- `docs/DISTRIBUTED-ARCHITECTURE.md` - Architecture documentation

### Git Commits
```
d6498ee feat: Complete hub-spoke federation with X.509 validation, testing, and CLI
d923814 feat: Add distributed federation architecture and enhanced DIVE CLI
```

---

## 10. SUCCESS CRITERIA FOR THIS SESSION

### Must Have
- [ ] Complete gap analysis with all components mapped
- [ ] Phased plan with specific week-by-week tasks
- [ ] SMART objectives for each phase
- [ ] Test requirements defined for each feature
- [ ] Pilot mode implementation started

### Should Have
- [ ] `./dive sp register` command working
- [ ] OPAL Server deployment plan
- [ ] MongoDB schema for spoke registry

### Nice to Have
- [ ] Architecture decision records
- [ ] Updated documentation
- [ ] Grafana dashboard specs

---

## START HERE

Please begin by:

1. **Reading the key files** mentioned above to understand current state
2. **Identifying gaps** not covered in Section 4
3. **Proposing the phased implementation plan** with specific deliverables
4. **Creating the pilot mode flag** to disable spoke deployment
5. **Implementing `./dive sp register`** for partner onboarding

Remember:
- **No workarounds** - persistent, resilient solutions only
- **Test everything** - unit, integration, E2E
- **Single developer** - keep it maintainable
- **Pilot first** - SP Client mode only until GA



