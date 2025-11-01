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

  # Custom DIVE V3 Theme (Option 3: Full UI Customization)
  login_theme = "dive-v3"

  # Internationalization for custom theme
  internationalization {
    supported_locales = ["en", "fr"]
    default_locale    = "en"
  }

  # Token lifetimes (AAL2 compliant - NIST SP 800-63B)
  # Broker realm: Used by admin-dive super admin for management console
  # Allow reasonable session for admin work (not enforcing 1s like national realms)
  access_token_lifespan = "15m" # Access token (aligns with NextAuth session)

  # Broker realm sessions: Allow normal sessions for super admin
  # MFA is still enforced via authentication flow, but sessions can persist
  sso_session_idle_timeout = "30m" # SSO idle: 30 minutes
  sso_session_max_lifespan = "8h"  # Max session: 8 hours

  offline_session_idle_timeout = "720h"  # Offline token (30 days - for refresh)
  offline_session_max_lifespan = "1440h" # Offline max (60 days)

  # OTP Policy (AAL2 MFA Enforcement)
  otp_policy {
    algorithm         = "HmacSHA256"
    digits            = 6
    period            = 30
    type              = "totp"
    look_ahead_window = 1
  }

  # Brute-force detection (balanced for MFA setup attempts)
  security_defenses {
    brute_force_detection {
      max_login_failures         = 8 # Increased for MFA setup attempts
      wait_increment_seconds     = 60
      max_failure_wait_seconds   = 300  # Reduced from 900 to 5 minutes
      failure_reset_time_seconds = 3600 # Reduced from 12 hours to 1 hour
    }
    headers {
      x_frame_options           = "DENY"
      content_security_policy   = "frame-src 'none'; frame-ancestors 'none'; object-src 'none';"
      x_content_type_options    = "nosniff"
      strict_transport_security = "max-age=31536000; includeSubDomains; preload"
    }
  }

  ssl_required = "none" # Development: Allow HTTP
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
  direct_access_grants_enabled = true # Required for custom login form
  service_accounts_enabled     = false

  # Use same client secret as original dive-v3-client for consistency
  client_secret = "8AcfbgtdNIZp3tbrcmc2voiUfxNb8d6L"

  root_url = var.app_url
  base_url = var.app_url

  valid_redirect_uris = [
    "${var.app_url}/*",
    "${var.app_url}/dashboard",
    "${var.app_url}/api/auth/callback/keycloak",
    "https://localhost:3000/*",
    "https://localhost:3000/dashboard"
  ]

  web_origins = [
    var.app_url,
    "https://localhost:3000",
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
    "acr",    # Keycloak 26: ACR/AMR support via built-in oidc-acr-mapper
    "basic",  # Keycloak 26: auth_time and sub claims
    keycloak_openid_client_scope.broker_dive_attributes.name
  ]
  # Note: offline_access added to default scopes for admin-dive user login
  # This allows NextAuth to request refresh tokens for long-lived sessions
}

# ============================================
# Broker Realm Roles (for admin functionality)
# ============================================

resource "keycloak_role" "broker_user" {
  realm_id    = keycloak_realm.dive_v3_broker.id
  name        = "user"
  description = "Standard user role in broker realm"
}

resource "keycloak_role" "broker_admin" {
  realm_id    = keycloak_realm.dive_v3_broker.id
  name        = "admin"
  description = "Administrator role in broker realm"
}

resource "keycloak_role" "broker_super_admin" {
  realm_id    = keycloak_realm.dive_v3_broker.id
  name        = "super_admin"
  description = "Super Administrator role with full system access including IdP management"
}

# Protocol mappers for broker client (to include all DIVE attributes)

# CRITICAL: Audience Mapper - ensures JWT tokens have correct 'aud' claim for backend verification
resource "keycloak_generic_protocol_mapper" "broker_audience" {
  realm_id        = keycloak_realm.dive_v3_broker.id
  client_id       = keycloak_openid_client.dive_v3_app_broker.id
  name            = "audience-mapper"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-audience-mapper"

  config = {
    "included.client.audience"  = "dive-v3-client-broker"
    "id.token.claim"            = "true"
    "access.token.claim"        = "true"
    "introspection.token.claim" = "true"
    "userinfo.token.claim"      = "true"
  }
}

resource "keycloak_generic_protocol_mapper" "broker_uniqueid" {
  realm_id        = keycloak_realm.dive_v3_broker.id
  client_id       = keycloak_openid_client.dive_v3_app_broker.id
  name            = "uniqueID"
  protocol        = "openid-connect"
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
  realm_id        = keycloak_realm.dive_v3_broker.id
  client_id       = keycloak_openid_client.dive_v3_app_broker.id
  name            = "clearance"
  protocol        = "openid-connect"
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
  realm_id        = keycloak_realm.dive_v3_broker.id
  client_id       = keycloak_openid_client.dive_v3_app_broker.id
  name            = "countryOfAffiliation"
  protocol        = "openid-connect"
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
  realm_id        = keycloak_realm.dive_v3_broker.id
  client_id       = keycloak_openid_client.dive_v3_app_broker.id
  name            = "acpCOI"
  protocol        = "openid-connect"
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
  realm_id        = keycloak_realm.dive_v3_broker.id
  client_id       = keycloak_openid_client.dive_v3_app_broker.id
  name            = "dutyOrg"
  protocol        = "openid-connect"
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
  realm_id        = keycloak_realm.dive_v3_broker.id
  client_id       = keycloak_openid_client.dive_v3_app_broker.id
  name            = "orgUnit"
  protocol        = "openid-connect"
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

# Roles mapper for broker realm (includes realm roles in token)
resource "keycloak_generic_protocol_mapper" "broker_roles" {
  realm_id        = keycloak_realm.dive_v3_broker.id
  client_id       = keycloak_openid_client.dive_v3_app_broker.id
  name            = "realm-roles"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-usermodel-realm-role-mapper"

  config = {
    "claim.name"           = "realm_access.roles"
    "jsonType.label"       = "String"
    "multivalued"          = "true"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

# ============================================
# Authentication Context Mappers (AAL/FAL Compliance)
# ============================================
# NIST SP 800-63B/C: Authentication Assurance Level (AAL) and Federation Assurance Level (FAL)
# Reference: docs/IDENTITY-ASSURANCE-LEVELS.md

# Auth time mapper - tracks when user authenticated (required for session management)
resource "keycloak_generic_protocol_mapper" "broker_auth_time" {
  realm_id        = keycloak_realm.dive_v3_broker.id
  client_id       = keycloak_openid_client.dive_v3_app_broker.id
  name            = "auth-time-mapper"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"

  config = {
    "user.session.note"    = "AUTH_TIME"
    "claim.name"           = "auth_time"
    "jsonType.label"       = "long"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "false"
  }
}

# ACR (Authentication Context Class Reference) mapper
# Maps Keycloak's internal ACR session note to token claim
# Keycloak sets this based on authentication flow (AAL1: pwd, AAL2: pwd+otp, AAL3: hardware)
resource "keycloak_generic_protocol_mapper" "broker_acr" {
  realm_id        = keycloak_realm.dive_v3_broker.id
  client_id       = keycloak_openid_client.dive_v3_app_broker.id
  name            = "acr-mapper"
  protocol        = "openid-connect"
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

# AMR (Authentication Methods Reference) mapper
# Maps Keycloak's internal AMR session note to token claim
# Contains array of auth methods: ["pwd"], ["pwd","otp"], ["webauthn"]
resource "keycloak_generic_protocol_mapper" "broker_amr" {
  realm_id        = keycloak_realm.dive_v3_broker.id
  client_id       = keycloak_openid_client.dive_v3_app_broker.id
  name            = "amr-mapper"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"

  config = {
    "user.session.note"    = "AUTH_METHODS_REF"
    "claim.name"           = "amr"
    "jsonType.label"       = "String" # Note: Keycloak stores as JSON string, backend parses it
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "false"
  }
}

# ============================================
# Super Admin User (Direct Broker Login)
# ============================================
# Gap Remediation: Add super_admin user directly in broker realm
# This allows direct login to broker realm without going through federation

resource "keycloak_user" "broker_super_admin" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3_broker.id
  username = "admin-dive"
  enabled  = true

  email      = "admin@dive-v3.pilot"
  first_name = "DIVE"
  last_name  = "Administrator"

  # Super admin attributes - full access
  attributes = {
    uniqueID             = "admin@dive-v3.pilot"
    clearance            = "TOP_SECRET"
    countryOfAffiliation = "USA"
    acpCOI               = jsonencode(["NATO-COSMIC", "FVEY", "CAN-US"])
    dutyOrg              = "DIVE_ADMIN"
    orgUnit              = "SYSTEM_ADMINISTRATION"
    # NOTE: acr and amr are now dynamically set by Keycloak based on actual authentication
    # Not hardcoded in user attributes (AAL2 fix)
  }

  # NOTE: required_actions removed - let Keycloak manage MFA setup dynamically
  # Initial setup will be triggered by MFA enforcement policy, not hardcoded action
  # This prevents Terraform from resetting MFA after user completes enrollment

  initial_password {
    value     = "DiveAdmin2025!"
    temporary = false
  }

  # Lifecycle: Ignore runtime changes
  # This allows backend to set/modify attributes and Keycloak to manage required actions
  lifecycle {
    ignore_changes = [attributes, required_actions]
  }
}

# Get the offline_access role (default realm role)
data "keycloak_role" "offline_access" {
  realm_id = keycloak_realm.dive_v3_broker.id
  name     = "offline_access"
}

# Assign super_admin and offline_access roles to broker admin user
resource "keycloak_user_roles" "broker_super_admin_roles" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3_broker.id
  user_id  = keycloak_user.broker_super_admin[0].id

  role_ids = [
    keycloak_role.broker_user.id,
    keycloak_role.broker_super_admin.id,
    data.keycloak_role.offline_access.id
  ]
}

