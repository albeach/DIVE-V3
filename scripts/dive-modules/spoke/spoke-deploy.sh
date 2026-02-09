#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Deployment Module
# =============================================================================
# Commands: spoke deploy, spoke up
# Routes to the unified pipeline architecture in spoke/pipeline/
# =============================================================================
# Version: 3.0.0 (Legacy code removed)
# Date: 2026-02-07
# =============================================================================

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load orchestration state management (database-backed)
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../orchestration/state.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../orchestration/state.sh"
    # Enable dual-write mode for transition period (file + database)
    export ORCH_DB_DUAL_WRITE=true
    export ORCH_DB_SOURCE_OF_TRUTH="db"
fi

# Load orchestration framework
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../orchestration/framework.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../orchestration/framework.sh"
fi

# Load terraform module for spoke deployments
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../configuration/terraform.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../configuration/terraform.sh"
fi

# Load pipeline modules (new architecture)
_PIPELINE_DIR="$(dirname "${BASH_SOURCE[0]}")/pipeline"
if [ -f "${_PIPELINE_DIR}/spoke-pipeline.sh" ]; then
    source "${_PIPELINE_DIR}/spoke-pipeline.sh"
    export SPOKE_PIPELINE_AVAILABLE=1
else
    export SPOKE_PIPELINE_AVAILABLE=0
fi

# Mark this module as loaded
export DIVE_SPOKE_DEPLOY_LOADED=1

# =============================================================================
# DEPLOYMENT FUNCTIONS
# =============================================================================

##
# Deploy a spoke instance using the unified pipeline
#
# Arguments:
#   $1 - Instance code (e.g., NZL, FRA, DEU)
#   $2 - Instance name (optional, e.g., "New Zealand Defence")
#   $3 - Options: --force, --skip-federation
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_deploy() {
    local instance_code="${1:-}"
    local instance_name="${2:-}"
    # Export flags for use by pipeline phases
    export SKIP_FEDERATION=false

    # Parse options
    for arg in "$@"; do
        case "$arg" in
            --force)
                # Force flag - clean before deploy
                if [ -n "$instance_code" ]; then
                    spoke_containers_clean "$instance_code" "false" 2>/dev/null || true
                fi
                ;;
            --skip-federation)
                export SKIP_FEDERATION=true
                log_warn "Federation setup will be skipped (--skip-federation flag)"
                ;;
        esac
    done

    # Validate instance code
    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo ""
        echo "Usage: ./dive spoke deploy CODE [NAME]"
        echo ""
        echo "Examples:"
        echo "  ./dive spoke deploy FRA \"France Defence\""
        echo "  ./dive spoke deploy DEU \"Germany Defence\""
        echo "  ./dive spoke deploy GBR \"United Kingdom\""
        echo ""
        echo "Options:"
        echo "  --force             Clean and redeploy"
        echo "  --skip-federation   Skip federation setup (spoke will be non-functional)"
        echo ""
        return 1
    fi

    # GUARDRAIL: Prevent USA from being deployed as a spoke (2026-02-07)
    if type spoke_validate_instance_code &>/dev/null; then
        if ! spoke_validate_instance_code "$instance_code"; then
            return 1
        fi
    fi

    # GUARDRAIL: Require Vault provisioning before spoke deployment
    if [ "${SECRETS_PROVIDER:-}" = "vault" ]; then
        # Load vault module if not already available
        if ! type vault_spoke_is_provisioned &>/dev/null; then
            source "$(dirname "${BASH_SOURCE[0]}")/../vault/module.sh" 2>/dev/null || true
        fi
        if type vault_spoke_is_provisioned &>/dev/null; then
            if ! vault_spoke_is_provisioned "$(lower "$instance_code")"; then
                log_error "Spoke $(upper "$instance_code") not provisioned in Vault"
                log_info "Run: ./dive vault provision $(upper "$instance_code")"
                return 1
            fi
        fi
    fi

    # Normalize inputs
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    instance_code="$code_upper"

    # Set default name from NATO database or parameter
    if [ -z "$instance_name" ]; then
        # Use get_country_name to extract just the name, not full data string
        if type -t get_country_name &>/dev/null; then
            local country_name=$(get_country_name "$code_upper" 2>/dev/null)
            if [ -n "$country_name" ]; then
                instance_name="$country_name"
            else
                instance_name="$code_upper Instance"
            fi
        elif [ -n "${NATO_COUNTRIES[$code_upper]}" ]; then
            # Fallback: Extract first field (name) from pipe-delimited data
            instance_name=$(echo "${NATO_COUNTRIES[$code_upper]}" | cut -d'|' -f1)
        else
            instance_name="$code_upper Instance"
        fi
    fi

    # Deploy using pipeline architecture
    if [ "$SPOKE_PIPELINE_AVAILABLE" != "1" ]; then
        log_error "Spoke pipeline modules not found at ${_PIPELINE_DIR}/spoke-pipeline.sh"
        return 1
    fi

    log_info "Deploying $code_upper using pipeline architecture"
    spoke_pipeline_deploy "$instance_code" "$instance_name"
    return $?
}

##
# Start a spoke instance using the unified pipeline (quick mode)
#
# Arguments:
#   None (uses $INSTANCE environment variable)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_up() {
    # FIXED (2026-02-08): Accept instance code as $1, fall back to $INSTANCE, default to usa
    local instance_code="${1:-${INSTANCE:-usa}}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    # GUARDRAIL: Prevent USA from being deployed as a spoke (2026-02-07)
    if type spoke_validate_instance_code &>/dev/null; then
        if ! spoke_validate_instance_code "$instance_code"; then
            return 1
        fi
    fi

    # Check if spoke is initialized
    if [ ! -f "$spoke_dir/docker-compose.yml" ]; then
        log_error "Spoke not initialized. Run: ./dive spoke init <CODE> <NAME>"
        return 1
    fi

    # Start using pipeline architecture
    if [ "$SPOKE_PIPELINE_AVAILABLE" != "1" ]; then
        log_error "Spoke pipeline modules not found at ${_PIPELINE_DIR}/spoke-pipeline.sh"
        return 1
    fi

    log_info "Starting $code_upper using pipeline architecture"
    spoke_pipeline_up "$instance_code"
    return $?
}
