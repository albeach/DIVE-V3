#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Deployment Pipeline V2 (Docker Compose as Orchestrator)
# =============================================================================
# 3-phase pipeline that lets Docker Compose handle service ordering:
#
#   Phase 1: PREPARE   — generate .env, certs, compose file, bind-mount dirs
#   Phase 2: UP        — single `docker compose up -d --wait` command
#   Phase 3: FEDERATE  — Terraform, Hub registration, OPAL token, Caddy
#
# Init containers (service_completed_successfully) handle:
#   - MongoDB replica set initialization
#   - Vault init + unseal + KV v2 enable
#   - Keycloak realm creation (Terraform)
#
# Invoked via: ./dive spoke deploy <CODE> --v2
# =============================================================================

# Prevent multiple sourcing
if [ -n "${SPOKE_PIPELINE_V2_LOADED:-}" ]; then
    return 0
fi
export SPOKE_PIPELINE_V2_LOADED=1

# Ensure vault utilities (_vault_update_env) are available for initialization phase
if [ -f "${DIVE_ROOT:-}/scripts/dive-modules/vault/module.sh" ]; then
    source "${DIVE_ROOT}/scripts/dive-modules/vault/module.sh" 2>/dev/null || true
fi

# =============================================================================
# V2 PIPELINE ENTRY POINT
# =============================================================================

##
# Execute the 3-phase spoke deployment pipeline
#
# Arguments:
#   $1 - Instance code (e.g., DEU, GBR, FRA)
#   $2 - Instance name (e.g., "Germany")
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_deploy_v2() {
    local instance_code="$1"
    local instance_name="${2:-$instance_code Instance}"

    local code_upper
    code_upper=$(upper "$instance_code")
    local code_lower
    code_lower=$(lower "$instance_code")
    local start_time
    start_time=$(date +%s)

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        return 1
    fi

    log_info "Starting V2 spoke pipeline for $code_upper ($instance_name)"
    log_info "  Pipeline: PREPARE → UP → FEDERATE"
    log_info "  Mode: ${DEPLOYMENT_MODE:-local}"

    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local compose_file="${spoke_dir}/docker-compose.yml"
    local env_file="${spoke_dir}/.env"

    # Track phase timings
    local -a phase_times=()
    local pipeline_result=0

    # =========================================================================
    # PHASE 1: PREPARE
    # =========================================================================
    local phase_start
    phase_start=$(date +%s)
    log_info ""
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "  Phase 1/3: PREPARE"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # 1a: Preflight checks (hub discovery, secrets, network)
    if ! spoke_phase_preflight "$code_upper" "deploy"; then
        log_error "Preflight failed"
        pipeline_result=1
    fi

    # 1b: Initialization (directories, .env, certs, docker-compose.yml)
    if [ $pipeline_result -eq 0 ]; then
        if ! spoke_phase_initialization "$code_upper" "deploy"; then
            log_error "Initialization failed"
            pipeline_result=1
        fi
    fi

    # 1c: Create bind-mount directories for Vault (v2-specific)
    if [ $pipeline_result -eq 0 ]; then
        log_step "Creating bind-mount directories..."
        mkdir -p "${spoke_dir}/vault-data" "${spoke_dir}/vault-logs" "${spoke_dir}/vault-init"

        # On Linux, Vault runs as UID 100 — set ownership
        if [ "$(uname)" = "Linux" ]; then
            chown -R 100:1000 "${spoke_dir}/vault-data" "${spoke_dir}/vault-logs" 2>/dev/null || true
        fi
        log_success "Bind-mount directories ready"
    fi

    phase_times+=("Phase 1 (Prepare): $(($(date +%s) - phase_start))s")

    if [ $pipeline_result -ne 0 ]; then
        _spoke_v2_print_failure "$code_upper" "$instance_name" "$(($(date +%s) - start_time))" "PREPARE"
        return 1
    fi

    log_success "Phase 1 complete in $(($(date +%s) - phase_start))s"

    # =========================================================================
    # PHASE 2: UP (Docker Compose handles ALL service ordering)
    # =========================================================================
    phase_start=$(date +%s)
    log_info ""
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "  Phase 2/3: UP"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "  docker compose up -d --wait (init containers + healthchecks)"

    if [ ! -f "$compose_file" ]; then
        log_error "docker-compose.yml not found at: $compose_file"
        _spoke_v2_print_failure "$code_upper" "$instance_name" "$(($(date +%s) - start_time))" "UP"
        return 1
    fi

    # Build compose command with optional profiles
    local -a compose_cmd=(
        docker compose
        -f "$compose_file"
        -p "dive-spoke-${code_lower}"
        --env-file "$env_file"
    )

    # Enable vault profile if vault is configured
    if [ "${SECRETS_PROVIDER:-}" = "vault" ] || [ "${SPOKE_ENABLE_VAULT:-false}" = "true" ]; then
        compose_cmd+=(--profile vault)
    fi

    log_step "Starting all services..."
    local compose_exit=0
    if ! "${compose_cmd[@]}" up -d --wait --wait-timeout 600 2>&1; then
        compose_exit=1
    fi

    # Check for failures — distinguish real failures from expected standalone issues
    if [ $compose_exit -ne 0 ]; then
        # In standalone mode, opal-client being unhealthy is expected (no Hub OPAL server)
        # Check if only optional services are unhealthy
        local unhealthy_services
        unhealthy_services=$("${compose_cmd[@]}" ps --filter "health=unhealthy" --format '{{.Name}}' 2>/dev/null || true)
        local critical_unhealthy=""
        local optional_unhealthy=""
        for svc in $unhealthy_services; do
            if echo "$svc" | grep -q "opal-client"; then
                optional_unhealthy="$svc"
            else
                critical_unhealthy="${critical_unhealthy} ${svc}"
            fi
        done

        # Check for failed init containers
        local init_failures=0
        for init_svc in "mongodb-init" "vault-init" "keycloak-init"; do
            local init_status
            init_status=$(docker inspect "dive-spoke-${code_lower}-${init_svc}" --format '{{.State.ExitCode}}' 2>/dev/null || echo "N/A")
            if [ "$init_status" != "0" ] && [ "$init_status" != "N/A" ]; then
                init_failures=$((init_failures + 1))
                log_error "Init container ${init_svc} exited with code ${init_status}:"
                docker logs "dive-spoke-${code_lower}-${init_svc}" --tail=30 2>&1 || true
            fi
        done

        # If only optional services are unhealthy and no init failures, treat as degraded success
        if [ -z "$(echo "$critical_unhealthy" | tr -d ' ')" ] && [ $init_failures -eq 0 ]; then
            if [ -n "$optional_unhealthy" ]; then
                log_warn "Optional service unhealthy (expected in standalone mode): $optional_unhealthy"
            fi
            log_warn "docker compose --wait reported failure, but all critical services are healthy"
        else
            log_error "Service startup failed"
            log_info ""
            log_info "Fetching recent logs for debugging..."

            # Show logs from failed/unhealthy services
            local failed_services
            failed_services=$("${compose_cmd[@]}" ps --filter "status=exited" --format '{{.Name}}' 2>/dev/null || true)
            if [ -n "$failed_services" ]; then
                log_error "Failed services:"
                for svc in $failed_services; do
                    log_error "  $svc:"
                    "${compose_cmd[@]}" logs --tail=20 "$svc" 2>/dev/null || true
                done
            fi

            if [ -n "$(echo "$critical_unhealthy" | tr -d ' ')" ]; then
                log_error "Unhealthy critical services:${critical_unhealthy}"
            fi

            phase_times+=("Phase 2 (Up): $(($(date +%s) - phase_start))s [FAILED]")
            _spoke_v2_print_failure "$code_upper" "$instance_name" "$(($(date +%s) - start_time))" "UP"
            return 1
        fi
    fi

    phase_times+=("Phase 2 (Up): $(($(date +%s) - phase_start))s")
    log_success "All services healthy in $(($(date +%s) - phase_start))s"

    # Show init container results
    for init_svc in "mongodb-init" "vault-init" "keycloak-init"; do
        local init_exit
        init_exit=$(docker inspect "dive-spoke-${code_lower}-${init_svc}" --format '{{.State.ExitCode}}' 2>/dev/null || echo "N/A")
        if [ "$init_exit" = "0" ]; then
            log_success "  ${init_svc}: completed successfully"
        elif [ "$init_exit" = "N/A" ]; then
            log_verbose "  ${init_svc}: not started (profile not active)"
        else
            log_warn "  ${init_svc}: exited with code ${init_exit}"
        fi
    done

    # =========================================================================
    # PHASE 3: FEDERATE (skip for standalone deployments)
    # =========================================================================
    phase_start=$(date +%s)

    local standalone_mode=false
    if [ "${DEPLOYMENT_MODE:-local}" = "standalone" ] || [ "${SKIP_FEDERATION:-false}" = "true" ]; then
        standalone_mode=true
    fi

    if [ "$standalone_mode" = "true" ]; then
        log_info ""
        log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        log_info "  Phase 3/3: FEDERATE (skipped — standalone mode)"
        log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        log_info "  To federate later: ./dive spoke federate $code_upper"
        phase_times+=("Phase 3 (Federate): skipped (standalone)")
    else
        log_info ""
        log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        log_info "  Phase 3/3: FEDERATE"
        log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        log_info "  Hub registration, OPAL token, Caddy proxy"

        # Reuse the existing configuration phase — it handles:
        #   - Terraform apply (Keycloak realm/client)
        #   - Federation registry registration
        #   - Federation setup (IdP links)
        #   - Secret sync
        #   - OPAL token provisioning
        #   - AMR attribute sync
        #   - OAuth redirect URI update
        #   - Caddy setup
        if ! spoke_phase_configuration "$code_upper" "deploy"; then
            log_error "Federation/configuration failed"

            if [ "${SKIP_FEDERATION_ERRORS:-false}" = "true" ]; then
                log_warn "Continuing despite federation errors (--skip-federation-errors)"
                phase_times+=("Phase 3 (Federate): $(($(date +%s) - phase_start))s [DEGRADED]")
            else
                phase_times+=("Phase 3 (Federate): $(($(date +%s) - phase_start))s [FAILED]")
                _spoke_v2_print_failure "$code_upper" "$instance_name" "$(($(date +%s) - start_time))" "FEDERATE"
                return 1
            fi
        else
            phase_times+=("Phase 3 (Federate): $(($(date +%s) - phase_start))s")
            log_success "Federation complete in $(($(date +%s) - phase_start))s"

            # Restart OPAL client with real token (if it was provisioned)
            local opal_token
            opal_token=$(grep "^SPOKE_OPAL_TOKEN=" "$env_file" 2>/dev/null | cut -d= -f2-)
            if [ -n "$opal_token" ] && [[ "$opal_token" =~ ^eyJ ]]; then
                log_step "Restarting OPAL client with provisioned token..."
                "${compose_cmd[@]}" up -d --force-recreate "opal-client-${code_lower}" 2>&1 || \
                    log_warn "OPAL client restart had issues (non-fatal)"
            fi
        fi
    fi

    # =========================================================================
    # DONE
    # =========================================================================
    local duration=$(($(date +%s) - start_time))

    _spoke_v2_print_success "$code_upper" "$instance_name" "$duration" "${phase_times[@]}"
    return 0
}

# =============================================================================
# DISPLAY HELPERS
# =============================================================================

_spoke_v2_print_success() {
    local code_upper="$1"
    local instance_name="$2"
    local duration="$3"
    shift 3
    local -a timings=("$@")

    echo ""
    echo "==============================================================================="
    echo "  SPOKE DEPLOYMENT COMPLETE — ${code_upper} (${instance_name})"
    echo "==============================================================================="
    for timing in "${timings[@]}"; do
        echo "  $timing"
    done
    echo "  ─────────────────────────────────────────────────────────────────"
    echo "  Total: ${duration}s"
    echo "==============================================================================="
    echo ""
    echo "  Useful commands:"
    printf "    ./dive --instance %-3s spoke status       # Check status\n" "$(lower "$code_upper")"
    printf "    ./dive --instance %-3s spoke health       # Health check\n" "$(lower "$code_upper")"
    printf "    ./dive federation verify %-3s            # Check federation\n" "$code_upper"
    echo ""
    echo "==============================================================================="
    echo ""
}

_spoke_v2_print_failure() {
    local code_upper="$1"
    local instance_name="$2"
    local duration="$3"
    local failed_phase="$4"

    echo ""
    echo "==============================================================================="
    echo "  SPOKE DEPLOYMENT FAILED — ${code_upper} at phase: ${failed_phase}"
    echo "==============================================================================="
    echo "  Duration: ${duration}s"
    echo ""
    echo "  Troubleshooting:"
    printf "    docker compose -f instances/%s/docker-compose.yml ps -a\n" "$(lower "$code_upper")"
    printf "    docker compose -f instances/%s/docker-compose.yml logs --tail=50\n" "$(lower "$code_upper")"
    echo ""
    echo "  Retry:"
    echo "    ./dive spoke deploy $code_upper --v2"
    echo "==============================================================================="
    echo ""
}
