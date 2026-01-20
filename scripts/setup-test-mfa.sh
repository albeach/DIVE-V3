#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Setup Test MFA Credentials
# =============================================================================
# This script sets user attributes for AAL2/AAL3 users to enable proper
# ABAC testing with the correct ACR/AMR claims.
#
# Users and their required authentication levels:
#   testuser-*-1 (UNCLASSIFIED): AAL1 - Password only (acr=0)
#   testuser-*-2 (RESTRICTED):   AAL1 - Password only (acr=0)
#   testuser-*-3 (CONFIDENTIAL): AAL2 - Password + TOTP (acr=1)
#   testuser-*-4 (SECRET):       AAL2 - Password + TOTP (acr=1)
#   testuser-*-5 (TOP_SECRET):   AAL3 - Password + WebAuthn (acr=2)
# =============================================================================

set -eo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Get user configuration
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
            echo "TOP_SECRET 1 pwd,otp"
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
        attrs="{\"acr\":[\"$acr\"],\"amr\":[$amr_json],\"user_acr\":[\"$acr\"],\"user_amr\":[$amr_json],\"clearance\":[\"$clearance\"],\"countryOfAffiliation\":[\"$country\"],\"uniqueID\":[\"$username\"],\"acpCOI\":[\"$coi\"]}"
    else
        attrs="{\"acr\":[\"$acr\"],\"amr\":[$amr_json],\"user_acr\":[\"$acr\"],\"user_amr\":[$amr_json],\"clearance\":[\"$clearance\"],\"countryOfAffiliation\":[\"$country\"],\"uniqueID\":[\"$username\"]}"
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

# Main
main() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     DIVE V3 - Setup Test User Attributes for AAL Testing                    ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # =========================================================================
    # HUB (USA) USERS
    # =========================================================================
    echo -e "${CYAN}→ Configuring Hub (USA) users...${NC}"

    # Get Hub admin password
    local hub_admin_pass
    hub_admin_pass=$(docker exec dive-hub-keycloak env 2>/dev/null | grep "KC_ADMIN_PASSWORD=" | cut -d'=' -f2 | tr -d '\r\n')
    [ -z "$hub_admin_pass" ] && hub_admin_pass="KeycloakAdminSecure123!"

    # Authenticate
    docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master --user admin --password "$hub_admin_pass" 2>&1 | grep -v "^$" || true
    echo ""

    for user in testuser-usa-1 testuser-usa-2 testuser-usa-3 testuser-usa-4 testuser-usa-5 admin-usa; do
        setup_user "dive-v3-broker-usa" "$user" "USA" "dive-hub-keycloak"
    done
    echo ""

    # =========================================================================
    # FRA USERS
    # =========================================================================
    if docker ps --format '{{.Names}}' | grep -q "dive-spoke-fra-keycloak"; then
        echo -e "${CYAN}→ Configuring FRA users...${NC}"

        local fra_admin_pass
        fra_admin_pass=$(gcloud secrets versions access latest --secret=dive-v3-keycloak-fra --project=dive25 2>/dev/null | tr -d '\r\n')

        if [ -n "$fra_admin_pass" ]; then
            docker exec dive-spoke-fra-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
                --server http://localhost:8080 --realm master --user admin --password "$fra_admin_pass" 2>&1 | grep -v "^$" || true
            echo ""

            for user in testuser-fra-1 testuser-fra-2 testuser-fra-3 testuser-fra-4 testuser-fra-5 admin-fra; do
                setup_user "dive-v3-broker-fra" "$user" "FRA" "dive-spoke-fra-keycloak"
            done
            echo ""
        fi
    fi

    # =========================================================================
    # SUMMARY
    # =========================================================================
    echo -e "${BLUE}══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Setup Complete                                                               ${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${CYAN}User AAL Levels:${NC}"
    echo -e "    testuser-*-1: UNCLASSIFIED → AAL1 (acr=0, amr=[pwd])"
    echo -e "    testuser-*-2: RESTRICTED   → AAL1 (acr=0, amr=[pwd])"
    echo -e "    testuser-*-3: CONFIDENTIAL → AAL2 (acr=1, amr=[pwd,otp])"
    echo -e "    testuser-*-4: SECRET       → AAL2 (acr=1, amr=[pwd,otp])"
    echo -e "    testuser-*-5: TOP_SECRET   → AAL3 (acr=2, amr=[pwd,otp,hwk])"
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
