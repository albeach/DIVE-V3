# DIVE V3 Architecture Enhancement - Next Session Prompt (Phases 5-7)

## Session Context & Background

You are a Senior DevOps Engineer and Site Reliability Engineer specializing in Keycloak, PostgreSQL, MongoDB, Terraform, and distributed systems architecture. You are continuing the DIVE V3 architecture enhancement project started on 2026-01-24.

### What Was Completed (2026-01-24 Session)

**Phase 1: COI Definition SSOT (COMPLETE ✅)**
- ✅ Added 3 missing COIs to initialize-coi-keys.ts (TEST-COI, NEW-COI, PACIFIC-ALLIANCE)
- ✅ Removed seedBaselineCOIs() function from coi-definition.model.ts
- ✅ Created POST /api/opal/generate-coi-members-file endpoint
- ✅ Regenerated OPAL coi_members.json with all 22 COIs from MongoDB
- ✅ Verified zero divergence: MongoDB (22) = OPAL (22) = Script (22)

**Phase 2: Plaintext Fallback Elimination (COMPLETE ✅)**
- ✅ Added comprehensive pre-flight validation to seed-instance-resources.ts
- ✅ Validates COI count (must be 22)
- ✅ Validates all template COIs exist in MongoDB
- ✅ Validates KAS servers available and approved
- ✅ Fail-fast with clear error messages
- ✅ No plaintext fallback - 100% ZTDF encryption enforced

**Phase 3: MongoDB Replica Set (COMPLETE ✅)**
- ✅ Created generate-mongo-keyfile.sh (1008-byte secure keyFile)
- ✅ Updated docker-compose.hub.yml with replica set + keyFile config
- ✅ Updated spoke template with same configuration
- ✅ Created mongo-init-replicaset.sh initialization script
- ✅ Created init-mongo-replica-set-post-start.sh for deployment integration
- ✅ Fixed hub_up/hub_down to load secrets before docker-compose
- ✅ Added directConnection=true to MONGODB_URL (required for Node.js driver)
- ✅ Integrated replica set initialization into hub deployment workflow
- ✅ Verified: MongoDB 'rs0' PRIMARY, change streams working

**Phase 4: Audit Infrastructure (PARTIAL ⚠️)**
- ✅ Created backend/drizzle/audit/0001_audit_tables.sql
  - audit_log: 88 kB, 8 indexes
  - authorization_log: 120 kB, 12 indexes
  - federation_log: 96 kB, 9 indexes
- ✅ Created 2 analytics views (recent_authorization_denials, federation_activity_summary)
- ✅ Created cleanup_old_audit_records() function (90-day retention)
- ✅ Enhanced audit.service.ts with PostgreSQL persistence
  - Added pg.Pool connection
  - Created persistToDatabase() method
  - Integrated async database logging
- ✅ Created monitoring/otel-collector-config.yaml
- ✅ Created monitoring/dashboards/audit-analytics.json
- ⏳ PENDING: OTEL collector service deployment to docker-compose.hub.yml
- ⏳ PENDING: Keycloak OTEL environment configuration
- ⏳ PENDING: Grafana dashboard import and testing

**Deployment Status:**
- ✅ Hub: 9/9 services healthy
- ✅ MongoDB: Replica set 'rs0' PRIMARY
- ✅ Backend: Healthy, MongoDB connected
- ✅ Change Streams: Active ("OPAL data change stream started")
- ✅ Audit Tables: Created in PostgreSQL dive_v3_app
- ✅ All commits pushed to GitHub (7 commits)

---

## Current Production State

### Deployed Infrastructure

**Hub (USA):**
```
Location:     /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3
Services:     9/9 healthy
  - Keycloak (26.5.2): https://localhost:8443
  - Backend API: https://localhost:4000
  - PostgreSQL 18.1: Keycloak DB + NextAuth + Audit + Orchestration
  - MongoDB 8.0.17: Replica set 'rs0' PRIMARY (change streams enabled)
  - Redis: Session cache + Blacklist
  - OPA: 1.12.1
  - KAS: 8080
  - AuthZForce: 12.0.1
  - OPAL Server: 7002

Databases:
  - PostgreSQL (keycloak_db): Keycloak schema, users, realms
  - PostgreSQL (dive_v3_app):
    * NextAuth: user, account, session, verificationToken
    * Audit: audit_log, authorization_log, federation_log
    * Views: recent_authorization_denials, federation_activity_summary
  - PostgreSQL (orchestration): 8 state management tables
  - MongoDB (dive-v3-hub) Replica Set 'rs0':
    * coi_definitions: 22 COIs
    * resources: 5000 ZTDF encrypted documents
    * kas_registry: 6 KAS servers
    * trusted_issuers, federation_matrix, tenant_configs, etc.

MongoDB Configuration:
  - Replica Set: rs0 (single-node)
  - KeyFile: /tmp/mongo-keyfile (400 permissions)
  - Authentication: admin user + keyFile for replica set
  - Change Streams: ✅ Active (OPAL CDC working)
  - Connection: mongodb://admin:***@mongodb:27017/?authSource=admin&directConnection=true

Terraform:
  - Provider: keycloak/keycloak ~> 5.6.0
  - Module: federated-instance (1116 lines main.tf - needs refactoring)
  - Resources: 142 deployed
```

**Spoke (FRA):**
```
Status:       Not currently deployed (was deployed, then nuked for clean slate testing)
Config Ready: ✅ All spoke configurations updated with replica set + keyFile
Pipeline:     ✅ Updated with COI SSOT and MongoDB replica set config
Deployment:   < 10 minutes when needed
```

---

## SSOT Architecture (Established)

### Data SSOT (Backend TypeScript)
```
backend/src/scripts/
├── initialize-coi-keys.ts      # COI definitions → MongoDB (22 COIs) ★ SSOT
├── setup-demo-users.ts          # Users → Keycloak + MongoDB
└── seed-instance-resources.ts   # Resources → MongoDB (ZTDF encrypted, fail-fast)
```

**Called By:**
- Hub: `scripts/dive-modules/hub/seed.sh` → TypeScript
- Spoke: `scripts/dive-modules/spoke/pipeline/phase-seeding.sh` → TypeScript

**Pre-Flight Validation:**
- COI count must be 22
- All template COIs must exist
- KAS servers must be approved
- Fails immediately if requirements not met

### Configuration SSOT (Terraform)
```
terraform/modules/
├── federated-instance/  # Realms, clients, IdPs, protocol mappers
│   ├── main.tf (1116 lines - NEEDS REFACTORING in Phase 5)
│   ├── acr-amr-session-mappers.tf (has duplicates)
│   ├── client-scopes.tf
│   ├── idp-brokers.tf
│   └── REFACTORING_IMPLEMENTATION.md ★ Complete refactoring guide
└── realm-mfa/          # Authentication flows (will be absorbed into federated-instance)
```

### Audit SSOT (PostgreSQL + File)
```
Dual Persistence:
  1. File: backend/logs/audit.log (Winston, rotating, 100MB max)
  2. Database: PostgreSQL dive_v3_app (audit tables, 90-day retention)

Event Routing:
  - ACCESS_GRANT/DENY → authorization_log table
  - FEDERATION_AUTH → federation_log table
  - Other events → audit_log table
```

### MongoDB SSOT
```
Single-Node Replica Set Configuration:
  - Name: rs0
  - KeyFile: instances/hub/mongo-keyfile (1008 bytes, 400 permissions)
  - Authentication: admin user + keyFile
  - Connection: directConnection=true (required for Node.js driver)
  - Health Check: Verifies PRIMARY status
  - Change Streams: ✅ Enabled (OPAL CDC active)
```

---

## Project Directory Structure

```
DIVE-V3/
├── .cursor/                    # Session documentation
│   ├── PHASE_1-4_IMPLEMENTATION_COMPLETE.md ★ Previous session summary
│   ├── NEXT_SESSION_PHASES_5-7_PROMPT.md ★ This document
│   └── [15+ other session docs]
├── backend/                    # Express.js API (PEP)
│   ├── src/
│   │   ├── scripts/           # DATA SSOT (TypeScript)
│   │   │   ├── initialize-coi-keys.ts ★ COI SSOT (22 COIs)
│   │   │   ├── setup-demo-users.ts
│   │   │   └── seed-instance-resources.ts ★ Pre-flight validation added
│   │   ├── services/
│   │   │   ├── audit.service.ts ★ PostgreSQL persistence added
│   │   │   └── opal-mongodb-sync.service.ts ★ Fail-fast for change streams
│   │   ├── models/
│   │   │   ├── coi-definition.model.ts ★ seedBaselineCOIs() REMOVED
│   │   │   ├── kas-registry.model.ts
│   │   │   └── policy-version.model.ts
│   │   ├── routes/
│   │   │   └── opal.routes.ts ★ Added generate-coi-members-file endpoint
│   │   └── middleware/
│   ├── drizzle/
│   │   └── audit/
│   │       └── 0001_audit_tables.sql ★ NEW (audit tables, views, retention)
│   └── data/opal/
│       └── coi_members.json   ★ Regenerated from MongoDB (22 COIs)
├── frontend/                  # Next.js 15 App Router
├── terraform/                 # CONFIGURATION SSOT
│   ├── hub/
│   ├── spoke/
│   ├── modules/
│   │   ├── federated-instance/  ★ Needs refactoring (Phase 5)
│   │   │   ├── main.tf (1116 lines - TO BE SPLIT)
│   │   │   ├── REFACTORING_IMPLEMENTATION.md ★ Step-by-step guide
│   │   │   └── acr-amr-session-mappers.tf (has duplicates - TO BE REMOVED)
│   │   └── realm-mfa/       ★ To be absorbed into federated-instance
│   └── REFACTORING_PLAN.md  ★ Complete redesign doc (286 lines)
├── scripts/
│   ├── generate-mongo-keyfile.sh ★ NEW (keyFile generator)
│   ├── mongo-init-replicaset.sh ★ NEW (replica set init)
│   ├── init-mongo-replica-set-post-start.sh ★ NEW (post-startup init)
│   ├── dive-modules/
│   │   ├── deployment/
│   │   │   └── hub.sh ★ Updated (load_secrets in hub_up/hub_down)
│   │   └── spoke/pipeline/
│   │       └── phase-seeding.sh (calls initialize-coi-keys.ts)
│   └── archived/            # Legacy scripts archived
├── monitoring/
│   ├── otel-collector-config.yaml ★ NEW (OTLP receivers, Prometheus exporter)
│   └── dashboards/
│       └── audit-analytics.json ★ NEW (6 panels: logins, authz, federation, MFA)
├── instances/
│   └── hub/
│       ├── certs/           # mkcert certificates
│       └── mongo-keyfile ★ NEW (1008 bytes, gitignored)
├── docker-compose.hub.yml ★ Updated (MongoDB replica set with keyFile)
├── templates/spoke/
│   └── docker-compose.template.yml ★ Updated (replica set config)
└── .gitignore ★ Updated (mongo-keyfile patterns, drizzle migrations allowed)
```

---

## Technical Debt Eliminated

### 1. COI Definition Divergence ✅ ELIMINATED

**Before:**
- 3 different COI sources (MongoDB 19, OPAL 22, seedBaselineCOIs 7)
- Spokes had 7 COIs, Hub had 19 → validation failures
- Resources fell back to plaintext when COI validation failed

**After:**
- Single source: initialize-coi-keys.ts (22 COIs)
- MongoDB is runtime storage (populated from script)
- OPAL file is generated artifact (from MongoDB)
- Zero divergence across all systems

### 2. Plaintext Resource Fallback ✅ ELIMINATED

**Before:**
- seed-instance-resources.ts had fallback to plaintext
- Hid configuration errors (missing COIs, unapproved KAS)
- Security violation - NOT ACP-240 compliant

**After:**
- Comprehensive pre-flight validation before seeding
- Fail-fast with clear error messages
- No plaintext fallback - encryption is mandatory
- 100% ZTDF enforcement

### 3. MongoDB Standalone Mode ✅ ELIMINATED

**Before:**
- MongoDB running in standalone mode
- Change streams not supported
- OPAL CDC using polling fallback
- Error: "The $changeStream stage is only supported on replica sets"

**After:**
- Single-node replica set 'rs0' with keyFile authentication
- Production-grade security (no --noauth shortcuts)
- Change streams working (OPAL CDC active)
- Health check verifies PRIMARY status

### 4. Hub CLI Secret Loading Issues ✅ ELIMINATED

**Before:**
- hub_up() and hub_down() didn't load secrets
- Docker Compose variable interpolation failed
- Cascading errors: "KEYCLOAK_CLIENT_SECRET required"

**After:**
- hub_up() calls load_secrets before docker-compose
- hub_down() loads secrets for variable interpolation
- All environment variables properly populated

### 5. seedBaselineCOIs() Function ✅ ELIMINATED

**Before:**
- Auto-seeded only 7 baseline COIs
- Created divergence (Hub 19, Spoke 7)
- Hidden technical debt

**After:**
- Function completely removed
- Deployments must call initialize-coi-keys.ts explicitly
- Enforces SSOT architecture

---

## Lessons Learned & Best Practices

### 1. MongoDB Replica Sets Require Specific Configuration

**Lesson:** Single-node replica sets need keyFile for production, but also need special configuration for Node.js driver.

**Best Practice:**
```yaml
# Docker Compose Configuration
command: >
  bash -c "
    cp /data/keyfile/mongo-keyfile /tmp/mongo-keyfile &&
    chmod 600 /tmp/mongo-keyfile &&
    chown 999:999 /tmp/mongo-keyfile &&
    exec docker-entrypoint.sh mongod --replSet rs0 --keyFile /tmp/mongo-keyfile
  "

# Connection String (CRITICAL)
MONGODB_URL: mongodb://admin:${PASSWORD}@mongodb:27017/?authSource=admin&directConnection=true
#                                                                           ^^^^^^^^^^^^^^^^^^^^^^
#                                                                           Required for single-node!

# Health Check
healthcheck:
  test: mongosh admin -u admin -p ${PASSWORD} --quiet --eval "rs.status().members[0].stateStr" | grep -q PRIMARY
```

**Why directConnection=true is Required:**
- Without it, MongoDB driver attempts replica set discovery
- Discovery tries to connect to all members (fails in Docker networking)
- Connections timeout after 30 seconds
- With directConnection=true, driver connects directly without discovery

### 2. Docker Compose Requires Secrets at ALL Times

**Lesson:** Docker Compose interpolates variables even for `docker compose down`, not just `up`.

**Best Practice:**
```bash
# hub_up() - Load secrets first
hub_up() {
    if ! load_secrets; then
        log_error "Failed to load secrets"
        return 1
    fi
    docker compose -f "$HUB_COMPOSE_FILE" up -d
}

# hub_down() - Also load secrets for interpolation
hub_down() {
    if ! load_secrets 2>/dev/null; then
        log_warn "Could not load secrets - using cached .env.hub"
        [ -f .env.hub ] && source .env.hub
    fi
    docker compose -f "$HUB_COMPOSE_FILE" down
}
```

### 3. Fail Fast, Not Fail Silent

**Lesson:** Plaintext fallback and auto-seeding hide configuration errors.

**Best Practice:**
```typescript
// ❌ BAD: Silent fallback
if (coiValidationFails) {
    seedPlaintextResources(); // Hides the problem
}

// ✅ GOOD: Fail fast with clear guidance
if (coiValidationFails) {
    throw new Error(
        `ZTDF validation failed: ${errors}\n` +
        `Solution: Run initialize-coi-keys.ts to populate COIs`
    );
}
```

### 4. MongoDB Init Scripts Run BEFORE Replica Set Enabled

**Lesson:** docker-entrypoint-initdb.d/ scripts run during MongoDB's temporary startup, before replica set is configured.

**Best Practice:**
```bash
# Use post-startup initialization instead
# 1. Start MongoDB with --replSet and --keyFile
# 2. Wait for container healthy
# 3. Run rs.initiate() with admin credentials
# 4. Integrate into deployment workflow

# In deployment script:
hub_wait_healthy
bash scripts/init-mongo-replica-set-post-start.sh dive-hub-mongodb admin "$MONGO_PASSWORD"
```

### 5. SSOT Must Be Truly Single Source

**Lesson:** Multiple COI sources caused divergence and validation failures.

**Best Practice:**
- One function per data type (initialize-coi-keys.ts)
- Called explicitly by deployment scripts
- No auto-seeding or fallback sources
- Derived artifacts regenerated from SSOT
- MongoDB stores runtime data, scripts define canonical data

---

## Deferred Actions & Next Steps

### Phase 5: Complete Terraform Module Restructuring (DOCUMENTED, READY)

**Document:** `terraform/modules/federated-instance/REFACTORING_IMPLEMENTATION.md`

**Current State:**
- main.tf: 1116 lines (realm + clients + mappers + flows mixed)
- Duplicates: 2 AMR mappers, 2 AMR user attribute mappers
- realm-mfa module: Separate module for auth flows

**Target Structure:**
```
terraform/modules/federated-instance/
├── main.tf              # Realm configuration ONLY (~150 lines)
├── clients.tf           # ALL client definitions (NEW)
├── protocol-mappers.tf  # ALL mappers with DRY principles (NEW, consolidates duplicates)
├── client-scopes.tf     # Client scopes (exists, keep)
├── idp-brokers.tf      # IdP configurations (exists, minimal changes)
├── authentication-flows.tf  # Auth flows (NEW, absorb from realm-mfa)
├── realm-settings.tf   # Password policy, i18n, security (NEW)
├── webauthn-policies.tf     # WebAuthn AAL2/AAL3 (NEW, from realm-mfa)
├── variables.tf
├── outputs.tf
└── versions.tf
```

**Implementation Steps:**
1. Backup Terraform state:
   ```bash
   cd terraform/hub
   terraform state pull > ../../backups/terraform-state-pre-phase5-$(date +%Y%m%d-%H%M%S).json
   ```

2. Create new files (clients.tf, protocol-mappers.tf, etc.)
3. Extract resources from main.tf to appropriate files
4. Remove duplicate mappers from acr-amr-session-mappers.tf:
   - keycloak_generic_protocol_mapper.broker_amr_mapper (lines 123-145)
   - keycloak_openid_user_attribute_protocol_mapper.broker_amr_user_attribute (lines 147-168)
5. Absorb realm-mfa module into federated-instance
6. Use DRY patterns (locals, for_each loops)
7. Test: `terraform fmt -recursive && terraform validate && terraform plan -out=refactor.tfplan`
8. Review plan: Should show MOVES, not DESTROYS
9. Apply: `terraform apply refactor.tfplan`
10. Verify: All services remain healthy

**Success Criteria:**
- main.tf reduced to ~150 lines (realm only)
- Zero duplicate resources
- terraform plan shows 0 resources to destroy
- All services healthy after apply
- realm-mfa module deleted (absorbed)

**Estimated Time:** 4-6 hours

### Phase 6: Create Deployment Validation Test Suite (SPECIFICATIONS READY)

**Test Categories:**

**1. Infrastructure Validation**
File: `backend/src/__tests__/deployment/infrastructure.test.ts`
```typescript
describe('Infrastructure Validation', () => {
  it('should have all required services healthy');
  it('should have MongoDB as replica set rs0');
  it('should have MongoDB PRIMARY status');
  it('should have change streams enabled');
  it('should have all required databases');
});
```

**2. COI SSOT Validation**
File: `backend/src/__tests__/deployment/coi-validation.test.ts`
```typescript
describe('COI SSOT Validation', () => {
  it('should have exactly 22 COI definitions in MongoDB');
  it('should have OPAL file matching MongoDB');
  it('should have no COI divergence between hub and spoke');
  it('should fail deployment if COI count < 22');
});
```

**3. Resource Encryption Validation**
File: `backend/src/__tests__/deployment/encryption-validation.test.ts`
```typescript
describe('Resource Encryption', () => {
  it('should have 100% ZTDF encrypted resources');
  it('should have zero plaintext resources');
  it('should fail seeding if ZTDF validation fails');
});
```

**4. Federation Validation**
File: `backend/src/__tests__/deployment/federation-validation.test.ts`
```typescript
describe('Federation Configuration', () => {
  it('should have bidirectional IdP links (hub ↔ spoke)');
  it('should have all KAS servers approved');
  it('should successfully federate users');
});
```

**5. Audit Infrastructure Validation**
File: `backend/src/__tests__/deployment/audit-validation.test.ts`
```typescript
describe('Audit Infrastructure', () => {
  it('should have 3 audit tables in PostgreSQL');
  it('should log authorization decisions to database');
  it('should have analytics views created');
  it('should have 90-day retention function');
  it('should persist audit entries to PostgreSQL');
});
```

**Execution:**
```bash
cd backend
npm run test:deployment  # Run all deployment tests
npm run test:deployment:watch  # Watch mode for development
```

**Success Criteria:**
- All deployment tests pass
- Tests catch configuration errors
- Can validate from clean slate
- Run in CI/CD pipeline

**Estimated Time:** 8 hours

### Phase 7: Additional Spoke Deployments & Federation Testing (PIPELINE READY)

**Deployment Commands:**
```bash
# Deploy GBR spoke
./dive spoke deploy GBR "United Kingdom"

# Deploy DEU spoke
./dive spoke deploy DEU Germany

# Verify each spoke
./dive spoke status GBR
./dive spoke status DEU
```

**Validation Checklist:**
- [ ] GBR services: 9/9 healthy
- [ ] DEU services: 9/9 healthy
- [ ] All spokes have 22 COIs (SSOT enforcement)
- [ ] All spokes have 5000 ZTDF encrypted resources
- [ ] MongoDB replica sets: All PRIMARY
- [ ] Change streams: All active
- [ ] Federation mesh: USA ↔ FRA ↔ GBR ↔ DEU
- [ ] Cross-instance search working
- [ ] Audit logs aggregated at hub

**Federation Flow Testing:**
1. GBR user federates to Hub
2. DEU user accesses FRA resources
3. Multi-hop federation (GBR → Hub → FRA)
4. MFA enforcement consistent across instances
5. Authorization decisions logged in all instances
6. Audit logs flow to hub for aggregation

**Success Criteria:**
- 3 spokes deployed (FRA, GBR, DEU)
- Federation mesh validated
- Cross-instance authorization working
- No deployment errors
- All instances have identical COI count

**Estimated Time:** 2 hours

---

## Gap Analysis - Full Scope

### Infrastructure Gaps

**1. OTEL Collector Service (HIGH PRIORITY - Phase 4 Remaining)**
- **Current:** Configuration created, service not deployed
- **Gap:** No OpenTelemetry collector running
- **Impact:** Keycloak metrics not collected, no distributed tracing
- **Solution:** Add otel-collector service to docker-compose.hub.yml
- **Effort:** 1 hour

**2. Grafana Dashboard Import (MEDIUM PRIORITY - Phase 4 Remaining)**
- **Current:** Dashboard JSON created
- **Gap:** Not imported into Grafana
- **Impact:** No audit analytics visualization
- **Solution:** Import dashboard, configure PostgreSQL datasource
- **Effort:** 30 minutes

**3. Keycloak Event Configuration (MEDIUM PRIORITY - Phase 4 Remaining)**
- **Current:** Audit tables created
- **Gap:** Keycloak events not configured to publish
- **Solution:** Add event listeners via Terraform
- **Effort:** 1 hour

**4. Automatic Network Creation (LOW PRIORITY)**
- **Current:** Requires manual `docker network create dive-shared`
- **Gap:** Deployment script doesn't auto-create network
- **Impact:** Deployment fails if network missing
- **Solution:** Add network creation to deployment script
- **Effort:** 30 minutes

### Configuration Gaps

**1. Terraform Module Restructuring (HIGH PRIORITY - Phase 5)**
- **Current:** main.tf at 1116 lines with duplicates
- **Gap:** Not refactored into single-purpose files
- **Impact:** Hard to maintain, duplicates cause confusion
- **Solution:** Follow REFACTORING_IMPLEMENTATION.md
- **Effort:** 4-6 hours

**2. Duplicate Protocol Mappers (HIGH PRIORITY - Phase 5)**
- **Current:** 2 AMR mappers, 2 AMR user attribute mappers
- **Gap:** Duplicates still exist in acr-amr-session-mappers.tf
- **Impact:** Token bloat, maintenance confusion
- **Solution:** Remove duplicates during Terraform refactoring
- **Effort:** Included in Phase 5

### Testing Gaps

**1. Automated Deployment Tests (HIGH PRIORITY - Phase 6)**
- **Current:** Manual validation only
- **Gap:** No automated test suite
- **Impact:** Regressions not caught automatically
- **Solution:** Create 5 test categories as specified
- **Effort:** 8 hours

**2. Federation E2E Tests (MEDIUM PRIORITY - Phase 6)**
- **Current:** Federation configured but not tested
- **Gap:** No automated federation flow tests
- **Impact:** Federation regressions not caught
- **Solution:** Create federation test suite in Phase 6
- **Effort:** Included in Phase 6

**3. Load Testing (LOW PRIORITY - Future)**
- **Current:** No load tests
- **Gap:** Performance characteristics unknown
- **Impact:** Don't know if system handles 100 req/s
- **Solution:** Create load test suite
- **Effort:** 4 hours

### Deployment Gaps

**1. Additional Spokes (MEDIUM PRIORITY - Phase 7)**
- **Current:** Only Hub deployed
- **Gap:** No spokes deployed to test federation mesh
- **Impact:** Can't validate multi-instance architecture
- **Solution:** Deploy GBR and DEU spokes
- **Effort:** 2 hours

**2. Spoke KeyFile Generation (LOW PRIORITY)**
- **Current:** No automatic keyFile generation for spokes
- **Gap:** Must manually run generate-mongo-keyfile.sh
- **Solution:** Integrate into spoke deployment pipeline
- **Effort:** 1 hour

---

## Phased Implementation Plan

### Phase 5: Terraform Module Restructuring (4-6 hours)

**SMART Goal:**
- **Specific:** Split main.tf into 7 single-purpose files, remove duplicates, absorb realm-mfa
- **Measurable:** main.tf from 1116 lines to ~150 lines, 0 duplicate resources
- **Achievable:** Complete plan exists in REFACTORING_IMPLEMENTATION.md
- **Relevant:** Cleaner code, easier maintenance, eliminates technical debt
- **Time-bound:** 6 hours maximum

**Pre-Implementation:**
```bash
# 1. Backup Terraform state
cd terraform/hub
terraform state pull > ../../backups/terraform-state-pre-phase5-$(date +%Y%m%d-%H%M%S).json

# 2. Backup entire terraform directory
cp -r terraform terraform.backup-$(date +%Y%m%d-%H%M%S)

# 3. Read refactoring plan
cat terraform/modules/federated-instance/REFACTORING_IMPLEMENTATION.md
```

**Step 1: Create New Files (1 hour)**

Create in `terraform/modules/federated-instance/`:

1. **clients.tf**
   - Extract `keycloak_openid_client.broker_client`
   - Extract `keycloak_openid_client.backend_service_account`
   - Extract `keycloak_user.backend_service_account`
   - Extract `keycloak_openid_client.incoming_federation` (for_each)

2. **protocol-mappers.tf**
   - Core attribute mappers (uniqueID, clearance, country, COI)
   - ACR/AMR native session mappers
   - ACR/AMR user attribute fallback
   - Realm roles mapper
   - Federation client mappers (DRY with for_each)
   - **REMOVE DUPLICATES:**
     - Delete broker_amr_mapper from acr-amr-session-mappers.tf
     - Delete broker_amr_user_attribute from acr-amr-session-mappers.tf

3. **authentication-flows.tf**
   - Classified-Access-Browser-Flow (AAL1/AAL2/AAL3)
   - Simple Post-Broker OTP Flow
   - Absorb from realm-mfa/main.tf and realm-mfa/simple-post-broker-otp.tf

4. **realm-settings.tf**
   - Password policy (extract from realm block in main.tf)
   - Internationalization (extract from realm block)
   - Security defenses (extract from realm block)
   - Browser security headers (extract from realm block)

5. **webauthn-policies.tf**
   - WebAuthn policy (AAL2)
   - WebAuthn passwordless policy (AAL3)
   - Copy from realm-mfa/webauthn-policy.tf

**Step 2: Update main.tf (~150 lines)**

Keep ONLY:
```hcl
resource "keycloak_realm" "broker" {
  realm = var.realm_name
  # Basic realm settings
  # (password policy, i18n, security moved to realm-settings.tf)
}
```

**Step 3: Validate and Apply (1 hour)**

```bash
cd terraform/hub

# Format and validate
terraform fmt -recursive
terraform validate

# Plan (should show MOVES, not DESTROYS)
terraform plan -out=refactor.tfplan

# Review plan carefully
terraform show refactor.tfplan | less

# Verify no destroys
terraform show refactor.tfplan | grep "will be destroyed" && echo "ERROR: Resources will be destroyed!" && exit 1

# Apply
terraform apply refactor.tfplan

# Verify
./dive hub status  # Should show all services healthy
```

**Step 4: Delete Deprecated Files**

```bash
# After successful apply
rm terraform/modules/federated-instance/acr-amr-session-mappers.tf
rm -rf terraform/modules/realm-mfa/
```

**Rollback Procedure:**
```bash
cd terraform/hub
terraform state push ../../backups/terraform-state-pre-phase5-YYYYMMDD-HHMMSS.json
git checkout terraform/modules/federated-instance/
terraform plan  # Should show no changes
```

**Success Criteria:**
- [ ] main.tf reduced to ~150 lines
- [ ] 7 new single-purpose files created
- [ ] Zero duplicate resources
- [ ] terraform plan shows 0 destroys
- [ ] terraform apply succeeds
- [ ] All 9 services remain healthy
- [ ] realm-mfa module deleted
- [ ] acr-amr-session-mappers.tf deleted

**Testing:**
```bash
# After Terraform refactoring
export USE_GCP_SECRETS=true
./dive hub status  # All healthy
curl -k https://localhost:8443/realms/dive-v3-broker-usa/.well-known/openid-configuration  # Realm exists
```

**Deliverables:**
- Refactored Terraform module (7 files)
- Terraform plan output (verification)
- Git commit with changes

---

### Phase 6: Create Deployment Validation Test Suite (8 hours)

**SMART Goal:**
- **Specific:** Create 5 test suites with 25+ tests covering infrastructure, COI, encryption, federation, audit
- **Measurable:** 100% deployment validation coverage, all tests passing
- **Achievable:** Infrastructure exists, test patterns established
- **Relevant:** Catches regressions, enables CI/CD
- **Time-bound:** 8 hours

**Test Development Order:**

**Day 1: Core Infrastructure Tests (4 hours)**

1. **infrastructure.test.ts** (1.5 hours)
   ```typescript
   - Test all services healthy
   - Test MongoDB replica set PRIMARY
   - Test change streams enabled
   - Test databases exist (keycloak_db, dive_v3_app, orchestration)
   - Test Redis connectivity
   - Test Keycloak realm exists
   ```

2. **coi-validation.test.ts** (1.5 hours)
   ```typescript
   - Test MongoDB has 22 COIs
   - Test OPAL file matches MongoDB
   - Test all template COIs exist
   - Test COI membership maps correct
   - Test COI auto-update from federation
   ```

3. **encryption-validation.test.ts** (1 hour)
   ```typescript
   - Test 100% ZTDF encryption
   - Test zero plaintext resources
   - Test all resources have keyAccessObjects
   - Test KAS servers approved
   - Test pre-flight validation blocks bad config
   ```

**Day 2: Federation & Audit Tests (4 hours)**

4. **federation-validation.test.ts** (2 hours)
   ```typescript
   - Test bidirectional IdP links exist
   - Test federation user flow
   - Test cross-instance resource access
   - Test attribute mapping (clearance, country, COI)
   - Test MFA enforcement (AAL1/AAL2/AAL3)
   ```

5. **audit-validation.test.ts** (2 hours)
   ```typescript
   - Test audit tables exist in PostgreSQL
   - Test authorization decisions logged to database
   - Test federation events logged
   - Test analytics views return data
   - Test retention function exists
   - Test PostgreSQL persistence working
   ```

**Test Execution:**
```bash
# Run all deployment tests
cd backend
npm run test:deployment

# Run specific category
npm run test:deployment infrastructure
npm run test:deployment coi
npm run test:deployment encryption
npm run test:deployment federation
npm run test:deployment audit

# Watch mode for development
npm run test:deployment:watch

# Coverage report
npm run test:deployment:coverage
```

**Success Criteria:**
- [ ] All 5 test suites created
- [ ] 25+ tests passing
- [ ] 100% deployment validation coverage
- [ ] Tests run in < 5 minutes
- [ ] Tests catch misconfigurations
- [ ] CI/CD integration ready

**Deliverables:**
- 5 test suite files
- package.json test scripts
- Test execution documentation
- Coverage reports

---

### Phase 7: Additional Spoke Deployments & Federation Testing (2 hours)

**SMART Goal:**
- **Specific:** Deploy GBR and DEU spokes, validate 4-instance federation mesh
- **Measurable:** 3 spokes deployed (FRA, GBR, DEU), all with 22 COIs and 5000 ZTDF resources
- **Achievable:** Pipeline tested, hub healthy, configs ready
- **Relevant:** Validates multi-instance architecture and SSOT propagation
- **Time-bound:** 2 hours

**Deployment Procedure:**

**1. Generate KeyFiles for Spokes (10 minutes)**
```bash
./scripts/generate-mongo-keyfile.sh instances/gbr/mongo-keyfile
./scripts/generate-mongo-keyfile.sh instances/deu/mongo-keyfile
```

**2. Deploy GBR Spoke (40 minutes)**
```bash
export USE_GCP_SECRETS=true
./dive spoke deploy GBR "United Kingdom"

# Verify
./dive spoke status GBR  # 9/9 healthy
./dive spoke verify GBR  # 12-point verification

# Check MongoDB replica set
docker exec dive-spoke-gbr-mongodb mongosh admin -u admin -p *** --quiet --eval "rs.status().members[0].stateStr"
# Expected: PRIMARY

# Check COI count
docker exec dive-spoke-gbr-backend sh -c 'node -e "..."'
# Expected: 22
```

**3. Deploy DEU Spoke (40 minutes)**
```bash
./dive spoke deploy DEU Germany
./dive spoke status DEU
./dive spoke verify DEU
# Same verification as GBR
```

**4. Test Federation Mesh (40 minutes)**

Test Matrix:
- Hub user → Hub resources ✅
- Hub user → FRA resources (federated search)
- Hub user → GBR resources
- Hub user → DEU resources
- FRA user → Hub resources (federation)
- GBR user → Hub resources
- DEU user → Hub resources
- Multi-hop: GBR → Hub → FRA

**Authorization Testing:**
```bash
# Test clearance-based authorization
# User: testuser-gbr-3 (CONFIDENTIAL clearance)
# Should access: CONFIDENTIAL and below
# Should deny: SECRET, TOP_SECRET

# Test COI-based authorization  
# User with NATO COI
# Should access: NATO, NATO-COSMIC resources
# Should deny: US-ONLY, EU-RESTRICTED

# Test releasability
# FRA user
# Should access: FRA-US bilateral resources
# Should deny: US-ONLY, CAN-US resources
```

**Audit Log Verification:**
```bash
# Check authorization logs in PostgreSQL
docker exec dive-hub-postgres psql -U postgres -d dive_v3_app -c "
  SELECT user_id, resource_id, decision, reason 
  FROM authorization_log 
  ORDER BY timestamp DESC 
  LIMIT 10;
"

# Check federation logs
docker exec dive-hub-postgres psql -U postgres -d dive_v3_app -c "
  SELECT source_realm, target_realm, user_id, success 
  FROM federation_log 
  ORDER BY timestamp DESC 
  LIMIT 10;
"
```

**Success Criteria:**
- [ ] 3 spokes deployed successfully
- [ ] All have MongoDB replica sets (PRIMARY)
- [ ] All have 22 COIs (SSOT)
- [ ] All have 5000 ZTDF resources
- [ ] Federation mesh working (any-to-any)
- [ ] Cross-instance authorization working
- [ ] Audit logs persisting to PostgreSQL
- [ ] No deployment errors

**Deliverables:**
- 3 deployed spokes (FRA, GBR, DEU)
- Federation validation report
- Performance metrics (authorization latency)
- Audit log samples

---

## Testing Requirements (All Phases)

### Clean Slate Deployment Test (Must Pass)

```bash
# 1. Complete destruction
export USE_GCP_SECRETS=true
./dive nuke --confirm --deep

# 2. Create network
docker network create dive-shared

# 3. Deploy Hub (target: < 5 minutes)
time ./dive deploy hub

# 4. Validate Hub
./dive hub status  # 9/9 healthy
docker exec dive-hub-mongodb mongosh admin -u admin -p *** --quiet --eval "rs.status().members[0].stateStr"  # PRIMARY
docker exec dive-hub-backend sh -c 'node -e "..."'  # 22 COIs
docker exec dive-hub-postgres psql -U postgres -d dive_v3_app -c "\dt %log"  # 3 tables

# 5. Deploy Spoke (target: < 10 minutes)
./scripts/generate-mongo-keyfile.sh instances/fra/mongo-keyfile
time ./dive spoke deploy FRA France

# 6. Validate Spoke
./dive spoke status FRA  # 9/9 healthy
# Same COI count as Hub (SSOT)
# 5000 ZTDF encrypted resources
# MongoDB replica set PRIMARY
# Federation configured

# All steps must succeed without manual intervention
```

### Resilience Testing

**Container Restart Test:**
```bash
# Restart all Hub containers
export USE_GCP_SECRETS=true
./dive hub down && ./dive hub up

# Verify data persisted
docker exec dive-hub-backend sh -c 'node -e "..."'  # 22 COIs still present
docker exec dive-hub-backend sh -c 'node -e "..."'  # 5000 resources still present
docker exec dive-hub-postgres psql -U postgres -d dive_v3_app -c "SELECT COUNT(*) FROM audit_log;"  # Audit logs persist
```

**MongoDB Replica Set Resilience:**
```bash
# Restart MongoDB
docker restart dive-hub-mongodb

# Wait for healthy
sleep 30

# Verify replica set recovers
docker exec dive-hub-mongodb mongosh admin -u admin -p *** --quiet --eval "rs.status().members[0].stateStr"
# Expected: PRIMARY

# Verify backend reconnects
docker logs dive-hub-backend | grep "MongoDB.*initialized"
# Expected: Stores reinitialize successfully
```

### Integration Testing

```bash
# Run comprehensive test suite (Phase 6)
cd backend
npm run test              # Unit tests
npm run test:integration  # Integration tests
npm run test:deployment   # Deployment validation
npm run test:e2e         # E2E tests including federation

# All must pass before production
```

---

## Long-Term Architecture Strategy

### Architecture Principles

**1. Single Source of Truth (SSOT)**
- One authoritative source for each type of data/configuration
- No duplicates, no alternatives, no fallback sources
- Fail fast if SSOT unavailable
- Derived artifacts regenerated from SSOT

**2. Fail Fast, Not Fail Silent**
- Errors stop deployment (don't fallback to broken state)
- No "soft fails" that hide issues
- Clear error messages pointing to solutions
- Configuration errors caught early

**3. TypeScript for Data, Terraform for Config, Bash for Orchestration**
- TypeScript: Database operations, API calls, complex logic
- Terraform: Keycloak configuration (realms, clients, flows)
- Bash: Orchestration only (DIVE CLI, calling tools, health checks)

**4. Defense in Depth**
- MFA enforcement (AAL1/AAL2/AAL3 by clearance)
- ZTDF encryption (mandatory, no plaintext)
- MongoDB replica set (keyFile + admin auth)
- Audit logging (dual persistence: file + database)
- Policy-based authorization (OPA with change stream sync)

**5. Observability First**
- Structured logging (Winston/Pino)
- Metrics (Prometheus via OTEL)
- Tracing (OpenTelemetry - pending deployment)
- Audit logs (PostgreSQL, 90-day retention)
- Health checks (all services)

### Technology Choices

**Database Strategy:**
- PostgreSQL: 18.1-alpine3.23 (latest LTS)
  - Keycloak schema
  - NextAuth tables
  - Audit tables (NEW)
  - Orchestration state
- MongoDB: 8.0.17 (replica set for change streams)
  - COI definitions (SSOT runtime storage)
  - Resources (ZTDF encrypted)
  - KAS registry
  - OPAL data (trusted issuers, federation matrix)
- Redis: 7-alpine
  - Session cache
  - Token blacklist (shared across instances)

**Security Strategy:**
- Keycloak: 26.5.2 (latest stable)
- X.509 mTLS: Enabled (request mode)
- MongoDB: KeyFile auth (production-grade)
- ZTDF: Mandatory encryption (100% enforcement)
- MFA: Clearance-based (CONFIDENTIAL+ requires OTP/WebAuthn)
- Secrets: GCP Secret Manager (dive25 project)

**Deployment Strategy:**
- DIVE CLI: ONLY orchestration tool (./dive commands)
- Terraform: ONLY configuration tool (Keycloak realms/clients)
- Docker Compose: Local development (docker-compose.hub.yml)
- Kubernetes: Production ready (Helm charts exist)

---

## Critical Constraints & Requirements

### MUST USE DIVE CLI ONLY

**CRITICAL:** Absolutely NO manual/direct docker commands.

**Correct:**
```bash
./dive deploy hub
./dive spoke deploy FRA France
./dive hub status
./dive spoke status FRA
./dive hub logs backend
./dive hub down
./dive hub up
./dive nuke --confirm --deep
```

**INCORRECT (DO NOT USE):**
```bash
docker compose up -d              # ❌ Use ./dive hub up
docker compose down               # ❌ Use ./dive hub down
docker exec dive-hub-backend ...  # ✅ OK for debugging (not deployment)
docker logs dive-hub-mongodb      # ✅ OK for debugging (not deployment)
docker ps                         # ❌ Use ./dive ps or ./dive hub status
```

**Why DIVE CLI is Required:**
- Orchestration database tracking (PostgreSQL state management)
- Lock management (prevents concurrent deployments)
- Secret loading (GCP Secret Manager integration)
- Health checks (comprehensive validation)
- Proper error handling
- Rollback capability
- Consistent behavior across environments

### Clean Slate Testing Authorized

**All data is DUMMY/FAKE:**
- Test users (testuser-usa-1, testuser-fra-3, etc.)
- Test resources (5000 generated documents)
- Dummy secrets (GCP Secret Manager for development)

**You are AUTHORIZED to:**
```bash
./dive nuke --confirm --deep    # Destroy everything
docker network create dive-shared  # Recreate network
export USE_GCP_SECRETS=true
./dive deploy hub               # Fresh deployment
./dive spoke deploy FRA France  # Fresh spoke
```

**Use for:**
- Testing deployment from scratch
- Validating SSOT pipeline
- Reproducing bugs
- Verifying replica set initialization
- Testing audit infrastructure

### No Simplifications or Workarounds

**Best Practice Approach ONLY:**

**❌ DO NOT:**
- Use --noauth for MongoDB (use keyFile authentication)
- Skip Terraform (manual Keycloak config)
- Skip proper error handling
- Use plaintext fallbacks
- Hardcode secrets
- Mix bash and TypeScript for same function
- Create duplicate code paths
- Use shortcuts to "make it work faster"

**✅ DO:**
- Use MongoDB keyFile authentication (production-grade)
- Use Terraform for ALL Keycloak configuration
- Implement proper error handling (fail fast)
- Use ZTDF encryption (mandatory, no fallback)
- Use GCP Secret Manager
- Use single SSOT for each function
- Follow documented patterns
- Implement best practices even if it takes longer

---

## Relevant Artifacts & Documentation

### Primary Documentation (Read These First)

**1. .cursor/PHASE_1-4_IMPLEMENTATION_COMPLETE.md**
- Complete summary of previous session
- What was implemented in Phases 1-4
- Verification results
- Current production state
- 824 lines of comprehensive detail

**2. terraform/modules/federated-instance/REFACTORING_IMPLEMENTATION.md**
- Step-by-step Terraform restructuring guide
- 219 lines
- Pre-implementation checklist
- Rollback procedures
- Target file structure

**3. terraform/REFACTORING_PLAN.md**
- Complete Terraform module redesign
- 286 lines of detailed planning
- New file structure
- DRY patterns
- Duplicate identification

**4. MODERNIZATION_PROGRESS.md**
- Historical modernization progress
- Phase 5-8 implementation guides
- Audit infrastructure design
- OpenTelemetry integration specs

**5. MODERNIZATION_COMPLETE.md**
- Previous modernization summary
- Keycloak 26.5.2 upgrade
- PostgreSQL 18.1 upgrade
- Version alignment

### Git Repository

**Branch:** main  
**Latest Commits:** 98afa1de (docs: comprehensive session summary for Phases 1-4)  
**Commits This Session:** 7  
**All Pushed:** ✅ Yes  

**Key Commits:**
```
98afa1de docs: comprehensive session summary for Phases 1-4
ab1a113f feat(phase4): add OpenTelemetry and Grafana dashboard configs
e29e3f56 feat(phase4-partial): create audit database infrastructure
f2819cd5 fix(phase3): add directConnection=true for single-node replica set
bc3c3d5d feat(phase3): implement production-grade MongoDB replica set with keyFile auth
b3d216b9 feat(phase2): add ZTDF pre-flight validation, enforce fail-fast
d1e8a992 feat(phase1): establish COI definition SSOT
```

### Rollback Points

**If Issues Discovered:**
```bash
# Rollback to before current session
git checkout 98afa1de~7  # Go back 7 commits

# Or rollback specific phase
git revert 98afa1de  # Revert docs
git revert ab1a113f  # Revert OTEL configs
git revert e29e3f56  # Revert audit tables
# etc.

# Restore Terraform state (if Phase 5 applied)
cd terraform/hub
terraform state push ../../backups/terraform-state-pre-phase5-YYYYMMDD-HHMMSS.json
```

---

## Specific Tasks for Next Session

### Task 1: Complete Phase 4 - Deploy OTEL and Configure Keycloak

**Objective:** Activate OpenTelemetry pipeline for metrics collection

**Steps:**

1. **Add OTEL Collector to docker-compose.hub.yml**
   ```yaml
   otel-collector:
     image: otel/opentelemetry-collector:latest
     container_name: ${COMPOSE_PROJECT_NAME}-otel-collector
     command: ["--config=/etc/otel-collector-config.yaml"]
     ports:
       - "127.0.0.1:4317:4317"  # OTLP gRPC
       - "127.0.0.1:4318:4318"  # OTLP HTTP
       - "127.0.0.1:8889:8889"  # Prometheus exporter (for Grafana)
     volumes:
       - ./monitoring/otel-collector-config.yaml:/etc/otel-collector-config.yaml:ro
     networks:
       - hub-internal
     healthcheck:
       test: ["CMD", "wget", "--spider", "-q", "http://localhost:13133/"]
       interval: 10s
       timeout: 5s
       retries: 5
     restart: unless-stopped
   ```

2. **Update Keycloak environment in docker-compose.hub.yml**
   ```yaml
   keycloak:
     environment:
       # ... existing vars ...
       KC_METRICS_ENABLED: "true"
       KC_LOG_LEVEL: info,org.keycloak.events:debug
       # OpenTelemetry integration (Keycloak 26.5.2)
       OTEL_TRACES_EXPORTER: otlp
       OTEL_METRICS_EXPORTER: otlp
       OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-collector:4317
   ```

3. **Restart Hub to apply changes**
   ```bash
   export USE_GCP_SECRETS=true
   ./dive hub down
   ./dive hub up
   ```

4. **Verify OTEL pipeline**
   ```bash
   # Check OTEL collector is running
   docker logs dive-hub-otel-collector
   
   # Check Keycloak is sending metrics
   curl http://localhost:8889/metrics | grep keycloak
   
   # Check Prometheus exporter
   curl http://localhost:8889/metrics | grep dive_v3
   ```

5. **Import Grafana Dashboard**
   - Access Grafana (if deployed)
   - Import monitoring/dashboards/audit-analytics.json
   - Configure PostgreSQL datasource (dive_v3_app database)
   - Verify panels show data

**Expected Outcome:**
- OTEL collector receiving Keycloak metrics
- Prometheus endpoint exposing metrics for Grafana
- Audit dashboard showing login/authz/federation data
- Phase 4 fully complete

---

### Task 2: Implement Phase 5 - Terraform Module Restructuring

**Objective:** Eliminate all Terraform technical debt by restructuring into clean single-purpose files

**Pre-Implementation Checklist:**
- [ ] Read REFACTORING_IMPLEMENTATION.md completely
- [ ] Backup Terraform state
- [ ] Backup terraform directory
- [ ] Review current main.tf structure
- [ ] Understand duplicate locations

**Implementation Steps:**

**Step 1: Backup (15 minutes)**
```bash
cd terraform/hub
terraform state pull > ../../backups/terraform-state-pre-phase5-$(date +%Y%m%d-%H%M%S).json
cd ../..
cp -r terraform terraform.backup-$(date +%Y%m%d-%H%M%S)
```

**Step 2: Create New Files (2 hours)**

In `terraform/modules/federated-instance/`:

**clients.tf** - Extract all clients from main.tf:
- Lines 158-338: broker_client
- Lines 340-371: backend_service_account client
- Lines 373-407: backend_service_account user
- Lines 409+: incoming_federation clients (for_each)

**protocol-mappers.tf** - Consolidate all mappers:
- Define reusable locals for mapper configs
- Broker client mappers (uniqueID, clearance, country, COI, ACR, AMR)
- Federation client mappers (use for_each for DRY)
- **DELETE DUPLICATES** from acr-amr-session-mappers.tf:
  - broker_amr_mapper (lines 123-145)
  - broker_amr_user_attribute (lines 147-168)

**authentication-flows.tf** - Absorb from realm-mfa:
- Classified-Access-Browser-Flow
- Simple Post-Broker OTP Flow
- Copy from realm-mfa/main.tf

**realm-settings.tf** - Extract from main.tf realm block:
- password_policy
- internationalization
- security_defenses
- events configuration (for audit)

**webauthn-policies.tf** - Copy from realm-mfa:
- webauthn policy (AAL2)
- webauthn_passwordless policy (AAL3)

**Step 3: Update main.tf (~150 lines)**

Keep ONLY:
```hcl
resource "keycloak_realm" "broker" {
  realm = var.realm_name
  enabled = true
  display_name = "DIVE V3 - ${var.instance_name}"
  # ... basic realm settings ...
  # All other resources moved to separate files
}
```

**Step 4: Validate (30 minutes)**
```bash
cd terraform/hub

terraform fmt -recursive
terraform validate
terraform plan -out=refactor.tfplan

# CRITICAL: Review plan for destroys
terraform show refactor.tfplan | grep "will be destroyed"
# Should output nothing - only moves/updates

# Verify no resource recreation
terraform show refactor.tfplan | grep "must be replaced"
# Should output nothing
```

**Step 5: Apply (30 minutes)**
```bash
terraform apply refactor.tfplan

# Verify services remain healthy
export USE_GCP_SECRETS=true
./dive hub status  # All services should be healthy
```

**Step 6: Cleanup (15 minutes)**
```bash
# Delete deprecated files
rm terraform/modules/federated-instance/acr-amr-session-mappers.tf
rm -rf terraform/modules/realm-mfa/

# Commit
git add terraform/
git commit -m "refactor(phase5): restructure federated-instance module into single-purpose files"
git push origin main
```

**Success Criteria:**
- [ ] main.tf is ~150 lines
- [ ] 7 new single-purpose files exist
- [ ] Zero duplicate resources
- [ ] terraform plan showed 0 destroys
- [ ] All services healthy after apply
- [ ] Deprecated files deleted

---

### Task 3: Implement Phase 6 - Deployment Validation Test Suite

**Objective:** Create comprehensive automated tests to validate deployments

**Test Suite Development:**

**1. Infrastructure Tests (backend/src/__tests__/deployment/infrastructure.test.ts)**
```typescript
import { MongoClient } from 'mongodb';
import { Pool } from 'pg';

describe('Infrastructure Validation', () => {
  let mongoClient: MongoClient;
  let pgPool: Pool;

  beforeAll(async () => {
    mongoClient = new MongoClient(process.env.MONGODB_URL!);
    await mongoClient.connect();
    
    pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await mongoClient.close();
    await pgPool.end();
  });

  it('should have MongoDB as replica set rs0', async () => {
    const admin = mongoClient.db().admin();
    const status = await admin.command({ replSetGetStatus: 1 });
    expect(status.set).toBe('rs0');
    expect(status.members[0].stateStr).toBe('PRIMARY');
  });

  it('should have change streams enabled', async () => {
    const db = mongoClient.db(process.env.MONGODB_DATABASE!);
    const collection = db.collection('test_change_stream');
    
    // This will throw if change streams not supported
    const changeStream = collection.watch();
    await new Promise(resolve => setTimeout(resolve, 100));
    await changeStream.close();
    // If we get here, change streams work
    expect(true).toBe(true);
  });

  it('should have all audit tables in PostgreSQL', async () => {
    const result = await pgPool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE tablename IN ('audit_log', 'authorization_log', 'federation_log')
      ORDER BY tablename
    `);
    
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0].tablename).toBe('audit_log');
    expect(result.rows[1].tablename).toBe('authorization_log');
    expect(result.rows[2].tablename).toBe('federation_log');
  });
});
```

**2. COI SSOT Tests (backend/src/__tests__/deployment/coi-validation.test.ts)**
```typescript
describe('COI SSOT Validation', () => {
  it('should have exactly 22 COI definitions in MongoDB', async () => {
    const count = await db.collection('coi_definitions').countDocuments();
    expect(count).toBe(22);
  });

  it('should have all required COIs', async () => {
    const cois = await db.collection('coi_definitions').find({}).toArray();
    const coiIds = cois.map(c => c.coiId);
    
    const required = [
      'FVEY', 'NATO', 'NATO-COSMIC', 'US-ONLY',
      'CAN-US', 'GBR-US', 'FRA-US', 'DEU-US',
      'AUKUS', 'QUAD', 'EU-RESTRICTED',
      'NORTHCOM', 'EUCOM', 'PACOM', 'CENTCOM', 'SOCOM',
      'Alpha', 'Beta', 'Gamma',
      'TEST-COI', 'NEW-COI', 'PACIFIC-ALLIANCE'
    ];
    
    expect(coiIds.sort()).toEqual(required.sort());
  });
});
```

**3-5. Create remaining test suites** following specifications in Phase 6 section above.

**Execution:**
```bash
cd backend

# Add test scripts to package.json
npm run test:deployment

# Expected output:
# PASS  src/__tests__/deployment/infrastructure.test.ts
# PASS  src/__tests__/deployment/coi-validation.test.ts
# PASS  src/__tests__/deployment/encryption-validation.test.ts
# PASS  src/__tests__/deployment/federation-validation.test.ts
# PASS  src/__tests__/deployment/audit-validation.test.ts
#
# Test Suites: 5 passed, 5 total
# Tests:       25+ passed, 25+ total
```

**Success Criteria:**
- [ ] 5 test suites created
- [ ] All tests passing
- [ ] Tests catch misconfigurations
- [ ] Run in < 5 minutes
- [ ] Integrated into CI/CD

---

### Task 4: Implement Phase 7 - Deploy and Validate Federation Mesh

**Objective:** Deploy GBR and DEU spokes, validate complete federation architecture

**Pre-Deployment:**
```bash
# Generate MongoDB keyFiles for spokes
./scripts/generate-mongo-keyfile.sh instances/gbr/mongo-keyfile
./scripts/generate-mongo-keyfile.sh instances/deu/mongo-keyfile

# Ensure GCP secrets exist
./dive secrets ensure gbr
./dive secrets ensure deu
```

**GBR Deployment:**
```bash
export USE_GCP_SECRETS=true
./dive spoke deploy GBR "United Kingdom"

# Should complete in < 10 minutes with:
# - 9 services healthy
# - MongoDB replica set PRIMARY
# - 22 COIs (from SSOT)
# - 5000 ZTDF encrypted resources
# - Federation to Hub configured
```

**DEU Deployment:**
```bash
./dive spoke deploy DEU Germany
# Same validation as GBR
```

**Federation Mesh Testing:**
```bash
# Test federation links
./dive federation verify FRA
./dive federation verify GBR  
./dive federation verify DEU

# Test cross-instance search
# (via frontend or API)

# Test authorization across instances
# (FRA user accessing Hub resources, etc.)
```

**Success Criteria:**
- [ ] 3 spokes deployed (FRA, GBR, DEU)
- [ ] All MongoDB replica sets PRIMARY
- [ ] All have identical COI count (22)
- [ ] Federation mesh working (any-to-any)
- [ ] Audit logs aggregating at hub

---

## Success Metrics (Overall)

### Technical Excellence

**Completed ✅:**
- ✅ Single COI source (22 COIs, zero divergence)
- ✅ 100% ZTDF encryption (zero plaintext, fail-fast)
- ✅ MongoDB replica set (keyFile auth, PRIMARY)
- ✅ Change streams working (OPAL CDC active)
- ✅ seedBaselineCOIs() deleted
- ✅ Audit tables created (PostgreSQL)
- ✅ Audit service enhanced (dual persistence)
- ✅ Hub CLI fixed (secret loading)

**Pending ⏳:**
- ⏳ OTEL collector deployed
- ⏳ Grafana dashboards active
- ⏳ Terraform restructured (main.tf ~150 lines)
- ⏳ Deployment tests passing
- ⏳ 3 spokes deployed (FRA, GBR, DEU)
- ⏳ Federation mesh validated

### Operational Excellence

**Completed ✅:**
- ✅ Clean slate deployment succeeds
- ✅ All health checks passing (9/9)
- ✅ No errors in startup logs
- ✅ Secrets properly loaded
- ✅ 7 commits pushed to GitHub

**Pending ⏳:**
- ⏳ Deployment tests automated
- ⏳ Spoke deployment < 10 minutes
- ⏳ Federation mesh tested
- ⏳ Performance metrics collected

### Compliance

**Completed ✅:**
- ✅ ACP-240: 100% ZTDF encryption enforced
- ✅ Audit: 90-day retention function created
- ✅ SSOT: Zero divergence (COI definitions)
- ✅ Fail-fast: No silent failures

**Pending ⏳:**
- ⏳ Audit: Events flowing to OTEL
- ⏳ Audit: Grafana dashboards active
- ⏳ Testing: Comprehensive validation suite

### Code Quality

**Completed ✅:**
- ✅ No bash scripts for data operations (TypeScript SSOT)
- ✅ No duplicate COI sources
- ✅ Comprehensive documentation
- ✅ Proper error handling (fail fast)
- ✅ Production-grade implementations (no shortcuts)

**Pending ⏳:**
- ⏳ Terraform: Single-purpose files
- ⏳ Terraform: Zero duplicates
- ⏳ Tests: Automated validation
- ⏳ Tests: 100% coverage

---

## Commands Reference (DIVE CLI - USE THESE ONLY)

### Hub Management
```bash
./dive deploy hub              # Full deployment (10 steps)
./dive hub up                  # Start services (loads secrets automatically)
./dive hub down                # Stop services (loads secrets for interpolation)
./dive hub status              # Check status (9 services)
./dive hub logs [service]      # View logs
./dive hub seed [count]        # Seed database (default 5000)
./dive hub verify              # 10-point verification
```

### Spoke Management
```bash
./dive spoke deploy CODE NAME  # Full deployment (pipeline with MongoDB replica set)
./dive spoke up CODE           # Start spoke
./dive spoke down CODE         # Stop spoke
./dive spoke status CODE       # Check status
./dive spoke logs CODE [svc]   # View logs
./dive spoke verify CODE       # 12-point verification
```

### MongoDB Management
```bash
# Generate keyFile for instance
./scripts/generate-mongo-keyfile.sh instances/CODE/mongo-keyfile

# Initialize replica set (post-startup)
export USE_GCP_SECRETS=true
source scripts/dive-modules/common.sh
load_secrets
bash scripts/init-mongo-replica-set-post-start.sh dive-hub-mongodb admin "$MONGO_PASSWORD"

# Check replica set status
docker exec dive-hub-mongodb mongosh admin -u admin -p *** --quiet --eval "rs.status().members[0].stateStr"
# Expected: PRIMARY

# Test change streams
docker logs dive-hub-backend | grep "change stream"
# Expected: "OPAL data change stream started"
```

### Testing Commands
```bash
# Run deployment validation tests (after Phase 6)
cd backend
npm run test:deployment
npm run test:deployment infrastructure
npm run test:deployment coi
npm run test:deployment encryption

# Check audit tables
docker exec dive-hub-postgres psql -U postgres -d dive_v3_app -c "
  SELECT tablename, pg_size_pretty(pg_total_relation_size('public.'||tablename))
  FROM pg_tables 
  WHERE tablename LIKE '%log';
"
```

### Terraform
```bash
./dive terraform plan          # Terraform plan
./dive terraform apply         # Terraform apply
./dive terraform output        # View outputs
```

### Utilities
```bash
./dive nuke [--confirm] [--deep]  # Destroy resources
./dive secrets ensure CODE        # Ensure GCP secrets exist
./dive federation verify CODE     # Verify federation
./dive ps                         # List containers
```

---

## Next Session Instructions

**Your Mission:**
1. Complete Phase 4 (OTEL deployment, Keycloak config, Grafana import)
2. Execute Phase 5 (Terraform module restructuring)
3. Implement Phase 6 (Deployment validation test suite)
4. Execute Phase 7 (Deploy GBR and DEU spokes, test federation mesh)
5. Run comprehensive testing (clean slate → deploy → validate)
6. Document everything
7. Push all commits to GitHub

**Critical Constraints:**
- ✅ Use `./dive` CLI ONLY (no manual docker commands)
- ✅ Best practice approach (no shortcuts - keyFile auth, fail-fast, etc.)
- ✅ Test after each phase (run validation tests)
- ✅ Commit after each phase (git history is rollback plan)
- ✅ Can nuke/clean resources (dummy data, authorized to test clean slate)
- ✅ Eliminate ALL remaining technical debt
- ✅ NO backwards compatibility (clean slate approach)
- ✅ Full testing suite required before done

**Start By:**
1. Reading .cursor/PHASE_1-4_IMPLEMENTATION_COMPLETE.md (previous session summary)
2. Verifying hub is healthy: `./dive hub status`
3. Checking MongoDB replica set: `docker exec dive-hub-mongodb mongosh admin -u admin -p *** --quiet --eval "rs.status().members[0].stateStr"`
4. Completing Phase 4 (OTEL + Grafana - ~2 hours)
5. Executing Phase 5 (Terraform refactoring - 4-6 hours)
6. Implementing Phase 6 (Test suite - 8 hours)
7. Deploying Phase 7 (Spokes - 2 hours)

**Expected Session Duration:** 14-18 hours (can span multiple sessions)

**Remember:** You have full authorization to nuke and redeploy as needed for testing. All data is dummy/fake. Focus on getting the architecture perfect with zero technical debt and comprehensive testing.

---

## Quick Start Commands

```bash
# Verify current state
export USE_GCP_SECRETS=true
./dive hub status

# Check MongoDB replica set
docker exec dive-hub-mongodb mongosh admin -u admin -p $(gcloud secrets versions access latest --secret=dive-v3-mongodb-usa --project=dive25) --quiet --eval "rs.status().members[0].stateStr"
# Expected: PRIMARY

# Check COI count
docker exec dive-hub-backend sh -c 'node -e "const { MongoClient } = require(\"mongodb\"); const client = new MongoClient(process.env.MONGODB_URL); client.connect().then(() => client.db(process.env.MONGODB_DATABASE).collection(\"coi_definitions\").countDocuments()).then(count => { console.log(count); client.close(); });"'
# Expected: 22

# Check audit tables
docker exec dive-hub-postgres psql -U postgres -d dive_v3_app -c "SELECT tablename FROM pg_tables WHERE tablename LIKE '%log';"
# Expected: 3 tables

# Check change streams
docker logs dive-hub-backend | grep "change stream"
# Expected: "OPAL data change stream started"

# Clean slate test (if needed)
./dive nuke --confirm --deep
docker network create dive-shared
export USE_GCP_SECRETS=true
./dive deploy hub
# Should complete in < 5 minutes with all services healthy
```

---

## Known Issues & Workarounds

### Issue 1: dive-shared Network Not Auto-Created

**Symptom:** `network dive-shared declared as external, but could not be found`

**Workaround:**
```bash
docker network create dive-shared
```

**Permanent Fix (Recommended):**
Update `scripts/dive-modules/deployment/hub.sh`:
```bash
hub_deploy() {
    # ... existing code ...
    
    # Ensure dive-shared network exists
    if ! docker network inspect dive-shared >/dev/null 2>&1; then
        docker network create dive-shared
        log_success "Created dive-shared network"
    fi
    
    # ... continue with deployment ...
}
```

### Issue 2: Frontend Not Starting

**Symptom:** Frontend shows as "not_found" in status

**Explanation:** Frontend was not restarted after backend fixes in this session

**Solution:**
```bash
export USE_GCP_SECRETS=true
./dive hub down
./dive hub up
# All services including frontend should start
```

---

## Git History Reference

**Session Commits (7 total):**
```
98afa1de docs: comprehensive session summary for Phases 1-4
ab1a113f feat(phase4): add OpenTelemetry and Grafana dashboard configs
e29e3f56 feat(phase4-partial): create audit database infrastructure
f2819cd5 fix(phase3): add directConnection=true for single-node replica set
bc3c3d5d feat(phase3): implement production-grade MongoDB replica set with keyFile auth
b3d216b9 feat(phase2): add ZTDF pre-flight validation, enforce fail-fast
d1e8a992 feat(phase1): establish COI definition SSOT
```

**Branch:** main  
**Pushed:** ✅ All commits pushed to origin/main  
**Clean Working Tree:** ✅ Yes

---

## Environment Variables Reference

### Hub Required Environment Variables

**In docker-compose.hub.yml (loaded via load_secrets):**
```bash
MONGO_PASSWORD              # MongoDB root password (GCP: dive-v3-mongodb-usa)
POSTGRES_PASSWORD           # PostgreSQL password (GCP: dive-v3-postgres-usa)
KC_ADMIN_PASSWORD           # Keycloak admin password (GCP: dive-v3-keycloak-usa)
KEYCLOAK_CLIENT_SECRET      # Client secret (GCP: dive-v3-keycloak-client-secret)
AUTH_SECRET                 # NextAuth secret (GCP: dive-v3-auth-secret-usa)
REDIS_PASSWORD_USA          # Redis password (GCP: dive-v3-redis-usa)
REDIS_PASSWORD_BLACKLIST    # Shared blacklist (GCP: dive-v3-redis-blacklist)
OPAL_AUTH_MASTER_TOKEN      # OPAL master token (GCP: dive-v3-opal-master-token)
```

**MongoDB Connection String Components:**
```bash
MONGODB_URL=mongodb://admin:${MONGO_PASSWORD}@mongodb:27017/?authSource=admin&directConnection=true
#                                                             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#                                                             CRITICAL for replica sets!

MONGODB_DATABASE=dive-v3-hub
```

**PostgreSQL Connection String:**
```bash
DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/dive_v3_app
```

---

## Deployment Workflow (Reference)

### Hub Deployment (10 Steps)

```
./dive deploy hub
  ↓
1. Validate prerequisites (docker, terraform, certs)
2. Load secrets (GCP Secret Manager)
3. Generate SSL certificates (if expired)
4. Stop existing containers
5. Remove old volumes (clean deploy)
6. Start infrastructure services
7. Wait for services healthy
8. Initialize MongoDB replica set (post-startup)
9. Apply Terraform configuration
10. Seed database (initialize-coi-keys.ts → setup-demo-users.ts → seed-instance-resources.ts)
11. Verify deployment
```

### Spoke Deployment (6 Phases)

```
./dive spoke deploy CODE "Name"
  ↓
scripts/dive-modules/spoke/pipeline/spoke-pipeline.sh
  ↓
Phase 1: Preflight (validation, secrets, network)
Phase 2: Initialization (databases, directories)
Phase 3: Deployment (docker-compose up)
Phase 4: Configuration (Keycloak, NextAuth, federation registration)
Phase 5: Seeding (COI SSOT → users → resources)
  ↓
  Step 0: Initialize COI Keys (22 COIs from SSOT)
  Step 1: Initialize MongoDB replica set
  Step 2: Setup demo users
  Step 3: Seed ZTDF resources (with pre-flight validation)
Phase 6: Verification (12-point validation)
```

---

## MongoDB Replica Set Best Practices (Critical Reference)

### KeyFile Generation

```bash
# Generate secure 1008-byte keyFile
./scripts/generate-mongo-keyfile.sh instances/hub/mongo-keyfile

# Output:
# - File: instances/hub/mongo-keyfile
# - Size: 1008 bytes (base64)
# - Permissions: 400 (read-only by owner)
# - MUST be gitignored
```

### Docker Compose Configuration

```yaml
mongodb:
  image: mongo:8.0.17
  container_name: ${COMPOSE_PROJECT_NAME}-mongodb
  restart: unless-stopped
  # Copy keyFile to writable location with proper permissions
  entrypoint: >
    bash -c "
      echo '🔐 Preparing MongoDB replica set with keyFile authentication'
      cp /data/keyfile/mongo-keyfile /tmp/mongo-keyfile
      chmod 600 /tmp/mongo-keyfile
      chown 999:999 /tmp/mongo-keyfile
      echo '✅ KeyFile configured at /tmp/mongo-keyfile'
      exec /usr/local/bin/docker-entrypoint.sh mongod --replSet rs0 --keyFile /tmp/mongo-keyfile --bind_ip_all
    "
  environment:
    MONGO_INITDB_ROOT_USERNAME: admin
    MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
  volumes:
    - mongodb_data:/data/db
    - ./instances/hub/mongo-keyfile:/data/keyfile/mongo-keyfile:ro
    - ./scripts/mongo-init-replicaset.sh:/docker-entrypoint-initdb.d/01-init-replicaset.sh:ro
  healthcheck:
    test: mongosh admin -u admin -p ${MONGO_PASSWORD} --quiet --eval "rs.status().members[0].stateStr" | grep -q PRIMARY
    interval: 10s
    timeout: 5s
    retries: 15  # Extended for initialization time
    start_period: 40s  # Allow time for replica set init
```

### Post-Startup Initialization

```bash
# Integrated into hub deployment (Phase 4a)
# After services healthy:
bash scripts/init-mongo-replica-set-post-start.sh dive-hub-mongodb admin "$MONGO_PASSWORD"

# Script runs rs.initiate() with admin credentials
# Waits for PRIMARY status
# Returns success/failure
```

### Connection String (CRITICAL)

```bash
# Backend environment variable
MONGODB_URL=mongodb://admin:${PASSWORD}@mongodb:27017/?authSource=admin&directConnection=true
#                                                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#                                                       Without this, driver hangs!

# Why directConnection=true:
# - Single-node replica sets need this parameter
# - MongoDB driver attempts replica set discovery without it
# - Discovery fails in Docker networking (tries localhost:27017)
# - Connections timeout after 30 seconds
# - With directConnection=true, driver connects directly without discovery
```

### Verification Commands

```bash
# Check replica set status
docker exec dive-hub-mongodb mongosh admin -u admin -p *** --quiet --eval "rs.status().members[0].stateStr"
# Expected: PRIMARY

# Check replica set details
docker exec dive-hub-mongodb mongosh admin -u admin -p *** --quiet --eval "rs.status()"

# Test connection from backend
docker exec dive-hub-backend sh -c 'node -e "const { MongoClient } = require(\"mongodb\"); const client = new MongoClient(process.env.MONGODB_URL); client.connect().then(() => { console.log(\"✅ Connected\"); client.close(); });"'

# Test change streams
docker exec dive-hub-backend sh -c 'node -e "const { MongoClient } = require(\"mongodb\"); const client = new MongoClient(process.env.MONGODB_URL); client.connect().then(() => client.db(process.env.MONGODB_DATABASE).collection(\"test\").watch()).then(stream => { console.log(\"✅ Change streams working\"); stream.close(); client.close(); });"'
```

---

## Performance Targets

**Deployment Speed:**
- Hub: < 5 minutes (including Terraform apply)
- Spoke: < 10 minutes (including seeding)
- Clean slate to fully operational: < 15 minutes total

**Service Health:**
- All containers healthy within 90 seconds of startup
- MongoDB replica set PRIMARY within 30 seconds
- Backend connects to MongoDB within 10 seconds

**Authorization Performance:**
- p95 authorization latency < 200ms
- OPA decision cache enabled (60s TTL)
- PostgreSQL audit persistence < 5ms overhead

**Resource Seeding:**
- 5000 ZTDF documents in < 2 seconds
- Pre-flight validation < 1 second
- Checkpoint/resume for large batches

---

## Current System Status Summary

**Hub Deployment:** ✅ Fully operational  
**Services:** 9/9 healthy  
**MongoDB:** Replica set 'rs0' PRIMARY, change streams active  
**COIs:** 22 in MongoDB, OPAL, and script (SSOT)  
**Audit:** Tables created, PostgreSQL persistence integrated  
**Secrets:** GCP integration working  
**Git:** Clean, all commits pushed

**Ready for:** Phases 5-7 implementation (Terraform refactoring, testing, spoke deployments)

**Estimated Remaining Time:**
- Phase 4 completion: 2-3 hours
- Phase 5: 4-6 hours  
- Phase 6: 8 hours
- Phase 7: 2 hours
- **Total:** 16-19 hours

---

## Final Checklist for Next Session

### Before Starting

- [ ] Read .cursor/PHASE_1-4_IMPLEMENTATION_COMPLETE.md
- [ ] Read this document completely
- [ ] Verify hub is healthy: `./dive hub status`
- [ ] Check git status: `git status` (should be clean)
- [ ] Load secrets: `export USE_GCP_SECRETS=true`
- [ ] Verify MongoDB PRIMARY: `docker exec dive-hub-mongodb mongosh admin -u admin -p *** --quiet --eval "rs.status().members[0].stateStr"`

### After Each Phase

- [ ] All code changes tested
- [ ] All tests passing (when applicable)
- [ ] Documentation updated
- [ ] Git commit created (descriptive message)
- [ ] Git pushed to origin/main
- [ ] Clean slate deployment verified (nuke → deploy → validate)
- [ ] Health checks passing
- [ ] No errors in logs

### Final Session Validation

- [ ] All 7 phases complete
- [ ] All services healthy across all instances
- [ ] All tests passing (25+ deployment tests)
- [ ] Federation mesh validated (4 instances)
- [ ] Terraform restructured (main.tf ~150 lines)
- [ ] OTEL collector deployed and working
- [ ] Grafana dashboards showing audit data
- [ ] Clean slate deployment < 15 minutes
- [ ] Comprehensive documentation complete
- [ ] All commits pushed to GitHub

---

**Current System Status:** ✅ Hub healthy, MongoDB replica set PRIMARY, change streams active, audit infrastructure ready, 3 phases complete

**Next Session Goal:** Complete Phases 5-7 for production-ready zero-debt architecture with comprehensive testing and full federation mesh validation
