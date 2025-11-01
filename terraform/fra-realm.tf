# ============================================
# France Realm Configuration
# ============================================
# ANSSI RGS compliant realm for French military and government
# Gap #1 Remediation: Multi-Realm Architecture
# Reference: docs/KEYCLOAK-MULTI-REALM-GUIDE.md

resource "keycloak_realm" "dive_v3_fra" {
  realm   = "dive-v3-fra"
  enabled = true

  display_name      = "DIVE V3 - France"
  display_name_html = "<b>DIVE V3</b> - Ministère des Armées"

  # Registration and login settings
  registration_allowed           = false
  registration_email_as_username = false
  remember_me                    = true
  reset_password_allowed         = true
  edit_username_allowed          = false
  login_with_email_allowed       = true

  # Custom DIVE V3 Theme (Option 3: Per-Country Customization)
  login_theme = "dive-v3-fra"

  # Internationalization (French primary)
  internationalization {
    supported_locales = ["fr", "en"]
    default_locale    = "fr"
  }

  # Token lifetimes (RGS Level 2 - more permissive than U.S.)
  access_token_lifespan    = "30m" # 30 minutes (France preference)
  sso_session_idle_timeout = "30m" # 30 minutes
  sso_session_max_lifespan = "12h" # 12 hours
  access_code_lifespan     = "1m"

  # French password policy (ANSSI RGS)
  password_policy = "upperCase(1) and lowerCase(1) and digits(1) and specialChars(1) and length(12)"

  # Brute-force detection (French settings - stricter)
  security_defenses {
    brute_force_detection {
      permanent_lockout                = false
      max_login_failures               = 3   # ANSSI: stricter than U.S.
      wait_increment_seconds           = 120 # Longer delays
      quick_login_check_milli_seconds  = 1000
      minimum_quick_login_wait_seconds = 120
      max_failure_wait_seconds         = 1800  # 30 minutes
      failure_reset_time_seconds       = 86400 # 24 hours
    }

    headers {
      x_frame_options           = "DENY" # France: stricter
      content_security_policy   = "frame-src 'none'; frame-ancestors 'none'; object-src 'none';"
      x_content_type_options    = "nosniff"
      x_robots_tag              = "none"
      x_xss_protection          = "1; mode=block"
      strict_transport_security = "max-age=31536000; includeSubDomains; preload"
    }
  }

  ssl_required = "none" # Development: allow HTTP for federation
}

# France Realm Roles
resource "keycloak_role" "fra_user" {
  realm_id    = keycloak_realm.dive_v3_fra.id
  name        = "user"
  description = "Standard French user role"
}

# France Realm OIDC Client (for broker federation)
resource "keycloak_openid_client" "fra_realm_client" {
  realm_id  = keycloak_realm.dive_v3_fra.id
  client_id = "dive-v3-broker-client"
  name      = "DIVE V3 Broker Client"
  enabled   = true

  access_type                  = "CONFIDENTIAL"
  standard_flow_enabled        = true
  direct_access_grants_enabled = true # Phase 2.1: Enable for custom login pages

  valid_redirect_uris = [
    "https://localhost:8443/realms/dive-v3-broker/broker/fra-realm-broker/endpoint",
    "https://keycloak:8443/realms/dive-v3-broker/broker/fra-realm-broker/endpoint"
  ]

  root_url = var.app_url
  base_url = var.app_url
}

# Output client secret for backend configuration
output "fra_client_secret" {
  description = "Client secret for dive-v3-broker-client in France realm"
  value       = keycloak_openid_client.fra_realm_client.client_secret
  sensitive   = true
}

# Protocol mappers for France realm (same as U.S. for consistency)
resource "keycloak_generic_protocol_mapper" "fra_uniqueid_mapper" {
  realm_id        = keycloak_realm.dive_v3_fra.id
  client_id       = keycloak_openid_client.fra_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "fra_clearance_mapper" {
  realm_id        = keycloak_realm.dive_v3_fra.id
  client_id       = keycloak_openid_client.fra_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "fra_country_mapper" {
  realm_id        = keycloak_realm.dive_v3_fra.id
  client_id       = keycloak_openid_client.fra_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "fra_coi_mapper" {
  realm_id        = keycloak_realm.dive_v3_fra.id
  client_id       = keycloak_openid_client.fra_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "fra_dutyorg_mapper" {
  realm_id        = keycloak_realm.dive_v3_fra.id
  client_id       = keycloak_openid_client.fra_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "fra_orgunit_mapper" {
  realm_id        = keycloak_realm.dive_v3_fra.id
  client_id       = keycloak_openid_client.fra_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "fra_acr_mapper" {
  realm_id        = keycloak_realm.dive_v3_fra.id
  client_id       = keycloak_openid_client.fra_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "fra_amr_mapper" {
  realm_id        = keycloak_realm.dive_v3_fra.id
  client_id       = keycloak_openid_client.fra_realm_client.id
  name            = "amr-mapper"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"

  config = {
    "user.session.note"    = "AUTH_METHODS_REF"
    "claim.name"           = "amr"
    "jsonType.label"       = "String" # Fixed: Use String for scalar values
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "false"
  }
}

# France Test User
resource "keycloak_user" "fra_test_user" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3_fra.id
  username = "pierre.dubois"
  enabled  = true

  email      = "pierre.dubois@defense.gouv.fr"
  first_name = "Pierre"
  last_name  = "Dubois"

  attributes = {
    uniqueID             = "660f9511-f39c-52e5-b827-557766551111" # UUID v4
    clearance            = "SECRET"
    countryOfAffiliation = "FRA"
    acpCOI               = "[\"NATO-COSMIC\"]"
    dutyOrg              = "FR_DEFENSE_MINISTRY"
    orgUnit              = "RENSEIGNEMENT"
    # acr and amr now dynamically generated by authentication flow (session notes)
  }

  initial_password {
    value     = "Password123!"
    temporary = false
  }
}

resource "keycloak_user_roles" "fra_test_user_roles" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3_fra.id
  user_id  = keycloak_user.fra_test_user[0].id

  role_ids = [
    keycloak_role.fra_user.id
  ]
}

