#!/usr/bin/env bash
# =============================================================================
# DIVE V3 — AWS Remote Execution Framework
# =============================================================================
# Transparently execute DIVE CLI commands on remote EC2 instances.
#
# This module enables:
#   ./dive --env dev hub deploy        (runs on remote dev-hub EC2)
#   ./dive --env staging spoke deploy GBR   (runs on remote staging-spoke-gbr EC2)
#
# How it works:
#   1. Detects ENVIRONMENT is dev|staging
#   2. Looks up the target EC2 by tags (Role + SpokeCode)
#   3. Syncs code to the instance (git pull or rsync)
#   4. Executes the command via SSH
#   5. Streams output back to the local terminal
# =============================================================================
# Version: 1.0.0
# Date: 2026-02-18
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_AWS_REMOTE_EXEC_LOADED:-}" ] && return 0
export DIVE_AWS_REMOTE_EXEC_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

AWS_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$AWS_DIR")"

if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load AWS module for instance discovery
if [ -z "${DIVE_AWS_MODULE_LOADED:-}" ]; then
    source "${AWS_DIR}/module.sh"
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

REMOTE_DIVE_DIR="${REMOTE_DIVE_DIR:-/opt/dive-v3}"
REMOTE_USER="${REMOTE_USER:-ubuntu}"
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -o ServerAliveInterval=30"

# =============================================================================
# REMOTE EXECUTION FUNCTIONS
# =============================================================================

##
# Check if the current environment requires remote execution
#
# Returns 0 if remote, 1 if local
##
is_remote_environment() {
    case "$ENVIRONMENT" in
        dev|staging) return 0 ;;
        *)           return 1 ;;
    esac
}

##
# Sync project code to a remote EC2 instance
#
# Arguments:
#   $1 - Target IP address
#
# Strategy:
#   1. Try git pull (fast, assumes repo cloned by bootstrap)
#   2. Fall back to rsync (works without git)
##
remote_sync() {
    local target_ip="$1"
    local sync_method="${DIVE_SYNC_METHOD:-git}"

    log_info "Syncing code to ${target_ip}..."

    # Ensure remote directory exists (fresh EC2 instance or after wipe)
    ssh -i "$DIVE_AWS_SSH_KEY" $SSH_OPTS \
        "${REMOTE_USER}@${target_ip}" \
        "sudo mkdir -p ${REMOTE_DIVE_DIR} && sudo chown -R ${REMOTE_USER}:${REMOTE_USER} ${REMOTE_DIVE_DIR}" \
        2>/dev/null || true

    if [ "$sync_method" = "git" ]; then
        # Get the LOCAL commit hash we want to deploy
        local local_commit
        local_commit=$(git -C "${DIVE_ROOT}" rev-parse HEAD 2>/dev/null || echo "")
        local _branch
        _branch=$(git -C "${DIVE_ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")

        if [ -n "$local_commit" ]; then
            # Check if the commit is pushed to origin
            local remote_has_commit
            remote_has_commit=$(git -C "${DIVE_ROOT}" branch -r --contains "$local_commit" 2>/dev/null | grep -c "origin/" || echo "0")

            if [ "$remote_has_commit" -gt 0 ]; then
                log_info "Syncing to commit ${local_commit:0:8} via git..."

                # If remote has no git repo, do a fresh clone
                if ! ssh -i "$DIVE_AWS_SSH_KEY" $SSH_OPTS \
                    "${REMOTE_USER}@${target_ip}" \
                    "test -d ${REMOTE_DIVE_DIR}/.git" 2>/dev/null; then
                    log_info "No git repo on remote — performing fresh clone..."
                    if ssh -i "$DIVE_AWS_SSH_KEY" $SSH_OPTS \
                        "${REMOTE_USER}@${target_ip}" \
                        "rm -rf ${REMOTE_DIVE_DIR}/* && git clone https://github.com/albeach/DIVE-V3.git ${REMOTE_DIVE_DIR} && cd ${REMOTE_DIVE_DIR} && git checkout ${_branch} && git reset --hard ${local_commit}" \
                        2>/dev/null; then
                        log_success "Code synced via fresh clone (commit ${local_commit:0:8})."
                        return 0
                    fi
                    log_warn "Fresh clone failed, falling back to rsync..."
                elif ssh -i "$DIVE_AWS_SSH_KEY" $SSH_OPTS \
                    "${REMOTE_USER}@${target_ip}" \
                    "cd ${REMOTE_DIVE_DIR} && git fetch origin && git checkout ${_branch} && git reset --hard ${local_commit}" \
                    2>/dev/null; then
                    log_success "Code synced via git (commit ${local_commit:0:8})."
                    return 0
                else
                    log_warn "Git sync failed, falling back to rsync..."
                fi
            else
                log_warn "Local commit ${local_commit:0:8} not pushed to origin — using rsync..."
            fi
        fi
    fi

    # rsync: copies local working tree (includes uncommitted changes)
    # COPYFILE_DISABLE prevents macOS resource fork ._* files
    COPYFILE_DISABLE=1 rsync -az --delete \
        --exclude '.git' \
        --exclude 'node_modules' \
        --exclude 'instances/*/data' \
        --exclude '.dive-state' \
        --exclude '.dive-locks' \
        --exclude '.dive-checkpoint' \
        --exclude '.vault-token' \
        --exclude '.vault-init*' \
        --exclude '.env.hub' \
        --exclude 'certs/' \
        --exclude 'instances/*/certs/' \
        --exclude 'data/' \
        --exclude '.terraform' \
        --exclude 'backend/logs' \
        --exclude 'backend/dist' \
        --exclude 'frontend/.next' \
        --exclude 'coverage' \
        --exclude 'backend/policies/uploads' \
        --exclude '._*' \
        --exclude '.DS_Store' \
        -e "ssh -i ${DIVE_AWS_SSH_KEY} ${SSH_OPTS}" \
        "${DIVE_ROOT}/" \
        "${REMOTE_USER}@${target_ip}:${REMOTE_DIVE_DIR}/"

    log_success "Code synced via rsync."
}

##
# Execute a command on a remote EC2 instance
#
# Arguments:
#   $1 - Target IP address
#   $@ - Command and arguments to run
##
remote_run() {
    local target_ip="$1"
    shift

    log_info "Executing on ${target_ip}: $*"

    # Use login shell (-t) to ensure Docker group membership is effective
    # and set DOCKER_HOST explicitly in case the default socket has permission issues
    ssh -i "$DIVE_AWS_SSH_KEY" $SSH_OPTS \
        -t "${REMOTE_USER}@${target_ip}" \
        "cd ${REMOTE_DIVE_DIR} && export PATH=\"/usr/local/bin:/usr/bin:/bin:\$PATH\" && $*"
}

##
# Execute a DIVE CLI command on the appropriate remote EC2 instance
#
# Arguments:
#   $1 - Role (hub or spoke)
#   $2 - Spoke code (optional, for spoke role)
#   $@ - DIVE CLI arguments (e.g., "deploy", "verify")
#
# Example:
#   remote_dive_exec hub "" deploy
#   remote_dive_exec spoke GBR deploy
##
remote_dive_exec() {
    local role="$1"
    local spoke_code="${2:-}"
    shift 2

    aws_require_auth || return 1

    # Discover target EC2
    local target_ip
    target_ip=$(aws_get_instance_ip "$role" "$spoke_code")

    if [ -z "$target_ip" ] || [ "$target_ip" = "None" ]; then
        log_error "No running ${ENVIRONMENT} ${role}${spoke_code:+ ($spoke_code)} instance found."
        log_info "Launch one with: ./dive --env ${ENVIRONMENT} aws launch --role ${role}${spoke_code:+ --spoke-code $spoke_code}"
        return 1
    fi

    log_info "Target: ${role}${spoke_code:+ ($spoke_code)} at ${target_ip}"

    # Sync code
    remote_sync "$target_ip" || {
        log_error "Code sync failed."
        return 1
    }

    # Inject environment variables for remote execution
    local env_prefix=""

    # Domain suffix and Cloudflare token apply to BOTH hub and spoke deploys
    if [ -n "${DIVE_DOMAIN_SUFFIX:-}" ]; then
        env_prefix="${env_prefix}DIVE_DOMAIN_SUFFIX=${DIVE_DOMAIN_SUFFIX} "
        log_info "Injecting domain suffix: ${DIVE_DOMAIN_SUFFIX}"
    fi
    if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
        env_prefix="${env_prefix}CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN} "
    fi

    # For spoke deploys, also inject hub address and deployment mode
    if [ "$role" = "spoke" ]; then
        local hub_ip
        hub_ip=$(aws_get_instance_ip "hub" "" 2>/dev/null || echo "")
        if [ -n "$hub_ip" ] && [ "$hub_ip" != "None" ]; then
            env_prefix="${env_prefix}HUB_EXTERNAL_ADDRESS=${hub_ip} DEPLOYMENT_MODE=remote "
            log_info "Injecting hub address: HUB_EXTERNAL_ADDRESS=${hub_ip}"

            # Inject OPAL master token for token provisioning
            if [ -n "${OPAL_AUTH_MASTER_TOKEN:-}" ]; then
                env_prefix="${env_prefix}OPAL_AUTH_MASTER_TOKEN=${OPAL_AUTH_MASTER_TOKEN} "
            elif [ -f "${DIVE_ROOT}/.env.hub" ]; then
                local _mt
                _mt=$(grep "^OPAL_AUTH_MASTER_TOKEN=" "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d= -f2- || true)
                if [ -n "$_mt" ]; then
                    env_prefix="${env_prefix}OPAL_AUTH_MASTER_TOKEN=${_mt} "
                fi
            fi
        else
            log_warn "Could not discover hub IP — spoke may not be able to reach hub"
        fi
    fi

    # Build the remote command
    # On the remote instance, we always run as ENVIRONMENT=local because
    # the instance IS the target — no further SSH hop needed.
    local remote_cmd="${env_prefix}./dive --env local"
    if [ "$role" = "spoke" ] && [ -n "$spoke_code" ]; then
        remote_cmd="${remote_cmd} --instance $(echo "$spoke_code" | tr '[:upper:]' '[:lower:]')"
    fi
    remote_cmd="${remote_cmd} ${role} $*"

    # Execute
    remote_run "$target_ip" "$remote_cmd"
}

##
# Execute a hub command remotely
#
# Arguments:
#   $@ - DIVE hub subcommand (e.g., "deploy", "verify")
##
remote_hub_exec() {
    remote_dive_exec hub "" "$@"
}

##
# Execute a spoke command remotely
#
# Arguments:
#   $1 - Spoke code
#   $@ - DIVE spoke subcommand (e.g., "deploy", "verify")
##
remote_spoke_exec() {
    local spoke_code="$1"
    shift
    remote_dive_exec spoke "$spoke_code" "$@"
}

##
# Stream logs from a remote instance
#
# Arguments:
#   $1 - Role (hub or spoke)
#   $2 - Spoke code (optional)
#   $3 - Service name (optional)
##
remote_logs() {
    local role="$1"
    local spoke_code="${2:-}"
    local service="${3:-}"
    shift; shift 2>/dev/null; shift 2>/dev/null || true

    aws_require_auth || return 1

    local target_ip
    target_ip=$(aws_get_instance_ip "$role" "$spoke_code")

    if [ -z "$target_ip" ] || [ "$target_ip" = "None" ]; then
        log_error "No running ${ENVIRONMENT} ${role}${spoke_code:+ ($spoke_code)} instance found."
        return 1
    fi

    local compose_cmd="docker compose logs -f"
    [ -n "$service" ] && compose_cmd="${compose_cmd} ${service}"

    ssh -i "$DIVE_AWS_SSH_KEY" $SSH_OPTS \
        "${REMOTE_USER}@${target_ip}" \
        "cd ${REMOTE_DIVE_DIR} && ${compose_cmd}"
}

##
# Check if a remote instance is ready (bootstrap complete, Docker running)
#
# Arguments:
#   $1 - Target IP address
##
remote_health_check() {
    local target_ip="$1"

    log_info "Checking instance health at ${target_ip}..."

    # Check SSH connectivity
    if ! ssh -i "$DIVE_AWS_SSH_KEY" $SSH_OPTS \
        -o ConnectTimeout=5 \
        "${REMOTE_USER}@${target_ip}" "echo ok" >/dev/null 2>&1; then
        log_error "SSH connection failed."
        return 1
    fi

    # Check Docker
    if ! ssh -i "$DIVE_AWS_SSH_KEY" $SSH_OPTS \
        "${REMOTE_USER}@${target_ip}" "docker info" >/dev/null 2>&1; then
        log_error "Docker not running on remote instance."
        return 1
    fi

    # Check DIVE project
    if ! ssh -i "$DIVE_AWS_SSH_KEY" $SSH_OPTS \
        "${REMOTE_USER}@${target_ip}" "test -f ${REMOTE_DIVE_DIR}/dive" 2>/dev/null; then
        log_error "DIVE project not found at ${REMOTE_DIVE_DIR}."
        return 1
    fi

    log_success "Instance healthy: SSH OK, Docker OK, DIVE project OK."
    return 0
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f is_remote_environment
export -f remote_sync
export -f remote_run
export -f remote_dive_exec
export -f remote_hub_exec
export -f remote_spoke_exec
export -f remote_logs
export -f remote_health_check

log_verbose "AWS remote execution module loaded"
