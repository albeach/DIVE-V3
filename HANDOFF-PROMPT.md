# DIVE V3 — Continuation Prompt (Post-Phase 1, February 20, 2026)

You are continuing work in `/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3` on the `feat/external-federation-domains` branch. The worktree should be clean.

## 1) Session background and current state

**Active initiative**: External Custom Domains & Bidirectional SSO Federation
- Plan file: `~/.claude/plans/async-zooming-quiche.md` (8-phase plan)
- Branch: `feat/external-federation-domains`
- PR #724: https://github.com/albeach/DIVE-V3/pull/724 (Phase 1 — Federation URL Abstraction Layer)

### What Phase 1 delivered (PR #724)

**Federation URL Abstraction Layer** — the foundation that unblocks all separate-network deployments:

1. **`common.sh`** (+224 lines): New URL resolution functions with priority chains:
   - `is_spoke_local($code)` — checks `SPOKE_{CODE}_EXTERNAL`, `SPOKE_{CODE}_DOMAIN`, `SPOKE_CUSTOM_DOMAIN`, Docker container presence
   - `resolve_spoke_internal_url($code, $service)` — 5-priority chain: explicit override → per-spoke domain → session domain → domain suffix → container hostname
   - `resolve_hub_internal_url($service)` — 3-priority chain: explicit override → domain suffix → container hostname
   - `resolve_keycloak_admin_url($code)` — returns `local://container` for docker exec or `https://domain` for remote
   - Updated `resolve_spoke_public_url()` — added Priority 0 for per-spoke custom domains (`SPOKE_{CODE}_DOMAIN`, `SPOKE_CUSTOM_DOMAIN`)

2. **`federation/keycloak-api.sh`** (NEW, ~250 lines): Unified Keycloak admin API abstraction
   - `keycloak_admin_api($code, $method, $path, [$body])` — routes to docker exec (local) or HTTPS (remote)
   - `keycloak_get_admin_token($code)` — token retrieval with 50s cache in associative array
   - `keycloak_admin_api_with_status()` — captures HTTP status code
   - `keycloak_admin_api_available($code)` — pre-flight health check
   - 3-attempt retry with exponential backoff for remote calls

3. **`federation/setup.sh`** (~125 lines changed):
   - Replaced hardcoded `source_internal_url="https://dive-hub-keycloak:8443"` with `resolve_hub_internal_url "idp"`
   - Replaced hardcoded `source_internal_url="https://dive-spoke-${source_lower}-keycloak:8443"` with `resolve_spoke_internal_url "$source_upper" "idp"`
   - All `docker exec ... curl http://localhost:8080/admin/...` → `keycloak_admin_api()`
   - Auth functions now use `keycloak_get_admin_token()`/`keycloak_admin_api_available()`

4. **`federation/mappers.sh`** (complete rewrite):
   - **API change**: All functions now take `instance_code` (e.g., "USA", "GBR") as $1 instead of container name
   - All 13+ `docker exec` calls replaced with `keycloak_admin_api()`
   - Functions affected: `_ensure_federation_client`, `_ensure_federation_client_mappers`, `_create_amr_acr_mappers`, `_create_protocol_mapper`, `_configure_idp_mappers`, `_create_idp_mapper`

5. **`spoke/pipeline/spoke-federation.sh`** (~37 lines changed):
   - Keycloak readiness checks now use `keycloak_admin_api_available()` with fallback to legacy

6. **`scripts/tests/test_url_resolution.sh`** (NEW, 26 tests):
   - Tests for all new functions: `is_spoke_local`, `resolve_spoke_internal_url`, `resolve_hub_internal_url`, `resolve_keycloak_admin_url`, integration/consistency tests

## 2) What was validated

**Shell tests:**
- `test_url_resolution.sh` — 26/26 passing
- Full suite: 443/443 passing (0 regressions from Phase 1 changes)

**Key fix during Phase 1**: `resolve_spoke_public_url()` needed Priority 0 for per-spoke custom domains — originally planned for Phase 2, but was needed for Phase 1 self-consistency (external GBR with `SPOKE_GBR_DOMAIN=gbr.mod.uk` must resolve to `https://idp.gbr.mod.uk`, not localhost fallback).

## 3) Phase 2 — Custom Domain End-to-End Wiring (NEXT)

**Goal**: Wire `SPOKE_CUSTOM_DOMAIN` / `SPOKE_{CODE}_DOMAIN` through every component that generates or consumes spoke URLs.

### Files to modify:

1. **`scripts/dive-modules/spoke/pipeline/phase-initialization.sh`** (~line 458):
   - Already partially handles `SPOKE_CUSTOM_DOMAIN` for base_url/api_url/idp_public_url
   - Extend to set: `KEYCLOAK_ISSUER`, `TRUSTED_ISSUERS`, `OPAL_SERVER_URL`, `NEXTAUTH_URL`

2. **`scripts/dive-modules/spoke/pipeline/spoke-compose-generator.sh`** (~line 202):
   - Replace hardcoded `idp_hostname="dive-spoke-${code_lower}-keycloak"` with resolved URL
   - Inject `SPOKE_CUSTOM_DOMAIN` into generated `.env` file

3. **`scripts/dive-modules/certificates.sh`** (SAN generation):
   - Add custom domain SANs: `app.{domain}`, `api.{domain}`, `idp.{domain}`
   - Keep existing container hostname SANs (dual-SAN)

4. **`scripts/dive-modules/spoke/pipeline/spoke-caddy.sh`** (lines 317-321):
   - Already handles `SPOKE_CUSTOM_DOMAIN` — verify OPAL and Vault domain entries

5. **`scripts/dive-modules/spoke/spoke-deploy.sh`** (line 66-114):
   - When `SPOKE_CUSTOM_DOMAIN` set, skip `{env}-{code}-{service}.{base}` derivation
   - Accept fully custom hub URLs

### New test file: `scripts/tests/test_custom_domains.sh`
- Deploy with `--domain gbr.mod.uk` generates correct `.env` URLs
- Certificate SANs include custom domain entries
- Caddy config uses custom domain names
- Trusted issuers include custom domain issuer
- Hub endpoint normalization with custom spoke domains

### Success criteria:
- [ ] `.env` file contains correct custom domain URLs for all services
- [ ] Certificate SANs include custom domain entries alongside container names
- [ ] Caddy routes handle custom domain requests
- [ ] `TRUSTED_ISSUERS` includes custom domain issuer
- [ ] `KEYCLOAK_ISSUER` uses custom domain
- [ ] All existing tests pass (0 regressions)
- [ ] New custom domain tests all pass

## 4) Remaining phases (3-8)

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Federation URL Abstraction Layer | ✅ PR #724 |
| 2 | Custom Domain End-to-End Wiring | ⬜ Next |
| 3 | Remote Keycloak Admin API (robust impl) | ⬜ Pending |
| 4 | Bidirectional Trust & External Registration | ⬜ Pending |
| 5 | Interactive Domain Wizard & UX | ⬜ Pending |
| 6 | OPAL Cross-Network Policy Distribution | ⬜ Pending |
| 7 | Federation Health Dashboard | ⬜ Pending |
| 8 | Resilience & Auto-Recovery | ⬜ Pending |

## 5) Key artifacts to review first

- `~/.claude/plans/async-zooming-quiche.md` — full 8-phase plan with detailed changes per phase
- `scripts/dive-modules/common.sh` (lines 625-948) — URL resolution functions (Phase 1 additions)
- `scripts/dive-modules/federation/keycloak-api.sh` — Keycloak admin API abstraction
- `scripts/dive-modules/federation/setup.sh` — federation linking (updated in Phase 1)
- `scripts/dive-modules/federation/mappers.sh` — protocol/IdP mappers (rewritten in Phase 1)
- `scripts/dive-modules/spoke/pipeline/phase-initialization.sh` — init phase (Phase 2 target)
- `scripts/dive-modules/spoke/pipeline/spoke-compose-generator.sh` — compose gen (Phase 2 target)
- `scripts/dive-modules/spoke/pipeline/spoke-caddy.sh` — Caddy config (Phase 2 target)
- `scripts/dive-modules/certificates.sh` — SAN generation (Phase 2 target)
- `scripts/dive-modules/spoke/spoke-deploy.sh` — spoke deploy entry (Phase 2 target)

## 6) Constraints to preserve

- All URL resolution via SSOT helpers (`resolve_spoke_public_url`, `resolve_spoke_internal_url`, `resolve_hub_internal_url`, `resolve_keycloak_admin_url`)
- No localhost hardcoding for production federation
- Bash loop var hygiene (`local i`) and defensive array checks
- `keycloak_admin_api()` is the ONLY way to call Keycloak admin endpoints (no direct `docker exec ... curl`)
- Per-spoke domain variables: `SPOKE_{CODE}_DOMAIN`, `SPOKE_{CODE}_EXTERNAL`, `SPOKE_{CODE}_INTERNAL_{SERVICE}_URL`
- Backward compatibility: existing local/dev deployments must work identically (no env vars needed)
- `local://` prefix in `resolve_keycloak_admin_url` output signals docker exec path; `https://` signals remote

## 7) Test baseline

| Suite | Count | Status |
|-------|-------|--------|
| Shell tests (total) | 443 | All passing |
| URL resolution tests | 26/26 | Passing (Phase 1) |
| Backend unit tests | 3,309 | All passing (1 pre-existing perf failure) |
| OPA policy tests | 1,042/1,042 | Passing |
| Frontend tests | ~120 suites | Passing |

## 8) Branch strategy

- Feature branch: `feat/external-federation-domains`
- One commit per phase, cumulative on same branch
- Each phase: run `./scripts/tests/run-shell-tests.sh`, commit, push, update PR #724
- After all phases: single PR merge to main
