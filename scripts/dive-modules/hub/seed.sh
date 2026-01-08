#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Hub Seed Sub-Module
# =============================================================================
# Hub data seeding functions: users, COI keys, ZTDF resources
# Loaded on-demand via lazy loading
# =============================================================================

# Mark seed module as loaded
export DIVE_HUB_SEED_LOADED=1

hub_seed() {
    local resource_count="${1:-5000}"

    # INPUT VALIDATION: Resource count must be a positive integer
    if ! [[ "$resource_count" =~ ^[0-9]+$ ]]; then
        log_error "Resource count must be a positive integer"
        echo ""
        echo "Usage: ./dive hub seed [count]"
        echo ""
        echo "Examples:"
        echo "  ./dive hub seed          # Seed 5000 resources (default)"
        echo "  ./dive hub seed 10000    # Seed 10000 resources"
        echo "  ./dive hub seed 500      # Seed 500 resources (testing)"
        echo ""
        return 1
    fi

    # RANGE VALIDATION: Reasonable limits to prevent resource exhaustion
    if [ "$resource_count" -lt 1 ] || [ "$resource_count" -gt 1000000 ]; then
        log_error "Resource count must be between 1 and 1,000,000"
        echo "  Requested: $resource_count"
        echo "  Valid range: 1 - 1,000,000"
        echo ""
        return 1
    fi

    print_header
    echo -e "${BOLD}Seeding Hub (USA) with Test Data${NC}"
    echo ""
    echo "  Target: ${resource_count} ZTDF encrypted resources"
    echo ""

    # Check for seed scripts
    local SEED_SCRIPTS_DIR="${DIVE_ROOT}/scripts/hub-init"

    if [ ! -d "$SEED_SCRIPTS_DIR" ]; then
        log_error "Hub seed scripts not found at $SEED_SCRIPTS_DIR"
        return 1
    fi

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would run hub seeding steps"
        return 0
    fi

    # Step 0: Client logout URIs configured by Terraform (not seeding)
    log_info "Client logout URIs will be configured after Terraform completes..."
    echo ""

    # Step 1: Initialize COI Keys (CRITICAL - must run first)
    log_step "Step 1/4: Initializing COI Keys database..."
    local backend_container="${BACKEND_CONTAINER:-dive-hub-backend}"

    if ! docker ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
        log_error "Backend container '${backend_container}' is not running"
        return 1
    fi

    log_info "Initializing 35 COI definitions (NATO, FVEY, bilateral agreements, etc.)..."
    docker exec "$backend_container" npx tsx src/scripts/initialize-coi-keys.ts 2>&1 | tail -10

    if [ $? -eq 0 ]; then
        log_success "COI Keys initialized (35 COIs covering 32 NATO + 5 partner nations)"
    else
        log_error "COI Keys initialization failed"
        return 1
    fi
    echo ""

    # Step 2: Seed users (includes User Profile configuration)
    log_step "Step 2/4: Seeding test users..."
    if [ -x "${SEED_SCRIPTS_DIR}/seed-hub-users.sh" ]; then
        "${SEED_SCRIPTS_DIR}/seed-hub-users.sh"
        if [ $? -eq 0 ]; then
            log_success "Test users created: testuser-usa-1 through testuser-usa-5, admin-usa"
        else
            log_error "User seeding failed"
            return 1
        fi
    else
        log_error "seed-hub-users.sh not found or not executable"
        return 1
    fi

    # Step 3: Seed ZTDF encrypted resources using TypeScript seeder
    log_step "Step 3/4: Seeding ${resource_count} ZTDF encrypted resources..."

    # Check if backend container is still running
    if ! docker ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
        log_error "Backend container '${backend_container}' is not running"
        log_error "Cannot seed ZTDF resources without backend container"
        echo ""
        echo "  Start the hub first:"
        echo "  ./dive hub up"
        echo ""
        return 1
    fi

    # Use ZTDF seeder via TypeScript (SSOT - no plaintext fallback)
    # All resources MUST be ZTDF-encrypted per ACP-240 compliance
    if ! docker exec "$backend_container" npx tsx src/scripts/seed-instance-resources.ts \
        --instance=USA \
        --count="${resource_count}" \
        --replace 2>&1; then
        log_error "ZTDF seeding failed"
        log_error "All resources MUST be ZTDF-encrypted per ACP-240 compliance"
        echo ""
        echo "  Retry seeding:"
        echo "  ./dive hub seed ${resource_count}"
        echo ""
        return 1
    fi

    # Mark hub as initialized
    mkdir -p "$HUB_DATA_DIR"
    touch "${HUB_DATA_DIR}/.initialized"
    log_success "Hub initialization marker created"

    echo ""
    log_success "Hub seeding complete!"
    echo ""
    echo "  Test users: testuser-usa-1 through testuser-usa-5, admin-usa"
    echo "  Resources:  ${resource_count} ZTDF encrypted documents"
    echo ""
    echo "  Distribution:"
    echo "    - Classifications: UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET"
    echo "    - COIs: 28+ templates (NATO, FVEY, bilateral, multi-COI)"
    echo "    - Releasability: Instance-specific and coalition-wide"
    echo "    - All documents have full ZTDF policy structure"
    echo ""
    echo "  ABAC is now functional - users see resources based on clearance level"
}