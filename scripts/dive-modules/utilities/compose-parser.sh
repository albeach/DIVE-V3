#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Docker Compose Parser Utility
# =============================================================================
# Parses docker-compose.yml files to extract service metadata dynamically
# Eliminates hardcoded service lists in deployment scripts
# =============================================================================
# Created: 2026-01-25
# Purpose: Phase 2 - Eliminate Technical Debt (Dynamic Service Discovery)
# =============================================================================

# Prevent multiple sourcing
[ -n "${COMPOSE_PARSER_LOADED:-}" ] && return 0
export COMPOSE_PARSER_LOADED=1

# =============================================================================
# DEPENDENCIES
# =============================================================================

# Ensure common functions loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    PARSER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    MODULES_DIR="$(cd "$PARSER_DIR/.." && pwd)"
    if [ -f "${MODULES_DIR}/common.sh" ]; then
        source "${MODULES_DIR}/common.sh"
    fi
fi

# Verify yq or docker compose config available
if ! command -v yq &>/dev/null && ! ${DOCKER_CMD:-docker} compose version &>/dev/null; then
    log_error "compose-parser requires 'yq' or 'docker compose' for YAML parsing"
    log_error "Install yq: brew install yq"
    return 1
fi

# =============================================================================
# COMPOSE PARSING FUNCTIONS
# =============================================================================

##
# Get all service names from docker-compose file
#
# Arguments:
#   $1 - Path to docker-compose file
#
# Returns:
#   Space-separated list of service names
##
compose_get_services() {
    local compose_file="${1:?compose file required}"

    if [ ! -f "$compose_file" ]; then
        log_error "Compose file not found: $compose_file"
        return 1
    fi

    # Try yq first (faster and more reliable)
    if command -v yq &>/dev/null; then
        yq eval '.services | keys | .[]' "$compose_file" 2>/dev/null | xargs
    else
        # Fallback: Use docker compose config (slower but works)
        ${DOCKER_CMD:-docker} compose -f "$compose_file" config --services 2>/dev/null | xargs
    fi
}

##
# Get a specific label value from a service
#
# Arguments:
#   $1 - Service name
#   $2 - Label key (e.g., "dive.service.class")
#   $3 - Path to docker-compose file
#
# Returns:
#   Label value or empty string if not found
##
compose_get_service_label() {
    local service="${1:?service name required}"
    local label_key="${2:?label key required}"
    local compose_file="${3:?compose file required}"

    if [ ! -f "$compose_file" ]; then
        log_error "Compose file not found: $compose_file"
        return 1
    fi

    if command -v yq &>/dev/null; then
        # Extract label value using yq
        local label_value
        label_value=$(yq eval ".services.[\"$service\"].labels.[\"$label_key\"]" "$compose_file" 2>/dev/null)
        
        # Return empty if null or "null" string
        if [ "$label_value" = "null" ] || [ -z "$label_value" ]; then
            echo ""
        else
            echo "$label_value"
        fi
    else
        # Fallback: Parse docker compose config output
        local config=$(${DOCKER_CMD:-docker} compose -f "$compose_file" config 2>/dev/null)
        local label_value=$(echo "$config" | grep -A 50 "^  $service:" | grep -A 30 "labels:" | grep "$label_key:" | head -n1 | cut -d':' -f2- | xargs)
        
        echo "$label_value"
    fi
}

##
# Get dependencies for a specific service
#
# Arguments:
#   $1 - Service name
#   $2 - Path to docker-compose file
#
# Returns:
#   Comma-separated list of dependencies
##
compose_get_dependencies() {
    local service="${1:?service name required}"
    local compose_file="${2:?compose file required}"

    if [ ! -f "$compose_file" ]; then
        log_error "Compose file not found: $compose_file"
        return 1
    fi

    if command -v yq &>/dev/null; then
        # Extract depends_on keys
        local deps=$(yq eval ".services.[\"$service\"].depends_on | keys | .[]" "$compose_file" 2>/dev/null)

        if [ -z "$deps" ]; then
            echo "none"
        else
            echo "$deps" | tr '\n' ',' | sed 's/,$//'
        fi
    else
        # Fallback: Parse docker compose config output
        local config=$(${DOCKER_CMD:-docker} compose -f "$compose_file" config 2>/dev/null)
        local deps=$(echo "$config" | grep -A 20 "^  $service:" | grep -A 10 "depends_on:" | grep "^      [a-z]" | awk '{print $1}' | tr -d ':' | tr '\n' ',')

        if [ -z "$deps" ]; then
            echo "none"
        else
            echo "$deps" | sed 's/,$//'
        fi
    fi
}

##
# Get label value for a specific service
#
# Arguments:
#   $1 - Service name
#   $2 - Label key (e.g., "dive.service.class")
#   $3 - Path to docker-compose file
#
# Returns:
#   Label value or empty string if not found
##
compose_get_label() {
    local service="${1:?service name required}"
    local label_key="${2:?label key required}"
    local compose_file="${3:?compose file required}"

    if [ ! -f "$compose_file" ]; then
        log_error "Compose file not found: $compose_file"
        return 1
    fi

    if command -v yq &>/dev/null; then
        # Use proper yq syntax for label lookup
        local result=$(yq eval ".services.\"$service\".labels.\"$label_key\" // \"\"" "$compose_file" 2>/dev/null | tr -d '"')
        echo "$result"
    else
        # Fallback: Parse docker compose config
        ${DOCKER_CMD:-docker} compose -f "$compose_file" config 2>/dev/null | \
            grep -A 50 "^  $service:" | \
            grep -A 20 "labels:" | \
            grep "$label_key" | \
            cut -d: -f2- | \
            tr -d ' "'
    fi
}

##
# Get all services with a specific label value
#
# Arguments:
#   $1 - Label key (e.g., "dive.service.class")
#   $2 - Label value (e.g., "core")
#   $3 - Path to docker-compose file
#
# Returns:
#   Space-separated list of service names
##
compose_get_services_by_label() {
    local label_key="${1:?label key required}"
    local label_value="${2:?label value required}"
    local compose_file="${3:?compose file required}"

    if [ ! -f "$compose_file" ]; then
        log_error "Compose file not found: $compose_file"
        return 1
    fi

    local all_services=$(compose_get_services "$compose_file")
    local matching_services=""

    for service in $all_services; do
        local value=$(compose_get_label "$service" "$label_key" "$compose_file")
        if [ "$value" = "$label_value" ]; then
            matching_services="$matching_services $service"
        fi
    done

    echo "$matching_services" | xargs
}

##
# Get services by classification (convenience wrapper)
#
# Arguments:
#   $1 - Classification: "core", "optional", or "stretch"
#   $2 - Path to docker-compose file
#
# Returns:
#   Space-separated list of service names
##
compose_get_services_by_class() {
    local class="${1:?class required (core|optional|stretch)}"
    local compose_file="${2:?compose file required}"

    compose_get_services_by_label "dive.service.class" "$class" "$compose_file"
}

##
# Build dependency graph from docker-compose file
#
# Arguments:
#   $1 - Path to docker-compose file
#   $2 - Output file for dependency graph (JSON format)
#
# Returns:
#   0 on success, 1 on failure
##
compose_build_dependency_graph() {
    local compose_file="${1:?compose file required}"
    local output_file="${2:?output file required}"

    if [ ! -f "$compose_file" ]; then
        log_error "Compose file not found: $compose_file"
        return 1
    fi

    local services=$(compose_get_services "$compose_file")

    # Start JSON object
    echo "{" > "$output_file"
    echo '  "services": {' >> "$output_file"

    local first=true
    for service in $services; do
        if [ "$first" = "false" ]; then
            echo "," >> "$output_file"
        fi
        first=false

        local deps=$(compose_get_dependencies "$service" "$compose_file")
        local class=$(compose_get_label "$service" "dive.service.class" "$compose_file")

        # Default class to "unclassified" if not set
        [ -z "$class" ] && class="unclassified"

        echo -n "    \"$service\": {" >> "$output_file"
        echo -n "\"dependencies\": \"$deps\", " >> "$output_file"
        echo -n "\"class\": \"$class\"" >> "$output_file"
        echo -n "}" >> "$output_file"
    done

    echo "" >> "$output_file"
    echo "  }" >> "$output_file"
    echo "}" >> "$output_file"

    log_success "Dependency graph written to $output_file"
    return 0
}

##
# Calculate dependency levels for parallel startup
#
# Arguments:
#   $1 - Path to docker-compose file
#
# Returns:
#   JSON object with services grouped by dependency level
##
compose_calculate_levels() {
    local compose_file="${1:?compose file required}"

    if [ ! -f "$compose_file" ]; then
        log_error "Compose file not found: $compose_file"
        return 1
    fi

    local services=$(compose_get_services "$compose_file")
    declare -A service_levels
    local max_level=0

    # Calculate level for each service
    for service in $services; do
        local level=$(_compose_calculate_service_level "$service" "$compose_file" "" 0)
        service_levels["$service"]=$level
        [ $level -gt $max_level ] && max_level=$level
    done

    # Output JSON grouped by level
    echo "{"
    for ((lvl=0; lvl<=max_level; lvl++)); do
        echo "  \"level_$lvl\": ["
        local first=true
        for service in $services; do
            if [ "${service_levels[$service]}" = "$lvl" ]; then
                [ "$first" = "false" ] && echo ","
                echo -n "    \"$service\""
                first=false
            fi
        done
        echo ""
        if [ $lvl -lt $max_level ]; then
            echo "  ],"
        else
            echo "  ]"
        fi
    done
    echo "}"
}

##
# Calculate dependency level for a single service (internal helper)
#
# Arguments:
#   $1 - Service name
#   $2 - Compose file path
#   $3 - Current path (for cycle detection)
#   $4 - Current depth (for recursion limit)
#
# Returns:
#   Dependency level (0 = no deps, 1+ = depends on lower levels)
##
_compose_calculate_service_level() {
    local service="$1"
    local compose_file="$2"
    local path="$3"
    local depth="$4"

    # Recursion limit (prevent infinite loops)
    if [ $depth -gt 10 ]; then
        log_warn "Recursion limit reached for $service"
        echo "0"
        return
    fi

    # Cycle detection
    if [[ " $path " =~ " $service " ]]; then
        log_warn "Circular dependency detected: $path -> $service"
        echo "0"
        return
    fi

    local deps=$(compose_get_dependencies "$service" "$compose_file")

    if [ "$deps" = "none" ] || [ -z "$deps" ]; then
        echo "0"
        return
    fi

    # Calculate max level of dependencies + 1
    local max_dep_level=0
    IFS=',' read -ra DEP_ARRAY <<< "$deps"

    for dep in "${DEP_ARRAY[@]}"; do
        dep=$(echo "$dep" | xargs)  # Trim whitespace
        local dep_level=$(_compose_calculate_service_level "$dep" "$compose_file" "$path $service" $((depth + 1)))
        [ $dep_level -gt $max_dep_level ] && max_dep_level=$dep_level
    done

    echo $((max_dep_level + 1))
}

##
# Validate docker-compose file
#
# Arguments:
#   $1 - Path to docker-compose file
#
# Returns:
#   0 on success, 1 on validation errors
##
compose_validate() {
    local compose_file="${1:?compose file required}"

    if [ ! -f "$compose_file" ]; then
        log_error "Compose file not found: $compose_file"
        return 1
    fi

    log_verbose "Validating compose file: $compose_file"

    # Use docker compose config to validate syntax
    if ! ${DOCKER_CMD:-docker} compose -f "$compose_file" config >/dev/null 2>&1; then
        log_error "Compose file validation failed (syntax errors)"
        return 1
    fi

    log_success "Compose file validation passed"
    return 0
}

##
# Print service statistics
#
# Arguments:
#   $1 - Path to docker-compose file
##
compose_print_stats() {
    local compose_file="${1:?compose file required}"

    if [ ! -f "$compose_file" ]; then
        log_error "Compose file not found: $compose_file"
        return 1
    fi

    local all_services=$(compose_get_services "$compose_file")
    local service_count=$(echo "$all_services" | wc -w)

    local core_services=$(compose_get_services_by_class "core" "$compose_file" 2>/dev/null || echo "")
    local core_count=$(echo "$core_services" | wc -w | tr -d ' ')
    [ -z "$core_services" ] && core_count=0

    local stretch_services=$(compose_get_services_by_class "stretch" "$compose_file" 2>/dev/null || echo "")
    local stretch_count=$(echo "$stretch_services" | wc -w | tr -d ' ')
    [ -z "$stretch_services" ] && stretch_count=0

    local optional_services=$(compose_get_services_by_class "optional" "$compose_file" 2>/dev/null || echo "")
    local optional_count=$(echo "$optional_services" | wc -w | tr -d ' ')
    [ -z "$optional_services" ] && optional_count=0

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Docker Compose Service Statistics"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  File: $compose_file"
    echo "  Total Services: $service_count"
    echo ""
    echo "  Classification:"
    echo "    CORE:     $core_count services"
    echo "    STRETCH:  $stretch_count services"
    echo "    OPTIONAL: $optional_count services"
    echo "    UNCLASSIFIED: $((service_count - core_count - stretch_count - optional_count)) services"
    echo ""
    echo "  All Services:"
    for service in $all_services; do
        local class=$(compose_get_label "$service" "dive.service.class" "$compose_file" 2>/dev/null || echo "unclassified")
        printf "    • %-20s [%s]\n" "$service" "$class"
    done
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f compose_get_services
export -f compose_get_dependencies
export -f compose_get_label
export -f compose_get_service_label
export -f compose_get_services_by_label
export -f compose_get_services_by_class
export -f compose_build_dependency_graph
export -f compose_calculate_levels
export -f compose_validate
export -f compose_print_stats

# =============================================================================
# SPOKE-SPECIFIC FUNCTIONS
# =============================================================================

##
# Get all service names from spoke instance compose file
#
# Arguments:
#   $1 - Instance code (e.g., FRA, GBR, DEU)
#
# Returns:
#   Space-separated list of service names (without instance suffix)
#   Example: "postgres mongodb redis keycloak opa backend frontend kas opal-client"
##
compose_get_spoke_services() {
    local instance_code="${1:?instance code required}"
    local code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
    local compose_file="${DIVE_ROOT}/instances/${code_lower}/docker-compose.yml"

    if [ ! -f "$compose_file" ]; then
        log_error "Spoke compose file not found: $compose_file"
        return 1
    fi

    # Get all services and strip instance suffix
    # Service names in spoke: postgres-fra, mongodb-fra, etc.
    # We return: postgres, mongodb, etc. (for compatibility with existing code)
    local services=$(compose_get_services "$compose_file")

    # Strip instance suffix from each service name
    local clean_services=""
    for svc in $services; do
        # Remove -{code} suffix (e.g., postgres-fra → postgres)
        local clean_name="${svc%-${code_lower}}"
        clean_services="$clean_services $clean_name"
    done

    echo "$clean_services" | xargs
}

##
# Get service class (core/optional/stretch) for a spoke service
#
# Arguments:
#   $1 - Instance code
#   $2 - Service name (without instance suffix, e.g., "postgres" not "postgres-fra")
#
# Returns:
#   Service class: "core", "optional", "stretch", or empty if not found
##
compose_get_spoke_service_class() {
    local instance_code="${1:?instance code required}"
    local service="${2:?service name required}"
    local code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
    local compose_file="${DIVE_ROOT}/instances/${code_lower}/docker-compose.yml"

    if [ ! -f "$compose_file" ]; then
        log_error "Spoke compose file not found: $compose_file"
        return 1
    fi

    # Spoke services have instance suffix in compose file
    local service_with_suffix="${service}-${code_lower}"

    compose_get_service_label "$service_with_suffix" "dive.service.class" "$compose_file"
}

##
# Get spoke services by class
#
# Arguments:
#   $1 - Instance code
#   $2 - Service class: "core", "optional", or "stretch"
#
# Returns:
#   Space-separated list of service names in that class
##
compose_get_spoke_services_by_class() {
    local instance_code="${1:?instance code required}"
    local class="${2:?service class required}"

    local all_services=$(compose_get_spoke_services "$instance_code")
    local filtered_services=""

    for service in $all_services; do
        local service_class=$(compose_get_spoke_service_class "$instance_code" "$service")
        if [ "$service_class" = "$class" ]; then
            filtered_services="$filtered_services $service"
        fi
    done

    echo "$filtered_services" | xargs
}

##
# Get spoke service dependencies
#
# Arguments:
#   $1 - Instance code
#   $2 - Service name (without instance suffix)
#
# Returns:
#   Comma-separated list of dependencies (without instance suffix)
##
compose_get_spoke_dependencies() {
    local instance_code="${1:?instance code required}"
    local service="${2:?service name required}"
    local code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
    local compose_file="${DIVE_ROOT}/instances/${code_lower}/docker-compose.yml"

    if [ ! -f "$compose_file" ]; then
        log_error "Spoke compose file not found: $compose_file"
        return 1
    fi

    # Spoke services have instance suffix
    local service_with_suffix="${service}-${code_lower}"
    local deps=$(compose_get_dependencies "$service_with_suffix" "$compose_file")

    # Strip instance suffix from dependencies
    if [ "$deps" != "none" ]; then
        local clean_deps=""
        IFS=',' read -ra DEP_ARRAY <<< "$deps"
        for dep in "${DEP_ARRAY[@]}"; do
            # Remove -{code} suffix
            local clean_dep="${dep%-${code_lower}}"
            if [ -z "$clean_deps" ]; then
                clean_deps="$clean_dep"
            else
                clean_deps="$clean_deps,$clean_dep"
            fi
        done
        echo "$clean_deps"
    else
        echo "none"
    fi
}

##
# Calculate dependency levels for spoke services
# Same algorithm as hub, but works with spoke compose files
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   Associative array printed as "service:level" pairs
#   Example output:
#     postgres:0
#     mongodb:0
#     redis:0
#     keycloak:1
#     backend:2
#     frontend:3
##
compose_calculate_spoke_dependency_levels() {
    local instance_code="${1:?instance code required}"
    local code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
    local compose_file="${DIVE_ROOT}/instances/${code_lower}/docker-compose.yml"

    if [ ! -f "$compose_file" ]; then
        log_error "Spoke compose file not found: $compose_file"
        return 1
    fi

    # Use existing compose parser function but adapt for spoke naming
    local all_services=$(compose_get_spoke_services "$instance_code")

    declare -A levels
    declare -A visited

    # Calculate level for each service
    calculate_level() {
        local svc="$1"

        # Already calculated
        if [ -n "${visited[$svc]}" ]; then
            echo "${levels[$svc]}"
            return 0
        fi

        # Mark as visiting (cycle detection)
        visited[$svc]=1

        # Get dependencies
        local deps=$(compose_get_spoke_dependencies "$instance_code" "$svc")

        if [ "$deps" = "none" ]; then
            levels[$svc]=0
            echo 0
            return 0
        fi

        # Find max dependency level
        local max_level=0
        IFS=',' read -ra DEP_ARRAY <<< "$deps"
        for dep in "${DEP_ARRAY[@]}"; do
            local dep_level=$(calculate_level "$dep")
            if [ "$dep_level" -ge "$max_level" ]; then
                max_level=$((dep_level))
            fi
        done

        # This service is one level higher than its highest dependency
        levels[$svc]=$((max_level + 1))
        echo "$((max_level + 1))"
        return 0
    }

    # Calculate levels for all services
    for service in $all_services; do
        calculate_level "$service" >/dev/null
    done

    # Output results as service:level pairs
    for service in $all_services; do
        echo "${service}:${levels[$service]}"
    done
}

log_verbose "Compose parser utility loaded"
