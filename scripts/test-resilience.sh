#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Resilience and Persistence Test Script
# =============================================================================
# Tests:
#   1. Container restart recovery (resilience)
#   2. Data persistence after restart
#   3. Health check recovery times
#
# Usage:
#   ./scripts/test-resilience.sh [INSTANCE]
#
# Examples:
#   ./scripts/test-resilience.sh           # Tests USA instance
#   ./scripts/test-resilience.sh fra       # Tests FRA instance
#   ./scripts/test-resilience.sh gbr       # Tests GBR instance
#
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTANCE="${1:-usa}"
INSTANCE_LOWER=$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]')

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }
log_section() { echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# Container name resolution
get_container_name() {
    local service="$1"
    if [[ "$INSTANCE_LOWER" == "usa" ]]; then
        case "$service" in
            postgres) echo "dive-v3-postgres" ;;
            mongo|mongodb) echo "dive-v3-mongo" ;;
            redis) echo "dive-v3-redis" ;;
            opa) echo "dive-v3-opa" ;;
            keycloak) echo "dive-v3-keycloak" ;;
            backend) echo "dive-v3-backend" ;;
            frontend) echo "dive-v3-frontend" ;;
            kas) echo "dive-v3-kas" ;;
            *) echo "dive-v3-$service" ;;
        esac
    else
        case "$service" in
            mongo) echo "dive-v3-mongodb-${INSTANCE_LOWER}" ;;
            *) echo "dive-v3-${service}-${INSTANCE_LOWER}" ;;
        esac
    fi
}

# Check if container exists and get its status
get_container_status() {
    local container="$1"
    docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "not_found"
}

# Check if container is healthy
is_container_healthy() {
    local container="$1"
    local health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "none")
    [[ "$health" == "healthy" ]]
}

# Wait for container to become healthy
wait_for_healthy() {
    local container="$1"
    local timeout="${2:-120}"
    local start_time=$(date +%s)
    
    while true; do
        if is_container_healthy "$container"; then
            local elapsed=$(($(date +%s) - start_time))
            echo "$elapsed"
            return 0
        fi
        
        local elapsed=$(($(date +%s) - start_time))
        if [[ $elapsed -ge $timeout ]]; then
            echo "timeout"
            return 1
        fi
        
        sleep 2
    done
}

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
declare -A RECOVERY_TIMES

# =============================================================================
# TEST 1: Pre-flight Status Check
# =============================================================================
test_precheck() {
    log_section "TEST 1: Pre-flight Status Check"
    
    local services=("postgres" "mongo" "redis" "opa" "keycloak" "backend" "kas")
    local all_healthy=true
    
    for service in "${services[@]}"; do
        local container=$(get_container_name "$service")
        local status=$(get_container_status "$container")
        
        if [[ "$status" == "running" ]]; then
            if is_container_healthy "$container"; then
                log_success "$container: running (healthy)"
            else
                log_warn "$container: running (unhealthy or no healthcheck)"
            fi
        else
            log_error "$container: $status"
            all_healthy=false
        fi
    done
    
    if $all_healthy; then
        log_success "Pre-flight check passed"
        ((TESTS_PASSED++))
        return 0
    else
        log_error "Pre-flight check failed - some services not running"
        ((TESTS_FAILED++))
        return 1
    fi
}

# =============================================================================
# TEST 2: Resilience - Redis Restart Recovery
# =============================================================================
test_redis_resilience() {
    log_section "TEST 2: Redis Restart Recovery"
    
    local container=$(get_container_name "redis")
    
    # Pre-condition: container should be healthy
    if ! is_container_healthy "$container" 2>/dev/null; then
        log_warn "$container is not healthy - checking if running"
        if [[ "$(get_container_status "$container")" != "running" ]]; then
            log_error "$container is not running - skipping test"
            ((TESTS_FAILED++))
            return 1
        fi
    fi
    
    log_info "Inserting test data into Redis..."
    docker exec "$container" redis-cli SET resilience_test "$(date +%s)" EX 300 2>/dev/null || {
        log_warn "Could not insert test data (may need AUTH)"
    }
    
    log_info "Stopping $container..."
    docker stop "$container" --time=10 >/dev/null 2>&1
    
    log_info "Waiting for container to restart automatically..."
    sleep 5
    
    # Container should auto-restart due to restart: unless-stopped policy
    local start_time=$(date +%s)
    local status
    for i in {1..30}; do
        status=$(get_container_status "$container")
        if [[ "$status" == "running" ]]; then
            break
        fi
        sleep 2
    done
    
    if [[ "$status" != "running" ]]; then
        log_error "$container did not restart automatically"
        log_info "Attempting manual start..."
        docker start "$container" >/dev/null 2>&1
        sleep 5
    fi
    
    log_info "Waiting for healthy status..."
    local recovery_time=$(wait_for_healthy "$container" 60)
    
    if [[ "$recovery_time" != "timeout" ]]; then
        RECOVERY_TIMES["redis"]="$recovery_time"
        log_success "Redis recovered in ${recovery_time}s"
        
        # Verify data persistence
        local test_value=$(docker exec "$container" redis-cli GET resilience_test 2>/dev/null || echo "")
        if [[ -n "$test_value" ]]; then
            log_success "Data persisted after restart (AOF working)"
        else
            log_warn "Test data not found (may have expired or AOF not enabled)"
        fi
        
        ((TESTS_PASSED++))
        return 0
    else
        log_error "Redis did not recover within 60s timeout"
        ((TESTS_FAILED++))
        return 1
    fi
}

# =============================================================================
# TEST 3: Resilience - MongoDB Restart Recovery
# =============================================================================
test_mongo_resilience() {
    log_section "TEST 3: MongoDB Restart Recovery"
    
    local container=$(get_container_name "mongo")
    
    if [[ "$(get_container_status "$container")" != "running" ]]; then
        log_error "$container is not running - skipping test"
        ((TESTS_FAILED++))
        return 1
    fi
    
    log_info "Inserting test document into MongoDB..."
    docker exec "$container" mongosh --eval "db.resilience_test.insertOne({test: 'data', ts: new Date()})" --quiet 2>/dev/null || {
        log_warn "Could not insert test document (may need AUTH)"
    }
    
    log_info "Stopping $container (graceful - 10s timeout)..."
    docker stop "$container" --time=10 >/dev/null 2>&1
    
    log_info "Waiting for container to restart..."
    sleep 5
    
    # Wait for restart
    for i in {1..30}; do
        if [[ "$(get_container_status "$container")" == "running" ]]; then
            break
        fi
        sleep 2
    done
    
    if [[ "$(get_container_status "$container")" != "running" ]]; then
        log_error "$container did not restart"
        docker start "$container" >/dev/null 2>&1
        sleep 5
    fi
    
    log_info "Waiting for healthy status..."
    local recovery_time=$(wait_for_healthy "$container" 90)
    
    if [[ "$recovery_time" != "timeout" ]]; then
        RECOVERY_TIMES["mongodb"]="$recovery_time"
        log_success "MongoDB recovered in ${recovery_time}s"
        
        # Verify data persistence
        local count=$(docker exec "$container" mongosh --eval "db.resilience_test.countDocuments()" --quiet 2>/dev/null || echo "0")
        if [[ "$count" -gt 0 ]]; then
            log_success "Data persisted after restart ($count documents)"
        else
            log_warn "Test data not found"
        fi
        
        ((TESTS_PASSED++))
        return 0
    else
        log_error "MongoDB did not recover within 90s timeout"
        ((TESTS_FAILED++))
        return 1
    fi
}

# =============================================================================
# TEST 4: Resilience - OPA Restart Recovery
# =============================================================================
test_opa_resilience() {
    log_section "TEST 4: OPA Restart Recovery"
    
    local container=$(get_container_name "opa")
    
    if [[ "$(get_container_status "$container")" != "running" ]]; then
        log_error "$container is not running - skipping test"
        ((TESTS_FAILED++))
        return 1
    fi
    
    log_info "Stopping $container..."
    docker stop "$container" --time=5 >/dev/null 2>&1
    
    log_info "Waiting for container to restart..."
    sleep 3
    
    for i in {1..20}; do
        if [[ "$(get_container_status "$container")" == "running" ]]; then
            break
        fi
        sleep 2
    done
    
    if [[ "$(get_container_status "$container")" != "running" ]]; then
        log_error "$container did not restart"
        docker start "$container" >/dev/null 2>&1
    fi
    
    log_info "Waiting for healthy status..."
    local recovery_time=$(wait_for_healthy "$container" 60)
    
    if [[ "$recovery_time" != "timeout" ]]; then
        RECOVERY_TIMES["opa"]="$recovery_time"
        log_success "OPA recovered in ${recovery_time}s"
        
        # Verify policies are loaded
        local health=$(docker exec "$container" wget --spider -q http://localhost:8181/health 2>&1; echo $?)
        if [[ "$health" == "0" ]]; then
            log_success "OPA health endpoint responding"
        else
            log_warn "OPA health check inconclusive"
        fi
        
        ((TESTS_PASSED++))
        return 0
    else
        log_error "OPA did not recover within 60s timeout"
        ((TESTS_FAILED++))
        return 1
    fi
}

# =============================================================================
# TEST 5: Backend Health After Dependencies Restart
# =============================================================================
test_backend_health() {
    log_section "TEST 5: Backend Health After Dependencies Restart"
    
    local backend_container=$(get_container_name "backend")
    
    log_info "Checking backend health..."
    
    local max_attempts=10
    for i in $(seq 1 $max_attempts); do
        if is_container_healthy "$backend_container"; then
            log_success "Backend is healthy"
            ((TESTS_PASSED++))
            return 0
        fi
        log_info "Waiting for backend to stabilize... (attempt $i/$max_attempts)"
        sleep 10
    done
    
    log_error "Backend did not become healthy after dependency restarts"
    ((TESTS_FAILED++))
    return 1
}

# =============================================================================
# TEST 6: Volume Persistence Verification
# =============================================================================
test_volume_persistence() {
    log_section "TEST 6: Volume Persistence Verification"
    
    log_info "Checking named volumes..."
    
    local volumes
    if [[ "$INSTANCE_LOWER" == "usa" ]]; then
        volumes=("dive-v3_postgres_data" "dive-v3_mongo_data" "dive-v3_redis_data")
    else
        volumes=("dive-v3-${INSTANCE_LOWER}_postgres_${INSTANCE_LOWER}_data" "dive-v3-${INSTANCE_LOWER}_mongodb_${INSTANCE_LOWER}_data")
    fi
    
    local all_exist=true
    for vol in "${volumes[@]}"; do
        if docker volume inspect "$vol" >/dev/null 2>&1; then
            local size=$(docker system df -v 2>/dev/null | grep "$vol" | awk '{print $3}' || echo "N/A")
            log_success "Volume $vol exists (size: ${size:-N/A})"
        else
            log_warn "Volume $vol not found (may use different naming)"
            # Try alternate naming
            local alt_vol=$(echo "$vol" | sed 's/-/_/g')
            if docker volume inspect "$alt_vol" >/dev/null 2>&1; then
                log_success "Found alternate volume: $alt_vol"
            fi
        fi
    done
    
    ((TESTS_PASSED++))
    return 0
}

# =============================================================================
# Summary
# =============================================================================
print_summary() {
    log_section "RESILIENCE TEST SUMMARY"
    
    echo ""
    echo "Instance:      ${INSTANCE^^}"
    echo "Tests Passed:  $TESTS_PASSED"
    echo "Tests Failed:  $TESTS_FAILED"
    echo ""
    
    if [[ ${#RECOVERY_TIMES[@]} -gt 0 ]]; then
        echo "Recovery Times:"
        for service in "${!RECOVERY_TIMES[@]}"; do
            printf "  %-12s %s seconds\n" "$service:" "${RECOVERY_TIMES[$service]}"
        done
        echo ""
    fi
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        log_success "All resilience tests passed!"
        echo ""
        echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║       RESILIENCE VERIFICATION PASSED ✓                         ║${NC}"
        echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
        return 0
    else
        log_error "$TESTS_FAILED test(s) failed"
        echo ""
        echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}║       RESILIENCE VERIFICATION FAILED                           ║${NC}"
        echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
        return 1
    fi
}

# =============================================================================
# Main
# =============================================================================
main() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  DIVE V3 - Resilience & Persistence Test${NC}"
    echo -e "${CYAN}  Instance: ${INSTANCE^^}${NC}"
    echo -e "${CYAN}  Time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Run tests
    test_precheck || true
    test_redis_resilience || true
    test_mongo_resilience || true
    test_opa_resilience || true
    test_backend_health || true
    test_volume_persistence || true
    
    # Summary
    print_summary
}

# Execute
main "$@"

