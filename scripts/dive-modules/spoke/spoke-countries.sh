#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Spoke NATO Country Management Module
# =============================================================================
# Extracted from spoke.sh during refactoring for modularity
# Commands: spoke list-countries|ports|country-info|validate-country|generate-theme|batch-deploy|verify-federation
# =============================================================================
# Version: 1.0.0
# Date: 2025-12-23
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load NATO countries database (required for country management functions)
# Force-load if functions aren't available even when flag is set
_ensure_nato_countries() {
    if ! type list_nato_countries &>/dev/null; then
        local nato_script="${DIVE_ROOT}/scripts/nato-countries.sh"
        if [ -f "$nato_script" ]; then
            source "$nato_script"
            export NATO_COUNTRIES_LOADED=1
        else
            log_error "NATO countries database not found: $nato_script"
            return 1
        fi
    fi
}

# =============================================================================
# NATO COUNTRY MANAGEMENT COMMANDS
# =============================================================================

# List all supported NATO countries
spoke_list_countries() {
    _ensure_nato_countries || return 1
    local format="${1:-table}"

    print_header
    echo -e "${BOLD}NATO Member Countries (32 Total)${NC}"
    echo ""

    case "$format" in
        table|--table)
            list_nato_countries_table
            ;;
        simple|--simple)
            list_nato_countries
            ;;
        json|--json)
            echo "["
            local first=true
            for code in $(echo "${!NATO_COUNTRIES[@]}" | tr ' ' '\n' | sort); do
                if [ "$first" = true ]; then
                    first=false
                else
                    echo ","
                fi
                get_country_json "$code" | sed 's/^/  /'
            done
            echo ""
            echo "]"
            ;;
        *)
            list_nato_countries_table
            ;;
    esac

    echo ""
    echo -e "${CYAN}Usage:${NC}"
    echo "  ./dive spoke init <CODE> <NAME>     Initialize spoke for a country"
    echo "  ./dive spoke country-info <CODE>    Show detailed country info"
    echo "  ./dive spoke ports                  Show all port assignments"
    echo ""
}

# Show port assignments for all countries
spoke_show_ports() {
    _ensure_nato_countries || return 1
    local code="${1:-}"

    print_header

    if [ -n "$code" ]; then
        # Show ports for specific country
        local code_upper="${code^^}"
        if ! is_nato_country "$code_upper"; then
            log_error "Invalid NATO country code: $code_upper"
            echo ""
            echo "Run './dive spoke list-countries' to see valid codes."
            return 1
        fi

        echo -e "${BOLD}Port Assignments for $(get_country_name "$code_upper") $(get_country_flag "$code_upper")${NC}"
        echo ""
        eval "$(get_country_ports "$code_upper")"
        echo "  Frontend:   https://localhost:$SPOKE_FRONTEND_PORT"
        echo "  Backend:    https://localhost:$SPOKE_BACKEND_PORT"
        echo "  Keycloak:   https://localhost:$SPOKE_KEYCLOAK_HTTPS_PORT"
        echo "  PostgreSQL: localhost:$SPOKE_POSTGRES_PORT"
        echo "  MongoDB:    localhost:$SPOKE_MONGODB_PORT"
        echo "  Redis:      localhost:$SPOKE_REDIS_PORT"
        echo "  OPA:        http://localhost:$SPOKE_OPA_PORT"
        echo "  KAS:        https://localhost:$SPOKE_KAS_PORT"
    else
        # Show ports for all countries
        echo -e "${BOLD}Port Assignments for All 32 NATO Countries${NC}"
        echo ""
        list_nato_ports
    fi
    echo ""
}

# Show detailed info for a country
spoke_country_info() {
    _ensure_nato_countries || return 1
    local code="${1:-}"

    if [ -z "$code" ]; then
        log_error "Country code required"
        echo ""
        echo "Usage: ./dive spoke country-info <CODE>"
        echo "Example: ./dive spoke country-info GBR"
        return 1
    fi

    local code_upper="${code^^}"

    if ! is_nato_country "$code_upper"; then
        log_error "Invalid NATO country code: $code_upper"
        echo ""
        echo "Run './dive spoke list-countries' to see valid codes."
        return 1
    fi

    print_header
    echo -e "${BOLD}$(get_country_name "$code_upper") $(get_country_flag "$code_upper")${NC}"
    echo ""
    echo "  ISO Code:     $code_upper"
    echo "  NATO Member:  Since $(get_country_join_year "$code_upper")"
    echo "  Timezone:     $(get_country_timezone "$code_upper")"
    echo "  Primary:      $(get_country_primary_color "$code_upper")"
    echo "  Secondary:    $(get_country_secondary_color "$code_upper")"
    echo ""

    eval "$(get_country_ports "$code_upper")"
    echo -e "${CYAN}Port Assignments (Offset: $SPOKE_PORT_OFFSET):${NC}"
    echo "  Frontend:     $SPOKE_FRONTEND_PORT"
    echo "  Backend:      $SPOKE_BACKEND_PORT"
    echo "  Keycloak:     $SPOKE_KEYCLOAK_HTTPS_PORT"
    echo "  PostgreSQL:   $SPOKE_POSTGRES_PORT"
    echo "  MongoDB:      $SPOKE_MONGODB_PORT"
    echo "  Redis:        $SPOKE_REDIS_PORT"
    echo "  OPA:          $SPOKE_OPA_PORT"
    echo "  KAS:          $SPOKE_KAS_PORT"
    echo ""

    # Check if instance exists
    local code_lower=$(lower "$code_upper")
    local instance_dir="${DIVE_ROOT}/instances/${code_lower}"

    if [ -d "$instance_dir" ]; then
        echo -e "${GREEN}✓ Instance directory exists:${NC} $instance_dir"

        [ -f "$instance_dir/config.json" ] && echo -e "${GREEN}✓ Configuration found${NC}"
        [ -f "$instance_dir/docker-compose.yml" ] && echo -e "${GREEN}✓ Docker Compose file found${NC}"
        [ -f "$instance_dir/.env" ] && echo -e "${GREEN}✓ Environment file found${NC}"
    else
        echo -e "${YELLOW}⚠ Instance not initialized${NC}"
        echo ""
        echo "To initialize: ./dive spoke init $code_upper \"$(get_country_name "$code_upper")\""
    fi
    echo ""
}

# Validate a country code
spoke_validate_country() {
    _ensure_nato_countries || return 1
    local code="${1:-}"

    if [ -z "$code" ]; then
        log_error "Country code required"
        echo ""
        echo "Usage: ./dive spoke validate-country <CODE>"
        return 1
    fi

    local code_upper="${code^^}"

    if is_nato_country "$code_upper"; then
        echo -e "${GREEN}✓ '$code_upper' is a valid NATO member country${NC}"
        echo ""
        echo "  Name: $(get_country_name "$code_upper")"
        echo "  Flag: $(get_country_flag "$code_upper")"
        echo "  Joined NATO: $(get_country_join_year "$code_upper")"
        return 0
    elif is_partner_nation "$code_upper"; then
        echo -e "${YELLOW}⚠ '$code_upper' is a NATO partner nation (not full member)${NC}"
        echo ""
        echo "Partner nations can be deployed but use hash-based port assignments."
        return 0
    else
        echo -e "${RED}✗ '$code_upper' is not a recognized NATO country or partner${NC}"
        echo ""
        echo "Valid NATO country codes:"
        list_nato_countries | head -5
        echo "... (use './dive spoke list-countries' for full list)"
        return 1
    fi
}

# Generate Keycloak theme for a country
spoke_generate_theme() {
    local code="${1:-}"
    local force="${2:-}"

    ensure_dive_root

    if [ -z "$code" ] && [ "$code" != "--all" ]; then
        log_error "Country code required (or use --all for all countries)"
        echo ""
        echo "Usage:"
        echo "  ./dive spoke generate-theme <CODE>      Generate theme for one country"
        echo "  ./dive spoke generate-theme --all       Generate themes for all 32 NATO countries"
        echo "  ./dive spoke generate-theme <CODE> -f   Force regenerate existing theme"
        return 1
    fi

    local script="${DIVE_ROOT}/scripts/generate-spoke-theme.sh"

    if [ ! -f "$script" ]; then
        log_error "Theme generator script not found: $script"
        return 1
    fi

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would generate theme for: $code $force"
        return 0
    fi

    # Build arguments
    local args=""
    if [ "$code" = "--all" ] || [ "$code" = "-a" ]; then
        args="--all"
    else
        args="$code"
    fi

    [ "$force" = "--force" ] || [ "$force" = "-f" ] && args="$args --force"

    # Run the theme generator
    "$script" $args
}

# Batch deploy multiple NATO countries
spoke_batch_deploy() {
    ensure_dive_root

    local script="${DIVE_ROOT}/scripts/nato-batch-deploy.sh"

    if [ ! -f "$script" ]; then
        log_error "Batch deployment script not found: $script"
        return 1
    fi

    if [ "$DRY_RUN" = true ]; then
        "$script" "$@" --dry-run
    else
        "$script" "$@"
    fi
}

# Verify federation for NATO countries
spoke_verify_federation() {
    ensure_dive_root

    local script="${DIVE_ROOT}/scripts/nato-verify-federation.sh"

    if [ ! -f "$script" ]; then
        log_error "Federation verification script not found: $script"
        return 1
    fi

    "$script" "$@"
}

# Mark module as loaded
export DIVE_SPOKE_COUNTRIES_LOADED=1

