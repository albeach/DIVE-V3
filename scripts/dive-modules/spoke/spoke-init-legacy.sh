#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Init (Legacy, Wizard, Keycloak Init)
# =============================================================================
# Extracted from spoke-init.sh (Phase 13d)
# Contains: _create_spoke_docker_compose, spoke_init, _spoke_init_legacy,
#   spoke_init_keycloak, _update_spoke_client_secret
# =============================================================================

[ -n "${SPOKE_INIT_LEGACY_LOADED:-}" ] && return 0

# Helper function to create docker-compose.yml from template
# Uses standardized template with version tracking for drift detection
_create_spoke_docker_compose() {
    local spoke_dir="$1"
    local code_upper="$2"
    local code_lower="$3"
    local instance_name="$4"
    local spoke_id="$5"
    local idp_hostname="$6"
    local api_url="$7"
    local base_url="$8"
    local idp_url="$9"
    local tunnel_token="${10}"

    # ==========================================================================
    # Port allocation based on instance code (spoke-in-a-box pattern)
    # Uses centralized get_instance_ports function for consistency
    # ==========================================================================
    eval "$(get_instance_ports "$code_upper")"

    local frontend_host_port=$SPOKE_FRONTEND_PORT
    local backend_host_port=$SPOKE_BACKEND_PORT
    local keycloak_https_port=$SPOKE_KEYCLOAK_HTTPS_PORT
    local keycloak_http_port=$SPOKE_KEYCLOAK_HTTP_PORT
    local postgres_host_port=$SPOKE_POSTGRES_PORT
    local mongodb_host_port=$SPOKE_MONGODB_PORT
    local redis_host_port=$SPOKE_REDIS_PORT
    local opa_host_port=$SPOKE_OPA_PORT
    local kas_host_port=$SPOKE_KAS_PORT

    # ==========================================================================
    # Country-specific theming from NATO countries database
    # ==========================================================================
    local theme_primary=$(get_country_primary_color "$code_upper")
    local theme_secondary=$(get_country_secondary_color "$code_upper")
    local country_timezone=$(get_country_timezone "$code_upper")
    local country_name=$(get_country_name "$code_upper")

    # Fallback to default colors if country not in database
    if [ -z "$theme_primary" ]; then
        theme_primary="#1a365d"
        theme_secondary="#2b6cb0"
        log_verbose "Using default theme colors for $code_upper (no custom colors defined)"
    fi

    log_info "Using theme colors for $code_upper: primary=$theme_primary, secondary=$theme_secondary"

    # Build base URLs for local development
    local app_base_url="https://localhost:${frontend_host_port}"
    local api_base_url="https://localhost:${backend_host_port}"
    local idp_base_url="https://localhost:${keycloak_https_port}"

    # ==========================================================================
    # Use template file (SSOT for docker-compose structure)
    # ==========================================================================
    local template_file="${DIVE_ROOT}/templates/spoke/docker-compose.template.yml"

    if [ ! -f "$template_file" ]; then
        log_error "Template file not found: $template_file"
        return 1
    fi

    # Calculate template hash for drift detection
    local template_hash=$(md5sum "$template_file" | awk '{print $1}')
    local timestamp=$(date -Iseconds)

    log_info "Generating docker-compose.yml from template (hash: ${template_hash:0:12})"

    # Copy template and replace placeholders
    cp "$template_file" "$spoke_dir/docker-compose.yml"

    # Portable sed for cross-platform compatibility (macOS + Linux)
    local tmpfile=$(mktemp)
    local opal_opa_offset=$(echo -n "${code_lower}" | cksum | cut -d' ' -f1)
    local opal_opa_port=$((9181 + (opal_opa_offset % 100)))
    
    # Replace all placeholders in one go
    sed "s|{{TEMPLATE_HASH}}|${template_hash}|g; \
         s|{{TIMESTAMP}}|${timestamp}|g; \
         s|{{INSTANCE_CODE_UPPER}}|${code_upper}|g; \
         s|{{INSTANCE_CODE_LOWER}}|${code_lower}|g; \
         s|{{INSTANCE_NAME}}|${instance_name}|g; \
         s|{{SPOKE_ID}}|${spoke_id}|g; \
         s|{{IDP_HOSTNAME}}|${idp_hostname}|g; \
         s|{{API_URL}}|${api_base_url}|g; \
         s|{{BASE_URL}}|${app_base_url}|g; \
         s|{{IDP_URL}}|${idp_url}|g; \
         s|{{IDP_BASE_URL}}|${idp_base_url}|g; \
         s|{{KEYCLOAK_HOST_PORT}}|${keycloak_https_port}|g; \
         s|{{KEYCLOAK_HTTP_PORT}}|${keycloak_http_port}|g; \
         s|{{SPOKE_KEYCLOAK_HTTPS_PORT}}|${keycloak_https_port}|g; \
         s|{{BACKEND_HOST_PORT}}|${backend_host_port}|g; \
         s|{{FRONTEND_HOST_PORT}}|${frontend_host_port}|g; \
         s|{{OPA_HOST_PORT}}|${opa_host_port}|g; \
         s|{{OPAL_OPA_PORT}}|${opal_opa_port}|g; \
         s|{{KAS_HOST_PORT}}|${kas_host_port}|g" "$spoke_dir/docker-compose.yml" > "$tmpfile" && mv "$tmpfile" "$spoke_dir/docker-compose.yml"

    log_success "Generated docker-compose.yml from template (always regenerated from SSOT)"
}
# Original spoke_init (backward compatible, calls wizard or direct)
spoke_init() {
    local instance_code="${1:-}"
    local instance_name="${2:-}"

    # If both arguments provided, use direct (non-interactive) mode
    if [ -n "$instance_code" ] && [ -n "$instance_name" ]; then
        # Check for --wizard flag
        if [ "${3:-}" = "--wizard" ] || [ "${3:-}" = "-w" ]; then
            spoke_setup_wizard "$instance_code" "$instance_name"
            return $?
        fi

        # Direct initialization (legacy mode)
        _spoke_init_legacy "$instance_code" "$instance_name"
        return $?
    fi

    # No arguments or partial - launch wizard
    spoke_setup_wizard "$instance_code" "$instance_name"
}

# Legacy spoke_init for backward compatibility
_spoke_init_legacy() {
    local instance_code="${1:-}"
    local instance_name="${2:-}"

    if [ -z "$instance_code" ] || [ -z "$instance_name" ]; then
        log_error "Usage: ./dive spoke init <CODE> <NAME>"
    echo ""
        echo "Example: ./dive spoke init NZL 'New Zealand Defence Force'"
    echo ""
        echo "Arguments:"
        echo "  CODE    3-letter country code (ISO 3166-1 alpha-3)"
        echo "  NAME    Human-readable instance name"
    echo ""
        echo "For interactive setup wizard, run: ./dive spoke init"
        return 1
    fi

    # CODE FORMAT VALIDATION
    # 1. Length must be exactly 3 characters (ISO 3166-1 alpha-3)
    if [ ${#instance_code} -ne 3 ]; then
        log_error "Instance code must be exactly 3 characters (ISO 3166-1 alpha-3)"
        echo "  Examples: USA, FRA, POL, GBR, EST"
        return 1
    fi

    # 2. Must be alphabetic only (no numbers or special characters)
    if ! [[ "$instance_code" =~ ^[A-Za-z]{3}$ ]]; then
        log_error "Instance code must contain only letters (A-Z)"
        echo "  Invalid: $instance_code"
        echo "  Valid examples: USA, FRA, POL"
        return 1
    fi

    # 3. Normalize to uppercase
    instance_code="${instance_code^^}"

    # 4. NATO country validation (warning, not blocking)
    if type -t is_nato_country &>/dev/null && ! is_nato_country "$instance_code" 2>/dev/null; then
        if type -t is_partner_nation &>/dev/null && ! is_partner_nation "$instance_code" 2>/dev/null; then
            log_warn "Warning: '$instance_code' is not a recognized NATO country or partner nation"
            log_warn "Port allocation will use hash-based fallback (offsets 48+)"
            echo ""
            echo "  Valid NATO countries (32):"
            if type -t list_nato_countries &>/dev/null; then
                list_nato_countries 2>/dev/null | head -5
                echo "  ... (see './dive spoke list-countries' for full list)"
            fi
            echo ""
            echo "  This may cause port conflicts if multiple non-NATO codes are used."
            echo ""
            if is_interactive; then
                read -p "  Continue anyway? (yes/no): " confirm
                if [ "$confirm" != "yes" ]; then
                    log_info "Cancelled"
                    return 1
                fi
            else
                log_warn "Non-interactive mode: auto-confirming non-NATO code"
            fi
        else
            log_info "Partner nation detected: $instance_code (will use offsets 32-39)"
        fi
    else
        log_info "NATO country detected: $instance_code"
    fi

    # Use default values and call internal init
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local hub_url="${DIVE_HUB_URL:-https://localhost:4000}"

    # Calculate ports using centralized function (ensures consistency with docker-compose)
    eval "$(get_instance_ports "$code_upper")"

    local frontend_port=$SPOKE_FRONTEND_PORT
    local backend_port=$SPOKE_BACKEND_PORT
    local keycloak_port=$SPOKE_KEYCLOAK_HTTPS_PORT
    local kas_port=$SPOKE_KAS_PORT

    # Generate localhost URLs for local development (default)
    # For production, use the interactive init with Cloudflare tunnel
    local base_url="https://localhost:${frontend_port}"
    local api_url="https://localhost:${backend_port}"
    # idpUrl uses Docker container name for internal communication
    # idpPublicUrl uses localhost for browser access
    local idp_url="https://dive-spoke-${code_lower}-keycloak:8443"
    local idp_public_url="https://localhost:${keycloak_port}"
    local kas_url="https://localhost:${kas_port}"

    # ==========================================================================
    # BEST PRACTICE: Check for stale volumes and reuse passwords if they exist
    # This prevents database authentication failures on redeployment
    # ==========================================================================
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local env_file="$spoke_dir/.env"
    local has_stale_volumes=false

    # Check for existing volumes (common naming patterns)
    local volume_patterns=(
        "${code_lower}_${code_lower}-postgres-data"
        "${code_lower}_${code_lower}_postgres_data"
        "dive-spoke-${code_lower}_${code_lower}-postgres-data"
    )

    for pattern in "${volume_patterns[@]}"; do
        if docker volume ls -q 2>/dev/null | grep -q "^${pattern}$"; then
            has_stale_volumes=true
            break
        fi
    done

    # Password generation strategy:
    # 1. If .env exists, reuse passwords (ensures consistency with existing volumes)
    # 2. If stale volumes exist but no .env, warn and clean volumes
    # 3. Otherwise, generate fresh passwords

    local postgres_pass=""
    local mongo_pass=""
    local keycloak_pass=""
    local auth_secret=""
    local client_secret=""

    if [ -f "$env_file" ]; then
        # Reuse existing passwords from .env file
        log_info "Found existing .env file - reusing passwords for volume consistency"
        postgres_pass=$(grep "^POSTGRES_PASSWORD_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"')
        mongo_pass=$(grep "^MONGO_PASSWORD_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"')
        keycloak_pass=$(grep "^KEYCLOAK_ADMIN_PASSWORD_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"')
        auth_secret=$(grep "^AUTH_SECRET=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"')
        client_secret=$(grep "^AUTH_KEYCLOAK_SECRET=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"')
    elif [ "$has_stale_volumes" = true ]; then
        # Stale volumes exist but no .env - this will cause password mismatch!
        log_warn "Stale Docker volumes detected for ${code_upper} but no .env file found"
        log_warn "This will cause database authentication failures"
        echo ""
        echo -e "${YELLOW}  Recommended: Clean up stale volumes first:${NC}"
        echo -e "    ./dive --instance ${code_lower} spoke clean"
        echo ""

        # Auto-clean stale volumes for better UX
        log_info "Auto-cleaning stale volumes for fresh deployment..."
        # Use compose to clean volumes instead of pattern matching
        if [ -f "${spoke_dir}/docker-compose.yml" ]; then
            (cd "$spoke_dir" && COMPOSE_PROJECT_NAME="dive-spoke-${code_lower}" docker compose down -v 2>/dev/null) || true
        fi
    fi

    # Generate fresh passwords for any missing values
    [ -z "$postgres_pass" ] && postgres_pass=$(openssl rand -base64 16 | tr -d '/+=')
    [ -z "$mongo_pass" ] && mongo_pass=$(openssl rand -base64 16 | tr -d '/+=')
    [ -z "$keycloak_pass" ] && keycloak_pass=$(openssl rand -base64 16 | tr -d '/+=')
    [ -z "$auth_secret" ] && auth_secret=$(openssl rand -base64 32)
    [ -z "$client_secret" ] && client_secret=$(openssl rand -base64 24 | tr -d '/+=')

    # Generate default contact email based on instance code
    local contact_email="admin@${code_lower}.dive25.com"

    print_header
    echo -e "${BOLD}Initializing DIVE V3 Spoke Instance:${NC} $code_upper"
    echo ""
    echo -e "${YELLOW}Tip: For interactive setup with hostname and tunnel configuration,${NC}"
    echo -e "${YELLOW}     run: ./dive spoke init (without arguments)${NC}"
    echo ""

    # Call internal init with default contact email
    _spoke_init_internal "$code_upper" "$instance_name" "$base_url" "$api_url" "$idp_url" "$idp_public_url" "$kas_url" \
        "$hub_url" "$contact_email" "" "$postgres_pass" "$mongo_pass" "$keycloak_pass" "$auth_secret" "$client_secret" "false"
}

# =============================================================================
# KEYCLOAK INITIALIZATION
# =============================================================================

spoke_init_keycloak() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}Initializing Keycloak for Spoke:${NC} ${code_upper}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would initialize Keycloak realm and client for $code_upper"
        return 0
    fi

    if [ ! -f "$spoke_dir/docker-compose.yml" ]; then
        log_error "Spoke not deployed: $instance_code"
        echo ""
        echo "Deploy first: ./dive spoke deploy $instance_code <name>"
        return 1
    fi

    # Get port configuration
    eval "$(get_instance_ports "$code_upper")"
    local kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"

    # Get admin password
    local kc_pass=""
    kc_pass=$(get_keycloak_password "dive-spoke-${code_lower}-keycloak" 2>/dev/null || true)

    if [ -z "$kc_pass" ]; then
        # Try from .env
        if [ -f "$spoke_dir/.env" ]; then
            kc_pass=$(grep "^KEYCLOAK_ADMIN_PASSWORD_${code_upper}=" "$spoke_dir/.env" 2>/dev/null | cut -d= -f2 | tr -d '\n\r"')
        fi
    fi

    if [ -z "$kc_pass" ]; then
        log_error "Cannot find Keycloak admin password for $code_upper"
        echo ""
        echo "Ensure the spoke is properly deployed and .env file exists."
        return 1
    fi

    # Wait for Keycloak to be ready
    echo -e "${CYAN}Waiting for Keycloak to be ready...${NC}"
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -kfs "https://localhost:${kc_port}/health/ready" >/dev/null 2>&1; then
            log_success "Keycloak is ready"
            echo ""
            break
        fi

        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done

    if [ $attempt -gt $max_attempts ]; then
        log_error "Keycloak failed to become ready after $max_attempts attempts"
        return 1
    fi

    # Get admin token
    echo -e "${CYAN}Getting admin token...${NC}"
    local admin_token
    admin_token=$(curl -sk -X POST "https://localhost:${kc_port}/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${kc_pass}" | jq -r '.access_token // empty')

    if [ -z "$admin_token" ]; then
        log_error "Failed to get Keycloak admin token"
        return 1
    fi
    log_success "Admin token obtained"
    echo ""

    # Create realm if it doesn't exist
    local realm_name="dive-v3-broker-${code_lower}"
    echo -e "${CYAN}Checking realm: ${realm_name}...${NC}"

    local realm_exists
    realm_exists=$(curl -sk -H "Authorization: Bearer ${admin_token}" \
        "https://localhost:${kc_port}/admin/realms/${realm_name}" 2>/dev/null | jq -r '.realm // empty')

    if [ -z "$realm_exists" ]; then
        echo -e "${CYAN}Creating realm...${NC}"
        local realm_data=$(cat <<EOF
{
    "realm": "${realm_name}",
    "displayName": "DIVE V3 Broker - ${code_upper}",
    "enabled": true,
    "sslRequired": "external",
    "registrationAllowed": false,
    "loginWithEmailAllowed": true,
    "duplicateEmailsAllowed": false,
    "resetPasswordAllowed": true,
    "editUsernameAllowed": false,
    "bruteForceProtected": true
}
EOF
)

        curl -sk -X POST "https://localhost:${kc_port}/admin/realms" \
            -H "Authorization: Bearer ${admin_token}" \
            -H "Content-Type: application/json" \
            -d "$realm_data"

        if [ $? -eq 0 ]; then
            log_success "Realm created: ${realm_name}"
        else
            log_error "Failed to create realm"
            return 1
        fi
    else
        log_info "Realm already exists: ${realm_name}"
    fi
    echo ""

    # Create client
    local client_id="dive-v3-broker-${code_lower}"
    echo -e "${CYAN}Checking client: ${client_id}...${NC}"

    local client_exists
    client_exists=$(curl -sk -H "Authorization: Bearer ${admin_token}" \
        "https://localhost:${kc_port}/admin/realms/${realm_name}/clients?clientId=${client_id}" 2>/dev/null | jq -r '.[0].id // empty')

    if [ -z "$client_exists" ]; then
        echo -e "${CYAN}Creating client...${NC}"

        # Build redirect URIs
        local redirect_uris=$(cat <<EOF
[
    "https://localhost:3000",
    "https://localhost:3000/*",
    "https://localhost:3000/api/auth/callback/keycloak",
    "https://${code_lower}-app.dive25.com",
    "https://${code_lower}-app.dive25.com/*",
    "https://${code_lower}-app.dive25.com/api/auth/callback/keycloak",
    "*"
]
EOF
)

        local client_data=$(cat <<EOF
{
    "clientId": "${client_id}",
    "name": "DIVE V3 Frontend - ${code_upper}",
    "description": "Frontend application for DIVE V3 spoke ${code_upper}",
    "enabled": true,
    "protocol": "openid-connect",
    "clientAuthenticatorType": "client-secret",
    "secret": "CHANGE_THIS_SECRET",
    "directAccessGrantsEnabled": true,
    "serviceAccountsEnabled": false,
    "implicitFlowEnabled": false,
    "standardFlowEnabled": true,
    "publicClient": false,
    "redirectUris": ${redirect_uris},
    "webOrigins": ["*"],
    "attributes": {
        "saml.assertion.signature": "false",
        "saml.multivalued.roles": "false",
        "saml.force.post.binding": "false",
        "saml.encrypt": "false",
        "saml.server.signature": "false",
        "saml.server.signature.keyinfo.ext": "false",
        "exclude.session.state.from.auth.response": "false",
        "saml_force_name_id_format": "false",
        "saml.client.signature": "false",
        "tls.client.certificate.bound.access.tokens": "false",
        "saml.authnstatement": "false",
        "display.on.consent.screen": "false",
        "saml.onetimeuse.condition": "false"
    }
}
EOF
)

        curl -sk -X POST "https://localhost:${kc_port}/admin/realms/${realm_name}/clients" \
            -H "Authorization: Bearer ${admin_token}" \
            -H "Content-Type: application/json" \
            -d "$client_data"

        if [ $? -eq 0 ]; then
            log_success "Client created: ${client_id}"
        else
            log_error "Failed to create client"
            return 1
        fi
    else
        log_info "Client already exists: ${client_id}"
    fi

    # Retrieve actual client secret from Keycloak and update .env file
    log_step "Retrieving client secret and updating configuration..."
    _update_spoke_client_secret "$code_upper" "$env_file" "$admin_token" "$realm_name" "$client_id"

    echo ""
    log_success "Keycloak initialization complete for ${code_upper}!"
    echo ""
    echo "Realm: ${realm_name}"
    echo "Client: ${client_id}"
    echo "Client Secret: Configured ✓"
    echo ""
    echo "Next steps:"
    echo "  1. Configure protocol mappers: ./dive spoke fix-mappers"
    echo "  2. Start frontend: ./dive spoke up"
    echo ""
}

# =============================================================================
# CLIENT SECRET RETRIEVAL AND CONFIGURATION
# =============================================================================

_update_spoke_client_secret() {
    local code_upper="$1"
    local env_file="$2"
    local admin_token="$3"
    local realm_name="$4"
    local client_id="$5"

    # Get client UUID from clientId
    local client_uuid
    client_uuid=$(curl -sk "https://localhost:${kc_port}/admin/realms/${realm_name}/clients?clientId=${client_id}" \
        -H "Authorization: Bearer ${admin_token}" 2>/dev/null | jq -r '.[0].id')

    if [ -z "$client_uuid" ] || [ "$client_uuid" = "null" ]; then
        log_error "Failed to get client UUID for ${client_id}"
        return 1
    fi

    # Get actual client secret from Keycloak
    local actual_secret
    actual_secret=$(curl -sk "https://localhost:${kc_port}/admin/realms/${realm_name}/clients/${client_uuid}/client-secret" \
        -H "Authorization: Bearer ${admin_token}" 2>/dev/null | jq -r '.value')

    if [ -z "$actual_secret" ] || [ "$actual_secret" = "null" ]; then
        log_error "Failed to retrieve client secret for ${client_id}"
        return 1
    fi

    # Update .env file with actual secret
    if [ -f "$env_file" ]; then
        # Update the instance-specific client secret variable
        sed -i.tmp "s|^KEYCLOAK_CLIENT_SECRET_${code_upper}=.*|KEYCLOAK_CLIENT_SECRET_${code_upper}=${actual_secret}|" "$env_file"
        rm -f "${env_file}.tmp"

        log_success "Client secret updated in ${env_file}"
        log_verbose "Client ID: ${client_id}"
        log_verbose "Secret: ${actual_secret:0:8}..."
    else
        log_error ".env file not found: ${env_file}"
        return 1
    fi
}

# =============================================================================
# CERTIFICATE GENERATION
# =============================================================================


export SPOKE_INIT_LEGACY_LOADED=1
