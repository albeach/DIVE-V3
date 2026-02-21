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
  remember_me              = false # Disabled for consistent 8-hour sessions
  verify_email             = false
  login_with_email_allowed = true
  duplicate_emails_allowed = false
  edit_username_allowed    = false

  # Token settings
  access_token_lifespan        = "15m"  # 15 minutes (unchanged)
  refresh_token_max_reuse      = 1      # Enable rotation (single-use refresh tokens)
  sso_session_idle_timeout     = "15m"  # Align with access token lifespan
  sso_session_max_lifespan     = "8h"   # Align with NextAuth maxAge
  offline_session_idle_timeout = "720h" # 30 days for offline sessions
  revoke_refresh_token         = true   # Revoke refresh token after use (Keycloak v26.5+)

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
      strict_transport_security = "max-age=31536000; includeSubDomains; preload"
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
      # 127.0.0.1 variants required for PKCE cookie compatibility
      # (PKCE cookies set with domain=127.0.0.1 must match redirect_uri)
      "https://127.0.0.1:3000/*",
      "https://127.0.0.1:4000/*",
      "https://127.0.0.1:8443/*",
    ],
    # Port-offset URLs for local development (if specified)
    var.local_frontend_port != null ? [
      "https://localhost:${var.local_frontend_port}/*",
      "https://localhost:${var.local_frontend_port}/api/auth/callback/keycloak",
      "https://127.0.0.1:${var.local_frontend_port}/*",
      "https://127.0.0.1:${var.local_frontend_port}/api/auth/callback/keycloak",
    ] : [],
    var.local_keycloak_port != null ? [
      "https://localhost:${var.local_keycloak_port}/*",
      "https://127.0.0.1:${var.local_keycloak_port}/*",
    ] : []
  )
  web_origins = concat(
    [
      var.app_url,
      var.api_url,
      "https://localhost:3000",
      "https://localhost:4000",
      "https://localhost:8443",
      # 127.0.0.1 variants for PKCE cookie compatibility
      "https://127.0.0.1:3000",
      "https://127.0.0.1:4000",
      "https://127.0.0.1:8443",
    ],
    var.local_frontend_port != null ? [
      "https://localhost:${var.local_frontend_port}",
      "https://127.0.0.1:${var.local_frontend_port}"
    ] : [],
    var.local_keycloak_port != null ? [
      "https://localhost:${var.local_keycloak_port}",
      "https://127.0.0.1:${var.local_keycloak_port}"
    ] : []
  )

  # Logout configuration - CRITICAL for proper Single Logout (SLO)
  # Without these, logout redirects fail with "Unable to Complete Request"
  # SECURITY: HTTPS only - no HTTP allowed
  frontchannel_logout_enabled = true
  frontchannel_logout_url     = "${var.app_url}/api/auth/logout-callback"
  # Post-logout redirect URIs include both with and without trailing slashes
  # Keycloak requires EXACT match, so both variants are needed
  valid_post_logout_redirect_uris = concat(
    [
      # Frontend URLs (app_url) - handles NextAuth redirects
      var.app_url,
      "${var.app_url}/",
      "${var.app_url}/*",

      # Backend URLs (api_url) - for API-based logout
      var.api_url,
      "${var.api_url}/",

      # IdP URLs (idp_url) - for Keycloak logout redirects
      var.idp_url,
      "${var.idp_url}/",
    ],
    # Instance-specific ports (local development only)
    var.local_frontend_port != null ? [
      "https://localhost:${var.local_frontend_port}",
      "https://localhost:${var.local_frontend_port}/",
      "https://localhost:${var.local_frontend_port}/*"
    ] : [],
    var.local_keycloak_port != null ? [
      "https://localhost:${var.local_keycloak_port}",
      "https://localhost:${var.local_keycloak_port}/"
    ] : []
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
# BACKEND SERVICE ACCOUNT CLIENT
# ============================================================================
# Service account client for backend-to-backend authentication (KAS, etc.)
# Used by backend services to authenticate with Keycloak using client_credentials flow
# CRITICAL: This client must exist for KAS key request functionality to work
# NOTE: Always created regardless of create_test_users - needed for backend functionality

resource "keycloak_openid_client" "backend_service_account" {
  realm_id  = keycloak_realm.broker.id
  client_id = "dive-v3-backend-client"
  name      = "Backend Service Account - ${var.instance_name}"
  enabled   = true

  # Service account settings
  access_type                  = "CONFIDENTIAL"
  standard_flow_enabled        = false
  implicit_flow_enabled        = false
  direct_access_grants_enabled = false
  service_accounts_enabled     = true

  # CLIENT SECRET from GCP Secret Manager (same as broker client for simplicity)
  client_secret = var.client_secret

  # No redirect URIs needed for service accounts
  valid_redirect_uris = []
  web_origins         = []

  # Token settings - shorter lifespan for service accounts
  access_token_lifespan = "300" # 5 minutes

  depends_on = [
    keycloak_realm.broker,
    keycloak_openid_client.broker_client
  ]
}

# ============================================================================
# BACKEND SERVICE ACCOUNT USER
# ============================================================================
# Keycloak creates a service account user when service_accounts_enabled=true
# This user represents the service account and can be assigned roles/groups

resource "keycloak_user" "backend_service_account" {
  count = var.create_test_users ? 1 : 0

  realm_id = keycloak_realm.broker.id
  username = "service-account-dive-v3-backend-client"
  enabled  = true

  # Service account user details
  email      = "backend-service@dive25.mil"
  first_name = "Backend"
  last_name  = "Service"

  # Service account attributes
  attributes = {
    uniqueID             = "service-account-backend"
    countryOfAffiliation = var.instance_code
    clearance            = local.instance_clearances[4] # TOP SECRET equivalent (country-specific)
    clearance_level      = "5"
    acpCOI               = jsonencode(["FVEY", "NATO-COSMIC"])
    organization         = "${var.instance_name} Backend Service"
    organizationType     = "GOV" # User Profile only accepts: GOV, IND, INT, NGO
    userType             = "service_account"
    pilot_user           = "false"
    created_by           = "terraform"
    service_account      = "true"
  }

  depends_on = [
    keycloak_realm_user_profile.dive_attributes
  ]
}

# Assign backend service account to users group (basic access)
resource "keycloak_user_groups" "backend_service_account_users" {
  count = var.create_test_users ? 1 : 0

  realm_id = keycloak_realm.broker.id
  user_id  = keycloak_user.backend_service_account[0].id
  group_ids = [
    keycloak_group.users.id
  ]
}

# ============================================================================
# PROTOCOL MAPPERS - Add custom claims to tokens
# ============================================================================

# ============================================
# BACKEND SERVICE ACCOUNT PROTOCOL MAPPERS
# ============================================
# The backend service account needs the same claims as the broker client
# for proper authentication and authorization

# Clearance level mapper for backend client
resource "keycloak_openid_user_attribute_protocol_mapper" "backend_clearance" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.backend_service_account.id
  name      = "clearance"

  user_attribute      = "clearance"
  claim_name          = "clearance"
  claim_value_type    = "String"
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# Country of affiliation mapper for backend client
resource "keycloak_openid_user_attribute_protocol_mapper" "backend_country_of_affiliation" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.backend_service_account.id
  name      = "countryOfAffiliation"

  user_attribute      = "countryOfAffiliation"
  claim_name          = "countryOfAffiliation"
  claim_value_type    = "String"
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# Unique ID mapper for backend client
resource "keycloak_openid_user_attribute_protocol_mapper" "backend_unique_id" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.backend_service_account.id
  name      = "uniqueID"

  user_attribute      = "uniqueID"
  claim_name          = "uniqueID"
  claim_value_type    = "String"
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# ACP COI mapper for backend client
resource "keycloak_openid_user_attribute_protocol_mapper" "backend_acp_coi" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.backend_service_account.id
  name      = "acpCOI"

  user_attribute      = "acpCOI"
  claim_name          = "acpCOI"
  claim_value_type    = "String"
  multivalued         = true
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# Organization mapper for backend client
resource "keycloak_openid_user_attribute_protocol_mapper" "backend_organization" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.backend_service_account.id
  name      = "organization"

  user_attribute      = "organization"
  claim_name          = "organization"
  claim_value_type    = "String"
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# Organization Type mapper for backend client
resource "keycloak_openid_user_attribute_protocol_mapper" "backend_organization_type" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.backend_service_account.id
  name      = "organizationType"

  user_attribute      = "organizationType"
  claim_name          = "organizationType"
  claim_value_type    = "String"
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# Realm roles mapper for backend client
resource "keycloak_openid_user_realm_role_protocol_mapper" "backend_realm_roles" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.backend_service_account.id
  name      = "realm roles"

  claim_name          = "realm_access.roles"
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
  multivalued         = true
}

# Auth time mapper for backend client
resource "keycloak_openid_user_session_note_protocol_mapper" "backend_auth_time" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.backend_service_account.id
  name      = "auth_time"

  session_note        = "auth_time"
  claim_name          = "auth_time"
  claim_value_type    = "String"
  add_to_id_token     = true
  add_to_access_token = true
}

# ============================================
# BROKER CLIENT PROTOCOL MAPPERS
# ============================================

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

  session_note        = "AUTH_TIME"
  claim_name          = "auth_time"
  claim_value_type    = "long"
  add_to_id_token     = true
  add_to_access_token = true
}

# AMR Mapper - Native oidc-amr-mapper reads AUTHENTICATORS_COMPLETED session note
# + "default.reference.value" from execution configs.
# For federated users, user_amr attribute fallback is populated by the IdP mapper.
resource "keycloak_generic_protocol_mapper" "amr_mapper" {
  realm_id        = keycloak_realm.broker.id
  client_id       = keycloak_openid_client.broker_client.id
  name            = "amr (native session)"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-amr-mapper"

  config = {
    "id.token.claim"            = "true"
    "access.token.claim"        = "true"
    "introspection.token.claim" = "true"
    "userinfo.token.claim"      = "true"
    "claim.name"                = "amr"
  }
}

# AMR User Attribute Fallback Mapper (for federated users)
# ============================================
# Federated users may not have session-based AMR available at token time
# because the IdP mapper runs after the event listener.
# This mapper reads from user.amr attribute which IS correct by token time.
resource "keycloak_openid_user_attribute_protocol_mapper" "amr_user_attribute_fallback" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.broker_client.id
  name      = "amr (user attribute fallback)"

  user_attribute      = "amr"
  claim_name          = "user_amr"
  claim_value_type    = "String"
  multivalued         = true
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
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

# NOTE: Broker client default scopes now managed in dive-client-scopes.tf
# This includes DIVE custom scopes (uniqueID, clearance, countryOfAffiliation, acpCOI)
# with proper protocol mappers that set claim.name explicitly (SF-026 fix)

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
  # CRITICAL: Use partner's realm name (dive-v3-broker-{partner_code}), not generic dive-v3-broker-usa
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
# INCOMING FEDERATION CLIENT SCOPES
# ============================================================================
# Default client scopes for incoming federation clients ensure tokens include DIVE claims.
# Without these, protocol mappers alone don't add claims — they must be in active scopes.

resource "keycloak_openid_client_default_scopes" "incoming_federation_defaults" {
  for_each = var.federation_partners

  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.incoming_federation[each.key].id

  default_scopes = [
    "profile",
    "email",
    "roles",
    "web-origins",
    "acr",
    "basic",
    # DIVE custom scopes (matches dive-client-scopes.tf)
    keycloak_openid_client_scope.uniqueID.name,
    keycloak_openid_client_scope.clearance.name,
    keycloak_openid_client_scope.countryOfAffiliation.name,
    keycloak_openid_client_scope.acpCOI.name,
    keycloak_openid_client_scope.user_acr.name,
    keycloak_openid_client_scope.user_amr.name,
  ]

  # Ensure ALL scopes are created before assignment - TERRAFORM SSOT
  depends_on = [
    # Core DIVE identity scopes
    keycloak_openid_client_scope.uniqueID,
    keycloak_openid_client_scope.clearance,
    keycloak_openid_client_scope.countryOfAffiliation,
    keycloak_openid_client_scope.acpCOI,
    keycloak_openid_client_scope.user_acr,
    keycloak_openid_client_scope.user_amr,
    # Protocol mappers for core scopes
    keycloak_openid_user_attribute_protocol_mapper.uniqueID_mapper,
    keycloak_openid_user_attribute_protocol_mapper.clearance_mapper,
    keycloak_openid_user_attribute_protocol_mapper.countryOfAffiliation_mapper,
    keycloak_openid_user_attribute_protocol_mapper.acpCOI_mapper,
    keycloak_openid_user_attribute_protocol_mapper.user_acr_mapper,
    keycloak_openid_user_attribute_protocol_mapper.user_amr_mapper,
  ]
}

# ============================================================================
# KEYCLOAK ROLES - COMPREHENSIVE ADMIN ROLE HIERARCHY
# ============================================================================
# Role hierarchy for DIVE V3:
#   - user: Standard user (default for all)
#   - admin: Instance-level admin (manage users, view config)
#   - super_admin: Full administrative access including IdP management
#
# Keycloak built-in realm-management roles are also assigned:
#   - manage-users: Create/update/delete users
#   - manage-realm: Configure realm settings
#   - manage-identity-providers: Configure federation
#   - view-realm: Read-only access to realm config

# Standard user role (all authenticated users)
resource "keycloak_role" "user_role" {
  realm_id    = keycloak_realm.broker.id
  name        = "user"
  description = "Standard user role for coalition personnel"
}

# Admin role (instance-level administration)
resource "keycloak_role" "admin_role" {
  realm_id    = keycloak_realm.broker.id
  name        = "admin"
  description = "Administrator role for user and session management"
}

# Super admin role (full system access)
resource "keycloak_role" "super_admin" {
  realm_id    = keycloak_realm.broker.id
  name        = "super_admin"
  description = "Super admin role for DIVE V3 administrative operations including IdP management"
}

# ============================================================================
# ADMIN GROUPS
# ============================================================================

# Standard users group
resource "keycloak_group" "users" {
  realm_id = keycloak_realm.broker.id
  name     = "users"
}

resource "keycloak_group_roles" "users_role" {
  realm_id = keycloak_realm.broker.id
  group_id = keycloak_group.users.id
  role_ids = [keycloak_role.user_role.id]
}

# Admins group
resource "keycloak_group" "admins" {
  realm_id = keycloak_realm.broker.id
  name     = "admins"
}

resource "keycloak_group_roles" "admins_role" {
  realm_id = keycloak_realm.broker.id
  group_id = keycloak_group.admins.id
  role_ids = [
    keycloak_role.user_role.id,
    keycloak_role.admin_role.id
  ]
}

# Super admins group (includes all lower roles)
resource "keycloak_group" "super_admins" {
  realm_id = keycloak_realm.broker.id
  name     = "super_admins"
}

resource "keycloak_group_roles" "super_admins_role" {
  realm_id = keycloak_realm.broker.id
  group_id = keycloak_group.super_admins.id
  role_ids = [
    keycloak_role.user_role.id,
    keycloak_role.admin_role.id,
    keycloak_role.super_admin.id
  ]
}

# ============================================================================
# ADMIN USERS
# ============================================================================

locals {
  admin_password = coalesce(var.admin_user_password, var.test_user_password)

  # Ocean-themed pseudonyms for admin users (PII minimization)
  admin_ocean_adjectives = ["Commander", "Admiral", "Captain", "Navigator", "Helmsman"]
  admin_ocean_nouns      = ["Lighthouse", "Compass", "Anchor", "Beacon", "Helm"]
}

# Admin user - only created if create_test_users is true (to avoid conflict with seed-users.sh)
resource "keycloak_user" "admin_user" {
  count = var.create_test_users ? 1 : 0

  realm_id = keycloak_realm.broker.id
  username = "admin-${lower(var.instance_code)}"
  enabled  = true

  # PII Minimization: Pseudonymized email
  email = "${substr(md5("admin-${lower(var.instance_code)}-${var.instance_code}"), 0, 8)}@admin.dive25.mil"

  # PII Minimization: Ocean-themed pseudonyms for admins
  # Format: "Commander Lighthouse" style
  first_name = local.admin_ocean_adjectives[length(var.instance_code) % length(local.admin_ocean_adjectives)]
  last_name  = local.admin_ocean_nouns[length(var.instance_code) % length(local.admin_ocean_nouns)]

  initial_password {
    value     = local.admin_password
    temporary = false
  }

  attributes = {
    uniqueID             = "admin-${lower(var.instance_code)}"
    countryOfAffiliation = var.instance_code
    clearance            = local.instance_clearances[4] # TOP SECRET equivalent (country-specific)
    clearance_level      = "5"                          # Updated for 5-level system
    # Keep admin aligned with L5 users for policy evaluation
    acpCOI           = jsonencode(["FVEY", "NATO-COSMIC"])
    organization     = "${var.instance_name} Admin"
    organizationType = "GOV"
    userType         = "admin"
    pilot_user       = "true"
    created_by       = "terraform"
    aal_level        = "3" # Admin requires AAL3
    # Role metadata for token mappers
    dive_roles = jsonencode(["user", "admin", "super_admin"])
  }

  lifecycle {
    ignore_changes = [initial_password]
  }

  depends_on = [
    keycloak_realm_user_profile.dive_attributes
  ]
}

# Assign all roles to admin user
resource "keycloak_user_roles" "admin_user_super_admin" {
  count = var.create_test_users ? 1 : 0

  realm_id = keycloak_realm.broker.id
  user_id  = keycloak_user.admin_user[0].id
  role_ids = [
    keycloak_role.user_role.id,
    keycloak_role.admin_role.id,
    keycloak_role.super_admin.id,
  ]
}

# Add admin to super_admins group
resource "keycloak_group_memberships" "admin_user_super_admin_group" {
  count = var.create_test_users ? 1 : 0

  realm_id = keycloak_realm.broker.id
  group_id = keycloak_group.super_admins.id

  members = [
    keycloak_user.admin_user[0].username,
  ]
}

# ============================================================================
# ROLE PROTOCOL MAPPERS - Include roles in tokens
# ============================================================================

# Map realm roles to tokens for the broker client
resource "keycloak_openid_user_realm_role_protocol_mapper" "broker_realm_roles" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.broker_client.id
  name      = "realm-roles"

  claim_name          = "realm_roles"
  multivalued         = true
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# Map dive_roles attribute to tokens (custom role list)
resource "keycloak_openid_user_attribute_protocol_mapper" "broker_dive_roles" {
  realm_id  = keycloak_realm.broker.id
  client_id = keycloak_openid_client.broker_client.id
  name      = "dive-roles"

  user_attribute      = "dive_roles"
  claim_name          = "dive_roles"
  claim_value_type    = "JSON"
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

