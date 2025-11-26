#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Show Federation Status
# =============================================================================
# Displays current federation trust relationships between all instances
#
# Usage:
#   ./scripts/show-federation-status.sh
#   ./scripts/show-federation-status.sh --json
#   ./scripts/show-federation-status.sh --matrix
#
# =============================================================================

set -uo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Instance configuration
declare -A INSTANCE_NAMES=(
    ["USA"]="United States"
    ["FRA"]="France"
    ["DEU"]="Germany"
    ["GBR"]="United Kingdom"
    ["CAN"]="Canada"
    ["ITA"]="Italy"
    ["ESP"]="Spain"
    ["NLD"]="Netherlands"
    ["POL"]="Poland"
)

REALM="dive-v3-broker"

# =============================================================================
# FUNCTIONS
# =============================================================================

usage() {
    echo -e "${CYAN}DIVE V3 - Federation Status${NC}"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --json       Output as JSON"
    echo "  --matrix     Show trust matrix"
    echo "  --help       Show this help"
    exit 0
}

# Get admin token
get_admin_token() {
    local instance=$1
    local instance_lower=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    local keycloak_url="https://${instance_lower}-idp.dive25.com"
    
    curl -sf -X POST "${keycloak_url}/realms/master/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=admin" \
        --insecure 2>/dev/null | jq -r '.access_token // empty'
}

# Check if instance is running
is_instance_running() {
    local instance=$1
    local instance_lower=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    local keycloak_url="https://${instance_lower}-idp.dive25.com"
    
    curl -sf "${keycloak_url}/health/ready" --insecure >/dev/null 2>&1
}

# Get IdP brokers for an instance
get_idp_brokers() {
    local instance=$1
    local instance_lower=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    local keycloak_url="https://${instance_lower}-idp.dive25.com"
    
    local token=$(get_admin_token "$instance")
    if [[ -z "$token" || "$token" == "null" ]]; then
        echo "[]"
        return
    fi
    
    curl -sf "${keycloak_url}/admin/realms/${REALM}/identity-provider/instances" \
        -H "Authorization: Bearer ${token}" \
        --insecure 2>/dev/null || echo "[]"
}

# Build trust map
build_trust_map() {
    local -n map=$1
    
    for instance in "${!INSTANCE_NAMES[@]}"; do
        if ! is_instance_running "$instance"; then
            continue
        fi
        
        local brokers=$(get_idp_brokers "$instance")
        local federation_partners=$(echo "$brokers" | jq -r '.[] | select(.alias | endswith("-federation")) | .alias | gsub("-federation$"; "") | ascii_upcase')
        
        for partner in $federation_partners; do
            map["${instance}->${partner}"]=1
        done
    done
}

# =============================================================================
# MAIN
# =============================================================================

OUTPUT_FORMAT="text"

while [[ $# -gt 0 ]]; do
    case $1 in
        --json)
            OUTPUT_FORMAT="json"
            shift
            ;;
        --matrix)
            OUTPUT_FORMAT="matrix"
            shift
            ;;
        --help|-h)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

echo -e "${CYAN}Scanning federation trust relationships...${NC}" >&2
echo "" >&2

# Find running instances
RUNNING_INSTANCES=()
for instance in USA FRA DEU GBR CAN ITA ESP NLD POL; do
    if is_instance_running "$instance"; then
        RUNNING_INSTANCES+=("$instance")
    fi
done

if [[ ${#RUNNING_INSTANCES[@]} -eq 0 ]]; then
    echo -e "${RED}No running instances found${NC}" >&2
    exit 1
fi

echo -e "${GREEN}Found ${#RUNNING_INSTANCES[@]} running instance(s): ${RUNNING_INSTANCES[*]}${NC}" >&2
echo "" >&2

# Build trust map
declare -A TRUST_MAP
build_trust_map TRUST_MAP

# Output based on format
case $OUTPUT_FORMAT in
    json)
        echo "{"
        echo "  \"running_instances\": [$(printf '"%s",' "${RUNNING_INSTANCES[@]}" | sed 's/,$//')],"
        echo "  \"trust_relationships\": ["
        first=true
        for key in "${!TRUST_MAP[@]}"; do
            IFS='->' read -r source target <<< "$key"
            [[ "$first" != "true" ]] && echo ","
            echo -n "    {\"source\": \"$source\", \"target\": \"$target\"}"
            first=false
        done
        echo ""
        echo "  ],"
        echo "  \"asymmetric_warnings\": ["
        first=true
        for key in "${!TRUST_MAP[@]}"; do
            IFS='->' read -r source target <<< "$key"
            reverse="${target}->${source}"
            if [[ -z "${TRUST_MAP[$reverse]:-}" ]]; then
                [[ "$first" != "true" ]] && echo ","
                echo -n "    {\"existing\": \"${source} -> ${target}\", \"missing\": \"${target} -> ${source}\"}"
                first=false
            fi
        done
        echo ""
        echo "  ]"
        echo "}"
        ;;
    
    matrix)
        # Print header
        printf "%-6s" ""
        for target in "${RUNNING_INSTANCES[@]}"; do
            printf "%-6s" "$target"
        done
        echo ""
        
        # Print separator
        printf "%-6s" ""
        for _ in "${RUNNING_INSTANCES[@]}"; do
            printf "%-6s" "-----"
        done
        echo ""
        
        # Print rows
        for source in "${RUNNING_INSTANCES[@]}"; do
            printf "%-6s" "$source"
            for target in "${RUNNING_INSTANCES[@]}"; do
                if [[ "$source" == "$target" ]]; then
                    printf "%-6s" "  -  "
                elif [[ -n "${TRUST_MAP[${source}->${target}]:-}" ]]; then
                    printf "${GREEN}%-6s${NC}" "  ✓  "
                else
                    printf "${RED}%-6s${NC}" "  ✗  "
                fi
            done
            echo ""
        done
        
        echo ""
        echo -e "${GREEN}✓${NC} = Trust exists   ${RED}✗${NC} = No trust"
        ;;
    
    text)
        echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${CYAN}║              DIVE V3 - Federation Trust Status                    ║${NC}"
        echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        
        # Show running instances
        echo -e "${BLUE}Running Instances:${NC}"
        for instance in "${RUNNING_INSTANCES[@]}"; do
            echo -e "  ${GREEN}●${NC} ${instance} (${INSTANCE_NAMES[$instance]})"
        done
        echo ""
        
        # Show trust relationships
        echo -e "${BLUE}Trust Relationships:${NC}"
        if [[ ${#TRUST_MAP[@]} -eq 0 ]]; then
            echo -e "  ${YELLOW}No federation relationships configured${NC}"
        else
            for key in $(echo "${!TRUST_MAP[@]}" | tr ' ' '\n' | sort); do
                IFS='->' read -r source target <<< "$key"
                # Check if bidirectional
                reverse="${target}->${source}"
                if [[ -n "${TRUST_MAP[$reverse]:-}" ]]; then
                    if [[ "$source" < "$target" ]]; then
                        echo -e "  ${GREEN}↔${NC} ${source} ⟷ ${target} (bidirectional)"
                    fi
                else
                    echo -e "  ${YELLOW}→${NC} ${source} → ${target} (one-way)"
                fi
            done
        fi
        echo ""
        
        # Show asymmetric warnings
        local has_asymmetric=false
        for key in "${!TRUST_MAP[@]}"; do
            IFS='->' read -r source target <<< "$key"
            reverse="${target}->${source}"
            if [[ -z "${TRUST_MAP[$reverse]:-}" ]]; then
                if [[ "$has_asymmetric" == "false" ]]; then
                    echo -e "${YELLOW}⚠ Asymmetric Trust Warnings:${NC}"
                    has_asymmetric=true
                fi
                echo -e "  ${source} trusts ${target}, but ${target} does not trust ${source}"
            fi
        done
        
        if [[ "$has_asymmetric" == "true" ]]; then
            echo ""
            echo -e "  ${BLUE}Fix with:${NC} ./scripts/add-federation-partner.sh <SOURCE> <TARGET>"
        fi
        ;;
esac


