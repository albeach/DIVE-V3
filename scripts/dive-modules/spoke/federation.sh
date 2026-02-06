#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Federation Sub-Module
# =============================================================================
# Commands: sync, heartbeat, list-peers, sync-secrets, sync-federation-secrets, sync-all-secrets
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-07
# =============================================================================

# =============================================================================
# SPOKE SYNC & HEARTBEAT
# =============================================================================

spoke_sync() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")

    log_step "Forcing policy sync from Hub..."

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would trigger OPAL client to pull latest policies"
        return 0
    fi

    # Try OPAL client first
    if curl -s -X POST "http://localhost:7000/policy-refresh" --max-time 5 2>/dev/null; then
        log_success "Policy refresh triggered via OPAL client"
    else
        # Try backend API
        if curl -s -X POST "http://localhost:4000/api/spoke/sync" --max-time 5 2>/dev/null | grep -q "success"; then
            log_success "Policy sync triggered via backend API"
        else
            log_warn "Could not trigger sync. Ensure services are running."
        fi
    fi
}

spoke_heartbeat() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local config_file="$spoke_dir/config.json"

    if [ ! -f "$config_file" ]; then
        log_error "Spoke not initialized"
        return 1
    fi

    local spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" 2>/dev/null | cut -d'"' -f4)
    local hub_url=$(grep -o '"hubUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" 2>/dev/null | cut -d'"' -f4)
    hub_url="${hub_url:-https://hub.dive25.com}"

    log_step "Sending heartbeat to Hub: $hub_url"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would POST to: $hub_url/api/federation/heartbeat"
        return 0
    fi

    # Check local services
    local opa_healthy=$(curl -s http://localhost:8181/health --max-time 2 >/dev/null && echo "true" || echo "false")
    local opal_healthy=$(curl -s http://localhost:7000/health --max-time 2 >/dev/null && echo "true" || echo "false")

    # Get token from environment or .env
    local token="${SPOKE_OPAL_TOKEN:-}"
    if [ -z "$token" ] && [ -f "$spoke_dir/.env" ]; then
        token=$(grep "SPOKE_OPAL_TOKEN" "$spoke_dir/.env" 2>/dev/null | cut -d= -f2)
    fi

    if [ -z "$token" ]; then
        log_warn "No spoke token configured. Heartbeat may fail."
    fi

    local response=$(curl -s -X POST "$hub_url/api/federation/heartbeat" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${token}" \
        -k \
        -d "{
            \"spokeId\": \"$spoke_id\",
            \"instanceCode\": \"$(upper "$instance_code")\",
            \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
            \"opaHealthy\": $opa_healthy,
            \"opalClientConnected\": $opal_healthy
        }" 2>&1)

    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_success "Heartbeat sent successfully"
        local sync_status=$(echo "$response" | grep -o '"syncStatus"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        echo "  Sync Status: $sync_status"
    else
        log_error "Heartbeat failed"
        echo "  Response: $response"
        return 1
    fi
}

spoke_list_peers() {
    local code_lower=$(lower "${INSTANCE:-usa}")
    local code_upper=$(upper "$code_lower")
    local hub_url="${HUB_API_URL:-https://localhost:4000}"

    log_step "Querying hub for registered spokes..."

    # Try to reach hub
    local response
    response=$(curl -kfs --max-time 10 "${hub_url}/api/federation/spokes" 2>/dev/null)

    if [ -z "$response" ]; then
        log_error "Could not reach hub at $hub_url"
        echo ""
        echo "Troubleshooting:"
        echo "  1. Verify hub is running: docker ps | grep dive-hub"
        echo "  2. Check HUB_API_URL environment variable"
        echo "  3. Test connectivity: curl -k $hub_url/health"
        echo ""
        return 1
    fi

    echo ""
    echo -e "${BOLD}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}          Federation Spokes (Hub Perspective)              ${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════════════════════${NC}"
    echo ""

    # Check if response contains spokes array
    local spoke_count
    spoke_count=$(echo "$response" | jq -r '.spokes | length' 2>/dev/null)

    if [ -z "$spoke_count" ] || [ "$spoke_count" = "null" ]; then
        log_warn "No spokes registered in hub"
        return 0
    fi

    if [ "$spoke_count" -eq 0 ]; then
        log_warn "No spokes currently registered"
        return 0
    fi

    # Display spoke list with formatting
    echo -e "${CYAN}CODE   NAME                    STATUS      TRUST LEVEL   REGISTERED${NC}"
    echo "───────────────────────────────────────────────────────────────────"

    echo "$response" | jq -r '.spokes[] |
        "\(.instanceCode // "N/A")   \(.name // "Unknown")   \(.status // "unknown")   \(.trustLevel // "none")   \(.registeredAt // "N/A")"' |
        while IFS= read -r line; do
            # Colorize status
            if echo "$line" | grep -q "active"; then
                echo -e "$line" | sed "s/active/${GREEN}active${NC}/"
            elif echo "$line" | grep -q "pending"; then
                echo -e "$line" | sed "s/pending/${YELLOW}pending${NC}/"
            elif echo "$line" | grep -q "suspended"; then
                echo -e "$line" | sed "s/suspended/${RED}suspended${NC}/"
            else
                echo "$line"
            fi
        done

    echo ""
    log_success "Found $spoke_count registered spokes"

    # Show current spoke's perspective
    echo ""
    echo -e "${DIM}Query from: ${code_upper} spoke${NC}"
    echo -e "${DIM}Hub URL: ${hub_url}${NC}"

    return 0
}

# =============================================================================
# SPOKE SECRET SYNCHRONIZATION
# =============================================================================

spoke_sync_secrets() {
    local code_lower="${1:-$(lower "${INSTANCE:-usa}")}"
    local code_upper
    code_upper=$(upper "$code_lower")


    local max_retries=5
    local retry_delay=2
    local attempt=1

    log_step "Synchronizing $code_upper frontend secrets with Keycloak..."

    # Wait for containers to exist and be healthy
    while [ $attempt -le $max_retries ]; do
        # Check if frontend container exists and is running
        if ! docker ps --format '{{.Names}}' | grep -q "dive-spoke-${code_lower}-frontend"; then
            if [ $attempt -eq $max_retries ]; then
                log_error "Frontend container not running for $code_upper after $max_retries attempts"
                return 1
            fi
            log_info "Waiting for frontend container (attempt $attempt/$max_retries, retry in ${retry_delay}s)..."
            sleep $retry_delay
            retry_delay=$((retry_delay * 2))  # Exponential backoff
            attempt=$((attempt + 1))
            continue
        fi

        # Check if Keycloak container exists and is running
        if ! docker ps --format '{{.Names}}' | grep -q "dive-spoke-${code_lower}-keycloak"; then
            if [ $attempt -eq $max_retries ]; then
                log_error "Keycloak container not running for $code_upper after $max_retries attempts"
                return 1
            fi
            log_info "Waiting for Keycloak container (attempt $attempt/$max_retries, retry in ${retry_delay}s)..."
            sleep $retry_delay
            retry_delay=$((retry_delay * 2))
            attempt=$((attempt + 1))
            continue
        fi

        # Get spoke port for API check
        eval "$(get_instance_ports "$code_upper" 2>/dev/null)" || true
        local kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"

        # Check if Keycloak API is actually ready (not just container healthy)
        if ! curl -kfs --max-time 5 "https://localhost:${kc_port}/realms/master" >/dev/null 2>&1; then
            if [ $attempt -eq $max_retries ]; then
                log_error "Keycloak API not ready for $code_upper after $max_retries attempts"
                return 1
            fi
            log_info "Waiting for Keycloak API to be ready (attempt $attempt/$max_retries, retry in ${retry_delay}s)..."


            sleep $retry_delay
            retry_delay=$((retry_delay * 2))
            attempt=$((attempt + 1))
            continue
        fi

        # Containers exist and API is ready - attempt sync
        log_info "Attempting secret synchronization (attempt $attempt/$max_retries)..."


        if _do_secret_sync_attempt "$code_lower" "$code_upper"; then
            return 0
        fi


        if [ $attempt -eq $max_retries ]; then
            log_error "Secret synchronization failed for $code_upper after $max_retries attempts"
            return 1
        fi

        log_info "Sync attempt failed, retrying (attempt $attempt/$max_retries, retry in ${retry_delay}s)..."
        sleep $retry_delay
        retry_delay=$((retry_delay * 2))
        attempt=$((attempt + 1))
    done

    log_error "Secret synchronization failed for $code_upper (max retries exceeded)"
    return 1
}

##
# Sync federation IdP secrets (usa-idp in spoke must match Hub's client for spoke)
# This ensures Spoke→Hub SSO works by syncing the usa-idp client secret
##
spoke_sync_federation_secrets() {
    local code_lower="${1:-$(lower "${INSTANCE:-usa}")}"
    local code_upper
    code_upper=$(upper "$code_lower")

    log_step "Synchronizing $code_upper federation IdP secrets with Hub..."

    # Skip if this is the Hub (USA)
    if [ "$code_lower" = "usa" ]; then
        log_info "Skipping - USA is the Hub, no usa-idp to sync"
        return 0
    fi

    # Check if Hub is running
    if ! docker ps --format '{{.Names}}' | grep -q "dive-hub-keycloak"; then
        log_error "Hub Keycloak is not running"
        return 1
    fi

    # Check if spoke Keycloak is running
    if ! docker ps --format '{{.Names}}' | grep -q "dive-spoke-${code_lower}-keycloak"; then
        log_error "Spoke Keycloak for $code_upper is not running"
        return 1
    fi

    # Get Hub admin credentials (SSOT: try container env first)
    local hub_admin_pass
    hub_admin_pass=$(get_keycloak_password "dive-hub-keycloak")
    if [ -z "$hub_admin_pass" ]; then
        # Fallback to .env.hub
        source "${DIVE_ROOT}/.env.hub" 2>/dev/null || true
        hub_admin_pass="${KEYCLOAK_ADMIN_PASSWORD:-}"
    fi
    if [ -z "$hub_admin_pass" ]; then
        log_error "Could not get Hub Keycloak admin password"
        return 1
    fi

    # Get Hub token
    local hub_token
    hub_token=$(curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${hub_admin_pass}" | jq -r '.access_token')

    if [ -z "$hub_token" ] || [ "$hub_token" = "null" ]; then
        log_error "Could not authenticate with Hub Keycloak"
        return 1
    fi

    # Get Hub's client secret for this spoke
    local client_id="dive-v3-broker-${code_lower}"
    local client_uuid
    client_uuid=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-broker-usa/clients?clientId=${client_id}" \
        -H "Authorization: Bearer $hub_token" | jq -r '.[0].id // empty')

    if [ -z "$client_uuid" ]; then
        log_warn "Client ${client_id} not found in Hub - creating via federation fix"
        return 1
    fi

    local hub_secret
    hub_secret=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-broker-usa/clients/${client_uuid}/client-secret" \
        -H "Authorization: Bearer $hub_token" | jq -r '.value // empty')

    if [ -z "$hub_secret" ]; then
        log_error "Could not get Hub client secret for ${client_id}"
        return 1
    fi

    # Get spoke admin credentials (SSOT: try container env first)
    local spoke_container="dive-spoke-${code_lower}-keycloak"
    local spoke_admin_pass
    spoke_admin_pass=$(get_keycloak_password "$spoke_container")
    if [ -z "$spoke_admin_pass" ]; then
        # Fallback to .env file
        local spoke_env="${DIVE_ROOT}/instances/${code_lower}/.env"
        spoke_admin_pass=$(grep "^KEYCLOAK_ADMIN_PASSWORD_${code_upper}=" "$spoke_env" 2>/dev/null | cut -d= -f2 | tr -d '\n\r"')
    fi

    if [ -z "$spoke_admin_pass" ]; then
        log_error "Could not get $code_upper Keycloak admin password"
        return 1
    fi

    # Get spoke port
    eval "$(get_instance_ports "$code_upper" 2>/dev/null)" || true
    local kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"

    # Get spoke token
    local spoke_token
    spoke_token=$(curl -sk -X POST "https://localhost:${kc_port}/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${spoke_admin_pass}" | jq -r '.access_token')

    if [ -z "$spoke_token" ] || [ "$spoke_token" = "null" ]; then
        log_error "Could not authenticate with $code_upper Keycloak"
        return 1
    fi

    # Get spoke's usa-idp configuration
    local usa_idp
    usa_idp=$(curl -sk "https://localhost:${kc_port}/admin/realms/dive-v3-broker-${code_lower}/identity-provider/instances/usa-idp" \
        -H "Authorization: Bearer $spoke_token")

    if echo "$usa_idp" | jq -e '.error' >/dev/null 2>&1; then
        log_warn "usa-idp not found in $code_upper - needs federation setup"
        return 1
    fi

    # Update the usa-idp client secret to match Hub's client secret
    local update_result
    update_result=$(curl -sk -X PUT "https://localhost:${kc_port}/admin/realms/dive-v3-broker-${code_lower}/identity-provider/instances/usa-idp" \
        -H "Authorization: Bearer $spoke_token" \
        -H "Content-Type: application/json" \
        -d "$(echo "$usa_idp" | jq --arg secret "$hub_secret" '.config.clientSecret = $secret')")

    if [ -z "$update_result" ]; then
        log_success "Updated $code_upper usa-idp client secret"
        return 0
    else
        log_error "Failed to update $code_upper usa-idp client secret"
        echo "Response: $update_result"
        return 1
    fi
}

spoke_sync_all_secrets() {
    local spokes=()

    # Find all running spoke frontends
    while IFS= read -r container; do
        if [[ "$container" =~ dive-spoke-([a-z]+)-frontend ]]; then
            local code="${BASH_REMATCH[1]}"
            spokes+=("$code")
        fi
    done < <(docker ps --format '{{.Names}}' 2>/dev/null | grep "dive-spoke-.*-frontend")

    if [ ${#spokes[@]} -eq 0 ]; then
        log_warn "No running spoke frontends found"
        return 0
    fi

    log_step "Synchronizing secrets for ${#spokes[@]} running spokes: ${spokes[*]}"

    local success=0
    local failed=0

    for spoke in "${spokes[@]}"; do
        if spoke_sync_secrets "$spoke"; then
            success=$((success + 1))
        else
            failed=$((failed + 1))
        fi
    done

    echo ""
    log_success "Secret synchronization complete: $success succeeded, $failed failed"

    [ $failed -eq 0 ]
}