# DIVE V3 Phase 4 Complete: KAS Federation, OPAL, & Cross-Instance Operations

## NEW CHAT SESSION PROMPT

**Project**: DIVE V3 Hub-Spoke Federation  
**Phase**: 4 - Complete Implementation  
**Date**: 2025-12-05  
**Previous Session**: Phase 4 Continuation (OPA Data Architecture Fix, OPAL Server Integration)

---

## 1. EXECUTIVE SUMMARY

You are continuing development of **DIVE V3**, a coalition-friendly ICAM web application demonstrating federated identity management across USA/NATO partners with policy-driven ABAC authorization. This is **Phase 4 Complete**, focusing on:

1. **ZTDF Multi-KAS Implementation** - Multiple Key Access Objects (KAOs) per ZTDF
2. **Cross-Instance Authorization** - Federated resource queries, policy re-evaluation
3. **Keycloak Health Check Fix** - Container showing unhealthy
4. **KAS Grafana Dashboard** - Federation metrics visualization
5. **Deferred Actions** - Items from Phases 1-4

**CRITICAL REQUIREMENTS**:
- **Single-developer pilot** - Solutions must be **persistent, resilient, and production-grade**
- **No workarounds or shortcuts** - Best practice approach only
- **All data is dummy/test data** - Feel free to nuke containers, volumes, networks as needed
- **Full tool access** - GitHub CLI, GCP CLI (can create new project), Cloudflare CLI, DIVE CLI, Keycloak Docs MCP

---

## 2. PREVIOUS SESSION ACCOMPLISHMENTS

### 2.1 Completed in Last Session

| Task | Status | Details |
|------|--------|---------|
| OPA Data Architecture Fix | ✅ | Single `policies/policy_data.json` - no merge conflicts |
| Rich Metadata Preservation | ✅ | Moved to `opal-data-source/` for OPAL distribution |
| Industry Clearance Caps | ✅ | Added `industry_max_classification` to tenant configs |
| OPAL Server Integration | ✅ | Custom Dockerfile with curl, latest image, healthy |
| KAS Federation Service | ✅ | Cross-instance communication with 30 tests |
| KAS Registry Configuration | ✅ | USA, FRA, GBR, DEU instance registry |
| Git Commit & Push | ✅ | All changes committed to main branch |

### 2.2 Test Results (All Passing)

```
OPA Policy Tests: 1042/1042 ✅
KAS Tests: 59/59 ✅  
OPAL Tests: 44/44 ✅
Backend Unit Tests: ~2700+ (some integration tests need full environment)
```

### 2.3 Container Status

| Container | Status |
|-----------|--------|
| dive-pilot-opal-server | ✅ healthy |
| dive-pilot-backend | ✅ healthy |
| dive-pilot-opa | ✅ healthy |
| dive-pilot-frontend | ✅ healthy |
| dive-pilot-keycloak | ⚠️ **unhealthy** (needs fix) |
| dive-pilot-kas | ✅ running |
| dive-pilot-postgres | ✅ healthy |
| dive-pilot-redis | ✅ healthy |
| dive-pilot-mongo | ✅ healthy |
| dive-pilot-tunnel | ✅ running |

---

## 3. FILES CREATED/MODIFIED IN LAST SESSION

### 3.1 New Files Created

```
# KAS Federation
kas/src/services/kas-federation.service.ts    # Cross-instance federation service
kas/config/kas-registry.json                   # Multi-KAS discovery configuration
kas/src/__tests__/kas-federation.test.ts       # 30 federation tests

# OPAL Integration
docker/opal-server.Dockerfile                  # Custom OPAL image with curl
backend/src/routes/opal.routes.ts              # OPAL API endpoints
backend/src/services/policy-bundle.service.ts  # Bundle creation/signing
backend/src/__tests__/integration/opal-e2e.test.ts  # OPAL E2E tests
backend/src/__tests__/policy-bundle.service.test.ts # Bundle tests

# Policy Tests
policies/tests/industry_clearance_cap_test.rego  # 14 industry cap tests
policies/tests/bundle_test.rego                   # Bundle validation tests
policies/tests/guardrails_test.rego               # Guardrail tests

# Rich Metadata (OPAL Source)
opal-data-source/coi_members.json       # COI with $schema, _metadata, coi_details
opal-data-source/federation_matrix.json # Federation with federation_details
opal-data-source/tenant_configs.json    # Full tenant config with schemas
opal-data-source/trusted_issuers.json   # Extended issuer metadata

# Backend Models & Services
backend/src/models/federation-spoke.model.ts  # SP MongoDB model
backend/src/models/policy-version.model.ts    # Policy version tracking

# DIVE CLI Modules
scripts/dive-modules/                    # Modular CLI scripts (12 modules)

# Monitoring
monitoring/grafana/dashboards/opal-policy-distribution.json  # OPAL dashboard
```

### 3.2 Key Files Modified

```
# OPA Data (Canonical Single File)
policies/policy_data.json               # Single OPA data file (was policies/data/data.json)
  - Contains: trusted_issuers, federation_matrix, coi_members, tenant_configs
  - Added: industry_max_classification to all tenant configs

# Docker Compose
docker-compose.pilot.yml
  - Added: opal-server service with custom Dockerfile
  - Added: OPAL_SERVER_URL to backend environment
  - Fixed: OPA command to use /policies/policy_data.json

# KAS Server
kas/src/server.ts                       # Added federation endpoints

# Policies
policies/org/nato/acp240.rego           # Industry clearance cap enforcement
policies/entrypoints/authz.rego         # Updated for industry checks
```

---

## 4. PROJECT DIRECTORY STRUCTURE

```
dive-v3/
├── backend/                              # Express.js API (PEP)
│   ├── src/
│   │   ├── controllers/                  # Route controllers
│   │   ├── middleware/
│   │   │   ├── authz.middleware.ts       # Main authorization middleware
│   │   │   └── enrichment.middleware.ts  # Attribute enrichment (60+ domains)
│   │   ├── services/
│   │   │   ├── attribute-normalization.service.ts  # Multi-IdP normalization
│   │   │   ├── clearance-normalization.service.ts  # Foreign clearance mapping
│   │   │   ├── hub-spoke-registry.service.ts       # SP registration
│   │   │   ├── policy-sync.service.ts              # OPAL policy sync
│   │   │   ├── policy-bundle.service.ts            # Bundle creation/signing
│   │   │   ├── sp-management.service.ts            # SP lifecycle
│   │   │   ├── federated-resource.service.ts       # Cross-instance queries
│   │   │   ├── opal-client.ts                      # OPAL client wrapper
│   │   │   ├── opal-data.service.ts                # OPAL data provider
│   │   │   └── prometheus-metrics.service.ts       # Metrics collection
│   │   ├── models/
│   │   │   ├── federation-spoke.model.ts           # SP MongoDB model
│   │   │   └── policy-version.model.ts             # Policy version tracking
│   │   ├── routes/
│   │   │   ├── federation.routes.ts                # Federation API
│   │   │   ├── opal.routes.ts                      # OPAL webhook/API routes
│   │   │   └── metrics.routes.ts                   # Prometheus metrics
│   │   ├── utils/
│   │   │   ├── cross-kas-client.ts                 # Cross-instance KAS client
│   │   │   └── policy-signature.ts                 # Policy bundle signing
│   │   └── __tests__/
│   │       ├── integration/
│   │       │   ├── multi-idp-federation.test.ts    # 82 multi-IdP tests
│   │       │   └── opal-e2e.test.ts                # 44 OPAL E2E tests
│   │       └── unit/
│   │           └── policy-bundle.service.test.ts
│   ├── certs/
│   │   └── bundle-signing/                         # Policy bundle signing certs
│   └── data/opal/                                  # Backend OPAL data copies
│
├── frontend/                             # Next.js application
│   └── src/
│       ├── app/                          # App Router pages
│       └── components/                   # React components
│
├── kas/                                  # Key Access Service
│   ├── src/
│   │   ├── server.ts                     # Main KAS server with federation endpoints
│   │   ├── services/
│   │   │   └── kas-federation.service.ts # Cross-instance federation
│   │   ├── types/kas.types.ts
│   │   └── utils/
│   │       ├── kas-federation.ts         # KAS registry, policy translator
│   │       ├── kas-registry-loader.ts    # Registry initialization
│   │       ├── circuit-breaker.ts        # Resilience patterns
│   │       └── replay-protection.ts      # Key request replay protection
│   ├── config/
│   │   └── kas-registry.json             # Multi-KAS configuration
│   └── __tests__/
│       ├── kas-federation.test.ts        # 30 federation tests
│       ├── dek-generation.test.ts
│       └── jwt-verification.test.ts
│
├── policies/                             # OPA Rego Policies
│   ├── policy_data.json                  # CANONICAL OPA DATA FILE
│   ├── entrypoints/
│   │   └── authz.rego                    # Main authorization entrypoint
│   ├── org/nato/
│   │   └── acp240.rego                   # ACP-240 ABAC rules (industry clearance cap)
│   ├── base/
│   │   ├── clearance/                    # Clearance hierarchy
│   │   ├── coi/                          # COI logic
│   │   └── country/                      # Country validation
│   ├── tenant/
│   │   ├── usa/, fra/, gbr/, deu/        # Per-tenant configs and classification
│   │   └── base.rego                     # Tenant base with defaults
│   └── tests/
│       ├── industry_clearance_cap_test.rego  # 14 industry cap tests
│       ├── industry_access_test.rego
│       ├── bundle_test.rego
│       └── guardrails_test.rego
│
├── opal-data-source/                     # RICH OPAL SOURCE FILES
│   ├── coi_members.json                  # With $schema, _metadata, coi_details
│   ├── federation_matrix.json            # With federation_details
│   ├── tenant_configs.json               # Full config with industry caps
│   └── trusted_issuers.json              # Extended issuer metadata
│
├── docker/
│   ├── opal-server.Dockerfile            # Custom OPAL with curl
│   └── opal-server-tls.yml               # TLS configuration (future)
│
├── monitoring/
│   └── grafana/dashboards/
│       └── opal-policy-distribution.json # OPAL monitoring dashboard
│
├── terraform/
│   ├── modules/
│   │   ├── federated-instance/           # Complete instance module
│   │   ├── external-idp-oidc/            # OIDC IdP configuration
│   │   ├── external-idp-saml/            # SAML IdP configuration
│   │   └── policy-engine/                # OPA deployment
│   └── pilot/
│       └── main.tf                       # Pilot deployment
│
├── scripts/
│   └── dive-modules/                     # Modular DIVE CLI scripts
│       ├── common.sh, core.sh, db.sh
│       ├── deploy.sh, federation.sh
│       ├── pilot.sh, policy.sh
│       ├── secrets.sh, sp.sh, spoke.sh
│       ├── status.sh, terraform.sh
│       └── help.sh
│
├── docker-compose.pilot.yml              # Pilot stack (with OPAL server)
└── dive                                  # DIVE CLI entrypoint
```

---

## 5. DATA ARCHITECTURE

### 5.1 OPA Data (Single File - No Merge Conflicts)

**Location**: `policies/policy_data.json`

Contains:
- `trusted_issuers` - IdP registry with tenant mapping
- `federation_matrix` - Country federation partnerships
- `coi_members` - Community of Interest membership
- `tenant_configs` - Per-tenant configuration INCLUDING `industry_max_classification`

**Why single file?** OPA auto-loads ALL JSON files and merges them. Multiple files with same root keys cause merge errors.

### 5.2 OPAL Source (Rich Metadata)

**Location**: `opal-data-source/*.json`

Contains full metadata with:
- `$schema` - JSON schema references
- `_metadata` - Version, lastUpdated, compliance, managedBy
- Extended details (coi_details, federation_details)

**Purpose**: OPAL Server distribution, documentation, schema validation

### 5.3 Backend OPAL Data

**Location**: `backend/data/opal/*.json`

Backend's copy for OPAL API responses at `/api/opal/policy-data`

---

## 6. GAP ANALYSIS: REMAINING PHASE 4 WORK

### 6.1 Keycloak Health Check (CRITICAL)

| Issue | Current State | Required Fix | Priority |
|-------|---------------|--------------|----------|
| Unhealthy status | Container running but health check fails | Investigate and fix health endpoint | **HIGH** |
| Possible causes | SSL cert issue, realm not ready, health endpoint path | Diagnose via logs/config | **HIGH** |

### 6.2 ZTDF Multi-KAS Gaps

| Component | Current State | Required State | Priority |
|-----------|---------------|----------------|----------|
| Multi-KAO Support | KAS federation service ready | Full ZTDF encrypt with multiple KAOs | **HIGH** |
| KAO Selection | Helper function exists | Integration with ZTDF service | **HIGH** |
| KAO Fallback | Test logic implemented | Production fallback chain | **MEDIUM** |
| Policy Binding | Basic binding | KAO-specific policy binding | **MEDIUM** |

### 6.3 Cross-Instance Authorization Gaps

| Component | Current State | Required State | Priority |
|-----------|---------------|----------------|----------|
| Federated Resource Query | Service skeleton exists | Full query routing | **HIGH** |
| Policy Re-evaluation | Federation service has validation | Destination instance policy check | **HIGH** |
| Authorization Caching | Not implemented | Federation decision cache | **MEDIUM** |
| Audit Correlation | Basic logging | Cross-instance audit trail | **MEDIUM** |

### 6.4 Monitoring & Observability Gaps

| Component | Current State | Required State | Priority |
|-----------|---------------|----------------|----------|
| KAS Metrics | Basic health endpoint | Full Prometheus metrics | **HIGH** |
| Grafana KAS Dashboard | Not created | Federation metrics visualization | **HIGH** |
| Alert Rules | Not configured | Threshold-based alerts | **MEDIUM** |
| Cross-Instance Tracing | Request IDs | Distributed tracing | **LOW** |

---

## 7. DEFERRED ACTIONS FROM PREVIOUS PHASES

### 7.1 From Phase 1 (Hub-Spoke Registry)
- [ ] SP status enum extension (ONBOARDING, DEGRADED)
- [ ] Prometheus metrics for SP health

### 7.2 From Phase 2 (Policy Distribution)
- [ ] Policy version rollback API
- [ ] Grafana alerting rules for policy drift
- [ ] OPAL Client deployment automation

### 7.3 From Phase 3 (Multi-IdP Integration)
- [ ] Live SAML IdP integration test (requires external IdP)
- [ ] MFA step-up per clearance level
- [ ] IdP health monitoring dashboard

### 7.4 From Phase 4 (This Phase)
- [ ] Keycloak health check fix
- [ ] ZTDF multi-KAS implementation
- [ ] Cross-instance authorization
- [ ] KAS Grafana dashboard

---

## 8. PHASE 4 SMART OBJECTIVES

### 8.1 Objective: Fix Keycloak Health Check

**S - Specific:**
- Investigate Keycloak health check failure
- Fix configuration or endpoint issue
- Ensure container reports healthy

**M - Measurable:**
- `docker ps` shows (healthy) status
- Health endpoint returns 200 OK
- No error logs related to health

**A - Achievable:**
- Container is running (just unhealthy)
- Logs available for diagnosis
- Can modify health check config

**R - Relevant:**
- Required for production deployment
- Affects monitoring and alerting
- Blocks full stack health

**T - Time-bound:** 1 hour

---

### 8.2 Objective: ZTDF Multi-KAS Implementation

**S - Specific:**
- Integrate KAO selection into ZTDF encryption service
- Support 2+ KAOs per ZTDF manifest
- Implement KAO fallback chain for decryption

**M - Measurable:**
- ZTDF with 2+ KAOs encrypts/decrypts successfully
- KAO fallback works when primary KAS unavailable
- 15+ ZTDF multi-KAS tests passing

**A - Achievable:**
- KAS federation service complete (30 tests passing)
- ZTDF types and crypto service exist
- Test helpers already implemented

**R - Relevant:**
- Enables cross-coalition encrypted data sharing
- Required for full ACP-240 compliance

**T - Time-bound:** 2 days

---

### 8.3 Objective: Cross-Instance Authorization

**S - Specific:**
- Implement federated resource query routing
- Add policy re-evaluation at destination instance
- Create cross-instance authorization cache

**M - Measurable:**
- Cross-instance queries return results from 4 tenants
- Authorization decisions consistent across instances
- 20+ cross-instance tests passing

**A - Achievable:**
- Federation service exists with agreement validation
- Backend has federated resource service skeleton

**R - Relevant:**
- Core federation requirement
- Demonstrates coalition interoperability

**T - Time-bound:** 3 days

---

### 8.4 Objective: KAS Federation Dashboard

**S - Specific:**
- Create Grafana dashboard for KAS federation metrics
- Implement Prometheus metrics in KAS server
- Add federation latency, success rate, circuit breaker panels

**M - Measurable:**
- Dashboard shows real-time federation status
- 10+ metrics exposed
- Alert thresholds configured

**A - Achievable:**
- OPAL dashboard exists as template
- Prometheus infrastructure in place

**R - Relevant:**
- Operational visibility
- Proactive issue detection

**T - Time-bound:** 1 day

---

## 9. SUCCESS CRITERIA CHECKLIST

### Phase 4 Must Have:
- [ ] Keycloak container healthy
- [ ] ZTDF encrypt/decrypt with 2+ KAOs
- [ ] Cross-instance resource queries working
- [ ] Cross-instance authorization consistent
- [ ] KAS federation metrics exposed
- [ ] Grafana KAS dashboard created
- [ ] 50+ new tests for Phase 4 features
- [ ] All existing tests still passing (1042 OPA, 59 KAS, 44 OPAL)

### Phase 4 Should Have:
- [ ] KAO fallback chain working
- [ ] Authorization decision caching
- [ ] Automated spoke provisioning
- [ ] Cross-instance audit correlation

### Phase 4 Nice to Have:
- [ ] Distributed tracing
- [ ] Real-time policy sync (< 5s)
- [ ] Alert notifications (Slack/email)

---

## 10. AVAILABLE TOOLS & PERMISSIONS

### 10.1 CLI Access (Full Permissions)

| Tool | Description | Example |
|------|-------------|---------|
| `gh` | GitHub CLI | `gh pr create`, `gh issue list` |
| `gcloud` | GCP CLI (**can create new project**) | `gcloud projects create`, `gcloud secrets create` |
| `cloudflared` | Cloudflare Tunnel | `cloudflared tunnel create` |
| `./dive` | DIVE V3 CLI | `./dive kas status`, `./dive policy test` |

### 10.2 MCP Tools

| Tool | Description |
|------|-------------|
| `mcp_keycloak-docs_docs_search` | Search Keycloak documentation |
| `mcp_keycloak-docs_docs_get` | Get specific Keycloak doc by ID |
| `mcp_cursor-ide-browser_*` | Browser automation for testing |

### 10.3 DIVE CLI Commands

```bash
# KAS Operations
./dive kas status          # Check KAS health
./dive kas test            # Run KAS tests
./dive kas keys list       # List cached DEKs

# Policy Operations
./dive policy test         # Run OPA tests
./dive policy sync         # Trigger OPAL sync
./dive policy bundle       # Create signed bundle

# Federation Operations
./dive federation status   # Check spoke health
./dive federation list     # List registered spokes
./dive federation sync     # Trigger policy distribution

# Infrastructure
./dive tf plan             # Terraform plan
./dive tf apply            # Terraform apply
./dive containers restart  # Restart pilot stack
```

---

## 11. GCP SECRET MANAGER REFERENCE

**Project**: `dive25`  
**Naming Convention**: `dive-v3-<type>-<instance>`

```bash
# Existing secrets
dive-v3-mongodb-usa, dive-v3-mongodb-fra, dive-v3-mongodb-gbr, dive-v3-mongodb-deu
dive-v3-keycloak-usa, dive-v3-keycloak-fra, dive-v3-keycloak-gbr, dive-v3-keycloak-deu
dive-v3-postgres-usa, dive-v3-postgres-fra, dive-v3-postgres-gbr, dive-v3-postgres-deu
dive-v3-redis-blacklist
dive-v3-grafana
dive-v3-auth-secret-usa, dive-v3-auth-secret-fra, dive-v3-auth-secret-gbr, dive-v3-auth-secret-deu
dive-v3-keycloak-client-secret
dive-v3-kas-signing-key
dive-v3-federation-<src>-<tgt> (12 bidirectional)

# May need to create for Phase 4
dive-v3-kas-dek-master    # Master key for DEK encryption
dive-v3-kas-kek-usa       # KEK for USA instance
dive-v3-kas-kek-fra       # KEK for FRA instance
dive-v3-ztdf-signing-key  # ZTDF manifest signing
```

---

## 12. CURRENT TEST METRICS

```
OPA Policy Tests:  1042/1042 ✅
KAS Tests:         59/59 ✅
OPAL Tests:        44/44 ✅
Backend Unit:      ~2700+ (integration tests need full env)

Total Tests:       ~3800+
```

---

## 13. START HERE

### Step 1: Verify Current State
```bash
# Check containers
docker ps --filter "name=dive-pilot"

# Run tests
cd backend && npm test -- --testPathPattern="kas|ztdf|opal" --passWithNoTests
cd ../kas && npm test
cd .. && ./bin/opa test policies/
```

### Step 2: Fix Keycloak Health Check
```bash
# Check logs
docker logs dive-pilot-keycloak --tail 50

# Check health endpoint
curl -k https://localhost:8443/health/ready
curl -k http://localhost:8081/health/ready

# Investigate health check config in docker-compose.pilot.yml
```

### Step 3: Implement ZTDF Multi-KAS
- Integrate KAO selection into `backend/src/services/ztdf-crypto.service.ts`
- Update ZTDF manifest generation for multiple KAOs
- Add fallback logic for KAO selection

### Step 4: Implement Cross-Instance Authorization
- Complete `backend/src/services/federated-resource.service.ts`
- Add policy re-evaluation endpoint
- Create cross-instance tests

### Step 5: Create KAS Grafana Dashboard
- Add Prometheus metrics to KAS server
- Create dashboard JSON
- Configure alert rules

### Step 6: Complete Deferred Actions
- Review and complete items from Phases 1-4

---

## 14. CRITICAL REMINDERS

### Security First
- **No hardcoded secrets** - Use GCP Secret Manager (`dive25` project)
- **Sign everything** - Policy bundles, ZTDF manifests
- **Fail closed** - Deny on any error
- **Audit everything** - ACP-240 compliance logging

### Quality Standards
- **No workarounds** - Persistent, resilient solutions only
- **Test everything** - Unit, integration, E2E
- **Single developer** - Keep it maintainable
- **Production-grade** - Ready for real deployment

### Dummy Data Notice
- All data is test/dummy data
- Feel free to nuke containers, volumes, networks
- Can reset databases as needed
- Focus on correct architecture over data preservation

---

## 15. PHASE SUMMARIES

### Phase 1: Hub-Spoke Registry (COMPLETED)
- SP registration and lifecycle management
- MongoDB persistence for spoke configs
- OPAL Server integration on hub
- 15+ E2E tests

### Phase 2: Policy Distribution (COMPLETED)
- OPAL policy sync with signed bundles
- Prometheus metrics (13 new metrics)
- Grafana OPAL dashboard
- DIVE CLI modularization
- 716 OPA tests passing

### Phase 3: Multi-IdP Integration (COMPLETED)
- French SAML, Canadian OIDC, German OIDC, UK OIDC support
- Industry IdP with email domain inference
- Industry clearance cap enforcement
- Extended enrichment middleware (60+ domains)
- 779 total tests passing

### Phase 4: KAS Federation (IN PROGRESS)
- ✅ KAS Federation Service (30 tests)
- ✅ KAS Registry Configuration
- ✅ Federation Endpoints
- ✅ OPA Data Architecture Fix
- ✅ OPAL Server Integration (44 tests)
- ✅ Industry Clearance Caps
- ⏳ Keycloak Health Fix
- ⏳ ZTDF Multi-KAS
- ⏳ Cross-Instance Authorization
- ⏳ KAS Grafana Dashboard

---

## 16. KEY FILES TO REVIEW

```
# KAS Federation
kas/src/services/kas-federation.service.ts  # Federation implementation
kas/config/kas-registry.json                 # Multi-KAS configuration
kas/src/__tests__/kas-federation.test.ts     # Federation tests

# OPA Data
policies/policy_data.json                    # CANONICAL OPA data file
opal-data-source/*.json                      # Rich OPAL source files

# OPAL Integration
docker/opal-server.Dockerfile                # Custom OPAL image
backend/src/routes/opal.routes.ts            # OPAL API endpoints
backend/src/__tests__/integration/opal-e2e.test.ts  # OPAL tests

# Docker Compose
docker-compose.pilot.yml                     # Pilot stack definition

# Keycloak (for health fix)
keycloak/Dockerfile                          # Keycloak image
```

---

*This prompt was generated after Phase 4 continuation session. KAS Federation (30 tests), OPAL Integration (44 tests), and OPA Data Architecture are complete. Ready for Keycloak fix, ZTDF Multi-KAS, and Cross-Instance Authorization.*

**Test Totals**: 1042 OPA + 59 KAS + 44 OPAL = **1145 policy/federation tests passing**




