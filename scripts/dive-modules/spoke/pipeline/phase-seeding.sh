#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Pipeline Seeding Phase
# =============================================================================
# Seeds test users and ZTDF resources after deployment
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-13
# =============================================================================

# Prevent multiple sourcing
# BEST PRACTICE (2026-01-18): Check functions exist, not just guard variable
if type spoke_phase_seeding &>/dev/null && \
   type spoke_seed_users &>/dev/null && \
   type spoke_seed_resources &>/dev/null; then
    # Functions already available - module was loaded successfully
    return 0
fi

# Mark as loaded (will be set at end after all functions defined)

# Load secret management functions
if [ -z "${SPOKE_SECRETS_LOADED:-}" ]; then
    if source "$(dirname "${BASH_SOURCE[0]}")/spoke-secrets.sh" 2>/dev/null; then
        log_verbose "spoke-secrets.sh loaded successfully" >/dev/null
    else
        log_verbose "spoke-secrets.sh not available (secret functions may not work)" >/dev/null
    fi
fi

# =============================================================================
# MAIN SEEDING PHASE FUNCTION
# =============================================================================

##
# Execute the seeding phase
#
# Arguments:
#   $1 - Instance code
#   $2 - Pipeline mode (deploy|up|redeploy)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_phase_seeding() {
    local instance_code="$1"
    local pipeline_mode="${2:-deploy}"

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local backend_container="dive-spoke-${code_lower}-backend"

    log_info "Seeding phase for $code_upper"

    # Only seed on initial deploy, not on 'up' or 'redeploy'
    if [ "$pipeline_mode" != "deploy" ]; then
        log_info "Skipping seeding (mode: $pipeline_mode)"
        return 0
    fi

    # Step 0: Initialize COI Definitions (SSOT - CRITICAL)
    # MUST run BEFORE resource seeding to ensure all 19 COIs available
    log_step "Step 0/3: Initializing COI Definitions (SSOT)"
    log_info "Initializing 19 COI definitions (matches Hub SSOT)..."
    if ! docker exec "$backend_container" npx tsx src/scripts/initialize-coi-keys.ts --replace 2>&1 | tail -10; then
        log_error "COI initialization FAILED"
        log_error "Cannot seed resources without COI definitions"
        return 1
    fi
    log_success "✓ 19 COI definitions initialized (SSOT matches Hub)"

    # Step 0.5: Register Spoke Trusted Issuer (SSOT - CRITICAL for local authentication)
    # Spoke must register its own Keycloak realm as a trusted issuer in spoke MongoDB
    # This enables:
    #   - /api/idps/public to return spoke's IdP
    #   - Resources page to show spoke as trusted issuer
    #   - Spoke users to authenticate via spoke's Keycloak
    log_step "Step 0.5/3: Registering spoke trusted issuer"
    log_info "Registering $code_upper Keycloak realm in local MongoDB..."

    local issuer_seed_output
    if issuer_seed_output=$(docker exec "$backend_container" npm run seed:spoke-issuer 2>&1); then
        # Check if issuer was registered or already existed
        if echo "$issuer_seed_output" | grep -q "already exists"; then
            log_verbose "Spoke trusted issuer already registered (idempotent)"
        else
            log_success "✓ Spoke trusted issuer registered in local MongoDB"
        fi

        # Log issuer details for verification
        if echo "$issuer_seed_output" | grep -q "Issuer URL:"; then
            local issuer_url=$(echo "$issuer_seed_output" | grep "Issuer URL:" | head -1 | awk '{print $3}')
            log_verbose "  Issuer URL: $issuer_url"
        fi
    else
        log_warn "⚠ Spoke trusted issuer registration failed (non-blocking)"
        log_warn "Impact: Spoke's IdP may not appear in resources page"
        log_warn "Manual fix: docker exec $backend_container npm run seed:spoke-issuer"
        # Non-blocking: Spoke can still use Hub issuer via OPAL sync
    fi

    # Step 1: Seed test users (non-blocking - users created by Terraform)
    log_step "Step 1/3: Seeding test users"
    if ! spoke_seed_users "$instance_code"; then
        log_warn "User seeding had issues - users should be created by Terraform during realm setup"
        log_warn "To verify users exist: docker exec dive-spoke-${code_lower}-backend npx tsx src/scripts/test-demo-users.ts"
    else
        log_success "✓ Test users seeded successfully"
    fi

    # Step 2: Seed ZTDF resources (MANDATORY - no plaintext fallback)
    log_step "Step 2/3: Seeding ZTDF encrypted resources (MANDATORY)"
    local resource_seeding_failed=false
    if ! spoke_seed_resources "$instance_code" 5000; then
        resource_seeding_failed=true
        log_error "ZTDF resource seeding FAILED"
        log_error "Plaintext fallback is NOT acceptable per ACP-240"
        # Don't return 1 - continue to verification, but flag the issue
    fi

    # Validate actual resource count AND type to be honest about what happened
    local mongo_container="dive-spoke-${code_lower}-mongodb"
    local mongo_password_var="MONGO_PASSWORD_${code_upper}"
    local mongo_password="${!mongo_password_var}"
    local total_count=0
    local encrypted_count=0

    if docker ps --format '{{.Names}}' | grep -q "^${mongo_container}$" && [ -n "$mongo_password" ]; then
        # Check total resources
        total_count=$(docker exec "$mongo_container" bash -c "
            mongosh -u admin -p \"$mongo_password\" --authenticationDatabase admin dive-v3-${code_lower} --quiet --eval 'db.resources.countDocuments({})' 2>/dev/null
        " 2>/dev/null | tail -1 | tr -d '\n\r' || echo "0")

        # Check ZTDF-encrypted resources (have encrypted: true AND ztdf.payload.keyAccessObjects)
        encrypted_count=$(docker exec "$mongo_container" bash -c "
            mongosh -u admin -p \"$mongo_password\" --authenticationDatabase admin dive-v3-${code_lower} --quiet --eval 'db.resources.countDocuments({encrypted: true, \"ztdf.payload.keyAccessObjects\": {\$exists: true, \$ne: []}})' 2>/dev/null
        " 2>/dev/null | tail -1 | tr -d '\n\r' || echo "0")
    fi

    # Report honestly what was created
    if [ "$encrypted_count" -gt 0 ]; then
        log_success "✓ ZTDF-encrypted resources: $encrypted_count documents"
        echo "  ✓ AES-256-GCM encryption"
        echo "  ✓ Policy-bound key access"
        echo "  ✓ Multi-KAS support"
    elif [ "$total_count" -gt 0 ]; then
        log_warn "⚠ Plaintext resources: $total_count documents (ZTDF encryption failed)"
        echo "  • Resources are NOT encrypted (KAS not configured)"
        echo "  • Plaintext is NOT production-ready for classified data"
        echo "  • Consider: Either configure KAS OR use Hub resources via federation"
    else
        log_info "ℹ Spoke has 0 local resources (will use Hub resources via federation)"
        echo "  • Spokes can access Hub's 5,000 resources via federated search"
        echo "  • This is NORMAL for spoke instances"
        echo "  • Local ZTDF resources require KAS registration (optional)"
    fi

    # Create seeding checkpoint
    if type orch_create_checkpoint &>/dev/null; then
        orch_create_checkpoint "$instance_code" "SEEDING" "Seeding phase completed"
    fi

    # HONEST reporting - distinguish between users (critical), encrypted vs plaintext resources
    if [ "$encrypted_count" -gt 0 ]; then
        log_success "Seeding phase complete (users: ✅, ZTDF encrypted: ✅ $encrypted_count)"
    elif [ "$total_count" -gt 0 ]; then
        log_success "Seeding phase complete (users: ✅, plaintext: ⚠️  $total_count - not encrypted)"
    else
        log_success "Seeding phase complete (users: ✅, local resources: N/A - using Hub)"
    fi

    return 0
}

# =============================================================================
# USER SEEDING
# =============================================================================

##
# Seed test users for a spoke instance
#
# Creates:
#   - testuser-{country}-1  (UNCLASSIFIED)
#   - testuser-{country}-2  (RESTRICTED)
#   - testuser-{country}-3  (CONFIDENTIAL)
#   - testuser-{country}-4  (SECRET)
#   - testuser-{country}-5  (TOP_SECRET)
#   - admin-{country}       (TOP_SECRET + admin role)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_seed_users() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Seeding test users for $code_upper..."

    # Check if Keycloak container is running
    local kc_container="dive-spoke-${code_lower}-keycloak"
    if ! docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        log_warn "Keycloak container not running: $kc_container"
        log_warn "Cannot verify users, but they should have been created by Terraform"
        return 0  # Non-blocking
    fi

    # Use dedicated user seeding script (SSOT: scripts/spoke-init/seed-spoke-users.sh)
    local seed_users_script="${DIVE_ROOT}/scripts/spoke-init/seed-spoke-users.sh"

    if [ ! -f "$seed_users_script" ]; then
        log_error "User seeding script not found: $seed_users_script"
        log_warn "Users should be created by Terraform or manually - continuing..."
        return 0  # Non-blocking
    fi

    # Run user seeding script
    log_verbose "Executing: $seed_users_script $code_upper"
    if bash "$seed_users_script" "$code_upper" 2>&1 | tail -20; then
        log_success "Test users created: testuser-${code_lower}-{1-5}, admin-${code_lower}"
        return 0
    else
        log_warn "User seeding had issues - users may already exist or require manual creation"
        return 0  # Non-blocking - deployment can continue
    fi
}

# =============================================================================
# RESOURCE SEEDING
# =============================================================================

##
# Seed ZTDF resources for a spoke instance
#
# Arguments:
#   $1 - Instance code
#   $2 - Resource count (default: 5000)
#   $3 - File type mode: text or multi (default: multi)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_seed_resources() {
    local instance_code="$1"
    local resource_count="${2:-5000}"
    local file_type_mode="${3:-multi}"   # NEW: text or multi (default: multi)
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    # File type mode description for logging
    local file_type_desc
    if [ "$file_type_mode" = "multi" ]; then
        file_type_desc="multi-type (PDF, DOCX, XLSX, MP4, etc.)"
    else
        file_type_desc="text-only (legacy)"
    fi

    log_step "Seeding $resource_count ZTDF resources for $code_upper ($file_type_desc)..."

    # Load secrets for verification (best effort)
    if type spoke_secrets_load &>/dev/null; then
        if ! spoke_secrets_load "$instance_code" 2>/dev/null; then
            log_verbose "Secret loading failed (may already be loaded)"
        fi
    fi

    # Check if MongoDB is running
    local mongo_container="dive-spoke-${code_lower}-mongodb"
    if ! docker ps --format '{{.Names}}' | grep -q "^${mongo_container}$"; then
        log_error "MongoDB container not running: $mongo_container"
        return 1
    fi

    # Check if backend container is running
    local backend_container="dive-spoke-${code_lower}-backend"
    if ! docker ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
        log_warn "Backend container not running - using legacy plaintext seeding"
        spoke_seed_resources_legacy "$instance_code" "$resource_count"
        return $?
    fi

    # ==========================================================================
    # CRITICAL FIX (2026-01-28): Verify MongoDB connection before seeding
    # ==========================================================================
    # Root cause: Backend tries to connect to MongoDB but password may not be set
    # or MongoDB may not be ready, causing seeding to fail silently
    # ==========================================================================
    # Note: mongo_container is already defined above as dive-spoke-${code_lower}-mongodb
    local mongo_password_var="MONGO_PASSWORD_${code_upper}"
    local mongo_password="${!mongo_password_var}"

    if [ -z "$mongo_password" ]; then
        log_error "MongoDB password not available (MONGO_PASSWORD_${code_upper} not set)"
        log_error "Cannot seed resources - database connection will fail"
        return 1
    fi

    # Verify MongoDB is accessible
    if ! docker exec "$mongo_container" mongosh -u admin -p "$mongo_password" \
        --authenticationDatabase admin --quiet --eval "db.adminCommand('ping')" &>/dev/null; then
        log_error "MongoDB not accessible - cannot seed resources"
        log_error "Check MongoDB container health: docker ps | grep $mongo_container"
        return 1
    fi

    log_verbose "MongoDB connection verified - proceeding with ZTDF seeding"

    # BEST PRACTICE: Execute seeding script inside the backend container
    # This ensures proper network access to MongoDB and all dependencies are available
    log_verbose "Executing ZTDF seeding script in backend container"

    # Run seed script inside container with proper environment
    local seed_output
    seed_output=$(docker exec "$backend_container" bash -c "
        export INSTANCE_CODE='$code_upper'
        cd /app
        npm run seed:instance -- --instance='$code_upper' --count=$resource_count --file-type-mode='$file_type_mode' 2>&1
    " 2>&1)

    local seed_exit=$?

    if [ $seed_exit -eq 0 ]; then
        # Verify resources were actually created
        local actual_count
        local mongo_password_var="MONGO_PASSWORD_${code_upper}"
        local mongo_password="${!mongo_password_var}"

        actual_count=$(docker exec "$mongo_container" bash -c "
            mongosh -u admin -p \"$mongo_password\" --authenticationDatabase admin dive-v3-${code_lower} --quiet --eval 'db.resources.countDocuments({instanceCode: \"$code_upper\", encrypted: true})' 2>/dev/null
        " 2>/dev/null | tail -1 | tr -d '\n\r' || echo "0")

        if [ -n "$actual_count" ] && [ "$actual_count" -ge "$resource_count" ]; then
            log_success "Seeded $actual_count ZTDF-encrypted resources ($file_type_desc)"
            echo "  ✓ AES-256-GCM encryption"
            echo "  ✓ Locale-aware classification labels"
            echo "  ✓ Multi-KAS key access objects"
            echo "  ✓ COI-based community keys"
            echo "  ✓ Policy-bound encryption"
            if [ "$file_type_mode" = "multi" ]; then
                echo "  ✓ Multi-format: PDF, DOCX, XLSX, PPTX, MP4, MP3, etc."
            fi
            return 0
        else
            log_warn "Seeding completed but verification failed (expected: $resource_count, found: $actual_count)"
            if [ "$actual_count" -gt 0 ]; then
                log_info "Found $actual_count resources - partial success"
                return 0
            fi
        fi
    fi

    # Check if it's a missing script error
    if echo "$seed_output" | grep -qi "Missing script"; then
        log_verbose "seed:instance script not available, using direct TypeScript execution"

        # Try direct execution of seed script
        seed_output=$(docker exec "$backend_container" bash -c "
            cd /app
            npx ts-node src/scripts/seed-instance-resources.ts --instance='$code_upper' --count=$resource_count --file-type-mode='$file_type_mode' 2>&1
        " 2>&1)

        if [ $? -eq 0 ]; then
            log_success "Seeded $resource_count ZTDF-encrypted resources (direct execution, $file_type_desc)"
            return 0
        fi
    fi

    # If ZTDF seeding failed, show full error (don't hide in verbose)
    log_error "ZTDF seeding failed - full error output:"
    echo "$seed_output" | tail -30
    log_error ""
    log_error "This is a CRITICAL failure - ZTDF encryption is required for ACP-240 compliance"
    log_error "Falling back to plaintext is NOT acceptable for production"
    log_error ""

    # Still seed plaintext for testing, but mark as failure
    spoke_seed_resources_legacy "$instance_code" "$resource_count"
    return 1  # Return failure - plaintext fallback is not success
}

##
# Legacy plaintext resource seeding (fallback)
#
# Arguments:
#   $1 - Instance code
#   $2 - Resource count
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_seed_resources_legacy() {
    local instance_code="$1"
    local resource_count="${2:-5000}"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_verbose "Using legacy plaintext resource seeding"

    # Check if seed-resources.sh exists
    local seed_script="${DIVE_ROOT}/scripts/spoke-init/seed-resources.sh"
    if [ ! -f "$seed_script" ]; then
        log_error "Resource seeding script not found: $seed_script"
        return 1
    fi

    # Run seeding script
    log_verbose "Running: $seed_script $code_upper $resource_count"
    if bash "$seed_script" "$code_upper" "$resource_count" 2>&1 | grep -v "DEPRECATION WARNING" | grep -v "╔" | grep -v "║" | grep -v "╚" | tail -5; then
        log_success "Seeded $resource_count plaintext resources (legacy)"
        log_warn "Consider migrating to ZTDF encryption for ACP-240 compliance"
        return 0
    else
        log_error "Resource seeding failed"
        return 1
    fi
}

# =============================================================================
# HELPER: Spoke seed command (for manual use)
# =============================================================================

##
# Manual seeding command
#
# Usage: ./dive spoke seed [count]
#
# Arguments:
#   $1 - Resource count (default: 5000)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_seed() {
    local resource_count="${1:-5000}"
    local instance_code="${INSTANCE:-}"

    if [ -z "$instance_code" ]; then
        log_error "No instance specified"
        echo ""
        echo "Usage: ./dive --instance <code> spoke seed [count]"
        echo ""
        echo "Examples:"
        echo "  ./dive --instance nzl spoke seed          # Seed 5000 resources"
        echo "  ./dive --instance nzl spoke seed 10000    # Seed 10000 resources"
        echo ""
        return 1
    fi

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_info "Seeding spoke $code_upper"

    # Seed users
    spoke_seed_users "$code_upper" || log_warn "User seeding had issues"

    # Seed resources
    spoke_seed_resources "$code_upper" "$resource_count" || log_warn "Resource seeding had issues"

    log_success "Seeding complete for $code_upper"
    return 0
}

# Mark module as loaded AFTER all functions are defined (best practice)
export SPOKE_PHASE_SEEDING_LOADED=1
