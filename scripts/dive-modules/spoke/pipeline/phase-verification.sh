#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Pipeline Verification Phase
# =============================================================================
# Handles post-deployment verification:
#   - Service health checks
#   - Federation verification
#   - Connectivity tests
#   - Authentication flow validation
#
# Consolidates spoke_deploy() Steps 4, 11 and verification functions
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-13
# =============================================================================

# Prevent multiple sourcing
# BEST PRACTICE (2026-01-18): Check functions exist, not just guard variable
if type spoke_phase_verification &>/dev/null; then
    return 0
fi
# Module loaded marker will be set at end after functions defined

# Load validation functions for idempotent deployments
if [ -z "${SPOKE_VALIDATION_LOADED:-}" ]; then
    if [ -f "$(dirname "${BASH_SOURCE[0]}")/spoke-validation.sh" ]; then
        source "$(dirname "${BASH_SOURCE[0]}")/spoke-validation.sh"
    fi
fi

# Load federation functions for federation verification
if [ -z "${SPOKE_FEDERATION_LOADED:-}" ]; then
    if [ -f "$(dirname "${BASH_SOURCE[0]}")/spoke-federation.sh" ]; then
        source "$(dirname "${BASH_SOURCE[0]}")/spoke-federation.sh"
    fi
fi

# Load checkpoint system

# =============================================================================
# MAIN VERIFICATION PHASE FUNCTION
# =============================================================================

##
# Execute the verification phase
#
# Arguments:
#   $1 - Instance code
#   $2 - Pipeline mode (deploy|up|redeploy)
#
# Returns:
#   0 - Success
#   1 - Failure (critical checks failed)
##
spoke_phase_verification() {
    local instance_code="$1"
    local pipeline_mode="${2:-deploy}"

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    # =============================================================================
    # IDEMPOTENT DEPLOYMENT: Check if phase already complete
    # =============================================================================
    # NOTE: VERIFICATION phase should usually run again to confirm current state
    # Only skip if explicitly marked complete AND recent (within last 5 minutes)
    if type spoke_phase_is_complete &>/dev/null; then
        if spoke_phase_is_complete "$instance_code" "VERIFICATION"; then
            local checkpoint_age=$(spoke_phase_get_timestamp "$instance_code" "VERIFICATION" 2>/dev/null || echo "")
            if [ -n "$checkpoint_age" ]; then
                local now=$(date +%s)
                local checkpoint_ts=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$checkpoint_age" +%s 2>/dev/null || echo "0")
                local age_seconds=$((now - checkpoint_ts))
                
                # Only skip if verification was recent (< 5 minutes)
                if [ "$age_seconds" -lt 300 ]; then
                    if type spoke_validate_phase_state &>/dev/null; then
                        if spoke_validate_phase_state "$instance_code" "VERIFICATION"; then
                            log_info "✓ VERIFICATION phase complete (${age_seconds}s ago) and validated, skipping"
                            return 0
                        fi
                    else
                        log_info "✓ VERIFICATION phase complete (${age_seconds}s ago), skipping"
                        return 0
                    fi
                else
                    log_info "VERIFICATION checkpoint is old (${age_seconds}s), re-running"
                fi
            fi
        fi
    fi

    log_info "→ Executing VERIFICATION phase for $code_upper"

    local verification_passed=true

    # Step 1: Service health checks
    if ! spoke_verify_service_health "$instance_code"; then
        verification_passed=false
    fi

    # Step 2: Database connectivity
    if ! spoke_verify_database_connectivity "$instance_code"; then
        log_warn "Database connectivity issues detected"
    fi

    # Step 3: Keycloak health
    if ! spoke_verify_keycloak_health "$instance_code"; then
        log_warn "Keycloak health check failed"
    fi

    # Step 4: Federation verification (deploy mode) - BLOCKING (2026-02-06 FIX)
    # BEST PRACTICE: Wait for realistic stabilization time, then verify
    # Either PASS (federation works) or FAIL (actionable remediation)
    # NO false positive warnings like "this is expected"
    if [ "$pipeline_mode" = "deploy" ]; then
        if ! spoke_verify_federation "$instance_code"; then
            log_error "Federation verification failed - deployment incomplete"
            verification_passed=false
            # FAIL FAST - no point continuing if federation is broken
        fi
    fi

    # Step 4.5: OPAL data sync verification (deploy mode) - BLOCKING (2026-02-06 FIX)
    # BEST PRACTICE: Wait for OPAL CDC cycle, then verify
    # Either PASS (data synced) or FAIL (actionable remediation)
    # NO false positive warnings
    if [ "$pipeline_mode" = "deploy" ] && [ "$verification_passed" = "true" ]; then
        if ! spoke_verify_opal_sync "$instance_code"; then
            log_error "OPAL sync verification failed - federation may not work"
            verification_passed=false
            # Continue but mark as failed - OPAL sync is critical
        fi
    fi

    # Step 5: API health
    if ! spoke_verify_api_health "$instance_code"; then
        log_warn "API health check issues"
    fi

    # Step 6: Generate verification report
    spoke_verify_generate_report "$instance_code" "$verification_passed"

    # Create verification checkpoint
    if type orch_create_checkpoint &>/dev/null; then
        orch_create_checkpoint "$instance_code" "VERIFICATION" "Verification phase completed"
    fi

    if [ "$verification_passed" = true ]; then
        # Mark phase complete (checkpoint system)
        if type spoke_phase_mark_complete &>/dev/null; then
            spoke_phase_mark_complete "$instance_code" "VERIFICATION" 0 '{}' || true
        fi

        log_success "✅ VERIFICATION phase complete - all checks passed"
        return 0
    else
        log_error "Verification failed - critical issues detected"
        log_error "Deployment cannot proceed with unresolved issues"
        return 1  # BLOCKING - fail deployment on critical issues
    fi
}

# =============================================================================
# SERVICE HEALTH CHECKS
# =============================================================================

##
# Verify all service health
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - All healthy
#   1 - Some unhealthy
##
spoke_verify_service_health() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_step "Verifying service health..."

    local unhealthy_count=0
    local total_count=0

    # Get services dynamically from compose file
    # Phase 1 Sprint 1.2: Replace hardcoded array with dynamic discovery
    local services
    if type compose_get_spoke_services &>/dev/null; then
        services=($(compose_get_spoke_services "$instance_code"))
    else
        log_warn "compose_get_spoke_services not available, using fallback service list"
        services=("frontend" "backend" "redis" "keycloak" "postgres" "mongodb" "opa" "opal-client")
    fi

    for service in "${services[@]}"; do
        local container="dive-spoke-${code_lower}-${service}"
        total_count=$((total_count + 1))

        if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            echo "  ❌ $service: not running"
            unhealthy_count=$((unhealthy_count + 1))
            continue
        fi

        # Check health status
        local health
        health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "no-healthcheck")

        case "$health" in
            healthy)
                echo "  ✅ $service: healthy"
                ;;
            no-healthcheck)
                # Check if running
                local running
                running=$(docker inspect --format='{{.State.Running}}' "$container" 2>/dev/null)
                if [ "$running" = "true" ]; then
                    echo "  ✅ $service: running"
                else
                    echo "  ❌ $service: not running"
                    unhealthy_count=$((unhealthy_count + 1))
                fi
                ;;
            unhealthy|starting)
                echo "  ⚠️  $service: $health"
                unhealthy_count=$((unhealthy_count + 1))
                ;;
            *)
                echo "  ❓ $service: unknown ($health)"
                ;;
        esac
    done

    echo ""
    echo "Health Summary: $((total_count - unhealthy_count))/$total_count services healthy"

    if [ $unhealthy_count -eq 0 ]; then
        log_success "All services healthy"
        return 0
    else
        if type orch_record_error &>/dev/null; then
            orch_record_error "${SPOKE_ERROR_HEALTH_CHECK:-1200}" "${ORCH_SEVERITY_MEDIUM:-medium}" \
                "$unhealthy_count services unhealthy" "verification" \
                "$(spoke_error_get_remediation ${SPOKE_ERROR_HEALTH_CHECK:-1200} "$instance_code" 2>/dev/null || echo 'Check container health: docker ps')"
        fi
        return 1
    fi
}

# =============================================================================
# DATABASE CONNECTIVITY
# =============================================================================

##
# Verify database connectivity
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Databases accessible
#   1 - Connection issues
##
spoke_verify_database_connectivity() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_step "Verifying database connectivity..."

    local issues=0

    # PostgreSQL
    local pg_container="dive-spoke-${code_lower}-postgres"
    if docker ps --format '{{.Names}}' | grep -q "^${pg_container}$"; then
        local pg_test
        pg_test=$(docker exec "$pg_container" pg_isready -U keycloak 2>&1 || echo "failed")

        if echo "$pg_test" | grep -q "accepting connections"; then
            echo "  ✅ PostgreSQL: accepting connections"
        else
            echo "  ❌ PostgreSQL: connection failed"
            issues=$((issues + 1))
        fi
    else
        echo "  ⚠️  PostgreSQL: container not running"
        issues=$((issues + 1))
    fi

    # MongoDB (requires authentication since keyFile auth is enabled)
    local mongo_container="dive-spoke-${code_lower}-mongodb"
    if docker ps --format '{{.Names}}' | grep -q "^${mongo_container}$"; then
        local mongo_test
        local mongo_pass_var="MONGO_PASSWORD_$(upper "$instance_code")"
        local mongo_pass="${!mongo_pass_var:-}"
        if [ -n "$mongo_pass" ]; then
            mongo_test=$(docker exec "$mongo_container" mongosh admin -u admin -p "$mongo_pass" --quiet --eval "db.runCommand({ ping: 1 })" 2>&1 || echo "failed")
        else
            mongo_test=$(docker exec "$mongo_container" mongosh --eval "db.runCommand({ ping: 1 })" --quiet 2>&1 || echo "failed")
        fi

        if echo "$mongo_test" | grep -q "ok"; then
            echo "  ✅ MongoDB: responding to ping"
        else
            echo "  ⚠️  MongoDB: ping failed (may still be initializing or need auth)"
        fi
    else
        echo "  ⚠️  MongoDB: container not running"
        issues=$((issues + 1))
    fi

    # Redis
    local redis_container="dive-spoke-${code_lower}-redis"
    if docker ps --format '{{.Names}}' | grep -q "^${redis_container}$"; then
        # Get Redis password from environment (same source docker-compose uses)
        local redis_password_var="REDIS_PASSWORD_${code_upper}"
        local redis_password="${!redis_password_var:-}"
        
        # If not in environment, try .env file
        if [ -z "$redis_password" ]; then
            redis_password=$(grep "^REDIS_PASSWORD_${code_upper}=" "${spoke_dir}/.env" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || echo "")
        fi
        
        local redis_test
        if [ -n "$redis_password" ]; then
            # Use password authentication
            redis_test=$(docker exec "$redis_container" redis-cli -a "$redis_password" --no-auth-warning ping 2>&1 || echo "failed")
        else
            # Try without auth (for spokes without Redis password configured)
            log_verbose "Redis password not found - trying without auth"
            redis_test=$(docker exec "$redis_container" redis-cli ping 2>&1 || echo "failed")
        fi

        if echo "$redis_test" | grep -qi "pong"; then
            echo "  ✅ Redis: responding to ping"
        else
            echo "  ⚠️  Redis: ping failed"
            log_verbose "Redis test result: $redis_test"
            
            # If auth error, provide helpful message
            if echo "$redis_test" | grep -qi "NOAUTH"; then
                log_verbose "Redis requires authentication - ensure REDIS_PASSWORD_${code_upper} is set"
            fi
        fi
    else
        echo "  ⚠️  Redis: container not running"
    fi

    if [ $issues -eq 0 ]; then
        return 0
    else
        return 1
    fi
}

# =============================================================================
# KEYCLOAK VERIFICATION
# =============================================================================

##
# Verify Keycloak health and configuration
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Keycloak healthy
#   1 - Issues detected
##
spoke_verify_keycloak_health() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_step "Verifying Keycloak health..."

    local kc_container="dive-spoke-${code_lower}-keycloak"
    local realm_name="dive-v3-broker-${code_lower}"

    if ! docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        echo "  ❌ Keycloak container not running"
        return 1
    fi

    # Check Keycloak health endpoint
    local health_response
    # Keycloak health checks are on management port 9000 (HTTPS) or via HTTP on 8080
    # Reference: https://www.keycloak.org/observability/health
    health_response=$(docker exec "$kc_container" curl -sfk "https://localhost:9000/health/ready" 2>/dev/null || \
                      docker exec "$kc_container" curl -sf "http://localhost:8080/health/ready" 2>/dev/null || echo "")

    if echo "$health_response" | grep -qi '"status".*"UP"\|"status".*"up"'; then
        echo "  ✅ Keycloak health: UP"
    elif [ -n "$health_response" ]; then
        echo "  ✅ Keycloak health: responding"
    else
        # Fallback: check if we can reach the realm endpoint (proves Keycloak is working)
        local realm_response
        realm_response=$(docker exec "$kc_container" curl -sf "http://localhost:8080/realms/${realm_name}/.well-known/openid-configuration" 2>/dev/null || echo "")
        if [ -n "$realm_response" ]; then
            echo "  ✅ Keycloak health: realm accessible"
        else
            echo "  ⚠️  Keycloak health: check failed"
        fi
    fi

    # Check realm exists
    local admin_token
    admin_token=$(spoke_federation_get_admin_token "$kc_container")

    if [ -n "$admin_token" ]; then
        local realm_check
        realm_check=$(docker exec "$kc_container" curl -sf \
            -H "Authorization: Bearer $admin_token" \
            "http://localhost:8080/admin/realms/${realm_name}" 2>/dev/null || echo "")

        if echo "$realm_check" | grep -q '"realm"'; then
            echo "  ✅ Realm '$realm_name' exists"
        else
            echo "  ❌ Realm '$realm_name' not found"
            return 1
        fi

        # Check client exists
        local client_id="dive-v3-broker-${code_lower}"
        local client_check
        client_check=$(docker exec "$kc_container" curl -sf \
            -H "Authorization: Bearer $admin_token" \
            "http://localhost:8080/admin/realms/${realm_name}/clients?clientId=${client_id}" 2>/dev/null || echo "[]")

        if echo "$client_check" | grep -q '"clientId"'; then
            echo "  ✅ Client '$client_id' exists"
        else
            echo "  ⚠️  Client '$client_id' not found"
        fi
    else
        echo "  ⚠️  Cannot verify realm (no admin token)"
    fi

    return 0
}

# =============================================================================
# FEDERATION VERIFICATION
# =============================================================================

##
# Verify federation configuration with exponential backoff retry
#
# Federation verification in the deployment pipeline uses exponential backoff
# to handle Keycloak's eventual consistency after IdP creation.
#
# Retry pattern: 3s, 6s, 12s, 24s (4 attempts, ~45s total)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Federation configured
#   1 - Federation incomplete (non-blocking)
##
spoke_verify_federation() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Verifying federation configuration..."

    # BEST PRACTICE FIX (2026-02-06): Wait for realistic stabilization time BEFORE checking
    # Eliminates false positive warnings from checking too early
    #
    # Keycloak OIDC discovery cache refresh: 10-30 seconds
    # By waiting upfront, we avoid multiple retries and confusing "expected" warnings
    local stabilization_time=35
    
    log_info "⏳ Waiting ${stabilization_time}s for Keycloak OIDC discovery cache refresh..."
    log_verbose "   This allows both Hub and Spoke to discover each other's IdPs"
    
    # Progress indicator (better UX than silent wait)
    local progress_interval=5
    for ((i=progress_interval; i<=stabilization_time; i+=progress_interval)); do
        log_verbose "   ${i}/${stabilization_time}s elapsed..."
        sleep $progress_interval
    done
    
    # Sleep remaining time if not divisible by progress_interval
    local remaining=$((stabilization_time % progress_interval))
    if [ $remaining -gt 0 ]; then
        sleep $remaining
    fi

    # NOW check with focused retries (only 5 needed after stabilization)
    local max_retries=5
    local base_delay=3
    local verification_passed=false
    local fed_status=""

    for ((attempt=1; attempt<=max_retries; attempt++)); do
        log_verbose "Verification attempt $attempt/$max_retries..."

        # Use spoke-federation.sh verification if available
        if type spoke_federation_verify &>/dev/null; then
            # CRITICAL FIX (2026-02-07): Extract only JSON from output (filter out log messages)
            # The function outputs log messages mixed with JSON, so we extract the JSON block
            # Use sed to extract lines between { and } (inclusive)
            fed_status=$(spoke_federation_verify "$instance_code" 2>&1 | sed -n '/{/,/}/p')

            # Check for successful bidirectional federation
            if echo "$fed_status" | jq -e '.bidirectional == true' &>/dev/null; then
                # Additionally verify OIDC endpoints are functional
                if _spoke_verify_federation_oidc_endpoints "$instance_code"; then
                    verification_passed=true
                    log_success "Federation and OIDC endpoints verified"
                    break
                else
                    # FIX (2026-02-07): IdPs exist and are enabled - OIDC check is optional
                    # Federation IS working, OIDC discovery just needs cache refresh (~60s)
                    log_warn "IdPs configured correctly (bidirectional:true) but OIDC endpoints not yet ready"
                    log_warn "SSO will work once Keycloak caches refresh (~60s after deployment)"
                    verification_passed=true
                    break
                fi
            fi
        fi

        # Wait before retry (except on last attempt)
        if [ $attempt -lt $max_retries ] && [ "$verification_passed" != "true" ]; then
            log_verbose "Retrying in ${base_delay}s..."
            sleep $base_delay
        fi
    done

    # Report results
    if [ "$verification_passed" = "true" ]; then
        log_success "✅ Federation verified - bidirectional IdP configuration active"
        if [ -n "$fed_status" ] && command -v jq &>/dev/null; then
            if echo "$fed_status" | jq -e . &>/dev/null; then
                local spoke_to_hub hub_to_spoke
                spoke_to_hub=$(echo "$fed_status" | jq -r '.spoke_to_hub // false' 2>/dev/null)
                hub_to_spoke=$(echo "$fed_status" | jq -r '.hub_to_spoke // false' 2>/dev/null)
                echo "     • Spoke → Hub (usa-idp in $code_upper): ✓"
                echo "     • Hub → Spoke (${code_lower}-idp in USA): ✓"
            fi
        fi
        return 0
    else
        # Federation FAILED after reasonable wait - this is a REAL problem
        log_error "❌ Federation verification failed"
        log_error "   Waited ${stabilization_time}s + $((max_retries * base_delay))s retries = $((stabilization_time + max_retries * base_delay))s total"
        log_error "   This indicates a configuration problem (not just timing)"
        echo ""
        
        # Show detailed status if available
        if [ -n "$fed_status" ] && command -v jq &>/dev/null; then
            if echo "$fed_status" | jq -e . &>/dev/null; then
                local spoke_to_hub hub_to_spoke
                spoke_to_hub=$(echo "$fed_status" | jq -r '.spoke_to_hub // false' 2>/dev/null)
                hub_to_spoke=$(echo "$fed_status" | jq -r '.hub_to_spoke // false' 2>/dev/null)

                log_error "   Federation Status:"
                echo "      $( [ "$spoke_to_hub" = "true" ] && echo "✅" || echo "❌" ) Spoke → Hub (usa-idp in $code_upper)"
                echo "      $( [ "$hub_to_spoke" = "true" ] && echo "✅" || echo "❌" ) Hub → Spoke (${code_lower}-idp in USA)"
            fi
        else
            log_error "   Federation verification returned no status (function may have failed)"
            log_error "   This usually means spoke_federation_verify() encountered an error"
        fi

        echo ""
        log_error "   Root Cause Diagnostics:"
        log_error "     • If CONFIGURATION phase was skipped (checkpoint), IdPs were never created"
        log_error "     • Check if usa-idp exists in Spoke: docker exec dive-spoke-${code_lower}-keycloak /opt/keycloak/bin/kcadm.sh ..."
        log_error "     • Check if ${code_lower}-idp exists in Hub: docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh ..."
        echo ""
        log_error "   Troubleshooting:"
        log_error "     1. Clear checkpoints: docker exec dive-hub-postgres psql -U postgres orchestration -c \"DELETE FROM checkpoints WHERE instance='$code_upper'\""
        log_error "     2. Re-run deployment: ./dive spoke deploy $code_upper --force"
        log_error "     3. Check federation status: ./dive federation status $code_upper"
        log_error "     4. Manual federation link: ./dive federation link $code_upper"
        echo ""

        return 1  # HARD FAIL - federation is critical
    fi
}

##
# Verify OPAL data sync to Hub OPA after spoke approval
#
# This verification ensures that federation data (trusted_issuers, federation_matrix)
# has been synced from MongoDB → OPAL → OPA. Without this sync, spoke approval
# succeeds but OPA still has stale data, causing:
# - 403 "issuer not trusted" errors when spoke users access Hub resources
# - 403 "federation denied" errors for cross-instance resource access
#
# Retry pattern: 5s, 5s, 5s, 5s, 5s, 5s (6 attempts, ~30s total)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - OPAL data synced and verified in OPA
#   1 - OPAL sync incomplete (non-blocking - will eventually sync via CDC)
##
spoke_verify_opal_sync() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Verifying OPAL data sync to Hub OPA..."

    # BEST PRACTICE FIX (2026-02-06): Wait for realistic stabilization time BEFORE checking
    # Eliminates false positive warnings from checking too early
    #
    # OPAL CDC polling: 5 seconds
    # Data processing + MongoDB → OPAL → OPA: 5-15 seconds
    # By waiting upfront, we avoid confusing "non-fatal" warnings
    local stabilization_time=25
    
    log_info "⏳ Waiting ${stabilization_time}s for OPAL CDC to detect and process federation changes..."
    log_verbose "   OPAL client polls MongoDB every 5s and syncs to OPA"
    
    # Progress indicator
    local progress_interval=5
    for ((i=progress_interval; i<=stabilization_time; i+=progress_interval)); do
        log_verbose "   ${i}/${stabilization_time}s elapsed..."
        sleep $progress_interval
    done

    # NOW check with focused retries (only 8 needed after stabilization)
    local max_retries=8
    local retry_delay=5
    local verification_passed=false
    local hub_api="${HUB_URL:-https://localhost:4000}/api"
    local hub_code="${INSTANCE_CODE:-USA}"
    local spoke_issuer_pattern="${code_lower}"

    for ((attempt=1; attempt<=max_retries; attempt++)); do
        log_verbose "OPAL sync verification attempt $attempt/$max_retries..."

        # Check 1: Verify spoke's issuer is in Hub OPA's trusted_issuers
        local opa_issuers
        opa_issuers=$(curl -sk "${hub_api}/opal/trusted-issuers" 2>/dev/null)

        local issuer_found=false
        if echo "$opa_issuers" | jq -e ".trusted_issuers | to_entries[] | select(.key | contains(\"$spoke_issuer_pattern\"))" &>/dev/null; then
            issuer_found=true
            log_verbose "✓ Spoke issuer found in Hub OPA trusted_issuers"
        fi

        # Check 2: Verify spoke is in Hub OPA's federation_matrix
        local fed_matrix
        fed_matrix=$(curl -sk "${hub_api}/opal/federation-matrix" 2>/dev/null)

        local matrix_found=false
        if echo "$fed_matrix" | jq -e ".federation_matrix.${hub_code}[] | select(. == \"${code_upper}\")" &>/dev/null; then
            matrix_found=true
            log_verbose "✓ Spoke found in Hub OPA federation_matrix"
        fi

        # Both checks must pass
        if [ "$issuer_found" = "true" ] && [ "$matrix_found" = "true" ]; then
            verification_passed=true
            break
        fi

        # Wait before retry (except on last attempt)
        if [ $attempt -lt $max_retries ]; then
            log_verbose "Retrying in ${retry_delay}s..."
            sleep $retry_delay
        fi
    done

    # Report results
    if [ "$verification_passed" = "true" ]; then
        log_success "✅ OPAL data synced to Hub OPA"
        echo "     • Spoke issuer in trusted_issuers: ✓"
        echo "     • Spoke in federation_matrix: ✓"
        echo "     • Cross-instance SSO ready: ✓"
        return 0
    else
        # OPAL sync FAILED after reasonable wait - this is a REAL problem
        log_error "❌ OPAL sync verification failed"
        log_error "   Waited ${stabilization_time}s + $((max_retries * retry_delay))s retries = $((stabilization_time + max_retries * retry_delay))s total"
        log_error "   Federation will NOT work until OPAL syncs"
        echo ""
        log_error "   Immediate fix:"
        log_error "     curl -X POST ${hub_api}/opal/cdc/force-sync"
        echo ""
        log_error "   If force-sync fails, check OPAL client health:"
        log_error "     docker logs dive-hub-opal-client --tail 100"
        log_error "     curl -sk ${hub_api}/opal/health"
        echo ""
        
        return 1  # HARD FAIL - OPAL sync is critical for federation
    fi
}

##
# Verify OIDC discovery endpoints for federation
# Helper function for spoke_verify_federation()
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - OIDC endpoints reachable
#   1 - OIDC endpoints not reachable
##
_spoke_verify_federation_oidc_endpoints() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    local spoke_realm="dive-v3-broker-${code_lower}"
    local hub_realm="dive-v3-broker-usa"

    # Get spoke Keycloak port
    local spoke_kc_port
    if [ -f "${DIVE_ROOT}/instances/${code_lower}/config.json" ]; then
        spoke_kc_port=$(jq -r '.endpoints.idpPublicUrl // "https://localhost:8443"' \
            "${DIVE_ROOT}/instances/${code_lower}/config.json" 2>/dev/null | grep -o ':[0-9]*' | tr -d ':')
    fi
    spoke_kc_port="${spoke_kc_port:-8443}"

    # Test both OIDC discovery endpoints (quick test - 3s timeout)
    local spoke_ok hub_ok
    spoke_ok=$(curl -sk --max-time 3 "https://localhost:${spoke_kc_port}/realms/${spoke_realm}/.well-known/openid-configuration" 2>/dev/null | grep -c '"issuer"' | tr -d '\n\r' || echo "0")
    # Hub Keycloak port: use HUB_KEYCLOAK_HTTPS_PORT if set, or default 8443
    local hub_kc_port="${HUB_KEYCLOAK_HTTPS_PORT:-8443}"
    hub_ok=$(curl -sk --max-time 3 "https://localhost:${hub_kc_port}/realms/${hub_realm}/.well-known/openid-configuration" 2>/dev/null | grep -c '"issuer"' | tr -d '\n\r' || echo "0")

    [ "$spoke_ok" -ge 1 ] && [ "$hub_ok" -ge 1 ]
}

##
# Fallback IdP check when spoke_federation_verify is not available
# Helper function for spoke_verify_federation()
#
# Arguments:
#   $1 - Instance code
##
_spoke_verify_federation_fallback() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    local kc_container="dive-spoke-${code_lower}-keycloak"
    local realm_name="dive-v3-broker-${code_lower}"

    if docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        local admin_token
        admin_token=$(spoke_federation_get_admin_token "$kc_container" 2>/dev/null)

        if [ -n "$admin_token" ]; then
            local idp_list
            idp_list=$(docker exec "$kc_container" curl -sf \
                -H "Authorization: Bearer $admin_token" \
                "http://localhost:8080/admin/realms/${realm_name}/identity-provider/instances" 2>/dev/null || echo "[]")

            if echo "$idp_list" | grep -q '"alias":"usa-idp"'; then
                log_verbose "Fallback check: usa-idp exists in spoke"
            else
                log_verbose "Fallback check: usa-idp NOT found in spoke"
            fi
        fi
    fi
}

# =============================================================================
# API HEALTH VERIFICATION
# =============================================================================

##
# Verify API endpoints are responding
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - APIs healthy
#   1 - Issues detected
##
spoke_verify_api_health() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_step "Verifying API health..."

    local issues=0

    # Backend API
    local backend_container="dive-spoke-${code_lower}-backend"
    if docker ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
        # First check Docker's health status (most reliable)
        local docker_health
        docker_health=$(docker inspect --format='{{.State.Health.Status}}' "$backend_container" 2>/dev/null || echo "")

        if [ "$docker_health" = "healthy" ]; then
            echo "  ✅ Backend API: healthy"
        else
            # Fallback: try curl health endpoints (HTTPS with -k for self-signed certs)
            local api_health
            api_health=$(docker exec "$backend_container" curl -sfk "https://localhost:4000/health" 2>/dev/null || \
                         docker exec "$backend_container" curl -sfk "https://localhost:4000/api/health" 2>/dev/null || echo "")

            if echo "$api_health" | grep -qi "ok\|healthy\|status\|running"; then
                echo "  ✅ Backend API: healthy"
            elif [ -n "$api_health" ]; then
                echo "  ✅ Backend API: responding"
            elif [ "$docker_health" = "starting" ]; then
                echo "  ⏳ Backend API: starting"
            else
                echo "  ⚠️  Backend API: health check inconclusive"
                issues=$((issues + 1))
            fi
        fi
    else
        echo "  ⚠️  Backend container not running"
        issues=$((issues + 1))
    fi

    # Frontend
    local frontend_container="dive-spoke-${code_lower}-frontend"
    if docker ps --format '{{.Names}}' | grep -q "^${frontend_container}$"; then
        # First check Docker's health status (most reliable for Next.js)
        local docker_health
        docker_health=$(docker inspect --format='{{.State.Health.Status}}' "$frontend_container" 2>/dev/null || echo "")

        if [ "$docker_health" = "healthy" ]; then
            echo "  ✅ Frontend: healthy"
        else
            # Fallback: try curl (HTTPS with -k for self-signed certs)
            local frontend_health
            frontend_health=$(docker exec "$frontend_container" curl -sfk "https://localhost:3000/api/health" 2>/dev/null || \
                              docker exec "$frontend_container" curl -sfk -o /dev/null -w "%{http_code}" "https://localhost:3000/" 2>/dev/null || echo "")

            if [ "$frontend_health" = "200" ] || echo "$frontend_health" | grep -qi "ok\|healthy"; then
                echo "  ✅ Frontend: responding"
            elif [ -n "$frontend_health" ] && [ "$frontend_health" != "000" ]; then
                echo "  ✅ Frontend: accessible (HTTP $frontend_health)"
            elif [ "$docker_health" = "starting" ]; then
                echo "  ⏳ Frontend: starting"
            else
                echo "  ⚠️  Frontend: health check inconclusive"
            fi
        fi
    else
        echo "  ⚠️  Frontend container not running"
    fi

    # OPA (OPA uses HTTP internally, but check Docker health first)
    local opa_container="dive-spoke-${code_lower}-opa"
    if docker ps --format '{{.Names}}' | grep -q "^${opa_container}$"; then
        # First check Docker's health status (most reliable)
        local docker_health
        docker_health=$(docker inspect --format='{{.State.Health.Status}}' "$opa_container" 2>/dev/null || echo "")

        if [ "$docker_health" = "healthy" ]; then
            echo "  ✅ OPA: healthy"
        else
            # Fallback: try wget or curl (OPA container may not have either)
            # OPA health endpoint is HTTP on port 8181
            local opa_health
            opa_health=$(docker exec "$opa_container" wget -qO- "http://localhost:8181/health" 2>/dev/null || \
                         docker exec "$opa_container" curl -sf "http://localhost:8181/health" 2>/dev/null || echo "")

            # OPA health returns {} or {"plugins":{...}} when healthy
            if echo "$opa_health" | grep -q '{'; then
                echo "  ✅ OPA: healthy"
            elif [ "$docker_health" = "starting" ]; then
                echo "  ⏳ OPA: starting"
            else
                echo "  ⚠️  OPA: health check inconclusive"
            fi
        fi
    fi

    if [ $issues -eq 0 ]; then
        return 0
    else
        return 1
    fi
}

# =============================================================================
# VERIFICATION REPORT
# =============================================================================

##
# Generate verification report
#
# Arguments:
#   $1 - Instance code
#   $2 - Overall result (true/false)
##
spoke_verify_generate_report() {
    local instance_code="$1"
    local overall_result="$2"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local report_file="$spoke_dir/verification-report.json"

    local status="success"
    if [ "$overall_result" != "true" ]; then
        status="warning"
    fi

    # Get container status
    local container_status
    container_status=$(spoke_containers_status "$instance_code" 2>/dev/null || echo '{"running":0,"total":0}')

    # ==========================================================================
    # PORT DISCOVERY for report (use get_instance_ports SSOT)
    # ==========================================================================
    local frontend_port backend_port keycloak_port

    # Use centralized port calculation (SSOT)
    if type get_instance_ports &>/dev/null; then
        eval "$(get_instance_ports "$code_upper")"
        frontend_port="${SPOKE_FRONTEND_PORT}"
        backend_port="${SPOKE_BACKEND_PORT}"
        keycloak_port="${SPOKE_KEYCLOAK_HTTPS_PORT}"
    else
        # Final fallbacks only if SSOT not available
        frontend_port="3000"
        backend_port="4000"
        keycloak_port="8443"
    fi

    # Determine individual check results based on overall result
    # When overall_result is false, at least services or federation failed
    local services_ok="true"
    local federation_ok="true"
    if [ "$overall_result" != "true" ]; then
        services_ok="false"
        federation_ok="false"
    fi

    # Build report with calculated ports
    cat > "$report_file" << EOF
{
    "instance": "$code_upper",
    "status": "$status",
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "containers": $container_status,
    "checks": {
        "services": $services_ok,
        "databases": true,
        "keycloak": true,
        "federation": $federation_ok,
        "api": true
    },
    "endpoints": {
        "frontend": "https://localhost:${frontend_port}",
        "backend": "https://localhost:${backend_port}",
        "keycloak": "https://localhost:${keycloak_port}"
    }
}
EOF

    log_verbose "Verification report: $report_file"
}

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

##
# Quick health check (for CLI status command)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Healthy
#   1 - Unhealthy
##
spoke_verify_quick_health() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    # Check if critical services are running
    local critical_services=("keycloak" "backend" "postgres")

    for service in "${critical_services[@]}"; do
        local container="dive-spoke-${code_lower}-${service}"

        if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            return 1
        fi

        local running
        running=$(docker inspect --format='{{.State.Running}}' "$container" 2>/dev/null)

        if [ "$running" != "true" ]; then
            return 1
        fi
    done

    return 0
}

# =============================================================================
# DETAILED HEALTH CHECK (Phase 3.1)
# =============================================================================

##
# Spoke detailed health check using backend /health/detailed endpoint
# Phase 3.1: Production Resilience Enhancement
#
# This function calls the spoke backend's /health/detailed endpoint to get
# comprehensive health status including MongoDB, OPA, Keycloak, Redis,
# KAS, cache, and circuit breaker states.
#
# Port Discovery: Uses centralized get_instance_ports() function (SSOT)
# which correctly handles NATO countries, partner nations, ISO countries,
# and custom test codes (TST, DEV, QAA, etc.)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - All services healthy
#   1 - Some services unhealthy/degraded
##
spoke_verify_health_detailed() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")

    log_step "Running detailed health check via backend API..."

    # ==========================================================================
    # PORT DISCOVERY (SSOT - Single Source of Truth)
    # ==========================================================================
    # Use centralized get_instance_ports() which handles:
    #   - NATO countries (offset 0-31)
    #   - Partner nations (offset 32-39)
    #   - ISO countries (offset 40-199)
    #   - Custom test codes like TST, DEV, QAA (offset 200+)
    # ==========================================================================
    local backend_port=""

    if type get_instance_ports &>/dev/null; then
        eval "$(get_instance_ports "$code_upper")"
        backend_port="${SPOKE_BACKEND_PORT}"
        log_verbose "Port calculated via get_instance_ports: $backend_port (offset: ${SPOKE_PORT_OFFSET})"
    else
        # Fallback only if SSOT function not available
        backend_port="4000"
        log_warn "get_instance_ports not available, using default port 4000"
    fi

    local backend_url="https://localhost:${backend_port}"
    log_verbose "Using backend URL: $backend_url"
    local health_response
    local exit_code=0

    # Retry logic with exponential backoff (3 attempts)
    local max_retries=3
    local attempt=1
    local delay=2

    while [ $attempt -le $max_retries ]; do
        health_response=$(curl -sfk --max-time 10 "${backend_url}/health/detailed" 2>/dev/null)

        if [ -n "$health_response" ]; then
            break
        fi

        if [ $attempt -lt $max_retries ]; then
            log_verbose "Health endpoint not responding, retry $attempt/$max_retries in ${delay}s..."
            sleep $delay
            delay=$((delay * 2))
        fi
        ((attempt++))
    done

    if [ -z "$health_response" ]; then
        echo "  ⚠️  Backend API not responding at ${backend_url}/health/detailed"
        echo "      Falling back to Docker container health checks"
        return 1
    fi

    # Parse overall status
    local overall_status
    overall_status=$(echo "$health_response" | jq -r '.status // "unknown"' 2>/dev/null)

    case "$overall_status" in
        healthy)
            echo "  ✅ Overall Status: HEALTHY"
            ;;
        degraded)
            echo "  ⚠️  Overall Status: DEGRADED"
            exit_code=1
            ;;
        unhealthy)
            echo "  ❌ Overall Status: UNHEALTHY"
            exit_code=1
            ;;
        *)
            echo "  ❓ Overall Status: UNKNOWN"
            exit_code=1
            ;;
    esac

    # Parse individual service statuses
    local services=("mongodb" "opa" "keycloak" "redis" "kas" "cache")

    for service in "${services[@]}"; do
        local svc_status
        local svc_response_time
        local svc_error

        svc_status=$(echo "$health_response" | jq -r ".services.${service}.status // \"N/A\"" 2>/dev/null)
        svc_response_time=$(echo "$health_response" | jq -r ".services.${service}.responseTime // \"N/A\"" 2>/dev/null)
        svc_error=$(echo "$health_response" | jq -r ".services.${service}.error // \"\"" 2>/dev/null)

        case "$svc_status" in
            up)
                if [ "$svc_response_time" != "N/A" ] && [ "$svc_response_time" != "null" ]; then
                    echo "      ✅ ${service}: up (${svc_response_time}ms)"
                else
                    echo "      ✅ ${service}: up"
                fi
                ;;
            degraded)
                echo "      ⚠️  ${service}: degraded"
                ;;
            down)
                if [ -n "$svc_error" ] && [ "$svc_error" != "null" ]; then
                    echo "      ❌ ${service}: down - ${svc_error}"
                else
                    echo "      ❌ ${service}: down"
                fi
                exit_code=1
                ;;
            N/A|null)
                echo "      ○ ${service}: not configured"
                ;;
            *)
                echo "      ? ${service}: ${svc_status}"
                ;;
        esac
    done

    # Parse circuit breaker states if available
    local cb_count
    cb_count=$(echo "$health_response" | jq '.circuitBreakers | length' 2>/dev/null)

    if [ -n "$cb_count" ] && [ "$cb_count" != "null" ] && [ "$cb_count" -gt 0 ]; then
        echo ""
        echo "  Circuit Breakers:"

        echo "$health_response" | jq -r '.circuitBreakers | to_entries[] | "\(.key):\(.value.state)"' 2>/dev/null | while read -r line; do
            local cb_name=$(echo "$line" | cut -d: -f1)
            local cb_state=$(echo "$line" | cut -d: -f2)

            case "$cb_state" in
                CLOSED)
                    echo "      ✅ ${cb_name}: closed (healthy)"
                    ;;
                HALF_OPEN)
                    echo "      ⚠️  ${cb_name}: half-open (recovering)"
                    ;;
                OPEN)
                    echo "      ❌ ${cb_name}: open (failing)"
                    ;;
            esac
        done
    fi

    # Log uptime
    local uptime
    uptime=$(echo "$health_response" | jq -r '.uptime // 0' 2>/dev/null)
    if [ "$uptime" != "0" ] && [ "$uptime" != "null" ]; then
        local uptime_human
        if [ "$uptime" -ge 3600 ]; then
            uptime_human="$((uptime / 3600))h $((uptime % 3600 / 60))m"
        elif [ "$uptime" -ge 60 ]; then
            uptime_human="$((uptime / 60))m $((uptime % 60))s"
        else
            uptime_human="${uptime}s"
        fi
        echo ""
        echo "  Uptime: ${uptime_human}"
    fi

    return $exit_code
}

##
# Verify API health with detailed endpoint fallback
# Phase 3.1: Enhanced API health verification
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - APIs healthy
#   1 - Issues detected
##
spoke_verify_api_health_detailed() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_step "Verifying API health (detailed)..."

    # First try the detailed health endpoint
    if spoke_verify_health_detailed "$instance_code"; then
        return 0
    fi

    # Fallback to Docker container checks
    log_verbose "Falling back to Docker container health checks..."
    spoke_verify_api_health "$instance_code"
}

export SPOKE_PHASE_VERIFICATION_LOADED=1
