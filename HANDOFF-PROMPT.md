# DIVE V3 — Continuation Prompt (Post-PR #715 Merge, February 20, 2026)

You are continuing work in `/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3` on the `main` branch. The worktree should be clean.

## 1) Session background and current state

PR #715 has been merged to main:
- Branch: `feat/standalone-spoke-seeding-optin` (merged)
- PR: https://github.com/albeach/DIVE-V3/pull/715
- Merge commit: `cdc584b601328b985bddf1951e82445291877a9b`
- PLAN.md update commit: `8ba425ae` (pushed directly to main)

### What PR #715 delivered (Phase B+C combined)

**Phase B — Standalone Spoke Attach Flow:**
1. SPIF raw endpoint hardening: `GET /api/spif/raw` enforces `authenticateJWT + requireAdmin`
2. Standalone spoke: `./dive spoke federate <CODE> [--auth-code] [--domain]`
3. Opt-in seeding: `--seed`/`--seed-count` flags, default OFF; post-federation seeding supported
4. Pipeline metadata: `deployment_mode`, `federation_mode`, `deployment_profile`

**Phase C — Compliance Quick Wins:**
5. Dynamic OPAL Bundle Integrity: `/api/compliance/status` probes `policyBundleService.getCurrentBundle()` at runtime (compliant/partial/non-compliant)
6. `standardsSummary` field: `{ totalStandards, compliant, partial, nonCompliant }` aggregation
7. CI OPAL hash evidence step in `backend-tests` job (SHA-256 + mismatch detection)
8. Backend hash verification tests: 5 tests (tamper detection, RSA signature round-trip, wrong-key rejection)
9. Compliance controller tests: 4 new tests for dynamic OPAL integrity states + summary counts
10. Shell hash verification tests: 5 tests matching `spoke-policy.sh` hash pattern
11. Pre-existing bug fix: stray function calls removed from `test_health_sentinel.sh`

## 2) What was validated

**Backend tests:**
- `compliance.controller.test.ts` — 35/35 passing
- `policy-bundle.service.test.ts` — 25/25 passing
- Full suite: 3,309 passing (1 pre-existing `external-idp-performance.test.ts` failure, unrelated)

**Shell tests:**
- `test_hash_verify.sh` — 5/5 passing
- Full suite: 398/403 passing (5 pre-existing line-count check failures in `test_phase_registry`)

**Dry-run smoke:**
- `./dive --dry-run spoke deploy FRA --skip-federation --only-phase PREFLIGHT` — SEEDING skipped
- `./dive --dry-run spoke deploy FRA --skip-federation --seed --seed-count 123 --only-phase PREFLIGHT` — warns and defers
- `./dive --dry-run spoke deploy FRA --seed --seed-count 123 --only-phase PREFLIGHT` — opt-in seeding message

## 3) Completed remediation backlog (from PLAN.md §8)

| Priority | Item | Status |
|----------|------|--------|
| P0 | Secure OPAL mutation endpoints | ✅ PR #692 |
| P0 | Secure federation internal endpoints | ✅ PR #692 |
| P0 | Fix global `--dry-run` propagation | ✅ PR #693 |
| P0 | Repair orchestration state transition flow | ✅ PR #697 |
| P0 | Remove localhost production assumptions | ✅ PR #710 |
| P0 | Enforce external IdP TLS validation | ✅ PR #692 + #710 |
| P1 | Standalone spoke certified path | 🔶 Partial — PR #715 (non-dry-run certification pending) |
| P1 | First-class Shared deploy command | ✅ PR #704 |
| P1 | Multi-KAS multi-endpoint upload path | ✅ PR #707 |
| P1 | Replace placeholder compliance metrics | ✅ PR #700 + #715 |
| P1 | Align admin UI/backend contracts | ✅ PR #705 |
| P1 | Replace synthetic stats controllers | ✅ PR #705 |
| P1 | Fix OPA test harness | ✅ PR #695 |
| P2 | CLI readability quality gate | ⬜ Not started |
| P2 | Sovereign federation runbook | ⬜ Not started |

**Score: 13/15 items complete, 1 partial, 1 not started.**

## 4) Remaining gaps and deferred actions

### Gap A — Standalone Certification Closure (highest priority)
Full non-dry-run proof still pending:
- `./dive spoke deploy FRA --skip-federation` succeeds without hub connectivity
- Local IdP token issuance in standalone mode
- Local KAS and OPA decision paths in standalone mode
- `./dive spoke federate FRA --auth-code <uuid>` succeeds without core-stack redeploy
- `./dive spoke health FRA` passes before and after federation attach

### Gap B — Deep Compliance Controls
- mTLS client cert OR signed attestation enforcement on production federation endpoints
- BDO cross-instance integrity/tamper CI test
- XACML/AuthzForce parity integration test
- Signed compliance report payloads

### Gap C — Operational Readiness
- CLI readability quality gate (Flesch-Kincaid 7-9 target)
- Sovereign federation architecture runbook (DNS/TLS/firewall requirements, emergency procedures)
- Handoff docs updated with residual risk list

### Gap D — Pre-existing Test Issues
- `external-idp-performance.test.ts` — `TypeError: Cannot read properties of undefined (reading 'catch')` at `opal.routes.ts:73`
- `test_phase_registry` — 5 line-count assertion failures (file grew beyond expected ~940 lines)

## 5) Recommended next steps (priority order)

### Phase 1 — Standalone Certification Closure (1 session)
**SMART Goal:** Produce reproducible non-dry-run proof that standalone deploy and federation attach succeed.

Success criteria:
- [ ] `./dive spoke deploy FRA --skip-federation` succeeds without hub
- [ ] Local IdP token issuance validated
- [ ] Local KAS + OPA decision paths validated
- [ ] Orchestration metadata captures standalone mode
- [ ] `./dive spoke federate FRA --auth-code <uuid>` succeeds without redeploy
- [ ] `./dive spoke health FRA` passes before and after attach

### Phase 2 — Deep Compliance Controls (2 sessions)
**SMART Goal:** Implement production-grade federation trust controls and interoperability validation.

Success criteria:
- [ ] Production federation routes enforce mTLS cert OR signed attestation
- [ ] BDO cross-instance integrity CI test validates round-trip + tamper detection
- [ ] AuthzForce integration test validates parity with OPA
- [ ] Signed compliance report payloads in `/api/compliance/status`
- [ ] Evidence reflected in compliance reporting and deployment gates

### Phase 3 — Operational Readiness (1 session)
**SMART Goal:** Publish operator-ready guidance and close remaining P2 items.

Success criteria:
- [ ] Runbook: standalone deploy + post-attach federation flow
- [ ] DNS/TLS/firewall requirements documented
- [ ] Emergency procedures: key rotation, federation disconnect, policy rollback, Vault unseal
- [ ] CLI readability quality gate added to CI
- [ ] Handoff docs finalized with residual risk list

## 6) Key artifacts to review first

- `PLAN.md` — master remediation backlog with completion status
- `backend/src/controllers/compliance.controller.ts` — dynamic OPAL integrity probe + standardsSummary
- `backend/src/services/policy-bundle.service.ts` — bundle building, signing, hash computation
- `backend/src/routes/opal.routes.ts` — all OPAL endpoints including bundle verify
- `scripts/dive-modules/spoke/spoke-deploy.sh` — spoke deploy dispatcher
- `scripts/dive-modules/spoke/pipeline/spoke-pipeline.sh` — spoke pipeline phases
- `scripts/dive-modules/spoke/pipeline/spoke-federation.sh` — federation attach flow
- `scripts/dive-modules/spoke/pipeline/phase-seeding.sh` — opt-in seeding logic
- `scripts/dive-modules/spoke/pipeline/phase-configuration.sh` — standalone mode skips
- `scripts/dive-modules/spoke/pipeline/phase-verification.sh` — standalone verification
- `.github/workflows/ci-pr.yml` — CI with OPAL hash evidence step

## 7) Constraints to preserve

- No `continue-on-error: true` or `|| true` in workflow files
- URL resolution via SSOT helpers (`resolve_spoke_public_url`, `resolve_hub_public_url`)
- No localhost hardcoding for production federation
- Bash loop var hygiene (`local i`) and defensive array checks
- `standardsSummary` and dynamic OPAL integrity are backwards-compatible additions
- `policyBundleService.getCurrentBundle()` returns null when no bundle built (truthful reporting)
- Evidence keys `publishHash` and `downloadHashVerification` retained for API compatibility

## 8) Test baseline

| Suite | Count | Status |
|-------|-------|--------|
| Backend unit tests | 3,309 | All passing (1 pre-existing perf failure) |
| OPA policy tests | 1,042/1,042 | Passing |
| Shell tests | 398/403 | Passing (5 pre-existing line-count failures) |
| Frontend tests | ~120 suites | Passing |
| Compliance controller | 35/35 | Passing |
| Policy bundle service | 25/25 | Passing |
| Shell hash verification | 5/5 | Passing |
