#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Deployment Verification Script
# =============================================================================
# Addresses GAP-R1: No Deployment Verification
#
# This script runs comprehensive post-deployment verification to ensure
# all services are healthy and functioning correctly.
#
# Usage:
#   ./scripts/deployment/verify-deployment.sh <INSTANCE> [OPTIONS]
#
# Examples:
#   ./scripts/deployment/verify-deployment.sh usa
#   ./scripts/deployment/verify-deployment.sh fra --strict
#   ./scripts/deployment/verify-deployment.sh gbr --json
#
# Exit Codes:
#   0 - All verifications passed
#   1 - One or more verifications failed
#   2 - Critical failure (cannot proceed)
#
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REGISTRY_FILE="$PROJECT_ROOT/config/federation-registry.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Arguments
INSTANCE="${1:-}"
STRICT_MODE=false
JSON_OUTPUT=false
TIMEOUT=120
RETRY_COUNT=3
RETRY_DELAY=10

# Parse options
shift || true
while [[ $# -gt 0 ]]; do
    case $1 in
        --strict) STRICT_MODE=true; shift ;;
        --json) JSON_OUTPUT=true; shift ;;
        --timeout=*) TIMEOUT="${1#*=}"; shift ;;
        --help|-h) usage; exit 0 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

usage() {
    cat << EOF
DIVE V3 - Deployment Verification

Usage: $0 <INSTANCE> [OPTIONS]

Arguments:
  INSTANCE    Instance code (usa, fra, gbr, deu)

Options:
  --strict    Fail on any warning (not just errors)
  --json      Output results in JSON format
  --timeout=N Maximum wait time in seconds (default: 120)
  --help      Show this help message

Exit Codes:
  0 - All verifications passed
  1 - One or more verifications failed
  2 - Critical failure
EOF
}

# Logging
log() { [[ "$JSON_OUTPUT" == "false" ]] && echo -e "$1"; }
log_info() { log "${BLUE}[INFO]${NC} $1"; }
log_success() { log "${GREEN}[PASS]${NC} $1"; }
log_warn() { log "${YELLOW}[WARN]${NC} $1"; }
log_error() { log "${RED}[FAIL]${NC} $1"; }

# Validation
if [[ -z "$INSTANCE" ]]; then
    echo "Error: INSTANCE argument required"
    usage
    exit 2
fi

INSTANCE_LOWER=$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]')

# Load instance configuration from registry
if [[ ! -f "$REGISTRY_FILE" ]]; then
    log_error "Registry file not found: $REGISTRY_FILE"
    exit 2
fi

# Get service endpoints from registry
FRONTEND_HOSTNAME=$(jq -r ".instances.${INSTANCE_LOWER}.services.frontend.hostname // empty" "$REGISTRY_FILE")
BACKEND_HOSTNAME=$(jq -r ".instances.${INSTANCE_LOWER}.services.backend.hostname // empty" "$REGISTRY_FILE")
KEYCLOAK_HOSTNAME=$(jq -r ".instances.${INSTANCE_LOWER}.services.keycloak.hostname // empty" "$REGISTRY_FILE")
KAS_HOSTNAME=$(jq -r ".instances.${INSTANCE_LOWER}.services.kas.hostname // empty" "$REGISTRY_FILE")

if [[ -z "$FRONTEND_HOSTNAME" ]]; then
    log_error "Instance '$INSTANCE' not found in registry"
    exit 2
fi

# Results tracking
declare -A RESULTS
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNINGS=0

# Check function
check() {
    local name="$1"
    local check_cmd="$2"
    local required="${3:-true}"
    
    ((TOTAL_CHECKS++))
    
    local start_time=$(date +%s%N)
    local result
    local exit_code
    
    result=$(eval "$check_cmd" 2>&1) && exit_code=0 || exit_code=$?
    
    local end_time=$(date +%s%N)
    local duration_ms=$(( (end_time - start_time) / 1000000 ))
    
    if [[ $exit_code -eq 0 ]]; then
        ((PASSED_CHECKS++))
        RESULTS["$name"]="PASS:$duration_ms"
        log_success "$name (${duration_ms}ms)"
        return 0
    else
        if [[ "$required" == "true" ]]; then
            ((FAILED_CHECKS++))
            RESULTS["$name"]="FAIL:$duration_ms:$result"
            log_error "$name (${duration_ms}ms)"
            [[ -n "$result" ]] && log "         └─ $result"
            return 1
        else
            ((WARNINGS++))
            RESULTS["$name"]="WARN:$duration_ms:$result"
            log_warn "$name (${duration_ms}ms)"
            return 0
        fi
    fi
}

# HTTP check with retry
check_http() {
    local url="$1"
    local expected_codes="${2:-200,301,302}"
    
    for ((i=1; i<=RETRY_COUNT; i++)); do
        local http_code=$(curl -sk -o /dev/null -w "%{http_code}" "$url" --max-time 15 2>/dev/null) || http_code="000"
        
        if [[ ",$expected_codes," == *",$http_code,"* ]]; then
            echo "$http_code"
            return 0
        fi
        
        [[ $i -lt $RETRY_COUNT ]] && sleep "$RETRY_DELAY"
    done
    
    echo "HTTP $http_code (expected: $expected_codes)"
    return 1
}

# Wait for service with timeout
wait_for_service() {
    local name="$1"
    local url="$2"
    local timeout_secs="$3"
    
    local start_time=$(date +%s)
    
    while true; do
        local http_code=$(curl -sk -o /dev/null -w "%{http_code}" "$url" --max-time 10 2>/dev/null) || http_code="000"
        
        if [[ "$http_code" =~ ^(200|301|302|303|307|308)$ ]]; then
            return 0
        fi
        
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        if [[ $elapsed -ge $timeout_secs ]]; then
            echo "Timeout after ${elapsed}s (last HTTP: $http_code)"
            return 1
        fi
        
        sleep 5
    done
}

# Main verification
main() {
    log ""
    log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log "${CYAN}  DIVE V3 - Deployment Verification${NC}"
    log "${CYAN}  Instance: ${INSTANCE^^}${NC}"
    log "${CYAN}  Time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")${NC}"
    log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log ""
    
    # Phase 1: Container Health
    log "${BLUE}Phase 1: Container Health${NC}"
    log "─────────────────────────────────────"
    
    local project_name="$INSTANCE_LOWER"
    [[ "$INSTANCE_LOWER" == "usa" ]] && project_name="usa"
    
    check "Docker daemon running" "docker info >/dev/null 2>&1"
    check "Container: frontend" "docker ps --format '{{.Names}}' | grep -qE '(frontend-${INSTANCE_LOWER}|dive-v3-frontend)'"
    check "Container: backend" "docker ps --format '{{.Names}}' | grep -qE '(backend-${INSTANCE_LOWER}|dive-v3-backend)'"
    check "Container: keycloak" "docker ps --format '{{.Names}}' | grep -qE '(keycloak-${INSTANCE_LOWER}|dive-v3-keycloak)'"
    check "Container: postgres" "docker ps --format '{{.Names}}' | grep -qE '(postgres-${INSTANCE_LOWER}|dive-v3-postgres)'"
    check "Container: mongodb" "docker ps --format '{{.Names}}' | grep -qE '(mongodb-${INSTANCE_LOWER}|mongo-${INSTANCE_LOWER}|dive-v3-mongo)'"
    check "Container: redis" "docker ps --format '{{.Names}}' | grep -qE '(redis-${INSTANCE_LOWER}|dive-v3-redis)'"
    check "Container: opa" "docker ps --format '{{.Names}}' | grep -qE '(opa-${INSTANCE_LOWER}|dive-v3-opa)'"
    check "Container: cloudflared" "docker ps --format '{{.Names}}' | grep -qE '(cloudflared-${INSTANCE_LOWER}|dive-v3-cloudflared)'" "false"
    
    log ""
    
    # Phase 2: Service Health (Internal)
    log "${BLUE}Phase 2: Internal Service Health${NC}"
    log "─────────────────────────────────────"
    
    check "PostgreSQL accepting connections" \
        "docker exec -i \$(docker ps -qf 'name=postgres' | head -1) pg_isready -U postgres 2>/dev/null | grep -q accepting"
    
    check "MongoDB responding" \
        "docker exec -i \$(docker ps -qf 'name=mongo' | head -1) mongosh --eval 'db.adminCommand({ping:1})' --quiet 2>/dev/null | grep -q ok"
    
    check "Redis responding" \
        "docker exec -i \$(docker ps -qf 'name=redis' | head -1) redis-cli ping 2>/dev/null | grep -q PONG"
    
    check "OPA health" \
        "docker exec -i \$(docker ps -qf 'name=opa' | head -1) wget --spider -q http://localhost:8181/health 2>/dev/null"
    
    log ""
    
    # Phase 3: External Endpoints
    log "${BLUE}Phase 3: External Endpoint Verification${NC}"
    log "─────────────────────────────────────"
    
    check "Frontend accessible" "check_http 'https://${FRONTEND_HOSTNAME}' '200,301,302'"
    check "Backend health endpoint" "check_http 'https://${BACKEND_HOSTNAME}/health' '200'"
    check "Backend API endpoint" "check_http 'https://${BACKEND_HOSTNAME}/api/idps/public' '200'"
    check "Keycloak realm endpoint" "check_http 'https://${KEYCLOAK_HOSTNAME}/realms/dive-v3-broker' '200'"
    check "Keycloak health" "check_http 'https://${KEYCLOAK_HOSTNAME}/health/ready' '200'" "false"
    
    log ""
    
    # Phase 4: Authentication Flow
    log "${BLUE}Phase 4: Authentication Verification${NC}"
    log "─────────────────────────────────────"
    
    check "OIDC discovery endpoint" \
        "check_http 'https://${KEYCLOAK_HOSTNAME}/realms/dive-v3-broker/.well-known/openid-configuration' '200'"
    
    check "Token endpoint reachable" \
        "curl -sk 'https://${KEYCLOAK_HOSTNAME}/realms/dive-v3-broker/protocol/openid-connect/token' -d 'test=1' 2>/dev/null | grep -qE '(error|access_token)'"
    
    log ""
    
    # Phase 5: Federation (if not primary instance)
    if [[ "$INSTANCE_LOWER" != "usa" ]]; then
        log "${BLUE}Phase 5: Federation Verification${NC}"
        log "─────────────────────────────────────"
        
        check "USA API reachable" "check_http 'https://usa-api.dive25.com/health' '200'" "false"
        check "IdP list includes federation" \
            "curl -sk 'https://${BACKEND_HOSTNAME}/api/idps/public' 2>/dev/null | grep -q 'usa-federation\\|fra-federation\\|gbr-federation'" "false"
        
        log ""
    fi
    
    # Summary
    log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log "${CYAN}  VERIFICATION SUMMARY${NC}"
    log "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log ""
    log "  Total Checks:  $TOTAL_CHECKS"
    log "  ${GREEN}Passed:        $PASSED_CHECKS${NC}"
    log "  ${RED}Failed:        $FAILED_CHECKS${NC}"
    log "  ${YELLOW}Warnings:      $WARNINGS${NC}"
    log ""
    
    # JSON output if requested
    if [[ "$JSON_OUTPUT" == "true" ]]; then
        echo "{"
        echo "  \"instance\": \"$INSTANCE\","
        echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
        echo "  \"summary\": {"
        echo "    \"total\": $TOTAL_CHECKS,"
        echo "    \"passed\": $PASSED_CHECKS,"
        echo "    \"failed\": $FAILED_CHECKS,"
        echo "    \"warnings\": $WARNINGS"
        echo "  },"
        echo "  \"status\": \"$([ $FAILED_CHECKS -eq 0 ] && echo 'PASS' || echo 'FAIL')\""
        echo "}"
    fi
    
    # Determine exit code
    if [[ $FAILED_CHECKS -gt 0 ]]; then
        log "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
        log "${RED}║          DEPLOYMENT VERIFICATION FAILED                        ║${NC}"
        log "${RED}║  $FAILED_CHECKS check(s) failed - review errors above                   ║${NC}"
        log "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
        return 1
    elif [[ "$STRICT_MODE" == "true" && $WARNINGS -gt 0 ]]; then
        log "${YELLOW}╔════════════════════════════════════════════════════════════════╗${NC}"
        log "${YELLOW}║          DEPLOYMENT VERIFICATION FAILED (STRICT MODE)         ║${NC}"
        log "${YELLOW}║  $WARNINGS warning(s) in strict mode                                  ║${NC}"
        log "${YELLOW}╚════════════════════════════════════════════════════════════════╝${NC}"
        return 1
    else
        log "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
        log "${GREEN}║          DEPLOYMENT VERIFICATION PASSED ✓                      ║${NC}"
        log "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
        return 0
    fi
}

# Execute
main "$@"

