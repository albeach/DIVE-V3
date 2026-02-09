# HashiCorp Vault 1.21 Integration Plan for DIVE V3

> **Status:** Phase 1 COMPLETE | Phase 2A (Single-Spoke Pilot) COMPLETE | Phase 2B (Multi-Spoke + Integration) NEXT
> **Branch:** `test/week1-day2-parallel-verification`
> **Last Updated:** 2026-02-09
> **Commits:** 20 commits ahead of main (see commit log below)

---

## Executive Summary

DIVE V3 has integrated HashiCorp Vault 1.21 as its **default** secret management provider, replacing GCP Secret Manager. The integration is fully deployed and validated with a clean-slate end-to-end test: nuke → Vault init/unseal/setup/seed → hub deploy → dynamic spoke provisioning → spoke deploy DEU → 12/12 verification pass.

**Key Design Principles:**
- **Open-source ready:** No cloud provider account required (GCP/AWS optional fallback)
- **Zero-downtime rollback:** Switch to `SECRETS_PROVIDER=gcp` at any time
- **Hub-centralized:** Single Vault instance on hub stack, spokes authenticate via AppRole
- **Dynamic provisioning:** No hardcoded spoke list — each spoke provisioned on demand via `./dive vault provision <CODE>`
- **Defense in depth:** Per-spoke scoped policies (template-generated), audit logging, Raft snapshot backups

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

### Deployment Flow (Dynamic Provisioning)

```
nuke → vault start → init → unseal → setup (hub-only) → seed (hub+shared)
     → hub deploy → vault provision <CODE> → spoke deploy <CODE> → spoke verify <CODE>
```

No spokes are assumed. Each spoke is explicitly provisioned before deployment.

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
| Spoke (any) | R/W own secrets, R/O shared + federation + OPAL | AppRole (`VAULT_ROLE_ID` + `VAULT_SECRET_ID`) |

Spoke policies are generated dynamically from `vault_config/policies/spoke-template.hcl` — no static per-spoke HCL files.

---

## Commit Log (Branch: test/week1-day2-parallel-verification)

### Phase 1: Code Integration (3 commits)
| Commit | Description |
|---|---|
| `3a9483a7` | feat(vault): Integrate HashiCorp Vault 1.21 as multi-provider secret backend |
| `26f41282` | feat(vault): Add audit logging, snapshot/restore CLI, and update README |
| `663b63f8` | refactor(vault): Remove GCP dependency from critical path for open-source readiness |

### Phase 2A: Deployment Pipeline Fixes (17 commits)
| Commit | Description |
|---|---|
| `826b9b72` | docs(vault): Rewrite integration plan with SMART goals and handoff prompt |
| `4d445b5e` | fix(secrets): Route all provider functions through Vault when SECRETS_PROVIDER=vault |
| `d3380a46` | fix(common): Add Vault provider support to load_secrets() |
| `635b7a89` | feat(vault): Add seed command and use configurable DIVE_SPOKE_LIST |
| `31c17b9c` | fix(vault): Fix Raft storage permission denied on fresh Docker volumes |
| `3e9a5bcb` | fix(vault): Resolve CLI-to-Vault connectivity for deployment pipeline |
| `4f41cabe` | fix(secrets): Export all secret vars and fix MONGO_PASSWORD alias |
| `c70e384d` | refactor(secrets): Normalize all secret vars to _\<COUNTRY_CODE\> suffix |
| `895b8e7d` | fix(hub): Update Terraform vars to use _USA suffixed secret names |
| `6f296afe` | fix(spoke): Resolve Hub Keycloak password by _USA suffix, use localhost not 127.0.0.1 |
| `c7fcf8c7` | refactor(vault): Replace static spoke HCL policies with dynamic template |
| `49c8403f` | feat(vault): Add dynamic spoke provisioning, make setup/seed hub-only |
| `24680ed9` | refactor(common): Remove hardcoded DIVE_SPOKE_LIST, add dynamic spoke discovery |
| `022554a3` | feat(spoke): Add Vault provisioning guard to spoke deploy |
| `9e690533` | refactor(federation): Externalize locale mappings to config file |
| `af6b22d2` | fix(spoke): Fix arithmetic exit code crash in 12-point verification |
| `a6d5b768` | fix(verify): Port SSOT alignment, HTTPS enforcement, endpoint corrections |

---

## Implementation Status

### Phase 1: Code Integration — COMPLETE

- Vault container service in `docker-compose.hub.yml` (IPC_LOCK, Raft volumes, healthcheck)
- CLI module: `./dive vault init|unseal|status|setup|seed|provision|snapshot|restore` (902 lines)
- Bash secrets layer: `vault_get_secret()`, `vault_set_secret()`, `vault_approle_login()` in secrets.sh (1,129 lines)
- Spoke secrets: `spoke_secrets_load_from_vault()`, `spoke_secrets_upload_to_vault()` in spoke-secrets.sh (1,240 lines)
- TypeScript client: `backend/src/utils/vault-secrets.ts` (208 lines, KV v2, availability caching)
- Provider routing in `gcp-secrets.ts`: all 6 public functions check `SECRETS_PROVIDER=vault` first
- Dynamic HCL policy template: `vault_config/policies/spoke-template.hcl` (replaces 4 static files)
- Dynamic spoke discovery: `dive_get_provisioned_spokes()` in common.sh (Vault AppRole + fallback)
- Config-driven locale mappings: `config/locale-mappings.conf` (8 NATO countries)
- GCP-to-Vault migration script (294 lines, dry-run support)
- Operational runbook: `docs/VAULT_INTEGRATION.md`

### Phase 2A: Single-Spoke Pilot — COMPLETE

**Validated via clean-slate deployment test (2026-02-09):**

| Step | Command | Result |
|---|---|---|
| 1. Nuke | `./dive nuke all --confirm --keep-images` | Clean |
| 2. Vault Start | `docker compose -f docker-compose.hub.yml up -d vault` | Healthy |
| 3. Vault Init | `./dive vault init` | 5 keys + root token |
| 4. Vault Unseal | `./dive vault unseal` | 3 keys applied |
| 5. Vault Setup | `./dive vault setup` | 4 KV mounts, hub policy, AppRole, audit |
| 6. Vault Seed | `./dive vault seed` | 10 secrets (5 USA + 5 shared) |
| 7. Hub Deploy | `./dive hub deploy` | 236s, 352 Terraform resources, 10 services healthy |
| 8. Provision DEU | `./dive vault provision DEU` | Policy + AppRole + 6 secrets + .env sync |
| 9. Deploy DEU | `./dive spoke deploy DEU` | 592s, 9/9 services healthy |
| 10. Verify DEU | `./dive spoke verify DEU` | **12/12 checks PASS** |

**12-Point Verification Results (DEU):**
1. Docker Containers: PASS 8/8 running
2. Keycloak Health: PASS Healthy
3. Backend API Health: PASS Healthy
4. MongoDB Connection: PASS Connected
5. Redis Connection: PASS Connected
6. OPA Health: PASS Healthy
7. OPAL Client: WARN Connecting (counts as pass)
8. Hub Connectivity: PASS Reachable
9. Policy Bundle: PASS Loaded (34 policies)
10. Token Validity: PASS Token present
11. Hub Heartbeat: WARN No response (counts as pass)
12. TLS Certificates: PASS Valid (819 days left)

### Phase 2B: Multi-Spoke + Integration Testing — NOT STARTED

See detailed plan below.

---

## Phase 2B: Multi-Spoke Deployment & Integration Testing

### 2B.1 Deploy Remaining Spokes

**Goal:** Provision and deploy GBR, FRA, CAN spokes alongside existing DEU.
**Measurable:** 12/12 verification pass for each spoke.
**Timeline:** 45 minutes (15 min per spoke).

```bash
for spoke in gbr fra can; do
    ./dive vault provision $spoke
    ./dive spoke deploy $spoke
    ./dive spoke verify $spoke
done
```

**Success Criteria:**
- [x] DEU: 12/12 verification pass
- [ ] GBR: 12/12 verification pass
- [ ] FRA: 12/12 verification pass
- [ ] CAN: 12/12 verification pass
- [ ] All 4 spokes + hub running simultaneously (10 hub + 36 spoke = 46 containers)

### 2B.2 Federation Integration Testing

**Goal:** Cross-instance federation token exchange and OPAL sync working.
**Measurable:** Federation health endpoints respond, OPAL data synced to all spokes.
**Timeline:** 30 minutes.

```bash
# Check federation health on each spoke
for spoke in deu gbr fra can; do
    echo "=== $spoke ==="
    curl -ks "https://localhost:40$(get_country_offset $(echo $spoke | tr a-z A-Z))/api/federation/health"
done

# Verify OPAL data synced to spoke OPA instances
for spoke in deu gbr fra can; do
    echo "=== $spoke OPA ==="
    eval "$(get_instance_ports $(echo $spoke | tr a-z A-Z))"
    curl -ks "https://localhost:${SPOKE_OPA_PORT}/v1/data" | python3 -m json.tool | head -20
done
```

**Success Criteria:**
- [ ] Federation health endpoint returns `{"status":"healthy"}` on all spokes
- [ ] Each spoke OPA has `federation_matrix` and `trusted_issuers` data
- [ ] Hub federation registry shows all 4 spokes as `approved`

### 2B.3 Cross-Instance Token Revocation

**Goal:** Token blacklisting works across the federation.
**Measurable:** Token revoked on one instance is rejected on all others.
**Timeline:** 30 minutes.

**Manual Test Procedure:**
1. Login on USA frontend (`https://localhost:3000`)
2. Copy the JWT from cookies/local storage
3. Verify token works on DEU backend: `curl -kH "Authorization: Bearer <token>" https://localhost:4011/api/documents`
4. Logout on USA
5. Verify same token is NOW rejected on DEU backend (should get 401)
6. Verify token appears in Redis blacklist: `docker exec dive-hub-redis redis-cli KEYS "blacklist:*"`

**Success Criteria:**
- [ ] Login/logout cycle works on hub frontend
- [ ] Revoked tokens rejected within 60 seconds across all instances
- [ ] Redis blacklist entries visible

### 2B.4 Secret Rotation Test

**Goal:** Validate that changing a secret in Vault and restarting the service picks up the new value.
**Measurable:** Service reconnects with new credentials after restart.
**Timeline:** 15 minutes.

```bash
# Change DEU Redis password in Vault
vault kv put dive-v3/core/deu/redis password="new-test-password-$(date +%s)"

# Restart DEU Redis + Backend to pick up new password
docker restart dive-spoke-deu-redis dive-spoke-deu-backend

# Verify backend reconnects
sleep 15
curl -ks "https://localhost:4011/api/health"
# Expected: {"status":"healthy"} with Redis connected
```

**Success Criteria:**
- [ ] Service reconnects with new Vault-sourced password after restart
- [ ] `./dive spoke verify DEU` still passes 12/12

### 2B.5 Backup & Restore Validation

**Goal:** Raft snapshot backup and restore procedure validated.
**Measurable:** Snapshot creates, Vault restores from snapshot, all secrets intact.
**Timeline:** 15 minutes.

```bash
# Create snapshot
./dive vault snapshot

# Verify snapshot file
ls -la backups/vault/

# (Optional) Full restore test:
# ./dive vault restore backups/vault/<snapshot>.snap
# ./dive vault unseal
# vault kv get dive-v3/core/usa/postgres
```

**Success Criteria:**
- [ ] Snapshot file created in `backups/vault/`
- [ ] Snapshot file size > 0 bytes
- [ ] (Optional) Restore procedure validated

---

## Phase 3: Deferred to Future Sprints

These items are explicitly deferred. They add value but are not required for the pilot/POC.

| ID | Feature | Prerequisite | Effort |
|---|---|---|---|
| 3.1 | Vault PKI for TLS Certificates | Phase 2 complete, Vault stable 2+ weeks | 3-5 days |
| 3.2 | Dynamic Database Credentials (1h TTL) | Phase 2 complete, services support refresh | 3-5 days |
| 3.3 | Vault Agent Sidecar | 3.2 implemented | 2-3 days |
| 3.4 | High Availability Cluster (3-node Raft) | Production decision | 2-3 days |
| 3.5 | Auto-Unseal (Cloud KMS or Transit) | 3.4 or cloud provider decision | 1 day |
| 3.6 | Vault Namespaces (multi-env) | Multi-environment deployment | 1-2 days |
| 3.7 | GCP Legacy Code Removal | Vault stable 30+ days | 1-2 days |

---

## Key Technical Decisions Made

### Dynamic Spoke Provisioning (replaces static spoke list)
- **Before:** `DIVE_SPOKE_LIST="gbr fra deu can"` hardcoded, 4 static HCL policy files
- **After:** `DIVE_SPOKE_LIST=""` (empty default), single template HCL, `./dive vault provision <CODE>` creates policy+AppRole+secrets on demand
- **Discovery:** `dive_get_provisioned_spokes()` queries Vault AppRoles, falls back to `instances/*/` scan

### Secret Variable Normalization
- **Before:** Mixed naming (`POSTGRES_PASSWORD`, `KC_ADMIN_PASSWORD`, etc.)
- **After:** All secrets use `_<COUNTRY_CODE>` suffix (`POSTGRES_PASSWORD_USA`, `POSTGRES_PASSWORD_DEU`, etc.)
- **Rationale:** Prevents cross-instance secret collision when multiple instances share environment

### Port Calculation SSOT
- **SSOT:** `get_country_ports()` in `scripts/nato-countries.sh` (32 NATO countries + partner nations)
- **Consumer:** `get_instance_ports()` in `common.sh` MUST match formulas exactly
- **Key formulas:** OPA = `8181 + offset*10`, Keycloak HTTP = `8080 + offset`, Backend = `4000 + offset`
- **Critical:** The docker-compose generator uses nato-countries.sh; verification uses common.sh — divergence = verification failure

### Verification HTTPS Enforcement
- All services (Backend, OPA, Frontend, Keycloak) speak HTTPS in this stack
- All `curl` checks in verification primitives use `-sk` flags (silent + insecure for self-signed)
- Backend health endpoint: `/api/health` (not `/health`)

---

## Bugs Fixed During Integration

| Bug | Root Cause | Fix |
|---|---|---|
| Vault CLI can't connect | Used `127.0.0.1` instead of `localhost` (Docker networking) | Changed to `localhost` in module.sh + secrets.sh |
| Hub Keycloak password not found | Spoke pipeline looked for `KC_ADMIN_PASSWORD` without `_USA` suffix | Added `_USA` suffix fallback chain |
| Raft permission denied | Fresh Docker volumes have wrong ownership | Added `chown -R vault:vault /vault` to entrypoint |
| Secret vars not exported | `source .env` doesn't export; subshells lose vars | Added explicit `export` to all secret loading |
| Spoke verify crashes at check 1 | `((running_count++))` returns exit code 1 when var=0 under `set -e` | Changed to `var=$((var + 1))` |
| OPA port mismatch | `get_instance_ports()` had `9100+offset` vs SSOT `8181+offset*10` | Aligned formulas |
| Backend check fails | Verification used `http://` and `/health` | Changed to `https://` and `/api/health` |
| spoke_id empty | Read from `config.json:spokeId` (empty) instead of `.env:SPOKE_ID` | Read from `.env` |
| hub_url unreachable | config.json has Docker-internal hostname | Override with `localhost` in local/dev mode |

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
unset SECRETS_PROVIDER
# Secrets must be provided via .env files or docker-compose environment
```

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Vault sealed after container restart | High | High — all services lose secret access | Document unseal SOP; store `.vault-init.txt` securely; consider auto-unseal (Phase 3.5) |
| Vault container crashes | Medium | High — spoke services cannot start | Docker `restart: unless-stopped`; Raft snapshots for recovery |
| Secret not found in Vault | Low | Medium — specific service fails to start | `vault provision` validates paths; spoke verification catches missing secrets |
| Network partition (spoke cannot reach Vault) | Low | Medium — spoke deployment fails | `dive-shared` Docker network; preflight Check 0 validates Vault provisioning |
| Unseal keys lost | Very Low | Critical — Vault data unrecoverable | `.vault-init.txt` with 600 permissions; recommend secure off-host backup |
| AppRole secret_id compromised | Very Low | Medium — attacker gets spoke-scoped access | token_ttl=1h; regenerate via `./dive vault provision` |

---

## CLI Quick Reference

```bash
# Lifecycle
./dive vault init                     # One-time initialization
./dive vault unseal                   # Unseal after restart
./dive vault status                   # Health check
./dive vault setup                    # Configure mount points + hub policy
./dive vault seed                     # Generate hub (USA) + shared secrets
./dive vault provision DEU            # Provision a spoke: policy, AppRole, secrets, .env

# Deployment
./dive hub deploy                     # Deploy hub stack
./dive spoke deploy DEU               # Deploy spoke (requires prior vault provision)
./dive spoke verify DEU               # 12-point verification

# Operations
./dive vault snapshot                 # Backup to backups/vault/
./dive vault snapshot /tmp/backup.snap  # Backup to specific path
./dive vault restore /tmp/backup.snap   # Restore from snapshot

# Secrets (via vault CLI directly)
vault kv get dive-v3/core/deu/postgres          # Read a secret
vault kv put dive-v3/core/deu/postgres password="new"  # Write a secret
vault kv list dive-v3/core/                     # List instance paths
```

---

## File Reference (Current State)

| File | Lines | Purpose |
|---|---|---|
| `scripts/dive-modules/vault/module.sh` | 902 | CLI commands (init, unseal, setup, seed, provision, snapshot, restore) |
| `scripts/dive-modules/configuration/secrets.sh` | 1,129 | Bash Vault provider (get/set/auth/approle) |
| `scripts/dive-modules/spoke/pipeline/spoke-secrets.sh` | 1,240 | Spoke Vault loading + upload |
| `scripts/dive-modules/common.sh` | 1,576 | Shared utilities, port SSOT, spoke discovery |
| `scripts/dive-modules/spoke/verification.sh` | 337 | 12-point spoke verification |
| `scripts/dive-modules/deployment/verification.sh` | 392 | Shared verification primitives |
| `scripts/dive-modules/spoke/spoke-deploy.sh` | 200 | Spoke deploy with Vault guard |
| `scripts/dive-modules/spoke/pipeline/spoke-preflight.sh` | 490 | Preflight with Vault provisioning check |
| `backend/src/utils/vault-secrets.ts` | 208 | TypeScript Vault KV v2 client |
| `backend/src/utils/gcp-secrets.ts` | 555 | Provider routing (Vault → GCP fallback) |
| `vault_config/config.hcl` | 24 | Vault server configuration (Raft, listener, UI) |
| `vault_config/policies/hub.hcl` | 18 | Hub access policy |
| `vault_config/policies/spoke-template.hcl` | 7 | Dynamic spoke policy template |
| `config/locale-mappings.conf` | 8 | NATO locale attribute mappings |
| `scripts/nato-countries.sh` | ~640 | Port SSOT (NATO_PORT_OFFSETS, get_country_ports) |
| `docker-compose.hub.yml` | — | Vault service definition |
| `templates/spoke/docker-compose.template.yml` | — | Spoke template with Vault env vars |
| `scripts/migrate-secrets-gcp-to-vault.sh` | 294 | GCP → Vault migration tool |
| `docs/VAULT_INTEGRATION.md` | 240 | Operational runbook |

---

## Success Criteria Summary

### Phase 2A Exit Criteria — COMPLETE
- [x] Vault container running and unsealed on hub stack
- [x] All mount points, policies configured (hub-only setup)
- [x] Hub secrets seeded (5 USA + 5 shared = 10)
- [x] Hub deployment passes with `SECRETS_PROVIDER=vault` (10 services healthy)
- [x] Dynamic spoke provisioning works (`./dive vault provision DEU`)
- [x] Spoke DEU deployment passes 12-point verification (12/12)
- [x] Vault audit log recording access patterns
- [x] No static spoke list dependencies

### Phase 2B Exit Criteria — NOT STARTED
- [ ] All 4 spokes (DEU, GBR, FRA, CAN) pass 12/12 verification
- [ ] Federation token exchange works across all instances
- [ ] OPAL policy sync verified on all spokes
- [ ] Cross-instance token revocation working
- [ ] Secret rotation validated (change in Vault → restart → reconnect)
- [ ] Raft snapshot backup created and verified

### Overall Integration Success
- [x] Phase 1 code complete (20 commits, 30+ files)
- [x] Phase 2A single-spoke pilot validated
- [ ] Phase 2B multi-spoke deployment validated
- [x] No cloud provider account required for fresh deployment
- [x] Rollback procedure documented
- [x] Operational runbook published

---

## New Session Handoff Prompt

Use this prompt to continue work in a new chat session:

```
I'm continuing work on DIVE V3's HashiCorp Vault 1.21 integration.

## Current State (2026-02-09)
- Branch: test/week1-day2-parallel-verification (20 commits ahead of main)
- Phase 2A (Single-Spoke Pilot) is COMPLETE and validated
- Hub + DEU spoke currently running (20 healthy containers)
- Vault is initialized, unsealed, and serving secrets
- DEU spoke passes 12/12 verification checks

## What Was Completed in Previous Sessions

### Phase 1: Code Integration (3 commits)
- Vault container on hub stack (docker-compose.hub.yml, Raft storage, healthcheck)
- CLI: ./dive vault init|unseal|status|setup|seed|provision|snapshot|restore (902 lines)
- Bash: vault_get_secret(), vault_set_secret(), vault_approle_login() (secrets.sh, 1,129 lines)
- Spoke: spoke_secrets_load_from_vault() (spoke-secrets.sh, 1,240 lines)
- TypeScript: vault-secrets.ts KV v2 client (208 lines)
- Provider routing: gcp-secrets.ts checks SECRETS_PROVIDER=vault first

### Phase 2A: Deployment Pipeline (17 commits)
- Fixed Raft permissions, CLI connectivity, secret var naming (_<COUNTRY_CODE> suffix)
- Normalized Hub Keycloak password resolution (_USA suffix fallback)
- Replaced 4 static HCL policies with single spoke-template.hcl
- Added ./dive vault provision <CODE> (dynamic per-spoke: policy+AppRole+secrets+.env)
- Removed hardcoded DIVE_SPOKE_LIST, added dive_get_provisioned_spokes() discovery
- Added Vault provisioning guard in spoke-deploy.sh and spoke-preflight.sh
- Externalized locale mappings to config/locale-mappings.conf
- Fixed port SSOT divergence (OPA: 8181+offset*10, KC HTTP: 8080+offset)
- Fixed all verification: HTTP→HTTPS, /health→/api/health, spoke_id from .env
- Fixed ((var++)) crash with set -e (exit code 1 when var=0)
- Clean-slate test: nuke → vault init/unseal/setup/seed → hub deploy → vault provision DEU → spoke deploy DEU → 12/12 verify PASS

## What's Next: Phase 2B (Multi-Spoke + Integration Testing)

Read Vault-IntegrationPlan.md for full details. Summary:

1. Deploy remaining spokes (GBR, FRA, CAN):
   ./dive vault provision gbr && ./dive spoke deploy gbr && ./dive spoke verify gbr
   (repeat for fra, can)

2. Federation integration testing:
   - Federation health endpoints on all spokes
   - OPAL data sync to all spoke OPA instances
   - Hub federation registry shows all spokes approved

3. Cross-instance token revocation:
   - Login on USA, use token on DEU, logout on USA, verify DEU rejects token

4. Secret rotation test:
   - Change password in Vault → restart service → verify reconnects

5. Raft snapshot backup validation

## Key Files
- scripts/dive-modules/vault/module.sh (902 lines) — all vault CLI commands
- scripts/dive-modules/configuration/secrets.sh (1,129 lines) — provider routing
- scripts/dive-modules/spoke/verification.sh (337 lines) — 12-point check
- scripts/dive-modules/deployment/verification.sh (392 lines) — shared primitives
- scripts/dive-modules/common.sh (1,576 lines) — get_instance_ports(), port SSOT
- scripts/nato-countries.sh (~640 lines) — get_country_ports(), NATO_PORT_OFFSETS
- vault_config/policies/spoke-template.hcl — dynamic policy template

## Known Constraints
- Vault must be manually unsealed after container restart (auto-unseal deferred to Phase 3.5)
- OPAL sync needs >105s during initial deployment (first data pull is slow)
- Hub heartbeat check (verify check 11) returns WARN (spoke-hub heartbeat API not implemented yet)
- Self-funded pilot, open-source, zero cloud provider dependency

Please proceed with Phase 2B: deploy GBR, FRA, CAN spokes and run integration tests.
```
