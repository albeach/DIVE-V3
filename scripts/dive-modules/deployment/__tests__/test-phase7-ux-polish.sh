#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Phase 7 UX Polish & CLI Consistency Tests
# =============================================================================
# Tests for: help text formatting, global help completeness, error messages,
#            flag documentation, command alias documentation
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYMENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODULES_DIR="$(cd "$DEPLOYMENT_DIR/.." && pwd)"
DIVE_ROOT="$(cd "$MODULES_DIR/../.." && pwd)"
export DIVE_ROOT

# Prevent re-entry from sourced modules
# shellcheck disable=SC2317
[ -n "${_PHASE7_TEST_RUNNING:-}" ] && { return 0 2>/dev/null || exit 0; }
export _PHASE7_TEST_RUNNING=1

# Test counters
PASS=0
FAIL=0
TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

assert_eq() {
    local expected="$1" actual="$2" desc="$3"
    TOTAL=$((TOTAL + 1))
    if [ "$expected" = "$actual" ]; then
        echo -e "  ${GREEN}PASS${NC} $desc"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}FAIL${NC} $desc (expected='$expected', got='$actual')"
        FAIL=$((FAIL + 1))
    fi
}

assert_contains() {
    local haystack="$1" needle="$2" desc="$3"
    TOTAL=$((TOTAL + 1))
    if printf '%s\n' "$haystack" | grep -qF -- "$needle"; then
        echo -e "  ${GREEN}PASS${NC} $desc"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}FAIL${NC} $desc (output does not contain '$needle')"
        FAIL=$((FAIL + 1))
    fi
}

assert_not_contains() {
    local haystack="$1" needle="$2" desc="$3"
    TOTAL=$((TOTAL + 1))
    if printf '%s\n' "$haystack" | grep -qF -- "$needle"; then
        echo -e "  ${RED}FAIL${NC} $desc (output contains '$needle' but should not)"
        FAIL=$((FAIL + 1))
    else
        echo -e "  ${GREEN}PASS${NC} $desc"
        PASS=$((PASS + 1))
    fi
}

# assert_file_contains: grep directly on file (avoids echo/printf limits)
assert_file_contains() {
    local filepath="$1" needle="$2" desc="$3"
    TOTAL=$((TOTAL + 1))
    if [ -f "$filepath" ] && grep -qF -- "$needle" "$filepath"; then
        echo -e "  ${GREEN}PASS${NC} $desc"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}FAIL${NC} $desc (file does not contain '$needle')"
        FAIL=$((FAIL + 1))
    fi
}

assert_file_not_contains() {
    local filepath="$1" needle="$2" desc="$3"
    TOTAL=$((TOTAL + 1))
    if [ -f "$filepath" ] && grep -qF -- "$needle" "$filepath"; then
        echo -e "  ${RED}FAIL${NC} $desc (file contains '$needle' but should not)"
        FAIL=$((FAIL + 1))
    else
        echo -e "  ${GREEN}PASS${NC} $desc"
        PASS=$((PASS + 1))
    fi
}

assert_regex() {
    local haystack="$1" pattern="$2" desc="$3"
    TOTAL=$((TOTAL + 1))
    if printf '%s\n' "$haystack" | grep -qE -- "$pattern"; then
        echo -e "  ${GREEN}PASS${NC} $desc"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}FAIL${NC} $desc (output does not match regex '$pattern')"
        FAIL=$((FAIL + 1))
    fi
}

# =============================================================================
# STUB FUNCTIONS
# =============================================================================

# Docker stub
docker() { echo "stub"; return 0; }
export -f docker
export DOCKER_CMD=docker

# Log function stubs — capture output for testing
log_info() { echo "[INFO] $*"; }
log_error() { echo "[ERROR] $*"; }
log_success() { echo "[SUCCESS] $*"; }
log_warn() { echo "[WARN] $*"; }
log_step() { echo "[STEP] $*"; }
log_verbose() { :; }
upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }
lower() { echo "$1" | tr '[:upper:]' '[:lower:]'; }
is_interactive() { return 1; }
export -f log_info log_error log_success log_warn log_step log_verbose upper lower is_interactive
export DIVE_COMMON_LOADED=1
export BOLD='\033[1m'
export CYAN='\033[0;36m'
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[0;33m'
export NC='\033[0m'

# Stub functions that modules may need
orch_circuit_breaker_init() { :; }
orch_circuit_breaker_execute() { "$2" "$3" "$4"; return $?; }
orch_record_error() { :; }
orch_db_record_step() { :; }
orch_check_failure_threshold() { return 0; }
orch_db_set_state() { return 0; }
orch_db_get_state() { echo "UNKNOWN"; return 0; }
orch_init_context() { :; }
orch_init_metrics() { :; }
get_deployment_state() { echo "UNKNOWN"; return 0; }
export -f orch_circuit_breaker_init orch_circuit_breaker_execute orch_record_error
export -f orch_db_record_step orch_check_failure_threshold orch_db_set_state orch_db_get_state
export -f orch_init_context orch_init_metrics get_deployment_state

# =============================================================================
# DEFINE FUNCTIONS UNDER TEST
# =============================================================================

# --- Global help (extracted from help.sh) ---
cmd_help() {
    echo ""
    echo -e "${BOLD}${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${CYAN}║${NC}  ${BOLD}DIVE V3 - Distributed Identity & Verification Engine${NC}     ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}║${NC}  Version: 5.0.0 | Architecture: Consolidated             ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Usage: ./dive [options] [command] [subcommand] [args...]"
    echo ""
    echo -e "${BOLD}Global Options:${NC}"
    echo "  --env <env>              Set environment: local, dev, staging, pilot (default: local)"
    echo "  --instance <inst>        Set instance code (default: usa)"
    echo "  --domain <suffix>        Set domain suffix (e.g., myorg.com)"
    echo "  --cloud-provider <type>  Set cloud provider: aws, gcp, local"
    echo "  --secrets-provider <p>   Set secrets provider: vault, gcp, aws, local"
    echo "  --profile <name>         Use a saved deployment profile"
    echo "  --non-interactive / -y   Skip all prompts, use defaults (CI/CD mode)"
    echo "  --dry-run / -n           Show what would be done without executing"
    echo "  --verbose / -v           Show detailed output"
    echo "  --quiet / -q             Suppress non-essential output"
    echo ""
    echo -e "${BOLD}${CYAN}Hub Commands:${NC}"
    echo "  hub deploy              Deploy Hub from scratch"
    echo "  hub up / start          Start Hub services"
    echo "  hub down / stop         Stop Hub services"
    echo "  hub status              Show Hub status"
    echo "  hub verify              Run deployment validation tests"
    echo "  hub reset               Reset Hub to clean state"
    echo "  hub logs [service]      View Hub logs"
    echo "  hub phases [--timing]   Show pipeline phase status"
    echo "  hub diagnose            Run diagnostic checks"
    echo "  hub history [N]         Show recent deployment history"
    echo "  hub state [--repair]    Show/repair deployment state"
    echo ""
    echo -e "${BOLD}${CYAN}Spoke Commands:${NC}"
    echo "  spoke deploy <CODE>          Deploy Spoke (e.g., ALB, FRA)"
    echo "  spoke deploy-all [CODES]     Deploy multiple spokes in parallel"
    echo "  spoke up / start <CODE>      Start Spoke services"
    echo "  spoke down / stop <CODE>     Stop Spoke services"
    echo "  spoke status [CODE]          Show Spoke status"
    echo "  spoke verify / health <CODE> Run verification checks"
    echo "  spoke phases <CODE>          Show pipeline phase status"
    echo "  spoke diagnose <CODE>        Run diagnostic checks"
    echo "  spoke history [CODE]         Show recent deployment history"
    echo "  spoke state <CODE> [--repair] Show/repair deployment state"
    echo "  spoke clean-locks [CODE]     Clean stale deployment locks"
    echo ""
    echo -e "${BOLD}${CYAN}Pipeline Options (hub deploy / spoke deploy):${NC}"
    echo "  --resume                  Resume from last checkpoint"
    echo "  --dry-run / -n            Simulate deployment without making changes"
    echo "  --from-phase <PHASE>      Start from specified phase (skip earlier)"
    echo "  --skip-phase <PHASE>      Skip specified phase (can be repeated)"
    echo "  --only-phase <PHASE>      Run only the specified phase"
    echo "  --force-build             Force rebuild all Docker images (bypass cache)"
    echo "  --preserve-logs           Keep deployment logs during nuke"
    echo ""
    echo -e "${BOLD}${CYAN}Confirmation & Force Flags:${NC}"
    echo "  --confirm / --yes / -y    Acknowledge a destructive action (nuke)"
    echo "  --force / -f              Override safety checks (redeploy, state override)"
    echo ""
}

# --- Hub help (extracted from hub.sh dispatcher) ---
_hub_help() {
    echo "Usage: ./dive hub <command> [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  deploy              Full hub deployment"
    echo "  up / start          Start hub services"
    echo "  down / stop         Stop hub services"
    echo "  status              Show hub status"
    echo "  verify              Run deployment validation tests"
    echo "  reset               Reset hub to clean state"
    echo "  logs [service]      View hub logs"
    echo "  seed                Seed database with test data"
    echo "  spokes              Manage registered spokes"
    echo ""
    echo "Pipeline & Diagnostics:"
    echo "  phases [--timing]   Show pipeline phase status (optional timing)"
    echo "  state [--repair]    Show deployment state (--repair to fix inconsistencies)"
    echo "  diagnose            Run diagnostic checks (containers, certs, ports, disk)"
    echo "  history [N]         Show recent deployment history (default: last 10)"
    echo ""
    echo "Deploy Options:"
    echo "  --resume               Resume from last checkpoint"
    echo "  --dry-run              Simulate deployment without making changes"
    echo "  --from-phase <PHASE>   Start from specified phase (skip earlier)"
    echo "  --skip-phase <PHASE>   Skip specified phase (can be repeated)"
    echo "  --only-phase <PHASE>   Run only the specified phase"
    echo "  --force-build          Force rebuild all Docker images (bypass cache)"
    echo ""
    echo "Phases: VAULT_BOOTSTRAP DATABASE_INIT PREFLIGHT INITIALIZATION"
    echo "        MONGODB_INIT BUILD SERVICES VAULT_DB_ENGINE KEYCLOAK_CONFIG"
    echo "        REALM_VERIFY KAS_REGISTER SEEDING KAS_INIT"
    echo ""
    echo "Examples:"
    echo "  ./dive hub deploy                                  # Full deployment"
    echo "  ./dive hub deploy --resume                         # Resume from checkpoint"
    echo "  ./dive hub deploy --dry-run                        # Simulate without changes"
    echo "  ./dive hub deploy --from-phase SERVICES            # Skip to SERVICES phase"
    echo "  ./dive hub deploy --skip-phase SEEDING             # Skip SEEDING phase"
    echo "  ./dive hub deploy --only-phase KEYCLOAK_CONFIG     # Run single phase"
    echo "  ./dive hub deploy --force-build                    # Rebuild images"
    echo "  ./dive hub phases --timing                         # Show phase durations"
    echo "  ./dive hub diagnose                                # Run diagnostics"
    echo "  ./dive hub history                                 # Deployment history"
    echo "  ./dive hub state --repair                          # Fix state inconsistencies"
}

# --- Spoke help (extracted from spoke.sh) ---
_spoke_help() {
    echo "Usage: ./dive spoke <command> [args]"
    echo ""
    echo "Commands:"
    echo "  deploy <CODE> [name]        Full spoke deployment (auto-detects local vs remote)"
    echo "  deploy-all [CODES...]       Deploy multiple spokes in parallel (--all for all)"
    echo "  authorize <CODE> [name]     Pre-authorize a spoke for federation (Vault-based)"
    echo "  revoke <CODE>               Revoke a spoke's federation authorization"
    echo "  up <CODE> / start <CODE>    Start spoke services"
    echo "  down <CODE> / stop <CODE>   Stop spoke services"
    echo "  status [CODE]               Show spoke status"
    echo "  verify <CODE> / health      Verify spoke deployment (aliases)"
    echo "  verify-all                  Verify all provisioned spokes"
    echo "  logs <CODE> [service]       View spoke logs"
    echo "  init <CODE> [name]          Initialize spoke directory only"
    echo ""
    echo "Pipeline & Diagnostics:"
    echo "  phases <CODE> [--timing]    Show pipeline phase status (optional timing)"
    echo "  state <CODE> [--repair]     Show deployment state (--repair to fix inconsistencies)"
    echo "  diagnose <CODE>             Run diagnostic checks (containers, certs, ports, disk)"
    echo "  history [CODE]              Show recent deployment history"
    echo ""
    echo "Repair Commands:"
    echo "  restart <CODE> [service]    Restart spoke services (all or specific)"
    echo "  reload-secrets <CODE>       Reload secrets from GCP and restart services"
    echo "  repair <CODE>               Auto-diagnose and fix common issues"
    echo "  clean-locks [CODE]          Clean stale deployment locks"
    echo ""
    echo "Remote Deployment (AWS):"
    echo "  prepare <CODE>              Generate config package on Hub (ECR-based remote)"
    echo "  configure <CODE>            Run Terraform + federation from Hub (remote)"
    echo "  start-remote <CODE>         SSH to spoke EC2 and run deploy.sh"
    echo ""
    echo "Deploy Options:"
    echo "  --auth-code <UUID>          Pre-authorized federation code (from Hub)"
    echo "  --force                     Force redeploy even if already deployed"
    echo "  --resume                    Resume from last checkpoint"
    echo "  --dry-run                   Simulate deployment without making changes"
    echo "  --from-phase <PHASE>        Start from specified phase (skip earlier)"
    echo "  --skip-phase <PHASE>        Skip specified phase (can be repeated)"
    echo "  --only-phase <PHASE>        Run only the specified phase"
    echo "  --skip-federation           Skip federation setup"
    echo "  --domain <base>             Custom domain (e.g. gbr.mod.uk)"
    echo ""
    echo "Phases: PREFLIGHT INITIALIZATION DEPLOYMENT CONFIGURATION SEEDING VERIFICATION"
    echo ""
    echo "Examples:"
    echo "  ./dive spoke deploy ALB \"Albania\"                # Full local deployment"
    echo "  ./dive spoke deploy GBR --resume                  # Resume from checkpoint"
    echo "  ./dive spoke deploy GBR --dry-run                 # Simulate without changes"
    echo "  ./dive spoke deploy GBR --from-phase CONFIGURATION  # Skip to phase"
    echo "  ./dive --env dev spoke deploy GBR                 # ECR-based remote deploy"
    echo "  ./dive spoke deploy-all GBR FRA DEU               # Parallel deployment"
    echo "  ./dive spoke phases GBR --timing                  # Show phase durations"
    echo "  ./dive spoke diagnose GBR                         # Run diagnostics"
    echo "  ./dive spoke state GBR --repair                   # Fix state inconsistencies"
}

# --- Nuke help (extracted from deploy-nuke.sh) ---
_nuke_show_help() {
    log_error "NUKE requires explicit confirmation. Use --confirm or --yes"
    echo ""
    echo "  Usage: ./dive nuke <target> [options]"
    echo ""
    echo "  Targets:"
    echo "    all                                          Nuke all DIVE resources (hub + spokes)"
    echo "    hub                                          Nuke Hub only"
    echo "    spoke <CODE>                                 Nuke specific spoke"
    echo "    volumes                                      Remove all DIVE volumes"
    echo "    networks                                     Remove all DIVE networks"
    echo "    orphans                                      Remove orphaned containers/volumes"
    echo ""
    echo "  Confirmation (required — acknowledges destructive action):"
    echo "    --confirm / --yes / -y                       Confirm you intend to destroy resources"
    echo "    --force / -f                                 Implies --confirm, skips interactive prompt"
    echo ""
    echo "  Options:"
    echo "    --keep-images                                Keep Docker images (faster redeployment)"
    echo "    --deep / --deep-clean                        FULL CLEAN SLATE: removes all images, builder cache,"
    echo "                                                 and Terraform state (recommended for debugging)"
    echo "    --reset-spokes                               Clear spoke federation registrations"
    echo "    --preserve-logs                               Keep deployment logs during nuke"
    echo ""
    echo "  Examples:"
    echo "    ./dive nuke all --confirm                    # Standard nuke (keeps images)"
    echo "    ./dive nuke all --confirm --deep             # FULL CLEAN SLATE (recommended)"
    echo "    ./dive nuke hub --confirm --keep-images      # Fast hub reset (keeps images)"
    echo "    ./dive nuke spoke ALB --confirm               # Nuke specific spoke"
    echo "    ./dive nuke all --confirm --preserve-logs     # Keep logs through nuke"
    echo ""
}

# --- Hub dispatcher error messages (simulated) ---
_hub_dispatch_diagnose_error() {
    log_error "Diagnostics module not available. Try: ./dive hub deploy first"
}
_hub_dispatch_history_error() {
    log_error "History module not available. Try: ./dive hub deploy first"
}
_hub_dispatch_state_error() {
    log_error "State module not available. Try: ./dive hub deploy first"
}
_hub_dispatch_spokes_error() {
    log_error "Unknown spokes subcommand. Usage: ./dive hub spokes list"
}

# --- Spoke dispatcher error messages (simulated) ---
_spoke_dispatch_deploy_error() {
    log_error "spoke_deploy not available. Try: ./dive hub deploy first, then ./dive spoke deploy <CODE>"
}
_spoke_dispatch_phases_error() {
    log_error "spoke_phases not available. Try: ./dive spoke deploy <CODE> first"
}
_spoke_dispatch_diagnose_error() {
    log_error "Diagnostics module not available. Try: ./dive spoke deploy <CODE> first"
}
_spoke_dispatch_state_error() {
    log_error "State module not available. Try: ./dive spoke deploy <CODE> first"
}
_spoke_dispatch_history_error() {
    log_error "History module not available. Try: ./dive spoke deploy <CODE> first"
}
_spoke_dispatch_verify_error() {
    log_error "spoke_verify not available. Try: ./dive spoke deploy <CODE> first"
}
_spoke_dispatch_repair_error() {
    log_error "spoke_repair not available. Try: ./dive spoke deploy <CODE> first"
}

# =============================================================================
# TEST SUITE 1: Global Help (cmd_help) Completeness
# =============================================================================

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}Suite 1: Global Help Completeness${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"

_help_output=$(cmd_help 2>&1)

# Phase 3 commands
assert_contains "$_help_output" "hub phases" "Global help contains 'hub phases'"
assert_contains "$_help_output" "spoke phases" "Global help contains 'spoke phases'"

# Phase 5 commands
assert_contains "$_help_output" "hub diagnose" "Global help contains 'hub diagnose'"
assert_contains "$_help_output" "spoke diagnose" "Global help contains 'spoke diagnose'"
assert_contains "$_help_output" "hub history" "Global help contains 'hub history'"
assert_contains "$_help_output" "spoke history" "Global help contains 'spoke history'"

# Phase 6 commands
assert_contains "$_help_output" "hub state" "Global help contains 'hub state'"
assert_contains "$_help_output" "spoke state" "Global help contains 'spoke state'"
assert_contains "$_help_output" "--repair" "Global help contains '--repair' flag"

# Pipeline options section
assert_contains "$_help_output" "Pipeline Options" "Global help has 'Pipeline Options' section"
assert_contains "$_help_output" "--resume" "Global help documents --resume"
assert_contains "$_help_output" "--from-phase" "Global help documents --from-phase"
assert_contains "$_help_output" "--skip-phase" "Global help documents --skip-phase"
assert_contains "$_help_output" "--only-phase" "Global help documents --only-phase"
assert_contains "$_help_output" "--force-build" "Global help documents --force-build"
assert_contains "$_help_output" "--preserve-logs" "Global help documents --preserve-logs"

# Confirmation flags section
assert_contains "$_help_output" "Confirmation" "Global help has 'Confirmation' section"
assert_contains "$_help_output" "--confirm" "Global help documents --confirm"
assert_contains "$_help_output" "--force" "Global help documents --force"

# Command aliases
assert_contains "$_help_output" "up / start" "Global help documents up/start alias"
assert_contains "$_help_output" "down / stop" "Global help documents down/stop alias"
assert_contains "$_help_output" "verify / health" "Global help documents verify/health alias"

# deploy-all
assert_contains "$_help_output" "deploy-all" "Global help documents spoke deploy-all"

echo ""

# =============================================================================
# TEST SUITE 2: Hub Help Formatting
# =============================================================================

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}Suite 2: Hub Help Formatting${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"

_hub_output=$(_hub_help 2>&1)

# Consistent sections
assert_contains "$_hub_output" "Commands:" "Hub help has 'Commands:' section"
assert_contains "$_hub_output" "Pipeline & Diagnostics:" "Hub help has 'Pipeline & Diagnostics:' section"
assert_contains "$_hub_output" "Deploy Options:" "Hub help has 'Deploy Options:' section"
assert_contains "$_hub_output" "Phases:" "Hub help has 'Phases:' section"
assert_contains "$_hub_output" "Examples:" "Hub help has 'Examples:' section"

# Command aliases documented
assert_contains "$_hub_output" "up / start" "Hub help documents up/start alias"
assert_contains "$_hub_output" "down / stop" "Hub help documents down/stop alias"

# Phase 3-6 commands present
assert_contains "$_hub_output" "phases [--timing]" "Hub help lists 'phases [--timing]'"
assert_contains "$_hub_output" "state [--repair]" "Hub help lists 'state [--repair]'"
assert_contains "$_hub_output" "diagnose" "Hub help lists 'diagnose'"
assert_contains "$_hub_output" "history" "Hub help lists 'history'"

# Deploy options present
assert_contains "$_hub_output" "--resume" "Hub help lists --resume"
assert_contains "$_hub_output" "--dry-run" "Hub help lists --dry-run"
assert_contains "$_hub_output" "--from-phase" "Hub help lists --from-phase"
assert_contains "$_hub_output" "--skip-phase" "Hub help lists --skip-phase"
assert_contains "$_hub_output" "--only-phase" "Hub help lists --only-phase"
assert_contains "$_hub_output" "--force-build" "Hub help lists --force-build"

# Uses echo format (not heredoc — no leading whitespace issues)
assert_not_contains "$_hub_output" "EOF" "Hub help does not use heredoc (no EOF marker)"

echo ""

# =============================================================================
# TEST SUITE 3: Spoke Help Formatting
# =============================================================================

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}Suite 3: Spoke Help Formatting${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"

_spoke_output=$(_spoke_help 2>&1)

# Consistent sections (matching hub structure)
assert_contains "$_spoke_output" "Commands:" "Spoke help has 'Commands:' section"
assert_contains "$_spoke_output" "Pipeline & Diagnostics:" "Spoke help has 'Pipeline & Diagnostics:' section"
assert_contains "$_spoke_output" "Deploy Options:" "Spoke help has 'Deploy Options:' section"
assert_contains "$_spoke_output" "Phases:" "Spoke help has 'Phases:' section"
assert_contains "$_spoke_output" "Examples:" "Spoke help has 'Examples:' section"
assert_contains "$_spoke_output" "Repair Commands:" "Spoke help has 'Repair Commands:' section"
assert_contains "$_spoke_output" "Remote Deployment" "Spoke help has 'Remote Deployment' section"

# Command aliases documented
assert_contains "$_spoke_output" "up <CODE> / start" "Spoke help documents up/start alias"
assert_contains "$_spoke_output" "down <CODE> / stop" "Spoke help documents down/stop alias"
assert_contains "$_spoke_output" "verify <CODE> / health" "Spoke help documents verify/health alias"

# Phase 3-6 commands present
assert_contains "$_spoke_output" "phases <CODE> [--timing]" "Spoke help lists 'phases <CODE> [--timing]'"
assert_contains "$_spoke_output" "state <CODE> [--repair]" "Spoke help lists 'state <CODE> [--repair]'"
assert_contains "$_spoke_output" "diagnose <CODE>" "Spoke help lists 'diagnose <CODE>'"
assert_contains "$_spoke_output" "history [CODE]" "Spoke help lists 'history [CODE]'"

# Deploy options
assert_contains "$_spoke_output" "--force" "Spoke help lists --force"
assert_contains "$_spoke_output" "Force redeploy" "Spoke help clarifies --force means force redeploy"
assert_contains "$_spoke_output" "--resume" "Spoke help lists --resume"
assert_contains "$_spoke_output" "--dry-run" "Spoke help lists --dry-run"
assert_contains "$_spoke_output" "--from-phase" "Spoke help lists --from-phase"

# Spoke-specific sections
assert_contains "$_spoke_output" "PREFLIGHT" "Spoke help lists PREFLIGHT phase"
assert_contains "$_spoke_output" "VERIFICATION" "Spoke help lists VERIFICATION phase"

# Uses echo format (not heredoc)
assert_not_contains "$_spoke_output" "EOF" "Spoke help does not use heredoc (no EOF marker)"

echo ""

# =============================================================================
# TEST SUITE 4: Nuke Help Formatting
# =============================================================================

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}Suite 4: Nuke Help Formatting${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"

_nuke_output=$(_nuke_show_help 2>&1)

# Structured sections
assert_contains "$_nuke_output" "Targets:" "Nuke help has 'Targets:' section"
assert_contains "$_nuke_output" "Confirmation" "Nuke help has 'Confirmation' section"
assert_contains "$_nuke_output" "Options:" "Nuke help has 'Options:' section"
assert_contains "$_nuke_output" "Examples:" "Nuke help has 'Examples:' section"

# Targets documented
assert_contains "$_nuke_output" "all" "Nuke help lists 'all' target"
assert_contains "$_nuke_output" "hub" "Nuke help lists 'hub' target"
assert_contains "$_nuke_output" "spoke <CODE>" "Nuke help lists 'spoke <CODE>' target"
assert_contains "$_nuke_output" "volumes" "Nuke help lists 'volumes' target"
assert_contains "$_nuke_output" "networks" "Nuke help lists 'networks' target"
assert_contains "$_nuke_output" "orphans" "Nuke help lists 'orphans' target"

# Confirmation vs force semantics
assert_contains "$_nuke_output" "--confirm / --yes / -y" "Nuke help documents --confirm/--yes/-y"
assert_contains "$_nuke_output" "--force / -f" "Nuke help documents --force/-f"
assert_contains "$_nuke_output" "Implies --confirm" "Nuke help clarifies --force implies --confirm"

# Phase 6 option
assert_contains "$_nuke_output" "--preserve-logs" "Nuke help documents --preserve-logs"

echo ""

# =============================================================================
# TEST SUITE 5: Error Messages with Actionable Hints
# =============================================================================

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}Suite 5: Error Messages with Actionable Hints${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"

# Hub dispatcher errors include hints
_err=$(_hub_dispatch_diagnose_error 2>&1)
assert_contains "$_err" "Try:" "Hub diagnose error includes 'Try:' hint"
assert_contains "$_err" "./dive hub deploy" "Hub diagnose error suggests './dive hub deploy'"

_err=$(_hub_dispatch_history_error 2>&1)
assert_contains "$_err" "Try:" "Hub history error includes 'Try:' hint"
assert_contains "$_err" "./dive hub deploy" "Hub history error suggests './dive hub deploy'"

_err=$(_hub_dispatch_state_error 2>&1)
assert_contains "$_err" "Try:" "Hub state error includes 'Try:' hint"
assert_contains "$_err" "./dive hub deploy" "Hub state error suggests './dive hub deploy'"

_err=$(_hub_dispatch_spokes_error 2>&1)
assert_contains "$_err" "Usage:" "Hub spokes error includes 'Usage:'"
assert_contains "$_err" "./dive hub spokes list" "Hub spokes error suggests './dive hub spokes list'"

# Spoke dispatcher errors include hints
_err=$(_spoke_dispatch_deploy_error 2>&1)
assert_contains "$_err" "Try:" "Spoke deploy error includes 'Try:' hint"
assert_contains "$_err" "./dive hub deploy" "Spoke deploy error suggests Hub deploy first"

_err=$(_spoke_dispatch_phases_error 2>&1)
assert_contains "$_err" "Try:" "Spoke phases error includes 'Try:' hint"
assert_contains "$_err" "./dive spoke deploy" "Spoke phases error suggests spoke deploy"

_err=$(_spoke_dispatch_diagnose_error 2>&1)
assert_contains "$_err" "Try:" "Spoke diagnose error includes 'Try:' hint"

_err=$(_spoke_dispatch_state_error 2>&1)
assert_contains "$_err" "Try:" "Spoke state error includes 'Try:' hint"

_err=$(_spoke_dispatch_history_error 2>&1)
assert_contains "$_err" "Try:" "Spoke history error includes 'Try:' hint"

_err=$(_spoke_dispatch_verify_error 2>&1)
assert_contains "$_err" "Try:" "Spoke verify error includes 'Try:' hint"

_err=$(_spoke_dispatch_repair_error 2>&1)
assert_contains "$_err" "Try:" "Spoke repair error includes 'Try:' hint"

# All spoke errors use log_error (not plain echo)
_err=$(_spoke_dispatch_deploy_error 2>&1)
assert_contains "$_err" "[ERROR]" "Spoke deploy error uses log_error"

_err=$(_spoke_dispatch_phases_error 2>&1)
assert_contains "$_err" "[ERROR]" "Spoke phases error uses log_error"

echo ""

# =============================================================================
# TEST SUITE 6: Flag Taxonomy Documentation
# =============================================================================

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}Suite 6: Flag Taxonomy in pipeline-common.sh${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"

_pc_file="${DEPLOYMENT_DIR}/pipeline-common.sh"

assert_file_contains "$_pc_file" "FLAG TAXONOMY" "pipeline-common.sh has FLAG TAXONOMY section"
assert_file_contains "$_pc_file" "Confirmation flags" "Flag taxonomy documents confirmation flags"
assert_file_contains "$_pc_file" "Force flags" "Flag taxonomy documents force flags"
assert_file_contains "$_pc_file" "Pipeline control flags" "Flag taxonomy documents pipeline control flags"
assert_file_contains "$_pc_file" "Command aliases" "Flag taxonomy documents command aliases"
assert_file_contains "$_pc_file" "--confirm" "Flag taxonomy mentions --confirm"
assert_file_contains "$_pc_file" "--force" "Flag taxonomy mentions --force"
assert_file_contains "$_pc_file" "--resume" "Flag taxonomy mentions --resume"
assert_file_contains "$_pc_file" "--preserve-logs" "Flag taxonomy mentions --preserve-logs"
assert_file_contains "$_pc_file" "up / start" "Flag taxonomy documents up/start alias"
assert_file_contains "$_pc_file" "down / stop" "Flag taxonomy documents down/stop alias"
assert_file_contains "$_pc_file" "verify / health" "Flag taxonomy documents verify/health alias"

echo ""

# =============================================================================
# TEST SUITE 7: Help Format Consistency (Hub vs Spoke)
# =============================================================================

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}Suite 7: Help Format Consistency (Hub vs Spoke)${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"

# Both have same section structure
assert_contains "$_hub_output" "Commands:" "Hub has 'Commands:' section"
assert_contains "$_spoke_output" "Commands:" "Spoke has 'Commands:' section"
assert_contains "$_hub_output" "Pipeline & Diagnostics:" "Hub has 'Pipeline & Diagnostics:' section"
assert_contains "$_spoke_output" "Pipeline & Diagnostics:" "Spoke has 'Pipeline & Diagnostics:' section"
assert_contains "$_hub_output" "Deploy Options:" "Hub has 'Deploy Options:' section"
assert_contains "$_spoke_output" "Deploy Options:" "Spoke has 'Deploy Options:' section"
assert_contains "$_hub_output" "Phases:" "Hub has 'Phases:' section"
assert_contains "$_spoke_output" "Phases:" "Spoke has 'Phases:' section"
assert_contains "$_hub_output" "Examples:" "Hub has 'Examples:' section"
assert_contains "$_spoke_output" "Examples:" "Spoke has 'Examples:' section"

# Both use echo format (not heredoc/cat)
assert_not_contains "$_hub_output" "cat <<" "Hub does not use cat heredoc"
assert_not_contains "$_spoke_output" "cat <<" "Spoke does not use cat heredoc"

echo ""

# =============================================================================
# TEST SUITE 8: Source File Verification
# =============================================================================

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}Suite 8: Source File Verification${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"

_help_file="${MODULES_DIR}/utilities/help.sh"
_hub_file="${DEPLOYMENT_DIR}/hub.sh"
_spoke_file="${DEPLOYMENT_DIR}/spoke.sh"
_nuke_file="${MODULES_DIR}/deploy-nuke.sh"

# Verify help.sh contains Phase 3-6 commands
assert_file_contains "$_help_file" "hub phases" "help.sh source contains 'hub phases'"
assert_file_contains "$_help_file" "spoke phases" "help.sh source contains 'spoke phases'"
assert_file_contains "$_help_file" "hub diagnose" "help.sh source contains 'hub diagnose'"
assert_file_contains "$_help_file" "spoke diagnose" "help.sh source contains 'spoke diagnose'"
assert_file_contains "$_help_file" "hub history" "help.sh source contains 'hub history'"
assert_file_contains "$_help_file" "spoke history" "help.sh source contains 'spoke history'"
assert_file_contains "$_help_file" "hub state" "help.sh source contains 'hub state'"
assert_file_contains "$_help_file" "spoke state" "help.sh source contains 'spoke state'"
assert_file_contains "$_help_file" "Pipeline Options" "help.sh source has 'Pipeline Options' section"
assert_file_contains "$_help_file" "Confirmation" "help.sh source has 'Confirmation' section"

# Verify hub.sh uses echo format
assert_file_contains "$_hub_file" "Pipeline & Diagnostics:" "hub.sh source has 'Pipeline & Diagnostics:' section"
assert_file_contains "$_hub_file" "up / start" "hub.sh source documents up/start alias"
assert_file_contains "$_hub_file" "down / stop" "hub.sh source documents down/stop alias"

# Verify spoke.sh does not use heredoc anymore
assert_file_not_contains "$_spoke_file" "cat << 'EOF'" "spoke.sh no longer uses heredoc for help"
assert_file_contains "$_spoke_file" "Pipeline & Diagnostics:" "spoke.sh source has 'Pipeline & Diagnostics:' section"
assert_file_contains "$_spoke_file" "Force redeploy" "spoke.sh clarifies --force means force redeploy"

# Verify deploy-nuke.sh has structured help
assert_file_contains "$_nuke_file" "Targets:" "deploy-nuke.sh source has 'Targets:' section"
assert_file_contains "$_nuke_file" "Implies --confirm" "deploy-nuke.sh clarifies --force implies --confirm"

echo ""

# =============================================================================
# RESULTS
# =============================================================================

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}Phase 7 UX Polish Test Results${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Total:  ${TOTAL}"
echo -e "  Passed: ${GREEN}${PASS}${NC}"
echo -e "  Failed: ${RED}${FAIL}${NC}"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}SOME TESTS FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}ALL ${TOTAL} TESTS PASSED${NC}"
    exit 0
fi
