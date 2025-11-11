# ============================================
# NIST SP 800-63B Compliant Step-Up Authentication Flow
# ============================================
# SIMPLIFIED: Password + Conditional MFA (no nested subflows)
#
# Flow Structure:
# 1. Cookie (DISABLED, priority 10)
# 2. Username/Password Form (REQUIRED, priority 20)
# 3. Conditional WebAuthn for TOP_SECRET (CONDITIONAL, priority 30) ← Checked FIRST
# 4. Conditional OTP for SECRET/CONFIDENTIAL (CONDITIONAL, priority 40) ← Checked SECOND

# ============================================
# Browser Authentication Flow (Step-Up)
# ============================================

resource "keycloak_authentication_flow" "stepup_browser" {
  realm_id    = var.realm_id
  alias       = "Step-Up Browser Flow - ${var.realm_display_name}"
  description = "NIST SP 800-63B: Password first, then clearance-based conditional MFA"
}

# ============================================
# Step 0: SSO Cookie (DISABLED)
# ============================================

resource "keycloak_authentication_execution" "stepup_cookie" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.stepup_browser.alias
  authenticator     = "auth-cookie"
  requirement       = "DISABLED"
  priority          = 10
}

# ============================================
# Step 1: Username/Password (REQUIRED)
# ============================================

resource "keycloak_authentication_execution" "stepup_password_form" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.stepup_browser.alias
  authenticator     = "auth-username-password-form"
  requirement       = "REQUIRED"
  priority          = 20
  
  depends_on = [keycloak_authentication_execution.stepup_cookie]
}

# ============================================
# Step 2: Conditional WebAuthn for TOP_SECRET (AAL3)
# ============================================
# Higher priority = checked FIRST
# If condition passes, WebAuthn is REQUIRED

resource "keycloak_authentication_subflow" "stepup_aal3_webauthn" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.stepup_browser.alias
  alias             = "Conditional AAL3 - TOP_SECRET - ${var.realm_display_name}"
  requirement       = "CONDITIONAL"
  priority          = 30
  
  depends_on = [keycloak_authentication_execution.stepup_password_form]
}

resource "keycloak_authentication_execution" "stepup_aal3_condition" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.stepup_aal3_webauthn.alias
  authenticator     = "conditional-user-attribute"
  requirement       = "REQUIRED"
  priority          = 10
}

resource "keycloak_authentication_execution_config" "stepup_aal3_condition_config" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.stepup_aal3_condition.id
  alias        = "TOP_SECRET Check - ${var.realm_display_name}"
  config = {
    attribute_name  = "clearance"
    attribute_value = "^TOP_SECRET$"
    negate          = "false"
  }
}

resource "keycloak_authentication_execution" "stepup_aal3_webauthn_form" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.stepup_aal3_webauthn.alias
  authenticator     = "webauthn-authenticator"
  requirement       = "REQUIRED"
  priority          = 20
  
  depends_on = [
    keycloak_authentication_execution.stepup_aal3_condition,
    keycloak_authentication_execution_config.stepup_aal3_condition_config
  ]
}

# ============================================
# Step 3: Conditional OTP for SECRET/CONFIDENTIAL (AAL2)
# ============================================
# Lower priority = checked SECOND
# If condition passes, OTP is REQUIRED

resource "keycloak_authentication_subflow" "stepup_aal2_otp" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.stepup_browser.alias
  alias             = "Conditional AAL2 - SECRET CONFIDENTIAL - ${var.realm_display_name}"
  requirement       = "CONDITIONAL"
  priority          = 40
  
  depends_on = [keycloak_authentication_execution.stepup_password_form]
}

resource "keycloak_authentication_execution" "stepup_aal2_condition" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.stepup_aal2_otp.alias
  authenticator     = "conditional-user-attribute"
  requirement       = "REQUIRED"
  priority          = 10
}

resource "keycloak_authentication_execution_config" "stepup_aal2_condition_config" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.stepup_aal2_condition.id
  alias        = "SECRET CONFIDENTIAL Check - ${var.realm_display_name}"
  config = {
    attribute_name  = "clearance"
    attribute_value = "^(SECRET|CONFIDENTIAL)$"
    negate          = "false"
  }
}

resource "keycloak_authentication_execution" "stepup_aal2_otp_form" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.stepup_aal2_otp.alias
  authenticator     = "auth-otp-form"
  requirement       = "REQUIRED"
  priority          = 20
  
  depends_on = [
    keycloak_authentication_execution.stepup_aal2_condition,
    keycloak_authentication_execution_config.stepup_aal2_condition_config
  ]
}

# ============================================
# Bind Flow to Realm
# ============================================

resource "keycloak_authentication_bindings" "stepup_bindings" {
  realm_id     = var.realm_id
  browser_flow = keycloak_authentication_flow.stepup_browser.alias
}
