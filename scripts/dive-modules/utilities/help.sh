#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 Help Module (Consolidated)
# =============================================================================
# CLI help and documentation
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   - help.sh
# =============================================================================

# Prevent multiple sourcing
[ -n "$DIVE_UTILITIES_HELP_LOADED" ] && return 0
export DIVE_UTILITIES_HELP_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

UTILITIES_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$UTILITIES_DIR")"

if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# HELP FUNCTIONS
# =============================================================================

##
# Display comprehensive help
##
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
    echo "  --env <env>         Set environment: local, gcp, pilot (default: local)"
    echo "  --instance <inst>   Set instance code (default: usa)"
    echo "  --dry-run           Show what would be done without executing"
    echo "  --verbose           Show detailed output"
    echo "  --quiet             Suppress non-essential output"
    echo ""
    echo -e "${BOLD}${CYAN}Hub Commands:${NC}"
    echo "  hub deploy          Deploy Hub from scratch"
    echo "  hub up              Start Hub services"
    echo "  hub down            Stop Hub services"
    echo "  hub status          Show Hub status"
    echo "  hub reset           Reset Hub to clean state"
    echo "  hub logs [service]  View Hub logs"
    echo ""
    echo -e "${BOLD}${CYAN}Spoke Commands:${NC}"
    echo "  spoke deploy <CODE>       Deploy Spoke (e.g., ALB, FRA)"
    echo "  spoke up <CODE>           Start Spoke services"
    echo "  spoke down <CODE>         Stop Spoke services"
    echo "  spoke status [CODE]       Show Spoke status"
    echo "  spoke verify <CODE>       Run verification checks"
    echo "  spoke clean-locks [CODE]  Clean stale deployment locks"
    echo ""
    echo -e "${BOLD}${CYAN}Federation Commands:${NC}"
    echo "  federation link <CODE>    Link Spoke to Hub federation"
    echo "  federation unlink <CODE>  Remove federation link"
    echo "  federation verify <CODE>  Verify federation health"
    echo "  federation status         Show overall federation status"
    echo ""
    echo -e "${BOLD}${CYAN}Secrets Commands:${NC}"
    echo "  secrets list              List all DIVE secrets in GCP"
    echo "  secrets ensure <CODE>     Ensure secrets exist for instance"
    echo "  secrets rotate <CODE>     Rotate secrets"
    echo "  secrets verify <CODE>     Verify secret access"
    echo ""
    echo -e "${BOLD}${CYAN}Orchestration Database:${NC}"
    echo "  orch-db status            Show orchestration state"
    echo "  orch-db validate          Validate state consistency"
    echo "  orch-db checkpoint        Manage deployment checkpoints"
    echo ""
    echo -e "${BOLD}${CYAN}Policy Commands:${NC}"
    echo "  policy build [--sign]     Build OPA policy bundle"
    echo "  policy push               Push bundle to OPAL server"
    echo "  policy test [pattern]     Run OPA policy tests"
    echo "  policy status             Show policy distribution status"
    echo ""
    echo -e "${BOLD}${CYAN}Terraform Commands:${NC}"
    echo "  tf plan <target>          Show Terraform plan"
    echo "  tf apply <target>         Apply Terraform configuration"
    echo "  tf destroy <target>       Destroy Terraform resources"
    echo ""
    echo -e "${BOLD}${CYAN}Cleanup Commands:${NC}"
    echo "  cleanup --all --force     Clean all Docker resources"
    echo "  cleanup hub               Clean Hub deployment"
    echo "  cleanup <CODE>            Clean specific Spoke"
    echo ""
    echo -e "${BOLD}Quick Start:${NC}"
    echo ""
    echo "  # Deploy Hub"
    echo "  ./dive hub deploy"
    echo ""
    echo "  # Deploy Spoke (Albania)"
    echo "  ./dive spoke deploy ALB"
    echo ""
    echo "  # Link Federation"
    echo "  ./dive federation link ALB"
    echo ""
    echo "  # Verify SSO"
    echo "  ./dive federation verify ALB"
    echo ""
    echo -e "${BOLD}Documentation:${NC}"
    echo "  Architecture:     docs/architecture/adr/"
    echo "  Module Structure: scripts/dive-modules/MODULE_CONSOLIDATION_ROADMAP.md"
    echo "  Hub-Spoke Guide:  docs/HUB_SPOKE_ARCHITECTURE.md"
    echo ""
}

##
# Module help
##
module_help() {
    cmd_help
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f cmd_help
export -f module_help

log_verbose "Help module loaded"
