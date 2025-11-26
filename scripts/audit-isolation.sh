#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 - Instance Isolation Audit Script
# =============================================================================
# Best practice approach to verify 100% isolation between instances
# Run this after any deployment to confirm no cross-contamination
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo ""
echo -e "${CYAN}=============================================="
echo "  DIVE V3 - Instance Isolation Audit"
echo -e "==============================================${NC}"
echo ""

ERRORS=0
WARNINGS=0

# =============================================================================
# AUDIT FUNCTIONS
# =============================================================================

audit_pass() {
    echo -e "${GREEN}  ✓${NC} $1"
}

audit_fail() {
    echo -e "${RED}  ✗${NC} $1"
    ((ERRORS++))
}

audit_warn() {
    echo -e "${YELLOW}  ⚠${NC} $1"
    ((WARNINGS++))
}

# Audit environment variables
audit_env_vars() {
    local instance=$1
    local container=$2
    local expected_api=$3
    local expected_idp=$4
    
    echo ""
    echo -e "${BLUE}[$instance] Auditing environment variables...${NC}"
    
    # Check NEXT_PUBLIC_API_URL
    local actual_api=$(docker exec "$container" env 2>/dev/null | grep "^NEXT_PUBLIC_API_URL=" | cut -d= -f2)
    if [ "$actual_api" == "$expected_api" ]; then
        audit_pass "NEXT_PUBLIC_API_URL: $actual_api"
    else
        audit_fail "NEXT_PUBLIC_API_URL: Expected '$expected_api', got '$actual_api'"
    fi
    
    # Check NEXT_PUBLIC_KEYCLOAK_URL
    local actual_idp=$(docker exec "$container" env 2>/dev/null | grep "^NEXT_PUBLIC_KEYCLOAK_URL=" | cut -d= -f2)
    if [ "$actual_idp" == "$expected_idp" ]; then
        audit_pass "NEXT_PUBLIC_KEYCLOAK_URL: $actual_idp"
    else
        audit_fail "NEXT_PUBLIC_KEYCLOAK_URL: Expected '$expected_idp', got '$actual_idp'"
    fi
    
    # Check NEXT_PUBLIC_INSTANCE
    local actual_instance=$(docker exec "$container" env 2>/dev/null | grep "^NEXT_PUBLIC_INSTANCE=" | cut -d= -f2)
    if [ "$actual_instance" == "$instance" ]; then
        audit_pass "NEXT_PUBLIC_INSTANCE: $actual_instance"
    else
        audit_fail "NEXT_PUBLIC_INSTANCE: Expected '$instance', got '$actual_instance'"
    fi
    
    # Check NEXTAUTH_URL
    local nextauth_url=$(docker exec "$container" env 2>/dev/null | grep "^NEXTAUTH_URL=" | cut -d= -f2)
    local expected_nextauth="https://${instance,,}-app.dive25.com"
    if [ "$nextauth_url" == "$expected_nextauth" ]; then
        audit_pass "NEXTAUTH_URL: $nextauth_url"
    else
        audit_fail "NEXTAUTH_URL: Expected '$expected_nextauth', got '$nextauth_url'"
    fi
}

# Audit for cross-references
audit_cross_references() {
    local instance=$1
    local container=$2
    
    echo ""
    echo -e "${BLUE}[$instance] Auditing for cross-contamination...${NC}"
    
    # Get all env vars that could indicate wrong instance
    local all_other_instances=("USA" "FRA" "DEU" "GBR" "CAN")
    
    for other in "${all_other_instances[@]}"; do
        if [ "$other" != "$instance" ]; then
            local other_lower="${other,,}"
            
            # Check if any NEXT_PUBLIC_* vars point to other instances
            local cross_ref=$(docker exec "$container" env 2>/dev/null | grep "^NEXT_PUBLIC_" | grep -i "${other_lower}-" || true)
            if [ -n "$cross_ref" ]; then
                audit_fail "Found cross-reference to $other: $cross_ref"
            fi
        fi
    done
    
    if [ $ERRORS -eq 0 ]; then
        audit_pass "No cross-references found to other instances"
    fi
}

# Audit volume isolation
audit_volumes() {
    local instance=$1
    local container=$2
    
    echo ""
    echo -e "${BLUE}[$instance] Auditing volume isolation...${NC}"
    
    # Check for instance-specific volumes
    local mounts=$(docker inspect "$container" --format '{{range .Mounts}}{{.Name}}|{{end}}' 2>/dev/null)
    
    if [[ "$mounts" == *"frontend_${instance,,}_node_modules"* ]]; then
        audit_pass "Uses isolated node_modules volume"
    else
        audit_warn "Using shared node_modules (potential contamination)"
    fi
    
    if [[ "$mounts" == *"frontend_${instance,,}_next"* ]]; then
        audit_pass "Uses isolated .next build volume"
    else
        audit_warn "Using shared .next volume (potential contamination)"
    fi
}

# Audit network isolation
audit_network() {
    local instance=$1
    local container=$2
    
    echo ""
    echo -e "${BLUE}[$instance] Auditing network isolation...${NC}"
    
    local networks=$(docker inspect "$container" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null)
    
    if [[ "$networks" == *"dive-${instance,,}-network"* ]] || [[ "$networks" == *"dive-network"* && "$instance" == "USA" ]]; then
        audit_pass "Container on correct network: $networks"
    else
        audit_warn "Container on unexpected network: $networks"
    fi
}

# Audit via HTTP response
audit_http_response() {
    local instance=$1
    local url=$2
    
    echo ""
    echo -e "${BLUE}[$instance] Auditing HTTP response from $url...${NC}"
    
    # Check HTTP status
    local status=$(curl -sI "$url" --max-time 10 | head -1 | tr -d '\r')
    if [[ "$status" == *"200"* ]]; then
        audit_pass "HTTP status: $status"
    else
        audit_fail "HTTP status: $status (expected 200)"
    fi
}

# =============================================================================
# MAIN AUDIT
# =============================================================================

echo -e "${CYAN}Starting isolation audit...${NC}"

# Audit USA instance
if docker ps --format '{{.Names}}' | grep -q "^dive-v3-frontend$"; then
    audit_env_vars "USA" "dive-v3-frontend" "https://usa-api.dive25.com" "https://usa-idp.dive25.com"
    audit_cross_references "USA" "dive-v3-frontend"
    audit_volumes "USA" "dive-v3-frontend"
    audit_network "USA" "dive-v3-frontend"
    audit_http_response "USA" "https://usa-app.dive25.com/"
else
    echo -e "${YELLOW}[USA] Frontend container not running - skipping${NC}"
fi

# Audit FRA instance
if docker ps --format '{{.Names}}' | grep -q "^dive-v3-frontend-fra$"; then
    audit_env_vars "FRA" "dive-v3-frontend-fra" "https://fra-api.dive25.com" "https://fra-idp.dive25.com"
    audit_cross_references "FRA" "dive-v3-frontend-fra"
    audit_volumes "FRA" "dive-v3-frontend-fra"
    audit_network "FRA" "dive-v3-frontend-fra"
    audit_http_response "FRA" "https://fra-app.dive25.com/"
else
    echo -e "${YELLOW}[FRA] Frontend container not running - skipping${NC}"
fi

# Audit DEU instance
if docker ps --format '{{.Names}}' | grep -q "^dive-v3-frontend-deu$"; then
    audit_env_vars "DEU" "dive-v3-frontend-deu" "https://deu-api.dive25.com" "https://deu-idp.dive25.com"
    audit_cross_references "DEU" "dive-v3-frontend-deu"
    audit_volumes "DEU" "dive-v3-frontend-deu"
    audit_network "DEU" "dive-v3-frontend-deu"
    audit_http_response "DEU" "https://deu-app.dive25.com/"
else
    echo -e "${YELLOW}[DEU] Frontend container not running - skipping${NC}"
fi

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo -e "${CYAN}=============================================="
echo "  AUDIT SUMMARY"
echo -e "==============================================${NC}"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All instances are properly isolated!${NC}"
    echo ""
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ Audit completed with $WARNINGS warning(s)${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Audit failed with $ERRORS error(s) and $WARNINGS warning(s)${NC}"
    echo ""
    echo -e "${RED}ISOLATION COMPROMISED - Review and fix before continuing${NC}"
    exit 1
fi


