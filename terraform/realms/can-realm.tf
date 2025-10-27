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
  
  internationalization {
    supported_locales = ["en", "fr"]  # Bilingual
    default_locale    = "en"
  }
  
  # Token lifetimes (GCCF Level 2 - balanced)
  access_token_lifespan        = "20m"
  sso_session_idle_timeout     = "20m"
  sso_session_max_lifespan     = "10h"
  
  password_policy = "upperCase(1) and lowerCase(1) and digits(1) and specialChars(1) and length(12)"
  
  security_defenses {
    brute_force_detection {
      max_login_failures         = 5
      wait_increment_seconds     = 60
      max_failure_wait_seconds   = 900
      failure_reset_time_seconds = 43200
    }
  }
  
  ssl_required = "external"
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
  direct_access_grants_enabled = false
  
  valid_redirect_uris = [
    "http://localhost:8081/realms/dive-v3-broker/broker/can-realm-broker/endpoint",
    "http://keycloak:8080/realms/dive-v3-broker/broker/can-realm-broker/endpoint"
  ]
  
  root_url = var.app_url
  base_url = var.app_url
}

# Protocol mappers for Canada realm client (all DIVE attributes)
resource "keycloak_generic_protocol_mapper" "can_uniqueid_mapper" {
  realm_id   = keycloak_realm.dive_v3_can.id
  client_id  = keycloak_openid_client.can_realm_client.id
  name       = "uniqueID-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "uniqueID"
    "claim.name"           = "uniqueID"
    "jsonType.label"       = "String"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "can_clearance_mapper" {
  realm_id   = keycloak_realm.dive_v3_can.id
  client_id  = keycloak_openid_client.can_realm_client.id
  name       = "clearance-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "clearance"
    "claim.name"           = "clearance"
    "jsonType.label"       = "String"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "can_country_mapper" {
  realm_id   = keycloak_realm.dive_v3_can.id
  client_id  = keycloak_openid_client.can_realm_client.id
  name       = "country-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "countryOfAffiliation"
    "claim.name"           = "countryOfAffiliation"
    "jsonType.label"       = "String"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "can_coi_mapper" {
  realm_id   = keycloak_realm.dive_v3_can.id
  client_id  = keycloak_openid_client.can_realm_client.id
  name       = "coi-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "acpCOI"
    "claim.name"           = "acpCOI"
    "jsonType.label"       = "String"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "can_dutyorg_mapper" {
  realm_id   = keycloak_realm.dive_v3_can.id
  client_id  = keycloak_openid_client.can_realm_client.id
  name       = "dutyOrg-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "dutyOrg"
    "claim.name"           = "dutyOrg"
    "jsonType.label"       = "String"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "can_orgunit_mapper" {
  realm_id   = keycloak_realm.dive_v3_can.id
  client_id  = keycloak_openid_client.can_realm_client.id
  name       = "orgUnit-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "orgUnit"
    "claim.name"           = "orgUnit"
    "jsonType.label"       = "String"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

# Keycloak 26 Fix: Use session note mapper instead of user attribute
# ACR (Authentication Context Class Reference) is set by Keycloak during authentication flow
resource "keycloak_generic_protocol_mapper" "can_acr_mapper" {
  realm_id   = keycloak_realm.dive_v3_can.id
  client_id  = keycloak_openid_client.can_realm_client.id
  name       = "acr-from-session"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"  # Changed from usermodel-attribute-mapper

  config = {
    "user.session.note"    = "AUTH_CONTEXT_CLASS_REF"  # Keycloak's internal ACR storage
    "claim.name"           = "acr"
    "jsonType.label"       = "String"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "false"
  }
}

# Keycloak 26 Fix: Use session note mapper for AMR
# AMR (Authentication Methods Reference) contains array of auth factors
resource "keycloak_generic_protocol_mapper" "can_amr_mapper" {
  realm_id   = keycloak_realm.dive_v3_can.id
  client_id  = keycloak_openid_client.can_realm_client.id
  name       = "amr-from-session"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"  # Changed from usermodel-attribute-mapper

  config = {
    "user.session.note"    = "AUTH_METHODS_REF"  # Keycloak's internal AMR storage
    "claim.name"           = "amr"
    "jsonType.label"       = "String"
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
    uniqueID               = "770fa622-g49d-63f6-c938-668877662222"  # UUID v4
    clearance              = "CONFIDENTIAL"
    countryOfAffiliation   = "CAN"
    acpCOI                 = "[\"CAN-US\"]"
    dutyOrg                = "CAN_FORCES"
    orgUnit                = "CYBER_OPS"
    acr                    = "urn:mace:incommon:iap:silver"
    amr                    = "[\"pwd\",\"otp\"]"
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

