#!/bin/bash

# DIVE V3 Pre-Demo Checklist
# Run this script 5-10 minutes before your demo to ensure everything is ready
#
# This comprehensive check includes:
# 1. Docker container health
# 2. Network connectivity
# 3. Instance warm-up
# 4. Keycloak availability
# 5. Backend API health

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo -e "\n${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       DIVE V3 Pre-Demo Checklist                               ║${NC}"
echo -e "${CYAN}║       Run this 5-10 minutes before your demo                   ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}\n"

PASSED=0
FAILED=0
WARNINGS=0

check_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} $2"
        echo -e "  ${RED}→${NC} $3"
        ((FAILED++))
    fi
}

warn_result() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

# ═══════════════════════════════════════════════════════════════════
# PHASE 1: Docker Container Health
# ═══════════════════════════════════════════════════════════════════
echo -e "${BLUE}━━━ Phase 1: Docker Container Health ━━━${NC}\n"

cd "$PROJECT_ROOT"

# Check USA containers
containers_usa=$(docker-compose ps --format json 2>/dev/null | jq -r '.[] | select(.State == "running") | .Name' | wc -l)
if [ "$containers_usa" -ge 6 ]; then
    check_result 0 "USA instance containers running ($containers_usa containers)"
else
    check_result 1 "USA instance containers" "Only $containers_usa containers running, expected 6+"
fi

# Check FRA containers
containers_fra=$(docker-compose -f instances/fra/docker-compose.yml ps --format json 2>/dev/null | jq -r '.[] | select(.State == "running") | .Name' | wc -l)
if [ "$containers_fra" -ge 5 ]; then
    check_result 0 "FRA instance containers running ($containers_fra containers)"
else
    check_result 1 "FRA instance containers" "Only $containers_fra containers running, expected 5+"
fi

# Check DEU containers
containers_deu=$(docker-compose -f instances/deu/docker-compose.yml ps --format json 2>/dev/null | jq -r '.[] | select(.State == "running") | .Name' | wc -l)
if [ "$containers_deu" -ge 5 ]; then
    check_result 0 "DEU instance containers running ($containers_deu containers)"
else
    check_result 1 "DEU instance containers" "Only $containers_deu containers running, expected 5+"
fi

# ═══════════════════════════════════════════════════════════════════
# PHASE 2: Frontend Availability (via Cloudflare)
# ═══════════════════════════════════════════════════════════════════
echo -e "\n${BLUE}━━━ Phase 2: Frontend Availability ━━━${NC}\n"

check_frontend() {
    local name=$1
    local url=$2
    local max_attempts=5
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        http_code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 15 "$url" 2>/dev/null || echo "000")
        
        if [ "$http_code" = "200" ]; then
            check_result 0 "$name frontend accessible ($url)"
            return 0
        fi
        
        echo -e "  ${YELLOW}→${NC} Attempt $attempt: HTTP $http_code, retrying..."
        sleep 3
        ((attempt++))
    done
    
    check_result 1 "$name frontend" "HTTP $http_code after $max_attempts attempts. Run warm-up script."
    return 1
}

check_frontend "USA" "https://usa-app.dive25.com"
check_frontend "FRA" "https://fra-app.dive25.com"
check_frontend "DEU" "https://deu-app.dive25.com"

# ═══════════════════════════════════════════════════════════════════
# PHASE 3: Keycloak IdP Availability
# ═══════════════════════════════════════════════════════════════════
echo -e "\n${BLUE}━━━ Phase 3: Keycloak IdP Availability ━━━${NC}\n"

check_keycloak() {
    local name=$1
    local url=$2
    
    http_code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 "$url/realms/dive-v3-broker/.well-known/openid-configuration" 2>/dev/null || echo "000")
    
    if [ "$http_code" = "200" ]; then
        check_result 0 "$name Keycloak OIDC endpoint accessible"
    else
        check_result 1 "$name Keycloak" "HTTP $http_code - Check if Keycloak is running"
    fi
}

check_keycloak "USA" "https://usa-idp.dive25.com"
check_keycloak "FRA" "https://fra-idp.dive25.com"
check_keycloak "DEU" "https://deu-idp.dive25.com"

# ═══════════════════════════════════════════════════════════════════
# PHASE 4: Backend API Health
# ═══════════════════════════════════════════════════════════════════
echo -e "\n${BLUE}━━━ Phase 4: Backend API Health ━━━${NC}\n"

check_backend() {
    local name=$1
    local url=$2
    
    http_code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 "$url/health" 2>/dev/null || echo "000")
    
    if [ "$http_code" = "200" ]; then
        check_result 0 "$name Backend API healthy"
    else
        check_result 1 "$name Backend API" "HTTP $http_code - Check backend logs"
    fi
}

check_backend "USA" "https://usa-api.dive25.com"
check_backend "FRA" "https://fra-api.dive25.com"
check_backend "DEU" "https://deu-api.dive25.com"

# ═══════════════════════════════════════════════════════════════════
# PHASE 5: Memory and Resource Check
# ═══════════════════════════════════════════════════════════════════
echo -e "\n${BLUE}━━━ Phase 5: System Resources ━━━${NC}\n"

# Check Docker memory usage
docker_memory=$(docker stats --no-stream --format "{{.MemPerc}}" 2>/dev/null | head -1 | tr -d '%' || echo "0")
if [ -n "$docker_memory" ] && [ "${docker_memory%.*}" -lt 80 ]; then
    check_result 0 "Docker memory usage acceptable"
else
    warn_result "High Docker memory usage - consider restarting unused containers"
fi

# Check disk space
disk_usage=$(df -h . | awk 'NR==2 {print $5}' | tr -d '%')
if [ "$disk_usage" -lt 85 ]; then
    check_result 0 "Disk space sufficient (${disk_usage}% used)"
else
    warn_result "Low disk space (${disk_usage}% used) - may affect performance"
fi

# ═══════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════
echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}                    PRE-DEMO CHECKLIST SUMMARY                     ${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "  ${GREEN}Passed:${NC}   $PASSED"
echo -e "  ${YELLOW}Warnings:${NC} $WARNINGS"
echo -e "  ${RED}Failed:${NC}   $FAILED\n"

if [ $FAILED -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✓ ALL CHECKS PASSED - YOU ARE READY FOR THE DEMO!               ${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════════${NC}\n"
    exit 0
elif [ $FAILED -eq 0 ]; then
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  ⚠ READY WITH WARNINGS - Review warnings above                   ${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════════════${NC}\n"
    exit 0
else
    echo -e "${RED}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}  ✗ ISSUES DETECTED - Fix the errors above before demo            ${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════════════════════${NC}\n"
    echo -e "${CYAN}Suggested fixes:${NC}"
    echo -e "  1. Run: ${BLUE}./scripts/demo/warm-up-instances.sh${NC}"
    echo -e "  2. Check container logs: ${BLUE}docker logs <container-name>${NC}"
    echo -e "  3. Restart if needed: ${BLUE}docker-compose restart <service>${NC}\n"
    exit 1
fi


