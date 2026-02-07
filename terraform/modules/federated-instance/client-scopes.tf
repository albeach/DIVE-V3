# =============================================================================
# DIVE V3 - Custom Client Scopes for ABAC Attributes
# =============================================================================
# Creates client scopes with proper protocol mappers for DIVE attributes
#
# CRITICAL FIX (2026-01-19): SF-026 - Explicit claim.name Configuration
# Previous: Scopes created by backend with claim.name sometimes null
# Fixed: Terraform creates scopes with explicit claim.name from start
#
# CRITICAL FIX (2026-01-20): ACR/AMR - Cross-Instance MFA Enforcement
# Previous: Access tokens missing acr/amr claims (ID token only)
# Fixed: Added acr/amr client scopes with access.token.claim = true
#
# Ensures access tokens include:
# - uniqueID (globally unique identifier)
# - clearance (classification level)
# - countryOfAffiliation (ISO 3166-1 alpha-3)
# - acpCOI (Communities of Interest array)
# - acr (Authentication Context Class Reference - AAL level)
# - amr (Authentication Methods References - MFA methods)
# =============================================================================

# =============================================================================
# DIVE CUSTOM CLIENT SCOPES
# =============================================================================

resource "keycloak_openid_client_scope" "uniqueID" {
  realm_id               = keycloak_realm.broker.id
  name                   = "uniqueID"
  description            = "DIVE globally unique identifier (ACP-240 §2.1)"
  include_in_token_scope = true
  consent_screen_text    = "Unique identifier for access control"

  gui_order = 1

  # For existing deployments: import with
  # terraform import module.instance.keycloak_openid_client_scope.uniqueID realm-id/scope-id
  lifecycle {
    # Prevent recreation if scope exists - just manage it
    ignore_changes = []
  }
}

resource "keycloak_openid_client_scope" "clearance" {
  realm_id               = keycloak_realm.broker.id
  name                   = "clearance"
  description            = "DIVE security clearance level"
  include_in_token_scope = true
  consent_screen_text    = "Security clearance level"

  gui_order = 2
}

resource "keycloak_openid_client_scope" "countryOfAffiliation" {
  realm_id               = keycloak_realm.broker.id
  name                   = "countryOfAffiliation"
  description            = "DIVE country of affiliation (ISO 3166-1 alpha-3)"
  include_in_token_scope = true
  consent_screen_text    = "Country of affiliation"

  gui_order = 3
}

resource "keycloak_openid_client_scope" "acpCOI" {
  realm_id               = keycloak_realm.broker.id
  name                   = "acpCOI"
  description            = "DIVE Communities of Interest (ACP-240)"
  include_in_token_scope = true
  consent_screen_text    = "Communities of Interest"

  gui_order = 4
}

# ============================================================================
# DEPRECATED (Feb 2026): dive_acr Client Scope - Removed
# ============================================================================
# REASON: The mapper for this scope outputs to "acr" claim, conflicting with
# the native oidc-acr-mapper in main.tf (line 677).
#
# Native oidc-acr-mapper reads from Keycloak's AcrStore (session-based),
# while this user-attribute mapper reads stale user.acr attribute.
#
# When both mappers target the same claim, Keycloak picks one arbitrarily,
# breaking MFA enforcement and step-up authentication.
#
# CORRECT APPROACH:
# - Native oidc-acr-mapper handles "acr" claim (main.tf:677-690)
# - user_acr scope/mapper handles "user_acr" claim (fallback for federation)
#
# This resource and its mapper (dive_acr_mapper) have been REMOVED.
# See: docs/TERRAFORM-ACR-AMR-CONFLICTS.md
#
# resource "keycloak_openid_client_scope" "dive_acr" {
#   realm_id               = keycloak_realm.broker.id
#   name                   = "dive_acr"
#   description            = "DIVE Authentication Context Class Reference (AAL level)"
#   include_in_token_scope = true
#   consent_screen_text    = "Authentication assurance level"
#   gui_order = 5
# }

# ============================================================================
# DEPRECATED (Feb 2026): dive_amr Client Scope - Removed
# ============================================================================
# REASON: The mapper for this scope outputs to "amr" claim, conflicting with
# the native oidc-amr-mapper in main.tf (line 642).
#
# Native oidc-amr-mapper reads AUTH_METHODS_REF from session notes,
# while this user-attribute mapper reads stale user.amr attribute.
#
# CORRECT APPROACH:
# - Native oidc-amr-mapper handles "amr" claim (main.tf:642-656)
# - user_amr scope/mapper handles "user_amr" claim (fallback for federation)
#
# This resource and its mapper (dive_amr_mapper) have been REMOVED.
# See: docs/TERRAFORM-ACR-AMR-CONFLICTS.md
#
# resource "keycloak_openid_client_scope" "dive_amr" {
#   realm_id               = keycloak_realm.broker.id
#   name                   = "dive_amr"
#   description            = "DIVE Authentication Methods References (MFA methods)"
#   include_in_token_scope = true
#   consent_screen_text    = "Authentication methods used"
#   gui_order = 6
# }

resource "keycloak_openid_client_scope" "user_amr" {
  realm_id               = keycloak_realm.broker.id
  name                   = "user_amr"
  description            = "User AMR attribute (for federation IdP mappers)"
  include_in_token_scope = true
  consent_screen_text    = "User authentication methods"

  gui_order = 7
}

resource "keycloak_openid_client_scope" "user_acr" {
  realm_id               = keycloak_realm.broker.id
  name                   = "user_acr"
  description            = "User ACR attribute (for federation IdP mappers)"
  include_in_token_scope = true
  consent_screen_text    = "User authentication context"

  gui_order = 8
}

# =============================================================================
# PROTOCOL MAPPERS FOR EACH SCOPE
# =============================================================================
# CRITICAL: Must explicitly set claim.name to ensure claims appear in access tokens
# Without claim.name, tokens may have missing or inconsistent claims
# =============================================================================

resource "keycloak_openid_user_attribute_protocol_mapper" "uniqueID_mapper" {
  realm_id        = keycloak_realm.broker.id
  client_scope_id = keycloak_openid_client_scope.uniqueID.id
  name            = "uniqueID-mapper"

  # CRITICAL: Explicit claim.name (SF-026 fix)
  claim_name      = "uniqueID"
  user_attribute  = "uniqueID"

  # Token inclusion
  add_to_id_token      = true
  add_to_access_token  = true
  add_to_userinfo      = true

  # Single-valued attribute configuration
  claim_value_type     = "String"
  multivalued          = false
  aggregate_attributes = true  # Extract first element if multi-valued in Keycloak
}

resource "keycloak_openid_user_attribute_protocol_mapper" "clearance_mapper" {
  realm_id        = keycloak_realm.broker.id
  client_scope_id = keycloak_openid_client_scope.clearance.id
  name            = "clearance-mapper"

  # CRITICAL: Explicit claim.name
  claim_name      = "clearance"
  user_attribute  = "clearance"

  add_to_id_token      = true
  add_to_access_token  = true
  add_to_userinfo      = true

  claim_value_type     = "String"
  multivalued          = false
  aggregate_attributes = true
}

resource "keycloak_openid_user_attribute_protocol_mapper" "countryOfAffiliation_mapper" {
  realm_id        = keycloak_realm.broker.id
  client_scope_id = keycloak_openid_client_scope.countryOfAffiliation.id
  name            = "countryOfAffiliation-mapper"

  # CRITICAL: Explicit claim.name
  claim_name      = "countryOfAffiliation"
  user_attribute  = "countryOfAffiliation"

  add_to_id_token      = true
  add_to_access_token  = true
  add_to_userinfo      = true

  claim_value_type     = "String"
  multivalued          = false
  aggregate_attributes = true
}

resource "keycloak_openid_user_attribute_protocol_mapper" "acpCOI_mapper" {
  realm_id        = keycloak_realm.broker.id
  client_scope_id = keycloak_openid_client_scope.acpCOI.id
  name            = "acpCOI-mapper"

  # CRITICAL: Explicit claim.name
  claim_name      = "acpCOI"
  user_attribute  = "acpCOI"

  add_to_id_token      = true
  add_to_access_token  = true
  add_to_userinfo      = true

  # Multi-valued attribute configuration (array of COIs)
  claim_value_type     = "String"
  multivalued          = true
  aggregate_attributes = false  # Keep as array, don't extract first element
}

# ============================================================================
# DEPRECATED (Feb 2026): dive_acr_mapper - Removed
# ============================================================================
# REASON: Outputs to "acr" claim, conflicting with native oidc-acr-mapper
# in main.tf (line 677). Native mapper reads from AcrStore (session-based),
# while this reads stale user.acr attribute.
#
# Result: Session-based ACR overridden by stale user attribute, breaking MFA.
#
# CORRECT: Native oidc-acr-mapper handles "acr" (main.tf:677-690)
#          user_acr_mapper handles "user_acr" (fallback, line 253 below)
#
# resource "keycloak_openid_user_attribute_protocol_mapper" "dive_acr_mapper" {
#   realm_id        = keycloak_realm.broker.id
#   client_scope_id = keycloak_openid_client_scope.dive_acr.id
#   name            = "dive-acr-mapper"
#   claim_name      = "acr"
#   user_attribute  = "acr"
#   add_to_id_token      = true
#   add_to_access_token  = true
#   add_to_userinfo      = true
#   claim_value_type     = "String"
#   multivalued          = false
#   aggregate_attributes = true
# }

# ============================================================================
# DEPRECATED (Feb 2026): dive_amr_mapper - Removed
# ============================================================================
# REASON: Outputs to "amr" claim, conflicting with native oidc-amr-mapper
# in main.tf (line 642). Native mapper reads AUTH_METHODS_REF from session,
# while this reads stale user.amr attribute.
#
# Result: Session-based AMR overridden by stale user attribute, breaking MFA.
#
# CORRECT: Native oidc-amr-mapper handles "amr" (main.tf:642-656)
#          user_amr_mapper handles "user_amr" (fallback, line 233 below)
#
# resource "keycloak_openid_user_attribute_protocol_mapper" "dive_amr_mapper" {
#   realm_id        = keycloak_realm.broker.id
#   client_scope_id = keycloak_openid_client_scope.dive_amr.id
#   name            = "dive-amr-mapper"
#   claim_name      = "amr"
#   user_attribute  = "amr"
#   add_to_id_token      = true
#   add_to_access_token  = true
#   add_to_userinfo      = true
#   claim_value_type     = "String"
#   multivalued          = true
#   aggregate_attributes = false
# }

resource "keycloak_openid_user_attribute_protocol_mapper" "user_amr_mapper" {
  realm_id        = keycloak_realm.broker.id
  client_scope_id = keycloak_openid_client_scope.user_amr.id
  name            = "user-amr-mapper"

  # CRITICAL: Outputs user_amr claim for Hub IdP mappers to read
  claim_name      = "user_amr"  # Different claim name!
  user_attribute  = "amr"       # Same user attribute

  add_to_id_token      = true
  add_to_access_token  = true
  add_to_userinfo      = true

  claim_value_type     = "String"
  multivalued          = true
  aggregate_attributes = false
}

resource "keycloak_openid_user_attribute_protocol_mapper" "user_acr_mapper" {
  realm_id        = keycloak_realm.broker.id
  client_scope_id = keycloak_openid_client_scope.user_acr.id
  name            = "user-acr-mapper"

  # CRITICAL: Outputs user_acr claim for Hub IdP mappers to read
  claim_name      = "user_acr"  # Different claim name!
  user_attribute  = "acr"       # Same user attribute

  add_to_id_token      = true
  add_to_access_token  = true
  add_to_userinfo      = true

  claim_value_type     = "String"
  multivalued          = false
  aggregate_attributes = true
}

# =============================================================================
# ASSIGN DIVE SCOPES AS DEFAULTS TO BROKER CLIENT
# =============================================================================
# Ensures ALL tokens issued by this realm include DIVE attributes
# =============================================================================

resource "keycloak_openid_client_default_scopes" "broker_client_dive_scopes" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.broker_client.id

  default_scopes = [
    # Standard OIDC scopes
    "profile",
    "email",
    "roles",
    "web-origins",
    "acr",  # Built-in Keycloak scope for authentication context
    # DIVE custom scopes - NOW MANAGED BY TERRAFORM
    keycloak_openid_client_scope.uniqueID.name,
    keycloak_openid_client_scope.clearance.name,
    keycloak_openid_client_scope.countryOfAffiliation.name,
    keycloak_openid_client_scope.acpCOI.name,
    # Federation IdP mapper scopes (for cross-instance MFA)
    # NOTE: dive_amr and dive_acr removed (Feb 2026) - conflicted with native mappers
    keycloak_openid_client_scope.user_amr.name,
    keycloak_openid_client_scope.user_acr.name,
  ]

  # Ensure scopes are created before assignment
  depends_on = [
    keycloak_openid_client_scope.uniqueID,
    keycloak_openid_client_scope.clearance,
    keycloak_openid_client_scope.countryOfAffiliation,
    keycloak_openid_client_scope.acpCOI,
    # NOTE: dive_acr and dive_amr removed (Feb 2026) - conflicted with native mappers
    keycloak_openid_client_scope.user_acr,
    keycloak_openid_client_scope.user_amr,
    # Protocol mappers for core DIVE scopes
    keycloak_openid_user_attribute_protocol_mapper.uniqueID_mapper,
    keycloak_openid_user_attribute_protocol_mapper.clearance_mapper,
    keycloak_openid_user_attribute_protocol_mapper.countryOfAffiliation_mapper,
    keycloak_openid_user_attribute_protocol_mapper.acpCOI_mapper,
    # NOTE: dive_acr_mapper and dive_amr_mapper removed (Feb 2026) - conflicted with native mappers
    keycloak_openid_user_attribute_protocol_mapper.user_acr_mapper,
    keycloak_openid_user_attribute_protocol_mapper.user_amr_mapper,
  ]
}

# =============================================================================
# VALIDATION
# =============================================================================
# Terraform will verify:
# 1. Scopes exist with correct names
# 2. Protocol mappers have claim.name set explicitly
# 3. Mappers are configured for access tokens
# 4. Scopes are assigned as defaults to clients
#
# Success Criteria:
# - Access tokens include all DIVE attributes
# - No manual Keycloak configuration required
# - Works from clean deployment
# =============================================================================
