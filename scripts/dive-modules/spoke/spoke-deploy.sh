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
    if [ "${DEPLOYMENT_MODE:-local}" = "remote" ]; then
        # Remote mode: no local Hub PostgreSQL — use file-only state
        export ORCH_DB_ENABLED=false
        export ORCH_DB_DUAL_WRITE=false
        export ORCH_DB_SOURCE_OF_TRUTH="file"
    else
        # Local mode: Hub PostgreSQL available
        export ORCH_DB_DUAL_WRITE=true
        export ORCH_DB_SOURCE_OF_TRUTH="db"
    fi
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
# Normalize Hub endpoints for remote spoke deployment
#
# Accepts HUB_EXTERNAL_ADDRESS in any hub service form:
#   dev-usa-api.dive25.com / dev-usa-app.dive25.com / dev-usa-idp.dive25.com / ...
# and derives HUB_API_URL, HUB_OPAL_URL, HUB_KC_URL, HUB_VAULT_URL consistently.
##
spoke_remote_normalize_hub_endpoints() {
    # Determine source host (prefer explicit HUB_EXTERNAL_ADDRESS)
    local hub_host="${HUB_EXTERNAL_ADDRESS:-}"

    # Fallback: derive host from HUB_API_URL when provided
    if [ -z "$hub_host" ] && [ -n "${HUB_API_URL:-}" ]; then
        hub_host="${HUB_API_URL#https://}"
        hub_host="${hub_host#http://}"
        hub_host="${hub_host%%/*}"
    fi

    [ -z "$hub_host" ] && return 0

    log_verbose "Remote endpoint normalization input: HUB_EXTERNAL_ADDRESS='${HUB_EXTERNAL_ADDRESS:-}', HUB_API_URL='${HUB_API_URL:-}'"

    # Strip protocol/path if caller passed full URL by mistake
    hub_host="${hub_host#https://}"
    hub_host="${hub_host#http://}"
    hub_host="${hub_host%%/*}"

    local _prefix="${hub_host%%.*}"
    local _base="${hub_host#*.}"
    local _env_prefix="$_prefix"

    # Accept any service suffix and normalize to env prefix
    # Example: dev-usa-app -> dev-usa
    _env_prefix="${_env_prefix%-api}"
    _env_prefix="${_env_prefix%-app}"
    _env_prefix="${_env_prefix%-idp}"
    _env_prefix="${_env_prefix%-opal}"
    _env_prefix="${_env_prefix%-vault}"

    # Guard against invalid input like bare domain without env/service prefix
    if [ -z "$_env_prefix" ] || [ "$_env_prefix" = "$_base" ]; then
        log_warn "Could not normalize Hub endpoints from HUB_EXTERNAL_ADDRESS=${hub_host}"
        return 0
    fi

    export HUB_EXTERNAL_ADDRESS="${_env_prefix}-api.${_base}"
    export HUB_API_URL="https://${_env_prefix}-api.${_base}"
    export HUB_KC_URL="https://${_env_prefix}-idp.${_base}"
    export HUB_OPAL_URL="https://${_env_prefix}-opal.${_base}"
    export HUB_VAULT_URL="https://${_env_prefix}-vault.${_base}"

    log_info "Remote mode: normalized Hub endpoints from ${hub_host}"
    log_info "  API:  ${HUB_API_URL}"
    log_info "  IdP:  ${HUB_KC_URL}"
    log_info "  OPAL: ${HUB_OPAL_URL}"
}

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
    export SPOKE_CUSTOM_DOMAIN=""
    export SPOKE_AUTH_CODE=""
    export DIVE_SKIP_PHASES=""
    export DIVE_ONLY_PHASE=""
    export DIVE_FROM_PHASE=""
    export DIVE_DRY_RUN="${DIVE_DRY_RUN:-${DRY_RUN:-false}}"
    local spoke_resume_mode=false

    # Parse options (handle both --key value and positional args)
    local skip_next=false
    local i
    for i in $(seq 1 $#); do
        if [ "$skip_next" = true ]; then
            skip_next=false
            continue
        fi
        local arg="${!i}"
        case "$arg" in
            --force)
                # Force flag - clean before deploy
                if [ -n "$instance_code" ]; then
                    spoke_containers_clean "$instance_code" "false" 2>/dev/null || true
                fi
                ;;
            --resume)
                spoke_resume_mode=true
                ;;
            --dry-run)
                DIVE_DRY_RUN="true"
                ;;
            --skip-phase)
                local next=$((i + 1))
                local _phase="${!next:-}"
                if [ -n "$_phase" ]; then
                    _phase=$(echo "$_phase" | tr '[:lower:]' '[:upper:]')
                    DIVE_SKIP_PHASES="${DIVE_SKIP_PHASES:+$DIVE_SKIP_PHASES }${_phase}"
                    skip_next=true
                else
                    log_error "--skip-phase requires a phase name"
                    log_info "Valid phases: PREFLIGHT INITIALIZATION DEPLOYMENT CONFIGURATION SEEDING VERIFICATION"
                    return 1
                fi
                ;;
            --only-phase)
                local next=$((i + 1))
                DIVE_ONLY_PHASE="${!next:-}"
                if [ -n "$DIVE_ONLY_PHASE" ]; then
                    DIVE_ONLY_PHASE=$(echo "$DIVE_ONLY_PHASE" | tr '[:lower:]' '[:upper:]')
                    skip_next=true
                else
                    log_error "--only-phase requires a phase name"
                    log_info "Valid phases: PREFLIGHT INITIALIZATION DEPLOYMENT CONFIGURATION SEEDING VERIFICATION"
                    return 1
                fi
                ;;
            --from-phase)
                local next=$((i + 1))
                DIVE_FROM_PHASE="${!next:-}"
                if [ -n "$DIVE_FROM_PHASE" ]; then
                    DIVE_FROM_PHASE=$(echo "$DIVE_FROM_PHASE" | tr '[:lower:]' '[:upper:]')
                    skip_next=true
                else
                    log_error "--from-phase requires a phase name"
                    log_info "Valid phases: PREFLIGHT INITIALIZATION DEPLOYMENT CONFIGURATION SEEDING VERIFICATION"
                    return 1
                fi
                ;;
            --skip-federation)
                export SKIP_FEDERATION=true
                log_warn "Federation setup will be skipped (--skip-federation flag)"
                ;;
            --domain)
                local next=$((i + 1))
                export SPOKE_CUSTOM_DOMAIN="${!next:-}"
                skip_next=true
                if [ -n "$SPOKE_CUSTOM_DOMAIN" ]; then
                    log_info "Custom domain: $SPOKE_CUSTOM_DOMAIN"
                fi
                ;;
            --auth-code)
                local next=$((i + 1))
                export SPOKE_AUTH_CODE="${!next:-}"
                skip_next=true
                if [ -n "$SPOKE_AUTH_CODE" ]; then
                    log_info "Auth code provided: ${SPOKE_AUTH_CODE:0:8}..."
                fi
                ;;
        esac
    done

    # Validate: --skip-phase, --only-phase, --from-phase are mutually exclusive
    local _flag_count=0
    [ -n "$DIVE_SKIP_PHASES" ] && _flag_count=$((_flag_count + 1))
    [ -n "$DIVE_ONLY_PHASE" ] && _flag_count=$((_flag_count + 1))
    [ -n "$DIVE_FROM_PHASE" ] && _flag_count=$((_flag_count + 1))
    if [ $_flag_count -gt 1 ]; then
        log_error "--skip-phase, --only-phase, and --from-phase are mutually exclusive"
        return 1
    fi

    # Log phase control flags
    if [ "$DIVE_DRY_RUN" = "true" ]; then
        log_info "DRY-RUN MODE: simulating spoke deployment (no changes will be made)"
    fi
    if [ -n "$DIVE_SKIP_PHASES" ]; then
        log_info "Skipping phases: $DIVE_SKIP_PHASES"
    fi
    if [ -n "$DIVE_ONLY_PHASE" ]; then
        log_info "Running only phase: $DIVE_ONLY_PHASE"
    fi
    if [ -n "$DIVE_FROM_PHASE" ]; then
        log_info "Starting from phase: $DIVE_FROM_PHASE"
    fi

    # Validate instance code
    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo ""
        echo "Usage: ./dive spoke deploy CODE [NAME] [OPTIONS]"
        echo ""
        echo "Examples:"
        echo "  ./dive spoke deploy FRA \"France Defence\""
        echo "  ./dive spoke deploy GBR \"United Kingdom\" --auth-code <UUID>"
        echo "  ./dive spoke deploy GBR --resume"
        echo "  ./dive spoke deploy GBR --skip-phase SEEDING --skip-phase VERIFICATION"
        echo "  ./dive spoke deploy GBR --only-phase CONFIGURATION"
        echo ""
        echo "Options:"
        echo "  --auth-code <UUID>     Pre-authorized federation code (from Hub: ./dive spoke authorize)"
        echo "  --force                Clean and redeploy"
        echo "  --resume               Resume from last checkpoint"
        echo "  --dry-run              Simulate deployment without making changes"
        echo "  --from-phase <PHASE>   Start from specified phase (skip earlier phases)"
        echo "  --skip-phase <PHASE>   Skip specified phase (can be repeated)"
        echo "  --only-phase <PHASE>   Run only the specified phase"
        echo "  --skip-federation      Skip federation setup (standalone mode)"
        echo "  --domain <base>        Custom domain (e.g. gbr.mod.uk)"
        echo ""
        echo "Phases: PREFLIGHT INITIALIZATION DEPLOYMENT CONFIGURATION SEEDING VERIFICATION"
        echo ""
        return 1
    fi

    # If remote mode/environment variables are pre-set, normalize hub endpoints now.
    # This covers non-interactive usage like:
    #   HUB_EXTERNAL_ADDRESS=dev-usa-app.dive25.com DEPLOYMENT_MODE=remote ./dive spoke deploy FRA
    if [ "${DEPLOYMENT_MODE:-local}" = "remote" ] || [ -n "${HUB_EXTERNAL_ADDRESS:-}" ] || [ -n "${HUB_API_URL:-}" ]; then
        spoke_remote_normalize_hub_endpoints
    fi

    # GUARDRAIL: Prevent USA from being deployed as a spoke (2026-02-07)
    if type spoke_validate_instance_code &>/dev/null; then
        if ! spoke_validate_instance_code "$instance_code"; then
            return 1
        fi
    fi

    # =========================================================================
    # HUB DOMAIN PROMPT (zero-config remote/standalone deployment)
    # =========================================================================
    # If no Hub is detectable locally, prompt for Hub domain (30s timeout).
    # Input → federated mode (derive Hub URLs, set DEPLOYMENT_MODE=remote)
    # No input → standalone mode (SKIP_FEDERATION=true, fully local)
    # =========================================================================
    if [ -z "${HUB_EXTERNAL_ADDRESS:-}" ] && [ "${SKIP_FEDERATION:-false}" = "false" ]; then
        local _hub_containers=0
        _hub_containers=$(docker ps -q --filter "name=dive-hub" 2>/dev/null | wc -l | tr -d ' ')
        if [ "$_hub_containers" -eq 0 ]; then
            local _hub_domain=""

            if is_interactive; then
                echo ""
                echo "============================================"
                echo "  NO HUB DETECTED"
                echo "============================================"
                echo "  Enter the Hub's base API domain to federate"
                echo "  (e.g., dev-usa-api.dive25.com)"
                echo ""
                echo "  Press Enter or wait 30s for standalone mode."
                echo "============================================"
                echo -n "  Hub domain: "

                read -t 30 _hub_domain || true
                echo ""
            else
                # Non-interactive: use DIVE_HUB_DOMAIN env var or default to standalone
                _hub_domain="${DIVE_HUB_DOMAIN:-}"
                if [ -n "$_hub_domain" ]; then
                    log_info "Using Hub domain from DIVE_HUB_DOMAIN: $_hub_domain"
                else
                    log_info "Non-interactive mode: no DIVE_HUB_DOMAIN set, using standalone mode"
                fi
            fi

            if [ -n "$_hub_domain" ]; then
                # Strip protocol prefix if accidentally included
                _hub_domain="${_hub_domain#https://}"
                _hub_domain="${_hub_domain#http://}"
                _hub_domain="${_hub_domain%%/*}"

                export HUB_EXTERNAL_ADDRESS="$_hub_domain"
                export DEPLOYMENT_MODE="remote"

                # Derive Hub service URLs from domain pattern
                # e.g., "dev-usa-api.dive25.com" → prefix="dev-usa-api", base="dive25.com", env="dev-usa"
                local _prefix="${_hub_domain%%.*}"
                local _base="${_hub_domain#*.}"
                local _env_prefix="${_prefix%-api}"

                export HUB_API_URL="https://${_env_prefix}-api.${_base}"
                export HUB_KC_URL="https://${_env_prefix}-idp.${_base}"
                export HUB_OPAL_URL="https://${_env_prefix}-opal.${_base}"
                export HUB_VAULT_URL="https://${_env_prefix}-vault.${_base}"

                log_success "Hub domain set: $_hub_domain"
                log_info "  API:  $HUB_API_URL"
                log_info "  IdP:  $HUB_KC_URL"
                log_info "  OPAL: $HUB_OPAL_URL"
            else
                log_warn "No Hub domain provided — deploying in STANDALONE mode"
                log_warn "Spoke will be fully functional but NOT federated with any Hub"
                export SKIP_FEDERATION=true
                export DEPLOYMENT_MODE="standalone"
            fi
        fi
    fi

    # Standalone mode: disable orchestration DB (no Hub PostgreSQL)
    if [ "${DEPLOYMENT_MODE:-local}" = "standalone" ]; then
        export ORCH_DB_ENABLED=false
        export ORCH_DB_DUAL_WRITE=false
        export ORCH_DB_SOURCE_OF_TRUTH="file"
    fi

    # AUTO-PROVISION: Ensure Vault provisioning before spoke deployment
    # Skip for remote/standalone deployments — Vault lives on the Hub, not the spoke
    if [ "${SECRETS_PROVIDER:-}" = "vault" ] && [ "${DEPLOYMENT_MODE:-local}" != "remote" ] && [ "${DEPLOYMENT_MODE:-local}" != "standalone" ]; then
        # Load vault module if not already available
        if ! type vault_spoke_is_provisioned &>/dev/null; then
            source "$(dirname "${BASH_SOURCE[0]}")/../vault/module.sh" 2>/dev/null || true
        fi
        if type vault_spoke_is_provisioned &>/dev/null; then
            if ! vault_spoke_is_provisioned "$(lower "$instance_code")"; then
                log_info "Spoke $(upper "$instance_code") not yet provisioned in Vault — auto-provisioning..."
                if type module_vault_provision &>/dev/null; then
                    if ! module_vault_provision "$(upper "$instance_code")"; then
                        log_error "Vault auto-provisioning failed for $(upper "$instance_code")"
                        return 1
                    fi
                    log_success "Vault auto-provisioned for $(upper "$instance_code")"
                else
                    log_error "Vault provision function not available"
                    log_info "Run manually: ./dive vault provision $(upper "$instance_code")"
                    return 1
                fi
            fi
        fi
    fi

    # Normalize inputs
    local code_upper
    local code_lower
    code_upper=$(upper "$instance_code")
    code_lower=$(lower "$instance_code")
    instance_code="$code_upper"

    # Set default name from NATO database or parameter
    if [ -z "$instance_name" ]; then
        # Use get_country_name to extract just the name, not full data string
        if type -t get_country_name &>/dev/null; then
            local country_name
            country_name=$(get_country_name "$code_upper" 2>/dev/null)
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
    if [ "$spoke_resume_mode" = true ]; then
        spoke_pipeline_execute "$instance_code" "$instance_name" "resume"
    else
        spoke_pipeline_deploy "$instance_code" "$instance_name"
    fi
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
    local code_lower
    local code_upper
    code_lower=$(lower "$instance_code")
    code_upper=$(upper "$instance_code")
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
