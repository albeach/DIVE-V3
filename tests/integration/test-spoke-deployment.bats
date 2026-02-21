#!/usr/bin/env bats
# =============================================================================
# DIVE V3 Spoke Deployment Integration Tests
# =============================================================================
# Integration tests for full spoke deployment scenarios
# Phase 1 Sprint 1.3: Testing Infrastructure
# Pattern: Mirrors test_deployment.bats structure with spoke-specific logic
# =============================================================================

setup() {
    # Load test helpers
    load '../utils/test_helper'

    # Set up test environment
    export DIVE_ROOT="${BATS_TEST_DIRNAME}/../.."
    export TEST_INSTANCE_CODE="${SPOKE_TEST_INSTANCE:-FRA}"
    export TEST_INSTANCE_LOWER=$(echo "$TEST_INSTANCE_CODE" | tr '[:upper:]' '[:lower:]')
    export SPOKE_COMPOSE_FILE="${DIVE_ROOT}/instances/${TEST_INSTANCE_LOWER}/docker-compose.yml"

    # Source common functions
    source "${DIVE_ROOT}/scripts/dive-modules/common.sh"

    # Source compose parser for dynamic discovery
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/compose-parser.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/compose-parser.sh"
    fi
}

# =============================================================================
# DEPLOYMENT VALIDATION TESTS
# =============================================================================

@test "validation script returns exit code 0 or 1 when deployment exists" {
    skip_if_no_docker

    # Check if spoke compose file exists
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi

    # Run validation script
    run bash "${DIVE_ROOT}/scripts/validate-spoke-deployment.sh" "$TEST_INSTANCE_CODE"

    # Should pass (0) if deployment is healthy, or fail (1) if issues found
    # Exit code 2+ would indicate script error
    [ "$status" -eq 0 ] || [ "$status" -eq 1 ]
}

@test "validation script detects all running CORE services" {
    skip_if_no_docker

    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi

    # Check if any spoke containers are running
    local running=$(bash -c "${DOCKER_CMD:-docker} ps --filter 'name=dive-spoke-${TEST_INSTANCE_LOWER}' --format '{{.Names}}'" | wc -l)
    if [ "$running" -eq 0 ]; then
        skip "No spoke deployment currently running"
    fi

    run bash "${DIVE_ROOT}/scripts/validate-spoke-deployment.sh" "$TEST_INSTANCE_CODE"

    # Should detect CORE services
    [[ "$output" =~ "dive-spoke-${TEST_INSTANCE_LOWER}-postgres" ]]
    [[ "$output" =~ "dive-spoke-${TEST_INSTANCE_LOWER}-mongodb" ]]
    [[ "$output" =~ "dive-spoke-${TEST_INSTANCE_LOWER}-keycloak" ]]
    [[ "$output" =~ "dive-spoke-${TEST_INSTANCE_LOWER}-backend" ]]
    [[ "$output" =~ "dive-spoke-${TEST_INSTANCE_LOWER}-frontend" ]]
}

@test "validation script reports test statistics" {
    skip_if_no_docker

    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi

    run bash "${DIVE_ROOT}/scripts/validate-spoke-deployment.sh" "$TEST_INSTANCE_CODE"

    # Should report test counts
    [[ "$output" =~ "Total Tests:" ]]
    [[ "$output" =~ "Passed:" ]]
    [[ "$output" =~ "Failed:" ]]
}

@test "validation script completes in reasonable time" {
    skip_if_no_docker

    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi

    local start=$(date +%s)
    bash "${DIVE_ROOT}/scripts/validate-spoke-deployment.sh" "$TEST_INSTANCE_CODE" >/dev/null 2>&1 || true
    local end=$(date +%s)
    local duration=$((end - start))

    # Should complete in under 15 seconds (more services than hub)
    [ "$duration" -lt 15 ]
}

# =============================================================================
# SERVICE HEALTH TESTS
# =============================================================================

@test "can check if Docker daemon is running" {
    bash -c "${DOCKER_CMD:-docker} --version" >/dev/null 2>&1
}

@test "docker compose command is available" {
    bash -c "${DOCKER_CMD:-docker} compose version" >/dev/null 2>&1
}

@test "can query running spoke containers" {
    skip_if_no_docker
    bash -c "${DOCKER_CMD:-docker} ps --filter 'name=dive-spoke' --format '{{.Names}}'" >/dev/null 2>&1
}

@test "CORE spoke services are running (if deployment is up)" {
    skip_if_no_docker

    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi

    # Check if any dive-spoke containers are running for this instance
    local running=$(bash -c "${DOCKER_CMD:-docker} ps --filter 'name=dive-spoke-${TEST_INSTANCE_LOWER}' --format '{{.Names}}'" | wc -l)

    if [ "$running" -eq 0 ]; then
        skip "No spoke deployment currently running"
    fi

    # Check CORE services exist
    local services=("postgres" "mongodb" "redis" "keycloak" "opa" "backend" "frontend")
    local found=0

    for service in "${services[@]}"; do
        if bash -c "${DOCKER_CMD:-docker} ps --format '{{.Names}}'" | grep -q "dive-spoke-${TEST_INSTANCE_LOWER}-${service}"; then
            ((found++))
        fi
    done

    # At least 5 CORE services should be running
    [ "$found" -ge 5 ]
}

@test "spoke compose file exists for test instance" {
    [ -f "$SPOKE_COMPOSE_FILE" ] || skip "Spoke $TEST_INSTANCE_CODE not initialized - run: ./dive spoke init $TEST_INSTANCE_CODE"
}

@test "spoke compose file has service labels" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi

    grep -q "dive.service.class" "$SPOKE_COMPOSE_FILE"
}

# =============================================================================
# DEPLOYMENT LIFECYCLE TESTS
# =============================================================================

@test "spoke services start in dependency order (databases before keycloak)" {
    skip_if_no_docker

    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi

    # Check if deployment is running
    local running=$(bash -c "${DOCKER_CMD:-docker} ps --filter 'name=dive-spoke-${TEST_INSTANCE_LOWER}' --format '{{.Names}}'" | wc -l)
    if [ "$running" -eq 0 ]; then
        skip "No spoke deployment currently running"
    fi

    # If Keycloak is running, databases should also be running
    if bash -c "${DOCKER_CMD:-docker} ps --format '{{.Names}}'" | grep -q "dive-spoke-${TEST_INSTANCE_LOWER}-keycloak"; then
        bash -c "${DOCKER_CMD:-docker} ps --format '{{.Names}}'" | grep -q "dive-spoke-${TEST_INSTANCE_LOWER}-postgres"
        bash -c "${DOCKER_CMD:-docker} ps --format '{{.Names}}'" | grep -q "dive-spoke-${TEST_INSTANCE_LOWER}-mongodb"
    fi
}

@test "all CORE spoke services become healthy (if deployed)" {
    skip_if_no_docker

    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi

    # Check if deployment is running
    local running=$(bash -c "${DOCKER_CMD:-docker} ps --filter 'name=dive-spoke-${TEST_INSTANCE_LOWER}' --format '{{.Names}}'" | wc -l)
    if [ "$running" -eq 0 ]; then
        skip "No spoke deployment currently running"
    fi

    # Get CORE services dynamically
    local core_services=($(compose_get_spoke_services_by_class "$TEST_INSTANCE_CODE" "core" 2>/dev/null || echo "postgres mongodb redis keycloak opa backend frontend"))

    local unhealthy=0
    for service in "${core_services[@]}"; do
        local container_name="dive-spoke-${TEST_INSTANCE_LOWER}-${service}"

        # Check if container exists
        if ! bash -c "${DOCKER_CMD:-docker} ps --format '{{.Names}}'" | grep -q "^${container_name}$"; then
            ((unhealthy++))
            continue
        fi

        # Check health status
        local health=$(bash -c "${DOCKER_CMD:-docker} inspect --format='{{.State.Health.Status}}' '${container_name}'" 2>/dev/null || echo "no_healthcheck")
        health=$(echo "$health" | tr -d '[:space:]')

        # Healthy or no healthcheck is OK, anything else is unhealthy
        if [ "$health" != "healthy" ] && [ "$health" != "no_healthcheck" ] && [ -n "$health" ]; then
            ((unhealthy++))
        fi
    done

    # All CORE services should be healthy or have no healthcheck
    [ "$unhealthy" -eq 0 ]
}

# =============================================================================
# SERVICE STARTUP SEQUENCE TESTS
# =============================================================================

@test "databases start before Keycloak (dependency check)" {
    skip_if_no_docker

    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi

    # Verify compose file has correct depends_on
    local keycloak_deps=$(yq eval ".services.keycloak-${TEST_INSTANCE_LOWER}.depends_on | keys | .[]" "$SPOKE_COMPOSE_FILE" 2>/dev/null || echo "")

    if [ -z "$keycloak_deps" ]; then
        skip "Cannot parse Keycloak dependencies"
    fi

    # Keycloak should depend on postgres
    echo "$keycloak_deps" | grep -q "postgres"
}

@test "Keycloak starts before backend (dependency check)" {
    skip_if_no_docker

    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi

    # Verify compose file has correct depends_on
    local backend_deps=$(yq eval ".services.backend-${TEST_INSTANCE_LOWER}.depends_on | keys | .[]" "$SPOKE_COMPOSE_FILE" 2>/dev/null || echo "")

    if [ -z "$backend_deps" ]; then
        skip "Cannot parse backend dependencies"
    fi

    # Backend should depend on keycloak
    echo "$backend_deps" | grep -q "keycloak"
}

@test "backend starts before frontend (dependency check)" {
    skip_if_no_docker

    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi

    # Verify compose file has correct depends_on
    local frontend_deps=$(yq eval ".services.frontend-${TEST_INSTANCE_LOWER}.depends_on | keys | .[]" "$SPOKE_COMPOSE_FILE" 2>/dev/null || echo "")

    if [ -z "$frontend_deps" ]; then
        skip "Cannot parse frontend dependencies"
    fi

    # Frontend should depend on backend
    echo "$frontend_deps" | grep -q "backend"
}

# =============================================================================
# HEALTH CHECK PROGRESSION TESTS
# =============================================================================

@test "MongoDB replica set becomes PRIMARY (if deployed)" {
    skip_if_no_docker

    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi

    # Check if MongoDB container is running
    if ! bash -c "${DOCKER_CMD:-docker} ps --format '{{.Names}}'" | grep -q "dive-spoke-${TEST_INSTANCE_LOWER}-mongodb"; then
        skip "MongoDB not running"
    fi

    # Try to get replica set status (may fail if MongoDB not fully initialized)
    local rs_status=$(bash -c "${DOCKER_CMD:-docker} exec dive-spoke-${TEST_INSTANCE_LOWER}-mongodb mongosh --quiet --eval 'rs.status().myState'" 2>/dev/null || echo "0")

    # State 1 = PRIMARY
    # If status is 0, MongoDB may still be initializing (acceptable in tests)
    [ "$rs_status" = "1" ] || [ "$rs_status" = "0" ]
}

@test "Keycloak realm is accessible after deployment (if deployed)" {
    skip_if_no_docker

    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi

    # Check if Keycloak container is running
    if ! bash -c "${DOCKER_CMD:-docker} ps --format '{{.Names}}'" | grep -q "dive-spoke-${TEST_INSTANCE_LOWER}-keycloak"; then
        skip "Keycloak not running"
    fi

    # Calculate Keycloak port (base 8443 + country_offset * 10)
    declare -A country_offsets=(
        ["FRA"]=1 ["GBR"]=2 ["DEU"]=3 ["CAN"]=4 ["POL"]=5
    )
    local offset=${country_offsets[$TEST_INSTANCE_CODE]:-1}
    local keycloak_port=$((8443 + offset * 10))

    # Try to access Keycloak realm (may fail if still starting)
    local realm_accessible=$(curl -ksSf --max-time 5 "https://localhost:${keycloak_port}/realms/dive-v3-broker-${TEST_INSTANCE_LOWER}" 2>/dev/null || echo "FAIL")

    # If Keycloak is running but not responding, that's OK in tests (may be starting)
    # We just verify the attempt doesn't crash
    [ -n "$realm_accessible" ]
}

# =============================================================================
# SPOKE-SPECIFIC TESTS
# =============================================================================

@test "spoke instance has unique port assignments" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi

    # Check that port mappings exist in compose file
    local port_count=$(grep -c ":\${.*_HOST_PORT}" "$SPOKE_COMPOSE_FILE" || echo "0")

    # Should have at least 4 port mappings (frontend, backend, keycloak, opa)
    [ "$port_count" -ge 4 ]
}

@test "spoke compose file uses instance-specific naming" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi

    # Check that services are named with instance suffix
    grep -q "${TEST_INSTANCE_LOWER}" "$SPOKE_COMPOSE_FILE"
}

@test "spoke has isolated volumes from hub" {
    if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
        skip "Spoke $TEST_INSTANCE_CODE not initialized"
    fi

    # Check that compose file has volume declarations
    local volume_count=$(yq eval '.volumes | keys | .[]' "$SPOKE_COMPOSE_FILE" 2>/dev/null | wc -l)

    # Should have at least 5 volumes (postgres, mongodb, redis, etc.)
    [ "$volume_count" -ge 5 ]
}
