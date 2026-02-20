#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Naming Conventions Library
# =============================================================================
# Single source of truth for all naming patterns across DIVE V3
# Usage: source scripts/lib/naming-conventions.sh
# =============================================================================

set -e

# Path to centralized naming config
NAMING_CONFIG="${DIVE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}/config/naming-conventions.json"

# Verify config exists
if [ ! -f "$NAMING_CONFIG" ]; then
    echo "ERROR: Naming conventions config not found: $NAMING_CONFIG" >&2
    exit 1
fi

# =============================================================================
# KEYCLOAK NAMING
# =============================================================================

##
# Get Keycloak realm name for instance
# Usage: get_realm_name <INSTANCE_CODE>
# Example: get_realm_name ESP -> "dive-v3-broker-esp"
##
get_realm_name() {
    local instance_code="${1:-}"
    if [ -z "$instance_code" ]; then
        echo "ERROR: Instance code required" >&2
        return 1
    fi

    local code_lower
    code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
    local pattern
    pattern=$(jq -r '.conventions.keycloak.realmPattern' "$NAMING_CONFIG")
    echo "${pattern//\{instance\}/$code_lower}"
}

##
# Get Keycloak client ID for instance
# Usage: get_client_id <INSTANCE_CODE>
# Example: get_client_id ESP -> "dive-v3-broker-esp"
##
get_client_id() {
    local instance_code="${1:-}"
    if [ -z "$instance_code" ]; then
        echo "ERROR: Instance code required" >&2
        return 1
    fi

    local code_lower
    code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
    local pattern
    pattern=$(jq -r '.conventions.keycloak.clientIdPattern' "$NAMING_CONFIG")
    echo "${pattern//\{instance\}/$code_lower}"
}

##
# Get Keycloak admin password environment variable name
# Usage: get_keycloak_admin_password_var <INSTANCE_CODE>
# Example: get_keycloak_admin_password_var ESP -> "KEYCLOAK_ADMIN_PASSWORD_ESP"
##
get_keycloak_admin_password_var() {
    local instance_code="${1:-}"
    if [ -z "$instance_code" ]; then
        echo "ERROR: Instance code required" >&2
        return 1
    fi

    local code_upper
    code_upper=$(echo "$instance_code" | tr '[:lower:]' '[:upper:]')
    local pattern
    pattern=$(jq -r '.conventions.keycloak.adminPasswordEnvPattern' "$NAMING_CONFIG")
    echo "${pattern//\{INSTANCE\}/$code_upper}"
}

##
# Get Keycloak client secret environment variable name
# Usage: get_keycloak_client_secret_var <INSTANCE_CODE>
# Example: get_keycloak_client_secret_var ESP -> "KEYCLOAK_CLIENT_SECRET_ESP"
##
get_keycloak_client_secret_var() {
    local instance_code="${1:-}"
    if [ -z "$instance_code" ]; then
        echo "ERROR: Instance code required" >&2
        return 1
    fi

    local code_upper
    code_upper=$(echo "$instance_code" | tr '[:lower:]' '[:upper:]')
    local pattern
    pattern=$(jq -r '.conventions.keycloak.clientSecretEnvPattern' "$NAMING_CONFIG")
    echo "${pattern//\{INSTANCE\}/$code_upper}"
}

# =============================================================================
# DOCKER NAMING
# =============================================================================

##
# Get container name for service
# Usage: get_container_name <INSTANCE_CODE> <SERVICE> [IS_HUB]
# Example: get_container_name ESP frontend -> "dive-spoke-esp-frontend"
# Example: get_container_name USA backend true -> "dive-hub-backend"
##
get_container_name() {
    local instance_code="${1:-}"
    local service="${2:-}"
    local is_hub="${3:-false}"

    if [ -z "$instance_code" ] || [ -z "$service" ]; then
        echo "ERROR: Instance code and service required" >&2
        return 1
    fi

    local code_lower
    code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
    local prefix

    if [ "$is_hub" = "true" ] || [ "$instance_code" = "USA" ]; then
        prefix=$(jq -r '.conventions.docker.hubPrefix' "$NAMING_CONFIG")
    else
        prefix=$(jq -r '.conventions.docker.spokePrefix' "$NAMING_CONFIG")
    fi

    local pattern
    pattern=$(jq -r '.conventions.docker.containerNamePattern' "$NAMING_CONFIG")
    pattern="${pattern//\{prefix\}/$prefix}"
    pattern="${pattern//\{instance\}/$code_lower}"
    pattern="${pattern//\{service\}/$service}"

    echo "$pattern"
}

##
# Get network name for instance
# Usage: get_network_name <INSTANCE_CODE>
# Example: get_network_name ESP -> "dive-network-esp"
##
get_network_name() {
    local instance_code="${1:-}"
    if [ -z "$instance_code" ]; then
        echo "ERROR: Instance code required" >&2
        return 1
    fi

    local code_lower
    code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
    local pattern
    pattern=$(jq -r '.conventions.docker.networkNamePattern' "$NAMING_CONFIG")
    echo "${pattern//\{instance\}/$code_lower}"
}

##
# Get volume name for service
# Usage: get_volume_name <INSTANCE_CODE> <SERVICE>
# Example: get_volume_name ESP mongodb -> "dive-esp-mongodb-data"
##
get_volume_name() {
    local instance_code="${1:-}"
    local service="${2:-}"

    if [ -z "$instance_code" ] || [ -z "$service" ]; then
        echo "ERROR: Instance code and service required" >&2
        return 1
    fi

    local code_lower
    code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
    local pattern
    pattern=$(jq -r '.conventions.docker.volumeNamePattern' "$NAMING_CONFIG")
    pattern="${pattern//\{instance\}/$code_lower}"
    pattern="${pattern//\{service\}/$service}"

    echo "$pattern"
}

# =============================================================================
# NEXTAUTH NAMING
# =============================================================================

##
# Get NextAuth session secret environment variable name
# Usage: get_nextauth_secret_var <INSTANCE_CODE>
# Example: get_nextauth_secret_var ESP -> "NEXTAUTH_SECRET_ESP"
##
get_nextauth_secret_var() {
    local instance_code="${1:-}"
    if [ -z "$instance_code" ]; then
        echo "ERROR: Instance code required" >&2
        return 1
    fi

    local code_upper
    code_upper=$(echo "$instance_code" | tr '[:lower:]' '[:upper:]')
    local pattern
    pattern=$(jq -r '.conventions.nextauth.sessionSecretEnvPattern' "$NAMING_CONFIG")
    echo "${pattern//\{INSTANCE\}/$code_upper}"
}

# =============================================================================
# VALIDATION
# =============================================================================

##
# Validate instance code format
# Usage: validate_instance_code <CODE>
# Returns: 0 if valid, 1 if invalid
##
validate_instance_code() {
    local code="${1:-}"

    if [ -z "$code" ]; then
        echo "ERROR: Instance code is empty" >&2
        return 1
    fi

    local expected_length
    expected_length=$(jq -r '.validation.instanceCodeLength' "$NAMING_CONFIG")

    if [ ${#code} -ne "$expected_length" ]; then
        echo "ERROR: Instance code must be $expected_length characters (ISO 3166-1 alpha-3)" >&2
        return 1
    fi

    # Must be uppercase letters only
    if ! [[ "$code" =~ ^[A-Z]+$ ]]; then
        echo "ERROR: Instance code must be uppercase letters (A-Z)" >&2
        return 1
    fi

    return 0
}

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

##
# Print naming conventions for an instance
# Usage: print_naming_info <INSTANCE_CODE>
##
print_naming_info() {
    local instance_code="${1:-}"
    if [ -z "$instance_code" ]; then
        echo "ERROR: Instance code required" >&2
        return 1
    fi

    echo "Naming Conventions for: $instance_code"
    echo "=========================================="
    echo "Realm Name:         $(get_realm_name "$instance_code")"
    echo "Client ID:          $(get_client_id "$instance_code")"
    echo "Frontend Container: $(get_container_name "$instance_code" frontend)"
    echo "Backend Container:  $(get_container_name "$instance_code" backend)"
    echo "Keycloak Container: $(get_container_name "$instance_code" keycloak)"
    echo "MongoDB Container:  $(get_container_name "$instance_code" mongodb)"
    echo "Network Name:       $(get_network_name "$instance_code")"
    echo ""
}

# Export functions for use in other scripts
export -f get_realm_name
export -f get_client_id
export -f get_keycloak_admin_password_var
export -f get_keycloak_client_secret_var
export -f get_container_name
export -f get_network_name
export -f get_volume_name
export -f get_nextauth_secret_var
export -f validate_instance_code
export -f print_naming_info

# Mark library as loaded
export DIVE_NAMING_LIB_LOADED=1


