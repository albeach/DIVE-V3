#!/usr/bin/env bash
# ============================================================================
# DIVE V3 - Federation tfvars Generator
# ============================================================================
# Generates Terraform variable files from the centralized federation registry.
# This ensures all instances have consistent, up-to-date federation partner URLs.
#
# Usage:
#   ./scripts/federation/generate-tfvars.sh           # Generate all
#   ./scripts/federation/generate-tfvars.sh usa       # Generate specific instance
#   ./scripts/federation/generate-tfvars.sh --dry-run # Preview without writing
#
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
REGISTRY_FILE="$PROJECT_ROOT/config/federation-registry.json"
TFVARS_DIR="$PROJECT_ROOT/terraform/instances"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Options
DRY_RUN=false
TARGET_INSTANCE=""

for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --help|-h)
            echo "Usage: $0 [--dry-run] [instance_code]"
            echo ""
            echo "Options:"
            echo "  --dry-run    Preview generated files without writing"
            echo "  instance     Generate only for specific instance (usa, fra, deu)"
            exit 0
            ;;
        *) TARGET_INSTANCE="$arg" ;;
    esac
done

# Check dependencies
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is required but not installed${NC}"
    echo "Install with: brew install jq"
    exit 1
fi

# Check registry exists
if [[ ! -f "$REGISTRY_FILE" ]]; then
    echo -e "${RED}Error: Federation registry not found: $REGISTRY_FILE${NC}"
    exit 1
fi

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔧 DIVE V3 tfvars Generator${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "Registry: ${BLUE}$REGISTRY_FILE${NC}"
echo -e "Output:   ${BLUE}$TFVARS_DIR${NC}"
echo ""

# Get all instances
INSTANCES=$(jq -r '.instances | keys[]' "$REGISTRY_FILE")

generate_tfvars() {
    local instance="$1"
    local instance_upper=$(echo "$instance" | tr '[:lower:]' '[:upper:]')
    
    # Get instance data
    local app_url=$(jq -r ".instances.$instance.urls.app" "$REGISTRY_FILE")
    local api_url=$(jq -r ".instances.$instance.urls.api" "$REGISTRY_FILE")
    local idp_url=$(jq -r ".instances.$instance.urls.idp" "$REGISTRY_FILE")
    local instance_name=$(jq -r ".instances.$instance.name" "$REGISTRY_FILE")
    local local_port=$(jq -r ".instances.$instance.keycloak.localPort // empty" "$REGISTRY_FILE")
    local remote_host=$(jq -r ".instances.$instance.keycloak.remoteHost // empty" "$REGISTRY_FILE")
    local admin_password=$(jq -r ".defaults.adminPassword" "$REGISTRY_FILE")
    local create_test_users=$(jq -r ".defaults.createTestUsers" "$REGISTRY_FILE")
    
    # Determine keycloak_url
    local keycloak_url
    if [[ -n "$local_port" && "$local_port" != "null" ]]; then
        keycloak_url="https://localhost:$local_port"
    elif [[ -n "$remote_host" && "$remote_host" != "null" ]]; then
        keycloak_url="$idp_url"
    else
        keycloak_url="$idp_url"
    fi
    
    # Get federation partners
    local partners=$(jq -r ".federation.matrix.$instance[]" "$REGISTRY_FILE" 2>/dev/null || echo "")
    
    # Generate tfvars content
    local output_file="$TFVARS_DIR/$instance.tfvars"
    local content=""
    
    content+="# $instance_upper Instance Configuration\n"
    content+="# AUTO-GENERATED from federation-registry.json\n"
    content+="# DO NOT EDIT MANUALLY - Run: ./scripts/federation/generate-tfvars.sh\n"
    content+="# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")\n"
    content+="\n"
    content+="keycloak_url            = \"$keycloak_url\"\n"
    content+="keycloak_admin_username = \"admin\"\n"
    content+="keycloak_admin_password = \"$admin_password\"\n"
    content+="app_url                 = \"$app_url\"\n"
    content+="api_url                 = \"$api_url\"\n"
    content+="idp_url                 = \"$idp_url\"\n"
    content+="create_test_users       = $create_test_users\n"
    content+="\n"
    content+="# Federation partners - AUTO-GENERATED from registry\n"
    content+="federation_partners = {\n"
    
    local first=true
    for partner in $partners; do
        local partner_upper=$(echo "$partner" | tr '[:lower:]' '[:upper:]')
        local partner_name=$(jq -r ".instances.$partner.name" "$REGISTRY_FILE")
        local partner_idp=$(jq -r ".instances.$partner.urls.idp" "$REGISTRY_FILE")
        local partner_enabled=$(jq -r ".instances.$partner.enabled" "$REGISTRY_FILE")
        
        if [[ "$first" != "true" ]]; then
            content+="\n"
        fi
        first=false
        
        content+="  $partner = {\n"
        content+="    instance_code = \"$partner_upper\"\n"
        content+="    instance_name = \"$partner_name\"\n"
        content+="    idp_url       = \"$partner_idp\"\n"
        content+="    enabled       = $partner_enabled\n"
        content+="  }\n"
    done
    
    content+="}\n"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}[DRY-RUN]${NC} Would write: $output_file"
        echo "----------------------------------------"
        echo -e "$content"
        echo "----------------------------------------"
    else
        echo -e "$content" > "$output_file"
        echo -e "${GREEN}✓${NC} Generated: $output_file"
    fi
}

# Generate for specified instance or all
if [[ -n "$TARGET_INSTANCE" ]]; then
    # Validate instance exists
    if ! jq -e ".instances.$TARGET_INSTANCE" "$REGISTRY_FILE" > /dev/null 2>&1; then
        echo -e "${RED}Error: Instance '$TARGET_INSTANCE' not found in registry${NC}"
        echo "Available instances: $INSTANCES"
        exit 1
    fi
    generate_tfvars "$TARGET_INSTANCE"
else
    # Generate all
    for instance in $INSTANCES; do
        generate_tfvars "$instance"
    done
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}✓ Generation complete!${NC}"
echo -e "${GREEN}============================================${NC}"

if [[ "$DRY_RUN" == "false" ]]; then
    echo ""
    echo "Next steps:"
    echo "  1. Review generated files in: $TFVARS_DIR/"
    echo "  2. Apply Terraform for each workspace:"
    echo "     cd terraform/instances"
    echo "     terraform workspace select usa && terraform apply -var-file=usa.tfvars"
    echo "     terraform workspace select fra && terraform apply -var-file=fra.tfvars"
    echo "     terraform workspace select deu && terraform apply -var-file=deu.tfvars"
    echo ""
    echo "  Or use: ./scripts/federation/apply-all.sh"
fi


