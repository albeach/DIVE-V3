#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Core CLI Entry Point (Consolidated)
# =============================================================================
# Central CLI infrastructure including help, argument parsing, and dispatch
# This module is sourced by dive-new (main entry point)
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
# =============================================================================

# Ensure we're not double-loaded
[ -n "${DIVE_CORE_CLI_LOADED:-}" ] && return 0

# Load core dependencies
CORE_DIR="$(dirname "${BASH_SOURCE[0]}")"
source "${CORE_DIR}/common.sh"
source "${CORE_DIR}/logging.sh"

# =============================================================================
# CLI VERSION AND METADATA
# =============================================================================
export DIVE_CLI_VERSION="5.0.0"
export DIVE_CLI_BUILD_DATE="2026-01-22"
export DIVE_CLI_ARCHITECTURE="consolidated"

# =============================================================================
# HELP SYSTEM
# =============================================================================

##
# Print CLI header with version info
##
print_cli_header() {
    echo ""
    echo -e "${BOLD}${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${CYAN}║${NC}  ${BOLD}DIVE V3 - Distributed Identity & Verification Engine${NC}     ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}║${NC}  Version: ${DIVE_CLI_VERSION} | Architecture: ${DIVE_CLI_ARCHITECTURE}            ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

##
# Display comprehensive help
##
cmd_help() {
    print_cli_header
    echo "Usage: ./dive [options] [command] [subcommand] [args...]"
    echo ""
    echo -e "${BOLD}Global Options:${NC}"
    echo "  --env <env>         Set environment: local, gcp, pilot (default: local)"
    echo "  --instance <inst>   Set instance: usa, fra, deu, gbr, alb (default: usa)"
    echo "  --dry-run           Show what would be done without executing"
    echo "  --verbose           Show detailed output"
    echo "  --quiet             Suppress non-essential output"
    echo ""
    echo -e "${BOLD}${CYAN}Hub Commands:${NC}"
    echo "  hub deploy            Deploy Hub from scratch"
    echo "  hub up                Start Hub services"
    echo "  hub down              Stop Hub services"
    echo "  hub status            Show Hub status"
    echo "  hub reset             Reset Hub to clean state"
    echo "  hub logs [service]    View Hub logs"
    echo ""
    echo -e "${BOLD}${CYAN}Spoke Commands:${NC}"
    echo "  spoke deploy <CODE>   Deploy Spoke (e.g., ALB, FRA)"
    echo "  spoke up <CODE>       Start Spoke services"
    echo "  spoke down <CODE>     Stop Spoke services"
    echo "  spoke status <CODE>   Show Spoke status"
    echo "  spoke health <CODE>   Health check Spoke"
    echo "  spoke verify <CODE>   Run 13-point verification"
    echo "  spoke clean-locks     Clean stale deployment locks"
    echo ""
    echo -e "${BOLD}${CYAN}Federation Commands:${NC}"
    echo "  federation link <CODE>     Link federation for cross-border SSO"
    echo "  federation verify <CODE>   Verify federation health"
    echo "  federation status          Show overall federation status"
    echo "  federation unlink <CODE>   Remove federation link"
    echo ""
    echo -e "${BOLD}${CYAN}Secrets Commands:${NC}"
    echo "  secrets ensure <CODE>      Ensure secrets exist in GCP"
    echo "  secrets rotate <CODE>      Rotate secrets"
    echo "  secrets verify             Verify secret access"
    echo ""
    echo -e "${BOLD}${CYAN}Orchestration Database:${NC}"
    echo "  orch-db migrate            Migrate state to database"
    echo "  orch-db validate           Validate state consistency"
    echo "  orch-db status             Show orchestration state"
    echo ""
    echo -e "${BOLD}${CYAN}Cleanup Commands:${NC}"
    echo "  cleanup --all --force      Clean all Docker resources (DESTRUCTIVE)"
    echo "  cleanup <CODE>             Clean specific spoke"
    echo ""
    echo -e "${BOLD}${CYAN}Policy Commands:${NC}"
    echo "  policy build               Build OPA policy bundle"
    echo "  policy push                Push bundle to OPAL"
    echo "  policy test                Run policy tests"
    echo ""
    echo -e "${BOLD}Quick Start:${NC}"
    echo ""
    echo "  # Deploy Hub"
    echo "  ./dive hub deploy"
    echo ""
    echo "  # Deploy Spoke (Albania)"
    echo "  ./dive spoke deploy ALB"
    echo ""
    echo "  # Verify Federation"
    echo "  ./dive federation verify ALB"
    echo ""
    echo -e "${BOLD}Documentation:${NC}"
    echo "  Architecture:     docs/architecture/adr/"
    echo "  Module Structure: scripts/dive-modules/MODULE_CONSOLIDATION_ROADMAP.md"
    echo ""
}

# =============================================================================
# ARGUMENT PARSING HELPERS
# =============================================================================

##
# Parse global CLI options
# Sets global variables: ENVIRONMENT, INSTANCE, DRY_RUN, VERBOSE, QUIET
#
# Arguments:
#   $@ - All CLI arguments
#
# Returns:
#   Remaining arguments after parsing globals
##
parse_global_options() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --env)
                export ENVIRONMENT="$2"
                shift 2
                ;;
            --instance)
                export INSTANCE="$2"
                shift 2
                ;;
            --dry-run|-n)
                export DRY_RUN=true
                shift
                ;;
            --verbose|-v)
                export VERBOSE=true
                shift
                ;;
            --quiet|-q)
                export QUIET=true
                shift
                ;;
            -h|--help)
                cmd_help
                exit 0
                ;;
            *)
                # Not a global option, return remaining args
                echo "$@"
                return 0
                ;;
        esac
    done
}

##
# Validate required arguments for a command
#
# Arguments:
#   $1 - Number of required args
#   $2 - Usage message
#   $@ - Actual arguments
##
validate_args() {
    local required="$1"
    local usage="$2"
    shift 2

    if [ $# -lt "$required" ]; then
        log_error "Missing required arguments"
        echo "Usage: $usage"
        return 1
    fi
    return 0
}

##
# Validate instance code format (3-letter ISO code)
#
# Arguments:
#   $1 - Instance code to validate
##
validate_instance_code() {
    local code="$1"

    if [[ ! "$code" =~ ^[A-Z]{3}$ ]]; then
        log_error "Invalid instance code: $code (must be 3-letter ISO code like USA, FRA, ALB)"
        return 1
    fi
    return 0
}

# =============================================================================
# COMMAND DISPATCH
# =============================================================================

##
# Main command dispatcher
# Routes commands to appropriate modules
#
# Arguments:
#   $1 - Command (hub, spoke, federation, etc.)
#   $@ - Remaining arguments
##
dispatch_command() {
    local command="${1:-help}"
    shift || true

    local modules_dir="${DIVE_ROOT}/scripts/dive-modules"

    case "$command" in
        # Hub operations
        hub)
            source "${modules_dir}/deployment/hub.sh"
            module_hub "$@"
            ;;

        # Spoke operations
        spoke)
            source "${modules_dir}/deployment/spoke.sh"
            module_spoke "$@"
            ;;

        # Federation operations
        federation|fed)
            source "${modules_dir}/federation/setup.sh" 2>/dev/null || \
            source "${modules_dir}/federation.sh"
            module_federation "$@"
            ;;

        # Secrets operations
        secrets)
            source "${modules_dir}/configuration/secrets.sh" 2>/dev/null || \
            source "${modules_dir}/secrets.sh"
            module_secrets "$@"
            ;;

        # Orchestration database
        orch-db)
            source "${modules_dir}/orchestration-state-db.sh"
            module_orch_db "$@"
            ;;

        # Cleanup operations
        cleanup)
            source "${modules_dir}/deployment/rollback.sh" 2>/dev/null || \
            source "${modules_dir}/deploy.sh"
            cmd_cleanup "$@"
            ;;

        # Policy operations
        policy)
            source "${modules_dir}/utilities/policy.sh" 2>/dev/null || \
            source "${modules_dir}/policy.sh"
            module_policy "$@"
            ;;

        # Terraform operations
        tf|terraform)
            source "${modules_dir}/configuration/terraform.sh"
            module_terraform "$@"
            ;;

        # Core operations (up, down, status, etc.)
        up|down|restart|logs|ps|exec)
            source "${modules_dir}/core.sh"
            case "$command" in
                up)      cmd_up "$@" ;;
                down)    cmd_down "$@" ;;
                restart) cmd_restart "$@" ;;
                logs)    cmd_logs "$@" ;;
                ps)      cmd_ps "$@" ;;
                exec)    cmd_exec "$@" ;;
            esac
            ;;

        # Status operations
        status|health|validate|info)
            source "${modules_dir}/status.sh"
            case "$command" in
                status)   cmd_status "$@" ;;
                health)   cmd_health "$@" ;;
                validate) cmd_validate "$@" ;;
                info)     cmd_info "$@" ;;
            esac
            ;;

        # Deployment operations
        deploy|reset|clean|nuke)
            source "${modules_dir}/deploy.sh"
            case "$command" in
                deploy) cmd_deploy "$@" ;;
                reset)  cmd_reset "$@" ;;
                clean)  cmd_reset "$@" ;;
                nuke)   cmd_nuke ;;
            esac
            ;;

        # SP Client operations
        sp)
            source "${modules_dir}/utilities/sp.sh" 2>/dev/null || \
            source "${modules_dir}/sp.sh"
            module_sp "$@"
            ;;

        # Pilot operations
        pilot)
            source "${modules_dir}/utilities/pilot.sh" 2>/dev/null || \
            source "${modules_dir}/pilot.sh"
            module_pilot "$@"
            ;;

        # Help
        help|--help|-h)
            cmd_help
            ;;

        # Version
        version|--version|-V)
            echo "DIVE CLI v${DIVE_CLI_VERSION} (${DIVE_CLI_BUILD_DATE})"
            echo "Architecture: ${DIVE_CLI_ARCHITECTURE}"
            ;;

        # Unknown command
        *)
            log_error "Unknown command: $command"
            echo ""
            echo "Run './dive help' for usage information."
            return 1
            ;;
    esac
}

# Mark as loaded
export DIVE_CORE_CLI_LOADED=1
