#!/usr/bin/env bash
# Federation Registry Manager
# Manages bidirectional federation agreements between DIVE instances
# Updates trusted_issuers.json with federation partners dynamically

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

DATA_FILE="${PROJECT_ROOT}/policies/data/trusted-issuers.json"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

usage() {
    echo "Usage: $0 <command> [args]"
    echo ""
    echo "Commands:"
    echo "  add-issuer <issuer-url> <tenant> <name> [trust-level]"
    echo "      Add a new trusted issuer"
    echo ""
    echo "  add-federation <tenant-a> <tenant-b>"
    echo "      Create bidirectional federation agreement"
    echo ""
    echo "  remove-federation <tenant-a> <tenant-b>"
    echo "      Remove federation agreement"
    echo ""
    echo "  list"
    echo "      List all trusted issuers and federations"
    echo ""
    echo "  reload"
    echo "      Trigger OPAL to reload policies"
    echo ""
    echo "Examples:"
    echo "  $0 add-issuer 'https://spoke.example.com/realms/dive-v3-broker-fra' FRA 'France Spoke' HIGH"
    echo "  $0 add-federation USA FRA"
    echo "  $0 list"
    echo "  $0 reload"
    exit 1
}

add_issuer() {
    local issuer_url="$1"
    local tenant="$2"
    local name="$3"
    local trust_level="${4:-MEDIUM}"
    
    echo -e "${BLUE}Adding trusted issuer:${NC}"
    echo "  URL: $issuer_url"
    echo "  Tenant: $tenant"
    echo "  Name: $name"
    echo "  Trust Level: $trust_level"
    
    # Use jq to add issuer
    jq --arg url "$issuer_url" \
       --arg tenant "$tenant" \
       --arg name "$name" \
       --arg trust "$trust_level" \
       '.trusted_issuers[$url] = {
           "tenant": $tenant,
           "name": $name,
           "country": $tenant,
           "trust_level": $trust,
           "enabled": true
       }' "$DATA_FILE" > "${DATA_FILE}.tmp" && mv "${DATA_FILE}.tmp" "$DATA_FILE"
    
    echo -e "${GREEN}✅ Issuer added${NC}"
}

add_federation() {
    local tenant_a="$1"
    local tenant_b="$2"
    
    echo -e "${BLUE}Creating federation:${NC} $tenant_a ↔ $tenant_b"
    
    # Add tenant_b to tenant_a's federation list
    jq --arg a "$tenant_a" \
       --arg b "$tenant_b" \
       '.federation_matrix[$a] |= (. // [] | . + [$b] | unique)' \
       "$DATA_FILE" > "${DATA_FILE}.tmp" && mv "${DATA_FILE}.tmp" "$DATA_FILE"
    
    # Add tenant_a to tenant_b's federation list (bidirectional)
    jq --arg a "$tenant_a" \
       --arg b "$tenant_b" \
       '.federation_matrix[$b] |= (. // [] | . + [$a] | unique)' \
       "$DATA_FILE" > "${DATA_FILE}.tmp" && mv "${DATA_FILE}.tmp" "$DATA_FILE"
    
    echo -e "${GREEN}✅ Bidirectional federation created${NC}"
}

remove_federation() {
    local tenant_a="$1"
    local tenant_b="$2"
    
    echo -e "${YELLOW}Removing federation:${NC} $tenant_a ↔ $tenant_b"
    
    # Remove tenant_b from tenant_a's list
    jq --arg a "$tenant_a" \
       --arg b "$tenant_b" \
       '.federation_matrix[$a] |= (. // [] | map(select(. != $b)))' \
       "$DATA_FILE" > "${DATA_FILE}.tmp" && mv "${DATA_FILE}.tmp" "$DATA_FILE"
    
    # Remove tenant_a from tenant_b's list
    jq --arg a "$tenant_a" \
       --arg b "$tenant_b" \
       '.federation_matrix[$b] |= (. // [] | map(select(. != $a)))' \
       "$DATA_FILE" > "${DATA_FILE}.tmp" && mv "${DATA_FILE}.tmp" "$DATA_FILE"
    
    echo -e "${GREEN}✅ Federation removed${NC}"
}

list_config() {
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Trusted Issuers${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    jq -r '.trusted_issuers | to_entries[] | "\(.key) → \(.value.tenant) (\(.value.trust_level))"' "$DATA_FILE"
    
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Federation Matrix${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    jq -r '.federation_matrix | to_entries[] | "\(.key) → \(.value | join(", "))"' "$DATA_FILE"
}

reload_policies() {
    echo -e "${BLUE}Reloading OPAL policies...${NC}"
    
    # Trigger OPAL reload
    if curl -sk -X POST https://localhost:7002/policy/reload 2>&1 | grep -q "detail"; then
        echo -e "${YELLOW}⚠️  OPAL reload endpoint not available (may need custom implementation)${NC}"
        echo -e "${BLUE}Alternative: Restart OPA container${NC}"
        echo "  docker restart dive-hub-opa"
    else
        echo -e "${GREEN}✅ Policies reloaded${NC}"
    fi
    
    echo ""
    echo -e "${BLUE}Notifying OPA of data update...${NC}"
    # Push data directly to OPA
    curl -sk -X PUT https://localhost:8181/v1/data/trusted_issuers \
        -H "Content-Type: application/json" \
        -d @<(jq '.trusted_issuers' "$DATA_FILE") > /dev/null 2>&1
    
    curl -sk -X PUT https://localhost:8181/v1/data/federation_matrix \
        -H "Content-Type: application/json" \
        -d @<(jq '.federation_matrix' "$DATA_FILE") > /dev/null 2>&1
    
    echo -e "${GREEN}✅ Data pushed to OPA${NC}"
}

# Main
case "${1:-}" in
    add-issuer)
        [[ $# -lt 4 ]] && usage
        add_issuer "$2" "$3" "$4" "${5:-MEDIUM}"
        ;;
    add-federation)
        [[ $# -lt 3 ]] && usage
        add_federation "$2" "$3"
        ;;
    remove-federation)
        [[ $# -lt 3 ]] && usage
        remove_federation "$2" "$3"
        ;;
    list)
        list_config
        ;;
    reload)
        reload_policies
        ;;
    *)
        usage
        ;;
esac

# sc2034-anchor
: "${RED:-}"
