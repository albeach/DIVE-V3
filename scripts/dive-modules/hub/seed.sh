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
    local file_type_mode="${2:-multi}"   # NEW: text or multi (default: multi)

    # INPUT VALIDATION: Resource count must be a positive integer
    if ! [[ "$resource_count" =~ ^[0-9]+$ ]]; then
        log_error "Resource count must be a positive integer"
        echo ""
        echo "Usage: ./dive hub seed [count] [file-type-mode]"
        echo ""
        echo "Arguments:"
        echo "  count            Number of resources to seed (default: 5000)"
        echo "  file-type-mode   File type mode: text or multi (default: multi)"
        echo ""
        echo "File Type Modes:"
        echo "  text   - Text files only (legacy behavior, fastest)"
        echo "  multi  - Multiple file types: PDF, DOCX, XLSX, MP4, etc. (recommended)"
        echo ""
        echo "Examples:"
        echo "  ./dive hub seed              # Seed 5000 multi-type resources (default)"
        echo "  ./dive hub seed 5000 multi   # Seed 5000 multi-type resources"
        echo "  ./dive hub seed 5000 text    # Seed 5000 text-only resources (legacy)"
        echo "  ./dive hub seed 500          # Seed 500 multi-type resources (testing)"
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

    # FILE TYPE MODE VALIDATION
    if [[ ! "$file_type_mode" =~ ^(text|multi)$ ]]; then
        log_error "Invalid file type mode: $file_type_mode"
        echo "  Valid modes: text, multi"
        echo ""
        return 1
    fi

    # Determine file type description for display
    local file_type_desc
    if [ "$file_type_mode" = "multi" ]; then
        file_type_desc="multi (PDF, DOCX, XLSX, PPTX, MP4, MP3, etc.)"
    else
        file_type_desc="text (legacy)"
    fi

    print_header
    echo -e "${BOLD}Seeding Hub (USA) with Test Data${NC}"
    echo ""
    echo "  Target: ${resource_count} ZTDF encrypted resources"
    echo "  Mode:   ${file_type_desc}"
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

    local backend_container="${BACKEND_CONTAINER:-dive-hub-backend}"

    if ! ${DOCKER_CMD:-docker} ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
        log_error "Backend container '${backend_container}' is not running"
        return 1
    fi

    # Step 1: Initialize Clearance Equivalency SSOT (foundational data)
    log_step "Step 1/4: Initializing clearance equivalency mappings..."
    log_info "Seeding clearance_equivalency collection (32 NATO nations, 5 levels)..."
    ${DOCKER_CMD:-docker} exec "$backend_container" npx tsx src/scripts/initialize-clearance-equivalency.ts 2>&1 | tail -10

    if [ $? -eq 0 ]; then
        log_success "Clearance equivalency SSOT initialized (32 countries)"
    else
        log_warn "Clearance equivalency initialization failed (non-fatal — static fallback active)"
    fi

    # Generate OPA classification equivalency data from SSOT
    log_info "Generating OPA classification equivalency JSON..."
    ${DOCKER_CMD:-docker} exec "$backend_container" npx tsx src/scripts/generate-opa-clearance-data.ts 2>&1 | tail -5
    if [ $? -eq 0 ]; then
        log_success "OPA classification equivalency data generated"
    else
        log_warn "OPA data generation failed (non-fatal — static fallback in Rego policy)"
    fi
    echo ""

    # Step 2: Initialize COI Keys (CRITICAL - must run before resource seeding)
    log_step "Step 2/4: Initializing COI Keys database..."

    log_info "Initializing 35 COI definitions (NATO, FVEY, bilateral agreements, etc.)..."
    ${DOCKER_CMD:-docker} exec "$backend_container" npx tsx src/scripts/initialize-coi-keys.ts 2>&1 | tail -10

    if [ $? -eq 0 ]; then
        log_success "COI Keys initialized (35 COIs covering 32 NATO + 5 partner nations)"
    else
        log_error "COI Keys initialization failed"
        return 1
    fi
    echo ""

    # Step 3: Seed test users (SSOT: scripts/hub-init/seed-hub-users.sh)
    log_step "Step 3/4: Seeding test users..."

    local seed_users_script="${DIVE_ROOT}/scripts/hub-init/seed-hub-users.sh"

    if [ ! -f "$seed_users_script" ]; then
        log_error "User seeding script not found: $seed_users_script"
        return 1
    fi

    # Ensure KEYCLOAK_ADMIN_PASSWORD matches the actual Vault-seeded password.
    # KC_ADMIN_PASSWORD_USA is canonical (from Vault seed → .env.hub).
    # KEYCLOAK_ADMIN_PASSWORD may be stale ("admin" from defaults) — always override.
    if [ -n "${KC_ADMIN_PASSWORD_USA:-}" ]; then
        export KEYCLOAK_ADMIN_PASSWORD="$KC_ADMIN_PASSWORD_USA"
    elif [ -n "${KEYCLOAK_ADMIN_PASSWORD_USA:-}" ]; then
        export KEYCLOAK_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD_USA"
    elif [ -f "${DIVE_ROOT}/.env.hub" ]; then
        local _pw
        _pw=$(grep "^KC_ADMIN_PASSWORD_USA=" "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" | head -1)
        [ -z "$_pw" ] && _pw=$(grep "^KEYCLOAK_ADMIN_PASSWORD_USA=" "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" | head -1)
        [ -n "$_pw" ] && export KEYCLOAK_ADMIN_PASSWORD="$_pw"
    fi

    # Run user seeding script
    if ! bash "$seed_users_script" 2>&1 | tail -40; then
        log_error "User seeding failed"
        log_error "Cannot proceed without test users"
        return 1
    fi

    log_success "Test users created: testuser-usa-1 through testuser-usa-5, admin-usa"

    # Step 4: Seed ZTDF encrypted resources using TypeScript seeder
    log_step "Step 4/4: Seeding ${resource_count} ZTDF encrypted resources..."

    # Check if backend container is still running
    if ! ${DOCKER_CMD:-docker} ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
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
    if ! ${DOCKER_CMD:-docker} exec "$backend_container" npx tsx src/scripts/seed-instance-resources.ts \
        --instance=USA \
        --count="${resource_count}" \
        --file-type-mode="${file_type_mode}" \
        --replace 2>&1; then
        log_error "ZTDF seeding failed"
        log_error "All resources MUST be ZTDF-encrypted per ACP-240 compliance"
        echo ""
        echo "  Retry seeding:"
        echo "  ./dive hub seed ${resource_count} ${file_type_mode}"
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
    echo "  File Mode:  ${file_type_desc}"
    echo ""
    echo "  Distribution:"
    echo "    - Classifications: UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET"
    echo "    - COIs: 28+ templates (NATO, FVEY, bilateral, multi-COI)"
    echo "    - Releasability: Instance-specific and coalition-wide"
    if [ "$file_type_mode" = "multi" ]; then
        echo "    - File Types: PDF (20%), DOCX (20%), XLSX (8%), PPTX (10%), MP4 (7%), etc."
    fi
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
    local instance_code="${INSTANCE_CODE:-USA}"
    local kas_id="${instance_code,,}-kas"  # usa-kas, fra-kas, etc.
    local kas_url="https://dive-hub-kas:8080"

    # Dry run check
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would register Hub KAS (${kas_id}) in MongoDB registry"
        return 0
    fi

    # Wait for backend API to be ready
    log_info "Waiting for backend API to be ready (HTTPS only - Zero Trust)..."
    local max_wait=60
    local waited=0
    local retry_count=0

    while [ $waited -lt $max_wait ]; do
        # Zero Trust: HTTPS only, no HTTP fallback
        if ${DOCKER_CMD:-docker} exec "$hub_backend_container" curl -skf https://localhost:4000/api/health > /dev/null 2>&1; then
            log_success "Backend API is ready (HTTPS)"
            break  # Exit loop, continue with registration
        fi

        retry_count=$((retry_count + 1))
        if [ $((retry_count % 5)) -eq 0 ]; then
            log_verbose "Waiting for backend... (${waited}s/${max_wait}s)"
        fi

        sleep 2
        waited=$((waited + 2))
    done

    if [ $waited -ge $max_wait ]; then
        log_error "Backend API not ready after ${max_wait}s"
        log_error "Backend container status:"
        ${DOCKER_CMD:-docker} ps --filter "name=${hub_backend_container}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        log_error "Backend health check failed - check logs:"
        log_error "  docker logs ${hub_backend_container} --tail 50"
        return 1
    fi

    # Check if already registered (HTTPS only)
    local already_registered=$(${DOCKER_CMD:-docker} exec "$hub_backend_container" curl -sk \
        https://localhost:4000/api/kas/registry 2>/dev/null | \
        jq -r ".kasServers[]? | select(.kasId == \"${kas_id}\") | .kasId" 2>/dev/null)

    if [ "$already_registered" = "$kas_id" ]; then
        log_success "Hub KAS already registered: ${kas_id}"

        # Verify status (HTTPS only)
        local current_status=$(${DOCKER_CMD:-docker} exec "$hub_backend_container" curl -sk \
            https://localhost:4000/api/kas/registry 2>/dev/null | \
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

    # Register Hub KAS via API (HTTPS only - Zero Trust)
    log_info "Registering Hub KAS: ${kas_id}..."

    # Get organization name from instance code
    local org_name
    case "${instance_code}" in
        USA) org_name="United States" ;;
        GBR) org_name="United Kingdom" ;;
        FRA) org_name="France" ;;
        DEU) org_name="Germany" ;;
        CAN) org_name="Canada" ;;
        *) org_name="${instance_code}" ;;
    esac

    local response
    response=$(${DOCKER_CMD:-docker} exec "$hub_backend_container" curl -sk -w "\n%{http_code}" -X POST \
        https://localhost:4000/api/kas/register \
        -H "Content-Type: application/json" \
        -d "{
            \"kasId\": \"${kas_id}\",
            \"organization\": \"${org_name}\",
            \"countryCode\": \"${instance_code}\",
            \"kasUrl\": \"https://localhost:8085\",
            \"internalKasUrl\": \"${kas_url}\",
            \"authMethod\": \"jwt\",
            \"authConfig\": {
                \"jwtIssuer\": \"${KEYCLOAK_ISSUER:-https://localhost:${KEYCLOAK_HTTPS_PORT:-8443}/realms/dive-v3-broker-${instance_code,,}}\"
            },
            \"trustLevel\": \"high\",
            \"supportedCountries\": [\"${instance_code}\"],
            \"supportedCOIs\": [\"NATO\", \"FVEY\"],
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
        ${DOCKER_CMD:-docker} exec "$hub_backend_container" curl -sk -X POST \
            "https://localhost:4000/api/kas/registry/${kas_id}/approve" \
            -H "Content-Type: application/json" \
            -H "x-cli-bypass: dive-cli-local-dev" > /dev/null 2>&1

        # Small delay for database write
        sleep 1

        # Verify registration (HTTPS only)
        local verified
        verified=$(${DOCKER_CMD:-docker} exec "$hub_backend_container" curl -sk \
            https://localhost:4000/api/kas/registry 2>/dev/null | \
            jq -r ".kasServers[]? | select(.kasId == \"${kas_id}\") | .status" 2>/dev/null)

        if [ "$verified" = "active" ]; then
            log_success "✓ Hub KAS verified in registry (status: active)"
            echo ""
            echo "  KAS Details:"
            echo "    - kasId:       ${kas_id}"
            echo "    - Organization: ${org_name}"
            echo "    - Country:     ${instance_code}"
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