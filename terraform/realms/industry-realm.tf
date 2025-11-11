# ============================================
# Industry Realm Configuration
# ============================================
# AAL1 realm for defense contractors and industry partners
# Gap #1 Remediation: Multi-Realm Architecture
# Reference: docs/KEYCLOAK-MULTI-REALM-GUIDE.md

resource "keycloak_realm" "dive_v3_industry" {
  realm   = "dive-v3-industry"
  enabled = true
  
  display_name      = "DIVE V3 - Industry Partners"
  display_name_html = "<b>DIVE V3</b> - Authorized Contractors"
  
  # Registration settings (industry may allow self-registration)
  registration_allowed           = false  # Controlled for pilot
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
  
  # Token lifetimes (relaxed for industry - AAL1)
  access_token_lifespan        = "60m"   # 1 hour (contractor convenience)
  sso_session_idle_timeout     = "60m"   # 1 hour
  sso_session_max_lifespan     = "24h"   # 24 hours
  access_code_lifespan         = "1m"
  
  # Industry password policy (less strict - 10 chars vs 12)
  password_policy = "upperCase(1) and lowerCase(1) and digits(1) and length(10)"
  
  # Brute-force detection (more lenient for contractors)
  security_defenses {
    brute_force_detection {
      permanent_lockout                = false
      max_login_failures               = 10  # More lenient
      wait_increment_seconds           = 30
      quick_login_check_milli_seconds  = 1000
      minimum_quick_login_wait_seconds = 30
      max_failure_wait_seconds         = 300  # 5 minutes
      failure_reset_time_seconds       = 21600 # 6 hours
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
  
  ssl_required = "external"
}

# Industry Realm Roles
resource "keycloak_role" "industry_user" {
  realm_id    = keycloak_realm.dive_v3_industry.id
  name        = "user"
  description = "Standard industry/contractor user role"
}

resource "keycloak_role" "industry_admin" {
  realm_id    = keycloak_realm.dive_v3_industry.id
  name        = "admin"
  description = "Industry realm administrator"
}

# Industry Realm OIDC Client (for broker federation)
resource "keycloak_openid_client" "industry_realm_client" {
  realm_id  = keycloak_realm.dive_v3_industry.id
  client_id = "dive-v3-broker-client"
  name      = "DIVE V3 Broker Client"
  enabled   = true
  
  access_type                  = "CONFIDENTIAL"
  standard_flow_enabled        = true
  direct_access_grants_enabled = false
  
  # Redirect to broker realm
  # CRITICAL: Include BOTH internal and external URLs for MFA flow
  # - External (Cloudflare): For browser redirects
  # - Internal (Docker): For server-to-server OAuth callbacks during MFA
  valid_redirect_uris = [
    "${var.keycloak_public_url}/realms/dive-v3-broker/broker/industry-realm-broker/endpoint",
    "https://keycloak:8443/realms/dive-v3-broker/broker/industry-realm-broker/endpoint",
    "http://keycloak:8080/realms/dive-v3-broker/broker/industry-realm-broker/endpoint"
  ]
  
  root_url = var.app_url
  base_url = var.app_url
}

# Protocol mappers for Industry realm client
resource "keycloak_generic_protocol_mapper" "industry_uniqueid_mapper" {
  realm_id   = keycloak_realm.dive_v3_industry.id
  client_id  = keycloak_openid_client.industry_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "industry_clearance_mapper" {
  realm_id   = keycloak_realm.dive_v3_industry.id
  client_id  = keycloak_openid_client.industry_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "industry_country_mapper" {
  realm_id   = keycloak_realm.dive_v3_industry.id
  client_id  = keycloak_openid_client.industry_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "industry_coi_mapper" {
  realm_id   = keycloak_realm.dive_v3_industry.id
  client_id  = keycloak_openid_client.industry_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "industry_dutyorg_mapper" {
  realm_id   = keycloak_realm.dive_v3_industry.id
  client_id  = keycloak_openid_client.industry_realm_client.id
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

resource "keycloak_generic_protocol_mapper" "industry_orgunit_mapper" {
  realm_id   = keycloak_realm.dive_v3_industry.id
  client_id  = keycloak_openid_client.industry_realm_client.id
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
resource "keycloak_generic_protocol_mapper" "industry_acr_mapper" {
  realm_id   = keycloak_realm.dive_v3_industry.id
  client_id  = keycloak_openid_client.industry_realm_client.id
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
resource "keycloak_generic_protocol_mapper" "industry_amr_mapper" {
  realm_id   = keycloak_realm.dive_v3_industry.id
  client_id  = keycloak_openid_client.industry_realm_client.id
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

# Industry Test User (contractor with minimal clearance)
resource "keycloak_user" "industry_test_user" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3_industry.id
  username = "bob.contractor"
  enabled  = true

  email      = "bob.contractor@lockheed.com"
  first_name = "Bob"
  last_name  = "Contractor"
  
  attributes = {
    uniqueID               = "880gb733-h50e-74g7-d049-779988773333"  # UUID v4
    clearance              = "UNCLASSIFIED"  # Industry max: UNCLASSIFIED
    countryOfAffiliation   = "USA"
    acpCOI                 = "[]"  # No COI access for contractors
    dutyOrg                = "LOCKHEED_MARTIN"
    orgUnit                = "RESEARCH_DEV"
    acr                    = "urn:mace:incommon:iap:bronze"  # AAL1 (password only)
    amr                    = "[\"pwd\"]"  # No MFA for contractors
  }

  initial_password {
    value     = "Password123!"
    temporary = false
  }
}

resource "keycloak_user_roles" "industry_test_user_roles" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3_industry.id
  user_id  = keycloak_user.industry_test_user[0].id

  role_ids = [
    keycloak_role.industry_user.id
  ]
}


