# Federated Instance Module - Main Resources
# Creates the broker realm and client for a DIVE V3 federated instance

# ============================================================================
# BROKER REALM
# ============================================================================
resource "keycloak_realm" "broker" {
  realm             = var.realm_name
  enabled           = true
  display_name      = "DIVE V3 - ${var.instance_name}"
  display_name_html = "<div class='kc-logo-text'><span>DIVE V3 - ${var.instance_name}</span></div>"

  # Login settings
  login_theme                  = var.login_theme
  registration_allowed         = false
  reset_password_allowed       = true
  remember_me                  = true
  verify_email                 = false
  login_with_email_allowed     = true
  duplicate_emails_allowed     = false
  edit_username_allowed        = false

  # Token settings
  access_token_lifespan        = "15m"
  refresh_token_max_reuse      = 0
  sso_session_idle_timeout     = "30m"
  sso_session_max_lifespan     = "10h"
  offline_session_idle_timeout = "720h"

  # Security settings
  password_policy = "length(12) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1)"

  # Internationalization
  internationalization {
    supported_locales = ["en", "fr", "de", "es", "it", "nl", "pl"]
    default_locale    = "en"
  }

  # Security defenses
  security_defenses {
    headers {
      x_frame_options                     = "DENY"
      content_security_policy             = "frame-src 'self'; frame-ancestors 'self'; object-src 'none';"
      x_content_type_options              = "nosniff"
      x_xss_protection                    = "1; mode=block"
      strict_transport_security           = "max-age=31536000; includeSubDomains"
    }
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

  # WebAuthn settings for passwordless auth
  web_authn_policy {
    relying_party_entity_name = "DIVE V3 - ${var.instance_name}"
    relying_party_id          = ""  # Use default (hostname)
    signature_algorithms      = ["ES256", "RS256"]
    attestation_conveyance_preference = "indirect"
    authenticator_attachment  = "platform"
    require_resident_key      = "No"
    user_verification_requirement = "preferred"
  }
}

# ============================================================================
# BROKER CLIENT - Main application client
# ============================================================================
resource "keycloak_openid_client" "broker_client" {
  realm_id  = keycloak_realm.broker.id
  client_id = var.client_id
  name      = "DIVE V3 Application - ${var.instance_name}"
  enabled   = true

  # Client settings
  access_type                  = "CONFIDENTIAL"
  standard_flow_enabled        = true
  implicit_flow_enabled        = false
  direct_access_grants_enabled = true  # Required for custom login & OTP flows (see below)
  service_accounts_enabled     = true

  # URLs - include both localhost (dev) and Cloudflare (prod)
  root_url = var.app_url
  valid_redirect_uris = [
    "${var.app_url}/*",
    "http://localhost:3000/*",
    "https://localhost:3000/*",
  ]
  web_origins = [
    var.app_url,
    var.api_url,
    "http://localhost:3000",
    "https://localhost:3000",
  ]

  # Token settings
  access_token_lifespan = "900"  # 15 minutes

  # Login settings
  login_theme = var.login_theme
}

# ============================================================================
# PROTOCOL MAPPERS - Add custom claims to tokens
# ============================================================================

# Clearance level mapper
resource "keycloak_openid_user_attribute_protocol_mapper" "clearance" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.broker_client.id
  name      = "clearance"

  user_attribute       = "clearance"
  claim_name          = "clearance"
  claim_value_type    = "String"
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# Country of affiliation mapper
resource "keycloak_openid_user_attribute_protocol_mapper" "country_of_affiliation" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.broker_client.id
  name      = "countryOfAffiliation"

  user_attribute       = "countryOfAffiliation"
  claim_name          = "countryOfAffiliation"
  claim_value_type    = "String"
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# Unique ID mapper
resource "keycloak_openid_user_attribute_protocol_mapper" "unique_id" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.broker_client.id
  name      = "uniqueID"

  user_attribute       = "uniqueID"
  claim_name          = "uniqueID"
  claim_value_type    = "String"
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# ACP COI (Communities of Interest) mapper
resource "keycloak_openid_user_attribute_protocol_mapper" "acp_coi" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.broker_client.id
  name      = "acpCOI"

  user_attribute       = "acpCOI"
  claim_name          = "acpCOI"
  claim_value_type    = "String"
  multivalued         = true
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# Organization mapper
resource "keycloak_openid_user_attribute_protocol_mapper" "organization" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.broker_client.id
  name      = "organization"

  user_attribute       = "organization"
  claim_name          = "organization"
  claim_value_type    = "String"
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# ============================================================================
# INCOMING FEDERATION CLIENTS
# ============================================================================
# Create clients for partner instances to federate TO this instance
# When USA wants to federate to FRA, FRA needs a client called "dive-v3-usa-federation"

resource "keycloak_openid_client" "incoming_federation" {
  for_each = var.federation_partners

  realm_id  = keycloak_realm.broker.id
  client_id = "dive-v3-${lower(each.value.instance_code)}-federation"
  name      = "Federation Client - ${each.value.instance_name}"
  enabled   = each.value.enabled

  # Client settings for federation
  access_type                  = "CONFIDENTIAL"
  standard_flow_enabled        = true
  implicit_flow_enabled        = false
  direct_access_grants_enabled = false
  service_accounts_enabled     = false

  # URLs - redirect back to the partner's Keycloak
  valid_redirect_uris = [
    "${each.value.idp_url}/realms/dive-v3-broker/broker/${lower(var.instance_code)}-federation/endpoint",
    "${each.value.idp_url}/realms/dive-v3-broker/broker/${lower(var.instance_code)}-federation/endpoint/*",
  ]
  web_origins = [
    each.value.idp_url,
  ]

  # Token settings
  access_token_lifespan = "300"  # 5 minutes for federation tokens
}

# Protocol mappers for incoming federation clients
resource "keycloak_openid_user_attribute_protocol_mapper" "federation_clearance" {
  for_each = var.federation_partners

  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.incoming_federation[each.key].id
  name      = "clearance"

  user_attribute       = "clearance"
  claim_name          = "clearance"
  claim_value_type    = "String"
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

resource "keycloak_openid_user_attribute_protocol_mapper" "federation_country" {
  for_each = var.federation_partners

  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.incoming_federation[each.key].id
  name      = "countryOfAffiliation"

  user_attribute       = "countryOfAffiliation"
  claim_name          = "countryOfAffiliation"
  claim_value_type    = "String"
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

resource "keycloak_openid_user_attribute_protocol_mapper" "federation_unique_id" {
  for_each = var.federation_partners

  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.incoming_federation[each.key].id
  name      = "uniqueID"

  user_attribute       = "uniqueID"
  claim_name          = "uniqueID"
  claim_value_type    = "String"
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

resource "keycloak_openid_user_attribute_protocol_mapper" "federation_coi" {
  for_each = var.federation_partners

  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.incoming_federation[each.key].id
  name      = "acpCOI"

  user_attribute       = "acpCOI"
  claim_name          = "acpCOI"
  claim_value_type    = "String"
  multivalued         = true
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

resource "keycloak_openid_user_attribute_protocol_mapper" "federation_organization" {
  for_each = var.federation_partners

  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.incoming_federation[each.key].id
  name      = "organization"

  user_attribute       = "organization"
  claim_name          = "organization"
  claim_value_type    = "String"
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

