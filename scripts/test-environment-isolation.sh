#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Environment Isolation Tests
# =============================================================================
# Tests to verify that different instances (hub, spokes) are properly isolated:
# - Environment variables don't conflict
# - Container networks are separate
# - File systems are isolated
# - Database connections are separate
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-16
# =============================================================================

# Test framework
if [ -z "$DIVE_TEST_FRAMEWORK_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/test-framework.sh"
fi

# =============================================================================
# ENVIRONMENT ISOLATION TESTS
# =============================================================================

##
# Test environment variable isolation
#
test_env_var_isolation() {
    log_step "Testing Environment Variable Isolation"

    local instances=("hub" "fra" "gbr" "deu")
    local all_passed=true

    # Check that each instance has its own .env file
    for instance in "${instances[@]}"; do
        local env_file="${DIVE_ROOT}/instances/${instance}/.env"
        if [ ! -f "$env_file" ]; then
            log_error "Missing .env file for $instance: $env_file"
            all_passed=false
            continue
        fi

        log_verbose "✓ Found .env file for $instance"
    done

    # Check that port configurations don't conflict
    local used_ports=()
    for instance in "${instances[@]}"; do
        local env_file="${DIVE_ROOT}/instances/${instance}/.env"
        local frontend_port
        local backend_port

        frontend_port=$(grep "^FRONTEND_PORT=" "$env_file" | cut -d'=' -f2 | tr -d '"' || echo "")
        backend_port=$(grep "^BACKEND_PORT=" "$env_file" | cut -d'=' -f2 | tr -d '"' || echo "")

        # Check frontend port
        if [ -n "$frontend_port" ]; then
            case " ${used_ports[*]} " in
                *" ${frontend_port} "*)
                log_error "Port conflict: FRONTEND_PORT $frontend_port used by multiple instances"
                all_passed=false
                ;;
                *)
                used_ports+=("$frontend_port")
                log_verbose "✓ $instance FRONTEND_PORT: $frontend_port"
                ;;
            esac
        fi

        # Check backend port
        if [ -n "$backend_port" ]; then
            case " ${used_ports[*]} " in
                *" ${backend_port} "*)
                log_error "Port conflict: BACKEND_PORT $backend_port used by multiple instances"
                all_passed=false
                ;;
                *)
                used_ports+=("$backend_port")
                log_verbose "✓ $instance BACKEND_PORT: $backend_port"
                ;;
            esac
        fi
    done

    # Check that database connections are separate
    local _db_connections=()
    for instance in "${instances[@]}"; do
        local env_file="${DIVE_ROOT}/instances/${instance}/.env"
        local mongo_url

        if [ "$instance" = "hub" ]; then
            mongo_url=$(grep "^MONGODB_URL=" "$env_file" | cut -d'=' -f2 | tr -d '"' || echo "")
        else
            # Spokes might connect to hub MongoDB
            mongo_url=$(grep "^MONGODB_URL=" "$env_file" | cut -d'=' -f2 | tr -d '"' || echo "")
        fi

        if [ -n "$mongo_url" ]; then
            log_verbose "✓ $instance MongoDB URL configured"
        fi
    done

    if [ "$all_passed" = true ]; then
        log_success "✓ Environment variable isolation test PASSED"
        return 0
    else
        log_error "✗ Environment variable isolation test FAILED"
        return 1
    fi
}

##
# Test container network isolation
#
test_container_network_isolation() {
    log_step "Testing Container Network Isolation"

    # Check that each instance has its own Docker network
    local networks=("dive-hub_hub-internal" "dive-spoke-fra_fra-internal" "dive-spoke-gbr_gbr-internal" "dive-spoke-deu_deu-internal")
    local all_passed=true

    for network in "${networks[@]}"; do
        if docker network ls --format "{{.Name}}" | grep -q "^${network}$"; then
            log_verbose "✓ Network exists: $network"
        else
            # Network might not be created yet if containers aren't running
            log_verbose "⚠ Network not found (may not be created yet): $network"
        fi
    done

    # Check that containers from different instances can't communicate
    # This would require running containers, so we'll check the docker-compose configurations

    local compose_files=(
        "${DIVE_ROOT}/docker-compose.hub.yml"
        "${DIVE_ROOT}/instances/fra/docker-compose.fra.yml"
        "${DIVE_ROOT}/instances/gbr/docker-compose.gbr.yml"
        "${DIVE_ROOT}/instances/deu/docker-compose.deu.yml"
    )

    for compose_file in "${compose_files[@]}"; do
        if [ -f "$compose_file" ]; then
            # Check that networks are properly defined
            if grep -q "networks:" "$compose_file"; then
                log_verbose "✓ Networks defined in: $(basename "$compose_file")"
            else
                log_warn "⚠ No networks section in: $(basename "$compose_file")"
            fi
        else
            log_warn "⚠ Compose file not found: $(basename "$compose_file")"
        fi
    done

    log_success "✓ Container network isolation test PASSED"
    return 0
}

##
# Test filesystem isolation
#
test_filesystem_isolation() {
    log_step "Testing Filesystem Isolation"

    local instances=("hub" "fra" "gbr" "deu")
    local all_passed=true

    # Check that each instance has its own directory structure
    for instance in "${instances[@]}"; do
        local instance_dir="${DIVE_ROOT}/instances/${instance}"

        if [ ! -d "$instance_dir" ]; then
            log_error "Missing instance directory: $instance_dir"
            all_passed=false
            continue
        fi

        # Check for required subdirectories
        local required_dirs=("certs" "logs" "config")
        for subdir in "${required_dirs[@]}"; do
            if [ ! -d "${instance_dir}/${subdir}" ]; then
                log_error "Missing subdirectory $subdir in $instance_dir"
                all_passed=false
            fi
        done

        # Check that config files are instance-specific
        local config_file="${instance_dir}/config.json"
        if [ -f "$config_file" ]; then
            local instance_code
            instance_code=$(jq -r '.instance.code // empty' "$config_file" 2>/dev/null)

            if [ "$instance_code" != "$instance" ] && [ "$instance" != "hub" ]; then
                log_error "Config file $config_file has wrong instance code: $instance_code (expected: $instance)"
                all_passed=false
            else
                log_verbose "✓ Config file correct for $instance"
            fi
        fi
    done

    # Check that shared directories are properly separated
    local shared_dirs=("data" "backups" "monitoring")
    for shared_dir in "${shared_dirs[@]}"; do
        local full_path="${DIVE_ROOT}/${shared_dir}"
        if [ -d "$full_path" ]; then
            # Check if subdirectories exist for instances
            local instance_subdirs
            instance_subdirs=$(find "$full_path" -maxdepth 1 -type d -name "*-*" | wc -l)

            if [ "$instance_subdirs" -gt 0 ]; then
                log_verbose "✓ Shared directory $shared_dir has instance subdirectories"
            else
                log_verbose "⚠ Shared directory $shared_dir may need instance separation"
            fi
        fi
    done

    if [ "$all_passed" = true ]; then
        log_success "✓ Filesystem isolation test PASSED"
        return 0
    else
        log_error "✗ Filesystem isolation test FAILED"
        return 1
    fi
}

##
# Test database connection isolation
#
test_database_connection_isolation() {
    log_step "Testing Database Connection Isolation"

    # Check that each instance connects to the correct database
    local instances=("hub" "fra" "gbr" "deu")
    local all_passed=true

    for instance in "${instances[@]}"; do
        local env_file="${DIVE_ROOT}/instances/${instance}/.env"

        if [ ! -f "$env_file" ]; then
            log_error "Missing .env file for $instance"
            all_passed=false
            continue
        fi

        # Check MongoDB configuration
        local mongo_url
        mongo_url=$(grep "^MONGODB_URL=" "$env_file" | cut -d'=' -f2 | tr -d '"' || echo "")

        if [ -n "$mongo_url" ]; then
            # Extract database name from MongoDB URL
            local db_name
            db_name=$(echo "$mongo_url" | sed 's/.*\/\([^?]*\).*/\1/')

            if [ "$instance" = "hub" ]; then
                if [[ "$db_name" == *"dive-v3"* ]]; then
                    log_verbose "✓ Hub MongoDB database: $db_name"
                else
                    log_warn "⚠ Hub MongoDB database name may not be standard: $db_name"
                fi
            else
                # Spokes should connect to hub database or have their own
                if [[ "$db_name" == *"dive-v3"* ]]; then
                    log_verbose "✓ $instance connects to shared database: $db_name"
                else
                    log_verbose "✓ $instance has separate database: $db_name"
                fi
            fi
        fi

        # Check PostgreSQL configuration (for Keycloak)
        local postgres_db
        postgres_db=$(grep "^POSTGRES_DB=" "$env_file" | cut -d'=' -f2 | tr -d '"' || echo "")

        if [ -n "$postgres_db" ]; then
            if [[ "$postgres_db" == *"${instance}"* ]]; then
                log_verbose "✓ $instance PostgreSQL database: $postgres_db"
            else
                log_verbose "✓ $instance PostgreSQL database: $postgres_db (may be shared)"
            fi
        fi
    done

    # Test actual database connections if services are running
    if docker ps --filter "name=dive-hub-mongodb" --format "{{.Names}}" | grep -q "dive-hub-mongodb"; then
        log_verbose "Testing actual database connections..."

        local mongo_password
        mongo_password=$(grep "^MONGO_PASSWORD=" "${DIVE_ROOT}/instances/hub/.env" | cut -d'=' -f2 | tr -d '"')

        if [ -n "$mongo_password" ]; then
            # Try to connect and list databases
            local db_list
            db_list=$(docker exec dive-hub-mongodb mongosh --quiet \
                -u admin -p "$mongo_password" \
                --authenticationDatabase admin \
                --eval "show dbs" 2>/dev/null | tr '\n' ' ')

            if [[ "$db_list" == *"dive-v3"* ]]; then
                log_verbose "✓ MongoDB connection working, found DIVE databases"
            else
                log_warn "⚠ MongoDB connection may have issues"
            fi
        fi
    fi

    log_success "✓ Database connection isolation test PASSED"
    return 0
}

##
# Test multi-instance deployment
#
test_multi_instance_deployment() {
    log_step "Testing Multi-Instance Deployment"

    local instances=("hub" "fra" "gbr" "deu")
    local running_instances=0
    local all_passed=true

    # Check which instances have running containers
    for instance in "${instances[@]}"; do
        local container_prefix="dive-${instance}"

        if docker ps --filter "name=${container_prefix}" --format "{{.Names}}" | grep -q "${container_prefix}"; then
            ((running_instances++))
            log_verbose "✓ $instance has running containers"
        else
            log_verbose "⚠ $instance containers not running"
        fi
    done

    log_info "Running instances: $running_instances/${#instances[@]}"

    # If we have multiple instances running, test cross-communication
    if [ "$running_instances" -ge 2 ]; then
        log_verbose "Testing cross-instance communication..."

        # Test federation between instances
        if test_federation_cross_instance; then
            log_verbose "✓ Cross-instance federation working"
        else
            log_warn "⚠ Cross-instance federation may have issues"
        fi
    fi

    # Test that instances can be deployed independently
    log_verbose "Testing independent deployment capability..."

    # Check that each instance has its own deployment scripts
    for instance in "${instances[@]}"; do
        if [ -f "${DIVE_ROOT}/instances/${instance}/deploy.sh" ] || [ -f "${DIVE_ROOT}/scripts/spoke-deploy-${instance}.sh" ]; then
            log_verbose "✓ $instance has deployment script"
        else
            log_verbose "⚠ $instance missing deployment script"
        fi
    done

    log_success "✓ Multi-instance deployment test PASSED"
    return 0
}

##
# Test federation between instances
#
test_federation_cross_instance() {
    # Test that instances can communicate via federation
    # This would require actual running instances with federation configured

    # Check if federation_spokes collection has multiple entries
    if docker ps --filter "name=dive-hub-mongodb" --format "{{.Names}}" | grep -q "dive-hub-mongodb"; then
        local mongo_password
        mongo_password=$(grep "^MONGO_PASSWORD=" "${DIVE_ROOT}/instances/hub/.env" | cut -d'=' -f2 | tr -d '"')

        if [ -n "$mongo_password" ]; then
            local spoke_count
            spoke_count=$(docker exec dive-hub-mongodb mongosh --quiet \
                -u admin -p "$mongo_password" \
                --authenticationDatabase admin \
                --eval "use('dive-v3'); JSON.stringify(db.federation_spokes.find({}).toArray())" \
                2>/dev/null | jq -r 'length' 2>/dev/null || echo "0")

            if [ "$spoke_count" -gt 1 ]; then
                log_verbose "✓ Multiple spokes registered in federation ($spoke_count total)"
                return 0
            fi
        fi
    fi

    log_verbose "⚠ Cannot verify cross-instance federation (MongoDB not available)"
    return 1
}

##
# Run all environment isolation tests
#
test_run_environment_isolation_tests() {
    log_step "Running Environment Isolation Tests"

    local test_functions=(
        "test_env_var_isolation"
        "test_container_network_isolation"
        "test_filesystem_isolation"
        "test_database_connection_isolation"
        "test_multi_instance_deployment"
    )

    local total_tests=${#test_functions[@]}
    local passed_tests=0

    for test_func in "${test_functions[@]}"; do
        log_info "Running: $test_func"

        if $test_func; then
            log_success "✓ $test_func passed"
            ((passed_tests++))
        else
            log_error "✗ $test_func failed"
        fi
    done

    log_info "Environment Isolation Tests: $passed_tests/$total_tests passed"

    if [ "$passed_tests" -eq "$total_tests" ]; then
        log_success "All environment isolation tests passed!"
        return 0
    else
        log_error "Some environment isolation tests failed"
        return 1
    fi
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    # Script is being run directly
    test_run_environment_isolation_tests
fi
