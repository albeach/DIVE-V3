# DIVE V3 - Deployment Architecture Audit & Integration Assessment

**Date:** November 30, 2025  
**Auditor:** Claude (AI)  
**Registry Version:** 3.0.0

---

## Executive Summary

### Current Maturity Score: **7/10**

The DIVE V3 deployment infrastructure demonstrates solid engineering fundamentals with comprehensive scripts, SSOT pattern adoption, and proper secrets management. However, gaps exist in orchestration automation, consistency across compose files, and deployment verification integration.

### Top 3 Risks

1. **Manual startup orchestration** - Services start without proper dependency gates, leading to race conditions
2. **Healthcheck inconsistency** - Different healthcheck implementations across compose files cause unreliable readiness detection
3. **Terraform-Docker coupling** - No automated trigger from "Keycloak healthy" to "Terraform apply"

### Top 3 Quick Wins

1. **Standardize healthchecks** - Create a unified healthcheck pattern across all compose files (2h)
2. **Add startup script integration** - Wire `verify-deployment.sh` into `deploy-dive-instance.sh` (1h)
3. **Generate compose files from SSOT** - Use existing `generate-docker-compose.sh` for all instances (2h)

### Recommended Priority

**Phase 1 (This Week):** Standardize healthchecks + integrate verification  
**Phase 2 (Next Week):** Full SSOT-driven generation + orchestration  
**Phase 3 (Future):** Auto-federation + partner onboarding automation

---

## Phase 1: Asset Inventory

### 1.1 Deployment Scripts

| Script | Purpose | Status | SSOT Integration | Notes |
|--------|---------|--------|------------------|-------|
| `deploy-dive-instance.sh` | **Primary** unified instance deployment | ✅ Active | ⚠️ Partial | Most comprehensive, 1527 lines |
| `deploy-stack.sh` | Full stack rebuild | ⚠️ Legacy | ❌ None | Older, less sophisticated |
| `deploy-instance.sh` | Multi-instance deployment | ⚠️ Duplicate | ❌ None | Overlaps with `deploy-dive-instance.sh` |
| `start.sh` | Safe startup with validation | ✅ Active | ❌ None | Good but basic |
| `health-check.sh` | Service health verification | ✅ Active | ❌ None | Basic checks |
| `smoke-test.sh` | Quick functionality test | ⚠️ Unknown | ❌ None | Needs review |

#### Script Overlap Analysis

```
deploy-dive-instance.sh (1527 lines)
├── Generates docker-compose files inline
├── Generates tfvars inline
├── Handles tunnels
├── Handles Terraform
├── Pre-flight checks
├── Secrets validation
├── Post-deployment verification
└── Rollback capability

deploy-instance.sh (792 lines)
├── Similar functionality
├── DIFFERENT port assignments
├── Missing rollback
└── Less sophisticated

deploy-stack.sh (375 lines)
├── Builds containers
├── Installs npm dependencies
└── Basic verification only
```

**Recommendation:** Deprecate `deploy-instance.sh` and `deploy-stack.sh` in favor of `deploy-dive-instance.sh`.

### 1.2 Federation/SSOT Scripts

| Script | Purpose | SSOT Reads | SSOT Completeness |
|--------|---------|------------|-------------------|
| `generate-all-configs.sh` | Generate tfvars + frontend .env | ✅ Yes | 90% |
| `generate-tfvars.sh` | Terraform variable files | ✅ Yes | 95% |
| `generate-tunnel-configs.sh` | Cloudflare configs | ✅ Yes | 95% |
| `generate-docker-compose.sh` | Docker compose files | ✅ Yes | ⚠️ 70% (not actively used) |
| `validate-config.sh` | Schema validation | ✅ Yes | 100% |
| `validate-federation.sh` | Federation health | ✅ Yes | 85% |

**Key Finding:** `generate-docker-compose.sh` EXISTS but is NOT being used. Current compose files are hand-maintained with drift.

### 1.3 Infrastructure as Code (Terraform)

#### Current State

```
terraform/
├── instances/
│   ├── instance.tf        # Main module caller
│   ├── provider.tf        # Keycloak provider config
│   ├── variables.tf       # Variable definitions
│   ├── usa.tfvars         # USA configuration
│   ├── fra.tfvars         # FRA configuration
│   ├── gbr.tfvars         # GBR configuration
│   └── deu.tfvars         # DEU configuration
└── modules/
    ├── federated-instance/  # Realm, client, mappers, federation clients
    ├── realm-mfa/           # MFA flows, WebAuthn policies
    ├── realm-mfa-stepup/    # Step-up authentication
    ├── shared-mappers/      # Reusable protocol mappers
    └── secrets-manager/     # GCP secrets integration
```

#### Terraform Manages

- ✅ Keycloak realms (`dive-v3-broker`)
- ✅ OIDC clients (main app client + federation clients)
- ✅ Protocol mappers (clearance, countryOfAffiliation, uniqueID, acpCOI)
- ✅ Test users with clearance attributes
- ✅ MFA flows (clearance-based AAL2/AAL3)
- ✅ WebAuthn policies (standard + passwordless)
- ✅ Incoming federation clients per partner
- ⚠️ Outgoing IdP brokers (via separate vault module)

#### NOT Managed by Terraform (Should Be)

- ❌ Docker compose file generation
- ❌ Cloudflare tunnel creation
- ❌ DNS record management
- ❌ Certificate generation

#### State Management

- Local state files in `terraform.tfstate.d/<instance>/`
- ⚠️ No remote backend (S3/GCS)
- ⚠️ No state locking
- ✅ Workspaces used per instance

### 1.4 Docker Compose Files

| File | Instance | Generated? | Healthchecks | Secrets Pattern |
|------|----------|------------|--------------|-----------------|
| `docker-compose.yml` | USA | ❌ Hand-maintained | ✅ Complete | `${VAR:?error}` |
| `docker-compose.fra.yml` | FRA | ❌ Hand-maintained | ✅ Complete | `${VAR:?error}` |
| `docker-compose.gbr.yml` | GBR | ❌ Hand-maintained | ⚠️ Inconsistent | `${VAR:?error}` |
| `docker-compose.deu.yml` | DEU | ❌ Hand-maintained | ✅ Complete | `${VAR:?error}` |

#### Healthcheck Inconsistencies Found

```yaml
# USA (docker-compose.yml) - Keycloak
test: ["CMD-SHELL", "curl -f http://localhost:8080/realms/master || exit 1"]

# FRA (docker-compose.fra.yml) - Keycloak  
test: ["CMD-SHELL", "curl -f http://localhost:8080/realms/master || exit 1"]

# DEU (docker-compose.deu.yml) - Keycloak
test: ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"]

# Backend varies:
# USA: test: ["CMD", "curl", "-kfs", "https://localhost:4000/health"]
# FRA: test: ["CMD", "curl", "-kfs", "https://localhost:4000/health"]

# KAS varies:
# USA: test: ["CMD", "curl", "-kfs", "https://localhost:8080/health"]
# FRA: test: ["CMD", "curl", "-kfs", "https://localhost:8080/health"]
# DEU: test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8080/health"]
```

### 1.5 Configuration SSOT

**File:** `config/federation-registry.json` (v3.0.0)

#### What's IN the Registry

- ✅ Instance definitions (USA, FRA, GBR, DEU)
- ✅ Service port mappings (internal + external)
- ✅ Hostnames (Cloudflare tunnel URLs)
- ✅ Cloudflare tunnel IDs and credentials paths
- ✅ GCP secret names
- ✅ Keycloak database config
- ✅ MongoDB database names
- ✅ Test user configuration
- ✅ Federation matrix (who federates with whom)
- ✅ Attribute mapping spec

#### What's MISSING from Registry

- ❌ Healthcheck configurations (endpoint, interval, timeout)
- ❌ Container restart policies
- ❌ Volume definitions
- ❌ Resource limits (CPU, memory)
- ❌ Log configuration
- ❌ Development vs. production mode toggle

---

## Phase 2: Gap Analysis

### 2.1 Deployment Lifecycle Gaps

| Current State | Ideal State | Gap | Existing Solution |
|--------------|-------------|-----|-------------------|
| Manual: `source secrets.sh` | Auto: injected at runtime | ⚠️ Medium | `sync-gcp-secrets.sh` exists |
| Manual: `docker compose up` | Auto: orchestrated startup | 🔴 High | `start.sh` partial |
| Manual: wait for healthy | Auto: dependency ordering | ⚠️ Medium | `depends_on` conditions |
| Manual: terraform apply | Auto: triggered on ready | 🔴 High | **None** |
| Manual: verify | Auto: health gate | ⚠️ Medium | `verify-deployment.sh` exists |
| Manual: federate | Auto: discovery | ⚠️ Medium | `--federate` flag exists |

### 2.2 Healthcheck Accuracy Assessment

| Service | Current Check | Accurate? | Recommended |
|---------|--------------|-----------|-------------|
| Postgres | `pg_isready -U keycloak` | ✅ Yes | Keep |
| MongoDB | `mongosh --eval ping` | ✅ Yes | Keep |
| Redis | `redis-cli ping` | ✅ Yes | Keep |
| Keycloak | `/realms/master` or `/health` | ⚠️ Inconsistent | Use `/health/ready` |
| Backend | `/health` | ✅ Yes | Keep |
| Frontend | `/` | ⚠️ Weak | Use `/api/auth/health` |
| OPA | `/opa version` or `/health` | ⚠️ Inconsistent | Use `/health` |
| KAS | `/health` | ✅ Yes | Keep |
| Cloudflared | `cloudflared tunnel info` | ⚠️ Weak | Use metrics endpoint |

### 2.3 Resilience Patterns Assessment

| Pattern | USA | FRA | GBR | DEU | Status |
|---------|-----|-----|-----|-----|--------|
| Restart policies | ✅ cloudflared | ✅ cloudflared | ✅ cloudflared | ✅ cloudflared | Partial (only tunnels) |
| Depends_on conditions | ⚠️ Mixed | ⚠️ Mixed | ⚠️ Mixed | ⚠️ Mixed | Inconsistent |
| Graceful shutdown | ❌ None | ❌ None | ❌ None | ❌ None | **Gap** |
| State persistence | ✅ Named volumes | ✅ Named volumes | ✅ Named volumes | ✅ Named volumes | Good |
| Recovery from partial | ⚠️ Manual | ⚠️ Manual | ⚠️ Manual | ⚠️ Manual | **Gap** |

### 2.4 Scalability Patterns Assessment

| Pattern | Status | Notes |
|---------|--------|-------|
| Instance-agnostic config | ⚠️ Partial | Port offsets work, but compose files are hardcoded |
| Port collision avoidance | ✅ Yes | `PORT_OFFSETS` array in `deploy-dive-instance.sh` |
| Network isolation | ✅ Yes | Each instance has `dive-{code}-network` |
| Shared service discovery | ✅ Yes | `blacklist-redis` on shared network |

---

## Phase 3: Integration Opportunities

### 3.1 Quick Wins (< 2 hours each)

#### QW-1: Standardize Healthchecks

**What exists:** Different healthcheck patterns across compose files
**What's missing:** Consistency
**Integration approach:**
```yaml
# Standard healthcheck template (add to registry)
healthchecks:
  keycloak:
    test: ["CMD-SHELL", "curl -f http://localhost:8080/health/ready || exit 1"]
    interval: 30s
    timeout: 10s
    retries: 5
    start_period: 90s
```
**Effort:** 2h
**Success criteria:** All 4 compose files use identical healthcheck patterns

#### QW-2: Wire Verification into Deployment

**What exists:** `verify-deployment.sh` (339 lines, comprehensive)
**What's missing:** Integration with main deployment script
**Integration approach:**
```bash
# In deploy-dive-instance.sh, VERIFY=true already exists
# Just ensure verify-deployment.sh is called and results handled
```
**Effort:** 1h
**Success criteria:** Failed verification triggers rollback

#### QW-3: Add Restart Policies to All Services

**What exists:** `restart: unless-stopped` on cloudflared only
**What's missing:** Restart policies on app services
**Integration approach:**
```yaml
restart: unless-stopped
stop_grace_period: 30s
```
**Effort:** 1h
**Success criteria:** All services restart automatically

### 3.2 Medium Effort (2-8 hours)

#### ME-1: Use generate-docker-compose.sh as SSOT Generator

**What exists:** `scripts/federation/generate-docker-compose.sh` (exists but unused)
**What's missing:** Active use, healthcheck templates in registry
**Integration approach:**
1. Add healthcheck configs to `federation-registry.json`
2. Update generator to use registry healthchecks
3. Replace hand-maintained compose files with generated ones
**Effort:** 4h
**Success criteria:** `generate-all-configs.sh` produces working compose files

#### ME-2: Terraform Auto-Trigger

**What exists:** Manual `terraform apply` after Keycloak healthy
**What's missing:** Automated trigger
**Integration approach:**
```bash
# In deploy-dive-instance.sh
wait_for_keycloak_ready() {
    # Already exists - just tighten the health check
    while ! curl -sf "https://localhost:${KC_PORT}/health/ready" -k; do
        sleep 5
    done
}

# Then auto-run terraform
apply_terraform "$INSTANCE"
```
**Effort:** 3h
**Success criteria:** One command deploys instance end-to-end

#### ME-3: Federation Secret Sync Automation

**What exists:** `sync-federation-secrets.sh`, `sync-gcp-secrets-to-keycloak.sh`
**What's missing:** Automatic execution after Terraform
**Integration approach:**
```bash
# After Terraform applies, sync secrets
terraform apply -var-file="${instance}.tfvars" -auto-approve
sync_federation_secrets "$INSTANCE"
```
**Effort:** 2h
**Success criteria:** Federation works without manual secret copy

### 3.3 Strategic Investments (> 8 hours)

#### SI-1: Deployment Orchestrator Service

**What exists:** Shell scripts with sequential steps
**What's missing:** Event-driven orchestration
**Integration approach:**
Create a lightweight orchestrator that:
1. Watches container health events
2. Triggers Terraform when Keycloak is ready
3. Triggers federation when Terraform completes
4. Reports status via webhook
**Effort:** 16h
**Success criteria:** Zero manual steps for new instance

#### SI-2: Auto-Partner Onboarding

**What exists:** `add-federation-partner.sh`, federation matrix in registry
**What's missing:** Discovery and auto-configuration
**Integration approach:**
1. New instance announces itself to existing instances
2. Existing instances auto-add new IdP broker
3. Bi-directional trust established automatically
**Effort:** 24h
**Success criteria:** New partner → full federation in < 5 minutes

---

## Phase 4: Recommendations

### Prioritized Action Plan

| Priority | Action | Effort | Value | Dependencies |
|----------|--------|--------|-------|--------------|
| **P0** | Standardize healthchecks across all compose files | 2h | High | None |
| **P0** | Add restart policies to all services | 1h | High | None |
| **P0** | Wire verify-deployment.sh into main script | 1h | High | None |
| **P1** | Activate generate-docker-compose.sh from SSOT | 4h | High | P0 |
| **P1** | Add healthcheck config to federation-registry.json | 2h | High | P0 |
| **P1** | Auto-trigger Terraform on Keycloak ready | 3h | High | P0 |
| **P2** | Deprecate deploy-instance.sh and deploy-stack.sh | 1h | Med | P1 |
| **P2** | Add depends_on conditions everywhere | 2h | Med | P0 |
| **P2** | Add graceful shutdown handlers | 4h | Med | None |
| **P3** | Event-driven orchestration | 16h | High | P1, P2 |
| **P3** | Auto-partner onboarding | 24h | High | P2 |

### Immediate Actions (This Week)

1. **Update `federation-registry.json`** with healthcheck configurations:

```json
{
  "serviceDefaults": {
    "keycloak": {
      "healthcheck": {
        "test": ["CMD-SHELL", "curl -f http://localhost:8080/health/ready || exit 1"],
        "interval": "30s",
        "timeout": "10s",
        "retries": 5,
        "start_period": "90s"
      }
    }
  }
}
```

2. **Create unified compose template** in `scripts/federation/templates/docker-compose.template.yml`

3. **Update deploy-dive-instance.sh** to:
   - Call `verify-deployment.sh` after services start
   - Auto-rollback on verification failure
   - Log deployment results

---

## Appendix A: Script Relationship Diagram

```
                    ┌─────────────────────────────┐
                    │   federation-registry.json  │
                    │         (SSOT v3.0)         │
                    └─────────────┬───────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ generate-tfvars │    │ generate-tunnel │    │ generate-docker │
│      .sh        │    │   -configs.sh   │    │   -compose.sh   │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         ▼                      ▼                      ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ terraform/      │    │ cloudflared/    │    │ docker-compose  │
│ instances/*.tf  │    │ config-*.yml    │    │     .*.yml      │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                │
                                ▼
                    ┌─────────────────────────────┐
                    │   deploy-dive-instance.sh   │
                    │     (Primary Orchestrator)  │
                    └─────────────┬───────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
   ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
   │ Docker Start │       │  Terraform   │       │ Verification │
   │   Services   │──────▶│    Apply     │──────▶│   & Rollback │
   └──────────────┘       └──────────────┘       └──────────────┘
```

---

## Appendix B: Healthcheck Reference

### Recommended Standard Healthchecks

```yaml
# PostgreSQL
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-postgres}"]
  interval: 10s
  timeout: 5s
  retries: 5

# MongoDB
healthcheck:
  test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
  interval: 10s
  timeout: 5s
  retries: 5

# Redis
healthcheck:
  test: ["CMD", "redis-cli", "ping"]
  interval: 10s
  timeout: 5s
  retries: 5

# Keycloak
healthcheck:
  test: ["CMD-SHELL", "curl -f http://localhost:8080/health/ready || exit 1"]
  interval: 30s
  timeout: 10s
  retries: 5
  start_period: 90s

# OPA
healthcheck:
  test: ["CMD", "wget", "--spider", "-q", "http://localhost:8181/health"]
  interval: 10s
  timeout: 5s
  retries: 3

# Backend (HTTPS)
healthcheck:
  test: ["CMD", "curl", "-kfs", "https://localhost:4000/health"]
  interval: 15s
  timeout: 10s
  retries: 5
  start_period: 30s

# Frontend (HTTPS)
healthcheck:
  test: ["CMD", "curl", "-kfsI", "--max-time", "5", "https://localhost:3000/"]
  interval: 30s
  timeout: 15s
  retries: 10
  start_period: 120s

# KAS (HTTPS)
healthcheck:
  test: ["CMD", "curl", "-kfs", "https://localhost:8080/health"]
  interval: 15s
  timeout: 10s
  retries: 5
  start_period: 30s

# Cloudflared
healthcheck:
  test: ["CMD", "cloudflared", "version"]
  interval: 30s
  timeout: 10s
  retries: 5
  start_period: 30s
```

---

## Appendix C: File Locations Reference

### Primary Files to Modify

| File | Purpose | Priority |
|------|---------|----------|
| `config/federation-registry.json` | Add healthcheck configs | P0 |
| `scripts/federation/generate-docker-compose.sh` | Use SSOT for compose | P1 |
| `scripts/deploy-dive-instance.sh` | Add verification call | P0 |
| `docker-compose.yml` | Standardize healthchecks | P0 |
| `docker-compose.fra.yml` | Standardize healthchecks | P0 |
| `docker-compose.gbr.yml` | Standardize healthchecks | P0 |
| `docker-compose.deu.yml` | Standardize healthchecks | P0 |

### Files to Deprecate

| File | Reason | Replacement |
|------|--------|-------------|
| `scripts/deploy-instance.sh` | Duplicate functionality | `deploy-dive-instance.sh` |
| `scripts/deploy-stack.sh` | Legacy, less sophisticated | `deploy-dive-instance.sh` |

---

## Conclusion

The DIVE V3 deployment infrastructure is **well-architected** with strong foundations:

- ✅ Comprehensive SSOT (`federation-registry.json`)
- ✅ Sophisticated primary deployment script (`deploy-dive-instance.sh`)
- ✅ Complete Terraform IaC for Keycloak
- ✅ Proper secrets management (GCP Secret Manager)
- ✅ Verification tooling exists

**Key gaps to close:**

1. **Consistency** - Healthchecks and compose patterns drift between instances
2. **Integration** - Existing tools aren't wired together
3. **Automation** - Manual steps between phases (Docker → Terraform → Federation)

**Recommended next step:** Execute P0 priorities (4 hours total) to immediately improve reliability, then proceed with P1 for full SSOT-driven deployment.









