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

  # Phase 3B FIX: Frontend URL ensures consistent issuer regardless of access method
  # This prevents token refresh failures when internal Docker access uses different port
  # than external Cloudflare tunnel access (e.g., keycloak:8443 vs usa-idp.dive25.com)
  # CRITICAL: SameSite=None required for cross-origin federation (different Keycloak ports)
  attributes = {
    frontendUrl = var.idp_url
    # ACR-LoA mapping for NIST AAL levels
    # Maps numeric ACR values from WebAuthn/OTP authenticators to LoA levels
    # WebAuthn authenticator sets acr_level: "3" (AAL3)
    # OTP authenticator sets acr_level: "2" (AAL2)
    # Password-only authentication defaults to LoA 1 (AAL1)
    "acr.loa.map" = jsonencode({
      "1"                = 1 # AAL1: Password only
      "2"                = 2 # AAL2: Password + OTP/SMS
      "3"                = 3 # AAL3: Password + WebAuthn/hardware key
      "urn:dive25:aal:1" = 1
      "urn:dive25:aal:2" = 2
      "urn:dive25:aal:3" = 3
    })
    # SameSite cookie fix for federation across different Keycloak instances
    # Without this, cookies are blocked when Hub (localhost:8443) redirects to Spoke (localhost:8453)
    "_browser-header-content-security-policy" = "frame-src 'self'; frame-ancestors 'self'; object-src 'none';"
    webAuthnPolicyRpEntityName                = "DIVE V3 - ${var.instance_name}"
    # CRITICAL: Legacy SameSite attribute (Keycloak < 24)
    # Allows cookies to be sent in cross-origin requests (federation)
    oauth2DeviceCodeLifespan        = "600"
    oauth2DevicePollingInterval     = "5"
    clientSessionIdleTimeout        = "0"
    clientSessionMaxLifespan        = "0"
    clientOfflineSessionIdleTimeout = "0"
    clientOfflineSessionMaxLifespan = "0"
  }

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
    "length(16)",         # Minimum 16 characters
    "upperCase(1)",       # At least 1 uppercase
    "lowerCase(1)",       # At least 1 lowercase
    "digits(1)",          # At least 1 digit
    "specialChars(1)",    # At least 1 special char
    "notUsername()",      # Cannot contain username
    "notEmail()",         # Cannot contain email
    "passwordHistory(5)", # Cannot reuse last 5 passwords
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
  #
  # CRITICAL: relying_party_id MUST be set to the parent domain (e.g., "dive25.com")
  # for production. Empty string ("") only works for localhost and will cause
  # "Your device can't be used with this site" errors on subdomains like
  # usa-idp.dive25.com, fra-idp.dive25.com, etc.
  #
  # Reference: https://www.keycloak.org/docs/latest/server_admin/#webauthn_server_administration_guide
  # "The ID must be the origin's effective domain"
  web_authn_policy {
    relying_party_entity_name         = "DIVE V3 Coalition Platform"
    relying_party_id                  = var.webauthn_rp_id
    signature_algorithms              = ["ES256", "RS256"]
    attestation_conveyance_preference = "none"          # Allow passkeys without attestation (most compatible)
    authenticator_attachment          = "not specified" # Allows all types (platform, cross-platform, hybrid/QR)
    require_resident_key              = "No"            # Server-side credential storage OK
    user_verification_requirement     = "required"
    create_timeout                    = 60 # 60 seconds to complete
    avoid_same_authenticator_register = false
  }

  # ============================================================================
  # WebAuthn Passwordless Policy (AAL3 - TOP_SECRET)
  # ============================================================================
  # NIST SP 800-63B AAL3 compliant policy for TOP_SECRET users
  # Allows: Hardware keys (YubiKey), Platform (TouchID), AND QR code/Hybrid flow
  #
  # Key Settings:
  # - relying_party_id = var.webauthn_rp_id → Parent domain for all subdomains
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
    relying_party_entity_name         = "DIVE V3 Coalition Platform"
    relying_party_id                  = var.webauthn_rp_id
    signature_algorithms              = ["ES256", "RS256"]
    attestation_conveyance_preference = "none"          # Allow passkeys without attestation (most compatible)
    authenticator_attachment          = "not specified" # Allows ALL types (platform, cross-platform, hybrid/QR)
    require_resident_key              = "Yes"           # Discoverable credential (AAL3)
    user_verification_requirement     = "required"      # Biometric/PIN required (AAL3)
    create_timeout                    = 120             # 2 minutes for QR code flow
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

  # CLIENT SECRET from GCP Secret Manager
  # CRITICAL: This ensures Terraform uses the same secret as Docker Compose
  # Without this, Keycloak generates a random secret that doesn't match GCP
  client_secret = var.client_secret

  # URLs - HTTPS only for security
  root_url = var.app_url
  base_url = var.app_url
  valid_redirect_uris = concat(
    [
      "${var.app_url}/*",
      "https://localhost:3000/*",
      "https://localhost:4000/*", # Backend API callbacks
      "https://localhost:8443/*", # Keycloak callbacks
    ],
    # Port-offset URLs for local development (if specified)
    var.local_frontend_port != null ? [
      "https://localhost:${var.local_frontend_port}/*",
      "https://localhost:${var.local_frontend_port}/api/auth/callback/keycloak",
    ] : [],
    var.local_keycloak_port != null ? [
      "https://localhost:${var.local_keycloak_port}/*",
    ] : []
  )
  web_origins = concat(
    [
      var.app_url,
      var.api_url,
      "https://localhost:3000",
      "https://localhost:4000",
      "https://localhost:8443",
    ],
    var.local_frontend_port != null ? ["https://localhost:${var.local_frontend_port}"] : [],
    var.local_keycloak_port != null ? ["https://localhost:${var.local_keycloak_port}"] : []
  )

  # Logout configuration - CRITICAL for proper Single Logout (SLO)
  # Without these, logout redirects fail with "Unable to Complete Request"
  # SECURITY: HTTPS only - no HTTP allowed
  frontchannel_logout_enabled = true
  frontchannel_logout_url     = "${var.app_url}/api/auth/logout-callback"
  valid_post_logout_redirect_uris = concat(
    [
      var.app_url,
      "https://localhost:3000",
      "https://localhost:4000",
      "https://localhost:8443",
    ],
    var.local_frontend_port != null ? ["https://localhost:${var.local_frontend_port}"] : [],
    var.local_keycloak_port != null ? ["https://localhost:${var.local_keycloak_port}"] : []
  )

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
# CRITICAL: multivalued MUST be true - users can have multiple COIs
# Example: admin-fra has ["NATO-COSMIC", "FVEY", "FIVE_EYES"]
resource "keycloak_openid_user_attribute_protocol_mapper" "acp_coi" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.broker_client.id
  name      = "acpCOI"

  user_attribute      = "acpCOI"
  claim_name          = "acpCOI"
  claim_value_type    = "String" # FIX: Use String (not JSON) - multivalued=true handles array
  multivalued         = true     # MUST be true for array values
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

# Realm roles mapper - ensures realm_access.roles is present in tokens
resource "keycloak_openid_user_realm_role_protocol_mapper" "realm_roles" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.broker_client.id
  name      = "realm roles"

  claim_name          = "realm_access.roles"
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
  multivalued         = true
}

# ============================================
# ACR/AMR MAPPERS (Keycloak 26.4 Native)
# ============================================
# SSOT Note (v3.1.0): AMR/ACR Mapper Configuration
# =================================================
# ACR: Uses native oidc-acr-mapper (works with LoA conditional authenticator)
# AMR: Uses user attribute mapper (workaround for Keycloak 26 limitation)
#
# The native oidc-amr-mapper was found to NOT populate AMR claims because
# standard authenticators (auth-username-password-form, auth-otp-form) don't
# expose "reference" config properties in Keycloak 26.4.2.
#
# WORKAROUND: Store AMR as user attribute, set during:
# 1. User seeding (./dive seed sets amr=["pwd","otp"] for OTP users)
# 2. OTP credential setup (future: event listener)
#
# This ensures OPA policies can verify MFA via amr claim checks.

resource "keycloak_openid_user_session_note_protocol_mapper" "auth_time" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.broker_client.id
  name      = "auth_time"

  session_note        = "auth_time"
  claim_name          = "auth_time"
  claim_value_type    = "String"
  add_to_id_token     = true
  add_to_access_token = true
}

# AMR Mapper - Using DIVE custom mapper (ACR-derived)
# ============================================
# CRITICAL FIX (January 2026):
# The native oidc-amr-mapper does NOT work in Keycloak 26 because:
# 1. It reads "reference" config from authenticator execution configs
# 2. auth-username-password-form has configurable=false (cannot set reference)
# 3. Therefore "pwd" is never added to AMR, resulting in amr: []
#
# Solution: Use DIVE's custom dive-amr-protocol-mapper which DERIVES AMR from ACR:
# - ACR "1" → AMR ["pwd"]           (AAL1: password only)
# - ACR "2" → AMR ["pwd", "otp"]    (AAL2: password + OTP)
# - ACR "3" → AMR ["pwd", "hwk"]    (AAL3: password + WebAuthn)
#
# The ACR is correctly set by the oidc-acr-mapper reading from acr.loa.map
# and LoA conditional authenticators in the authentication flow.
#
# Requires: dive-keycloak-extensions.jar in /opt/keycloak/providers/
resource "keycloak_generic_protocol_mapper" "amr_mapper" {
  realm_id        = keycloak_realm.broker.id
  client_id       = keycloak_openid_client.broker_client.id
  name            = "amr (ACR-derived)"
  protocol        = "openid-connect"
  protocol_mapper = "dive-amr-protocol-mapper"

  config = {
    "id.token.claim"     = "true"
    "access.token.claim" = "true"
    "userinfo.token.claim" = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "acr_mapper" {
  realm_id        = keycloak_realm.broker.id
  client_id       = keycloak_openid_client.broker_client.id
  name            = "acr (authn context)"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-acr-mapper"

  config = {
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
    "claim.name"           = "acr"
  }
}

# =============================================================================
# FEDERATED ACR/AMR ATTRIBUTE MAPPERS - DEPRECATED (Jan 2026)
# =============================================================================
# REMOVED: User-attribute-based fallback mappers are no longer needed.
# Reason: Native oidc-acr-mapper and oidc-amr-mapper handle all cases correctly.
# See: acr-amr-session-mappers.tf for the new SSOT implementation.
#
# The following resources have been removed:
# - keycloak_openid_user_attribute_protocol_mapper.federated_acr_mapper
# - keycloak_openid_user_attribute_protocol_mapper.federated_amr_mapper

resource "keycloak_openid_client_default_scopes" "broker_client_defaults" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.broker_client.id

  default_scopes = [
    "profile",
    "email",
    "roles",
    "web-origins",
  ]
}

# ============================================================================
# INCOMING FEDERATION CLIENTS
# ============================================================================
# Create clients for partner instances to federate TO this instance
# When USA wants to federate to FRA, FRA needs a client called "dive-v3-broker-usa"
#
# CLIENT SECRET MANAGEMENT:
# The client_secret is sourced from GCP Secret Manager via incoming_federation_secrets variable.
# GCP naming: dive-v3-federation-{this_instance}-{partner}
# Example: FRA creates "dive-v3-broker-usa" client, uses dive-v3-federation-fra-usa

resource "keycloak_openid_client" "incoming_federation" {
  for_each = var.federation_partners

  realm_id = keycloak_realm.broker.id
  # CRITICAL: Match the naming pattern used by federation-link.sh (_federation_link_direct)
  # Pattern: dive-v3-broker-{partner} (NOT dive-v3-{partner}-federation)
  # Example: When USA federates to FRA, FRA has client "dive-v3-broker-usa"
  client_id = "dive-v3-broker-${lower(each.value.instance_code)}"
  name      = "${each.value.instance_name} Federation Client"
  enabled   = each.value.enabled

  # Client settings for federation
  access_type                  = "CONFIDENTIAL"
  standard_flow_enabled        = true
  implicit_flow_enabled        = false
  direct_access_grants_enabled = false
  service_accounts_enabled     = false

  # CLIENT SECRET from GCP Secret Manager
  # Use the secret from incoming_federation_secrets if provided, otherwise let Keycloak generate
  # GCP secret name: dive-v3-federation-{this_instance}-{partner}
  client_secret = lookup(var.incoming_federation_secrets, each.key, null)

  # URLs - redirect back to the partner's Keycloak
  # CRITICAL: Use partner's realm name (dive-v3-broker-{partner_code}), not generic dive-v3-broker
  valid_redirect_uris = [
    "${each.value.idp_url}/realms/dive-v3-broker-${lower(each.value.instance_code)}/broker/${lower(var.instance_code)}-idp/endpoint",
    "${each.value.idp_url}/realms/dive-v3-broker-${lower(each.value.instance_code)}/broker/${lower(var.instance_code)}-idp/endpoint/*",
  ]
  web_origins = [
    each.value.idp_url,
  ]

  # Token settings
  access_token_lifespan = "300" # 5 minutes for federation tokens

  # Lifecycle: ignore changes to client_secret if managed externally
  # This prevents Terraform from overwriting secrets set via sync scripts
  lifecycle {
    ignore_changes = [
      # Only ignore if you want sync scripts to manage secrets post-Terraform
      # Comment out to have Terraform fully manage secrets
      # client_secret,
    ]
  }
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

# ============================================================================
# SUPER ADMIN ROLE & USER
# ============================================================================

resource "keycloak_role" "super_admin" {
  realm_id    = keycloak_realm.broker.id
  name        = "super_admin"
  description = "Super admin role for DIVE V3 administrative operations"
}

# Dedicated group to keep super_admin assignment sticky across imports/restores
resource "keycloak_group" "super_admins" {
  realm_id = keycloak_realm.broker.id
  name     = "super_admins"
}

resource "keycloak_group_roles" "super_admins_role" {
  realm_id = keycloak_realm.broker.id
  group_id = keycloak_group.super_admins.id
  role_ids = [keycloak_role.super_admin.id]
}

locals {
  admin_password = coalesce(var.admin_user_password, var.test_user_password)
}

# Admin user - only created if create_test_users is true (to avoid conflict with seed-users.sh)
resource "keycloak_user" "admin_user" {
  count = var.create_test_users ? 1 : 0

  realm_id   = keycloak_realm.broker.id
  username   = "admin-${lower(var.instance_code)}"
  enabled    = true
  email      = "admin-${lower(var.instance_code)}@dive-demo.example"
  first_name = "Admin"
  last_name  = upper(var.instance_code)

  initial_password {
    value     = local.admin_password
    temporary = false
  }

  attributes = {
    uniqueID             = "admin-${lower(var.instance_code)}"
    countryOfAffiliation = var.instance_code
    clearance            = "TOP_SECRET"
    clearance_level      = "4"
    # Keep admin aligned with L4 users for policy evaluation
    acpCOI           = jsonencode(["FVEY", "NATO-COSMIC"])
    organization     = "${var.instance_name} Admin"
    organizationType = "GOV"
    userType         = "admin"
    pilot_user       = "true"
    created_by       = "terraform"
  }

  lifecycle {
    ignore_changes = [initial_password]
  }
}

resource "keycloak_user_roles" "admin_user_super_admin" {
  count = var.create_test_users ? 1 : 0

  realm_id = keycloak_realm.broker.id
  user_id  = keycloak_user.admin_user[0].id
  role_ids = [
    keycloak_role.super_admin.id,
  ]
}

resource "keycloak_group_memberships" "admin_user_super_admin_group" {
  count = var.create_test_users ? 1 : 0

  realm_id = keycloak_realm.broker.id
  group_id = keycloak_group.super_admins.id

  members = [
    keycloak_user.admin_user[0].username,
  ]
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

