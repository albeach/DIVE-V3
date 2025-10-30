# ============================================
# Netherlands Realm Configuration
# ============================================
# Dutch National Security Policy compliant realm
# NATO Expansion: Phase 1 - Ministerie van Defensie
# Reference: docs/NATO-EXPANSION-COMPLETE.md

resource "keycloak_realm" "dive_v3_nld" {
  realm   = "dive-v3-nld"
  enabled = true
  
  display_name      = "DIVE V3 - Netherlands"
  display_name_html = "<b>DIVE V3</b> - Ministerie van Defensie"
  
  # Registration and login settings
  registration_allowed           = false  # Federated IdPs only
  registration_email_as_username = false
  remember_me                    = true
  reset_password_allowed         = true
  edit_username_allowed          = false
  login_with_email_allowed       = true
  
  # Theming
  login_theme = "keycloak"
  
  # Internationalization (Dutch + English)
  internationalization {
    supported_locales = ["nl", "en"]
    default_locale    = "nl"
  }
  
  # Token lifetimes (AAL2 - Dutch Security Policy)
  access_token_lifespan        = "15m"   # 15 minutes (AAL2)
  sso_session_idle_timeout     = "15m"   # AAL2 requirement
  sso_session_max_lifespan     = "8h"    # AAL2 max: 12h
  access_code_lifespan         = "1m"
  
  # Password policy (Dutch security requirements)
  password_policy = "upperCase(1) and lowerCase(1) and digits(1) and specialChars(1) and length(12) and notUsername"
  
  # Brute-force detection (Dutch settings)
  security_defenses {
    brute_force_detection {
      permanent_lockout                = false
      max_login_failures               = 5
      wait_increment_seconds           = 60
      quick_login_check_milli_seconds  = 1000
      minimum_quick_login_wait_seconds = 60
      max_failure_wait_seconds         = 900
      failure_reset_time_seconds       = 43200
    }
    
    headers {
      x_frame_options                    = "SAMEORIGIN"
      content_security_policy            = "frame-src 'self'; frame-ancestors 'self'; object-src 'none';"
      x_content_type_options             = "nosniff"
      x_robots_tag                       = "none"
      x_xss_protection                   = "1; mode=block"
      strict_transport_security          = "max-age=31536000; includeSubDomains"
    }
  }
  
  # SSL/TLS requirements
  ssl_required = "external"
}

# Netherlands Realm Roles
resource "keycloak_role" "nld_user" {
  realm_id    = keycloak_realm.dive_v3_nld.id
  name        = "user"
  description = "Standard Dutch user role"
}

resource "keycloak_role" "nld_admin" {
  realm_id    = keycloak_realm.dive_v3_nld.id
  name        = "admin"
  description = "Dutch realm administrator"
}

# Netherlands Realm OIDC Client (for broker federation)
resource "keycloak_openid_client" "nld_realm_client" {
  realm_id  = keycloak_realm.dive_v3_nld.id
  client_id = "dive-v3-broker-client"
  name      = "DIVE V3 Broker Client"
  enabled   = true
  
  access_type                  = "CONFIDENTIAL"
  standard_flow_enabled        = true
  direct_access_grants_enabled = true  # Phase 2.1: Enable for custom login pages
  
  # Redirect to broker realm
  valid_redirect_uris = [
    "http://localhost:8081/realms/dive-v3-broker/broker/nld-realm-broker/endpoint",
    "http://keycloak:8080/realms/dive-v3-broker/broker/nld-realm-broker/endpoint"
  ]
  
  root_url = var.app_url
  base_url = var.app_url
}

# Protocol mappers for Netherlands realm client
resource "keycloak_generic_protocol_mapper" "nld_uniqueid_mapper" {
  realm_id   = keycloak_realm.dive_v3_nld.id
  client_id  = keycloak_openid_client.nld_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "nld_clearance_mapper" {
  realm_id   = keycloak_realm.dive_v3_nld.id
  client_id  = keycloak_openid_client.nld_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "nld_country_mapper" {
  realm_id   = keycloak_realm.dive_v3_nld.id
  client_id  = keycloak_openid_client.nld_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "nld_coi_mapper" {
  realm_id   = keycloak_realm.dive_v3_nld.id
  client_id  = keycloak_openid_client.nld_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "nld_dutyorg_mapper" {
  realm_id   = keycloak_realm.dive_v3_nld.id
  client_id  = keycloak_openid_client.nld_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "nld_orgunit_mapper" {
  realm_id   = keycloak_realm.dive_v3_nld.id
  client_id  = keycloak_openid_client.nld_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "nld_acr_mapper" {
  realm_id   = keycloak_realm.dive_v3_nld.id
  client_id  = keycloak_openid_client.nld_realm_client.id
  name       = "acr-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"

  config = {
    "user.session.note"    = "AUTH_CONTEXT_CLASS_REF"
    "claim.name"           = "acr"
    "jsonType.label"       = "String"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "false"
  }
}

resource "keycloak_generic_protocol_mapper" "nld_amr_mapper" {
  realm_id   = keycloak_realm.dive_v3_nld.id
  client_id  = keycloak_openid_client.nld_realm_client.id
  name       = "amr-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"

  config = {
    "user.session.note"    = "AUTH_METHODS_REF"
    "claim.name"           = "amr"
    "jsonType.label"       = "String"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "false"
  }
}

# Netherlands Test Users
resource "keycloak_user" "nld_test_user_secret" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3_nld.id
  username = "pieter.devries"
  enabled  = true

  email      = "pieter.devries@defensie.nl"
  first_name = "Pieter"
  last_name  = "de Vries"
  
  attributes = {
    uniqueID               = "550e8400-e29b-41d4-a716-446655440009"  # UUID v4
    clearance              = "SECRET"
    countryOfAffiliation   = "NLD"
    acpCOI                 = "[\"NATO-COSMIC\"]"
    dutyOrg                = "NL_DEFENSE"
    orgUnit                = "CYBER_DEFENSE"
    # acr and amr now dynamically generated by authentication flow (session notes)
  }

  initial_password {
    value     = "Password123!"
    temporary = false
  }
}

resource "keycloak_user_roles" "nld_test_user_roles" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3_nld.id
  user_id  = keycloak_user.nld_test_user_secret[0].id

  role_ids = [
    keycloak_role.nld_user.id
  ]
}


