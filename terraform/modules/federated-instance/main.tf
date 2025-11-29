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
  login_theme              = var.login_theme
  registration_allowed     = false
  reset_password_allowed   = true
  remember_me              = true
  verify_email             = false
  login_with_email_allowed = true
  duplicate_emails_allowed = false
  edit_username_allowed    = false

  # Token settings
  access_token_lifespan        = "15m"
  refresh_token_max_reuse      = 0
  sso_session_idle_timeout     = "30m"
  sso_session_max_lifespan     = "10h"
  offline_session_idle_timeout = "720h"

  # NIST 800-63B Compliant Password Policy (Phase 1 - Nov 27, 2025)
  # - Minimum 16 characters (exceeds NIST 12-char minimum)
  # - Composition requirements (defense in depth)
  # - Password history to prevent reuse
  # - Cannot contain username or email
  password_policy = join(" and ", [
    "length(16)",           # Minimum 16 characters
    "upperCase(1)",         # At least 1 uppercase
    "lowerCase(1)",         # At least 1 lowercase
    "digits(1)",            # At least 1 digit
    "specialChars(1)",      # At least 1 special char
    "notUsername()",        # Cannot contain username
    "notEmail()",           # Cannot contain email
    "passwordHistory(5)",   # Cannot reuse last 5 passwords
  ])

  # Internationalization
  internationalization {
    supported_locales = ["en", "fr", "de", "es", "it", "nl", "pl"]
    default_locale    = "en"
  }

  # Security defenses
  security_defenses {
    headers {
      x_frame_options           = "DENY"
      content_security_policy   = "frame-src 'self'; frame-ancestors 'self'; object-src 'none';"
      x_content_type_options    = "nosniff"
      x_xss_protection          = "1; mode=block"
      strict_transport_security = "max-age=31536000; includeSubDomains"
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

  # ============================================================================
  # WebAuthn Policy (Standard - AAL2)
  # ============================================================================
  # Used for standard 2FA with hardware keys or platform authenticators
  # Allows platform (TouchID, FaceID, Windows Hello) and cross-platform (YubiKey)
  web_authn_policy {
    relying_party_entity_name         = "DIVE V3 Coalition - ${var.instance_name}"
    relying_party_id                  = "" # Use default (hostname)
    signature_algorithms              = ["ES256", "RS256"]
    attestation_conveyance_preference = "direct"  # Full attestation for audit
    authenticator_attachment          = "not specified"  # Allows all types (platform, cross-platform, hybrid/QR)
    require_resident_key              = "No"      # Server-side credential storage OK
    user_verification_requirement     = "preferred"
    create_timeout                    = 60        # 60 seconds to complete
    avoid_same_authenticator_register = false
  }

  # ============================================================================
  # WebAuthn Passwordless Policy (AAL3 - TOP_SECRET)
  # ============================================================================
  # NIST SP 800-63B AAL3 compliant policy for TOP_SECRET users
  # Allows: Hardware keys (YubiKey), Platform (TouchID), AND QR code/Hybrid flow
  # 
  # Key Settings:
  # - authenticator_attachment = "" (not specified) → Allows ALL types including QR code
  # - require_resident_key = "Yes" → Discoverable credential (passkey requirement)
  # - user_verification_requirement = "required" → Biometric/PIN required
  # - attestation_conveyance_preference = "direct" → Full attestation for audit
  #
  # AAL3 Compliance Notes:
  # - Hardware-backed keys (Secure Enclave, TPM) meet AAL3 requirements
  # - QR code flow uses phone's secure enclave (hardware-backed)
  # - User verification ensures biometric/PIN is required
  web_authn_passwordless_policy {
    relying_party_entity_name         = "DIVE V3 Coalition - AAL3 - ${var.instance_name}"
    relying_party_id                  = "" # Use default (hostname)
    signature_algorithms              = ["ES256", "RS256"]
    attestation_conveyance_preference = "direct"   # Full attestation for audit
    authenticator_attachment          = "not specified"  # Allows ALL types (platform, cross-platform, hybrid/QR)
    require_resident_key              = "Yes"      # Discoverable credential (AAL3)
    user_verification_requirement     = "required" # Biometric/PIN required (AAL3)
    create_timeout                    = 120        # 2 minutes for QR code flow
    avoid_same_authenticator_register = false
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
  direct_access_grants_enabled = true # Required for custom login & OTP flows (see below)
  service_accounts_enabled     = true

  # URLs - include both localhost (dev) and Cloudflare (prod)
  root_url = var.app_url
  base_url = var.app_url
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

  # Logout configuration - CRITICAL for proper Single Logout (SLO)
  # Without these, logout redirects fail with "Unable to Complete Request"
  frontchannel_logout_enabled = true
  frontchannel_logout_url     = "${var.app_url}/api/auth/logout-callback"
  valid_post_logout_redirect_uris = [
    var.app_url,
    "http://localhost:3000",
    "https://localhost:3000",
  ]

  # Token settings
  access_token_lifespan = "900" # 15 minutes

  # Login settings
  login_theme = var.login_theme

  # ============================================
  # SECURITY: Clearance-Based MFA Enforcement
  # ============================================
  # Override the realm-level browser flow with the Classified Access Browser Flow
  # This enforces:
  #   - AAL2 (OTP/TOTP) for CONFIDENTIAL and SECRET clearance users
  #   - AAL3 (WebAuthn) for TOP_SECRET clearance users
  # LESSON LEARNED (2025-11-25): Without this, SECRET users bypass MFA!
  dynamic "authentication_flow_binding_overrides" {
    for_each = var.browser_flow_override_id != null ? [1] : []
    content {
      browser_id = var.browser_flow_override_id
    }
  }
}

# ============================================================================
# PROTOCOL MAPPERS - Add custom claims to tokens
# ============================================================================

# Clearance level mapper
resource "keycloak_openid_user_attribute_protocol_mapper" "clearance" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.broker_client.id
  name      = "clearance"

  user_attribute      = "clearance"
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

  user_attribute      = "countryOfAffiliation"
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

  user_attribute      = "uniqueID"
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

  user_attribute      = "acpCOI"
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

  user_attribute      = "organization"
  claim_name          = "organization"
  claim_value_type    = "String"
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# ============================================
# Organization Type Mapper (Industry Access Control)
# ============================================
# ACP-240 Section 4.2: Organization type attribute for industry access control
# Values: GOV | MIL | INDUSTRY
# Default: GOV (if not set, OPA policy defaults to GOV)
resource "keycloak_openid_user_attribute_protocol_mapper" "organization_type" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.broker_client.id
  name      = "organizationType"

  user_attribute      = "organizationType"
  claim_name          = "organizationType"
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
  access_token_lifespan = "300" # 5 minutes for federation tokens
}

# Protocol mappers for incoming federation clients
resource "keycloak_openid_user_attribute_protocol_mapper" "federation_clearance" {
  for_each = var.federation_partners

  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.incoming_federation[each.key].id
  name      = "clearance"

  user_attribute      = "clearance"
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

  user_attribute      = "countryOfAffiliation"
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

  user_attribute      = "uniqueID"
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

  user_attribute      = "acpCOI"
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

  user_attribute      = "organization"
  claim_name          = "organization"
  claim_value_type    = "String"
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

