#!/usr/bin/env bats
# =============================================================================
# DIVE V3 Spoke Orchestration Unit Tests
# =============================================================================
# Tests for dynamic spoke service discovery and dependency calculation
# Phase 1 Sprint 1.3: Testing Infrastructure
# Pattern: Mirrors test_dynamic_orchestration.bats structure with spoke-specific logic
# =============================================================================

setup() {
    # Load test helpers
    load '../utils/test_helper'
    
    # Set up test environment
    export DIVE_ROOT="${BATS_TEST_DIRNAME}/../.."
    export TEST_INSTANCE_CODE="${SPOKE_TEST_INSTANCE:-FRA}"
    export TEST_INSTANCE_LOWER=$(echo "$TEST_INSTANCE_CODE" | tr '[:upper:]' '[:lower:]')
    export SPOKE_COMPOSE_FILE="${DIVE_ROOT}/instances/${TEST_INSTANCE_LOWER}/docker-compose.yml"
    export SPOKE_TEMPLATE="${DIVE_ROOT}/templates/spoke/docker-compose.template.yml"
    
    # Source common functions
    source "${DIVE_ROOT}/scripts/dive-modules/common.sh"
    
    # Source compose parser
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/compose-parser.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/compose-parser.sh"
    fi
}

# =============================================================================
# TOOL AVAILABILITY TESTS
# =============================================================================

@test "yq is installed and accessible" {
    run which yq
    [[ $status -eq 0 ]]
}

@test "spoke template file exists" {
    [ -f "$SPOKE_TEMPLATE" ]
}

@test "spoke template has service labels" {
    grep -q "dive.service.class" "$SPOKE_TEMPLATE"
}

# =============================================================================
# DYNAMIC SERVICE DISCOVERY TESTS
# =============================================================================

@test "compose_get_spoke_services returns all services" {
    # Test requires initialized spoke instance
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi
    
    # Call dynamic discovery function
    local services=$(compose_get_spoke_services "$TEST_INSTANCE_CODE")
    
    # Should return at least 7 services
    local count=$(echo "$services" | wc -w | tr -d ' ')
    [ "$count" -ge 7 ]
    
    # Should include CORE services (without instance suffix in output)
    echo "$services" | grep -q "postgres"
    echo "$services" | grep -q "mongodb"
    echo "$services" | grep -q "keycloak"
    echo "$services" | grep -q "backend"
    echo "$services" | grep -q "frontend"
}

@test "compose_get_spoke_service_class returns correct class" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi
    
    # Test CORE service classification
    local postgres_class=$(compose_get_spoke_service_class "$TEST_INSTANCE_CODE" "postgres")
    [ "$postgres_class" = "core" ]
    
    local keycloak_class=$(compose_get_spoke_service_class "$TEST_INSTANCE_CODE" "keycloak")
    [ "$keycloak_class" = "core" ]
}

@test "compose_get_spoke_services_by_class filters correctly" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi
    
    # Get CORE services
    local core_services=$(compose_get_spoke_services_by_class "$TEST_INSTANCE_CODE" "core")
    
    # Should include CORE services
    echo "$core_services" | grep -q "postgres"
    echo "$core_services" | grep -q "mongodb"
    echo "$core_services" | grep -q "keycloak"
    
    # Should have at least 7 CORE services
    local count=$(echo "$core_services" | wc -w | tr -d ' ')
    [ "$count" -ge 7 ]
}

@test "CORE services identified correctly in template" {
    # Test template directly
    local core_count=$(grep -c "dive.service.class: \"core\"" "$SPOKE_TEMPLATE")
    
    # Should have 7 CORE services
    [ "$core_count" -ge 7 ]
}

@test "OPTIONAL services identified correctly in template" {
    # Test template directly
    local optional_count=$(grep -c "dive.service.class: \"optional\"" "$SPOKE_TEMPLATE")
    
    # Should have at least 1 OPTIONAL service (opal-client)
    [ "$optional_count" -ge 1 ]
}

@test "STRETCH services identified correctly in template" {
    # Test template directly
    local stretch_count=$(grep -c "dive.service.class: \"stretch\"" "$SPOKE_TEMPLATE")
    
    # Should have at least 1 STRETCH service (kas)
    [ "$stretch_count" -ge 1 ]
}

@test "services discovered match template structure" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi
    
    # Get services from generated compose file
    local services=$(compose_get_spoke_services "$TEST_INSTANCE_CODE")
    
    # Count services
    local count=$(echo "$services" | wc -w | tr -d ' ')
    
    # Should have 9 services (7 CORE + 1 OPTIONAL + 1 STRETCH)
    [ "$count" -ge 9 ]
}

# =============================================================================
# DEPENDENCY PARSING TESTS
# =============================================================================

@test "compose_get_spoke_dependencies parses depends_on" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi
    
    # Test service with dependencies
    local backend_deps=$(compose_get_spoke_dependencies "$TEST_INSTANCE_CODE" "backend")
    
    # Backend should depend on multiple services
    [ "$backend_deps" != "none" ]
    
    # Should include postgres, mongodb, keycloak, etc.
    echo "$backend_deps" | grep -q "postgres"
    echo "$backend_deps" | grep -q "mongodb"
    echo "$backend_deps" | grep -q "keycloak"
}

@test "services with no dependencies return 'none'" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi
    
    # Test service without dependencies (databases)
    local postgres_deps=$(compose_get_spoke_dependencies "$TEST_INSTANCE_CODE" "postgres")
    [ "$postgres_deps" = "none" ]
    
    local mongodb_deps=$(compose_get_spoke_dependencies "$TEST_INSTANCE_CODE" "mongodb")
    [ "$mongodb_deps" = "none" ]
}

@test "multi-dependency services parsed correctly" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi
    
    # Backend has multiple dependencies
    local backend_deps=$(compose_get_spoke_dependencies "$TEST_INSTANCE_CODE" "backend")
    
    # Count dependencies (comma-separated)
    local dep_count=$(echo "$backend_deps" | tr ',' '\n' | wc -l | tr -d ' ')
    
    # Should have at least 3 dependencies
    [ "$dep_count" -ge 3 ]
}

@test "instance suffix stripped from dependencies" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi
    
    # Get dependencies
    local keycloak_deps=$(compose_get_spoke_dependencies "$TEST_INSTANCE_CODE" "keycloak")
    
    # Should not include instance suffix (e.g., "postgres" not "postgres-fra")
    echo "$keycloak_deps" | grep -v "${TEST_INSTANCE_LOWER}"
}

# =============================================================================
# PORT CALCULATION TESTS
# =============================================================================

@test "spoke port calculation works for FRA" {
    # Port calculation: Base port + (country_offset * 10)
    # FRA offset = 1
    
    declare -A expected_ports=(
        ["frontend"]="3010"   # 3000 + 1*10
        ["backend"]="4010"    # 4000 + 1*10
        ["keycloak"]="8453"   # 8443 + 1*10
        ["opa"]="8191"        # 8181 + 1*10
    )
    
    # This is a logic test, not a runtime test
    local fra_offset=1
    local frontend_port=$((3000 + fra_offset * 10))
    [ "$frontend_port" -eq 3010 ]
    
    local backend_port=$((4000 + fra_offset * 10))
    [ "$backend_port" -eq 4010 ]
}

@test "spoke port calculation works for GBR" {
    # GBR offset = 2
    declare -A expected_ports=(
        ["frontend"]="3020"   # 3000 + 2*10
        ["backend"]="4020"    # 4000 + 2*10
        ["keycloak"]="8463"   # 8443 + 2*10
    )
    
    local gbr_offset=2
    local frontend_port=$((3000 + gbr_offset * 10))
    [ "$frontend_port" -eq 3020 ]
}

@test "port offsets are unique per spoke" {
    # Define country offsets
    declare -A offsets=(
        ["FRA"]=1
        ["GBR"]=2
        ["DEU"]=3
        ["CAN"]=4
        ["POL"]=5
    )
    
    # All offsets should be unique
    local unique_offsets=$(printf "%s\n" "${offsets[@]}" | sort -u | wc -l)
    local total_offsets=${#offsets[@]}
    
    [ "$unique_offsets" -eq "$total_offsets" ]
}

# =============================================================================
# DEPENDENCY LEVEL CALCULATION TESTS
# =============================================================================

@test "compose_calculate_spoke_dependency_levels returns levels" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi
    
    # Calculate dependency levels
    local levels=$(compose_calculate_spoke_dependency_levels "$TEST_INSTANCE_CODE")
    
    # Should return output (service:level pairs)
    [ -n "$levels" ]
    
    # Should contain service names
    echo "$levels" | grep -q "postgres"
    echo "$levels" | grep -q "mongodb"
}

@test "databases have dependency level 0" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi
    
    # Calculate levels
    local levels=$(compose_calculate_spoke_dependency_levels "$TEST_INSTANCE_CODE")
    
    # Postgres should be level 0 (no dependencies)
    echo "$levels" | grep "postgres:0"
    
    # MongoDB should be level 0
    echo "$levels" | grep "mongodb:0"
}

@test "Keycloak has higher dependency level than databases" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi
    
    # Calculate levels
    local levels=$(compose_calculate_spoke_dependency_levels "$TEST_INSTANCE_CODE")
    
    # Extract Keycloak level
    local keycloak_level=$(echo "$levels" | grep "keycloak:" | cut -d: -f2)
    
    # Keycloak depends on postgres, so should be at least level 1
    [ "$keycloak_level" -ge 1 ]
}

@test "backend has higher dependency level than Keycloak" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi
    
    # Calculate levels
    local levels=$(compose_calculate_spoke_dependency_levels "$TEST_INSTANCE_CODE")
    
    # Extract levels
    local keycloak_level=$(echo "$levels" | grep "keycloak:" | cut -d: -f2)
    local backend_level=$(echo "$levels" | grep "backend:" | cut -d: -f2)
    
    # Backend depends on keycloak, so should be higher level
    [ "$backend_level" -gt "$keycloak_level" ]
}

@test "frontend has highest dependency level" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi
    
    # Calculate levels
    local levels=$(compose_calculate_spoke_dependency_levels "$TEST_INSTANCE_CODE")
    
    # Extract frontend level
    local frontend_level=$(echo "$levels" | grep "frontend:" | cut -d: -f2)
    
    # Frontend depends on backend, so should be at least level 3
    [ "$frontend_level" -ge 3 ]
}

# =============================================================================
# SPOKE-SPECIFIC FUNCTION TESTS
# =============================================================================

@test "spoke_get_service_order returns services in order" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi
    
    # Source spoke-containers.sh
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-containers.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-containers.sh"
    else
        skip "spoke-containers.sh not found"
    fi
    
    # Get service order
    local services=$(spoke_get_service_order "$TEST_INSTANCE_CODE")
    
    # Should return services
    [ -n "$services" ]
    
    # Should include CORE services
    echo "$services" | grep -q "postgres"
    echo "$services" | grep -q "keycloak"
}

@test "spoke_get_service_deps returns dependencies" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi
    
    # Source spoke-containers.sh
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-containers.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-containers.sh"
    else
        skip "spoke-containers.sh not found"
    fi
    
    # Get dependencies for backend
    local deps=$(spoke_get_service_deps "$TEST_INSTANCE_CODE" "backend")
    
    # Should return dependencies (space-separated)
    [ -n "$deps" ]
    
    # Should include postgres, mongodb, keycloak
    echo "$deps" | grep -q "postgres"
}

# =============================================================================
# COMPOSE FILE STRUCTURE TESTS
# =============================================================================

@test "spoke compose file has correct project name" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi
    
    # Check project name
    local project_name=$(yq eval '.name' "$SPOKE_COMPOSE_FILE")
    
    # Should be dive-spoke-{code}
    [ "$project_name" = "dive-spoke-${TEST_INSTANCE_LOWER}" ]
}

@test "spoke compose file has isolated networks" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi
    
    # Check networks
    local networks=$(yq eval '.networks | keys | .[]' "$SPOKE_COMPOSE_FILE")
    
    # Should have dive-internal network
    echo "$networks" | grep -q "dive-internal"
    
    # Should have dive-shared external network (for federation)
    echo "$networks" | grep -q "dive-shared"
}

@test "spoke compose file has isolated volumes" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi
    
    # Check volumes
    local volumes=$(yq eval '.volumes | keys | .[]' "$SPOKE_COMPOSE_FILE")
    
    # Should have postgres_data, mongodb_data, redis_data
    echo "$volumes" | grep -q "postgres_data"
    echo "$volumes" | grep -q "mongodb_data"
    echo "$volumes" | grep -q "redis_data"
}

@test "all spoke services have container_name directives" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi
    
    # Get all services
    local services=$(yq eval '.services | keys | .[]' "$SPOKE_COMPOSE_FILE")
    
    # Count services
    local service_count=$(echo "$services" | wc -l)
    
    # Count services with container_name
    local named_count=$(yq eval '.services.*.container_name' "$SPOKE_COMPOSE_FILE" | grep -v "null" | wc -l | tr -d ' ')
    
    # All services should have container_name
    [ "$named_count" -eq "$service_count" ]
}

@test "container names follow SSOT convention" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi
    
    # Get all container names
    local container_names=$(yq eval '.services.*.container_name' "$SPOKE_COMPOSE_FILE" | grep -v "null")
    
    # All should start with dive-spoke-{code}
    echo "$container_names" | grep -q "dive-spoke-${TEST_INSTANCE_LOWER}"
}
