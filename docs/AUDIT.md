# DIVE V3 CLI Audit Report

**Generated**: December 18, 2025  
**Auditor**: Automated Codebase Analysis  
**Scope**: DIVE V3 CLI (`./dive`) and supporting infrastructure

---

## Executive Summary

The DIVE V3 CLI is a comprehensive modular management script for a coalition-friendly ICAM web application. It provides unified control over deployment, federation management, policy distribution, and operational monitoring across a hub-spoke architecture supporting all 32 NATO member countries.

**Key Metrics**:
- **19 CLI modules** totaling ~15,000+ lines of bash
- **10+ Docker Compose configurations** for various deployment scenarios
- **108 Docker phase tests** across 6 test suites
- **20+ GitHub Actions workflows** for CI/CD
- **40+ GCP secrets** managed via Secret Manager

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
| `common.sh` | 503 | N/A | Shared utilities, secrets loading, network management |
| `core.sh` | 879 | up, down, restart, logs, ps, exec | Container lifecycle management |
| `deploy.sh` | 235 | deploy, reset, nuke | Full deployment workflows |
| `hub.sh` | 1705 | hub deploy/init/up/down/status/verify/spokes/seed | Hub lifecycle and spoke management |
| `spoke.sh` | 5029 | spoke init/up/down/status/register/list-countries | NATO 32-country spoke management |
| `status.sh` | 1226 | status, health, validate, info, diagnostics, brief | System monitoring |
| `secrets.sh` | 202 | secrets load/show/list/verify/export/lint | GCP Secret Manager integration |
| `terraform.sh` | 446 | tf plan/apply/destroy/workspace/generate | Infrastructure as Code |
| `federation.sh` | ~500 | federation status/register/link/unlink/mappers | Cross-instance federation |
| `federation-setup.sh` | ~800 | federation-setup configure/register-hub/verify | Keycloak federation configuration |
| `pilot.sh` | ~400 | pilot up/down/status/logs/ssh/deploy | Remote VM management |
| `policy.sh` | 316 | policy build/push/status/test/version | OPA policy management |
| `certificates.sh` | 812 | certs check/prepare-federation/verify/install | SSL certificate management |
| `redis.sh` | 915 | redis status/health/flush/stats | Redis management |
| `kas.sh` | 1748 | kas status/health/logs/registry/federation/cache | Key Access Service management |
| `sp.sh` | 366 | sp register/status/list/credentials | OAuth client registration |
| `db.sh` | 149 | seed, backup, restore | Database operations |
| `test.sh` | 618 | test federation/unit/playwright/instances/all | Test suite execution |
| `help.sh` | 181 | help | Command documentation |

**Total**: ~15,625 lines of bash across 19 modules

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

**Current State**: IdPs require manual post-import setup via `kcadm.sh`

| IdP Alias | Type | Status |
|-----------|------|--------|
| `usa-idp` | OIDC | Manual |
| `gbr-idp` | OIDC | Manual |
| `fra-idp` | OIDC/SAML | Manual |
| `deu-idp` | OIDC | Manual |
| `can-idp` | OIDC | Manual |
| `industry-idp` | OIDC | Manual |

**Gap Identified**: IdP definitions not in realm JSON, breaking one-command deploy.

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

| Phase | File | Tests | Focus |
|-------|------|-------|-------|
| 0 | `phase0-baseline-tests.sh` | 9 | Baseline Docker integration |
| 1 | `phase1-compose-tests.sh` | 33 | Compose consolidation |
| 2 | `phase2-secrets-tests.sh` | 20 | Secrets standardization |
| 3 | `phase3-resilience-tests.sh` | 8 | Service resilience |
| 4 | `phase4-observability-tests.sh` | 19 | Monitoring/alerting |
| 5 | `phase5-testing-tests.sh` | 19 | Test infrastructure |

**Total**: 108 regression tests

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

### Playwright Tests

Located in `tests/e2e/`:
- `playwright.config.ts` - Configuration
- `global-setup.ts` - Test setup
- `auth-flows.test.ts` - Authentication E2E
- `spoke-admin/*.spec.ts` - Admin UI tests

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
| `ci-comprehensive.yml` | push to main, daily | Full test suite |
| `ci-fast.yml` | PR | Quick validation |
| `ci-pr.yml` | PR | PR checks |
| `deploy-dev-server.yml` | manual | Dev deployment |
| `deploy-production.yml` | manual | Production deployment |
| `policy-bundle.yml` | push to policies/ | OPA bundle build |
| `policy-lint.yml` | PR | Rego linting |
| `terraform-validate.yml` | PR | Terraform validation |
| `test-e2e.yml` | push | E2E tests |
| `security.yml` | schedule | Security scanning |

### Archived Workflows

Located in `.github/workflows/archive/`:
- 12 legacy workflows for reference

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

| Risk | Location | Impact |
|------|----------|--------|
| IdP manual setup | `core.sh:bootstrap_default_idp()` | Breaks one-command deploy |
| No deploy rollback | `deploy.sh:cmd_deploy()` | Stuck state on failure |

### High

| Risk | Location | Impact |
|------|----------|--------|
| Non-idempotent nuke | `deploy.sh:cmd_nuke()` | Orphaned resources |
| Keycloak wait race | `core.sh:wait_for_keycloak()` | 60s timeout may fail |
| Spoke secrets manual | `spoke.sh` | Requires `secrets load` first |

### Medium

| Risk | Location | Impact |
|------|----------|--------|
| Local Terraform state | `terraform/` | No state sharing |
| Missing test fixtures | `tests/fixtures/` | E2E test failures |
| No CI deploy gate | `.github/workflows/` | Broken deploys merge |

### Low

| Risk | Location | Impact |
|------|----------|--------|
| No health JSON output | `status.sh` | Manual inspection required |
| Hardcoded timeouts | Various | Not configurable |

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

### Immediate (Phase 1)

1. **Make `cmd_nuke` idempotent** - Add `docker system prune -af --volumes`
2. **Add deploy rollback** - Checkpoint state before destructive operations
3. **Auto-load spoke secrets** - Call `load_gcp_secrets` in spoke lifecycle

### Short-term (Phase 2-3)

4. **Automate IdP creation** - Add IdP definitions to realm JSON
5. **Configure Terraform GCS backend** - Shared state across environments
6. **Create pilot deploy script** - Full VM bootstrap automation

### Medium-term (Phase 4-5)

7. **Add CI deploy gate** - Block broken deploys in PRs
8. **Complete E2E test coverage** - Fill gaps in test fixtures
9. **Implement auto-rollback** - CI/CD rollback on E2E failure

---

## Appendix A: File Tree (Key Paths)

```
DIVE-V3/
├── dive                           # Main CLI entry point
├── scripts/
│   └── dive-modules/              # 19 CLI modules
├── docker-compose.yml             # Primary compose
├── docker-compose.hub.yml         # Hub deployment
├── instances/                     # 32 NATO country configs
├── keycloak/
│   ├── Dockerfile
│   ├── realms/                    # Realm JSON templates
│   ├── scripts/                   # Import scripts
│   └── themes/                    # Per-country themes
├── terraform/
│   ├── pilot/                     # Hub terraform
│   ├── spoke/                     # Spoke terraform
│   ├── countries/                 # Generated tfvars
│   └── modules/                   # Reusable modules
├── tests/
│   ├── docker/                    # 108 phase tests
│   └── e2e/                       # E2E tests
├── .github/workflows/             # 20+ CI workflows
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
