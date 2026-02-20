# DIVE CLI Pipeline Overhaul — Phase 5 Handoff Prompt

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
1. **3a: Interactive failure recovery** — `error_recovery_suggest()` wired into `deployment_run_phase()`. On failure, user gets retry/skip/abort.
2. **3b: `--from-phase` flag** — Skip phases before target, run target and all subsequent.
3. **3c: Phase status display** — `./dive hub phases` and `./dive spoke phases CODE`.
4. **3d: Graceful SIGINT handling** — Interactive continue/pause/abort on Ctrl+C.

Tests: 60/60 new (0 regressions on Phase 1: 19/19, Phase 2: 57/57, spoke: 11/11).

### Phase 4 (COMPLETED — PR #686)
Branch: `feat/cli-pipeline-phase4-dry-run`
Commit: `8dd3df62` on top of `875505f6`

**Dry-run mode — 6 files changed:**

1. **4a: Dry-run flag plumbing** — `--dry-run` flag in `hub_deploy()` and `spoke_deploy()`. Sets `DIVE_DRY_RUN=true`. Help text updated.

2. **4b: Dry-run phase execution** — In `_hub_execute_registered_phases()` and `spoke_pipeline_run_phase()`: when `DIVE_DRY_RUN=true`, non-validation phases are simulated (function name, mode, state transition printed) instead of executed. No lock acquisition, no SIGINT handler, no state DB writes.

3. **4c: Dry-run validation mode** — Validation phases (`PREFLIGHT`) still execute in dry-run. Results shown as `[DRY-RUN VALIDATION] ... PASSED/FAILED`. Validation failures are warnings, not fatal.

4. **4d: Dry-run summary** — `pipeline_dry_run_summary()` prints comprehensive report: phases that would execute, phases that would be skipped, validations performed, warnings found. Ends with "No changes were made."

**Shared utilities added to `pipeline-common.sh`:**
- `pipeline_is_dry_run()`, `pipeline_is_validation_phase()`
- `pipeline_dry_run_phase()`, `pipeline_dry_run_reset()`
- `pipeline_dry_run_record_execute/skip/validation/warning()`
- `pipeline_dry_run_summary()`
- `PIPELINE_DRY_RUN_VALIDATION_PHASES` constant

Tests: 39/39 new across 12 suites (0 regressions on Phase 1: 19/19, Phase 2: 57/57, Phase 3: 60/60, spoke: 11/11).

---

## Phase 5 Task: Observability & Diagnostics

**LOE: Small | ROI: Medium | Audit Issue: #23, #24**

### Goal
Improve deployment observability by adding structured logging, timing metrics, and diagnostic commands that help operators understand what happened during a deployment and troubleshoot failures.

### Changes Required

**5a. Structured deployment log output**
- Add `deployment_log_structured()` to `pipeline-common.sh` that outputs JSON-formatted log entries
- Each log entry includes: timestamp, phase, level (info/warn/error), message, duration_ms
- Log to both stdout (human-readable) and a structured log file (JSON lines)
- Log file path: `${DIVE_ROOT}/.dive-state/logs/deploy-{type}-{instance}-{timestamp}.jsonl`

**5b. Phase timing metrics**
- Track start/end/duration for each phase in a structured format
- Store in checkpoint data for later retrieval
- Add `pipeline_get_phase_timing()` to retrieve timing data for a specific phase
- Timing data available via `./dive hub phases --timing` and `./dive spoke phases CODE --timing`

**5c. Diagnostic command: `./dive hub diagnose` / `./dive spoke diagnose CODE`**
- Collects Docker container status, resource usage, log tails
- Checks certificate expiry dates
- Verifies port availability
- Checks disk space for Docker volumes
- Outputs a comprehensive diagnostic report
- Can be run during or after deployment

**5d. Deployment history**
- `./dive hub history` / `./dive spoke history CODE`
- Shows recent deployment attempts with: timestamp, duration, result (success/fail), mode
- Data sourced from structured log files and/or state DB

### Files to Modify
- `scripts/dive-modules/deployment/pipeline-common.sh` — structured logging, timing functions
- `scripts/dive-modules/deployment/hub-pipeline.sh` — `--timing` flag for `hub_phases`, timing tracking
- `scripts/dive-modules/spoke/pipeline/spoke-pipeline.sh` — `--timing` flag for `spoke_phases`, timing tracking
- `scripts/dive-modules/deployment/hub.sh` — `diagnose` and `history` commands
- `scripts/dive-modules/deployment/spoke.sh` — `diagnose` and `history` commands
- NEW: `scripts/dive-modules/deployment/diagnostics.sh` — shared diagnostic functions

### Tests
- Shell tests: Structured log output format validation
- Shell tests: Phase timing data capture and retrieval
- Shell tests: Diagnostic report generation
- Shell tests: Deployment history listing
- Run existing test suites (0 regressions)

---

## Instructions

1. **Branch from Phase 4 branch** (or main if merged): `git checkout -b feat/cli-pipeline-phase5-observability`
2. **Read and understand** the existing code before modifying:
   - `scripts/dive-modules/deployment/pipeline-common.sh` — pipeline infrastructure (updated in Phase 4 with dry-run)
   - `scripts/dive-modules/deployment/hub-pipeline.sh` — hub pipeline (updated in Phase 4)
   - `scripts/dive-modules/spoke/pipeline/spoke-pipeline.sh` — spoke pipeline (updated in Phase 4)
   - `scripts/dive-modules/deployment/__tests__/test-phase4-dry-run.sh` — test pattern reference
3. **Implement changes 5a through 5d** as described above
4. **Write shell tests** in `scripts/dive-modules/deployment/__tests__/test-phase5-observability.sh`
5. **Run shellcheck** on all modified files
6. **Run existing test suites** to verify zero regressions:
   - `bash scripts/dive-modules/orchestration/__tests__/test-phase1-fixes.sh`
   - `bash scripts/dive-modules/spoke/pipeline/__tests__/test-pipeline.sh`
   - `bash scripts/dive-modules/deployment/__tests__/test-phase2-shared-library.sh`
   - `bash scripts/dive-modules/deployment/__tests__/test-phase3-interactive-recovery.sh`
   - `bash scripts/dive-modules/deployment/__tests__/test-phase4-dry-run.sh`
7. **Commit, push, and create PR** to main
8. **Generate handoff prompt** for Phase 6 (State Machine Hardening)

---

## Key Architecture Notes

- **Main CLI entry**: `./dive` bash script at project root → dispatches to `scripts/dive-modules/`
- **Common utilities**: `scripts/dive-modules/common.sh` (59K) — `log_error` writes to stdout (not stderr!)
- **Pipeline common**: `deployment/pipeline-common.sh` — phase execution, circuit breaker, lock management, SIGINT handler, error recovery wiring, dry-run mode
- **Pipeline utils**: `deployment/pipeline-utils.sh` — shared health checks, service SSOT, secret loading (Phase 2)
- **Hub deploy**: 13-phase declarative pipeline via `_PIPELINE_REG_*` arrays in `hub-pipeline.sh`
- **Spoke deploy**: 6-phase pipeline (PREFLIGHT → INITIALIZATION → DEPLOYMENT → CONFIGURATION → SEEDING → VERIFICATION)
- **Error recovery**: `orchestration/error-recovery.sh` — remediation catalog, interactive retry/skip/abort (Phase 3)
- **Phase control flags**: `--resume`, `--from-phase`, `--skip-phase`, `--only-phase`, `--dry-run` (Phase 4)
- **Phase status**: `./dive hub phases` / `./dive spoke phases CODE` (Phase 3)
- **Dry-run mode**: `pipeline_is_dry_run()`, `pipeline_dry_run_summary()`, validation phases still execute (Phase 4)
- **SIGINT handler**: `pipeline_install_sigint_handler()` / `pipeline_uninstall_sigint_handler()` (Phase 3)
- **Checkpoint system**: `hub-checkpoint.sh` (file-based) / `spoke-checkpoint.sh` (DB-backed)
- **Docker stub**: Tests use `docker() { echo "stub"; return 0; }; export -f docker` since Docker isn't available in test env
- **Test pattern**: Self-contained tests with inline function definitions to avoid cascading source (see test-phase4-dry-run.sh)

## Remaining Phases (for reference)

| Phase | Name | LOE | ROI | Status |
|-------|------|-----|-----|--------|
| 1 | Critical Bug Fixes & Safety | S | Critical | **DONE** (PR #681) |
| 2 | Shared Pipeline Library | M | High | **DONE** (PR #682) |
| 3 | Interactive Recovery & Phase Control | M | High | **DONE** (PR #684) |
| 4 | Dry-Run Mode | M | High | **DONE** (PR #686) |
| 5 | Observability & Diagnostics | S | Medium | **← YOU ARE HERE** |
| 6 | State Machine Hardening | M | Medium | Pending |
| 7 | UX Polish & CLI Consistency | S | Medium | Pending |

---

## CI/CD Note

Do NOT modify any `.github/workflows/` files — CI/CD improvements are deferred to a separate session to avoid conflicts with recent GitHub Actions refactoring.
