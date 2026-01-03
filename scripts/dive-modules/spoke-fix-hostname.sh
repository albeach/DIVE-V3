#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 - Spoke Keycloak Hostname Fix
# =============================================================================
# Fixes Keycloak issuer URL mismatch by updating KC_HOSTNAME configuration
# to use correct Keycloak v26+ syntax.
#
# Problem: Keycloak returns wrong issuer port (e.g., 8468 instead of 8476)
# Solution: Add/update KC_HOSTNAME_URL to explicitly set the full issuer base
#
# Usage:
#   ./dive spoke fix-hostname          # Fix current instance
#   ./dive spoke fix-hostname --all    # Fix all initialized spokes
#
# This fix is automatically applied during spoke up/restart
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

export DIVE_SPOKE_FIX_HOSTNAME_LOADED=1

##
# Fix Keycloak hostname configuration in docker-compose.yml
##
spoke_fix_keycloak_hostname() {
    local instance_code="${1:-${INSTANCE}}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local compose_file="$spoke_dir/docker-compose.yml"

    if [ ! -f "$compose_file" ]; then
        log_error "Spoke not initialized: $code_upper"
        return 1
    fi

    log_step "Fixing Keycloak hostname configuration for $code_upper..."

    # Get the spoke ports from SSOT
    eval "$(get_instance_ports "$code_upper")"
    
    # Backup the compose file
    cp "$compose_file" "${compose_file}.bak.$(date +%Y%m%d_%H%M%S)"

    # Check if keycloak service exists and needs fixing
    if ! grep -q "keycloak-${code_lower}:" "$compose_file"; then
        log_warn "No Keycloak service found in docker-compose.yml"
        return 1
    fi

    # Create a temp file for the fixed configuration
    local temp_file=$(mktemp)

    # Use awk to update the Keycloak environment section
    awk -v code_lower="$code_lower" -v kc_port="$SPOKE_KEYCLOAK_HTTPS_PORT" '
    /^  keycloak-/ {
        in_keycloak=1
        print
        next
    }
    in_keycloak && /^  [a-zA-Z]/ {
        # Exiting keycloak service block
        in_keycloak=0
        in_environment=0
    }
    in_keycloak && /^    environment:/ {
        in_environment=1
        print
        next
    }
    in_keycloak && in_environment && /^    [a-z]/ {
        # End of environment block
        in_environment=0
    }
    in_keycloak && in_environment {
        # Remove old/deprecated KC_HOSTNAME settings
        if ($0 ~ /KC_HOSTNAME_PORT:/ || $0 ~ /KC_HOSTNAME_STRICT_HTTPS:/ || $0 ~ /KC_PROXY: edge/) {
            next  # Skip these lines
        }
        # Update KC_HOSTNAME to ensure localhost
        if ($0 ~ /KC_HOSTNAME:/) {
            print "      KC_HOSTNAME: localhost"
            next
        }
        # Update KC_HOSTNAME_STRICT
        if ($0 ~ /KC_HOSTNAME_STRICT:/) {
            print "      KC_HOSTNAME_STRICT: \"false\""
            next
        }
        # Replace KC_PROXY: edge with KC_PROXY_HEADERS: xforwarded
        if ($0 ~ /KC_PROXY:/) {
            print "      KC_PROXY_HEADERS: xforwarded"
            next
        }
        # Add KC_HOSTNAME_URL after KC_HOSTNAME_STRICT if not present
        if ($0 ~ /KC_HOSTNAME_STRICT:/ || $0 ~ /KC_PROXY_HEADERS:/) {
            print
            # Check if KC_HOSTNAME_URL already exists in the file
            if (!hostname_url_added && !hostname_url_exists) {
                print "      # CRITICAL: Explicitly set base URL to fix issuer port"
                print "      KC_HOSTNAME_URL: https://localhost:" kc_port
                hostname_url_added=1
            }
            next
        }
        # Track if KC_HOSTNAME_URL already exists
        if ($0 ~ /KC_HOSTNAME_URL:/) {
            # Update it with correct port
            print "      KC_HOSTNAME_URL: https://localhost:" kc_port
            hostname_url_exists=1
            next
        }
    }
    { print }
    ' "$compose_file" > "$temp_file"

    # Replace the original file
    mv "$temp_file" "$compose_file"

    log_success "Fixed Keycloak hostname configuration for $code_upper"
    log_info "Backup saved to: ${compose_file}.bak.*"
    
    return 0
}

##
# Fix all initialized spokes
##
spoke_fix_all_hostnames() {
    log_step "Fixing Keycloak hostname configuration for all spokes..."
    
    local fixed=0
    local failed=0
    
    for spoke_dir in "${DIVE_ROOT}"/instances/*/; do
        if [ ! -d "$spoke_dir" ]; then
            continue
        fi
        
        local code_lower=$(basename "$spoke_dir")
        local code_upper=$(upper "$code_lower")
        
        if [ -f "$spoke_dir/docker-compose.yml" ]; then
            if spoke_fix_keycloak_hostname "$code_upper"; then
                ((fixed++))
            else
                ((failed++))
            fi
        fi
    done
    
    echo ""
    log_success "Fixed $fixed spoke(s)"
    if [ $failed -gt 0 ]; then
        log_warn "$failed spoke(s) failed to fix"
    fi
}

##
# Check if fix is needed
##
spoke_needs_hostname_fix() {
    local instance_code="${1:-${INSTANCE}}"
    local code_lower=$(lower "$instance_code")
    local compose_file="${DIVE_ROOT}/instances/${code_lower}/docker-compose.yml"
    
    if [ ! -f "$compose_file" ]; then
        return 1  # Not initialized
    fi
    
    # Check if KC_HOSTNAME_URL is present
    if grep -q "KC_HOSTNAME_URL:" "$compose_file"; then
        return 1  # Already fixed
    fi
    
    # Check if using old KC_PROXY: edge syntax
    if grep -q "KC_PROXY: edge" "$compose_file"; then
        return 0  # Needs fix
    fi
    
    # Check if KC_HOSTNAME_PORT is present (deprecated)
    if grep -q "KC_HOSTNAME_PORT:" "$compose_file"; then
        return 0  # Needs fix
    fi
    
    return 1  # Probably okay
}

##
# Auto-fix during spoke up (if needed)
##
spoke_auto_fix_hostname() {
    local instance_code="${1:-${INSTANCE}}"
    
    if spoke_needs_hostname_fix "$instance_code"; then
        log_warn "Detected outdated Keycloak hostname configuration"
        log_info "Auto-fixing before startup..."
        spoke_fix_keycloak_hostname "$instance_code" || {
            log_error "Auto-fix failed - manual intervention may be required"
            return 1
        }
        log_success "Auto-fix completed - proceeding with startup"
    fi
    
    return 0
}
