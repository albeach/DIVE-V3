# ============================================
# Canada Realm Configuration
# ============================================
# GCCF Level 2+ compliant realm for Canadian military and government
# Gap #1 Remediation: Multi-Realm Architecture

resource "keycloak_realm" "dive_v3_can" {
  realm   = "dive-v3-can"
  enabled = true

  display_name      = "DIVE V3 - Canada"
  display_name_html = "<b>DIVE V3</b> - Canadian Armed Forces"

  registration_allowed = false

  # Custom DIVE V3 Theme (Option 3: Per-Country Customization)
  login_theme = "dive-v3-can"

  internationalization {
    supported_locales = ["en", "fr"] # Bilingual
    default_locale    = "en"
  }

  # Token lifetimes (GCCF Level 2 - balanced)
  access_token_lifespan    = "20m"
  sso_session_idle_timeout = "20m"
  sso_session_max_lifespan = "10h"

  password_policy = "upperCase(1) and lowerCase(1) and digits(1) and specialChars(1) and length(12)"


  # WebAuthn Policy (AAL3 Hardware-Backed Authentication) - v2.0.0
  # AUTOMATED via Terraform - No manual configuration needed!
  web_authn_policy {
    relying_party_entity_name            = "DIVE V3 Coalition Platform"
    relying_party_id                     = "dive25.com"  # Registrable domain suffix for dev-auth.dive25.com
    signature_algorithms                 = ["ES256", "RS256"]
    attestation_conveyance_preference    = "none"
    authenticator_attachment             = "cross-platform"
    require_resident_key                 = "No"
    user_verification_requirement        = "preferred"  # Changed from 'required' to 'preferred' for better compatibility
    create_timeout                       = 300
    avoid_same_authenticator_register    = false
    acceptable_aaguids                   = []
  }

  security_defenses {
    brute_force_detection {
      max_login_failures         = 5
      wait_increment_seconds     = 60
      max_failure_wait_seconds   = 900
      failure_reset_time_seconds = 43200
    }
  }

  ssl_required = "none" # Development: allow HTTP for federation
}

resource "keycloak_role" "can_user" {
  realm_id    = keycloak_realm.dive_v3_can.id
  name        = "user"
  description = "Standard Canadian user role"
}

resource "keycloak_openid_client" "can_realm_client" {
  realm_id  = keycloak_realm.dive_v3_can.id
  client_id = "dive-v3-broker-client"
  name      = "DIVE V3 Broker Client"
  enabled   = true

  access_type                  = "CONFIDENTIAL"
  standard_flow_enabled        = true
  direct_access_grants_enabled = true # Phase 2.1: Enable for custom login pages

  # Redirect to broker realm
  # CRITICAL: Include BOTH internal and external URLs for MFA flow
  # - External (Cloudflare): For browser redirects
  # - Internal (Docker): For server-to-server OAuth callbacks during MFA
  valid_redirect_uris = [
    "${var.keycloak_public_url}/realms/dive-v3-broker/broker/can-realm-broker/endpoint",
    "https://keycloak:8443/realms/dive-v3-broker/broker/can-realm-broker/endpoint",
    "http://keycloak:8080/realms/dive-v3-broker/broker/can-realm-broker/endpoint"
  ]

  root_url = var.app_url
  base_url = var.app_url
}

# Output client secret for backend configuration
output "can_client_secret" {
  description = "Client secret for dive-v3-broker-client in Canada realm"
  value       = keycloak_openid_client.can_realm_client.client_secret
  sensitive   = true
}

# Protocol mappers for Canada realm client (all DIVE attributes)
resource "keycloak_generic_protocol_mapper" "can_uniqueid_mapper" {
  realm_id        = keycloak_realm.dive_v3_can.id
  client_id       = keycloak_openid_client.can_realm_client.id
  name            = "uniqueID-mapper"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "uniqueID"
    "claim.name"           = "uniqueID"
    "jsonType.label"       = "String" # Fixed: Use String for scalar values
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "can_clearance_mapper" {
  realm_id        = keycloak_realm.dive_v3_can.id
  client_id       = keycloak_openid_client.can_realm_client.id
  name            = "clearance-mapper"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "clearance"
    "claim.name"           = "clearance"
    "jsonType.label"       = "String" # Fixed: Use String for scalar values
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "can_country_mapper" {
  realm_id        = keycloak_realm.dive_v3_can.id
  client_id       = keycloak_openid_client.can_realm_client.id
  name            = "country-mapper"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "countryOfAffiliation"
    "claim.name"           = "countryOfAffiliation"
    "jsonType.label"       = "String" # Fixed: Use String for scalar values
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "can_coi_mapper" {
  realm_id        = keycloak_realm.dive_v3_can.id
  client_id       = keycloak_openid_client.can_realm_client.id
  name            = "coi-mapper"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "acpCOI"
    "claim.name"           = "acpCOI"
    "jsonType.label"       = "String" # Fixed: Use String for scalar values
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "can_dutyorg_mapper" {
  realm_id        = keycloak_realm.dive_v3_can.id
  client_id       = keycloak_openid_client.can_realm_client.id
  name            = "dutyOrg-mapper"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "dutyOrg"
    "claim.name"           = "dutyOrg"
    "jsonType.label"       = "String" # Fixed: Use String for scalar values
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "can_orgunit_mapper" {
  realm_id        = keycloak_realm.dive_v3_can.id
  client_id       = keycloak_openid_client.can_realm_client.id
  name            = "orgUnit-mapper"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "orgUnit"
    "claim.name"           = "orgUnit"
    "jsonType.label"       = "String" # Fixed: Use String for scalar values
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "can_acr_mapper" {
  realm_id        = keycloak_realm.dive_v3_can.id
  client_id       = keycloak_openid_client.can_realm_client.id
  name            = "acr-mapper"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"

  config = {
    "user.session.note"    = "AUTH_CONTEXT_CLASS_REF"
    "claim.name"           = "acr"
    "jsonType.label"       = "String" # Fixed: Use String for scalar values
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "false"
  }
}

resource "keycloak_generic_protocol_mapper" "can_amr_mapper" {
  realm_id        = keycloak_realm.dive_v3_can.id
  client_id       = keycloak_openid_client.can_realm_client.id
  name            = "amr-mapper"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"

  config = {
    "user.session.note"    = "AUTH_METHODS_REF"
    "claim.name"           = "amr"
    "jsonType.label" = "JSON" # Fixed: Use String for scalar values
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "false"
  }
}

# Canada Test User
resource "keycloak_user" "can_test_user" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3_can.id
  username = "john.macdonald"
  enabled  = true

  email      = "john.macdonald@forces.gc.ca"
  first_name = "John"
  last_name  = "MacDonald"

  attributes = {
    uniqueID             = "770fa622-g49d-63f6-c938-668877662222" # UUID v4
    clearance            = "CONFIDENTIAL"
    countryOfAffiliation = "CAN"
    acpCOI               = "[\"CAN-US\"]"
    dutyOrg              = "CAN_FORCES"
    orgUnit              = "CYBER_OPS"
    # acr and amr now dynamically generated by authentication flow (session notes)
  }

  initial_password {
    value     = "Password123!"
    temporary = false
  }
}

resource "keycloak_user_roles" "can_test_user_roles" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3_can.id
  user_id  = keycloak_user.can_test_user[0].id

  role_ids = [
    keycloak_role.can_user.id
  ]
}

