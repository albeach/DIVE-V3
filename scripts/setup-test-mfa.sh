#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Setup Test MFA Credentials (Dynamic Multi-Instance)
# =============================================================================
# This script automatically discovers ALL running DIVE instances and configures
# user attributes for AAL testing across all of them.
#
# User AAL Levels:
#   testuser-*-1 (UNCLASSIFIED): AAL1 (acr=0, amr=[pwd])
#   testuser-*-2 (RESTRICTED):   AAL1 (acr=0, amr=[pwd])
#   testuser-*-3 (CONFIDENTIAL): AAL2 (acr=1, amr=[pwd,otp])
#   testuser-*-4 (SECRET):       AAL2 (acr=1, amr=[pwd,otp])
#   testuser-*-5 (TOP_SECRET):   AAL3 (acr=2, amr=[pwd,otp,hwk])
#   admin-*:      TOP_SECRET:    AAL3 (acr=2, amr=[pwd,otp,hwk])
# =============================================================================

set -o pipefail
# Note: Not using -e because we want to continue even if one instance fails

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Get user configuration based on username pattern
get_user_config() {
    local username="$1"
    local country="$2"

    # Determine clearance and ACR based on user number
    case "$username" in
        *-1)
            echo "UNCLASSIFIED 0 pwd"
            ;;
        *-2)
            echo "RESTRICTED 0 pwd"
            ;;
        *-3)
            echo "CONFIDENTIAL 1 pwd,otp"
            ;;
        *-4)
            echo "SECRET 1 pwd,otp"
            ;;
        *-5)
            echo "TOP_SECRET 2 pwd,otp,hwk"
            ;;
        admin-*)
            echo "TOP_SECRET 2 pwd,otp,hwk"
            ;;
        *)
            echo "UNCLASSIFIED 0 pwd"
            ;;
    esac
}

# Get COI for user
get_user_coi() {
    local username="$1"
    case "$username" in
        *-4|*-5|admin-*) echo "NATO" ;;
        *-3) echo "FVEY" ;;
        *) echo "" ;;
    esac
}

# Configure attributes for a user
setup_user() {
    local realm="$1"
    local username="$2"
    local country="$3"
    local container="$4"

    # Get configuration
    local config=$(get_user_config "$username" "$country")
    local clearance=$(echo "$config" | cut -d' ' -f1)
    local acr=$(echo "$config" | cut -d' ' -f2)
    local amr_raw=$(echo "$config" | cut -d' ' -f3)
    local coi=$(get_user_coi "$username")

    # Build AMR array
    local amr_json=""
    IFS=',' read -ra AMR_PARTS <<< "$amr_raw"
    for part in "${AMR_PARTS[@]}"; do
        if [ -n "$amr_json" ]; then
            amr_json="$amr_json,\"$part\""
        else
            amr_json="\"$part\""
        fi
    done

    echo -n "  $username: "

    # Get user ID
    local user_id
    user_id=$(docker exec "$container" /opt/keycloak/bin/kcadm.sh get users \
        -r "$realm" -q "username=$username" 2>/dev/null | jq -r '.[0].id // empty')

    if [ -z "$user_id" ]; then
        echo -e "${RED}✗ User not found${NC}"
        return 1
    fi

    # Build attributes JSON
    local attrs
    if [ -n "$coi" ]; then
        attrs="{\"acr\":[\"$acr\"],\"amr\":[$amr_json],\"clearance\":[\"$clearance\"],\"countryOfAffiliation\":[\"$country\"],\"uniqueID\":[\"$username\"],\"acpCOI\":[\"$coi\"]}"
    else
        attrs="{\"acr\":[\"$acr\"],\"amr\":[$amr_json],\"clearance\":[\"$clearance\"],\"countryOfAffiliation\":[\"$country\"],\"uniqueID\":[\"$username\"]}"
    fi

    # Update user
    docker exec "$container" /opt/keycloak/bin/kcadm.sh update "users/$user_id" \
        -r "$realm" \
        -s "attributes=$attrs" 2>/dev/null

    if [ $? -eq 0 ]; then
        local aal="AAL1"
        case "$acr" in
            "1") aal="AAL2" ;;
            "2") aal="AAL3" ;;
        esac
        echo -e "${GREEN}✓${NC} $clearance, $aal (acr=$acr, amr=[$amr_raw])"
        return 0
    else
        echo -e "${RED}✗ Failed${NC}"
        return 1
    fi
}

# Discover and configure an instance
configure_instance() {
    local container="$1"
    local instance_code=""
    local realm=""
    local country_code=""

    # Parse container name to get instance code
    if [[ "$container" == "dive-hub-keycloak" ]]; then
        instance_code="USA"
        realm="dive-v3-broker-usa"
        country_code="USA"
    elif [[ "$container" =~ dive-spoke-([a-z]+)-keycloak ]]; then
        local code_lower="${BASH_REMATCH[1]}"
        instance_code=$(echo "$code_lower" | tr '[:lower:]' '[:upper:]')
        realm="dive-v3-broker-${code_lower}"
        country_code="$instance_code"
    else
        echo -e "${YELLOW}⚠${NC} Unknown container format: $container"
        return 1
    fi

    echo -e "${CYAN}→ Configuring ${instance_code} users...${NC}"

    # Get admin password
    local admin_pass=""
    
    if [ "$instance_code" = "USA" ]; then
        # Hub uses KC_ADMIN_PASSWORD or KC_BOOTSTRAP_ADMIN_PASSWORD
        admin_pass=$(docker exec "$container" printenv KC_ADMIN_PASSWORD 2>/dev/null | tr -d '\r\n')
        if [ -z "$admin_pass" ]; then
            admin_pass=$(docker exec "$container" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null | tr -d '\r\n')
        fi
    else
        # Spokes use GCP secrets
        local secret_name="dive-v3-keycloak-$(echo $instance_code | tr '[:upper:]' '[:lower:]')"
        admin_pass=$(gcloud secrets versions access latest --secret="$secret_name" --project=dive25 2>/dev/null | tr -d '\r\n')
        
        # Fallback to container env
        if [ -z "$admin_pass" ]; then
            admin_pass=$(docker exec "$container" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null | tr -d '\r\n')
        fi
    fi

    if [ -z "$admin_pass" ]; then
        echo -e "${RED}✗ Could not get admin password for $instance_code${NC}"
        return 1
    fi

    # Authenticate
    docker exec "$container" /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master --user admin --password "$admin_pass" 2>&1 | grep -v "^$" || true
    echo ""

    # Get all users in the realm
    local users
    users=$(docker exec "$container" /opt/keycloak/bin/kcadm.sh get users \
        -r "$realm" 2>/dev/null | jq -r '.[].username')

    local user_count=0
    local success_count=0

    # Configure each user
    for user in $users; do
        ((user_count++))
        if setup_user "$realm" "$user" "$country_code" "$container"; then
            ((success_count++))
        fi
    done

    echo ""
    echo -e "  ${CYAN}Result: ${success_count}/${user_count} users configured${NC}"
    echo ""

    return 0
}

# Main
main() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     DIVE V3 - MFA Test Credential Setup (Auto-Discovery)                    ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Discover all running Keycloak containers
    echo -e "${CYAN}→ Discovering DIVE instances...${NC}"
    local keycloak_containers
    keycloak_containers=$(docker ps --format '{{.Names}}' | grep -E '^dive-(hub|spoke-[a-z]+)-keycloak$' | sort)

    if [ -z "$keycloak_containers" ]; then
        echo -e "${RED}✗ No DIVE Keycloak containers found${NC}"
        exit 1
    fi

    local container_count=$(echo "$keycloak_containers" | wc -l | tr -d ' ')
    echo -e "  Found ${GREEN}${container_count}${NC} instance(s)"
    echo ""

    # Configure each instance
    local total_instances=0
    local success_instances=0

    while IFS= read -r container; do
        ((total_instances++))
        if configure_instance "$container"; then
            ((success_instances++))
        fi
    done <<< "$keycloak_containers"

    # =========================================================================
    # SUMMARY
    # =========================================================================
    echo -e "${BLUE}══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Setup Complete                                                               ${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${CYAN}Instances Configured:${NC} ${success_instances}/${total_instances}"
    echo ""
    echo -e "  ${CYAN}User AAL Levels:${NC}"
    echo -e "    testuser-*-1: UNCLASSIFIED → AAL1 (acr=0, amr=[pwd])"
    echo -e "    testuser-*-2: RESTRICTED   → AAL1 (acr=0, amr=[pwd])"
    echo -e "    testuser-*-3: CONFIDENTIAL → AAL2 (acr=1, amr=[pwd,otp])"
    echo -e "    testuser-*-4: SECRET       → AAL2 (acr=1, amr=[pwd,otp])"
    echo -e "    testuser-*-5: TOP_SECRET   → AAL3 (acr=2, amr=[pwd,otp,hwk])"
    echo -e "    admin-*:      TOP_SECRET   → AAL3 (acr=2, amr=[pwd,otp,hwk])"
    echo ""
    echo -e "  ${CYAN}OPA Policy ACR Mapping:${NC}"
    echo -e "    acr=0 → AAL1 (single factor)"
    echo -e "    acr=1 → AAL2 (multi-factor)"
    echo -e "    acr=2 → AAL3 (hardware-backed)"
    echo ""
    echo -e "  Run ${CYAN}./scripts/verify-all-tokens.sh${NC} to verify token claims"
    echo ""
}

main "$@"
