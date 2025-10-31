# ============================================
# U.S. Realm Configuration
# ============================================
# NIST SP 800-63B/C compliant realm for U.S. military and government
# Gap #1 Remediation: Multi-Realm Architecture
# Reference: docs/KEYCLOAK-MULTI-REALM-GUIDE.md

resource "keycloak_realm" "dive_v3_usa" {
  realm   = "dive-v3-usa"
  enabled = true
  
  display_name      = "DIVE V3 - United States"
  display_name_html = "<b>DIVE V3</b> - U.S. Department of Defense"
  
  # Registration and login settings
  registration_allowed           = false  # Federated IdPs only
  registration_email_as_username = false
  remember_me                    = true
  reset_password_allowed         = true
  edit_username_allowed          = false
  login_with_email_allowed       = true
  
  # Theming
  login_theme = "keycloak"
  
  # Internationalization
  internationalization {
    supported_locales = ["en"]
    default_locale    = "en"
  }
  
  # Token lifetimes (AAL2 - NIST SP 800-63B)
  access_token_lifespan        = "15m"   # 15 minutes (AAL2)
  sso_session_idle_timeout     = "15m"   # AAL2 requirement
  sso_session_max_lifespan     = "8h"    # AAL2 max: 12h
  access_code_lifespan         = "1m"
  
  # Password policy (NIST SP 800-63B + DoD)
  password_policy = "upperCase(1) and lowerCase(1) and digits(1) and specialChars(1) and length(12) and notUsername"
  
  # Brute-force detection (U.S. settings)
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

# U.S. Realm Roles
resource "keycloak_role" "usa_user" {
  realm_id    = keycloak_realm.dive_v3_usa.id
  name        = "user"
  description = "Standard U.S. user role"
}

resource "keycloak_role" "usa_admin" {
  realm_id    = keycloak_realm.dive_v3_usa.id
  name        = "admin"
  description = "U.S. realm administrator"
}

# U.S. Realm OIDC Client (for broker federation AND direct grant)
resource "keycloak_openid_client" "usa_realm_client" {
  realm_id  = keycloak_realm.dive_v3_usa.id
  client_id = "dive-v3-broker-client"
  name      = "DIVE V3 Broker Client"
  enabled   = true
  
  access_type                  = "CONFIDENTIAL"
  standard_flow_enabled        = true
  direct_access_grants_enabled = true  # Phase 2.1: Enable for custom login pages
  
  # Redirect to broker realm
  valid_redirect_uris = [
    "http://localhost:8081/realms/dive-v3-broker/broker/usa-realm-broker/endpoint",
    "http://keycloak:8080/realms/dive-v3-broker/broker/usa-realm-broker/endpoint"
  ]
  
  root_url = var.app_url
  base_url = var.app_url
}

# Output client secret for backend configuration
output "usa_client_secret" {
  description = "Client secret for dive-v3-broker-client in USA realm"
  value       = keycloak_openid_client.usa_realm_client.client_secret
  sensitive   = true
}

# Protocol mappers for U.S. realm client
resource "keycloak_generic_protocol_mapper" "usa_uniqueid_mapper" {
  realm_id   = keycloak_realm.dive_v3_usa.id
  client_id  = keycloak_openid_client.usa_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "usa_clearance_mapper" {
  realm_id   = keycloak_realm.dive_v3_usa.id
  client_id  = keycloak_openid_client.usa_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "usa_country_mapper" {
  realm_id   = keycloak_realm.dive_v3_usa.id
  client_id  = keycloak_openid_client.usa_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "usa_coi_mapper" {
  realm_id   = keycloak_realm.dive_v3_usa.id
  client_id  = keycloak_openid_client.usa_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "usa_dutyorg_mapper" {
  realm_id   = keycloak_realm.dive_v3_usa.id
  client_id  = keycloak_openid_client.usa_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "usa_orgunit_mapper" {
  realm_id   = keycloak_realm.dive_v3_usa.id
  client_id  = keycloak_openid_client.usa_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "usa_acr_mapper" {
  realm_id   = keycloak_realm.dive_v3_usa.id
  client_id  = keycloak_openid_client.usa_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "usa_amr_mapper" {
  realm_id   = keycloak_realm.dive_v3_usa.id
  client_id  = keycloak_openid_client.usa_realm_client.id
  name       = "amr-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"

  config = {
    "user.session.note"    = "AUTH_METHODS_REF"
    "claim.name"           = "amr"
    "jsonType.label"       = "JSON"  # Phase 2.2: JSON array (not String!)
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "false"
  }
}

# U.S. Test Users (migrate from main realm)
resource "keycloak_user" "usa_test_user_secret" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3_usa.id
  username = "john.doe"
  enabled  = true

  email      = "john.doe@army.mil"
  first_name = "John"
  last_name  = "Doe"
  
  attributes = {
    uniqueID               = "550e8400-e29b-41d4-a716-446655440001"  # UUID v4
    clearance              = "SECRET"
    countryOfAffiliation   = "USA"
    acpCOI                 = "[\"NATO-COSMIC\",\"FVEY\"]"
    dutyOrg                = "US_ARMY"
    orgUnit                = "CYBER_DEFENSE"
    # acr and amr now dynamically generated by authentication flow (session notes)
  }

  initial_password {
    value     = "Password123!"
    temporary = false
  }
}

resource "keycloak_user_roles" "usa_test_user_roles" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3_usa.id
  user_id  = keycloak_user.usa_test_user_secret[0].id

  role_ids = [
    keycloak_role.usa_user.id
  ]
}

# U.S. Test User - TOP_SECRET clearance (alice.general)
resource "keycloak_user" "usa_alice_general" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3_usa.id
  username = "alice.general"
  enabled  = true

  email      = "alice.general@army.mil"
  first_name = "Alice"
  last_name  = "General"
  
  attributes = {
    uniqueID             = "550e8400-e29b-41d4-a716-446655440004"
    clearance            = "TOP_SECRET"
    clearanceOriginal    = "TOP_SECRET"
    countryOfAffiliation = "USA"
    acpCOI               = "[\"NATO-COSMIC\",\"FVEY\"]"
    dutyOrg              = "US_ARMY"
    orgUnit              = "INTELLIGENCE"
  }

  initial_password {
    value     = "Password123!"
    temporary = false
  }
}

resource "keycloak_user_roles" "usa_alice_general_roles" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3_usa.id
  user_id  = keycloak_user.usa_alice_general[0].id

  role_ids = [
    keycloak_role.usa_user.id
  ]
}

