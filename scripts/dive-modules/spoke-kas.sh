#!/usr/local/bin/bash
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
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load NATO countries database for port calculation
if [ -z "$NATO_COUNTRIES_LOADED" ]; then
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
        echo "       ./dive --instance POL spoke kas init"
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
        echo "       ./dive --instance POL spoke kas status"
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
    idp_url="${idp_url:-https://${code_lower}-idp.dive25.com/realms/dive-v3-broker}"
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
    "jwtAudience": "dive-v3-client-broker"
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

# Spoke KAS command dispatcher
spoke_kas() {
    local subcommand="${1:-status}"
    shift || true

    case "$subcommand" in
        init)       spoke_kas_init "$@" ;;
        status)     spoke_kas_status "$@" ;;
        health)     spoke_kas_health "$@" ;;
        register)   spoke_kas_register "$@" ;;
        unregister) spoke_kas_unregister "$@" ;;
        logs)       spoke_kas_logs "$@" ;;
        *)
            echo -e "${BOLD}Spoke KAS Commands:${NC}"
            echo ""
            echo "  init <code>        Initialize KAS for a spoke"
            echo "  status <code>      Show KAS status"
            echo "  health <code>      Detailed health check"
            echo "  register <code>    Register in federation registry"
            echo "  unregister <code>  Remove from registry"
            echo "  logs <code> [-f]   View KAS logs"
            echo ""
            ;;
    esac
}

# Mark module as loaded
export DIVE_SPOKE_KAS_LOADED=1

