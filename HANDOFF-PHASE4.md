# DIVE CLI Pipeline Overhaul — Phase 4 Handoff Prompt

> **Copy this entire file as the first message in a new Claude Code session.**

---

## Background Context

You are continuing a multi-phase overhaul of the DIVE V3 CLI deployment pipeline (`./dive hub deploy` and `./dive spoke deploy`). A comprehensive audit of **138 shell scripts / 78,847 LOC** identified **32 issues** across critical bugs, security vulnerabilities, maintainability debt, and UX gaps.

### Phase 1 (COMPLETED — PR #681)
Branch: `feat/cli-pipeline-phase1-critical-fixes`
Commit: `fd8330df` on top of `2aa5ffbd` (main)

**8 critical fixes:** Function name mismatches, debug statements, SQL injection prevention, Vault token validation, nuke safety, trap handler race, flag exports, exit→return.
Tests: 19/19 passing.

### Phase 2 (COMPLETED — PR #682)
Branch: `feat/cli-pipeline-phase2-shared-library`
Commit: `aa50bc53` on top of `fd8330df`

**Shared pipeline library — 6 changes:**
1. `deployment/pipeline-utils.sh` (NEW) — 15 shared functions for health checks, service SSOT, secret loading, retry with backoff, container naming
2. `hub-phases.sh` — 6 health check loops replaced with `pipeline_wait_for_healthy()`
3. `hub-services.sh` — `hub_wait_healthy()` now checks ALL services via SSOT
4. `verification.sh` — `verification_check_containers()` uses SSOT list
5. **spoke pipeline** — all use shared health checks, retry, secret loading
6. **Tests**: 57/57 new tests (0 regressions)

### Phase 3 (COMPLETED — PR #684)
Branch: `feat/cli-pipeline-phase3-interactive-recovery`
Commit: `2d0c09ad` on top of `aa50bc53`

**Interactive recovery & phase control — 4 changes:**

1. **3a: Interactive failure recovery** — Wired `error_recovery_suggest()` into `deployment_run_phase()` in `pipeline-common.sh`. On phase failure, user gets guided remediation with retry/skip/abort. Non-interactive mode auto-aborts.

2. **3b: `--from-phase` flag** — Added `--from-phase PHASE_NAME` to `./dive hub deploy` and `./dive spoke deploy`. Skips all phases before the target, runs target and all subsequent. Mutually exclusive with `--skip-phase` and `--only-phase`.

3. **3c: Phase status display** — Added `./dive hub phases` and `./dive spoke phases CODE`:
   - Shows all registered phases with status (pending/complete/failed)
   - Displays completion timestamps and durations
   - Shows resume point indicator
   - Summary line with count

4. **3d: Graceful SIGINT handling** — SIGINT trap during pipeline execution:
   - Interactive: offers continue / pause+save checkpoint / abort
   - Non-interactive: saves INTERRUPTED state and aborts
   - `_PIPELINE_CURRENT_PHASE` tracked for checkpoint saves
   - Lock always released via existing cleanup

**Tests**: 60/60 new tests across 11 suites, 0 regressions on Phase 1 (19/19), Phase 2 (57/57), spoke pipeline (11/11).

---

## Phase 4 Task: Dry-Run Mode

**LOE: Medium | ROI: High | Audit Issue: #19**

### Goal
Add `--dry-run` mode to `./dive hub deploy` and `./dive spoke deploy` that simulates the entire pipeline without making real changes. This lets operators preview what will happen, validate configuration, and catch issues before any Docker containers are touched.

### Changes Required

**4a. Dry-run flag plumbing**
- Add `--dry-run` flag to `hub_deploy()` in `hub-pipeline.sh` and `spoke_deploy()` in `spoke-deploy.sh`
- Export `DIVE_DRY_RUN=true` when flag is set
- Pass through to `hub_pipeline_execute()` and `spoke_pipeline_execute()`

**4b. Dry-run phase execution**
- In `_hub_execute_registered_phases()`: when `DIVE_DRY_RUN=true`, instead of executing the phase function, print what WOULD happen:
  - Phase name and function that would execute
  - Docker commands that would run (compose up, build, etc.)
  - Terraform commands that would apply
  - API calls that would be made
- Same pattern in `spoke_pipeline_run_phase()` for spoke phases

**4c. Dry-run validation mode**
- Even in dry-run, still execute certain validation checks:
  - Preflight checks (tool availability, Docker running)
  - Configuration validation (env files exist, required vars set)
  - Certificate validation (certs exist, not expired)
  - Port availability checks
- Flag these as "DRY-RUN VALIDATION" in output

**4d. Dry-run summary**
- At the end of dry-run, print a comprehensive summary:
  - Total phases that would execute
  - Phases that would be skipped (resume/skip-phase)
  - Docker images that would be built
  - Containers that would start
  - Terraform resources that would be created
  - Estimated duration based on previous runs (from checkpoint data)
  - Any validation warnings found

### Files to Modify
- `scripts/dive-modules/deployment/hub-pipeline.sh` — `--dry-run` flag, dry-run execution loop
- `scripts/dive-modules/deployment/pipeline-common.sh` — shared dry-run utilities
- `scripts/dive-modules/spoke/spoke-deploy.sh` — `--dry-run` flag
- `scripts/dive-modules/spoke/pipeline/spoke-pipeline.sh` — dry-run spoke execution
- `scripts/dive-modules/deployment/hub.sh` — help text update
- `scripts/dive-modules/deployment/spoke.sh` — help text update

### Tests
- Shell tests: `--dry-run` shows phase plan without executing
- Shell tests: `--dry-run` still runs preflight validation
- Shell tests: `--dry-run` respects `--from-phase` and `--skip-phase`
- Shell tests: `--dry-run` prints summary with correct phase count
- Shell tests: `--dry-run` does not modify state DB
- Shell tests: `--dry-run` does not touch Docker
- Run existing test suites (0 regressions)

---

## Instructions

1. **Branch from Phase 3 branch** (or main if merged): `git checkout -b feat/cli-pipeline-phase4-dry-run`
2. **Read and understand** the existing code before modifying:
   - `scripts/dive-modules/deployment/pipeline-common.sh` — pipeline infrastructure (updated in Phase 3 with SIGINT handler)
   - `scripts/dive-modules/deployment/hub-pipeline.sh` — hub pipeline (updated in Phase 3 with --from-phase, hub_phases)
   - `scripts/dive-modules/spoke/pipeline/spoke-pipeline.sh` — spoke pipeline (updated in Phase 3)
   - `scripts/dive-modules/deployment/__tests__/test-phase3-interactive-recovery.sh` — test pattern reference
3. **Implement changes 4a through 4d** as described above
4. **Write shell tests** in `scripts/dive-modules/deployment/__tests__/test-phase4-dry-run.sh`
5. **Run shellcheck** on all modified files
6. **Run existing test suites** to verify zero regressions:
   - `bash scripts/dive-modules/orchestration/__tests__/test-phase1-fixes.sh`
   - `bash scripts/dive-modules/spoke/pipeline/__tests__/test-pipeline.sh`
   - `bash scripts/dive-modules/deployment/__tests__/test-phase2-shared-library.sh`
   - `bash scripts/dive-modules/deployment/__tests__/test-phase3-interactive-recovery.sh`
7. **Commit, push, and create PR** to main
8. **Generate handoff prompt** for Phase 5 (Observability & Diagnostics)

---

## Key Architecture Notes

- **Main CLI entry**: `./dive` bash script at project root → dispatches to `scripts/dive-modules/`
- **Common utilities**: `scripts/dive-modules/common.sh` (59K) — `log_error` writes to stdout (not stderr!)
- **Pipeline common**: `deployment/pipeline-common.sh` — phase execution, circuit breaker, lock management, SIGINT handler, error recovery wiring
- **Pipeline utils**: `deployment/pipeline-utils.sh` — shared health checks, service SSOT, secret loading (Phase 2)
- **Hub deploy**: 13-phase declarative pipeline via `_PIPELINE_REG_*` arrays in `hub-pipeline.sh`
- **Spoke deploy**: 6-phase pipeline (PREFLIGHT → INITIALIZATION → DEPLOYMENT → CONFIGURATION → SEEDING → VERIFICATION)
- **Error recovery**: `orchestration/error-recovery.sh` — remediation catalog, interactive retry/skip/abort (wired into pipeline in Phase 3)
- **Phase control flags**: `--resume`, `--from-phase`, `--skip-phase`, `--only-phase` all exist (Phase 3 added `--from-phase`)
- **Phase status**: `./dive hub phases` / `./dive spoke phases CODE` (Phase 3)
- **SIGINT handler**: `pipeline_install_sigint_handler()` / `pipeline_uninstall_sigint_handler()` (Phase 3)
- **Checkpoint system**: `hub-checkpoint.sh` (file-based) / `spoke-checkpoint.sh` (DB-backed)
- **Docker stub**: Tests use `docker() { echo "stub"; return 0; }; export -f docker` since Docker isn't available in test env
- **Test pattern**: Self-contained tests with inline function definitions to avoid cascading source (see test-phase3-interactive-recovery.sh)

## Remaining Phases (for reference)

| Phase | Name | LOE | ROI | Status |
|-------|------|-----|-----|--------|
| 1 | Critical Bug Fixes & Safety | S | Critical | **DONE** (PR #681) |
| 2 | Shared Pipeline Library | M | High | **DONE** (PR #682) |
| 3 | Interactive Recovery & Phase Control | M | High | **DONE** (PR #684) |
| 4 | Dry-Run Mode | M | High | **← YOU ARE HERE** |
| 5 | Observability & Diagnostics | S | Medium | Pending |
| 6 | State Machine Hardening | M | Medium | Pending |
| 7 | UX Polish & CLI Consistency | S | Medium | Pending |

---

## CI/CD Note

Do NOT modify any `.github/workflows/` files — CI/CD improvements are deferred to a separate session to avoid conflicts with recent GitHub Actions refactoring.
