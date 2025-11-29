#!/usr/local/bin/bash
#
# DIVE V3 - MFA Configuration for All Instances
# 
# This script configures MFA (AAL2/AAL3) for federated users across all instances.
# 
# Architecture:
# - Disables postBrokerLoginFlowAlias (doesn't work with federated users)
# - Uses Required Actions for MFA enforcement
# - TOP_SECRET users: webauthn-register-passwordless (AAL3)
# - SECRET/CONFIDENTIAL users: CONFIGURE_TOTP (AAL2)
# - UNCLASSIFIED users: No MFA required (AAL1)
#
# Date: November 29, 2025
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REALM="dive-v3-broker"
ADMIN_USER="admin"
ADMIN_PASSWORD="DivePilot2025!SecureAdmin"

# Instance configurations
declare -A INSTANCES=(
    ["usa"]="dive-v3-keycloak:http://localhost:8080"
    ["fra"]="dive-v3-keycloak-fra:http://localhost:8080"
    ["gbr"]="dive-v3-keycloak-gbr:http://localhost:8080"
)

# Remote instance (DEU)
DEU_HOST="prosecurity.biz"
DEU_USER="root"
DEU_CONTAINER="dive-v3-keycloak-deu"

# IdP aliases to configure
IDP_ALIASES=("usa-federation" "fra-federation" "gbr-federation" "deu-federation")

# Test users by clearance
declare -A TEST_USERS_CLEARANCE=(
    ["testuser-usa-1"]="UNCLASSIFIED"
    ["testuser-usa-2"]="CONFIDENTIAL"
    ["testuser-usa-3"]="SECRET"
    ["testuser-usa-4"]="TOP_SECRET"
    ["testuser-fra-1"]="UNCLASSIFIED"
    ["testuser-fra-2"]="CONFIDENTIAL"
    ["testuser-fra-3"]="SECRET"
    ["testuser-fra-4"]="TOP_SECRET"
    ["testuser-gbr-1"]="UNCLASSIFIED"
    ["testuser-gbr-2"]="CONFIDENTIAL"
    ["testuser-gbr-3"]="SECRET"
    ["testuser-gbr-4"]="TOP_SECRET"
    ["testuser-deu-1"]="UNCLASSIFIED"
    ["testuser-deu-2"]="CONFIDENTIAL"
    ["testuser-deu-3"]="SECRET"
    ["testuser-deu-4"]="TOP_SECRET"
)

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Execute kcadm command on local instance
kcadm_local() {
    local container=$1
    shift
    docker exec "$container" /opt/keycloak/bin/kcadm.sh "$@" \
        --server http://localhost:8080 \
        --realm master \
        --user "$ADMIN_USER" \
        --password "$ADMIN_PASSWORD" 2>/dev/null
}

# Execute kcadm command on remote DEU instance
kcadm_remote() {
    ssh -o StrictHostKeyChecking=no "$DEU_USER@$DEU_HOST" \
        "docker exec $DEU_CONTAINER /opt/keycloak/bin/kcadm.sh $* \
        --server http://localhost:8080 \
        --realm master \
        --user $ADMIN_USER \
        --password $ADMIN_PASSWORD" 2>/dev/null
}

# Get user ID by username
get_user_id() {
    local container=$1
    local username=$2
    local is_remote=$3
    
    if [ "$is_remote" = "true" ]; then
        kcadm_remote "get users -r $REALM -q username=$username" | jq -r '.[0].id // empty'
    else
        kcadm_local "$container" get users -r "$REALM" -q "username=$username" | jq -r '.[0].id // empty'
    fi
}

# Configure IdP to disable post-broker-login flow
configure_idp() {
    local container=$1
    local idp_alias=$2
    local is_remote=$3
    
    log_info "Configuring IdP: $idp_alias (disabling postBrokerLoginFlowAlias)"
    
    if [ "$is_remote" = "true" ]; then
        kcadm_remote "update identity-provider/instances/$idp_alias -r $REALM -s postBrokerLoginFlowAlias=" || true
    else
        kcadm_local "$container" update "identity-provider/instances/$idp_alias" -r "$REALM" -s 'postBrokerLoginFlowAlias=' || true
    fi
}

# Configure WebAuthn Passwordless Policy for AAL3
configure_webauthn_policy() {
    local container=$1
    local is_remote=$2
    
    log_info "Configuring WebAuthn Passwordless Policy for AAL3 compliance"
    
    if [ "$is_remote" = "true" ]; then
        kcadm_remote "update realms/$REALM \
            -s webAuthnPolicyPasswordlessRpEntityName='DIVE V3 Coalition - AAL3' \
            -s webAuthnPolicyPasswordlessAuthenticatorAttachment=cross-platform \
            -s webAuthnPolicyPasswordlessUserVerificationRequirement=required \
            -s webAuthnPolicyPasswordlessRequireResidentKey=Yes \
            -s webAuthnPolicyPasswordlessAttestationConveyancePreference=direct"
    else
        kcadm_local "$container" update "realms/$REALM" \
            -s "webAuthnPolicyPasswordlessRpEntityName=DIVE V3 Coalition - AAL3" \
            -s "webAuthnPolicyPasswordlessAuthenticatorAttachment=cross-platform" \
            -s "webAuthnPolicyPasswordlessUserVerificationRequirement=required" \
            -s "webAuthnPolicyPasswordlessRequireResidentKey=Yes" \
            -s "webAuthnPolicyPasswordlessAttestationConveyancePreference=direct"
    fi
}

# Set Required Action for user based on clearance
set_user_required_action() {
    local container=$1
    local username=$2
    local clearance=$3
    local is_remote=$4
    
    local user_id
    user_id=$(get_user_id "$container" "$username" "$is_remote")
    
    if [ -z "$user_id" ]; then
        log_warn "User $username not found, skipping"
        return
    fi
    
    local required_action=""
    case "$clearance" in
        "TOP_SECRET")
            required_action='["webauthn-register-passwordless"]'
            log_info "Setting AAL3 (WebAuthn) for $username (TOP_SECRET)"
            ;;
        "SECRET"|"CONFIDENTIAL")
            required_action='["CONFIGURE_TOTP"]'
            log_info "Setting AAL2 (OTP) for $username ($clearance)"
            ;;
        "UNCLASSIFIED")
            required_action='[]'
            log_info "Setting AAL1 (no MFA) for $username (UNCLASSIFIED)"
            ;;
    esac
    
    if [ "$is_remote" = "true" ]; then
        kcadm_remote "update users/$user_id -r $REALM -s requiredActions=$required_action"
    else
        kcadm_local "$container" update "users/$user_id" -r "$REALM" -s "requiredActions=$required_action"
    fi
}

# Configure a single instance
configure_instance() {
    local instance=$1
    local container=$2
    local is_remote=$3
    
    echo ""
    echo "=============================================="
    echo "Configuring Instance: $instance"
    echo "=============================================="
    
    # 1. Configure WebAuthn Policy
    configure_webauthn_policy "$container" "$is_remote"
    
    # 2. Configure all IdPs to disable post-broker-login flow
    for idp in "${IDP_ALIASES[@]}"; do
        configure_idp "$container" "$idp" "$is_remote"
    done
    
    # 3. Configure Required Actions for test users on this instance
    local instance_upper
    instance_upper=$(echo "$instance" | tr '[:lower:]' '[:upper:]')
    
    for username in "${!TEST_USERS_CLEARANCE[@]}"; do
        # Only configure users that belong to this instance
        if [[ "$username" == *"-${instance}-"* ]]; then
            set_user_required_action "$container" "$username" "${TEST_USERS_CLEARANCE[$username]}" "$is_remote"
        fi
    done
    
    log_success "Instance $instance configured successfully"
}

# Main execution
main() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║     DIVE V3 - MFA Configuration for All Instances              ║"
    echo "║     AAL2 (OTP) for CONFIDENTIAL/SECRET                         ║"
    echo "║     AAL3 (WebAuthn) for TOP_SECRET                             ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    
    # Configure local instances
    for instance in "${!INSTANCES[@]}"; do
        IFS=':' read -r container endpoint <<< "${INSTANCES[$instance]}"
        configure_instance "$instance" "$container" "false"
    done
    
    # Configure remote DEU instance
    echo ""
    echo "=============================================="
    echo "Configuring Remote Instance: DEU"
    echo "=============================================="
    
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 "$DEU_USER@$DEU_HOST" "echo 'Connected'" 2>/dev/null; then
        configure_instance "deu" "$DEU_CONTAINER" "true"
    else
        log_warn "Cannot connect to DEU instance, skipping remote configuration"
    fi
    
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                    Configuration Complete!                      ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    log_info "Summary:"
    echo "  - postBrokerLoginFlowAlias disabled for all IdPs"
    echo "  - WebAuthn Passwordless Policy configured for AAL3"
    echo "  - Required Actions set based on clearance:"
    echo "    • TOP_SECRET: webauthn-register-passwordless"
    echo "    • SECRET/CONFIDENTIAL: CONFIGURE_TOTP"
    echo "    • UNCLASSIFIED: (none)"
    echo ""
}

main "$@"

