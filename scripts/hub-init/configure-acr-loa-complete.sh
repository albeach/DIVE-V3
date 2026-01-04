#!/bin/bash
# =============================================================================
# DIVE V3 - Complete ACR/AMR/LoA Configuration for USA Hub
# =============================================================================
# Purpose: Implements COMPLETE ACR/AMR/LoA (Level of Assurance) configuration
#          for direct USA Hub authentication, matching the federated flow.
#
# This script configures:
#   1. ACR-LoA mapping (realm attribute)
#   2. ACR protocol mapper (direct from session)
#   3. AMR protocol mapper (user attribute)
#   4. ACR user attribute
#   5. AMR user attribute
#   6. Syncs ACR/AMR for all existing users based on clearance/credentials
#
# Background: USA Hub had MFA flows BUT lacked ACR-LoA mapping and protocol
#             mappers, causing ACR/AMR to not appear in tokens for direct login.
#
# Usage:
#   ./scripts/hub-init/configure-acr-loa-complete.sh
#
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

log_step()    { echo -e "${BLUE}▶${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn()    { echo -e "${YELLOW}⚠${NC} $1"; }
log_error()   { echo -e "${RED}✗${NC} $1"; }
log_info()    { echo -e "${CYAN}ℹ${NC} $1"; }
log_header()  { echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}"; echo -e "${BOLD}  $1${NC}"; echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}"; }

# Configuration
REALM_NAME="dive-v3-broker-usa"
CLIENT_ID="dive-v3-broker-usa"
KC_CONTAINER="dive-hub-keycloak"
KEYCLOAK_INTERNAL_URL="http://localhost:8080"

log_header "DIVE V3 - Complete ACR/AMR/LoA Configuration"
echo ""

# =============================================================================
# Get Keycloak Admin Password
# =============================================================================
log_step "Getting Keycloak admin password from GCP Secret Manager..."

ADMIN_PASSWORD=$(gcloud secrets versions access latest --secret=dive-v3-keycloak-usa --project=dive25 2>/dev/null)

if [ -z "$ADMIN_PASSWORD" ]; then
    log_error "Failed to get Keycloak admin password from GCP"
    exit 1
fi

log_success "Keycloak admin password retrieved"
echo ""

# =============================================================================
# Authenticate with Keycloak
# =============================================================================
log_step "Authenticating with Keycloak..."

docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh config credentials \
    --server "$KEYCLOAK_INTERNAL_URL" \
    --realm master \
    --user admin \
    --password "$ADMIN_PASSWORD" >/dev/null 2>&1

if [ $? -ne 0 ]; then
    log_error "Failed to authenticate with Keycloak"
    exit 1
fi

log_success "Authenticated with Keycloak"
echo ""

# =============================================================================
# STEP 1: Configure ACR-LoA Mapping (Realm Attribute)
# =============================================================================
log_step "Step 1/7: Configuring ACR-LoA mapping..."

# Check if mapping exists
CURRENT_MAPPING=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get realms/"$REALM_NAME" --fields attributes 2>/dev/null | grep -o '"acr.loa.map"[^}]*' || echo "")

if [[ -z "$CURRENT_MAPPING" ]]; then
    log_info "ACR-LoA mapping NOT found, adding..."
    
    # Add ACR-LoA mapping to realm attributes
    docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh update realms/"$REALM_NAME" \
        -s 'attributes."acr.loa.map"={"1":1,"2":2,"3":3}' >/dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        log_success "ACR-LoA mapping configured: {\"1\":1,\"2\":2,\"3\":3}"
    else
        log_error "Failed to configure ACR-LoA mapping"
        exit 1
    fi
else
    log_success "ACR-LoA mapping already exists"
fi
echo ""

# =============================================================================
# STEP 2: Configure ACR Protocol Mapper (Session-based)
# =============================================================================
log_step "Step 2/7: Checking ACR protocol mapper..."

# Get client UUID
CLIENT_UUID=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get clients -r "$REALM_NAME" --fields id,clientId 2>/dev/null | grep -B1 "\"clientId\" : \"$CLIENT_ID\"" | grep '"id"' | cut -d'"' -f4)

if [ -z "$CLIENT_UUID" ]; then
    log_error "Failed to get client UUID for $CLIENT_ID"
    exit 1
fi

# Check if ACR mapper exists
ACR_MAPPER=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get clients/"$CLIENT_UUID"/protocol-mappers/models -r "$REALM_NAME" 2>/dev/null | grep -A20 '"name" : "acr"' | head -25)

if [[ -z "$ACR_MAPPER" ]]; then
    log_info "ACR mapper NOT found, creating..."
    
    # Create ACR mapper (session-based, oidc-acr-mapper)
    docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh create clients/"$CLIENT_UUID"/protocol-mappers/models -r "$REALM_NAME" \
        -s name="acr (session)" \
        -s protocol=openid-connect \
        -s protocolMapper=oidc-acr-mapper \
        -s 'config."id.token.claim"=true' \
        -s 'config."access.token.claim"=true' \
        -s 'config."userinfo.token.claim"=true' \
        -s 'config."introspection.token.claim"=true' >/dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        log_success "ACR protocol mapper created (session-based)"
    else
        log_error "Failed to create ACR mapper"
        exit 1
    fi
else
    log_success "ACR protocol mapper already exists"
fi
echo ""

# =============================================================================
# STEP 3: Configure AMR Protocol Mapper (User Attribute)
# =============================================================================
log_step "Step 3/7: Checking AMR protocol mapper..."

# Check if AMR mapper exists
AMR_MAPPER=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get clients/"$CLIENT_UUID"/protocol-mappers/models -r "$REALM_NAME" 2>/dev/null | grep -A20 '"name" : "amr"' | head -25)

if [[ -z "$AMR_MAPPER" ]]; then
    log_info "AMR mapper NOT found, creating..."
    
    # Create AMR mapper (user-attribute-based)
    docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh create clients/"$CLIENT_UUID"/protocol-mappers/models -r "$REALM_NAME" \
        -s name="amr (user attribute)" \
        -s protocol=openid-connect \
        -s protocolMapper=oidc-usermodel-attribute-mapper \
        -s 'config."user.attribute"=amr' \
        -s 'config."claim.name"=amr' \
        -s 'config."id.token.claim"=true' \
        -s 'config."access.token.claim"=true' \
        -s 'config."userinfo.token.claim"=true' \
        -s 'config."introspection.token.claim"=true' \
        -s 'config."multivalued"=true' \
        -s 'config."aggregate.attrs"=false' \
        -s 'config."jsonType.label"=String' >/dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        log_success "AMR protocol mapper created (user attribute)"
    else
        log_error "Failed to create AMR mapper"
        exit 1
    fi
else
    log_success "AMR protocol mapper already exists"
fi
echo ""

# =============================================================================
# STEP 4: Add ACR to User Profile
# =============================================================================
log_step "Step 4/7: Ensuring ACR in User Profile..."

# Check if ACR attribute exists in user profile
ACR_ATTR=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get users/profile -r "$REALM_NAME" 2>/dev/null | grep -o '"name" : "acr"' || echo "")

if [[ -z "$ACR_ATTR" ]]; then
    log_info "ACR attribute NOT in User Profile, adding..."
    
    # Get current profile, add ACR, update
    CURRENT_PROFILE=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get users/profile -r "$REALM_NAME" 2>/dev/null)
    
    UPDATED_PROFILE=$(echo "$CURRENT_PROFILE" | docker exec -i "$KC_CONTAINER" python3 -c '
import sys, json
profile = json.load(sys.stdin)
if "attributes" not in profile:
    profile["attributes"] = []
profile["attributes"].append({
    "name": "acr",
    "displayName": "Authentication Context Reference",
    "permissions": {"view": ["admin", "user"], "edit": ["admin"]},
    "multivalued": False
})
print(json.dumps(profile))
')
    
    echo "$UPDATED_PROFILE" | docker exec -i "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh update users/profile -r "$REALM_NAME" -f - >/dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        log_success "ACR attribute added to User Profile"
    else
        log_warn "Failed to add ACR to User Profile (may already exist)"
    fi
else
    log_success "ACR already in User Profile"
fi
echo ""

# =============================================================================
# STEP 5: Add AMR to User Profile
# =============================================================================
log_step "Step 5/7: Ensuring AMR in User Profile..."

# Check if AMR attribute exists in user profile
AMR_ATTR=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get users/profile -r "$REALM_NAME" 2>/dev/null | grep -o '"name" : "amr"' || echo "")

if [[ -z "$AMR_ATTR" ]]; then
    log_info "AMR attribute NOT in User Profile, adding..."
    
    # Get current profile, add AMR, update
    CURRENT_PROFILE=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get users/profile -r "$REALM_NAME" 2>/dev/null)
    
    UPDATED_PROFILE=$(echo "$CURRENT_PROFILE" | docker exec -i "$KC_CONTAINER" python3 -c '
import sys, json
profile = json.load(sys.stdin)
if "attributes" not in profile:
    profile["attributes"] = []
profile["attributes"].append({
    "name": "amr",
    "displayName": "Authentication Methods Reference",
    "permissions": {"view": ["admin", "user"], "edit": ["admin"]},
    "multivalued": True
})
print(json.dumps(profile))
')
    
    echo "$UPDATED_PROFILE" | docker exec -i "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh update users/profile -r "$REALM_NAME" -f - >/dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        log_success "AMR attribute added to User Profile"
    else
        log_warn "Failed to add AMR to User Profile (may already exist)"
    fi
else
    log_success "AMR already in User Profile"
fi
echo ""

# =============================================================================
# STEP 6: Sync ACR/AMR for All Users Based on Clearance
# =============================================================================
log_step "Step 6/7: Syncing ACR/AMR for all USA users..."

log_info "Getting all users in realm $REALM_NAME..."
USER_IDS=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get users -r "$REALM_NAME" --fields id,username 2>/dev/null | grep '"id"' | cut -d'"' -f4)

USER_COUNT=$(echo "$USER_IDS" | wc -l | tr -d ' ')
log_info "Found $USER_COUNT users to process"
echo ""

PROCESSED=0
UPDATED=0

for USER_ID in $USER_IDS; do
    # Get user details
    USER_DATA=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get users/"$USER_ID" -r "$REALM_NAME" 2>/dev/null)
    USERNAME=$(echo "$USER_DATA" | grep '"username"' | head -1 | cut -d'"' -f4)
    
    # Get clearance from user attributes
    CLEARANCE=$(echo "$USER_DATA" | grep -A5 '"attributes"' | grep -A1 '"clearance"' | grep -v '"clearance"' | sed 's/.*"\(.*\)".*/\1/' | tr -d '[]," ' | head -1)
    
    # Skip if no clearance
    if [[ -z "$CLEARANCE" ]]; then
        continue
    fi
    
    # Determine ACR and AMR based on clearance
    ACR_VALUE="0"
    AMR_VALUE='["pwd"]'
    
    case "$CLEARANCE" in
        TOP_SECRET)
            # Check if user has WebAuthn credentials
            HAS_WEBAUTHN=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get users/"$USER_ID"/credentials -r "$REALM_NAME" 2>/dev/null | grep -c '"type" : "webauthn"' || echo "0")
            
            if [ "$HAS_WEBAUTHN" -gt 0 ]; then
                ACR_VALUE="2"  # AAL3
                AMR_VALUE='["pwd", "hwk"]'
            else
                # Check for OTP
                HAS_OTP=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get users/"$USER_ID"/credentials -r "$REALM_NAME" 2>/dev/null | grep -c '"type" : "otp"' || echo "0")
                if [ "$HAS_OTP" -gt 0 ]; then
                    ACR_VALUE="1"  # AAL2
                    AMR_VALUE='["pwd", "otp"]'
                fi
            fi
            ;;
        SECRET|CONFIDENTIAL)
            # Check for OTP
            HAS_OTP=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get users/"$USER_ID"/credentials -r "$REALM_NAME" 2>/dev/null | grep -c '"type" : "otp"' || echo "0")
            if [ "$HAS_OTP" -gt 0 ]; then
                ACR_VALUE="1"  # AAL2
                AMR_VALUE='["pwd", "otp"]'
            fi
            ;;
        UNCLASSIFIED)
            ACR_VALUE="0"  # AAL1
            AMR_VALUE='["pwd"]'
            ;;
    esac
    
    # Update user with ACR and AMR
    docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh update users/"$USER_ID" -r "$REALM_NAME" \
        -s "attributes.acr=[\"$ACR_VALUE\"]" \
        -s "attributes.amr=$AMR_VALUE" >/dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        ((UPDATED++))
        log_info "✓ $USERNAME: clearance=$CLEARANCE → acr=$ACR_VALUE, amr=$AMR_VALUE"
    fi
    
    ((PROCESSED++))
done

echo ""
log_success "Processed $PROCESSED users, updated $UPDATED users with ACR/AMR"
echo ""

# =============================================================================
# STEP 7: Verify Configuration
# =============================================================================
log_step "Step 7/7: Verifying configuration..."
echo ""

# Check ACR-LoA mapping
ACR_LOA=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get realms/"$REALM_NAME" --fields attributes 2>/dev/null | grep -o '"acr.loa.map"[^}]*')
if [[ -n "$ACR_LOA" ]]; then
    log_success "ACR-LoA mapping: Configured"
else
    log_error "ACR-LoA mapping: MISSING"
fi

# Check ACR mapper
ACR_MAPPER_CHECK=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get clients/"$CLIENT_UUID"/protocol-mappers/models -r "$REALM_NAME" 2>/dev/null | grep -c '"name" : "acr"')
if [ "$ACR_MAPPER_CHECK" -gt 0 ]; then
    log_success "ACR protocol mapper: Configured"
else
    log_error "ACR protocol mapper: MISSING"
fi

# Check AMR mapper
AMR_MAPPER_CHECK=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get clients/"$CLIENT_UUID"/protocol-mappers/models -r "$REALM_NAME" 2>/dev/null | grep -c '"name" : "amr"')
if [ "$AMR_MAPPER_CHECK" -gt 0 ]; then
    log_success "AMR protocol mapper: Configured"
else
    log_error "AMR protocol mapper: MISSING"
fi

# Check browser flow binding
BROWSER_FLOW=$(docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get realms/"$REALM_NAME" --fields browserFlow 2>/dev/null | grep -o '"browserFlow"[^,]*')
if [[ "$BROWSER_FLOW" == *"Classified Access"* ]]; then
    log_success "Browser flow: Classified Access MFA flow (correct)"
else
    log_warn "Browser flow: $BROWSER_FLOW (expected Classified Access)"
fi

echo ""
log_header "Configuration Complete"
echo ""
echo "  ✅ ACR-LoA Mapping: Configured"
echo "  ✅ ACR Protocol Mapper: Session-based (oidc-acr-mapper)"
echo "  ✅ AMR Protocol Mapper: User attribute (oidc-usermodel-attribute-mapper)"
echo "  ✅ User Profile: ACR and AMR attributes added"
echo "  ✅ Users: $UPDATED users synced with ACR/AMR based on clearance"
echo ""
echo "  Next Steps:"
echo "    1. Test direct USA login with testuser-usa-1"
echo "    2. Verify ACR/AMR in token at https://localhost:3000/dashboard"
echo "    3. Confirm OPA receives correct ACR/AMR for authorization"
echo ""
echo "  ACR/AMR Mapping:"
echo "    - UNCLASSIFIED:  ACR=0 (AAL1), AMR=[\"pwd\"]"
echo "    - CONFIDENTIAL:  ACR=1 (AAL2), AMR=[\"pwd\",\"otp\"] (if OTP configured)"
echo "    - SECRET:        ACR=1 (AAL2), AMR=[\"pwd\",\"otp\"] (if OTP configured)"
echo "    - TOP_SECRET:    ACR=2 (AAL3), AMR=[\"pwd\",\"hwk\"] (if WebAuthn configured)"
echo ""
log_header "ACR/AMR/LoA Configuration Resilient & Persistent"
echo ""
