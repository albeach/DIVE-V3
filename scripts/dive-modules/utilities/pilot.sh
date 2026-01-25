#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Pilot VM Module (Consolidated)
# =============================================================================
# Pilot VM deployment and management
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   - pilot.sh
# =============================================================================

# Prevent multiple sourcing
[ -n "$DIVE_UTILITIES_PILOT_LOADED" ] && return 0
export DIVE_UTILITIES_PILOT_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

UTILITIES_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$UTILITIES_DIR")"

if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load NATO countries if available
if [ -f "${DIVE_ROOT}/scripts/nato-countries.sh" ]; then
    source "${DIVE_ROOT}/scripts/nato-countries.sh"
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

GCP_PROJECT="${GCP_PROJECT:-dive25}"
PILOT_ZONE="${PILOT_ZONE:-us-central1-a}"
PILOT_INSTANCE="${PILOT_INSTANCE:-dive-pilot-vm}"

# =============================================================================
# PILOT VM FUNCTIONS
# =============================================================================

##
# Start pilot VM
##
pilot_up() {
    log_info "Starting Pilot VM..."

    if ! command -v gcloud >/dev/null 2>&1; then
        log_error "gcloud not found. Install Google Cloud SDK."
        return 1
    fi

    gcloud compute instances start "$PILOT_INSTANCE" \
        --project="$GCP_PROJECT" \
        --zone="$PILOT_ZONE" \
        2>/dev/null

    # Wait for VM to be ready
    log_info "Waiting for VM to be ready..."
    sleep 30

    log_success "Pilot VM started"
}

##
# Stop pilot VM
##
pilot_down() {
    log_info "Stopping Pilot VM..."

    gcloud compute instances stop "$PILOT_INSTANCE" \
        --project="$GCP_PROJECT" \
        --zone="$PILOT_ZONE" \
        2>/dev/null

    log_success "Pilot VM stopped"
}

##
# Show pilot VM status
##
pilot_status() {
    echo "=== Pilot VM Status ==="
    echo ""

    if ! command -v gcloud >/dev/null 2>&1; then
        log_error "gcloud not found"
        return 1
    fi

    local status
    status=$(gcloud compute instances describe "$PILOT_INSTANCE" \
        --project="$GCP_PROJECT" \
        --zone="$PILOT_ZONE" \
        --format="value(status)" \
        2>/dev/null)

    echo "Instance: $PILOT_INSTANCE"
    echo "Zone:     $PILOT_ZONE"
    echo "Project:  $GCP_PROJECT"
    echo "Status:   ${status:-UNKNOWN}"

    if [ "$status" = "RUNNING" ]; then
        local external_ip
        external_ip=$(gcloud compute instances describe "$PILOT_INSTANCE" \
            --project="$GCP_PROJECT" \
            --zone="$PILOT_ZONE" \
            --format="value(networkInterfaces[0].accessConfigs[0].natIP)" \
            2>/dev/null)

        echo "IP:       ${external_ip:-N/A}"
    fi
}

##
# SSH into pilot VM
##
pilot_ssh() {
    log_info "Connecting to Pilot VM..."

    gcloud compute ssh "$PILOT_INSTANCE" \
        --project="$GCP_PROJECT" \
        --zone="$PILOT_ZONE"
}

##
# View pilot VM logs
#
# Arguments:
#   $1 - Service name (optional)
##
pilot_logs() {
    local service="${1:-}"

    if [ -n "$service" ]; then
        gcloud compute ssh "$PILOT_INSTANCE" \
            --project="$GCP_PROJECT" \
            --zone="$PILOT_ZONE" \
            --command="cd /opt/dive-v3 && docker compose logs -f $service"
    else
        gcloud compute ssh "$PILOT_INSTANCE" \
            --project="$GCP_PROJECT" \
            --zone="$PILOT_ZONE" \
            --command="cd /opt/dive-v3 && docker compose logs -f"
    fi
}

##
# Deploy to pilot VM
##
pilot_deploy() {
    log_info "Deploying to Pilot VM..."

    # Ensure VM is running
    pilot_up || return 1

    # Run deployment
    gcloud compute ssh "$PILOT_INSTANCE" \
        --project="$GCP_PROJECT" \
        --zone="$PILOT_ZONE" \
        --command="cd /opt/dive-v3 && git pull && ./dive hub deploy"

    log_success "Pilot deployment complete"
}

##
# Reset pilot VM
##
pilot_reset() {
    log_warn "Resetting Pilot VM..."

    gcloud compute ssh "$PILOT_INSTANCE" \
        --project="$GCP_PROJECT" \
        --zone="$PILOT_ZONE" \
        --command="cd /opt/dive-v3 && ./dive cleanup --all --force"

    log_success "Pilot VM reset complete"
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

##
# Pilot module command dispatcher
##
module_pilot() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        up|start)   pilot_up "$@" ;;
        down|stop)  pilot_down "$@" ;;
        status)     pilot_status "$@" ;;
        ssh)        pilot_ssh "$@" ;;
        logs)       pilot_logs "$@" ;;
        deploy)     pilot_deploy "$@" ;;
        reset)      pilot_reset "$@" ;;
        help|*)
            echo "Usage: ./dive pilot <command>"
            echo ""
            echo "Commands:"
            echo "  up          Start Pilot VM"
            echo "  down        Stop Pilot VM"
            echo "  status      Show Pilot VM status"
            echo "  ssh         SSH into Pilot VM"
            echo "  logs [svc]  View Pilot VM logs"
            echo "  deploy      Deploy to Pilot VM"
            echo "  reset       Reset Pilot VM"
            ;;
    esac
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f pilot_up
export -f pilot_down
export -f pilot_status
export -f pilot_ssh
export -f pilot_logs
export -f pilot_deploy
export -f pilot_reset
export -f module_pilot

log_verbose "Pilot module loaded"
