# Phase 3B: Federated Search Implementation for Remaining Instances

## 🎯 Objective

Complete the **Distributed Query Federation** implementation across all DIVE V3 instances (FRA, GBR, DEU) building on the successful USA instance foundation. Enable users from any trusted instance to seamlessly query and access resources across the entire federation with <500ms p95 latency, 100% ABAC policy compliance, and zero unauthorized access.

---

## 📋 Background Context from Previous Session

### What Was Accomplished (USA Instance)

1. **Frontend API Proxy Route Created**
   - File: `frontend/src/app/api/resources/federated-search/route.ts`
   - Proxies federated search requests from Next.js to Express backend
   - Supports both GET (simple queries) and POST (complex filters)

2. **Backend Federated Search Controller Fixed**
   - File: `backend/src/controllers/federated-search.controller.ts`
   - **Key Changes Made:**
     - Increased `executeLocalSearch` limit from 100 → 10000 (matches `getAllResources` behavior)
     - Made server-side authorization filter OPTIONAL (disabled by default)
     - Authorization now matches local `/api/resources` behavior - all docs shown, access enforced on individual resource access
   - USA now returns 7000 documents in federated mode (same as local mode)

3. **Session Management Fixed**
   - Removed `prompt: "login"` from NextAuth Keycloak config (`frontend/src/auth.ts`)
   - Resolved Keycloak client secret mismatch via Admin API sync with GCP Secret Manager
   - Fixed infinite reload loop on `/resources` page (useRef for fetch tracking)

4. **Test User Configuration Updated**
   - User: `testuser-usa-1` 
   - Password: `TestUser2025!Pilot`
   - COIs updated via Keycloak Admin API: `["FVEY", "NATO", "CAN-US", "GBR-US"]`

5. **USA MongoDB Seeded**
   - 7000 documents in USA MongoDB instance
   - Seeding command: `npm run seed:instance -- --instance=USA --count=7000`

### Current Federation Status (from logs)

```
Instance  | Status          | Documents | Notes
----------|-----------------|-----------|----------------------------------
USA       | ✅ Working      | 7000      | Local instance, fully functional
FRA       | ❌ HTTP Error   | 0         | "HTTP unknown: Error" - connection issue
GBR       | ❌ HTTP Error   | 0         | "HTTP unknown: Error" - connection issue  
DEU       | ❌ HTTP 401     | 0         | Authentication failure - federation secret
```

---

## 🗂️ Project Directory Structure

```
dive-v3/
├── frontend/                           # Next.js 15+ Application
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   └── resources/
│   │   │   │       ├── route.ts                    # Local resources proxy
│   │   │   │       ├── federated-search/
│   │   │   │       │   └── route.ts               # ✅ CREATED - Federated search proxy
│   │   │   │       └── [id]/
│   │   │   └── resources/
│   │   │       └── page.tsx                       # ✅ MODIFIED - Integrated federated toggle
│   │   ├── auth.ts                                # ✅ MODIFIED - Removed prompt: "login"
│   │   └── lib/
│   │       └── session-validation.ts
│   └── package.json
│
├── backend/                            # Express.js API
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── federated-search.controller.ts     # ✅ MODIFIED - Fixed limits & auth filter
│   │   │   ├── federation.controller.ts           # SP-to-SP federation endpoints
│   │   │   └── resource.controller.ts
│   │   ├── services/
│   │   │   ├── resource.service.ts                # searchResources, getAllResources
│   │   │   ├── federated-resource.service.ts      # Direct MongoDB federation
│   │   │   ├── federation-cache.service.ts        # Redis caching for queries
│   │   │   ├── federation-registry.service.ts     # Dynamic instance config
│   │   │   └── kas-registry.service.ts            # Cross-instance KAS
│   │   ├── routes/
│   │   │   ├── resource.routes.ts                 # Includes federated-search routes
│   │   │   ├── federation.routes.ts
│   │   │   └── federated-query.routes.ts
│   │   ├── middleware/
│   │   │   ├── authz.middleware.ts                # JWT validation, COI parsing
│   │   │   ├── enrichment.middleware.ts
│   │   │   └── federation-agreement.middleware.ts
│   │   └── utils/
│   │       ├── gcp-secrets.ts                     # GCP Secret Manager integration
│   │       └── logger.ts
│   └── package.json
│
├── config/
│   ├── federation-registry.json                   # 📍 SSOT for all instances
│   └── kas-registry.json                          # KAS trust matrix
│
├── policies/
│   ├── federation_abac_policy.rego                # ✅ MODIFIED - Added same-country rule
│   └── tests/
│       └── federation_abac_policy_test.rego       # ✅ CREATED - 41+ test cases
│
├── docker-compose.yml                             # USA stack (primary)
├── docker-compose.fra.yml                         # France stack
├── docker-compose.gbr.yml                         # UK stack  
├── docker-compose.deu.yml                         # Germany stack (remote)
│
├── instances/
│   ├── usa/
│   ├── fra/
│   ├── gbr/
│   └── deu/
│
├── terraform/                                     # Keycloak IaC
│   ├── modules/
│   │   └── keycloak/
│   └── environments/
│
├── scripts/
│   ├── sync-gcp-secrets.sh                        # Sync secrets from GCP
│   └── seed-resources.ts                          # Database seeding
│
└── docs/
    ├── LATEST_ARCHITECTURE.md                     # Deployment documentation
    ├── PHASE3-FEDERATED-RESOURCES-PROMPT.md       # Original Phase 3 spec
    └── RUNBOOK-DEPLOYMENT.md
```

---

## 🔍 Gap Analysis: Remaining Instance Integration

### FRA Instance (France)

| Component | Status | Gap | Required Action |
|-----------|--------|-----|-----------------|
| Keycloak | ✅ Running | - | None |
| Backend | ✅ Running | Missing federated-search proxy route | Deploy updated frontend with `federated-search/route.ts` |
| Frontend | ✅ Running | Old code without federated search | Rebuild with latest code changes |
| MongoDB | ✅ Running | Has documents | Verify document count |
| Federation Endpoint | ❌ | Backend not responding to federation queries | Check `/federation/resources/search` endpoint |
| Client Secret | ⚠️ Unknown | May have same mismatch as USA | Sync Keycloak client secret with GCP |

### GBR Instance (United Kingdom)

| Component | Status | Gap | Required Action |
|-----------|--------|-----|-----------------|
| Keycloak | ✅ Running | - | None |
| Backend | ✅ Running | Missing federated-search proxy route | Deploy updated frontend |
| Frontend | ✅ Running | Old code | Rebuild with latest |
| MongoDB | ✅ Running | Has documents | Verify document count |
| Federation Endpoint | ❌ | Backend not responding | Check `/federation/resources/search` |
| Client Secret | ⚠️ Unknown | Potential mismatch | Sync with GCP |

### DEU Instance (Germany - Remote)

| Component | Status | Gap | Required Action |
|-----------|--------|-----|-----------------|
| Keycloak | ✅ Running | - | Via Cloudflare tunnel |
| Backend | ✅ Running | 401 auth error | Federation JWT/secret not configured |
| Frontend | ⚠️ Unknown | Needs update | Deploy via Cloudflare tunnel |
| MongoDB | ✅ Running | Has documents | Verify |
| Federation Secret | ❌ CRITICAL | Missing federation auth | Configure `dive-v3-federation-usa-deu` secret |
| Cloudflare Tunnel | ✅ Running | - | `deu-api.prosecurity.biz` |

### Cross-Instance OPA Policies

| Policy | USA | FRA | GBR | DEU | Gap |
|--------|-----|-----|-----|-----|-----|
| `federation_abac_policy.rego` | ✅ | ⚠️ | ⚠️ | ⚠️ | Deploy updated policy with same-country rule |
| Federation agreement checks | ✅ | ⚠️ | ⚠️ | ⚠️ | Verify `has_federation_agreement` rule |
| Test coverage | ✅ 41 tests | ❓ | ❓ | ❓ | Run OPA tests on each instance |

### KAS (Key Access Service) Integration

| Instance | KAS Status | Trust Matrix | Gap |
|----------|------------|--------------|-----|
| USA | ✅ Running | Trusts all | - |
| FRA | ✅ Running | ⚠️ Verify | Check `kas-registry.json` sync |
| GBR | ✅ Running | ⚠️ Verify | Check trust relationships |
| DEU | ⚠️ Unknown | ⚠️ Verify | Remote KAS configuration |

---

## 📊 SMART Objectives & Success Criteria

### Phase 3B.1: FRA Instance Integration (2 days)

**SMART Objective:** Enable federated search from USA to FRA with <300ms latency, returning 100% of authorized FRA documents within 48 hours.

**Success Criteria:**
- [ ] FRA frontend rebuilt with `federated-search/route.ts`
- [ ] FRA backend responds to `/federation/resources/search` endpoint
- [ ] Keycloak client secret synced with GCP (`dive-v3-keycloak-client-secret`)
- [ ] Federation query from USA returns FRA documents
- [ ] Latency p95 < 300ms for USA→FRA queries
- [ ] All 41+ OPA federation tests pass on FRA
- [ ] E2E test: USA user sees FRA documents in federated search

### Phase 3B.2: GBR Instance Integration (2 days)

**SMART Objective:** Enable bidirectional federated search between USA/FRA/GBR with consistent results across all instances within 48 hours.

**Success Criteria:**
- [ ] GBR frontend/backend updated with federated search code
- [ ] GBR Keycloak client secret synced
- [ ] Bidirectional queries work: USA↔FRA↔GBR
- [ ] Document counts consistent regardless of query origin
- [ ] Latency p95 < 300ms for local instance queries
- [ ] OPA tests pass on GBR
- [ ] E2E test: GBR user sees USA+FRA documents

### Phase 3B.3: DEU Remote Instance Integration (3 days)

**SMART Objective:** Enable secure federated search to remote DEU instance via Cloudflare tunnel with <500ms latency and 100% authorization compliance within 72 hours.

**Success Criteria:**
- [ ] Federation secret created: `dive-v3-federation-usa-deu` in GCP
- [ ] DEU backend authenticates federation requests (no more 401)
- [ ] Cloudflare tunnel routes `/federation/*` correctly
- [ ] Remote query latency p95 < 500ms
- [ ] All ABAC policies enforced for cross-border access
- [ ] E2E test: USA user accesses DEU documents with proper authorization
- [ ] Audit logs capture all federation decisions

### Phase 3B.4: Full Federation Validation (2 days)

**SMART Objective:** Validate complete 4-instance federation with comprehensive test coverage and production-ready resilience within 48 hours.

**Success Criteria:**
- [ ] All 4 instances query each other successfully
- [ ] Circuit breaker handles instance unavailability gracefully
- [ ] Redis caching reduces repeated query latency by >50%
- [ ] 100+ document types across all classification levels tested
- [ ] Load test: 50 concurrent federated queries, <500ms p95
- [ ] Security audit: No unauthorized cross-instance access
- [ ] Documentation complete: Runbook, architecture diagrams, API specs

---

## 🛠️ Available Tools & Permissions

### CLI Tools (Full Access)

1. **GitHub CLI (`gh`)**
   - Repository management, PR creation, issue tracking
   - `gh auth status` verified

2. **GCP CLI (`gcloud`)**
   - Project: `dive25` (existing)
   - **NEW PROJECT CREATION AUTHORIZED** if needed
   - Secret Manager: Full CRUD on `dive-v3-*` secrets
   - Service accounts: Can create for cross-instance auth

3. **Cloudflare CLI (`cloudflared`)**
   - Tunnel management for DEU remote instance
   - DNS configuration for `*.dive25.com` and `*.prosecurity.biz`

4. **Docker & Docker Compose**
   - Full control over all instance stacks
   - Image building and deployment

### MCP Servers Available

1. **Keycloak Docs MCP** (`mcp_keycloak-docs_*`)
   - `docs_search`: Search admin guide and REST API
   - `docs_get`: Retrieve full documentation chunks
   - Use for: Federation configuration, protocol mappers, client setup

2. **Stripe MCP** (if payment integration needed)

3. **Browser MCP** (`mcp_cursor-ide-browser_*`)
   - Navigate, snapshot, interact with web pages
   - Use for: E2E testing, Keycloak admin console

---

## 🚨 Critical Requirements

### NO WORKAROUNDS OR SHORTCUTS

1. **Secrets Management**
   - ALL secrets MUST come from GCP Secret Manager
   - NEVER hardcode passwords, tokens, or keys
   - Use `backend/src/utils/gcp-secrets.ts` for all secret access

2. **Persistent Solutions Only**
   - Changes must survive container restarts
   - Configuration must be in version control or GCP
   - No manual Keycloak console changes without Terraform

3. **Test Coverage Required**
   - Every code change needs corresponding tests
   - OPA policies: 100% test coverage
   - Backend services: >80% coverage
   - E2E: Critical user flows covered

4. **Resilience Patterns**
   - Circuit breakers for all external calls
   - Graceful degradation when instances unavailable
   - Retry logic with exponential backoff
   - Comprehensive error logging

---

## 📁 Files Modified/Created This Session

### Created
```
frontend/src/app/api/resources/federated-search/route.ts  # Federated search proxy
policies/tests/federation_abac_policy_test.rego           # OPA test suite
```

### Modified
```
frontend/src/auth.ts                                      # Removed prompt: "login"
frontend/src/app/resources/page.tsx                       # Added federated toggle, fixed reload loop
frontend/src/components/navigation/nav-config.ts          # Removed separate federated page
backend/src/controllers/federated-search.controller.ts    # Fixed limits, optional auth filter
policies/federation_abac_policy.rego                      # Added same-country access rule
```

### Key Configuration Files
```
config/federation-registry.json    # Instance topology (SSOT)
config/kas-registry.json           # KAS trust matrix
docker-compose.yml                 # USA stack
docker-compose.fra.yml             # FRA stack
docker-compose.gbr.yml             # GBR stack
docker-compose.deu.yml             # DEU stack
```

---

## 🔐 GCP Secrets Reference

| Secret Name | Purpose | Instances |
|-------------|---------|-----------|
| `dive-v3-mongodb-{usa,fra,gbr,deu}` | MongoDB passwords | All |
| `dive-v3-keycloak-{usa,fra,gbr,deu}` | Keycloak admin passwords | All |
| `dive-v3-postgres-{usa,fra,gbr,deu}` | PostgreSQL passwords | All |
| `dive-v3-keycloak-client-secret` | OIDC client secret | All |
| `dive-v3-federation-{src}-{tgt}` | Federation auth (12 bidirectional) | Cross-instance |
| `dive-v3-auth-secret-{usa,fra,gbr,deu}` | NextAuth secrets | All |

---

## 🏃 Immediate Next Steps

1. **Diagnose FRA/GBR Connection Errors**
   ```bash
   # Check backend federation endpoint
   curl -k https://fra-api.dive25.com/federation/health
   curl -k https://gbr-api.dive25.com/federation/health
   ```

2. **Sync Client Secrets**
   ```bash
   # For each instance, sync Keycloak client secret with GCP
   ./scripts/sync-keycloak-client-secret.sh fra
   ./scripts/sync-keycloak-client-secret.sh gbr
   ```

3. **Deploy Updated Code to FRA/GBR**
   ```bash
   # Rebuild frontends with new federated-search route
   docker compose -p fra build frontend && docker compose -p fra up -d frontend
   docker compose -p gbr build frontend && docker compose -p gbr up -d frontend
   ```

4. **Configure DEU Federation Secret**
   ```bash
   # Create federation secret in GCP
   echo -n "$(openssl rand -base64 32)" | \
     gcloud secrets create dive-v3-federation-usa-deu --data-file=- --project=dive25
   ```

---

## 📚 Reference Documentation

- `docs/LATEST_ARCHITECTURE.md` - Deployment architecture
- `docs/PHASE3-FEDERATED-RESOURCES-PROMPT.md` - Original Phase 3 spec
- `docs/RUNBOOK-DEPLOYMENT.md` - Operational procedures
- `docs/MFA-FEDERATION-ARCHITECTURE.md` - Federation design

---

**END OF PROMPT - Ready for new chat session**






