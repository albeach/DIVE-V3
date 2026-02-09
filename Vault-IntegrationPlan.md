# HashiCorp Vault 1.21 Integration Plan for DIVE V3

> **Status:** Phase 1 (Code Integration) COMPLETE | Phase 2 (Deployment & Testing) IN PROGRESS
> **Branch:** `test/week1-day2-parallel-verification`
> **Last Updated:** 2026-02-09
> **Commits:** `3a9483a7`, `26f41282`, `663b63f8`

---

## Executive Summary

DIVE V3 has integrated HashiCorp Vault 1.21 as its **default** secret management provider, replacing GCP Secret Manager. The integration is fully code-complete with zero cloud provider dependencies in the critical path. Vault runs as a self-hosted container on the hub stack, requiring only Docker + Node.js + Git to operate.

**Key Design Principles:**
- **Open-source ready:** No cloud provider account required (GCP/AWS optional fallback)
- **Zero-downtime rollback:** Switch to `SECRETS_PROVIDER=gcp` at any time
- **Hub-centralized:** Single Vault instance on hub stack, spokes authenticate via AppRole
- **Defense in depth:** Per-spoke scoped policies, audit logging, Raft snapshot backups

---

## Architecture

```
                    ┌─────────────────────────────────┐
                    │         Hub Stack                │
                    │                                  │
                    │  ┌──────────┐  ┌──────────────┐ │
                    │  │  Vault   │  │   Backend    │ │
                    │  │ :8200    │←─│   Keycloak   │ │
                    │  │          │  │   Frontend   │ │
                    │  └────┬─────┘  └──────────────┘ │
                    │       │ dive-shared network      │
                    └───────┼─────────────────────────┘
              ┌─────────────┼─────────────────┐
              │             │                 │
     ┌────────┴───┐  ┌─────┴──────┐  ┌──────┴─────┐
     │  Spoke DEU │  │ Spoke GBR  │  │ Spoke FRA  │
     │  (AppRole) │  │ (AppRole)  │  │ (AppRole)  │
     └────────────┘  └────────────┘  └────────────┘
```

### Secret Path Hierarchy (KV v2)

| Mount | Purpose | Example Path |
|---|---|---|
| `dive-v3/core` | Service credentials (PostgreSQL, MongoDB, Redis, Keycloak) | `dive-v3/core/deu/postgres` |
| `dive-v3/auth` | Authentication secrets (NextAuth, OAuth2 client) | `dive-v3/auth/gbr/nextauth` |
| `dive-v3/federation` | Hub-spoke federation credentials | `dive-v3/federation/deu-usa` |
| `dive-v3/opal` | OPAL policy engine tokens | `dive-v3/opal/master-token` |

### Access Control

| Role | Scope | Authentication |
|---|---|---|
| Hub | Full admin: all `dive-v3/*` paths | Root token (`.vault-token`) |
| Spoke DEU | R/W own secrets, R/O shared + federation + OPAL | AppRole (`VAULT_ROLE_ID` + `VAULT_SECRET_ID`) |
| Spoke GBR | R/W own secrets, R/O shared + federation + OPAL | AppRole |
| Spoke FRA | R/W own secrets, R/O shared + federation + OPAL | AppRole |
| Spoke CAN | R/W own secrets, R/O shared + federation + OPAL | AppRole |

---

## Implementation Status

### Phase 1: Code Integration — COMPLETE

Three commits landed on `test/week1-day2-parallel-verification`:

#### Commit 1: `3a9483a7` — Core Integration (17 files, +2,015/-85 lines)
- Vault container service in `docker-compose.hub.yml` (IPC_LOCK, Raft volumes, healthcheck)
- CLI module: `./dive vault init|unseal|status|setup` (414 lines)
- Bash secrets layer: `vault_get_secret()`, `vault_set_secret()`, `vault_approle_login()` (+274 lines in secrets.sh)
- Spoke secrets: `spoke_secrets_load_from_vault()`, `spoke_secrets_upload_to_vault()` (+249 lines)
- TypeScript client: `backend/src/utils/vault-secrets.ts` (208 lines, KV v2, availability caching)
- Provider routing in `gcp-secrets.ts`: all 6 public functions check `SECRETS_PROVIDER=vault` first
- HCL policies: 1 hub + 4 spoke AppRole policies
- GCP-to-Vault migration script (294 lines, dry-run support)
- Operational runbook: `docs/VAULT_INTEGRATION.md` (232 lines)

#### Commit 2: `26f41282` — Operations Hardening (4 files, +178/-25 lines)
- `./dive vault snapshot [path]` — Raft snapshot backup
- `./dive vault restore <path>` — Raft snapshot restore
- Audit logging enabled in `module_vault_setup()`
- README updated with Vault setup instructions and production checklist

#### Commit 3: `663b63f8` — Open-Source Pivot (8 files, +47/-111 lines)
- Removed ALL GCP dependency from `vault init` and `vault unseal` (unseal keys stored locally only)
- Changed default `SECRETS_PROVIDER` from `gcp` to `vault` in 7 locations
- Removed GCP Cloud KMS auto-unseal comment block from config.hcl
- Removed Google Cloud SDK from README prerequisites
- Updated docs to reflect zero-cloud-dependency architecture

### Files Created/Modified

| File | Lines | Status |
|---|---|---|
| `scripts/dive-modules/vault/module.sh` | 494 | NEW — CLI commands |
| `scripts/dive-modules/configuration/secrets.sh` | 1,078 | MODIFIED — +274 lines Vault provider |
| `scripts/dive-modules/spoke/pipeline/spoke-secrets.sh` | 1,223 | MODIFIED — +249 lines Vault loading |
| `backend/src/utils/vault-secrets.ts` | 208 | NEW — TypeScript KV v2 client |
| `backend/src/utils/gcp-secrets.ts` | 555 | MODIFIED — provider routing |
| `scripts/migrate-secrets-gcp-to-vault.sh` | 294 | NEW — migration tool |
| `docs/VAULT_INTEGRATION.md` | 240 | NEW — operational runbook |
| `vault_config/config.hcl` | 24 | NEW — server configuration |
| `vault_config/policies/hub.hcl` | 18 | NEW — hub access policy |
| `vault_config/policies/spoke-{deu,gbr,fra,can}.hcl` | 34 ea. | NEW — spoke access policies |
| `docker-compose.hub.yml` | — | MODIFIED — Vault service + env vars |
| `templates/spoke/docker-compose.template.yml` | — | MODIFIED — Vault env vars |
| `dive` | — | MODIFIED — vault command dispatch |
| `.gitignore` | — | MODIFIED — .vault-token, .vault-init.txt |
| `README.md` | — | MODIFIED — Vault setup, removed GCP prereq |
| **Total** | **4,116** | **17 files (10 new, 7 modified)** |

---

## Phase 2: Deployment & Testing — IN PROGRESS

### 2.1 Vault Container Startup

**Goal:** Vault container running and healthy on hub stack.
**Measurable:** `docker ps | grep dive-hub-vault` shows healthy status.
**Timeline:** 15 minutes.

```bash
# Start Vault container
docker compose -f docker-compose.hub.yml up -d vault

# Verify container health
docker ps --filter "name=dive-hub-vault" --format "{{.Status}}"
# Expected: Up X seconds (healthy)
```

**Success Criteria:**
- [ ] Vault container running with `(healthy)` status
- [ ] Port 8200 accessible: `curl -s http://127.0.0.1:8200/v1/sys/health`
- [ ] Vault UI accessible at `http://localhost:8200/ui`

### 2.2 Vault Initialization

**Goal:** Vault initialized with unseal keys and root token stored locally.
**Measurable:** `.vault-init.txt` and `.vault-token` files exist with correct permissions (600).
**Timeline:** 5 minutes.

```bash
# Initialize Vault (one-time)
./dive vault init

# Verify files created
ls -la .vault-init.txt .vault-token
# Expected: -rw------- (600 permissions)

# Unseal Vault
./dive vault unseal

# Check status
./dive vault status
# Expected: "Vault is unsealed and ready" + "Vault token is valid"
```

**Success Criteria:**
- [ ] `.vault-init.txt` contains 5 unseal keys and root token
- [ ] `.vault-token` contains valid root token
- [ ] `vault status` shows `Sealed: false`
- [ ] File permissions are 600 (owner-only read/write)

### 2.3 Vault Configuration

**Goal:** All mount points, policies, AppRoles, and audit logging configured.
**Measurable:** 4 KV v2 mounts, 5 policies, 4 AppRoles, 1 audit device.
**Timeline:** 10 minutes.

```bash
# Configure mount points, policies, AppRoles, audit logging
./dive vault setup

# Verify mount points
vault secrets list | grep "dive-v3"
# Expected: dive-v3/core/, dive-v3/auth/, dive-v3/federation/, dive-v3/opal/

# Verify policies
vault policy list | grep "dive-v3"
# Expected: dive-v3-hub, dive-v3-spoke-deu, dive-v3-spoke-gbr, dive-v3-spoke-fra, dive-v3-spoke-can

# Verify AppRoles
vault list auth/approle/role
# Expected: spoke-deu, spoke-gbr, spoke-fra, spoke-can

# Verify audit logging
vault audit list
# Expected: file/ (file audit device)
```

**Success Criteria:**
- [ ] 4 KV v2 mount points enabled
- [ ] 5 HCL policies created (1 hub + 4 spokes)
- [ ] 4 AppRoles created with scoped token policies
- [ ] AppRole credentials saved to spoke `.env` files
- [ ] File audit device enabled

### 2.4 Secret Seeding

**Goal:** All required secrets populated in Vault for hub and spoke deployment.
**Measurable:** Every `vault kv get` for required paths returns a valid value.
**Timeline:** 20 minutes.

For a fresh deployment (no GCP migration needed), seed secrets directly:

```bash
# Generate and store secrets for each instance
for instance in usa deu gbr fra can; do
  vault kv put "dive-v3/core/${instance}/postgres" password="$(openssl rand -base64 32 | tr -d '/+=')"
  vault kv put "dive-v3/core/${instance}/mongodb" password="$(openssl rand -base64 32 | tr -d '/+=')"
  vault kv put "dive-v3/core/${instance}/redis" password="$(openssl rand -base64 32 | tr -d '/+=')"
  vault kv put "dive-v3/core/${instance}/keycloak-admin" password="$(openssl rand -base64 32 | tr -d '/+=')"
  vault kv put "dive-v3/auth/${instance}/nextauth" secret="$(openssl rand -base64 32 | tr -d '/+=')"
done

# Shared secrets
vault kv put "dive-v3/auth/shared/keycloak-client" secret="$(openssl rand -base64 32 | tr -d '/+=')"
vault kv put "dive-v3/core/shared/redis-blacklist" password="$(openssl rand -base64 32 | tr -d '/+=')"
vault kv put "dive-v3/opal/master-token" token="$(openssl rand -base64 32 | tr -d '/+=')"
```

For migration from existing GCP secrets:
```bash
DRY_RUN=true ./scripts/migrate-secrets-gcp-to-vault.sh   # Preview
./scripts/migrate-secrets-gcp-to-vault.sh                  # Execute
```

**Success Criteria:**
- [ ] All instance secrets (5 × 5 = 25) stored in Vault
- [ ] All shared secrets (3) stored in Vault
- [ ] `vault kv get dive-v3/core/usa/postgres` returns a password
- [ ] `vault kv get dive-v3/opal/master-token` returns a token

### 2.5 Hub Deployment with Vault

**Goal:** Hub deploys successfully using Vault-sourced secrets.
**Measurable:** All hub services healthy, zero GCP API calls in logs.
**Timeline:** 30 minutes.

```bash
# Deploy hub
./dive hub deploy

# Verify
docker logs dive-hub-vault 2>&1 | grep -i "seal" | tail -5
docker logs dive-hub-backend 2>&1 | grep -i "connected\|started" | tail -5
docker logs dive-hub-keycloak 2>&1 | grep -i "started" | tail -5
```

**Success Criteria:**
- [ ] Vault container healthy throughout deployment
- [ ] Backend connects to PostgreSQL using Vault-sourced password
- [ ] Keycloak starts with Vault-sourced admin password
- [ ] No GCP Secret Manager API calls in any service logs
- [ ] `./dive hub verify` passes all checks

### 2.6 Spoke Deployment with Vault

**Goal:** All spokes deploy using AppRole authentication and Vault-sourced secrets.
**Measurable:** 12-point verification passes for each spoke.
**Timeline:** 1 hour (15 min per spoke).

```bash
# Deploy each spoke
for spoke in deu gbr fra can; do
  ./dive spoke deploy $spoke
  ./dive spoke verify $spoke
done
```

**Success Criteria (per spoke):**
- [ ] Docker containers running (all 9 services)
- [ ] PostgreSQL connectivity via Vault-sourced password
- [ ] MongoDB replica set initialized
- [ ] Redis connectivity
- [ ] Keycloak admin API accessible
- [ ] OPA policy loaded
- [ ] Backend health endpoint responding
- [ ] Frontend accessible
- [ ] Federation trust established with hub
- [ ] OPAL policy sync working
- [ ] KAS service running
- [ ] Certificate validity confirmed

### 2.7 Integration Testing

**Goal:** Cross-instance federation, OPAL sync, and token revocation working end-to-end.
**Measurable:** All federation and revocation tests pass.
**Timeline:** 1 hour.

```bash
# Federation tests
./dive test federation usa deu
./dive test federation usa gbr

# Verify OPAL sync (spoke OPA has hub policies)
docker exec dive-spoke-deu-opa curl -s localhost:8181/v1/data | jq '.result | keys'

# Token revocation test (manual)
# 1. Login on USA frontend
# 2. Logout on DEU
# 3. Verify token appears in Redis blacklist
# 4. Verify USA rejects the token
```

**Success Criteria:**
- [ ] Federation token exchange works between hub and all spokes
- [ ] OPAL data syncs to all spoke OPA instances
- [ ] Cross-instance token revocation via Redis blacklist works
- [ ] Secret rotation test: change password in Vault → restart service → reconnects

### 2.8 Backup Verification

**Goal:** Raft snapshot backup and restore procedure validated.
**Measurable:** Snapshot creates, Vault restores from snapshot, secrets intact.
**Timeline:** 15 minutes.

```bash
# Create snapshot
./dive vault snapshot
# Expected: backups/vault/vault-snapshot-YYYYMMDD-HHMMSS.snap

# Verify snapshot file exists and has reasonable size
ls -la backups/vault/

# (Optional) Test restore procedure
./dive vault restore backups/vault/<snapshot-file>.snap
./dive vault unseal
./dive vault status
vault kv get dive-v3/core/usa/postgres  # Verify secrets intact
```

**Success Criteria:**
- [ ] Snapshot file created in `backups/vault/`
- [ ] Snapshot file size > 0 bytes
- [ ] Restore procedure documented and tested (optional for pilot)

---

## Phase 3: Deferred to Future Sprints

These items are explicitly deferred. They add value but are not required for the pilot/POC.

### 3.1 Vault PKI Engine for TLS Certificates
**What:** Replace mkcert self-signed certificates with Vault-issued certificates.
**Why deferred:** Current mkcert approach works for development; PKI adds operational complexity.
**Prerequisite:** Phase 2 complete, Vault stable for 2+ weeks.
**Effort:** 3-5 days.

### 3.2 Dynamic Database Credentials
**What:** PostgreSQL and MongoDB credentials with 1-hour TTL auto-rotation.
**Why deferred:** Static credentials work for pilot; dynamic credentials require Vault database engine configuration per instance.
**Prerequisite:** Phase 2 complete, all services support credential refresh.
**Effort:** 3-5 days.

### 3.3 Vault Agent Sidecar
**What:** Vault Agent runs alongside each service container, handling token renewal and secret templating.
**Why deferred:** Current env-var injection works; Agent adds container complexity.
**Prerequisite:** Dynamic credentials (3.2) implemented.
**Effort:** 2-3 days.

### 3.4 High Availability Cluster
**What:** 3-node Vault cluster with Raft consensus for production HA.
**Why deferred:** Single-node sufficient for pilot; HA requires infrastructure investment.
**Prerequisite:** Production deployment decision.
**Effort:** 2-3 days.

### 3.5 Auto-Unseal
**What:** Automatic unseal using cloud KMS (GCP, AWS, or Azure) or Transit engine.
**Why deferred:** Manual unseal acceptable for pilot; auto-unseal requires cloud provider or separate Vault.
**Prerequisite:** HA cluster (3.4) or cloud provider decision.
**Effort:** 1 day.

### 3.6 Vault Namespaces
**What:** Logical isolation between environments (dev/staging/prod) within single Vault instance.
**Why deferred:** Single environment for pilot.
**Prerequisite:** Multi-environment deployment.
**Effort:** 1-2 days.

### 3.7 GCP Legacy Code Removal
**What:** Remove GCP Secret Manager code from secrets.sh, gcp-secrets.ts, and spoke-secrets.sh.
**Why deferred:** GCP code is inactive by default (`SECRETS_PROVIDER=vault`) but provides rollback safety net.
**Prerequisite:** Vault stable for 30+ days, no rollback needed.
**Effort:** 1-2 days.
**Impact:** ~89 files reference GCP; full removal requires careful audit.

---

## Rollback Procedure

Instant rollback to GCP Secret Manager (requires GCP project with existing secrets):

```bash
# Change provider
export SECRETS_PROVIDER=gcp

# Redeploy
./dive hub deploy
./dive spoke deploy deu

# All services immediately use GCP secrets — no code changes needed
```

For fresh deployments without GCP history, rollback means reverting to environment variable secrets:
```bash
# Set SECRETS_PROVIDER to empty/unset to use env vars directly
unset SECRETS_PROVIDER
# Secrets must be provided via .env files or docker-compose environment
```

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Vault sealed after container restart | High | High — all services lose secret access | Document unseal SOP; store `.vault-init.txt` securely; consider auto-unseal (Phase 3.5) |
| Vault container crashes | Medium | High — spoke services cannot start | Docker `restart: unless-stopped`; monitor container health; Raft snapshots for data recovery |
| Secret not found in Vault | Low | Medium — specific service fails to start | Seed script validates all paths; spoke verification catches missing secrets |
| Network partition (spoke cannot reach Vault) | Low | Medium — spoke deployment fails | `dive-shared` Docker network; `curl` pre-flight check in spoke pipeline |
| Unseal keys lost | Very Low | Critical — Vault data unrecoverable | `.vault-init.txt` with 600 permissions; recommend secure off-host backup |
| AppRole secret_id compromised | Very Low | Medium — attacker gets spoke-scoped access | token_ttl=1h limits exposure; regenerate secret_id via `./dive vault setup` |

---

## CLI Quick Reference

```bash
# Lifecycle
./dive vault init                     # One-time initialization
./dive vault unseal                   # Unseal after restart
./dive vault status                   # Health check
./dive vault setup                    # Configure policies + AppRoles

# Operations
./dive vault snapshot                 # Backup to backups/vault/
./dive vault snapshot /tmp/backup.snap  # Backup to specific path
./dive vault restore /tmp/backup.snap   # Restore from snapshot

# Secrets (via vault CLI directly)
vault kv get dive-v3/core/deu/postgres          # Read a secret
vault kv put dive-v3/core/deu/postgres password="new"  # Write a secret
vault kv list dive-v3/core/deu/                 # List secrets

# Migration (from GCP)
DRY_RUN=true ./scripts/migrate-secrets-gcp-to-vault.sh
./scripts/migrate-secrets-gcp-to-vault.sh --instance deu
```

---

## Success Criteria Summary

### Phase 2 Exit Criteria (Deployment & Testing)
- [ ] Vault container running and unsealed on hub stack
- [ ] All mount points, policies, AppRoles configured
- [ ] All secrets seeded (25 instance + 3 shared = 28 total)
- [ ] Hub deployment passes verification with `SECRETS_PROVIDER=vault`
- [ ] All spoke deployments pass 12-point verification
- [ ] Federation token exchange works across all instances
- [ ] OPAL policy sync verified on all spokes
- [ ] Cross-instance token revocation working
- [ ] Raft snapshot backup created and verified
- [ ] Zero GCP Secret Manager API calls in service logs
- [ ] Vault audit log recording access patterns

### Overall Integration Success
- [ ] Phase 1 code complete (DONE — 3 commits, 17 files, +2,240 lines)
- [ ] Phase 2 deployment validated
- [ ] No cloud provider account required for fresh deployment
- [ ] Rollback procedure documented and tested
- [ ] Operational runbook published (`docs/VAULT_INTEGRATION.md`)

---

## New Session Handoff Prompt

Use this prompt to continue Vault integration work in a new chat session:

```
I'm continuing work on DIVE V3's HashiCorp Vault 1.21 integration. Here's the context:

## What's Done (Phase 1 — Code Complete)
- Branch: test/week1-day2-parallel-verification
- 3 commits: 3a9483a7, 26f41282, 663b63f8 (17 files, +2,240 lines)
- Vault is the DEFAULT secret provider (SECRETS_PROVIDER=vault everywhere)
- Zero cloud dependency — no GCP/AWS required
- Key files:
  - scripts/dive-modules/vault/module.sh (494 lines) — CLI: init, unseal, status, setup, snapshot, restore
  - scripts/dive-modules/configuration/secrets.sh (1,078 lines) — vault_get_secret/set_secret/approle_login
  - scripts/dive-modules/spoke/pipeline/spoke-secrets.sh (1,223 lines) — spoke_secrets_load_from_vault
  - backend/src/utils/vault-secrets.ts (208 lines) — TypeScript KV v2 client
  - backend/src/utils/gcp-secrets.ts (555 lines) — provider routing (checks Vault first)
  - vault_config/ — config.hcl + 5 HCL policies (hub + 4 spokes)
  - scripts/migrate-secrets-gcp-to-vault.sh (294 lines) — GCP→Vault migration
  - docs/VAULT_INTEGRATION.md (240 lines) — operational runbook

## What's Next (Phase 2 — Deployment & Testing)
Follow the Phase 2 checklist in Vault-IntegrationPlan.md:
1. Start Vault container: docker compose -f docker-compose.hub.yml up -d vault
2. Initialize: ./dive vault init
3. Unseal: ./dive vault unseal
4. Configure: ./dive vault setup
5. Seed secrets (generate fresh or migrate from GCP)
6. Deploy hub: ./dive hub deploy
7. Deploy spokes: ./dive spoke deploy deu (repeat for gbr, fra, can)
8. Run integration tests (federation, OPAL sync, token revocation)
9. Create Raft snapshot backup

## Deferred (Phase 3 — Future)
- Vault PKI for TLS certs
- Dynamic DB credentials (1h TTL)
- Vault Agent sidecar
- HA cluster (3-node)
- Auto-unseal
- GCP legacy code removal

## Key Constraint
This is a pilot/POC, self-funded, intended for open-source. No GCP dependency
in the critical path. Keep infrastructure lightweight.

Please proceed with Phase 2 deployment testing.
```

---

## File Reference

| File | Purpose |
|---|---|
| `docker-compose.hub.yml` | Vault service definition (container, volumes, healthcheck) |
| `vault_config/config.hcl` | Vault server configuration (Raft, listener, UI) |
| `vault_config/policies/*.hcl` | Access control policies (hub + 4 spokes) |
| `scripts/dive-modules/vault/module.sh` | CLI commands (init, unseal, setup, snapshot, restore) |
| `scripts/dive-modules/configuration/secrets.sh` | Bash Vault provider (get/set/auth) |
| `scripts/dive-modules/spoke/pipeline/spoke-secrets.sh` | Spoke Vault loading + upload |
| `backend/src/utils/vault-secrets.ts` | TypeScript Vault KV v2 client |
| `backend/src/utils/gcp-secrets.ts` | Provider routing (Vault → GCP fallback) |
| `scripts/migrate-secrets-gcp-to-vault.sh` | GCP → Vault secret migration |
| `templates/spoke/docker-compose.template.yml` | Spoke template with Vault env vars |
| `docs/VAULT_INTEGRATION.md` | Operational runbook |
| `.vault-init.txt` | Unseal keys (gitignored, 600 perms) |
| `.vault-token` | Root token (gitignored, 600 perms) |
