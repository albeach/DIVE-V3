#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke KAS Management Module
# =============================================================================
# Extracted from spoke.sh during refactoring for modularity
# Commands: spoke kas init|status|health|register|unregister|logs
# =============================================================================
# Version: 1.0.0
# Date: 2025-12-23
# =============================================================================

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load NATO countries database for port calculation
if [ -z "${NATO_COUNTRIES_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../nato-countries.sh" 2>/dev/null || true
    export NATO_COUNTRIES_LOADED=1
fi

# =============================================================================
# SPOKE KAS MANAGEMENT
# =============================================================================

# Get spoke ports - DELEGATED TO COMMON.SH (SSOT)
_spoke_kas_get_ports() {
    local code="$1"

    # Use SSOT function from common.sh
    eval "$(get_instance_ports "$code")"
    echo "SPOKE_KAS_PORT=$SPOKE_KAS_PORT"
}

# Initialize KAS for a spoke instance
spoke_kas_init() {
    local instance_code="${1:-${INSTANCE:-}}"

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo "Usage: ./dive spoke kas init <CODE>"
        echo "       ./dive spoke kas POL init"
        return 1
    fi

    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")

    echo -e "${BOLD}Initialize Spoke KAS - ${code_upper}${NC}"
    echo ""

    # Check if spoke exists
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke instance not found: $spoke_dir"
        echo "Initialize the spoke first with: ./dive spoke init $code_upper"
        return 1
    fi

    # Load spoke configuration
    local config_file="$spoke_dir/config.json"
    if [ ! -f "$config_file" ]; then
        log_error "Spoke configuration not found: $config_file"
        return 1
    fi

    # Get country info
    local country_name
    country_name=$(jq -r '.name // .instanceName // "Unknown"' "$config_file" 2>/dev/null || echo "$code_upper")

    # Calculate KAS port
    eval "$(_spoke_kas_get_ports "$code_upper")"
    local kas_port="${SPOKE_KAS_PORT}"

    log_info "Configuring KAS for $country_name ($code_upper)"
    echo "  KAS Port: $kas_port"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would initialize KAS configuration for $code_upper"
        log_dry "Would create KAS certificates if needed"
        log_dry "Would register in kas-registry.json"
        return 0
    fi

    # Step 1: Ensure KAS certificates exist
    local kas_certs_dir="${DIVE_ROOT}/kas/certs"
    if [ ! -f "$kas_certs_dir/certificate.pem" ] || [ ! -f "$kas_certs_dir/key.pem" ]; then
        log_warn "KAS certificates not found. Creating self-signed certificates..."
        mkdir -p "$kas_certs_dir"
        openssl req -x509 -newkey rsa:4096 -keyout "$kas_certs_dir/key.pem" \
            -out "$kas_certs_dir/certificate.pem" -days 365 -nodes \
            -subj "/CN=kas-${code_lower}.dive25.com/O=DIVE V3/C=US" 2>/dev/null
        log_success "KAS certificates created"
    else
        log_info "KAS certificates already exist"
    fi

    # Step 2: Ensure KAS environment is configured in spoke .env
    local env_file="$spoke_dir/.env"
    if [ -f "$env_file" ]; then
        if ! grep -q "^KAS_PORT=" "$env_file"; then
            echo "" >> "$env_file"
            echo "# KAS Configuration" >> "$env_file"
            echo "KAS_PORT=${kas_port}" >> "$env_file"
            log_success "Added KAS_PORT to $env_file"
        else
            log_info "KAS_PORT already configured in $env_file"
        fi
    fi

    # Step 3: Register in KAS registry (if not already registered)
    local registry_file="${DIVE_ROOT}/config/kas-registry.json"
    if [ -f "$registry_file" ]; then
        local kas_id="${code_lower}-kas"
        local already_registered
        already_registered=$(jq -r --arg id "$kas_id" '.kasServers[] | select(.kasId == $id) | .kasId' "$registry_file" 2>/dev/null)

        if [ -z "$already_registered" ]; then
            log_info "Registering $kas_id in KAS registry..."
            spoke_kas_register "$code_upper"
        else
            log_info "KAS $kas_id already registered in registry"
        fi
    fi

    echo ""
    log_success "Spoke KAS initialized for $code_upper"
    echo ""
    echo "Next steps:"
    echo "  1. Start the spoke: ./dive --instance $code_lower spoke up"
    echo "  2. Verify KAS: ./dive kas status $code_lower"
    echo "  3. Check federation: ./dive kas registry health"
}

# Show KAS status for a spoke instance
spoke_kas_status() {
    local instance_code="${1:-${INSTANCE:-}}"

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo "Usage: ./dive spoke kas status <CODE>"
        echo "       ./dive spoke kas POL status"
        return 1
    fi

    local code_lower=$(lower "$instance_code")

    # Load KAS module for status function
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/kas.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/kas.sh"
        kas_status "$code_lower"
    else
        log_error "KAS module not found"
        return 1
    fi
}

# Show KAS health for a spoke instance
spoke_kas_health() {
    local instance_code="${1:-${INSTANCE:-}}"

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo "Usage: ./dive spoke kas health <CODE>"
        return 1
    fi

    local code_lower=$(lower "$instance_code")

    # Load KAS module for health function
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/kas.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/kas.sh"
        kas_health "$code_lower"
    else
        log_error "KAS module not found"
        return 1
    fi
}

# Register spoke KAS in the federation registry
spoke_kas_register() {
    local instance_code="${1:-${INSTANCE:-}}"

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo "Usage: ./dive spoke kas register <CODE>"
        return 1
    fi

    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local kas_id="${code_lower}-kas"

    echo -e "${BOLD}Register Spoke KAS - ${code_upper}${NC}"
    echo ""

    local registry_file="${DIVE_ROOT}/config/kas-registry.json"
    if [ ! -f "$registry_file" ]; then
        log_error "KAS registry not found: $registry_file"
        return 1
    fi

    # Check if already registered
    local already_registered
    already_registered=$(jq -r --arg id "$kas_id" '.kasServers[] | select(.kasId == $id) | .kasId' "$registry_file" 2>/dev/null)

    if [ -n "$already_registered" ]; then
        log_info "KAS $kas_id is already registered"
        echo ""
        echo "To update the registration, first remove it:"
        echo "  ./dive spoke kas unregister $code_upper"
        return 0
    fi

    # Get country info
    local country_name
    local spoke_config="${DIVE_ROOT}/instances/${code_lower}/config.json"

    if [ -f "$spoke_config" ]; then
        country_name=$(jq -r '.name // .instanceName // "Unknown"' "$spoke_config" 2>/dev/null)
    else
        country_name=$(get_country_name "$code_upper" 2>/dev/null || echo "$code_upper")
    fi

    # Calculate ports
    eval "$(_spoke_kas_get_ports "$code_upper")"

    # Get URLs from config or generate defaults
    local kas_url idp_url internal_kas_url

    if [ -f "$spoke_config" ]; then
        kas_url=$(jq -r '.endpoints.kas // empty' "$spoke_config" 2>/dev/null)
        idp_url=$(jq -r '.endpoints.idp // empty' "$spoke_config" 2>/dev/null)
    fi

    kas_url="${kas_url:-https://${code_lower}-api.dive25.com/api/kas}"
    # FIX (2026-01-15): Realm name includes instance code suffix
    idp_url="${idp_url:-https://${code_lower}-idp.dive25.com/realms/dive-v3-broker-${code_lower}}"
    internal_kas_url="http://kas-${code_lower}:8080"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would register $kas_id in $registry_file"
        log_dry "  Organization: $country_name"
        log_dry "  Country Code: $code_upper"
        log_dry "  KAS URL: $kas_url"
        log_dry "  Internal URL: $internal_kas_url"
        return 0
    fi

    log_info "Registering $kas_id..."
    echo "  Organization: $country_name"
    echo "  Country Code: $code_upper"
    echo "  KAS URL: $kas_url"
    echo ""

    # Create new KAS entry
    local new_entry
    new_entry=$(cat << EOF
{
  "kasId": "${kas_id}",
  "organization": "${country_name}",
  "countryCode": "${code_upper}",
  "kasUrl": "${kas_url}",
  "internalKasUrl": "${internal_kas_url}",
  "authMethod": "jwt",
  "authConfig": {
    "jwtIssuer": "${idp_url}",
    "jwtAudience": "dive-v3-broker-${code_lower}"
  },
  "trustLevel": "high",
  "supportedCountries": ["${code_upper}"],
  "supportedCOIs": ["NATO", "NATO-COSMIC"],
  "policyTranslation": {
    "clearanceMapping": {
      "UNCLASSIFIED": "UNCLASSIFIED",
      "RESTRICTED": "RESTRICTED",
      "CONFIDENTIAL": "CONFIDENTIAL",
      "SECRET": "SECRET",
      "TOP_SECRET": "TOP_SECRET"
    }
  },
  "metadata": {
    "version": "1.0.0",
    "capabilities": ["key-release", "policy-evaluation", "audit-logging", "ztdf-support"],
    "contact": "kas-admin@${code_lower}.dive25.com",
    "lastVerified": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "healthEndpoint": "/health",
    "requestKeyEndpoint": "/request-key"
  }
}
EOF
)

    # Add to registry using jq
    local temp_file=$(mktemp)
    jq --argjson entry "$new_entry" '.kasServers += [$entry]' "$registry_file" > "$temp_file"

    if [ $? -eq 0 ] && [ -s "$temp_file" ]; then
        # Update trust matrix to add bilateral trust with usa-kas
        jq --arg kasId "$kas_id" '
            .federationTrust.trustMatrix["usa-kas"] += [$kasId] |
            .federationTrust.trustMatrix[$kasId] = ["usa-kas"] |
            .metadata.lastUpdated = now | todate
        ' "$temp_file" > "${temp_file}.2"

        if [ $? -eq 0 ] && [ -s "${temp_file}.2" ]; then
            mv "${temp_file}.2" "$registry_file"
            rm -f "$temp_file"
            log_success "KAS $kas_id registered in registry"

            echo ""
            echo -e "${BOLD}Trust Configuration:${NC}"
            echo "  usa-kas now trusts: $kas_id"
            echo "  $kas_id trusts: usa-kas"
        else
            mv "$temp_file" "$registry_file"
            rm -f "${temp_file}.2"
            log_warn "Registered KAS but could not update trust matrix"
        fi
    else
        log_error "Failed to update registry"
        rm -f "$temp_file" "${temp_file}.2"
        return 1
    fi
}

# Unregister spoke KAS from the federation registry
spoke_kas_unregister() {
    local instance_code="${1:-${INSTANCE:-}}"

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo "Usage: ./dive spoke kas unregister <CODE>"
        return 1
    fi

    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local kas_id="${code_lower}-kas"

    echo -e "${BOLD}Unregister Spoke KAS - ${code_upper}${NC}"
    echo ""

    local registry_file="${DIVE_ROOT}/config/kas-registry.json"
    if [ ! -f "$registry_file" ]; then
        log_error "KAS registry not found: $registry_file"
        return 1
    fi

    # Check if registered
    local is_registered
    is_registered=$(jq -r --arg id "$kas_id" '.kasServers[] | select(.kasId == $id) | .kasId' "$registry_file" 2>/dev/null)

    if [ -z "$is_registered" ]; then
        log_info "KAS $kas_id is not registered"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would remove $kas_id from $registry_file"
        return 0
    fi

    log_info "Removing $kas_id from registry..."

    # Remove from registry and trust matrix
    local temp_file=$(mktemp)
    jq --arg kasId "$kas_id" '
        .kasServers = [.kasServers[] | select(.kasId != $kasId)] |
        .federationTrust.trustMatrix = (.federationTrust.trustMatrix |
            to_entries |
            map(if .key == $kasId then empty else {key: .key, value: [.value[] | select(. != $kasId)]} end) |
            from_entries) |
        .metadata.lastUpdated = now | todate
    ' "$registry_file" > "$temp_file"

    if [ $? -eq 0 ] && [ -s "$temp_file" ]; then
        mv "$temp_file" "$registry_file"
        log_success "KAS $kas_id removed from registry"
    else
        log_error "Failed to update registry"
        rm -f "$temp_file"
        return 1
    fi
}

# View spoke KAS logs
spoke_kas_logs() {
    local instance_code="${1:-${INSTANCE:-}}"
    shift || true
    local follow="${1:-}"

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo "Usage: ./dive spoke kas logs <CODE> [-f]"
        return 1
    fi

    local code_lower=$(lower "$instance_code")
    local container_name="dive-spoke-${code_lower}-kas"

    if [ "$follow" = "-f" ] || [ "$follow" = "--follow" ]; then
        docker logs -f "$container_name" 2>/dev/null || log_error "Container $container_name not found"
    else
        docker logs --tail 100 "$container_name" 2>/dev/null || log_error "Container $container_name not found"
    fi
}

# =============================================================================
# MONGODB KAS REGISTRATION (Phase 3: MongoDB-Only Architecture)
# =============================================================================

##
# Register spoke KAS instance in MongoDB via Backend API
# This replaces file-based kas-registry.json for spoke deployments
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success (registered or already exists)
#   1 - Failed to register
##
spoke_kas_register_mongodb() {
    local instance_code="${1:-${INSTANCE:-}}"

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo "Usage: ./dive spoke kas register-mongodb <CODE>"
        return 1
    fi

    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local kas_id="${code_lower}-kas"

    echo -e "${BOLD}Register Spoke KAS in MongoDB - ${code_upper}${NC}"
    echo ""

    # Get country info
    local country_name
    local spoke_config="${DIVE_ROOT}/instances/${code_lower}/config.json"

    if [ -f "$spoke_config" ]; then
        country_name=$(jq -r '.name // .instanceName // "Unknown"' "$spoke_config" 2>/dev/null)
    else
        country_name=$(get_country_name "$code_upper" 2>/dev/null || echo "$code_upper")
    fi

    # Calculate ports
    eval "$(_spoke_kas_get_ports "$code_upper")"

    # Get URLs from config or generate defaults for LOCAL Docker development
    local kas_url internal_kas_url idp_url
    local backend_port="${SPOKE_BACKEND_PORT:-14000}"
    local kas_port="${SPOKE_KAS_PORT:-10008}"
    local keycloak_https_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8451}"

    if [ -f "$spoke_config" ]; then
        kas_url=$(jq -r '.endpoints.kas // empty' "$spoke_config" 2>/dev/null)
        idp_url=$(jq -r '.endpoints.idp // empty' "$spoke_config" 2>/dev/null)
    fi

    # Use localhost URLs for local Docker development (operational!)
    # External URLs would be: https://${code_lower}-kas.dive25.com for production
    kas_url="${kas_url:-https://localhost:${kas_port}}"
    internal_kas_url="https://kas:8080"  # Docker service name for container-to-container
    idp_url="${idp_url:-https://localhost:${keycloak_https_port}/realms/dive-v3-broker-${code_lower}}"

    # Backend API endpoint (local Docker network)
    local backend_container="dive-spoke-${code_lower}-backend"
    local api_endpoint="https://localhost:${backend_port}/api/kas/register"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would register $kas_id in MongoDB via $api_endpoint"
        log_dry "  Organization: $country_name"
        log_dry "  Country Code: $code_upper"
        log_dry "  KAS URL: $kas_url"
        return 0
    fi

    log_info "Registering $kas_id in MongoDB..."
    echo "  Organization: $country_name"
    echo "  Country Code: $code_upper"
    echo "  KAS URL: $kas_url"
    echo ""

    # Check if backend is running
    if ! docker ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
        log_error "Backend container not running: $backend_container"
        log_info "Start the spoke first: ./dive --instance $code_lower spoke up"
        return 1
    fi

    # CRITICAL: Wait for backend to be healthy before attempting registration
    log_verbose "Waiting for backend to be healthy..."
    local max_wait=60
    local elapsed=0
    while [ $elapsed -lt $max_wait ]; do
        local health_status=$(docker inspect "$backend_container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")

        if [ "$health_status" = "healthy" ]; then
            log_verbose "✓ Backend is healthy, proceeding with registration"
            break
        fi

        sleep 2
        ((elapsed += 2))
    done

    if [ $elapsed -ge $max_wait ]; then
        log_error "Backend not healthy after ${max_wait}s - cannot register KAS"
        return 1
    fi

    # Create registration payload
    # IMPORTANT: countryCode must be ISO 3166-1 alpha-3 (e.g., USA, FRA, EST)
    # kasUrl = External/localhost URL for clients
    # internalKasUrl = Docker service name for container-to-container
    local payload
    payload=$(cat << EOF
{
  "kasId": "${kas_id}",
  "organization": "${country_name}",
  "countryCode": "${code_upper}",
  "kasUrl": "${kas_url}",
  "internalKasUrl": "${internal_kas_url}",
  "jwtIssuer": "${idp_url}",
  "supportedCountries": ["${code_upper}"],
  "supportedCOIs": ["NATO", "NATO-COSMIC"],
  "capabilities": ["key-release", "policy-evaluation", "audit-logging", "ztdf-support"],
  "contact": "kas-admin@${code_lower}.dive25.com"
}
EOF
)

    # Call backend API to register KAS in MongoDB
    local response
    response=$(curl -sk -X POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$api_endpoint" 2>&1)

    local curl_exit=$?

    if [ $curl_exit -ne 0 ]; then
        log_error "Failed to connect to backend API: $api_endpoint"
        log_error "curl exit code: $curl_exit"
        log_error "Ensure backend is healthy: docker ps --filter name=$backend_container"
        return 1
    fi

    # Check response
    local success
    success=$(echo "$response" | jq -r '.success // false' 2>/dev/null)

    if [ "$success" = "true" ]; then
        log_success "KAS $kas_id registered in MongoDB"
        echo ""
        echo -e "${BOLD}Registration Details:${NC}"
        echo "  Status: pending (awaiting admin approval)"
        echo "  Approve with: ./dive kas approve $kas_id"
        return 0
    fi

    # Check if already registered (409 Conflict)
    local error_msg
    error_msg=$(echo "$response" | jq -r '.error // "Unknown error"' 2>/dev/null)

    if echo "$error_msg" | grep -qi "already registered"; then
        log_info "KAS $kas_id is already registered in MongoDB"
        return 0
    fi

    log_error "Failed to register KAS: $error_msg"
    log_error "Full backend response:"
    echo "$response" | jq . 2>/dev/null || echo "$response"
    log_error ""
    log_error "Registration payload sent:"
    echo "$payload" | jq . 2>/dev/null
    log_error ""
    log_error "Backend endpoint: $api_endpoint"
    log_error "Backend container: $backend_container"
    return 1
}

##
# Auto-approve a KAS registration (for automated deployment)
#
# Arguments:
#   $1 - KAS ID (e.g., hun-kas)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_kas_approve() {
    local kas_id="$1"

    if [ -z "$kas_id" ]; then
        log_error "KAS ID required"
        echo "Usage: ./dive spoke kas approve <kas-id>"
        return 1
    fi

    # CRITICAL FIX: KAS approval endpoint is on HUB backend, not spoke backend
    # Hub backend has the kas_registry collection and approval logic
    local hub_backend_url="${HUB_BACKEND_URL:-https://localhost:4000}"
    local api_endpoint="${hub_backend_url}/api/kas/registry/${kas_id}/approve"

    log_info "Approving KAS registration: $kas_id (via Hub backend)"

    # Auto-approval in development mode using CLI bypass
    # In production, this would require super_admin JWT token
    local response
    response=$(curl -sk -X POST "$api_endpoint" \
        -H "X-CLI-Bypass: dive-cli-local-dev" \
        2>&1)

    local success
    success=$(echo "$response" | jq -r '.success // false' 2>/dev/null)

    if [ "$success" = "true" ]; then
        log_success "KAS $kas_id approved and activated"
        return 0
    fi

    # Check if auth error (expected in some configurations)
    local error_msg
    error_msg=$(echo "$response" | jq -r '.error // "Unknown error"' 2>/dev/null)

    if echo "$error_msg" | grep -qi "authentication\|authorized"; then
        log_warn "KAS approval requires authentication - manual approval needed"
        log_info "Manual approval: Login to Hub as super_admin and approve $kas_id"
        return 1
    fi

    log_error "Failed to approve KAS: $error_msg"
    return 1
}

# Spoke KAS command dispatcher
spoke_kas() {
    local subcommand="${1:-status}"
    shift || true

    case "$subcommand" in
        init)             spoke_kas_init "$@" ;;
        status)           spoke_kas_status "$@" ;;
        health)           spoke_kas_health "$@" ;;
        register)         spoke_kas_register "$@" ;;
        register-mongodb) spoke_kas_register_mongodb "$@" ;;
        sync-from-hub)    spoke_kas_sync_from_hub "$@" ;;
        approve)          spoke_kas_approve "$@" ;;
        unregister)       spoke_kas_unregister "$@" ;;
        logs)             spoke_kas_logs "$@" ;;
        *)
            echo -e "${BOLD}Spoke KAS Commands:${NC}"
            echo ""
            echo "  init <code>             Initialize KAS for a spoke"
            echo "  status <code>           Show KAS status"
            echo "  health <code>           Detailed health check"
            echo "  register <code>         Register in file-based registry (legacy)"
            echo "  register-mongodb <code> Register in MongoDB (recommended)"
            echo "  sync-from-hub <code>    Sync Hub KAS registry to spoke MongoDB"
            echo "  approve <kas-id>        Approve a pending KAS registration"
            echo "  unregister <code>       Remove from registry"
            echo "  logs <code> [-f]        View KAS logs"
            echo ""
            ;;
    esac
}

# =============================================================================
# KAS FEDERATION SYNC FUNCTIONS
# =============================================================================
# CRITICAL FEATURE (2026-02-07): Cross-instance KAS registry synchronization
# 
# For proper federation, each instance needs to know about ALL trusted KAS
# instances (both local and federated). This enables cross-instance encrypted
# resource access.
#
# Architecture:
# - Hub MongoDB kas_registry: Contains usa-kas + all spoke KAS instances
# - Spoke MongoDB kas_registry: Contains spoke-kas + Hub KAS (synced from Hub)
# =============================================================================

##
# Sync Hub KAS registry to Spoke MongoDB
#
# Queries Hub's /api/kas/registry and registers Hub's KAS instances
# in the spoke's local MongoDB. This enables the spoke's KAS service
# to route key requests to the Hub when accessing Hub encrypted resources.
#
# Arguments:
#   $1 - Spoke instance code (e.g., FRA)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_kas_sync_from_hub() {
    local instance_code="${1:-${INSTANCE:-}}"

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo "Usage: ./dive spoke kas sync-from-hub <CODE>"
        return 1
    fi

    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")

    log_info "Syncing Hub KAS registry to $code_upper MongoDB..."

    # Get Hub backend URL (localhost for local Docker)
    local hub_api_url="https://localhost:4000/api/kas/registry"
    local spoke_api_url="https://localhost:${SPOKE_BACKEND_PORT:-4010}/api/kas/register"

    # Query Hub's KAS registry
    log_verbose "Querying Hub KAS registry: $hub_api_url"
    local hub_registry
    hub_registry=$(curl -sk "$hub_api_url" 2>&1)
    
    if [ $? -ne 0 ]; then
        log_error "Failed to query Hub KAS registry"
        return 1
    fi

    # Extract KAS instances from Hub (should be usa-kas and any other registered spokes)
    local kas_count=$(echo "$hub_registry" | jq -r '.kasServers | length' 2>/dev/null || echo "0")
    
    if [ "$kas_count" = "0" ]; then
        log_warn "No KAS instances found in Hub registry"
        return 0
    fi

    log_info "Found $kas_count KAS instance(s) in Hub registry"

    # Register each Hub KAS instance in Spoke MongoDB
    local registered_count=0
    for i in $(seq 0 $((kas_count - 1))); do
        local kas_id=$(echo "$hub_registry" | jq -r ".kasServers[$i].kasId" 2>/dev/null)
        local kas_url=$(echo "$hub_registry" | jq -r ".kasServers[$i].kasUrl" 2>/dev/null)
        local organization=$(echo "$hub_registry" | jq -r ".kasServers[$i].organization" 2>/dev/null)
        local country_code=$(echo "$hub_registry" | jq -r ".kasServers[$i].countryCode" 2>/dev/null)

        # Skip if this is the spoke's own KAS (already registered locally)
        if [ "$kas_id" = "${code_lower}-kas" ]; then
            log_verbose "Skipping own KAS: $kas_id"
            continue
        fi

        log_verbose "Registering Hub KAS in Spoke: $kas_id ($organization)"

        # Build registration payload (simplified - Hub instances are pre-validated)
        local payload=$(cat << EOF
{
  "kasId": "$kas_id",
  "organization": "$organization",
  "countryCode": "$country_code",
  "kasUrl": "$kas_url",
  "internalKasUrl": "https://kas:8080",
  "jwtIssuer": "https://keycloak:8443/realms/dive-v3-broker-usa",
  "supportedCountries": ["$country_code"],
  "supportedCOIs": ["NATO", "NATO-COSMIC", "FVEY"],
  "capabilities": ["key-release", "policy-evaluation", "audit-logging", "ztdf-support"],
  "contact": "kas-admin@${country_code,,}.dive25.com"
}
EOF
)

        # Register in Spoke MongoDB via backend API
        local response
        response=$(curl -sk -X POST "$spoke_api_url" \
            -H "Content-Type: application/json" \
            -d "$payload" 2>&1)

        if echo "$response" | jq -e '.success == true' >/dev/null 2>&1; then
            log_verbose "✓ Registered $kas_id in Spoke MongoDB"
            ((registered_count++))
            
            # CRITICAL: Auto-approve the KAS instance (status: pending → active)
            # This is safe because we're syncing from the Hub (trusted source)
            local backend_container="dive-spoke-${code_lower}-backend"
            if docker ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
                docker exec dive-spoke-${code_lower}-mongodb mongosh \
                    -u admin -p "${MONGO_PASSWORD:-}" --authenticationDatabase admin \
                    "dive-v3-${code_lower}" --quiet \
                    --eval "db.kas_registry.updateOne({kasId: '$kas_id'}, {\$set: {status: 'active', enabled: true}})" \
                    >/dev/null 2>&1
                log_verbose "✓ Auto-approved $kas_id (trusted Hub source)"
            fi
        else
            log_verbose "⚠ Failed to register $kas_id (may already exist)"
        fi
    done

    log_success "KAS federation sync complete: $registered_count instance(s) registered from Hub"
    return 0
}

# Mark module as loaded
export DIVE_SPOKE_KAS_LOADED=1

