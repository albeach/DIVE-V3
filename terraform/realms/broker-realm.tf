# ============================================
# Federation Broker Realm Configuration
# ============================================
# Central federation hub that brokers identities from national realms
# Gap #1 Remediation: Multi-Realm Architecture
# Reference: docs/KEYCLOAK-MULTI-REALM-GUIDE.md

resource "keycloak_realm" "dive_v3_broker" {
  realm   = "dive-v3-broker"
  enabled = true
  
  display_name      = "DIVE V3 - Federation Hub"
  display_name_html = "<b>DIVE V3</b> - Coalition Identity Broker"
  
  # Federation hub settings (no direct users)
  registration_allowed           = false
  registration_email_as_username = false
  remember_me                    = false
  reset_password_allowed         = false
  edit_username_allowed          = false
  
  # Token lifetimes (conservative for federation)
  access_token_lifespan        = "10m"   # Short for federated tokens
  sso_session_idle_timeout     = "15m"   # Align with strictest realm (U.S.)
  sso_session_max_lifespan     = "4h"    # Conservative
  
  # Brute-force detection (still needed for broker attempts)
  security_defenses {
    brute_force_detection {
      max_login_failures         = 3
      wait_increment_seconds     = 60
      max_failure_wait_seconds   = 900
      failure_reset_time_seconds = 43200
    }
    headers {
      x_frame_options           = "DENY"
      content_security_policy   = "frame-src 'none'; frame-ancestors 'none'; object-src 'none';"
      x_content_type_options    = "nosniff"
      strict_transport_security = "max-age=31536000; includeSubDomains; preload"
    }
  }
  
  ssl_required = "external"
}

# Application Client in Broker Realm
resource "keycloak_openid_client" "dive_v3_app_broker" {
  realm_id  = keycloak_realm.dive_v3_broker.id
  client_id = "dive-v3-client-broker"
  name      = "DIVE V3 Application (Broker)"
  enabled   = true
  
  access_type                  = "CONFIDENTIAL"
  standard_flow_enabled        = true
  implicit_flow_enabled        = false
  direct_access_grants_enabled = false
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
  
  # Logout configuration
  frontchannel_logout_enabled     = true
  frontchannel_logout_url         = "${var.app_url}/api/auth/logout-callback"
  valid_post_logout_redirect_uris = ["${var.app_url}"]
}

# Client scope for DIVE attributes in broker realm
resource "keycloak_openid_client_scope" "broker_dive_attributes" {
  realm_id               = keycloak_realm.dive_v3_broker.id
  name                   = "dive-attributes"
  description            = "DIVE V3 custom attributes"
  consent_screen_text    = "DIVE Coalition Attributes"
  include_in_token_scope = true
}

# Default scopes for broker client
resource "keycloak_openid_client_default_scopes" "broker_client_scopes" {
  realm_id  = keycloak_realm.dive_v3_broker.id
  client_id = keycloak_openid_client.dive_v3_app_broker.id

  default_scopes = [
    "openid",
    "profile",
    "email",
    "roles",
    "web-origins",
    keycloak_openid_client_scope.broker_dive_attributes.name
  ]
}

# Protocol mappers for broker client (to include all DIVE attributes)
resource "keycloak_generic_protocol_mapper" "broker_uniqueid" {
  realm_id   = keycloak_realm.dive_v3_broker.id
  client_id  = keycloak_openid_client.dive_v3_app_broker.id
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

resource "keycloak_generic_protocol_mapper" "broker_clearance" {
  realm_id   = keycloak_realm.dive_v3_broker.id
  client_id  = keycloak_openid_client.dive_v3_app_broker.id
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

resource "keycloak_generic_protocol_mapper" "broker_country" {
  realm_id   = keycloak_realm.dive_v3_broker.id
  client_id  = keycloak_openid_client.dive_v3_app_broker.id
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

resource "keycloak_generic_protocol_mapper" "broker_coi" {
  realm_id   = keycloak_realm.dive_v3_broker.id
  client_id  = keycloak_openid_client.dive_v3_app_broker.id
  name       = "acpCOI"
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

resource "keycloak_generic_protocol_mapper" "broker_dutyorg" {
  realm_id   = keycloak_realm.dive_v3_broker.id
  client_id  = keycloak_openid_client.dive_v3_app_broker.id
  name       = "dutyOrg"
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

resource "keycloak_generic_protocol_mapper" "broker_orgunit" {
  realm_id   = keycloak_realm.dive_v3_broker.id
  client_id  = keycloak_openid_client.dive_v3_app_broker.id
  name       = "orgUnit"
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

resource "keycloak_generic_protocol_mapper" "broker_acr" {
  realm_id   = keycloak_realm.dive_v3_broker.id
  client_id  = keycloak_openid_client.dive_v3_app_broker.id
  name       = "acr"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "acr"
    "claim.name"           = "acr"
    "jsonType.label"       = "String"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "false"
  }
}

resource "keycloak_generic_protocol_mapper" "broker_amr" {
  realm_id   = keycloak_realm.dive_v3_broker.id
  client_id  = keycloak_openid_client.dive_v3_app_broker.id
  name       = "amr"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "amr"
    "claim.name"           = "amr"
    "jsonType.label"       = "String"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "false"
  }
}


