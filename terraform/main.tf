terraform {
  required_providers {
    keycloak = {
      source  = "mrparkers/keycloak"
      version = ">= 4.0.0"
    }
  }
  required_version = ">= 1.0"
}

provider "keycloak" {
  client_id     = "admin-cli"
  username      = var.keycloak_admin_username
  password      = var.keycloak_admin_password
  url           = var.keycloak_url
  realm         = "master"
  initial_login = true
}

# ============================================
# DIVE V3 Realm Configuration
# ============================================

resource "keycloak_realm" "dive_v3" {
  realm   = var.realm_name
  enabled = true

  display_name               = "DIVE V3 Coalition Pilot"
  display_name_html          = "<b>DIVE V3</b> - USA/NATO ICAM Pilot"
  
  registration_allowed           = false  # Federated IdPs only
  registration_email_as_username = false
  remember_me                    = true
  reset_password_allowed         = true
  edit_username_allowed          = false
  login_with_email_allowed       = true

  login_theme = "keycloak"

  internationalization {
    supported_locales = ["en", "fr"]
    default_locale    = "en"
  }

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
  }

  # ACP-240 aligned password policy
  password_policy = "upperCase(1) and lowerCase(1) and digits(1) and specialChars(1) and length(12)"
  
  # Token lifetimes
  access_token_lifespan = "15m"   # 15 minutes
  sso_session_idle_timeout = "8h" # 8 hours
  sso_session_max_lifespan = "12h" # 12 hours
}

# ============================================
# Next.js OIDC Client
# ============================================

resource "keycloak_openid_client" "dive_v3_app" {
  realm_id                     = keycloak_realm.dive_v3.id
  client_id                    = var.client_id
  name                         = "DIVE V3 Next.js Application"
  enabled                      = true
  access_type                  = "CONFIDENTIAL"
  standard_flow_enabled        = true
  implicit_flow_enabled        = false
  direct_access_grants_enabled = false  # Federated only
  service_accounts_enabled     = false

  root_url = var.app_url
  base_url = var.app_url

  valid_redirect_uris = [
    "${var.app_url}/*",
    "${var.app_url}/api/auth/callback/keycloak"
  ]

  web_origins = [
    var.app_url,
    "+"
  ]

  admin_url = var.app_url

  # Logout configuration
  frontchannel_logout_enabled = true
  frontchannel_logout_url     = "${var.app_url}/api/auth/logout-callback"
  backchannel_logout_url      = "${var.app_url}/api/auth/secure-logout"
  
  valid_post_logout_redirect_uris = [
    "${var.app_url}/*",
    "${var.app_url}/",
    "${var.app_url}"
  ]
  
  extra_config = {
    "frontchannel.logout.session.required" = "false"
  }
}

# ============================================
# Client Scopes with DIVE Attributes
# ============================================

resource "keycloak_openid_client_scope" "dive_attributes" {
  realm_id               = keycloak_realm.dive_v3.id
  name                   = "dive-attributes"
  description            = "DIVE V3 custom attributes (uniqueID, clearance, countryOfAffiliation, acpCOI)"
  consent_screen_text    = "DIVE Coalition Attributes"
  include_in_token_scope = true
}

# Default scopes
resource "keycloak_openid_client_default_scopes" "dive_v3_default_scopes" {
  realm_id  = keycloak_realm.dive_v3.id
  client_id = keycloak_openid_client.dive_v3_app.id

  default_scopes = [
    "openid",
    "profile",
    "email",
    "roles",
    "web-origins",
    keycloak_openid_client_scope.dive_attributes.name
  ]
}

# Optional scopes
resource "keycloak_openid_client_optional_scopes" "dive_v3_optional_scopes" {
  realm_id  = keycloak_realm.dive_v3.id
  client_id = keycloak_openid_client.dive_v3_app.id

  optional_scopes = [
    "address",
    "phone",
    "offline_access"
  ]
}

# ============================================
# Protocol Mappers for DIVE Attributes
# ============================================

# uniqueID mapper
resource "keycloak_generic_protocol_mapper" "unique_id_mapper" {
  realm_id   = keycloak_realm.dive_v3.id
  client_id  = keycloak_openid_client.dive_v3_app.id
  name       = "uniqueID"
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

# clearance mapper
resource "keycloak_generic_protocol_mapper" "clearance_mapper" {
  realm_id   = keycloak_realm.dive_v3.id
  client_id  = keycloak_openid_client.dive_v3_app.id
  name       = "clearance"
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

# countryOfAffiliation mapper
resource "keycloak_generic_protocol_mapper" "country_mapper" {
  realm_id   = keycloak_realm.dive_v3.id
  client_id  = keycloak_openid_client.dive_v3_app.id
  name       = "countryOfAffiliation"
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

# acpCOI mapper (multi-valued)
resource "keycloak_generic_protocol_mapper" "coi_mapper" {
  realm_id   = keycloak_realm.dive_v3.id
  client_id  = keycloak_openid_client.dive_v3_app.id
  name       = "acpCOI"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "acpCOI"
    "claim.name"           = "acpCOI"
    "jsonType.label"       = "String"
    "multivalued"          = "true"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

# ============================================
# Realm Roles
# ============================================

resource "keycloak_role" "user_role" {
  realm_id    = keycloak_realm.dive_v3.id
  name        = "user"
  description = "Standard user role for coalition personnel"
}

resource "keycloak_role" "admin_role" {
  realm_id    = keycloak_realm.dive_v3.id
  name        = "admin"
  description = "Administrator role for system management"
}

# ============================================
# Test Users (Week 1: U.S. IdP Simulation)
# ============================================

# U.S. Test User - SECRET clearance
resource "keycloak_user" "test_user_us_secret" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3.id
  username = "testuser-us"
  enabled  = true

  email      = "john.doe@army.mil"
  first_name = "John"
  last_name  = "Doe"
  
  attributes = {
    uniqueID               = "john.doe@mil"
    clearance              = "SECRET"
    countryOfAffiliation   = "USA"
    acpCOI                 = jsonencode(["NATO-COSMIC", "FVEY"])
  }

  initial_password {
    value     = "Password123!"
    temporary = false
  }
}

# U.S. Test User - CONFIDENTIAL clearance
resource "keycloak_user" "test_user_us_confid" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3.id
  username = "testuser-us-confid"
  enabled  = true

  email      = "jane.smith@navy.mil"
  first_name = "Jane"
  last_name  = "Smith"
  
  attributes = {
    uniqueID               = "jane.smith@mil"
    clearance              = "CONFIDENTIAL"
    countryOfAffiliation   = "USA"
    acpCOI                 = jsonencode(["FVEY"])
  }

  initial_password {
    value     = "Password123!"
    temporary = false
  }
}

# U.S. Test User - UNCLASSIFIED
resource "keycloak_user" "test_user_us_unclass" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3.id
  username = "testuser-us-unclass"
  enabled  = true

  email      = "bob.jones@contractor.mil"
  first_name = "Bob"
  last_name  = "Jones"
  
  attributes = {
    uniqueID               = "bob.jones@mil"
    clearance              = "UNCLASSIFIED"
    countryOfAffiliation   = "USA"
    acpCOI                 = jsonencode([])
  }

  initial_password {
    value     = "Password123!"
    temporary = false
  }
}

# Assign user role to test users
resource "keycloak_user_roles" "test_user_us_secret_roles" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3.id
  user_id  = keycloak_user.test_user_us_secret[0].id

  role_ids = [
    keycloak_role.user_role.id
  ]
}

