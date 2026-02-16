#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Maintenance Sub-Module
# =============================================================================
# Commands: fix-mappers, reinit-client, regenerate-theme, fix-hostname, failover, maintenance
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-07
# =============================================================================

# =============================================================================
# PROTOCOL MAPPER FIXES
# =============================================================================

spoke_fix_mappers() {
    local code="${1:-}"
    if [ -z "$code" ]; then
        log_error "Instance code required"
        echo ""
        echo "Usage: ./dive spoke fix-mappers CODE"
        return 1
    fi
    local code_lower=$(lower "$code")
    local code_upper=$(upper "$code")

    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  Fixing Protocol Mappers for ${code_upper}${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""

    local instance_dir="${DIVE_ROOT}/instances/${code_lower}"
    local realm="dive-v3-broker-${code_lower}"
    local client_id="dive-v3-broker-${code_lower}"

    # Get instance ports - try multiple methods
    local kc_port

    # Method 1: Use get_instance_ports from common.sh (SSOT)
    if type get_instance_ports &>/dev/null; then
        # get_instance_ports outputs shell exports, use eval
        eval "$(get_instance_ports "$code_upper" 2>/dev/null)" && kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-}"
    fi

    # Method 2: Get from running Docker container
    if [ -z "$kc_port" ] || [ "$kc_port" = "8443" ]; then
        local container_port
        container_port=$(docker port "dive-spoke-${code_lower}-keycloak" 8443 2>/dev/null | grep -oE '[0-9]+$' | head -1)
        if [ -n "$container_port" ]; then
            kc_port="$container_port"
        fi
    fi

    kc_port="${kc_port:-8443}"

    # Get admin password
    local password
    if [ -f "${instance_dir}/.env" ]; then
        password=$(grep "KEYCLOAK_ADMIN_PASSWORD_${code_upper}" "${instance_dir}/.env" 2>/dev/null | cut -d= -f2)
    fi
    password="${password:-admin}"

    log_info "Keycloak: https://localhost:${kc_port}"
    log_info "Realm: ${realm}"
    log_info "Client: ${client_id}"

    # Get admin token
    local token
    token=$(curl -sk -X POST "https://localhost:${kc_port}/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${password}" | jq -r '.access_token')

    if [ -z "$token" ] || [ "$token" = "null" ]; then
        log_error "Failed to get Keycloak admin token"
        return 1
    fi

    # Get client UUID
    local client_uuid
    client_uuid=$(curl -sk "https://localhost:${kc_port}/admin/realms/${realm}/clients" \
        -H "Authorization: Bearer $token" | jq -r ".[] | select(.clientId==\"${client_id}\") | .id")

    if [ -z "$client_uuid" ]; then
        log_error "Client ${client_id} not found in realm ${realm}"
        return 1
    fi

    log_info "Client UUID: ${client_uuid}"

    # Define required mappers (core DIVE V3 attributes + ACR/AMR for MFA/federation)
    local mappers=(
        # Core DIVE V3 attributes
        '{"name":"clearance","protocol":"openid-connect","protocolMapper":"oidc-usermodel-attribute-mapper","config":{"claim.name":"clearance","user.attribute":"clearance","jsonType.label":"String","id.token.claim":"true","access.token.claim":"true","userinfo.token.claim":"true"}}'
        '{"name":"countryOfAffiliation","protocol":"openid-connect","protocolMapper":"oidc-usermodel-attribute-mapper","config":{"claim.name":"countryOfAffiliation","user.attribute":"countryOfAffiliation","jsonType.label":"String","id.token.claim":"true","access.token.claim":"true","userinfo.token.claim":"true"}}'
        '{"name":"acpCOI","protocol":"openid-connect","protocolMapper":"oidc-usermodel-attribute-mapper","config":{"claim.name":"acpCOI","user.attribute":"acpCOI","jsonType.label":"JSON","id.token.claim":"true","access.token.claim":"true","userinfo.token.claim":"true","multivalued":"true"}}'
        '{"name":"uniqueID","protocol":"openid-connect","protocolMapper":"oidc-usermodel-attribute-mapper","config":{"claim.name":"uniqueID","user.attribute":"uniqueID","jsonType.label":"String","id.token.claim":"true","access.token.claim":"true","userinfo.token.claim":"true"}}'
        # AMR for local auth (reads from user.attribute.amr)
        '{"name":"amr (user attribute)","protocol":"openid-connect","protocolMapper":"oidc-usermodel-attribute-mapper","config":{"claim.name":"amr","user.attribute":"amr","jsonType.label":"String","id.token.claim":"true","access.token.claim":"true","userinfo.token.claim":"true","multivalued":"true"}}'
        # AMR fallback for federated users (outputs to user_amr for frontend prioritization)
        '{"name":"amr-user-attribute-fallback","protocol":"openid-connect","protocolMapper":"oidc-usermodel-attribute-mapper","config":{"claim.name":"user_amr","user.attribute":"amr","jsonType.label":"String","id.token.claim":"true","access.token.claim":"true","userinfo.token.claim":"true","multivalued":"true"}}'
        # ACR for local auth (native session-based mapper)
        '{"name":"acr (authn context)","protocol":"openid-connect","protocolMapper":"oidc-acr-mapper","config":{"claim.name":"acr","id.token.claim":"true","access.token.claim":"true","userinfo.token.claim":"true"}}'
        # ACR fallback for federated users (outputs to user_acr for frontend prioritization)
        '{"name":"acr-user-attribute-fallback","protocol":"openid-connect","protocolMapper":"oidc-usermodel-attribute-mapper","config":{"claim.name":"user_acr","user.attribute":"acr","jsonType.label":"String","id.token.claim":"true","access.token.claim":"true","userinfo.token.claim":"true"}}'
        # Realm roles
        '{"name":"realm roles","protocol":"openid-connect","protocolMapper":"oidc-usermodel-realm-role-mapper","config":{"claim.name":"realm_access.roles","jsonType.label":"String","id.token.claim":"true","access.token.claim":"true","multivalued":"true"}}'
    )

    local created=0
    local skipped=0

    for mapper_json in "${mappers[@]}"; do
        local mapper_name=$(echo "$mapper_json" | jq -r '.name')

        # Check if mapper exists
        local existing
        existing=$(curl -sk "https://localhost:${kc_port}/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" \
            -H "Authorization: Bearer $token" | jq -r ".[] | select(.name==\"${mapper_name}\") | .id")

        if [ -n "$existing" ]; then
            log_verbose "Mapper '${mapper_name}' already exists"
            skipped=$((skipped + 1))
        else
            # Create mapper
            curl -sk -X POST "https://localhost:${kc_port}/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" \
                -H "Authorization: Bearer $token" \
                -H "Content-Type: application/json" \
                -d "$mapper_json"
            log_info "Created mapper: ${mapper_name}"
            created=$((created + 1))
        fi
    done

    echo ""
    log_success "Protocol mappers fixed for ${code_upper}"
    log_info "Created: ${created}, Skipped (existing): ${skipped}"
    echo ""
    log_warn "Users must log out and back in to get tokens with new claims"
}

# =============================================================================
# CLIENT RECONFIGURATION
# =============================================================================

spoke_reinit_client() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")

    print_header
    echo -e "${BOLD}Reinitializing Client Redirect URIs:${NC} ${code_upper}"
    echo ""

    # Get port configuration
    eval "$(get_instance_ports "$code_upper")"
    local frontend_port="${SPOKE_FRONTEND_PORT:-3000}"
    local backend_port="${SPOKE_BACKEND_PORT:-4000}"
    local kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"

    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local realm_name="dive-v3-broker-${code_lower}"
    local client_id="dive-v3-broker-${code_lower}"

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
        log_error "Cannot find Keycloak admin password"
        return 1
    fi

    # Get admin token
    log_step "Getting admin token..."
    local admin_token
    admin_token=$(curl -sk -X POST "https://localhost:${kc_port}/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" -d "username=admin" -d "password=${kc_pass}" -d "client_id=admin-cli" 2>/dev/null | \
        jq -r '.access_token // empty')

    if [ -z "$admin_token" ]; then
        log_error "Failed to get admin token"
        return 1
    fi

    # Get client UUID
    log_step "Finding client ${client_id}..."
    local client_uuid
    client_uuid=$(curl -sk -H "Authorization: Bearer ${admin_token}" \
        "https://localhost:${kc_port}/admin/realms/${realm_name}/clients?clientId=${client_id}" 2>/dev/null | \
        jq -r '.[0].id // empty')

    if [ -z "$client_uuid" ]; then
        log_error "Client not found: ${client_id}"
        return 1
    fi

    log_info "Client UUID: ${client_uuid}"

    # Build comprehensive redirect URIs
    log_step "Updating redirect URIs..."

    local redirect_uris=$(cat <<EOF
[
    "https://localhost:${frontend_port}",
    "https://localhost:${frontend_port}/*",
    "https://localhost:${frontend_port}/api/auth/callback/keycloak",
    "https://${code_lower}-app.dive25.com",
    "https://${code_lower}-app.dive25.com/*",
    "https://${code_lower}-app.dive25.com/api/auth/callback/keycloak",
    "https://localhost:3000",
    "https://localhost:3000/*",
    "https://localhost:3000/api/auth/callback/keycloak",
    "https://localhost:8443/realms/dive-v3-broker-usa/broker/${code_lower}-idp/endpoint",
    "https://localhost:8443/realms/dive-v3-broker-usa/broker/${code_lower}-idp/endpoint/*",
    "https://usa-idp.dive25.com/realms/dive-v3-broker-usa/broker/${code_lower}-idp/endpoint",
    "https://usa-idp.dive25.com/realms/dive-v3-broker-usa/broker/${code_lower}-idp/endpoint/*",
    "*"
]
EOF
)

    local web_origins=$(cat <<EOF
[
    "https://localhost:${frontend_port}",
    "https://localhost:${backend_port}",
    "https://${code_lower}-app.dive25.com",
    "https://localhost:3000",
    "https://localhost:4000",
    "https://localhost:8443",
    "https://usa-idp.dive25.com",
    "https://usa-app.dive25.com",
    "*"
]
EOF
)

    # Update client
    local result
    result=$(curl -sk -X PUT "https://localhost:${kc_port}/admin/realms/${realm_name}/clients/${client_uuid}" \
        -H "Authorization: Bearer ${admin_token}" \
        -H "Content-Type: application/json" \
        -d "{
            \"redirectUris\": ${redirect_uris},
            \"webOrigins\": ${web_origins}
        }" -w "%{http_code}" -o /dev/null)

    if [ "$result" = "204" ]; then
        log_success "Client redirect URIs updated successfully!"
        echo ""
        echo "  Frontend URIs: https://localhost:${frontend_port}/*"
        echo "  Federation URIs: Hub broker callbacks"
        echo ""
        echo "  Test login: Open https://localhost:${frontend_port} in browser"
    else
        log_error "Failed to update client (HTTP ${result})"
        return 1
    fi
}

# =============================================================================
# THEME REGENERATION
# =============================================================================

spoke_regenerate_theme() {
    local code="${1:-}"
    if [ -z "$code" ]; then
        log_error "Instance code required"
        echo ""
        echo "Usage: ./dive spoke regenerate-theme CODE"
        return 1
    fi
    local code_upper=$(upper "$code")

    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  Regenerating Keycloak Theme for ${code_upper}${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""

    local script="${DIVE_ROOT}/scripts/generate-spoke-theme.sh"
    if [ ! -f "$script" ]; then
        log_error "Theme generator script not found: $script"
        return 1
    fi

    # Run the theme generator with --force to regenerate
    bash "$script" "$code_upper" --force
    local result=$?

    if [ $result -eq 0 ]; then
        echo ""
        log_success "Theme regenerated for ${code_upper}"
        echo ""
        log_info "To apply the theme, restart the spoke's Keycloak:"
        echo "  ./dive --instance ${code_lower} spoke restart keycloak"
    else
        log_error "Failed to regenerate theme for ${code_upper}"
    fi

    return $result
}

# =============================================================================
# CERTIFICATE MANAGEMENT
# =============================================================================

spoke_generate_certs() {
    local algorithm="${1:-$SPOKE_CERT_ALGORITHM}"
    local bits="${2:-$SPOKE_CERT_BITS}"

    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local certs_dir="$spoke_dir/certs"

    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke not initialized. Run: ./dive spoke init <CODE> <NAME>"
        return 1
    fi

    # Load config to get spoke ID
    local config_file="$spoke_dir/config.json"
    local spoke_id=""
    local instance_name=""

    if [ -f "$config_file" ]; then
        spoke_id=$(json_get_field "$config_file" "spokeId" "")
        instance_name=$(json_get_field "$config_file" "name" "$instance_code")
    fi

    spoke_id="${spoke_id:-spoke-${code_lower}-unknown}"

    print_header
    echo -e "${BOLD}Generating X.509 Certificates for Spoke:${NC} $(upper "$instance_code")"
    echo ""
    echo "  Algorithm:  $algorithm"
    echo "  Key Size:   $bits bits"
    echo "  Validity:   $SPOKE_CERT_DAYS days"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would generate certificates in: $certs_dir"
        log_dry "  - spoke.key (private key)"
        log_dry "  - spoke.crt (self-signed certificate)"
        log_dry "  - spoke.csr (CSR for hub signing)"
        return 0
    fi

    # Create certs directory
    mkdir -p "$certs_dir"

    # Generate private key
    echo -e "${CYAN}Generating private key...${NC}"
    if [ "$algorithm" = "rsa" ]; then
        openssl genrsa -out "$certs_dir/spoke.key" "$bits"
    else
        openssl ecparam -genkey -name prime256v1 -out "$certs_dir/spoke.key"
    fi

    if [ $? -ne 0 ]; then
        log_error "Failed to generate private key"
        return 1
    fi
    log_success "Private key generated: spoke.key"
    echo ""

    # Generate certificate signing request (CSR)
    echo -e "${CYAN}Generating certificate signing request...${NC}"
    local subject="/C=US/ST=State/L=City/O=DIVE V3/OU=Spoke/CN=${spoke_id}"

    openssl req -new -key "$certs_dir/spoke.key" -out "$certs_dir/spoke.csr" \
        -subj "$subject" -sha256

    if [ $? -ne 0 ]; then
        log_error "Failed to generate CSR"
        return 1
    fi
    log_success "CSR generated: spoke.csr"
    echo ""

    # Generate self-signed certificate for immediate use
    echo -e "${CYAN}Generating self-signed certificate...${NC}"
    openssl x509 -req -in "$certs_dir/spoke.csr" \
        -signkey "$certs_dir/spoke.key" \
        -out "$certs_dir/spoke.crt" \
        -days "${SPOKE_CERT_DAYS:-365}" \
        -sha256

    if [ $? -ne 0 ]; then
        log_error "Failed to generate self-signed certificate"
        return 1
    fi
    log_success "Self-signed certificate generated: spoke.crt"
    echo ""

    # Set appropriate permissions
    chmod 600 "$certs_dir/spoke.key"
    chmod 644 "$certs_dir/spoke.crt" "$certs_dir/spoke.csr"

    # Display certificate info
    echo -e "${CYAN}Certificate Details:${NC}"
    openssl x509 -in "$certs_dir/spoke.crt" -text -noout | grep -E "(Subject:|Issuer:|Not Before:|Not After:)" | sed 's/^/  /'

    echo ""
    log_success "Certificate generation complete!"
    echo ""
    echo "Files created in: $certs_dir"
    echo "  - spoke.key (private key - keep secure)"
    echo "  - spoke.crt (certificate)"
    echo "  - spoke.csr (certificate signing request)"
    echo ""
    echo "Next steps:"
    echo "  1. Submit spoke.csr to Hub administrator"
    echo "  2. Receive signed certificate from Hub"
    echo "  3. Import with: ./dive spoke pki-import"
    echo ""
}

spoke_rotate_certs() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local certs_dir="$spoke_dir/certs"

    print_header
    echo -e "${BOLD}Rotating Certificates for Spoke:${NC} ${code_upper}"
    echo ""

    if [ ! -d "$certs_dir" ]; then
        log_error "Certificates directory not found: $certs_dir"
        echo ""
        echo "Generate certificates first: ./dive spoke generate-certs"
        return 1
    fi

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would backup and regenerate certificates for $code_upper"
        return 0
    fi

    # Create backup directory
    local backup_dir="$certs_dir/backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$backup_dir"

    echo -e "${CYAN}Step 1/3: Backing up current certificates...${NC}"
    if [ -f "$certs_dir/spoke.key" ]; then cp "$certs_dir/spoke.key" "$backup_dir/"; fi
    if [ -f "$certs_dir/spoke.crt" ]; then cp "$certs_dir/spoke.crt" "$backup_dir/"; fi
    if [ -f "$certs_dir/spoke.csr" ]; then cp "$certs_dir/spoke.csr" "$backup_dir/"; fi
    log_success "Certificates backed up to: $backup_dir"
    echo ""

    # Regenerate certificates
    echo -e "${CYAN}Step 2/3: Generating new certificates...${NC}"
    if ! spoke_generate_certs "$@"; then
        log_error "Failed to generate new certificates"
        echo ""
        echo -e "${YELLOW}Original certificates preserved in backup${NC}"
        return 1
    fi
    echo ""

    # Restart services to pick up new certificates
    echo -e "${CYAN}Step 3/3: Restarting services...${NC}"
    if [ -f "$spoke_dir/docker-compose.yml" ]; then
        export COMPOSE_PROJECT_NAME="dive-spoke-${code_lower}"
        cd "$spoke_dir"
        docker compose restart
        log_success "Services restarted with new certificates"
    else
        log_warn "No docker-compose.yml found - services not restarted"
    fi

    echo ""
    log_success "Certificate rotation complete!"
    echo ""
    echo -e "${YELLOW}Note:${NC} Old certificates backed up in: $backup_dir"
    echo "      Keep backup until new certificates are verified working."
    echo ""
}

# =============================================================================
# HOSTNAME FIXES (DELEGATED TO EXISTING MODULE)
# =============================================================================

spoke_fix_keycloak_hostname() {
    # This function is implemented in spoke-fix-hostname.sh
    # Delegate to the existing module
    source "${DIVE_ROOT}/scripts/dive-modules/spoke/spoke-fix-hostname.sh"
    spoke_fix_keycloak_hostname "$@"
}

spoke_fix_all_hostnames() {
    # This function is implemented in spoke-fix-hostname.sh
    # Delegate to the existing module
    source "${DIVE_ROOT}/scripts/dive-modules/spoke/spoke-fix-hostname.sh"
    spoke_fix_all_hostnames "$@"
}

# =============================================================================
# FAILOVER MANAGEMENT (DELEGATED TO EXISTING MODULE)
# =============================================================================

spoke_failover() {
    # This function is implemented in spoke-failover.sh
    # Delegate to the existing module
    source "${DIVE_ROOT}/scripts/dive-modules/spoke/spoke-failover.sh"
    spoke_failover "$@"
}

# =============================================================================
# MAINTENANCE MODE (Delegated to spoke-failover.sh)
# =============================================================================
# spoke_maintenance() is defined in spoke-failover.sh with full implementation
# It is loaded on-demand via the spoke_failover() delegation above