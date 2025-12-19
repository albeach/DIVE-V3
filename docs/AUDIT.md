# DIVE V3 CLI Audit Report

**Generated**: December 18, 2025
**Updated**: December 19, 2025 (Phase 2 Complete)
**Auditor**: Automated Codebase Analysis
**Scope**: DIVE V3 CLI (`./dive`) and supporting infrastructure

---

## Executive Summary

The DIVE V3 CLI is a comprehensive modular management script for a coalition-friendly ICAM web application. It provides unified control over deployment, federation management, policy distribution, and operational monitoring across a hub-spoke architecture supporting all 32 NATO member countries.

**Key Metrics**:
- **19 CLI modules** totaling ~19,815 lines of bash
- **20+ Docker Compose configurations** for various deployment scenarios
- **9 Docker phase test suites** with comprehensive coverage
- **18 active GitHub Actions workflows** for CI/CD (12 archived)
- **40+ GCP secrets** managed via Secret Manager
- **35 Keycloak themes** (per-country localization)
- **32 user profile templates** for NATO nations
- **20+ active spoke instances** configured

---

## Reference Documentation

| Document | Path | Description |
|----------|------|-------------|
| **AUDIT** | `docs/AUDIT.md` | Security audit and compliance requirements (this document) |
| **GAP_ANALYSIS** | `docs/GAP_ANALYSIS.md` | Gap analysis with outstanding items |
| **TARGET_ARCHITECTURE** | `docs/TARGET_ARCHITECTURE.md` | Target system architecture |
| **IMPLEMENTATION_PLAN** | `docs/IMPLEMENTATION_PLAN.md` | Phased implementation plan |
| **BACKLOG** | `docs/BACKLOG.md` | Detailed backlog items (DIVE-0xx tasks) |
| **CI_CD_PLAN** | `docs/CI_CD_PLAN.md` | CI/CD pipeline configuration |

---

## 1. CLI Architecture

### Entry Point

| File | Lines | Description |
|------|-------|-------------|
| `./dive` | 315 | Main entry point with modular dispatch |

**Global Options**:
- `--env <local|gcp|pilot>` - Environment selection
- `--instance <code>` - Instance code (usa, fra, gbr, etc.)
- `--dry-run` - Preview mode
- `--verbose` / `--quiet` - Output control

### Module Inventory

| Module | Lines | Commands | Description |
|--------|-------|----------|-------------|
| `spoke.sh` | 5,028 | spoke init/up/down/status/register/list-countries | NATO 32-country spoke management |
| `federation-setup.sh` | 2,238 | federation-setup configure/register-hub/verify | Keycloak federation configuration |
| `kas.sh` | 1,746 | kas status/health/logs/registry/federation/cache | Key Access Service management |
| `hub.sh` | 1,704 | hub deploy/init/up/down/status/verify/spokes/seed | Hub lifecycle and spoke management |
| `status.sh` | 1,363 | status, health, validate, info, diagnostics, brief | System monitoring |
| `federation.sh` | 1,035 | federation status/register/link/unlink/mappers | Cross-instance federation |
| `redis.sh` | 914 | redis status/health/flush/stats | Redis management |
| `core.sh` | 897 | up, down, restart, logs, ps, exec | Container lifecycle management |
| `pilot.sh` | 851 | pilot up/down/status/logs/ssh/deploy/rollback | Remote VM management |
| `certificates.sh` | 810 | certs check/prepare-federation/verify/install | SSL certificate management |
| `test.sh` | 617 | test federation/unit/playwright/instances/all | Test suite execution |
| `common.sh` | 500 | N/A | Shared utilities, secrets loading, network management |
| `deploy.sh` | 491 | deploy, reset, nuke, rollback, checkpoint | Full deployment workflows |
| `terraform.sh` | 439 | tf plan/apply/destroy/workspace/generate | Infrastructure as Code |
| `sp.sh` | 354 | sp register/status/list/credentials | OAuth client registration |
| `policy.sh` | 314 | policy build/push/status/test/version | OPA policy management |
| `secrets.sh` | 195 | secrets load/show/list/verify/export/lint | GCP Secret Manager integration |
| `help.sh` | 177 | help | Command documentation |
| `db.sh` | 142 | seed, backup, restore | Database operations |

**Total**: 19,815 lines of bash across 19 modules

---

## 2. Docker/Compose Configuration

### Primary Compose Files

| File | Services | Purpose |
|------|----------|---------|
| `docker-compose.yml` | 10 | Main development stack (Keycloak, Backend, Frontend, MongoDB, Postgres, Redis, OPA, OPAL) |
| `docker-compose.hub.yml` | 8 | Hub-specific deployment |
| `docker-compose.pilot.yml` | 10 | Pilot VM deployment |
| `docker-compose.dev.yml` | 10 | Development overrides |
| `docker-compose.federation.yml` | - | Federation-specific services |

### Instance-Specific Configurations

Located in `instances/<code>/docker-compose.yml`:

| Instance | Status | Port Offset |
|----------|--------|-------------|
| usa (Hub) | Active | 0 |
| gbr | Active | 3 |
| fra | Active | 25 |
| deu | Active | 4 |
| alb | Active | 1 |
| dnk | Active | 7 |
| est | Active | 8 |
| nor | Active | 22 |
| pol | Active | 23 |
| rou | Active | 25 |
| tur | Active | 30 |
| ... | ... | ... |

**Port Allocation Scheme**:
- Frontend: 3000 + offset
- Backend: 4000 + offset
- Keycloak HTTPS: 8443 + offset
- PostgreSQL: 5432 + offset
- MongoDB: 27017 + offset

### Networks

| Network | Type | Purpose |
|---------|------|---------|
| `dive-v3-network` | bridge | Internal service communication |
| `dive-v3-shared-network` | external | Hub-spoke cross-instance communication |
| `shared-network` | external | Legacy compatibility |

### Volumes

| Volume | Service | Persistence |
|--------|---------|-------------|
| `postgres_data` | PostgreSQL | Keycloak database |
| `mongo_data` | MongoDB | Resource metadata |
| `redis_data` | Redis | Session cache |
| `frontend_node_modules` | Frontend | Build cache |
| `frontend_next` | Frontend | Next.js build cache |
| `opal_data_tls` | OPAL | Policy distribution |

---

## 3. GCP Integration

### Project Configuration

| Setting | Value |
|---------|-------|
| Project ID | `dive25` |
| Default Zone | `us-east4-c` |
| Pilot VM | `dive-v3-pilot` |

### Secret Manager Inventory

**Naming Convention**: `dive-v3-<type>-<instance>`

| Secret Pattern | Count | Purpose |
|----------------|-------|---------|
| `dive-v3-postgres-<inst>` | 4+ | PostgreSQL passwords |
| `dive-v3-mongodb-<inst>` | 4+ | MongoDB passwords |
| `dive-v3-keycloak-<inst>` | 4+ | Keycloak admin passwords |
| `dive-v3-auth-secret-<inst>` | 4+ | NextAuth secrets |
| `dive-v3-redis-blacklist` | 1 | Shared Redis password |
| `dive-v3-keycloak-client-secret` | 1 | OIDC client secret |
| `dive-v3-kas-signing-key` | 1 | KAS JWT signing |
| `dive-v3-federation-<src>-<tgt>` | 12 | Bidirectional federation secrets |

**Total**: 40+ secrets across all instances

### Service Accounts

Located in `gcp/`:
- `usa-sa-key.json` - USA instance
- `fra-sa-key.json` - France instance
- `gbr-sa-key.json` - UK instance
- `deu-sa-key.json` - Germany instance

### Terraform Configuration

| Directory | Purpose | State |
|-----------|---------|-------|
| `terraform/pilot/` | Hub deployment | Local |
| `terraform/spoke/` | Spoke deployments (workspaces) | Local |
| `terraform/countries/` | Generated tfvars for 32 NATO countries | N/A |
| `terraform/modules/federated-instance/` | Reusable Keycloak module | N/A |
| `terraform/modules/realm-mfa/` | MFA flow module | N/A |

**Gap Identified**: Terraform state is local, not shared via GCS backend.

---

## 4. Keycloak Integration

### Configuration

| Setting | Value |
|---------|-------|
| Version | 26.x |
| Realm | `dive-v3-broker` |
| Theme | `dive-v3` (per-country themes available) |
| Client ID | `dive-v3-client-broker` |

### Realm Import

- **Method**: `--import-realm` flag with JSON template
- **Script**: `keycloak/scripts/import-realm.sh`
- **Template**: `keycloak/realms/dive-v3-broker.json`

**Environment Substitution**:
```bash
APP_URL, API_URL, USA_IDP_URL, USA_IDP_CLIENT_SECRET,
ADMIN_PASSWORD, TEST_USER_PASSWORD, INSTANCE_CODE
```

### Identity Providers

**Current State**: IdPs created dynamically via `./dive federation link` command

| IdP Alias | Type | Status |
|-----------|------|--------|
| `usa-idp` | OIDC | ✅ Dynamic via federation link |
| `gbr-idp` | OIDC | ✅ Dynamic via federation link |
| `fra-idp` | OIDC | ✅ Dynamic via federation link |
| `deu-idp` | OIDC | ✅ Dynamic via federation link |
| All NATO | OIDC | ✅ Dynamic via federation link |

**Phase 2 Resolution**: Hardcoded IdPs removed from realm JSON. IdPs now created dynamically via federation commands with full automation support.

### Protocol Mappers

DIVE-specific attributes mapped to JWT:
- `uniqueID` - User identifier
- `clearance` - Security clearance level
- `countryOfAffiliation` - ISO 3166-1 alpha-3
- `acpCOI` - Community of Interest array

### WebAuthn Configuration

Configured via `ensure_webauthn_policy()` in `core.sh`:
- RP ID derived from `NEXT_PUBLIC_KEYCLOAK_URL`
- Signature algorithms: ES256, RS256
- User verification: required

---

## 5. Testing Infrastructure

### Docker Phase Tests

Located in `tests/docker/`:

| Phase | File | Focus |
|-------|------|-------|
| 0 | `phase0-baseline-tests.sh` | Baseline Docker integration |
| 1 | `phase1-compose-tests.sh` | Compose consolidation |
| 2a | `phase2-secrets-tests.sh` | Secrets standardization |
| 2b | `phase2-idp-automation.sh` | IdP automation (36 tests) |
| 3a | `phase3-resilience-tests.sh` | Service resilience |
| 3b | `phase3-hub-management.sh` | Hub spoke management |
| 4a | `phase4-observability-tests.sh` | Monitoring/alerting |
| 4b | `phase4-cicd.sh` | CI/CD pipeline validation |
| 5 | `phase5-testing-tests.sh` | Test infrastructure |

**Total**: 9 test suites with comprehensive coverage

### E2E Federation Tests

Located in `tests/e2e/federation/`:

| Test | Purpose |
|------|---------|
| `hub-deployment.test.sh` | Hub deployment verification |
| `spoke-deployment.test.sh` | Spoke deployment verification |
| `registration-flow.test.sh` | Spoke registration workflow |
| `policy-sync.test.sh` | OPAL policy distribution |
| `failover.test.sh` | Circuit breaker resilience |
| `multi-spoke.test.sh` | Concurrent spoke testing |
| `opal-dashboard.spec.ts` | OPAL dashboard E2E |
| `token-rotation.spec.ts` | Token rotation E2E |

### E2E Deployment Tests

Located in `tests/e2e/`:
- `local-deploy.test.sh` - Full local deployment lifecycle
- `gcp-deploy.test.sh` - GCP pilot deployment lifecycle
- `idp-login.test.sh` - IdP login flow validation

### Playwright Tests

Located in `tests/e2e/`:
- `playwright.config.ts` - Configuration
- `global-setup.ts` - Test setup
- `auth-flows.test.ts` - Authentication E2E
- `spoke-admin/audit-page.spec.ts` - Audit page tests
- `spoke-admin/failover-page.spec.ts` - Failover UI tests
- `spoke-admin/maintenance-page.spec.ts` - Maintenance mode tests
- `spoke-admin/policy-bundle.spec.ts` - Policy bundle tests
- `spoke-admin/spoke-dashboard.spec.ts` - Dashboard tests

### Unit Tests

- **Backend**: Jest with 1,643+ tests
- **Frontend**: Jest with 183 tests
- **OPA**: `opa test` with comprehensive policy coverage

---

## 6. CI/CD Workflows

### Active Workflows

Located in `.github/workflows/`:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `build-images.yml` | push | Docker image builds |
| `ci-comprehensive.yml` | push to main, daily | Full test suite |
| `ci-fast.yml` | PR | Quick validation |
| `ci-pr.yml` | PR | PR checks |
| `deploy-dev-server.yml` | manual | Dev deployment |
| `deploy-gke-argocd.yml` | manual | GKE ArgoCD deployment |
| `deploy-production.yml` | manual | Production deployment |
| `dive-deploy.yml` | push to main | DIVE auto-deploy with rollback |
| `dive-pr-checks.yml` | PR | DIVE-specific PR validation |
| `policy-bundle.yml` | push to policies/ | OPA bundle build |
| `policy-drift-check.yml` | schedule | Policy drift detection |
| `policy-lint.yml` | PR | Rego linting |
| `secret-rotation.yml` | schedule | Secret rotation automation |
| `security.yml` | schedule | Security scanning |
| `terraform-ci.yml` | PR | Terraform CI |
| `terraform-validate.yml` | PR | Terraform validation |
| `test-e2e.yml` | push | E2E tests |
| `test-specialty.yml` | manual | Specialty tests |

**Total**: 18 active workflows

### Archived Workflows

Located in `.github/workflows/archive/`:
- 12 legacy workflows for reference (backend-ci, frontend-ci, e2e-tests, etc.)

### CI Performance Metrics

From `ci-comprehensive.yml`:
- Frontend tests: ~52s
- Backend tests: split into parallel jobs
- OPA tests: ~5s
- Docker builds: ~3m20s
- Total critical path: ~5min target

---

## 7. Known Risks and Issues

### Critical

| Risk | Location | Impact | Status |
|------|----------|--------|--------|
| ~~IdP manual setup~~ | `core.sh:bootstrap_default_idp()` | ~~Breaks one-command deploy~~ | ✅ RESOLVED - Dynamic IdP creation |
| ~~No deploy rollback~~ | `deploy.sh:cmd_deploy()` | ~~Stuck state on failure~~ | ✅ RESOLVED - Checkpoint/rollback added |

### High

| Risk | Location | Impact | Status |
|------|----------|--------|--------|
| ~~Non-idempotent nuke~~ | `deploy.sh:cmd_nuke()` | ~~Orphaned resources~~ | ✅ RESOLVED - Full idempotency |
| ~~Keycloak wait race~~ | `core.sh:wait_for_keycloak()` | ~~60s timeout may fail~~ | ✅ RESOLVED - 180s with backoff |
| ~~Spoke secrets manual~~ | `spoke.sh` | ~~Requires `secrets load` first~~ | ✅ RESOLVED - Auto-load in spoke lifecycle |

### Medium

| Risk | Location | Impact | Status |
|------|----------|--------|--------|
| Local Terraform state | `terraform/` | No state sharing | 🔲 Pending (GCS backend ready) |
| ~~Missing test fixtures~~ | `tests/fixtures/` | ~~E2E test failures~~ | ✅ RESOLVED - Fixtures created |
| ~~No CI deploy gate~~ | `.github/workflows/` | ~~Broken deploys merge~~ | ✅ RESOLVED - dive-pr-checks.yml |

### Low

| Risk | Location | Impact | Status |
|------|----------|--------|--------|
| ~~No health JSON output~~ | `status.sh` | ~~Manual inspection required~~ | ✅ RESOLVED - `--json` flag added |
| ~~Hardcoded timeouts~~ | Various | ~~Not configurable~~ | ✅ RESOLVED - Environment variables |

---

## 8. Dependency Analysis

### External Dependencies

| Tool | Required Version | Purpose |
|------|------------------|---------|
| Docker | 24+ | Container runtime |
| Docker Compose | v2+ | Multi-container orchestration |
| Terraform | 1.5+ | Infrastructure as Code |
| gcloud CLI | Latest | GCP operations |
| mkcert | Latest | Local TLS certificates |
| jq | 1.6+ | JSON processing |
| curl | Latest | HTTP requests |
| openssl | Latest | Certificate operations |

### Language Runtimes

| Runtime | Version | Location |
|---------|---------|----------|
| Node.js | 20+ | Backend, Frontend |
| TypeScript | 5+ | Backend, Frontend |
| Bash | 5+ | CLI scripts |
| Rego | Latest | OPA policies |

### Docker Images

| Image | Tag | Service |
|-------|-----|---------|
| `postgres` | 15-alpine | PostgreSQL |
| `mongo` | 7.0 | MongoDB |
| `redis` | 7-alpine | Redis |
| `openpolicyagent/opa` | latest | OPA |
| `keycloak` | Custom build | IdP |

---

## 9. Configuration Management

### Environment Variables

**Required for all environments**:
```bash
POSTGRES_PASSWORD
KEYCLOAK_ADMIN_PASSWORD
MONGO_PASSWORD
AUTH_SECRET
KEYCLOAK_CLIENT_SECRET
REDIS_PASSWORD
```

**Environment-specific**:
```bash
# Local/Dev
NEXT_PUBLIC_BASE_URL=https://localhost:3000
KEYCLOAK_URL=https://localhost:8443

# GCP/Pilot
NEXT_PUBLIC_BASE_URL=https://<inst>-app.dive25.com
KEYCLOAK_URL=https://<inst>-idp.dive25.com
```

### Configuration Files

| File | Purpose |
|------|---------|
| `.env.hub` | Hub secrets (gitignored) |
| `config/federation-registry.json` | Federation topology |
| `config/kas-registry.json` | KAS trust matrix |
| `keycloak/realms/*.json` | Realm templates |

---

## 10. Observability

### Logging

- **Backend**: Winston/Pino JSON logging
- **Frontend**: Browser console + server logs
- **Keycloak**: KC_LOG_LEVEL=DEBUG for broker troubleshooting

### Metrics

- **Keycloak**: `KC_METRICS_ENABLED=true` (port 9000)
- **Backend**: Prometheus metrics endpoint
- **OPA**: Decision metrics
- **OPAL**: Policy sync metrics

### Health Checks

| Service | Endpoint | Method |
|---------|----------|--------|
| Keycloak | `/realms/master` | HTTP GET |
| Backend | `/health` | HTTPS GET |
| Frontend | `/` | HTTPS GET |
| OPA | `/health` | HTTPS GET |
| OPAL | `/healthcheck` | HTTP GET |
| MongoDB | `db.adminCommand('ping')` | mongosh |
| Redis | `redis-cli ping` | CLI |

---

## 11. Security Posture

### TLS Configuration

- **Local**: mkcert certificates for HTTPS
- **Production**: Cloudflare tunnels or managed certs
- **Internal**: Service-to-service TLS

### Secret Management

- **Pattern**: GCP Secret Manager with fallback to env vars
- **Rotation**: Manual (no automated rotation)
- **Audit**: `secrets lint` command for hardcoded credentials

### Authentication

- **Method**: OIDC via Keycloak broker
- **MFA**: WebAuthn support configured
- **Session**: JWT with 15min access, 8hr refresh

### Authorization

- **Engine**: OPA with ABAC policies
- **Distribution**: OPAL for real-time sync
- **Pattern**: Default deny, fail-secure

---

## 12. Recommendations

### ✅ Completed (Phase 1)

1. ~~**Make `cmd_nuke` idempotent**~~ - ✅ Added `docker system prune -af --volumes`
2. ~~**Add deploy rollback**~~ - ✅ Checkpoint state before destructive operations
3. ~~**Auto-load spoke secrets**~~ - ✅ Call `load_gcp_secrets` in spoke lifecycle
4. ~~**Add health JSON output**~~ - ✅ `./dive health --json` implemented
5. ~~**Increase Keycloak timeout**~~ - ✅ 180s with exponential backoff

### ✅ Completed (Phase 2)

6. ~~**Automate IdP creation**~~ - ✅ Dynamic IdP via `./dive federation link`
7. ~~**Add IdP verification**~~ - ✅ `scripts/verify-idps.sh` created
8. ~~**Apply user profiles**~~ - ✅ `scripts/spoke-init/apply-user-profile.sh` created
9. ~~**Add CI deploy gate**~~ - ✅ `.github/workflows/dive-pr-checks.yml` added

### In Progress (Phase 3)

10. **Hub spoke registry API** - Hub centralized spoke management
11. **Hub health aggregation** - Aggregate health from all spokes
12. **Policy distribution via OPAL** - Centralized policy push
13. **Audit log aggregation** - Compliance logging at hub

### Future (Phase 4+)

14. **Configure Terraform GCS backend** - Shared state across environments (script ready)
15. **KAS integration** - Key Access Service for encrypted resources
16. **E2E demo scenarios** - Full federation demonstration

---

## Appendix A: File Tree (Key Paths)

```
DIVE-V3/
├── dive                           # Main CLI entry point (316 lines)
├── scripts/
│   ├── dive-modules/              # 19 CLI modules (~19,815 lines total)
│   ├── spoke-init/                # 13 spoke initialization scripts
│   ├── hub-init/                  # 4 hub initialization scripts
│   ├── verify-idps.sh             # IdP verification script
│   └── dynamic-test-runner.sh     # Dynamic Playwright runner
├── docker-compose.yml             # Primary compose
├── docker-compose.hub.yml         # Hub deployment
├── docker-compose.pilot.yml       # Pilot VM deployment
├── instances/                     # 20+ spoke instance configs
│   ├── usa/                       # Hub instance
│   ├── gbr/, fra/, deu/           # Major spokes
│   └── <nato-code>/               # All NATO countries
├── keycloak/
│   ├── Dockerfile
│   ├── realms/                    # Realm JSON templates
│   ├── scripts/                   # Import scripts
│   ├── themes/                    # 35 per-country themes
│   ├── user-profile-templates/    # 32 NATO user profiles
│   └── mapper-templates/          # NATO attribute mappings
├── terraform/
│   ├── hub/                       # Hub terraform
│   ├── pilot/                     # Pilot VM terraform
│   ├── spoke/                     # Spoke deployments
│   ├── countries/                 # 32 NATO tfvars
│   └── modules/                   # Reusable modules
├── tests/
│   ├── docker/                    # 9 phase test suites
│   └── e2e/                       # E2E + Playwright tests
├── .github/workflows/             # 18 active workflows (12 archived)
├── gcp/                           # Service account keys
└── config/                        # Registry configs
```

---

## Appendix B: Command Reference

See `DIVE-V3-CLI-USER-GUIDE.md` for complete command documentation.

**Quick Reference**:
```bash
./dive up                    # Start local stack
./dive down                  # Stop stack
./dive deploy                # Full deployment
./dive nuke                  # Destroy everything
./dive status                # Show status
./dive health                # Health checks
./dive hub deploy            # Deploy hub
./dive spoke init POL        # Init spoke
./dive secrets verify        # Check secrets
./dive test all              # Run all tests
```
