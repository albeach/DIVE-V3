#!/usr/local/bin/bash
# =============================================================================
# Keycloak Health Verification - All Spokes
# =============================================================================
# Systematically checks all spoke Keycloak instances for errors and warnings
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${CYAN}
═══════════════════════════════════════════════════════════
         DIVE V3 - Keycloak Health Verification
═══════════════════════════════════════════════════════════${NC}"

# Discover all running spoke Keycloak containers
SPOKE_CONTAINERS=$(docker ps --filter "name=dive-spoke-.*-keycloak" --format "{{.Names}}" | sort)

if [ -z "$SPOKE_CONTAINERS" ]; then
    log_warn "No spoke Keycloak containers running"
    exit 0
fi

TOTAL=0
HEALTHY=0
UNHEALTHY=0
DEPRECATED_WARNINGS=0
MAPPER_ERRORS=0

for container in $SPOKE_CONTAINERS; do
    TOTAL=$((TOTAL + 1))
    instance=$(echo "$container" | sed 's/dive-spoke-\(.*\)-keycloak/\1/')
    instance_upper=$(echo "$instance" | tr '[:lower:]' '[:upper:]')

    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  ${instance_upper} - ${container}${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Check container health
    health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "no-health-check")

    if [ "$health" = "healthy" ]; then
        log_success "Container: healthy"
        HEALTHY=$((HEALTHY + 1))
    else
        log_error "Container: $health"
        UNHEALTHY=$((UNHEALTHY + 1))
    fi

    # Check for deprecated KEYCLOAK_ADMIN warnings
    deprecated_count=$(docker logs "$container" 2>&1 | \
        grep -c "KEYCLOAK_ADMIN.*deprecated" || true)

    if [ "$deprecated_count" -gt 0 ]; then
        log_error "Found $deprecated_count deprecated KEYCLOAK_ADMIN warnings"
        DEPRECATED_WARNINGS=$((DEPRECATED_WARNINGS + deprecated_count))
    else
        log_success "No deprecated environment variable warnings"
    fi

    # Check for mapper errors (excluding one-time init errors)
    recent_mapper_errors=$(docker logs "$container" 2>&1 --since 5m | \
        grep -c "Identity Provider Mapper does not exist\|mapping with id null" || true)

    if [ "$recent_mapper_errors" -gt 0 ]; then
        log_warn "Found $recent_mapper_errors recent mapper errors (last 5 min)"
        MAPPER_ERRORS=$((MAPPER_ERRORS + recent_mapper_errors))
    else
        log_success "No recent mapper errors"
    fi

    # Check for hostname v1 warnings (informational only)
    hostname_warnings=$(docker logs "$container" 2>&1 | \
        grep -c "Hostname v1 options" || true)

    if [ "$hostname_warnings" -gt 0 ]; then
        log_info "Hostname v1 warnings: $hostname_warnings (benign, informational only)"
    fi

    # Check Keycloak version
    version=$(docker logs "$container" 2>&1 | \
        grep "Keycloak.*started" | tail -1 | \
        grep -oE "Keycloak [0-9]+\.[0-9]+\.[0-9]+" || echo "Unknown")

    if [ "$version" != "Unknown" ]; then
        log_info "Version: $version"
    fi

    # Check startup time
    startup_time=$(docker logs "$container" 2>&1 | \
        grep "started in" | tail -1 | \
        grep -oE "started in [0-9]+\.[0-9]+s" || echo "N/A")

    if [ "$startup_time" != "N/A" ]; then
        log_info "Startup time: $startup_time"
    fi
done

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  SUMMARY${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Total spokes checked: $TOTAL"
echo -e "Healthy: ${GREEN}$HEALTHY${NC}"
[ "$UNHEALTHY" -gt 0 ] && echo -e "Unhealthy: ${RED}$UNHEALTHY${NC}"
[ "$DEPRECATED_WARNINGS" -gt 0 ] && echo -e "Deprecated warnings: ${RED}$DEPRECATED_WARNINGS${NC}"
[ "$MAPPER_ERRORS" -gt 0 ] && echo -e "Recent mapper errors: ${YELLOW}$MAPPER_ERRORS${NC}"
echo ""

if [ "$DEPRECATED_WARNINGS" -eq 0 ] && [ "$UNHEALTHY" -eq 0 ]; then
    log_success "All spokes are healthy with no critical issues!"
    exit 0
elif [ "$DEPRECATED_WARNINGS" -gt 0 ]; then
    log_error "Found deprecated configuration warnings - update required"
    echo "See docs/KEYCLOAK_RESILIENCE_GUIDE.md for migration instructions"
    exit 1
elif [ "$UNHEALTHY" -gt 0 ]; then
    log_error "Some spokes are unhealthy - manual investigation required"
    exit 1
fi
