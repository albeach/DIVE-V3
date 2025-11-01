# ============================================
# Italy Realm Configuration
# ============================================
# Italian National Security Policy compliant realm
# NATO Expansion: Phase 1 - Ministero della Difesa
# Reference: docs/NATO-EXPANSION-COMPLETE.md

resource "keycloak_realm" "dive_v3_ita" {
  realm   = "dive-v3-ita"
  enabled = true
  
  display_name      = "DIVE V3 - Italy"
  display_name_html = "<b>DIVE V3</b> - Ministero della Difesa"
  
  # Registration and login settings
  registration_allowed           = false  # Federated IdPs only
  registration_email_as_username = false
  remember_me                    = true
  reset_password_allowed         = true
  edit_username_allowed          = false
  login_with_email_allowed       = true
  
  # Custom DIVE V3 Theme (Option 3: Per-Country Customization)
  login_theme = "dive-v3-ita"
  
  # Internationalization (Italian + English)
  internationalization {
    supported_locales = ["it", "en"]
    default_locale    = "it"
  }
  
  # Token lifetimes (AAL2 - Italian Security Policy)
  access_token_lifespan        = "15m"   # 15 minutes (AAL2)
  sso_session_idle_timeout     = "15m"   # AAL2 requirement
  sso_session_max_lifespan     = "8h"    # AAL2 max: 12h
  access_code_lifespan         = "1m"
  
  # Password policy (Italian security requirements)
  password_policy = "upperCase(1) and lowerCase(1) and digits(1) and specialChars(1) and length(12) and notUsername"
  
  # Brute-force detection (Italian settings)
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
  ssl_required = "none"  # Development: allow HTTP for federation
}

# Italy Realm Roles
resource "keycloak_role" "ita_user" {
  realm_id    = keycloak_realm.dive_v3_ita.id
  name        = "user"
  description = "Standard Italian user role"
}

resource "keycloak_role" "ita_admin" {
  realm_id    = keycloak_realm.dive_v3_ita.id
  name        = "admin"
  description = "Italian realm administrator"
}

# Italy Realm OIDC Client (for broker federation)
resource "keycloak_openid_client" "ita_realm_client" {
  realm_id  = keycloak_realm.dive_v3_ita.id
  client_id = "dive-v3-broker-client"
  name      = "DIVE V3 Broker Client"
  enabled   = true
  
  access_type                  = "CONFIDENTIAL"
  standard_flow_enabled        = true
  direct_access_grants_enabled = true  # Phase 2.1: Enable for custom login pages
  
  # Redirect to broker realm
  valid_redirect_uris = [
    "https://localhost:8443/realms/dive-v3-broker/broker/ita-realm-broker/endpoint",
    "https://keycloak:8443/realms/dive-v3-broker/broker/ita-realm-broker/endpoint"
  ]
  
  root_url = var.app_url
  base_url = var.app_url
}

# Output client secret for backend configuration
output "ita_client_secret" {
  description = "Client secret for dive-v3-broker-client in Italy realm"
  value       = keycloak_openid_client.ita_realm_client.client_secret
  sensitive   = true
}

# Protocol mappers for Italy realm client
resource "keycloak_generic_protocol_mapper" "ita_uniqueid_mapper" {
  realm_id   = keycloak_realm.dive_v3_ita.id
  client_id  = keycloak_openid_client.ita_realm_client.id
  name       = "uniqueID-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "uniqueID"
    "claim.name"           = "uniqueID"
    "jsonType.label"       = "String"  # Fixed: Use String for scalar values
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "ita_clearance_mapper" {
  realm_id   = keycloak_realm.dive_v3_ita.id
  client_id  = keycloak_openid_client.ita_realm_client.id
  name       = "clearance-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "clearance"
    "claim.name"           = "clearance"
    "jsonType.label"       = "String"  # Fixed: Use String for scalar values
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "ita_country_mapper" {
  realm_id   = keycloak_realm.dive_v3_ita.id
  client_id  = keycloak_openid_client.ita_realm_client.id
  name       = "country-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "countryOfAffiliation"
    "claim.name"           = "countryOfAffiliation"
    "jsonType.label"       = "String"  # Fixed: Use String for scalar values
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "ita_coi_mapper" {
  realm_id   = keycloak_realm.dive_v3_ita.id
  client_id  = keycloak_openid_client.ita_realm_client.id
  name       = "coi-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "acpCOI"
    "claim.name"           = "acpCOI"
    "jsonType.label"       = "String"  # Fixed: Use String for scalar values
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "ita_dutyorg_mapper" {
  realm_id   = keycloak_realm.dive_v3_ita.id
  client_id  = keycloak_openid_client.ita_realm_client.id
  name       = "dutyOrg-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "dutyOrg"
    "claim.name"           = "dutyOrg"
    "jsonType.label"       = "String"  # Fixed: Use String for scalar values
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "ita_orgunit_mapper" {
  realm_id   = keycloak_realm.dive_v3_ita.id
  client_id  = keycloak_openid_client.ita_realm_client.id
  name       = "orgUnit-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "orgUnit"
    "claim.name"           = "orgUnit"
    "jsonType.label"       = "String"  # Fixed: Use String for scalar values
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "ita_acr_mapper" {
  realm_id   = keycloak_realm.dive_v3_ita.id
  client_id  = keycloak_openid_client.ita_realm_client.id
  name       = "acr-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"

  config = {
    "user.session.note"    = "AUTH_CONTEXT_CLASS_REF"
    "claim.name"           = "acr"
    "jsonType.label"       = "String"  # Fixed: Use String for scalar values
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "false"
  }
}

resource "keycloak_generic_protocol_mapper" "ita_amr_mapper" {
  realm_id   = keycloak_realm.dive_v3_ita.id
  client_id  = keycloak_openid_client.ita_realm_client.id
  name       = "amr-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"

  config = {
    "user.session.note"    = "AUTH_METHODS_REF"
    "claim.name"           = "amr"
    "jsonType.label"       = "String"  # Fixed: Use String for scalar values
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "false"
  }
}

# Italy Test Users
resource "keycloak_user" "ita_test_user_secret" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3_ita.id
  username = "marco.rossi"
  enabled  = true

  email      = "marco.rossi@difesa.it"
  first_name = "Marco"
  last_name  = "Rossi"
  
  attributes = {
    uniqueID               = "550e8400-e29b-41d4-a716-446655440006"  # UUID v4
    clearance              = "SECRET"
    countryOfAffiliation   = "ITA"
    acpCOI                 = "[\"NATO-COSMIC\"]"
    dutyOrg                = "IT_DEFENSE"
    orgUnit                = "CYBER_DEFENSE"
    # acr and amr now dynamically generated by authentication flow (session notes)
  }

  initial_password {
    value     = "Password123!"
    temporary = false
  }
}

resource "keycloak_user_roles" "ita_test_user_roles" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3_ita.id
  user_id  = keycloak_user.ita_test_user_secret[0].id

  role_ids = [
    keycloak_role.ita_user.id
  ]
}


