#!/usr/bin/env bash
# =============================================================================
# Validate Federation User Import - Post-Login Validation
# =============================================================================
# Run this AFTER user logs in via FRA IdP to validate attributes imported correctly
# =============================================================================

set -eo pipefail

export DIVE_ROOT="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3"
source "${DIVE_ROOT}/scripts/dive-modules/common.sh"

USERNAME="${1:-testuser-fra-1}"
EXPECTED_COUNTRY="${2:-FRA}"

log_info "═══════════════════════════════════════════════════════════"
log_info "Federation User Import Validation"
log_info "═══════════════════════════════════════════════════════════"
log_info "User: $USERNAME"
log_info "Expected Country: $EXPECTED_COUNTRY"
log_info ""

# Authenticate with Hub Keycloak
docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user admin --password KeycloakAdminSecure123! >/dev/null 2>&1

# Get user info
USER_DATA=$(docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh get users \
  -r dive-v3-broker-usa -q username=$USERNAME 2>/dev/null)

if [ -z "$USER_DATA" ] || [ "$USER_DATA" = "[]" ]; then
    log_error "❌ User $USERNAME not found in Hub"
    log_info "This is expected if user hasn't logged in yet"
    exit 1
fi

# Extract attributes
UNIQUE_ID=$(echo "$USER_DATA" | jq -r '.[0].attributes.uniqueID[0] // "null"')
COUNTRY=$(echo "$USER_DATA" | jq -r '.[0].attributes.countryOfAffiliation[0] // "null"')
CLEARANCE=$(echo "$USER_DATA" | jq -r '.[0].attributes.clearance[0] // "null"')
FED_IDENTITIES=$(echo "$USER_DATA" | jq -r '.[0].federatedIdentities')
CREATED=$(echo "$USER_DATA" | jq -r '.[0].createdTimestamp')

log_info "User Found in Hub Keycloak:"
log_info "  Created: $(date -r $(($CREATED / 1000)) 2>/dev/null || echo $CREATED)"
log_info ""

# Check if federated (NOTE: NextAuth may not populate federatedIdentities in Keycloak)
# What matters is the ATTRIBUTES are correct, not necessarily the federatedIdentities link
if [ "$FED_IDENTITIES" = "null" ] || [ "$FED_IDENTITIES" = "[]" ]; then
    log_warn "⚠️  federatedIdentities not set in Keycloak (this is OK with NextAuth)"
    log_info "   NextAuth manages federation in its own database"
    log_info "   What matters: attributes are correct (checking below)"
else
    IDP_PROVIDER=$(echo "$FED_IDENTITIES" | jq -r '.[0].identityProvider // "null"')
    log_success "✅ User has federatedIdentities link: $IDP_PROVIDER"
fi

# Check uniqueID
if [ "$UNIQUE_ID" = "$USERNAME" ]; then
    log_success "✅ uniqueID: $UNIQUE_ID (correct - matches username)"
elif [ "$UNIQUE_ID" = "null" ]; then
    log_error "❌ uniqueID: MISSING!"
    log_error "   This will cause authorization failures"
    log_error "   IdP mapper may not be configured or syncing properly"
else
    log_warn "⚠️  uniqueID: $UNIQUE_ID (expected: $USERNAME)"
    log_warn "   User may have UUID instead of username"
fi

# Check countryOfAffiliation
if [ "$COUNTRY" = "$EXPECTED_COUNTRY" ]; then
    log_success "✅ countryOfAffiliation: $COUNTRY (correct)"
elif [ "$COUNTRY" = "null" ]; then
    log_error "❌ countryOfAffiliation: MISSING!"
else
    log_warn "⚠️  countryOfAffiliation: $COUNTRY (expected: $EXPECTED_COUNTRY)"
fi

# Check clearance
if [ "$CLEARANCE" != "null" ]; then
    log_success "✅ clearance: $CLEARANCE"
else
    log_error "❌ clearance: MISSING!"
fi

log_info ""
log_info "═══════════════════════════════════════════════════════════"
log_info "Summary"
log_info "═══════════════════════════════════════════════════════════"

# What matters: ATTRIBUTES are correct (uniqueID, country, clearance)
# federatedIdentities link is nice-to-have but not required with NextAuth
if [ "$UNIQUE_ID" = "$USERNAME" ] && [ "$COUNTRY" = "$EXPECTED_COUNTRY" ] && [ "$CLEARANCE" != "null" ]; then
    log_success "✅✅✅ FEDERATION ATTRIBUTES CORRECT ✅✅✅"
    log_info ""
    log_info "User $USERNAME has correct attributes from ${EXPECTED_COUNTRY}:"
    log_info "  ✅ uniqueID: $UNIQUE_ID (username, not UUID)"
    log_info "  ✅ countryOfAffiliation: $COUNTRY (correct country)"
    log_info "  ✅ clearance: $CLEARANCE"
    
    if [ "$FED_IDENTITIES" != "null" ] && [ "$FED_IDENTITIES" != "[]" ]; then
        IDP_PROVIDER=$(echo "$FED_IDENTITIES" | jq -r '.[0].identityProvider // "null"')
        log_info "  ✅ federatedIdentities: $IDP_PROVIDER"
    else
        log_info "  ℹ  federatedIdentities: not set (OK - NextAuth manages this)"
    fi
    
    log_info ""
    log_success "Authorization should work correctly!"
    log_info ""
    log_info "What matters for authorization:"
    log_info "  • Session has uniqueID (for PEP/PDP)"
    log_info "  • Session has countryOfAffiliation (for releasability)"
    log_info "  • Session has clearance (for classification)"
    log_info ""
    log_info "All critical attributes present! ✅"
    exit 0
else
    log_error "❌ Federation attributes INCORRECT"
    log_info ""
    log_info "Expected:"
    log_info "  uniqueID: $USERNAME"
    log_info "  countryOfAffiliation: $EXPECTED_COUNTRY"
    log_info "  clearance: any valid level"
    log_info ""
    log_info "Actual:"
    log_info "  uniqueID: $UNIQUE_ID"
    log_info "  countryOfAffiliation: $COUNTRY"
    log_info "  clearance: $CLEARANCE"
    log_info ""
    log_info "Attributes don't match - federation may not be working correctly"
    exit 1
fi
