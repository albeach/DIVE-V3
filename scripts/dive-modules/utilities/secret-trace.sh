#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Secret Tracing Utility
# =============================================================================
# Provides comprehensive secret loading tracing and validation
# Helps debug where secrets are sourced from and why loading fails
# =============================================================================

# Prevent multiple sourcing
if [ -n "${SECRET_TRACE_LOADED:-}" ]; then
    return 0
fi
export SECRET_TRACE_LOADED=1

# Trace log file
SECRET_TRACE_LOG="${DIVE_ROOT}/.secret-trace.log"

##
# Initialize secret tracing
##
secret_trace_init() {
    # Clear previous trace log
    echo "=== DIVE V3 Secret Trace Log ===" > "$SECRET_TRACE_LOG"
    echo "Started: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$SECRET_TRACE_LOG"
    echo "" >> "$SECRET_TRACE_LOG"
}

##
# Log secret trace entry
#
# Arguments:
#   $1 - Secret name
#   $2 - Source (GCP/ENV/FILE/DEFAULT)
#   $3 - Status (SUCCESS/FAIL/FALLBACK)
#   $4 - Additional context
##
secret_trace_log() {
    local secret_name="$1"
    local source="$2"
    local status="$3"
    local context="${4:-}"

    local timestamp
    timestamp=$(date -u +"%H:%M:%S")
    local log_entry="[$timestamp] $secret_name | $source | $status"

    if [ -n "$context" ]; then
        log_entry="$log_entry | $context"
    fi

    echo "$log_entry" >> "$SECRET_TRACE_LOG"

    # Also log to stderr if verbose mode enabled
    if [ "${VERBOSE:-false}" = true ]; then
        case "$status" in
            SUCCESS)  echo -e "  ${GREEN}✓${NC} $secret_name from $source" >&2 ;;
            FAIL)     echo -e "  ${RED}✗${NC} $secret_name from $source: $context" >&2 ;;
            FALLBACK) echo -e "  ${YELLOW}↻${NC} $secret_name fallback to $source: $context" >&2 ;;
        esac
    fi
}

##
# Trace GCP secret loading
#
# Arguments:
#   $1 - Secret name in GCP
#   $2 - Project ID
#
# Returns:
#   Secret value on stdout if successful
#   Empty string if failed
##
secret_trace_gcp() {
    local secret_name="$1"
    local project_id="${2:-dive25}"

    secret_trace_log "$secret_name" "GCP" "ATTEMPT" "project=$project_id"

    # Check if gcloud is available
    if ! command -v gcloud &>/dev/null; then
        secret_trace_log "$secret_name" "GCP" "FAIL" "gcloud CLI not installed"
        return 1
    fi

    # Check if authenticated
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &>/dev/null; then
        secret_trace_log "$secret_name" "GCP" "FAIL" "Not authenticated (run: gcloud auth login)"
        return 1
    fi

    # Attempt to fetch secret
    local secret_value
    if secret_value=$(gcloud secrets versions access latest --secret="$secret_name" --project="$project_id" 2>/dev/null); then
        secret_trace_log "$secret_name" "GCP" "SUCCESS" "length=${#secret_value}"
        echo "$secret_value"
        return 0
    else
        local error_msg
        error_msg=$(gcloud secrets versions access latest --secret="$secret_name" --project="$project_id" 2>&1 || true)
        secret_trace_log "$secret_name" "GCP" "FAIL" "error=$error_msg"
        return 1
    fi
}

##
# Trace environment variable loading
#
# Arguments:
#   $1 - Variable name
#
# Returns:
#   Variable value on stdout if set
#   Empty string if not set
##
secret_trace_env() {
    local var_name="$1"

    secret_trace_log "$var_name" "ENV" "ATTEMPT" "checking environment"

    if [ -n "${!var_name:-}" ]; then
        local var_value="${!var_name}"
        secret_trace_log "$var_name" "ENV" "SUCCESS" "length=${#var_value}"
        echo "$var_value"
        return 0
    else
        secret_trace_log "$var_name" "ENV" "FAIL" "not set in environment"
        return 1
    fi
}

##
# Trace .env file loading
#
# Arguments:
#   $1 - Variable name
#   $2 - .env file path
#
# Returns:
#   Variable value on stdout if found
#   Empty string if not found
##
secret_trace_file() {
    local var_name="$1"
    local env_file="${2:-.env}"

    secret_trace_log "$var_name" "FILE" "ATTEMPT" "file=$env_file"

    if [ ! -f "$env_file" ]; then
        secret_trace_log "$var_name" "FILE" "FAIL" "file not found: $env_file"
        return 1
    fi

    # Extract value from .env file
    local var_value
    if var_value=$(grep "^${var_name}=" "$env_file" 2>/dev/null | cut -d'=' -f2- | sed 's/^["'\'']//' | sed 's/["'\'']$//'); then
        if [ -n "$var_value" ]; then
            secret_trace_log "$var_name" "FILE" "SUCCESS" "length=${#var_value}, file=$env_file"
            echo "$var_value"
            return 0
        fi
    fi

    secret_trace_log "$var_name" "FILE" "FAIL" "not found in $env_file"
    return 1
}

##
# Trace unified secret loading with fallback chain
#
# Arguments:
#   $1 - Secret name (e.g., KEYCLOAK_ADMIN_PASSWORD)
#   $2 - GCP secret name (optional, defaults to dive-v3-<lowercase>)
#   $3 - .env file path (optional, defaults to .env.hub or .env based on context)
#   $4 - Default value (optional, use with caution)
#
# Returns:
#   Secret value on stdout
#   Exit code 0 if found, 1 if not found and no default
##
secret_trace_unified() {
    local var_name="$1"
    local gcp_secret_name="${2:-}"
    local env_file="${3:-}"
    local default_value="${4:-}"

    echo "" >> "$SECRET_TRACE_LOG"
    echo "=== Loading Secret: $var_name ===" >> "$SECRET_TRACE_LOG"

    # Auto-detect GCP secret name if not provided
    if [ -z "$gcp_secret_name" ]; then
        # Convert KEYCLOAK_ADMIN_PASSWORD -> dive-v3-keycloak-admin-password
        gcp_secret_name="dive-v3-$(echo "$var_name" | tr '[:upper:]' '[:lower:]' | tr '_' '-')"
        secret_trace_log "$var_name" "AUTO" "INFO" "auto-detected GCP name: $gcp_secret_name"
    fi

    # Auto-detect .env file if not provided
    if [ -z "$env_file" ]; then
        if [ -f "${DIVE_ROOT}/.env.hub" ]; then
            env_file="${DIVE_ROOT}/.env.hub"
        elif [ -f "${DIVE_ROOT}/.env" ]; then
            env_file="${DIVE_ROOT}/.env"
        fi
        secret_trace_log "$var_name" "AUTO" "INFO" "auto-detected env file: $env_file"
    fi

    # Fallback chain: ENV -> FILE -> GCP -> DEFAULT
    local secret_value=""

    # 1. Check current environment
    if secret_value=$(secret_trace_env "$var_name"); then
        echo "$secret_value"
        return 0
    fi

    # 2. Check .env file
    if [ -n "$env_file" ]; then
        if secret_value=$(secret_trace_file "$var_name" "$env_file"); then
            # Export to environment for subsequent calls
            export "$var_name=$secret_value"
            echo "$secret_value"
            return 0
        fi
    fi

    # 3. Check GCP Secret Manager
    if secret_value=$(secret_trace_gcp "$gcp_secret_name"); then
        # Export to environment for subsequent calls
        export "$var_name=$secret_value"
        echo "$secret_value"
        return 0
    fi

    # 4. Use default value if provided
    if [ -n "$default_value" ]; then
        secret_trace_log "$var_name" "DEFAULT" "FALLBACK" "using default value"
        echo "$default_value"
        return 0
    fi

    # Failed to load secret
    secret_trace_log "$var_name" "ALL" "FAIL" "exhausted all sources"
    return 1
}

##
# Print secret trace summary
##
secret_trace_summary() {
    echo ""
    echo "=== Secret Trace Summary ==="
    echo ""

    if [ ! -f "$SECRET_TRACE_LOG" ]; then
        echo "No trace log found at $SECRET_TRACE_LOG"
        return 1
    fi

    local total_attempts
    total_attempts=$(grep -c "ATTEMPT" "$SECRET_TRACE_LOG" || echo "0")
    local total_success
    total_success=$(grep -c "SUCCESS" "$SECRET_TRACE_LOG" || echo "0")
    local total_failures
    total_failures=$(grep -c "FAIL" "$SECRET_TRACE_LOG" || echo "0")
    local total_fallbacks
    total_fallbacks=$(grep -c "FALLBACK" "$SECRET_TRACE_LOG" || echo "0")

    echo "Total secret loading attempts: $total_attempts"
    echo "Successful loads: $total_success"
    echo "Failed loads: $total_failures"
    echo "Fallbacks used: $total_fallbacks"
    echo ""

    # Show failed secrets
    if [ "$total_failures" -gt 0 ]; then
        echo "Failed Secrets:"
        grep "FAIL" "$SECRET_TRACE_LOG" | cut -d'|' -f1-2 | sort -u | sed 's/^/  /'
        echo ""
    fi

    # Show successful secrets by source
    echo "Successful Secrets by Source:"
    echo "  GCP: $(grep "SUCCESS" "$SECRET_TRACE_LOG" | grep "| GCP |" | wc -l | tr -d ' ')"
    echo "  ENV: $(grep "SUCCESS" "$SECRET_TRACE_LOG" | grep "| ENV |" | wc -l | tr -d ' ')"
    echo "  FILE: $(grep "SUCCESS" "$SECRET_TRACE_LOG" | grep "| FILE |" | wc -l | tr -d ' ')"
    echo ""

    echo "Full trace log: $SECRET_TRACE_LOG"
    echo ""
}

##
# Validate critical secrets are loaded
#
# Arguments:
#   $@ - List of required secret variable names
#
# Returns:
#   0 if all secrets loaded
#   1 if any secret missing
##
secret_trace_validate() {
    local all_present=true

    echo "" >> "$SECRET_TRACE_LOG"
    echo "=== Validation Check ===" >> "$SECRET_TRACE_LOG"

    for var_name in "$@"; do
        if [ -z "${!var_name:-}" ]; then
            secret_trace_log "$var_name" "VALIDATE" "FAIL" "required but not loaded"
            log_error "Missing required secret: $var_name"
            all_present=false
        else
            secret_trace_log "$var_name" "VALIDATE" "SUCCESS" "present in environment"
        fi
    done

    if [ "$all_present" = true ]; then
        log_success "✓ All required secrets validated"
        return 0
    else
        log_error "✗ Some required secrets missing"
        return 1
    fi
}

# Export functions
export -f secret_trace_init
export -f secret_trace_log
export -f secret_trace_gcp
export -f secret_trace_env
export -f secret_trace_file
export -f secret_trace_unified
export -f secret_trace_summary
export -f secret_trace_validate
