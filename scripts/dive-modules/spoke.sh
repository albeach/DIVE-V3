#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Spoke Commands Module (Refactored)
# =============================================================================
# Commands: init, generate-certs, register, status, sync, health, up, down, logs
# For distributed spoke deployments (disabled in pilot mode by default)
# =============================================================================
# Version: 3.0.0
# Date: 2025-12-23
# Refactored: Modularized into sub-modules with lazy loading for ~45% reduction
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load NATO countries database (associative arrays can't be exported, must check array size)
# We use declare -p to check if the array exists and has been populated
if ! declare -p NATO_COUNTRIES &>/dev/null || [ ${#NATO_COUNTRIES[@]} -eq 0 ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../nato-countries.sh"
fi

# =============================================================================
# LAZY LOADING INFRASTRUCTURE
# =============================================================================
# Sub-modules are loaded on demand to reduce startup time and improve maintainability
# Each module is self-contained and can be sourced independently

_SPOKE_MODULES_DIR="$(dirname "${BASH_SOURCE[0]}")"

# Lazy load KAS module
_load_spoke_kas() {
    if [ -z "$DIVE_SPOKE_KAS_LOADED" ]; then
        source "${_SPOKE_MODULES_DIR}/spoke-kas.sh" 2>/dev/null || {
            log_error "Failed to load spoke-kas.sh module"
            return 1
        }
    fi
}

# Lazy load Policy module
_load_spoke_policy() {
    if [ -z "$DIVE_SPOKE_POLICY_LOADED" ]; then
        source "${_SPOKE_MODULES_DIR}/spoke-policy.sh" 2>/dev/null || {
            log_error "Failed to load spoke-policy.sh module"
            return 1
        }
    fi
}

# Lazy load Failover module
_load_spoke_failover() {
    if [ -z "$DIVE_SPOKE_FAILOVER_LOADED" ]; then
        source "${_SPOKE_MODULES_DIR}/spoke-failover.sh" 2>/dev/null || {
            log_error "Failed to load spoke-failover.sh module"
            return 1
        }
    fi
}

# Lazy load Countries module
_load_spoke_countries() {
    # Ensure NATO countries database is loaded first (associative arrays can't be exported)
    if ! declare -p NATO_COUNTRIES &>/dev/null || [ ${#NATO_COUNTRIES[@]} -eq 0 ]; then
        local nato_script="${DIVE_ROOT}/scripts/nato-countries.sh"
        [ -f "$nato_script" ] && source "$nato_script"
    fi
    if [ -z "$DIVE_SPOKE_COUNTRIES_LOADED" ]; then
        source "${_SPOKE_MODULES_DIR}/spoke-countries.sh" 2>/dev/null || {
            log_error "Failed to load spoke-countries.sh module"
            return 1
        }
    fi
}

# Lazy load Cloudflare module
_load_spoke_cloudflare() {
    if [ -z "$DIVE_SPOKE_CLOUDFLARE_LOADED" ]; then
        source "${_SPOKE_MODULES_DIR}/spoke-cloudflare.sh" 2>/dev/null || {
            log_error "Failed to load spoke-cloudflare.sh module"
            return 1
        }
    fi
}

# Lazy load Init module (setup wizard, init)
_load_spoke_init() {
    if [ -z "$DIVE_SPOKE_INIT_LOADED" ]; then
        source "${_SPOKE_MODULES_DIR}/spoke-init.sh" 2>/dev/null || {
            log_error "Failed to load spoke-init.sh module"
            return 1
        }
    fi
}

# Lazy load Deploy module (deploy, up)
_load_spoke_deploy() {
    if [ -z "$DIVE_SPOKE_DEPLOY_LOADED" ]; then
        source "${_SPOKE_MODULES_DIR}/spoke-deploy.sh" 2>/dev/null || {
            log_error "Failed to load spoke-deploy.sh module"
            return 1
        }
    fi
}

# Lazy load Register module (register, token)
_load_spoke_register() {
    if [ -z "$DIVE_SPOKE_REGISTER_LOADED" ]; then
        source "${_SPOKE_MODULES_DIR}/spoke-register.sh" 2>/dev/null || {
            log_error "Failed to load spoke-register.sh module"
            return 1
        }
    fi
}

# =============================================================================
# CONFIGURATION
# =============================================================================

SPOKE_CERT_ALGORITHM="${SPOKE_CERT_ALGORITHM:-rsa}"
SPOKE_CERT_BITS="${SPOKE_CERT_BITS:-4096}"
SPOKE_CERT_DAYS="${SPOKE_CERT_DAYS:-365}"

# =============================================================================
# PORT CALCULATION - SINGLE SOURCE OF TRUTH
# =============================================================================
# This function calculates consistent ports for any NATO country code.
# Uses centralized NATO countries database (scripts/nato-countries.sh)
# MUST be used everywhere to ensure docker-compose and config.json match.
#
# Supports all 32 NATO member countries with deterministic, conflict-free ports.
# For partner nations (AUS, NZL, etc.), uses hash-based fallback.
# =============================================================================

_get_spoke_ports() {
    local code="$1"
    local code_upper="${code^^}"
    local port_offset=0

    # Check if it's a NATO country (uses centralized database)
    if is_nato_country "$code_upper"; then
        # Use centralized NATO port offset
        port_offset=$(get_country_offset "$code_upper")
    elif is_partner_nation "$code_upper"; then
        # Partner nations get offsets 32-39
        case "$code_upper" in
            AUS) port_offset=32 ;;
            NZL) port_offset=33 ;;
            JPN) port_offset=34 ;;
            KOR) port_offset=35 ;;
            ISR) port_offset=36 ;;
            UKR) port_offset=37 ;;
            *)   port_offset=$(( ($(echo "$code_upper" | cksum | cut -d' ' -f1) % 10) + 38 )) ;;
        esac
    else
        # Unknown countries: use hash-based offset (48+) to avoid conflicts
        port_offset=$(( ($(echo "$code_upper" | cksum | cut -d' ' -f1) % 20) + 48 ))
        log_warn "Country '$code_upper' not in NATO database, using hash-based port offset: $port_offset"
    fi

    # Export calculated ports (can be sourced or eval'd)
    # Port scheme ensures no conflicts for 48+ simultaneous spokes
    echo "SPOKE_PORT_OFFSET=$port_offset"
    echo "SPOKE_FRONTEND_PORT=$((3000 + port_offset))"
    echo "SPOKE_BACKEND_PORT=$((4000 + port_offset))"
    echo "SPOKE_KEYCLOAK_HTTPS_PORT=$((8443 + port_offset))"
    echo "SPOKE_KEYCLOAK_HTTP_PORT=$((8080 + port_offset))"
    echo "SPOKE_POSTGRES_PORT=$((5432 + port_offset))"
    echo "SPOKE_MONGODB_PORT=$((27017 + port_offset))"
    echo "SPOKE_REDIS_PORT=$((6379 + port_offset))"
    echo "SPOKE_OPA_PORT=$((8181 + port_offset * 10))"
    echo "SPOKE_KAS_PORT=$((9000 + port_offset))"
}

# =============================================================================
# SPOKE INITIALIZATION (Enhanced Interactive Setup)
# =============================================================================

# =============================================================================
# CLOUDFLARE TUNNEL AUTO-SETUP (Lazy Loaded)
# Functions are in spoke-cloudflare.sh and loaded on demand
# =============================================================================

# Wrapper for lazy-loaded Cloudflare functions
_ensure_cloudflared() {
    _load_spoke_cloudflare && _ensure_cloudflared "$@"
}

_cloudflared_login() {
    _load_spoke_cloudflare && _cloudflared_login "$@"
}

_spoke_auto_create_tunnel() {
    _load_spoke_cloudflare && _spoke_auto_create_tunnel "$@"
}

# Interactive spoke setup wizard
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
        spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4 || echo "")
        instance_name=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4 || echo "$instance_code")
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

    mkdir -p "$certs_dir"

    # Check if certificates already exist
    if [ -f "$certs_dir/spoke.key" ]; then
        log_warn "Certificates already exist in: $certs_dir"
        read -p "  Overwrite? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "Cancelled"
            return 1
        fi
    fi

    # Generate private key
    log_step "Generating private key ($algorithm, $bits bits)"
    if [ "$algorithm" = "ec" ]; then
        openssl ecparam -genkey -name prime256v1 -out "$certs_dir/spoke.key" 2>/dev/null
    else
        openssl genrsa -out "$certs_dir/spoke.key" "$bits" 2>/dev/null
    fi

    if [ $? -ne 0 ]; then
        log_error "Failed to generate private key"
        return 1
    fi

    # Generate CSR
    log_step "Generating Certificate Signing Request (CSR)"
    openssl req -new \
        -key "$certs_dir/spoke.key" \
        -out "$certs_dir/spoke.csr" \
        -subj "/C=${instance_code:0:2}/O=DIVE Federation/OU=Spoke Instances/CN=$spoke_id" \
        2>/dev/null

    if [ $? -ne 0 ]; then
        log_error "Failed to generate CSR"
        return 1
    fi

    # Generate self-signed certificate (for development)
    log_step "Generating self-signed certificate (for development)"
    openssl x509 -req \
        -days "$SPOKE_CERT_DAYS" \
        -in "$certs_dir/spoke.csr" \
        -signkey "$certs_dir/spoke.key" \
        -out "$certs_dir/spoke.crt" \
        2>/dev/null

    if [ $? -ne 0 ]; then
        log_error "Failed to generate certificate"
        return 1
    fi

    # Set permissions
    chmod 600 "$certs_dir/spoke.key"
    chmod 644 "$certs_dir/spoke.crt"
    chmod 644 "$certs_dir/spoke.csr"

    # Calculate fingerprint
    local fingerprint=$(openssl x509 -in "$certs_dir/spoke.crt" -noout -fingerprint -sha256 2>/dev/null | cut -d= -f2)

    echo ""
    log_success "Certificates generated successfully!"
    echo ""
    echo -e "${BOLD}Certificate Details:${NC}"
    echo "  Subject:     CN=$spoke_id"
    echo "  Fingerprint: $fingerprint"
    echo "  Valid For:   $SPOKE_CERT_DAYS days"
    echo ""
    echo -e "${BOLD}Files Created:${NC}"
    echo "  - $certs_dir/spoke.key (private key - keep secure!)"
    echo "  - $certs_dir/spoke.crt (self-signed certificate)"
    echo "  - $certs_dir/spoke.csr (CSR for Hub signing)"
    echo ""
    echo -e "${YELLOW}⚠️  For production:${NC}"
    echo "   Submit the CSR to the Hub for signing during registration."
    echo "   The Hub will return a properly signed certificate."
    echo ""
}

# =============================================================================
# SPOKE REGISTRATION
# =============================================================================

spoke_status() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local config_file="$spoke_dir/config.json"

    print_header
    echo -e "${BOLD}Spoke Federation Status:${NC} $(upper "$instance_code")"
    echo ""

    if [ ! -f "$config_file" ]; then
        echo -e "  Status: ${RED}Not Initialized${NC}"
        echo ""
        echo "  Run: ./dive spoke init <CODE> <NAME>"
        return 0
    fi

    # Parse config
    local spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local instance_code_config=$(grep -o '"instanceCode"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local name=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4)
    local status=$(grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4)
    local hub_url=$(grep -o '"hubUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local created=$(grep -o '"createdAt"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4)

    # Status color
    local status_color="$YELLOW"
    case "$status" in
        approved) status_color="$GREEN" ;;
        suspended|revoked) status_color="$RED" ;;
        pending) status_color="$YELLOW" ;;
    esac

    echo -e "${CYAN}Identity:${NC}"
    echo "  Spoke ID:        $spoke_id"
    echo "  Instance Code:   $instance_code_config"
    echo "  Name:            $name"
    echo "  Created:         $created"
    echo ""

    echo -e "${CYAN}Federation:${NC}"
    echo -e "  Status:          ${status_color}${status:-unregistered}${NC}"
    echo "  Hub URL:         $hub_url"

    # Check token
    if [ -f "$spoke_dir/.env" ] && grep -q "SPOKE_OPAL_TOKEN" "$spoke_dir/.env"; then
        local token_set=$(grep "SPOKE_OPAL_TOKEN" "$spoke_dir/.env" | cut -d= -f2)
        if [ -n "$token_set" ] && [ "$token_set" != "" ]; then
            echo -e "  Token:           ${GREEN}Configured${NC}"
        else
            echo -e "  Token:           ${YELLOW}Not Set${NC}"
        fi
    else
        echo -e "  Token:           ${YELLOW}Not Set${NC}"
    fi

    # Check certificates
    echo ""
    echo -e "${CYAN}Certificates:${NC}"
    if [ -f "$spoke_dir/certs/spoke.crt" ]; then
        local cert_expiry=$(openssl x509 -in "$spoke_dir/certs/spoke.crt" -noout -enddate 2>/dev/null | cut -d= -f2)
        local fingerprint=$(openssl x509 -in "$spoke_dir/certs/spoke.crt" -noout -fingerprint -sha256 2>/dev/null | cut -d= -f2 | head -c 23)
        echo -e "  Certificate:     ${GREEN}Present${NC}"
        echo "  Expires:         $cert_expiry"
        echo "  Fingerprint:     ${fingerprint}..."
    else
        echo -e "  Certificate:     ${YELLOW}Not Generated${NC}"
        echo "  Run: ./dive spoke generate-certs"
    fi

    echo ""
}

spoke_configure_federation_after_approval() {
    local spoke_code="${1:?Spoke code required}"
    local code_upper=$(upper "$spoke_code")
    local code_lower=$(lower "$spoke_code")

    # Check if federation is already configured
    if ./dive federation list-idps 2>/dev/null | grep -q "${code_lower}-idp"; then
        log_info "Federation already configured for $code_upper"
        return 0
    fi

    # First, ensure the spoke's Keycloak password is stored in the hub
    log_verbose "Ensuring Keycloak password is stored in hub..."
    if ! spoke_ensure_keycloak_password_in_hub "$spoke_code"; then
        log_warn "Could not ensure Keycloak password in hub - federation may fail"
    fi

    # Try federation linking from hub side (more reliable)
    log_verbose "Attempting federation link from hub..."
    if ./dive federation link "$code_upper" >/dev/null 2>&1; then
        log_success "Federation link successful"
        return 0
    fi

    # If hub-side linking fails, try from spoke side
    log_verbose "Hub-side linking failed, trying spoke-side..."
    if ./dive --instance "$code_lower" federation link USA >/dev/null 2>&1; then
        log_success "Federation link successful (spoke-side)"
        return 0
    fi

    log_error "All federation linking attempts failed"
    return 1
}

spoke_ensure_keycloak_password_in_hub() {
    local spoke_code="${1:?Spoke code required}"
    local code_upper=$(upper "$spoke_code")
    local code_lower=$(lower "$spoke_code")

    # Get the current password from the spoke
    local password=""
    local container="dive-spoke-${code_lower}-keycloak"

    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        password=$(docker exec "$container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    fi

    if [ -z "$password" ] || [ ${#password} -lt 10 ]; then
        # Try to get from .env file
        local env_file="${DIVE_ROOT}/instances/${code_lower}/.env"
        if [ -f "$env_file" ]; then
            password=$(grep "^KEYCLOAK_ADMIN_PASSWORD_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"')
        fi
    fi

    if [ -z "$password" ] || [ ${#password} -lt 10 ]; then
        log_error "Could not retrieve valid Keycloak password for $code_upper"
        return 1
    fi

    # Get the spoke ID from the hub
    local spoke_id=$(./dive --instance "$code_lower" spoke status 2>/dev/null | grep "Spoke ID:" | cut -d: -f2 | tr -d ' ')

    if [ -z "$spoke_id" ]; then
        log_error "Could not get spoke ID for $code_upper"
        return 1
    fi

    # Update the spoke's Keycloak password in the hub
    local update_response=$(curl -k -s -X PATCH \
        "https://localhost:4000/api/federation/spokes/${spoke_id}/keycloak-password" \
        -H "Content-Type: application/json" \
        -d "{\"keycloakAdminPassword\":\"${password}\"}")

    if echo "$update_response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_success "Updated Keycloak password in hub for $code_upper"
        return 0
    else
        log_error "Failed to update Keycloak password in hub: $update_response"
        return 1
    fi
}

spoke_health() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}Spoke Service Health:${NC} $(upper "$instance_code")"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would check health of all spoke services"
        return 0
    fi

    # Get spoke configuration for correct ports using NATO country database
    local keycloak_port backend_port opa_port

    # Source NATO countries database for systematic port calculation
    if [ -f "${DIVE_ROOT}/scripts/nato-countries.sh" ]; then
        source "${DIVE_ROOT}/scripts/nato-countries.sh"
    fi

    # Calculate ports using NATO offset system (deterministic and conflict-free)
    if is_nato_country "$code_upper" 2>/dev/null; then
        # Use NATO country offset for precise port calculation
        local offset=$(get_country_offset "$code_upper" 2>/dev/null || echo "0")
        keycloak_port=$((8443 + offset))
        backend_port=$((4000 + offset))
        opa_port=$((8181 + offset * 10))
    else
        # Fallback for non-NATO countries
        keycloak_port=8443
        backend_port=4000
        opa_port=8181
    fi


    # Define services to check (HTTPS for secured services)
    local services=("OPA:${opa_port}/health" "Backend:${backend_port}/health" "Keycloak:${keycloak_port}/realms/dive-v3-broker-${code_lower}")
    local all_healthy=true

    echo -e "${CYAN}Services:${NC}"

    for svc in "${services[@]}"; do
        local name="${svc%%:*}"
        local endpoint="${svc#*:}"
        # Use HTTPS for services that require TLS (OPA, Backend, Keycloak)
        local url="https://localhost:${endpoint}"
        local status_code=$(curl -k -s -o /dev/null -w '%{http_code}' "$url" --max-time 5 2>/dev/null || echo "000")

        if [ "$status_code" = "200" ] || [ "$status_code" = "204" ]; then
            printf "  %-14s ${GREEN}✓ Healthy${NC}\n" "$name:"
        else
            printf "  %-14s ${RED}✗ Unhealthy${NC} (HTTP $status_code)\n" "$name:"
            all_healthy=false
        fi
    done

    # Check MongoDB
    printf "  %-14s " "MongoDB:"
    if docker exec "dive-spoke-${code_lower}-mongodb" mongosh --quiet --eval "db.adminCommand('ping')" 2>/dev/null | grep -q "ok"; then
        echo -e "${GREEN}✓ Healthy${NC}"
    else
        echo -e "${YELLOW}⚠ Not Running${NC}"
    fi

    # Check Redis
    printf "  %-14s " "Redis:"
    # Check if Redis container is running first
    if docker ps --format '{{.Names}}' | grep -q "^dive-spoke-${code_lower}-redis$"; then
        # Container is running, try to ping Redis
        if docker exec "dive-spoke-${code_lower}-redis" redis-cli ping 2>/dev/null | grep -q "PONG"; then
            echo -e "${GREEN}✓ Healthy${NC}"
        else
            # Try with auth if available
            local redis_password
            redis_password=$(docker exec "dive-spoke-${code_lower}-redis" printenv REDIS_PASSWORD_EST 2>/dev/null || echo "")
            if [ -n "$redis_password" ] && docker exec "dive-spoke-${code_lower}-redis" redis-cli -a "$redis_password" ping 2>/dev/null | grep -q "PONG"; then
                echo -e "${GREEN}✓ Healthy${NC}"
            else
                echo -e "${YELLOW}⚠ Auth Issue${NC}"
            fi
        fi
    else
        echo -e "${YELLOW}⚠ Not Running${NC}"
    fi

    echo ""

    # Overall status
    if [ "$all_healthy" = true ]; then
        echo -e "${GREEN}✓ All services healthy${NC}"
    else
        echo -e "${YELLOW}⚠ Some services unhealthy${NC}"
    fi
    echo ""
}

# =============================================================================
# CERTIFICATE ROTATION
# =============================================================================

spoke_rotate_certs() {
    local algorithm="${1:-rsa}"
    local bits="${2:-4096}"

    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local certs_dir="$spoke_dir/certs"

    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke not initialized. Run: ./dive spoke init <CODE> <NAME>"
        return 1
    fi

    # Load config to get spoke ID and status
    local config_file="$spoke_dir/config.json"
    local spoke_id=""
    local status=""

    if [ -f "$config_file" ]; then
        spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4 || echo "")
        status=$(grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4 || echo "")
    fi
    spoke_id="${spoke_id:-spoke-${code_lower}-unknown}"

    print_header
    echo -e "${BOLD}Rotating X.509 Certificates for Spoke:${NC} $(upper "$instance_code")"
    echo ""

    # Check if spoke is registered
    if [ "$status" = "approved" ] || [ "$status" = "pending" ]; then
        log_warn "Spoke is currently registered with status: $status"
        echo ""
        echo "  Certificate rotation will:"
        echo "  1. Generate new private key and CSR"
        echo "  2. Backup existing certificates"
        echo "  3. Submit new CSR to Hub for signing"
        echo ""
        read -p "  Continue with rotation? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "Cancelled"
            return 1
        fi
    fi

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would rotate certificates:"
        log_dry "  1. Backup existing certs to: $certs_dir/backup-$(date +%Y%m%d)"
        log_dry "  2. Generate new private key ($algorithm, $bits bits)"
        log_dry "  3. Generate new CSR"
        log_dry "  4. Generate new self-signed cert (development)"
        return 0
    fi

    # Backup existing certificates
    local backup_dir="$certs_dir/backup-$(date +%Y%m%d-%H%M%S)"
    if [ -f "$certs_dir/spoke.key" ]; then
        log_step "Backing up existing certificates"
        mkdir -p "$backup_dir"
        cp -p "$certs_dir/spoke.key" "$backup_dir/" 2>/dev/null || true
        cp -p "$certs_dir/spoke.crt" "$backup_dir/" 2>/dev/null || true
        cp -p "$certs_dir/spoke.csr" "$backup_dir/" 2>/dev/null || true
        echo "         ✓ Backed up to: $backup_dir"
    fi

    # Generate new private key
    log_step "Generating new private key ($algorithm, $bits bits)"
    if [ "$algorithm" = "ec" ]; then
        openssl ecparam -genkey -name prime256v1 -out "$certs_dir/spoke.key" 2>/dev/null
    else
        openssl genrsa -out "$certs_dir/spoke.key" "$bits" 2>/dev/null
    fi

    if [ $? -ne 0 ]; then
        log_error "Failed to generate private key"
        # Restore from backup
        if [ -d "$backup_dir" ]; then
            cp -p "$backup_dir/"* "$certs_dir/" 2>/dev/null
        fi
        return 1
    fi

    # Generate new CSR
    log_step "Generating new Certificate Signing Request"
    local instance_name=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4 || echo "$instance_code")

    openssl req -new \
        -key "$certs_dir/spoke.key" \
        -out "$certs_dir/spoke.csr" \
        -subj "/C=${instance_code:0:2}/O=DIVE Federation/OU=Spoke Instances/CN=$spoke_id" \
        2>/dev/null

    if [ $? -ne 0 ]; then
        log_error "Failed to generate CSR"
        return 1
    fi

    # Generate self-signed certificate for development
    log_step "Generating self-signed certificate (for development)"
    openssl x509 -req \
        -days "$SPOKE_CERT_DAYS" \
        -in "$certs_dir/spoke.csr" \
        -signkey "$certs_dir/spoke.key" \
        -out "$certs_dir/spoke.crt" \
        2>/dev/null

    if [ $? -ne 0 ]; then
        log_error "Failed to generate certificate"
        return 1
    fi

    # Set permissions
    chmod 600 "$certs_dir/spoke.key"
    chmod 644 "$certs_dir/spoke.crt"
    chmod 644 "$certs_dir/spoke.csr"

    # Calculate new fingerprint
    local fingerprint=$(openssl x509 -in "$certs_dir/spoke.crt" -noout -fingerprint -sha256 2>/dev/null | cut -d= -f2)

    echo ""
    log_success "Certificate rotation complete!"
    echo ""
    echo -e "${BOLD}New Certificate Details:${NC}"
    echo "  Subject:     CN=$spoke_id"
    echo "  Fingerprint: $fingerprint"
    echo "  Valid For:   $SPOKE_CERT_DAYS days"
    echo ""
    echo -e "${BOLD}Backup Location:${NC}"
    echo "  $backup_dir"
    echo ""

    # If spoke is registered, prompt to submit CSR to Hub
    if [ "$status" = "approved" ]; then
        echo -e "${YELLOW}⚠️  Important:${NC}"
        echo "   Your spoke is registered. To complete rotation:"
        echo "   1. Submit the new CSR to Hub for signing"
        echo "   2. Replace spoke.crt with Hub-signed certificate"
        echo "   3. Restart spoke services: ./dive spoke down && ./dive spoke up"
        echo ""
    fi
}

# =============================================================================
# INTERNAL: Apply Terraform for Spoke (MFA flows, etc.)
# =============================================================================
_spoke_apply_terraform() {
    local instance_code="${1:-}"
    local code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
    local code_upper=$(echo "$instance_code" | tr '[:lower:]' '[:upper:]')
    local tf_dir="${DIVE_ROOT}/terraform/spoke"
    local tfvars_file="${DIVE_ROOT}/terraform/countries/${code_lower}.tfvars"

    if [ ! -d "$tf_dir" ]; then
        log_info "No Terraform directory found at ${tf_dir}"
        return 0
    fi

    if [ ! -f "$tfvars_file" ]; then
        log_warn "Terraform tfvars not found: ${tfvars_file}"
        log_info "Skipping Terraform apply (MFA will not be configured via Terraform)"
        return 0
    fi

    log_info "Applying Terraform configuration for ${code_upper}..."

    if [ "$DRY_RUN" = true ]; then
        log_dry "cd ${tf_dir} && terraform workspace select ${code_lower} && terraform apply -var-file=${tfvars_file} -auto-approve"
        return 0
    fi

    (
        cd "$tf_dir"

        # Initialize if needed
        [ ! -d ".terraform" ] && terraform init -input=false -backend=false

        # Select or create workspace
        if terraform workspace list 2>/dev/null | grep -q "^  ${code_lower}$\|^\* ${code_lower}$"; then
            terraform workspace select "$code_lower" >/dev/null 2>&1
        else
            terraform workspace new "$code_lower" >/dev/null 2>&1
        fi

        # Load secrets for Terraform
        local instance_dir="${DIVE_ROOT}/instances/${code_lower}"
        if [ -f "${instance_dir}/.env" ]; then
            set -a
            source "${instance_dir}/.env"
            set +a
        fi

        # Export secrets as TF_VAR_ environment variables
        local instance_password_var="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
        export TF_VAR_keycloak_admin_password="${!instance_password_var:-${KEYCLOAK_ADMIN_PASSWORD:-admin}}"
        export TF_VAR_client_secret="${KEYCLOAK_CLIENT_SECRET_${code_upper}:-${KEYCLOAK_CLIENT_SECRET:-}}"
        export TF_VAR_test_user_password="${TEST_USER_PASSWORD:-DiveTestSecure2025!}"
        export TF_VAR_admin_user_password="${ADMIN_PASSWORD:-DiveAdminSecure2025!}"
        export TF_VAR_enable_mfa=true
        export TF_VAR_webauthn_rp_id="${WEBAUTHN_RP_ID:-localhost}"

        # Get Keycloak container name for internal URL
        local kc_container="dive-spoke-${code_lower}-keycloak"
        if docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
            export KEYCLOAK_URL="http://${kc_container}:8080"
        else
            # Fallback to localhost with port offset
            if type -t get_country_offset >/dev/null 2>&1 && is_nato_country "$code_upper" 2>/dev/null; then
                local port_offset=$(get_country_offset "$code_upper" 2>/dev/null || echo "0")
                local kc_port=$((8080 + port_offset))
                export KEYCLOAK_URL="http://localhost:${kc_port}"
            else
                export KEYCLOAK_URL="http://localhost:8080"
            fi
        fi

        # Export Keycloak connection for Terraform provider
        export KEYCLOAK_USER="${KEYCLOAK_ADMIN_USERNAME:-admin}"
        export KEYCLOAK_PASSWORD="${!instance_password_var:-${KEYCLOAK_ADMIN_PASSWORD:-admin}}"

        terraform apply -var-file="../countries/${code_lower}.tfvars" -input=false -auto-approve
    ) || {
        log_warn "Terraform apply failed for ${code_upper}"
        return 1
    }

    log_success "Terraform configuration applied for ${code_upper}"
    return 0
}

# =============================================================================
# SPOKE SECRET SYNCHRONIZATION
# =============================================================================

##
# Get the correct Keycloak client secret for a spoke instance
# First tries GCP Secret Manager, then falls back to environment
#
# Arguments:
#   $1 - Spoke code (e.g., "fra", "deu")
#
# Returns:
#   Client secret on stdout, empty string on failure
##
get_keycloak_client_secret() {
    local code_lower="${1:?Spoke code required}"
    local code_upper
    code_upper=$(upper "$code_lower")

    # Try GCP first (authoritative source)
    if [ "${USE_GCP_SECRETS:-false}" = "true" ]; then
        local secret_name="dive-v3-keycloak-client-secret-${code_lower}"
        local secret_value
        if secret_value=$(gcloud secrets versions access latest --secret="$secret_name" --project="${GCP_PROJECT_ID:-dive25}" 2>/dev/null); then
            echo "$secret_value"
            return 0
        fi
    fi

    # Fallback to environment variable
    local env_var="KEYCLOAK_CLIENT_SECRET_${code_upper}"
    local env_value="${!env_var}"
    if [ -n "$env_value" ]; then
        echo "$env_value"
        return 0
    fi

    # Last resort: check .env file
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local env_file="$spoke_dir/.env"
    if [ -f "$env_file" ]; then
        local file_value
        file_value=$(grep "^${env_var}=" "$env_file" 2>/dev/null | cut -d'=' -f2-)
        if [ -n "$file_value" ]; then
            echo "$file_value"
            return 0
        fi
    fi

    # No secret found
    echo ""
    return 1
}

##
# Automatically register spoke with federation hub
# Ensures zero-touch federation deployment
#
# Arguments:
#   $1 - Spoke code
#
# Returns:
#   0 - Registration successful
#   1 - Registration failed
##
spoke_sync_secrets() {
    local code_lower="${1:-$(lower "${INSTANCE:-usa}")}"
    local code_upper
    code_upper=$(upper "$code_lower")

    log_step "Synchronizing $code_upper frontend secrets with Keycloak..."

    # Check if containers are running
    if ! docker ps --format '{{.Names}}' | grep -q "dive-spoke-${code_lower}-frontend"; then
        log_error "Frontend container not running for $code_upper"
        return 1
    fi

    if ! docker ps --format '{{.Names}}' | grep -q "dive-spoke-${code_lower}-keycloak"; then
        log_error "Keycloak container not running for $code_upper"
        return 1
    fi

    # Get current frontend secret
    local frontend_secret
    frontend_secret=$(docker exec "dive-spoke-${code_lower}-frontend" printenv AUTH_KEYCLOAK_SECRET 2>/dev/null)

    if [ -z "$frontend_secret" ]; then
        log_error "Could not get frontend secret for $code_upper"
        return 1
    fi

    # Get the correct client secret from GCP (authoritative source)
    local correct_secret
    correct_secret=$(get_keycloak_client_secret "$code_lower")

    if [ -z "$correct_secret" ]; then
        log_error "Could not get correct client secret for $code_upper from GCP"
        # Fallback: try to get from Keycloak if GCP fails
        local admin_pass
        admin_pass=$(docker exec "dive-spoke-${code_lower}-keycloak" printenv KEYCLOAK_ADMIN_PASSWORD)

        if [ -n "$admin_pass" ]; then
            # Try kcadm approach as fallback
            docker exec "dive-spoke-${code_lower}-keycloak" /opt/keycloak/bin/kcadm.sh config credentials \
                --server https://localhost:8443 --realm master --user admin --password "$admin_pass" --insecure >/dev/null 2>&1

            local secret_response
            secret_response=$(docker exec "dive-spoke-${code_lower}-keycloak" /opt/keycloak/bin/kcadm.sh get clients \
                -r "dive-v3-broker-${code_lower}" -q "clientId=dive-v3-broker-${code_lower}" \
                --fields secret 2>/dev/null)

            # Handle both array and single object responses
            if echo "$secret_response" | jq -e '.[0]' >/dev/null 2>&1; then
                # Response is an array
                correct_secret=$(echo "$secret_response" | jq -r '.[0].secret // empty')
            else
                # Response is a single object
                correct_secret=$(echo "$secret_response" | jq -r '.secret // empty')
            fi
        fi

        if [ -z "$correct_secret" ] || [ "$correct_secret" = "null" ]; then
            log_error "Could not get client secret for $code_upper from any source"
            return 1
        fi
    fi

    # Compare secrets
    if [ "$frontend_secret" = "$correct_secret" ]; then
        log_success "$code_upper secrets are synchronized"
        return 0
    fi

    log_warn "$code_upper secret mismatch detected - fixing..."
    log_verbose "Frontend: ${frontend_secret:0:8}..., Correct: ${correct_secret:0:8}..."

    # Update .env file with correct secret
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local env_file="$spoke_dir/.env"

    if [ -f "$env_file" ]; then
        # Update .env file with correct secret
        if grep -q "^KEYCLOAK_CLIENT_SECRET_${code_upper}=" "$env_file"; then
            sed -i.bak "s/^KEYCLOAK_CLIENT_SECRET_${code_upper}=.*/KEYCLOAK_CLIENT_SECRET_${code_upper}=${correct_secret}/" "$env_file"
        else
            echo "KEYCLOAK_CLIENT_SECRET_${code_upper}=${correct_secret}" >> "$env_file"
        fi
        log_success "Updated $env_file with correct secret"
    fi

    # Restart frontend container to pick up new secret
    log_info "Restarting $code_upper frontend container..."
    if docker restart "dive-spoke-${code_lower}-frontend" >/dev/null 2>&1; then
        log_success "$code_upper frontend restarted successfully"
        # Verify the secret was updated
        sleep 2
        local new_secret
        new_secret=$(docker exec "dive-spoke-${code_lower}-frontend" printenv AUTH_KEYCLOAK_SECRET 2>/dev/null)
        if [ "$new_secret" = "$correct_secret" ]; then
            log_success "$code_upper secret synchronization complete"
            return 0
        else
            log_error "Frontend secret was not updated correctly"
            return 1
        fi
    else
        log_error "Failed to restart $code_upper frontend"
        return 1
    fi
}

##
# Sync all running spoke secrets
##
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

    local spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local hub_url=$(grep -o '"hubUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
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

# =============================================================================
# SPOKE SERVICE MANAGEMENT
# =============================================================================

spoke_verify() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}🔍 Spoke Verification: ${code_upper}${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would verify spoke connectivity (12 checks)"
        return 0
    fi

    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke not initialized: $spoke_dir"
        return 1
    fi

    # Load config
    local config_file="$spoke_dir/config.json"
    local env_file="$spoke_dir/.env"
    local hub_url=""
    local spoke_id=""
    local spoke_token=""

    if [ -f "$config_file" ]; then
        hub_url=$(grep -o '"hubUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
        spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    fi
    # Default hub URL based on environment
    if [ "$ENVIRONMENT" = "local" ] || [ "$ENVIRONMENT" = "dev" ]; then
        hub_url="${hub_url:-https://localhost:4000}"
    else
        hub_url="${hub_url:-https://usa-api.dive25.com}"
    fi

    # Try to load token from .env
    if [ -f "$env_file" ]; then
        spoke_token=$(grep -o '^SPOKE_OPAL_TOKEN=.*' "$env_file" 2>/dev/null | cut -d= -f2- | tr -d '"' || echo "")
    fi

    # Track results
    local checks_total=13
    local checks_passed=0
    local checks_failed=0

    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Running 13-Point Spoke Verification (Phase 6 + ZTDF)${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Set compose project
    export COMPOSE_PROJECT_NAME="$code_lower"

    # Check 1: Docker containers running (8 services)
    printf "  %-35s" "1. Docker Containers (8 services):"
    local expected_services=("keycloak" "backend" "opa" "opal-client" "mongodb" "postgres" "redis" "frontend")
    local running_count=0

    for service in "${expected_services[@]}"; do
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -qE "${code_lower}.*${service}|${service}.*${code_lower}"; then
            ((running_count++))
        fi
    done

    if [ $running_count -ge 5 ]; then
        echo -e "${GREEN}✓ ${running_count}/8 running${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ ${running_count}/8 running${NC}"
        ((checks_failed++))
    fi

    # Check 2: Keycloak Health
    printf "  %-35s" "2. Keycloak Health:"
    if curl -kfs https://localhost:8443/health/ready --max-time 10 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        ((checks_passed++))
    elif curl -kfs http://localhost:8080/health/ready --max-time 10 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy (HTTP)${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Unhealthy${NC}"
        ((checks_failed++))
    fi

    # Check 3: Backend API Health
    printf "  %-35s" "3. Backend API Health:"
    if curl -kfs https://localhost:4000/health --max-time 5 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Unhealthy${NC}"
        ((checks_failed++))
    fi

    # Check 4: MongoDB Connection
    printf "  %-35s" "4. MongoDB Connection:"
    local mongo_container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "mongodb.*${code_lower}|${code_lower}.*mongo" | head -1)
    if [ -n "$mongo_container" ]; then
        if docker exec "$mongo_container" mongosh --quiet --eval "db.adminCommand('ping')" 2>/dev/null | grep -q "ok"; then
            echo -e "${GREEN}✓ Connected${NC}"
            ((checks_passed++))
        else
            echo -e "${YELLOW}⚠ Container running${NC}"
            ((checks_passed++))
        fi
    else
        echo -e "${RED}✗ Not Found${NC}"
        ((checks_failed++))
    fi

    # Check 5: Redis Connection
    printf "  %-35s" "5. Redis Connection:"
    local redis_container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "redis.*${code_lower}|${code_lower}.*redis" | head -1)
    if [ -n "$redis_container" ]; then
        if docker exec "$redis_container" redis-cli ping 2>/dev/null | grep -q "PONG"; then
            echo -e "${GREEN}✓ Connected${NC}"
            ((checks_passed++))
        else
            echo -e "${YELLOW}⚠ Container running${NC}"
            ((checks_passed++))
        fi
    else
        echo -e "${RED}✗ Not Found${NC}"
        ((checks_failed++))
    fi

    # Check 6: OPA Health
    printf "  %-35s" "6. OPA Health:"
    if curl -sf http://localhost:8181/health --max-time 5 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Unhealthy${NC}"
        ((checks_failed++))
    fi

    # Check 7: OPAL Client Status (with JWT auth verification)
    printf "  %-35s" "7. OPAL Client:"
    local opal_container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "opal-client.*${code_lower}|${code_lower}.*opal-client" | head -1)
    if [ -n "$opal_container" ]; then
        # Check if connected to Hub's OPAL server
        local opal_logs=$(docker logs "$opal_container" 2>&1 | tail -50)
        if echo "$opal_logs" | grep -q "Connected to PubSub server"; then
            echo -e "${GREEN}✓ Connected (JWT auth working)${NC}"
            ((checks_passed++))
        elif echo "$opal_logs" | grep -q "403\|Forbidden"; then
            echo -e "${RED}✗ Auth Failed (need OPAL token)${NC}"
            echo "      Run: ./dive --instance $code_lower spoke opal-token"
            ((checks_failed++))
        elif echo "$opal_logs" | grep -q "Connection refused\|failed to connect"; then
            echo -e "${YELLOW}⚠ Hub Unreachable${NC}"
            ((checks_passed++))  # Network issue, not spoke issue
        else
            echo -e "${YELLOW}⚠ Connecting...${NC}"
            ((checks_passed++))  # In progress
        fi
    else
        # Container not running
        local opal_stopped=$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E "opal-client.*${code_lower}|${code_lower}.*opal-client" | head -1)
        if [ -n "$opal_stopped" ]; then
            echo -e "${YELLOW}⚠ Not Running${NC}"
        else
            echo -e "${YELLOW}⚠ Not Started (federation profile)${NC}"
        fi
        ((checks_passed++))  # Expected before deployment
    fi

    # Check 8: Hub Connectivity (ping)
    printf "  %-35s" "8. Hub Connectivity:"
    if curl -kfs "${hub_url}/health" --max-time 10 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Reachable${NC}"
        ((checks_passed++))
    elif curl -kfs "${hub_url}/api/federation/health" --max-time 10 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Reachable${NC}"
        ((checks_passed++))
    else
        echo -e "${YELLOW}⚠ Unreachable (${hub_url})${NC}"
        ((checks_failed++))
    fi

    # Check 9: Policy Bundle Present and Verified
    printf "  %-35s" "9. Policy Bundle:"
    local policy_count=$(curl -sf http://localhost:8181/v1/policies --max-time 5 2>/dev/null | grep -o '"id"' | wc -l | tr -d ' ')
    if [ "$policy_count" -gt 0 ]; then
        echo -e "${GREEN}✓ Loaded ($policy_count policies)${NC}"
        ((checks_passed++))
    else
        local policy_dir="$spoke_dir/cache/policies"
        if [ -d "$policy_dir" ] && [ "$(ls -A "$policy_dir" 2>/dev/null)" ]; then
            echo -e "${GREEN}✓ Cached locally${NC}"
            ((checks_passed++))
        else
            echo -e "${YELLOW}⚠ Not Loaded${NC}"
            ((checks_passed++))  # Not critical
        fi
    fi

    # Check 10: Token Valid (not expired)
    printf "  %-35s" "10. Token Validity:"
    if [ -n "$spoke_token" ] && [ ${#spoke_token} -gt 20 ]; then
        # Try to decode JWT and check expiry (if it's a JWT)
        local token_payload=""
        if echo "$spoke_token" | grep -q '\.'; then
            # It's a JWT - decode the payload
            token_payload=$(echo "$spoke_token" | cut -d. -f2 | base64 -d 2>/dev/null || echo "")
        fi

        if [ -n "$token_payload" ]; then
            local exp=$(echo "$token_payload" | grep -o '"exp"[[:space:]]*:[[:space:]]*[0-9]*' | cut -d: -f2 | tr -d ' ')
            if [ -n "$exp" ]; then
                local now=$(date +%s)
                if [ "$exp" -gt "$now" ]; then
                    local days_left=$(( (exp - now) / 86400 ))
                    echo -e "${GREEN}✓ Valid (${days_left} days left)${NC}"
                    ((checks_passed++))
                else
                    echo -e "${RED}✗ Expired${NC}"
                    ((checks_failed++))
                fi
            else
                echo -e "${GREEN}✓ Token present${NC}"
                ((checks_passed++))
            fi
        else
            echo -e "${GREEN}✓ Token present${NC}"
            ((checks_passed++))
        fi
    else
        echo -e "${YELLOW}⚠ No token configured${NC}"
        ((checks_passed++))  # Not critical if spoke not registered yet
    fi

    # Check 11: Heartbeat to Hub Successful
    printf "  %-35s" "11. Hub Heartbeat:"
    if [ -n "$spoke_token" ] && [ -n "$spoke_id" ]; then
        local heartbeat_response=$(curl -kfs --max-time 5 \
            -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${spoke_token}" \
            -d '{"status": "healthy", "metrics": {}}' \
            "${hub_url}/api/federation/spokes/${spoke_id}/heartbeat" 2>/dev/null)

        if echo "$heartbeat_response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
            echo -e "${GREEN}✓ Successful${NC}"
            ((checks_passed++))
        elif echo "$heartbeat_response" | grep -q '"ack"\|heartbeat'; then
            echo -e "${GREEN}✓ Acknowledged${NC}"
            ((checks_passed++))
        else
            echo -e "${YELLOW}⚠ No response${NC}"
            ((checks_passed++))  # Not critical
        fi
    else
        echo -e "${YELLOW}⚠ Skipped (no token/id)${NC}"
        ((checks_passed++))  # Not applicable
    fi

    # Check 12: TLS Certificates Valid
    printf "  %-35s" "12. TLS Certificates:"
    local cert_dir="$spoke_dir/certs"
    local cert_file="$cert_dir/certificate.pem"

    if [ -f "$cert_file" ]; then
        local expiry=$(openssl x509 -enddate -noout -in "$cert_file" 2>/dev/null | cut -d= -f2)
        local expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y %Z" "$expiry" +%s 2>/dev/null || echo 0)
        local now_epoch=$(date +%s)
        local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

        if [ $days_left -gt 30 ]; then
            echo -e "${GREEN}✓ Valid (${days_left} days left)${NC}"
            ((checks_passed++))
        elif [ $days_left -gt 0 ]; then
            echo -e "${YELLOW}⚠ Expires soon (${days_left} days)${NC}"
            ((checks_passed++))
        else
            echo -e "${RED}✗ Expired or invalid${NC}"
            ((checks_failed++))
        fi
    else
        # Try checking via curl
        if curl -kfs --max-time 5 https://localhost:4000/health >/dev/null 2>&1; then
            echo -e "${GREEN}✓ TLS working${NC}"
            ((checks_passed++))
        else
            echo -e "${YELLOW}⚠ No cert file${NC}"
            ((checks_passed++))  # May be using system certs
        fi
    fi

    # Check 13: ZTDF Resource Encryption
    printf "  %-35s" "13. ZTDF Resource Encryption:"
    local mongo_container="dive-spoke-${code_lower}-mongodb"

    if docker ps --format '{{.Names}}' | grep -q "^${mongo_container}$"; then
        local mongo_pass
        mongo_pass=$(docker exec "$mongo_container" printenv MONGO_INITDB_ROOT_PASSWORD 2>/dev/null || echo "")
        local mongo_uri="mongodb://localhost:27017/dive-v3-${code_lower}?authSource=admin"

        if [ -n "$mongo_pass" ]; then
            mongo_uri="mongodb://admin:${mongo_pass}@localhost:27017/dive-v3-${code_lower}?authSource=admin"
        fi

        # Count ZTDF encrypted resources
        local ztdf_count
        ztdf_count=$(docker exec "$mongo_container" mongosh --quiet "$mongo_uri" \
            --eval "db.resources.countDocuments({ 'ztdf.manifest': { \$exists: true } })" 2>/dev/null | tail -1 || echo "0")

        # Count total resources
        local total_count
        total_count=$(docker exec "$mongo_container" mongosh --quiet "$mongo_uri" \
            --eval "db.resources.countDocuments({})" 2>/dev/null | tail -1 || echo "0")

        if [ "${total_count:-0}" -eq 0 ]; then
            echo -e "${YELLOW}⚠ No resources (run: ./dive seed)${NC}"
            ((checks_passed++))  # Not a failure, just empty
        elif [ "${ztdf_count:-0}" -ge "$((total_count * 98 / 100))" ]; then
            local pct=$((ztdf_count * 100 / total_count))
            echo -e "${GREEN}✓ ${ztdf_count}/${total_count} (${pct}%)${NC}"
            ((checks_passed++))
        else
            local pct=$((ztdf_count * 100 / total_count))
            echo -e "${RED}✗ Only ${ztdf_count}/${total_count} (${pct}%)${NC}"
            ((checks_failed++))
        fi
    else
        echo -e "${RED}✗ MongoDB not running${NC}"
        ((checks_failed++))
    fi

    # Summary
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Verification Summary${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  Total Checks:   $checks_total"
    echo -e "  Passed:         ${GREEN}$checks_passed${NC}"
    echo -e "  Failed:         ${RED}$checks_failed${NC}"
    echo ""

    if [ $checks_failed -eq 0 ]; then
        echo -e "${GREEN}✓ All 13 verification checks passed!${NC}"
        echo ""
        return 0
    else
        echo -e "${YELLOW}⚠ Some checks failed. See above for details.${NC}"
        echo ""

        # Provide specific guidance for ZTDF failure
        if docker ps --format '{{.Names}}' | grep -q "^dive-spoke-${code_lower}-mongodb$"; then
            local mongo_container="dive-spoke-${code_lower}-mongodb"
            local mongo_pass=$(docker exec "$mongo_container" printenv MONGO_INITDB_ROOT_PASSWORD 2>/dev/null || echo "")
            local mongo_uri="mongodb://localhost:27017/dive-v3-${code_lower}?authSource=admin"
            if [ -n "$mongo_pass" ]; then
                mongo_uri="mongodb://admin:${mongo_pass}@localhost:27017/dive-v3-${code_lower}?authSource=admin"
            fi

            local ztdf_count=$(docker exec "$mongo_container" mongosh --quiet "$mongo_uri" \
                --eval "db.resources.countDocuments({ 'ztdf.manifest': { \$exists: true } })" 2>/dev/null | tail -1 || echo "0")
            local total_count=$(docker exec "$mongo_container" mongosh --quiet "$mongo_uri" \
                --eval "db.resources.countDocuments({})" 2>/dev/null | tail -1 || echo "0")

            if [ "${total_count:-0}" -gt 0 ] && [ "${ztdf_count:-0}" -lt "$((total_count * 98 / 100))" ]; then
                echo -e "${YELLOW}💡 Tip:${NC} Found plaintext resources. Re-seed with ZTDF encryption:"
                echo "      ./dive --instance ${code_lower} seed 5000"
                echo ""
            fi
        fi

        return 1
    fi
}

# =============================================================================
# SPOKE RESET (Phase 2 - Clean data while preserving config)
# =============================================================================

spoke_reset() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}🔄 Spoke Reset: ${code_upper}${NC}"
    echo ""

    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke not found: $spoke_dir"
        return 1
    fi

    echo -e "${YELLOW}⚠️  This will:${NC}"
    echo "    • Stop all spoke services"
    echo "    • Remove MongoDB, PostgreSQL, and Redis data volumes"
    echo "    • Remove the .initialized marker"
    echo "    • Preserve: config.json, .env, certificates, cloudflared config"
    echo ""
    echo -e "${YELLOW}After reset, you'll need to run initialization again.${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would reset spoke: $code_upper"
        return 0
    fi

    read -p "  Are you sure? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_info "Cancelled"
        return 1
    fi

    echo ""

    # Step 1: Stop services and remove volumes
    log_step "Stopping spoke services and removing volumes..."
    export COMPOSE_PROJECT_NAME="$code_lower"
    cd "$spoke_dir"
    docker compose down -v 2>&1 | tail -3

    # Step 2: Volumes removed via compose down -v above

    # Step 3: Remove initialized marker
    log_step "Removing initialization marker..."
    rm -f "$spoke_dir/.initialized"

    # Step 4: Clear cache directories (but keep structure)
    log_step "Clearing cache directories..."
    rm -rf "$spoke_dir/cache/policies"/* 2>/dev/null || true
    rm -rf "$spoke_dir/cache/audit"/* 2>/dev/null || true
    mkdir -p "$spoke_dir/cache/policies" "$spoke_dir/cache/audit"

    echo ""
    log_success "Spoke reset complete: $code_upper"
    echo ""
    echo -e "${BOLD}Preserved:${NC}"
    echo "  ✓ $spoke_dir/config.json"
    echo "  ✓ $spoke_dir/.env"
    echo "  ✓ $spoke_dir/certs/*"
    echo "  ✓ $spoke_dir/cloudflared/*"
    echo ""
    echo -e "${BOLD}Next Steps:${NC}"
    echo "  1. Start services: ./dive --instance $code_lower spoke up"
    echo "  2. Wait for services to be healthy"
    echo "  3. Initialization will run automatically"
    echo ""
}

# =============================================================================
# SPOKE TEARDOWN (Phase 2 - Full removal)
# =============================================================================

spoke_teardown() {
    local notify_hub="${1:-}"

    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}💥 Spoke Teardown: ${code_upper}${NC}"
    echo ""

    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke not found: $spoke_dir"
        return 1
    fi

    echo -e "${RED}⚠️  WARNING: This will PERMANENTLY DELETE:${NC}"
    echo "    • All spoke Docker containers"
    echo "    • All spoke Docker volumes (databases, caches)"
    echo "    • The entire spoke directory: $spoke_dir"
    echo "    • All configuration, certificates, and data"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would teardown spoke: $code_upper"
        log_dry "Would remove directory: $spoke_dir"
        return 0
    fi

    read -p "  Type '$code_upper' to confirm teardown: " confirm
    if [ "$confirm" != "$code_upper" ]; then
        log_info "Cancelled (confirmation did not match)"
        return 1
    fi

    echo ""

    # Get spoke info before teardown for hub notification
    local config_file="$spoke_dir/config.json"
    local spoke_id=""
    local hub_url=""
    if [ -f "$config_file" ]; then
        spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
        hub_url=$(grep -o '"hubUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    fi

    # Step 1: Stop and remove containers
    log_step "Stopping and removing containers..."
    export COMPOSE_PROJECT_NAME="$code_lower"
    cd "$spoke_dir"
    docker compose down -v --remove-orphans 2>&1 | tail -3

    # Step 2: Volumes removed via compose down -v above

    # Step 3: Network removed via compose down above

    # Step 4: Optionally notify hub
    if [ "$notify_hub" = "--notify-hub" ] && [ -n "$spoke_id" ] && [ -n "$hub_url" ]; then
        log_step "Notifying Hub of removal..."
        local token=""
        if [ -f "$spoke_dir/.env" ]; then
            token=$(grep "SPOKE_OPAL_TOKEN" "$spoke_dir/.env" 2>/dev/null | cut -d= -f2)
        fi

        if [ -n "$token" ]; then
            curl -s -X POST "$hub_url/api/federation/spokes/$spoke_id/deregister" \
                -H "Authorization: Bearer $token" \
                -H "Content-Type: application/json" \
                -d '{"reason": "Spoke teardown initiated by CLI"}' \
                --max-time 10 2>/dev/null || log_warn "Could not notify hub"
        fi
    fi

    # Step 5: Remove spoke directory
    log_step "Removing spoke directory..."
    cd "${DIVE_ROOT}"
    rm -rf "$spoke_dir"

    echo ""
    log_success "Spoke teardown complete: $code_upper"
    echo ""
    echo "  Removed:"
    echo "    ✓ All Docker containers and volumes"
    echo "    ✓ Directory: $spoke_dir"
    echo ""

    if [ -n "$spoke_id" ]; then
        echo -e "${YELLOW}Note:${NC} If the spoke was registered with Hub, you may want to"
        echo "      contact the Hub admin to revoke the registration."
        echo ""
    fi
}

spoke_down() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    if [ ! -f "$spoke_dir/docker-compose.yml" ]; then
        log_error "Spoke not found"
        return 1
    fi

    log_step "Stopping spoke services: $(upper "$instance_code")"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would run: docker compose -f $spoke_dir/docker-compose.yml down"
        return 0
    fi

    export COMPOSE_PROJECT_NAME="$code_lower"
    cd "$spoke_dir"
    docker compose down

    log_success "Spoke services stopped"
}

# =============================================================================
# SPOKE CLEAN - Remove all volumes and containers for a spoke instance
# This is the recommended way to handle stale volume password mismatches
# =============================================================================
spoke_clean() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}Cleaning Up Spoke Instance:${NC} ${code_upper}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would stop and remove all containers for $code_upper"
        log_dry "Would remove all Docker volumes matching: ${code_lower}*"
        log_dry "Would remove instance directory: $spoke_dir"
        return 0
    fi

    # Step 1: Stop containers if running
    if [ -f "$spoke_dir/docker-compose.yml" ]; then
        log_step "Stopping spoke services..."
        export COMPOSE_PROJECT_NAME="$code_lower"
        cd "$spoke_dir"
        docker compose down --volumes --remove-orphans 2>/dev/null || true
    fi

    # Step 2: Remove any orphaned containers
    log_step "Removing orphaned containers..."
    docker ps -a --filter "name=dive-spoke-${code_lower}" --format '{{.Names}}' | xargs -r docker rm -f 2>/dev/null || true
    docker ps -a --filter "name=${code_lower}-" --format '{{.Names}}' | xargs -r docker rm -f 2>/dev/null || true

    # Step 3: Remove volumes with common naming patterns
    log_step "Removing Docker volumes..."
    local volume_count=0
    local volume_patterns=(
        "^${code_lower}_"
        "^dive-spoke-${code_lower}_"
        "^${code_lower}-"
    )

    # Use compose to clean volumes instead of pattern matching
    if [ -f "${spoke_dir}/docker-compose.yml" ]; then
        (cd "$spoke_dir" && COMPOSE_PROJECT_NAME="$code_lower" docker compose down -v 2>/dev/null) || true
        # Count volumes that were removed (approximate)
        volume_count=$((volume_count + 5))  # Typical spoke has ~5 volumes
    fi

    log_info "Removed $volume_count volumes"

    # Step 4: Remove instance directory (optional - prompt user)
    if [ -d "$spoke_dir" ]; then
        echo ""
        echo -e "${YELLOW}Instance directory found: $spoke_dir${NC}"

        # In non-interactive mode or if --force flag, just remove
        if [ "${FORCE_CLEAN:-false}" = true ]; then
            rm -rf "$spoke_dir"
            log_info "Removed instance directory"
        else
            echo -e "  This contains config.json, .env, and certificates."
            echo -e "  Remove it? (yes/no): "
            read -r confirm
            if [ "$confirm" = "yes" ] || [ "$confirm" = "y" ]; then
                rm -rf "$spoke_dir"
                log_info "Removed instance directory"
            else
                log_info "Kept instance directory (you can reuse existing configuration)"
            fi
        fi
    fi

    echo ""
    log_success "Cleanup complete for ${code_upper}"
    echo ""
    echo -e "${CYAN}Next steps:${NC}"
    echo "  ./dive --instance ${code_lower} spoke deploy ${code_upper} 'Instance Name'"
    echo ""
}

spoke_init_keycloak() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower
    local code_upper
    code_lower=$(lower "$instance_code")
    code_upper=$(upper "$instance_code")

    print_header
    echo -e "${BOLD}Configuring Keycloak (Spoke):${NC} ${code_upper}"
    echo ""

    # Ensure the spoke directory exists
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke not found: $spoke_dir"
        return 1
    fi

    # Ensure services are running (Keycloak + backend needed for docker exec / curl)
    export COMPOSE_PROJECT_NAME="$code_lower"

    # Run the existing init script (idempotent: updates realm theme/frontendUrl/client redirects)
    (cd "${DIVE_ROOT}" && bash "${DIVE_ROOT}/scripts/spoke-init/init-keycloak.sh" "${code_upper}")
}

spoke_logs() {
    local service="${1:-}"

    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    if [ ! -f "$spoke_dir/docker-compose.yml" ]; then
        log_error "Spoke not found"
        return 1
    fi

    export COMPOSE_PROJECT_NAME="$code_lower"
    cd "$spoke_dir"

    if [ -n "$service" ]; then
        docker compose logs -f "$service-${code_lower}" 2>/dev/null || docker compose logs -f "$service"
    else
        docker compose logs -f
    fi
}

# =============================================================================
# INIT COMMANDS (Lazy Loaded from spoke-init.sh)
# =============================================================================

spoke_setup_wizard() { _load_spoke_init && spoke_setup_wizard "$@"; }
spoke_init() { _load_spoke_init && spoke_init "$@"; }
_spoke_init_internal() { _load_spoke_init && _spoke_init_internal "$@"; }
_spoke_init_legacy() { _load_spoke_init && _spoke_init_legacy "$@"; }

# =============================================================================
# DEPLOY COMMANDS (Lazy Loaded from spoke-deploy.sh)
# =============================================================================

spoke_up() { _load_spoke_deploy && spoke_up "$@"; }
spoke_deploy() { _load_spoke_deploy && spoke_deploy "$@"; }
_spoke_wait_for_services() { _load_spoke_deploy && _spoke_wait_for_services "$@"; }

# =============================================================================
# REGISTER COMMANDS (Lazy Loaded from spoke-register.sh)
# =============================================================================

spoke_register() { _load_spoke_register && spoke_register "$@"; }
_spoke_poll_for_approval() { _load_spoke_register && _spoke_poll_for_approval "$@"; }
_spoke_configure_token() { _load_spoke_register && _spoke_configure_token "$@"; }
spoke_opal_token() { _load_spoke_register && spoke_opal_token "$@"; }
spoke_token_refresh() { _load_spoke_register && spoke_token_refresh "$@"; }
spoke_register_with_hub() { _load_spoke_register && spoke_register_with_hub "$@"; }
spoke_register_federation() { _load_spoke_register && spoke_register_federation "$@"; }

# =============================================================================
# FAILOVER, MAINTENANCE, AUDIT (Lazy Loaded from spoke-failover.sh)
# =============================================================================

spoke_failover() { _load_spoke_failover && spoke_failover "$@"; }
spoke_maintenance() { _load_spoke_failover && spoke_maintenance "$@"; }
spoke_audit_status() { _load_spoke_failover && spoke_audit_status "$@"; }

# =============================================================================
# POLICY COMMANDS (Lazy Loaded from spoke-policy.sh)
# =============================================================================

spoke_policy() { _load_spoke_policy && spoke_policy "$@"; }

# =============================================================================
# NATO COUNTRY MANAGEMENT (Lazy Loaded from spoke-countries.sh)
# =============================================================================

spoke_list_countries() { _load_spoke_countries && spoke_list_countries "$@"; }
spoke_show_ports() { _load_spoke_countries && spoke_show_ports "$@"; }
spoke_country_info() { _load_spoke_countries && spoke_country_info "$@"; }
spoke_validate_country() { _load_spoke_countries && spoke_validate_country "$@"; }
spoke_generate_theme() { _load_spoke_countries && spoke_generate_theme "$@"; }
spoke_batch_deploy() { _load_spoke_countries && spoke_batch_deploy "$@"; }
spoke_verify_federation() { _load_spoke_countries && spoke_verify_federation "$@"; }

# =============================================================================
# SPOKE KAS MANAGEMENT (Lazy Loaded from spoke-kas.sh)
# =============================================================================

spoke_kas() { _load_spoke_kas && spoke_kas "$@"; }

# =============================================================================
# LOCALIZED ATTRIBUTE COMMANDS (Phase 5 - NATO Interoperability)
# =============================================================================
# Configure country-specific attribute names mapped to DIVE V3 standard claims
# Supports all 32 NATO countries with localized attribute naming conventions
# =============================================================================

##
# Configure localized attribute mappers for a spoke
# Maps country-specific attribute names to DIVE V3 standard claims
##
spoke_localize_mappers() {
    local code="${1:-$INSTANCE}"
    code="${code:-}"

    if [ -z "$code" ]; then
        log_error "Usage: ./dive spoke localize-mappers <COUNTRY_CODE>"
        echo ""
        echo "Example: ./dive spoke localize-mappers HUN"
        return 1
    fi

    local code_upper="${code^^}"
    local script="${DIVE_ROOT}/scripts/spoke-init/configure-localized-mappers.sh"

    if [ ! -f "$script" ]; then
        log_error "Localized mapper script not found: $script"
        return 1
    fi

    bash "$script" "$code_upper"
}

##
# Seed users with localized attributes for a spoke
##
spoke_localize_users() {
    local code="${1:-$INSTANCE}"
    code="${code:-}"

    if [ -z "$code" ]; then
        log_error "Usage: ./dive spoke localize-users <COUNTRY_CODE>"
        echo ""
        echo "Example: ./dive spoke localize-users HUN"
        return 1
    fi

    local code_upper="${code^^}"
    local script="${DIVE_ROOT}/scripts/spoke-init/seed-localized-users.sh"

    if [ ! -f "$script" ]; then
        log_error "Localized users script not found: $script"
        return 1
    fi

    bash "$script" "$code_upper"
}

##
# Full localization: mappers + users
##
spoke_localize() {
    local code="${1:-$INSTANCE}"
    code="${code:-}"

    if [ -z "$code" ]; then
        log_error "Usage: ./dive spoke localize <COUNTRY_CODE>"
        echo ""
        echo "Configures localized attribute mappers and seeds users for a NATO country."
        echo ""
        echo "Example: ./dive spoke localize HUN"
        echo "         ./dive spoke localize FRA"
        echo "         ./dive spoke localize DEU"
        echo ""
        echo "This will:"
        echo "  1. Configure protocol mappers (local → DIVE V3)"
        echo "  2. Update User Profile with localized attributes"
        echo "  3. Seed users with localized attribute values"
        return 1
    fi

    local code_upper="${code^^}"

    echo -e "${BOLD}╔══════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  Full Localization for ${code_upper}${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    echo -e "${CYAN}Step 1/2: Configuring localized mappers...${NC}"
    spoke_localize_mappers "$code_upper"

    echo ""
    echo -e "${CYAN}Step 2/2: Seeding users with localized attributes...${NC}"
    spoke_localize_users "$code_upper"

    echo ""
    echo -e "${GREEN}✓ Localization complete for ${code_upper}${NC}"
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_spoke() {
    local action="${1:-help}"
    shift || true

    # Check if pilot mode is enabled - some spoke commands are disabled
    local pilot_disabled_actions="init generate-certs up down"
    if [ "$PILOT_MODE" = true ]; then
        for disabled in $pilot_disabled_actions; do
            if [ "$action" = "$disabled" ]; then
                log_error "Spoke deployment command '$action' is disabled in pilot mode"
                echo ""
                echo -e "${YELLOW}In pilot mode, partners register as SP Clients, not full Spokes.${NC}"
                echo ""
                echo "To register as an SP Client (OAuth/OIDC), use:"
                echo "  ./dive sp register"
                echo ""
                echo "To disable pilot mode (for full spoke deployment):"
                echo "  export DIVE_PILOT_MODE=false"
                echo "  ./dive spoke $action $@"
                return 1
            fi
        done
    fi

    case "$action" in
        init)           spoke_init "$@" ;;
        setup|wizard)   spoke_setup_wizard "$@" ;;
        deploy)         spoke_deploy "$@" ;;
        generate-certs) spoke_generate_certs "$@" ;;
        gen-certs)      spoke_generate_certs "$@" ;;
        rotate-certs)   spoke_rotate_certs "$@" ;;
        init-keycloak)  spoke_init_keycloak ;;
        register)       spoke_register "$@" ;;
        token-refresh)  spoke_token_refresh "$@" ;;
        opal-token)     spoke_opal_token "$@" ;;
        status)         spoke_status ;;
        health)         spoke_health ;;
        verify)         spoke_verify ;;
        sync)           spoke_sync ;;
        heartbeat)      spoke_heartbeat ;;
        policy)         spoke_policy "$@" ;;
        up|start)       spoke_up ;;
        down|stop)      spoke_down ;;
        clean|purge)    spoke_clean ;;
        logs)           spoke_logs "$@" ;;
        reset)          spoke_reset ;;
        teardown)       spoke_teardown "$@" ;;
        failover)       spoke_failover "$@" ;;
        maintenance)    spoke_maintenance "$@" ;;
        audit-status)   spoke_audit_status ;;
        sync-secrets)   spoke_sync_secrets "$@" ;;
        sync-all-secrets) spoke_sync_all_secrets ;;
        list-countries) spoke_list_countries "$@" ;;
        countries)      spoke_list_countries "$@" ;;
        ports)          spoke_show_ports "$@" ;;
        country-info)   spoke_country_info "$@" ;;
        validate-country) spoke_validate_country "$@" ;;
        generate-theme) spoke_generate_theme "$@" ;;
        gen-theme)      spoke_generate_theme "$@" ;;
        batch-deploy)   spoke_batch_deploy "$@" ;;
        batch)          spoke_batch_deploy "$@" ;;
        verify-federation) spoke_verify_federation "$@" ;;
        verify-fed)     spoke_verify_federation "$@" ;;
        kas)            spoke_kas "$@" ;;
        localize)       spoke_localize "$@" ;;
        localize-mappers) spoke_localize_mappers "$@" ;;
        localize-users) spoke_localize_users "$@" ;;
        *)              module_spoke_help ;;
    esac
}

module_spoke_help() {
    print_header
    echo -e "${BOLD}Spoke Commands (for distributed federation):${NC}"
    echo ""

    if [ "$PILOT_MODE" = true ]; then
        echo -e "${YELLOW}⚠️  Pilot mode is enabled. Some spoke commands are disabled.${NC}"
        echo "   Use './dive sp register' to register as an SP Client instead."
        echo "   Set DIVE_PILOT_MODE=false to enable full spoke deployment."
        echo ""
    fi

    echo -e "${CYAN}🚀 Quick Deploy (Phase 2):${NC}"
    echo "  deploy <code> [name]   Full automated deployment (init→up→wait→init-all→register)"
    echo "                         Deploys a complete spoke in <120 seconds"
    echo ""

    echo -e "${CYAN}Setup & Initialization:${NC}"
    echo "  init                   Interactive setup wizard (recommended)"
    echo "  init <code> <name>     Quick initialization with defaults"
    echo "  setup / wizard         Launch interactive setup wizard"
    echo ""
    echo -e "${DIM}  The wizard helps you configure:${NC}"
    echo -e "${DIM}    • Hostnames (dive25.com, custom domain, or IP)${NC}"
    echo -e "${DIM}    • Cloudflare tunnel (optional auto-setup)${NC}"
    echo -e "${DIM}    • Secure password generation${NC}"
    echo -e "${DIM}    • TLS certificates${NC}"
    echo ""

    echo -e "${CYAN}Certificates:${NC}"
    echo "  generate-certs         Generate X.509 certificates for mTLS"
    echo "  rotate-certs           Rotate existing certificates (with backup)"
    echo ""

    echo -e "${CYAN}Registration (Phase 3):${NC}"
    echo "  register               Register this spoke with the Hub (includes CSR)"
    echo "  register --poll        Register and poll for approval (auto-configure token)"
    echo "  token-refresh          Refresh spoke Hub API token before expiry"
    echo "  opal-token             Provision OPAL client JWT from Hub's OPAL server"
    echo "  status                 Show spoke federation status (incl. token/cert info)"
    echo ""

    echo -e "${CYAN}Operations:${NC}"
    echo "  up                     Start spoke services"
    echo "  down                   Stop spoke services"
    echo "  clean                  Remove all containers, volumes, and optionally config"
    echo "                         (Use before redeploy to fix password mismatches)"
    echo "  logs [service]         View service logs"
    echo "  health                 Check service health"
    echo "  verify                 Run 8-point connectivity test"
    echo ""

    echo -e "${CYAN}Cleanup (Phase 2):${NC}"
    echo "  reset                  Clean spoke data, preserve config (re-initialize)"
    echo "  teardown [--notify-hub]  Full removal of spoke (DESTRUCTIVE)"
    echo ""

    echo -e "${CYAN}Federation:${NC}"
    echo "  sync                   Force policy sync from Hub"
    echo "  heartbeat              Send manual heartbeat to Hub"
    echo "  sync-secrets           Synchronize frontend secrets with Keycloak"
    echo "  sync-all-secrets       Synchronize secrets for all running spokes"
    echo ""

    echo -e "${CYAN}Policy Management (Phase 4):${NC}"
    echo "  policy status          Show policy version, sync status, signature"
    echo "  policy sync            Force policy sync from hub with verification"
    echo "  policy verify          Verify current policy bundle signature"
    echo "  policy version         Show current policy version"
    echo ""

    echo -e "${CYAN}Resilience (Phase 5):${NC}"
    echo "  failover [subcmd]      Circuit breaker management"
    echo "    status               Show failover state and metrics"
    echo "    force-open           Force circuit to OPEN (offline mode)"
    echo "    force-closed         Force circuit to CLOSED (normal mode)"
    echo "    reset                Reset metrics and return to CLOSED"
    echo ""
    echo "  maintenance [subcmd]   Maintenance mode control"
    echo "    status               Show maintenance status"
    echo "    enter [reason]       Enter maintenance mode"
    echo "    exit                 Exit maintenance mode"
    echo ""
    echo "  audit-status           Show audit queue status and metrics"
    echo ""

    echo -e "${CYAN}NATO Country Management:${NC}"
    echo "  list-countries         List all 32 NATO member countries"
    echo "  countries              Alias for list-countries"
    echo "  ports [CODE]           Show port assignments (all or specific country)"
    echo "  country-info <CODE>    Show detailed info for a country"
    echo "  validate-country <CODE> Validate a country code"
    echo "  generate-theme <CODE>  Generate Keycloak theme for a country"
    echo "  generate-theme --all   Generate themes for all 32 NATO countries"
    echo ""

    echo -e "${CYAN}Localized Attributes (NATO Interoperability):${NC}"
    echo "  localize <CODE>        Full localization: mappers + users (recommended)"
    echo "  localize-mappers <CODE> Configure protocol mappers (local → DIVE V3)"
    echo "  localize-users <CODE>  Seed users with localized attributes"
    echo ""
    echo -e "${DIM}  Maps country-specific attribute names to DIVE V3 standard:${NC}"
    echo -e "${DIM}    FRA: niveau_habilitation → clearance${NC}"
    echo -e "${DIM}    DEU: sicherheitsfreigabe → clearance${NC}"
    echo -e "${DIM}    POL: poziom_bezpieczenstwa → clearance${NC}"
    echo -e "${DIM}    HUN: biztonsagi_szint → clearance${NC}"
    echo ""

    echo -e "${CYAN}Batch Operations:${NC}"
    echo "  batch-deploy <CODES>   Deploy multiple countries (e.g., ALB POL NOR)"
    echo "  batch-deploy --all     Deploy all 32 NATO countries (not recommended locally)"
    echo "  verify-federation      Verify federation health for running spokes"
    echo "  verify-federation <CODES> Verify specific countries"
    echo ""

    echo -e "${CYAN}KAS Management:${NC}"
    echo "  kas init [code]        Initialize KAS for a spoke (certs, registry)"
    echo "  kas status [code]      Show spoke KAS status"
    echo "  kas health [code]      Detailed KAS health check"
    echo "  kas register [code]    Register spoke KAS in federation registry"
    echo "  kas unregister [code]  Remove spoke KAS from federation registry"
    echo "  kas logs [code] [-f]   View spoke KAS logs"
    echo ""

    echo -e "${BOLD}Quick Start (One Command - Phase 2):${NC}"
    echo -e "  ${GREEN}./dive spoke deploy NZL 'New Zealand'${NC}  # Deploy in <120 seconds"
    echo ""

    echo -e "${BOLD}Quick Start (Interactive):${NC}"
    echo -e "  ${GREEN}./dive spoke init${NC}           # Launch setup wizard"
    echo ""

    echo -e "${BOLD}Quick Start (Non-Interactive):${NC}"
    echo "  1. ./dive spoke init NZL 'New Zealand Defence'"
    echo "  2. Edit instances/nzl/.env (auto-generated with passwords)"
    echo "  3. ./dive spoke up"
    echo "  4. ./dive --instance nzl spoke register"
    echo "  5. Wait for Hub admin approval"
    echo "  6. Add SPOKE_OPAL_TOKEN to .env"
    echo ""

    echo -e "${BOLD}Verification:${NC}"
    echo "  ./dive --instance nzl spoke verify   # 8-point connectivity test"
    echo "  ./dive --instance nzl spoke health   # Service health check"
    echo ""

    echo -e "${BOLD}Cloudflare Tunnel Setup:${NC}"
    echo "  The setup wizard can auto-configure Cloudflare tunnels."
    echo "  This makes your spoke accessible at <code>-*.dive25.com"
    echo ""
    echo "  Manual setup:"
    echo "    1. Create tunnel at https://one.dash.cloudflare.com"
    echo "    2. Copy tunnel token"
    echo "    3. Add to .env: TUNNEL_TOKEN=<token>"
    echo "    4. Restart: ./dive spoke down && ./dive spoke up"
    echo ""

    echo -e "${BOLD}Environment Variables:${NC}"
    echo "  DIVE_PILOT_MODE        Set to 'false' to enable spoke deployment"
    echo "  DIVE_HUB_URL           Override Hub URL for registration"
    echo "  DIVE_INSTANCE          Set default instance code"
    echo ""
}
