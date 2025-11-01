terraform {
  required_providers {
    keycloak = {
      source  = "keycloak/keycloak"
      version = "~> 5.0"  # Official Keycloak provider - Use latest 5.x
    }
  }
  required_version = ">= 1.13.4"
}

provider "keycloak" {
  client_id     = "admin-cli"
  username      = var.keycloak_admin_username
  password      = var.keycloak_admin_password
  url           = var.keycloak_url
  realm         = "master"
  initial_login = true
  
  # Development: Skip TLS verification for self-signed certificates
  tls_insecure_skip_verify = true
}

# ============================================
# DIVE V3 Realm Configuration
# ============================================

resource "keycloak_realm" "dive_v3" {
  realm   = var.realm_name
  enabled = true

  display_name               = "DIVE V3 Coalition Pilot"
  display_name_html          = "<b>DIVE V3</b> - USA/NATO ICAM Pilot"
  
  registration_allowed           = false  # Federated IdPs only
  registration_email_as_username = false
  remember_me                    = true
  reset_password_allowed         = true
  edit_username_allowed          = false
  login_with_email_allowed       = true

  login_theme = "keycloak"

  internationalization {
    supported_locales = ["en", "fr"]
    default_locale    = "en"
  }

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
  }

  # ACP-240 aligned password policy
  password_policy = "upperCase(1) and lowerCase(1) and digits(1) and specialChars(1) and length(12)"
  
  # Token lifetimes (AAL2 compliant - NIST SP 800-63B)
  access_token_lifespan = "15m"   # 15 minutes
  sso_session_idle_timeout = "15m" # 15 minutes (AAL2 requirement - was 8h)
  sso_session_max_lifespan = "8h" # 8 hours (reduced from 12h for AAL2 alignment)
}

# ============================================
# Next.js OIDC Client
# ============================================

resource "keycloak_openid_client" "dive_v3_app" {
  realm_id                     = keycloak_realm.dive_v3.id
  client_id                    = var.client_id
  name                         = "DIVE V3 Next.js Application"
  enabled                      = true
  access_type                  = "CONFIDENTIAL"
  standard_flow_enabled        = true
  implicit_flow_enabled        = false
  direct_access_grants_enabled = false  # Federated only
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

  admin_url = var.app_url

  # Logout configuration - Proper frontchannel logout for Single Logout (SLO)
  frontchannel_logout_enabled = true
  frontchannel_logout_url     = "${var.app_url}/api/auth/logout-callback"
  
  # CRITICAL: Keycloak expects "+" separated list, not array
  # Must be exact match for post_logout_redirect_uri parameter
  valid_post_logout_redirect_uris = ["${var.app_url}"]
  
  extra_config = {
    "frontchannel.logout.session.required" = "false"
  }
}

# ============================================
# Client Scopes with DIVE Attributes
# ============================================

resource "keycloak_openid_client_scope" "dive_attributes" {
  realm_id               = keycloak_realm.dive_v3.id
  name                   = "dive-attributes"
  description            = "DIVE V3 custom attributes (uniqueID, clearance, countryOfAffiliation, acpCOI)"
  consent_screen_text    = "DIVE Coalition Attributes"
  include_in_token_scope = true
}

# Default scopes
resource "keycloak_openid_client_default_scopes" "dive_v3_default_scopes" {
  realm_id  = keycloak_realm.dive_v3.id
  client_id = keycloak_openid_client.dive_v3_app.id

  default_scopes = [
    "openid",
    "profile",
    "email",
    "roles",
    "web-origins",
    keycloak_openid_client_scope.dive_attributes.name
  ]
}

# Optional scopes
resource "keycloak_openid_client_optional_scopes" "dive_v3_optional_scopes" {
  realm_id  = keycloak_realm.dive_v3.id
  client_id = keycloak_openid_client.dive_v3_app.id

  optional_scopes = [
    "address",
    "phone",
    "offline_access"
  ]
}

# ============================================
# Protocol Mappers for DIVE Attributes
# ============================================

# uniqueID mapper
resource "keycloak_generic_protocol_mapper" "unique_id_mapper" {
  realm_id   = keycloak_realm.dive_v3.id
  client_id  = keycloak_openid_client.dive_v3_app.id
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

# clearance mapper
resource "keycloak_generic_protocol_mapper" "clearance_mapper" {
  realm_id   = keycloak_realm.dive_v3.id
  client_id  = keycloak_openid_client.dive_v3_app.id
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

# countryOfAffiliation mapper
resource "keycloak_generic_protocol_mapper" "country_mapper" {
  realm_id   = keycloak_realm.dive_v3.id
  client_id  = keycloak_openid_client.dive_v3_app.id
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

# acpCOI mapper (multi-valued attribute)
resource "keycloak_generic_protocol_mapper" "coi_mapper" {
  realm_id   = keycloak_realm.dive_v3.id
  client_id  = keycloak_openid_client.dive_v3_app.id
  name       = "acpCOI"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "acpCOI"
    "claim.name"           = "acpCOI"
    "jsonType.label"       = "String"
    "multivalued"          = "false"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

# Roles mapper (for super_admin role)
resource "keycloak_generic_protocol_mapper" "roles_mapper" {
  realm_id   = keycloak_realm.dive_v3.id
  client_id  = keycloak_openid_client.dive_v3_app.id
  name       = "realm-roles"
  protocol   = "openid-connect"
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
# AAL2/FAL2 Mappers (NIST SP 800-63B/C)
# ============================================
# Reference: docs/IDENTITY-ASSURANCE-LEVELS.md Lines 457-468

# ACR mapper - map from user attribute to token claim
resource "keycloak_generic_protocol_mapper" "acr_mapper" {
  realm_id   = keycloak_realm.dive_v3.id
  client_id  = keycloak_openid_client.dive_v3_app.id
  name       = "acr-attribute-mapper"
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

# AMR mapper - map from user attribute to token claim
resource "keycloak_generic_protocol_mapper" "amr_mapper" {
  realm_id   = keycloak_realm.dive_v3.id
  client_id  = keycloak_openid_client.dive_v3_app.id
  name       = "amr-attribute-mapper"
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

# Auth time - use session note (Keycloak automatically tracks this)
resource "keycloak_generic_protocol_mapper" "auth_time_mapper" {
  realm_id   = keycloak_realm.dive_v3.id
  client_id  = keycloak_openid_client.dive_v3_app.id
  name       = "auth-time-mapper"
  protocol   = "openid-connect"
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

# ============================================
# ACR/AMR Enrichment (Gap #6 Remediation - Oct 20, 2025)
# ============================================
# Reference: docs/ATTRIBUTE-SCHEMA-SPECIFICATION.md
# NIST SP 800-63B/C: Authentication Context and Methods Reference
# 
# PILOT APPROACH: Use existing user attributes (already set in test users)
# The existing acr_mapper and amr_mapper (lines 249-282) already pass through
# user attributes to JWT claims. Test users have acr and amr attributes populated.
# 
# PRODUCTION APPROACH: Keycloak Custom Authenticator SPI (Java-based)
# - Detect actual MFA type during authentication flow
# - Set ACR based on authentication method (password, OTP, PIV/CAC)
# - Set AMR array with actual factors used
# - Store in user session for protocol mappers to include in tokens
# 
# DESIGN DOCUMENTED IN: docs/KEYCLOAK-MULTI-REALM-GUIDE.md
# Estimated effort for production SPI: 8-10 hours (Java development + testing)
# 
# For pilot, the existing mappers (acr_mapper and amr_mapper) are sufficient
# because test users have these attributes pre-populated. Real IdPs would
# need to provide these claims, or the SPI would generate them.
# 
# NOTE: Script-based protocol mappers not available in Keycloak 23.0 without
# additional configuration. For robustness, using attribute-based mappers.

# ============================================
# Organization Attributes (Gap #4 Remediation - Oct 20, 2025)
# ============================================
# Reference: docs/ATTRIBUTE-SCHEMA-SPECIFICATION.md
# ACP-240 Section 2.1: Organization/Unit & Role attributes

# dutyOrg mapper - user's duty organization
resource "keycloak_generic_protocol_mapper" "dutyorg_mapper" {
  realm_id   = keycloak_realm.dive_v3.id
  client_id  = keycloak_openid_client.dive_v3_app.id
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

# orgUnit mapper - user's organizational unit
resource "keycloak_generic_protocol_mapper" "orgunit_mapper" {
  realm_id   = keycloak_realm.dive_v3.id
  client_id  = keycloak_openid_client.dive_v3_app.id
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

# ============================================
# Realm Roles
# ============================================

resource "keycloak_role" "user_role" {
  realm_id    = keycloak_realm.dive_v3.id
  name        = "user"
  description = "Standard user role for coalition personnel"
}

resource "keycloak_role" "admin_role" {
  realm_id    = keycloak_realm.dive_v3.id
  name        = "admin"
  description = "Administrator role for system management"
}

resource "keycloak_role" "super_admin_role" {
  realm_id    = keycloak_realm.dive_v3.id
  name        = "super_admin"
  description = "Super Administrator role with full system access including IdP management"
}

# ============================================
# Test Users (Week 1: U.S. IdP Simulation)
# ============================================

# U.S. Test User - SECRET clearance
resource "keycloak_user" "test_user_us_secret" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3.id
  username = "testuser-us"
  enabled  = true

  email      = "john.doe@army.mil"
  first_name = "John"
  last_name  = "Doe"
  
  attributes = {
    uniqueID               = "john.doe@mil"
    clearance              = "SECRET"
    countryOfAffiliation   = "USA"
    acpCOI                 = "[\"NATO-COSMIC\",\"FVEY\"]"
    # Gap #4: Organization attributes
    dutyOrg                = "US_ARMY"
    orgUnit                = "CYBER_DEFENSE"
    # AAL2/FAL2 attributes (simulated for testing)
    acr                    = "urn:mace:incommon:iap:silver"
    amr                    = "[\"pwd\",\"otp\"]"
  }

  initial_password {
    value     = "Password123!"
    temporary = false
  }
  
  lifecycle {
    ignore_changes = [attributes]
  }
}

# U.S. Test User - CONFIDENTIAL clearance
resource "keycloak_user" "test_user_us_confid" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3.id
  username = "testuser-us-confid"
  enabled  = true

  email      = "jane.smith@navy.mil"
  first_name = "Jane"
  last_name  = "Smith"
  
  attributes = {
    uniqueID               = "jane.smith@mil"
    clearance              = "CONFIDENTIAL"
    countryOfAffiliation   = "USA"
    acpCOI                 = "[\"FVEY\"]"
    # Gap #4: Organization attributes
    dutyOrg                = "US_NAVY"
    orgUnit                = "INTELLIGENCE"
    # AAL2/FAL2 attributes
    acr                    = "urn:mace:incommon:iap:silver"
    amr                    = "[\"pwd\",\"otp\"]"
  }

  initial_password {
    value     = "Password123!"
    temporary = false
  }
  
  lifecycle {
    ignore_changes = [attributes]
  }
}

# U.S. Test User - UNCLASSIFIED
resource "keycloak_user" "test_user_us_unclass" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3.id
  username = "testuser-us-unclass"
  enabled  = true

  email      = "bob.jones@contractor.mil"
  first_name = "Bob"
  last_name  = "Jones"
  
  attributes = {
    uniqueID               = "bob.jones@mil"
    clearance              = "UNCLASSIFIED"
    countryOfAffiliation   = "USA"
    acpCOI                 = "[]"
    # Gap #4: Organization attributes
    dutyOrg                = "CONTRACTOR"
    orgUnit                = "LOGISTICS"
    # AAL2/FAL2 attributes (AAL1 for contractor - password only)
    acr                    = "urn:mace:incommon:iap:bronze"
    amr                    = "[\"pwd\"]"
  }

  initial_password {
    value     = "Password123!"
    temporary = false
  }
  
  lifecycle {
    ignore_changes = [attributes]
  }
}

# Assign user role to test users
resource "keycloak_user_roles" "test_user_us_secret_roles" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3.id
  user_id  = keycloak_user.test_user_us_secret[0].id

  role_ids = [
    keycloak_role.user_role.id,
    keycloak_role.super_admin_role.id  # Assign super_admin for testing
  ]
}

# ============================================
# Week 3: Multi-IdP Federation Configuration
# ============================================
# For pilot purposes, we create mock IdP realms within Keycloak itself
# to simulate France SAML, Canada OIDC, and Industry OIDC providers.
# In production, these would be replaced with actual external IdPs.

# --------------------------------------------
# France SAML IdP (Mock Realm)
# --------------------------------------------

# Create mock France realm to simulate FranceConnect SAML IdP
resource "keycloak_realm" "france_mock" {
  realm   = "france-mock-idp"
  enabled = true
  
  display_name = "France Mock IdP (SAML)"
  
  # Enable SAML for this realm
  registration_allowed = false
  login_theme = "keycloak"
}

# France test user in mock realm
resource "keycloak_user" "france_user" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.france_mock.id
  username = "testuser-fra"
  enabled  = true
  
  email      = "pierre.dubois@defense.gouv.fr"
  first_name = "Pierre"
  last_name  = "Dubois"
  
  # French attributes using standard OIDC claim names (simplified for pilot)
  attributes = {
    uniqueID               = "pierre.dubois@defense.gouv.fr"
    clearance              = "SECRET"  # Standard DIVE clearance level
    countryOfAffiliation   = "FRA"
    acpCOI                 = "[\"NATO-COSMIC\"]"
    # Gap #4: Organization attributes
    dutyOrg                = "FR_DEFENSE_MINISTRY"
    orgUnit                = "RENSEIGNEMENT"  # Intelligence
    # AAL2/FAL2 attributes
    acr                    = "urn:mace:incommon:iap:silver"
    amr                    = "[\"pwd\",\"otp\"]"
  }
  
  initial_password {
    value     = "Password123!"
    temporary = false
  }
}

# France SAML client in mock realm - PROPERLY CONFIGURED
resource "keycloak_saml_client" "france_saml_client" {
  realm_id  = keycloak_realm.france_mock.id
  client_id = "dive-v3-saml-client"
  name      = "DIVE V3 SAML Client"
  enabled   = true
  
  # Critical: Disable ALL signature requirements for mock IdP
  sign_documents              = false
  sign_assertions             = false
  client_signature_required   = false
  
  include_authn_statement   = true
  force_post_binding        = false  # Allow redirect binding
  front_channel_logout      = true
  
  # Redirect URIs - must match broker callback
  valid_redirect_uris = [
    "http://localhost:8081/realms/dive-v3-pilot/broker/france-idp/endpoint",
    "http://keycloak:8080/realms/dive-v3-pilot/broker/france-idp/endpoint"
  ]
  
  base_url = "http://localhost:3000"
  
  # Master SAML Processing URL (critical for broker)
  master_saml_processing_url = "http://localhost:8081/realms/dive-v3-pilot/broker/france-idp/endpoint"
}

# SAML user PROPERTY mappers for France client (email, firstName, lastName from user profile)
resource "keycloak_saml_user_property_protocol_mapper" "france_email_property" {
  realm_id  = keycloak_realm.france_mock.id
  client_id = keycloak_saml_client.france_saml_client.id
  name      = "email-property-mapper"
  
  user_property              = "email"
  friendly_name              = "email"
  saml_attribute_name        = "email"
  saml_attribute_name_format = "Basic"
}

resource "keycloak_saml_user_property_protocol_mapper" "france_firstname_property" {
  realm_id  = keycloak_realm.france_mock.id
  client_id = keycloak_saml_client.france_saml_client.id
  name      = "firstName-property-mapper"
  
  user_property              = "firstName"
  friendly_name              = "firstName"
  saml_attribute_name        = "firstName"
  saml_attribute_name_format = "Basic"
}

resource "keycloak_saml_user_property_protocol_mapper" "france_lastname_property" {
  realm_id  = keycloak_realm.france_mock.id
  client_id = keycloak_saml_client.france_saml_client.id
  name      = "lastName-property-mapper"
  
  user_property              = "lastName"
  friendly_name              = "lastName"
  saml_attribute_name        = "lastName"
  saml_attribute_name_format = "Basic"
}

# SAML user ATTRIBUTE mappers for France client (custom attributes)
resource "keycloak_saml_user_attribute_protocol_mapper" "france_unique_id" {
  realm_id  = keycloak_realm.france_mock.id
  client_id = keycloak_saml_client.france_saml_client.id
  name      = "uniqueID-mapper"
  
  user_attribute              = "uniqueID"
  friendly_name              = "uniqueID"
  saml_attribute_name        = "uniqueID"
  saml_attribute_name_format = "Basic"
}

resource "keycloak_saml_user_attribute_protocol_mapper" "france_clearance" {
  realm_id  = keycloak_realm.france_mock.id
  client_id = keycloak_saml_client.france_saml_client.id
  name      = "clearance-mapper"
  
  user_attribute              = "clearance"
  friendly_name              = "clearance"
  saml_attribute_name        = "clearance"
  saml_attribute_name_format = "Basic"
}

resource "keycloak_saml_user_attribute_protocol_mapper" "france_country" {
  realm_id  = keycloak_realm.france_mock.id
  client_id = keycloak_saml_client.france_saml_client.id
  name      = "country-mapper"
  
  user_attribute              = "countryOfAffiliation"
  friendly_name              = "country"
  saml_attribute_name        = "countryOfAffiliation"
  saml_attribute_name_format = "Basic"
}

resource "keycloak_saml_user_attribute_protocol_mapper" "france_coi" {
  realm_id  = keycloak_realm.france_mock.id
  client_id = keycloak_saml_client.france_saml_client.id
  name      = "coi-mapper"
  
  user_attribute              = "acpCOI"
  friendly_name              = "coi"
  saml_attribute_name        = "acpCOI"
  saml_attribute_name_format = "Basic"
}

# France SAML IdP broker in DIVE realm - PROPERLY CONFIGURED
resource "keycloak_saml_identity_provider" "france_idp" {
  realm        = keycloak_realm.dive_v3.id
  alias        = "france-idp"
  display_name = "France (SAML) [DEPRECATED - Use fra-realm-broker]"
  enabled      = false  # Disabled in favor of fra-realm-broker
  
  # SAML configuration
  entity_id                    = "dive-v3-saml-client"
  single_sign_on_service_url   = "http://localhost:8081/realms/france-mock-idp/protocol/saml"
  
  # Binding configuration
  backchannel_supported        = false
  post_binding_response        = false  # Use redirect binding
  post_binding_authn_request   = false  # Use redirect binding
  force_authn                  = false
  
  # Critical: Disable ALL signature validation for mock
  validate_signature           = false
  want_assertions_signed       = false
  want_assertions_encrypted    = false
  
  # Trust and sync settings for proper federation
  store_token              = true
  trust_email              = true
  sync_mode               = "FORCE"  # Always sync attributes from IdP
  
  # First broker login - use default flow
  first_broker_login_flow_alias = "first broker login"
  
  # Account linking strategy
  link_only = false  # Create new user if doesn't exist
  
  # Additional federation settings
  authenticate_by_default = false
  gui_order             = "1"
}

# SAML username mapper - critical for auto-user creation
resource "keycloak_custom_identity_provider_mapper" "france_username_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_saml_identity_provider.france_idp.alias
  name                     = "france-username-mapper"
  identity_provider_mapper = "saml-username-idp-mapper"
  
  extra_config = {
    "syncMode" = "INHERIT"
    "template" = "$${ATTRIBUTE.uniqueID}"
  }
}

# SAML → OIDC attribute mappers for France IdP broker
resource "keycloak_custom_identity_provider_mapper" "france_unique_id_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_saml_identity_provider.france_idp.alias
  name                     = "france-uniqueID-mapper"
  identity_provider_mapper = "saml-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"  # Always sync from IdP
    "attribute.name" = "uniqueID"
    "user.attribute" = "uniqueID"
  }
}

# Email mapper - maps SAML attribute to user property (not custom attribute)
resource "keycloak_custom_identity_provider_mapper" "france_email_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_saml_identity_provider.france_idp.alias
  name                     = "france-email-mapper"
  identity_provider_mapper = "saml-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "attribute.name" = "email"
    "user.attribute" = "email"
  }
}

# First name mapper - maps to user property
resource "keycloak_custom_identity_provider_mapper" "france_firstname_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_saml_identity_provider.france_idp.alias
  name                     = "france-firstname-mapper"
  identity_provider_mapper = "saml-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "attribute.name" = "firstName"
    "user.attribute" = "firstName"
  }
}

# Last name mapper - maps to user property
resource "keycloak_custom_identity_provider_mapper" "france_lastname_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_saml_identity_provider.france_idp.alias
  name                     = "france-lastname-mapper"
  identity_provider_mapper = "saml-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "attribute.name" = "lastName"
    "user.attribute" = "lastName"
  }
}

resource "keycloak_custom_identity_provider_mapper" "france_clearance_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_saml_identity_provider.france_idp.alias
  name                     = "france-clearance-mapper"
  identity_provider_mapper = "saml-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "INHERIT"
    "attribute.name" = "clearance"
    "user.attribute" = "clearance"
  }
}

resource "keycloak_custom_identity_provider_mapper" "france_country_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_saml_identity_provider.france_idp.alias
  name                     = "france-country-mapper"
  identity_provider_mapper = "saml-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "INHERIT"
    "attribute.name" = "countryOfAffiliation"
    "user.attribute" = "countryOfAffiliation"
  }
}

resource "keycloak_custom_identity_provider_mapper" "france_coi_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_saml_identity_provider.france_idp.alias
  name                     = "france-coi-mapper"
  identity_provider_mapper = "saml-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "INHERIT"
    "attribute.name" = "acpCOI"
    "user.attribute" = "acpCOI"
  }
}

# Gap #4 Remediation: Organization attributes for France IdP
resource "keycloak_custom_identity_provider_mapper" "france_dutyorg_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_saml_identity_provider.france_idp.alias
  name                     = "france-dutyOrg-mapper"
  identity_provider_mapper = "saml-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "INHERIT"
    "attribute.name" = "dutyOrg"
    "user.attribute" = "dutyOrg"
  }
}

resource "keycloak_custom_identity_provider_mapper" "france_orgunit_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_saml_identity_provider.france_idp.alias
  name                     = "france-orgUnit-mapper"
  identity_provider_mapper = "saml-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "INHERIT"
    "attribute.name" = "orgUnit"
    "user.attribute" = "orgUnit"
  }
}

# --------------------------------------------
# Canada OIDC IdP (Mock Realm)
# --------------------------------------------

# Create mock Canada realm to simulate GCKey/GCCF OIDC IdP
resource "keycloak_realm" "canada_mock" {
  realm   = "canada-mock-idp"
  enabled = true
  
  display_name = "Canada Mock IdP (OIDC)"
  
  registration_allowed = false
  login_theme = "keycloak"
}

# Canada test user in mock realm
resource "keycloak_user" "canada_user" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.canada_mock.id
  username = "testuser-can"
  enabled  = true
  
  email      = "john.macdonald@forces.gc.ca"
  first_name = "John"
  last_name  = "MacDonald"
  
  attributes = {
    uniqueID               = "john.macdonald@forces.gc.ca"
    clearance              = "CONFIDENTIAL"
    countryOfAffiliation   = "CAN"
    acpCOI                 = "[\"CAN-US\"]"
    # Gap #4: Organization attributes
    dutyOrg                = "CAN_FORCES"
    orgUnit                = "CYBER_OPS"
    # AAL2/FAL2 attributes
    acr                    = "urn:mace:incommon:iap:silver"
    amr                    = "[\"pwd\",\"otp\"]"
  }
  
  initial_password {
    value     = "Password123!"
    temporary = false
  }
}

# OIDC client in Canada realm
resource "keycloak_openid_client" "canada_oidc_client" {
  realm_id  = keycloak_realm.canada_mock.id
  client_id = "dive-v3-canada-client"
  name      = "DIVE V3 Canada OIDC Client"
  enabled   = true
  
  access_type                  = "CONFIDENTIAL"
  standard_flow_enabled        = true
  direct_access_grants_enabled = false
  
  valid_redirect_uris = [
    "http://localhost:8081/realms/dive-v3-pilot/broker/canada-idp/endpoint"
  ]
  
  root_url = "http://localhost:3000"
  base_url = "http://localhost:3000"
}

# Protocol mappers for Canada OIDC client - CRITICAL: Send user attributes in tokens
resource "keycloak_generic_protocol_mapper" "canada_client_uniqueid" {
  realm_id   = keycloak_realm.canada_mock.id
  client_id  = keycloak_openid_client.canada_oidc_client.id
  name       = "uniqueID-client-mapper"
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

resource "keycloak_generic_protocol_mapper" "canada_client_clearance" {
  realm_id   = keycloak_realm.canada_mock.id
  client_id  = keycloak_openid_client.canada_oidc_client.id
  name       = "clearance-client-mapper"
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

resource "keycloak_generic_protocol_mapper" "canada_client_country" {
  realm_id   = keycloak_realm.canada_mock.id
  client_id  = keycloak_openid_client.canada_oidc_client.id
  name       = "country-client-mapper"
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

resource "keycloak_generic_protocol_mapper" "canada_client_coi" {
  realm_id   = keycloak_realm.canada_mock.id
  client_id  = keycloak_openid_client.canada_oidc_client.id
  name       = "coi-client-mapper"
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

# Canada OIDC IdP broker in DIVE realm
resource "keycloak_oidc_identity_provider" "canada_idp" {
  realm        = keycloak_realm.dive_v3.id
  alias        = "canada-idp"
  display_name = "Canada (OIDC) [DEPRECATED - Use can-realm-broker]"
  enabled      = false  # Disabled in favor of can-realm-broker
  
  # Browser-facing URL (user redirected here)
  authorization_url = "http://localhost:8081/realms/canada-mock-idp/protocol/openid-connect/auth"
  
  # Server-to-server URLs (Keycloak internal calls - must use Docker network hostname)
  token_url        = "http://keycloak:8080/realms/canada-mock-idp/protocol/openid-connect/token"
  jwks_url         = "http://keycloak:8080/realms/canada-mock-idp/protocol/openid-connect/certs"
  
  client_id     = keycloak_openid_client.canada_oidc_client.client_id
  client_secret = keycloak_openid_client.canada_oidc_client.client_secret
  
  default_scopes = "openid profile email"
  
  store_token = true
  trust_email = true
}

# OIDC attribute mappers for Canada
resource "keycloak_custom_identity_provider_mapper" "canada_unique_id_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_oidc_identity_provider.canada_idp.alias
  name                     = "canada-uniqueID-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"      = "INHERIT"
    "claim"         = "uniqueID"
    "user.attribute" = "uniqueID"
  }
}

resource "keycloak_custom_identity_provider_mapper" "canada_clearance_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_oidc_identity_provider.canada_idp.alias
  name                     = "canada-clearance-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"      = "INHERIT"
    "claim"         = "clearance"
    "user.attribute" = "clearance"
  }
}

resource "keycloak_custom_identity_provider_mapper" "canada_country_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_oidc_identity_provider.canada_idp.alias
  name                     = "canada-country-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"      = "INHERIT"
    "claim"         = "countryOfAffiliation"
    "user.attribute" = "countryOfAffiliation"
  }
}

resource "keycloak_custom_identity_provider_mapper" "canada_coi_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_oidc_identity_provider.canada_idp.alias
  name                     = "canada-coi-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"      = "INHERIT"
    "claim"         = "acpCOI"
    "user.attribute" = "acpCOI"
  }
}

# Gap #4 Remediation: Organization attributes for Canada IdP
resource "keycloak_custom_identity_provider_mapper" "canada_dutyorg_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_oidc_identity_provider.canada_idp.alias
  name                     = "canada-dutyOrg-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"      = "INHERIT"
    "claim"         = "dutyOrg"
    "user.attribute" = "dutyOrg"
  }
}

resource "keycloak_custom_identity_provider_mapper" "canada_orgunit_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_oidc_identity_provider.canada_idp.alias
  name                     = "canada-orgUnit-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"      = "INHERIT"
    "claim"         = "orgUnit"
    "user.attribute" = "orgUnit"
  }
}

# --------------------------------------------
# Industry OIDC IdP (Mock Realm)
# --------------------------------------------
# Industry users may have missing clearance/country attributes
# These will be enriched by backend middleware

# Create mock Industry realm to simulate Azure AD/Okta
resource "keycloak_realm" "industry_mock" {
  realm   = "industry-mock-idp"
  enabled = true
  
  display_name = "Industry Mock IdP (OIDC)"
  
  registration_allowed = false
  login_theme = "keycloak"
}

# Industry test user - contractor with minimal attributes
resource "keycloak_user" "industry_user" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.industry_mock.id
  username = "bob.contractor"
  enabled  = true
  
  email      = "bob.contractor@lockheed.com"
  first_name = "Bob"
  last_name  = "Contractor"
  
  # Industry users have minimal attributes - will be enriched
  attributes = {
    uniqueID = "bob.contractor@lockheed.com"
    # No clearance - will default to UNCLASSIFIED via enrichment
    # No countryOfAffiliation - will be inferred from email domain via enrichment
    # No acpCOI - will default to empty array
    # Gap #4: Organization attributes (enriched from email domain)
    dutyOrg = "LOCKHEED_MARTIN"
    orgUnit = "RESEARCH_DEV"
    # AAL2/FAL2 attributes (AAL1 for contractor - password only)
    acr = "urn:mace:incommon:iap:bronze"
    amr = "[\"pwd\"]"
  }
  
  initial_password {
    value     = "Password123!"
    temporary = false
  }
}

# OIDC client in Industry realm
resource "keycloak_openid_client" "industry_oidc_client" {
  realm_id  = keycloak_realm.industry_mock.id
  client_id = "dive-v3-industry-client"
  name      = "DIVE V3 Industry OIDC Client"
  enabled   = true
  
  access_type                  = "CONFIDENTIAL"
  standard_flow_enabled        = true
  direct_access_grants_enabled = false
  
  valid_redirect_uris = [
    "http://localhost:8081/realms/dive-v3-pilot/broker/industry-idp/endpoint"
  ]
  
  root_url = "http://localhost:3000"
  base_url = "http://localhost:3000"
}

# Protocol mappers for Industry OIDC client - Send user attributes in tokens
resource "keycloak_generic_protocol_mapper" "industry_client_uniqueid" {
  realm_id   = keycloak_realm.industry_mock.id
  client_id  = keycloak_openid_client.industry_oidc_client.id
  name       = "uniqueID-client-mapper"
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

resource "keycloak_generic_protocol_mapper" "industry_client_email" {
  realm_id   = keycloak_realm.industry_mock.id
  client_id  = keycloak_openid_client.industry_oidc_client.id
  name       = "email-client-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-property-mapper"
  
  config = {
    "user.attribute"       = "email"
    "claim.name"           = "email"
    "jsonType.label"       = "String"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

# Industry users have minimal attributes - enrichment will fill the rest
# Only send uniqueID and email from the mock IdP

# Industry OIDC IdP broker in DIVE realm
resource "keycloak_oidc_identity_provider" "industry_idp" {
  realm        = keycloak_realm.dive_v3.id
  alias        = "industry-idp"
  display_name = "Industry Partner (OIDC) [DEPRECATED - Use industry-realm-broker]"
  enabled      = false  # Disabled in favor of industry-realm-broker
  
  # Browser-facing URL (user redirected here)
  authorization_url = "http://localhost:8081/realms/industry-mock-idp/protocol/openid-connect/auth"
  
  # Server-to-server URLs (Keycloak internal calls - must use Docker network hostname)
  token_url        = "http://keycloak:8080/realms/industry-mock-idp/protocol/openid-connect/token"
  jwks_url         = "http://keycloak:8080/realms/industry-mock-idp/protocol/openid-connect/certs"
  
  client_id     = keycloak_openid_client.industry_oidc_client.client_id
  client_secret = keycloak_openid_client.industry_oidc_client.client_secret
  
  default_scopes = "openid profile email"
  
  store_token = true
  trust_email = true
}

# OIDC attribute mappers for Industry (minimal - enrichment will fill gaps)
resource "keycloak_custom_identity_provider_mapper" "industry_unique_id_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_oidc_identity_provider.industry_idp.alias
  name                     = "industry-uniqueID-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"      = "INHERIT"
    "claim"         = "uniqueID"
    "user.attribute" = "uniqueID"
  }
}

# Email mapper (for enrichment logic)
resource "keycloak_custom_identity_provider_mapper" "industry_email_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_oidc_identity_provider.industry_idp.alias
  name                     = "industry-email-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"      = "INHERIT"
    "claim"         = "email"
    "user.attribute" = "email"
  }
}

# Gap #4 Remediation: Organization attributes for Industry IdP
# Note: Industry users may not provide these, will be enriched from email domain
resource "keycloak_custom_identity_provider_mapper" "industry_dutyorg_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_oidc_identity_provider.industry_idp.alias
  name                     = "industry-dutyOrg-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"      = "INHERIT"
    "claim"         = "dutyOrg"
    "user.attribute" = "dutyOrg"
  }
}

resource "keycloak_custom_identity_provider_mapper" "industry_orgunit_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = keycloak_oidc_identity_provider.industry_idp.alias
  name                     = "industry-orgUnit-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"      = "INHERIT"
    "claim"         = "orgUnit"
    "user.attribute" = "orgUnit"
  }
}

