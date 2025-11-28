# NATO Compliance: ADatP-5663 §5.2 - Client-Specific Attribute Release
# Phase 4, Task 4.4
#
# Implements client-specific attribute release policies using Keycloak
# client scopes and conditional mappers.

terraform {
  required_providers {
    keycloak = {
      source  = "mrparkers/keycloak"
      version = "~> 4.0"
    }
  }
}

variable "realm_id" {
  description = "Keycloak realm ID"
  type        = string
  default     = "dive-v3-broker"
}

# =============================================================================
# Level 1: Minimal Attributes (Industry partners)
# =============================================================================

resource "keycloak_openid_client_scope" "minimal_attributes" {
  realm_id               = var.realm_id
  name                   = "minimal-attributes"
  description            = "Minimal attribute set for industry partners (pseudonymous)"
  include_in_token_scope = true
  consent_screen_text    = "Minimal attributes (uniqueID only)"
}

# Mapper: uniqueID only (pseudonymous sub already included)
resource "keycloak_openid_user_attribute_protocol_mapper" "minimal_unique_id" {
  realm_id        = var.realm_id
  client_scope_id = keycloak_openid_client_scope.minimal_attributes.id
  name            = "uniqueID-mapper"

  user_attribute   = "uniqueID"
  claim_name       = "uniqueID"
  claim_value_type = "String"

  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# =============================================================================
# Level 2: Standard Attributes (NATO partners)
# =============================================================================

resource "keycloak_openid_client_scope" "standard_attributes" {
  realm_id               = var.realm_id
  name                   = "standard-attributes"
  description            = "Standard attribute set for NATO partners"
  include_in_token_scope = true
  consent_screen_text    = "Security attributes (clearance, country, COI)"
}

# Mapper: uniqueID
resource "keycloak_openid_user_attribute_protocol_mapper" "standard_unique_id" {
  realm_id        = var.realm_id
  client_scope_id = keycloak_openid_client_scope.standard_attributes.id
  name            = "uniqueID-mapper"

  user_attribute   = "uniqueID"
  claim_name       = "uniqueID"
  claim_value_type = "String"

  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# Mapper: clearance
resource "keycloak_openid_user_attribute_protocol_mapper" "standard_clearance" {
  realm_id        = var.realm_id
  client_scope_id = keycloak_openid_client_scope.standard_attributes.id
  name            = "clearance-mapper"

  user_attribute   = "clearance"
  claim_name       = "clearance"
  claim_value_type = "String"

  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# Mapper: countryOfAffiliation
resource "keycloak_openid_user_attribute_protocol_mapper" "standard_country" {
  realm_id        = var.realm_id
  client_scope_id = keycloak_openid_client_scope.standard_attributes.id
  name            = "countryOfAffiliation-mapper"

  user_attribute   = "countryOfAffiliation"
  claim_name       = "countryOfAffiliation"
  claim_value_type = "String"

  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# Mapper: acpCOI (array)
resource "keycloak_openid_user_attribute_protocol_mapper" "standard_coi" {
  realm_id        = var.realm_id
  client_scope_id = keycloak_openid_client_scope.standard_attributes.id
  name            = "acpCOI-mapper"

  user_attribute   = "acpCOI"
  claim_name       = "acpCOI"
  claim_value_type = "JSON"
  multivalued      = true

  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# =============================================================================
# Level 3: Full Attributes (FVEY partners)
# =============================================================================

resource "keycloak_openid_client_scope" "full_attributes" {
  realm_id               = var.realm_id
  name                   = "full-attributes"
  description            = "Full attribute set for FVEY partners"
  include_in_token_scope = true
  consent_screen_text    = "All attributes including personal information"
}

# Include all standard mappers
resource "keycloak_openid_user_attribute_protocol_mapper" "full_unique_id" {
  realm_id        = var.realm_id
  client_scope_id = keycloak_openid_client_scope.full_attributes.id
  name            = "uniqueID-mapper"

  user_attribute   = "uniqueID"
  claim_name       = "uniqueID"
  claim_value_type = "String"

  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

resource "keycloak_openid_user_attribute_protocol_mapper" "full_clearance" {
  realm_id        = var.realm_id
  client_scope_id = keycloak_openid_client_scope.full_attributes.id
  name            = "clearance-mapper"

  user_attribute   = "clearance"
  claim_name       = "clearance"
  claim_value_type = "String"

  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

resource "keycloak_openid_user_attribute_protocol_mapper" "full_country" {
  realm_id        = var.realm_id
  client_scope_id = keycloak_openid_client_scope.full_attributes.id
  name            = "countryOfAffiliation-mapper"

  user_attribute   = "countryOfAffiliation"
  claim_name       = "countryOfAffiliation"
  claim_value_type = "String"

  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

resource "keycloak_openid_user_attribute_protocol_mapper" "full_coi" {
  realm_id        = var.realm_id
  client_scope_id = keycloak_openid_client_scope.full_attributes.id
  name            = "acpCOI-mapper"

  user_attribute   = "acpCOI"
  claim_name       = "acpCOI"
  claim_value_type = "JSON"
  multivalued      = true

  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# Additional personal information mappers
resource "keycloak_openid_user_attribute_protocol_mapper" "full_given_name" {
  realm_id        = var.realm_id
  client_scope_id = keycloak_openid_client_scope.full_attributes.id
  name            = "givenName-mapper"

  user_attribute   = "givenName"
  claim_name       = "givenName"
  claim_value_type = "String"

  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

resource "keycloak_openid_user_attribute_protocol_mapper" "full_surname" {
  realm_id        = var.realm_id
  client_scope_id = keycloak_openid_client_scope.full_attributes.id
  name            = "surname-mapper"

  user_attribute   = "surname"
  claim_name       = "surname"
  claim_value_type = "String"

  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

resource "keycloak_openid_user_attribute_protocol_mapper" "full_email" {
  realm_id        = var.realm_id
  client_scope_id = keycloak_openid_client_scope.full_attributes.id
  name            = "email-mapper"

  user_attribute   = "email"
  claim_name       = "email"
  claim_value_type = "String"

  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# =============================================================================
# Outputs
# =============================================================================

output "client_scopes" {
  description = "Created client scopes for attribute release"
  value = {
    minimal = {
      id          = keycloak_openid_client_scope.minimal_attributes.id
      name        = keycloak_openid_client_scope.minimal_attributes.name
      description = "Industry partners (pseudonymous uniqueID only)"
    }
    standard = {
      id          = keycloak_openid_client_scope.standard_attributes.id
      name        = keycloak_openid_client_scope.standard_attributes.name
      description = "NATO partners (uniqueID, clearance, country, COI)"
    }
    full = {
      id          = keycloak_openid_client_scope.full_attributes.id
      name        = keycloak_openid_client_scope.full_attributes.name
      description = "FVEY partners (all attributes + personal info)"
    }
  }
}

output "compliance" {
  description = "NATO compliance information"
  value = {
    standard    = "ADatP-5663 §5.2"
    requirement = "SP Attribute Requirements"
    phase       = "Phase 4, Task 4.4"
    status      = "Client-specific attribute release policies implemented"
  }
}

