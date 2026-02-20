# DIVE CLI Pipeline Overhaul — Phase 6 Handoff Prompt

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

Tests: 60/60 new (0 regressions).

### Phase 4 (COMPLETED — PR #686)
Branch: `feat/cli-pipeline-phase4-dry-run`
Commit: `8dd3df62` on top of `875505f6`

**Dry-run mode — 6 files changed:**
1. `--dry-run` flag in `hub_deploy()` and `spoke_deploy()`. Sets `DIVE_DRY_RUN=true`.
2. Non-validation phases simulated (function name, mode, state transition printed).
3. Validation phases (`PREFLIGHT`) still execute in dry-run. Results shown as warnings.
4. `pipeline_dry_run_summary()` prints comprehensive report.

Tests: 39/39 new (0 regressions).

### Phase 5 (COMPLETED — PR #689)
Branch: `feat/cli-pipeline-phase5-observability`
Commit: `d652ddfc` on top of `7fe119d4`

**Observability & diagnostics — 7 files changed:**

1. **5a: Structured logging** — `pipeline_log_init()`, `pipeline_log_structured()`, `pipeline_log_finalize()` write JSONL entries to `.dive-state/logs/deploy-{type}-{instance}-{timestamp}.jsonl`. Fields: timestamp, phase, level, message, duration_ms, type, instance.

2. **5b: Phase timing metrics** — `pipeline_timing_start()`, `pipeline_timing_end()`, `pipeline_get_phase_timing()`, `pipeline_timing_print()`. `--timing` flag added to `./dive hub phases` and `./dive spoke phases CODE`.

3. **5c: Diagnostic commands** — NEW `diagnostics.sh` module with `diag_full_report()`, `diag_container_status()`, `diag_container_resources()`, `diag_cert_expiry()`, `diag_port_check()`, `diag_disk_space()`, `diag_log_tails()`. Wired into `./dive hub diagnose` and `./dive spoke diagnose CODE`.

4. **5d: Deployment history** — `pipeline_show_history()` reads JSONL log files. Wired into `./dive hub history` and `./dive spoke history CODE`.

Tests: 96/96 new across 18 suites (0 regressions on Phase 1: 19/19, Phase 2: 57/57, Phase 3: 60/60, Phase 4: 39/39, spoke: 11/11).

---

## Phase 6 Task: State Machine Hardening

**LOE: Medium | ROI: Medium | Audit Issue: #25, #26**

### Goal
Harden the deployment state machine to prevent invalid state transitions, detect stuck deployments, and provide automatic recovery for common stuck states. This ensures the deployment pipeline always reflects reality.

### Changes Required

**6a. State transition validation**
- Add `pipeline_validate_state_transition()` to `pipeline-common.sh` that checks if a proposed transition is valid
- Define a valid state transition matrix (e.g., INITIALIZING→DEPLOYING allowed, COMPLETE→INITIALIZING not allowed)
- Log warnings for invalid transitions but allow override with `--force`
- State transitions: UNKNOWN→INITIALIZING→DEPLOYING→CONFIGURING→VERIFYING→COMPLETE, plus FAILED from any state, INTERRUPTED from any active state

**6b. Stuck deployment detection**
- Add `pipeline_detect_stuck()` that checks for deployments that have been in an active state too long
- Configurable timeout per state (e.g., DEPLOYING max 30min, CONFIGURING max 20min)
- Called before acquiring deployment lock — if a deployment appears stuck, offer to force-unlock
- Store heartbeat timestamps in state metadata

**6c. Deployment state audit**
- `./dive hub state` / `./dive spoke state CODE` — Show current state with metadata
- `./dive hub state --repair` — Fix inconsistencies between state DB and checkpoint data
- Compare state DB entries against checkpoint files and Docker container reality
- Auto-fix: if all checkpoints complete but state is DEPLOYING, transition to COMPLETE

**6d. State cleanup on nuke**
- Ensure `cmd_nuke` properly cleans deployment state for all instances
- Clear state DB entries, checkpoint files, timing data, and log references
- Add `--preserve-logs` flag to keep deployment logs during nuke

### Files to Modify
- `scripts/dive-modules/deployment/pipeline-common.sh` — state validation, stuck detection, heartbeat
- `scripts/dive-modules/deployment/hub-pipeline.sh` — heartbeat updates during phase execution
- `scripts/dive-modules/spoke/pipeline/spoke-pipeline.sh` — heartbeat updates during phase execution
- `scripts/dive-modules/deployment/hub.sh` — `state` command
- `scripts/dive-modules/deployment/spoke.sh` — `state` command
- `scripts/dive-modules/deploy.sh` — nuke state cleanup

### Tests
- Shell tests: Valid state transitions accepted
- Shell tests: Invalid state transitions rejected with warning
- Shell tests: Stuck deployment detection with configurable timeout
- Shell tests: State audit detects and fixes inconsistencies
- Shell tests: Nuke properly cleans all state data
- Run existing test suites (0 regressions)

---

## Instructions

1. **Branch from Phase 5 branch** (or main if merged): `git checkout -b feat/cli-pipeline-phase6-state-machine`
2. **Read and understand** the existing code before modifying:
   - `scripts/dive-modules/deployment/pipeline-common.sh` — pipeline infrastructure (updated in Phase 5 with logging/timing)
   - `scripts/dive-modules/deployment/hub-pipeline.sh` — hub pipeline (updated in Phase 5 with --timing)
   - `scripts/dive-modules/spoke/pipeline/spoke-pipeline.sh` — spoke pipeline (updated in Phase 5 with --timing)
   - `scripts/dive-modules/deployment/diagnostics.sh` — diagnostic functions (Phase 5)
   - `scripts/dive-modules/deployment/__tests__/test-phase5-observability.sh` — test pattern reference
3. **Implement changes 6a through 6d** as described above
4. **Write shell tests** in `scripts/dive-modules/deployment/__tests__/test-phase6-state-machine.sh`
5. **Run shellcheck** on all modified files
6. **Run existing test suites** to verify zero regressions:
   - `bash scripts/dive-modules/orchestration/__tests__/test-phase1-fixes.sh`
   - `bash scripts/dive-modules/spoke/pipeline/__tests__/test-pipeline.sh`
   - `bash scripts/dive-modules/deployment/__tests__/test-phase2-shared-library.sh`
   - `bash scripts/dive-modules/deployment/__tests__/test-phase3-interactive-recovery.sh`
   - `bash scripts/dive-modules/deployment/__tests__/test-phase4-dry-run.sh`
   - `bash scripts/dive-modules/deployment/__tests__/test-phase5-observability.sh`
7. **Commit, push, and create PR** to main
8. **Generate handoff prompt** for Phase 7 (UX Polish & CLI Consistency)

---

## Key Architecture Notes

- **Main CLI entry**: `./dive` bash script at project root → dispatches to `scripts/dive-modules/`
- **Common utilities**: `scripts/dive-modules/common.sh` (59K) — `log_error` writes to stdout (not stderr!)
- **Pipeline common**: `deployment/pipeline-common.sh` — phase execution, circuit breaker, lock management, SIGINT handler, error recovery, dry-run, structured logging, timing metrics, history
- **Pipeline utils**: `deployment/pipeline-utils.sh` — shared health checks, service SSOT, secret loading (Phase 2)
- **Diagnostics**: `deployment/diagnostics.sh` — container status, cert expiry, port check, disk space, log tails (Phase 5)
- **Hub deploy**: 13-phase declarative pipeline via `_PIPELINE_REG_*` arrays in `hub-pipeline.sh`
- **Spoke deploy**: 6-phase pipeline (PREFLIGHT → INITIALIZATION → DEPLOYMENT → CONFIGURATION → SEEDING → VERIFICATION)
- **Error recovery**: `orchestration/error-recovery.sh` — remediation catalog, interactive retry/skip/abort (Phase 3)
- **Phase control flags**: `--resume`, `--from-phase`, `--skip-phase`, `--only-phase`, `--dry-run` (Phase 4)
- **Phase status**: `./dive hub phases [--timing]` / `./dive spoke phases CODE [--timing]` (Phase 3+5)
- **Diagnostics CLI**: `./dive hub diagnose` / `./dive spoke diagnose CODE` (Phase 5)
- **History CLI**: `./dive hub history` / `./dive spoke history CODE` (Phase 5)
- **Structured logs**: JSONL files in `.dive-state/logs/deploy-{type}-{instance}-{timestamp}.jsonl` (Phase 5)
- **Dry-run mode**: `pipeline_is_dry_run()`, `pipeline_dry_run_summary()`, validation phases still execute (Phase 4)
- **SIGINT handler**: `pipeline_install_sigint_handler()` / `pipeline_uninstall_sigint_handler()` (Phase 3)
- **Checkpoint system**: `hub-checkpoint.sh` (file-based) / `spoke-checkpoint.sh` (DB-backed)
- **State DB**: `orchestration/state.sh` — `orch_db_set_state()`, `orch_db_get_state()`, `orch_db_record_step()`
- **Docker stub**: Tests use `docker() { echo "stub"; return 0; }; export -f docker` since Docker isn't available in test env
- **Test pattern**: Self-contained tests with inline function definitions to avoid cascading source (see test-phase5-observability.sh)

## Remaining Phases (for reference)

| Phase | Name | LOE | ROI | Status |
|-------|------|-----|-----|--------|
| 1 | Critical Bug Fixes & Safety | S | Critical | **DONE** (PR #681) |
| 2 | Shared Pipeline Library | M | High | **DONE** (PR #682) |
| 3 | Interactive Recovery & Phase Control | M | High | **DONE** (PR #684) |
| 4 | Dry-Run Mode | M | High | **DONE** (PR #686) |
| 5 | Observability & Diagnostics | S | Medium | **DONE** (PR #689) |
| 6 | State Machine Hardening | M | Medium | **← YOU ARE HERE** |
| 7 | UX Polish & CLI Consistency | S | Medium | Pending |

---

## CI/CD Note

Do NOT modify any `.github/workflows/` files — CI/CD improvements are deferred to a separate session to avoid conflicts with recent GitHub Actions refactoring.
