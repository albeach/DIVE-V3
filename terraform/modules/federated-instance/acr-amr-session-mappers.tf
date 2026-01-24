# ============================================================================
# ACR/AMR MAPPERS FOR FEDERATION (UPDATED Jan 2, 2026)
# ============================================================================
# This file implements the CORRECT pattern for ACR/AMR propagation across
# federated instances.
#
# CRITICAL DISCOVERY (Jan 2, 2026):
# For FEDERATED users, session-based mappers (oidc-amr-mapper) DON'T WORK
# because the Hub's authentication session doesn't contain the spoke's AMR.
#
# CORRECT APPROACH:
# 1. Spokes store AMR in user.attribute.amr during authentication
# 2. Spoke's dive-v3-broker-usa client uses oidc-usermodel-attribute-mapper
#    to include user.attribute.amr in tokens sent to Hub
# 3. Hub's IdP mapper stores incoming AMR to federated user's attributes
# 4. Hub's broker client uses oidc-usermodel-attribute-mapper as fallback
#
# CRITICAL: Use jsonType.label: "String" (NOT "JSON") for multivalued arrays!
#
# CLIENT ARCHITECTURE:
# - dive-v3-broker-usa on Spoke: Client that Hub uses to federate TO the Spoke
# - dive-v3-broker-{spoke} on Hub: Client that Spoke uses to federate TO the Hub
# Note: dive-v3-cross-border-client was removed (never used for actual federation)
#
# ============================================================================

# ============================================================================
# INCOMING FEDERATION CLIENTS: ACR/AMR MAPPERS
# ============================================================================
# When other instances (like Hub) federate TO this instance (spoke), these
# clients must include ACR/AMR in the tokens they issue.
#
# BEST PRACTICE ARCHITECTURE:
# 1. Native oidc-amr-mapper (PRIMARY) - reads from AUTH_METHODS_REF session note
#    The dive-amr-enrichment event listener sets this on every login.
# 2. Native oidc-acr-mapper (PRIMARY) - reads from authentication context
# 3. User-attribute mapper (FALLBACK) - for user_amr claim from stored attributes
#
# The native oidc-amr-mapper properly parses the AUTH_METHODS_REF JSON array
# and outputs it as a proper JWT array claim.

# ACR from native session mapper (PRIMARY)
resource "keycloak_generic_protocol_mapper" "incoming_federation_acr" {
  for_each = var.federation_partners

  realm_id        = keycloak_realm.broker.id
  client_id       = keycloak_openid_client.incoming_federation[each.key].id
  name            = "acr (native session)"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-acr-mapper"

  config = {
    "id.token.claim"            = "true"
    "access.token.claim"        = "true"
    "userinfo.token.claim"      = "true"
    "introspection.token.claim" = "true"
    "claim.name"                = "acr"
  }
}

# AMR from native session mapper (PRIMARY)
# Reads from AUTH_METHODS_REF session note set by dive-amr-enrichment event listener
# This is the BEST PRACTICE approach - native mapper properly handles the JSON array
resource "keycloak_generic_protocol_mapper" "incoming_federation_amr" {
  for_each = var.federation_partners

  realm_id        = keycloak_realm.broker.id
  client_id       = keycloak_openid_client.incoming_federation[each.key].id
  name            = "amr (native session)"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-amr-mapper"

  config = {
    "id.token.claim"            = "true"
    "access.token.claim"        = "true"
    "userinfo.token.claim"      = "true"
    "introspection.token.claim" = "true"
    "claim.name"                = "amr"
  }
}

# AMR from user attribute (FALLBACK for federation)
# Outputs to user_amr claim - frontend prioritizes this for federated users
# CRITICAL: claim_value_type MUST be "String" for multivalued arrays, NOT "JSON"
resource "keycloak_openid_user_attribute_protocol_mapper" "incoming_federation_amr_fallback" {
  for_each = var.federation_partners

  realm_id            = keycloak_realm.broker.id
  client_id           = keycloak_openid_client.incoming_federation[each.key].id
  name                = "amr (user attribute fallback)"
  user_attribute      = "amr"
  claim_name          = "user_amr"
  claim_value_type    = "String" # CRITICAL: NOT "JSON"!
  multivalued         = true
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# ACR from user attribute (FALLBACK for federation)
resource "keycloak_openid_user_attribute_protocol_mapper" "incoming_federation_acr_fallback" {
  for_each = var.federation_partners

  realm_id            = keycloak_realm.broker.id
  client_id           = keycloak_openid_client.incoming_federation[each.key].id
  name                = "acr (user attribute fallback)"
  user_attribute      = "acr"
  claim_name          = "user_acr"
  claim_value_type    = "String"
  multivalued         = false
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# ============================================================================
# BROKER CLIENT: ACR/AMR MAPPERS
# ============================================================================
# REFACTORING NOTE (2026-01-24):
# The native session-based AMR mapper and user attribute fallback are ALREADY
# defined in main.tf (lines 641-674). These were duplicates and have been
# commented out here to prevent conflicts.
#
# SINGLE SOURCE OF TRUTH: main.tf contains the authoritative broker client mappers
# - keycloak_generic_protocol_mapper.amr_mapper (native session)
# - keycloak_openid_user_attribute_protocol_mapper.amr_user_attribute_fallback
# - keycloak_generic_protocol_mapper.acr_mapper (native session)
#
# This file now contains ONLY the federation client mappers (incoming_federation_*)
# See: terraform/REFACTORING_PLAN.md for complete consolidation strategy

# DELETED: broker_amr_mapper (duplicate of main.tf amr_mapper)
# DELETED: broker_amr_user_attribute (duplicate of main.tf amr_user_attribute_fallback)
# DELETED: broker_acr_user_attribute (ACR fallback not needed - native mapper sufficient)

# ============================================================================
# MIGRATION NOTES
# ============================================================================
# This file replaces the following deprecated resources:
# 1. keycloak_custom_identity_provider_mapper.acr_mapper (idp-brokers.tf)
# 2. keycloak_custom_identity_provider_mapper.amr_mapper (idp-brokers.tf)
# 3. keycloak_openid_user_attribute_protocol_mapper.federated_acr_mapper (main.tf)
# 4. keycloak_openid_user_attribute_protocol_mapper.federated_amr_mapper (main.tf)
#
# The key insight is:
# - Session-based mappers work for LOCAL users
# - User-attribute mappers work for FEDERATED users
# - We need BOTH for a complete solution
# - Use jsonType.label: "String" (not "JSON") for multivalued arrays
