#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Registration Polling
# =============================================================================
# Polls Hub API for spoke registration approval status.
# Used when a spoke registers without an auth code and needs manual Hub approval.
# =============================================================================

# Guard against double-sourcing
[ -n "${_SPOKE_REGISTRATION_POLL_LOADED:-}" ] && return 0
_SPOKE_REGISTRATION_POLL_LOADED=1

##
# Poll the Hub for spoke registration approval.
#
# Arguments:
#   $1 - Spoke ID (returned from registration)
#   $2 - Hub API base URL (e.g., https://dev-usa-api.dive25.com)
#   $3 - Max wait seconds (default: 1800 = 30 min)
#
# Returns:
#   0 - Approved (token available in SPOKE_TOKEN)
#   1 - Timeout or error
##
spoke_registration_poll() {
    local spoke_id="$1"
    local hub_url="$2"
    local max_wait="${3:-1800}"
    local poll_interval=15
    local waited=0

    guided_explain "Waiting for Approval" \
        "Your spoke registration is pending manual approval from the Hub admin.

They can approve it by running:
  ./dive hub approve ${spoke_id}

Or from the Hub's web admin panel.

We will check every ${poll_interval} seconds (timeout: $((max_wait / 60)) minutes)."

    while [ $waited -lt $max_wait ]; do
        local status_resp
        status_resp=$(curl -sk --max-time 10 \
            "${hub_url}/api/federation/registration/${spoke_id}/status" 2>/dev/null)
        local status
        status=$(echo "$status_resp" | jq -r '.status // "unknown"' 2>/dev/null)

        case "$status" in
            approved)
                local token
                token=$(echo "$status_resp" | jq -r '.token.token // empty' 2>/dev/null)
                if [ -n "$token" ]; then
                    export SPOKE_TOKEN="$token"
                    log_success "Spoke approved! (waited ${waited}s)"
                    guided_success "Your spoke has been approved by the Hub admin!"
                    return 0
                else
                    log_warn "Approved but no token in response"
                fi
                ;;
            suspended|rejected)
                log_error "Spoke registration was $status"
                guided_error "Registration $status" \
                    "The Hub admin has $status your spoke registration." \
                    "Contact your Hub administrator for more information."
                return 1
                ;;
            pending)
                if is_guided; then
                    printf "\r  Waiting for approval... %ds / %ds" "$waited" "$max_wait"
                else
                    log_verbose "Registration pending... (${waited}s / ${max_wait}s)"
                fi
                ;;
            *)
                log_verbose "Unknown status: $status (response: $status_resp)"
                ;;
        esac

        sleep "$poll_interval"
        waited=$((waited + poll_interval))
    done

    # Timeout
    echo ""
    log_warn "Registration approval timeout after ${max_wait}s"
    guided_warn "Approval timeout" \
        "The Hub admin has not approved this spoke within $((max_wait / 60)) minutes.

You can:
  1. Wait and retry: ./dive spoke deploy ${INSTANCE_CODE:-CODE} --resume
  2. Deploy standalone: ./dive spoke deploy ${INSTANCE_CODE:-CODE} --skip-federation
  3. Contact your Hub admin to approve manually"
    return 1
}
