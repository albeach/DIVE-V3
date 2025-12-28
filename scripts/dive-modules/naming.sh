#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Naming Conventions Module
# =============================================================================
# Commands: validate, migrate, info, verify
# Manages centralized naming conventions for Keycloak realms, clients, and services
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load naming conventions library
if [ ! -f "${DIVE_ROOT}/scripts/lib/naming-conventions.sh" ]; then
    log_error "Naming conventions library not found"
    exit 1
fi
source "${DIVE_ROOT}/scripts/lib/naming-conventions.sh"

# =============================================================================
# MODULE COMMANDS
# =============================================================================

##
# Show naming convention information
##
cmd_naming_info() {
    local instance_code="${1:-${INSTANCE}}"

    if [ -z "$instance_code" ]; then
        log_error "Instance code required. Use --instance <CODE> or provide as argument"
        echo ""
        echo "Usage: ./dive naming info <CODE>"
        echo "   or: ./dive --instance <CODE> naming info"
        return 1
    fi

    instance_code=$(echo "$instance_code" | tr '[:lower:]' '[:upper:]')

    if ! validate_instance_code "$instance_code" 2>/dev/null; then
        log_error "Invalid instance code: $instance_code"
        return 1
    fi

    echo ""
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║     DIVE V3 Naming Conventions: ${instance_code}${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    print_naming_info "$instance_code"

    echo "Environment Variables:"
    echo "  KEYCLOAK_ADMIN_PASSWORD: $(get_keycloak_admin_password_var "$instance_code")"
    echo "  KEYCLOAK_CLIENT_SECRET:  $(get_keycloak_client_secret_var "$instance_code")"
    echo "  NEXTAUTH_SECRET:         $(get_nextauth_secret_var "$instance_code")"
    echo ""
}

##
# Validate naming conventions across all instances
##
cmd_naming_validate() {
    echo ""
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║     DIVE V3 Naming Convention Validation${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    log_step "Validating docker-compose.yml files..."

    local total=0
    local valid=0
    local invalid=0
    local issues=()

    for instance_dir in "${DIVE_ROOT}/instances"/*; do
        if [ ! -d "$instance_dir" ]; then
            continue
        fi

        local instance_code=$(basename "$instance_dir" | tr '[:lower:]' '[:upper:]')

        # Skip special directories
        if [ "$instance_code" = "SHARED" ] || [ "$instance_code" = "TEMPLATE" ]; then
            continue
        fi

        if ! validate_instance_code "$instance_code" 2>/dev/null; then
            continue
        fi

        total=$((total + 1))

        local compose_file="${instance_dir}/docker-compose.yml"
        if [ ! -f "$compose_file" ]; then
            log_warn "$instance_code: docker-compose.yml not found"
            invalid=$((invalid + 1))
            issues+=("$instance_code: Missing docker-compose.yml")
            continue
        fi

        # Get expected values from naming conventions
        local expected_client_id=$(get_client_id "$instance_code")
        local expected_realm=$(get_realm_name "$instance_code")

        # Check actual values in docker-compose.yml
        local actual_auth_keycloak_id=$(grep "AUTH_KEYCLOAK_ID:" "$compose_file" | head -1 | sed 's/.*AUTH_KEYCLOAK_ID: *//' | tr -d '"' | tr -d ' ' || echo "")
        local actual_keycloak_client_id=$(grep "KEYCLOAK_CLIENT_ID:" "$compose_file" | head -1 | sed 's/.*KEYCLOAK_CLIENT_ID: *//' | tr -d '"' | tr -d ' ' || echo "")

        if [ "$actual_auth_keycloak_id" != "$expected_client_id" ] || [ "$actual_keycloak_client_id" != "$expected_client_id" ]; then
            log_error "$instance_code: Naming mismatch"
            echo "  Expected: $expected_client_id"
            echo "  AUTH_KEYCLOAK_ID: $actual_auth_keycloak_id"
            echo "  KEYCLOAK_CLIENT_ID: $actual_keycloak_client_id"
            invalid=$((invalid + 1))
            issues+=("$instance_code: Expected $expected_client_id, got AUTH=$actual_auth_keycloak_id, CLIENT=$actual_keycloak_client_id")
        else
            log_success "$instance_code: ✓ Correct naming convention"
            valid=$((valid + 1))
        fi
    done

    echo ""
    echo -e "${BOLD}Validation Summary:${NC}"
    echo "  Total instances:    $total"
    echo "  Valid:              $valid"
    echo "  Invalid:            $invalid"

    if [ "$invalid" -gt 0 ]; then
        echo ""
        log_error "Found $invalid instances with naming issues:"
        for issue in "${issues[@]}"; do
            echo "  • $issue"
        done
        echo ""
        log_info "Run './dive naming migrate' to fix these issues"
        return 1
    else
        echo ""
        log_success "All instances follow correct naming conventions!"
        return 0
    fi
}

##
# Migrate instances to current naming convention
##
cmd_naming_migrate() {
    local dry_run=false
    local no_backup=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run|-n)
                dry_run=true
                shift
                ;;
            --no-backup)
                no_backup=true
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                return 1
                ;;
        esac
    done

    local script="${DIVE_ROOT}/scripts/migrate-naming-convention.sh"

    if [ ! -f "$script" ]; then
        log_error "Migration script not found: $script"
        return 1
    fi

    local args=()
    if [ "$dry_run" = "true" ]; then
        args+=("--dry-run")
    fi
    if [ "$no_backup" = "true" ]; then
        args+=("--no-backup")
    fi

    bash "$script" "${args[@]}"
}

##
# Verify naming conventions are integrated into dive CLI
##
cmd_naming_verify() {
    echo ""
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║     DIVE V3 Naming Convention Integration Verification${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    local all_pass=true

    # Check 1: Naming conventions config file
    log_step "Checking naming conventions config..."
    if [ -f "${DIVE_ROOT}/config/naming-conventions.json" ]; then
        log_success "Config file exists: config/naming-conventions.json"
    else
        log_error "Config file missing: config/naming-conventions.json"
        all_pass=false
    fi

    # Check 2: Naming conventions library
    log_step "Checking naming conventions library..."
    if [ -f "${DIVE_ROOT}/scripts/lib/naming-conventions.sh" ]; then
        log_success "Library exists: scripts/lib/naming-conventions.sh"

        # Test library functions
        if declare -f get_client_id &>/dev/null && declare -f get_realm_name &>/dev/null; then
            log_success "Library functions loaded successfully"
        else
            log_error "Library functions not available"
            all_pass=false
        fi
    else
        log_error "Library missing: scripts/lib/naming-conventions.sh"
        all_pass=false
    fi

    # Check 3: Integration in spoke-init scripts
    log_step "Checking integration in spoke-init scripts..."
    local init_script="${DIVE_ROOT}/scripts/spoke-init/init-keycloak.sh"
    local mapper_script="${DIVE_ROOT}/scripts/spoke-init/configure-localized-mappers.sh"

    if grep -q "naming-conventions.sh" "$init_script" 2>/dev/null; then
        log_success "init-keycloak.sh uses naming conventions library"
    else
        log_error "init-keycloak.sh does NOT use naming conventions library"
        all_pass=false
    fi

    if grep -q "naming-conventions.sh" "$mapper_script" 2>/dev/null; then
        log_success "configure-localized-mappers.sh uses naming conventions library"
    else
        log_error "configure-localized-mappers.sh does NOT use naming conventions library"
        all_pass=false
    fi

    # Check 4: Migration script
    log_step "Checking migration script..."
    if [ -f "${DIVE_ROOT}/scripts/migrate-naming-convention.sh" ]; then
        log_success "Migration script exists: scripts/migrate-naming-convention.sh"
    else
        log_error "Migration script missing: scripts/migrate-naming-convention.sh"
        all_pass=false
    fi

    # Check 5: Documentation
    log_step "Checking documentation..."
    if [ -f "${DIVE_ROOT}/docs/naming-conventions.md" ]; then
        log_success "Documentation exists: docs/naming-conventions.md"
    else
        log_warn "Documentation missing: docs/naming-conventions.md"
    fi

    echo ""
    if [ "$all_pass" = "true" ]; then
        echo -e "${BOLD}╔════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${BOLD}║  ✅ All Integration Checks Passed                              ║${NC}"
        echo -e "${BOLD}╚════════════════════════════════════════════════════════════════╝${NC}"
        return 0
    else
        echo -e "${BOLD}╔════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${BOLD}║  ❌ Some Integration Checks Failed                             ║${NC}"
        echo -e "${BOLD}╚════════════════════════════════════════════════════════════════╝${NC}"
        return 1
    fi
}

##
# Show help for naming module
##
cmd_naming_help() {
    echo ""
    echo -e "${BOLD}DIVE V3 CLI - Naming Conventions Module${NC}"
    echo ""
    echo "Manages centralized naming conventions for Keycloak realms, clients, and services."
    echo ""
    echo -e "${BOLD}Commands:${NC}"
    echo "  info <CODE>          Show naming conventions for an instance"
    echo "  validate             Validate all instances follow naming conventions"
    echo "  migrate [options]    Migrate instances to current naming convention"
    echo "  verify               Verify naming conventions are integrated into dive CLI"
    echo "  help                 Show this help"
    echo ""
    echo -e "${BOLD}Migrate Options:${NC}"
    echo "  --dry-run, -n        Preview changes without applying"
    echo "  --no-backup          Skip creating backups (not recommended)"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  ./dive naming info ESP                # Show naming info for Spain"
    echo "  ./dive --instance fra naming info     # Show naming info for France"
    echo "  ./dive naming validate                # Validate all instances"
    echo "  ./dive naming migrate --dry-run       # Preview migration"
    echo "  ./dive naming migrate                 # Run migration"
    echo "  ./dive naming verify                  # Verify integration"
    echo ""
    echo -e "${BOLD}Configuration:${NC}"
    echo "  Config file: config/naming-conventions.json"
    echo "  Library:     scripts/lib/naming-conventions.sh"
    echo "  Migration:   scripts/migrate-naming-convention.sh"
    echo ""
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_naming() {
    local subcommand="${1:-help}"
    shift || true

    case "$subcommand" in
        info)
            cmd_naming_info "$@"
            ;;
        validate)
            cmd_naming_validate "$@"
            ;;
        migrate)
            cmd_naming_migrate "$@"
            ;;
        verify)
            cmd_naming_verify "$@"
            ;;
        help|--help|-h)
            cmd_naming_help
            ;;
        *)
            log_error "Unknown command: $subcommand"
            echo ""
            cmd_naming_help
            exit 1
            ;;
    esac
}

# Mark module as loaded
export DIVE_NAMING_MODULE_LOADED=1


