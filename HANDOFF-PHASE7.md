# DIVE CLI Pipeline Overhaul — Phase 7 Handoff Prompt

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

Tests: 96/96 new across 18 suites (0 regressions).

### Phase 6 (COMPLETED — PR #690)
Branch: `feat/cli-pipeline-phase6-state-machine`
Commit: `b5ca2c94` on top of `bd9ecd34`

**State machine hardening — 8 files changed:**

1. **6a: State transition validation** — Valid transition matrix (`_PIPELINE_VALID_TRANSITIONS`), `pipeline_validate_state_transition()` with `--force` override, `pipeline_validated_set_state()` wrapping `deployment_set_state`.

2. **6b: Stuck deployment detection** — File-based heartbeat tracking in `.dive-state/heartbeat/`, configurable per-state timeouts (INITIALIZING: 5m, DEPLOYING: 30m, CONFIGURING: 20m, VERIFYING: 15m), `pipeline_detect_stuck()`, `pipeline_check_stuck_before_lock()` for interactive/non-interactive handling. Heartbeat integrated into hub and spoke pipeline loops.

3. **6c: Deployment state audit** — `./dive hub state [--repair]` and `./dive spoke state CODE [--repair]`. `pipeline_state_show()` displays state, heartbeat, checkpoints, recent logs. `pipeline_state_audit()` detects checkpoint/state mismatches and stale heartbeats; repair mode auto-fixes.

4. **6d: State cleanup on nuke** — `pipeline_state_cleanup()` integrated into nuke cleanup flow. `--preserve-logs` flag keeps deployment logs through nuke.

Tests: 85/85 new across 8 suites (0 regressions on Phase 1–5).

---

## Phase 7 Task: UX Polish & CLI Consistency

**LOE: Small | ROI: Medium | Audit Issues: #29, #30, #31**

### Goal
Standardize the CLI user experience: unify help text formatting across all modules, consolidate flag naming conventions, add missing commands to the global help, and ensure error messages are consistently actionable. This is the final phase of the pipeline overhaul.

### UX Inconsistencies Identified

**A. Help text formatting mismatch:**
- `utilities/help.sh` (`cmd_help()`) uses color-coded box headers (`${BOLD}${CYAN}║${NC}`) and section headings
- `deployment/hub.sh` uses plain `echo "Commands:"` with 2-space indentation
- `deployment/spoke.sh` uses a heredoc (`cat << 'EOF'`) — 66 lines of help vs hub's 44 lines
- Global help (`cmd_help()`) is missing Phase 3–6 commands: `phases`, `diagnose`, `history`, `state`

**B. Confirmation flag inconsistency:**
- `deploy-nuke.sh`: `--confirm`, `--yes`, `-y` (confirmation) and separate `--force`, `-f` (force)
- `spoke.sh`: `--force` for "deploy even if already deployed"
- `pipeline-common.sh`: `--force` for state transition override
- No unified documentation of which flags mean what

**C. Command naming inconsistencies:**
- Hub has `reset` but spoke has no equivalent (uses `repair`)
- Both hub and spoke accept `up`/`start` and `down`/`stop` as aliases — undocumented in global help
- `verify` vs `health` used interchangeably in spoke.sh (`verify|health)`)
- Top-level `./dive health` and `./dive status` are separate from `./dive hub status`

**D. Error message inconsistencies:**
- Some functions use `log_error "Usage: ..."` (vault modules)
- Some use plain `echo "Usage: ..."` (hub.sh, spoke.sh)
- Some errors include follow-up instructions ("Run: ./dive hub deploy --resume"), most don't
- `log_error` writes to stdout (not stderr) — documented but confusing

**E. Missing documentation in global help:**
- Pipeline commands added in Phases 3-6 not reflected in `cmd_help()`: `phases`, `diagnose`, `history`, `state`
- `--preserve-logs` (Phase 6) not in global help `--dry-run` section
- Deploy phase control flags (`--from-phase`, `--skip-phase`, `--only-phase`) not in global help

### Changes Required

**7a. Standardize help text format**
- Define a help text format standard: use `echo` with consistent indentation (not heredoc)
- Align `hub.sh` help and `spoke.sh` help to use same structure: Commands → Deploy Options → Phase Options → Examples
- Both should have same section headers and indentation pattern
- Keep spoke's extra sections (Zero-Config, ECR-Based, etc.) but match formatting

**7b. Update global help (`cmd_help()`) with Phase 3–6 commands**
- Add to Hub Commands section: `hub phases [--timing]`, `hub diagnose`, `hub history`, `hub state [--repair]`
- Add to Spoke Commands section: `spoke phases CODE`, `spoke diagnose CODE`, `spoke history [CODE]`, `spoke state CODE [--repair]`
- Add a "Pipeline Options" section documenting: `--resume`, `--from-phase`, `--skip-phase`, `--only-phase`, `--dry-run`, `--force-build`, `--preserve-logs`
- Add a "Diagnostics & Observability" section

**7c. Standardize confirmation/force flags**
- Document the semantic difference: `--confirm/--yes/-y` = "I acknowledge this destructive action" (nuke), `--force/-f` = "override safety checks" (redeploy, state override)
- Add a comment block in `common.sh` or `pipeline-common.sh` documenting the flag taxonomy
- Ensure spoke deploy's `--force` help text clarifies "force redeploy even if already deployed"

**7d. Standardize error messages**
- Audit all `echo "Usage: ..."` in dispatch functions and convert to `log_error` for consistency
- Add actionable follow-up to key error messages (e.g., "Module not loaded" → "Module not loaded. Try: ./dive hub deploy first")
- Ensure all "not available" errors in hub.sh and spoke.sh dispatchers include a hint about what to do

**7e. Unify command aliases**
- Document that `up`/`start` and `down`/`stop` are equivalent in both hub and spoke help text
- Document that `verify`/`health` are equivalent in spoke help text
- Consider whether `hub reset` and `spoke repair` should be aligned (both available in both?)

### Files to Modify
- `scripts/dive-modules/utilities/help.sh` — update `cmd_help()` with Phase 3–6 commands
- `scripts/dive-modules/deployment/hub.sh` — standardize help text format
- `scripts/dive-modules/deployment/spoke.sh` — standardize help text format, align with hub
- `scripts/dive-modules/deployment/pipeline-common.sh` — add flag taxonomy comment block
- `scripts/dive-modules/deploy-nuke.sh` — clarify --confirm vs --force in help text
- `scripts/dive-modules/common.sh` — minor: add flag convention comment (optional)

### Tests
- Shell tests: Help text output contains expected sections and commands
- Shell tests: All module dispatchers print help on unknown command
- Shell tests: Error messages include actionable hints
- Run existing test suites (0 regressions)

---

## Instructions

1. **Branch from Phase 6 branch** (or main if merged): `git checkout -b feat/cli-pipeline-phase7-ux-polish`
2. **Read and understand** the existing code before modifying:
   - `scripts/dive-modules/utilities/help.sh` — global help (cmd_help)
   - `scripts/dive-modules/deployment/hub.sh` — hub dispatcher + help
   - `scripts/dive-modules/deployment/spoke.sh` — spoke dispatcher + help
   - `scripts/dive-modules/deploy-nuke.sh` — nuke flag parsing + help
   - `scripts/dive-modules/deployment/pipeline-common.sh` — pipeline infrastructure
3. **Implement changes 7a through 7e** as described above
4. **Write shell tests** in `scripts/dive-modules/deployment/__tests__/test-phase7-ux-polish.sh`
5. **Run shellcheck** on all modified files
6. **Run existing test suites** to verify zero regressions:
   - `bash scripts/dive-modules/orchestration/__tests__/test-phase1-fixes.sh`
   - `bash scripts/dive-modules/deployment/__tests__/test-phase2-shared-library.sh`
   - `bash scripts/dive-modules/deployment/__tests__/test-phase3-interactive-recovery.sh`
   - `bash scripts/dive-modules/deployment/__tests__/test-phase4-dry-run.sh`
   - `bash scripts/dive-modules/deployment/__tests__/test-phase5-observability.sh`
   - `bash scripts/dive-modules/deployment/__tests__/test-phase6-state-machine.sh`
7. **Commit, push, and create PR** to main
8. **Update MEMORY.md** with Phase 7 completion notes

---

## Key Architecture Notes

- **Main CLI entry**: `./dive` bash script at project root → dispatches to `scripts/dive-modules/`
- **Common utilities**: `scripts/dive-modules/common.sh` (59K) — `log_error` writes to stdout (not stderr!)
- **Global help**: `scripts/dive-modules/utilities/help.sh` — `cmd_help()` with color-coded sections
- **Pipeline common**: `deployment/pipeline-common.sh` — phase execution, circuit breaker, lock management, SIGINT handler, error recovery, dry-run, structured logging, timing metrics, history, state validation, heartbeat, stuck detection, state audit
- **Pipeline utils**: `deployment/pipeline-utils.sh` — shared health checks, service SSOT, secret loading (Phase 2)
- **Diagnostics**: `deployment/diagnostics.sh` — container status, cert expiry, port check, disk space, log tails (Phase 5)
- **Hub deploy**: 13-phase declarative pipeline via `_PIPELINE_REG_*` arrays in `hub-pipeline.sh`
- **Spoke deploy**: 6-phase pipeline (PREFLIGHT → INITIALIZATION → DEPLOYMENT → CONFIGURATION → SEEDING → VERIFICATION)
- **Hub dispatcher**: `deployment/hub.sh` — `module_hub()` with plain echo help text
- **Spoke dispatcher**: `deployment/spoke.sh` — `module_spoke()` with heredoc help text
- **Nuke system**: `deploy-nuke.sh` (flag parsing) + `deploy-nuke-cleanup.sh` (cleanup logic)
- **Error recovery**: `orchestration/error-recovery.sh` — remediation catalog, interactive retry/skip/abort (Phase 3)
- **Phase control flags**: `--resume`, `--from-phase`, `--skip-phase`, `--only-phase`, `--dry-run` (Phase 4)
- **Phase status**: `./dive hub phases [--timing]` / `./dive spoke phases CODE [--timing]` (Phase 3+5)
- **Diagnostics CLI**: `./dive hub diagnose` / `./dive spoke diagnose CODE` (Phase 5)
- **History CLI**: `./dive hub history` / `./dive spoke history CODE` (Phase 5)
- **State CLI**: `./dive hub state [--repair]` / `./dive spoke state CODE [--repair]` (Phase 6)
- **Structured logs**: JSONL files in `.dive-state/logs/deploy-{type}-{instance}-{timestamp}.jsonl` (Phase 5)
- **Docker stub**: Tests use `docker() { echo "stub"; return 0; }; export -f docker` since Docker isn't available in test env
- **Test pattern**: Self-contained tests with inline function definitions to avoid cascading source (see test-phase6-state-machine.sh)

## Completed Phases Summary

| Phase | Name | LOE | ROI | Status |
|-------|------|-----|-----|--------|
| 1 | Critical Bug Fixes & Safety | S | Critical | **DONE** (PR #681) |
| 2 | Shared Pipeline Library | M | High | **DONE** (PR #682) |
| 3 | Interactive Recovery & Phase Control | M | High | **DONE** (PR #684) |
| 4 | Dry-Run Mode | M | High | **DONE** (PR #686) |
| 5 | Observability & Diagnostics | S | Medium | **DONE** (PR #689) |
| 6 | State Machine Hardening | M | Medium | **DONE** (PR #690) |
| 7 | UX Polish & CLI Consistency | S | Medium | **← YOU ARE HERE** |

---

## CI/CD Note

Do NOT modify any `.github/workflows/` files — CI/CD improvements are deferred to a separate session to avoid conflicts with recent GitHub Actions refactoring.
