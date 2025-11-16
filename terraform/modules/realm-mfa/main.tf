# ============================================
# MFA Browser Authentication Flow (NATIVE KEYCLOAK 26.4.2) - FIXED
# ============================================
# Multi-Level AAL Enforcement: AAL1/AAL2/AAL3 Using ONLY Native Keycloak Features
# 
# CRITICAL FIX (Nov 4, 2025):
# - Restructured flow to fix "user not set yet" error
# - Username-Password and MFA now in SAME subflow (proper user context)
# - Added AAL3 (WebAuthn) for TOP_SECRET clearance
#
# Flow Structure (CORRECTED):
# 1. Cookie (ALTERNATIVE) - SSO reuse
# 2. Forms Subflow (ALTERNATIVE) - Contains auth + MFA together
#    ├─ Username-Password (REQUIRED) - Authenticates user FIRST
#    ├─ Conditional AAL3 (CONDITIONAL) - TOP_SECRET → WebAuthn
#    └─ Conditional AAL2 (CONDITIONAL) - CONFIDENTIAL/SECRET → OTP
#
# ACR/AMR Mapping:
# - AAL1 (password only): acr="0", amr=["pwd"]
# - AAL2 (password+OTP): acr="1", amr=["pwd","otp"]
# - AAL3 (password+WebAuthn): acr="2", amr=["pwd","hwk"]

resource "keycloak_authentication_flow" "classified_browser" {
  realm_id    = var.realm_id
  alias       = "Classified Access Browser Flow - ${var.realm_display_name}"
  description = "Multi-level AAL (AAL1/AAL2/AAL3) using NATIVE Keycloak 26.4.2 features"
}

# ============================================
# Top Level: Cookie vs Forms
# ============================================
# IMPORTANT: Cookie SSO is ALTERNATIVE but WebAuthn is REQUIRED for TOP_SECRET
# This allows session management while still enforcing MFA on each authentication

# Option 1: SSO Cookie (returning users, already authenticated)
resource "keycloak_authentication_execution" "browser_cookie" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.classified_browser.alias
  authenticator     = "auth-cookie"
  requirement       = "ALTERNATIVE"
  priority          = 10 # Execute cookie check first
}

# Option 2: Forms Subflow (new authentication required)
resource "keycloak_authentication_subflow" "browser_forms_subflow" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.classified_browser.alias
  alias             = "Forms - ${var.realm_display_name}"
  requirement       = "ALTERNATIVE"
  priority          = 20 # Forms subflow executes after cookie check

  depends_on = [keycloak_authentication_execution.browser_cookie]
}

# ============================================
# Forms Subflow: Auth THEN Conditional MFA
# ============================================
# CRITICAL: User authentication happens FIRST, creating user context
# THEN conditional checks can access user attributes

# Step 1: Username + Password (REQUIRED - creates user context)
resource "keycloak_authentication_execution" "browser_forms" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_forms_subflow.alias
  authenticator     = "auth-username-password-form"
  requirement       = "REQUIRED"
  priority          = 10 # Password form FIRST
}

# Configure ACR and AMR for password authentication (AAL1 baseline)
resource "keycloak_authentication_execution_config" "browser_password_acr" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_forms.id
  alias        = "Password ACR AMR - ${var.realm_display_name}"
  config = {
    acr_level = "0"   # AAL1 for password-only
    reference = "pwd" # AMR reference (RFC-8176 compliant)
  }
}

# ============================================
# Step 2: Conditional AAL3 (TOP_SECRET → WebAuthn)
# ============================================

resource "keycloak_authentication_subflow" "browser_conditional_webauthn" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_forms_subflow.alias
  alias             = "Conditional WebAuthn AAL3 - ${var.realm_display_name}"
  requirement       = "CONDITIONAL"
  priority          = 20 # WebAuthn check AFTER password

  depends_on = [keycloak_authentication_execution.browser_forms]
}

# Condition: clearance == "TOP_SECRET"
resource "keycloak_authentication_execution" "browser_condition_top_secret" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_conditional_webauthn.alias
  authenticator     = "conditional-user-attribute"
  requirement       = "REQUIRED"
}

resource "keycloak_authentication_execution_config" "browser_condition_top_secret_config" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_condition_top_secret.id
  alias        = "TOP SECRET Check - ${var.realm_display_name}"
  config = {
    attribute_name  = var.clearance_attribute_name
    attribute_value = "^TOP_SECRET$" # Exact match
    negate          = "false"
  }
}

# WebAuthn Authenticator (hardware-backed, AAL3)
resource "keycloak_authentication_execution" "browser_webauthn_form" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_conditional_webauthn.alias
  authenticator     = "webauthn-authenticator"
  requirement       = "REQUIRED"

  depends_on = [
    keycloak_authentication_execution.browser_condition_top_secret,
    keycloak_authentication_execution_config.browser_condition_top_secret_config
  ]
}

# Configure ACR and AMR for WebAuthn (AAL3)
resource "keycloak_authentication_execution_config" "browser_webauthn_acr" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_webauthn_form.id
  alias        = "WebAuthn ACR AMR - ${var.realm_display_name}"
  config = {
    acr_level = "2"   # AAL3 for hardware key
    reference = "hwk" # AMR reference (RFC-8176: hardware key)
  }
}

# ============================================
# Step 3: Conditional AAL2 (CONFIDENTIAL/SECRET → OTP)
# ============================================

resource "keycloak_authentication_subflow" "browser_conditional_otp" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_forms_subflow.alias
  alias             = "Conditional OTP AAL2 - ${var.realm_display_name}"
  requirement       = "CONDITIONAL"
  priority          = 30 # OTP check AFTER WebAuthn

  depends_on = [keycloak_authentication_subflow.browser_conditional_webauthn]
}

# Condition: clearance in (CONFIDENTIAL, SECRET)
resource "keycloak_authentication_execution" "browser_condition_user_attribute" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_conditional_otp.alias
  authenticator     = "conditional-user-attribute"
  requirement       = "REQUIRED"
}

resource "keycloak_authentication_execution_config" "browser_condition_config" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_condition_user_attribute.id
  alias        = "CONFIDENTIAL SECRET Check - ${var.realm_display_name}"
  config = {
    attribute_name  = var.clearance_attribute_name
    attribute_value = "^(CONFIDENTIAL|SECRET)$" # Regex for both levels
    negate          = "false"
  }
}

# OTP Form (only for CONFIDENTIAL/SECRET)
resource "keycloak_authentication_execution" "browser_otp_form" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_conditional_otp.alias
  authenticator     = "auth-otp-form"
  requirement       = "REQUIRED"

  depends_on = [
    keycloak_authentication_execution.browser_condition_user_attribute,
    keycloak_authentication_execution_config.browser_condition_config
  ]
}

# Configure ACR and AMR for OTP (AAL2)
resource "keycloak_authentication_execution_config" "browser_otp_acr" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_otp_form.id
  alias        = "OTP ACR AMR - ${var.realm_display_name}"
  config = {
    acr_level = "1"   # AAL2 when OTP succeeds
    reference = "otp" # AMR reference (RFC-8176 compliant)
  }
}

# ============================================
# Authentication Flow Bindings  
# ============================================
# PERMANENT FIX (Nov 3, 2025):
# - Broker realm: Uses custom MFA flow
# - Federated realms: Use standard browser flow (federation compatible)
# - MFA enforcement happens via post-broker login flow
resource "keycloak_authentication_bindings" "classified_bindings" {
  realm_id     = var.realm_id
  browser_flow = var.use_standard_browser_flow ? "browser" : keycloak_authentication_flow.classified_browser.alias
}
