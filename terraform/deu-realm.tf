# ============================================
# Germany Realm Configuration
# ============================================
# BSI TR-03107 compliant realm for German Bundeswehr
# NATO Expansion: Phase 1 - German Defence Network
# Reference: docs/NATO-EXPANSION-COMPLETE.md

resource "keycloak_realm" "dive_v3_deu" {
  realm   = "dive-v3-deu"
  enabled = true
  
  display_name      = "DIVE V3 - Germany"
  display_name_html = "<b>DIVE V3</b> - Bundeswehr"
  
  # Registration and login settings
  registration_allowed           = false  # Federated IdPs only
  registration_email_as_username = false
  remember_me                    = true
  reset_password_allowed         = true
  edit_username_allowed          = false
  login_with_email_allowed       = true
  
  # Custom DIVE V3 Theme (Option 3: Per-Country Customization)
  login_theme = "dive-v3-deu"
  
  # Internationalization (German + English)
  internationalization {
    supported_locales = ["de", "en"]
    default_locale    = "de"
  }
  
  # Token lifetimes (AAL2 - BSI TR-03107 compliant)
  access_token_lifespan        = "15m"   # 15 minutes (AAL2)
  sso_session_idle_timeout     = "15m"   # AAL2 requirement
  sso_session_max_lifespan     = "8h"    # AAL2 max: 12h
  access_code_lifespan         = "1m"
  
  # Password policy (BSI TR-03107 requirements)
  password_policy = "upperCase(1) and lowerCase(1) and digits(1) and specialChars(1) and length(12) and notUsername"
  
  # Brute-force detection (German BSI settings)
  security_defenses {
    brute_force_detection {
      permanent_lockout                = false
      max_login_failures               = 8
      wait_increment_seconds           = 60
      quick_login_check_milli_seconds  = 1000
      minimum_quick_login_wait_seconds = 60
      max_failure_wait_seconds         = 900
      failure_reset_time_seconds       = 900  # 15 minutes
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

# Germany Realm Roles
resource "keycloak_role" "deu_user" {
  realm_id    = keycloak_realm.dive_v3_deu.id
  name        = "user"
  description = "Standard German user role"
}

resource "keycloak_role" "deu_admin" {
  realm_id    = keycloak_realm.dive_v3_deu.id
  name        = "admin"
  description = "German realm administrator"
}

# Germany Realm OIDC Client (for broker federation)
resource "keycloak_openid_client" "deu_realm_client" {
  realm_id  = keycloak_realm.dive_v3_deu.id
  client_id = "dive-v3-broker-client"
  name      = "DIVE V3 Broker Client"
  enabled   = true
  
  access_type                  = "CONFIDENTIAL"
  standard_flow_enabled        = true
  direct_access_grants_enabled = true  # Phase 2.1: Enable for custom login pages
  
  # Redirect to broker realm
  valid_redirect_uris = [
    "https://localhost:8443/realms/dive-v3-broker/broker/deu-realm-broker/endpoint",
    "https://keycloak:8443/realms/dive-v3-broker/broker/deu-realm-broker/endpoint"
  ]
  
  root_url = var.app_url
  base_url = var.app_url
}

# Output client secret for backend configuration
output "deu_client_secret" {
  description = "Client secret for dive-v3-broker-client in Germany realm"
  value       = keycloak_openid_client.deu_realm_client.client_secret
  sensitive   = true
}

# Protocol mappers for Germany realm client
resource "keycloak_generic_protocol_mapper" "deu_uniqueid_mapper" {
  realm_id   = keycloak_realm.dive_v3_deu.id
  client_id  = keycloak_openid_client.deu_realm_client.id
  name       = "uniqueID-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "uniqueID"
    "claim.name"           = "uniqueID"
    "jsonType.label"       = "JSON"  # Phase 2.2: JSON array (not String!)
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "deu_clearance_mapper" {
  realm_id   = keycloak_realm.dive_v3_deu.id
  client_id  = keycloak_openid_client.deu_realm_client.id
  name       = "clearance-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "clearance"
    "claim.name"           = "clearance"
    "jsonType.label"       = "JSON"  # Phase 2.2: JSON array (not String!)
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "deu_country_mapper" {
  realm_id   = keycloak_realm.dive_v3_deu.id
  client_id  = keycloak_openid_client.deu_realm_client.id
  name       = "country-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "countryOfAffiliation"
    "claim.name"           = "countryOfAffiliation"
    "jsonType.label"       = "JSON"  # Phase 2.2: JSON array (not String!)
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "deu_coi_mapper" {
  realm_id   = keycloak_realm.dive_v3_deu.id
  client_id  = keycloak_openid_client.deu_realm_client.id
  name       = "coi-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "acpCOI"
    "claim.name"           = "acpCOI"
    "jsonType.label"       = "JSON"  # Phase 2.2: JSON array (not String!)
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "deu_dutyorg_mapper" {
  realm_id   = keycloak_realm.dive_v3_deu.id
  client_id  = keycloak_openid_client.deu_realm_client.id
  name       = "dutyOrg-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "dutyOrg"
    "claim.name"           = "dutyOrg"
    "jsonType.label"       = "JSON"  # Phase 2.2: JSON array (not String!)
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "deu_orgunit_mapper" {
  realm_id   = keycloak_realm.dive_v3_deu.id
  client_id  = keycloak_openid_client.deu_realm_client.id
  name       = "orgUnit-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "orgUnit"
    "claim.name"           = "orgUnit"
    "jsonType.label"       = "JSON"  # Phase 2.2: JSON array (not String!)
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "deu_acr_mapper" {
  realm_id   = keycloak_realm.dive_v3_deu.id
  client_id  = keycloak_openid_client.deu_realm_client.id
  name       = "acr-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"

  config = {
    "user.session.note"    = "AUTH_CONTEXT_CLASS_REF"
    "claim.name"           = "acr"
    "jsonType.label"       = "JSON"  # Phase 2.2: JSON array (not String!)
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "false"
  }
}

resource "keycloak_generic_protocol_mapper" "deu_amr_mapper" {
  realm_id   = keycloak_realm.dive_v3_deu.id
  client_id  = keycloak_openid_client.deu_realm_client.id
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

# Germany Test Users
resource "keycloak_user" "deu_test_user_secret" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3_deu.id
  username = "hans.mueller"
  enabled  = true

  email      = "hans.mueller@bundeswehr.org"
  first_name = "Hans"
  last_name  = "Müller"
  
  attributes = {
    uniqueID               = "550e8400-e29b-41d4-a716-446655440004"  # UUID v4
    clearance              = "SECRET"
    countryOfAffiliation   = "DEU"
    acpCOI                 = "[\"NATO-COSMIC\"]"
    dutyOrg                = "BUNDESWEHR"
    orgUnit                = "CYBER_DEFENSE"
    # acr and amr now dynamically generated by authentication flow (session notes)
  }

  initial_password {
    value     = "Password123!"
    temporary = false
  }
}

resource "keycloak_user_roles" "deu_test_user_roles" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3_deu.id
  user_id  = keycloak_user.deu_test_user_secret[0].id

  role_ids = [
    keycloak_role.deu_user.id
  ]
}


