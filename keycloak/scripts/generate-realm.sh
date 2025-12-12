#!/bin/bash
# DIVE V3 - Instance-Specific Realm Generator
#
# Generates a realm JSON file customized for a specific instance (USA, FRA, GBR, etc.)
# Uses the base dive-v3-broker.json as a template.
#
# Usage: ./generate-realm.sh <instance_code> [output_dir]
#   instance_code: USA, FRA, GBR, DEU, CAN, ESP, ITA, NLD, POL
#   output_dir: Optional output directory (defaults to keycloak/realms)
#
# Example: ./generate-realm.sh FRA
#          ./generate-realm.sh GBR /tmp/realms

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYCLOAK_DIR="$(dirname "$SCRIPT_DIR")"
TEMPLATE="${KEYCLOAK_DIR}/realms/dive-v3-broker.json"

# Instance code (required)
INSTANCE_CODE="${1:-USA}"
OUTPUT_DIR="${2:-${KEYCLOAK_DIR}/realms}"

# Get instance configuration (Bash 3 compatible)
get_instance_name() {
    case "$1" in
        USA) echo "United States" ;;
        FRA) echo "France" ;;
        GBR) echo "United Kingdom" ;;
        DEU) echo "Germany" ;;
        CAN) echo "Canada" ;;
        ESP) echo "Spain" ;;
        ITA) echo "Italy" ;;
        NLD) echo "Netherlands" ;;
        POL) echo "Poland" ;;
        NZL) echo "New Zealand" ;;
        AUS) echo "Australia" ;;
        JPN) echo "Japan" ;;
        KOR) echo "South Korea" ;;
        *) echo "" ;;
    esac
}

get_instance_theme() {
    case "$1" in
        USA) echo "dive-v3-usa" ;;
        FRA) echo "dive-v3-fra" ;;
        GBR) echo "dive-v3-gbr" ;;
        DEU) echo "dive-v3-deu" ;;
        CAN) echo "dive-v3-can" ;;
        ESP) echo "dive-v3-esp" ;;
        ITA) echo "dive-v3-ita" ;;
        NLD) echo "dive-v3-nld" ;;
        POL) echo "dive-v3-pol" ;;
        NZL) echo "dive-v3" ;;
        AUS) echo "dive-v3" ;;
        JPN) echo "dive-v3" ;;
        KOR) echo "dive-v3" ;;
        *) echo "dive-v3" ;;
    esac
}

# Validate instance code
INSTANCE_NAME=$(get_instance_name "$INSTANCE_CODE")
if [ -z "$INSTANCE_NAME" ]; then
    echo "Error: Unknown instance code: $INSTANCE_CODE"
    echo "Valid codes: USA, FRA, GBR, DEU, CAN, ESP, ITA, NLD, POL"
    exit 1
fi

# Check template exists
if [ ! -f "$TEMPLATE" ]; then
    echo "Error: Template not found: $TEMPLATE"
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

INSTANCE_LOWER=$(echo "$INSTANCE_CODE" | tr '[:upper:]' '[:lower:]')
OUTPUT_FILE="${OUTPUT_DIR}/dive-v3-broker-${INSTANCE_LOWER}.json"
THEME=$(get_instance_theme "$INSTANCE_CODE")
IDP_NAME="$INSTANCE_NAME"

echo "Generating realm for: $INSTANCE_CODE ($INSTANCE_NAME)"
echo "Theme: $THEME"
echo "Output: $OUTPUT_FILE"

# Generate instance-specific realm
# Uses jq for proper JSON manipulation
jq --arg code "$INSTANCE_CODE" \
   --arg name "$INSTANCE_NAME" \
   --arg lower "$INSTANCE_LOWER" \
   --arg theme "$THEME" \
   --arg idp_name "$IDP_NAME" \
   '
   # Update realm metadata
   .displayName = "DIVE V3 - \($name)" |
   .displayNameHtml = "<div class=\"kc-logo-text\"><span>DIVE V3 - \($name)</span></div>" |
   .loginTheme = $theme |
   
   # Update IdP
   .identityProviders[0].alias = "\($lower)-idp" |
   .identityProviders[0].displayName = $name |
   
   # Update IdP mappers
   .identityProviderMappers = [.identityProviderMappers[] | .identityProviderAlias = "\($lower)-idp"] |
   
   # Update admin user
   .users = [.users[] | 
     if .username == "admin-usa" then 
       .username = "admin-\($lower)" |
       .email = "admin-\($lower)@dive-demo.example" |
       .lastName = $code |
       .attributes.uniqueID = ["admin-\($lower)"] |
       .attributes.countryOfAffiliation = [$code]
     elif .username | startswith("test-usa") then
       .username = (.username | sub("test-usa"; "test-\($lower)")) |
       .email = (.email | sub("test-usa"; "test-\($lower)")) |
       .attributes.uniqueID = [(.attributes.uniqueID[0] | sub("test-usa"; "test-\($lower)"))] |
       .attributes.countryOfAffiliation = [$code]
     else
       .
     end
   ]
   ' "$TEMPLATE" > "$OUTPUT_FILE"

echo "Successfully generated: $OUTPUT_FILE"
echo ""
echo "To use this realm, copy to keycloak/realms/ and set:"
echo "  INSTANCE_CODE=$INSTANCE_CODE in docker-compose"
