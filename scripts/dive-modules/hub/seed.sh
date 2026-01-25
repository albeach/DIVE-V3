#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Hub Seed Sub-Module
# =============================================================================
# Hub data seeding functions: users, COI keys, ZTDF resources
# Loaded on-demand via lazy loading
# =============================================================================

# Mark seed module as loaded
export DIVE_HUB_SEED_LOADED=1

# Hub data directory (SSOT)
HUB_DATA_DIR="${DIVE_ROOT}/data/hub"

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

    # Step 2: Seed test users (SSOT: scripts/hub-init/seed-hub-users.sh)
    log_step "Step 2/4: Seeding test users..."
    
    local seed_users_script="${DIVE_ROOT}/scripts/hub-init/seed-hub-users.sh"
    if [ ! -f "$seed_users_script" ]; then
        log_error "Hub user seeding script not found: $seed_users_script"
        return 1
    fi
    
    # Run seed-hub-users.sh (creates testuser-usa-[1-5] + admin-usa)
    if ! bash "$seed_users_script" 2>&1 | tail -20; then
        log_error "User seeding failed"
        log_error "Cannot proceed without test users"
        return 1
    fi
    log_success "Test users created: testuser-usa-1 through testuser-usa-5, admin-usa"

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

# =============================================================================
# HUB KAS AUTO-REGISTRATION (Phase 3: MongoDB-Only Architecture)
# =============================================================================
# Register Hub KAS instance in MongoDB via Backend API
# This ensures the Hub KAS appears in the KAS registry for multi-KAS federation
# =============================================================================

_hub_register_kas() {
    log_step "Registering Hub KAS in federation registry..."

    local hub_backend_container="${BACKEND_CONTAINER:-dive-hub-backend}"
    local kas_id="hub-kas-usa"
    local kas_url="https://dive-hub-kas:8080"

    # Dry run check
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would register Hub KAS (${kas_id}) in MongoDB registry"
        return 0
    fi

    # Wait for backend API to be ready
    log_info "Waiting for backend API to be ready..."
    local max_wait=60
    local waited=0
    while ! docker exec "$hub_backend_container" curl -sf http://localhost:4000/health > /dev/null 2>&1; do
        sleep 2
        waited=$((waited + 2))
        if [ $waited -ge $max_wait ]; then
            log_error "Backend API not ready after ${max_wait}s"
            return 1
        fi
        log_verbose "Waiting for backend... (${waited}s/${max_wait}s)"
    done
    log_success "Backend API is ready"

    # Check if already registered
    local already_registered=$(docker exec "$hub_backend_container" curl -sk \
        http://localhost:4000/api/kas/registry 2>/dev/null | \
        jq -r ".kasServers[]? | select(.kasId == \"${kas_id}\") | .kasId" 2>/dev/null)

    if [ "$already_registered" = "$kas_id" ]; then
        log_success "Hub KAS already registered: ${kas_id}"
        
        # Verify status
        local current_status=$(docker exec "$hub_backend_container" curl -sk \
            http://localhost:4000/api/kas/registry 2>/dev/null | \
            jq -r ".kasServers[]? | select(.kasId == \"${kas_id}\") | .status" 2>/dev/null)
        
        if [ "$current_status" = "active" ]; then
            log_success "✓ Hub KAS verified in registry (status: active)"
        else
            log_warn "Hub KAS status is '${current_status}' - may need approval"
        fi
        return 0
    fi

    # Read public key (generate if missing)
    local public_key_path="${DIVE_ROOT}/certs/hub-pki/hub-kas-public.pem"
    if [ ! -f "$public_key_path" ]; then
        log_warn "Hub KAS public key not found, generating..."
        mkdir -p "${DIVE_ROOT}/certs/hub-pki"
        openssl genrsa -out "${DIVE_ROOT}/certs/hub-pki/hub-kas-private.pem" 4096 2>/dev/null
        openssl rsa -in "${DIVE_ROOT}/certs/hub-pki/hub-kas-private.pem" \
            -pubout -out "$public_key_path" 2>/dev/null
        log_success "Generated Hub KAS key pair"
    fi

    local public_key
    if [ -f "$public_key_path" ]; then
        public_key=$(cat "$public_key_path" | base64 | tr -d '\n')
    else
        public_key=""
        log_warn "Could not read public key, proceeding without it"
    fi

    # Register Hub KAS via API
    log_info "Registering Hub KAS: ${kas_id}..."
    
    local response
    response=$(docker exec "$hub_backend_container" curl -sk -w "\n%{http_code}" -X POST \
        http://localhost:4000/api/kas/register \
        -H "Content-Type: application/json" \
        -d "{
            \"kasId\": \"${kas_id}\",
            \"organization\": \"DIVE Hub (USA)\",
            \"countryCode\": \"USA\",
            \"kasUrl\": \"https://localhost:10000\",
            \"internalKasUrl\": \"${kas_url}\",
            \"authMethod\": \"jwt\",
            \"authConfig\": {
                \"jwtIssuer\": \"https://localhost:8443/realms/dive-v3-broker-usa\"
            },
            \"trustLevel\": \"high\",
            \"supportedCountries\": [\"USA\"],
            \"supportedCOIs\": [\"NATO\", \"FVEY\", \"US-ONLY\"],
            \"metadata\": {
                \"version\": \"1.0.0\",
                \"capabilities\": [\"ztdf-encryption\", \"policy-enforcement\"],
                \"contact\": \"admin@dive-hub.mil\"
            },
            \"enabled\": true
        }" 2>&1)

    # Extract HTTP code from response
    local http_code
    http_code=$(echo "$response" | tail -1)
    local body
    body=$(echo "$response" | sed '$d')

    # Check response
    if [[ "$http_code" =~ ^(200|201)$ ]]; then
        log_success "Hub KAS registered: ${kas_id}"

        # Auto-approve Hub KAS (trusted by default)
        # Use CLI bypass header for dev mode approval
        log_info "Auto-approving Hub KAS..."
        docker exec "$hub_backend_container" curl -sk -X POST \
            "http://localhost:4000/api/kas/registry/${kas_id}/approve" \
            -H "Content-Type: application/json" \
            -H "x-cli-bypass: dive-cli-local-dev" > /dev/null 2>&1

        # Small delay for database write
        sleep 1

        # Verify registration
        local verified
        verified=$(docker exec "$hub_backend_container" curl -sk \
            http://localhost:4000/api/kas/registry 2>/dev/null | \
            jq -r ".kasServers[]? | select(.kasId == \"${kas_id}\") | .status" 2>/dev/null)

        if [ "$verified" = "active" ]; then
            log_success "✓ Hub KAS verified in registry (status: active)"
            echo ""
            echo "  KAS Details:"
            echo "    - kasId:       ${kas_id}"
            echo "    - Organization: DIVE Hub (USA)"
            echo "    - Country:     USA"
            echo "    - Status:      active"
            echo ""
            return 0
        else
            log_warn "Hub KAS registered but status is '${verified:-unknown}'"
            log_warn "Try approving manually: ./dive kas approve ${kas_id}"
            return 0
        fi
    elif [ "$http_code" = "409" ]; then
        log_success "Hub KAS already exists (HTTP 409)"
        return 0
    else
        log_error "Failed to register Hub KAS (HTTP ${http_code:-000})"
        log_error "Response: $body"
        return 1
    fi
}