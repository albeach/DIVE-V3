#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Localization Sub-Module
# =============================================================================
# Commands: localize, localize-mappers, localize-users
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-07
# =============================================================================

# =============================================================================
# PROTOCOL MAPPER LOCALIZATION
# =============================================================================

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

# =============================================================================
# USER ATTRIBUTE LOCALIZATION
# =============================================================================

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

# =============================================================================
# FULL LOCALIZATION (MAPPERS + USERS)
# =============================================================================

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